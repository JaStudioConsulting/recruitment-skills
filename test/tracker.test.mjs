import assert from "node:assert/strict";
import test from "node:test";
import { contract, buildRow, candidateKey, sheetDate, plan, compareRow, qa, ownership } from "../skills/tracker-manager/scripts/tracker.mjs";

// All examples in this test are synthetic. No mailbox or sheet calls occur.
const config = {workbook_id: "synthetic-workbook", workbook_title: "Tracker", sheet_id: 123, tab: "Submissions", owner_names: ["Example Recruiter"]};
const headers = contract.headers;
const col = h => headers.indexOf(h);
const verified = value => ({state: "verified", value, sources: ["email-example", "resume-example"]});
function event() {
  const fields = Object.fromEntries(headers.filter(h => !contract.metadata_fields.includes(h)).map(h => [h, {state: "unavailable", sources: ["email-example", "resume-example"], reason: "not stated in reviewed sources"}]));
  Object.assign(fields, {
    "Recruiter": verified("Example Recruiter"), "Candidate Name": verified("Example Candidate"),
    "Current / Most Recent Title": verified("Maintenance Technician"),
    "License & Certifications": verified(["Apprentice, level 3", "Exam pending"]),
    "Target Compensation / Current Rate": verified({current: "CAD 30/hour", target: "CAD 35-38/hour"}),
    "Profile Summary": verified(["Five years in maintenance", "Supports packaging machinery"]),
    "Additional Notes": verified({"Work status": "Source-confirmed work authorization", "Notice": "Two weeks"}),
    "Submission Type": verified("MPC"), "Role Submitted For": verified("Maintenance Technician"),
    "Client Submitted To": verified("Example Manufacturing")
  });
  return {kind: "original_submission", message_id: "synthetic-message-1", thread_id: "synthetic-thread-1", date: "2026-08-26", link: "https://mail.google.com/mail/u/0/#all/synthetic-message-1",
    review: {body: true, attachment_inventory_complete: true, attachments: [{id: "resume-example", reviewed: true, readable: true}], credentials: true, existing_row: true},
    evidence: {"email-example": {kind: "email", reviewed: true}, "resume-example": {kind: "attachment", reviewed: true}}, fields};
}
function input(events = [event()], rows = [], mode = "update") {
  return {mode, authorization: {operation: mode, request: "Update the Tracker from original submissions"}, verified_on: "2026-09-02", mailbox_scope: "complete_mailbox", excluded_non_events: true,
    snapshot: {workbook_id: config.workbook_id, sheet_id: config.sheet_id, title: config.workbook_title, tab: config.tab, headers, vocabulary_verified: true, vocabulary: {"Submission Type": ["MPC"], "Activity Status": ["Reviewing"]}, identity_index_complete: true, rows}, events};
}
const row = e => buildRow(e, headers, "2026-09-02");

test("fixed renderer preserves credential qualifiers, compensation distinction, and notes order", () => {
  const values = row(event());
  assert.equal(values[col("License & Certifications")], "Apprentice, level 3 | Exam pending");
  assert.equal(values[col("Target Compensation / Current Rate")], "Target: CAD 35-38/hour | Current: CAD 30/hour");
  assert.equal(values[col("Additional Notes")], "Notice: Two weeks | Work status: Source-confirmed work authorization");
  assert.equal(values[col("Profile Summary")], "Five years in maintenance. Supports packaging machinery.");
  assert.equal(values[col("Reason for Leaving")], "");
  assert.equal(values[col("Submission Date")], sheetDate("2026-08-26"));
});

test("live header reordering changes positions without changing field meaning", () => {
  const order = [...headers].reverse(), values = buildRow(event(), order, "2026-09-02");
  assert.equal(values[order.indexOf("Candidate Name")], "Example Candidate");
  assert.equal(values[order.indexOf("Submission Date")], sheetDate("2026-08-26"));
  assert.throws(() => buildRow(event(), headers.slice(1), "2026-09-02"), /headers/);
});

test("unchecked field, credential scan, attachment, or missing source holds the event", () => {
  for (const mutate of [e => {e.fields.Industry.state = "unchecked";}, e => {e.review.credentials = false;}, e => {e.review.attachments[0].readable = false;}, e => {e.review.attachment_inventory_complete = false;}, e => {e.fields["Candidate Name"].sources = ["unknown"];}, e => {e.fields.Industry.reason = "";}]) {
    const e = event(); mutate(e);
    const result = plan(input([e]), config);
    assert.equal(result.counts.hold, 1); assert.equal(result.counts.new, 0);
  }
});

test("a completed event is stable across repeat runs and different model phrasing", () => {
  const first = plan(input(), config), old = first.actions[0].values;
  const e = event(); e.fields["Profile Summary"] = verified(["Different prose about the same source facts"]);
  const rerun = input([e], [{row_number: 2, values: old}]); rerun.verified_on = "2026-09-03";
  const second = plan(rerun, config);
  assert.deepEqual(second.counts, {new: 0, update: 0, skip: 1, hold: 0});
  assert.equal(old[col("Source Verified Date")], sheetDate("2026-09-02"));
});

test("a source-backed blank repair changes only that cell and its verification date", () => {
  const old = row(event()); old[col("License & Certifications")] = ""; old[col("Source Verified Date")] = sheetDate("2026-08-26");
  const result = plan(input([event()], [{row_number: 8, values: old}]), config);
  assert.equal(result.counts.update, 1);
  assert.deepEqual(result.actions[0].changes.map(c => c.header), ["License & Certifications", "Source Verified Date"]);
  assert.equal(result.actions[0].row_number, 8);
});

test("ordinary reconciliation never backfills a blank Submission Date", () => {
  const old = row(event());
  old[col("Submission Date")] = "";
  const result = plan(input([event()], [{row_number: 8, values: old}]), config);
  assert.deepEqual(result.counts, {new: 0, update: 0, skip: 1, hold: 0});
  assert.equal(result.actions[0].values, undefined);
});

test("exact duplicates skip while real repeat candidate events remain separate", () => {
  const e = event(), next = event(); next.message_id = "synthetic-message-2"; next.link += "-2";
  const result = plan(input([e, e, next]), config);
  assert.deepEqual(result.counts, {new: 2, update: 0, skip: 1, hold: 0});
});

test("a single exact source with missing role or client is enriched instead of duplicated", () => {
  const old = row(event()); old[col("Role Submitted For")] = ""; old[col("Client Submitted To")] = "";
  const result = plan(input([event()], [{row_number: 2, values: old}]), config);
  assert.deepEqual(result.counts, {new: 0, update: 1, skip: 0, hold: 0});
});

test("shared message IDs require confirmed distinct events and remain idempotent", () => {
  const a = event(), b = event(); b.fields["Candidate Name"] = verified("Another Example Candidate");
  assert.equal(plan(input([a,b]), config).counts.hold, 1);
  b.distinct_event_confirmed = true;
  const first = plan(input([a,b]), config);
  assert.equal(first.counts.new, 2);
  const rows = first.actions.map(a => ({row_number: a.row_number, values: a.values}));
  assert.deepEqual(plan(input([a,b], rows), config).counts, {new: 0, update: 0, skip: 2, hold: 0});
});

test("multiple exact live matches are held", () => {
  const values = row(event());
  const result = plan(input([event()], [{row_number: 2, values}, {row_number: 3, values}]), config);
  assert.equal(result.counts.hold, 1);
});

test("legacy event fallback prevents a duplicate and fills missing source IDs", () => {
  const old = row(event()); old[col("Gmail Message ID")] = "";
  const result = plan(input([event()], [{row_number: 2, values: old}]), config);
  assert.equal(result.counts.new, 0); assert.equal(result.counts.update, 1);
});

test("a repair cannot overwrite a changed precondition or rename without its key", () => {
  const old = row(event()), e = event();
  e.target_row = 2; e.fields["Candidate Name"] = verified("Corrected Example Name");
  e.corrections = ["Candidate Name"];
  e.expected_previous = {"Candidate Name": "Example Candidate"};
  assert.equal(plan(input([e], [{row_number: 2, values: old}], "repair"), config).counts.hold, 1);
  e.corrections.push("Candidate Key"); e.expected_previous["Candidate Key"] = old[col("Candidate Key")];
  const result = plan(input([e], [{row_number: 2, values: old}], "repair"), config);
  assert.equal(result.counts.update, 1);
  assert.equal(result.actions[0].values[col("Candidate Key")], "corrected-example-name");
  e.expected_previous["Candidate Name"] = "Stale name";
  assert.equal(plan(input([e], [{row_number: 2, values: old}], "repair"), config).counts.hold, 1);
});

test("read-only checks never authorize their proposed rows", () => {
  const result = plan(input([event()], [], "check"), config);
  assert.equal(result.writable, false); assert.equal(result.counts.new, 1);
  const run = input(); delete run.authorization;
  assert.throws(() => plan(run, config), /request/);
});

test("wrong tab, incomplete identity index, and Sent-only discovery fail before planning", () => {
  const run = input(); run.snapshot.tab = "My Subs";
  assert.throws(() => plan(run, config), /configured/);
  run.snapshot.tab = "Submissions"; run.snapshot.identity_index_complete = false;
  assert.throws(() => plan(run, config), /identity/);
  run.snapshot.identity_index_complete = true; run.mailbox_scope = "sent_only";
  assert.throws(() => plan(run, config), /complete mailbox/);
});

test("live vocabulary rejects new invented statuses", () => {
  const e = event(); e.fields["Activity Status"] = verified("Invented status");
  const result = plan(input([e]), {...config, vocabulary: {"Activity Status": ["Reviewing"]}});
  assert.equal(result.counts.hold, 1);
});

test("row reread fails for changed content, numeric-string dates, or wrong columns", () => {
  const expected = row(event()), actual = [...expected];
  assert.equal(compareRow(expected, actual).pass, true);
  actual[col("Submission Date")] = String(actual[col("Submission Date")]);
  assert.equal(compareRow(expected, actual).pass, false);
});

test("QA catches duplicate events, stale filters and missing visual verification", () => {
  const run = input([event()], [{row_number: 2, values: row(event())}]);
  const snapshot = {...run.snapshot, filter: {startRowIndex: 0, startColumnIndex: 0, endRowIndex: 2, endColumnIndex: 21}};
  assert.equal(qa(snapshot, config).final_status, "partial");
  snapshot.visual_qa = "pass"; snapshot.format_qa = "pass";
  assert.equal(qa(snapshot, config).final_status, "pass");
  snapshot.filter.endRowIndex = 1;
  assert.equal(qa(snapshot, config).final_status, "fail");
  snapshot.filter.endRowIndex = 3; snapshot.rows.push({row_number: 3, values: row(event())});
  assert.match(qa(snapshot, config).failures.join(" "), /duplicate/);
});

test("dates and ownership use calendar months and retain the inclusive boundary", () => {
  assert.equal(candidateKey("  Example O'Name  "), "example-oname");
  assert.throws(() => sheetDate("2026-02-30"), /invalid/);
  assert.equal(ownership("2026-08-31", "2027-02-28"), true);
  assert.equal(ownership("2026-08-31", "2027-03-01"), false);
  assert.equal(ownership("2026-08-31", "2026-08-30"), false);
});
