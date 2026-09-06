import assert from "node:assert/strict";
import test from "node:test";
import { readSkillText } from "../lib/index.js";

test("Loxo workflows stay behind recruiter and preserve approval gates", async () => {
  const manifest = JSON.parse(await readSkillText("manifests/workflows.json"));
  const fit = manifest.workflows.find(({ id }) => id === "loxo_candidate_fit_review");
  const safe = manifest.workflows.find(({ id }) => id === "loxo_safe_pipeline_action");
  const reconciliation = manifest.workflows.find(({ id }) => id === "gmail_loxo_candidate_reconciliation");

  assert.equal(fit.router, "recruiter");
  assert.equal(safe.router, "recruiter");
  assert.equal(reconciliation.router, "recruiter");
  assert.equal(fit.external_actions, "none");
  assert.equal(safe.external_actions, "approval_gated_consumer_loxo_write");
  assert.equal(reconciliation.external_actions, "approval_gated_consumer_loxo_write");
  for (const stage of ["job_scope", "candidate_identity", "resume_evidence", "fit_verdict", "return_to_pipeline"])
    assert.ok(fit.stages.includes(stage), `Loxo candidate fit review is missing ${stage}`);
  for (const stage of ["action_manifest", "human_approval", "precondition_recheck", "post_write_verification"])
    assert.ok(safe.stages.includes(stage), `safe Loxo workflow is missing ${stage}`);
  for (const stage of ["gmail_evidence", "classification", "change_manifest", "human_approval", "post_write_verification"])
    assert.ok(reconciliation.stages.includes(stage), `Gmail reconciliation workflow is missing ${stage}`);
});

test("Loxo guide routes fit review and both protected workflow references", async () => {
  const guide = await readSkillText("recruiter/modules/loxo/GUIDE.md");
  const fit = await readSkillText("recruiter/modules/loxo/references/loxo-candidate-fit-review.md");
  const safe = await readSkillText("recruiter/modules/loxo/references/loxo-safe-pipeline-actions.md");
  const reconciliation = await readSkillText("recruiter/modules/loxo/references/gmail-loxo-candidate-reconciliation.md");
  const archivalWorkflow = await readSkillText("recruiter/modules/loxo/references/ARCHIVAL-loxo-workflow.md");
  const archivalBusinessDevelopment = await readSkillText("recruiter/modules/loxo/references/ARCHIVAL-loxo-business-development.md");

  assert.match(guide, /loxo-candidate-fit-review\.md/);
  assert.match(guide, /loxo-safe-pipeline-actions\.md/);
  assert.match(guide, /gmail-loxo-candidate-reconciliation\.md/);
  assert.match(fit, /Activity does not prove qualification/);
  assert.match(fit, /Return to the same job pipeline after the review/);
  assert.match(fit, /GO.*NEEDS VERIFICATION.*NO-GO/s);
  assert.match(safe, /Never infer manifest rows from a total/);
  assert.match(safe, /Unknown write results are unresolved\. Do not retry automatically/);
  assert.match(reconciliation, /An internal submission is not proof that the candidate reached the client/);
  assert.match(reconciliation, /does not authorize a Gmail send or a\s+Loxo write/);
  assert.doesNotMatch(guide, /references\/loxo-workflow\.md|references\/loxo-business-development\.md/);
  assert.match(guide, /exact record IDs.*immutable action manifest.*explicit approval.*precondition reread.*serialized host-adapter execution.*post-action reread.*no automatic retry/is);
  assert.match(archivalWorkflow, /ARCHIVAL \/ NON-RUNNABLE/i);
  assert.match(archivalBusinessDevelopment, /ARCHIVAL \/ NON-RUNNABLE/i);
});

test("active Loxo references cannot expose imperative mutation procedures", async () => {
  const activeReferences = [
    "recruiter/modules/loxo/references/gmail-loxo-candidate-reconciliation.md",
    "recruiter/modules/loxo/references/loxo-candidate-fit-review.md",
    "recruiter/modules/loxo/references/loxo-linkedin-candidate-vetting.md",
    "recruiter/modules/loxo/references/loxo-outreach.md",
    "recruiter/modules/loxo/references/loxo-platform-overview.md",
    "recruiter/modules/loxo/references/loxo-safe-pipeline-actions.md",
    "recruiter/modules/loxo/references/prospect-campaign-learning.md"
  ];
  const imperativeMutation = /^\s*(?:\d+[.)]\s*)?(?:add|create|edit|save|send|start|activate|upload|drag|tag|delete|cancel|retry|finalize|personalize)\b[^\n]*(?:campaign|list|person|tag|deal|activity|document|send|message|pipeline|candidate|resume|contact|company|pitch|import|submit)/im;
  for (const relative of activeReferences) {
    const content = await readSkillText(relative);
    assert.doesNotMatch(content, imperativeMutation, `${relative} exposes an imperative mutation procedure`);
  }
  const outreach = await readSkillText("recruiter/modules/loxo/references/loxo-outreach.md");
  assert.match(outreach, /read-only draft review/i);
  assert.match(outreach, /exact person, campaign, job, company, or deal IDs/i);
  assert.match(outreach, /serialized host-adapter execution/i);
  assert.match(outreach, /post-action reread/i);
  assert.match(outreach, /no automatic retry/i);
});
