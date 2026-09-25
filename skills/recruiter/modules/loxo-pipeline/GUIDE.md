---
name: loxo-pipeline
description: >-
  Prepare a Loxo job pipeline export, offline candidate review, or exact
  approval-gated rejection manifest. Use for pipeline pulls, applied versus
  sourced review, resume and activity enrichment, review pages, and requested
  pipeline cleanup. Repository helpers are offline cores and do not prove a
  live Loxo connection.
---

# Loxo Pipeline

This module defines an agent-neutral pipeline workflow. It can normalize data,
write review artifacts, and enforce mutation gates. It does not include a live
Loxo adapter, browser driver, credentials, agency IDs, job IDs, workflow-stage
IDs, or activity-type IDs.

## Golden rules

1. **Never make the user copy and paste a bulk JSON response.** A verified host
   adapter lands large responses on disk. If no adapter is available, report the
   blocker and stop.
2. **Reads are free; writes are gated.** A write requires an exact immutable
   preview, matching explicit approval, a precondition reread, serialized
   execution, and post-write readback.
3. **Keep bulk data out of conversation context.** Process exports on disk.
4. **Reconcile counts.** Candidate and stage counts must reconcile with the
   current job response. A mismatch is a blocker, not an estimate.
5. **Do not claim live operation from offline tests.** The included tests use
   synthetic transports only.

## Transport contract

The scripts accept only a declared transport supplied by the consuming host:

- `pullPipeline(config, transport)` requires
  `transport.getJSON(relativePath)`.
- `executeRejectManifest(...)` additionally requires
  `transport.createPersonEvent(payload)`.

The repository does not select a browser, reuse a profile, inject page globals,
or mount an HTTP client. Direct script execution fails closed. A host adapter
may use an authenticated browser session or the official API, but it must
normalize that transport behind the declared methods above.

No live Loxo adapter or workstation execution route is verified by this module.

## Explicit validated config

Before any read, construct config from the current job and agency metadata. The
pull config requires:

- `baseUrl` — the agency subdomain origin, e.g. `https://<agency-slug>.app.loxo.co`. Not the bare `https://app.loxo.co` host: it content-negotiates to JSON, so the per-candidate `loxo_url` profile links (built from `baseUrl`) would open a raw JSON blob instead of the profile page.
- `agencyId`
- `jobId`
- an absolute `outputDir`
- a filesystem-safe `slug`
- `stages`, as current `{ id, name, include }` records
- `appliedStageId`, referring to one supplied stage

The reject config also requires `rejectedStageId` and
`rejectedActivityTypeId`. Those values must come from the current agency
workflow or a verified host configuration. Never copy account or stage IDs from
this repository or a prior run.

Validation rejects missing IDs, duplicate stage IDs or names, unknown stage
references, unsafe paths, an empty inclusion set, and malformed URLs before a
transport call is possible.

See [`references/loxo-endpoints.md`](references/loxo-endpoints.md) for the
observed browser response fields and adapter boundary.

## Read-only workflow

### 1. Resolve one current job

Resolve the exact agency and job identity from the current URL or verified API
record. Read the job header and current stage metadata. Do not reuse a prior
agency, job, workflow, or activity ID.

### 2. Select included stages

Set `include: true` only on the current stage records requested for this run.
Stage names and IDs are agency inputs. The scripts do not define a standard
pipeline or silently drop custom stages.

### 3. Pull every candidate

Page through the exact job candidate endpoint. Land large responses on disk.
Refuse a potentially truncated result when the configured page limit is
reached.

An API adapter may return `workflow_stage_id`. The observed browser candidate
response does not. For that browser shape, derive current stage from the latest
job-scoped `Moved to <Stage>` event and map the exact stage name to the supplied
config. Use `applied_at` only as the configured Applied-stage fallback. Unknown
stage state is not guessed.

### 4. Enrich per person

For each exact `person_id`:

- Read the resume list and extracted text.
- Read person events, then filter job-scoped events client-side by exact
  `job_id`.
- Determine Applied versus sourced from `applied_at` or the matching Applied
  event, depending on the transport.
- Preserve contact activity as evidence. Do not infer outreach from stage.

### 5. Assemble and review

Write one JSON and one CSV for the current job plus resume-text files when
present. By default, also run `scripts/build_review.py` to produce the compact
offline card review and hand back its link — every pull yields the review page
unless the request was export-only (CSV/JSON) or cleanup-only. The separate
read-only dashboard module owns the normalized table dashboard.

## Optional rejection workflow

Only use this path after Ja explicitly asks for pipeline cleanup.

1. Produce an itemized manifest. Each action must contain one `personId`, the
   exact expected current stage ID, and a written evidence-based reason.
2. Call `buildRejectPreview(...)`. Show the exact ordered list, manifest ID, and
   digest. This is preview only and performs no read or write.
3. Wait for approval that matches the action, manifest ID, digest, and ordered
   person IDs exactly.
4. Immediately reread the candidate and job-scoped events. Skip changed,
   missing, already-rejected, duplicate, or unresolved records.
5. Execute sequentially. The first eligible record is the test-of-one.
6. Reread the job candidate record. The observed browser response exposes
   `rejected_at`, so verification requires that field to become non-null. It
   does not assume the browser response contains `workflow_stage_id`.
7. If a write throws, returns a non-success status, or lacks verified readback,
   stop. An unknown result is never retried automatically.

The exact safety chain is: immutable preview, explicit approval, precondition
reread, one serialized write, and documented-field readback.

## Scripts

- `scripts/pull_pipeline.mjs` validates current config and builds pipeline
  artifacts through a declared read transport.
- `scripts/build_review.py` turns normalized pipeline JSON into an offline card
  review.
- `scripts/reject.mjs` builds an immutable rejection preview and enforces exact
  approval, precondition reread, test-of-one, sequential writes, and readback.

These scripts are tested only with synthetic data. They are not evidence of a
working live adapter.

## Guardrails

- No credential entry, CAPTCHA handling, or login-wall bypass.
- No names as execution keys. Use exact `personId` and `jobId`.
- No duplicate person actions.
- No batch derived from a conversational count.
- No mutation without matching approval.
- No retry after an unknown outcome.
- No completion claim without post-write readback.
