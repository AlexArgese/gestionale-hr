"""
factorial_to_s3.py
------------------
Migra i documenti da Factorial direttamente su S3 + Postgres (Neon).

LOGICA per ogni documento Factorial:
  1. nome+cognome Factorial -> cerca in tabella utenti -> ottieni utente_id
  2. Cerca in tabella documenti per factorial_id:
       - TROVATO   -> UPDATE data_upload con la data reale di Factorial
       - NON TROVATO -> carica su S3 + INSERT in documenti con data reale

STRUTTURA S3:
  uploads/documenti/{utente_id}/{categoria-slug}/nomefile.pdf

REQUISITI:
  pip install requests boto3 psycopg2-binary python-dotenv

USO:
  python factorial_to_s3.py           <- migrazione reale
  python factorial_to_s3.py --dry-run <- solo simulazione
"""

import os
import re
import sys
import time
import requests
import boto3
import psycopg2
from botocore.exceptions import ClientError
from dotenv import load_dotenv

load_dotenv()

FACTORIAL_API_KEY = os.environ["FACTORIAL_API_KEY"]
DATABASE_URL      = os.environ["DATABASE_URL"]
CARICATO_DA       = 159

AWS_BUCKET = os.environ["AWS_S3_BUCKET"]
AWS_REGION = os.environ["AWS_REGION"]

SLEEP   = 0.4
DRY_RUN = "--dry-run" in sys.argv

FACTORIAL_BASE    = "https://api.factorialhr.com/api/2026-01-01/resources"
FACTORIAL_HEADERS = {
    "accept":    "application/json",
    "x-api-key": FACTORIAL_API_KEY,
}

s3 = boto3.client(
    "s3",
    region_name=AWS_REGION,
    aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
)


def slugify(s):
    s = s.strip().lower()
    s = re.sub(r"\s+", "-", s)
    return s


def normalize_name(s):
    return " ".join(s.strip().upper().split())


def get_all_pages(url, params=None):
    results = []
    page = 1
    if params is None:
        params = {}
    while True:
        p = {**params, "page": page, "per_page": 100}
        r = requests.get(url, headers=FACTORIAL_HEADERS, params=p)
        r.raise_for_status()
        data = r.json()
        items = data if isinstance(data, list) else data.get("data", [])
        if not items:
            break
        results.extend(items)
        print(f"    -> pagina {page}: {len(items)} elementi")
        if len(items) < 100:
            break
        page += 1
        time.sleep(SLEEP)
    return results


def s3_upload(data, key, content_type="application/pdf"):
    s3.put_object(Bucket=AWS_BUCKET, Key=key, Body=data, ContentType=content_type)


def main():
    if DRY_RUN:
        print("=" * 50)
        print("  MODALITA DRY-RUN - nessuna modifica verra fatta")
        print("=" * 50)

    print("Connessione al DB...")
    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor()

    # 1. Mappa "NOME COGNOME" -> utente_id
    print("\n[1/3] Carico utenti dal DB...")
    cur.execute("SELECT id, nome, cognome FROM utenti")
    name_to_id = {}
    for uid, nome, cognome in cur.fetchall():
        key = normalize_name(f"{nome} {cognome}")
        name_to_id[key] = uid
    print(f"  Trovati {len(name_to_id)} utenti.")

    # 2. Carica factorial_id gia presenti nel DB
    print("\n[2/3] Carico documenti gia nel DB...")
    cur.execute("SELECT factorial_id FROM documenti WHERE factorial_id IS NOT NULL")
    existing_factorial_ids = {row[0] for row in cur.fetchall()}
    print(f"  Trovati {len(existing_factorial_ids)} documenti con factorial_id nel DB.")

    # 3. Scarica da Factorial
    print("\n[3/3] Scarico dati da Factorial...")

    print("  Dipendenti...")
    employees_raw = get_all_pages(f"{FACTORIAL_BASE}/employees/employees")
    factorial_id_to_name = {}
    for emp in employees_raw:
        full = f"{emp.get('first_name','')} {emp.get('last_name','')}".strip()
        factorial_id_to_name[emp["id"]] = normalize_name(full)

    print("  Cartelle documenti...")
    try:
        folders_raw = get_all_pages(f"{FACTORIAL_BASE}/documents/folders")
        id_to_folder = {f["id"]: f.get("name", "Altro") for f in folders_raw}
    except Exception as e:
        print(f"  [WARN] Cartelle non disponibili: {e}")
        id_to_folder = {}

    print("  Documenti...")
    docs = get_all_pages(f"{FACTORIAL_BASE}/documents/documents")
    print(f"  Trovati {len(docs)} documenti totali su Factorial.")

    # Migrazione
    print("\n" + "-" * 50)
    print("Migrazione in corso...\n")

    aggiornati    = 0
    inseriti      = 0
    saltati       = 0
    errori        = []
    nomi_mancanti = set()

    for i, doc in enumerate(docs, 1):
        doc_id       = doc.get("id")
        filename     = doc.get("filename") or f"documento_{doc_id}.pdf"
        employee_id  = doc.get("employee_id")
        folder_id    = doc.get("folder_id")
        created_at   = doc.get("created_at") or doc.get("updated_at")
        download_url = doc.get("file") or doc.get("download_url") or ""

        if doc.get("is_company_document") or not employee_id:
            continue

        emp_name_key = factorial_id_to_name.get(employee_id, "")
        utente_id    = name_to_id.get(emp_name_key)
        if not utente_id:
            if emp_name_key not in nomi_mancanti:
                print(f"  [{i}] WARN dipendente non trovato: '{emp_name_key}'")
                nomi_mancanti.add(emp_name_key)
            saltati += 1
            continue

        folder_name = id_to_folder.get(folder_id, "Altro") if folder_id else "Altro"
        tipo_doc    = folder_name.strip().upper()
        categoria   = slugify(folder_name)
        s3_key      = f"uploads/documenti/{utente_id}/{categoria}/{filename}"

        if doc_id in existing_factorial_ids:
            # Aggiorna solo la data
            if DRY_RUN:
                print(f"  [{i}] AGGIORNA data: {emp_name_key} / {filename} -> {created_at}")
            else:
                try:
                    cur.execute(
                        "UPDATE documenti SET data_upload = %s WHERE factorial_id = %s",
                        (created_at, doc_id)
                    )
                    conn.commit()
                except Exception as e:
                    print(f"  [{i}] ERRORE UPDATE {filename}: {e}")
                    errori.append({"file": filename, "error": str(e)})
            aggiornati += 1
        else:
            # Nuovo documento
            if DRY_RUN:
                url_ok = "OK" if download_url else "NESSUN URL"
                print(f"  [{i}] NUOVO: {emp_name_key} / {tipo_doc} / {filename}")
                print(f"        S3   : {s3_key}")
                print(f"        data : {created_at}")
                print(f"        url  : {url_ok}")
            else:
                if not download_url:
                    print(f"  [{i}] WARN nessun URL per: {filename}")
                    saltati += 1
                    continue
                try:
                    r = requests.get(download_url, headers=FACTORIAL_HEADERS, timeout=60)
                    r.raise_for_status()
                    content_type = r.headers.get("Content-Type", "application/pdf")
                    s3_upload(r.content, s3_key, content_type)
                    cur.execute(
                        """
                        INSERT INTO documenti
                            (utente_id, tipo_documento, nome_file, url_file,
                             caricato_da, data_upload, factorial_id)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        """,
                        (utente_id, tipo_doc, filename, s3_key,
                         CARICATO_DA, created_at, doc_id)
                    )
                    conn.commit()
                    print(f"  [{i}] INSERITO: {emp_name_key} / {tipo_doc} / {filename}")
                    inseriti += 1
                    time.sleep(SLEEP)
                except Exception as e:
                    conn.rollback()
                    print(f"  [{i}] ERRORE {filename}: {e}")
                    errori.append({"file": filename, "error": str(e)})

    cur.close()
    conn.close()

    print("\n" + "=" * 50)
    print(f"  {'DRY-RUN' if DRY_RUN else 'MIGRAZIONE COMPLETATA'}")
    print("=" * 50)
    print(f"  Nuovi documenti {'da inserire' if DRY_RUN else 'inseriti'}  : {inseriti}")
    print(f"  Date {'da aggiornare' if DRY_RUN else 'aggiornate'}          : {aggiornati}")
    print(f"  Saltati                        : {saltati}")
    if not DRY_RUN:
        print(f"  Errori                         : {len(errori)}")
    if nomi_mancanti:
        print(f"\n  WARN dipendenti non trovati ({len(nomi_mancanti)}):")
        for n in sorted(nomi_mancanti):
            print(f"     - {n}")
    if DRY_RUN:
        print("\n  Se tutto e corretto, lancia:")
        print("     python factorial_to_s3.py")


if __name__ == "__main__":
    main()