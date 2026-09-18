"""Validated adapters for repository-owned recruiting PDF builders."""

from __future__ import annotations

import html
import json
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import HRFlowable, Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


REPO_ROOT = Path(__file__).resolve().parents[1]
INTERVIEW_ROOT = REPO_ROOT / "skills/recruiter/modules/interview-prep-material"
INTERVIEW_BUILDER = INTERVIEW_ROOT / "scripts/build_interview_prep_material.py"
INTERVIEW_VALIDATOR = INTERVIEW_ROOT / "scripts/validate_interview_prep_material.py"
TTTG_LOGO = REPO_ROOT / "skills/recruiter/modules/brandedresume/assets/tttg_logo.png"
MISSING_ANSWER = "Not discussed during the reference check."


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


def _answer(answers: dict[str, Any], key: str) -> str:
    value = answers.get(key)
    return str(value).strip() if value is not None and str(value).strip() else MISSING_ANSWER


def _build_reference_reportlab(data: dict[str, Any], pdf_path: Path) -> None:
    """Render the repository template's exact content without host converters."""
    styles = getSampleStyleSheet()
    body = ParagraphStyle("ReferenceBody", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.2, leading=12, spaceAfter=3)
    label = ParagraphStyle("ReferenceLabel", parent=body, fontName="Helvetica-Bold", spaceAfter=1)
    answer = ParagraphStyle("ReferenceAnswer", parent=body, leftIndent=9, spaceAfter=6)
    section = ParagraphStyle("ReferenceSection", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12, leading=14, spaceBefore=7, spaceAfter=3)
    title = ParagraphStyle("ReferenceTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=17, leading=20, alignment=0)
    footer = ParagraphStyle("ReferenceFooter", parent=body, fontSize=8, textColor=colors.HexColor("#555555"), alignment=TA_RIGHT)

    document = SimpleDocTemplate(
        str(pdf_path), pagesize=LETTER, rightMargin=0.55 * inch, leftMargin=0.55 * inch,
        topMargin=0.45 * inch, bottomMargin=0.5 * inch,
        title=f"{data['candidate']['full_name']} Reference Check",
        subject="Professional candidate reference check", author="Top Tier Talent Group",
    )
    logo = Image(str(TTTG_LOGO), width=1.55 * inch, height=0.565 * inch) if TTTG_LOGO.is_file() else Paragraph("Top Tier Talent Group", footer)
    story: list[Any] = [
        Table([[Paragraph("Professional Reference Check Form", title), logo]], colWidths=[4.95 * inch, 1.5 * inch], style=TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (1, 0), (1, 0), "RIGHT"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ])),
    ]

    def safe(value: Any) -> str:
        return html.escape(str(value), quote=False)

    def add_section(name: str) -> None:
        story.extend([Spacer(1, 2), Paragraph(safe(name), section), HRFlowable(width="100%", thickness=0.6, color=colors.black, spaceAfter=5)])

    def add_fields(rows: list[tuple[str, Any]]) -> None:
        story.append(Table(
            [[Paragraph(safe(name), label), Paragraph(safe(value), body)] for name, value in rows],
            colWidths=[1.65 * inch, 4.8 * inch], hAlign="LEFT",
            style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                              ("RIGHTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 1),
                              ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]),
        ))

    def add_question(question: str, response: str) -> None:
        story.append(KeepTogether([Paragraph(safe(question), label), Paragraph(safe(response), answer)]))

    candidate, reference, answers = data["candidate"], data["reference"], data["answers"]
    add_section("Candidate Information")
    add_fields([("Candidate Name:", candidate["full_name"]), ("Position Applied For:", candidate["position_applied_for"]), ("Client:", candidate["company_name"])])
    add_section("Reference Information")
    add_fields([("Reference Name:", reference["full_name"]), ("Job Title:", reference["job_title"]), ("Company:", reference["company_name"]), ("Professional Relationship:", reference["professional_relationship"])])

    sections = [
        ("General Questions", [("How long have you known the candidate?", "known_duration"), ("In what capacity did you work with the candidate?", "working_capacity")]),
        ("Performance and Skills", [("How would you describe the candidate's overall performance?", "overall_performance"), ("What were the candidate's main responsibilities?", "responsibilities")]),
        ("Problem-Solving and Adaptability", [("How did the candidate respond to change?", "adaptability"), ("How would you describe the candidate's problem-solving ability?", "problem_solving")]),
        ("Reliability and Work Ethic", [("How dependable was the candidate?", "dependability")]),
        ("Professionalism and Leadership Potential", [("How would you describe the candidate's leadership potential?", "leadership_potential")]),
        ("Overall Recommendation", [("Would you recommend the candidate?", "recommendation"), ("Would you rehire the candidate?", "rehire")]),
        ("Additional Comments", [("Is there anything else you would like to add?", "additional_comments")]),
    ]
    for name, questions in sections[:2]:
        add_section(name)
        for question, key in questions:
            add_question(question, _answer(answers, key))
    strengths = answers.get("strengths") if isinstance(answers.get("strengths"), list) else []
    strength_text = "<br/>".join(f"• {safe(item)}" for item in strengths[:5] if str(item).strip()) or safe(MISSING_ANSWER)
    story.append(KeepTogether([Paragraph("What were the candidate's main strengths?", label), Paragraph(strength_text, answer)]))
    for question, key in [("What area could the candidate improve?", "area_for_improvement"), ("How would you rate the candidate's performance?", "performance_rating")]:
        add_question(question, _answer(answers, key))
    add_section("Communication and Collaboration")
    for question, key in [("How would you describe the candidate's communication?", "communication"), ("How did the candidate interact with colleagues and leaders?", "interactions"), ("How did the candidate contribute to teamwork?", "teamwork")]:
        add_question(question, _answer(answers, key))
    for name, questions in sections[2:]:
        add_section(name)
        for question, key in questions:
            add_question(question, _answer(answers, key))
    add_section("Completion")
    add_fields([("Completed By:", data["completed_by"]), ("Date:", data["date"])])

    def page_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#555555"))
        canvas.drawCentredString(LETTER[0] / 2, 0.28 * inch, f"Top Tier Talent Group  |  Page {doc.page}")
        canvas.restoreState()

    document.build(story, onFirstPage=page_footer, onLaterPages=page_footer)


def build_reference_pdf(payload: Any, files_dir: str | Path, public_base: str = "", filename: str | None = None) -> dict[str, Any]:
    data = validate_reference_payload(payload)
    name = data["candidate"]["full_name"].strip()
    reference_name = data["reference"]["full_name"].strip()
    out_name = filename or f"{name} - Reference Check - {reference_name}.pdf"
    with tempfile.TemporaryDirectory(prefix="tttg-reference-") as temp:
        work = Path(temp)
        built = work / "reference.pdf"
        _build_reference_reportlab(data, built)
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
