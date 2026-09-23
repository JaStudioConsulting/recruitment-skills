#!/usr/bin/env python3
"""
TTTG Resume Builder — generates a finished, downloadable PDF in the Top Tier
Talent Group format (centered logo, Arial/Helvetica, black text, two-column
skills, right-flush dates/locations). This is the deliverable Ja wants: the
actual PDF, not code to run elsewhere.

Two rendering engines, picked automatically:
  - chrome     : headless Chrome/Chromium renders HTML -> PDF (best fidelity).
  - reportlab  : pure-Python PDF (no browser needed). Works on cloud machines
                 like Cowork that have no Chrome and no display.
Default is "auto": use Chrome if present, otherwise reportlab. Override with
--engine chrome|reportlab.

Usage:
    python3 build_resume.py --data candidate.json --out "Name - Top Tier Talent Group.pdf"

candidate.json schema:
{
  "name": "Full Name",
  "headline": "One single title under the name",
  "summary": "2-4 sentence summary",
  "skills": ["...", "..."],            # EVEN number
  "experience": [
    {"title": "...", "dates": "Mmm-YYYY - Mmm-YYYY", "company": "...",
     "location": "City, ST, Country", "bullets": ["...", "..."]}
  ],
  "education": ["...", "..."],            # optional
  "education_heading": "Education & Certifications",  # optional, override the label
  "sections": [                           # optional, ANY extra resume section
    {"heading": "Certifications", "items": ["...", "..."]},
    {"heading": "Additional Information", "items": ["...", "..."]}
  ]
}

Preserve everything: the four core fields cover a common resume. Put ANY other
section the original resume has (Certifications on its own, Licenses, Professional
Development, Additional Information, Awards, Languages, Affiliations, Volunteer,
Projects, Publications) into "sections" with its original heading and lines. The
builder renders them in order after Education. Never merge sections together or
drop lines unless the user says to.

Emphasis: wrap text in **double asterisks** inside experience bullets, education
entries, and section items to render it bold (for example "downtime **22%**" or
"**433A Millwright License**"). Bold only the proof point or the credential,
never the whole line. Both engines render it. Text without ** is unchanged.

House rules enforced here (so a client never sees a slip):
  - NO em dashes, en dashes, double hyphens, semicolons, tildes, or whitespace
    around slashes anywhere in the text. The script aborts and lists the
    offending fields so the text gets fixed, not silently mangled. Regular
    hyphens in compound words (cost-reduction), slash-separated text without
    spaces (CNC/manual), and the date format (Dec-2025 - Present) are fine.
  - NO compensation information anywhere in the rendered resume.
  - Logo centered at the top; exactly one title line under the name.
  - No hyperlinks are ever added.
"""
import argparse, base64, html, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_LOGO = os.path.join(HERE, "..", "assets", "tttg_logo.png")

CHROME_CANDIDATES = [
    # macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    # Linux
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    # Windows
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]

def find_chrome():
    for c in CHROME_CANDIDATES:
        if os.path.exists(c):
            return c
    from shutil import which
    for n in ("google-chrome", "google-chrome-stable", "chromium",
              "chromium-browser", "chrome", "msedge"):
        p = which(n)
        if p:
            return p
    return None

BANNED = {
    "—": "em dash (—)",
    "–": "en dash (–)",
    "--": "double hyphen (--)",
    ";": "semicolon (;)",
    "~": "tilde (~)",
}
COMPENSATION = re.compile(
    r"\b(?:compensation|salary|wages?|hourly\s+(?:pay\s+)?rate|pay\s+rate|"
    r"base\s+pay|current\s+pay|currently\s+earns?|currently\s+earning|earnings?)\b",
    re.I,
)

def check_forbidden_content(data):
    offenders = []
    def scan(label, text):
        if not isinstance(text, str):
            return
        for ch, nm in BANNED.items():
            if ch in text:
                offenders.append(f"  {label}: contains {nm} -> {text[:70]!r}")
        if re.search(r"\s/|/\s", text):
            offenders.append(f"  {label}: contains whitespace around slash (/) -> {text[:70]!r}")
        if COMPENSATION.search(text):
            offenders.append(f"  {label}: contains compensation information -> {text[:70]!r}")
    scan("name", data.get("name", ""))
    scan("headline", data.get("headline", ""))
    scan("summary", data.get("summary", ""))
    for i, s in enumerate(data.get("skills", [])):
        scan(f"skills[{i}]", s)
    for i, j in enumerate(data.get("experience", [])):
        for k in ("title", "dates", "company", "location"):
            scan(f"experience[{i}].{k}", j.get(k, ""))
        for b, bt in enumerate(j.get("bullets", [])):
            scan(f"experience[{i}].bullets[{b}]", bt)
    for i, e in enumerate(data.get("education", [])):
        scan(f"education[{i}]", e)
    scan("education_heading", data.get("education_heading", ""))
    for i, sec in enumerate(data.get("sections", [])):
        scan(f"sections[{i}].heading", sec.get("heading", ""))
        for j, it in enumerate(sec.get("items", [])):
            scan(f"sections[{i}].items[{j}]", it)
    return offenders

def check_required_structure(data):
    problems = []
    for field, label in (
        ("name", "candidate name"),
        ("headline", "one exact current title"),
        ("summary", "profile summary"),
    ):
        if not isinstance(data.get(field), str) or not data[field].strip():
            problems.append(f"  {field}: missing {label}")
    skills = data.get("skills")
    if not isinstance(skills, list) or not any(isinstance(item, str) and item.strip() for item in skills):
        problems.append("  skills: requires an even, nonzero Core Skills list")
    experience = data.get("experience")
    if not isinstance(experience, list) or not experience:
        problems.append("  experience: requires at least one Professional Experience entry")
    else:
        for index, job in enumerate(experience):
            if not isinstance(job, dict):
                problems.append(f"  experience[{index}]: must be an object")
                continue
            for field in ("title", "company", "location", "dates"):
                if not isinstance(job.get(field), str) or not job[field].strip():
                    problems.append(f"  experience[{index}].{field}: missing")
            bullets = job.get("bullets")
            if not isinstance(bullets, list) or not any(isinstance(item, str) and item.strip() for item in bullets):
                problems.append(f"  experience[{index}].bullets: requires source-backed content")
    education = data.get("education")
    if not isinstance(education, list) or not any(isinstance(item, str) and item.strip() for item in education):
        problems.append("  education: requires Education & Certifications content")
    return problems

def check_placeholders(data):
    """A finished resume must never show a fill-in marker to a client. If any field
    still holds a [confirm ...] / [TBD] / [xxx] style placeholder, abort so Claude
    resolves it first (ask the user, or leave the field blank if they say none)."""
    import re
    pat = re.compile(r"\[(confirm|tbd|todo|xxx|placeholder|insert|add)\b", re.I)
    offenders = []
    def scan(label, text):
        if isinstance(text, str) and pat.search(text):
            offenders.append(f"  {label}: still has a placeholder -> {text[:70]!r}")
    scan("name", data.get("name", "")); scan("headline", data.get("headline", ""))
    scan("summary", data.get("summary", ""))
    for i, s in enumerate(data.get("skills", [])):
        scan(f"skills[{i}]", s)
    for i, j in enumerate(data.get("experience", [])):
        for k in ("title", "dates", "company", "location"):
            scan(f"experience[{i}].{k}", j.get(k, ""))
        for b, bt in enumerate(j.get("bullets", [])):
            scan(f"experience[{i}].bullets[{b}]", bt)
    for i, e in enumerate(data.get("education", [])):
        scan(f"education[{i}]", e)
    for i, sec in enumerate(data.get("sections", [])):
        scan(f"sections[{i}].heading", sec.get("heading", ""))
        for j, it in enumerate(sec.get("items", [])):
            scan(f"sections[{i}].items[{j}]", it)
    return offenders

# ---------------------------------------------------------------- Chrome engine
def esc(s):
    return html.escape(s)

def rich(s):
    # Escape first, then render **proof point** as bold. Lets Education and
    # bullet text carry the same emphasis as the rest of the resume, and lets
    # the bullet bold only the specific proof point instead of a whole line.
    # Both engines understand <b>: HTML renders it, reportlab Paragraph parses it.
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", html.escape(s))

def build_html(data, logo_b64):
    skills = data.get("skills", [])
    skills_cells = "".join(f"<div class='skill'>{esc(s)}</div>" for s in skills)
    exp_html = ""
    for j in data.get("experience", []):
        bl = "".join(f"<li>{rich(b)}</li>" for b in j.get("bullets", []))
        exp_html += (
            f"<div class='job'>"
            f"<div class='row'><span class='l b'>{esc(j.get('title',''))}</span>"
            f"<span class='r'>{esc(j.get('dates',''))}</span></div>"
            f"<div class='row'><span class='l i'>{esc(j.get('company',''))}</span>"
            f"<span class='r'>{esc(j.get('location',''))}</span></div>"
            f"<ul>{bl}</ul></div>"
        )
    edu_html = ""
    if data.get("education"):
        edu_heading = esc(data.get("education_heading", "Education & Certifications"))
        edu_items = "".join(f"<div class='edu'>{rich(e)}</div>" for e in data.get("education", []))
        edu_html = f"<h2>{edu_heading}</h2>{edu_items}"
    # Preserve any additional section the original resume has, in order, with its
    # own heading. Nothing from the source is merged away or dropped.
    extra_html = ""
    for sec in data.get("sections", []):
        heading = esc(sec.get("heading", ""))
        items = "".join(f"<div class='edu'>{rich(it)}</div>" for it in sec.get("items", []))
        if heading or items:
            extra_html += f"<h2>{heading}</h2>{items}"
    headline = data.get("headline", "")
    headline_html = f"<div class='headline'>{esc(headline)}</div>" if headline else ""
    summary = data.get("summary", "")
    summary_html = f"<h2>Summary</h2><p class='summary'>{esc(summary)}</p>" if summary else ""
    name_size = data.get("name_size", 17)
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
@page {{ size: Letter; margin: 1.6cm 1.7cm; }}
* {{ box-sizing: border-box; }}
body {{ font-family: Arial, Helvetica, sans-serif; color:#000; font-size:10.5pt; line-height:1.34; margin:0; }}
.logo {{ width: 235px; height:auto; display:block; margin:0 auto 10px auto; }}
h1 {{ font-size:{name_size}pt; font-weight:bold; margin:0 0 2px 0; }}
.headline {{ font-weight:bold; font-size:11.5pt; margin:0 0 12px 0; }}
h2 {{ font-size:11pt; font-weight:bold; text-transform:uppercase; letter-spacing:.4px;
     margin:14px 0 6px 0; padding-bottom:3px; border-bottom:1.2px solid #000; }}
p.summary {{ margin:0; text-align:justify; }}
.skills {{ display:grid; grid-template-columns:1fr 1fr; column-gap:26px; row-gap:3px; }}
.skill {{ position:relative; padding-left:14px; }}
.skill:before {{ content:"\\2022"; position:absolute; left:0; }}
.job {{ margin-bottom:11px; }}
.row {{ display:flex; justify-content:space-between; align-items:baseline; }}
.l {{ text-align:left; }} .r {{ text-align:right; white-space:nowrap; padding-left:12px; }}
.b {{ font-weight:bold; }} .i {{ font-style:italic; }}
ul {{ margin:4px 0 0 0; padding-left:18px; }}
li {{ margin:0 0 2px 0; text-align:justify; }}
.edu {{ margin:0 0 3px 0; }}
</style></head><body>
<img class="logo" src="data:image/png;base64,{logo_b64}">
<h1>{esc(data.get('name',''))}</h1>
{headline_html}
{summary_html}
<h2>Core Skills</h2><div class="skills">{skills_cells}</div>
<h2>Professional Experience</h2>{exp_html}
{edu_html}{extra_html}
</body></html>"""

def render_chrome(data, logo_path, out, chrome):
    logo_b64 = base64.b64encode(open(logo_path, "rb").read()).decode()
    doc = build_html(data, logo_b64)
    tmp_html = os.path.abspath(out) + ".tmp.html"
    open(tmp_html, "w", encoding="utf-8").write(doc)
    if os.path.exists(out):
        os.remove(out)
    r = subprocess.run(
        [chrome, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
         f"--print-to-pdf={os.path.abspath(out)}", "file://" + tmp_html],
        capture_output=True, text=True, timeout=180,
    )
    os.remove(tmp_html)
    if not os.path.exists(out):
        sys.exit("ERROR: Chrome failed to produce PDF:\n" + r.stderr[-1000:])

# ------------------------------------------------------------- reportlab engine
def render_reportlab(data, logo_path, out):
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.units import cm
        from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT, TA_RIGHT
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                        TableStyle, Image, HRFlowable, KeepTogether)
        from reportlab.lib import colors
        from PIL import Image as PILImage
    except ImportError as error:
        sys.exit(f"ERROR: declared PDF dependency is unavailable: {error}")

    L, R, T, B = 1.7 * cm, 1.7 * cm, 1.6 * cm, 1.6 * cm
    page_w, page_h = letter
    content_w = page_w - L - R

    FONT, FONT_B, FONT_I = "Helvetica", "Helvetica-Bold", "Helvetica-Oblique"
    black = colors.black

    name_st = ParagraphStyle("name", fontName=FONT_B, fontSize=data.get("name_size", 17), leading=data.get("name_size", 17) + 3, textColor=black, spaceAfter=1)
    head_st = ParagraphStyle("head", fontName=FONT_B, fontSize=11.5, leading=14, textColor=black, spaceAfter=8)
    h2_st = ParagraphStyle("h2", fontName=FONT_B, fontSize=11, leading=13, textColor=black,
                           spaceBefore=10, spaceAfter=3)
    body_st = ParagraphStyle("body", fontName=FONT, fontSize=10.5, leading=14, textColor=black, alignment=TA_JUSTIFY)
    skill_st = ParagraphStyle("skill", fontName=FONT, fontSize=10.5, leading=14, textColor=black)
    title_st = ParagraphStyle("title", fontName=FONT_B, fontSize=10.5, leading=13, textColor=black)
    date_st = ParagraphStyle("date", fontName=FONT, fontSize=10.5, leading=13, textColor=black, alignment=TA_RIGHT)
    comp_st = ParagraphStyle("comp", fontName=FONT_I, fontSize=10.5, leading=13, textColor=black)
    loc_st = ParagraphStyle("loc", fontName=FONT, fontSize=10.5, leading=13, textColor=black, alignment=TA_RIGHT)
    bullet_st = ParagraphStyle("bullet", fontName=FONT, fontSize=10.5, leading=14, textColor=black,
                               alignment=TA_JUSTIFY, leftIndent=14, bulletIndent=2, spaceAfter=2)
    edu_st = ParagraphStyle("edu", fontName=FONT, fontSize=10.5, leading=14, textColor=black, spaceAfter=3)

    def rule():
        return HRFlowable(width="100%", thickness=1.2, color=black, spaceBefore=2, spaceAfter=5)

    def section(label):
        # Uppercase to match the Chrome/CSS text-transform on headings.
        return [Paragraph(esc(label).upper(), h2_st), rule()]

    story = []

    # Logo, centered.
    iw, ih = PILImage.open(logo_path).size
    target_w = 176.0  # ~235px
    img = Image(logo_path, width=target_w, height=target_w * ih / iw)
    img.hAlign = "CENTER"
    story += [img, Spacer(1, 8)]

    story.append(Paragraph(esc(data.get("name", "")), name_st))
    if data.get("headline"):
        story.append(Paragraph(esc(data["headline"]), head_st))

    if data.get("summary"):
        story += section("Summary")
        story.append(Paragraph(esc(data["summary"]), body_st))

    skills = data.get("skills", [])
    if skills:
        story += section("Core Skills")
        rows = []
        for i in range(0, len(skills), 2):
            c1 = Paragraph("• " + esc(skills[i]), skill_st)
            c2 = Paragraph("• " + esc(skills[i + 1]), skill_st) if i + 1 < len(skills) else Paragraph("", skill_st)
            rows.append([c1, c2])
        t = Table(rows, colWidths=[content_w / 2.0, content_w / 2.0])
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 1),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ]))
        story += [t, Spacer(1, 2)]

    exp = data.get("experience", [])
    if exp:
        story += section("Professional Experience")
        lw, rw = content_w * 0.66, content_w * 0.34
        for j in exp:
            block = []
            hdr = Table([[Paragraph(esc(j.get("title", "")), title_st),
                          Paragraph(esc(j.get("dates", "")), date_st)]], colWidths=[lw, rw])
            sub = Table([[Paragraph(esc(j.get("company", "")), comp_st),
                          Paragraph(esc(j.get("location", "")), loc_st)]], colWidths=[lw, rw])
            for tbl in (hdr, sub):
                tbl.setStyle(TableStyle([
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
                ]))
            block += [hdr, sub, Spacer(1, 2)]
            for b in j.get("bullets", []):
                block.append(Paragraph(rich(b), bullet_st, bulletText="•"))
            block.append(Spacer(1, 7))
            # Keep the header lines with at least the first bullet.
            head_keep = block[:3] + (block[3:4] if len(block) > 3 else [])
            story.append(KeepTogether(head_keep))
            for fl in block[len(head_keep):]:
                story.append(fl)

    edu = data.get("education", [])
    if edu:
        story += section(data.get("education_heading", "Education & Certifications"))
        for e in edu:
            story.append(Paragraph(rich(e), edu_st))

    # Preserve any additional section the original resume has, in order, with its
    # own heading. Nothing from the source is merged away or dropped.
    for sec in data.get("sections", []):
        heading = sec.get("heading", "")
        items = sec.get("items", [])
        if heading or items:
            story += section(heading)
            for it in items:
                story.append(Paragraph(rich(it), edu_st))

    if os.path.exists(out):
        os.remove(out)
    SimpleDocTemplate(out, pagesize=letter, leftMargin=L, rightMargin=R,
                      topMargin=T, bottomMargin=B, title=data.get("name", "")).build(story)

def strip_pdf_metadata(pdf_path):
    """Remove both PDF document information and XMP without changing page content."""
    try:
        from io import BytesIO
        from pypdf import PdfReader, PdfWriter
    except ImportError as error:
        sys.exit(f"ERROR: declared PDF dependency is unavailable: {error}")

    clean_path = pdf_path + ".metadata-clean.pdf"
    try:
        with open(pdf_path, "rb") as handle:
            reader = PdfReader(BytesIO(handle.read()))
        writer = PdfWriter(clone_from=reader)
        writer.metadata = None
        writer.xmp_metadata = None
        with open(clean_path, "wb") as handle:
            writer.write(handle)

        with open(clean_path, "rb") as handle:
            cleaned = PdfReader(BytesIO(handle.read()))
        if cleaned.metadata or cleaned.xmp_metadata is not None:
            sys.exit("ERROR: PDF metadata stripping failed.")
        os.replace(clean_path, pdf_path)
    finally:
        if os.path.exists(clean_path):
            os.remove(clean_path)

# ----------------------------------------------------------------------- driver
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="candidate JSON file")
    ap.add_argument("--out", required=True, help="output PDF path")
    ap.add_argument("--logo", default=DEFAULT_LOGO, help="logo PNG (defaults to cached TTTG banner)")
    ap.add_argument("--engine", choices=["auto", "chrome", "reportlab"], default="auto")
    ap.add_argument("--preview", help="optional: write a page-1 PNG preview here")
    args = ap.parse_args()

    data = json.load(open(args.data, encoding="utf-8"))

    structure = check_required_structure(data)
    if structure:
        print("ABORT: required branded-resume structure is incomplete.\n" + "\n".join(structure))
        sys.exit(2)

    offenders = check_forbidden_content(data)
    if offenders:
        print("ABORT: forbidden punctuation found. Fix these fields and rerun:\n"
              + "\n".join(offenders))
        sys.exit(2)

    holes = check_placeholders(data)
    if holes:
        print("ABORT: unresolved placeholders would show on the finished resume.\n"
              "Ask the user for each value, or leave the field blank (\"\") if they say none. "
              "Do NOT ship a placeholder. Offending fields:\n" + "\n".join(holes))
        sys.exit(3)

    n = len(data.get("skills", []))
    if n % 2 != 0:
        print(f"ERROR: Core Skills count is odd ({n}). Add or remove one source-backed skill before building.")
        sys.exit(4)

    out = os.path.abspath(args.out)
    chrome = find_chrome()
    engine = args.engine
    if engine == "auto":
        engine = "chrome" if chrome else "reportlab"
    if engine == "chrome" and not chrome:
        sys.exit("ERROR: --engine chrome requested but no Chrome/Chromium found.")

    os.makedirs(os.path.dirname(out), exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="tttg-resume-") as temp_dir:
        staged = os.path.join(temp_dir, "resume.pdf")
        if engine == "chrome":
            render_chrome(data, args.logo, staged, chrome)
        else:
            render_reportlab(data, args.logo, staged)
        if not os.path.exists(staged):
            sys.exit("ERROR: PDF was not produced.")
        strip_pdf_metadata(staged)

        try:
            import fitz
            pdf = fitz.open(staged)
            alltext = "".join(p.get_text() for p in pdf)
            forbidden = [nm for ch, nm in BANNED.items() if ch in alltext]
            links = sum(1 for p in pdf for _ in p.links())
            if forbidden or links:
                sys.exit(f"ERROR: PDF verification failed: forbidden_punctuation={forbidden or 'none'} hyperlinks={links}")
            pages = pdf.page_count
            if args.preview:
                pdf[0].get_pixmap(dpi=110).save(args.preview)
            pdf.close()
        except ImportError:
            pages = "unverified"
            forbidden = "unverified"
            links = "unverified"

        os.replace(staged, out)
        print(f"OK [{engine}]: {out}")
        print(
            f"   pages={pages}  bytes={os.path.getsize(out)} "
            f"forbidden_punctuation={forbidden or 'none'} hyperlinks={links}"
        )
        if args.preview:
            print(f"   preview={args.preview}")

if __name__ == "__main__":
    main()
