import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  record: null as null | {
    id: string;
    sha256: string;
    contentType: string;
    sizeBytes: number;
    parserVersion: string;
    parsedText: string | null;
    createdAt: string;
  },
  inspect: vi.fn(),
  insertRoleSource: vi.fn(),
  put: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => ({
  getSourceBucket: () => ({
    put: mocks.put,
    delete: vi.fn(),
  }),
}));
vi.mock("@/lib/server/source-intake", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/server/source-intake")>();
  mocks.inspect.mockImplementation(actual.inspectUploadedSourceContent);
  return { ...actual, inspectUploadedSourceContent: mocks.inspect };
});
vi.mock("@/lib/server/case-repository", () => ({
  assertOwnedCase: vi.fn(),
  assertOwnedRole: vi.fn(),
  getCandidateCase: vi.fn(),
  getOwnedRoleSource: vi.fn(),
  getOwnedSource: vi.fn(),
  getRoleSources: vi.fn(async () => []),
  insertRoleSource: mocks.insertRoleSource,
  insertSource: vi.fn(),
  getPersistedSourceIntake: vi.fn(async () => mocks.record),
  persistSourceIntake: vi.fn(async (_userId, intake) => {
    if (!mocks.record) {
      mocks.record = {
        id: "intake-1",
        ...intake,
        createdAt: "2026-09-21T01:00:00.000Z",
      };
    }
    return mocks.record;
  }),
}));

import {
  resolveSourceIntake,
  uploadImmutableRoleSources,
} from "../lib/server/source-store";

const JD = `Job Title: Plant Manager
Company: Example Manufacturing
Job Description
Responsibilities
Qualifications
Requirements`;

describe("source store intake provenance", () => {
  beforeEach(() => {
    mocks.record = null;
    mocks.inspect.mockClear();
    mocks.insertRoleSource.mockReset();
    mocks.insertRoleSource.mockResolvedValue(undefined);
    mocks.put.mockReset();
    mocks.put.mockResolvedValue({ etag: "stored" });
  });

  it("reuses proposal parsing and links the stored source to the durable intake record", async () => {
    const proposalFile = new File([JD], "Plant Manager JD.txt", { type: "text/plain" });
    await resolveSourceIntake({
      userId: "owner-1",
      bytes: await proposalFile.arrayBuffer(),
      contentType: proposalFile.type,
      filename: proposalFile.name,
    });

    const uploadFile = new File([JD], "Plant Manager JD.txt", { type: "text/plain" });
    await uploadImmutableRoleSources({
      userId: "owner-1",
      roleId: "role-1",
      uploads: [{ file: uploadFile, kind: "job_description" }],
    });

    expect(mocks.inspect).toHaveBeenCalledTimes(1);
    expect(mocks.insertRoleSource).toHaveBeenCalledWith(
      "owner-1",
      expect.objectContaining({
        roleId: "role-1",
        intakeRecordId: "intake-1",
        kind: "job_description",
        lifecycleStatus: "classified",
        classificationMethod: "explicit",
        parsedText: JD,
      }),
    );
  });
});
