---
name: loxo-readonly-candidate-dashboard
description: Build a factual, job-by-job candidate review dashboard from Loxo using read-only tools. Use when the user asks to review a Loxo job, summarize its candidates, verify Applied status, check job-specific outreach, or create an external HTML dashboard with local Decision and Notes fields. Never write to Loxo.
---

# Loxo Read-Only Candidate Dashboard

## Purpose

Create an accurate candidate review dashboard for one Loxo job at a time without changing anything in Loxo.

The dashboard must help the recruiter quickly identify:

- Current Kanban stage
- Whether the purple Applied event exists
- Recent and relevant employment history
- Industry background
- Tickets and licences
- Job-specific outreach or activity
- Screening priority
- Local Decision and Notes

Loxo is always strictly read-only.

## Non-negotiable safety rules

Never call any Loxo create, update, delete, merge, apply, messaging, note, tagging, stage-move, or document-upload action.

Do not:

- Move candidates
- Update stages
- Add or edit notes
- Add or remove tags
- Send email, SMS, LinkedIn messages, or calls
- Create or update candidate records
- Upload documents
- Modify job records

Only use list, search, show, index, and download/read endpoints.

If the available tools do not support a required read operation, state the limitation. Never substitute a write action.

## Required workflow

### 1. Resolve the recruiter and target job

Identify the recruiter user ID when ownership matters.

Resolve the exact job using:

- Job title
- Company
- Location
- Job ID
- Ownership
- Active status

Do not assume the first returned job is correct. Confirm the exact job ID before processing candidates.

Process one job at a time unless the user explicitly asks for multiple jobs in one run.

### 2. Pull current candidates for the exact job

Use the job-specific candidate endpoint with the exact job ID.

Validate every returned candidate row:

- `candidate.job.id` must equal the target job ID
- Preserve the exact current workflow stage
- Preserve the candidate ID and person ID

If an endpoint unexpectedly returns agency-wide candidates, narrow the query and discard any candidate whose job ID does not match.

### 3. Confirm Applied independently from stage

The purple Applied badge is a separate Yes/No field.

Do not infer Applied from:

- Current stage
- Source
- Being in Shortlist, Screening, Outbound, or Rejected
- Having a resume
- Being added to the job

Applied = Yes only when a confirmed `Applied` person event exists for that person.

A prior application to another job can still support Applied = Yes when the user's rule is “has ever applied to Top Tier.”

When the user requires job-specific Applied status, count only an Applied event tied to the current job ID.

Default rule for this skill:

- Current-job Applied event = Yes
- Prior Top Tier Applied event = Yes only when explicitly confirmed and the user accepts historical Applied status
- No confirmed Applied event = No

Never guess.

### 4. Read employment history

Use `people_show` or `person_job_profiles_index` to retrieve structured employment history.

Employment Snapshot rules:

- Keep company, title, and dates together
- Include month and year when supported
- Use `Present` only when the record is current
- Show the most relevant and recent history covering about 10 years
- Do not list older roles unless they materially identify the candidate's background
- Summarize long tenure clearly
- Highlight progression, stability, industry, seniority, and possible job-hopping
- Flag overlapping or inconsistent dates instead of resolving them by assumption
- When dates are unavailable, write `Dates not listed in Loxo`

Good snapshot examples:

- `JFE Shoji Power | Shift Supervisor | Nov 2018 – Aug 2025`
- `13 years with JFE Shoji Power; progressed from steel-line operator to Shift Supervisor.`
- `15+ years in steel/tubular manufacturing; long-term Lead Hand experience.`

### 5. Determine industry factually

Use only evidence from:

- Company and role history
- Resume/profile description
- Structured job profiles
- Confirmed job or company data

Do not infer an industry from a vague title alone.

If the record is insufficient, use:

- `Not confirmed`
- `Industry not clear from Loxo record`

### 6. Extract tickets and licences

List only explicit certifications, tickets, licences, or formal training.

Examples:

- 309A Electrician
- 433A Millwright
- Forklift certification
- Overhead crane certification
- First Aid
- WHMIS

Do not convert general experience into a licence.

If none are listed, use `Not listed`.

### 7. Build job-specific Activity / Outreach

Activity is independent from Kanban stage.

Prioritize events tied to the target job ID.

Useful outreach states:

- `No job-specific outreach found`
- `LinkedIn connection request sent • Jul 17, 2026 • Ja • no reply confirmed`
- `Email sent • Jul 16, 2026 • Ja • no reply confirmed`
- `Email attempted • bounced • Jul 15, 2026 • Eileen`
- `Called • no answer / voicemail left • Jul 17, 2026 • Ja`
- `Reached by phone • Jul 17, 2026 • Ja • not looking to move`
- `Candidate replied • Jul 18, 2026`

Do not label a candidate as contacted merely because they are in Outbound or Screening.

Ignore administrative stage-move events when determining outreach unless no other activity exists and the dashboard needs a stage-history note.

When activity exists only on another job, label it separately:

- `Prior activity found, but none tied to this job`

### 8. Produce the final row model

The required row columns and normalized input schema live in
[`references/row-format.md`](references/row-format.md). A synthetic test-only
payload for the builder is kept at
[`../../../../tests/fixtures/synthetic-candidate-dashboard.json`](../../../../tests/fixtures/synthetic-candidate-dashboard.json);
it is not production data.
Allowed `activity_type` values are `none`, `attempted`, `reached`, `bounced`,
and `replied`.

Preserve every non-empty current stage exactly as supplied. The builder accepts
arbitrary agency stage names. If `job.stage_order` is supplied, it is the
preferred order and any observed stages not listed there are appended in first
appearance order. Without `job.stage_order`, all observed stages remain visible
in first appearance order. Never force candidates into a repository-owned stage
list or drop a valid custom stage.

### 9. Generate the external HTML dashboard

The dashboard must:

- Be a standalone HTML file
- Require no server
- Work when opened locally
- Group candidates by stage
- Show stage counts
- Support search
- Filter by stage
- Filter by Applied Yes/No
- Filter by outreach status
- Expand or collapse stages
- Include editable Decision and Notes fields
- Save Decision and Notes to browser `localStorage`
- Never send changes back to Loxo
- Export CSV
- Export JSON

Decision options should default to:

- Unreviewed
- Priority
- Screen
- Hold
- Pass
- Contacted
- Submit

The visual design can vary. Functional behaviour and factual rules must remain consistent.

The outreach control filters the normalized `activity_type` field. It must
include All, No job-specific outreach (`none`), Attempted, Reached, Bounced, and
Replied. Kanban stage is never used as an outreach proxy.

Use `scripts/build_dashboard.py` when available.

### 10. Present a concise completion summary

Report:

- Candidate count
- Confirmed Applied count
- Job-specific outreach count
- Confirmed reached/replied count
- No-outreach count
- Any important data limitations

Stop after the current job unless the user instructs you to continue.

## Quality checks before delivery

Verify all of the following:

- Every row belongs to the target job
- Exact current stage is preserved
- Applied is event-based, not stage-based
- Employment dates were not invented
- Industry was not guessed
- Tickets/licences were not inferred
- Outreach is job-specific where possible
- Stage moves are not mislabeled as contact
- Decision and Notes are local only
- No Loxo write tool was called

## Failure handling

If structured employment is missing:

- Use the current company/title from the person record only when explicitly present
- Mark dates as unavailable
- Do not fabricate chronology

If activity types are ambiguous:

- Retrieve activity type definitions
- Prefer clear labels such as Sent Email, Responded, Left Voicemail, or LinkedIn Connection Request Sent
- Mark uncertain activity as `Activity found; outreach type not confirmed`

If candidate count or endpoint scope looks wrong:

- Re-run with exact job ID
- Validate every returned job ID
- Do not continue until the dataset is job-specific
