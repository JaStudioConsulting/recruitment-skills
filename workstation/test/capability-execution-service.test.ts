import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import { featureByPrimaryCapability } from "../lib/capabilities/catalog";
import { prepareCapabilityFromContext } from "../lib/capabilities/prepare";
import { capabilityById } from "../lib/capabilities/registry";
import {
  executePreparedCapabilityWithDependencies,
  type CapabilityExecutionDependencies,
} from "../lib/server/capability-execution-service";
import type { WriteUpDraftReady } from "../lib/server/capability-executors/write-up";
import type { CapabilityRunRecord } from "../lib/server/capability-run-repository";
import { connectorCapabilities } from "../lib/server/connectors";
import type {
  CandidateCase,
  CandidateRecord,
  CaseDocument,
  CaseSource,
  RoleRecord,
  SourceKind,
} from "../lib/workstation-types";

function source(id: string, kind: SourceKind): CaseSource {
  return {
    id,
    kind,
    filename: `${id}.txt`,
    contentType: "text/plain",
    sizeBytes: 10,
    sha256: `sha-${id}`,
    captureTime: "2026-09-20T00:00:00.000Z",
    lifecycleStatus: "reviewed",
    reviewStatus: "reviewed",
    parsedText: `${kind} synthetic evidence`,
    classificationMethod: "manual",
  };
}

function context(notes = "") {
  const document = (kind: CaseDocument["kind"]): CaseDocument => ({
    kind,
    revision: 2,
    content: "",
    updatedAt: "2026-09-20T00:00:00.000Z",
  });
  const candidateCase: CandidateCase = {
    id: "case-1",
    roleId: "role-1",
    candidateId: "candidate-1",
    status: "active",
    notes,
    notesDrawingSvg: "",
    notesFont: "System",
    notesSize: 20,
    revision: 3,
    facts: [],
    assistant: { missing: [], askNext: [], fitConcern: "", nextAction: "" },
    externalRefs: {},
    documents: {
      resume: document("resume"),
      write_up: document("write_up"),
      submission: document("submission"),
      email: document("email"),
      loxo_update: document("loxo_update"),
    },
    sources: [
      source("resume", "resume"),
      source("call", "transcript"),
      source("jd", "job_description"),
    ],
    updatedAt: "2026-09-20T00:00:00.000Z",
  };
  const role: RoleRecord = {
    id: "role-1",
    title: "Maintenance Manager",
    client: "Synthetic Manufacturing",
    status: "active",
  };
  const candidate: CandidateRecord = {
    id: "candidate-1",
    name: "Synthetic Candidate",
    currentTitle: "Maintenance Supervisor",
  };
  return { candidateCase, role, candidate };
}

async function preparedRun(status: CapabilityRunRecord["status"] = "prepared") {
  const prepared = await prepareCapabilityFromContext("write-up", {
    ...context(),
    connectors: connectorCapabilities,
    availableExecutorIds: ["write-up-candidate"],
  }, {
    extraInput: "",
    provider: "workstation",
    model: "write-up-candidate-v1",
    now: "2026-09-20T01:00:00.000Z",
  });
  return {
    id: "run-1",
    caseId: "case-1",
    roleId: "role-1",
    candidateId: "candidate-1",
    capabilityId: "write-up",
    executorId: "write-up-candidate",
    supportingAuthorityIds: prepared.supportingAuthorityIds,
    authorityDigest: prepared.authorityDigest,
    sourceRefs: prepared.sourceRefs,
    inputSnapshotHash: prepared.inputSnapshotHash,
    input: { extraInput: "", provider: "workstation", model: "write-up-candidate-v1" },
    outputKind: prepared.outputKind,
    implementationStatus: prepared.implementationStatus,
    provider: "workstation",
    model: "write-up-candidate-v1",
    preparedAt: prepared.preparedAt,
    status,
    result: status === "draft_ready" ? { persisted: true } : null,
    evidence: {},
    error: null,
    startedAt: null,
    finishedAt: null,
    createdBy: "user-1",
    createdAt: prepared.preparedAt,
    updatedAt: prepared.preparedAt,
  } satisfies CapabilityRunRecord;
}

function draftResult(): WriteUpDraftReady {
  return {
    status: "draft_ready",
    capabilityId: "write-up",
    executorId: "write-up-candidate",
    outputKind: "submission",
    bundle: {
      resume: {
        format: "tttg-resume-form-v1",
        reviewed: false,
        name: "Synthetic Candidate",
        headline: "Maintenance Supervisor",
        summary: "",
        skills: "",
        jobs: [],
        educationHeading: "",
        education: "",
        sections: [],
      },
      submission: {
        name: "Synthetic Candidate",
        title: "Maintenance Supervisor",
        compensationTarget: "",
        currentCompensation: "",
        vacation: "",
        location: "",
        workStatus: "",
        interviewAvailability: "",
        startDateNotice: "",
        reasonForLeaving: "",
        profileSummary: "",
      },
      emailSubject: "",
      presentationEmailText: "Hi team,\n\nCV attached.",
      loxoNoteText: "",
      unknowns: ["Compensation Target"],
      sourceRefs: ["call:sha-call", "jd:sha-jd", "resume:sha-resume"],
    },
    canonicalIncomplete: {
      brandedPdfBuilt: false,
      visualQaPassed: false,
      gmailDraftCreated: false,
      gmailAttachmentVerified: false,
      gmailDraftReadbackVerified: false,
      emailSent: false,
      loxoWritten: false,
      loxoReadbackVerified: false,
      canonicalPackageCompleted: false,
    },
  };
}

function dependencies(run: CapabilityRunRecord, currentContext = context()) {
  const events: string[] = [];
  const transitionCapabilityRun = vi.fn(async (_userId, _caseId, _runId, transition) => {
    events.push(`transition:${transition.status}`);
    return { ...run, status: transition.status, result: transition.result ?? run.result } as CapabilityRunRecord;
  });
  const commitDraftReadyDocumentPackage = vi.fn<
    CapabilityExecutionDependencies["commitDraftReadyDocumentPackage"]
  >(async (_userId, _caseId, _runId, input) => {
    events.push("commit:write-up-package");
    return {
      run: {
        ...run,
        status: "draft_ready",
        result: input.result,
        evidence: input.evidence,
      },
      documents: input.documents.map((document) => ({
        kind: document.kind,
        revision: document.expectedRevision + 1,
        content: document.content,
        updatedAt: "2026-09-20T02:00:00.000Z",
      })),
    };
  });
  const executeCapability = vi.fn(() => {
    events.push("execute:write-up-candidate");
    const result = draftResult();
    result.bundle.sourceRefs = [...run.sourceRefs];
    return result;
  });
  const value: CapabilityExecutionDependencies = {
    getCapabilityRun: vi.fn(async () => run),
    transitionCapabilityRun,
    getCapabilityCaseContext: vi.fn(async () => currentContext),
    commitDraftReadyDocumentPackage,
    executeCapability,
  };
  return {
    value,
    events,
    transitionCapabilityRun,
    commitDraftReadyDocumentPackage,
    executeCapability,
  };
}

describe("prepared capability execution", () => {
  it("executes only the stored canonical pair and persists every output before draft_ready", async () => {
    const run = await preparedRun();
    const deps = dependencies(run);
    const response = await executePreparedCapabilityWithDependencies(
      "user-1",
      "case-1",
      "run-1",
      deps.value,
    );

    expect(response.run.status).toBe("draft_ready");
    expect(response.reused).toBe(false);
    expect(deps.executeCapability).toHaveBeenCalledWith(expect.objectContaining({
      candidateCase: expect.objectContaining({ id: "case-1" }),
      role: expect.objectContaining({ id: "role-1", title: "Maintenance Manager" }),
      candidate: expect.objectContaining({ id: "candidate-1", name: "Synthetic Candidate" }),
    }));
    expect(deps.events).toEqual([
      "transition:running",
      "execute:write-up-candidate",
      "commit:write-up-package",
    ]);
    expect(deps.commitDraftReadyDocumentPackage).toHaveBeenCalledWith(
      "user-1",
      "case-1",
      "run-1",
      expect.objectContaining({
        documents: expect.arrayContaining([
          expect.objectContaining({ kind: "resume", expectedRevision: 2 }),
          expect.objectContaining({ kind: "submission", expectedRevision: 2 }),
          expect.objectContaining({ kind: "email", expectedRevision: 2 }),
          expect.objectContaining({ kind: "loxo_update", expectedRevision: 2 }),
        ]),
        sourceRefs: run.sourceRefs,
      }),
    );
  });

  it("refuses a stale prepared snapshot before invoking the executor", async () => {
    const run = await preparedRun();
    const deps = dependencies(run, context("The case changed after preparation."));

    await expect(executePreparedCapabilityWithDependencies(
      "user-1",
      "case-1",
      "run-1",
      deps.value,
    )).rejects.toThrow("case context changed after preparation");

    expect(deps.executeCapability).not.toHaveBeenCalled();
    expect(deps.commitDraftReadyDocumentPackage).not.toHaveBeenCalled();
    expect(deps.transitionCapabilityRun).toHaveBeenCalledOnce();
    expect(deps.transitionCapabilityRun.mock.calls[0][3]).toMatchObject({
      status: "refused",
      error: { code: "prepared_input_changed" },
    });
  });

  it("persists output provenance when the executor fills blanks from bound case context", async () => {
    const run = await preparedRun();
    const deps = dependencies(run);
    const result = draftResult();
    result.bundle.sourceRefs = [
      ...run.sourceRefs,
      "candidate-record:candidate-1",
      "role-record:role-1",
    ];
    deps.executeCapability.mockReturnValue(result);

    await executePreparedCapabilityWithDependencies(
      "user-1",
      "case-1",
      "run-1",
      deps.value,
    );

    const packageInput = deps.commitDraftReadyDocumentPackage.mock.calls[0][3];
    expect(packageInput.sourceRefs).toEqual(result.bundle.sourceRefs);
    expect(packageInput.evidence).toMatchObject({
      sourceRefs: run.sourceRefs,
      outputSourceRefs: result.bundle.sourceRefs,
    });
  });

  it("refuses execution when a supporting authority digest changes after preparation", async () => {
    const run = await preparedRun();
    const deps = dependencies(run);
    const capability = capabilityById("write-up")!;
    const changedCapability = {
      ...capability,
      executorFeatures: capability.executorFeatures.map((executor) => ({
        ...executor,
        supportingAuthorities: executor.supportingAuthorities.map((authority) => ({
          ...authority,
          authorityDigest: "f".repeat(64),
        })),
      })),
    };
    const authorityChangedDependencies: CapabilityExecutionDependencies = {
      ...deps.value,
      prepareCapabilityFromContext: (capabilityId, preparationContext, options) =>
        prepareCapabilityFromContext(capabilityId, preparationContext, options, {
          capabilityById: (id) => id === "write-up" ? changedCapability : capabilityById(id),
          featureByPrimaryCapability,
        }),
    };

    await expect(executePreparedCapabilityWithDependencies(
      "user-1",
      "case-1",
      "run-1",
      authorityChangedDependencies,
    )).rejects.toThrow("case context changed after preparation");

    expect(deps.executeCapability).not.toHaveBeenCalled();
    expect(deps.transitionCapabilityRun).toHaveBeenCalledOnce();
    expect(deps.transitionCapabilityRun.mock.calls[0][3]).toMatchObject({
      status: "refused",
      error: { code: "prepared_input_changed" },
    });
  });

  it("refuses a prepared snapshot after a reviewed document changes", async () => {
    const run = await preparedRun();
    const changed = context();
    changed.candidateCase.documents.resume = {
      ...changed.candidateCase.documents.resume,
      revision: changed.candidateCase.documents.resume.revision + 1,
      content: { format: "tttg-resume-form-v1", name: "Human reviewed name" },
    };
    const deps = dependencies(run, changed);

    await expect(executePreparedCapabilityWithDependencies(
      "user-1",
      "case-1",
      "run-1",
      deps.value,
    )).rejects.toThrow("case context changed after preparation");

    expect(deps.executeCapability).not.toHaveBeenCalled();
    expect(deps.commitDraftReadyDocumentPackage).not.toHaveBeenCalled();
    expect(deps.transitionCapabilityRun.mock.calls[0][3]).toMatchObject({
      status: "refused",
      error: { code: "prepared_input_changed" },
    });
  });

  it("rejects executor substitution before dispatch", async () => {
    const run = { ...await preparedRun(), executorId: "brand-resume" };
    const deps = dependencies(run);

    await expect(executePreparedCapabilityWithDependencies(
      "user-1",
      "case-1",
      "run-1",
      deps.value,
    )).rejects.toThrow("case context changed after preparation");

    expect(deps.executeCapability).not.toHaveBeenCalled();
    expect(deps.commitDraftReadyDocumentPackage).not.toHaveBeenCalled();
  });

  it("returns a persisted draft-ready run idempotently without executing twice", async () => {
    const run = await preparedRun("draft_ready");
    const deps = dependencies(run);
    const response = await executePreparedCapabilityWithDependencies(
      "user-1",
      "case-1",
      "run-1",
      deps.value,
    );

    expect(response).toEqual({ run, reused: true, documents: [] });
    expect(deps.transitionCapabilityRun).not.toHaveBeenCalled();
    expect(deps.executeCapability).not.toHaveBeenCalled();
    expect(deps.commitDraftReadyDocumentPackage).not.toHaveBeenCalled();
  });
});
