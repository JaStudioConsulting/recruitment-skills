import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import {
  downloadPersistedCaseArtifactWithDependencies,
  persistCaseArtifactWithDependencies,
  reviewCaseArtifactVisualQaWithDependencies,
  visualQaReviewSchema,
  type ArtifactBucket,
  type CaseArtifactStoreDependencies,
} from "../lib/server/case-artifact-store";
import type {
  CapabilityRunRecord,
  CaseArtifactRecord,
  CreateCaseArtifactInput,
} from "../lib/server/capability-run-repository";

const PDF_BYTES = new TextEncoder().encode(
  "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF",
);

function run(overrides: Partial<CapabilityRunRecord> = {}): CapabilityRunRecord {
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
    ...overrides,
  };
}

function artifact(input: CreateCaseArtifactInput): CaseArtifactRecord {
  return {
    ...input,
    revision: input.revision ?? 1,
    evidence: input.evidence ?? {},
    visualQaStatus: "pending",
    reviewedBy: null,
    reviewedAt: null,
    reviewEvidence: {},
    createdBy: "user-1",
    createdAt: "2026-09-20T12:00:02.000Z",
  };
}

function storedArtifact(status: CaseArtifactRecord["visualQaStatus"] = "pending"): CaseArtifactRecord {
  return {
    ...artifact({
      id: "artifact-123",
      caseId: "case-1",
      runId: "run-1",
      kind: "brandedresume",
      filename: "Synthetic Resume.pdf",
      contentType: "application/pdf",
      storageKey: "cases/case-1/artifacts/artifact-123/Synthetic Resume.pdf",
      sha256: "c".repeat(64),
      sizeBytes: PDF_BYTES.byteLength,
      evidence: {
        builder: { source: "bytes" },
        persistence: { pageCount: 2, storage: "workstation_r2" },
      },
    }),
    visualQaStatus: status,
    reviewedBy: status === "pending" ? null : "user-1",
    reviewedAt: status === "pending" ? null : "2026-09-20T12:05:00.000Z",
    reviewEvidence: status === "pending" ? {} : { pagesReviewed: 1 },
  };
}

function qaEvidence(
  target: CaseArtifactRecord = storedArtifact(),
  notes = "Checked every page for identity, clipping, margins, and page breaks.",
  failed = false,
) {
  const page = (pageNumber: number) => ({
    page: pageNumber,
    no_clipping: !(failed && pageNumber === 2),
    no_overlap: true,
    no_orphaned_content: true,
    bullets_intact: true,
    logo_layout_ok: true,
    privacy_ok: true,
    page_breaks_natural: true,
  });
  return {
    artifactId: target.id,
    artifactSha256: target.sha256,
    expected_page_count: 2,
    human_visual_inspection_complete: true as const,
    pages: [page(1), page(2)],
    notes,
  };
}

class FakeArtifactBucket implements ArtifactBucket {
  readonly objects = new Map<string, Uint8Array>();
  readonly putCalls: Array<{
    key: string;
    options: Parameters<ArtifactBucket["put"]>[2];
  }> = [];

  async put(
    key: string,
    value: ArrayBuffer,
    options: Parameters<ArtifactBucket["put"]>[2],
  ) {
    this.putCalls.push({ key, options });
    if (this.objects.has(key) && options.onlyIf.etagDoesNotMatch === "*") return null;
    this.objects.set(key, new Uint8Array(value.slice(0)));
    return { httpEtag: `etag-${this.objects.size}` };
  }

  async get(key: string) {
    const bytes = this.objects.get(key);
    if (!bytes) return null;
    return {
      body: new Blob([Uint8Array.from(bytes).buffer]),
      httpEtag: `etag-${this.objects.size}`,
    };
  }

  async delete(key: string) {
    this.objects.delete(key);
  }
}

function dependencies(overrides: Partial<CaseArtifactStoreDependencies> = {}) {
  const bucket = new FakeArtifactBucket();
  const created: CaseArtifactRecord[] = [];
  const getCapabilityRun = vi.fn(async () => run());
  const createCaseArtifact = vi.fn(async (
    _userId: string,
    input: CreateCaseArtifactInput,
  ) => {
    const record = artifact(input);
    created.push(record);
    return record;
  });
  const getCaseArtifact = vi.fn(async () => {
    const record = created.at(-1);
    if (!record) throw new Error("artifact not found");
    return record;
  });
  const finalizeCaseArtifactVisualQa = vi.fn(async (
    _userId: string,
    _caseId: string,
    _artifactId: string,
    status: "passed" | "failed",
    evidence: unknown,
  ) => {
    const currentArtifact = created.at(-1) ?? storedArtifact();
    return {
      artifact: {
        ...currentArtifact,
        visualQaStatus: status,
        reviewedBy: "user-1",
        reviewedAt: "2026-09-20T12:05:00.000Z",
        reviewEvidence: evidence,
      },
      run: run({
        status: status === "passed" ? "completed" : "failed",
        result: { artifactId: currentArtifact.id },
        evidence: { visualQa: evidence },
        error: status === "failed" ? { code: "visual_qa_failed" } : null,
      }),
    };
  });
  const inspectPdfPageCount = vi.fn(async (bytes: ArrayBuffer) => {
    void bytes;
    return 2;
  });
  const value: CaseArtifactStoreDependencies = {
    getBucket: () => bucket,
    getCapabilityRun,
    createCaseArtifact,
    getCaseArtifact,
    finalizeCaseArtifactVisualQa,
    inspectPdfPageCount,
    fetchImpl: vi.fn(async () => new Response(PDF_BYTES, {
      status: 200,
      headers: { "content-type": "application/pdf" },
    })),
    allowedBuilderOrigin: "https://builder.example/mcp",
    allowPrivateBuilderOrigin: false,
    randomUUID: () => "artifact-123",
    now: () => "2026-09-20T12:00:02.000Z",
    ...overrides,
  };
  return {
    value,
    bucket,
    created,
    getCapabilityRun,
    createCaseArtifact,
    getCaseArtifact,
    finalizeCaseArtifactVisualQa,
    inspectPdfPageCount,
  };
}

describe("durable case artifact persistence", () => {
  it("checks the owned case/run before fetching or storing builder output", async () => {
    const getCapabilityRun = vi.fn(async () => {
      throw new Error("Capability run was not found.");
    });
    const fetchImpl = vi.fn(async () => new Response(PDF_BYTES));
    const deps = dependencies({ getCapabilityRun, fetchImpl });

    await expect(persistCaseArtifactWithDependencies({
      userId: "other-user",
      caseId: "case-1",
      runId: "run-1",
      filename: "Synthetic Resume.pdf",
      kind: "brandedresume",
      executorId: "brand-resume",
      source: { downloadUrl: "https://builder.example/artifacts/remote.pdf" },
    }, deps.value)).rejects.toThrow("Capability run was not found");

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(deps.bucket.putCalls).toHaveLength(0);
    expect(deps.createCaseArtifact).not.toHaveBeenCalled();
  });

  it.each([
    ["prepared run", { status: "prepared" as const }],
    ["completed run", { status: "completed" as const }],
    ["failed run", { status: "failed" as const }],
    ["non-PDF run", { outputKind: "resume" }],
    ["different executor", { executorId: "reference-check-pdf" }],
  ])("rejects artifact attachment to a %s", async (_label, runPatch) => {
    const fetchImpl = vi.fn(async () => new Response(PDF_BYTES));
    const deps = dependencies({
      getCapabilityRun: vi.fn(async () => run(runPatch)),
      fetchImpl,
    });

    await expect(persistCaseArtifactWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      runId: "run-1",
      filename: "Synthetic Resume.pdf",
      kind: "brandedresume",
      executorId: "brand-resume",
      source: { downloadUrl: "https://builder.example/artifacts/remote.pdf" },
    }, deps.value)).rejects.toThrow();

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(deps.bucket.putCalls).toHaveLength(0);
    expect(deps.createCaseArtifact).not.toHaveBeenCalled();
  });

  it("rejects an artifact capability that differs from the owned run", async () => {
    const fetchImpl = vi.fn(async () => new Response(PDF_BYTES));
    const deps = dependencies({ fetchImpl });

    await expect(persistCaseArtifactWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      runId: "run-1",
      filename: "Synthetic Resume.pdf",
      kind: "complete-reference-check",
      executorId: "brand-resume",
      source: { downloadUrl: "https://builder.example/artifacts/remote.pdf" },
    }, deps.value)).rejects.toThrow("capability does not match");

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(deps.createCaseArtifact).not.toHaveBeenCalled();
  });

  it("rejects builder downloads outside the configured origin without fetching", async () => {
    const fetchImpl = vi.fn(async () => new Response(PDF_BYTES));
    const deps = dependencies({ fetchImpl });

    await expect(persistCaseArtifactWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      runId: "run-1",
      filename: "Synthetic Resume.pdf",
      kind: "brandedresume",
      executorId: "brand-resume",
      source: { downloadUrl: "https://foreign.example/artifacts/remote.pdf" },
    }, deps.value)).rejects.toThrow("outside the configured builder origin");

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(deps.createCaseArtifact).not.toHaveBeenCalled();
  });

  it("rejects a configured private builder origin when private origins are disabled", async () => {
    const fetchImpl = vi.fn(async () => new Response(PDF_BYTES));
    const deps = dependencies({
      fetchImpl,
      allowedBuilderOrigin: "http://127.0.0.1:8000/mcp",
      allowPrivateBuilderOrigin: false,
    });

    await expect(persistCaseArtifactWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      runId: "run-1",
      filename: "Synthetic Resume.pdf",
      kind: "brandedresume",
      executorId: "brand-resume",
      source: { downloadUrl: "http://127.0.0.1:8000/files/result.pdf" },
    }, deps.value)).rejects.toThrow("Private or local builder artifact origins are not allowed");

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(deps.createCaseArtifact).not.toHaveBeenCalled();
  });

  it.each([
    ["trailing-dot localhost", "http://localhost.:8000"],
    ["trailing-dot localhost subdomain", "http://builder.localhost.:8000"],
    ["IPv4-mapped IPv6 loopback", "http://[::ffff:127.0.0.1]:8000"],
    ["IPv4-mapped IPv6 private address", "http://[::ffff:10.0.0.1]:8000"],
    ["IPv4-mapped IPv6 link-local address", "http://[::ffff:169.254.1.1]:8000"],
  ])("rejects a %s builder origin in production", async (_label, origin) => {
    const fetchImpl = vi.fn(async () => new Response(PDF_BYTES));
    const deps = dependencies({
      fetchImpl,
      allowedBuilderOrigin: `${origin}/mcp`,
      allowPrivateBuilderOrigin: false,
    });

    await expect(persistCaseArtifactWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      runId: "run-1",
      filename: "Synthetic Resume.pdf",
      kind: "brandedresume",
      executorId: "brand-resume",
      source: { downloadUrl: `${origin}/files/result.pdf` },
    }, deps.value)).rejects.toThrow("Private or local builder artifact origins are not allowed");

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(deps.bucket.putCalls).toHaveLength(0);
    expect(deps.createCaseArtifact).not.toHaveBeenCalled();
  });

  it("does not follow a builder redirect that escapes the configured origin", async () => {
    const fetchImpl = vi.fn<CaseArtifactStoreDependencies["fetchImpl"]>(async () => new Response(null, {
      status: 302,
      headers: { location: "https://foreign.example/stolen.pdf" },
    }));
    const deps = dependencies({ fetchImpl });

    await expect(persistCaseArtifactWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      runId: "run-1",
      filename: "Synthetic Resume.pdf",
      kind: "brandedresume",
      executorId: "brand-resume",
      source: { downloadUrl: "https://builder.example/artifacts/redirect.pdf" },
    }, deps.value)).rejects.toThrow("outside the configured builder origin");

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
    expect(deps.createCaseArtifact).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared content length before reading or storing", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error("body must not be read");
      },
    });
    const deps = dependencies({
      fetchImpl: vi.fn(async () => new Response(stream, {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-length": String(20 * 1024 * 1024 + 1),
        },
      })),
    });

    await expect(persistCaseArtifactWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      runId: "run-1",
      filename: "Synthetic Resume.pdf",
      kind: "brandedresume",
      executorId: "brand-resume",
      source: { downloadUrl: "https://builder.example/artifacts/large.pdf" },
    }, deps.value)).rejects.toThrow("exceeds the 20 MB");

    expect(deps.bucket.putCalls).toHaveLength(0);
    expect(deps.createCaseArtifact).not.toHaveBeenCalled();
  });

  it("stops an oversized streamed body at the hard byte cap", async () => {
    const chunkSize = 1024 * 1024;
    let emitted = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (emitted >= 21) return controller.close();
        const chunk = new Uint8Array(chunkSize);
        if (emitted === 0) chunk.set(new TextEncoder().encode("%PDF-"));
        emitted += 1;
        controller.enqueue(chunk);
      },
    });
    const deps = dependencies({
      fetchImpl: vi.fn(async () => new Response(stream, {
        status: 200,
        headers: { "content-type": "application/pdf" },
      })),
    });

    await expect(persistCaseArtifactWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      runId: "run-1",
      filename: "Synthetic Resume.pdf",
      kind: "brandedresume",
      executorId: "brand-resume",
      source: { downloadUrl: "https://builder.example/artifacts/streamed.pdf" },
    }, deps.value)).rejects.toThrow("exceeds the 20 MB");

    expect(emitted).toBe(21);
    expect(deps.bucket.putCalls).toHaveLength(0);
    expect(deps.createCaseArtifact).not.toHaveBeenCalled();
  });

  it("does not write bytes or a record when the builder fetch fails", async () => {
    const deps = dependencies({
      fetchImpl: vi.fn(async () => {
        throw new Error("synthetic builder outage");
      }),
    });

    await expect(persistCaseArtifactWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      runId: "run-1",
      filename: "Synthetic Resume.pdf",
      kind: "brandedresume",
      executorId: "brand-resume",
      source: {
        downloadUrl: "https://builder.example/artifacts/remote.pdf",
        evidence: { provider: "synthetic-builder", invocationId: "build-1" },
      },
    }, deps.value)).rejects.toThrow("could not be fetched");

    expect(deps.getCapabilityRun).toHaveBeenCalledWith("user-1", "case-1", "run-1");
    expect(deps.bucket.putCalls).toHaveLength(0);
    expect(deps.createCaseArtifact).not.toHaveBeenCalled();
  });

  it("rechecks the run after a remote fetch and refuses storage if it was cancelled", async () => {
    const getCapabilityRun = vi.fn()
      .mockResolvedValueOnce(run())
      .mockResolvedValueOnce(run({ status: "cancelled" }));
    const deps = dependencies({ getCapabilityRun });

    await expect(persistCaseArtifactWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      runId: "run-1",
      filename: "Late Result.pdf",
      kind: "brandedresume",
      executorId: "brand-resume",
      source: { downloadUrl: "https://builder.example/artifacts/late.pdf" },
    }, deps.value)).rejects.toThrow("changed while the PDF was being acquired");

    expect(getCapabilityRun).toHaveBeenCalledTimes(2);
    expect(deps.bucket.putCalls).toHaveLength(0);
    expect(deps.createCaseArtifact).not.toHaveBeenCalled();
  });

  it("does not write bytes or a record for an empty builder response", async () => {
    const deps = dependencies({
      fetchImpl: vi.fn(async () => new Response(new Uint8Array(), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      })),
    });

    await expect(persistCaseArtifactWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      runId: "run-1",
      filename: "Synthetic Resume.pdf",
      kind: "brandedresume",
      executorId: "brand-resume",
      source: { downloadUrl: "https://builder.example/artifacts/empty.pdf" },
    }, deps.value)).rejects.toThrow("empty PDF");

    expect(deps.bucket.putCalls).toHaveLength(0);
    expect(deps.createCaseArtifact).not.toHaveBeenCalled();
  });

  it("does not write bytes or a record when builder bytes are not a PDF", async () => {
    const deps = dependencies();

    await expect(persistCaseArtifactWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      runId: "run-1",
      filename: "Synthetic Resume.pdf",
      kind: "brandedresume",
      executorId: "brand-resume",
      source: { bytes: new TextEncoder().encode("not a PDF") },
    }, deps.value)).rejects.toThrow("not a valid PDF");

    expect(deps.bucket.putCalls).toHaveLength(0);
    expect(deps.createCaseArtifact).not.toHaveBeenCalled();
  });

  it("does not persist a PDF when page inspection fails or returns an invalid count", async () => {
    for (const inspectPdfPageCount of [
      vi.fn(async () => { throw new Error("synthetic parser failure"); }),
      vi.fn(async () => 0),
      vi.fn(async () => 1.5),
    ]) {
      const deps = dependencies({ inspectPdfPageCount });

      await expect(persistCaseArtifactWithDependencies({
        userId: "user-1",
        caseId: "case-1",
        runId: "run-1",
        filename: "Unreadable Resume.pdf",
        kind: "brandedresume",
        executorId: "brand-resume",
        source: { bytes: PDF_BYTES },
      }, deps.value)).rejects.toThrow("readable positive page count");

      expect(inspectPdfPageCount).toHaveBeenCalledOnce();
      expect(deps.bucket.putCalls).toHaveLength(0);
      expect(deps.createCaseArtifact).not.toHaveBeenCalled();
    }
  });

  it("inspects actual PDF bytes, then records the page count with immutable persistence evidence", async () => {
    const deps = dependencies();
    const expectedHash = createHash("sha256").update(PDF_BYTES).digest("hex");

    const result = await persistCaseArtifactWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      runId: "run-1",
      filename: "Synthetic Resume.pdf",
      kind: "brandedresume",
      executorId: "brand-resume",
      source: {
        bytes: PDF_BYTES,
        evidence: { provider: "synthetic-builder", invocationId: "build-2" },
      },
    }, deps.value);

    const storageKey = "cases/case-1/artifacts/artifact-123/Synthetic Resume.pdf";
    expect(result).toMatchObject({
      id: "artifact-123",
      caseId: "case-1",
      runId: "run-1",
      kind: "brandedresume",
      filename: "Synthetic Resume.pdf",
      contentType: "application/pdf",
      storageKey,
      sha256: expectedHash,
      sizeBytes: PDF_BYTES.byteLength,
      visualQaStatus: "pending",
    });
    expect(deps.inspectPdfPageCount).toHaveBeenCalledOnce();
    expect(new Uint8Array(deps.inspectPdfPageCount.mock.calls[0][0])).toEqual(PDF_BYTES);
    expect(deps.bucket.putCalls).toEqual([{
      key: storageKey,
      options: {
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: "application/pdf" },
        customMetadata: { sha256: expectedHash },
      },
    }]);
    expect(deps.createCaseArtifact).toHaveBeenCalledWith("user-1", expect.objectContaining({
      evidence: {
        builder: {
          source: "bytes",
          result: { provider: "synthetic-builder", invocationId: "build-2" },
        },
        persistence: {
          capturedAt: "2026-09-20T12:00:02.000Z",
          pageCount: 2,
          storage: "workstation_r2",
        },
      },
    }));
  });

  it("downloads reloaded R2 bytes without depending on the builder URL", async () => {
    const fetchImpl = vi.fn(async () => new Response(PDF_BYTES, {
      status: 200,
      headers: { "content-type": "application/pdf" },
    }));
    const deps = dependencies({ fetchImpl });
    const persisted = await persistCaseArtifactWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      runId: "run-1",
      filename: "Remote Result.pdf",
      kind: "brandedresume",
      executorId: "brand-resume",
      source: {
        downloadUrl: "https://builder.example/artifacts/result.pdf?token=must-not-persist",
        evidence: { provider: "synthetic-builder", invocationId: "build-3" },
      },
    }, deps.value);

    fetchImpl.mockImplementation(async () => {
      throw new Error("builder URL expired");
    });
    const response = await downloadPersistedCaseArtifactWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      artifactId: persisted.id,
    }, deps.value);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PDF_BYTES);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("Remote Result.pdf");
    expect(deps.createCaseArtifact).toHaveBeenCalledWith("user-1", expect.objectContaining({
      evidence: expect.objectContaining({
        builder: expect.objectContaining({
          source: "download_url",
          downloadUrl: "https://builder.example/artifacts/result.pdf",
        }),
      }),
    }));
  });

  it("accepts only complete per-page evidence whose checks agree with the terminal decision", () => {
    const evidence = qaEvidence();
    expect(visualQaReviewSchema.parse({
      status: "passed",
      evidence,
    })).toEqual({
      status: "passed",
      evidence,
    });
    expect(() => visualQaReviewSchema.parse({ status: "pending", evidence }))
      .toThrow();
    expect(() => visualQaReviewSchema.parse({
      status: "failed",
      evidence,
    })).toThrow();
    expect(visualQaReviewSchema.parse({
      status: "failed",
      evidence: qaEvidence(storedArtifact(), "Page 2 clips a bullet.", true),
    }).status).toBe("failed");
    expect(() => visualQaReviewSchema.parse({
      status: "passed",
      evidence: qaEvidence(storedArtifact(), "Page 2 clips a bullet.", true),
    })).toThrow();
    expect(() => visualQaReviewSchema.parse({
      status: "passed",
      evidence: { ...evidence, human_visual_inspection_complete: false },
    })).toThrow();
    expect(() => visualQaReviewSchema.parse({
      status: "passed",
      evidence: { ...evidence, pages: [evidence.pages[0]] },
    })).toThrow();
    expect(() => visualQaReviewSchema.parse({
      status: "passed",
      evidence: { ...evidence, notes: "   " },
    }))
      .toThrow();
  });

  it("completes an awaiting PDF run only after all persisted artifacts pass QA", async () => {
    const currentArtifact = storedArtifact("pending");
    const evidence = qaEvidence(currentArtifact);
    const passedArtifact = {
      ...currentArtifact,
      visualQaStatus: "passed" as const,
      reviewedBy: "user-1",
      reviewedAt: "2026-09-20T12:05:00.000Z",
      reviewEvidence: evidence,
    };
    const awaitingRun = run({
      status: "awaiting_visual_qa",
      result: { artifact: { id: currentArtifact.id, sha256: currentArtifact.sha256 } },
      evidence: { executorId: "brand-resume" },
    });
    const completedRun = {
      ...awaitingRun,
      status: "completed" as const,
    };
    const finalizeCaseArtifactVisualQa = vi.fn(async () => ({
      artifact: passedArtifact,
      run: completedRun,
    }));
    const deps = dependencies({
      getCaseArtifact: vi.fn(async () => currentArtifact),
      getCapabilityRun: vi.fn(async () => awaitingRun),
      finalizeCaseArtifactVisualQa,
    });
    const result = await reviewCaseArtifactVisualQaWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      artifactId: "artifact-123",
      review: { status: "passed", evidence },
    }, deps.value);

    expect(result.artifact.visualQaStatus).toBe("passed");
    expect(result.run.status).toBe("completed");
    expect(finalizeCaseArtifactVisualQa).toHaveBeenCalledWith(
      "user-1",
      "case-1",
      "artifact-123",
      "passed",
      {
        ...evidence,
        reviewer: "user-1",
        inspected_at: "2026-09-20T12:00:02.000Z",
      },
    );
  });

  it("fails an awaiting PDF run when human visual QA fails", async () => {
    const currentArtifact = storedArtifact("pending");
    const evidence = qaEvidence(currentArtifact, "Page 2 clips the final employment bullet.", true);
    const failedArtifact = {
      ...currentArtifact,
      visualQaStatus: "failed" as const,
      reviewedBy: "user-1",
      reviewedAt: "2026-09-20T12:05:00.000Z",
      reviewEvidence: evidence,
    };
    const awaitingRun = run({
      status: "awaiting_visual_qa",
      result: { artifact: { id: currentArtifact.id } },
      evidence: { executorId: "brand-resume" },
    });
    const failedRun = {
      ...awaitingRun,
      status: "failed" as const,
      error: { code: "visual_qa_failed", artifactId: currentArtifact.id },
    };
    const finalizeCaseArtifactVisualQa = vi.fn(async () => ({
      artifact: failedArtifact,
      run: failedRun,
    }));
    const deps = dependencies({
      getCaseArtifact: vi.fn(async () => currentArtifact),
      getCapabilityRun: vi.fn(async () => awaitingRun),
      finalizeCaseArtifactVisualQa,
    });
    const result = await reviewCaseArtifactVisualQaWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      artifactId: "artifact-123",
      review: { status: "failed", evidence },
    }, deps.value);

    expect(result.artifact.visualQaStatus).toBe("failed");
    expect(result.run.status).toBe("failed");
    expect(finalizeCaseArtifactVisualQa).toHaveBeenCalledWith(
      "user-1",
      "case-1",
      "artifact-123",
      "failed",
      {
        ...evidence,
        reviewer: "user-1",
        inspected_at: "2026-09-20T12:00:02.000Z",
      },
    );
  });

  it("does not strand a final artifact when the capability-run transition write fails", async () => {
    const artifactState = storedArtifact("pending");
    const awaitingRun = run({
      status: "awaiting_visual_qa",
      result: { artifact: { id: artifactState.id, sha256: artifactState.sha256 } },
      evidence: { executorId: "brand-resume" },
    });
    const evidence = qaEvidence(
      artifactState,
      "Page 2 clips the final employment bullet.",
      true,
    );
    const finalizeCaseArtifactVisualQa = vi.fn(async () => {
      throw new Error("synthetic capability-run write failure");
    });
    const deps = dependencies({
      getCaseArtifact: vi.fn(async () => artifactState),
      getCapabilityRun: vi.fn(async () => awaitingRun),
      finalizeCaseArtifactVisualQa,
    });

    await expect(reviewCaseArtifactVisualQaWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      artifactId: artifactState.id,
      review: { status: "failed", evidence },
    }, deps.value)).rejects.toThrow("synthetic capability-run write failure");

    expect(artifactState.visualQaStatus).toBe("pending");
    expect(awaitingRun.status).toBe("awaiting_visual_qa");
    expect(finalizeCaseArtifactVisualQa).toHaveBeenCalledOnce();
  });

  it("refuses a repeat QA review without attempting another run transition", async () => {
    const passedArtifact = storedArtifact("passed");
    const finalizeCaseArtifactVisualQa = vi.fn();
    const deps = dependencies({
      getCaseArtifact: vi.fn(async () => passedArtifact),
      finalizeCaseArtifactVisualQa,
    });

    await expect(reviewCaseArtifactVisualQaWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      artifactId: "artifact-123",
      review: { status: "failed", evidence: qaEvidence(passedArtifact, "Page 2 clipped.", true) },
    }, deps.value)).rejects.toThrow("cannot transition from passed");

    expect(finalizeCaseArtifactVisualQa).not.toHaveBeenCalled();
  });

  it("refuses QA evidence whose page count does not match the persisted PDF", async () => {
    const currentArtifact = storedArtifact("pending");
    const finalizeCaseArtifactVisualQa = vi.fn();
    const evidence = qaEvidence(currentArtifact);
    const deps = dependencies({
      getCaseArtifact: vi.fn(async () => currentArtifact),
      finalizeCaseArtifactVisualQa,
    });

    await expect(reviewCaseArtifactVisualQaWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      artifactId: currentArtifact.id,
      review: {
        status: "passed",
        evidence: {
          ...evidence,
          expected_page_count: 1,
          pages: [evidence.pages[0]],
        },
      },
    }, deps.value)).rejects.toThrow("page count does not match the stored PDF");

    expect(finalizeCaseArtifactVisualQa).not.toHaveBeenCalled();
  });

  it("refuses QA evidence for a different artifact identity before persisting review", async () => {
    const currentArtifact = storedArtifact("pending");
    const finalizeCaseArtifactVisualQa = vi.fn();
    const deps = dependencies({
      getCaseArtifact: vi.fn(async () => currentArtifact),
      getCapabilityRun: vi.fn(async () => run({ status: "awaiting_visual_qa" })),
      finalizeCaseArtifactVisualQa,
    });

    await expect(reviewCaseArtifactVisualQaWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      artifactId: currentArtifact.id,
      review: {
        status: "passed",
        evidence: {
          ...qaEvidence(currentArtifact),
          artifactSha256: "d".repeat(64),
        },
      },
    }, deps.value)).rejects.toThrow("does not match the stored PDF");

    expect(finalizeCaseArtifactVisualQa).not.toHaveBeenCalled();
  });
});
