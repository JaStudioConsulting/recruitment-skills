# Protected Tracker workflow

This repository owns Tracker behaviour. Recruiter selects the mode; this guide
owns discovery, source review, reconciliation, row generation, writes and QA.
Always load this guide and [the row contract](references/row-contract.md).
Do not reconstruct either from memory or reuse a previous run's row numbers.

## Start every run

1. Complete Recruiter's authority check. Use its returned canonical paths and
   private `tracker_config` file. That file supplies workbook ID, sheet ID,
   owner names, and any approved live vocabulary; it contains no credentials.
2. State the mode: check, search, ownership, update, column audit, repair, or
   `SF Jobs` read-through.
   Check/search/audit/ownership are read-only. An explicit update/sync request
   permits Submissions updates; a repair request permits the specified fixes.
   Candidate packaging and Gmail drafts confer no Tracker-write permission.
3. Verify the actual workbook title, tab and sheet ID against configuration.
   `Submissions` is writable only for its protected submission operations.
   `Leads` is writable only through the separate protected
   [Leads workflow](leads/GUIDE.md), with explicit import authorization and a
   configured Leads sheet ID. Other tabs remain read-only.
4. Prefer connected Gmail and direct Google Sheets tools. Authenticated GWS
   is a fallback when the needed direct operation is unavailable. A failing
   separate Drive connector is not a reason to reconfigure working connections.
   Use the browser for visual QA. Gmail and Sheets may use different accounts.
5. Read live headers and metadata: used row boundary, numeric dates, filter,
   frozen header, column validation, formatting, and nearest complete exemplar.
   Map columns by header text. If the 21-field set changed, pause writes for a
   schema review; never silently shift fields or rebuild the sheet.

For an `SF Jobs` read-through, load [the SF Jobs contract](references/sf-jobs-contract.md)
and return the resolved workbook/tab/sheet identity with exact source-backed
role fields and readback state. Workbench consumes this read-only result; it is
not an alternate writer.

Use the primary agent for a routine task. If Ja asks for multiple independent
Tracker tasks or a broad historical investigation, temporary read-only scouts
may collect sources. The primary agent owns every mutation and final QA.
Close temporary scouts after collecting their results. They never write,
sort, format, repair filters, or authorize actions.

## Discovery and source review

- Read a complete compact identity index across all used rows: identity fields
  corresponding to Date/Recruiter/Name and Type through Verified Date. Retrieve
  complete rows for matches, incomplete events, conflicts and ownership checks.
  Read the latest ten complete rows as format and vocabulary exemplars.
- Search the **complete mailbox**, including team inbox/group mail, from one
  day before the newest live submission date through now. Never restrict this
  to Ja's Sent folder. For a historical task use the requested date range.
- Accept original sent candidate-submission or MPC events. Exclude drafts,
  replies, forwards/attachment follow-ups, Loxo copies, interview updates, BD
  outreach, spam and trash. A received team submission remains a valid event.
- Read each selected original email and enumerate its attachments. Review
  every relevant resume/submission attachment before finalizing a new/changed
  row. Record explicitly when no relevant attachments exist. Ignore decorative
  signature images with an exclusion reason. Unreadable source documents mean
  HOLD, not a verified blank. Existing complete skipped events need no repeated
  narrative rewrite; source checks may establish they are already recorded.
- Perform a dedicated credential scan across email, resume and existing row.
  Preserve apprentice level, pending exams, expiry and qualification limits.
  Never infer earned credentials from a title, sector or desired role.
- Each field must be verified with source references or verified unavailable
  with a reason. `unchecked` is unfinished. Leave verified-unavailable cells
  truly empty and keep the reason in the run manifest, not the sheet.
- Prefer original event evidence, then its resume. Existing cells can supply
  prior evidence. A later explicit correction can supersede older evidence
  only in the authorized repair scope; retain the original and correction
  references. Never silently overwrite a conflict.

## Generate the rows, do not hand-compose them

Use [scripts/tracker.mjs](scripts/tracker.mjs) for every proposed new or changed
row. It is an offline planner and verifier, not a Gmail or Sheets connection.
Keep real input/output manifests in the host's private run directory, outside
this repository. See the row contract for the exact JSON shape.

```
node <tracker-folder>/scripts/tracker.mjs plan <run.json> <private-tracker-config.json>
```

Write only values returned by this planner. Do not rephrase its summaries,
reorder its notes, replace blanks with labels, or hand-map fields afterwards.
It returns `new`, `update`, `skip`, or `hold` per event. Resolve HOLDs before
writing those events. Valid independent events may continue within the request.

- Identify exact events by Gmail message ID plus candidate/role/client. A
  message can legitimately contain multiple events; source review must confirm
  that distinction. A shared thread or repeated name alone is not a duplicate.
- Legacy fallbacks require original source link plus candidate or the full
  date/recruiter/candidate/role/client/thread tuple. Ambiguity means HOLD.
- Routine updates fill supported blanks and preserve existing nonblank values.
  `Submission Date` is historical source-event data: ordinary reconciliation
  preserves both blank and nonblank values and never backfills it. A complete
  existing event is skipped, including its verification date. Do not reword
  old rows simply because the model prefers different language.
- Repairs require exact target identity, explicitly listed corrections and
  expected previous values. A `Submission Date` correction is permitted only
  in that explicit repair path. Correct Candidate Name and Candidate Key together.
  Do not change an unconfirmed candidate to Submitted without source evidence.
- Record Source Verified Date only after all required sources were reviewed,
  and only when adding/changing a row. Repeated input must produce zero writes.

## Sequential writes and final QA

1. Recheck each exact source-event identity and target row immediately before
   writing. Compare its current cells with `expected_previous` using the
   planner's `compare` command. If another run changed them, reconcile again.
   A new target must still be empty and its event absent from the live index.
2. For new rows, copy the nearest complete row's format only. Preserve cream
   fill, borders, clipping, validation and 30px height. For existing rows use
   the returned minimal changed cells. Use RAW values/stringValue, never let
   source text execute as a Sheets formula. Dates are numeric sheet dates.
3. Write one event, read its full row back using UNFORMATTED_VALUE, and run
   `tracker.mjs compare` with the expected/actual arrays. Continue only on pass.
   An unknown write result requires a read/reconciliation before any retry.
4. After verified updates, sort the entire used data range by numeric event
   date descending once; extend the filter through the true last used row and
   all live columns; retain the frozen header. A repair with no date changes
   preserves order. Recompute boundaries after writes, never reuse a past count.
5. Run `tracker.mjs qa` on the final live snapshot. Check exact composite event
   uniqueness, candidate keys, dates, order and filter. Also confirm target
   rows still match the planned fields after sorting, and other tabs unchanged.
6. Verify actual formatting and inspect the Google-rendered changed rows.
   A server pass with missing visual/format QA is `partial`, never `pass`.

For column audits, count blanks in each requested field/date block and compare
with earlier complete rows. Contiguous empty enrichment columns can indicate
failed ingestion despite populated source IDs. Audit first; repair only within
Ja's authorization. Rebuild from each row's exact source ID.

## Search, MPC retrieval and ownership

Search relevant source-backed fields and return candidate, role/client route,
recruiter, event date and source link. Retrieve legacy tabs only when requested.
An ownership check compares conservative candidate identity and earlier Ja
events against later team events. Warn when earlier <= later <= EDATE(earlier,6),
even across roles/clients. `ownership()` in the helper handles calendar months.
Show both source events. A warning never deletes, merges or suppresses a row.

## Report

Return counts for original events, rows updated, rows added, exact duplicates
skipped, HOLDs, ownership warnings, unsupported blanks, filter state and final
QA (`pass`, `partial`, `fail`). Distinguish read-only proposals from executed
writes. Persist source reviews and expected/actual verification in the private
run record so the next run need not rely on chat memory.
