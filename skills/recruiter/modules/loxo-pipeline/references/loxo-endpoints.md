# Loxo endpoint & ID reference

Agent-agnostic reference for the Loxo calls this workflow uses. All paths are
relative to the agency host, e.g. `https://<agency>.app.loxo.co`. With
browser-session transport, call them with `fetch(path, {headers:{Accept:'application/json'}})`
from inside the logged-in page so session cookies apply. With API transport, use
the documented Loxo REST base + your API key.

`AGENCY_ID` and `JOB_ID` come from the pipeline URL:
`.../agencies/<AGENCY_ID>/jobs/<JOB_ID>/pipeline`.

## Reads

| Purpose | Path |
|---|---|
| Job header + stage counts | `GET /agencies/{AGENCY_ID}/jobs/{JOB_ID}.json` |
| Candidates on a job (paged) | `GET /agencies/{AGENCY_ID}/jobs/{JOB_ID}/candidates.json?per_page=250&page=N` |
| One person's full record | `GET /agencies/{AGENCY_ID}/people/{PERSON_ID}.json` |
| Person's resume list + text | `GET /agencies/{AGENCY_ID}/people/{PERSON_ID}/resumes.json` |
| One resume (full text) | `GET /agencies/{AGENCY_ID}/people/{PERSON_ID}/resumes/{RESUME_ID}` |
| Person's activity feed | `GET /agencies/{AGENCY_ID}/person_events.json?person_id={PERSON_ID}&per_page=80` |

Notes:
- The candidates list can be large — land it on disk; don't inline it.
- **Stage field depends on transport.** The **API/MCP** candidates list returns
  `workflow_stage_id` per candidate. The **browser** `candidates.json` does NOT
  (it returns `applied_at`, `rejected_at`, `applicant`, `latest_person_event`,
  `current_stage_agent_type_key`, but no `workflow_stage_id`). On the browser
  transport, derive stage from the candidate's latest job-scoped
  "Moved to <Stage>" event (see `scripts/pull_pipeline.mjs` `deriveStageId`),
  falling back to `applied_at` → Applied.
- Either way the `person` object carries `emails`, `phones`, `linkedin_url`,
  `current_title`, `current_company`, `city`, `state`, `location`.
- `applied_at` (browser transport) is the simplest applied-vs-sourced signal;
  on the API transport, look for an `applied` activity event on the job instead.
- `resumes.json` returns an array; each item has `id`, `name`, and usually
  `extracted_text` (the parsed resume-tab text). If `extracted_text` is null,
  fetch the single-resume path for it.
- `person_events.json` `job_id` filter is **not reliable** — it returns the
  agency-wide feed. Pull per person and filter client-side by `job_id`.
- Contact/outreach events (calls/emails/SMS) are logged at the **person** level
  with `job_id: null`, so they cannot always be tied to a specific job. Stage
  moves and notes *do* carry `job_id`.

## Workflow stage IDs (Loxo standard pipeline)

These are stable per agency; verify once via the job header `counts[]`.

| Stage | ID |
|---|---|
| Applied | 268196 |
| Longlist | 244487 |
| Shortlist | 244488 |
| Outbound | 244489 |
| Follow Up | 330190 |
| Screening | 244490 |
| Internal Submission | 245262 |
| Submitted | 244491 |
| Interview #1 | 244492 |
| Interview #2+ | 305775 |
| Offer | 245671 |
| Rejected | 244493 |
| Hired | 244494 |

## Activity-type IDs used here

| Activity | key | ID |
|---|---|---|
| Applied (via posting) | `applied` | 1937205 |
| Added to Job (sourced) | `identified` | 1937206 |
| Rejected | `rejected` | 1937229 |

"Applied vs sourced": look through a person's events for one tied to this
`job_id` whose activity type is `applied` (→ they applied) vs a
`Moved to Longlist` / `identified` / AI-sourced event (→ the team sourced them).

## Writes (gated — confirm first)

**Reject a candidate from a job** = create a "Rejected" activity event. It moves
them to the Rejected stage and is reversible (not a delete).

- API/MCP: `person_events_create` with
  `{ activity_type_id: 1937229, job_id: JOB_ID, person_id: PERSON_ID }`
  (optionally a `notes` field / rejection reason if the user specified one).
- Browser transport: POST the equivalent to the person-events endpoint with the
  page's CSRF token.

Do **not** attempt stage changes by PUTting `workflow_stage_id` on the candidate
record — that call is silently ignored. The activity-event route is what the UI
actually uses.

Always: confirm the exact list with the user, log the agreed reason, test on one,
verify, then batch.
