# Leads layout reference

Leads uses a two-tier parent-child layout. A verified company is one parent
row with the company, status, location, contact, source/notes, and dates. Each
confirmed job is a child row directly beneath it with a blank Company cell.
An investigated company with no confirmed active role is one `N/A` row and no
child. A review hold is not written.

The canonical 11 headers and identity/date rules are in
[`../../references/leads-contract.json`](../../references/leads-contract.json).
The planner owns `Date Added` and uses the current `America/Toronto` date only
on first insertion. Existing values, including blanks, are preserved. `Checked`
is the source verification date and is not `Date Added`.

## Column roles

| Header | Parent company row | Child job row |
| --- | --- | --- |
| Company | verified company name | blank, inherits parent |
| Status / Job | `Active`, `N/A`, or `Needs Recheck` | exact verified job title |
| Location | company facility/location | job location when stated |
| Primary Contact | verified name and title | blank |
| Posted | `Checked YYYY-MM-DD` | `Current listing` |
| Compensation | blank | exact stated pay or `Not listed` after review |
| Employment Type | blank | verified type or `Unknown` |
| Date Added | planner-owned first-insert date | planner-owned first-insert date |
| Source | `Company summary` | source platform/name |
| Verification / Notes | source-grounded summary | direct job URL or evidence note |
| Checked | source verification date | source verification date |

Parent notes use a count such as `1 confirmed job stored directly underneath.`
Inactive-company notes state that the exact company and current job sources were
searched without a confirmed active listing. Contact names, where present, use
the source-backed name and title; no contact or job detail is inferred.

An unresolved `needs_review` intake is a planner `HOLD` action and is not a
cell status. Use `Needs Recheck` only when an existing active company has no
current job, as defined by the planner. Use `Company summary` for a parent source and a `Current listing` for a child
posting. Keep source URLs and verification notes in their mapped columns. Do
not shift content beyond the live headers, invent a status, or use a fixed row
boundary; there is no permanent row-number boundary. Formatting, grouping, filters, and visual QA are applied only by the
protected Tracker Manager execution path after exact identity checks.
