import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (relative) => readFile(path.join(root, relative), "utf8");
const rawRecipientPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const assertNoRawRecipients = (content) => {
  if (rawRecipientPattern.test(content)) throw new Error("raw recipient address is not allowed");
};

test("Candidate Prep is a flexible draft workspace with hard action gates", async () => {
  const contract = await read("skills/recruiter/references/candidate-prep-workspace.md");
  const manifest = JSON.parse(await read("skills/manifests/workflows.json"));
  const workflow = manifest.workflows.find((item) => item.id === "candidate_prep_workbench");
  assert.ok(workflow);
  assert.equal(workflow.router, "recruiter");
  assert.equal(workflow.external_actions, "none_until_separately_authorized");
  for (const output of ["branded_resume_draft", "candidate_submission_draft", "presentation_email_draft", "loxo_update_bullets"]) assert.ok(workflow.outputs.includes(output));
  for (const status of ["ready_for_review", "needs_sources", "needs_conflict_review", "drafting", "draft_ready", "blocked_authorization", "verified", "failed"]) assert.ok(contract.includes("`" + status + "`"), `${status} missing`);
  assert.match(contract, /flexible subset|selected subset/i);
  assert.match(contract, /No send, candidate\s+submission, Tracker write, Loxo write, or candidate movement/i);
  assert.match(contract, /post-action reread/i);
  assert.match(contract, /not visible.*Run Skill|not visible “Run Skill”/i);
  assert.match(contract, /fake completion|fabricate rows|demo candidates/i);
});

test("active-job kit is complete, tokenized, and non-addressed", async () => {
  const manifest = JSON.parse(await read("skills/manifests/template-kits.json"));
  const kit = manifest.kits.find((item) => item.id === "active-job");
  assert.ok(kit);
  assert.equal(kit.available_when, "job_created_or_started");
  assert.equal(kit.flexible_single_step, true);
  assert.equal(kit.default_state, "one_unsent_draft");
  assert.deepEqual(kit.templates.map((item) => item.id), ["outreach", "rejection", "candidate-submission", "scheduling-availability", "candidate-follow-up", "client-follow-up", "campaign-step"]);
  for (const item of kit.templates) {
    const content = await read(`skills/${item.asset}`);
    for (const token of item.required_tokens) assert.ok(content.includes(token), `${item.id} missing ${token}`);
    assert.doesNotMatch(content, rawRecipientPattern);
    assert.doesNotMatch(content, /app\.loxo\.co|candidate_id|client_id|@toptiertalentgroup/i);
    assert.doesNotMatch(content, /gmail\.send|candidate_submit|sendMessage|activateCampaign/i);
    assert.doesNotMatch(content, /\b(?:John|Jane|Smith|Acme|Top Tier)\b/i);
  }
  const routing = await read("skills/recruiter/references/active-job-template-kit.md");
  assert.match(routing, /separate.*authorization/i);
  assert.match(routing, /reread.*saved draft.*attachment|saved draft.*link/i);
  assert.match(routing, /single-step/i);
});

test("SF Jobs remains a verified read-through and Leads preserves ledger invariants", async () => {
  const sf = await read("skills/tracker-manager/references/sf-jobs-contract.md");
  assert.match(sf, /read surface for the Workbench Jobs view/i);
  assert.match(sf, /Tracker Manager remains the sole writer/i);
  assert.match(sf, /SF Jobs!A:V/);
  assert.match(sf, /A1:AA998/);
  assert.match(sf, /W:AA.*blank/is);
  assert.match(sf, /tolerated and ignored/is);
  assert.match(sf, /2026-09-05 20:39:25 EDT/);
  assert.match(sf, /unexpected.*renamed.*duplicate.*header/is);
  assert.match(sf, /D and H:R.*manual\/override-preservation fields/is);
  assert.match(sf, /A:C,\s*E:G,\s*and S:V.*source\/sync fields/is);
  for (const header of ["Loxo Job ID", "Client", "Job Title", "Public Title", "Location", "Employment Type", "Pay", "Industry", "HC", "Must Have 1", "Must Have 2", "Must Have 3", "Owner(s)", "Contact", "Status", "Published", "Confidential", "Public Link", "Full JD", "JD Char Count", "Updated", "Last Synced"]) assert.match(sf, new RegExp(header.replace(/[()]/g, "\\$&")));
  assert.match(sf, /Identity is the exact `Loxo Job ID`/i);
  assert.match(sf, /manual[- ]override/i);
  assert.match(sf, /do not guess.*Jobs.*tab/is);
  assert.doesNotMatch(sf, /`Active`|`N\/A`|`HOLD`/);
  assert.match(sf, /deactivated rows/i);
  const trackerSkill = await read("skills/tracker-manager/SKILL.md");
  assert.doesNotMatch(trackerSkill, /leads\/README\.md/);
  assert.match(trackerSkill, /leads\/references\/layout\.md/);
  const layout = await read("skills/tracker-manager/leads/references/layout.md");
  assert.match(layout, /parent.*child/i);
  assert.match(layout, /no permanent row-number boundary/i);
});

test("package classification keeps agent entrypoints, references, and assets separate", async () => {
  const packageManifest = JSON.parse(await read("package.json"));
  assert.ok(!packageManifest.files.includes("tests/fixtures"));
  assert.ok(!packageManifest.files.includes("tests"));
  const recruiter = await read("skills/recruiter/SKILL.md");
  assert.match(recruiter, /references\/candidate-prep-workspace\.md/);
  assert.match(recruiter, /references\/active-job-template-kit\.md/);
  assert.doesNotMatch(recruiter, /Run Skill/);
  const branded = await read("skills/recruiter/modules/brandedresume/GUIDE.md");
  assert.match(branded, /references\/example-candidate\.json/);
  assert.doesNotMatch(branded, /assets\/example_candidate\.json/);
  const dashboard = await read("skills/recruiter/modules/loxo-readonly-candidate-dashboard/GUIDE.md");
  assert.match(dashboard, /tests\/fixtures\/synthetic-candidate-dashboard\.json/);
  assert.doesNotMatch(dashboard, /README\.md/);
  const evals = await read("skills/recruiter/modules/brandedresume/evals/evals.json");
  assert.match(evals, /build_resume\.py/);
  assert.doesNotMatch(evals, /Apps Script|Google Apps Script|\[confirm/);
});

test("raw recipient negative control is rejected by the template guard", () => {
  assert.throws(() => assertNoRawRecipients("To: person@example.com"), /raw recipient/);
  assert.doesNotThrow(() => assertNoRawRecipients("Hi {{recipient_name}}"));
});

test("dashboard builder consumes the object-shaped synthetic fixture", async () => {
  const fixture = path.join(root, "tests/fixtures/synthetic-candidate-dashboard.json");
  const payload = JSON.parse(await read("tests/fixtures/synthetic-candidate-dashboard.json"));
  assert.ok(payload.job && Array.isArray(payload.candidates));
  const temp = await mkdtemp(path.join(root, ".tmp-dashboard-builder-"));
  try {
    const output = path.join(temp, "dashboard.html");
    const result = spawnSync("python3", [path.join(root, "skills/recruiter/modules/loxo-readonly-candidate-dashboard/scripts/build_dashboard.py"), fixture, output], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(output) && statSync(output).size > 0);
    assert.match(await readFile(output, "utf8"), /Synthetic Machine Reliability Manager/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
