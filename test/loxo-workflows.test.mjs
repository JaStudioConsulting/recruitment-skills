import assert from "node:assert/strict";
import test from "node:test";
import { readSkillText } from "../lib/index.js";

test("Loxo workflows stay behind recruiter and preserve approval gates", async () => {
  const manifest = JSON.parse(await readSkillText("manifests/workflows.json"));
  const safe = manifest.workflows.find(({ id }) => id === "loxo_safe_pipeline_action");
  const reconciliation = manifest.workflows.find(({ id }) => id === "gmail_loxo_candidate_reconciliation");

  assert.equal(safe.router, "recruiter");
  assert.equal(reconciliation.router, "recruiter");
  assert.equal(safe.external_actions, "approval_gated_consumer_loxo_write");
  assert.equal(reconciliation.external_actions, "approval_gated_consumer_loxo_write");
  for (const stage of ["action_manifest", "human_approval", "precondition_recheck", "post_write_verification"])
    assert.ok(safe.stages.includes(stage), `safe Loxo workflow is missing ${stage}`);
  for (const stage of ["gmail_evidence", "classification", "change_manifest", "human_approval", "post_write_verification"])
    assert.ok(reconciliation.stages.includes(stage), `Gmail reconciliation workflow is missing ${stage}`);
});

test("Loxo guide routes both protected workflow references", async () => {
  const guide = await readSkillText("recruiter/modules/loxo/GUIDE.md");
  const safe = await readSkillText("recruiter/modules/loxo/references/loxo-safe-pipeline-actions.md");
  const reconciliation = await readSkillText("recruiter/modules/loxo/references/gmail-loxo-candidate-reconciliation.md");

  assert.match(guide, /loxo-safe-pipeline-actions\.md/);
  assert.match(guide, /gmail-loxo-candidate-reconciliation\.md/);
  assert.match(safe, /Never infer manifest rows from a total/);
  assert.match(safe, /Unknown write results are unresolved\. Do not retry automatically/);
  assert.match(reconciliation, /An internal submission is not proof that the candidate reached the client/);
  assert.match(reconciliation, /does not authorize a Gmail send or a\s+Loxo write/);
});
