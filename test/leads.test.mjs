import assert from "node:assert/strict";
import test from "node:test";
import { contract, companyKey, jobKey, plan } from "../skills/tracker-manager/scripts/leads.mjs";

const config = {workbook_id: "synthetic-workbook", workbook_title: "Tracker", leads: {sheet_id: 456, tab: "Leads"}};
const snapshot = rows => ({workbook_id: config.workbook_id, title: config.workbook_title, sheet_id: 456, tab: "Leads", headers: contract.headers, rows});
const values = fields => contract.headers.map(header => fields[header] || "");
function lead(overrides = {}) {
  return {company_name: "Example Fabrication", company_url: "https://example.invalid", company_location: "Example City, ON",
    verification_result: "current_job_confirmed", primary_contact: {name: "Example Contact", title: "Plant Manager", profile_url: "https://example.invalid/contact"},
    company_source: {source_name: "Company careers", source_url: "https://example.invalid/careers"}, company_note: "Verified from company careers page.",
    jobs: [{job_title: "CNC Operator", job_url: "https://example.invalid/jobs/cnc?utm_source=test", job_location: "Example City, ON", compensation_exact: null, employment_type: "Full-time", source_name: "Company careers", source_url: "https://example.invalid/jobs/cnc", evidence_note: "Current listing."}], ...overrides};
}
function input(leads = [lead()], rows = [], mode = "preview") {
  return {mode, authorization: mode === "import" ? {operation: "import_leads", request: "Import verified Leads"} : undefined, checked_on: "2026-09-03", leads, snapshot: snapshot(rows)};
}

test("new confirmed company creates one parent and one child with Date Added", () => {
  const result = plan(input(), config);
  assert.deepEqual(result.counts, {new: 1, update: 0, skip: 0, hold: 0});
  const rows = result.actions[0].rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].values[contract.headers.indexOf("Status / Job")], "Active");
  assert.equal(rows[0].values[contract.headers.indexOf("Date Added")], "2026-09-03");
  assert.equal(rows[1].values[contract.headers.indexOf("Company")], "");
  assert.equal(rows[1].values[contract.headers.indexOf("Compensation")], "Not listed");
});

test("review, missing evidence, duplicate intake, and bad headers hold", () => {
  assert.equal(plan(input([lead({verification_result: "needs_review"})]), config).counts.hold, 1);
  assert.equal(plan(input([lead({company_source: {source_name: "", source_url: ""}})]), config).counts.hold, 1);
  assert.equal(plan(input([lead(), lead()]), config).counts.hold, 1);
  const bad = input(); bad.snapshot.headers = bad.snapshot.headers.slice(1);
  assert.throws(() => plan(bad, config), /headers/);
});

test("existing company and job are idempotent and preserve Date Added", () => {
  const original = lead();
  const existing = [
    {row_number: 2, values: values({Company: original.company_name, "Status / Job": "Active", Location: original.company_location, Posted: "Checked 2026-09-03", "Date Added": "2026-08-20", Source: "Company summary", Checked: "2026-09-03"}), links: {Company: original.company_url}},
    {row_number: 3, values: values({"Status / Job": "CNC Operator", Location: original.company_location, Posted: "Current listing", Compensation: "Not listed", "Employment Type": "Full-time", "Date Added": "2026-08-20", Source: "Company careers", Checked: "2026-09-03"}), links: {"Status / Job": "https://example.invalid/jobs/cnc"}}
  ];
  const result = plan(input([original], existing), config);
  assert.deepEqual(result.counts, {new: 0, update: 0, skip: 1, hold: 0});
});

test("company and job keys normalize source URLs and fallback safely", () => {
  const source = lead();
  assert.equal(companyKey(source), "domain:example.invalid");
  assert.equal(jobKey(source, source.jobs[0]), jobKey(source, {...source.jobs[0], job_url: "https://example.invalid/jobs/cnc"}));
  assert.match(jobKey({...source, company_url: ""}, {...source.jobs[0], job_url: "", source_url: ""}), /job:cncoperator/);
});

test("import needs exact explicit authorization and stale active records become Needs Recheck", () => {
  const noJobs = lead({verification_result: "no_current_job_found", jobs: []});
  const existing = [{row_number: 2, values: values({Company: noJobs.company_name, "Status / Job": "Active", Location: noJobs.company_location, Posted: "Checked 2026-08-20", "Date Added": "2026-08-20", Source: "Company summary", Checked: "2026-08-20"}), links: {Company: noJobs.company_url}}];
  const preview = plan(input([noJobs], existing), config);
  assert.equal(preview.actions[0].rows[0].changes.find(change => change.header === "Status / Job").value, "Needs Recheck");
  const run = input([lead()], [], "import"); run.authorization = {operation: "wrong"};
  assert.throws(() => plan(run, config), /authorization/);
});
