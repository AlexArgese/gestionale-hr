import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.environ["FACTORIAL_API_KEY"]
BASE = "https://api.factorialhr.com/api/2026-01-01/resources"
HEADERS = {
    "accept": "application/json",
    "x-api-key": API_KEY,
}

def fetch_one(path, params=None):
    r = requests.get(f"{BASE}{path}", headers=HEADERS, params=params or {"page": 1, "per_page": 1}, timeout=60)
    r.raise_for_status()
    data = r.json()
    if isinstance(data, list):
        return data[0] if data else None
    items = data.get("data", [])
    return items[0] if items else None

print("\n=== EMPLOYEE ===")
print(json.dumps(fetch_one("/employees/employees"), indent=2, ensure_ascii=False))

print("\n=== FOLDER ===")
print(json.dumps(fetch_one("/documents/folders"), indent=2, ensure_ascii=False))

print("\n=== DOCUMENT ===")
print(json.dumps(fetch_one("/documents/documents"), indent=2, ensure_ascii=False))