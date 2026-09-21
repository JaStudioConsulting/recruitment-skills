#!/usr/bin/env python3
"""Strict provenance-ledger contract for interview-prep artifacts."""

from __future__ import annotations

from datetime import date
import re
from typing import Iterable


SOURCE_FIELDS = {
    "claim",
    "source",
    "publication date",
    "retrieval date",
    "scope",
    "status",
}
ASSET_FIELDS = {
    "creator",
    "source page",
    "direct asset url or generated-file path",
    "licence",
    "allowed use",
    "modifications",
    "rendered caption",
}
SOURCE_STATUSES = {"supported", "partially_supported", "unverified", "contradicted"}
PLACEHOLDER_VALUES = {"", "-", "n/a", "na", "none", "tbd", "todo", "unknown", "placeholder"}


def _normalized_label(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().casefold())


def _required_value(value: str, label: str) -> str:
    cleaned = value.strip()
    if _normalized_label(cleaned) in PLACEHOLDER_VALUES:
        raise ValueError(f"{label} must contain confirmed provenance, not a placeholder")
    return cleaned


def _iso_date(value: str, label: str, *, unavailable_allowed: bool = False) -> str:
    cleaned = value.strip()
    if unavailable_allowed and _normalized_label(cleaned) in {"unavailable", "not available"}:
        return cleaned
    try:
        parsed = date.fromisoformat(cleaned)
    except ValueError as error:
        raise ValueError(f"{label} must use YYYY-MM-DD") from error
    if parsed.isoformat() != cleaned:
        raise ValueError(f"{label} must use YYYY-MM-DD")
    return cleaned


def _records(text: str, record_kind: str, required_fields: set[str]) -> list[dict[str, str]]:
    if not isinstance(text, str) or not text.strip():
        raise ValueError(f"{record_kind} ledger must be a non-empty string")
    heading = re.compile(rf"^\s*##\s+{re.escape(record_kind)}(?:\s+.+)?\s*$", re.IGNORECASE)
    field = re.compile(r"^\s*(?:[-*]\s*)?([^:]+):\s*(.+?)\s*$")
    records: list[dict[str, str]] = []
    current: dict[str, str] | None = None
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("# "):
            continue
        if heading.match(raw_line):
            if current is not None:
                records.append(current)
            current = {}
            continue
        match = field.match(raw_line)
        if not match:
            raise ValueError(
                f"{record_kind} ledger contains an unstructured line; use one '## {record_kind}' block per record"
            )
        if current is None:
            raise ValueError(f"{record_kind} ledger fields must follow a '## {record_kind}' heading")
        key = _normalized_label(match.group(1))
        if key not in required_fields:
            raise ValueError(f"{record_kind} ledger has unsupported field: {match.group(1).strip()}")
        if key in current:
            raise ValueError(f"{record_kind} ledger repeats field: {key}")
        current[key] = _required_value(match.group(2), f"{record_kind} {key}")
    if current is not None:
        records.append(current)
    if not records:
        raise ValueError(f"{record_kind} ledger must contain at least one '## {record_kind}' record")
    for index, record in enumerate(records, start=1):
        missing = sorted(required_fields - set(record))
        if missing:
            raise ValueError(
                f"{record_kind} {index} is missing required fields: {', '.join(missing)}"
            )
    return records


def validate_source_ledger(
    text: str,
    authoritative_sources: Iterable[str],
    publication_status: str,
) -> list[dict[str, str]]:
    records = _records(text, "Claim", SOURCE_FIELDS)
    for index, record in enumerate(records, start=1):
        _iso_date(record["publication date"], f"Claim {index} publication date", unavailable_allowed=True)
        _iso_date(record["retrieval date"], f"Claim {index} retrieval date")
        status = _normalized_label(record["status"]).replace(" ", "_")
        if status not in SOURCE_STATUSES:
            raise ValueError(
                f"Claim {index} status must be one of: {', '.join(sorted(SOURCE_STATUSES))}"
            )
        record["status"] = status
        if publication_status == "approved_for_candidate_use" and status != "supported":
            raise ValueError(
                f"Claim {index} must be supported before candidate-facing approval"
            )
    recorded_sources = {_normalized_label(record["source"]) for record in records}
    missing_authorities = [
        source.strip()
        for source in authoritative_sources
        if _normalized_label(source) not in recorded_sources
    ]
    if missing_authorities:
        raise ValueError(
            "source ledger is missing authoritative source records: "
            + ", ".join(missing_authorities)
        )
    return records


def validate_asset_ledger(text: str, used_asset_paths: Iterable[str]) -> list[dict[str, str]]:
    records = _records(text, "Asset", ASSET_FIELDS)
    recorded_paths = {
        record["direct asset url or generated-file path"].strip()
        for record in records
    }
    missing_assets = [
        path.strip()
        for path in dict.fromkeys(used_asset_paths)
        if path.strip() and path.strip() not in recorded_paths
    ]
    if missing_assets:
        raise ValueError(
            "asset ledger is missing visuals used by the brief: "
            + ", ".join(missing_assets)
        )
    return records


def validate_interview_ledgers(
    source_ledger: str,
    asset_ledger: str,
    authoritative_sources: Iterable[str],
    publication_status: str,
    used_asset_paths: Iterable[str],
) -> None:
    validate_source_ledger(source_ledger, authoritative_sources, publication_status)
    validate_asset_ledger(asset_ledger, used_asset_paths)
