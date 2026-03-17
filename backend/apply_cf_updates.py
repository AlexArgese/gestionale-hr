import os
import json
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
INPUT_JSON = "dry_run_cf_report.json"

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL mancante nel file .env")

with open(INPUT_JSON, "r", encoding="utf-8") as f:
    report = json.load(f)

match_aggiornabili = report.get("match_aggiornabili", [])

if not isinstance(match_aggiornabili, list):
    raise RuntimeError("Il JSON non contiene una lista valida in 'match_aggiornabili'")

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

aggiornati = 0
saltati = 0
errori = 0

print(f"Trovati {len(match_aggiornabili)} record aggiornabili nel JSON.\n")

for item in match_aggiornabili:
    user_id = item.get("id")
    cf = item.get("cf_da_inserire")
    nome = item.get("nome")
    cognome = item.get("cognome")

    if not user_id or not cf:
        print(f"⚠️ Record malformato, salto: {item}")
        saltati += 1
        continue

    try:
        # Aggiorna solo se il codice_fiscale è ancora NULL o vuoto
        cur.execute("""
            UPDATE utenti
            SET codice_fiscale = %s
            WHERE id = %s
              AND (codice_fiscale IS NULL OR TRIM(codice_fiscale) = '')
            RETURNING id
        """, (cf.strip().upper(), user_id))

        updated = cur.fetchone()

        if updated:
            print(f"✅ AGGIORNATO -> ID:{user_id} | {nome} {cognome} | CF:{cf}")
            aggiornati += 1
        else:
            print(f"⏭️ SALTATO -> ID:{user_id} | {nome} {cognome} | CF già presente o record non trovato")
            saltati += 1

    except Exception as e:
        print(f"❌ ERRORE -> ID:{user_id} | {nome} {cognome} | {e}")
        errori += 1

conn.commit()
cur.close()
conn.close()

print("\n====================")
print("📊 REPORT UPDATE")
print("====================")
print(f"✅ Aggiornati: {aggiornati}")
print(f"⏭️ Saltati: {saltati}")
print(f"❌ Errori: {errori}")