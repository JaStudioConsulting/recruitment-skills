---
name: write-up
description: Internal recruiter capability for a source-grounded candidate submission bundle. The recruiter front door selects this guide for a full package; it is not a standalone invocation. Gmail output is an unsent draft only when an allowed draft tool exists.
---

# Write-Up — Full Candidate Submission Bundle

Use the canonical contracts in [`docs/templates/submission-data-contract.md`](../../../../docs/templates/submission-data-contract.md) and [`docs/templates/presentation-email-contract.md`](../../../../docs/templates/presentation-email-contract.md) before drafting.

Preflight also checks long-dash, semicolon, tilde, education-date, immigration/PR, compensation-placement, exact-title, contact-removal, MPC filename/privacy, duplicate-output ownership, and missing-source stop conditions. These checks are not a second standalone skill.

The deliverable is a complete submission package Ja can review and send:

1. A **submission email**, drafted in Gmail in Ja's exact voice and format.
2. The **branded PDF resume**, built by this recruiter's `modules/brandedresume/scripts/build_resume.py` builder.

This is the "everything ready" path. The recruiter router supplies this guide and the branded-resume capability together.

## Guardrail — pause on anything missing (do this first)

One shot beats a redo. Before building the email or the PDF, scan the inputs for any missing or unclear field (a date, location, employer, comp, the client, the account manager, named-vs-MPC, a metric you can't source). **If anything is missing, STOP and ask Ja in one short batch** — list exactly what's unknown and, for each, ask: provide it, leave it blank, or take it out entirely. Do not guess, do not invent, do not fill a placeholder and build anyway. Only proceed once every gap is resolved. This saves tokens and avoids a rebuild.

## Inputs to gather first

Before writing, make sure you have (ask only for what is missing):

- **Candidate material** — resume/CV, and the **call transcript or recruiter notes** if Ja has them. The transcript is important: it carries the human context and detail that is not on the resume (motivation, what they actually own, why they're moving). Mine it.
- **The role** — title Ja is presenting them for.
- **The client** — company name (named submission) OR whether this is an **MPC** (speculative, anonymous).
- **The job description / client requirements** if available — this drives what gets bolded (see below).
- **Who the email goes to** — the client's account manager and optional internal-team mailbox, supplied by the consuming host. Confirm if missing; never infer an address.

If it isn't stated, ask: **named client submission or MPC?** The whole bundle changes between the two.

## How to work

1. **Read everything** — resume + transcript/notes + JD.
2. **Decide destination** — named client submission, internal-team MPC, or external-client blind MPC.
3. **Build the resume PDF** using this recruiter's brandedresume builder. Named client and internal-team MPC use real name and employers. Only external-client speculative MPC is blinded. Full rules live in `modules/brandedresume/GUIDE.md`. The full package inherits that guide's branded-PDF QA gate: render and inspect every page, complete the canonical artifact QA record after actual human/vision inspection, and obtain a successful validator run before calling the draft or package ready.
4. **Draft the email** in Gmail following the format below. Create exactly one unsent draft
   and never send it. If the host cannot attach files, hand over the separately verified PDF
   as ready to attach and say the draft has no attachment. If the host supports attachments,
   reread saved draft metadata and prove the exact PDF filename is attached before saying it
   is attached.
5. **Hand over**: the one unsent draft plus the separately verified PDF link. Do not claim a
   submission was sent.

## The submission email format

Short and tight. It should read in one pass, even out loud on a phone. Ja's signature is auto-attached by Gmail — **never write a signature**; end the body at `CV attached.`

### Subject line
- Named: `New Candidate Submission - [Role] - [Candidate Name] - [Client] - [City, ON]`
- MPC: `MPC - New Candidate Submission - [Title] - [Candidate Name] - [City, ON]`
- Separator is always a spaced hyphen ` - `. (A lead attached → `New Lead | MPC - New Candidate Submission - ...`.)

### Opening line
- Greeting: `Hi team,`
- Presenting line: `I would like to present [Name] for the [Role] with [Client].` Bold only the inline account-manager mention when required.
- MPC: `I'd like to share [Name], a [title] with [X]+ years ...` for internal-team MPC. External-client MPC stays blind.

### Label block (bold label, value, single-line stack)
```
Name:
Title:
Location: [City, ON]  | [relocation / commute note]
Compensation Target:
Current Compensation:
Vacation:
Work Status:
Interview Availability:
Start Date:
Reason for Leaving:
```
- Include the confirmed current employer naturally in the opening or Profile Summary when known, as required by `GLOBAL-RULES.md`; do not add an extra label to the locked field block. Only include fields that have real values. Never invent.
- `Reason for Exploring` may be captured internally from a call, but it never replaces `Reason for Leaving` in the external submission.

**Contact info (opt-in toggle):** The branded and MPC **resumes never contain contact info** (no email, no phone) — hard rule, no exceptions. The submission **email** carries contact **only when contact-info is turned on for that run**. When on, add a bold **Contact** line right after the opening line, before the Name block, in this form: `Contact: <phone> | <email>` (phone, then ` | `, then email). When off, omit it entirely. Default off unless the run asks for it.

### Profile Summary
Two parts, and it must add NEW information — **no redundancy** with the label block above (don't restate title/location/comp).

- **Narrative (2 short sentences, 3 only when needed), human and by name.** Lead with the person. Pull in supported call context without repeating labels. Only external-client blind MPC omits the name.
- **Bullets: not a fixed count. Scale them to the role.** Four is a good baseline for an individual-contributor or single-scope role. Senior, management, and leadership roles carry more when the fit genuinely needs it, so add bullets to cover the real scope (ownership, team size, systems, budgets, sites, cross-functional reach). Never pad to hit a number, and never stretch a thin candidate. Each bullet is a fresh, source-backed fact with a lead-in phrase and a number wherever the source supports it, with no overlap with the narrative or the labels.

### What to bold (JD-driven, not blanket)
Bold only what makes the reader's eye land on the match — the specific skills, certs, systems, metrics, and experience **this client's job description is asking for**. Most text stays plain. The right keywords change per role and industry (OEM names for automotive, food-safety/GFSI for food, etc.); let the JD decide. Do not bold everything.

### Close
`CV attached.` Then stop. No signature.

## Drafting the email (tool)

Use a Gmail draft tool only when the current host declares it. Otherwise deliver copy-paste chat text and say Gmail draft is unavailable. Match Ja's HTML style: `<p>` blocks, `<b>` for labels and JD keywords, a `<ul>` of `<li>` bullets. Bold the configured account-manager mention. Do not append a signature block. Use only host-supplied `to` and optional `cc` addresses. **Always create one draft only; never send.**

A worked skeleton is in `assets/submission_email_template.html`.

## Building the PDF

The resume is built by this recruiter's bundled builder so every host uses the same format. Run it from the installed package root:

```bash
python3 "skills/recruiter/modules/brandedresume/scripts/build_resume.py" \
  --data /tmp/candidate.json \
  --out "/absolute/path/to/output/<Candidate Name> - Top Tier Talent Group.pdf" \
  --preview /tmp/_preview.png
```

Follow `modules/brandedresume/GUIDE.md` data rules (even skill count, one title, no em/en dashes, no placeholders) and its **Named vs MPC** section for how to fill `candidate.json`. For MPC, the PDF filename can use the title, e.g. `Maintenance Manager - Top Tier Talent Group.pdf`. Look at the rendered pages and fix anything off: clipping, overlap, orphaned headings/bullets, logo placement, contact removal, page breaks.

The builder already verifies page count, forbidden punctuation, and hyperlinks, and refuses to
write a PDF that fails. No separate QA record or validator run is needed before handing the
package over.

## Send checklist (run this, nothing drifts)

- Subject, Named: `New Candidate Submission - [Role] - [Name] - [Client] - [City, ON]`
- Subject, MPC: `MPC - New Candidate Submission - [Title] - [Name] - [City, ON]`
- Named: use the host-configured account-manager address and the optional internal-team address. MPC: use only the configured internal-team mailbox.
- One Gmail draft, never sent, Ja reviews.
- Body ends `CV attached.` on its own line, with no typed signature.
- MPC to the team attaches the NAMED resume with real employers. The blinded MPC PDF is only for an external-client speculative send.
- Blinded PDF passes the anonymity gate: no name, contact, or real employer in the text, the filename, or the PDF metadata (the builder sets the PDF title from the `name` field, so the name slot must hold the title, not the person). When a long title sits in the name slot, set `name_size` to 15 so it renders cleanly.

## Done conditions

- Exactly one Gmail draft exists for this run and remains unsent.
- Draft recipients, subject, body, and saved state were reread and verified.
- Attachment proof matches the exact PDF filename when supported; otherwise the handoff says
  `PDF ready to attach; draft has no attachment`.
- The rendered pages are clean: no clipping, overlap, orphaned headings/bullets, misplaced logo,
  leftover contact details, or bad page breaks.

## Output

Hand over both pieces: the Gmail draft (open Drafts to review) and the PDF as a clickable link. One short line each. If anything essential was missing and you had to ask, say so plainly — never ship an invented fact or a placeholder.
