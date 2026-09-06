# SF Jobs contract

`SF Jobs` is a read surface for the Workbench Jobs view. Workbench may query
and display the sheet, but Tracker Manager remains the sole writer. No
Workbench or recruiter module may infer a tab, workbook, or live row from a
title, screenshot, prior chat, or sample ID.

Before reading, resolve the configured workbook title, exact `SF Jobs` tab,
sheet ID, live headers, and current used range. The last verified live
baseline (2026-09-05 20:39:25 EDT) reported a grid of `A1:AA998`; only `A1:V1`
was populated with the authoritative schema below, while `W:AA` were blank.
This timestamp is a dated baseline, not a permanent guarantee. Dynamically
reread the header and grid at runtime. Stop and hold for review if the tab is
missing, duplicated, not the tab returned by host configuration, or if any
unexpected, renamed, duplicate, or newly populated header appears.

The expected data/header contract is `SF Jobs!A:V` with exactly these 22
headers, in this order. Trailing blank columns such as `W:AA` may exist in the
grid and must be tolerated and ignored; they are not part of the schema:

`Loxo Job ID`, `Client`, `Job Title`, `Public Title`, `Location`,
`Employment Type`, `Pay`, `Industry`, `HC`, `Must Have 1`, `Must Have 2`,
`Must Have 3`, `Owner(s)`, `Contact`, `Status`, `Published`, `Confidential`,
`Public Link`, `Full JD`, `JD Char Count`, `Updated`, `Last Synced`.

Use verified role-source fields only. Identity is the exact `Loxo Job ID` in
column A; matching by title, client, or company alone is ambiguous. Preserve
existing and manual override values, including deactivated rows. In the
verified schema, D and H:R are manual/override-preservation fields, while A:C,
E:G, and S:V are source/sync fields. Do not normalize or invent a status
vocabulary. `Full JD` and source URLs may be populated only from a verified
live source; when unavailable, preserve the existing value or hold the field
for review.

Every operation records the resolved workbook/tab/sheet identity and the live
state read. A readback must verify the exact row, all changed fields, and the
source link. An authorized write must reread the exact row before and after
serial execution through the protected Tracker Manager workflow. Do not guess
an exact `Jobs` tab or invent live IDs.

The Leads ledger remains separate and follows its own contract: parent company
rows with child job rows, canonical URL identity, planner-controlled statuses,
and `Date Added` set on first insertion in `America/Toronto`. Date Added is
immutable and never backfilled or updated from a verification date. The Leads
table expands with the actual used range; no permanent row-number boundary
applies.
