import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import {
  intakeNewCandidateResumeWithDependencies,
  type CandidateResumeIntakeDependencies,
} from "../lib/server/source-store";
import { AtomicCandidateSourcePersistenceError } from "../lib/server/case-repository";
import type { CandidateSourceIntakeResult } from "../lib/workstation-types";

const ROLE_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ROLE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "owner-1";
const RESUME = `Avery North
Maintenance Supervisor

Professional Experience
Maintenance Supervisor
Atlas Components

Education
Mechanical Technology Diploma`;

async function sha256(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) =>
    byte.toString(16).padStart(2, "0")).join("");
}

function resultFor(input: Parameters<CandidateResumeIntakeDependencies["persistAtomic"]>[1]): CandidateSourceIntakeResult {
  return {
    candidate: {
      id: input.candidate.id,
      name: input.candidate.name,
      currentTitle: input.candidate.currentTitle || null,
    },
    candidateCase: {
      id: input.caseId,
      roleId: input.roleId,
      candidateId: input.candidate.id,
    },
    reused: false,
  } as CandidateSourceIntakeResult;
}

function harness() {
  const stored = new Map<string, CandidateSourceIntakeResult>();
  const putObject = vi.fn<CandidateResumeIntakeDependencies["putObject"]>();
  putObject.mockResolvedValue({ etag: "stored" });
  const persistAtomic = vi.fn(async (
    _userId: string,
    input: Parameters<CandidateResumeIntakeDependencies["persistAtomic"]>[1],
  ) => {
    const result = resultFor(input);
    stored.set(input.caseId, result);
    return result;
  });
  const dependencies = {
    assertRole: vi.fn(async () => ({ id: ROLE_ID })),
    resolveIntake: vi.fn(async (input: { bytes: ArrayBuffer }) => {
      const digest = await sha256(input.bytes);
      return {
        intakeRecordId: `intake-${digest}`,
        sha256: digest,
        parserVersion: "test",
        intake: {
          kind: "resume" as const,
          parsedText: RESUME,
          lifecycleStatus: "classified" as const,
          classificationMethod: "explicit" as const,
        },
      };
    }),
    getExisting: vi.fn(async (_userId: string, caseId: string) => stored.get(caseId) ?? null),
    persistAtomic,
    putObject,
  } as unknown as CandidateResumeIntakeDependencies;
  return { dependencies, stored, putObject, persistAtomic };
}

function resumeFile(contents = RESUME, filename = "Avery North Resume.txt") {
  return new File([contents], filename, { type: "text/plain" });
}

describe("atomic source-first candidate intake", () => {
  let mocks: ReturnType<typeof harness>;

  beforeEach(() => {
    mocks = harness();
  });

  it("reuses the exact resume for the same Job without creating or uploading twice", async () => {
    const first = await intakeNewCandidateResumeWithDependencies({
      userId: USER_ID,
      roleId: ROLE_ID,
      name: "Avery North",
      currentTitle: "Maintenance Supervisor",
      file: resumeFile(),
    }, mocks.dependencies);
    const repeated = await intakeNewCandidateResumeWithDependencies({
      userId: USER_ID,
      roleId: ROLE_ID,
      name: "Avery North",
      currentTitle: "Maintenance Supervisor",
      file: resumeFile(RESUME, "renamed-copy.txt"),
    }, mocks.dependencies);

    expect(repeated.candidate.id).toBe(first.candidate.id);
    expect(repeated.candidateCase.id).toBe(first.candidateCase.id);
    expect(mocks.persistAtomic).toHaveBeenCalledTimes(1);
    expect(mocks.putObject).toHaveBeenCalledTimes(1);
  });

  it("does not merge different resume bytes merely because the reviewed name matches", async () => {
    const first = await intakeNewCandidateResumeWithDependencies({
      userId: USER_ID,
      roleId: ROLE_ID,
      name: "Avery North",
      currentTitle: "Maintenance Supervisor",
      file: resumeFile(),
    }, mocks.dependencies);
    const revised = await intakeNewCandidateResumeWithDependencies({
      userId: USER_ID,
      roleId: ROLE_ID,
      name: "Avery North",
      currentTitle: "Maintenance Supervisor",
      file: resumeFile(`${RESUME}\nCertification: Red Seal`),
    }, mocks.dependencies);

    expect(revised.candidate.id).not.toBe(first.candidate.id);
    expect(revised.candidateCase.id).not.toBe(first.candidateCase.id);
    expect(mocks.persistAtomic).toHaveBeenCalledTimes(2);
  });

  it("does not merge exact resume bytes when the reviewed candidate names differ", async () => {
    const first = await intakeNewCandidateResumeWithDependencies({
      userId: USER_ID,
      roleId: ROLE_ID,
      name: "Avery North",
      currentTitle: "Maintenance Supervisor",
      file: resumeFile(),
    }, mocks.dependencies);
    const differentPerson = await intakeNewCandidateResumeWithDependencies({
      userId: USER_ID,
      roleId: ROLE_ID,
      name: "Morgan South",
      currentTitle: "Maintenance Supervisor",
      file: resumeFile(),
    }, mocks.dependencies);

    expect(differentPerson.candidate.id).not.toBe(first.candidate.id);
    expect(differentPerson.candidateCase.id).not.toBe(first.candidateCase.id);
    expect(mocks.persistAtomic).toHaveBeenCalledTimes(2);
    expect(mocks.putObject.mock.calls[1][0]).not.toBe(mocks.putObject.mock.calls[0][0]);
  });

  it("reuses exact resume identity across Jobs while creating a separate Job case", async () => {
    const first = await intakeNewCandidateResumeWithDependencies({
      userId: USER_ID,
      roleId: ROLE_ID,
      name: "Avery North",
      currentTitle: "Maintenance Supervisor",
      file: resumeFile(),
    }, mocks.dependencies);
    const anotherJob = await intakeNewCandidateResumeWithDependencies({
      userId: USER_ID,
      roleId: SECOND_ROLE_ID,
      name: "  AVERY   NORTH  ",
      currentTitle: "Maintenance Supervisor",
      file: resumeFile(),
    }, mocks.dependencies);

    expect(anotherJob.candidate.id).toBe(first.candidate.id);
    expect(anotherJob.candidateCase.id).not.toBe(first.candidateCase.id);
    expect(mocks.persistAtomic).toHaveBeenCalledTimes(2);
  });

  it("reuses the deterministic object and IDs after a proven non-commit", async () => {
    const attempted: Array<Parameters<CandidateResumeIntakeDependencies["persistAtomic"]>[1]> = [];
    mocks.persistAtomic.mockImplementationOnce(async (_userId, input) => {
      attempted.push(input);
      throw new AtomicCandidateSourcePersistenceError("not_committed", new Error("database unavailable"));
    }).mockImplementationOnce(async (_userId, input) => {
      attempted.push(input);
      const result = resultFor(input);
      mocks.stored.set(input.caseId, result);
      return result;
    });

    const input = {
      userId: USER_ID,
      roleId: ROLE_ID,
      name: "Avery North",
      currentTitle: "Maintenance Supervisor",
    };
    await expect(intakeNewCandidateResumeWithDependencies({ ...input, file: resumeFile() }, mocks.dependencies))
      .rejects.toThrow("Candidate source intake did not commit.");
    expect(mocks.stored.size).toBe(0);

    const retried = await intakeNewCandidateResumeWithDependencies({ ...input, file: resumeFile() }, mocks.dependencies);
    expect(retried.candidateCase.id).toBe(attempted[0].caseId);
    expect(attempted[1]).toMatchObject({
      caseId: attempted[0].caseId,
      candidate: { id: attempted[0].candidate.id },
      source: { id: attempted[0].source.id },
    });
    expect(mocks.putObject.mock.calls[1][0]).toBe(mocks.putObject.mock.calls[0][0]);
  });

  it("preserves the staged object when commit state is ambiguous and keeps retry identity stable", async () => {
    const attempted: Array<Parameters<CandidateResumeIntakeDependencies["persistAtomic"]>[1]> = [];
    mocks.persistAtomic.mockImplementationOnce(async (_userId, input) => {
      attempted.push(input);
      throw new AtomicCandidateSourcePersistenceError("unknown", new Error("readback unavailable"));
    }).mockImplementationOnce(async (_userId, input) => {
      attempted.push(input);
      const result = resultFor(input);
      mocks.stored.set(input.caseId, result);
      return result;
    });

    const input = {
      userId: USER_ID,
      roleId: ROLE_ID,
      name: "Avery North",
      currentTitle: "Maintenance Supervisor",
    };
    await expect(intakeNewCandidateResumeWithDependencies({ ...input, file: resumeFile() }, mocks.dependencies))
      .rejects.toThrow("may have committed");
    const retried = await intakeNewCandidateResumeWithDependencies({ ...input, file: resumeFile() }, mocks.dependencies);
    expect(retried.candidateCase.id).toBe(attempted[0].caseId);
    expect(attempted[1]).toMatchObject({
      caseId: attempted[0].caseId,
      candidate: { id: attempted[0].candidate.id },
      source: { id: attempted[0].source.id },
    });
    expect(mocks.putObject.mock.calls[1][0]).toBe(mocks.putObject.mock.calls[0][0]);
  });

  it("does not attempt database creation when staging the original source fails", async () => {
    mocks.putObject.mockRejectedValueOnce(new Error("object storage unavailable"));

    await expect(intakeNewCandidateResumeWithDependencies({
      userId: USER_ID,
      roleId: ROLE_ID,
      name: "Avery North",
      currentTitle: "Maintenance Supervisor",
      file: resumeFile(),
    }, mocks.dependencies)).rejects.toThrow("object storage unavailable");
    expect(mocks.persistAtomic).not.toHaveBeenCalled();
    expect(mocks.stored.size).toBe(0);
  });
});
