"""
factorial_add_missing_employees.py
Aggiunge nel DB di Clockeasy i dipendenti presenti su Factorial
ma non ancora nella tabella utenti.

REQUISITI:
  pip install requests psycopg2-binary python-dotenv

USO:
  python factorial_add_missing_employees.py           <- inserimento reale
  python factorial_add_missing_employees.py --dry-run <- solo simulazione
"""

import os
import sys
import time
import requests
import psycopg2
from dotenv import load_dotenv

load_dotenv()

FACTORIAL_API_KEY = os.environ["FACTORIAL_API_KEY"]
DATABASE_URL      = os.environ["DATABASE_URL"]

SLEEP   = 0.4
DRY_RUN = "--dry-run" in sys.argv

FACTORIAL_BASE    = "https://api.factorialhr.com/api/2026-01-01/resources"
FACTORIAL_HEADERS = {
    "accept":    "application/json",
    "x-api-key": FACTORIAL_API_KEY,
}

DEFAULT_RUOLO      = "dipendente"
DEFAULT_SOCIETA_ID = 1


def normalize_name(s: str) -> str:
    return " ".join(s.strip().upper().split())


def get_all_pages(url, params=None):
    results = []
    page = 1
    if params is None:
        params = {}
    while True:
        p = {**params, "page": page, "per_page": 100}
        r = requests.get(url, headers=FACTORIAL_HEADERS, params=p)
        r.raise_for_status()
        data = r.json()
        items = data if isinstance(data, list) else data.get("data", [])
        if not items:
            break
        results.extend(items)
        if len(items) < 100:
            break
        page += 1
        time.sleep(SLEEP)
    return results


def main():
    if DRY_RUN:
        print("=" * 55)
        print("  MODALITA DRY-RUN - nessuna modifica verra fatta")
        print("=" * 55)

    # 1. Carica utenti esistenti nel DB
    print("\n[1/4] Carico utenti dal DB...")
    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor()
    cur.execute("SELECT id, nome, cognome FROM utenti")
    existing = {}
    for uid, nome, cognome in cur.fetchall():
        key = normalize_name(f"{nome} {cognome}")
        existing[key] = uid
    print(f"  Trovati {len(existing)} utenti nel DB.")

    # 2. Carica sedi da Factorial
    print("\n[2/4] Scarico sedi da Factorial...")
    r_loc = requests.get(f"{FACTORIAL_BASE}/locations/locations", headers=FACTORIAL_HEADERS)
    r_loc.raise_for_status()
    locs_data = r_loc.json()
    locs = locs_data if isinstance(locs_data, list) else locs_data.get("data", [])
    id_to_sede = {loc["id"]: loc["name"] for loc in locs}
    print(f"  Trovate {len(id_to_sede)} sedi.")

    # 3. Carica dipendenti da Factorial
    print("\n[3/4] Scarico dipendenti da Factorial...")
    employees = get_all_pages(f"{FACTORIAL_BASE}/employees/employees")
    print(f"  Trovati {len(employees)} dipendenti su Factorial.")

    # 4. Confronto e inserimento
    print("\n[4/4] Confronto e inserimento...\n")

    inseriti = 0
    saltati  = 0

    for emp in employees:
        first = (emp.get("first_name") or "").strip()
        last  = (emp.get("last_name")  or "").strip()

        if not first or not last:
            continue

        key = normalize_name(f"{first} {last}")

        if key in existing:
            saltati += 1
            continue

        email           = emp.get("email") or ""
        stato_attivo    = emp.get("active", True)
        data_assunzione = emp.get("seniority_calculation_date") or None
        data_nascita    = emp.get("birthday_on") or None
        cf              = emp.get("identifier") or None
        telefono        = emp.get("phone_number") or None
        indirizzo       = emp.get("address_line_1") or None
        cap             = emp.get("postal_code") or None
        citta           = emp.get("city") or None
        iban            = emp.get("bank_number") or None
        location_id     = emp.get("location_id")
        sede            = id_to_sede.get(location_id) if location_id else None

        if DRY_RUN:
            print(f"  [DRY] Inserirebbe: {first} {last}")
            print(f"        email          : {email}")
            print(f"        stato_attivo   : {stato_attivo}")
            print(f"        data_assunzione: {data_assunzione}")
            print(f"        data_nascita   : {data_nascita}")
            print(f"        codice_fiscale : {cf}")
            print(f"        telefono       : {telefono}")
            print(f"        sede           : {sede}")
        else:
            try:
                cur.execute(
                    """
                    INSERT INTO utenti
                        (nome, cognome, email, ruolo, stato_attivo, societa_id,
                         data_assunzione, data_nascita, codice_fiscale, cellulare,
                         indirizzo_residenza, cap_residenza, citta_residenza, iban, sede)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        first.upper(),
                        last.upper(),
                        email,
                        DEFAULT_RUOLO,
                        stato_attivo,
                        DEFAULT_SOCIETA_ID,
                        data_assunzione,
                        data_nascita,
                        cf,
                        telefono,
                        indirizzo,
                        cap,
                        citta,
                        iban,
                        sede,
                    )
                )
                conn.commit()
                print(f"  Inserito: {first} {last} (sede: {sede})")
            except Exception as e:
                conn.rollback()
                print(f"  ERRORE inserendo {first} {last}: {e}")
                continue

        inseriti += 1

    cur.close()
    conn.close()

    print("\n" + "=" * 55)
    label = "DRY-RUN" if DRY_RUN else "COMPLETATO"
    print(f"  {label}")
    print("=" * 55)
    print(f"  {'[DRY] ' if DRY_RUN else ''}Nuovi dipendenti {'da inserire' if DRY_RUN else 'inseriti'}: {inseriti}")
    print(f"  Gia presenti (saltati): {saltati}")

    if DRY_RUN and inseriti > 0:
        print("\n  Se tutto e corretto, lancia:")
        print("     python factorial_add_missing_employees.py")
        print("\n  Poi rilancia la migrazione documenti:")
        print("     python factorial_to_s3.py")


if __name__ == "__main__":
    main()