# Opportunity brief content contract

The builder accepts one UTF-8 JSON file. Paths are absolute or relative to the JSON file. Display text supports ReportLab paragraph tags only when needed for `<b>`, `<i>`, `<br/>`, and `<link href="https://...">`.

## Top-level structure

```json
{
  "document": {},
  "source_control": {},
  "privacy": {},
  "cover": {},
  "role": {},
  "context": {},
  "decision": {}
}
```

## `document`

Required strings:

- `company`
- `role`
- `location`, including `Remote, Canada` when accurate
- `title`
- `subject`
- `author`
- `footer`

Optional colours use six-digit hex values:

- `primary_color`, default `#B72B37`
- `ink_color`, default `#202326`
- `muted_color`, default `#5F666B`
- `light_color`, default `#F3F3F0`
- `line_color`, default `#DBDEDF`

## `source_control`

Required:

- `as_of`: ISO date for the fact review.
- `publication_status`: `approved_for_candidate_use` or `draft_only`.
- `role_status_evidence`: concise description of the confirmation and its date.
- `authoritative_sources`: array of at least two source identifiers or URLs. Include the exact role source and at least one authority for public company/site/location claims.

The source list is internal build evidence and is not printed in the candidate PDF.

## `privacy`

- `banned_terms`: candidate names, interviewer names, personal identifiers, internal project labels, stale role names, and any other text that must not appear in the reusable PDF.

Do not put candidate compensation, availability, work status, contact details, interview logistics, or fit assessments anywhere in this JSON.

## Page objects

### `cover`

- `eyebrow`
- `headline`
- `deck`
- `image`
- `image_caption`
- `sections`: exactly two objects with `title` and `body`

### `role`

- `eyebrow`
- `headline`
- `intro`
- `image`
- `image_caption`
- `at_a_glance`: exactly three objects with `label` and `value`
- `cards`: exactly four objects with `title` and `body`
- `note`

Recommended card logic: mandate, actual work, success, and working relationships. Change the labels when the JD supports a more useful structure.

### `context`

- `eyebrow`
- `headline`
- `intro`
- `image`
- `image_caption`
- `columns`: exactly two objects with `title` and `body`
- `note_title`
- `note_body`

Use this page for the operating environment, site context, team interfaces, work pattern, travel, or location. Choose the two most decision-relevant themes for the exact role.

### `decision`

- `eyebrow`
- `headline`
- `intro`
- `images`: exactly two objects with `path` and `caption`
- `sections`: exactly two objects with `title` and `body`
- `cta_title`
- `cta_body`

Use location and relocation content only when relevant and sourced. Otherwise use this page for the practical career decision, role impact, working pattern, and next step.

## Image requirements

- JPEG or PNG.
- Minimum 1200 pixels on the longer edge for prominent images where possible.
- No candidate photos or personal screenshots.
- Real images require a completed asset-ledger entry and a licence/permission basis.
- Concept art must be called a concept illustration in the visible caption.
- A factual map must come from authoritative geographic data and must carry required attribution in its visible caption.

## Content limits

The layout is intentionally constrained. Keep:

- headlines under 70 visible characters;
- deck and intro paragraphs under 240 characters;
- section bodies under 650 characters;
- card bodies under 360 characters;
- captions under 320 characters; and
- total extracted PDF text near 550 to 800 words.

The builder raises an error when a text block crosses the page-safe boundary. Shorten the writing or rebalance the page instead of shrinking type below the template standard.
