# Gmail to Loxo Candidate Reconciliation

Use this workflow after calls or submissions when Ja wants Loxo job association,
submission stage, compensation, shift, availability, or related candidate fields
checked against recruiter email evidence.

This is a one-job reconciliation. It starts read-only, produces a proposed
change manifest, and preserves unknowns. It does not authorize a Gmail send or a
Loxo write.

## Evidence hierarchy

Use the strongest source that directly proves the fact:

1. Sent recruiter-to-client email or forwarded submission with verified sender,
   recipient, candidate, role, and date.
2. Internal recruiter submission email tied to the candidate and role.
3. Recruiter-confirmed candidate communication, call evidence, or activity note.
4. Existing Loxo record.

An internal submission is not proof that the candidate reached the client. A
draft is not proof of sending. A subject-line match without verified message
participants and body context is not enough.

Use only an approved Gmail read connector supplied by the consuming host. Keep
raw email bodies and recipient addresses out of this package and any reusable
learning file. Operational evidence references may retain the minimum needed
message or thread ID, date, and source type in the protected run record.

## Step 1: Scope the target job

Resolve one exact target job. Record its `job_id`, title, client, and current
pipeline stages. Stop if the job is ambiguous.

Retrieve each relevant candidate's current job association, stage, recent
activity, and target structured fields before proposing a change. Use
`person_id` and `job_id` as keys.

## Step 2: Find Gmail evidence

Search sent mail and relevant internal threads using the candidate, role, client,
and practical date window. Check:

- internal submission messages
- recruiter-to-client submission messages
- forwarded submissions
- BCC copies where headers prove the client destination
- client replies that clearly identify the candidate and role
- candidate communications that explicitly confirm compensation, shift,
  location, availability, or notice period

Capture source type, message or thread ID, sender, recipient class, date, role,
and the exact supported fact. Do not copy full messages into the manifest.

## Step 3: Classify submission status

Use exactly these evidence states:

- `CLIENT_SUBMITTED`: verified evidence that the candidate profile or resume was
  sent to the client. Proposed Loxo stage may be `Submitted`.
- `INTERNAL_SUBMISSION`: verified internal presentation, with no verified client
  delivery. Proposed Loxo stage may be `Internal Submission`.
- `UNKNOWN`: evidence does not prove either state. Propose no stage change.

Do not downgrade a newer verified Loxo stage merely because an older email shows
an earlier step.

## Step 4: Reconcile job association and fields

If Gmail directly proves the candidate belongs to the target job but Loxo lacks
the association, propose the association in the manifest. Similar background is
not proof of job association.

Propose structured field changes only when explicit evidence supports the value:

- current compensation
- desired compensation
- shift preference
- availability type
- location
- notice period or start availability
- other task-approved candidate fields

When stronger, dated recruiter-confirmed evidence conflicts with an existing
Loxo field, show both values and propose the supported correction. Do not clear
or overwrite a field when the source conflict is unresolved.

Leave unsupported fields blank or unchanged. Never infer a value from title,
industry, location, job history, or compensation patterns.

## Step 5: Build the proposed change manifest

Nothing changes yet. Each row contains:

```text
manifest_id
person_id
job_id
current_job_association
current_stage
evidence_state
evidence_refs
current_field_values
proposed_job_association
proposed_stage
proposed_field_changes
reason
confidence
```

Include an audit-note draft for each proposed stage change. Keep it concise and
identify source type and date without copying the full email body or recipient
address.

Route the manifest through the audit, approval, precondition, execution, and
verification phases in
[`loxo-safe-pipeline-actions.md`](loxo-safe-pipeline-actions.md). Any Loxo write
requires separate approval of the exact manifest.

## Step 6: Verify approved writes

After every approved write, re-read the record and confirm:

- target job association
- latest activity and stage
- every changed field
- audit activity, when the approved action included one

A successful API or browser response is not sufficient. If a value does not
persist, report it as failed or unknown and do not retry automatically.

## Result for Ja

Return a compact table:

```text
Candidate | Client evidence | Current Loxo stage | Proposed or verified result | Fields changed | Exception
```

Then report:

- confirmed client submissions
- internal-only submissions
- unknown or unresolved records
- verified field corrections
- fields deliberately left blank or unchanged
- skipped, failed, or unknown writes

Do not include candidate-specific examples in this repository reference.
