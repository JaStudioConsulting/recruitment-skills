# Sanitized Reference-Check Template Contract

## Authority

- Template: `assets/reference-check-template.docx`
- Generator: `scripts/generate-reference-template.cjs` at repository root
- Source: generated from blank placeholders and generic question wording only
- Page: US Letter portrait, 0.5-inch margins

No completed reference check, candidate document, referee document, or prior template is a source for this asset.

## Required placeholder flow

The blank template contains one token for every candidate field, reference field, answer, completion field, and five strength slots. Tokens use `{{field_name}}` form. The builder must fail closed when required tokens are missing or duplicated.

## Visual grammar

- Top Tier Talent Group logo in the title row
- Arial, black text
- Bold section headings with black dividers
- Bold questions
- Indented italic answers
- Real list formatting for strengths
- Footer identifying Top Tier Talent Group

## Privacy checks

- Blank template XML and core properties contain no candidate, referee, client, recruiter, email, phone, profile URL, completed answer, or operational identifier.
- Validator allows this DOCX only when every required placeholder and title is present.
- Synthetic builds use unmistakable `Synthetic ...` identities and `.invalid` email domains.
