"""
execute_inserts.py
------------------
Legge to_insert dal report JSON, scarica ogni file da Factorial
tramite cookie di sessione, carica su S3 e inserisce nel DB.

Genera execute_inserts_report.json con il risultato.

USO:
  python execute_inserts.py

VARIABILI .env necessarie:
  DATABASE_URL=...
  AWS_S3_BUCKET=...
  AWS_REGION=...
  AWS_ACCESS_KEY_ID=...
  AWS_SECRET_ACCESS_KEY=...
  FACTORIAL_SESSION_COOKIE=_factorial_session_v2=...
"""

import json
import os
import time
import boto3
import psycopg2
import requests
from datetime import datetime, timezone
from botocore.exceptions import ClientError
from dotenv import load_dotenv

load_dotenv()

REPORT_IN = "factorial_reconcile_dryrun_report.json"
REPORT_OUT = "execute_inserts_report.json"

DATABASE_URL    = os.environ["DATABASE_URL"]
AWS_BUCKET      = os.environ["AWS_S3_BUCKET"]
AWS_REGION      = os.environ["AWS_REGION"]
SESSION_COOKIE  = os.environ["FACTORIAL_SESSION_COOKIE"]
CARICATO_DA     = 159
SLEEP           = 0.4

s3 = boto3.client(
    "s3",
    region_name=AWS_REGION,
    aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
)


def get_download_url(doc_id: int) -> str | None:
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


def s3_exists(key: str) -> bool:
    try:
        s3.head_object(Bucket=AWS_BUCKET, Key=key)
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] in ("404", "NoSuchKey"):
            return False
        raise


def s3_upload(data: bytes, key: str, content_type: str = "application/pdf"):
    s3.put_object(
        Bucket=AWS_BUCKET,
        Key=key,
        Body=data,
        ContentType=content_type,
    )


def main():
    print("Carico report dry-run...")
    with open(REPORT_IN) as f:
        report = json.load(f)

    to_insert = report["to_insert"]
    print(f"Da inserire: {len(to_insert)}")

    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor()

    ok              = []
    errori          = []
    saltati_s3      = []
    gia_presenti_db = []

    for i, item in enumerate(to_insert, 1):
        doc_id       = item["factorial_document_id"]
        utente_id    = item["utente_id"]
        tipo_doc     = item["tipo_documento"]
        nome_file    = item["nome_file"]
        s3_key       = item["s3_key"]
        created_at   = item["created_at"]
        content_type = item.get("content_type") or "application/pdf"

        print(f"[{i}/{len(to_insert)}] {nome_file}")

        # Salta se già su S3
        if s3_exists(s3_key):
            print(f"  -> già su S3, salto upload")
            # Inserisci comunque nel DB se non c'è
            saltati_s3.append({
                "factorial_id": doc_id,
                "nome_file": nome_file,
                "s3_key": s3_key,
            })

        else:
            # Scarica da Factorial
            download_url = get_download_url(doc_id)
            if not download_url:
                print(f"  -> ERRORE: nessun URL download (cookie scaduto?)")
                errori.append({
                    "factorial_id": doc_id,
                    "nome_file": nome_file,
                    "error": "nessun URL download — cookie scaduto o doc non trovato",
                })
                continue

            try:
                r = requests.get(download_url, timeout=60)
                r.raise_for_status()
                s3_upload(r.content, s3_key, content_type)
                print(f"  -> caricato su S3")
                time.sleep(SLEEP)
            except Exception as e:
                print(f"  -> ERRORE upload S3: {e}")
                errori.append({
                    "factorial_id": doc_id,
                    "nome_file": nome_file,
                    "error": f"upload S3: {e}",
                })
                continue

        # Insert nel DB
        try:
            cur.execute(
                """
                INSERT INTO documenti
                    (utente_id, tipo_documento, nome_file, url_file,
                     caricato_da, data_upload, factorial_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (factorial_id) DO NOTHING
                """,
                (
                    utente_id,
                    tipo_doc,
                    nome_file,
                    s3_key,
                    CARICATO_DA,
                    created_at,
                    doc_id
                )
            )
            inserted = cur.rowcount
            conn.commit()

            if inserted == 1:
                ok.append({
                    "factorial_id": doc_id,
                    "utente_id": utente_id,
                    "tipo_documento": tipo_doc,
                    "nome_file": nome_file,
                    "s3_key": s3_key,
                    "data_upload": created_at,
                })
                print("  -> inserito nel DB")
            else:
                print("  -> già presente nel DB (factorial_id già esistente)")
                gia_presenti_db.append({
                    "factorial_id": doc_id,
                    "utente_id": utente_id,
                    "nome_file": nome_file,
                    "s3_key": s3_key,
                })
        except Exception as e:
            conn.rollback()
            print(f"  -> ERRORE DB insert: {e}")
            errori.append({
                "factorial_id": doc_id,
                "nome_file":    nome_file,
                "error":        f"DB insert: {e}",
            })

    cur.close()
    conn.close()

    result = {
        "eseguito_il": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "totale": len(to_insert),
            "inseriti": len(ok),
            "gia_su_s3": len(saltati_s3),
            "gia_presenti_db": len(gia_presenti_db),
            "errori": len(errori),
        },
        "inseriti": ok,
        "gia_su_s3": saltati_s3,
        "gia_presenti_db": gia_presenti_db,
        "errori": errori,
    }
    
    with open(REPORT_OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 50)
    print(f"  Inseriti        : {len(ok)}")
    print(f"  Già su S3       : {len(saltati_s3)}")
    print(f"  Già presenti DB : {len(gia_presenti_db)}")
    print(f"  Errori          : {len(errori)}")
    print("=" * 50)

    if errori:
        print("\n⚠️  Errori — rilancia lo script per riprovare")
        print("   (i documenti già inseriti verranno saltati)")


if __name__ == "__main__":
    main()