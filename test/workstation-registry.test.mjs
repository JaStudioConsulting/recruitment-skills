import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  compileWorkstationRegistry,
  registryOutputPath,
} from "../scripts/generate-workstation-registry.mjs";
import { capabilityTableText } from "../scripts/generate-workstation-capability-table.mjs";

const root = path.resolve(import.meta.dirname, "..");

function registryFixture() {
  const fixture = mkdtempSync(path.join(os.tmpdir(), "workstation-registry-"));
  cpSync(path.join(root, "skills"), path.join(fixture, "skills"), { recursive: true });
  cpSync(path.join(root, "docs"), path.join(fixture, "docs"), { recursive: true });
  mkdirSync(path.join(fixture, "workstation"), { recursive: true });
  for (const filename of ["capability-features.json", "capability-implementation.json"]) {
    cpSync(path.join(root, "workstation", filename), path.join(fixture, "workstation", filename));
  }
  const features = JSON.parse(readFileSync(path.join(root, "workstation/capability-features.json"), "utf8"));
  for (const feature of features.features) {
    for (const builderPath of feature.builder_paths ?? []) {
      const destination = path.join(fixture, builderPath);
      mkdirSync(path.dirname(destination), { recursive: true });
      cpSync(path.join(root, builderPath), destination);
    }
  }
  const overlay = JSON.parse(readFileSync(path.join(root, "workstation/capability-implementation.json"), "utf8"));
  for (const implementation of Object.values(overlay.capabilities)) {
    for (const evidencePath of implementation.evidence) {
      const source = path.join(root, evidencePath);
      if (!existsSync(source) || evidencePath.startsWith("skills/")) continue;
      const destination = path.join(fixture, evidencePath);
      mkdirSync(path.dirname(destination), { recursive: true });
      cpSync(source, destination);
    }
  }
  return fixture;
}

test("workstation registry covers canonical authority exactly once", () => {
  const manifest = JSON.parse(readFileSync(path.join(root, "skills/capabilities.json"), "utf8"));
  const registry = compileWorkstationRegistry(root);
  const expectedIds = manifest.capabilities.map((item) => item.id).sort();
  const actualIds = registry.capabilities.map((item) => item.id).sort();

  assert.deepEqual(actualIds, expectedIds);
  assert.equal(new Set(actualIds).size, actualIds.length);
  assert.equal(registry.schemaVersion, 3);
  assert.equal(registry.frontDoor, "skills/recruiter/SKILL.md");
  assert.deepEqual(registry.topLevelSkills, [
    "skills/recruiter/SKILL.md",
    "skills/tracker-manager/SKILL.md",
  ]);
  assert.match(registry.repositoryAuthorityDigest, /^[0-9a-f]{64}$/);
  for (const authorityPath of [
    "docs/knowledge-architecture.md",
    "skills/recruiter/references/call-recording-recovery.md",
    "skills/tracker-manager/SKILL.md",
    "skills/tracker-manager/references/sf-jobs-contract.md",
  ]) assert.ok(registry.repositoryAuthorityPaths.includes(authorityPath), authorityPath);
  assert.ok(registry.generatedFrom.includes("workstation/capability-features.json"));
});

test("every registry item has a resolvable authority and truthful implementation contract", () => {
  const registry = compileWorkstationRegistry(root);
  for (const item of registry.capabilities) {
    assert.equal(existsSync(path.join(root, item.authorityPath)), true, item.authorityPath);
    for (const relatedPath of item.relatedPaths) {
      assert.equal(existsSync(path.join(root, relatedPath)), true, relatedPath);
    }
    assert.match(item.label, /\S/);
    assert.match(item.summary, /\S/);
    assert.doesNotMatch(item.summary, /^(?:>|\|)[+-]?$/, `${item.id} frontmatter description marker leaked into the UI`);
    assert.match(item.output, /\S/);
    assert.ok(Array.isArray(item.inputs) && item.inputs.length > 0, item.id);
    assert.ok(Array.isArray(item.context) && item.context.length > 0, item.id);
    assert.match(item.runtime, /\S/);
    assert.match(item.authorityDigest, /^[0-9a-f]{64}$/, item.id);
    assert.equal("approval" in item, false, `${item.id} must not collapse approval into one capability-wide value`);
    assert.ok(Array.isArray(item.operations) && item.operations.length > 0, item.id);
    assert.equal(new Set(item.operations.map((operation) => operation.id)).size, item.operations.length, item.id);
    for (const operation of item.operations) {
      assert.match(operation.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${item.id}:${operation.id}`);
      assert.match(operation.label, /\S/, `${item.id}:${operation.id}`);
      assert.match(operation.stage, /\S/, `${item.id}:${operation.id}`);
      assert.match(operation.output, /\S/, `${item.id}:${operation.id}`);
      assert.ok(["none", "preview", "explicit"].includes(operation.approval), `${item.id}:${operation.id}`);
    }
    assert.ok(["working", "partial", "interface_only", "blocked", "not_applicable"].includes(item.implementation.status));
    assert.ok(Array.isArray(item.implementation.evidence));
    if (item.implementation.status !== "working" && item.implementation.status !== "not_applicable") {
      assert.match(item.implementation.blocker, /\S/, item.id);
    }
  }
  assert.match(
    registry.capabilities.find((item) => item.id === "loxo-pipeline").summary,
    /approval-gated rejection manifest/,
  );
});

test("registry preserves operation-specific approvals and truthful workflow semantics", () => {
  const registry = compileWorkstationRegistry(root);
  const capability = (id) => registry.capabilities.find((item) => item.id === id);
  const executor = (id) => registry.executors.find((item) => item.id === id);

  assert.deepEqual(
    capability("job-loxo").operations.map(({ id, stage, approval }) => ({ id, stage, approval })),
    [
      { id: "draft-job-posting", stage: "draft", approval: "none" },
      { id: "publish-loxo-job", stage: "external_write", approval: "explicit" },
    ],
  );
  assert.deepEqual(
    capability("tracker").operations.map(({ id, stage, approval }) => ({ id, stage, approval })),
    [
      { id: "read", stage: "read", approval: "none" },
      { id: "prepare-change-plan", stage: "preview", approval: "none" },
      { id: "write-submissions", stage: "external_write", approval: "explicit" },
      { id: "import-leads", stage: "external_write", approval: "explicit" },
      { id: "repair", stage: "external_write", approval: "explicit" },
    ],
  );

  const sourcing = capability("sourcing");
  assert.deepEqual(sourcing.operations.map((operation) => operation.id), [
    "candidate-discovery",
    "candidate-audit",
    "candidate-opportunities",
    "prospect-discovery",
    "prospect-audit",
    "full-candidate-workflow",
    "full-prospect-workflow",
    "export-generic-csv",
    "export-loxo-csv",
  ]);
  assert.ok(sourcing.operations.filter((operation) => operation.stage !== "export").every((operation) => operation.approval === "none"));
  assert.ok(sourcing.operations.filter((operation) => operation.stage === "export").every((operation) => operation.approval === "explicit"));

  const screening = capability("applicant-screening");
  assert.match(screening.output, /individual.*requirement-match.*strengths.*concerns.*interview questions.*recommendation/is);
  assert.match(screening.output, /batch.*ranked comparison/is);
  assert.equal(executor("screen-applicants").result_kind, "document");

  const dashboard = capability("loxo-readonly-candidate-dashboard");
  assert.match(dashboard.output, /standalone.*HTML/i);
  assert.match(dashboard.output, /localStorage/);
  assert.match(dashboard.output, /CSV.*JSON/is);
  assert.deepEqual(dashboard.operations.map((operation) => operation.id), [
    "read-loxo-job",
    "build-dashboard",
    "edit-local-review",
    "export-csv",
    "export-json",
  ]);

  for (const featureId of ["interview-prep-pdf", "cover-letter"]) {
    const feature = executor(featureId);
    assert.equal(feature.outside_world, true, featureId);
    assert.match(feature.outside_world_note, /current.*public.*research|official public sources/is, featureId);
  }
  const interviewRequirements = new Map(executor("interview-prep-pdf").requirements.map((requirement) => [requirement.id, requirement]));
  for (const requirementId of [
    "exact-company-and-role",
    "job-description",
    "confirmed-work-location",
    "role-presentation-evidence",
    "official-public-sources",
    "approved-brand-assets",
    "source-ledger",
    "asset-ledger",
    "publication-status",
  ]) assert.equal(interviewRequirements.get(requirementId)?.required, true, requirementId);
  assert.deepEqual(interviewRequirements.get("publication-status")?.allowed_values, ["draft_only", "approved_for_candidate_use"]);
  const coverRequirements = new Map(executor("cover-letter").requirements.map((requirement) => [requirement.id, requirement]));
  assert.equal(coverRequirements.get("company-research")?.required, true);
  assert.deepEqual(coverRequirements.get("company-research")?.input_keys, ["company_research_source", "company_research_findings"]);

  const offerRequirements = executor("offer-letter").requirements.filter((requirement) => requirement.required);
  assert.equal(offerRequirements.length, 7);
  assert.ok(offerRequirements.every((requirement) => Array.isArray(requirement.input_keys) && requirement.input_keys.length > 0));
});

test("compiler rejects invalid operation gates and executor operation references", () => {
  const fixture = registryFixture();
  try {
    const overlayPath = path.join(fixture, "workstation/capability-implementation.json");
    const overlay = JSON.parse(readFileSync(overlayPath, "utf8"));
    overlay.capabilities.tracker.operations[0].approval = "sometimes";
    writeFileSync(overlayPath, `${JSON.stringify(overlay, null, 2)}\n`);
    assert.throws(() => compileWorkstationRegistry(fixture), /Invalid approval state for tracker operation read/);

    overlay.capabilities.tracker.operations[0].approval = "none";
    writeFileSync(overlayPath, `${JSON.stringify(overlay, null, 2)}\n`);
    const featurePath = path.join(fixture, "workstation/capability-features.json");
    const features = JSON.parse(readFileSync(featurePath, "utf8"));
    features.features.find((feature) => feature.id === "tracker-review").operation_id = "missing-operation";
    writeFileSync(featurePath, `${JSON.stringify(features, null, 2)}\n`);
    assert.throws(() => compileWorkstationRegistry(fixture), /unknown primary operation tracker:missing-operation/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("authority digests cover the common router and each capability's executable authority closure", () => {
  const registry = compileWorkstationRegistry(root);
  const expectedCommonAuthority = [
    "docs/knowledge-architecture.md",
    "skills/GLOBAL-RULES.md",
    "skills/TOOL-CONVENTIONS.md",
    "skills/capabilities.json",
    "skills/recruiter/SKILL.md",
    "skills/recruiter/references/call-recording-recovery.md",
  ];
  const expectedCapabilityAuthority = {
    brandedresume: [
      "docs/templates/branded-resume-contract.md",
      "skills/recruiter/modules/brandedresume/assets/tttg_logo.png",
      "skills/recruiter/modules/brandedresume/scripts/build_resume.py",
      "skills/recruiter/modules/legislator/GUIDE.md",
      "skills/recruiter/modules/legislator/references/tttg-document-structure-rules-v3.md",
      "skills/recruiter/scripts/validate-artifact-qa.mjs",
    ],
    legislator: [
      "skills/recruiter/modules/legislator/references/tttg-document-structure-rules-v3.md",
    ],
    loxo: [
      "skills/recruiter/modules/loxo/references/gmail-loxo-candidate-reconciliation.md",
      "skills/recruiter/modules/loxo/references/loxo-candidate-fit-review.md",
      "skills/recruiter/modules/loxo/references/loxo-safe-pipeline-actions.md",
    ],
    "recruiting-hr": [
      "skills/recruiter/modules/recruiting-hr/comp-analysis/GUIDE.md",
      "skills/recruiter/modules/recruiting-hr/draft-offer/GUIDE.md",
      "skills/recruiter/modules/recruiting-hr/interview-prep/GUIDE.md",
      "skills/recruiter/modules/recruiting-hr/onboarding/GUIDE.md",
      "skills/recruiter/modules/recruiting-hr/org-planning/GUIDE.md",
      "skills/recruiter/modules/recruiting-hr/people-report/GUIDE.md",
      "skills/recruiter/modules/recruiting-hr/performance-review/GUIDE.md",
      "skills/recruiter/modules/recruiting-hr/policy-lookup/GUIDE.md",
      "skills/recruiter/modules/recruiting-hr/recruiting-pipeline/GUIDE.md",
    ],
    sourcing: [
      "skills/recruiter/modules/sourcing/references/candidate.md",
      "skills/recruiter/modules/sourcing/references/export.md",
      "skills/recruiter/modules/sourcing/references/opportunities.md",
      "skills/recruiter/modules/sourcing/references/prospect.md",
      "skills/recruiter/modules/sourcing/scripts/adzuna_search.py",
      "skills/recruiter/modules/sourcing/scripts/sourcing_rows.py",
    ],
    tracker: [
      "skills/tracker-manager/SKILL.md",
      "skills/tracker-manager/references/sf-jobs-contract.md",
    ],
  };

  for (const item of registry.capabilities) {
    for (const authorityPath of expectedCommonAuthority) {
      assert.ok(item.relatedPaths.includes(authorityPath), `${item.id} omits ${authorityPath}`);
    }
  }
  for (const [capabilityId, authorityPaths] of Object.entries(expectedCapabilityAuthority)) {
    const item = registry.capabilities.find((capability) => capability.id === capabilityId);
    assert.ok(item, capabilityId);
    for (const authorityPath of authorityPaths) {
      assert.ok(item.relatedPaths.includes(authorityPath), `${capabilityId} omits ${authorityPath}`);
    }
  }

  const fixture = registryFixture();
  try {
    const before = compileWorkstationRegistry(fixture).capabilities.find((item) => item.id === "brandedresume");
    const rulebook = path.join(fixture, "skills/recruiter/modules/legislator/references/tttg-document-structure-rules-v3.md");
    writeFileSync(rulebook, `${readFileSync(rulebook, "utf8")}\nSynthetic authority revision.\n`);
    const after = compileWorkstationRegistry(fixture).capabilities.find((item) => item.id === "brandedresume");
    assert.notEqual(after.authorityDigest, before.authorityDigest);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }

  const trackerFixture = registryFixture();
  try {
    const before = compileWorkstationRegistry(trackerFixture);
    const trackerEntry = path.join(trackerFixture, "skills/tracker-manager/SKILL.md");
    writeFileSync(trackerEntry, `${readFileSync(trackerEntry, "utf8")}\nSynthetic compatibility authority revision.\n`);
    const after = compileWorkstationRegistry(trackerFixture);
    assert.notEqual(
      after.capabilities.find((item) => item.id === "tracker").authorityDigest,
      before.capabilities.find((item) => item.id === "tracker").authorityDigest,
    );
    assert.equal(
      after.capabilities.find((item) => item.id === "write-up").authorityDigest,
      before.capabilities.find((item) => item.id === "write-up").authorityDigest,
    );
  } finally {
    rmSync(trackerFixture, { recursive: true, force: true });
  }
});

test("compiler rejects unresolved implementation evidence paths", () => {
  const registry = compileWorkstationRegistry(root);
  for (const item of registry.capabilities) {
    for (const evidencePath of item.implementation.evidence) {
      assert.equal(existsSync(path.join(root, evidencePath)), true, `${item.id}: ${evidencePath}`);
    }
  }

  const fixture = registryFixture();
  try {
    const overlayPath = path.join(fixture, "workstation/capability-implementation.json");
    const overlay = JSON.parse(readFileSync(overlayPath, "utf8"));
    overlay.capabilities.tracker.evidence.push("test/does-not-exist.test.mjs");
    writeFileSync(overlayPath, `${JSON.stringify(overlay, null, 2)}\n`);
    assert.throws(
      () => compileWorkstationRegistry(fixture),
      /Missing verification evidence for tracker: test\/does-not-exist\.test\.mjs/,
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("capability table separates planned runtimes from verified mounted executors", () => {
  const table = capabilityTableText(root);
  assert.match(table, /\| Planned runtime \| Verified mounted executor \|/);
  assert.match(table, /\| Operation approvals \|/);
  assert.doesNotMatch(table, /\| Approval \|/);
  const rows = new Map(table.split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| Capability") && !line.startsWith("|---"))
    .map((line) => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      return [cells[0], cells];
    }));
  assert.equal(rows.get("applicant-screening")[4], "Grounded drafting executor");
  assert.equal(rows.get("applicant-screening")[5], "—");
  assert.match(rows.get("write-up")[5], /Write up candidate \(deterministic_server\)/);
  assert.match(rows.get("job-loxo")[7], /Draft job posting \[draft\]: none<br>Publish Loxo Job \[external_write\]: explicit/);
  assert.match(rows.get("tracker")[7], /read.*none.*external_write.*explicit/is);
});

test("checked-in registry matches the canonical compiler output", () => {
  const expected = `${JSON.stringify(compileWorkstationRegistry(root), null, 2)}\n`;
  const output = registryOutputPath(root);
  assert.equal(existsSync(output), true, "run npm run workstation:registry");
  assert.equal(readFileSync(output, "utf8"), expected);
});

test("checked-in capability verification table matches the canonical registry", () => {
  const output = path.join(root, "docs/capability-verification.md");
  assert.equal(existsSync(output), true, "run npm run workstation:registry");
  assert.equal(readFileSync(output, "utf8"), capabilityTableText(root));
});

test("registry executor links resolve to declared workstation features", () => {
  const registry = compileWorkstationRegistry(root);
  const featureCatalog = JSON.parse(readFileSync(path.join(root, "workstation/capability-features.json"), "utf8"));
  const features = new Map(featureCatalog.features.map((feature) => [feature.id, feature]));
  for (const item of registry.capabilities) {
    assert.ok(Array.isArray(item.executorFeatures), item.id);
    for (const executor of item.executorFeatures) {
      const feature = features.get(executor.id);
      assert.ok(feature, `${item.id}:${executor.id}`);
      assert.equal(feature.primary_capability_id, item.id, `${executor.id} must execute ${item.id} as primary`);
      assert.equal(executor.operationId, feature.operation_id ?? item.operations[0].id);
      assert.ok(item.operations.some((operation) => operation.id === executor.operationId), `${executor.id} operation must resolve`);
      assert.equal(executor.label, feature.label);
      assert.equal(executor.runtime, feature.runtime);
      assert.equal(executor.mounted, feature.mounted === true);
      assert.equal(executor.resultKind, feature.result_kind);
    }
  }
  assert.deepEqual(
    registry.capabilities.find((item) => item.id === "write-up").executorFeatures.map((item) => item.id),
    ["write-up-candidate"],
  );
  assert.deepEqual(
    registry.capabilities.find((item) => item.id === "tttg-candidate-submission").executorFeatures,
    [],
  );
  assert.deepEqual(registry.capabilities.find((item) => item.id === "legislator").executorFeatures, []);
  assert.deepEqual(registry.capabilities.find((item) => item.id === "ja-candidate-vetting").executorFeatures, []);
  for (const feature of featureCatalog.features) {
    assert.ok(feature.capability_ids.includes(feature.primary_capability_id), feature.id);
    const executor = registry.executors.find((item) => item.id === feature.id);
    assert.equal(executor.primary_capability_id, feature.primary_capability_id);
    const primaryCapability = registry.capabilities.find((item) => item.id === feature.primary_capability_id);
    assert.equal(executor.operation_id, feature.operation_id ?? primaryCapability.operations[0].id);
    assert.deepEqual(executor.supporting_capability_ids, feature.capability_ids.filter((id) => id !== feature.primary_capability_id));
  }
  assert.deepEqual(
    registry.executors.filter((executor) => executor.mounted).map((executor) => executor.id),
    ["brand-resume", "write-up-candidate"],
    "only a real server dispatcher may be marked mounted",
  );
});
