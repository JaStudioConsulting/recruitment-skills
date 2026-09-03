# Tracker routing

Use this adapter when a request asks Recruiter to update, sync, audit, repair,
search, or verify Tracker Submissions, or preview/import verified Tracker Leads.

## Canonical authority

After Recruiter's authority check, load the returned canonical Tracker guide:
[protected Tracker Manager](../../../tracker-manager/GUIDE.md).

It and its row contract belong to the same verified repository version. The
host supplies only workbook/account configuration and working connections.
Never substitute old vault instructions or invent missing field-writing rules.

Keep Tracker schema, source hierarchy, event identity, write scope, ownership,
formatting and QA in that protected implementation. Use its offline planner
before every write; the primary agent sends only the validated returned values
through the actual scoped Sheets connection.

## Authorization handoff

Pass the exact request and authorization to Tracker Manager.

- Check, search, audit, verify, or asking whether Tracker is current is
  read-only.
- Update, sync, bring current, or add submissions authorizes only the
  source-backed Submissions writes defined by Tracker Manager.
- Previewing Leads is read-only. Importing Leads requires an explicit request
  to import Leads and the validated `import_leads` authorization defined by
  [the protected Leads guide](../../../tracker-manager/leads/GUIDE.md).
- Repair, fix, or fill authorizes only the exact source-backed corrections
  defined by Tracker Manager.
- Candidate vetting, packaging, resume creation, submission writing, or Gmail
  draft creation does not authorize a Tracker write.

An unsent draft is not a submission event. Tracker ingestion starts from an
original sent submission or MPC email accepted by Tracker Manager's source
rules.

## Ownership boundary

Recruiter owns recruiting intake, candidate artifacts, and mode selection.
Tracker Manager owns every Tracker read, Gmail reconciliation, manifest,
mutation, sort, filter change, formatting operation, ownership check, and QA.
Recruiter must not write to the workbook directly.

Only the host-declared Submissions ledger is writable by default. The
host-declared Leads tab becomes writable only for a validated, explicitly
authorized Leads import. Every other Tracker surface remains read-only.

The Gmail source connection and authenticated Sheets connection may use
different Google accounts. Never require or attempt an account merge.

## Completion

Return Tracker Manager's operation-specific result without replacing its
status fields or claiming a pass that Tracker Manager did not verify.
