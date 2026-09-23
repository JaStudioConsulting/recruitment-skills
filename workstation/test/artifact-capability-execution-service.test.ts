import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import { prepareCapabilityFromContext } from "../lib/capabilities/prepare";
import {
  executePreparedCapabilityWithDependencies,
  type CapabilityExecutionDependencies,
} from "../lib/server/capability-execution-service";
import {
  EXECUTABLE_RUN_EXECUTOR_IDS,
} from "../lib/server/capability-executors";
import type { CapabilityRunRecord } from "../lib/server/capability-run-repository";
import { connectorCapabilities } from "../lib/server/connectors";
import { emptyResumeForm } from "../lib/resume-form";
import type {
  CandidateCase,
  CandidateRecord,
  CaseDocument,
  CaseSource,
  RoleRecord,
} from "../lib/workstation-types";

function context() {
  const document = (kind: CaseDocument["kind"]): CaseDocument => ({
    kind,
    revision: 1,
    content: "",
    updatedAt: "2026-09-20T12:00:00.000Z",
  });
  const reviewedResume: CaseDocument = {
    kind: "resume",
    revision: 2,
    content: {
      ...emptyResumeForm(),
      reviewed: true,
      name: "Synthetic Candidate",
      headline: "Maintenance Supervisor",
      summary: "Reviewed source-grounded summary.",
    },
    updatedAt: "2026-09-20T12:00:00.000Z",
  };
  const source: CaseSource = {
    id: "resume-source",
    kind: "resume",
    filename: "Synthetic Resume.txt",
    contentType: "text/plain",
    sizeBytes: 10,
    sha256: "sha-resume",
    captureTime: "2026-09-20T12:00:00.000Z",
    lifecycleStatus: "reviewed",
    reviewStatus: "reviewed",
    parsedText: "Synthetic Candidate\nMaintenance Supervisor\nProfessional Experience",
    classificationMethod: "manual",
  };
  const candidateCase: CandidateCase = {
    id: "case-1",
    roleId: "role-1",
    candidateId: "candidate-1",
    status: "active",
    notes: "",
    notesDrawingSvg: "",
    notesFont: "System",
    notesSize: 20,
    revision: 2,
    facts: [],
    assistant: { missing: [], askNext: [], fitConcern: "", nextAction: "" },
    externalRefs: {},
    documents: {
      resume: reviewedResume,
      write_up: document("write_up"),
      submission: document("submission"),
      email: document("email"),
      loxo_update: document("loxo_update"),
    },
    sources: [source],
    updatedAt: "2026-09-20T12:00:00.000Z",
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

async function preparedArtifactRun(): Promise<CapabilityRunRecord> {
  const prepared = await prepareCapabilityFromContext("brandedresume", {
    ...context(),
    connectors: connectorCapabilities,
    availableExecutorIds: EXECUTABLE_RUN_EXECUTOR_IDS,
  }, {
    extraInput: "",
    provider: "workstation",
    model: "brand-resume-v1",
    now: "2026-09-20T13:00:00.000Z",
  });
  return {
    id: "run-1",
    caseId: "case-1",
    roleId: "role-1",
    candidateId: "candidate-1",
    capabilityId: prepared.capabilityId,
    executorId: prepared.executorId,
    supportingAuthorityIds: prepared.supportingAuthorityIds,
    authorityDigest: prepared.authorityDigest,
    sourceRefs: prepared.sourceRefs,
    inputSnapshotHash: prepared.inputSnapshotHash,
    input: { extraInput: "", provider: "workstation", model: "brand-resume-v1" },
    outputKind: "pdf",
    implementationStatus: prepared.implementationStatus,
    provider: "workstation",
    model: "brand-resume-v1",
    preparedAt: prepared.preparedAt,
    status: "prepared",
    result: null,
    evidence: {},
    error: null,
    startedAt: null,
    finishedAt: null,
    createdBy: "user-1",
    createdAt: prepared.preparedAt,
    updatedAt: prepared.preparedAt,
  };
}

describe("artifact capability execution lifecycle", () => {
  it("executes a prepared canonical A branded-resume run into visual QA", async () => {
    const run = await preparedArtifactRun();
    const events: string[] = [];
    const transitionCapabilityRun = vi.fn(async (
      _userId: string,
      _caseId: string,
      _runId: string,
      transition: { status: CapabilityRunRecord["status"]; result?: unknown; evidence?: unknown },
    ) => {
      events.push(`transition:${transition.status}`);
      return {
        ...run,
        status: transition.status,
        result: transition.result ?? run.result,
        evidence: transition.evidence ?? run.evidence,
      } as CapabilityRunRecord;
    });
    const executeCapability = vi.fn<CapabilityExecutionDependencies["executeCapability"]>(async () => ({
      status: "awaiting_visual_qa",
      capabilityId: "brandedresume",
      executorId: "brand-resume",
      outputKind: "pdf",
      artifact: {
        id: "artifact-1",
        filename: "Synthetic Candidate - Top Tier Talent Group.pdf",
        contentType: "application/pdf",
        sha256: "a".repeat(64),
        sizeBytes: 1024,
        revision: 1,
        visualQaStatus: "pending",
      },
      canonicalIncomplete: { visualQaPassed: false, completed: false },
    }));
    const commitDraftReadyDocumentPackage = vi.fn<
      CapabilityExecutionDependencies["commitDraftReadyDocumentPackage"]
    >();
    const dependencies: CapabilityExecutionDependencies = {
      getCapabilityRun: vi.fn(async () => run),
      transitionCapabilityRun,
      getCapabilityCaseContext: vi.fn(async () => context()),
      commitDraftReadyDocumentPackage,
      executeCapability,
    };

    const result = await executePreparedCapabilityWithDependencies(
      "user-1",
      "case-1",
      "run-1",
      dependencies,
    );

    expect(events).toEqual(["transition:running", "transition:awaiting_visual_qa"]);
    expect(executeCapability).toHaveBeenCalledOnce();
    expect(commitDraftReadyDocumentPackage).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      reused: false,
      documents: [],
      run: { status: "awaiting_visual_qa" },
    });
  });
});
