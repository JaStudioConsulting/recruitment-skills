# Loxo endpoint and transport reference

This is an adapter contract, not a live connector. The repository does not ship
authentication, a browser driver, an API client, account IDs, workflow-stage
IDs, or activity-type IDs.

The internal browser paths below describe the response shape observed by this
workflow. An official API adapter uses its documented agency slug and API path,
then normalizes responses behind the same declared transport interface.

## Required explicit validated config

Resolve every value from the current agency and job before a run:

```text
baseUrl
agencyId
jobId
stages: [{ id, name, include }]
appliedStageId
rejectedStageId             # rejection runs only
rejectedActivityTypeId      # rejection runs only
```

Stage and activity IDs are agency inputs. There is no standard numeric ID table
in this repository. Read current job stage metadata or use a verified host
configuration. Never reuse an ID from another agency or prior run.

## Declared transport

Read-only pulls require:

```text
transport.getJSON(relativePath) -> parsed JSON
```

Approved rejection execution additionally requires:

```text
transport.createPersonEvent({
  agencyId,
  activityTypeId,
  jobId,
  personId,
  notes
}) -> { status }
```

The host owns authentication, CSRF handling when applicable, request origin,
and error normalization. Repository scripts never reach for browser globals.

## Observed browser reads

| Purpose | Relative path |
|---|---|
| Job header and stage counts | `GET /agencies/{AGENCY_ID}/jobs/{JOB_ID}.json` |
| Candidates on one job | `GET /agencies/{AGENCY_ID}/jobs/{JOB_ID}/candidates.json?per_page={PAGE_SIZE}&page={PAGE}` |
| One person | `GET /agencies/{AGENCY_ID}/people/{PERSON_ID}.json` |
| Resume list and extracted text | `GET /agencies/{AGENCY_ID}/people/{PERSON_ID}/resumes.json` |
| One resume | `GET /agencies/{AGENCY_ID}/people/{PERSON_ID}/resumes/{RESUME_ID}` |
| Person events | `GET /agencies/{AGENCY_ID}/person_events.json?person_id={PERSON_ID}&per_page={PAGE_SIZE}` |

Large candidate lists must be paged and landed on disk. Reaching a configured
page limit while the last page is full is a truncation error.

## Candidate and stage fields

The official API and internal browser response are not identical.

- An API adapter may return `workflow_stage_id` on a job candidate.
- The observed browser candidate response does not return
  `workflow_stage_id`. It returns fields including `applied_at`, `rejected_at`,
  `applicant`, `latest_person_event`, and `current_stage_agent_type_key`.
- For the browser shape, derive current stage from the latest job-scoped
  `Moved to <Stage>` person event, mapped to the exact supplied stage config.
- If no move exists and `applied_at` is non-null, use the supplied
  `appliedStageId`.
- If current stage still cannot be resolved, hold the record. Do not invent a
  stage.

The browser candidate object normally nests identity and contact fields under
`person`. A normalized API adapter may place them on the candidate itself. The
helper supports both shapes but still requires an exact person ID.

## Person events

The person-events endpoint can return agency-wide history. Filter locally by
exact `job_id` for stage and application evidence. Person-level calls, emails,
and messages may have a null `job_id`, so do not claim they are job-specific
without evidence.

Applied versus sourced uses the returned activity key or name and exact job
identity. Do not substitute a stage label for an Applied event.

## Rejection write and readback

A rejected candidate is represented by a person event tied to the exact person
and job. The activity type ID is supplied in current validated config. The
repository does not contain or infer that ID.

Execution is unavailable until the consuming host provides a verified declared
mutation transport. Before any write, require an immutable itemized preview,
matching explicit approval, and a precondition reread. Execute sequentially,
with the first eligible record as the test-of-one.

After a successful event response, reread the candidate on the target job. The
observed browser candidate transport returns `rejected_at`, so readback is
verified only when that field is non-null. Do not verify a browser rejection by
reading `workflow_stage_id`, because that field is not present in the documented
browser response.

If the write result or readback is unknown, stop and do not retry automatically.
