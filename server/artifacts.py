"""Validated adapters for repository-owned recruiting PDF builders."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
INTERVIEW_ROOT = REPO_ROOT / "skills/recruiter/modules/interview-prep-material"
INTERVIEW_BUILDER = INTERVIEW_ROOT / "scripts/build_interview_prep_material.py"
INTERVIEW_VALIDATOR = INTERVIEW_ROOT / "scripts/validate_interview_prep_material.py"
REFERENCE_ROOT = REPO_ROOT / "skills/recruiter/modules/complete-reference-check"
REFERENCE_BUILDER = REFERENCE_ROOT / "scripts/build_reference_check.py"
INTERVIEW_SCRIPTS = INTERVIEW_ROOT / "scripts"
if str(INTERVIEW_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(INTERVIEW_SCRIPTS))

from ledger_contract import validate_interview_ledgers  # noqa: E402


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
    source_ledger = _text(outer.get("source_ledger"), "source_ledger")
    asset_ledger = _text(outer.get("asset_ledger"), "asset_ledger")
    used_assets = [
        _object(brief.get("cover"), "brief.cover").get("image"),
        _object(brief.get("role"), "brief.role").get("image"),
        _object(brief.get("context"), "brief.context").get("image"),
        *[
            _object(item, f"brief.decision.images.{index}").get("path")
            for index, item in enumerate(
                _object(brief.get("decision"), "brief.decision").get("images") or []
            )
        ],
    ]
    validate_interview_ledgers(
        source_ledger,
        asset_ledger,
        authorities,
        publication_status,
        [_text(path, "brief image path") for path in used_assets],
    )
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


def _soffice_command() -> str:
    configured = os.environ.get("SOFFICE", "").strip()
    bundled = Path.home() / ".cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/soffice"
    candidates = [configured, str(bundled), shutil.which("soffice"), shutil.which("libreoffice")]
    for candidate in candidates:
        if not candidate or not Path(candidate).is_file():
            continue
        probe = subprocess.run(
            [candidate, "--version"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if probe.returncode == 0:
            return candidate
    raise ValueError(
        "Canonical DOCX-to-PDF renderer is unavailable; the reference check was not built"
    )


def build_reference_pdf(payload: Any, files_dir: str | Path, public_base: str = "", filename: str | None = None) -> dict[str, Any]:
    data = validate_reference_payload(payload)
    name = data["candidate"]["full_name"].strip()
    reference_name = data["reference"]["full_name"].strip()
    out_name = filename or f"{name} - Reference Check - {reference_name}.pdf"
    with tempfile.TemporaryDirectory(prefix="tttg-reference-") as temp:
        work = Path(temp)
        input_path = work / "reference.json"
        docx_path = work / "reference.docx"
        built = work / "reference.pdf"
        input_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        _run([
            sys.executable,
            str(REFERENCE_BUILDER),
            "--input",
            str(input_path),
            "--output",
            str(docx_path),
        ])
        profile = work / "libreoffice-profile"
        _run([
            _soffice_command(),
            f"-env:UserInstallation={profile.resolve().as_uri()}",
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            str(work),
            str(docx_path),
        ])
        result = _store_pdf(built, Path(files_dir), out_name, public_base)
    result.update({
        "message": "Reference-check PDF built from the sanitized repository template. Inspect every page before use.",
        "builder": str(REFERENCE_BUILDER.relative_to(REPO_ROOT)),
        "template": "skills/recruiter/modules/complete-reference-check/assets/reference-check-template.docx",
    })
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
        asset_ledger = outer["asset_ledger"].strip()
        sources_path.write_text(source_ledger, encoding="utf-8")
        assets_path.write_text(asset_ledger, encoding="utf-8")
        args = [sys.executable, str(INTERVIEW_BUILDER), "--data", str(data_path), "--out", str(pdf_path), "--bounds", str(bounds_path)]
        if draft_only:
            args.append("--allow-draft")
        builder_output = _run(args)
        validator_output = _run([sys.executable, str(INTERVIEW_VALIDATOR), "--pdf", str(pdf_path), "--data", str(data_path), "--bounds", str(bounds_path), "--sources", str(sources_path), "--assets", str(assets_path)])
        result = _store_pdf(pdf_path, Path(files_dir), out_name, public_base)
    result.update({
        "release_ready": False,
        "provenance_validation": "structured_caller_evidence_only",
        "message": (
            "Interview-prep PDF built and automated checks passed. It is not release-ready until "
            "a human verifies the underlying source truth, permissions, and every rendered page."
        ),
        "builder_output": builder_output[-400:],
        "validator_output": validator_output[-800:],
    })
    return result
