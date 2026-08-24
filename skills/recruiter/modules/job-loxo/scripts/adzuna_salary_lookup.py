#!/usr/bin/env python3
"""Read-only Adzuna salary lookup without exposing credentials."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key not in {"ADZUNA_APP_ID", "ADZUNA_API_KEY"}:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        os.environ.setdefault(key, value)


def normalize_title(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def hourly(value):
    if value is None:
        return None
    number = float(value)
    return round(number / 2080, 2) if number > 500 else round(number, 2)


def main() -> int:
    parser = argparse.ArgumentParser(description="Search Adzuna by title and location.")
    parser.add_argument("--title", required=True)
    parser.add_argument("--location", required=True)
    parser.add_argument("--country", default="ca")
    parser.add_argument("--distance-km", type=int)
    parser.add_argument("--results", type=int, default=50)
    parser.add_argument("--max-days-old", type=int, default=180)
    parser.add_argument("--env-file", help="Optional host-managed credential file. Environment variables are preferred.")
    args = parser.parse_args()

    if args.env_file:
        load_env_file(Path(args.env_file).expanduser())
    app_id = os.environ.get("ADZUNA_APP_ID")
    api_key = os.environ.get("ADZUNA_API_KEY")
    if not app_id or not api_key:
        print("Missing ADZUNA_APP_ID or ADZUNA_API_KEY.", file=sys.stderr)
        return 2

    params = {
        "app_id": app_id,
        "app_key": api_key,
        "what": args.title,
        "where": args.location,
        "results_per_page": max(1, min(args.results, 50)),
        "max_days_old": args.max_days_old,
        "sort_by": "relevance",
        "content-type": "application/json",
    }
    if args.distance_km is not None:
        params["distance"] = args.distance_km

    url = f"https://api.adzuna.com/v1/api/jobs/{args.country}/search/1?{urlencode(params)}"
    request = Request(url, headers={"User-Agent": "job-loxo/1.0"})
    with urlopen(request, timeout=30) as response:
        payload = json.load(response)

    requested_title = normalize_title(args.title)
    requested_location = args.location.split(",", 1)[0].strip().lower()
    seen = set()
    records = []
    for item in payload.get("results", []):
        item_id = str(item.get("id", ""))
        if item_id and item_id in seen:
            continue
        seen.add(item_id)
        title = item.get("title") or ""
        location = (item.get("location") or {}).get("display_name") or ""
        company = (item.get("company") or {}).get("display_name") or ""
        salary_min = item.get("salary_min")
        salary_max = item.get("salary_max")
        records.append(
            {
                "id": item_id,
                "title": title,
                "company": company,
                "location": location,
                "exact_title": normalize_title(title) == requested_title,
                "exact_city": location.lower().startswith(requested_location),
                "salary_min": salary_min,
                "salary_max": salary_max,
                "hourly_min": hourly(salary_min),
                "hourly_max": hourly(salary_max),
                "created": item.get("created"),
                "redirect_url": item.get("redirect_url"),
            }
        )

    output = {
        "query": {
            "title": args.title,
            "location": args.location,
            "distance_km": args.distance_km,
            "max_days_old": args.max_days_old,
        },
        "count_reported": payload.get("count", 0),
        "mean_reported": payload.get("mean"),
        "returned_unique": len(records),
        "exact_title_exact_city_salary_records": [
            record
            for record in records
            if record["exact_title"]
            and record["exact_city"]
            and (record["salary_min"] is not None or record["salary_max"] is not None)
        ],
        "salary_records": [
            record
            for record in records
            if record["salary_min"] is not None or record["salary_max"] is not None
        ],
        "records": records,
    }
    json.dump(output, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
