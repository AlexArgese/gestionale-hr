import os
import re
import json
import time
import unicodedata
from datetime import datetime, timezone
from collections import defaultdict

import requests
import psycopg2
from dotenv import load_dotenv

load_dotenv()

# =========================
# CONFIG
# =========================
FACTORIAL_API_KEY = os.environ["FACTORIAL_API_KEY"]
DATABASE_URL = os.environ["DATABASE_URL"]

FACTORIAL_BASE = "https://api.factorialhr.com/api/2026-01-01/resources"
FACTORIAL_HEADERS = {
    "accept": "application/json",
    "x-api-key": FACTORIAL_API_KEY,
}

SLEEP = 0.35
LEGACY_IMPORT_CUTOFF = datetime(2025, 11, 16, 0, 0, 0, tzinfo=timezone.utc)

REPORT_FILE = "factorial_reconcile_dryrun_report.json"

MANUAL_DOC_MATCH = {
    28921724: "GABRIELE CONVERTINI",
    27825655: "MARIANTONIETTA GIULIANI",
    22215177: "ALESSIA RUBINO",
    22000580: "MARIAGRAZIA DE CANTIS",
    20070052: "ANNUNZIATA CLEMENTE",
    20066205: "DONATO MAGGIPINTO",
}

# =========================
# UTILS
# =========================
def normalize_spaces(s: str) -> str:
    return " ".join((s or "").strip().split())


def strip_accents(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c))


def normalize_name(s: str) -> str:
    s = normalize_spaces(s)
    s = strip_accents(s)
    return s.upper()


def normalize_email(s: str) -> str:
    return normalize_spaces((s or "")).lower()


def normalize_filename(s: str) -> str:
    s = normalize_spaces(s)
    s = s.replace("\\", "/").split("/")[-1]
    return s
def normalize_filename_strong(s):
    s = strip_accents(s)
    s = s.upper()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[^\w\s\.\-\(\)]", "", s)
    return s.strip()

def slugify(s: str) -> str:
    s = strip_accents(normalize_spaces(s)).lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[-\s]+", "-", s).strip("-")
    return s or "altro"


def parse_dt(value):
    if not value:
        return None
    value = value.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


# =========================
# NORMALIZZAZIONE TIPO_DOCUMENTO
# =========================
TIPO_RULES = [
    (r"\b(buste?\s*paga|busta\s*paga|cedolin[oi]|payroll|payslip)\b", "BUSTE PAGA"),
    (r"\b(certificazion[ei]\s*unic[ae]|modello\s*certificazion[ei]\s*unic[ae]|\bcu\b)\b", "CERTIFICAZIONE UNICA"),
    (r"\b(contratt[oi]|lettera\s+di\s+assunzione|assunzion[ei])\b", "CONTRATTO"),
    (r"\b(carta\s*d[' ]?identita|documento\s*d[' ]?identita|identity\s*card|id\s*card)\b", "DOCUMENTO IDENTITA"),
    (r"\b(tessera\s*sanitaria)\b", "TESSERA SANITARIA"),
    (r"\b(codice\s*fiscale)\b", "CODICE FISCALE"),
    (r"\b(iban|coordinate\s*bancarie|dati\s*bancari|bank\s*account)\b", "IBAN"),
    (r"\b(certificat[oi]\s*medic[oi]|malatti[ae]|medical\s*certificate)\b", "CERTIFICATO MEDICO"),
    (r"\b(ferie|permessi|rol|leave)\b", "FERIE E PERMESSI"),
    (r"\b(privacy|gdpr|trattamento\s*dati)\b", "PRIVACY"),
    (r"\b(sicurezza|formazione|attestat[oi]|cors[oi]|haccp)\b", "FORMAZIONE"),
    (r"\b(dimissioni|cessazione|licenziamento|termination)\b", "CESSAZIONE RAPPORTO"),
    (r"\b(documenti?\s*personal[ei]|file\s*relativi\s*alla\s*mia\s*candidatura)\b", "DOCUMENTI PERSONALI"),
]


def normalize_tipo_documento(folder_name: str, filename: str = "") -> str:
    raw = normalize_spaces(f"{folder_name} {filename}")
    raw_norm = strip_accents(raw).lower()

    for pattern, target in TIPO_RULES:
        if re.search(pattern, raw_norm, flags=re.IGNORECASE):
            return target

    folder_name = normalize_spaces(folder_name or "Altro")
    return strip_accents(folder_name).upper()


def categoria_slug_from_tipo(tipo_documento: str) -> str:
    return slugify(tipo_documento)


# =========================
# FACTORIAL
# =========================
def get_all_pages(url, params=None):
    results = []
    page = 1
    params = params or {}

    while True:
        p = {**params, "page": page, "per_page": 100}
        r = requests.get(url, headers=FACTORIAL_HEADERS, params=p, timeout=60)
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


# =========================
# DB
# =========================
def load_utenti(cur):
    cur.execute("""
        SELECT id, nome, cognome, email
        FROM utenti
    """)
    rows = cur.fetchall()

    by_email = {}
    by_name = {}
    users = []

    for user_id, nome, cognome, email in rows:
        nome = nome or ""
        cognome = cognome or ""
        full_name = normalize_name(f"{nome} {cognome}")
        email_norm = normalize_email(email)

        row = {
            "id": user_id,
            "nome": nome,
            "cognome": cognome,
            "email": email,
            "full_name_norm": full_name,
            "email_norm": email_norm,
        }
        users.append(row)

        if email_norm:
            by_email[email_norm] = row

        if full_name:
            by_name[full_name] = row

    return users, by_email, by_name


def load_legacy_documents(cur):
    cur.execute("""
        SELECT
            id,
            utente_id,
            tipo_documento,
            nome_file,
            data_upload,
            factorial_id
        FROM documenti
        WHERE factorial_id IS NULL
    """)

    rows = cur.fetchall()

    doc_map = {}
    collisions = defaultdict(list)

    for doc_id, utente_id, tipo_documento, nome_file, data_upload, factorial_id in rows:
        tipo_norm = normalize_tipo_documento(tipo_documento or "", nome_file or "")
        file_norm = normalize_filename_strong(nome_file or "")

        key = (
            utente_id,
            tipo_norm,
            file_norm,
        )

        item = {
            "id": doc_id,
            "utente_id": utente_id,
            "tipo_documento": tipo_documento,
            "nome_file": nome_file,
            "data_upload": data_upload.isoformat() if data_upload else None,
            "factorial_id": factorial_id,
        }

        collisions[key].append(item)

    for key, items in collisions.items():
        if len(items) == 1:
            doc_map[key] = items[0]

    return doc_map, collisions


# =========================
# MATCHING
# =========================
def match_user(f_emp, utenti_by_email, utenti_by_name):
    emails_to_try = [
        normalize_email(f_emp.get("email")),
        normalize_email(f_emp.get("login_email")),
        normalize_email(f_emp.get("personal_email")),
    ]
    for email in emails_to_try:
        if email and email in utenti_by_email:
            return utenti_by_email[email], "email"

    full_name = normalize_name(
        f"{f_emp.get('first_name', '')} {f_emp.get('last_name', '')}"
    )
    if full_name and full_name in utenti_by_name:
        return utenti_by_name[full_name], "name"

    return None, None

def match_user_by_fullname(full_name, utenti_by_name):
    if not full_name:
        return None
    return utenti_by_name.get(normalize_name(full_name))
# =========================
# MAIN
# =========================
def main():
    print("=" * 70)
    print("CLOCKEASY - FACTORIAL RECONCILE DRY RUN")
    print("=" * 70)

    print("\n[1/6] Connessione al DB...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    print("\n[2/6] Carico utenti...")
    utenti, utenti_by_email, utenti_by_name = load_utenti(cur)
    print(f"  Utenti caricati: {len(utenti)}")

    print("\n[3/6] Carico documenti legacy (< 2025-11-16)...")
    legacy_map, legacy_collisions = load_legacy_documents(cur)
    legacy_total = sum(len(v) for v in legacy_collisions.values())
    collision_count = sum(1 for v in legacy_collisions.values() if len(v) > 1)
    print(f"  Record legacy letti: {legacy_total}")
    print(f"  Chiavi univoche legacy: {len(legacy_map)}")
    print(f"  Collisioni legacy: {collision_count}")

    print("\n[4/6] Scarico dipendenti Factorial...")
    employees = get_all_pages(f"{FACTORIAL_BASE}/employees/employees")
    print(f"  Dipendenti Factorial: {len(employees)}")

    employee_map = {}
    unmatched_employees = []

    matched_by_email = 0
    matched_by_name = 0

    for emp in employees:
        matched_user, strategy = match_user(emp, utenti_by_email, utenti_by_name)
        if matched_user:
            employee_map[emp["id"]] = {
                "factorial_employee_id": emp["id"],
                "utente_id": matched_user["id"],
                "strategy": strategy,
                "factorial_name": normalize_spaces(
                    f"{emp.get('first_name', '')} {emp.get('last_name', '')}"
                ),
                "factorial_email": emp.get("email") or emp.get("login_email"),
            }
            if strategy == "email":
                matched_by_email += 1
            else:
                matched_by_name += 1
        else:
            unmatched_employees.append({
                "factorial_employee_id": emp.get("id"),
                "name": normalize_spaces(f"{emp.get('first_name', '')} {emp.get('last_name', '')}"),
                "email": emp.get("email"),
                "login_email": emp.get("login_email"),
            })

    print(f"  Match via email: {matched_by_email}")
    print(f"  Match via nome : {matched_by_name}")
    print(f"  Non matchati   : {len(unmatched_employees)}")

    print("\n[5/6] Scarico cartelle e documenti Factorial...")
    folders = get_all_pages(f"{FACTORIAL_BASE}/documents/folders")
    folder_map = {f["id"]: f.get("name", "Altro") for f in folders}
    print(f"  Cartelle Factorial: {len(folder_map)}")

    docs = get_all_pages(f"{FACTORIAL_BASE}/documents/documents")
    print(f"  Documenti Factorial: {len(docs)}")

    print("\n[6/6] Analisi documenti...")
    to_update = []
    to_insert = []
    skipped = []
    ambiguous = []

    counters = defaultdict(int)

    for i, doc in enumerate(docs, 1):
        doc_id = doc.get("id")
        employee_id = doc.get("employee_id")
        filename = normalize_filename(doc.get("filename") or f"documento_{doc_id}.pdf")
        folder_name = folder_map.get(doc.get("folder_id"), "Altro")
        created_at_raw = doc.get("created_at")
        created_at = parse_dt(created_at_raw)

        if doc.get("deleted_at"):
            counters["deleted"] += 1
            continue

        if doc.get("is_company_document"):
            if not employee_id:
                skipped.append({
                    "reason": "missing_employee_id_but_present",
                    "factorial_document_id": doc.get("id"),
                    "filename": filename,
                    "raw_doc": doc
                })
                counters["company_or_no_employee"] += 1
                continue
            counters["company_or_no_employee"] += 1

            skipped.append({
                "reason": "company_or_no_employee",
                "factorial_document_id": doc.get("id"),
                "filename": filename,
                "folder_name": folder_name,
                "is_company_document": doc.get("is_company_document"),
                "employee_id": employee_id,
            })

            continue

        emp_match = None
        match_strategy = None

        if employee_id:
            emp_match = employee_map.get(employee_id)
            if emp_match:
                match_strategy = emp_match["strategy"]

        if not emp_match and doc_id in MANUAL_DOC_MATCH:
            manual_name = MANUAL_DOC_MATCH[doc_id]
            manual_user = match_user_by_fullname(manual_name, utenti_by_name) if manual_name else None

            if manual_user:
                emp_match = {
                    "factorial_employee_id": employee_id,
                    "utente_id": manual_user["id"],
                    "strategy": "manual_doc_match",
                    "factorial_name": manual_name,
                    "factorial_email": manual_user.get("email"),
                }
                match_strategy = "manual_doc_match"

        if not emp_match:
            counters["employee_not_found"] += 1
            skipped.append({
                "reason": "employee_not_found",
                "factorial_document_id": doc_id,
                "factorial_employee_id": employee_id,
                "filename": filename,
                "folder_name": folder_name,
                "manual_doc_match": doc_id in MANUAL_DOC_MATCH,
                "manual_target_name": MANUAL_DOC_MATCH.get(doc_id),
            })
            continue

        utente_id = emp_match["utente_id"]
        tipo_documento = normalize_tipo_documento(folder_name, filename)
        categoria_slug = categoria_slug_from_tipo(tipo_documento)
        s3_key = f"uploads/documenti/{utente_id}/{categoria_slug}/{filename}"

        base_item = {
            "factorial_document_id": doc_id,
            "factorial_employee_id": employee_id,
            "utente_id": utente_id,
            "match_strategy": emp_match["strategy"],
            "factorial_folder_name": folder_name,
            "tipo_documento": tipo_documento,
            "nome_file": filename,
            "created_at": created_at_raw,
            "s3_key": s3_key,
            "content_type": doc.get("content_type"),
            "file_size": doc.get("file_size"),
        }

        lookup_key = (
            utente_id,
            tipo_documento,
            normalize_filename_strong(filename),
        )

        collision_items = legacy_collisions.get(lookup_key, [])
        if len(collision_items) > 1:
            counters["would_insert"] += 1
            to_insert.append({
                **base_item,
                "factorial_id_to_save": doc_id,
                "note": "ambiguous_legacy_match_treated_as_insert",
            })
            print(f"[{i}] INSERT (ambiguo) utente={utente_id} tipo='{tipo_documento}' file='{filename}'")
            continue

        existing = legacy_map.get(lookup_key)


        if existing:
            counters["would_update"] += 1
            to_update.append({
                **base_item,
                "existing_document_id": existing["id"],
                "existing_data_upload": existing["data_upload"],
                "existing_factorial_id": existing["factorial_id"],
                "new_data_upload": created_at_raw,
            })
            print(f"[{i}] UPDATE  utente={utente_id} tipo='{tipo_documento}' file='{filename}' data->{created_at_raw}")
        else:
            counters["would_insert"] += 1
            to_insert.append({
                **base_item,
                "factorial_id_to_save": doc_id,
            })
            print(f"[{i}] INSERT  utente={utente_id} tipo='{tipo_documento}' file='{filename}'")
    
    if "--update-only" in sys.argv:
        print("\nEseguo UPDATE date nel DB...")
        conn2 = psycopg2.connect(DATABASE_URL)
        cur2 = conn2.cursor()
        ok = 0
        err = 0
        for item in to_update:
            try:
                cur2.execute(
                    "UPDATE documenti SET data_upload = %s, factorial_id = %s WHERE id = %s",
                    (item["new_data_upload"], item["factorial_document_id"], item["existing_document_id"])
                )
                ok += 1
            except Exception as e:
                print(f"  ERRORE {item['nome_file']}: {e}")
                err += 1
        conn2.commit()
        cur2.close()
        conn2.close()
        print(f"  Aggiornati: {ok}")
        print(f"  Errori: {err}")
        return


    cur.close()
    conn.close()

    report = {
        "summary": {
            "factorial_employees": len(employees),
            "factorial_documents": len(docs),
            "matched_by_email": matched_by_email,
            "matched_by_name": matched_by_name,
            "unmatched_employees": len(unmatched_employees),
            "would_update": counters["would_update"],
            "would_insert": counters["would_insert"],
            "employee_not_found": counters["employee_not_found"],
            "ambiguous_legacy_match": counters["ambiguous_legacy_match"],
            "company_or_no_employee": counters["company_or_no_employee"],
            "deleted": counters["deleted"],
        },
        "unmatched_employees": unmatched_employees,
        "to_update": to_update,
        "to_insert": to_insert,
        "skipped": skipped,
        "ambiguous": ambiguous,
    }

    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 70)
    print("DRY RUN COMPLETATO")
    print("=" * 70)
    print(f"Da aggiornare : {counters['would_update']}")
    print(f"Da inserire   : {counters['would_insert']}")
    print(f"Saltati       : {len(skipped)}")
    print(f"Ambigui       : {len(ambiguous)}")
    print(f"Report JSON   : {REPORT_FILE}")
    print("=" * 70)


if __name__ == "__main__":
    main()
