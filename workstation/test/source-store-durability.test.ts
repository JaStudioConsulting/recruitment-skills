import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  records: new Map<string, {
    id: string;
    sha256: string;
    contentType: string;
    sizeBytes: number;
    parserVersion: string;
    parsedText: string | null;
    createdAt: string;
  }>(),
  caseSources: [] as Array<Record<string, unknown>>,
  roleSources: [] as Array<Record<string, unknown>>,
  inspect: vi.fn(),
  getActiveCaseSourceBySha256: vi.fn(),
  getActiveRoleSourceBySha256: vi.fn(),
  getCandidateCase: vi.fn(),
  getRoleSources: vi.fn(),
  insertSource: vi.fn(),
  insertRoleSource: vi.fn(),
  delete: vi.fn(),
  put: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => ({
  getSourceBucket: () => ({
    put: mocks.put,
    delete: mocks.delete,
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
  createCandidateCaseFromSourceAtomic: vi.fn(),
  getActiveCaseSourceBySha256: mocks.getActiveCaseSourceBySha256,
  getActiveRoleSourceBySha256: mocks.getActiveRoleSourceBySha256,
  getCandidateCase: mocks.getCandidateCase,
  getCandidateSourceIntakeResult: vi.fn(),
  getOwnedRoleSource: vi.fn(),
  getOwnedSource: vi.fn(),
  getRoleSources: mocks.getRoleSources,
  insertRoleSource: mocks.insertRoleSource,
  insertSource: mocks.insertSource,
  getPersistedSourceIntake: vi.fn(async (_userId, fingerprint) => mocks.records.get(fingerprint.sha256) ?? null),
  persistSourceIntake: vi.fn(async (_userId, intake) => {
    const record = mocks.records.get(intake.sha256);
    if (record) return record;
    const created = {
      id: `intake-${mocks.records.size + 1}`,
      ...intake,
      createdAt: "2026-09-21T01:00:00.000Z",
    };
    mocks.records.set(intake.sha256, created);
    return created;
  }),
}));

import {
  resolveSourceIntake,
  uploadImmutableRoleSources,
  uploadImmutableSources,
} from "../lib/server/source-store";

const JD = `Job Title: Plant Manager
Company: Example Manufacturing
Job Description
Responsibilities
Qualifications
Requirements`;

describe("source store intake provenance", () => {
  beforeEach(() => {
    mocks.records.clear();
    mocks.caseSources.length = 0;
    mocks.roleSources.length = 0;
    mocks.inspect.mockClear();
    mocks.getActiveCaseSourceBySha256.mockReset();
    mocks.getActiveCaseSourceBySha256.mockImplementation(async (_userId, caseId, sha256) =>
      mocks.caseSources.find((source) => source.caseId === caseId && source.sha256 === sha256) ?? null);
    mocks.getActiveRoleSourceBySha256.mockReset();
    mocks.getActiveRoleSourceBySha256.mockImplementation(async (_userId, roleId, sha256) =>
      mocks.roleSources.find((source) => source.roleId === roleId && source.sha256 === sha256) ?? null);
    mocks.getCandidateCase.mockReset();
    mocks.getCandidateCase.mockImplementation(async (_userId, caseId) => ({
      id: caseId,
      sources: mocks.caseSources.filter((source) => source.caseId === caseId),
    }));
    mocks.getRoleSources.mockReset();
    mocks.getRoleSources.mockImplementation(async (_userId, roleId) =>
      mocks.roleSources.filter((source) => source.roleId === roleId));
    mocks.insertSource.mockReset();
    mocks.insertSource.mockImplementation(async (_userId, source) => {
      if (mocks.caseSources.some((stored) => stored.caseId === source.caseId && stored.sha256 === source.sha256)) return false;
      mocks.caseSources.push(source);
      return true;
    });
    mocks.insertRoleSource.mockReset();
    mocks.insertRoleSource.mockImplementation(async (_userId, source) => {
      if (mocks.roleSources.some((stored) => stored.roleId === source.roleId && stored.sha256 === source.sha256)) return false;
      mocks.roleSources.push(source);
      return true;
    });
    mocks.delete.mockReset();
    mocks.delete.mockResolvedValue(undefined);
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

  it("rejects candidate-private Job source kinds before any R2 write", async () => {
    const resume = new File([
      "Avery North\nProfessional Experience\nEducation\nSkills",
    ], "Avery North Resume.txt", { type: "text/plain" });

    await expect(uploadImmutableRoleSources({
      userId: "owner-1",
      roleId: "role-1",
      uploads: [{ file: resume, kind: "resume" }],
    })).rejects.toMatchObject({
      status: 409,
      message: "Candidate resumes and transcripts cannot be Job sources. Add this source to a candidate.",
    });
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.insertRoleSource).not.toHaveBeenCalled();
  });

  it("reuses one immutable Job attachment and refreshes its object when the exact JD is saved twice", async () => {
    const first = new File([JD], "Plant Manager JD.txt", { type: "text/plain" });
    const repeated = new File([JD], "Renamed duplicate JD.txt", { type: "text/plain" });

    await uploadImmutableRoleSources({
      userId: "owner-1",
      roleId: "role-1",
      uploads: [{ file: first, kind: "job_description" }],
    });
    const sources = await uploadImmutableRoleSources({
      userId: "owner-1",
      roleId: "role-1",
      uploads: [{ file: repeated, kind: "job_description" }],
    });

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ filename: "Plant Manager JD.txt", roleId: "role-1" });
    expect(mocks.inspect).toHaveBeenCalledTimes(1);
    expect(mocks.put).toHaveBeenCalledTimes(2);
    expect(mocks.insertRoleSource).toHaveBeenCalledTimes(1);
  });

  it("reuses one immutable candidate-case attachment and refreshes its object on an exact replay", async () => {
    const first = new File([JD], "Candidate notes.txt", { type: "text/plain" });
    const repeated = new File([JD], "Candidate notes copy.txt", { type: "text/plain" });

    await uploadImmutableSources({
      userId: "owner-1",
      caseId: "case-1",
      uploads: [{ file: first, kind: "call_notes" }],
    });
    const candidateCase = await uploadImmutableSources({
      userId: "owner-1",
      caseId: "case-1",
      uploads: [{ file: repeated, kind: "call_notes" }],
    });

    expect(candidateCase.sources).toHaveLength(1);
    expect(candidateCase.sources[0]).toMatchObject({ filename: "Candidate notes.txt", caseId: "case-1" });
    expect(mocks.inspect).toHaveBeenCalledTimes(1);
    expect(mocks.put).toHaveBeenCalledTimes(2);
    expect(mocks.insertSource).toHaveBeenCalledTimes(1);
  });

  it("retains a staged candidate object when D1 commit readback is unavailable", async () => {
    mocks.getActiveCaseSourceBySha256
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("D1 readback unavailable"));
    mocks.insertSource.mockRejectedValueOnce(new Error("D1 batch response unavailable"));

    await expect(uploadImmutableSources({
      userId: "owner-1",
      caseId: "case-1",
      uploads: [{
        file: new File([JD], "Candidate notes.txt", { type: "text/plain" }),
        kind: "call_notes",
      }],
    })).rejects.toThrow("D1 batch response unavailable");

    expect(mocks.put).toHaveBeenCalledTimes(1);
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("retains a staged Job object when a lost D1 response cannot be read back", async () => {
    mocks.getActiveRoleSourceBySha256
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("D1 readback unavailable"));
    mocks.insertRoleSource.mockRejectedValueOnce(new Error("D1 insert response unavailable"));

    await expect(uploadImmutableRoleSources({
      userId: "owner-1",
      roleId: "role-1",
      uploads: [{
        file: new File([JD], "Plant Manager JD.txt", { type: "text/plain" }),
        kind: "job_description",
      }],
    })).rejects.toThrow("D1 insert response unavailable");

    expect(mocks.put).toHaveBeenCalledTimes(1);
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("converges concurrent saves of the same Job source on one active attachment", async () => {
    const first = new File([JD], "Plant Manager JD.txt", { type: "text/plain" });
    const repeated = new File([JD], "Plant Manager JD copy.txt", { type: "text/plain" });
    let releasePuts!: () => void;
    const bothPutting = new Promise<void>((resolve) => { releasePuts = resolve; });
    mocks.put.mockImplementation(async () => {
      if (mocks.put.mock.calls.length === 2) releasePuts();
      await bothPutting;
      return { etag: "stored" };
    });

    const [, sources] = await Promise.all([
      uploadImmutableRoleSources({
        userId: "owner-1",
        roleId: "role-1",
        uploads: [{ file: first, kind: "job_description" }],
      }),
      uploadImmutableRoleSources({
        userId: "owner-1",
        roleId: "role-1",
        uploads: [{ file: repeated, kind: "job_description" }],
      }),
    ]);

    expect(sources).toHaveLength(1);
    expect(mocks.roleSources).toHaveLength(1);
    expect(mocks.insertRoleSource).toHaveBeenCalledTimes(2);
    expect(mocks.put).toHaveBeenCalledTimes(2);
    expect(mocks.delete).toHaveBeenCalledTimes(1);
  });

  it("keeps genuinely different bytes and the same bytes in another scope as distinct attachments", async () => {
    const revised = `${JD}\nLocation: Toronto`;

    await uploadImmutableRoleSources({
      userId: "owner-1",
      roleId: "role-1",
      uploads: [
        { file: new File([JD], "Original JD.txt", { type: "text/plain" }), kind: "job_description" },
        { file: new File([revised], "Revised JD.txt", { type: "text/plain" }), kind: "job_description" },
      ],
    });
    await uploadImmutableRoleSources({
      userId: "owner-1",
      roleId: "role-2",
      uploads: [{ file: new File([JD], "Original JD.txt", { type: "text/plain" }), kind: "job_description" }],
    });

    expect(mocks.roleSources.filter((source) => source.roleId === "role-1")).toHaveLength(2);
    expect(mocks.roleSources.filter((source) => source.roleId === "role-2")).toHaveLength(1);
    expect(new Set(mocks.roleSources.map((source) => source.sha256)).size).toBe(2);
    expect(mocks.put).toHaveBeenCalledTimes(3);
  });

  it("does not duplicate earlier successes when a multi-file upload is retried", async () => {
    const first = new File([JD], "First JD.txt", { type: "text/plain" });
    const second = new File([`${JD}\nLocation: Toronto`], "Second JD.txt", { type: "text/plain" });
    mocks.put.mockResolvedValueOnce({ etag: "stored" }).mockRejectedValueOnce(new Error("temporary R2 failure"));

    await expect(uploadImmutableRoleSources({
      userId: "owner-1",
      roleId: "role-1",
      uploads: [
        { file: first, kind: "job_description" },
        { file: second, kind: "job_description" },
      ],
    })).rejects.toThrow("temporary R2 failure");

    mocks.put.mockResolvedValue({ etag: "stored" });
    const sources = await uploadImmutableRoleSources({
      userId: "owner-1",
      roleId: "role-1",
      uploads: [
        { file: first, kind: "job_description" },
        { file: second, kind: "job_description" },
      ],
    });

    expect(sources).toHaveLength(2);
    expect(mocks.insertRoleSource).toHaveBeenCalledTimes(2);
    expect(mocks.put).toHaveBeenCalledTimes(4);
  });
});
