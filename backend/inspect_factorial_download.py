import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.environ["FACTORIAL_API_KEY"]
DOC_ID = 50951617

BASE = "https://api.factorialhr.com/api/2026-01-01/resources"
HEADERS = {
    "accept": "application/json",
    "x-api-key": API_KEY,
    "content-type": "application/json",
}

def show(title, method, url, payload=None):
    if method == "GET":
        r = requests.get(url, headers=HEADERS, timeout=60)
    else:
        r = requests.post(url, headers=HEADERS, json=payload, timeout=60)

    print(f"\n=== {title} ===")
    print("STATUS:", r.status_code)
    try:
        print(json.dumps(r.json(), indent=2, ensure_ascii=False))
    except Exception:
        print(r.text[:4000])

show("SINGLE DOCUMENT", "GET", f"{BASE}/documents/documents/{DOC_ID}")
show(
    "DOWNLOAD URL",
    "POST",
    f"{BASE}/documents/download_urls/bulk_create",
    {"ids": [DOC_ID]},
)