# Protected Tracker Leads workflow

Use this guide only through `$recruiter` and the Tracker routing adapter. GitHub
`JaStudioConsulting/recruitment-skills` main is the sole rule source. Hosts may
provide a Sheets adapter, but they must not provide a competing Leads schema or
write workflow.

## Scope

This workflow imports verified company and hiring leads into Tracker's `Leads`
tab. It preserves the existing company-parent and child-job layout:

- One company row contains company, status, location, primary contact, company
  verification summary, `Date Added`, and `Checked` date.
- Each confirmed job is a child row directly beneath that company.
- `Date Added` is assigned only when a row is first added. Existing dates are
  never overwritten.

Load [the Leads contract](../references/leads-contract.json) and run
[the planner](../scripts/leads.mjs) before every proposed write. The planner
does not access Sheets; it accepts a live snapshot plus a validated intake.

## Intake and evidence gates

Every lead requires company name, company-source name and URL, and a
`checked_on` date. Use only these verification results:

- `current_job_confirmed`: requires at least one job title, source name and
  source URL. It produces `Active` plus child-job rows.
- `no_current_job_found`: requires no job rows. It produces `N/A` for a new
  company and `Needs Recheck` for an existing active company.
- `needs_review`: always becomes `HOLD`; do not write it.

Unknown data stays blank. Do not guess location, contact, compensation,
employment type, job title, or hiring status. `Not listed` is permitted only
for confirmed jobs whose compensation source was reviewed and did not state a
rate.

## Deterministic identity and repeat runs

Company identity is normalized company website domain, falling back to normalized
company name. Job identity is company identity plus canonical job URL, falling
back to normalized job title and location. Multiple existing company matches,
duplicate intake companies, invalid URLs, changed headers, incomplete evidence,
or `needs_review` all become `HOLD`.

An exact repeat produces `skip` and no write. An existing company receives only
the supported minimal status/check changes; a newly confirmed job becomes one
new child row. Preserve existing primary contact, notes, manual follow-up work,
and `Date Added` unless an explicitly approved repair says otherwise.

## Approved execution

`preview` is read-only. `import` requires an explicit request to import Leads
and an authorization object with `operation: "import_leads"`. Before writing:

1. Verify the exact workbook, `Leads` tab, sheet ID, live headers, filter,
   hidden columns, grouped rows, conditional formatting, and nearest complete
   company/job exemplar.
2. Read the complete live company/job identity index and provide it to the
   planner with hyperlink metadata. Never deduplicate only against a partial
   range.
3. Show Ja the planner counts and every `HOLD`. Wait for approval to execute
   the returned `new` and `update` actions.
4. Re-read each target row immediately before writing. Write raw values and
   hyperlink metadata; never compose a user-supplied Sheets formula.
5. Copy formatting only from the nearest matching company or child-job row.
   Keep the existing active-hiring green, pale-blue child rows, hidden columns,
   grouping, and filter semantics.
6. Re-read each changed row and run a visual QA pass. Report adds, updates,
   skips, holds, exact rows, filter state, and visual QA result.

No other tab, sharing permission, date history, company contact, manual note,
or job row may change as a side effect.
