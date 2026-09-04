---
name: complete-reference-check
description: Complete candidate reference checks from supported evidence and generate a polished Top Tier Talent Group PDF from the repository-owned sanitized blank template.
---

# Complete Reference Check

## Consolidation safety gate

Use only the repository-owned sanitized blank `assets/reference-check-template.docx`. Never substitute a completed candidate or referee document. The bundled `scripts/build_reference_check.py` is the source of truth for filling and validating the template; it fails closed when the sanitized placeholder contract is missing.

## Required references

Read both files before drafting:

- [references/reference-check-standard.md](references/reference-check-standard.md) for evidence use and Ja's writing pattern.
- [references/template-contract.md](references/template-contract.md) for the fixed question flow and template behaviour.

## Workflow

1. Read the reference-call transcript or direct reference notes completely.
2. Read the candidate resume, job details, and recruiter notes when available. Use them for verified names, dates, titles, employers, responsibilities, and applied-role context. Do not turn candidate-provided facts into the referee's opinion.
3. If candidate name, applied role, client, referee name, referee title, referee company, relationship, completed-by name, or date is missing, ask Ja for the missing items in one short batch before building.
4. Build an evidence map across the fixed questions. Reuse a strong reference example only when it genuinely answers another question, and change the angle so the report does not sound repetitive.
5. Convert conversational comments into Ja's positive, direct recruiter wording. Fully capture supported praise, progression, examples, and rehire language. Never invent an opinion, rating, criticism, recommendation, or fact.
6. Use `Not discussed during the reference check.` only when no supplied source supports an answer. If the referee repeatedly said there was nothing negative, state that honestly for the improvement question rather than fabricating a weakness.
7. Produce three to five distinct supported strengths. Consolidate overlapping points instead of padding the list.
8. Write one JSON input matching the schema below. Use plain strings without Markdown.
9. Use the exact final naming pattern `Candidate Name - Reference Check - Reference Name.pdf`. Use spaces around hyphens and never use underscores in a delivered filename.
10. Load the workspace dependency runtime and run the bundled template-first builder to create the intermediate DOCX:

   ```bash
   SKILL_DIR="skills/recruiter/modules/complete-reference-check"
   "$PYTHON_BIN" "$SKILL_DIR/scripts/build_reference_check.py" \
     --input /absolute/path/reference-check.json \
     --output "/absolute/path/Candidate Name - Reference Check - Reference Name.docx"
   ```

11. Render the output with the documents skill. Inspect every page at 100% with human/vision review, then revise and rerender until there is no clipping, overlap, orphaned question, broken bullet, awkward page break, or unexpected drift from the template. Write the completed QA record and run the canonical repository validator at `../../scripts/validate-artifact-qa.mjs`; automated rendering alone is not sufficient.
12. Save the verified PDF in the caller-selected output directory using the exact naming pattern above only after the completed QA record passes the validator. Never assume a machine-specific folder.
13. Deliver only the finished PDF unless Ja requests another format. Retain or remove the intermediate DOCX according to Ja's task-specific direction.

## Input schema

```json
{
  "candidate": {
    "full_name": "",
    "position_applied_for": "",
    "company_name": ""
  },
  "reference": {
    "full_name": "",
    "job_title": "",
    "company_name": "",
    "professional_relationship": ""
  },
  "answers": {
    "known_duration": "",
    "working_capacity": "",
    "overall_performance": "",
    "responsibilities": "",
    "strengths": [],
    "area_for_improvement": "",
    "performance_rating": "",
    "communication": "",
    "interactions": "",
    "teamwork": "",
    "adaptability": "",
    "problem_solving": "",
    "dependability": "",
    "leadership_potential": "",
    "recommendation": "",
    "rehire": "",
    "additional_comments": ""
  },
  "completed_by": "",
  "date": ""
}
```

## Hard output rules

- Start from the repository-generated blank `assets/reference-check-template.docx`; never start from a completed reference document.
- Preserve the template's exact section order, question wording, colon usage, answer markers, italics, bullets, spacing, dividers, logo placement, margins, and footer flow.
- Keep regular answers as indented italic questionnaire responses. Keep strengths as bullets.
- Preserve specific quotes when they carry real weight, especially direct rehire language.
- Use the candidate's and referee's first names naturally. Avoid sterile phrases such as `the individual` when a name reads better.
- Prefer one to three purposeful sentences per answer. Give longer space only to a concrete example.
- Keep the report favourable when the reference was favourable, but never create unsupported praise.
- Preserve ranges and uncertainty exactly. Do not turn no numerical rating into a number.
- Keep the blank template unchanged. The builder verifies placeholder structure before use.
- Use natural client-facing filenames with spaces. Never deliver a filename containing underscores.

## Quality gate

- Every material claim traces to supplied evidence.
- The document reads like one coherent reference conversation, not a collection of generic HR answers.
- Strong evidence appears in the most relevant question instead of being repeated everywhere.
- The full template flow is present and visually recognizable.
- Names, companies, roles, dates, ratings, pronouns, and recommendation language are internally consistent.
- Every rendered page has a completed human/vision inspection record after the final edit; automated rendering alone does not satisfy this gate.
- `../../scripts/validate-artifact-qa.mjs` passes against the completed QA record.
- The final PDF is saved in Downloads as `Candidate Name - Reference Check - Reference Name.pdf`.

## Dashboard capability contract

Expose this as `Complete Reference Check` with inputs for the reference transcript or notes, candidate material, applied role/client, referee details, completed-by name, and date. The output is the completed template-matched PDF saved in Downloads with no underscores in the filename. Do not write to Loxo, email the client, or send the document unless Ja separately authorizes that action.
