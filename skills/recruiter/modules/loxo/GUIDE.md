---
name: loxo
description: Use for Loxo ATS/CRM work for Ja and Top Tier Talent Group: jobs, candidates, contacts, companies, tags, filters, imports, intake notes, submissions, MPC/spec CVs, outreach campaigns, business development deals, and Loxo help-center workflows. Use when the user asks how to do something in Loxo, wants Loxo-ready steps, or wants recruiting workflow actions executed in Loxo via the browser.
---

## Interface

This internal guide can run in any approved host that exposes a verified browser or read-only Loxo integration. Host-specific tools are adapters, not authority.

When Ja gives a task:
1. Identify the Loxo surface (job, person, company, deal, list, campaign).
2. Load the relevant reference file (workflow / outreach / BD).
3. Restate the task in one line and the planned action sequence.
4. Keep this guide read-only or draft-only. Return navigation, source-grounded findings, or manual draft bullets only.
5. Stop if the request would change Loxo. A separate named human authorization and a verified, allowed browser tool are both required before the restricted `loxo-automation` guide may be considered.
6. Stop and ask if the surface or intent is unclear, or if the UI doesn't match expectations.

# Loxo

This skill is the repository-owned Loxo operating guide for Ja's recruiting workflow. It is grounded in Loxo Help Center references and contains no account IDs, staff identities, live records, or credentials.

Repository references are retained operating notes. Firecrawl is an optional external research integration declared in `skills/manifests/plugins.json`; no local agent cache is authoritative.

Operating mode: this guide is read-only and draft-only. It may inspect a verified Loxo surface and prepare manual bullets. It does not execute Loxo changes. A Loxo mutation is outside this guide unless Ja supplies separate named human authorization and the approved host exposes a verified allowed tool.

## Maintenance protocol

When live Loxo behavior differs from these references, stop and report the discrepancy. Propose a repository change through normal review. Installed package files are immutable runtime assets and must never be edited by a host.

## Source Rule

Use this order:

1. Start at `skills/recruiter/SKILL.md`, then read this `GUIDE.md` for the right lane and action pattern.
2. Load the relevant reference file:
   - `references/loxo-platform-overview.md` - the video-grounded platform map for translating Ja's wording into the correct Jobs, People, Source, pipeline, profile, extension, stage-automation, Outreach, Companies, Tasks, Schedule, or Reports surface. This is orientation only and never overrides approval, ownership, Activity, DNC, or read-only rules.
   - `references/loxo-workflow.md` for jobs, people, candidates, submissions, resumes, status, tags, filtering, and imports.
   - `references/loxo-safe-pipeline-actions.md` for review, action manifests, independent audit, approval, precondition checks, serialized execution, and post-write verification.
   - `references/gmail-loxo-candidate-reconciliation.md` for evidence-based reconciliation of Gmail submission history, Loxo stages, job association, and structured candidate fields.
   - `references/loxo-candidate-fit-review.md` for the read-only, job-linked Profile, Resume, Activity, and optional LinkedIn sequence used to decide whether one pipeline candidate fits the exact role.
   - `references/loxo-linkedin-candidate-vetting.md` for read-only candidate vetting against the exact LinkedIn social-profile link visible on the Loxo profile before ranking or pitching.
   - `references/loxo-outreach.md` for campaigns, deliverability, personalization, metrics, A/B tests, scheduling, merge tags, and email/SMS behavior.
   - `references/loxo-business-development.md` for companies, account-based prospecting, deals, MPC/spec CV, sales activities, and client BD.
3. If article-level detail is needed, use current official Loxo Help Center documentation through an approved research adapter.
4. If the live UI doesn't match what's documented, screenshot, stop, and report — do not guess at click paths.

## Protected workflow routes

- For a read-only fit check on one candidate already attached to one Loxo job,
  load `references/loxo-candidate-fit-review.md` plus the recruiter decision and
  vetting frameworks. Start from the exact job and its requirements, then review
  Profile, Resume, same-job Activity when relevant, and only the exact LinkedIn
  link visible on the Loxo profile when public corroboration is useful. Return a
  `GO`, `NEEDS VERIFICATION`, or `NO-GO` verdict without changing Loxo.
- For candidate review or a request to shortlist, reject, move, or clean up a
  job pipeline, load `references/loxo-safe-pipeline-actions.md`. Review and
  manifest preparation are read-only. Any write remains separately authorized.
- For after-call or submission-history cleanup using Gmail evidence, load
  `references/gmail-loxo-candidate-reconciliation.md`, then route its proposed
  changes through the safe pipeline action manifest.
- For candidate ranking or pitch preparation that uses public LinkedIn evidence,
  load `references/loxo-linkedin-candidate-vetting.md`. For a job-linked review,
  start with the target job; for proactive MPC/Pitch, start with the approved
  client, deal, role, or candidate-marketing brief. Then read the candidate's
  current Loxo state and open only the exact LinkedIn social-profile link visibly
  attached to that Loxo profile. If no link is present, do not search for or
  guess the person's LinkedIn identity.
- Never execute from a conversational count, candidate name alone, or a prior
  review bucket. For a job-linked action, resolve one current `person_id`, one
  current `job_id`, and the expected current state. For proactive MPC/Pitch,
  resolve the current `person_id`, expected current state, and approved client,
  deal, role, or candidate-marketing context; do not invent a `job_id`.

## Ja Defaults

- Loxo agency URL: supplied by the consuming host. Never commit or infer an agency or owner ID.
- Treat hiring managers and client-side people as `Contacts`, not candidates.
- Treat placeable people as `Candidates`; client-side people remain `Contacts`.
- Keep recruiting facts strict: do not invent candidate details, salary, availability, credentials, client interest, emails, or current roles.
- For bulk contact work, prepare import-ready CSV first, then map into Loxo fields.
- For outbound work, use tags, notes, list/campaign ownership, and a clear response-tracking surface.
- Log all candidate notes via the **Activity tab** (not the Intake tab). Use note types like `*Note` or `Candidate Intake - Recruiter Screening/Interview` as appropriate.
- Compensation fields (Salary/Bonus/Equity Target and Current) live in the Profile tab Compensation section, not in notes.

## Historical Browser Reference (non-runnable)

The detailed historical browser procedures are preserved in the [non-runnable archival browser procedures](references/ARCHIVAL-browser-procedures.md). They are evidence only, never an execution path.
## Outreach Rules

> ARCHIVAL, NON-EXECUTABLE: The operational details below are historical
> reference only. Do not start, send, or modify a campaign from this section.
> Route any approved action through `loxo-automation/GUIDE.md`.

Load `references/loxo-outreach.md` for full detail.

Core rules:

- Finalize the campaign (subject, body, schedule, sender, audience filter) before adding people.
- Personalize subject/body when useful; use merge tags from the outreach reference.
- Respect operating hours if enabled.
- Check deliverability (SPF/DKIM/DMARC, warmup, complaint rate) before bulk sends.
- Direct replies pause campaign behavior; link clicks or external bookings may not.
- Keep volume ramp conservative on newer domains: 3-5/day to start, ≤10% daily increase.
- **Never start a campaign send without Ja's yes plus a preview of the full message.**

## Business Development Rules

Load `references/loxo-business-development.md` for full detail.

Core BD model:

1. Build account/company list.
2. Find decision-makers.
3. Fetch or verify contact data.
4. Add to list/campaign/job pipeline where appropriate.
5. Create or update Deals for real opportunities.
6. Use MPC/spec CV when pitching a candidate proactively.

For deal creation/updates, gate before saving. For MPC outreach, gate before sending.

## Output Shape For Ja

For every Loxo task, structure the response:

- **Task** — one-line restatement.
- **Plan** — numbered steps you're about to execute in the browser.
- **Gate** — what action needs Ja's yes (or "no gate, executing now").
- **Result** — after execution, what changed, with screenshot reference.
- **Verification** — what you confirmed (record persisted, count correct, etc.).
- **Open risks / human review** — anything Ja should double-check.

For CSV work, columns that map cleanly into Loxo: `First Name`, `Last Name`, `Full Name`, `Title`, `Company`, `Location`, `LinkedIn`, `Email`, `Phone`, `Tags`, `Notes`.
