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
const today = "2026-09-04";
const planAt = (request, clock = today) => plan(request, config, {today: clock});
const field = (row, name) => row.values[contract.headers.indexOf(name)];
const existingCompany = (company, fields = {}) => ({row_number: 2, values: values({Company: company.company_name, "Status / Job": "Active", Location: company.company_location, Posted: "Checked 2026-09-03", Source: "Company summary", Checked: "2026-09-03", ...fields}), links: {Company: company.company_url}});
const existingJob = (job, fields = {}) => ({row_number: 3, values: values({"Status / Job": job.job_title, Location: job.job_location, Posted: "Current listing", Compensation: "Not listed", "Employment Type": job.employment_type, Source: job.source_name, "Verification / Notes": job.evidence_note, Checked: "2026-09-03", ...fields}), links: {"Status / Job": job.job_url}});

function snapshotAfter(result, originalRows = []) {
  let next = originalRows.map(row => ({...row, values: [...row.values], links: {...(row.links || {})}}));
  let rowNumber = Math.max(1, ...next.map(row => row.row_number || 0));
  for (const action of result.actions) for (const row of action.rows) {
    if (row.kind === "company_update") {
      const target = next.find(existing => existing.row_number === row.row_number);
      for (const change of row.changes) target.values[contract.headers.indexOf(change.header)] = change.value;
      continue;
    }
    next.push({row_number: ++rowNumber, values: [...row.values], links: {...row.links}});
  }
  return next;
}

test("new confirmed company creates one parent and one child with Date Added", () => {
  const result = planAt(input());
  assert.deepEqual(result.counts, {new: 1, update: 0, skip: 0, hold: 0});
  const rows = result.actions[0].rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].values[contract.headers.indexOf("Status / Job")], "Active");
  assert.equal(field(rows[0], "Date Added"), today);
  assert.equal(rows[1].values[contract.headers.indexOf("Company")], "");
  assert.equal(rows[1].values[contract.headers.indexOf("Compensation")], "Not listed");
});

test("new inactive company gets the injected Toronto insertion date and no child", () => {
  const result = planAt(input([lead({verification_result: "no_current_job_found", jobs: []})]));
  assert.deepEqual(result.counts, {new: 1, update: 0, skip: 0, hold: 0});
  assert.equal(result.actions[0].rows.length, 1);
  assert.equal(field(result.actions[0].rows[0], "Status / Job"), "N/A");
  assert.equal(field(result.actions[0].rows[0], "Date Added"), today);
});

test("review, missing evidence, duplicate intake, and bad headers hold", () => {
  assert.equal(plan(input([lead({verification_result: "needs_review"})]), config).counts.hold, 1);
  assert.equal(plan(input([lead({company_source: {source_name: "", source_url: ""}})]), config).counts.hold, 1);
  const duplicateBatch = planAt(input([lead(), lead()]));
  assert.equal(duplicateBatch.counts.hold, 2);
  assert.ok(duplicateBatch.actions.every(action => action.status === "hold" && action.rows.length === 0));
  const bad = input(); bad.snapshot.headers = bad.snapshot.headers.slice(1);
  assert.throws(() => plan(bad, config), /headers/);
});

test("mixed URL and no-URL duplicate companies in one intake batch hold without duplicate parents", () => {
  const withUrl = lead();
  const withoutUrl = lead({company_url: ""});
  const result = planAt(input([withUrl, withoutUrl]));
  assert.deepEqual(result.counts, {new: 0, update: 0, skip: 0, hold: 2});
  assert.ok(result.actions.every(action => action.status === "hold" && action.rows.length === 0));
});

test("duplicate jobs with identical URLs hold the lead without duplicate children", () => {
  const baseJob = lead().jobs[0];
  const result = planAt(input([lead({jobs: [baseJob, {...baseJob, source_url: "https://example.invalid/jobs/cnc?ref=duplicate"}]})]));
  assert.deepEqual(result.counts, {new: 0, update: 0, skip: 0, hold: 1});
  assert.equal(result.actions[0].rows.length, 0);
  assert.match(result.actions[0].reason, /duplicate|job/i);
});

test("duplicate jobs with one missing URL use title/location fallback and hold", () => {
  const baseJob = lead().jobs[0];
  const fallbackJob = {...baseJob, job_url: "", source_url: "https://example.invalid/careers/other-feed", job_title: " cnc operator ", job_location: "Example City, ON"};
  const result = planAt(input([lead({jobs: [baseJob, fallbackJob]})]));
  assert.deepEqual(result.counts, {new: 0, update: 0, skip: 0, hold: 1});
  assert.equal(result.actions[0].rows.length, 0);
  assert.match(result.actions[0].reason, /duplicate|job/i);
});

test("existing company and job are idempotent and preserve Date Added", () => {
  const original = lead();
  const existing = [
    {row_number: 2, values: values({Company: original.company_name, "Status / Job": "Active", Location: original.company_location, Posted: "Checked 2026-09-03", "Date Added": "2026-08-20", Source: "Company summary", Checked: "2026-09-03"}), links: {Company: original.company_url}},
    {row_number: 3, values: values({"Status / Job": "CNC Operator", Location: original.company_location, Posted: "Current listing", Compensation: "Not listed", "Employment Type": "Full-time", "Date Added": "2026-08-20", Source: "Company careers", Checked: "2026-09-03"}), links: {"Status / Job": "https://example.invalid/jobs/cnc"}}
  ];
  const result = planAt(input([original], existing));
  assert.deepEqual(result.counts, {new: 0, update: 0, skip: 1, hold: 0});
});

test("existing blank parent never receives Date Added during a status/check update", () => {
  const company = lead({verification_result: "no_current_job_found", jobs: []});
  const result = planAt(input([company], [existingCompany(company, {"Date Added": ""})]));
  assert.equal(result.counts.update, 1);
  assert.ok(result.actions[0].rows[0].changes.length > 0);
  assert.ok(result.actions[0].rows[0].changes.every(change => change.header !== "Date Added"));
});

test("existing nonblank parent date is immutable", () => {
  const company = lead({verification_result: "no_current_job_found", jobs: []});
  const result = planAt(input([company], [existingCompany(company, {"Date Added": "2026-08-20"})]));
  assert.ok(result.actions[0].rows.every(row => row.kind !== "company_update" || row.changes.every(change => change.header !== "Date Added")));
});

test("blank existing parent plus new child dates only the child", () => {
  const company = lead({jobs: [{...lead().jobs[0], job_title: "Maintenance Electrician", job_url: "https://example.invalid/jobs/maintenance"}]});
  const result = planAt(input([company], [existingCompany(company, {"Date Added": ""})]));
  const updates = result.actions[0].rows.filter(row => row.kind === "company_update");
  const children = result.actions[0].rows.filter(row => row.kind === "job");
  assert.equal(children.length, 1);
  assert.equal(field(children[0], "Date Added"), today);
  assert.ok(updates.every(row => row.changes.every(change => change.header !== "Date Added")));
});

test("existing blank child is never backfilled", () => {
  const company = lead();
  const result = planAt(input([company], [existingCompany(company, {"Date Added": ""}), existingJob(company.jobs[0], {"Date Added": ""})]));
  assert.deepEqual(result.counts, {new: 0, update: 0, skip: 1, hold: 0});
});

test("caller-supplied Date Added is rejected", () => {
  const result = planAt({...input(), date_added: "2020-01-01"});
  assert.equal(result.counts.hold, 1);
  assert.match(result.actions[0].reason, /date_added|Date Added|caller/i);
});

test("caller-supplied Date Added holds every lead and reports accurate counts", () => {
  const second = lead({company_name: "Second Example Fabrication", company_url: "https://second.example.invalid"});
  const result = planAt({...input([lead(), second]), date_added: "2020-01-01"});
  assert.deepEqual(result.counts, {new: 0, update: 0, skip: 0, hold: 2});
  assert.equal(result.actions.length, 2);
  assert.ok(result.actions.every(action => action.status === "hold"));
});

test("existing company without URL falls back to name when incoming URL is present", () => {
  const company = lead({verification_result: "no_current_job_found", jobs: []});
  const existing = existingCompany(company, {"Date Added": "2026-08-20"});
  existing.links = {};
  const result = planAt(input([company], [existing]));
  assert.equal(result.counts.new, 0);
  assert.equal(result.actions[0].rows.some(row => row.kind === "company"), false);
  assert.equal(result.actions[0].status, "update");
});

test("ambiguous name fallback is held instead of creating a duplicate company", () => {
  const company = lead({verification_result: "no_current_job_found", jobs: []});
  const first = existingCompany(company, {"Date Added": "2026-08-20"});
  const second = {...existingCompany(company, {"Date Added": "2026-08-21"}), row_number: 4};
  first.links = {};
  second.links = {};
  const result = planAt(input([company], [first, second]));
  assert.deepEqual(result.counts, {new: 0, update: 0, skip: 0, hold: 1});
  assert.match(result.actions[0].reason, /multiple|ambiguous|matching/i);
});

test("existing job without URL falls back to title and location when incoming URL is present", () => {
  const company = lead();
  const parent = existingCompany(company, {"Date Added": "2026-08-20"});
  const child = existingJob(company.jobs[0], {"Date Added": "2026-08-20"});
  child.links = {};
  const result = planAt(input([company], [parent, child]));
  assert.deepEqual(result.counts, {new: 0, update: 0, skip: 1, hold: 0});
});

test("ambiguous job fallback is held instead of adding a duplicate child", () => {
  const company = lead();
  const parent = existingCompany(company, {"Date Added": "2026-08-20"});
  const first = existingJob(company.jobs[0], {"Date Added": "2026-08-20"});
  const second = {...existingJob(company.jobs[0], {"Date Added": "2026-08-21"}), row_number: 4};
  first.links = {};
  second.links = {};
  const result = planAt(input([company], [parent, first, second]));
  assert.deepEqual(result.counts, {new: 0, update: 0, skip: 0, hold: 1});
  assert.match(result.actions[0].reason, /multiple|ambiguous|matching/i);
});

test("material company changes are not suppressed by repeat logic", () => {
  const company = lead({company_location: "New Toronto, ON"});
  const parent = existingCompany(company, {Location: "Old Toronto, ON", "Date Added": "2026-08-20"});
  const child = existingJob(company.jobs[0], {"Date Added": "2026-08-20"});
  const result = planAt(input([company], [parent, child]), "2026-09-04");
  assert.equal(result.counts.update, 1);
  const update = result.actions[0].rows.find(row => row.kind === "company_update");
  assert.ok(update.changes.some(change => change.header === "Location"));
});

test("repeat import on a later date produces zero changes", () => {
  const firstRequest = input();
  const first = planAt(firstRequest, today);
  const secondRequest = {...input(firstRequest.leads, snapshotAfter(first).map(row => row)), checked_on: "2026-09-05"};
  const second = planAt(secondRequest, "2026-09-05");
  assert.deepEqual(second.counts, {new: 0, update: 0, skip: 1, hold: 0});
  assert.deepEqual(second.actions[0].rows, []);
});

test("checked_on never becomes Date Added", () => {
  const result = planAt(input(), "2026-09-10");
  for (const row of result.actions[0].rows) assert.notEqual(field(row, "Date Added"), "2026-09-03");
  assert.equal(result.date_added, "2026-09-10");
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
