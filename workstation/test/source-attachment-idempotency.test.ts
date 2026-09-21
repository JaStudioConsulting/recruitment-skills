import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

function applyMigration(db: DatabaseSync) {
  const migration = readFileSync(
    new URL("../drizzle/0006_foamy_winter_soldier.sql", import.meta.url),
    "utf8",
  );
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) db.exec(statement);
  }
}

function sourceRows(db: DatabaseSync, table: "case_sources" | "role_sources") {
  return db.prepare(`SELECT id, lifecycle_status, review_status, context_status FROM ${table} ORDER BY id`).all();
}

describe("source attachment idempotency migration", () => {
  it("keeps duplicate provenance, exposes one active row per scope/hash, and permits genuinely different sources", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE case_sources (
        id text PRIMARY KEY NOT NULL,
        case_id text NOT NULL,
        sha256 text NOT NULL,
        lifecycle_status text NOT NULL,
        review_status text DEFAULT 'unreviewed' NOT NULL,
        classification_method text,
        created_at text NOT NULL
      );
      CREATE TABLE role_sources (
        id text PRIMARY KEY NOT NULL,
        role_id text NOT NULL,
        sha256 text NOT NULL,
        lifecycle_status text NOT NULL,
        review_status text DEFAULT 'unreviewed' NOT NULL,
        classification_method text,
        context_status text DEFAULT 'active' NOT NULL,
        created_at text NOT NULL
      );
      INSERT INTO case_sources VALUES
        ('case-a-original', 'case-a', 'same-hash', 'classified', 'reviewed', 'content', '2026-09-21T01:00:00.000Z'),
        ('case-a-repeat', 'case-a', 'same-hash', 'reviewed', 'reviewed', 'manual', '2026-09-21T01:01:00.000Z'),
        ('case-a-revised', 'case-a', 'different-hash', 'classified', 'reviewed', 'content', '2026-09-21T01:02:00.000Z'),
        ('case-b-original', 'case-b', 'same-hash', 'classified', 'reviewed', 'content', '2026-09-21T01:03:00.000Z');
      INSERT INTO role_sources VALUES
        ('role-a-original', 'role-a', 'same-hash', 'classified', 'reviewed', 'content', 'active', '2026-09-21T01:00:00.000Z'),
        ('role-a-repeat', 'role-a', 'same-hash', 'reviewed', 'reviewed', 'manual', 'active', '2026-09-21T01:01:00.000Z'),
        ('role-a-revised', 'role-a', 'different-hash', 'classified', 'reviewed', 'content', 'active', '2026-09-21T01:02:00.000Z'),
        ('role-b-original', 'role-b', 'same-hash', 'classified', 'reviewed', 'content', 'active', '2026-09-21T01:03:00.000Z');
    `);

    applyMigration(db);

    expect(sourceRows(db, "case_sources")).toEqual([
      { id: "case-a-original", lifecycle_status: "classified", review_status: "unreviewed", context_status: "superseded" },
      { id: "case-a-repeat", lifecycle_status: "reviewed", review_status: "reviewed", context_status: "active" },
      { id: "case-a-revised", lifecycle_status: "classified", review_status: "unreviewed", context_status: "active" },
      { id: "case-b-original", lifecycle_status: "classified", review_status: "unreviewed", context_status: "active" },
    ]);
    expect(sourceRows(db, "role_sources")).toEqual([
      { id: "role-a-original", lifecycle_status: "classified", review_status: "unreviewed", context_status: "superseded" },
      { id: "role-a-repeat", lifecycle_status: "reviewed", review_status: "reviewed", context_status: "active" },
      { id: "role-a-revised", lifecycle_status: "classified", review_status: "unreviewed", context_status: "active" },
      { id: "role-b-original", lifecycle_status: "classified", review_status: "unreviewed", context_status: "active" },
    ]);

    expect(() => db.exec(`
      INSERT INTO case_sources (id, case_id, sha256, lifecycle_status, classification_method, created_at)
      VALUES ('case-a-third-copy', 'case-a', 'same-hash', 'classified', 'content', '2026-09-21T01:04:00.000Z');
    `)).toThrow(/UNIQUE constraint failed/);
    expect(() => db.exec(`
      INSERT INTO role_sources (id, role_id, sha256, lifecycle_status, classification_method, created_at)
      VALUES ('role-a-third-copy', 'role-a', 'same-hash', 'classified', 'content', '2026-09-21T01:04:00.000Z');
    `)).toThrow(/UNIQUE constraint failed/);

    db.close();
  });
});
