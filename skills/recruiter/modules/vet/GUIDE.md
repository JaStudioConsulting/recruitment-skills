---
name: vet
description: "Internal recruiter capability for staged candidate vetting. The recruiter front door selects it for source-grounded fit assessment or a package stage. It is not a standalone invocation and stops between stages unless Ja asks for a full package."
---

# vet

Staged workflow. One mode at a time. **Stop after each mode. Do not proceed unless Ja asks.**

---

## Mode Detection

Read what Ja said and infer intent. Do not require exact phrases.

| Intent | Mode |
|---|---|
| Wants to know if candidate is worth pursuing | MODE 1 — Vet |
| Wants the submission email written | MODE 2 — Submission Email |
| Wants the resume cleaned or parsed | MODE 3 — Parsed Resume |
| Wants everything | Full Package — run 1 → 2 → 3, pause between each |

If intent is genuinely unclear after reading the message, ask one question only:
**"Vet only, or do you want the full submission?"**

Do not ask if context already makes it obvious.

---

## Before Any Mode Runs

Check what inputs are present:

- **Resume provided?** Required for all modes. If missing, ask for it before doing anything.
- **JD provided?** Required for Mode 1 and Mode 2. If missing, ask: "Do you have a JD or role brief? I need it to assess fit."
- **Call notes provided?** Optional. Use them if present. Do not ask for them — work with what's there.

Do not start a mode until the required inputs are present.

---

## MODE 1 — Vet

Read resume + JD. Assess fit. Output the verdict below. Nothing else — no submission, no resume.

### If NO fit:

**[Candidate Name] — [Role @ Client]**
NO. [One sentence stating the primary reason — wrong industry, missing cert, location conflict, seniority mismatch, etc.]

Stop. Do not offer to continue. Do not soften it.

### If YES or CONDITIONAL:

**[Candidate Name] — [Role @ Client]**
FIT: YES / CONDITIONAL

**Strong:**
- [What makes this person credible for this specific role — be specific, not generic]
- [Second strength if genuinely distinct]
- [Third only if it adds something new]

**Risk:**
- [What a hiring manager will push back on]
- [Second risk only if it's real and distinct — do not pad]

**Gaps to confirm before submitting:**
- [Anything unverified that could kill the deal — comp alignment, commute, specific cert, CMMS, relocation, availability]
- [Add more only if they exist — do not manufacture gaps]

**Bottom line:** [One sentence. Is this submittable now, or what needs to happen first.]

---

Stop here. Wait for Ja.

---

## MODE 2 — Submission Email

Only run if Ja asked for it. Your exact format. No deviations.

**Rules:**
- Source only from resume, JD, and call notes
- Never invent, assume, or include anything not confirmed in the source material
- Only include field lines that have confirmed data — skip lines with nothing to say
- Bold labels before the colon, and key proof points inside bullets only
- Do not bold full sentences
- Profile Summary bullets: include only what's genuinely supported — 2 minimum, 4 maximum

---

Subject: New Candidate Submission - [Role] - [Candidate Name] - [Client] - [Location]

Hi team,

@[Configured Account Manager] I would like to present [Candidate Name] for the [Role] opportunity with [Client].

**Title:** [Current title or best-fit title]
**Location:** [City, Province] | [commute or relocation note only if relevant]
**Current Company:** [Include only if it adds context — skip if it reads better in the summary]
**Compensation Target:** [e.g. Currently at $X | Targeting $Y — only if both are confirmed]
**Interview Availability:** [Only if confirmed]
**Start Date / Notice Period:** [Only if confirmed]
**Reason for Exploring:** [Factual — never invented]

**Profile Summary:**

[2 sentences max. 3 only if genuinely needed. Why this person is worth reviewing for this role specifically. Do not repeat the resume. Do not preview the bullets below.]

- [Most important fit reason — **bold the proof point**]
- [Industry, plant, or environment match — **bold it**]
- [Technical, systems, equipment, or process match — **bold it**]
- [Leadership, ownership, or scope — **bold it** — only if supported]

CV attached.

---

Stop after the email. Do not produce the parsed resume unless Ja asks.

---

## MODE 3 — Parsed Resume

Only run if Ja asked for it. Text only. No markdown. No HTML. No symbols or decorative characters in headers.

---

Name
[Full name]

Summary
[2–3 sentences. Current professional identity, depth of experience, environments worked in. No filler.]

Skills
[One skill per line. Only skills evidenced on the resume. Do not add skills from the JD.]

Experience

[Job Title]
[Company Name] | [City, Province] | [Month YYYY – Month YYYY or Present]
- [Rewritten bullet — tighter and clearer than original, never invented]
- [Minimum 3 bullets per role. 4–5 for primary/most relevant roles.]
- [If resume only has 1–2 weak bullets for a role, expand using context already on the resume — do not add new facts]

[Repeat for each role in reverse chronological order]

Education
[Degree or Diploma]
[Institution] | [City, Province] | [Year]

Certifications
[Certification Name] | [Issuing Body] | [Year if available]
[If no year on resume, omit the year — do not guess]

---

**Rules:**
- Do not copy bullets verbatim — rewrite for clarity without adding new facts
- Minimum 3 bullets per role, 4–5 for the most relevant roles
- Do not include contact information
- Omit any section that has nothing evidenced
- Do not add skills, tools, or certifications not on the resume

---

## Full Package Flow

If Ja asked for everything:

1. Run Mode 1. Output vet verdict. Stop and confirm: **"Vet done. Want me to write the submission now?"**
2. On yes — run Mode 2. Output submission email. Stop and confirm: **"Submission written. Want the parsed resume too?"**
3. On yes — run Mode 3.

If Mode 1 returns NO — stop entirely. Do not offer to continue to Mode 2 or 3.

---

## Optional — Sourcing & Contact Enrichment

If a candidate qualifies but is **missing a reachable email/phone/LinkedIn**, or Ja needs to
**source** candidates before vetting, load `references/sourcing-enrichment.md` — the Deepline GTM
method folded into vet (waterfall contact-finding, email verification, one-row pilots, provider
ROI order). Requires the Deepline engine + API keys to run; otherwise fall back to Loxo's built-in
**Find Contact / Fetch Email**. Enriched output → Loxo CSV import → submission. Never invent contact
data; only use verified results.

---

## Non-Negotiables

- Never fabricate titles, companies, tools, scope, certs, achievements, or compensation
- Never include a field line with no confirmed data behind it
- Never bold full sentences — labels and proof points only
- Never add headings not in the format above
- Never auto-proceed to the next mode
- Never soften a NO verdict
