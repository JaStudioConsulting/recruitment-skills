import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it, vi } from "vitest";

const workerBindings = vi.hoisted(() => ({
  env: {} as { DB?: D1Database },
}));

vi.mock("cloudflare:workers", () => workerBindings);

import {
  createCaseArtifact,
  getCapabilityRun,
  listCaseArtifacts,
  transitionCapabilityRun,
  type CreateCaseArtifactInput,
} from "../lib/server/capability-run-repository";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const drizzleDirectory = join(testDirectory, "..", "drizzle");
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

async function seedRunningPdfRun() {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  const db = await miniflare.getD1Database("DB");
  workerBindings.env.DB = db;
  await applyMigrations(db);
  await db.batch([
    db.prepare("INSERT INTO roles (id, owner_id, title, client, status) VALUES (?, ?, ?, ?, ?)")
      .bind("role-1", "user-1", "Synthetic Role", "Synthetic Client", "active"),
    db.prepare("INSERT INTO candidates (id, owner_id, name, current_title) VALUES (?, ?, ?, ?)")
      .bind("candidate-1", "user-1", "Synthetic Candidate", "Synthetic Title"),
    db.prepare("INSERT INTO candidate_cases (id, owner_id, role_id, candidate_id) VALUES (?, ?, ?, ?)")
      .bind("case-1", "user-1", "role-1", "candidate-1"),
    db.prepare(`INSERT INTO capability_runs
      (id, case_id, role_id, candidate_id, capability_id, executor_id,
       authority_digest, input_snapshot_hash, input_json, output_kind,
       implementation_status, provider, model, prepared_at, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        "run-1", "case-1", "role-1", "candidate-1", "brandedresume", "brand-resume",
        "a".repeat(64), "b".repeat(64), "{}", "pdf", "working", "workstation",
        "builder-v1", "2026-09-20T12:00:00.000Z", "running", "user-1",
      ),
  ]);
  return db;
}

function artifact(): CreateCaseArtifactInput {
  return {
    id: "artifact-1",
    caseId: "case-1",
    runId: "run-1",
    kind: "brandedresume",
    filename: "Synthetic Resume.pdf",
    contentType: "application/pdf",
    storageKey: "cases/case-1/artifacts/artifact-1/Synthetic Resume.pdf",
    sha256: "c".repeat(64),
    sizeBytes: 1024,
    evidence: { persistence: { pageCount: 1 } },
  };
}

afterEach(async () => {
  delete workerBindings.env.DB;
  await miniflare?.dispose();
  miniflare = null;
});

describe("running PDF cancellation and artifact attachment", () => {
  it("refuses cancellation after artifact insertion and leaves the run eligible for visual QA", async () => {
    await seedRunningPdfRun();
    await createCaseArtifact("user-1", artifact());

    await expect(transitionCapabilityRun("user-1", "case-1", "run-1", {
      status: "cancelled",
    })).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("cannot be cancelled after its PDF artifact was persisted"),
    });

    expect((await getCapabilityRun("user-1", "case-1", "run-1")).status).toBe("running");
    expect(await listCaseArtifacts("user-1", "case-1", "run-1")).toHaveLength(1);
    await expect(transitionCapabilityRun("user-1", "case-1", "run-1", {
      status: "awaiting_visual_qa",
      result: { artifact: { id: "artifact-1", sha256: "c".repeat(64) } },
    })).resolves.toMatchObject({ status: "awaiting_visual_qa" });
  });

  it("allows cancellation first and then refuses artifact insertion", async () => {
    await seedRunningPdfRun();
    await expect(transitionCapabilityRun("user-1", "case-1", "run-1", {
      status: "cancelled",
    })).resolves.toMatchObject({ status: "cancelled" });

    await expect(createCaseArtifact("user-1", artifact())).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("running capability run"),
    });
    expect(await listCaseArtifacts("user-1", "case-1", "run-1")).toEqual([]);
  });
});
