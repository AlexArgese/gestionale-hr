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
def strip_accents(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s))
    return "".join(c for c in s if not unicodedata.combining(c))

def normalize(s: str) -> str:
    s = strip_accents(str(s).upper().strip())
    s = s.replace("’", "'").replace("`", "'")
    s = re.sub(r"[^A-Z0-9' ]+", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()

def tokens(s: str):
    s = normalize(s).replace("'", " ")
    return set(t for t in s.split() if t)

def overlap_score(a: str, b: str) -> float:
    ta = tokens(a)
    tb = tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / max(len(ta), len(tb))

def subset_bonus(a: str, b: str) -> float:
    ta = tokens(a)
    tb = tokens(b)
    if not ta or not tb:
        return 0.0
    if ta.issubset(tb) or tb.issubset(ta):
        return 0.15
    return 0.0

def full_score(nome_db, cognome_db, nome_csv, cognome_csv):
    sn = overlap_score(nome_db, nome_csv)
    sc = overlap_score(cognome_db, cognome_csv)
    bonus_nome = subset_bonus(nome_db, nome_csv)
    bonus_cognome = subset_bonus(cognome_db, cognome_csv)

    totale = (sn * 0.4) + (sc * 0.6) + bonus_nome + bonus_cognome
    return round(min(totale, 1.0), 4), round(sn, 4), round(sc, 4)


# =========================
# LETTURA CSV ROBUSTA
# =========================
def load_csv_robusto(path):
    last_err = None
    for sep in [",", ";"]:
        try:
            df = pd.read_csv(path, sep=sep, dtype=str, encoding="utf-8-sig")
            if len(df.columns) >= 3:
                return df
        except Exception as e:
            last_err = e
    raise RuntimeError(f"Impossibile leggere il CSV: {last_err}")

def norm_col(c):
    return (
        str(c)
        .strip()
        .lower()
        .replace("\ufeff", "")
        .replace("à", "a")
        .replace("è", "e")
        .replace("é", "e")
        .replace("ì", "i")
        .replace("ò", "o")
        .replace("ù", "u")
    )

def find_col(possibili, columns):
    for p in possibili:
        if p in columns:
            return p
    return None

df = load_csv_robusto(CSV_FILE)
df.columns = [norm_col(c) for c in df.columns]

col_nome = find_col(["nome", "name"], df.columns)
col_cognome = find_col(["cognome", "surname", "lastname", "last_name"], df.columns)
col_cf = find_col(["cf", "codice_fiscale", "codice fiscale", "fiscal_code"], df.columns)

if not col_nome or not col_cognome or not col_cf:
    raise RuntimeError(
        f"Colonne trovate: {list(df.columns)}. Servono nome, cognome, cf"
    )

df = df.rename(columns={
    col_nome: "nome",
    col_cognome: "cognome",
    col_cf: "cf",
})

df["nome"] = df["nome"].fillna("").astype(str).str.strip()
df["cognome"] = df["cognome"].fillna("").astype(str).str.strip()
df["cf"] = df["cf"].fillna("").astype(str).str.strip().str.upper()

df = df[(df["nome"] != "") & (df["cognome"] != "") & (df["cf"] != "")].copy()
df = df.reset_index(drop=True)

# deduplica eventuali righe identiche csv
df = df.drop_duplicates(subset=["nome", "cognome", "cf"]).reset_index(drop=True)

csv_rows = df.to_dict(orient="records")


# =========================
# DB: SOLO SENZA CF
# =========================
conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

cur.execute("""
    SELECT id, nome, cognome
    FROM utenti
    WHERE codice_fiscale IS NULL
       OR TRIM(codice_fiscale) = ''
    ORDER BY cognome, nome, id
""")

utenti_senza_cf = cur.fetchall()

print(f"Utenti DB senza CF: {len(utenti_senza_cf)}")
print(f"Righe CSV disponibili: {len(csv_rows)}")

# per evitare di riusare la stessa riga csv più volte
used_csv_indexes = set()

aggiornati = 0
saltati = 0


# =========================
# LOOP INTERATTIVO
# =========================
for user_id, nome_db, cognome_db in utenti_senza_cf:
    candidati = []

    for idx, row in enumerate(csv_rows):
        if idx in used_csv_indexes:
            continue

        nome_csv = row["nome"]
        cognome_csv = row["cognome"]
        cf_csv = row["cf"]

        score, score_nome, score_cognome = full_score(
            nome_db, cognome_db, nome_csv, cognome_csv
        )

        # soglia prudente
        if score >= 0.55:
            candidati.append({
                "csv_index": idx,
                "nome_csv": nome_csv,
                "cognome_csv": cognome_csv,
                "cf_csv": cf_csv,
                "score": score,
                "score_nome": score_nome,
                "score_cognome": score_cognome,
            })

    candidati.sort(
        key=lambda x: (x["score"], x["score_cognome"], x["score_nome"]),
        reverse=True
    )

    if not candidati:
        print("\n==============================")
        print(f"DB : ID {user_id} | {nome_db} {cognome_db}")
        print("Nessun candidato CSV trovato")
        scelta = input("Invio per continuare, q per uscire: ").strip().lower()
        if scelta == "q":
            break
        saltati += 1
        continue

    top = candidati[:5]

    print("\n==============================")
    print(f"DB : ID {user_id} | {nome_db} {cognome_db}")
    print("------------------------------")
    for i, c in enumerate(top, 1):
        print(
            f"{i}) CSV: {c['nome_csv']} {c['cognome_csv']} | "
            f"CF: {c['cf_csv']} | "
            f"score={c['score']:.2f} "
            f"(nome={c['score_nome']:.2f}, cognome={c['score_cognome']:.2f})"
        )

    scelta = input("\nScegli 1-5, n skip, q quit: ").strip().lower()

    if scelta == "q":
        break

    if scelta == "n" or scelta == "":
        saltati += 1
        continue

    if scelta in ["1", "2", "3", "4", "5"]:
        idx_choice = int(scelta) - 1
        if idx_choice < len(top):
            selected = top[idx_choice]

            cur.execute("""
                UPDATE utenti
                SET codice_fiscale = %s
                WHERE id = %s
                  AND (codice_fiscale IS NULL OR TRIM(codice_fiscale) = '')
            """, (selected["cf_csv"], user_id))

            conn.commit()
            used_csv_indexes.add(selected["csv_index"])
            aggiornati += 1

            print(
                f"✅ Aggiornato ID {user_id} | {nome_db} {cognome_db} "
                f"-> {selected['cf_csv']}"
            )
        else:
            print("Scelta non valida, skip.")
            saltati += 1
    else:
        print("Scelta non valida, skip.")
        saltati += 1


cur.close()
conn.close()

print("\n====================")
print("REPORT FINALE")
print("====================")
print(f"Aggiornati: {aggiornati}")
print(f"Saltati: {saltati}")