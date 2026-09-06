---
name: loxo
description: Use for read-only Loxo ATS/CRM orientation and draft preparation for Ja and Top Tier Talent Group. Use for source-grounded findings, exact-record review, or an approval manifest; live changes belong to the protected host adapter and safe pipeline contract.
---

## Interface

Candidate prospecting and campaign learning follows `references/prospect-campaign-learning.md` and remains read-only unless the existing authorization gate is satisfied.

This internal guide can run in any approved host that exposes a verified browser or read-only Loxo integration. Host-specific tools are adapters, not authority.

When Ja gives a task:
1. Identify the Loxo surface (job, person, company, deal, list, campaign).
2. Load the relevant read-only reference (platform map / outreach / BD orientation).
3. Restate the task in one line and the planned action sequence.
4. Keep this guide read-only or draft-only. Return source-grounded findings or manual draft bullets only; do not execute browser/provider click paths.
5. Any live change must route through `references/loxo-safe-pipeline-actions.md`: exact record IDs, an immutable action manifest, Ja's explicit approval, precondition reread, serialized host-adapter execution, post-action reread, and no automatic retry after an unknown result. The restricted `loxo-automation` guide is only a separately authorized consumer executor.
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
   - `references/loxo-platform-overview.md` - the read-only platform map for translating Ja's wording into the correct Jobs, People, Source, pipeline, profile, extension, stage-automation, Outreach, Companies, Tasks, Schedule, or Reports surface. Historical workflow research is retained in `references/ARCHIVAL-loxo-workflow.md` and is non-runnable; the map never overrides approval, ownership, Activity, DNC, or read-only rules.
   - `references/loxo-safe-pipeline-actions.md` for review, action manifests, independent audit, approval, precondition checks, serialized execution, and post-write verification.
   - `references/gmail-loxo-candidate-reconciliation.md` for evidence-based reconciliation of Gmail submission history, Loxo stages, job association, and structured candidate fields.
   - `references/loxo-candidate-fit-review.md` for the read-only, job-linked Profile, Resume, Activity, and optional LinkedIn sequence used to decide whether one pipeline candidate fits the exact role.
   - `references/loxo-linkedin-candidate-vetting.md` for read-only candidate vetting against the exact LinkedIn social-profile link visible on the Loxo profile before ranking or pitching.
   - `references/loxo-outreach.md` for campaigns, deliverability, personalization, metrics, A/B tests, scheduling, merge tags, and email/SMS behavior.
   - `references/ARCHIVAL-loxo-business-development.md` for dated BD provenance only; it is non-runnable. Use the read-only platform map for orientation and the safe action contract for any approved mutation.
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
- For bulk contact work, prepare an import-ready draft first; do not import, associate, tag, list, campaign, or submit from this guide.
- For outbound work, prepare copy and a proposed target/action manifest only; do not send or activate a campaign from this guide.
- Log all candidate notes via the **Activity tab** (not the Intake tab). Use note types like `*Note` or `Candidate Intake - Recruiter Screening/Interview` as appropriate.
- Compensation fields (Salary/Bonus/Equity Target and Current) live in the Profile tab Compensation section, not in notes.

## Historical Browser Reference (non-runnable)

The detailed historical browser procedures are preserved in the [non-runnable archival browser procedures](references/ARCHIVAL-browser-procedures.md). They are evidence only, never an execution path.
## Outreach Orientation

`references/loxo-outreach.md` is a dated, non-authoritative reference for
read-only terminology and draft review. This guide does not add people to
lists or campaigns, modify campaign steps, activate a campaign, or send a
message. Any approved outbound mutation must use the safe action contract with
exact person/campaign/job IDs, an immutable manifest, Ja's explicit approval,
precondition reread, serialized host-adapter execution, post-action reread,
and no automatic retry.

## Business Development Orientation

Use the platform map for read-only orientation across Companies, Contacts, and
Sales CRM. The historical BD note is provenance only. Prepare research,
candidate-marketing copy, or a proposed deal/activity manifest as drafts; do
not create or update deals, lists, activities, documents, pitches, campaigns,
or messages here. Route any approved mutation through the safe action contract
with exact IDs and the full reread/serialization/no-retry gate above.

## Output Shape For Ja

For every Loxo task, structure the response:

- **Task** — one-line restatement.
- **Plan** — read-only inspection and draft/manifest preparation steps.
- **Gate** — the exact mutation scope requiring Ja's explicit approval.
- **Result** — findings or draft returned; no live change is claimed here.
- **Verification** — source/identity/state checks completed before handoff.
- **Open risks / human review** — anything Ja should double-check.

For CSV work, columns that map cleanly into Loxo: `First Name`, `Last Name`, `Full Name`, `Title`, `Company`, `Location`, `LinkedIn`, `Email`, `Phone`, `Tags`, `Notes`.
