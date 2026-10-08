from __future__ import annotations

import json
import math
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Set

import duckdb
import pyarrow as pa
import requests

# Configuration

# Site endpoints
BASE = "https://consultacontratos.ocpr.gov.pr"
SEARCH_URL = BASE + "/contract/search"

PAGE_LENGTH = 10000

PAGE_LOAD_TIMEOUT = 20.0  # Seconds

# Request pacing and retries
REQUEST_DELAY = 0.25      # Delay in seconds
MAX_RETRIES   = 4
RETRY_BACKOFF = 2.0       # Exponential backoff multiplier

# DataTables payload structure captured from DevTools
COLUMNS_PAYLOAD = [
    {"data": None,               "name": "", "searchable": False, "orderable": False, "search": {"value": "", "regex": False}},
    {"data": "ContractNumber",   "name": "", "searchable": True,  "orderable": True,  "search": {"value": "", "regex": False}},
    {"data": "Contractors",      "name": "", "searchable": True,  "orderable": True,  "search": {"value": "", "regex": False}},
    {"data": "DateOfGrant",      "name": "", "searchable": True,  "orderable": True,  "search": {"value": "", "regex": False}},
    {"data": "EffectiveDateFrom","name": "", "searchable": True,  "orderable": True,  "search": {"value": "", "regex": False}},
    {"data": "EffectiveDateTo",  "name": "", "searchable": True,  "orderable": True,  "search": {"value": "", "regex": False}},
    {"data": "AmountToPay",      "name": "", "searchable": True,  "orderable": True,  "search": {"value": "", "regex": False}},
    {"data": "Service",          "name": "", "searchable": True,  "orderable": True,  "search": {"value": "", "regex": False}},
    {"data": "EntityId",         "name": "", "searchable": True,  "orderable": True,  "search": {"value": "", "regex": False}},
    {"data": "CancellationDate", "name": "", "searchable": True,  "orderable": True,  "search": {"value": "", "regex": False}},
    {"data": None,               "name": "", "searchable": False, "orderable": False, "search": {"value": "", "regex": False}},
]
ORDER_PAYLOAD = [{"column": 3, "dir": "asc"}]  # order by DateOfGrant asc

# Output location
BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "download/1a_contracts_raw"

# Regex to extract the anti-forgery token from the search page
TOKEN_RE = re.compile(r'__RequestVerificationToken" type="hidden" value="([^"]+)"')


def extract_verification_token(html: str) -> str:
    """Pull the anti-forgery token embedded in the search page HTML."""
    match = TOKEN_RE.search(html)
    if not match:
        raise RuntimeError("Could not find __RequestVerificationToken in search page.")
    return match.group(1)


def refresh_session(session: requests.Session) -> str:
    """
    Fetch the search page to obtain fresh cookies and anti-forgery token,
    then update the session headers to mimic an in-browser request.
    """
    resp = session.get(SEARCH_URL, timeout=PAGE_LOAD_TIMEOUT)
    if resp.status_code != 200:
        raise RuntimeError(f"GET {SEARCH_URL} failed with HTTP {resp.status_code}")

    token = extract_verification_token(resp.text)
    session.headers.update(
        {
            "User-Agent": requests.utils.default_user_agent(),
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Referer": SEARCH_URL,
            "Origin": BASE,
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type": "application/json; charset=utf-8",
            "__RequestVerificationToken": token,
        }
    )
    return token


def build_payload(draw: int, start: int, length: int, date_from: str, date_to: str) -> Dict[str, Any]:
    """Construct the JSON payload for a single page request."""
    return {
        "draw": draw,
        "columns": COLUMNS_PAYLOAD,
        "order": ORDER_PAYLOAD,
        "start": start,
        "length": length,
        "search": {"value": "", "regex": False},
        "EntityId": None,
        "ContractNumber": None,
        "ContractorName": None,
        "DateOfGrantFrom": date_from,
        "DateOfGrantTo": date_to,
        "EffectiveDateFrom": None,
        "EffectiveDateTo": None,
        "AmountFrom": None,
        "AmountTo": None,
        "ServiceGroupId": None,
        "ServiceId": None,
        "FundId": None,
        "ContractingFormId": None,
        "PCONumber": None,
    }


def try_post_page(session: requests.Session, payload: Dict[str, Any]) -> Dict[str, Any]:
    """POST payload and return JSON dict; raise on non-200."""
    r = session.post(SEARCH_URL, json=payload, timeout=60)
    if r.status_code != 200:
        raise RuntimeError(f"POST returned HTTP {r.status_code}: {r.text[:200]}")
    content_type = r.headers.get("content-type", "").lower()
    if "json" not in content_type:
        raise RuntimeError(f"Unexpected content-type '{content_type}': {r.text[:200]}")
    return r.json()


def normalize_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Ensure complex fields are JSON-encoded for Parquet compatibility."""
    processed: List[Dict[str, Any]] = []
    for row in rows:
        if not row:
            continue
        data = dict(row)
        contractors = data.get("Contractors")
        if contractors is not None and not isinstance(contractors, (str, int, float, bool)):
            try:
                data["Contractors"] = json.dumps(contractors, ensure_ascii=False)
            except Exception:
                data["Contractors"] = str(contractors)
        processed.append(data)
    return processed




def run_t(year_chosen: int):
    print("Initializing HTTP session and fetching verification token...")
    session = requests.Session()
    refresh_session(session)

    collected_rows: List[Dict[str, Any]] = []
    observed_keys: Set[str] = set()
    date_from = f"01/01/{year_chosen}"
    date_to = f"31/12/{year_chosen}"

    # First page to discover totals
    draw = 1
    start = 0
    length = PAGE_LENGTH
    payload = build_payload(draw=draw, start=start, length=length, date_from=date_from, date_to=date_to)

    print("Fetching first page (to discover total count)...")
    resp_json = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp_json = try_post_page(session, payload)
            break
        except Exception as e:
            print(f"First page request failed (attempt {attempt}): {e}")
            if attempt == MAX_RETRIES:
                raise
            refresh_session(session)
            time.sleep(RETRY_BACKOFF ** (attempt - 1))

    records_total = resp_json.get("recordsTotal") or 0
    records_filtered = resp_json.get("recordsFiltered") or records_total
    print(f"recordsTotal={records_total}, recordsFiltered={records_filtered}")

    total_pages = max(1, math.ceil(records_filtered / float(length)))
    print(f"Using length={length}; total_pages (approx) = {total_pages}")

    first_rows = resp_json.get("data", [])
    print("First page rows:", len(first_rows))
    normalized_first_rows = normalize_rows(first_rows)
    collected_rows.extend(normalized_first_rows)
    for item in normalized_first_rows:
        observed_keys.update(item.keys())

    # Remaining pages
    for page_idx in range(1, total_pages):
        start = page_idx * length
        draw += 1
        payload = build_payload(draw=draw, start=start, length=length, date_from=date_from, date_to=date_to)

        attempt = 0
        while True:
            attempt += 1
            try:
                resp_json = try_post_page(session, payload)
                data_rows = resp_json.get("data", [])
                print(f"Page {page_idx+1}/{total_pages} start={start}: got {len(data_rows)} rows")
                normalized_rows = normalize_rows(data_rows)
                collected_rows.extend(normalized_rows)
                for item in normalized_rows:
                    observed_keys.update(item.keys())
                break
            except Exception as e:
                print(f"Error fetching page start={start} (attempt {attempt}): {e}")
                if attempt >= MAX_RETRIES:
                    print("Max retries reached for this page — aborting.")
                    raise
                print("Refreshing cookies and CSRF token via HTTP and retrying...")
                try:
                    refresh_session(session)
                except Exception as e2:
                    print("Failed to refresh token/cookies:", e2)
                time.sleep(RETRY_BACKOFF ** (attempt - 1))

        time.sleep(REQUEST_DELAY)
        if len(data_rows) < length:
            print("Last page shorter than length; reached end of results.")
            break

    parquet_path = OUTPUT_DIR / f"contracts_{year_chosen}.parquet"
    print(f"All pages fetched. Writing Parquet: {parquet_path}")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if collected_rows:
        table = pa.Table.from_pylist(collected_rows)
    else:
        fallback_keys = [col["data"] for col in COLUMNS_PAYLOAD if isinstance(col["data"], str) and col["data"]]
        if not observed_keys:
            observed_keys.update(fallback_keys)
        if not observed_keys:
            observed_keys.add("__empty__")
        sorted_keys = sorted(observed_keys)
        arrays = [pa.array([], type=pa.string()) for _ in sorted_keys]
        table = pa.Table.from_arrays(arrays, names=sorted_keys)

    con = duckdb.connect()
    try:
        con.register("contracts_results", table)
        con.execute(f"COPY contracts_results TO '{parquet_path.as_posix()}' (FORMAT PARQUET)")
        con.unregister("contracts_results")
    finally:
        con.close()
    print("Wrote Parquet:", parquet_path)
