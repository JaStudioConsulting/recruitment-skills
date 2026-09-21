import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getChatGPTUser: vi.fn(),
  listCaseArtifacts: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/app/chatgpt-auth", () => ({
  getChatGPTUser: mocks.getChatGPTUser,
}));
vi.mock("@/lib/server/capability-run-repository", () => ({
  listCaseArtifacts: mocks.listCaseArtifacts,
}));

import { GET } from "../app/api/cases/[caseId]/artifacts/stored/route";

const storedArtifact = {
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
    persistence: { pageCount: 3, storage: "workstation_r2" },
  },
  visualQaStatus: "pending",
  reviewedBy: null,
  reviewedAt: null,
  reviewEvidence: {},
  createdBy: "user-owned",
  createdAt: "2026-09-20T12:00:00.000Z",
};

describe("owned-case stored artifact list route", () => {
  beforeEach(() => {
    mocks.getChatGPTUser.mockReset();
    mocks.listCaseArtifacts.mockReset();
  });

  it("lists browser-safe artifacts through the authenticated owner boundary", async () => {
    mocks.getChatGPTUser.mockResolvedValue({
      userId: "user-owned",
      email: "owner@example.com",
      displayName: "Owner",
      fullName: "Owner",
    });
    mocks.listCaseArtifacts.mockResolvedValue([storedArtifact]);

    const response = await GET(
      new Request("https://workstation.test/api/cases/case-owned/artifacts/stored"),
      { params: Promise.resolve({ caseId: "case-owned" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.listCaseArtifacts).toHaveBeenCalledWith("user-owned", "case-owned");
    const body = await response.json();
    expect(body).toEqual([expect.objectContaining({
      id: "artifact-1",
      caseId: "case-owned",
      sha256: "c".repeat(64),
      pageCount: 3,
      visualQaStatus: "pending",
    })]);
    expect(JSON.stringify(body)).not.toContain("storageKey");
    expect(JSON.stringify(body)).not.toContain("signedBuilderUrl");
    expect(JSON.stringify(body)).not.toContain("user-owned");
  });

  it("does not access artifact storage for an unauthenticated request", async () => {
    mocks.getChatGPTUser.mockResolvedValue(null);

    const response = await GET(
      new Request("https://workstation.test/api/cases/case-owned/artifacts/stored"),
      { params: Promise.resolve({ caseId: "case-owned" }) },
    );

    expect(response.status).toBe(401);
    expect(mocks.listCaseArtifacts).not.toHaveBeenCalled();
  });
});
