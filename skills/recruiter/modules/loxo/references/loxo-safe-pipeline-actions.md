# Safe Loxo Pipeline Actions

Use this workflow when Ja wants candidates reviewed, classified, shortlisted,
rejected, or moved in a Loxo job pipeline. It converts review findings into an
exact, approval-gated action manifest. It never turns a conversational tally
into a bulk action.

This reference defines the workflow contract. The `loxo` guide remains
read-only and draft-only. A write can run only through a separately authorized
consumer executor that satisfies the restricted `loxo-automation` guide.

## Non-negotiable invariants

- One job per run.
- Use `person_id` and `job_id` as execution keys. Names are display labels only.
- Re-read live Loxo state. Never act from an old chat, dashboard count, or prior
  evaluation bucket.
- Manual recruiter activity wins. Never reverse a newer human move.
- Missing identity, weak evidence, disagreement, or changed state becomes
  `HOLD FOR JA`.
- Reject decisions require itemized evidence, a written reason, and explicit
  approval. Never batch-reject from a score alone.
- Unknown write results are unresolved. Do not retry automatically.
- Every successful write must be re-read and verified.

## Phase 1: Read-only review

Read the target job and current candidate records without changing Loxo. Create
one review row per candidate:

```text
run_id
person_id
job_id
display_name
current_stage
current_stage_verified_at
evidence_sources
decision
confidence
reason
exclusion_flags
proposed_action
```

Allowed decisions are `PASS`, `INVESTIGATE`, `WEAK`, `REJECT`, and `HOLD`.
These are review decisions, not pipeline stages. A decision does not authorize a
move.

Check at minimum:

- exact job association
- current stage and recent activity
- duplicate person or duplicate row
- ownership and newer manual movement
- prior rejection, do-not-contact, or conflict evidence
- evidence quality for the role criteria
- mismatch between candidate name and `person_id`

Store operational state only in the consuming host's protected case or run
store. Do not rely on conversation memory. Do not commit candidate rows, names,
IDs, or live Loxo data to this package.

## Phase 2: Build the action manifest

Create an immutable proposed manifest. Nothing changes in Loxo yet.

Each action row contains:

```text
manifest_id
run_id
person_id
job_id
expected_current_stage
proposed_stage
decision
confidence
reason
evidence_refs
reviewed_at
```

The approval view must show:

- exact manifest ID
- target job
- proposed count by action
- every reject as an itemized row
- hold and unresolved count
- duplicate and conflict count
- records excluded because current state already matches or changed

Never infer manifest rows from a total such as "6 pass and 54 investigate."
Resolve every row to one current `person_id` and one current `job_id` first.

## Phase 3: Independent audit

Run a separate audit pass over the frozen manifest. The audit pass may not add
new actions. It can approve a row or move it to `HOLD FOR JA`.

Check for:

- wrong job ID
- duplicate person or duplicate action
- candidate already moved or rejected
- candidate no longer in the expected stage
- identity mismatch
- unsupported classification
- conflict or do-not-contact evidence
- proposed action that exceeds Ja's request
- missing reason or weak evidence for rejection

Only reviewer and auditor agreement makes a row eligible for approval. Any
disagreement stays on hold.

## Phase 4: Human approval

Show Ja the exact manifest before any Loxo write. Approval must identify the
manifest ID and intended action scope. A request to review, rank, shortlist, or
clean up candidates is not itself write approval.

If the manifest changes after approval, generate a new manifest ID and obtain
new approval. Never silently extend an approved run.

## Phase 5: Serialized execution

The package does not expose a Loxo write tool. Execution requires both:

1. Ja's explicit approval of the exact manifest and action scope.
2. A consuming host with a verified allowed executor governed by
   `../loxo-automation/GUIDE.md`.

Immediately before each individual action, re-fetch and verify:

```text
person_id matches
job_id matches
current stage equals expected_current_stage
no newer manual activity changes the decision
record remains eligible for the approved action
```

If any precondition fails, skip that row and record the reason. Do not correct,
override, or substitute another record. Execute eligible rows sequentially so a
failure has a precise boundary.

## Phase 6: Verify and report

After each write, re-read the candidate in the target job and confirm the stage
or field now matches the approved action. Record:

```text
manifest_id
person_id
job_id
approved_action
result: verified | skipped | failed | unknown
verified_at
reason
```

Return a concise result:

- verified actions by type
- skipped rows and precondition failures
- failed or unknown rows
- holds requiring Ja
- final live stage count, clearly separated from the original proposal

Do not claim completion while any write is unverified.
