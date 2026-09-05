---
name: interview-prep-material
description: Internal recruiter capability for reusable, role-specific candidate interview prep material in a polished PDF. The recruiter front door selects this guide when Ja asks for interview prep material, a candidate-facing company and role presentation, or a visual brief that can be sent to multiple candidates. It is not a standalone invocation.
---

# Interview Prep Material

Create one polished, candidate-facing interview prep PDF for one exact company and one exact role. The material is reusable across candidates for that role. Candidate fit, compensation, interviewer names, interview dates, meeting links, and personal logistics stay in the individual email or candidate record.

This capability turns the proven presentation method into a client-neutral workflow. It must never carry facts, role names, images, or assumptions from an earlier brief into a new one.

Read [`references/content-contract.md`](references/content-contract.md) before building.

## Required inputs

- Exact company and role.
- Authoritative current JD or role specification.
- Confirmed work location or confirmed remote/hybrid arrangement.
- Current evidence that the role may be presented to candidates.
- Approved recruiter logo and any approved client brand assets.
- Current company, site, and location sources needed for external claims.

If the role may be researched but is not confirmed for candidate presentation, build only an internal draft. Never use an old JD, ATS record, advertisement, prior PDF, or previous conversation as proof that a role is still open.

## Source gate

1. Load the current project authority first when one exists. Follow its source precedence, review date, and role-status rules.
2. Treat the JD as authority for the mandate and requirements, not as proof of vacancy status.
3. Use current official public sources for company, site, and location facts. Use reliable public geographic data for maps.
4. Separate company-wide capability from site-specific capability. Do not claim that equipment, investment, headcount, product lines, budgets, relocation support, shifts, or advancement paths apply to the role unless the source says so.
5. Record each external claim in `source-ledger.md` with claim, source, publication date when available, retrieval date, scope, and status.
6. Record each visual in `asset-ledger.md` with creator, source page, direct asset URL or generated-file path, licence, allowed use, modifications, and rendered caption.

Candidate-facing release requires `source_control.publication_status` to be `approved_for_candidate_use`. If evidence supports only `draft_only`, use `--allow-draft`; the builder visibly marks every page as an internal draft.

## Editorial standard

Write for a strong passive candidate deciding whether the opportunity is worth a conversation. Aim for a 5 to 10 minute read and about 550 to 800 words.

- Page 1: company, relevant history, site, and why this opportunity exists.
- Page 2: the one exact role, its mandate, actual work, success measures, and working relationships.
- Page 3: operating environment and practical work context. Use location and commute context when material. For remote work, use confirmed working pattern, travel, team, and operating context instead.
- Page 4: the career and life decision, supported location/relocation context when relevant, and a restrained call to speak with Top Tier Talent Group.

Do not combine unrelated roles in one brief unless Ja explicitly requests a portfolio document. A different role requires a new role page and a complete source-freshness review of the full PDF.

## Visual standard

- Use the Top Tier Talent Group logo unless Ja requests another approved brand.
- Use a restrained palette, strong typography, consistent margins, and deliberate whitespace.
- Balance text and imagery on every page. Do not use decorative filler.
- Prefer real, current, licensed images for company, site, and location claims.
- Use generated imagery only as clearly labelled concept illustration. It cannot prove a product, plant, process, equipment, or location fact.
- Build maps deterministically from authoritative geographic data. Image generation is not acceptable for factual maps.
- Preserve image aspect ratio. Crop deliberately and disclose material edits in the asset ledger.
- Keep captions and licence links readable but visually subordinate.

## Build

Prepare a dedicated work directory containing:

```text
brief-content.json
source-ledger.md
asset-ledger.md
assets/
output/
qa/
```

Keep editorial content separate from layout. Populate `brief-content.json` according to the content contract, then run:

```bash
python3 modules/interview-prep-material/scripts/build_interview_prep_material.py \
  --data /absolute/work/brief-content.json \
  --out /absolute/output/Company_Role_Interview_Prep_Material.pdf \
  --bounds /absolute/qa/layout-bounds.json
```

Use `--logo /absolute/path/logo.png` only when an approved replacement logo is required. The default is the packaged Top Tier Talent Group logo.

For an internal draft whose role status is not confirmed:

```bash
python3 modules/interview-prep-material/scripts/build_interview_prep_material.py \
  --data /absolute/work/brief-content.json \
  --out /absolute/output/Company_Role_Interview_Prep_Material_DRAFT.pdf \
  --bounds /absolute/qa/layout-bounds.json \
  --allow-draft
```

The builder must fail on overflow, prohibited punctuation, missing required fields, invalid structure, missing images, unresolved publication status, or banned candidate terms found in the rendered text.

## Release QA

Render every page to PNG at a useful review size. Inspect every final page after the last build. Fix and rebuild if any page has clipping, overlap, weak hierarchy, stretched images, tiny captions, awkward crops, excessive empty space, crowding, broken links, or an unbalanced text/image ratio.

Run the opportunity validator:

```bash
python3 modules/interview-prep-material/scripts/validate_interview_prep_material.py \
  --pdf /absolute/output/Company_Role_Interview_Prep_Material.pdf \
  --data /absolute/work/brief-content.json \
  --bounds /absolute/qa/layout-bounds.json \
  --sources /absolute/work/source-ledger.md \
  --assets /absolute/work/asset-ledger.md
```

After actual human/vision review of every rendered page, write the canonical artifact QA record and run:

```bash
node scripts/validate-artifact-qa.mjs /absolute/qa/artifact-qa.json
```

Automated checks do not substitute for page-by-page visual inspection.

## Release gates

The final PDF must let a candidate answer all of these questions without recruiter explanation:

- Who is the company and what does the relevant operation do?
- Why does this exact role exist?
- What would I actually own and do?
- What would success look like?
- Where and how would I work?
- What practical location, travel, or relocation factors matter?
- What is the next step?

Release only when:

- the role is approved for candidate presentation;
- every claim is supported and correctly scoped;
- no candidate-specific information, private internal assessment, placeholder, or stale role appears;
- the source and asset ledgers are complete;
- the opportunity validator passes;
- every page was rendered and visually inspected;
- the canonical artifact QA validator passes; and
- the final PDF exists, is non-empty, searchable, and opens correctly.

## Output

Return the finished PDF as a clickable file link and state the exact company, role, location, source freshness date, and release status. Mention only unresolved facts that materially limit use. Do not send, publish, submit, update an ATS, or contact a candidate unless Ja separately authorizes that action.
