import os
import re
import unicodedata
import pandas as pd
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
CSV_FILE = "data/wb/Codici_Fiscali.csv"

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL mancante nel file .env")


# =========================
# NORMALIZZAZIONE
# =========================
def strip_accents(s):
    s = unicodedata.normalize("NFKD", str(s))
    return "".join(c for c in s if not unicodedata.combining(c))

def normalize(s):
    s = strip_accents(str(s).upper().strip())
    s = re.sub(r"[^A-Z0-9 ]+", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()

def tokens(s):
    return set(normalize(s).split())

def score(a, b):
    ta = tokens(a)
    tb = tokens(b)
    if not ta or not tb:
        return 0
    return len(ta & tb) / max(len(ta), len(tb))


# =========================
# CSV
# =========================
df = pd.read_csv(CSV_FILE, sep=None, engine="python", encoding="utf-8-sig")
df.columns = [c.strip().lower() for c in df.columns]

df = df.rename(columns={
    df.columns[0]: "cognome",
    df.columns[1]: "nome",
    df.columns[2]: "cf"
})

df["nome"] = df["nome"].astype(str).str.strip()
df["cognome"] = df["cognome"].astype(str).str.strip()
df["cf"] = df["cf"].astype(str).str.strip().str.upper()


# =========================
# DB
# =========================
conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

cur.execute("""
    SELECT id, nome, cognome, codice_fiscale
    FROM utenti
    WHERE codice_fiscale IS NULL OR TRIM(codice_fiscale) = ''
""")

utenti = cur.fetchall()


# =========================
# INTERATTIVO
# =========================
for _, row in df.iterrows():

    nome_csv = row["nome"]
    cognome_csv = row["cognome"]
    cf = row["cf"]

    candidati = []

    for u in utenti:
        user_id, nome_db, cognome_db, cf_db = u

        s_nome = score(nome_csv, nome_db)
        s_cognome = score(cognome_csv, cognome_db)

        totale = (s_nome * 0.4) + (s_cognome * 0.6)

        if totale >= 0.6:
            candidati.append((totale, user_id, nome_db, cognome_db))

    candidati.sort(reverse=True)

    if not candidati:
        continue

    best = candidati[0]

    print("\n========================")
    print(f"CSV : {nome_csv} {cognome_csv}")
    print(f"CF  : {cf}")
    print("------------------------")
    print(f"DB  : {best[2]} {best[3]}")
    print(f"ID  : {best[1]}")
    print(f"SCORE: {round(best[0], 2)}")

    scelta = input("👉 Confermi update? (y/n/q): ").strip().lower()

    if scelta == "q":
        break

    if scelta == "y":
        cur.execute("""
            UPDATE utenti
            SET codice_fiscale = %s
            WHERE id = %s
        """, (cf, best[1]))

        conn.commit()

        print("✅ Aggiornato")

    else:
        print("⏭️ Saltato")


cur.close()
conn.close()

print("\n🎯 Fine review")