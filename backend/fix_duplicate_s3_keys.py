"""
fix_duplicate_s3_keys.py
------------------------
Ripara i documenti migrati con chiave S3 in collisione.

PROBLEMA: durante la migrazione, piu' documenti con lo stesso filename
per lo stesso dipendente venivano scritti sulla stessa chiave S3, con
l'ultimo che sovrascriveva tutti i precedenti.

SOLUZIONE: per ogni gruppo di documenti che condividono la stessa url_file,
riscarica ciascuno da Factorial e caricalo su una chiave S3 univoca:
  uploads/documenti/{utente_id}/{categoria}/{factorial_id}_{filename}

USO:
  python fix_duplicate_s3_keys.py --dry-run   <- analisi senza modifiche
  python fix_duplicate_s3_keys.py             <- riparazione reale

.env necessario:
  DATABASE_URL, AWS_S3_BUCKET, AWS_REGION,
  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
  FACTORIAL_SESSION_COOKIE=_factorial_session_v2=...
"""

import os, re, sys, time, json, posixpath
import requests, boto3, psycopg2
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL   = os.environ["DATABASE_URL"]
AWS_BUCKET     = os.environ["AWS_S3_BUCKET"]
AWS_REGION     = os.environ["AWS_REGION"]
SESSION_COOKIE = os.environ.get("FACTORIAL_SESSION_COOKIE", "")
SLEEP          = 0.4
DRY_RUN        = "--dry-run" in sys.argv

REPORT_OUT = "fix_duplicate_s3_keys_report.json"

s3 = boto3.client(
    "s3", region_name=AWS_REGION,
    aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
)


def get_download_url(doc_id: int) -> str | None:
    """Ottiene l'URL di download da Factorial tramite redirect (cookie sessione)."""
    r = requests.get(
        f"https://api.factorialhr.com/documents/{doc_id}",
        headers={"Cookie": SESSION_COOKIE},
        params={"download": "true"},
        allow_redirects=False,
        timeout=30,
    )
    if r.status_code in (301, 302, 303, 307, 308):
        return r.headers.get("Location")
    return None


def _strip_date_prefix(basename: str) -> str:
    """Rimuove un prefisso DD-MM-YYYY_ eventualmente aggiunto da un run precedente."""
    return re.sub(r"^\d{2}-\d{2}-\d{4}_", "", basename)


def _build_key(old_key: str, factorial_id: int, data_upload, use_id: bool) -> str:
    dirname  = posixpath.dirname(old_key)
    basename = _strip_date_prefix(posixpath.basename(old_key))
    if data_upload:
        dt = data_upload if hasattr(data_upload, "strftime") else datetime.fromisoformat(str(data_upload))
        date_str = dt.strftime("%d-%m-%Y")
        prefix = f"{date_str}_{factorial_id}" if use_id else date_str
    else:
        prefix = str(factorial_id)
    return f"{dirname}/{prefix}_{basename}"


def compute_group_keys(rows: list) -> dict:
    """
    Data una lista di record che condividono la stessa url_file, assegna
    chiavi S3 univoche. Prima prova solo la data; se ci sono ancora
    collisioni (stessa data E stesso filename), aggiunge il factorial_id.
    Ritorna {factorial_id -> new_key}.
    """
    candidates = {r[1]: _build_key(r[2], r[1], r[5], use_id=False) for r in rows}
    if len(set(candidates.values())) == len(candidates):
        return candidates  # le date sole bastano
    # Fallback: aggiunge factorial_id per tutto il gruppo
    return {r[1]: _build_key(r[2], r[1], r[5], use_id=True) for r in rows}


def main():
    if DRY_RUN:
        print("=" * 60)
        print("  DRY-RUN — nessuna modifica verra fatta")
        print("=" * 60)

    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor()

    # 1. Trova tutte le url_file condivise da piu' record
    print("\n[1/4] Cerco collisioni url_file nel DB...")
    cur.execute("""
        SELECT url_file, COUNT(*) as n
        FROM documenti
        WHERE factorial_id IS NOT NULL
        GROUP BY url_file
        HAVING COUNT(*) > 1
        ORDER BY n DESC
    """)
    collisioni = cur.fetchall()
    print(f"  url_file con collisioni: {len(collisioni)}")

    if not collisioni:
        print("  Nessuna collisione trovata. Il DB sembra corretto.")
        cur.close(); conn.close()
        return

    # 2. Carica tutti i record coinvolti
    print("\n[2/4] Carico i record coinvolti...")
    url_files_collidenti = [row[0] for row in collisioni]

    cur.execute("""
        SELECT d.id, d.factorial_id, d.url_file, d.tipo_documento, d.nome_file,
               d.data_upload, u.nome, u.cognome
        FROM documenti d
        JOIN utenti u ON u.id = d.utente_id
        WHERE d.url_file = ANY(%s)
          AND d.factorial_id IS NOT NULL
        ORDER BY d.url_file, d.data_upload
    """, (url_files_collidenti,))
    records = cur.fetchall()
    print(f"  Record totali da riparare: {len(records)}")

    # Raggruppa per url_file e calcola le chiavi nuove per ogni gruppo
    by_url: dict[str, list] = {}
    for row in records:
        by_url.setdefault(row[2], []).append(row)

    # Mappa factorial_id -> new_key (calcolata a livello di gruppo)
    new_key_map: dict[int, str] = {}
    for rows in by_url.values():
        new_key_map.update(compute_group_keys(rows))

    # Anteprima delle collisioni
    print(f"\n  Esempio collisioni:")
    for url, rows in list(by_url.items())[:5]:
        cognome_nome = f"{rows[0][7]} {rows[0][6]}"
        print(f"  [{cognome_nome}] {url}  -> {len(rows)} doc con stesso path")
        for r in rows:
            data = r[5].strftime("%d/%m/%Y") if r[5] else "?"
            print(f"    factorial_id={r[1]}  data={data}  nuovo_key={new_key_map[r[1]]}")

    if DRY_RUN:
        # Conta dipendenti unici colpiti
        cognomi = set()
        for r in records:
            cognomi.add(f"{r[7]} {r[6]}")
        print(f"\n  Dipendenti con collisioni: {len(cognomi)}")
        for c in sorted(cognomi):
            print(f"    - {c}")

        report = {
            "dry_run": True,
            "eseguito_il": datetime.now(timezone.utc).isoformat(),
            "url_file_in_collisione": len(collisioni),
            "record_da_riparare": len(records),
            "dipendenti": sorted(cognomi),
            "dettaglio": [
                {
                    "doc_id": r[0],
                    "factorial_id": r[1],
                    "url_file_attuale": r[2],
                    "nuovo_url_file": new_key_map[r[1]],
                    "tipo_documento": r[3],
                    "nome_file": r[4],
                    "data_upload": r[5].isoformat() if r[5] else None,
                    "dipendente": f"{r[7]} {r[6]}",
                }
                for r in records
            ],
        }
        with open(REPORT_OUT, "w") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print(f"\n  Report salvato: {REPORT_OUT}")
        print("\n  Se i numeri sono corretti, lancia senza --dry-run")
        cur.close(); conn.close()
        return

    # 3. Riparazione: scarica da Factorial, carica su S3, aggiorna DB
    print("\n[3/4] Riparazione in corso...")
    if not SESSION_COOKIE:
        print("  ERRORE: FACTORIAL_SESSION_COOKIE non impostato nel .env")
        cur.close(); conn.close()
        return

    ok, errori, saltati = [], [], []

    for i, row in enumerate(records, 1):
        doc_id_db, factorial_id, old_key, tipo_doc, nome_file, data_upload, nome, cognome = row
        dipendente = f"{cognome} {nome}"
        new_key = new_key_map[factorial_id]

        print(f"[{i}/{len(records)}] {dipendente} / {nome_file} (factorial_id={factorial_id})")

        # Scarica da Factorial
        url = get_download_url(factorial_id)
        if not url:
            print(f"  -> ERRORE: nessun URL di download (cookie scaduto?)")
            errori.append({"doc_id": doc_id_db, "factorial_id": factorial_id,
                           "dipendente": dipendente, "error": "nessun URL download"})
            continue

        try:
            r = requests.get(url, timeout=60)
            r.raise_for_status()
            content_type = r.headers.get("Content-Type", "application/pdf")
            s3.put_object(Bucket=AWS_BUCKET, Key=new_key, Body=r.content, ContentType=content_type)
            print(f"  -> S3 ok: {new_key}")
            time.sleep(SLEEP)
        except Exception as e:
            print(f"  -> ERRORE S3: {e}")
            errori.append({"doc_id": doc_id_db, "factorial_id": factorial_id,
                           "dipendente": dipendente, "error": str(e)})
            continue

        try:
            cur.execute(
                "UPDATE documenti SET url_file = %s WHERE id = %s",
                (new_key, doc_id_db)
            )
            conn.commit()
            print(f"  -> DB aggiornato")
            ok.append({"doc_id": doc_id_db, "factorial_id": factorial_id,
                       "dipendente": dipendente, "nuovo_url": new_key})
        except Exception as e:
            conn.rollback()
            print(f"  -> ERRORE DB: {e}")
            errori.append({"doc_id": doc_id_db, "factorial_id": factorial_id,
                           "dipendente": dipendente, "error": str(e)})

    cur.close(); conn.close()

    # 4. Report finale
    print("\n[4/4] Report finale...")
    result = {
        "dry_run": False,
        "eseguito_il": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "totale": len(records),
            "riparati": len(ok),
            "errori": len(errori),
        },
        "riparati": ok,
        "errori": errori,
    }
    with open(REPORT_OUT, "w") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 60)
    print(f"  Riparati : {len(ok)}")
    print(f"  Errori   : {len(errori)}")
    print(f"  Report   : {REPORT_OUT}")
    print("=" * 60)
    if errori:
        print("  Rilancia per riprovare gli errori (i gia riparati vengono saltati grazie all'url_file gia aggiornato)")


if __name__ == "__main__":
    main()
