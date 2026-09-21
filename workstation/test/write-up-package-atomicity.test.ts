import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it, vi } from "vitest";

const workerBindings = vi.hoisted(() => ({
  env: {} as { DB?: D1Database },
}));

vi.mock("cloudflare:workers", () => workerBindings);

import { defaultDocumentContent } from "../lib/document-model";
import { executePreparedCapability } from "../lib/server/capability-execution-service";
import { getCapabilityRun } from "../lib/server/capability-run-repository";
import {
  getCandidateCase,
  listDocumentVersions,
} from "../lib/server/case-repository";
import { prepareCapability } from "../lib/server/capability-service";
import type { StoredDocumentKind } from "../lib/workstation-types";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const drizzleDirectory = join(testDirectory, "..", "drizzle");
const outputKinds = ["resume", "submission", "email", "loxo_update"] as const;
const allDocumentKinds: StoredDocumentKind[] = [
  "resume",
  "write_up",
  "submission",
  "email",
  "loxo_update",
];

const resumeText = `Synthetic Candidate
Maintenance Supervisor

PROFESSIONAL SUMMARY
Maintenance leader with preventive maintenance experience.

PROFESSIONAL EXPERIENCE
Maintenance Supervisor
Synthetic Components | Toronto, ON
Jan 2020 - Present
- Led preventive maintenance planning.`;

const jobDescriptionText = `Job Title: Maintenance Manager
Company: Synthetic Manufacturing
Location: Toronto, ON

Responsibilities
Lead preventive maintenance planning and safety reviews.`;

const transcriptText = `Compensation Target: $120,000
Location: Toronto, ON
Interview Availability: Tuesday afternoon
Notice Period: Three weeks
Reason for Leaving: Plant closure`;

let miniflare: Miniflare | null = null;

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

async function seedPreparedWriteUp() {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  const db = await miniflare.getD1Database("DB");
  workerBindings.env.DB = db;
  await applyMigrations(db);

  await db.batch([
    db.prepare(
      "INSERT INTO roles (id, owner_id, title, client, status) VALUES (?, ?, ?, ?, ?)",
    ).bind("role-1", "user-1", "Maintenance Manager", "Synthetic Manufacturing", "active"),
    db.prepare(
      "INSERT INTO candidates (id, owner_id, name, current_title) VALUES (?, ?, ?, ?)",
    ).bind("candidate-1", "user-1", "Synthetic Candidate", "Maintenance Supervisor"),
    db.prepare(
      "INSERT INTO candidate_cases (id, owner_id, role_id, candidate_id, revision) VALUES (?, ?, ?, ?, ?)",
    ).bind("case-1", "user-1", "role-1", "candidate-1", 3),
  ]);

  for (const kind of allDocumentKinds) {
    const contentJson = JSON.stringify(defaultDocumentContent(kind));
    await db.batch([
      db.prepare(
        "INSERT INTO case_documents (case_id, kind, content_json, revision, updated_by) VALUES (?, ?, ?, ?, ?)",
      ).bind("case-1", kind, contentJson, 2, "user-1"),
      db.prepare(
        "INSERT INTO case_document_versions (case_id, kind, revision, content_json, source_refs_json, origin, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind("case-1", kind, 2, contentJson, "[]", "edited", "user-1"),
    ]);
  }

  const sources = [
    ["resume", "resume", resumeText],
    ["jd", "job_description", jobDescriptionText],
    ["call", "transcript", transcriptText],
  ] as const;
  for (const [id, kind, parsedText] of sources) {
    await db.prepare(
      `INSERT INTO case_sources
        (id, case_id, kind, filename, content_type, size_bytes, sha256, storage_key,
         review_status, lifecycle_status, parsed_text, classification_method, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      "case-1",
      kind,
      `${id}.txt`,
      "text/plain",
      parsedText.length,
      id.padEnd(64, "0"),
      `cases/case-1/sources/${id}.txt`,
      "reviewed",
      "reviewed",
      parsedText,
      "manual",
      "user-1",
    ).run();
  }

  const prepared = await prepareCapability("user-1", "case-1", "write-up", {
    extraInput: "",
    provider: "workstation",
    model: "write-up-candidate-v1",
  });
  expect(prepared.run).not.toBeNull();
  return { db, runId: prepared.run!.id };
}

afterEach(async () => {
  delete workerBindings.env.DB;
  await miniflare?.dispose();
  miniflare = null;
});

describe("write-up package persistence", () => {
  it.each([
    {
      failure: "the third document version write",
      trigger: `CREATE TRIGGER fail_email_version
        BEFORE INSERT ON case_document_versions
        WHEN NEW.kind = 'email' AND NEW.revision = 3
        BEGIN SELECT RAISE(ABORT, 'synthetic document failure'); END`,
    },
    {
      failure: "the terminal run transition",
      trigger: `CREATE TRIGGER fail_draft_ready_transition
        BEFORE UPDATE ON capability_runs
        WHEN NEW.status = 'draft_ready'
        BEGIN SELECT RAISE(ABORT, 'synthetic transition failure'); END`,
    },
  ])("leaves no new visible revisions when $failure fails", async ({ trigger }) => {
    const { db, runId } = await seedPreparedWriteUp();
    const before = await getCandidateCase("user-1", "case-1");
    await db.prepare(trigger).run();

    await expect(executePreparedCapability("user-1", "case-1", runId))
      .rejects.toMatchObject({ name: "ApiError", status: 500 });

    const after = await getCandidateCase("user-1", "case-1");
    expect(Object.fromEntries(outputKinds.map((kind) => [kind, after.documents[kind]])))
      .toEqual(Object.fromEntries(outputKinds.map((kind) => [kind, before.documents[kind]])));
    for (const kind of outputKinds) {
      const versions = await listDocumentVersions("user-1", "case-1", kind);
      expect(versions.map((version) => version.revision)).toEqual([2]);
    }
    expect((await getCapabilityRun("user-1", "case-1", runId)).status).toBe("failed");
  });
});
