import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const workerBindings = vi.hoisted(() => ({
  env: {} as { DB?: D1Database },
}));

vi.mock("cloudflare:workers", () => workerBindings);

import { defaultDocumentContent } from "../lib/document-model";
import { prepareCapability } from "../lib/server/capability-service";
import {
  getCandidateCase,
  getCapabilityCaseContext,
  insertRoleSource,
  insertSource,
  listDocumentVersions,
  reviewRoleSource,
  reviewSource,
  saveCaseDocument,
  type NewSource,
} from "../lib/server/case-repository";
import {
  EMPTY_SUBMISSION,
  STORED_DOCUMENT_KINDS,
  type SubmissionDocument,
} from "../lib/workstation-types";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const drizzleDirectory = join(testDirectory, "..", "drizzle");
const EMPTY_ASSISTANT = {
  missing: [],
  askNext: [],
  fitConcern: "No evidence-based review has run.",
  nextAction: "Attach source material and add candidate notes.",
};

let miniflare: Miniflare | null = null;
let database: D1Database;

async function applyMigrations(db: D1Database) {
  const migrations = readdirSync(drizzleDirectory)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  for (const migration of migrations) {
    const statements = readFileSync(join(drizzleDirectory, migration), "utf8")
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) await db.prepare(statement).run();
  }
}

async function seedDocumentSet(caseId: string) {
  for (const kind of STORED_DOCUMENT_KINDS) {
    const contentJson = JSON.stringify(defaultDocumentContent(kind));
    await database.batch([
      database.prepare(
        "INSERT INTO case_documents (case_id, kind, content_json, revision, updated_by) VALUES (?, ?, ?, 1, ?)",
      ).bind(caseId, kind, contentJson, "user-1"),
      database.prepare(
        "INSERT INTO case_document_versions (case_id, kind, revision, content_json, source_refs_json, origin, created_by) VALUES (?, ?, 1, ?, '[]', 'generated', ?)",
      ).bind(caseId, kind, contentJson, "user-1"),
    ]);
  }
}

async function seedWorkspace() {
  await database.batch([
    database.prepare(
      "INSERT INTO roles (id, owner_id, title, client, status) VALUES (?, ?, ?, ?, 'active')",
    ).bind("role-1", "user-1", "Maintenance Manager", "Synthetic Manufacturing"),
    database.prepare(
      "INSERT INTO candidates (id, owner_id, name, current_title) VALUES (?, ?, ?, ?)",
    ).bind("candidate-1", "user-1", "Avery North", "Maintenance Supervisor"),
    database.prepare(
      "INSERT INTO candidates (id, owner_id, name, current_title) VALUES (?, ?, ?, ?)",
    ).bind("candidate-2", "user-1", "Morgan South", "Reliability Supervisor"),
    database.prepare(
      "INSERT INTO candidate_cases (id, owner_id, role_id, candidate_id, assistant_json) VALUES (?, ?, ?, ?, ?)",
    ).bind("case-1", "user-1", "role-1", "candidate-1", JSON.stringify(EMPTY_ASSISTANT)),
    database.prepare(
      "INSERT INTO candidate_cases (id, owner_id, role_id, candidate_id, assistant_json) VALUES (?, ?, ?, ?, ?)",
    ).bind("case-2", "user-1", "role-1", "candidate-2", JSON.stringify(EMPTY_ASSISTANT)),
  ]);
  await seedDocumentSet("case-1");
  await seedDocumentSet("case-2");
}

function candidateSource(overrides: Partial<NewSource> = {}): NewSource {
  return {
    id: "source-1",
    caseId: "case-1",
    kind: "call_notes",
    filename: "call-notes.txt",
    contentType: "text/plain",
    sizeBytes: 12,
    sha256: "a".repeat(64),
    storageKey: "cases/case-1/sources/source-1",
    lifecycleStatus: "classified",
    parsedText: "Candidate call notes",
    classificationMethod: "explicit",
    ...overrides,
  };
}

beforeEach(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  database = await miniflare.getD1Database("DB");
  workerBindings.env.DB = database;
  await applyMigrations(database);
  await seedWorkspace();
});

afterEach(async () => {
  delete workerBindings.env.DB;
  await miniflare?.dispose();
  miniflare = null;
});

describe("case repository atomic persistence", () => {
  it("rolls back a candidate source row when its activity write fails, then retries cleanly", async () => {
    const before = await database.prepare(
      "SELECT updated_at FROM candidate_cases WHERE id = 'case-1'",
    ).first<{ updated_at: string }>();
    await database.prepare(`CREATE TRIGGER fail_source_activity
      BEFORE INSERT ON case_activity
      WHEN NEW.event_type = 'source_attached'
      BEGIN SELECT RAISE(ABORT, 'synthetic source activity failure'); END`).run();

    await expect(insertSource("user-1", candidateSource()))
      .rejects.toThrow("synthetic source activity failure");
    expect((await database.prepare(
      "SELECT COUNT(*) AS count FROM case_sources WHERE case_id = 'case-1'",
    ).first<{ count: number }>())?.count).toBe(0);
    expect((await database.prepare(
      "SELECT updated_at FROM candidate_cases WHERE id = 'case-1'",
    ).first<{ updated_at: string }>())?.updated_at).toBe(before?.updated_at);

    await database.prepare("DROP TRIGGER fail_source_activity").run();
    await expect(insertSource("user-1", candidateSource())).resolves.toBe(true);
    await expect(insertSource("user-1", candidateSource({
      id: "source-concurrent",
      storageKey: "cases/case-1/sources/source-concurrent",
    }))).resolves.toBe(false);
    expect((await database.prepare(
      "SELECT COUNT(*) AS count FROM case_sources WHERE case_id = 'case-1'",
    ).first<{ count: number }>())?.count).toBe(1);
    expect((await database.prepare(
      "SELECT COUNT(*) AS count FROM case_activity WHERE event_type = 'source_attached'",
    ).first<{ count: number }>())?.count).toBe(1);
  });

  it("rolls back snapshot, version, case state, and activity together, then retries cleanly", async () => {
    const marker = {
      id: "review-1",
      sourceId: "source-1",
      sourceRef: `auto-prefill:source-1:${"a".repeat(64)}:resume`,
      documentKind: "submission",
      previousKind: "resume",
      currentKind: "call_notes",
      reason: "Review the retained fields.",
      createdAt: "2026-09-21T01:00:00.000Z",
    };
    await database.prepare(
      "UPDATE candidate_cases SET assistant_json = ? WHERE id = 'case-1'",
    ).bind(JSON.stringify({ ...EMPTY_ASSISTANT, reviewRequired: [marker] })).run();
    await database.prepare(
      "UPDATE case_document_versions SET source_refs_json = ? WHERE case_id = 'case-1' AND kind = 'submission' AND revision = 1",
    ).bind(JSON.stringify([marker.sourceRef])).run();
    await database.prepare(`CREATE TRIGGER fail_document_activity
      BEFORE INSERT ON case_activity
      WHEN NEW.event_type = 'document_saved'
      BEGIN SELECT RAISE(ABORT, 'synthetic document activity failure'); END`).run();
    const content: SubmissionDocument = { ...EMPTY_SUBMISSION, name: "Avery North" };

    await expect(saveCaseDocument(
      "user-1",
      "case-1",
      "submission",
      1,
      content,
      { origin: "edited" },
    )).rejects.toThrow("synthetic document activity failure");
    const failedCase = await getCandidateCase("user-1", "case-1");
    expect(failedCase.documents.submission.revision).toBe(1);
    expect(failedCase.assistant.reviewRequired).toHaveLength(1);
    expect((await listDocumentVersions("user-1", "case-1", "submission")))
      .toHaveLength(1);

    await database.prepare("DROP TRIGGER fail_document_activity").run();
    const saved = await saveCaseDocument(
      "user-1",
      "case-1",
      "submission",
      1,
      content,
      { origin: "edited" },
    );
    expect(saved.revision).toBe(2);
    const recoveredCase = await getCandidateCase("user-1", "case-1");
    expect(recoveredCase.assistant.reviewRequired).toBeUndefined();
    const versions = await listDocumentVersions("user-1", "case-1", "submission");
    expect(versions.map((version) => version.revision)).toEqual([2, 1]);
    expect(versions[0].sourceRefs).toEqual([marker.sourceRef]);
  });

  it("allows exactly one concurrent document writer for an expected revision", async () => {
    const left = { ...EMPTY_SUBMISSION, name: "Left Writer" };
    const right = { ...EMPTY_SUBMISSION, name: "Right Writer" };
    const outcomes = await Promise.allSettled([
      saveCaseDocument("user-1", "case-1", "submission", 1, left),
      saveCaseDocument("user-1", "case-1", "submission", 1, right),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: { name: "ApiError", status: 409 },
    });
    expect((await getCandidateCase("user-1", "case-1")).documents.submission.revision).toBe(2);
    expect((await listDocumentVersions("user-1", "case-1", "submission")))
      .toHaveLength(2);
    expect((await database.prepare(
      "SELECT COUNT(*) AS count FROM case_activity WHERE event_type = 'document_saved'",
    ).first<{ count: number }>())?.count).toBe(1);
  });

  it("rejects a future expected revision without creating an orphan version or activity", async () => {
    await expect(saveCaseDocument(
      "user-1",
      "case-1",
      "submission",
      7,
      { ...EMPTY_SUBMISSION, name: "Future Writer" },
    )).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      details: { currentRevision: 1 },
    });

    expect((await listDocumentVersions("user-1", "case-1", "submission")))
      .toHaveLength(1);
    expect((await database.prepare(
      "SELECT COUNT(*) AS count FROM case_activity WHERE event_type = 'document_saved'",
    ).first<{ count: number }>())?.count).toBe(0);
  });
});

describe("source reclassification provenance", () => {
  it("persists autofill provenance, blocks preparation, and requires a later edited save", async () => {
    await insertSource("user-1", candidateSource({
      kind: "resume",
      filename: "Avery North Resume.txt",
      parsedText: `Avery North\nMaintenance Supervisor\nLocation: Toronto, ON\nProfessional Experience\nAtlas Components`,
      classificationMethod: "content",
    }));

    const reviewedResume = await reviewSource("user-1", "case-1", "source-1", "resume");
    expect(reviewedResume.documents.submission.revision).toBe(2);
    const provenanceRef = `auto-prefill:source-1:${"a".repeat(64)}:resume`;
    let versions = await listDocumentVersions("user-1", "case-1", "submission");
    expect(versions[0]).toMatchObject({
      revision: 2,
      origin: "generated",
      sourceRefs: [provenanceRef],
    });

    const reclassified = await reviewSource("user-1", "case-1", "source-1", "call_notes");
    expect(reclassified.sources[0].kind).toBe("call_notes");
    expect(reclassified.assistant.reviewRequired?.[0]).toMatchObject({
      sourceId: "source-1",
      sourceRef: provenanceRef,
      documentKind: "submission",
      previousKind: "resume",
      currentKind: "call_notes",
    });
    const prepared = await prepareCapability("user-1", "case-1", "write-up", {
      extraInput: "",
      provider: "workstation",
      model: "write-up-candidate-v1",
    });
    expect(prepared.run).toBeNull();
    expect(prepared.preparation.blocker).toContain("Human review required");

    const generated = await saveCaseDocument(
      "user-1",
      "case-1",
      "submission",
      2,
      reclassified.documents.submission.content,
      { origin: "generated" },
    );
    expect((await getCandidateCase("user-1", "case-1")).assistant.reviewRequired)
      .toHaveLength(1);
    await saveCaseDocument(
      "user-1",
      "case-1",
      "submission",
      generated.revision,
      generated.content,
      { origin: "edited" },
    );
    expect((await getCandidateCase("user-1", "case-1")).assistant.reviewRequired)
      .toBeUndefined();
    versions = await listDocumentVersions("user-1", "case-1", "submission");
    expect(versions.slice(0, 3).map((version) => version.origin))
      .toEqual(["edited", "generated", "generated"]);
  });
});

describe("Job source scope integrity", () => {
  it("rejects candidate-private Job kinds and never shares legacy private evidence across candidates", async () => {
    await database.batch([
      database.prepare(
        `INSERT INTO role_sources
          (id, role_id, kind, filename, content_type, size_bytes, sha256, storage_key,
           review_status, lifecycle_status, parsed_text, classification_method, created_by)
         VALUES (?, 'role-1', ?, ?, 'text/plain', 10, ?, ?, 'reviewed', 'reviewed', ?, 'manual', 'user-1')`,
      ).bind("job-jd", "job_description", "job.txt", "1".repeat(64), "roles/role-1/job", "Job Description"),
      database.prepare(
        `INSERT INTO role_sources
          (id, role_id, kind, filename, content_type, size_bytes, sha256, storage_key,
           review_status, lifecycle_status, parsed_text, classification_method, created_by)
         VALUES (?, 'role-1', ?, ?, 'text/plain', 10, ?, ?, 'reviewed', 'reviewed', ?, 'manual', 'user-1')`,
      ).bind("legacy-resume", "resume", "private-resume.txt", "2".repeat(64), "roles/role-1/resume", "Private resume"),
      database.prepare(
        `INSERT INTO role_sources
          (id, role_id, kind, filename, content_type, size_bytes, sha256, storage_key,
           review_status, lifecycle_status, parsed_text, classification_method, created_by)
         VALUES (?, 'role-1', ?, ?, 'text/plain', 10, ?, ?, 'reviewed', 'reviewed', ?, 'manual', 'user-1')`,
      ).bind("legacy-transcript", "transcript", "private-call.txt", "3".repeat(64), "roles/role-1/transcript", "Private transcript"),
    ]);

    await expect(insertRoleSource("user-1", {
      ...candidateSource({ id: "blocked-role-resume", kind: "resume" }),
      roleId: "role-1",
    })).rejects.toMatchObject({ status: 409 });
    await expect(reviewRoleSource("user-1", "role-1", "job-jd", "resume"))
      .rejects.toMatchObject({ status: 409 });

    const [first, second] = await Promise.all([
      getCapabilityCaseContext("user-1", "case-1"),
      getCapabilityCaseContext("user-1", "case-2"),
    ]);
    for (const context of [first, second]) {
      expect(context.candidateCase.sources.map((source) => source.id)).toContain("job-jd");
      expect(context.candidateCase.sources.map((source) => source.id)).not.toContain("legacy-resume");
      expect(context.candidateCase.sources.map((source) => source.id)).not.toContain("legacy-transcript");
    }
    expect((await database.prepare(
      "SELECT kind FROM role_sources WHERE id = 'job-jd'",
    ).first<{ kind: string }>())?.kind).toBe("job_description");
  });
});
