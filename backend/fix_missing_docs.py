"""
fix_missing_docs.py
-------------------
Trova tutti i documenti Factorial il cui factorial_id NON e' nel DB
e li inserisce (S3 + DB).

LOGICA:
  1. Prende tutti i factorial_id dal DB
  2. Prende tutti i documenti da Factorial
  3. Quelli mancanti -> scarica da Factorial (cookie sessione) -> S3 -> DB

USO:
  python fix_missing_docs.py --dry-run   <- solo analisi
  python fix_missing_docs.py             <- esecuzione reale

.env necessario:
  DATABASE_URL=...
  AWS_S3_BUCKET=...
  AWS_REGION=...
  AWS_ACCESS_KEY_ID=...
  AWS_SECRET_ACCESS_KEY=...
  FACTORIAL_API_KEY=...
  FACTORIAL_SESSION_COOKIE=_factorial_session_v2=...
"""

import os, re, sys, time, json, unicodedata
import requests, boto3, psycopg2
from datetime import datetime, timezone
from botocore.exceptions import ClientError
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL   = os.environ["DATABASE_URL"]
AWS_BUCKET     = os.environ["AWS_S3_BUCKET"]
AWS_REGION     = os.environ["AWS_REGION"]
FACTORIAL_KEY  = os.environ["FACTORIAL_API_KEY"]
SESSION_COOKIE = os.environ["FACTORIAL_SESSION_COOKIE"]
CARICATO_DA    = 159
SLEEP          = 0.4
DRY_RUN        = "--dry-run" in sys.argv

FACTORIAL_BASE    = "https://api.factorialhr.com/api/2026-01-01/resources"
FACTORIAL_HEADERS = {"accept": "application/json", "x-api-key": FACTORIAL_KEY}

REPORT_OUT = "fix_missing_docs_report.json"

s3 = boto3.client(
    "s3", region_name=AWS_REGION,
    aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
)

# ── utils ──────────────────────────────────────────────────────────────
def strip_accents(s):
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c))

def slugify(s):
    s = strip_accents(s.strip().lower())
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[-\s]+", "-", s).strip("-")
    return s or "altro"

def normalize_tipo(folder_name, filename=""):
    TIPO_RULES = [
        (r"\b(buste?\s*paga|busta\s*paga|cedolin[oi]|payroll|payslip)\b", "BUSTE PAGA"),
        (r"\b(certificazion[ei]\s*unic[ae]|modello\s*certificazion[ei]\s*unic[ae]|\bcu\b)\b", "CERTIFICAZIONE UNICA"),
        (r"\b(contratt[oi]|lettera\s+di\s+assunzione|assunzion[ei])\b", "CONTRATTO"),
        (r"\b(carta\s*d[' ]?identita|documento\s*d[' ]?identita|identity\s*card)\b", "DOCUMENTO IDENTITA"),
        (r"\b(tessera\s*sanitaria)\b", "TESSERA SANITARIA"),
        (r"\b(codice\s*fiscale)\b", "CODICE FISCALE"),
        (r"\b(iban|coordinate\s*bancarie|dati\s*bancari)\b", "IBAN"),
        (r"\b(certificat[oi]\s*medic[oi]|malatti[ae])\b", "CERTIFICATO MEDICO"),
        (r"\b(privacy|gdpr|trattamento\s*dati)\b", "PRIVACY"),
        (r"\b(sicurezza|formazione|attestat[oi]|cors[oi]|haccp)\b", "FORMAZIONE"),
        (r"\b(dimissioni|cessazione|licenziamento)\b", "CESSAZIONE RAPPORTO"),
    ]
    raw = strip_accents(f"{folder_name} {filename}").lower()
    for pattern, target in TIPO_RULES:
        if re.search(pattern, raw, re.IGNORECASE):
            return target
    return strip_accents(folder_name.strip()).upper() or "ALTRO"

def get_all_pages(url, params=None):
    results, page = [], 1
    params = params or {}
    while True:
        p = {**params, "page": page, "per_page": 100}
        r = requests.get(url, headers=FACTORIAL_HEADERS, params=p, timeout=60)
        r.raise_for_status()
        data = r.json()
        items = data if isinstance(data, list) else data.get("data", [])
        if not items: break
        results.extend(items)
        print(f"    -> pagina {page}: {len(items)} elementi")
        if len(items) < 100: break
        page += 1
        time.sleep(SLEEP)
    return results

def get_download_url(doc_id):
    r = requests.get(
        f"https://api.factorialhr.com/documents/{doc_id}",
        headers={"Cookie": SESSION_COOKIE},
        params={"download": "true"},
        allow_redirects=False, timeout=30,
    )
    if r.status_code in (301, 302, 303, 307, 308):
        return r.headers.get("Location")
    return None

def s3_upload(data, key, content_type="application/pdf"):
    s3.put_object(Bucket=AWS_BUCKET, Key=key, Body=data, ContentType=content_type)

# ── main ───────────────────────────────────────────────────────────────
def main():
    if DRY_RUN:
        print("=" * 60)
        print("  DRY-RUN — nessuna modifica verra fatta")
        print("=" * 60)

    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor()

    # 1. Carica tutti i factorial_id gia nel DB
    print("\n[1/5] Carico factorial_id dal DB...")
    cur.execute("SELECT factorial_id FROM documenti WHERE factorial_id IS NOT NULL")
    existing_ids = {row[0] for row in cur.fetchall()}
    print(f"  factorial_id nel DB: {len(existing_ids)}")

    # 2. Carica mappa utenti (email -> id)
    print("\n[2/5] Carico utenti dal DB...")
    cur.execute("SELECT id, email FROM utenti WHERE email IS NOT NULL AND email != ''")
    email_to_id = {}
    for uid, email in cur.fetchall():
        email_to_id[email.strip().lower()] = uid
    print(f"  Utenti con email: {len(email_to_id)}")

    # 3. Carica dipendenti e cartelle da Factorial
    print("\n[3/5] Scarico dati Factorial...")
    print("  Dipendenti...")
    employees = get_all_pages(f"{FACTORIAL_BASE}/employees/employees")
    emp_id_to_utente = {}
    for emp in employees:
        email = (emp.get("email") or emp.get("login_email") or "").strip().lower()
        uid = email_to_id.get(email)
        if uid:
            emp_id_to_utente[emp["id"]] = uid

    print("  Cartelle...")
    folders = get_all_pages(f"{FACTORIAL_BASE}/documents/folders")
    folder_map = {f["id"]: f.get("name", "Altro") for f in folders}

    print("  Documenti...")
    docs = get_all_pages(f"{FACTORIAL_BASE}/documents/documents")
    print(f"  Totale documenti Factorial: {len(docs)}")

    # 4. Trova i mancanti
    print("\n[4/5] Trovo documenti mancanti...")
    missing = []
    for doc in docs:
        doc_id = doc.get("id")
        if doc.get("deleted_at") or doc.get("is_company_document"):
            continue
        if not doc.get("employee_id"):
            continue
        if doc_id not in existing_ids:
            employee_id = doc["employee_id"]
            utente_id   = emp_id_to_utente.get(employee_id)
            if not utente_id:
                continue
            folder_name  = folder_map.get(doc.get("folder_id"), "Altro")
            filename     = (doc.get("filename") or f"documento_{doc_id}.pdf").strip()
            tipo_doc     = normalize_tipo(folder_name, filename)
            categoria    = slugify(tipo_doc)
            s3_key       = f"uploads/documenti/{utente_id}/{categoria}/{doc_id}_{filename}"
            missing.append({
                "factorial_id":  doc_id,
                "employee_id":   employee_id,
                "utente_id":     utente_id,
                "filename":      filename,
                "tipo_documento": tipo_doc,
                "s3_key":        s3_key,
                "created_at":    doc.get("created_at"),
                "content_type":  doc.get("content_type") or "application/pdf",
            })

    print(f"  Documenti mancanti: {len(missing)}")

    if DRY_RUN:
        # Mostra un campione per dipendente
        by_emp = {}
        for d in missing:
            uid = d["utente_id"]
            by_emp.setdefault(uid, []).append(d)
        print(f"\n  Dipendenti con documenti mancanti: {len(by_emp)}")
        for uid, docs_list in list(by_emp.items())[:10]:
            print(f"  utente_id={uid}: {len(docs_list)} mancanti")
            for d in docs_list[:3]:
                print(f"    - [{d['factorial_id']}] {d['tipo_documento']} / {d['filename']} ({d['created_at'][:10] if d['created_at'] else '?'})")
            if len(docs_list) > 3:
                print(f"    ... e altri {len(docs_list)-3}")

        with open(REPORT_OUT, "w") as f:
            json.dump({"summary": {"mancanti": len(missing), "dipendenti": len(by_emp)}, "missing": missing}, f, ensure_ascii=False, indent=2)
        print(f"\n  Report salvato: {REPORT_OUT}")
        print("\n  Se i numeri sono corretti, lancia senza --dry-run")
        cur.close(); conn.close()
        return

    # 5. Inserisci i mancanti
    print("\n[5/5] Inserisco documenti mancanti...")
    ok, errori = [], []

    for i, item in enumerate(missing, 1):
        print(f"[{i}/{len(missing)}] {item['filename']}")

        # Download da Factorial
        url = get_download_url(item["factorial_id"])
        if not url:
            print(f"  -> ERRORE: nessun URL (cookie scaduto?)")
            errori.append({**item, "error": "nessun URL download"})
            continue

        try:
            r = requests.get(url, timeout=60)
            r.raise_for_status()
            s3_upload(r.content, item["s3_key"], item["content_type"])
            print(f"  -> S3 ok")
            time.sleep(SLEEP)
        except Exception as e:
            print(f"  -> ERRORE S3: {e}")
            errori.append({**item, "error": str(e)})
            continue

        try:
            cur.execute(
                """
                INSERT INTO documenti
                    (utente_id, tipo_documento, nome_file, url_file,
                     caricato_da, data_upload, factorial_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (factorial_id) DO NOTHING
                """,
                (item["utente_id"], item["tipo_documento"], item["filename"],
                 item["s3_key"], CARICATO_DA, item["created_at"], item["factorial_id"])
            )
            conn.commit()
            print(f"  -> DB ok")
            ok.append(item)
        except Exception as e:
            conn.rollback()
            print(f"  -> ERRORE DB: {e}")
            errori.append({**item, "error": str(e)})

    cur.close(); conn.close()

    result = {
        "eseguito_il": datetime.now(timezone.utc).isoformat(),
        "summary": {"totale_mancanti": len(missing), "inseriti": len(ok), "errori": len(errori)},
        "inseriti": ok,
        "errori": errori,
    }
    with open(REPORT_OUT, "w") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 60)
    print(f"  Inseriti : {len(ok)}")
    print(f"  Errori   : {len(errori)}")
    print(f"  Report   : {REPORT_OUT}")
    print("=" * 60)
    if errori:
        print("  Rilancia per riprovare gli errori (i gia inseriti vengono saltati)")


if __name__ == "__main__":
    main()