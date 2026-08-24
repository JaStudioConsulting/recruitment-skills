#!/usr/bin/env python3
"""Search Adzuna jobs without exposing credentials in logs or output."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def clean_job(job: dict) -> dict:
    company = job.get("company") or {}
    location = job.get("location") or {}
    category = job.get("category") or {}
    return {
        "id": str(job.get("id") or ""),
        "title": job.get("title") or "",
        "company": company.get("display_name") or "",
        "location": location.get("display_name") or "",
        "location_area": location.get("area") or [],
        "created": job.get("created") or "",
        "description": job.get("description") or "",
        "redirect_url": job.get("redirect_url") or "",
        "salary_min": job.get("salary_min"),
        "salary_max": job.get("salary_max"),
        "salary_is_predicted": job.get("salary_is_predicted"),
        "contract_type": job.get("contract_type") or "",
        "contract_time": job.get("contract_time") or "",
        "category": category.get("label") or "",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Search Adzuna job advertisements")
    parser.add_argument("--country", default="ca", help="Adzuna country code; default: ca")
    parser.add_argument("--page", type=int, default=1)
    parser.add_argument("--results", type=int, default=20)
    parser.add_argument("--what", required=True)
    parser.add_argument("--where", default="")
    parser.add_argument("--what-exclude", default="")
    parser.add_argument("--salary-min", type=int)
    parser.add_argument("--max-days-old", type=int)
    parser.add_argument("--sort-by", choices=("date", "salary", "relevance"), default="relevance")
    parser.add_argument("--full-time", action="store_true")
    parser.add_argument("--permanent", action="store_true")
    parser.add_argument("--env-file", help="Optional host-managed credential file. Environment variables are preferred.")
    parser.add_argument("--output", help="Write normalized JSON to this path; otherwise stdout")
    args = parser.parse_args()

    if args.page < 1:
        raise SystemExit("--page must be at least 1")
    if args.results < 1 or args.results > 50:
        raise SystemExit("--results must be between 1 and 50")

    if args.env_file:
        load_env(Path(args.env_file).expanduser())
    app_id = os.environ.get("ADZUNA_APP_ID", "")
    app_key = os.environ.get("ADZUNA_API_KEY", "")
    if not app_id or not app_key:
        raise SystemExit("Adzuna credentials are not configured")

    params: dict[str, str | int] = {
        "app_id": app_id,
        "app_key": app_key,
        "results_per_page": args.results,
        "what": args.what,
        "content-type": "application/json",
        "sort_by": args.sort_by,
    }
    if args.where:
        params["where"] = args.where
    if args.what_exclude:
        params["what_exclude"] = args.what_exclude
    if args.salary_min is not None:
        params["salary_min"] = args.salary_min
    if args.max_days_old is not None:
        params["max_days_old"] = args.max_days_old
    if args.full_time:
        params["full_time"] = 1
    if args.permanent:
        params["permanent"] = 1

    endpoint = f"https://api.adzuna.com/v1/api/jobs/{args.country}/search/{args.page}"
    request = Request(
        endpoint + "?" + urlencode(params),
        headers={"Accept": "application/json", "User-Agent": "TTTG-sourcing/1.0"},
    )
    try:
        with urlopen(request, timeout=30) as response:
            payload = json.load(response)
    except HTTPError as exc:
        raise SystemExit(f"Adzuna request failed with HTTP {exc.code}") from None
    except URLError as exc:
        raise SystemExit(f"Adzuna request failed: {exc.reason}") from None

    normalized = {
        "count": payload.get("count", 0),
        "page": args.page,
        "results_returned": len(payload.get("results") or []),
        "query": {"what": args.what, "where": args.where, "country": args.country},
        "results": [clean_job(job) for job in payload.get("results") or []],
    }
    rendered = json.dumps(normalized, indent=2, ensure_ascii=False)
    if args.output:
        output = Path(args.output).expanduser()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered + "\n", encoding="utf-8")
        print(str(output.resolve()))
    else:
        sys.stdout.write(rendered + "\n")


if __name__ == "__main__":
    main()
