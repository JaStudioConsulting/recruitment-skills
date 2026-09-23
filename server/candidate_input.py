"""
Boundary check for candidate data arriving at the hosted builder.

When Claude follows the brandedresume guide it hands the builder clean
candidate.json. Other callers (ChatGPT, the Workbench) do not read the guide, so
this module enforces the guide's input rules at the door, before build_resume.py
ever sees the data:

  1. Normalize near-miss shapes (a skills string, role/employer keys, structured
     education) into the exact candidate.json schema.
  2. Keep contact details off the resume. Contact fields (email, phone,
     linkedin, ...) are dropped. Contact details written inside a sentence are
     refused with the exact field named, because cutting them out mid-sentence
     leaves broken text on a client resume.
  3. Refuse loudly instead of silently dropping content. Any field the builder
     would not render is reported back so the caller can fix it and retry.
  4. Remove **bold** markers from fields the builder prints as plain text
     (name, title, summary, skills, job headers), where they would show as
     literal asterisks.

Pure standard library, no MCP dependency, so it is testable on its own.
"""
import re

# ------------------------------------------------------------------ contact
_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_URL = re.compile(r"(?:https?://|www\.)\S+|\b(?:[a-z0-9-]+\.)*linkedin\.com/\S*", re.I)
# North American phone shapes: (555) 555-0100, 555-555-0100, +1 555 555 0100.
_PHONE = re.compile(r"(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}(?!\d)")

CONTACT_KEYS = {"email", "emails", "phone", "phones", "mobile", "cell", "linkedin",
                "linkedin_url", "contact", "contact_info", "address", "website", "url"}
FORBIDDEN_PUNCTUATION = (
    ("—", "em dash"), ("–", "en dash"), ("--", "double hyphen"),
    (";", "semicolon"), ("~", "tilde"),
)


def find_contact(text):
    """Return the kinds of contact detail present in one string."""
    if not isinstance(text, str):
        return []
    return [kind for pattern, kind in ((_EMAIL, "email"), (_URL, "link"), (_PHONE, "phone"))
            if pattern.search(text)]


# ------------------------------------------------------------------ shapes
_EXP_ALIASES = {
    "title": ("title", "role", "position", "job_title", "jobtitle"),
    "company": ("company", "employer", "company_name", "organization", "organisation", "org"),
    "location": ("location", "city", "place"),
    "dates": ("dates", "date", "date_range", "period", "tenure"),
    "bullets": ("bullets", "responsibilities", "achievements", "highlights",
                "duties", "accomplishments", "description", "details", "points"),
}
_START_KEYS = ("start", "start_date", "from", "started")
_END_KEYS = ("end", "end_date", "to", "until", "ended")

# Top-level keys that are really their own resume section. They become
# sections[] entries with this heading instead of being dropped.
_SECTION_KEYS = {
    "certifications": "Certifications", "certificates": "Certifications",
    "licenses": "Licenses", "licences": "Licenses",
    "awards": "Awards", "honors": "Awards", "honours": "Awards",
    "languages": "Languages", "projects": "Projects",
    "volunteer": "Volunteer", "volunteering": "Volunteer",
    "affiliations": "Affiliations", "memberships": "Affiliations",
    "publications": "Publications", "training": "Professional Development",
    "professional_development": "Professional Development",
    "technical_skills": "Technical Skills", "tools": "Technical Tools",
    "additional_information": "Additional Information",
}

KNOWN_TOP = {"name", "headline", "summary", "skills", "experience", "education",
             "education_heading", "sections", "name_size"}
_TOP_ALIASES = {
    "title": "headline", "current_title": "headline", "profile": "summary",
    "profile_summary": "summary", "objective": "summary", "core_skills": "skills",
    "work_history": "experience", "work_experience": "experience",
    "professional_experience": "experience", "jobs": "experience", "roles": "experience",
    "full_name": "name",
}


def _to_list(value):
    """A list stays a list. A single string becomes a list by splitting on line
    breaks or bullet marks, then commas for a skills-style one-liner. Never
    iterates a string into characters, which is the failure this replaces."""
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        parts = [p.strip(" \t-*•●") for p in re.split(r"[\n\r]+|•|●", value)]
        parts = [p for p in parts if p]
        return parts
    return [value]


def _split_skills(value):
    items = _to_list(value)
    if len(items) == 1 and isinstance(items[0], str) and "," in items[0]:
        items = [s.strip() for s in items[0].split(",") if s.strip()]
    out = []
    for it in items:
        if isinstance(it, dict):
            it = it.get("name") or it.get("skill") or it.get("label") or ""
        if isinstance(it, str) and it.strip():
            out.append(it.strip())
    return out


def _split_bullets(value):
    items = _to_list(value)
    # One paragraph of prose with several sentences -> one bullet per sentence.
    if len(items) == 1 and isinstance(items[0], str):
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9*])", items[0]) if s.strip()]
        if len(sentences) > 1:
            items = sentences
    return [str(b).strip() for b in items if str(b).strip()]


def _first(d, keys):
    for k in keys:
        if k in d and d[k] not in (None, "", []):
            return d[k], k
    return None, None


def _norm_experience(entry, idx, problems):
    if isinstance(entry, str):
        problems.append(f"experience[{idx}] is plain text, not a job object with title/company/dates/bullets: {entry[:60]!r}")
        return None
    if not isinstance(entry, dict):
        problems.append(f"experience[{idx}] is not a job object")
        return None
    job, used = {}, set()
    for field, keys in _EXP_ALIASES.items():
        value, key = _first(entry, keys)
        if key:
            used.add(key)
            job[field] = _split_bullets(value) if field == "bullets" else str(value).strip()
    if not job.get("dates"):
        start, sk = _first(entry, _START_KEYS)
        end, ek = _first(entry, _END_KEYS)
        if start or end:
            used.update(k for k in (sk, ek) if k)
            job["dates"] = f"{start or ''} - {end or 'Present'}".strip(" -")
    leftover = {k: v for k, v in entry.items() if k not in used and v not in (None, "", [])}
    if leftover:
        problems.append(f"experience[{idx}] has fields the resume would drop: {sorted(leftover)}. "
                        "Fold them into bullets or the matching field.")
    if not job.get("title") and not job.get("company"):
        problems.append(f"experience[{idx}] has no title and no company, so it cannot be placed.")
    job.setdefault("title", "")
    job.setdefault("company", "")
    job.setdefault("location", "")
    job.setdefault("dates", "")
    job.setdefault("bullets", [])
    return job


def _norm_education(value, problems):
    out = []
    for idx, item in enumerate(_to_list(value)):
        if isinstance(item, str):
            if item.strip():
                out.append(item.strip())
            continue
        if isinstance(item, dict):
            cred, ck = _first(item, ("degree", "credential", "certification", "diploma", "program", "name", "title"))
            school, sk = _first(item, ("school", "institution", "university", "college", "issuer", "provider"))
            place, pk = _first(item, ("location", "city"))
            detail, dk = _first(item, ("details", "notes", "focus", "honors", "honours"))
            # The TTTG format omits education years, so date keys are consumed on purpose.
            used = {k for k in (ck, sk, pk, dk) if k} | {k for k in item if k in ("year", "years", "date", "dates", "start", "end", "graduated", "graduation")}
            leftover = {k: v for k, v in item.items() if k not in used and v not in (None, "", [])}
            if leftover:
                problems.append(f"education[{idx}] has fields the resume would drop: {sorted(leftover)}.")
            if not cred and not school:
                problems.append(f"education[{idx}] has no credential and no institution.")
                continue
            line = f"**{str(cred).strip()}**" if cred else ""
            where = ", ".join(str(x).strip() for x in (school, place) if x)
            line = f"{line} - {where}" if line and where else (line or where)
            out.append(line)
            if detail:
                out.append(str(detail).strip())
            continue
        problems.append(f"education[{idx}] is not text or an object.")
    return out


def _norm_sections(value, problems):
    out = []
    for idx, sec in enumerate(_to_list(value)):
        if not isinstance(sec, dict):
            problems.append(f"sections[{idx}] must be an object with heading and items.")
            continue
        heading = str(sec.get("heading") or sec.get("title") or "").strip()
        items = [str(i).strip() for i in _to_list(sec.get("items") or sec.get("lines") or sec.get("content")) if str(i).strip()]
        if heading or items:
            out.append({"heading": heading, "items": items})
    return out


# ------------------------------------------------------------------ entry
def normalize_candidate(raw):
    """Return (candidate, report). report["problems"] non-empty means refuse to
    build: something would be lost or cannot be placed. report["stripped"] lists
    the kinds of contact detail removed."""
    problems, stripped, notes = [], [], []
    if not isinstance(raw, dict):
        return None, {"problems": ["candidate must be an object"], "stripped": [], "notes": []}

    data = {}
    for key, value in raw.items():
        k = key.strip().lower().replace(" ", "_").replace("-", "_")
        if k in CONTACT_KEYS:
            if value not in (None, "", []):
                stripped.append(k)
            continue
        target = _TOP_ALIASES.get(k, k)
        if target in data and target != k:
            problems.append(f"'{key}' and another field both map to '{target}'. Send one.")
            continue
        data[target] = value

    out = {}
    for key in ("name", "headline", "summary", "education_heading"):
        if data.get(key) not in (None, ""):
            out[key] = str(data[key]).strip()
    if "name_size" in data:
        out["name_size"] = data["name_size"]
    if not out.get("name"):
        problems.append("name is missing.")

    out["skills"] = _split_skills(data.get("skills"))
    out["experience"] = [j for j in (_norm_experience(e, i, problems)
                                     for i, e in enumerate(_to_list(data.get("experience")))) if j]
    out["education"] = _norm_education(data.get("education"), problems)
    out["sections"] = _norm_sections(data.get("sections"), problems)

    for key, value in data.items():
        if key in KNOWN_TOP or value in (None, "", []):
            continue
        if key in _SECTION_KEYS:
            out["sections"].append({"heading": _SECTION_KEYS[key],
                                    "items": [str(i).strip() for i in _to_list(value) if str(i).strip()]})
            notes.append(f"'{key}' kept as its own '{_SECTION_KEYS[key]}' section.")
        else:
            problems.append(f"'{key}' is not a resume field and would be dropped. "
                            "Map it to summary/skills/experience/education, or send it in sections[] "
                            "with a heading.")

    if len(out["skills"]) % 2:
        problems.append(
            f"Core Skills count is odd ({len(out['skills'])}). "
            "Add or remove one source-backed skill before building."
        )

    # Bold markers only render in bullets, education and section items.
    unbold = lambda v: re.sub(r"\*\*(.+?)\*\*", r"\1", v) if isinstance(v, str) else v
    for key in ("name", "headline", "summary", "education_heading"):
        if key in out:
            out[key] = unbold(out[key])
    out["skills"] = [unbold(x) for x in out["skills"]]
    for job in out["experience"]:
        for key in ("title", "company", "location", "dates"):
            job[key] = unbold(job[key])
    for sec in out["sections"]:
        sec["heading"] = unbold(sec["heading"])

    # Contact details inside text are refused, never cut out mid-sentence.
    def scan(value, path):
        if isinstance(value, str):
            kinds = find_contact(value)
            if kinds:
                problems.append(f"{path} contains contact details ({', '.join(kinds)}). "
                                "The resume never carries contact info. Rewrite that text without it.")
            for token, label in FORBIDDEN_PUNCTUATION:
                if token in value:
                    problems.append(
                        f"{path} contains a forbidden {label} ({token}). "
                        "Rewrite that text before building."
                    )
        elif isinstance(value, list):
            for i, v in enumerate(value):
                scan(v, f"{path}[{i}]")
        elif isinstance(value, dict):
            for k, v in value.items():
                scan(v, f"{path}.{k}")

    for key, value in out.items():
        scan(value, key)

    if not (out.get("summary") or out["skills"] or out["experience"] or out["education"] or out["sections"]):
        problems.append("There is nothing to build beyond a name. Send the resume content.")

    return out, {"problems": problems, "stripped": sorted(set(stripped)), "notes": notes}


SCHEMA_HINT = (
    "candidate must be an object with exactly these fields: "
    "name (string), headline (string, ONE current title), summary (string, 2 to 4 sentences), "
    "skills (array of strings, even count), "
    "experience (array of objects, each {title, company, location, dates, bullets[]}; "
    "dates like 'Mar-2019 - Present'; wrap the one proof point per bullet in **double asterisks**), "
    "education (array of strings like '**Degree** - Institution, City'; no years), "
    "education_heading (optional string, default 'Education & Certifications'), "
    "sections (optional array of {heading, items[]} for any other section the original resume has). "
    "Never include email, phone, or links: they are stripped. "
    "No em dashes, en dashes, double hyphens, semicolons, tildes, or [placeholders]: "
    "the builder refuses them."
)
