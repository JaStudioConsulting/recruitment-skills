import { beforeEach, describe, expect, it, vi } from "vitest";

const PDF_BYTES = new TextEncoder().encode(
  "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF",
);

const mocks = vi.hoisted(() => ({
  getChatGPTUser: vi.fn(),
  getOwnedSource: vi.fn(),
  bucketGet: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/app/chatgpt-auth", () => ({
  getChatGPTUser: mocks.getChatGPTUser,
}));
vi.mock("@/db", () => ({
  StorageBindingError: class StorageBindingError extends Error {},
  getSourceBucket: () => ({ get: mocks.bucketGet }),
}));
vi.mock("@/lib/server/case-repository", () => ({
  assertOwnedCase: vi.fn(),
  assertOwnedRole: vi.fn(),
  createCandidateCaseFromSourceAtomic: vi.fn(),
  getActiveCaseSourceBySha256: vi.fn(),
  getActiveRoleSourceBySha256: vi.fn(),
  getCandidateCase: vi.fn(),
  getCandidateSourceIntakeResult: vi.fn(),
  getOwnedRoleSource: vi.fn(),
  getOwnedSource: mocks.getOwnedSource,
  getPersistedSourceIntake: vi.fn(),
  getRoleSources: vi.fn(),
  insertRoleSource: vi.fn(),
  insertSource: vi.fn(),
  persistSourceIntake: vi.fn(),
}));

import { GET } from "../app/api/cases/[caseId]/sources/[sourceId]/route";

describe("owned source download route", () => {
  beforeEach(() => {
    mocks.getChatGPTUser.mockReset().mockResolvedValue({
      userId: "owner-1",
      email: "owner@example.com",
      displayName: "Owner",
      fullName: "Owner",
    });
    mocks.getOwnedSource.mockReset().mockResolvedValue({
      id: "source-1",
      caseId: "case-1",
      filename: "Candidate Resume.pdf",
      contentType: "application/pdf",
      sizeBytes: PDF_BYTES.byteLength,
      storageKey: "cases/case-1/sources/source-1",
    });
    mocks.bucketGet.mockReset().mockImplementation(async (
      _key: string,
      options?: { range?: { offset: number; length?: number } },
    ) => {
      const offset = options?.range?.offset ?? 0;
      const end = options?.range?.length === undefined
        ? PDF_BYTES.byteLength
        : Math.min(PDF_BYTES.byteLength, offset + options.range.length);
      return {
        body: new Blob([PDF_BYTES.slice(offset, end)]).stream(),
        httpEtag: '"stored-etag"',
        size: PDF_BYTES.byteLength,
      };
    });
  });

  it("serves an authenticated inline PDF byte range to the browser viewer", async () => {
    const response = await GET(
      new Request("https://workstation.test/api/cases/case-1/sources/source-1?inline=1", {
        headers: { range: "bytes=0-4" },
      }),
      { params: Promise.resolve({ caseId: "case-1", sourceId: "source-1" }) },
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-range")).toBe(`bytes 0-4/${PDF_BYTES.byteLength}`);
    expect(response.headers.get("content-length")).toBe("5");
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("inline");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PDF_BYTES.slice(0, 5));
    expect(mocks.bucketGet).toHaveBeenCalledWith(
      "cases/case-1/sources/source-1",
      { range: { offset: 0, length: 5 } },
    );
  });

  it("serves a full download fallback when no range is specified", async () => {
    const response = await GET(
      new Request("https://workstation.test/api/cases/case-1/sources/source-1"),
      { params: Promise.resolve({ caseId: "case-1", sourceId: "source-1" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-length")).toBe(String(PDF_BYTES.byteLength));
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PDF_BYTES);
    expect(mocks.bucketGet).toHaveBeenCalledWith("cases/case-1/sources/source-1", undefined);
  });

  it("returns 416 Range Not Satisfiable for out-of-bounds byte ranges", async () => {
    const response = await GET(
      new Request("https://workstation.test/api/cases/case-1/sources/source-1?inline=1", {
        headers: { range: "bytes=5000-6000" },
      }),
      { params: Promise.resolve({ caseId: "case-1", sourceId: "source-1" }) },
    );

    expect(response.status).toBe(416);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-range")).toBe(`bytes */${PDF_BYTES.byteLength}`);
  });

  it("serves suffix byte ranges correctly", async () => {
    const suffixLen = 10;
    const response = await GET(
      new Request("https://workstation.test/api/cases/case-1/sources/source-1?inline=1", {
        headers: { range: `bytes=-${suffixLen}` },
      }),
      { params: Promise.resolve({ caseId: "case-1", sourceId: "source-1" }) },
    );

    expect(response.status).toBe(206);
    const expectedOffset = PDF_BYTES.byteLength - suffixLen;
    expect(response.headers.get("content-range")).toBe(
      `bytes ${expectedOffset}-${PDF_BYTES.byteLength - 1}/${PDF_BYTES.byteLength}`,
    );
    expect(response.headers.get("content-length")).toBe(String(suffixLen));
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      PDF_BYTES.slice(expectedOffset),
    );
  });
});

