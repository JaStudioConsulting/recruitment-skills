import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import {
  capabilityRuns,
  caseArtifacts,
  caseDocumentVersions,
} from "../db/schema";
import { saveDocumentSchema } from "../lib/contracts/workstation";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const drizzleDirectory = join(testDirectory, "..", "drizzle");

function columnNames(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).columns.map((column) => column.name);
}

describe("capability persistence schema", () => {
  it("stores immutable preparation identity and mutable lifecycle evidence", () => {
    expect(columnNames(capabilityRuns)).toEqual(expect.arrayContaining([
      "id",
      "case_id",
      "role_id",
      "candidate_id",
      "capability_id",
      "executor_id",
      "supporting_authority_ids_json",
      "authority_digest",
      "source_refs_json",
      "input_snapshot_hash",
      "input_json",
      "output_kind",
      "implementation_status",
      "provider",
      "model",
      "prepared_at",
      "status",
      "result_json",
      "evidence_json",
      "error_json",
      "started_at",
      "finished_at",
    ]));
    expect(getTableConfig(capabilityRuns).checks.map((check) => check.name))
      .toContain("capability_runs_status_check");
  });

  it("links a saved output revision back to its generating run", () => {
    expect(columnNames(caseDocumentVersions)).toContain("capability_run_id");
    expect(saveDocumentSchema.parse({
      expectedRevision: 1,
      content: "Synthetic generated output",
      origin: "generated",
      capabilityRunId: "run-1",
    }).capabilityRunId).toBe("run-1");
  });

  it("stores run-owned versioned artifacts with explicit visual QA", () => {
    expect(columnNames(caseArtifacts)).toEqual(expect.arrayContaining([
      "id",
      "case_id",
      "run_id",
      "kind",
      "filename",
      "content_type",
      "storage_key",
      "sha256",
      "size_bytes",
      "revision",
      "evidence_json",
      "visual_qa_status",
      "reviewed_by",
      "reviewed_at",
      "review_evidence_json",
    ]));
    expect(caseArtifacts.visualQaStatus.default).toBe("pending");
    expect(getTableConfig(caseArtifacts).checks.map((check) => check.name))
      .toContain("case_artifacts_visual_qa_status_check");
  });

  it("ships a migration for both append-only tables and their guards", () => {
    const migrations = readdirSync(drizzleDirectory)
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .map((name) => readFileSync(join(drizzleDirectory, name), "utf8"));
    const migration = migrations.find((sql) =>
      sql.includes("CREATE TABLE `capability_runs`") &&
      sql.includes("CREATE TABLE `case_artifacts`"));

    expect(migration).toBeDefined();
    expect(migration).toContain("capability_runs_status_check");
    expect(migration).toContain("case_artifacts_visual_qa_status_check");
    expect(migration).toContain("FOREIGN KEY (`run_id`) REFERENCES `capability_runs`(`id`)");
    expect(migration).toContain(
      "ALTER TABLE `case_document_versions` ADD `capability_run_id` text REFERENCES capability_runs(id)",
    );
    expect(migration).toContain("CREATE UNIQUE INDEX `case_artifacts_storage_key_uidx`");
  });
});
