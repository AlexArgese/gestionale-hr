"""
execute_updates.py
------------------
Legge il report JSON del dry-run e aggiorna data_upload + factorial_id
per tutti i documenti legacy. Genera un report di risultato.

USO:
  python execute_updates.py
"""

import json
import os
import psycopg2
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

REPORT_IN  = "factorial_reconcile_dryrun_report.json"
REPORT_OUT = "execute_updates_report.json"


def main():
    print("Carico report dry-run...")
    with open(REPORT_IN) as f:
        report = json.load(f)

    to_update = report["to_update"]
    print(f"Da aggiornare: {len(to_update)}")

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur  = conn.cursor()

    ok      = []
    errori  = []

    for i, item in enumerate(to_update, 1):
        try:
            cur.execute(
                "UPDATE documenti SET data_upload = %s, factorial_id = %s WHERE id = %s",
                (
                    item["new_data_upload"],
                    item["factorial_document_id"],
                    item["existing_document_id"],
                )
            )
            ok.append({
                "document_id":         item["existing_document_id"],
                "factorial_id":        item["factorial_document_id"],
                "nome_file":           item["nome_file"],
                "utente_id":           item["utente_id"],
                "tipo_documento":      item["tipo_documento"],
                "old_data_upload":     item["existing_data_upload"],
                "new_data_upload":     item["new_data_upload"],
            })
            if i % 500 == 0:
                print(f"  {i}/{len(to_update)} aggiornati...")
        except Exception as e:
            conn.rollback()
            errori.append({
                "document_id":    item.get("existing_document_id"),
                "factorial_id":   item.get("factorial_document_id"),
                "nome_file":      item.get("nome_file"),
                "utente_id":      item.get("utente_id"),
                "error":          str(e),
            })
            print(f"  ERRORE [{i}] {item.get('nome_file')}: {e}")

    conn.commit()
    cur.close()
    conn.close()

    result = {
        "eseguito_il": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "totale":    len(to_update),
            "aggiornati": len(ok),
            "errori":    len(errori),
        },
        "aggiornati": ok,
        "errori":     errori,
    }

    with open(REPORT_OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 50)
    print(f"  Aggiornati : {len(ok)}")
    print(f"  Errori     : {len(errori)}")
    print(f"  Report     : {REPORT_OUT}")
    print("=" * 50)


if __name__ == "__main__":
    main()