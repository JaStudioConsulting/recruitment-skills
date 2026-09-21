import { beforeEach, describe, expect, it, vi } from "vitest";

import { artifactVisualQaReviewSchema } from "../lib/artifact-browser";

const mocks = vi.hoisted(() => ({
  getChatGPTUser: vi.fn(),
  reviewCaseArtifactVisualQaRequest: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/app/chatgpt-auth", () => ({
  getChatGPTUser: mocks.getChatGPTUser,
}));
vi.mock("@/lib/server/case-artifact-store", () => ({
  reviewCaseArtifactVisualQaRequest: mocks.reviewCaseArtifactVisualQaRequest,
  visualQaReviewSchema: artifactVisualQaReviewSchema,
}));

import { PATCH } from "../app/api/cases/[caseId]/artifacts/stored/[artifactId]/visual-qa/route";

const evidence = {
  artifactId: "artifact-1",
  artifactSha256: "c".repeat(64),
  expected_page_count: 1,
  human_visual_inspection_complete: true as const,
  pages: [{
    page: 1,
    no_clipping: true,
    no_overlap: true,
    no_orphaned_content: true,
    bullets_intact: true,
    logo_layout_ok: true,
    privacy_ok: true,
    page_breaks_natural: true,
  }],
  notes: "Checked every page. Identity, layout, clipping, and page breaks are correct.",
};

describe("owned-case artifact visual-QA route", () => {
  beforeEach(() => {
    mocks.getChatGPTUser.mockReset();
    mocks.reviewCaseArtifactVisualQaRequest.mockReset();
  });

  it("returns a browser-safe artifact and the resulting run status", async () => {
    mocks.getChatGPTUser.mockResolvedValue({
      userId: "user-owned",
      email: "owner@example.com",
      displayName: "Owner",
      fullName: "Owner",
    });
    mocks.reviewCaseArtifactVisualQaRequest.mockResolvedValue({
      artifact: {
        id: "artifact-1",
        caseId: "case-owned",
        runId: "run-1",
        kind: "brandedresume",
        filename: "Owned Resume.pdf",
        contentType: "application/pdf",
        storageKey: "cases/case-owned/private/key.pdf",
        sha256: "c".repeat(64),
        sizeBytes: 9876,
        revision: 1,
        evidence: {
          signedBuilderUrl: "https://secret.invalid/token",
          persistence: { pageCount: 1, storage: "workstation_r2" },
        },
        visualQaStatus: "passed",
        reviewedBy: "user-owned",
        reviewedAt: "2026-09-20T12:05:00.000Z",
        reviewEvidence: evidence,
        createdBy: "user-owned",
        createdAt: "2026-09-20T12:00:00.000Z",
      },
      run: {
        id: "run-1",
        caseId: "case-owned",
        capabilityId: "brandedresume",
        status: "completed",
      },
    });
    const review = { status: "passed", evidence };

    const response = await PATCH(
      new Request("https://workstation.test/api/cases/case-owned/artifacts/stored/artifact-1/visual-qa", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(review),
      }),
      { params: Promise.resolve({ caseId: "case-owned", artifactId: "artifact-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.reviewCaseArtifactVisualQaRequest).toHaveBeenCalledWith({
      userId: "user-owned",
      caseId: "case-owned",
      artifactId: "artifact-1",
      review,
    });
    const body = await response.json() as {
      artifact: Record<string, unknown>;
      run: Record<string, unknown>;
    };
    expect(body.artifact).toMatchObject({
      id: "artifact-1",
      sha256: "c".repeat(64),
      pageCount: 1,
      visualQaStatus: "passed",
    });
    expect(body.run).toMatchObject({ id: "run-1", status: "completed" });
    expect(JSON.stringify(body.artifact)).not.toContain("storageKey");
    expect(JSON.stringify(body.artifact)).not.toContain("signedBuilderUrl");
    expect(JSON.stringify(body.artifact)).not.toContain("reviewEvidence");
  });

  it("rejects review evidence without completed human visual inspection", async () => {
    mocks.getChatGPTUser.mockResolvedValue({
      userId: "user-owned",
      email: "owner@example.com",
      displayName: "Owner",
      fullName: "Owner",
    });

    const response = await PATCH(
      new Request("https://workstation.test/api/cases/case-owned/artifacts/stored/artifact-1/visual-qa", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "failed",
          evidence: {
            ...evidence,
            human_visual_inspection_complete: false,
            pages: [{ ...evidence.pages[0], no_clipping: false }],
          },
        }),
      }),
      { params: Promise.resolve({ caseId: "case-owned", artifactId: "artifact-1" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.reviewCaseArtifactVisualQaRequest).not.toHaveBeenCalled();
  });
});
