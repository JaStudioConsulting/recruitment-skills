import { afterEach, describe, expect, it, vi } from "vitest";

import { workstationApi } from "../lib/api-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("typed artifact browser client", () => {
  it("loads persisted artifacts for the active candidate case", async () => {
    const artifact = {
      id: "artifact-1",
      caseId: "case-1",
      runId: "run-1",
      kind: "brandedresume",
      filename: "Resume.pdf",
      contentType: "application/pdf",
      sha256: "c".repeat(64),
      sizeBytes: 1234,
      revision: 1,
      pageCount: 1,
      visualQaStatus: "pending",
      reviewedAt: null,
      createdAt: "2026-09-20T12:00:00.000Z",
    };
    const fetchMock = vi.fn(async () => Response.json([artifact]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(workstationApi.listCaseArtifacts("case-1")).resolves.toEqual([artifact]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cases/case-1/artifacts/stored",
      expect.objectContaining({ headers: { "content-type": "application/json" } }),
    );
  });

  it("submits the exact visual-QA decision and receives refreshed run truth", async () => {
    const review = {
      status: "failed" as const,
      evidence: {
        artifactId: "artifact-1",
        artifactSha256: "c".repeat(64),
        expected_page_count: 1,
        human_visual_inspection_complete: true as const,
        pages: [{
          page: 1,
          no_clipping: false,
          no_overlap: true,
          no_orphaned_content: true,
          bullets_intact: true,
          logo_layout_ok: true,
          privacy_ok: true,
          page_breaks_natural: true,
        }],
        notes: "Page two clips the final employment bullet.",
      },
    };
    const result = {
      artifact: {
        id: "artifact-1",
        caseId: "case-1",
        runId: "run-1",
        kind: "brandedresume",
        filename: "Resume.pdf",
        contentType: "application/pdf",
        sha256: "c".repeat(64),
        sizeBytes: 1234,
        revision: 1,
        pageCount: 1,
        visualQaStatus: "failed",
        reviewedAt: "2026-09-20T12:05:00.000Z",
        createdAt: "2026-09-20T12:00:00.000Z",
      },
      run: { id: "run-1", status: "failed" },
    };
    const fetchMock = vi.fn(async () => Response.json(result));
    vi.stubGlobal("fetch", fetchMock);

    await expect(workstationApi.reviewCaseArtifact("case-1", "artifact-1", review))
      .resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cases/case-1/artifacts/stored/artifact-1/visual-qa",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify(review) }),
    );
  });
});
