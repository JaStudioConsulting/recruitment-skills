#!/usr/bin/env python3
"""Build the approved sourcing list into a caller-selected output directory.

Usage:
    python3 build_csv.py --role "machinist-ohio" --data rows.json
    cat rows.json | python3 build_csv.py --role "machinist-ohio"

rows.json is a JSON array of objects with keys (any missing key -> blank cell):
    full_name, company, tenure, profile_url, contact_info, eligibility, evidence_status

For backward compatibility, ``linkedin_link``, ``public_profile``, and ``linkedin``
are accepted aliases for ``profile_url``.
"""
import argparse
import csv
import json
import os
import re
import sys
import tempfile
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

COLUMNS = ["Full Name", "Company", "Tenure", "LinkedIn Link", "Contact Info", "Eligibility", "Evidence Status"]
FIELD_MAP = {
    "Full Name": "full_name",
    "Company": "company",
    "Tenure": "tenure",
    "LinkedIn Link": "profile_url",
    "Contact Info": "contact_info",
    "Eligibility": "eligibility",
    "Evidence Status": "evidence_status",
}
EVIDENCE_STATUSES = {"Verified", "Unconfirmed", "Conflicting", "Outdated"}
ELIGIBILITY_STATUSES = {"Eligible", "Excluded"}


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.strip().lower()).strip("-") or "sourcing"


def protect_csv(value):
    value = str(value or "")
    return "'" + value if value.startswith(("=", "+", "-", "@")) else value


def profile_url(row):
    for key in ("profile_url", "linkedin_link", "public_profile", "linkedin"):
        value = str(row.get(key, "")).strip()
        if value:
            return value
    return ""


def field_value(row, column):
    return profile_url(row) if column == "LinkedIn Link" else row.get(FIELD_MAP[column], "")


def normalize_rows(rows):
    cleaned, seen = [], set()
    headers_removed = duplicates_removed = 0
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            raise SystemExit(f"row {index}: expected a JSON object")
        if str(row.get("full_name", "")).strip().lower() in {"name", "full name"}:
            headers_removed += 1
            continue
        eligibility = str(row.get("eligibility", "")).strip()
        evidence_status = str(row.get("evidence_status", "")).strip()
        if eligibility not in ELIGIBILITY_STATUSES:
            raise SystemExit(f"row {index}: Eligibility must be Eligible or Excluded")
        if evidence_status not in EVIDENCE_STATUSES:
            raise SystemExit(f"row {index}: Evidence Status must be Verified, Unconfirmed, Conflicting, or Outdated")
        parsed = urlparse(profile_url(row))
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise SystemExit(f"row {index}: Profile URL must be a direct http(s) profile/evidence URL")
        profile = f"https://{parsed.netloc.lower()}{parsed.path.rstrip('/')}"
        key = "url:" + profile
        if key in seen:
            duplicates_removed += 1
            continue
        seen.add(key)
        cleaned.append(row)
    return cleaned, headers_removed, duplicates_removed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--role", required=True, help="short role label for the filename")
    parser.add_argument("--data", help="path to JSON file; omit to read JSON from stdin")
    parser.add_argument("--outdir", default=str(Path.home() / "Downloads"))
    args = parser.parse_args()

    raw = Path(args.data).read_text() if args.data else sys.stdin.read()
    rows = json.loads(raw)
    if not isinstance(rows, list):
        raise SystemExit("Expected a JSON array of row objects")
    cleaned, headers_removed, duplicates_removed = normalize_rows(rows)

    outdir = Path(args.outdir).expanduser().resolve()
    outdir.mkdir(parents=True, exist_ok=True)
    filename = f"{slugify(args.role)}-sourcing-{date.today().isoformat()}.csv"
    outpath = (outdir / filename).resolve()
    if outpath.parent != outdir:
        raise SystemExit("Output path escaped the requested directory")

    with tempfile.NamedTemporaryFile("w", dir=outdir, delete=False, newline="", encoding="utf-8-sig") as f:
        temp_path = Path(f.name)
        writer = csv.writer(f)
        writer.writerow(COLUMNS)
        for row in cleaned:
            writer.writerow([protect_csv(field_value(row, col)) for col in COLUMNS])
    os.replace(temp_path, outpath)

    print(json.dumps({"output": str(outpath), "input_rows": len(rows), "exported_rows": len(cleaned), "headers_removed": headers_removed, "duplicates_removed": duplicates_removed}, indent=2))


if __name__ == "__main__":
    main()
