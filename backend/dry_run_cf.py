import os
import json
import pandas as pd
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
CSV_FILE = "data/wb/Codici_Fiscali.csv"
OUTPUT_JSON = "dry_run_cf_report.json"

def load_csv_robusto(path):
    for sep in [",", ";"]:
        try:
            df = pd.read_csv(path, sep=sep, dtype=str, encoding="utf-8-sig")
            if len(df.columns) >= 2:
                return df
        except:
            pass
    raise RuntimeError("CSV non leggibile")

df = load_csv_robusto(CSV_FILE)

def norm_col(c):
    return str(c).strip().lower().replace("\ufeff", "")

df.columns = [norm_col(c) for c in df.columns]

df = df.rename(columns={
    df.columns[0]: "cognome",
    df.columns[1]: "nome",
    df.columns[2]: "cf"
})

df["nome"] = df["nome"].astype(str).str.strip().str.upper()
df["cognome"] = df["cognome"].astype(str).str.strip().str.upper()
df["cf"] = df["cf"].astype(str).str.strip().str.upper()

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

# =========================
# JSON REPORT
# =========================
report = {
    "match_aggiornabili": [],
    "non_trovati": [],
    "doppi_match": [],
    "cf_gia_presenti": []
}

for _, row in df.iterrows():
    nome = row["nome"]
    cognome = row["cognome"]
    cf = row["cf"]

    cur.execute("""
        SELECT id, nome, cognome, codice_fiscale
        FROM utenti
        WHERE UPPER(TRIM(nome)) = %s
          AND UPPER(TRIM(cognome)) = %s
    """, (nome, cognome))

    results = cur.fetchall()

    if len(results) == 0:
        report["non_trovati"].append({
            "nome": nome,
            "cognome": cognome,
            "cf_csv": cf
        })

    elif len(results) > 1:
        report["doppi_match"].append({
            "nome": nome,
            "cognome": cognome,
            "cf_csv": cf,
            "matches": [
                {
                    "id": r[0],
                    "nome_db": r[1],
                    "cognome_db": r[2],
                    "cf_db": r[3]
                } for r in results
            ]
        })

    else:
        user_id, db_nome, db_cognome, db_cf = results[0]

        if db_cf:
            report["cf_gia_presenti"].append({
                "id": user_id,
                "nome": db_nome,
                "cognome": db_cognome,
                "cf_db": db_cf,
                "cf_csv": cf
            })
        else:
            report["match_aggiornabili"].append({
                "id": user_id,
                "nome": db_nome,
                "cognome": db_cognome,
                "cf_da_inserire": cf
            })

# =========================
# SALVATAGGIO JSON
# =========================
with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2, ensure_ascii=False)

print(f"✅ JSON generato: {OUTPUT_JSON}")

cur.close()
conn.close()