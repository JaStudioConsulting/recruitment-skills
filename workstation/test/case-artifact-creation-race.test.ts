import { describe, expect, it, vi } from "vitest";

const repositoryBoundary = vi.hoisted(() => ({
  db: undefined as unknown,
  assertOwnedCase: vi.fn(async () => ({
    id: "case-1",
    roleId: "role-1",
    candidateId: "candidate-1",
  })),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => ({
  getDb: () => repositoryBoundary.db,
  getSourceBucket: vi.fn(),
}));
vi.mock("@/lib/server/case-repository", () => ({
  assertOwnedCase: repositoryBoundary.assertOwnedCase,
}));

import {
  persistCaseArtifactWithDependencies,
  type ArtifactBucket,
  type CaseArtifactStoreDependencies,
} from "../lib/server/case-artifact-store";
import {
  createCaseArtifact,
  finalizeCaseArtifactVisualQa,
  getCaseArtifact,
  type CapabilityRunRecord,
} from "../lib/server/capability-run-repository";

const PDF_BYTES = new TextEncoder().encode(
  "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF",
);

function runningRun(): CapabilityRunRecord {
  return {
    id: "run-1",
    caseId: "case-1",
    roleId: "role-1",
    candidateId: "candidate-1",
    capabilityId: "brandedresume",
    executorId: "brand-resume",
    supportingAuthorityIds: [],
    authorityDigest: "a".repeat(64),
    sourceRefs: [],
    inputSnapshotHash: "b".repeat(64),
    input: { extraInput: "", provider: "workstation", model: "builder-v1" },
    outputKind: "pdf",
    implementationStatus: "working",
    provider: "workstation",
    model: "builder-v1",
    preparedAt: "2026-09-20T12:00:00.000Z",
    status: "running",
    result: null,
    evidence: {},
    error: null,
    startedAt: "2026-09-20T12:00:01.000Z",
    finishedAt: null,
    createdBy: "user-1",
    createdAt: "2026-09-20T12:00:00.000Z",
    updatedAt: "2026-09-20T12:00:01.000Z",
  };
}

function interleavingDatabase() {
  const run = {
    id: "run-1",
    caseId: "case-1",
    roleId: "role-1",
    candidateId: "candidate-1",
    capabilityId: "brandedresume",
    executorId: "brand-resume",
    supportingAuthorityIdsJson: "[]",
    authorityDigest: "a".repeat(64),
    sourceRefsJson: "[]",
    inputSnapshotHash: "b".repeat(64),
    inputJson: JSON.stringify({ extraInput: "", provider: "workstation", model: "builder-v1" }),
    outputKind: "pdf",
    implementationStatus: "working" as const,
    provider: "workstation",
    model: "builder-v1",
    preparedAt: "2026-09-20T12:00:00.000Z",
    status: "running" as "running" | "cancelled",
    resultJson: null,
    evidenceJson: "{}",
    errorJson: null,
    startedAt: "2026-09-20T12:00:01.000Z",
    finishedAt: null,
    createdBy: "user-1",
    createdAt: "2026-09-20T12:00:00.000Z",
    updatedAt: "2026-09-20T12:00:01.000Z",
  };
  const artifactRows: Array<Record<string, unknown>> = [];

  const db = {
    select() {
      const result = Promise.resolve([run]);
      const builder = {
        from() {
          return builder;
        },
        where() {
          return builder;
        },
        limit() {
          return builder;
        },
        then: result.then.bind(result),
      };
      return builder;
    },
    insert() {
      let returnedRows: Array<Record<string, unknown>> = [];
      const query = {
        values(row: Record<string, unknown>) {
          run.status = "cancelled";
          artifactRows.push(row);
          returnedRows = [row];
          return query;
        },
        select() {
          run.status = "cancelled";
          returnedRows = [];
          return query;
        },
        onConflictDoNothing() {
          return query;
        },
        returning() {
          return Promise.resolve(returnedRows);
        },
      };
      return query;
    },
  };

  return { db, run, artifactRows };
}

class RecordingBucket implements ArtifactBucket {
  readonly objects = new Map<string, ArrayBuffer>();
  readonly deletedKeys: string[] = [];

  async put(
    key: string,
    value: ArrayBuffer,
  ) {
    this.objects.set(key, value.slice(0));
    return { httpEtag: "etag-race" };
  }

  async get(key: string) {
    const value = this.objects.get(key);
    return value ? { body: value } : null;
  }

  async delete(key: string) {
    this.deletedKeys.push(key);
    this.objects.delete(key);
  }
}

describe("artifact creation cancellation race", () => {
  it("does not create a record and removes staged R2 bytes when cancellation wins the insert race", async () => {
    const database = interleavingDatabase();
    repositoryBoundary.db = database.db;
    const bucket = new RecordingBucket();
    const dependencies: CaseArtifactStoreDependencies = {
      getBucket: () => bucket,
      getCapabilityRun: vi.fn(async () => runningRun()),
      createCaseArtifact,
      getCaseArtifact,
      finalizeCaseArtifactVisualQa,
      inspectPdfPageCount: vi.fn(async () => 2),
      fetchImpl: vi.fn(async () => new Response(PDF_BYTES)),
      allowedBuilderOrigin: "https://builder.example/mcp",
      allowPrivateBuilderOrigin: false,
      randomUUID: () => "artifact-race",
      now: () => "2026-09-20T12:00:02.000Z",
    };

    await expect(persistCaseArtifactWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      runId: "run-1",
      filename: "Race Resume.pdf",
      kind: "brandedresume",
      executorId: "brand-resume",
      source: { bytes: PDF_BYTES },
    }, dependencies)).rejects.toThrow("cancelled");

    const storageKey = "cases/case-1/artifacts/artifact-race/Race Resume.pdf";
    expect(database.run.status).toBe("cancelled");
    expect(database.artifactRows).toEqual([]);
    expect(bucket.deletedKeys).toEqual([storageKey]);
    expect(bucket.objects.has(storageKey)).toBe(false);
  });
});
