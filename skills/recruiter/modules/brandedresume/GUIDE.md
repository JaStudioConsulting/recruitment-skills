---
name: brandedresume
description: Internal recruiter capability for a source-grounded branded PDF resume. The recruiter front door selects this guide when Ja asks to brand or format candidate material. It is not a standalone invocation.
---

# Branded Resume

Use the canonical contract in [`docs/templates/branded-resume-contract.md`](../../../../docs/templates/branded-resume-contract.md) alongside this guide.

Take a candidate's raw material (resume, interview transcript, LinkedIn export, recruiter notes) and produce a **finished branded PDF resume** the user can download and send to a client.

The deliverable is the PDF itself. The user does not want code or steps to run elsewhere, just the polished file. The bundled script builds it directly and the logo travels inside the skill, so it works on any machine, including Claude Cowork.

## Guardrail — pause on anything missing (do this first)

One shot beats a redo. Before building, scan the input for any missing or unclear essential (employer, date, location, degree, a metric, named-vs-MPC). **If anything is missing, STOP and ask Ja in one short batch** — list exactly what's unknown and, for each, ask: provide it, leave it blank (`""`), or take it out. Never guess, never invent, never ship a `[confirm ...]` placeholder. Proceed only once every gap is resolved. Saves tokens, avoids a rebuild.

## How to work

1. **Read the raw candidate material** the user provides.
2. **Extract and refine** it into clean, structured data (rules below).
3. **Write a `candidate.json`** matching the schema in
   [`references/example-candidate.json`](references/example-candidate.json).
4. **Run the builder.** From the skill's base directory:

   ```bash
   python3 scripts/build_resume.py \
     --data /tmp/candidate.json \
     --out "<Candidate Name> - Top Tier Talent Group.pdf" \
     --preview /tmp/_preview.png
   ```

   Save the PDF to the user's Downloads folder (or wherever they ask), named `<Candidate Name> - Top Tier Talent Group.pdf`.
5. **Render and inspect every page** the builder writes, fix anything off, then hand over the
   PDF as a clickable link. A preview glance is insufficient. Record PASS/FAIL for clipping,
   overlap, orphaned headings or bullets, logo placement, privacy/contact removal, and natural
   page breaks. Fix every FAIL and rerender before handoff. Delete temporary preview/json files
   only after the QA record is complete.

   Automated render checks are necessary, but they cannot mark visual completion. After actual
   human/vision inspection of every rendered page, write the canonical artifact QA record with
   `human_visual_inspection_complete: true`, the inspected page count, and explicit PASS results
   for each required check. Validate that record against the final PDF:

   The QA record's `artifact` field must contain the absolute final PDF path. Run the canonical
   validator against that record:

   ```bash
   node skills/recruiter/scripts/validate-artifact-qa.mjs \
     "/absolute/path/to/artifact-qa.json"
   ```

   Stop unless this validator exits 0 successfully. Automated tests or a render manifest
   must leave the human-inspection field false and are not completion proof.

### How the builder just works anywhere

- It picks the PDF engine automatically: headless Chrome if present, otherwise declared `reportlab` and `pillow` dependencies.
- It never installs packages at runtime. Use the repository/workspace dependency environment and stop if a declared dependency is missing.
- The builder enforces the house rules and prints `engine / pages / long_dashes / hyperlinks` so you can confirm the file is clean before handing it over.

## Data refinement rules

Refine the raw input into a polished, client-ready resume rather than copying it verbatim:

- **Core Skills must be an even number** so the two-column grid is balanced. If the natural list is odd, merge two related skills or add one genuinely supported skill. Never pad with filler.
- **One single title under the name** (the candidate's strongest current or target role), not two stacked together.
- **Lean toward manufacturing, engineering, and technical terminology.** This format places technical and industrial talent.
- **Summary:** 2 to 4 sentences, professional and concise, strongest positioning first.
- **Experience bullets:** action plus a number wherever the source supports it. Most recent role first; dates as `Mmm-YYYY` (for example `Mar-2019 - Present`). **Bold the single proof point** by wrapping it in `**...**` (for example `Cut unplanned downtime **22%** across three lines.`). Bold only the specific proof point (a number, employer, system, cert, or skill), never the whole lead sentence.
- **Title must match the candidate's current role title exactly.** No creative interpretations. No combining two titles. "Production Supervisor" not "Production Operations Supervisor."
- **Combine same-company roles into ONE timeline entry** when a candidate held multiple positions at the same employer. Show all titles under one company header, not separate entries.
- **Education and certifications are ONE combined section**, titled "Education & Certifications". Put degrees, diplomas, and certifications together in the single `education[]` list, most relevant first. Do not split education and certifications into two groups or two sections.
- **Bold the credential in each entry** so it matches the emphasis used in the rest of the resume. Wrap the degree, diploma, or certification name in `**...**`, then the institution or issuer follows in regular weight (for example `**B.S. Mechanical Engineering** - Example University`, `**433A Industrial Millwright License**`). Institution name only, no dates, omit the year column entirely.
- **No compensation information in any bullet point.** Compensation goes in the submission email only, never on the resume.
- **Profile Summary must DEFEND fit for THIS role** — why this candidate is worth interviewing. It must NOT repeat the resume content. Pull new information from transcript/call notes. The reader should learn something they could not see on the resume.
- **Anonymize for client submission:** drop personal contact info (email, phone, LinkedIn) unless told otherwise.
- **Never invent facts, and never ship a placeholder.** If something essential is missing (a location, dates, an employer), do not write `[confirm ...]` into the field and build anyway. A client must never see a fill-in marker. Instead, **stop and ask the user** before building: offer to add the real value, or to leave that field out. If they say leave it out, set the field to an empty string `""` (an empty location simply renders as blank, which is fine). The builder will refuse to produce a PDF if any `[confirm ...]` style placeholder remains, so resolve them first.

## House style rules (enforced by the builder)

- **No em dashes, en dashes, or double hyphens anywhere.** Reword with commas, "and", or restructure. Regular hyphens in compound words (cost-reduction) and the date format (`Dec-2025 - Present`) are fine. The builder aborts if it finds a long dash, so keep the source data clean.
- **No hyperlinks** in the resume.
- **Logo centered** at the top; **black text only**, Arial throughout; clean and print-ready.
- **Emphasis:** wrap text in `**...**` to bold it inside experience bullets and Education & Certifications entries. The builder renders it as real bold in both engines. Use it for the bullet proof point and the education credential, nowhere else.

## The format (what the PDF contains)

- **Logo**, centered, top of page.
- **Name** (large, bold), with the single **headline** in bold beneath it.
- **Summary** section.
- **Core Skills** as a borderless two-column bullet grid.
- **Professional Experience**, most recent first, each role as two header lines: job title (bold, left) with dates (right), then company (italic, left) with location (right), then achievement bullets.
- **Education & Certifications** section.

## Named vs MPC (anonymized) build

A resume is built one of two ways. Decide which from how the candidate is being presented:

- **Named submission** (default, going to a specific client for a specific role): full real name in the name slot, the single strongest title as the headline, and **real employer names** in Professional Experience. Standard build.
- **Internal-team MPC:** keep the candidate name and real employers. The internal team receives the named resume.
- **External-client speculative MPC:** the candidate must NOT be identifiable.
  - **No candidate name anywhere.** Put **the title in the name slot** (the large bold line at the top), e.g. `"name": "Maintenance Manager"`. Leave `headline` blank (`""`), or use a short target-positioning line, never the person's name.
  - **No employer names.** Replace each company with the **industry of that company**, e.g. `"company": "Tier 1 Automotive Supplier"`, `"Global Logistics Firm"`, `"Food & Beverage Manufacturer"`. Keep dates, location, titles, and achievements intact.
  - Drop personal contact info as always.

The recruiter front door pairs this capability with the internal write-up guide for a matching submission email. When in doubt which mode, ask: "named client submission or MPC?"

## Swapping the logo (for sharing to others)

The logo lives at `assets/tttg_logo.png`. To rebrand for a different company, replace that PNG with their banner logo at the same path and filename. Everything else stays the same.

## Done conditions

- Builder output reports expected page count and no long dashes or hyperlinks.
- Every page was rendered and inspected, with recorded PASS/FAIL for clipping, overlap,
  orphaned headings/bullets, logo placement, privacy/contact removal, and page breaks.
- The canonical `skills/recruiter/scripts/validate-artifact-qa.mjs` validator passes successfully
  for the final PDF and QA record after actual human/vision inspection of every page.
- No candidate contact information, placeholders, or unsupported facts remain.
- The final PDF exists at the requested output path.

## Output

Hand the user the finished PDF as a clickable link to its path. Keep commentary short. The builder must stop before producing any file when a placeholder remains.
