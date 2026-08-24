#!/usr/bin/env python3
"""Build the approved sourcing list into a caller-selected output directory.

Usage:
    python3 build_csv.py --role "machinist-ohio" --data rows.json
    cat rows.json | python3 build_csv.py --role "machinist-ohio"

rows.json is a JSON array of objects with keys (any missing key -> blank cell):
    full_name, company, tenure, linkedin_link, contact_info
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

COLUMNS = ["Full Name", "Company", "Tenure", "LinkedIn Link", "Contact Info"]
FIELD_MAP = {
    "Full Name": "full_name",
    "Company": "company",
    "Tenure": "tenure",
    "LinkedIn Link": "linkedin_link",
    "Contact Info": "contact_info",
}


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.strip().lower()).strip("-") or "sourcing"


def protect_csv(value):
    value = str(value or "")
    return "'" + value if value.startswith(("=", "+", "-", "@")) else value


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
        for row in rows:
            if not isinstance(row, dict):
                raise SystemExit("Each row must be a JSON object")
            writer.writerow([protect_csv(row.get(FIELD_MAP[col], "")) for col in COLUMNS])
    os.replace(temp_path, outpath)

    print(str(outpath))


if __name__ == "__main__":
    main()
