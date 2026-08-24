#!/usr/bin/env python3
"""Normalize approved sourcing rows and export generic or Loxo-ready CSV."""

from __future__ import annotations

import argparse
import csv
import json
import re
from datetime import date
from pathlib import Path
from typing import Any


GENERIC_COLUMNS = [
    "Full Name",
    "Title",
    "Company",
    "Location",
    "LinkedIn",
    "Status",
    "Fit/Priority",
    "Confidence",
    "Evidence",
    "Gaps/Risks",
    "Notes",
]

LOXO_COLUMNS = [
    "First Name",
    "Last Name",
    "Full Name",
    "Title",
    "Company",
    "Location",
    "LinkedIn",
    "Tags",
    "Notes",
]

ALIASES = {
    "full_name": ("full_name", "full name", "name"),
    "title": ("title", "current_title", "current title"),
    "company": ("company", "current_company", "current company"),
    "location": ("location", "current_location", "current location"),
    "linkedin": ("linkedin", "linkedin_link", "linkedin link", "public_profile", "public profile"),
    "status": ("status",),
    "fit_priority": ("fit_priority", "fit", "priority", "fit/priority"),
    "confidence": ("confidence",),
    "evidence": ("evidence", "relevant_evidence", "relevant evidence", "business_signal", "business signal"),
    "gaps_risks": ("gaps_risks", "gaps", "risks", "gaps/risks", "concerns"),
    "notes": ("notes", "why_target", "why target"),
    "tags": ("tags",),
}


def slugify(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return value or "list"


def clean_key(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple, set)):
        return "; ".join(str(item).strip() for item in value if str(item).strip())
    return str(value).strip()


def get_value(row: dict[str, Any], canonical: str) -> str:
    normalized = {clean_key(key): value for key, value in row.items()}
    for alias in ALIASES[canonical]:
        if clean_key(alias) in normalized:
            return text(normalized[clean_key(alias)])
    return ""


def is_header_row(row: dict[str, Any]) -> bool:
    name = clean_key(get_value(row, "full_name"))
    company = clean_key(get_value(row, "company"))
    title = clean_key(get_value(row, "title"))
    return name in {"name", "full name"} and (
        company in {"", "company", "current company"}
        or title in {"", "title", "current title", "current title + company"}
    )


def normalize_linkedin(url: str) -> str:
    value = url.strip().lower().split("?")[0].rstrip("/")
    return value.replace("http://", "https://")


def dedupe_key(row: dict[str, Any]) -> str:
    linkedin = normalize_linkedin(get_value(row, "linkedin"))
    if linkedin:
        return f"url:{linkedin}"
    return "person:" + "|".join(
        [clean_key(get_value(row, "full_name")), clean_key(get_value(row, "company"))]
    )


def protect_csv(value: str) -> str:
    return "'" + value if value.startswith(("=", "+", "-", "@")) else value


def split_name(full_name: str) -> tuple[str, str]:
    parts = full_name.split()
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return " ".join(parts[:-1]), parts[-1]


def normalize_rows(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int, int]:
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    headers_removed = 0
    duplicates_removed = 0
    for row in rows:
        if not isinstance(row, dict):
            raise SystemExit("Each row must be a JSON object")
        if is_header_row(row):
            headers_removed += 1
            continue
        key = dedupe_key(row)
        if key in seen:
            duplicates_removed += 1
            continue
        seen.add(key)
        normalized.append(row)
    return normalized, headers_removed, duplicates_removed


def generic_row(row: dict[str, Any]) -> list[str]:
    values = [
        get_value(row, "full_name"),
        get_value(row, "title"),
        get_value(row, "company"),
        get_value(row, "location"),
        get_value(row, "linkedin"),
        get_value(row, "status"),
        get_value(row, "fit_priority"),
        get_value(row, "confidence"),
        get_value(row, "evidence"),
        get_value(row, "gaps_risks"),
        get_value(row, "notes"),
    ]
    return [protect_csv(value) for value in values]


def loxo_row(row: dict[str, Any], kind: str) -> list[str]:
    full_name = get_value(row, "full_name")
    first_name, last_name = split_name(full_name)
    fit = get_value(row, "fit_priority")
    status = get_value(row, "status")
    supplied_tags = get_value(row, "tags")
    tags = "; ".join(part for part in ["Sourcing", kind.title(), status, fit, supplied_tags] if part)
    notes = " | ".join(
        part
        for part in [
            get_value(row, "evidence"),
            get_value(row, "gaps_risks"),
            get_value(row, "notes"),
        ]
        if part
    )
    values = [
        first_name,
        last_name,
        full_name,
        get_value(row, "title"),
        get_value(row, "company"),
        get_value(row, "location"),
        get_value(row, "linkedin"),
        tags,
        notes,
    ]
    return [protect_csv(value) for value in values]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, help="JSON array of approved rows")
    parser.add_argument("--kind", choices=("candidate", "prospect"), required=True)
    parser.add_argument("--format", choices=("generic", "loxo"), required=True)
    parser.add_argument("--label", required=True, help="filename label")
    parser.add_argument("--outdir", default=str(Path.home() / "Downloads"))
    args = parser.parse_args()

    source_path = Path(args.data).expanduser()
    rows = json.loads(source_path.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise SystemExit("Expected a JSON array")

    cleaned, headers_removed, duplicates_removed = normalize_rows(rows)
    columns = GENERIC_COLUMNS if args.format == "generic" else LOXO_COLUMNS
    converter = generic_row if args.format == "generic" else lambda row: loxo_row(row, args.kind)

    outdir = Path(args.outdir).expanduser()
    outdir.mkdir(parents=True, exist_ok=True)
    filename = f"{slugify(args.label)}-{args.kind}-sourcing-{args.format}-{date.today().isoformat()}.csv"
    outpath = outdir / filename

    with outpath.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(columns)
        for row in cleaned:
            writer.writerow(converter(row))

    print(
        json.dumps(
            {
                "output": str(outpath.resolve()),
                "input_rows": len(rows),
                "exported_rows": len(cleaned),
                "headers_removed": headers_removed,
                "duplicates_removed": duplicates_removed,
                "format": args.format,
                "kind": args.kind,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
