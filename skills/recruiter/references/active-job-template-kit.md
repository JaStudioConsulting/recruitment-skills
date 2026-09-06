# Active-job template kit

Every job created or started gets this reusable bundle. It is a set of editable
copy blocks, not an active campaign or a send instruction:

- `outreach.md`
- `rejection.md`
- `candidate-submission.md`
- `scheduling-availability.md`
- `candidate-follow-up.md`
- `client-follow-up.md` (client follow-up / after-call)
- `campaign-step.md`

The literal files live under `../assets/job-template-kit/`; the bundle's
outreach template is linked here as a representative asset:
[`outreach.md`](../assets/job-template-kit/outreach.md).
They contain merge tokens only, never real candidates, clients, recipients,
emails, phone numbers, or job-specific claims. Replace tokens only from facts
verified for the current job and case. Unknown job/company/link facts are a
hold until supplied or verified.

The kit is a flexible single-step building block. It does not canonize a
six-stage campaign sequence. Ja can edit the case copy and choose whether a
template remains a draft, is used once, or is added to a separately reviewed
campaign.

Default state is one unsent draft. A campaign activation, message send,
candidate submission, or CRM/Loxo write requires its own separate explicit authorization
for the exact audience, job, copy, and action. Before completion, reread the
saved draft, job/company/link facts, and attachment state. Unknown or changed
state is unresolved and must not be retried automatically.

The membership and required tokens are declared in
[`../../manifests/template-kits.json`](../../manifests/template-kits.json).
