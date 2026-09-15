---
name: tttg-candidate-submission
description: Use when Ja wants a candidate submission or branded resume.
version: 1.0.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [recruiting, tttg, submission, branded-resume, ontario]
    category: productivity
    related_skills: [recruiting-ontario-trades, obsidian, gws]
---

# TTTG Candidate Submission & Branded Resume

Ja Maralit (Top Tier Talent Group) recruits Ontario skilled-trades / manufacturing
talent. This module is historical. Repository authority lives in `skills/recruiter/SKILL.md`, `skills/GLOBAL-RULES.md`, `modules/write-up/GUIDE.md`, and `modules/brandedresume/GUIDE.md`. Do not use a legacy host router as current authority.

## WHEN TO USE
- Historical module kept for older `tttg-candidate-submission` references.
- For active Hermes work, prefer `modules/write-up/GUIDE.md` for submission emails and `modules/brandedresume/GUIDE.md` for PDFs.
- Do not follow this file when it conflicts with `GLOBAL-RULES.md`, `recruiter/SKILL.md`, or `modules/write-up/GUIDE.md`.
- Current delivery rule: one Gmail draft only when the tool exists and Ja asked for Gmail; otherwise copy-paste chat text. No rendered HTML file, no signature block, no auto-open unless Ja explicitly asks.

## CURRENT FORMAT POINTER
Use `modules/write-up/GUIDE.md` for current email structure. This historical module's old rendered-HTML/signature instructions are superseded.

## TWO MODES — decide first
- **Named submission:** specific open role at a specific client. Resume PDF is
  anonymized (no personal contact), but the internal email always NAMES the real
  employer.
- **MPC (Most Placeable Candidate):** speculative, no named role. Subject line
  `MPC - New Candidate Submission - [Title] - [Name] - [City, ON]`; CC the team
  address instead of an account manager.

## SUBMISSION EMAIL (named)
- To: the host-configured account manager; optional CC: the host-configured internal-team mailbox. Never infer or hardcode an address.
- Subject: `New Candidate Submission - [Role] - [Name] - [Client] - [City, ON]`.
- **Label block** — include only fields with a REAL confirmed value; leave blank
  if unknown, never invent:
  ```
  Current Company:   # REAL employer, never "Confidential"
  Location:          # one city + commute note, no "~area"/"on-site ready"
  Compensation:      # current actual figure only, e.g. "Currently $84K base plus bonus"
  Interview Availability:
  Start Date:        # e.g. "Two weeks' notice."
  Work Status:        # confirmed only; never infer
  Reason for Leaving: # source-backed only; never substitute current motivation
  ```
- **Profile Summary:** 2 short sentences max (3 only if forced). Owns the "why this
  role" fit; does NOT restate the label block or bullets; names THIS client's
  plant type / systems and ties the candidate to it. Bold key differentiators.
- **Bullets:** EXACTLY 4. NO category/angle titles ("Most important reason",
  "industry match", "technical match", "leadership scope") — those are internal
  guidance only, never output. State the fact directly. Shape: short **bolded claim
  phrase** (the proof point: team size, cert, system, hands-on scope), then back with
  specifics (a number, a named system, a named plant/OEM). Do NOT lead a bullet with
  the job title or tenure ("Nine years as a production supervisor"). Cut any sentence
  that could describe any candidate.
- **Close:** `CV attached.` on its own line at the very bottom. Never a signature
  (Gmail auto-appends Ja's). Stop there.

## BRANDED RESUME (fixed TTTG PDF format)
Top to bottom:
1. Centered TTTG logo
2. Name (bold) + ONE title
3. **Summary** (2-4 sentences)
4. **Core Skills** (EVEN number, two-column grid)
5. **Professional Experience** — recent first; `Title` bold flush-left +
   `mmm-yyyy` flush-right; `Company` italic flush-left + Location flush-right;
   achievement bullets, action verb + number
6. **Education & Certifications**

Style: Arial, black text only, no hyperlinks, print-ready. Anonymize personal
contact for the client version. Output file `<Candidate Name> - Top Tier Talent
Group.pdf`. If the repository `brandedresume` guide and `scripts/build_resume.py` are
available, use it; otherwise render this format in chat.

## GLOBAL WRITING RULES (apply to ALL TTTG copy)
- **NO em dashes, en dashes, double hyphens, or tildes.** `~` → "about". Regular
  hyphens in compounds/date ranges are fine.
- **NO semicolons (;).** Use a period or comma. Short sentences win.
- **NO redundancy between Profile Summary and bullets.** Summary = fit thesis
  (why this person for THIS role). Bullets = proof. If a sentence could sit in either
  place, it goes in bullets and is CUT from the summary.
- **NO category titles on bullets.** State the fact directly. Never output angle
  labels like "Most important reason they fit this role", "industry match",
  "technical match", "leadership scope" — those are internal angle guidance only.
- **Do NOT open the Summary or a bullet with the job title or tenure.** Do not write
  "Michael is a nine year production supervisor" or lead a bullet with "Nine years as
  a production supervisor" — that just restates the Title label. Lead with the real
  proof (team size, reporting structure, cert, system, hands-on scope).
- **Concrete over abstract, always.** Anchor every claim to a number, a named
  system/standard (WHMIS, HACCP, SQF, ISO 9001, SAP, JD Edwards E1), or a named
  plant/OEM (Ford/GM/Stellantis; stamping, precision machining, melt shop).
- **Ja's voice:** owns/ownership, hands-on, pairs [A] with [B], end to end, on the
  floor, credibility with the trades, transfers into [client's system], the
  discipline this plant runs on.
- **Kill AI tells:** thrives, ever-changing, fast-paced (filler), leverage, robust,
  seamless, dynamic, passionate, proven track record, wealth of experience, poised
  to, adept, well-versed, audit-ready, empty tricolons. Replace with a fact or cut.
- **Never invent facts.** Missing employer / date / degree / metric → STOP and ask
  Ja. No `[confirm ...]` placeholders in the finished file. A client never sees a
  made-up fact.

## VET BEFORE YOU WRITE (brief)
Run the hard gates from the transcript first: trade ticket/cert present? recent
hands-on experience? shift/location fit? comp expectation vs client budget?
notice period? Any gap → flag, don't paper over. Mine the WOW factor from the
transcript (not the resume) — one vivid specific human detail. If none exists, say
so and ask Ja for the angle; never invent one.

## RELATED OPS
This package defines recruiting method and output contracts only. Runtime tools live in the consuming host. Use only host-declared draft tools and preserve every human-review gate in the package manifests.
