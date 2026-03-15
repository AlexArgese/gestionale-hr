"""
fix_sede_missing_employees.py
Aggiorna la sede dei 10 dipendenti appena inseriti,
usando il nome del TEAM di Factorial come sede.

USO:
  python fix_sede_missing_employees.py           <- update reale
  python fix_sede_missing_employees.py --dry-run <- solo simulazione
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

TARGET_NAMES = {
    "KATRIN PALMISANO",
    "MARIA BENTIVOGLIO",
    "GIOVANNA DE CAROLIS",
    "PASQUA DESTINO",
    "ROMINA LAPADULA",
    "MARGHERITA SCIATTI",
    "FILOMENA PATRONELLI (HOTEL)",
    "GIOVANNI VITALE",
    "ANTONIO CENTANNI",
    "DAVIDE MANCINI",
}


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

    # 1. Carica team da Factorial -> mappa employee_id → team_name
    print("\n[1/3] Scarico team da Factorial...")
    r_teams = requests.get(f"{FACTORIAL_BASE}/teams/teams", headers=FACTORIAL_HEADERS)
    r_teams.raise_for_status()
    teams_data = r_teams.json()
    teams = teams_data if isinstance(teams_data, list) else teams_data.get("data", [])

    # Un dipendente può essere in più team — prendiamo il primo
    employee_to_team = {}
    for team in teams:
        team_name = team.get("name", "")
        for emp_id in team.get("employee_ids", []):
            if emp_id not in employee_to_team:
                employee_to_team[emp_id] = team_name

    print(f"  Trovati {len(teams)} team.")

    # 2. Carica dipendenti da Factorial, filtra i 10 target
    print("\n[2/3] Scarico dipendenti da Factorial...")
    employees = get_all_pages(f"{FACTORIAL_BASE}/employees/employees")

    target_employees = []
    for emp in employees:
        full = normalize_name(f"{emp.get('first_name','')} {emp.get('last_name','')}")
        if full in TARGET_NAMES:
            factorial_id = emp.get("id")
            sede = employee_to_team.get(factorial_id)
            target_employees.append({
                "nome":    emp.get("first_name", "").strip().upper(),
                "cognome": emp.get("last_name", "").strip().upper(),
                "sede":    sede,
                "full":    full,
            })

    print(f"  Trovati {len(target_employees)}/10 dipendenti target.")

    # 3. Aggiorna sede nel DB
    print("\n[3/3] Aggiorno sede nel DB...\n")
    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor()

    aggiornati = 0
    for emp in target_employees:
        if DRY_RUN:
            print(f"  [DRY] UPDATE: {emp['full']}  ->  sede: {emp['sede']}")
        else:
            try:
                cur.execute(
                    "UPDATE utenti SET sede = %s WHERE nome = %s AND cognome = %s",
                    (emp["sede"], emp["nome"], emp["cognome"])
                )
                conn.commit()
                print(f"  Aggiornato: {emp['full']}  ->  sede: {emp['sede']}")
            except Exception as e:
                conn.rollback()
                print(f"  ERRORE {emp['full']}: {e}")
                continue
        aggiornati += 1

    cur.close()
    conn.close()

    print("\n" + "=" * 55)
    print(f"  {'DRY-RUN' if DRY_RUN else 'COMPLETATO'}")
    print("=" * 55)
    print(f"  Dipendenti aggiornati: {aggiornati}/10")
    if DRY_RUN:
        print("\n  Se tutto e corretto, lancia:")
        print("     python fix_sede_missing_employees.py")


if __name__ == "__main__":
    main()