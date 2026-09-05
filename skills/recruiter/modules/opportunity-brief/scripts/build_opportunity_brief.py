#!/usr/bin/env python3
"""Build a four-page, role-specific candidate opportunity brief."""

from __future__ import annotations

import argparse
from io import BytesIO
import json
from pathlib import Path
import re
from typing import Any

from PIL import Image
from pypdf import PdfReader
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


PAGE_W, PAGE_H, MARGIN = 612, 792, 42
CONTENT_W = PAGE_W - (2 * MARGIN)
MODULE_DIR = Path(__file__).resolve().parents[1]
DEFAULT_LOGO = MODULE_DIR.parent / "brandedresume" / "assets" / "tttg_logo.png"
ALLOWED_STATUS = {"approved_for_candidate_use", "draft_only"}
DEFAULT_COLORS = {
    "primary_color": "#B72B37",
    "ink_color": "#202326",
    "muted_color": "#5F666B",
    "light_color": "#F3F3F0",
    "line_color": "#DBDEDF",
}


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--bounds", required=True, type=Path)
    parser.add_argument("--logo", type=Path)
    parser.add_argument("--allow-draft", action="store_true")
    return parser.parse_args()


def plain(value: str) -> str:
    return re.sub(r"<[^>]+>", "", value).replace("&amp;", "&")


def strings(value: Any, key: str = ""):
    if isinstance(value, str):
        yield key, value
    elif isinstance(value, dict):
        for child_key, child in value.items():
            yield from strings(child, child_key)
    elif isinstance(value, list):
        for child in value:
            yield from strings(child, key)


def required_text(obj: dict[str, Any], key: str, label: str) -> str:
    value = obj.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label}.{key} must be a non-empty string")
    return value.strip()


def exact_objects(obj: dict[str, Any], key: str, count: int, label: str) -> list[dict[str, Any]]:
    value = obj.get(key)
    if not isinstance(value, list) or len(value) != count or not all(isinstance(item, dict) for item in value):
        raise ValueError(f"{label}.{key} must contain exactly {count} objects")
    return value


def validate_contract(data: dict[str, Any], allow_draft: bool) -> None:
    for section in ["document", "source_control", "privacy", "cover", "role", "context", "decision"]:
        if not isinstance(data.get(section), dict):
            raise ValueError(f"missing object: {section}")

    document = data["document"]
    for key in ["company", "role", "location", "title", "subject", "author", "footer"]:
        required_text(document, key, "document")
    for key in DEFAULT_COLORS:
        value = document.get(key, DEFAULT_COLORS[key])
        if not isinstance(value, str) or not re.fullmatch(r"#[0-9A-Fa-f]{6}", value):
            raise ValueError(f"document.{key} must be a six-digit hex colour")

    source = data["source_control"]
    as_of = required_text(source, "as_of", "source_control")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", as_of):
        raise ValueError("source_control.as_of must use YYYY-MM-DD")
    status = required_text(source, "publication_status", "source_control")
    if status not in ALLOWED_STATUS:
        raise ValueError(f"source_control.publication_status must be one of {sorted(ALLOWED_STATUS)}")
    if status == "draft_only" and not allow_draft:
        raise ValueError("draft_only content requires --allow-draft")
    required_text(source, "role_status_evidence", "source_control")
    authorities = source.get("authoritative_sources")
    if not isinstance(authorities, list) or len(authorities) < 2 or not all(isinstance(item, str) and item.strip() for item in authorities):
        raise ValueError("source_control.authoritative_sources must contain at least two source identifiers")

    banned = data["privacy"].get("banned_terms")
    if not isinstance(banned, list) or not all(isinstance(item, str) and item.strip() for item in banned):
        raise ValueError("privacy.banned_terms must be an array of non-empty strings")

    page_fields = {
        "cover": ["eyebrow", "headline", "deck", "image", "image_caption"],
        "role": ["eyebrow", "headline", "intro", "image", "image_caption", "note"],
        "context": ["eyebrow", "headline", "intro", "image", "image_caption", "note_title", "note_body"],
        "decision": ["eyebrow", "headline", "intro", "cta_title", "cta_body"],
    }
    for page, fields in page_fields.items():
        for key in fields:
            required_text(data[page], key, page)

    for item in exact_objects(data["cover"], "sections", 2, "cover"):
        required_text(item, "title", "cover.sections")
        required_text(item, "body", "cover.sections")
    for item in exact_objects(data["role"], "at_a_glance", 3, "role"):
        required_text(item, "label", "role.at_a_glance")
        required_text(item, "value", "role.at_a_glance")
    for item in exact_objects(data["role"], "cards", 4, "role"):
        required_text(item, "title", "role.cards")
        required_text(item, "body", "role.cards")
    for item in exact_objects(data["context"], "columns", 2, "context"):
        required_text(item, "title", "context.columns")
        required_text(item, "body", "context.columns")
    for item in exact_objects(data["decision"], "images", 2, "decision"):
        required_text(item, "path", "decision.images")
        required_text(item, "caption", "decision.images")
    for item in exact_objects(data["decision"], "sections", 2, "decision"):
        required_text(item, "title", "decision.sections")
        required_text(item, "body", "decision.sections")

    for key, value in strings(data):
        visible = re.sub(r"https?://[^\s\"']+", "", plain(value))
        if "\u2014" in visible or "\u2013" in visible or "--" in visible:
            raise ValueError(f"prohibited dash punctuation in field {key}")
        if re.search(r"\[(?:confirm|insert|todo|tbd)[^\]]*\]", visible, re.I):
            raise ValueError(f"unresolved placeholder in field {key}")


class BriefBuilder:
    def __init__(self, data: dict[str, Any], data_path: Path, out: Path, bounds_path: Path, logo: Path):
        self.data = data
        self.data_path = data_path.resolve()
        self.out = out.resolve()
        self.bounds_path = bounds_path.resolve()
        self.logo = logo.resolve()
        self.doc = data["document"]
        self.colors = {key: self.doc.get(key, value) for key, value in DEFAULT_COLORS.items()}
        self.bounds: list[dict[str, Any]] = []
        self.fonts = self.register_fonts()
        self.out.parent.mkdir(parents=True, exist_ok=True)
        self.bounds_path.parent.mkdir(parents=True, exist_ok=True)
        self.canvas = canvas.Canvas(str(self.out), pagesize=(PAGE_W, PAGE_H), pageCompression=1)
        self.canvas.setTitle(self.doc["title"])
        self.canvas.setAuthor(self.doc["author"])
        self.canvas.setSubject(self.doc["subject"])
        self.canvas.setCreator("Top Tier Talent Group opportunity brief builder")

    @staticmethod
    def register_fonts() -> dict[str, str]:
        roots = [Path("/System/Library/Fonts/Supplemental"), Path("/Library/Fonts"), Path("C:/Windows/Fonts")]
        candidates = [
            ("Arial.ttf", "Arial Bold.ttf", "Arial Italic.ttf"),
            ("arial.ttf", "arialbd.ttf", "ariali.ttf"),
        ]
        for root in roots:
            for normal, bold, italic in candidates:
                paths = [root / normal, root / bold, root / italic]
                if all(path.is_file() for path in paths):
                    pdfmetrics.registerFont(TTFont("BriefBody", str(paths[0])))
                    pdfmetrics.registerFont(TTFont("BriefBold", str(paths[1])))
                    pdfmetrics.registerFont(TTFont("BriefItalic", str(paths[2])))
                    pdfmetrics.registerFontFamily("BriefBody", normal="BriefBody", bold="BriefBold", italic="BriefItalic", boldItalic="BriefBold")
                    return {"body": "BriefBody", "bold": "BriefBold", "italic": "BriefItalic"}
        return {"body": "Helvetica", "bold": "Helvetica-Bold", "italic": "Helvetica-Oblique"}

    def asset(self, value: str) -> Path:
        path = Path(value).expanduser()
        if not path.is_absolute():
            path = self.data_path.parent / path
        path = path.resolve()
        if not path.is_file():
            raise FileNotFoundError(f"missing image: {path}")
        return path

    def paragraph(self, text: str, x: float, top: float, width: float = CONTENT_W, size: float = 10.3,
                  leading: float | None = None, color: str | None = None, bold: bool = False,
                  safe_bottom: float = 54) -> float:
        style = ParagraphStyle(
            "brief",
            fontName=self.fonts["bold"] if bold else self.fonts["body"],
            fontSize=size,
            leading=leading or size * 1.38,
            textColor=HexColor(color or self.colors["ink_color"]),
            allowWidows=0,
            allowOrphans=0,
        )
        block = Paragraph(text, style)
        _, height = block.wrap(width, 2000)
        bottom = top - height
        if bottom < safe_bottom:
            raise ValueError(f"content overflows page {self.canvas.getPageNumber()}: {plain(text)[:80]}")
        block.drawOn(self.canvas, x, bottom)
        self.bounds.append({
            "page": self.canvas.getPageNumber(), "x": x, "top": top, "bottom": bottom,
            "width": width, "text": plain(text),
        })
        return bottom

    def rule(self, y: float, x: float = MARGIN, width: float = CONTENT_W) -> None:
        self.canvas.setStrokeColor(HexColor(self.colors["line_color"]))
        self.canvas.setLineWidth(0.6)
        self.canvas.line(x, y, x + width, y)

    def draft_watermark(self) -> None:
        if self.data["source_control"]["publication_status"] != "draft_only":
            return
        self.canvas.saveState()
        self.canvas.setFillColor(HexColor("#E2B8BC"))
        self.canvas.setFillAlpha(0.28)
        self.canvas.translate(PAGE_W / 2, PAGE_H / 2)
        self.canvas.rotate(33)
        self.canvas.setFont(self.fonts["bold"], 31)
        self.canvas.drawCentredString(0, 0, "INTERNAL DRAFT, ROLE STATUS UNCONFIRMED")
        self.canvas.restoreState()

    def header(self, number: int, eyebrow: str) -> None:
        self.draft_watermark()
        logo_image = Image.open(self.logo)
        logo_w = 131
        logo_h = logo_w * logo_image.height / logo_image.width
        self.canvas.drawImage(str(self.logo), MARGIN, 737, width=logo_w, height=logo_h, mask="auto")
        self.canvas.setFillColor(HexColor(self.colors["primary_color"]))
        self.canvas.setFont(self.fonts["bold"], 10)
        self.canvas.drawRightString(PAGE_W - MARGIN, 756, self.doc["company"].upper())
        self.canvas.setFillColor(HexColor(self.colors["muted_color"]))
        self.canvas.setFont(self.fonts["body"], 7.7)
        self.canvas.drawRightString(PAGE_W - MARGIN, 743, self.doc["location"].upper())
        self.rule(725)
        self.rule(42)
        self.canvas.setFillColor(HexColor(self.colors["muted_color"]))
        self.canvas.setFont(self.fonts["body"], 7)
        self.canvas.drawString(MARGIN, 28, self.doc["footer"].upper())
        self.canvas.drawRightString(PAGE_W - MARGIN, 28, f"{number:02d} / 04")
        self.paragraph(eyebrow.upper(), MARGIN, 708, size=8.1, leading=10, color=self.colors["primary_color"], bold=True)

    def title(self, text: str, top: float = 684, size: float = 29) -> float:
        return self.paragraph(text, MARGIN, top, size=size, leading=size * 1.1, bold=True)

    def photo(self, path_value: str, x: float, top: float, width: float, height: float,
              fit: bool = False, background: str | None = None, crop_focus: float = 0.5) -> None:
        image = Image.open(self.asset(path_value)).convert("RGB")
        image.thumbnail((2200, 2200), Image.Resampling.LANCZOS)
        encoded = BytesIO()
        image.save(encoded, format="JPEG", quality=91, optimize=True)
        encoded.seek(0)
        reader = ImageReader(encoded)
        image_w, image_h = reader.getSize()
        if background:
            self.canvas.setFillColor(HexColor(background))
            self.canvas.rect(x, top - height, width, height, fill=1, stroke=0)
        scale = min(width / image_w, height / image_h) if fit else max(width / image_w, height / image_h)
        draw_w, draw_h = image_w * scale, image_h * scale
        self.canvas.saveState()
        clip = self.canvas.beginPath()
        clip.rect(x, top - height, width, height)
        self.canvas.clipPath(clip, stroke=0, fill=0)
        self.canvas.drawImage(reader, x + ((width - draw_w) / 2), top - height + ((height - draw_h) * (1 - crop_focus)), width=draw_w, height=draw_h)
        self.canvas.restoreState()

    def caption(self, text: str, x: float, top: float, width: float = CONTENT_W) -> float:
        return self.paragraph(text, x, top, width, size=7.2, leading=9.5, color=self.colors["muted_color"])

    def section(self, title: str, body: str, x: float, top: float, width: float = CONTENT_W, safe_bottom: float = 54) -> float:
        y = self.paragraph(title, x, top, width, size=13, leading=16, bold=True, safe_bottom=safe_bottom)
        y = self.paragraph(body, x, y - 7, width, size=10.3, leading=14.2, safe_bottom=safe_bottom)
        return y - 15

    def card(self, item: dict[str, Any], x: float, top: float, width: float, height: float) -> None:
        self.canvas.setFillColor(HexColor(self.colors["light_color"]))
        self.canvas.rect(x, top - height, width, height, stroke=0, fill=1)
        self.canvas.setFillColor(HexColor(self.colors["primary_color"]))
        self.canvas.rect(x, top - 3, 34, 3, stroke=0, fill=1)
        y = self.paragraph(item["title"], x + 13, top - 15, width - 26, size=11.7, leading=14, bold=True, safe_bottom=top - height)
        y = self.paragraph(item["body"], x + 13, y - 8, width - 26, size=9.6, leading=12.9, safe_bottom=top - height + 9)
        if y < top - height + 9:
            raise ValueError(f"card overflow: {item['title']}")

    def page_cover(self) -> None:
        page = self.data["cover"]
        self.header(1, page["eyebrow"])
        y = self.title(page["headline"])
        y = self.paragraph(page["deck"], MARGIN, y - 10, size=11.1, leading=15.6, color=self.colors["muted_color"])
        image_top = y - 18
        self.photo(page["image"], MARGIN, image_top, CONTENT_W, 244)
        self.caption(page["image_caption"], MARGIN, image_top - 249)
        y = image_top - 275
        for item in page["sections"]:
            y = self.section(item["title"], item["body"], MARGIN, y)
        self.canvas.showPage()

    def page_role(self) -> None:
        page = self.data["role"]
        self.header(2, page["eyebrow"])
        y = self.title(page["headline"])
        y = self.paragraph(page["intro"], MARGIN, y - 10, size=10.7, leading=15, color=self.colors["muted_color"])
        image_top = y - 15
        self.photo(page["image"], MARGIN, image_top, 288, 156, fit=True, background=self.colors["light_color"])
        right_x = MARGIN + 311
        glance_y = image_top - 3
        for item in page["at_a_glance"]:
            glance_y = self.paragraph(item["label"].upper(), right_x, glance_y, 217, size=7.4, leading=9, color=self.colors["primary_color"], bold=True)
            glance_y = self.paragraph(item["value"], right_x, glance_y - 3, 217, size=10.4, leading=13.5, bold=True)
            glance_y -= 12
        self.caption(page["image_caption"], MARGIN, image_top - 162, 288)
        cards_top = image_top - 190
        gap = 16
        card_w = (CONTENT_W - gap) / 2
        card_h = 127
        for index, item in enumerate(page["cards"]):
            self.card(item, MARGIN + (index % 2) * (card_w + gap), cards_top - (index // 2) * (card_h + 13), card_w, card_h)
        note_top = cards_top - (2 * card_h + 13) - 10
        self.caption(page["note"], MARGIN, note_top)
        self.canvas.showPage()

    def page_context(self) -> None:
        page = self.data["context"]
        self.header(3, page["eyebrow"])
        y = self.title(page["headline"])
        y = self.paragraph(page["intro"], MARGIN, y - 10, size=10.8, leading=15.2, color=self.colors["muted_color"])
        image_top = y - 17
        self.photo(page["image"], MARGIN, image_top, CONTENT_W, 230, fit=True, background=self.colors["light_color"])
        y = self.caption(page["image_caption"], MARGIN, image_top - 236) - 18
        column_w = (CONTENT_W - 24) / 2
        bottoms = []
        for index, item in enumerate(page["columns"]):
            bottoms.append(self.section(item["title"], item["body"], MARGIN + index * (column_w + 24), y, column_w))
        y = min(bottoms) - 4
        self.section(page["note_title"], page["note_body"], MARGIN, y)
        self.canvas.showPage()

    def page_decision(self) -> None:
        page = self.data["decision"]
        self.header(4, page["eyebrow"])
        y = self.title(page["headline"])
        y = self.paragraph(page["intro"], MARGIN, y - 10, size=10.8, leading=15.2, color=self.colors["muted_color"])
        images_top = y - 17
        panel_w = (CONTENT_W - 12) / 2
        for index, item in enumerate(page["images"]):
            self.photo(item["path"], MARGIN + index * (panel_w + 12), images_top, panel_w, 196)
        caption_bottoms = []
        for index, item in enumerate(page["images"]):
            caption_bottoms.append(self.caption(item["caption"], MARGIN + index * (panel_w + 12), images_top - 202, panel_w))
        y = min(caption_bottoms) - 20
        for item in page["sections"]:
            y = self.section(item["title"], item["body"], MARGIN, y, safe_bottom=145)
        if y < 145:
            raise ValueError("decision page sections collide with the call-to-action panel")
        self.canvas.setFillColor(HexColor(self.colors["ink_color"]))
        self.canvas.rect(MARGIN, 66, CONTENT_W, 72, stroke=0, fill=1)
        self.paragraph(page["cta_title"], MARGIN + 16, 122, CONTENT_W - 32, size=14.4, leading=18, color="#FFFFFF", bold=True, safe_bottom=67)
        self.paragraph(page["cta_body"], MARGIN + 16, 97, CONTENT_W - 32, size=10, leading=14, color="#FFFFFF", safe_bottom=67)
        self.canvas.showPage()

    def build(self) -> dict[str, Any]:
        self.page_cover()
        self.page_role()
        self.page_context()
        self.page_decision()
        self.canvas.save()
        self.bounds_path.write_text(json.dumps(self.bounds, indent=2), encoding="utf-8")
        reader = PdfReader(str(self.out))
        extracted = "\n".join(page.extract_text() or "" for page in reader.pages)
        if len(reader.pages) != 4:
            raise AssertionError("builder did not produce four pages")
        for term in self.data["privacy"]["banned_terms"]:
            if term.casefold() in extracted.casefold():
                raise ValueError(f"banned term found in rendered PDF: {term}")
        return {
            "path": str(self.out),
            "bounds": str(self.bounds_path),
            "pages": len(reader.pages),
            "words": len(re.findall(r"\b[\w-]+\b", extracted)),
            "bytes": self.out.stat().st_size,
            "publication_status": self.data["source_control"]["publication_status"],
            "candidate_specific_information": "not supplied to the builder",
        }


def main() -> None:
    args = arguments()
    data_path = args.data.expanduser().resolve()
    data = json.loads(data_path.read_text(encoding="utf-8"))
    validate_contract(data, args.allow_draft)
    logo = (args.logo or DEFAULT_LOGO).expanduser().resolve()
    if not logo.is_file():
        raise FileNotFoundError(f"missing logo: {logo}")
    result = BriefBuilder(data, data_path, args.out, args.bounds, logo).build()
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
