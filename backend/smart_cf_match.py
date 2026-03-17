import os
import json
import re
import unicodedata
import pandas as pd
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
CSV_FILE = "data/wb/Codici_Fiscali.csv"
OUTPUT_JSON = "smart_cf_match_report.json"

# True = aggiorna davvero il DB
# False = dry run
APPLY_UPDATES = False

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL mancante nel file .env")


# =========================
# NORMALIZZAZIONE
# =========================
def strip_accents(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c))

def normalize_text(s: str) -> str:
    if s is None:
        return ""
    s = str(s).upper().strip()
    s = strip_accents(s)
    s = s.replace("’", "'").replace("`", "'")
    s = re.sub(r"[^A-Z0-9' ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def tokenize(s: str):
    s = normalize_text(s)
    if not s:
        return []
    # tolgo apostrofi interni solo per matching token
    s = s.replace("'", " ")
    tokens = [t for t in s.split() if t]
    return tokens

def token_set(s: str):
    return set(tokenize(s))

def is_subset_match(a: str, b: str) -> bool:
    """
    True se i token di a sono subset di b o viceversa.
    Utile per MARIO vs MARIO LUIGI, DE JESUS vs DE JESUS PERES.
    """
    sa = token_set(a)
    sb = token_set(b)
    if not sa or not sb:
        return False
    return sa.issubset(sb) or sb.issubset(sa)

def overlap_score(a: str, b: str) -> float:
    sa = token_set(a)
    sb = token_set(b)
    if not sa or not sb:
        return 0.0
    inter = len(sa & sb)
    denom = max(len(sa), len(sb))
    return inter / denom if denom else 0.0

def exact_norm_match(a: str, b: str) -> bool:
    return normalize_text(a) == normalize_text(b)


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
    col_cf: "cf"
})

df["nome"] = df["nome"].fillna("").astype(str).str.strip()
df["cognome"] = df["cognome"].fillna("").astype(str).str.strip()
df["cf"] = df["cf"].fillna("").astype(str).str.strip().str.upper()

df = df[(df["nome"] != "") & (df["cognome"] != "") & (df["cf"] != "")].copy()


# =========================
# LETTURA DB
# =========================
conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

cur.execute("""
    SELECT id, nome, cognome, codice_fiscale
    FROM utenti
""")
utenti_db = cur.fetchall()

db_rows = []
for r in utenti_db:
    db_rows.append({
        "id": r[0],
        "nome": r[1] or "",
        "cognome": r[2] or "",
        "codice_fiscale": r[3]
    })


# =========================
# MATCHING
# =========================
report = {
    "auto_match_esatto": [],
    "auto_match_token_subset": [],
    "auto_match_score": [],
    "ambigui_da_rivedere": [],
    "non_trovati": [],
    "cf_gia_presenti": [],
    "aggiornati": []
}

used_db_ids = set()

for _, row in df.iterrows():
    csv_nome = row["nome"]
    csv_cognome = row["cognome"]
    csv_cf = row["cf"]

    candidates = []

    for user in db_rows:
        db_id = user["id"]
        db_nome = user["nome"]
        db_cognome = user["cognome"]
        db_cf = user["codice_fiscale"]

        # non toccare chi ha già CF
        if db_cf is not None and str(db_cf).strip() != "":
            continue

        # match esatto normalizzato
        if exact_norm_match(csv_nome, db_nome) and exact_norm_match(csv_cognome, db_cognome):
            candidates.append({
                "tipo_match": "exact",
                "score": 1.0,
                "id": db_id,
                "nome_db": db_nome,
                "cognome_db": db_cognome
            })
            continue

        # match subset token su nome e cognome
        nome_subset = is_subset_match(csv_nome, db_nome)
        cognome_subset = is_subset_match(csv_cognome, db_cognome)

        if nome_subset and cognome_subset:
            score_nome = overlap_score(csv_nome, db_nome)
            score_cognome = overlap_score(csv_cognome, db_cognome)
            score = round((score_nome * 0.45) + (score_cognome * 0.55), 4)

            candidates.append({
                "tipo_match": "subset",
                "score": score,
                "id": db_id,
                "nome_db": db_nome,
                "cognome_db": db_cognome
            })
            continue

        # match “forte” per overlap, ma non abbastanza sicuro da solo
        score_nome = overlap_score(csv_nome, db_nome)
        score_cognome = overlap_score(csv_cognome, db_cognome)
        total_score = round((score_nome * 0.45) + (score_cognome * 0.55), 4)

        # soglia forte ma prudente
        if total_score >= 0.85 and score_cognome >= 0.80 and score_nome >= 0.70:
            candidates.append({
                "tipo_match": "score",
                "score": total_score,
                "id": db_id,
                "nome_db": db_nome,
                "cognome_db": db_cognome
            })

    # ordino i candidati
    candidates = sorted(
        candidates,
        key=lambda x: (
            0 if x["tipo_match"] == "exact" else
            1 if x["tipo_match"] == "subset" else
            2,
            -x["score"]
        )
    )

    item_base = {
        "nome_csv": csv_nome,
        "cognome_csv": csv_cognome,
        "cf_csv": csv_cf
    }

    if not candidates:
        report["non_trovati"].append(item_base)
        continue

    # tengo solo i migliori
    top = candidates[0]
    equally_good = [
        c for c in candidates
        if c["tipo_match"] == top["tipo_match"] and abs(c["score"] - top["score"]) < 0.0001
    ]

    # se il migliore non è univoco, mando in review
    if len(equally_good) > 1:
        report["ambigui_da_rivedere"].append({
            **item_base,
            "motivo": "piu_candidati_equivalenti",
            "candidati": equally_good[:10]
        })
        continue

    # evito di usare lo stesso record DB per più righe CSV
    if top["id"] in used_db_ids:
        report["ambigui_da_rivedere"].append({
            **item_base,
            "motivo": "record_db_gia_assegnato_ad_altro_csv",
            "candidati": candidates[:10]
        })
        continue

    # classificazione del match
    final_item = {
        **item_base,
        "id": top["id"],
        "nome_db": top["nome_db"],
        "cognome_db": top["cognome_db"],
        "tipo_match": top["tipo_match"],
        "score": top["score"]
    }

    if top["tipo_match"] == "exact":
        report["auto_match_esatto"].append(final_item)
        used_db_ids.add(top["id"])
    elif top["tipo_match"] == "subset":
        # auto se univoco e score buono
        if top["score"] >= 0.75:
            report["auto_match_token_subset"].append(final_item)
            used_db_ids.add(top["id"])
        else:
            report["ambigui_da_rivedere"].append({
                **item_base,
                "motivo": "subset_score_basso",
                "candidati": candidates[:10]
            })
    else:
        # score puro: auto solo se molto forte
        if top["score"] >= 0.92:
            report["auto_match_score"].append(final_item)
            used_db_ids.add(top["id"])
        else:
            report["ambigui_da_rivedere"].append({
                **item_base,
                "motivo": "score_non_abbastanza_alto",
                "candidati": candidates[:10]
            })


# =========================
# UPDATE REALE
# =========================
to_update = (
    report["auto_match_esatto"]
    + report["auto_match_token_subset"]
    + report["auto_match_score"]
)

if APPLY_UPDATES:
    for item in to_update:
        cur.execute("""
            UPDATE utenti
            SET codice_fiscale = %s
            WHERE id = %s
              AND (codice_fiscale IS NULL OR TRIM(codice_fiscale) = '')
            RETURNING id
        """, (item["cf_csv"], item["id"]))

        updated = cur.fetchone()
        if updated:
            report["aggiornati"].append({
                "id": item["id"],
                "nome_db": item["nome_db"],
                "cognome_db": item["cognome_db"],
                "cf_inserito": item["cf_csv"],
                "tipo_match": item["tipo_match"],
                "score": item["score"]
            })

    conn.commit()

# =========================
# SALVATAGGIO REPORT
# =========================
summary = {
    "csv_rows": len(df),
    "auto_match_esatto": len(report["auto_match_esatto"]),
    "auto_match_token_subset": len(report["auto_match_token_subset"]),
    "auto_match_score": len(report["auto_match_score"]),
    "ambigui_da_rivedere": len(report["ambigui_da_rivedere"]),
    "non_trovati": len(report["non_trovati"]),
    "aggiornati": len(report["aggiornati"])
}

output = {
    "summary": summary,
    "details": report
}

with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print("\n====================")
print("📊 SMART MATCH REPORT")
print("====================")
for k, v in summary.items():
    print(f"{k}: {v}")

print(f"\n✅ Report salvato in: {OUTPUT_JSON}")
print(f"APPLY_UPDATES = {APPLY_UPDATES}")

cur.close()
conn.close()