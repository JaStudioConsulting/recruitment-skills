import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import {
  executeArtifactCapabilityWithDependencies,
  type ArtifactCapabilityExecutorDependencies,
} from "../lib/server/capability-executors/artifact";
import type {
  CapabilityRunRecord,
  CaseArtifactRecord,
} from "../lib/server/capability-run-repository";
import type { CandidateCase, CaseDocument, CaseSource } from "../lib/workstation-types";
import { featureById } from "../lib/capabilities/catalog";

function run(input: {
  capabilityId: string;
  executorId: string;
  extraInput?: string;
}): CapabilityRunRecord {
  return {
    id: "run-1",
    caseId: "case-1",
    roleId: "role-1",
    candidateId: "candidate-1",
    capabilityId: input.capabilityId,
    executorId: input.executorId,
    supportingAuthorityIds: [],
    authorityDigest: "a".repeat(64),
    sourceRefs: ["resume-source:sha-resume"],
    inputSnapshotHash: "b".repeat(64),
    input: {
      extraInput: input.extraInput ?? "",
      provider: "workstation",
      model: `${input.executorId}-v1`,
    },
    outputKind: "pdf",
    implementationStatus: "partial",
    provider: "workstation",
    model: `${input.executorId}-v1`,
    preparedAt: "2026-09-20T13:00:00.000Z",
    status: "running",
    result: null,
    evidence: {},
    error: null,
    startedAt: "2026-09-20T13:00:01.000Z",
    finishedAt: null,
    createdBy: "user-1",
    createdAt: "2026-09-20T13:00:00.000Z",
    updatedAt: "2026-09-20T13:00:01.000Z",
  };
}

function candidateCase(): CandidateCase {
  const document = (kind: CaseDocument["kind"], content: CaseDocument["content"] = ""): CaseDocument => ({
    kind,
    revision: 2,
    content,
    updatedAt: "2026-09-20T12:00:00.000Z",
  });
  const resumeSource: CaseSource = {
    id: "resume-source",
    kind: "resume",
    filename: "Synthetic Candidate Resume.txt",
    contentType: "text/plain",
    sizeBytes: 100,
    sha256: "sha-resume",
    captureTime: "2026-09-20T12:00:00.000Z",
    lifecycleStatus: "reviewed",
    reviewStatus: "reviewed",
    parsedText: "Synthetic Candidate\nMaintenance Supervisor\nProfessional Summary\nSynthetic summary\nSkills\nCMMS\nProfessional Experience\nMaintenance Supervisor | Example Manufacturing | Toronto, ON | 2020 - Present\n- Maintained synthetic equipment.\nEducation\nSynthetic College",
    classificationMethod: "manual",
  };
  const groundingSource = (id: string, kind: "job_description" | "transcript"): CaseSource => ({
    id,
    kind,
    filename: `${id}.txt`,
    contentType: "text/plain",
    sizeBytes: 100,
    sha256: `sha-${id}`,
    captureTime: "2026-09-20T12:00:00.000Z",
    lifecycleStatus: "reviewed",
    reviewStatus: "reviewed",
    parsedText: `${kind} synthetic reviewed evidence`,
    classificationMethod: "manual",
  });
  return {
    id: "case-1",
    roleId: "role-1",
    candidateId: "candidate-1",
    status: "active",
    notes: "",
    notesDrawingSvg: "",
    notesFont: "System",
    notesSize: 20,
    revision: 3,
    facts: [],
    assistant: { missing: [], askNext: [], fitConcern: "", nextAction: "" },
    externalRefs: {},
    documents: {
      resume: document("resume", {
        format: "tttg-resume-form-v1",
        reviewed: true,
        name: "Synthetic Candidate",
        headline: "Maintenance Supervisor",
        summary: "Synthetic source-grounded summary.",
        skills: "CMMS\nPreventive maintenance",
        jobs: [{
          title: "Maintenance Supervisor",
          company: "Example Manufacturing",
          location: "Toronto, ON",
          dates: "2020 - Present",
          bullets: "Maintained synthetic equipment.",
        }],
        educationHeading: "Education",
        education: "Synthetic College",
        sections: [],
      }),
      write_up: document("write_up"),
      submission: document("submission"),
      email: document("email"),
      loxo_update: document("loxo_update"),
    },
    sources: [
      resumeSource,
      groundingSource("job-description-source", "job_description"),
      groundingSource("call-source", "transcript"),
    ],
    updatedAt: "2026-09-20T12:00:00.000Z",
  };
}

function persistedArtifact(kind: string): CaseArtifactRecord {
  return {
    id: "artifact-1",
    caseId: "case-1",
    runId: "run-1",
    kind,
    filename: "Synthetic.pdf",
    contentType: "application/pdf",
    storageKey: "cases/case-1/artifacts/artifact-1/Synthetic.pdf",
    sha256: "c".repeat(64),
    sizeBytes: 128,
    revision: 1,
    evidence: { builder: { result: { provider: "synthetic" } } },
    visualQaStatus: "pending",
    reviewedBy: null,
    reviewedAt: null,
    reviewEvidence: {},
    createdBy: "user-1",
    createdAt: "2026-09-20T13:00:02.000Z",
  };
}

function dependencies() {
  const builderDigest = featureById("brand-resume")?.builder_digest;
  if (!builderDigest) throw new Error("Synthetic test requires the generated branded-resume builder digest.");
  const callResumeBuilder = vi.fn<ArtifactCapabilityExecutorDependencies["callResumeBuilder"]>(async () => ({
    status: "built" as const,
    filename: "Synthetic Resume.pdf",
    downloadUrl: "/files/resume.pdf",
    expiresInSeconds: 3600,
    contactRemoved: ["email"],
    notes: ["synthetic builder note"],
    builderDigest,
  }));
  const buildManualArtifact = vi.fn<ArtifactCapabilityExecutorDependencies["buildManualArtifact"]>(async () => ({
    status: "built" as const,
    filename: "Synthetic.pdf",
    downloadUrl: "/files/manual.pdf",
  }));
  const persistCaseArtifact = vi.fn(async (input: {
    kind?: string;
  }) => persistedArtifact(input.kind ?? "artifact"));
  const value: ArtifactCapabilityExecutorDependencies = {
    callResumeBuilder,
    buildManualArtifact,
    persistCaseArtifact,
    endpoint: "https://builder.example/mcp",
    token: "synthetic-token",
  };
  return { value, callResumeBuilder, buildManualArtifact, persistCaseArtifact, builderDigest };
}

describe("canonical PDF capability executor adapters", () => {
  it("uses the existing branded-resume builder and persists its expiring result before QA", async () => {
    const deps = dependencies();
    const capabilityRun = run({ capabilityId: "brandedresume", executorId: "brand-resume" });

    const result = await executeArtifactCapabilityWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      run: capabilityRun,
      candidateCase: candidateCase(),
    }, deps.value);

    expect(deps.callResumeBuilder).toHaveBeenCalledWith({
      mode: "named_submission",
      candidate: {
        name: "Synthetic Candidate",
        headline: "Maintenance Supervisor",
        summary: "Synthetic source-grounded summary.",
        skills: ["CMMS", "Preventive maintenance"],
        experience: [{
          title: "Maintenance Supervisor",
          company: "Example Manufacturing",
          location: "Toronto, ON",
          dates: "2020 - Present",
          bullets: ["Maintained synthetic equipment."],
        }],
        education: ["Synthetic College"],
        sections: [],
        education_heading: "Education",
      },
    }, {
      endpoint: "https://builder.example/mcp",
      token: "synthetic-token",
    });
    expect(deps.persistCaseArtifact).toHaveBeenCalledWith({
      userId: "user-1",
      caseId: "case-1",
      runId: "run-1",
      filename: "Synthetic Resume.pdf",
      kind: "brandedresume",
      executorId: "brand-resume",
      expectedDocument: { kind: "resume", revision: 2 },
      source: {
        downloadUrl: "https://builder.example/files/resume.pdf",
        evidence: {
          executorId: "brand-resume",
          tool: "build_pdf",
          sourceRefs: ["resume-source:sha-resume"],
          expiresInSeconds: 3600,
          contactRemoved: ["email"],
          notes: ["synthetic builder note"],
          builderDigest: deps.builderDigest,
          resumeMode: "named_submission",
          resumeDocumentRevision: 2,
        },
      },
    });
    expect(result).toMatchObject({
      status: "awaiting_visual_qa",
      capabilityId: "brandedresume",
      executorId: "brand-resume",
      artifact: {
        id: "artifact-1",
        filename: "Synthetic.pdf",
        sha256: "c".repeat(64),
        visualQaStatus: "pending",
      },
      canonicalIncomplete: { visualQaPassed: false },
    });
  });

  it("fails closed before the builder when role-specific JD or call evidence is not reviewed", async () => {
    const scenarios = [
      {
        remove: ["job_description"],
        message: "reviewed job description",
      },
      {
        remove: ["transcript", "call_notes"],
        message: "reviewed call notes or transcript",
      },
    ] as const;

    for (const scenario of scenarios) {
      const deps = dependencies();
      const current = candidateCase();
      current.sources = current.sources.filter((source) => !scenario.remove.some((kind) => kind === source.kind));

      await expect(executeArtifactCapabilityWithDependencies({
        userId: "user-1",
        caseId: "case-1",
        run: run({ capabilityId: "brandedresume", executorId: "brand-resume" }),
        candidateCase: current,
      }, deps.value)).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining(scenario.message),
      });
      expect(deps.callResumeBuilder).not.toHaveBeenCalled();
      expect(deps.persistCaseArtifact).not.toHaveBeenCalled();
    }
  });

  it("passes the selected internal MPC mode to the attested builder", async () => {
    const deps = dependencies();
    await executeArtifactCapabilityWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      run: run({ capabilityId: "brandedresume", executorId: "brand-resume", extraInput: JSON.stringify({ resume_mode: "internal_mpc" }) }),
      candidateCase: candidateCase(),
    }, deps.value);

    expect(deps.callResumeBuilder).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "internal_mpc" }),
      expect.any(Object),
    );
  });

  it("uses the same human-entered key-value mode syntax accepted during preparation", async () => {
    const deps = dependencies();
    await executeArtifactCapabilityWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      run: run({
        capabilityId: "brandedresume",
        executorId: "brand-resume",
        extraInput: "resume_mode: internal_mpc",
      }),
      candidateCase: candidateCase(),
    }, deps.value);

    expect(deps.callResumeBuilder).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "internal_mpc" }),
      expect.any(Object),
    );
  });

  it("refuses unsupported or malformed explicit resume modes before calling the builder", async () => {
    for (const extraInput of [
      JSON.stringify({ resume_mode: "external_blind_mpc" }),
      JSON.stringify({ resume_mode: "unknown" }),
      JSON.stringify({ resume_mode: 7 }),
      JSON.stringify({}),
      "not-json",
    ]) {
      const deps = dependencies();
      await expect(executeArtifactCapabilityWithDependencies({
        userId: "user-1",
        caseId: "case-1",
        run: run({ capabilityId: "brandedresume", executorId: "brand-resume", extraInput }),
        candidateCase: candidateCase(),
      }, deps.value)).rejects.toMatchObject({ status: 422 });
      expect(deps.callResumeBuilder).not.toHaveBeenCalled();
      expect(deps.persistCaseArtifact).not.toHaveBeenCalled();
    }
  });

  it("refuses an odd number of reviewed source-backed skills before calling the builder", async () => {
    const deps = dependencies();
    const current = candidateCase();
    const resume = current.documents.resume.content;
    if (typeof resume !== "object" || resume === null || !("format" in resume)) {
      throw new Error("Synthetic resume fixture is not a resume form.");
    }
    current.documents.resume.content = {
      ...resume,
      skills: "CMMS\nPreventive maintenance\nRoot cause analysis",
    };

    await expect(executeArtifactCapabilityWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      run: run({ capabilityId: "brandedresume", executorId: "brand-resume" }),
      candidateCase: current,
    }, deps.value)).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining("Core Skills count is odd (3)"),
    });
    expect(deps.callResumeBuilder).not.toHaveBeenCalled();
  });

  it("rejects a hosted builder whose digest differs from the repository", async () => {
    const deps = dependencies();
    deps.callResumeBuilder.mockResolvedValue({
      status: "built",
      filename: "Synthetic Resume.pdf",
      downloadUrl: "/files/resume.pdf",
      expiresInSeconds: 3600,
      contactRemoved: [],
      notes: [],
      builderDigest: "f".repeat(64),
    });

    await expect(executeArtifactCapabilityWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      run: run({ capabilityId: "brandedresume", executorId: "brand-resume" }),
      candidateCase: candidateCase(),
    }, deps.value)).rejects.toThrow("does not match the canonical repository builder");
    expect(deps.persistCaseArtifact).not.toHaveBeenCalled();
  });

  it("refuses an unreviewed editable resume before calling or persisting the builder", async () => {
    const deps = dependencies();
    const unreviewedCase = candidateCase();
    unreviewedCase.documents.resume.content = {
      ...(unreviewedCase.documents.resume.content as Record<string, unknown>),
      reviewed: false,
    };

    await expect(executeArtifactCapabilityWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      run: run({ capabilityId: "brandedresume", executorId: "brand-resume" }),
      candidateCase: unreviewedCase,
    }, deps.value)).rejects.toThrow("compare the form with the original resume");

    expect(deps.callResumeBuilder).not.toHaveBeenCalled();
    expect(deps.persistCaseArtifact).not.toHaveBeenCalled();
  });

  it("never persists when the branded-resume builder refuses the input", async () => {
    const deps = dependencies();
    deps.callResumeBuilder.mockResolvedValue({
      status: "refused",
      problems: ["summary contains contact details"],
    });

    await expect(executeArtifactCapabilityWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      run: run({ capabilityId: "brandedresume", executorId: "brand-resume" }),
      candidateCase: candidateCase(),
    }, deps.value)).rejects.toThrow("summary contains contact details");

    expect(deps.persistCaseArtifact).not.toHaveBeenCalled();
  });

  it.each([
    ["complete-reference-check", "reference-check-pdf", "build_reference_check_pdf"],
    ["interview-prep-material", "interview-prep-pdf", "build_interview_prep_pdf"],
  ] as const)(
    "invokes and persists the existing %s manual builder boundary",
    async (capabilityId, executorId, tool) => {
      const payload = { synthetic: { grounded: true } };
      const deps = dependencies();
      const capabilityRun = run({
        capabilityId,
        executorId,
        extraInput: JSON.stringify(payload),
      });

      const result = await executeArtifactCapabilityWithDependencies({
        userId: "user-1",
        caseId: "case-1",
        run: capabilityRun,
        candidateCase: candidateCase(),
      }, deps.value);

      expect(deps.buildManualArtifact).toHaveBeenCalledWith(
        executorId,
        tool,
        payload,
        { endpoint: "https://builder.example/mcp", token: "synthetic-token" },
      );
      expect(deps.persistCaseArtifact).toHaveBeenCalledWith(expect.objectContaining({
        userId: "user-1",
        caseId: "case-1",
        runId: "run-1",
        kind: capabilityId,
        executorId,
        source: {
          downloadUrl: "https://builder.example/files/manual.pdf",
          evidence: {
            executorId,
            tool,
            sourceRefs: ["resume-source:sha-resume"],
          },
        },
      }));
      expect(result.status).toBe("awaiting_visual_qa");
      expect(result.artifact.visualQaStatus).toBe("pending");
    },
  );

  it("refuses malformed prepared manual payloads before invoking a builder", async () => {
    const deps = dependencies();

    await expect(executeArtifactCapabilityWithDependencies({
      userId: "user-1",
      caseId: "case-1",
      run: run({
        capabilityId: "complete-reference-check",
        executorId: "reference-check-pdf",
        extraInput: "not-json",
      }),
      candidateCase: candidateCase(),
    }, deps.value)).rejects.toThrow("valid JSON object");

    expect(deps.buildManualArtifact).not.toHaveBeenCalled();
    expect(deps.persistCaseArtifact).not.toHaveBeenCalled();
  });
});
