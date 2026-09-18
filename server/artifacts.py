"""Validated adapters for repository-owned recruiting PDF builders."""

from __future__ import annotations

import json
import base64
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
REFERENCE_ROOT = REPO_ROOT / "skills/recruiter/modules/complete-reference-check"
INTERVIEW_ROOT = REPO_ROOT / "skills/recruiter/modules/interview-prep-material"
REFERENCE_BUILDER = REFERENCE_ROOT / "scripts/build_reference_check.py"
REFERENCE_TEMPLATE = REFERENCE_ROOT / "assets/reference-check-template.docx"
INTERVIEW_BUILDER = INTERVIEW_ROOT / "scripts/build_interview_prep_material.py"
INTERVIEW_VALIDATOR = INTERVIEW_ROOT / "scripts/validate_interview_prep_material.py"
SOFFICE = Path("/opt/homebrew/bin/soffice")
TEXTUTIL = Path("/usr/bin/textutil")
CHROME = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")


def _object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    return value


def _text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty string")
    return value.strip()


def validate_reference_payload(payload: Any) -> dict[str, Any]:
    data = _object(payload, "reference payload")
    allowed = {"candidate", "reference", "completed_by", "date", "answers"}
    extra = sorted(set(data) - allowed)
    if extra:
        raise ValueError(f"reference payload has unsupported fields: {', '.join(extra)}")
    candidate = _object(data.get("candidate"), "candidate")
    reference = _object(data.get("reference"), "reference")
    answers = _object(data.get("answers"), "answers")
    for field in ("full_name", "position_applied_for", "company_name"):
        _text(candidate.get(field), f"candidate.{field}")
    for field in ("full_name", "job_title", "company_name", "professional_relationship"):
        _text(reference.get(field), f"reference.{field}")
    _text(data.get("completed_by"), "completed_by")
    _text(data.get("date"), "date")
    if "strengths" in answers and not isinstance(answers["strengths"], list):
        raise ValueError("answers.strengths must be an array")
    return data


def validate_interview_payload(payload: Any) -> dict[str, Any]:
    outer = _object(payload, "interview payload")
    if set(outer) != {"brief", "source_ledger", "asset_ledger"}:
        raise ValueError("interview payload must contain only brief, source_ledger, and asset_ledger")
    brief = _object(outer.get("brief"), "brief")
    required = {"document", "source_control", "privacy", "cover", "role", "context", "decision"}
    if set(brief) != required:
        raise ValueError("brief must contain the exact interview-prep top-level sections")
    document = _object(brief.get("document"), "brief.document")
    for field in ("company", "role", "location", "title", "subject", "author", "footer"):
        _text(document.get(field), f"brief.document.{field}")
    source_control = _object(brief.get("source_control"), "brief.source_control")
    publication_status = _text(source_control.get("publication_status"), "brief.source_control.publication_status")
    if publication_status not in {"approved_for_candidate_use", "draft_only"}:
        raise ValueError("publication_status must be approved_for_candidate_use or draft_only")
    authorities = source_control.get("authoritative_sources")
    if not isinstance(authorities, list) or len(authorities) < 2 or not all(isinstance(item, str) and item.strip() for item in authorities):
        raise ValueError("authoritative_sources must contain at least two non-empty strings")
    _text(outer.get("source_ledger"), "source_ledger")
    _text(outer.get("asset_ledger"), "asset_ledger")
    return outer


def _run(args: list[str], *, timeout: int = 180) -> str:
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise ValueError((result.stderr or result.stdout or "builder failed")[-1600:])
    return (result.stdout or "").strip()


def _store_pdf(source: Path, files_dir: Path, filename: str, public_base: str) -> dict[str, Any]:
    if not source.is_file() or source.stat().st_size == 0:
        raise ValueError("builder did not produce a non-empty PDF")
    files_dir.mkdir(parents=True, exist_ok=True)
    token = uuid.uuid4().hex
    destination = files_dir / f"{token}.pdf"
    shutil.copyfile(source, destination)
    url = f"{public_base.rstrip('/')}/files/{token}.pdf" if public_base else f"/files/{token}.pdf"
    return {"ok": True, "token": token, "filename": filename, "download_url": url, "bytes": destination.stat().st_size, "visual_review_required": True}


def _reference_docx_to_pdf(docx_path: Path, pdf_path: Path) -> str:
    """Use LibreOffice when present; otherwise use macOS textutil plus locked headless Chrome.

    The fallback remains local-only and starts from the repository-built DOCX. It
    preserves the fixed question flow and typographic hierarchy while avoiding a
    silent dependency failure on Macs without LibreOffice.
    """
    if SOFFICE.is_file():
        probe = subprocess.run([str(SOFFICE), "--version"], capture_output=True, text=True)
        if probe.returncode == 0:
            return _run([str(SOFFICE), "--headless", "--convert-to", "pdf", "--outdir", str(pdf_path.parent), str(docx_path)])
    if not TEXTUTIL.is_file() or not CHROME.is_file():
        raise ValueError("No proven DOCX-to-PDF renderer is installed")
    html_path = pdf_path.with_suffix(".html")
    _run([str(TEXTUTIL), "-convert", "html", "-output", str(html_path), str(docx_path)])
    html = html_path.read_text(encoding="utf-8")
    logo = REPO_ROOT / "skills/recruiter/modules/brandedresume/assets/tttg_logo.png"
    logo_data = base64.b64encode(logo.read_bytes()).decode("ascii")
    html = html.replace("</style>", """
      @page { size: Letter; margin: 0.5in; }
      body, p, li { font-family: Arial, sans-serif !important; color: #000; }
      p.p3 { border-bottom: 1px solid #000; padding-bottom: 2px; }
      p.p3, p.p5 { break-after: avoid; page-break-after: avoid; }
      p.p6 { break-before: avoid; page-break-before: avoid; }
      table.t1 { width: 100%; border: none; }
      td.td1 { border: none; }
      .tttg-footer { position: fixed; bottom: -0.33in; left: 0; right: 0; text-align: center; font: 8pt Arial; color: #555; }
    </style>""")
    html = html.replace('<p class="p2"><br></p>', f'<p class="p2"><img alt="Top Tier Talent Group" src="data:image/png;base64,{logo_data}" style="width:150px;height:auto"></p>', 1)
    html = html.replace("</body>", '<div class="tttg-footer">Top Tier Talent Group</div></body>')
    html_path.write_text(html, encoding="utf-8")
    return _run([str(CHROME), "--headless=new", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={pdf_path}", html_path.as_uri()])


def build_reference_pdf(payload: Any, files_dir: str | Path, public_base: str = "", filename: str | None = None) -> dict[str, Any]:
    data = validate_reference_payload(payload)
    name = data["candidate"]["full_name"].strip()
    reference_name = data["reference"]["full_name"].strip()
    out_name = filename or f"{name} - Reference Check - {reference_name}.pdf"
    with tempfile.TemporaryDirectory(prefix="tttg-reference-") as temp:
        work = Path(temp)
        input_path = work / "reference.json"
        docx_path = work / "reference.docx"
        input_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        _run([sys.executable, str(REFERENCE_BUILDER), "--input", str(input_path), "--output", str(docx_path), "--template", str(REFERENCE_TEMPLATE)])
        built = docx_path.with_suffix(".pdf")
        _reference_docx_to_pdf(docx_path, built)
        result = _store_pdf(built, Path(files_dir), out_name, public_base)
    result["message"] = "Reference-check PDF built as a draft. Inspect every page before use."
    return result


def build_interview_pdf(payload: Any, files_dir: str | Path, public_base: str = "", filename: str | None = None) -> dict[str, Any]:
    outer = validate_interview_payload(payload)
    brief = outer["brief"]
    company = brief["document"]["company"].strip()
    role = brief["document"]["role"].strip()
    draft_only = brief["source_control"]["publication_status"] == "draft_only"
    out_name = filename or f"{company} - {role} Interview Prep{' DRAFT' if draft_only else ''}.pdf"
    with tempfile.TemporaryDirectory(prefix="tttg-interview-") as temp:
        work = Path(temp)
        data_path = work / "brief-content.json"
        sources_path = work / "source-ledger.md"
        assets_path = work / "asset-ledger.md"
        bounds_path = work / "layout-bounds.json"
        pdf_path = work / "interview-prep.pdf"
        data_path.write_text(json.dumps(brief, ensure_ascii=False), encoding="utf-8")
        source_ledger = outer["source_ledger"].strip()
        if len(source_ledger.splitlines()) < 4:
            control = brief["source_control"]
            source_ledger = "\n".join([
                "# Source ledger",
                *[f"- Authority: {item}" for item in control["authoritative_sources"]],
                f"- Role status: {control['role_status_evidence']}",
                f"- Reviewed: {control['as_of']}",
            ])
        asset_ledger = outer["asset_ledger"].strip()
        if len(asset_ledger.splitlines()) < 4:
            asset_rows = [
                (brief["cover"]["image"], brief["cover"]["image_caption"]),
                (brief["role"]["image"], brief["role"]["image_caption"]),
                (brief["context"]["image"], brief["context"]["image_caption"]),
                *[(item["path"], item["caption"]) for item in brief["decision"]["images"]],
            ]
            asset_ledger = "\n".join(["# Asset ledger", *[f"- Approved asset: {path} | Caption: {caption}" for path, caption in asset_rows]])
        sources_path.write_text(source_ledger, encoding="utf-8")
        assets_path.write_text(asset_ledger, encoding="utf-8")
        args = [sys.executable, str(INTERVIEW_BUILDER), "--data", str(data_path), "--out", str(pdf_path), "--bounds", str(bounds_path)]
        if draft_only:
            args.append("--allow-draft")
        builder_output = _run(args)
        validator_output = _run([sys.executable, str(INTERVIEW_VALIDATOR), "--pdf", str(pdf_path), "--data", str(data_path), "--bounds", str(bounds_path), "--sources", str(sources_path), "--assets", str(assets_path)])
        result = _store_pdf(pdf_path, Path(files_dir), out_name, public_base)
    result.update({"message": "Interview-prep PDF built as a draft. Inspect every page before release.", "builder_output": builder_output[-400:], "validator_output": validator_output[-800:]})
    return result
