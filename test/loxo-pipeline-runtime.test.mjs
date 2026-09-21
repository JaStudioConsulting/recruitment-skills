import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  deriveStageId,
  pullPipeline,
  validatePullConfig,
} from "../skills/recruiter/modules/loxo-pipeline/scripts/pull_pipeline.mjs";
import {
  buildRejectPreview,
  executeRejectManifest,
  validateRejectConfig,
} from "../skills/recruiter/modules/loxo-pipeline/scripts/reject.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const stages = [
  { id: 501, name: "Applied", include: true },
  { id: 777, name: "Reference Check", include: true },
  { id: 999, name: "Rejected", include: false },
];

const pullConfig = {
  agencyId: 77,
  jobId: 88,
  baseUrl: "https://synthetic.app.loxo.co",
  outputDir: "/tmp",
  slug: "synthetic-job",
  appliedStageId: 501,
  stages,
};

const rejectConfig = {
  agencyId: 77,
  jobId: 88,
  baseUrl: "https://synthetic.app.loxo.co",
  appliedStageId: 501,
  rejectedStageId: 999,
  rejectedActivityTypeId: 1234,
  stages,
};

function syntheticManifest(personIds = [42]) {
  return {
    manifestId: "synthetic-manifest-1",
    agencyId: 77,
    jobId: 88,
    actions: personIds.map((personId) => ({
      personId,
      expectedCurrentStageId: 777,
      reason: "Synthetic mismatch evidence for test coverage only.",
    })),
  };
}

function approvalFor(preview) {
  return {
    approved: true,
    action: "reject",
    manifestId: preview.manifestId,
    manifestDigest: preview.manifestDigest,
    personIds: preview.actions.map(({ personId }) => personId),
  };
}

test("pipeline helpers require explicit agency-specific stage configuration", async () => {
  const normalized = validatePullConfig(pullConfig);
  assert.equal(normalized.agencyId, 77);
  assert.deepEqual(normalized.stages, stages);

  const stageId = deriveStageId(
    { person: { id: 42 } },
    [{
      job_id: 88,
      created_at: "2026-09-20T12:00:00Z",
      activity_type: { name: "Moved to Reference Check" },
    }],
    normalized,
  );
  assert.equal(stageId, 777);

  assert.throws(
    () => validatePullConfig({ ...pullConfig, stages: [{ id: 501, name: "Applied", include: true }] , appliedStageId: 777 }),
    /appliedStageId.*configured stage/i,
  );
  assert.throws(
    () => validatePullConfig({ ...pullConfig, stages: [{ id: 501, name: " Applied ", include: true }] }),
    /stage name/i,
  );
  assert.throws(
    () => validatePullConfig({ ...pullConfig, baseUrl: "https://synthetic.app.loxo.co/unexpected-path" }),
    /baseUrl.*origin/i,
  );
  await assert.rejects(() => pullPipeline(pullConfig), /declared transport.*getJSON/i);
});

test("pipeline pull uses only the declared synthetic transport and configured stages", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "loxo-pipeline-test-"));
  try {
    const transport = {
      async getJSON(endpoint) {
        if (endpoint.includes("candidates.json")) {
          return {
            candidates: [{
              person: {
                id: 42,
                name: "Synthetic Candidate",
                current_title: "Synthetic Title",
                emails: [],
                phones: [],
              },
              applied_at: null,
            }],
          };
        }
        if (endpoint.includes("person_events.json")) {
          return {
            person_events: [{
              job_id: 88,
              created_at: "2026-09-20T12:00:00Z",
              activity_type: { name: "Moved to Reference Check" },
            }],
          };
        }
        if (endpoint.includes("resumes.json")) return [];
        throw new Error(`unexpected endpoint ${endpoint}`);
      },
    };

    const result = await pullPipeline({ ...pullConfig, outputDir }, transport);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].stage, "Reference Check");
    assert.equal(result.summary.candidates, 1);
    assert.match(await readFile(result.jsonPath, "utf8"), /Synthetic Candidate/);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("pipeline scripts contain no account IDs, stage IDs, or undeclared browser globals", async () => {
  const scriptPaths = [
    "skills/recruiter/modules/loxo-pipeline/scripts/pull_pipeline.mjs",
    "skills/recruiter/modules/loxo-pipeline/scripts/reject.mjs",
  ];
  const scripts = await Promise.all(scriptPaths.map((relative) => readFile(path.join(root, relative), "utf8")));
  const source = scripts.join("\n");
  assert.doesNotMatch(source, /\b(?:29866|268196|244493|1937229)\b/);
  assert.doesNotMatch(source, /\b(?:browserFetch|useOrCreateTaskSpace|openOrReuseTab|pageInfo|cliLog|js)\s*\(/);
  for (const relative of scriptPaths) {
    const direct = spawnSync("node", [path.join(root, relative)], { encoding: "utf8" });
    assert.equal(direct.status, 2);
    assert.match(direct.stderr, /No live Loxo .*transport is bundled/i);
  }
});

test("pipeline authority documents explicit config and observed readback fields without fixed IDs", async () => {
  const [guide, endpoints] = await Promise.all([
    readFile(path.join(root, "skills/recruiter/modules/loxo-pipeline/GUIDE.md"), "utf8"),
    readFile(path.join(root, "skills/recruiter/modules/loxo-pipeline/references/loxo-endpoints.md"), "utf8"),
  ]);
  const authority = `${guide}\n${endpoints}`;
  assert.doesNotMatch(authority, /\b(?:29866|268196|244493|1937229)\b/);
  assert.match(authority, /explicit validated config/i);
  assert.match(authority, /declared transport/i);
  assert.match(authority, /rejected_at/);
  assert.match(authority, /immutable.*preview.*approval.*precondition.*readback/is);
});

test("reject execution requires an exact preview approval before any mutation", async () => {
  const config = validateRejectConfig(rejectConfig);
  const manifest = syntheticManifest();
  const preview = buildRejectPreview(config, manifest);
  let writes = 0;
  const transport = {
    async getJSON() {
      throw new Error("read must not happen before approval validation");
    },
    async createPersonEvent() {
      writes += 1;
      return { status: 201 };
    },
  };

  await assert.rejects(
    () => executeRejectManifest({ config, manifest, approval: { ...approvalFor(preview), manifestDigest: "stale" }, transport }),
    /approval.*digest/i,
  );
  await assert.rejects(
    () => executeRejectManifest({
      config: { ...config, rejectedActivityTypeId: 4321 },
      manifest,
      approval: approvalFor(preview),
      transport,
    }),
    /approval.*digest/i,
  );
  assert.equal(writes, 0);
  assert.equal(preview.rejectedStageId, 999);
  assert.equal(preview.rejectedActivityTypeId, 1234);
  assert.deepEqual(preview.actions, [{
    personId: 42,
    expectedCurrentStageId: 777,
    reason: "Synthetic mismatch evidence for test coverage only.",
  }]);
});

test("reject readback verifies documented rejected_at without workflow_stage_id", async () => {
  const config = validateRejectConfig(rejectConfig);
  const manifest = syntheticManifest();
  const preview = buildRejectPreview(config, manifest);
  let rejectedAt = null;
  let writes = 0;
  const events = [{
    job_id: 88,
    created_at: "2026-09-20T12:00:00Z",
    activity_type: { name: "Moved to Reference Check" },
  }];
  const transport = {
    async getJSON(endpoint) {
      if (endpoint.includes("person_events.json")) return { person_events: events };
      if (endpoint.includes("candidates.json")) {
        return { candidates: [{ person: { id: 42, name: "Synthetic Candidate" }, rejected_at: rejectedAt }] };
      }
      throw new Error(`unexpected endpoint ${endpoint}`);
    },
    async createPersonEvent(payload) {
      writes += 1;
      assert.deepEqual(payload, {
        agencyId: 77,
        activityTypeId: 1234,
        jobId: 88,
        personId: 42,
        notes: "Synthetic mismatch evidence for test coverage only.",
      });
      rejectedAt = "2026-09-20T12:05:00Z";
      return { status: 201 };
    },
  };

  const result = await executeRejectManifest({
    config,
    manifest,
    approval: approvalFor(preview),
    transport,
  });

  assert.equal(writes, 1);
  assert.equal(result.aborted, false);
  assert.deepEqual(result.results.map(({ result: state }) => state), ["verified"]);
  assert.equal(result.results[0].rejectedAt, "2026-09-20T12:05:00Z");
});

test("unknown reject readback aborts after the test-of-one and never retries", async () => {
  const config = validateRejectConfig(rejectConfig);
  const manifest = syntheticManifest([42, 43]);
  const preview = buildRejectPreview(config, manifest);
  let writes = 0;
  let candidateReads = 0;
  const transport = {
    async getJSON(endpoint) {
      if (endpoint.includes("person_events.json")) {
        return { person_events: [{
          job_id: 88,
          created_at: "2026-09-20T12:00:00Z",
          activity_type: { name: "Moved to Reference Check" },
        }] };
      }
      candidateReads += 1;
      if (candidateReads > 1) throw new Error("synthetic readback transport failure");
      const personId = endpoint.includes("person_id=43") ? 43 : 42;
      return { candidates: [{ person: { id: personId }, rejected_at: null }] };
    },
    async createPersonEvent() {
      writes += 1;
      return { status: 201 };
    },
  };

  const result = await executeRejectManifest({
    config,
    manifest,
    approval: approvalFor(preview),
    transport,
  });

  assert.equal(writes, 1);
  assert.equal(result.aborted, true);
  assert.equal(result.results[0].result, "unknown");
  assert.match(result.results[0].reason, /readback/i);
});
