#!/usr/bin/env python3
"""Validate finished role-specific candidate interview prep material."""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
from pathlib import Path
import re
from typing import Any

from pypdf import PdfReader


PLACEHOLDERS = ["lorem ipsum", "placeholder", "[confirm", "[insert", "todo", "tbd"]


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", required=True, type=Path)
    parser.add_argument("--data", required=True, type=Path)
    parser.add_argument("--bounds", required=True, type=Path)
    parser.add_argument("--sources", required=True, type=Path)
    parser.add_argument("--assets", required=True, type=Path)
    return parser.parse_args()


def require_file(path: Path, label: str) -> Path:
    resolved = path.expanduser().resolve()
    if not resolved.is_file() or resolved.stat().st_size == 0:
        raise ValueError(f"{label} must exist and be non-empty: {resolved}")
    return resolved


def overlap(first: dict[str, Any], second: dict[str, Any]) -> bool:
    if first["page"] != second["page"]:
        return False
    horizontal = min(first["x"] + first["width"], second["x"] + second["width"]) - max(first["x"], second["x"])
    vertical = min(first["top"], second["top"]) - max(first["bottom"], second["bottom"])
    return horizontal > 1 and vertical > 1


def main() -> None:
    args = arguments()
    pdf_path = require_file(args.pdf, "PDF")
    data_path = require_file(args.data, "content JSON")
    bounds_path = require_file(args.bounds, "layout bounds")
    sources_path = require_file(args.sources, "source ledger")
    assets_path = require_file(args.assets, "asset ledger")

    data = json.loads(data_path.read_text(encoding="utf-8"))
    bounds = json.loads(bounds_path.read_text(encoding="utf-8"))
    if not isinstance(bounds, list) or not bounds:
        raise ValueError("layout bounds must contain text block records")

    reader = PdfReader(str(pdf_path))
    if reader.is_encrypted:
        raise ValueError("PDF must not be encrypted")
    if len(reader.pages) != 4:
        raise ValueError(f"expected four pages, found {len(reader.pages)}")
    if reader.attachments:
        raise ValueError("PDF must not contain attachments")
    if reader.get_fields():
        raise ValueError("PDF must not contain form fields")

    extracted = "\n".join(page.extract_text() or "" for page in reader.pages)
    folded = extracted.casefold()
    document = data["document"]
    for key in ["company", "role", "location"]:
        value = document[key].strip()
        if value.casefold() not in folded:
            raise ValueError(f"rendered PDF is missing document.{key}: {value}")
    if (reader.metadata.title or "") != document["title"]:
        raise ValueError("PDF title metadata does not match document.title")
    if (reader.metadata.author or "") != document["author"]:
        raise ValueError("PDF author metadata does not match document.author")

    for term in [*PLACEHOLDERS, *data["privacy"].get("banned_terms", [])]:
        if term.casefold() in folded:
            raise ValueError(f"prohibited or banned term found in PDF: {term}")
    if "\u2014" in extracted or "\u2013" in extracted or "--" in extracted:
        raise ValueError("PDF contains prohibited dash punctuation")
    if re.search(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", extracted, re.I):
        raise ValueError("candidate-facing brief must not contain email addresses")
    if re.search(r"(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}", extracted):
        raise ValueError("candidate-facing brief must not contain phone numbers")

    words = len(re.findall(r"\b[\w-]+\b", extracted))
    if not 450 <= words <= 900:
        raise ValueError(f"extracted word count {words} is outside the 450 to 900 release range")

    conflicts = []
    for first, second in itertools.combinations(bounds, 2):
        if overlap(first, second):
            conflicts.append((first["page"], first.get("text", "")[:60], second.get("text", "")[:60]))
    if conflicts:
        raise ValueError(f"text block overlap detected: {conflicts[:5]}")

    status = data["source_control"]["publication_status"]
    has_draft_mark = "internal draft, role status unconfirmed" in folded
    if status == "draft_only" and not has_draft_mark:
        raise ValueError("draft-only PDF is missing the visible draft watermark")
    if status == "approved_for_candidate_use" and has_draft_mark:
        raise ValueError("approved PDF contains a draft watermark")

    source_text = sources_path.read_text(encoding="utf-8")
    asset_text = assets_path.read_text(encoding="utf-8")
    if len(source_text.splitlines()) < 4:
        raise ValueError("source ledger is too short to document claim provenance")
    if len(asset_text.splitlines()) < 4:
        raise ValueError("asset ledger is too short to document visual provenance")

    annotations = 0
    for page in reader.pages:
        annotations += len(page.get("/Annots", []))

    print(json.dumps({
        "pdf": str(pdf_path),
        "sha256": hashlib.sha256(pdf_path.read_bytes()).hexdigest(),
        "pages": len(reader.pages),
        "words": words,
        "bytes": pdf_path.stat().st_size,
        "text_blocks": len(bounds),
        "text_overlaps": 0,
        "link_annotations": annotations,
        "attachments": 0,
        "form_fields": 0,
        "publication_status": status,
        "source_ledger": str(sources_path),
        "asset_ledger": str(assets_path),
        "manual_visual_review": "required separately on all four final rendered pages",
    }, indent=2))


if __name__ == "__main__":
    main()
