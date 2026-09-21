import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const workerBindings = vi.hoisted(() => ({
  env: {} as { DB?: D1Database; BUCKET?: R2Bucket },
}));

vi.mock("cloudflare:workers", () => workerBindings);

import { deleteJobFolder } from "../lib/server/job-folder-delete";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const drizzleDirectory = join(testDirectory, "..", "drizzle");

let miniflare: Miniflare | null = null;
let database: D1Database;
let bucket: R2Bucket;

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

beforeEach(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    r2Buckets: ["BUCKET"],
  });
  database = await miniflare.getD1Database("DB");
  bucket = await miniflare.getR2Bucket("BUCKET") as unknown as R2Bucket;
  workerBindings.env.DB = database;
  workerBindings.env.BUCKET = bucket;
  await applyMigrations(database);
});

afterEach(async () => {
  await miniflare?.dispose();
  miniflare = null;
});

describe("deleteJobFolder", () => {
  it("deletes only the owned Job graph, keeps shared candidates, and preserves reusable intake bytes", async () => {
    await database.batch([
      database.prepare("INSERT INTO roles (id, owner_id, title, client) VALUES (?, ?, ?, ?)").bind("role-delete", "owner-1", "Test Job", "Test Co"),
      database.prepare("INSERT INTO roles (id, owner_id, title, client) VALUES (?, ?, ?, ?)").bind("role-keep", "owner-1", "Real Job", "Real Co"),
      database.prepare("INSERT INTO roles (id, owner_id, title, client) VALUES (?, ?, ?, ?)").bind("role-foreign", "owner-2", "Other Job", "Other Co"),
      database.prepare("INSERT INTO candidates (id, owner_id, name) VALUES (?, ?, ?)").bind("candidate-orphan", "owner-1", "Delete Me"),
      database.prepare("INSERT INTO candidates (id, owner_id, name) VALUES (?, ?, ?)").bind("candidate-shared", "owner-1", "Keep Me"),
      database.prepare("INSERT INTO candidate_cases (id, owner_id, role_id, candidate_id) VALUES (?, ?, ?, ?)").bind("case-delete-1", "owner-1", "role-delete", "candidate-orphan"),
      database.prepare("INSERT INTO candidate_cases (id, owner_id, role_id, candidate_id) VALUES (?, ?, ?, ?)").bind("case-delete-2", "owner-1", "role-delete", "candidate-shared"),
      database.prepare("INSERT INTO candidate_cases (id, owner_id, role_id, candidate_id) VALUES (?, ?, ?, ?)").bind("case-keep", "owner-1", "role-keep", "candidate-shared"),
      database.prepare("INSERT INTO source_intakes (id, owner_id, sha256, content_type, size_bytes, parser_version) VALUES (?, ?, ?, ?, ?, ?)").bind("intake-keep", "owner-1", "a".repeat(64), "application/pdf", 10, "v1"),
      database.prepare("INSERT INTO role_sources (id, role_id, kind, filename, content_type, size_bytes, sha256, storage_key, intake_record_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("job-source", "role-delete", "job_description", "job.txt", "text/plain", 4, "b".repeat(64), "raw-job-source", null, "owner-1"),
      database.prepare("INSERT INTO case_sources (id, case_id, kind, filename, content_type, size_bytes, sha256, storage_key, intake_record_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("resume-source", "case-delete-1", "resume", "resume.pdf", "application/pdf", 10, "c".repeat(64), "reusable-resume-source", "intake-keep", "owner-1"),
      database.prepare("INSERT INTO case_documents (case_id, kind, content_json, updated_by) VALUES (?, ?, ?, ?)").bind("case-delete-1", "resume", "{}", "owner-1"),
      database.prepare("INSERT INTO case_activity (id, case_id, actor_id, event_type, entity_type, entity_id) VALUES (?, ?, ?, ?, ?, ?)").bind("activity-delete", "case-delete-1", "owner-1", "created", "case", "case-delete-1"),
      database.prepare("INSERT INTO capability_runs (id, case_id, role_id, candidate_id, capability_id, authority_digest, input_snapshot_hash, input_json, implementation_status, provider, model, prepared_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("run-delete", "case-delete-1", "role-delete", "candidate-orphan", "write-up", "d".repeat(64), "e".repeat(64), "{}", "working", "test", "test", "2026-09-21T00:00:00Z", "owner-1"),
      database.prepare("INSERT INTO case_document_versions (case_id, kind, revision, content_json, capability_run_id, created_by) VALUES (?, ?, ?, ?, ?, ?)").bind("case-delete-1", "resume", 1, "{}", "run-delete", "owner-1"),
      database.prepare("INSERT INTO case_artifacts (id, case_id, run_id, kind, filename, content_type, storage_key, sha256, size_bytes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("artifact-delete", "case-delete-1", "run-delete", "branded_resume", "resume.pdf", "application/pdf", "artifact-delete", "f".repeat(64), 10, "owner-1"),
    ]);
    await Promise.all([
      bucket.put("raw-job-source", "job"),
      bucket.put("reusable-resume-source", "resume"),
      bucket.put("artifact-delete", "artifact"),
    ]);

    const result = await deleteJobFolder("owner-1", "role-delete");

    expect(result).toEqual({
      roleId: "role-delete",
      deletedCases: 2,
      deletedCandidates: 1,
      deletedSources: 2,
      deletedArtifacts: 1,
      storageCleanup: "complete",
    });
    expect((await database.prepare("SELECT id FROM roles ORDER BY id").all()).results).toEqual([
      { id: "role-foreign" },
      { id: "role-keep" },
    ]);
    expect((await database.prepare("SELECT id FROM candidates ORDER BY id").all()).results).toEqual([
      { id: "candidate-shared" },
    ]);
    expect((await database.prepare("SELECT id FROM candidate_cases").all()).results).toEqual([
      { id: "case-keep" },
    ]);
    expect((await database.prepare("SELECT id FROM source_intakes").all()).results).toEqual([
      { id: "intake-keep" },
    ]);
    expect(await bucket.get("raw-job-source")).toBeNull();
    expect(await bucket.get("artifact-delete")).toBeNull();
    expect(await bucket.get("reusable-resume-source")).not.toBeNull();
  });

  it("does not allow one owner to delete another owner's Job", async () => {
    await database.prepare("INSERT INTO roles (id, owner_id, title) VALUES (?, ?, ?)")
      .bind("role-foreign", "owner-2", "Other Job")
      .run();

    await expect(deleteJobFolder("owner-1", "role-foreign")).rejects.toMatchObject({ status: 404 });
    expect((await database.prepare("SELECT id FROM roles").all()).results).toEqual([{ id: "role-foreign" }]);
  });
});
