# Loxo Outreach: read-only draft review

This is an active safe reference for terminology, evidence review, and unsent
draft preparation only. It does not authorize or provide procedures for adding
people, changing a person or tag, editing a list, creating or changing a
campaign/deal/activity, uploading a document, saving a provider record,
activating a campaign, or sending a message.

## Read-only terminology

- An Outreach campaign is a sequence of stages with copy, timing, sender,
  audience, and delivery state.
- A draft may contain merge tokens such as person, job, or form fields. Tokens
  must be resolved and checked against verified case facts before approval.
- A/B variants, personalization, reply state, bounce state, click/open
  signals, pause state, and completion state are review labels, not proof of a
  successful send or candidate response.
- Deliverability review may note domain authentication, warm-up, complaint,
  unsubscribe, and provider-limit evidence. Missing or stale evidence remains
  unknown.

## Draft-review contract

An active case may return one editable, unsent draft plus a proposed target and
action manifest. The draft must have verified job/company/link facts, no
guessed recipients, no fabricated personalization, and an explicit list of
unresolved fields. A draft, saved-looking UI, campaign count, or sent-state
label is not proof that a message was delivered.

Any approved outbound or Loxo mutation routes through
`loxo-safe-pipeline-actions.md` and the restricted host adapter. The manifest
must identify exact person, campaign, job, company, or deal IDs and expected
current state. Execution requires Ja's explicit approval, a precondition
reread, serialized host-adapter execution one action at a time, post-action reread
of saved draft, recipient/link/attachment state, and no automatic retry after an
unknown result.

## Source and revalidation

Current vendor behavior belongs to the official Loxo Outreach collection:
<https://help.loxo.co/en/collections/8306153-outreach>. Product labels,
permissions, limits, and routes are mutable. This package records no account
IDs, recipients, live campaign data, or provider-specific click path.
