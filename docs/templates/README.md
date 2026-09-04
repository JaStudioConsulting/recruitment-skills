# Canonical recruiting templates

This directory indexes reusable formats owned by this repository. `$recruiter` is the only entrypoint. Candidate, client, transcript, email, spreadsheet, cache, and generated-output files are evidence or runtime data and do not belong here.

## Authority and shared rules

- Router and precedence: [`skills/recruiter/SKILL.md`](../../skills/recruiter/SKILL.md)
- House style and fact/privacy rules: [`skills/_JA-RULES.md`](../../skills/_JA-RULES.md) and [`modules/ja-writer/references/ja-style.md`](../../skills/recruiter/modules/ja-writer/references/ja-style.md)
- Normalized field mapping: [`submission-data-contract.md`](submission-data-contract.md)

Every template inherits source-bound facts, no placeholders or fabricated metrics, no em/en dashes or double hyphens, no typed signature, draft-first Gmail, read-only/draft-only Loxo unless separately authorized, privacy/anonymity gates, verified attachments, and visual QA for PDFs. A local convenience copy is never an authority.

## Template owners

| Deliverable | Canonical template or contract | Owning guide |
|---|---|---|
| Call intake | `skills/recruiter/templates/candidate-call-submission-template.md` | recruiter router |
| Manager submission snapshot | `skills/recruiter/references/submission-format.md` | recruiter router |
| Full package email | `skills/recruiter/modules/write-up/assets/submission_email_template.html` | `modules/write-up/GUIDE.md` |
| Normalized submission data | `submission-data-contract.md` | write-up + recruiter router |
| Branded resume | `branded-resume-contract.md` | `modules/brandedresume/GUIDE.md` |
| Reference check | `modules/complete-reference-check/assets/reference-check-template.docx` and its template contract | `modules/complete-reference-check/GUIDE.md` |
| Loxo / Tracker outputs | module references and protected Tracker Manager contracts | `modules/loxo/GUIDE.md`, `modules/tracker/GUIDE.md` |

Historical HTML, SOPs, project prompts, Obsidian indexes, and `.codex` outputs may be compared manually, but must not be copied blindly.
