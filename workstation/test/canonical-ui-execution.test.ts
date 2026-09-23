import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import {
  candidateIntakeContextIsCurrent,
  capabilityExecutionMessage,
  editSessionForCurrentDocument,
  loadCaseArtifactsForCase,
  loadCapabilityRunsForCase,
  mergePersistedDocuments,
  reviewCaseArtifactAndRefresh,
  resumeDraftForEdit,
  saveEditedOutput,
} from "../components/workstation/recruiter-workstation";
import {
  capabilityInputFields,
  mountedExecutorFor,
  resolveCapabilityInputValues,
  serializeCapabilityInputs,
  summarizeRunEvidence,
} from "../components/workstation/workflow-browser";
import type { CaseArtifactSummary } from "../lib/artifact-browser";
import { capabilityById } from "../lib/capabilities/registry";
import type { CapabilityExecutionResponse } from "../lib/server/capability-execution-service";
import type { CapabilityRunRecord } from "../lib/server/capability-run-repository";
import type { CandidateCase, CaseDocument, DocumentVersion, StoredDocumentKind } from "../lib/workstation-types";

const workstationSource = await readFile(new URL("../components/workstation/recruiter-workstation.tsx", import.meta.url), "utf8");

function document(kind: StoredDocumentKind, revision = 1): CaseDocument {
  return {
    kind,
    revision,
    content: kind === "submission" ? { name: "Old candidate" } : `${kind} revision ${revision}`,
    updatedAt: `revision-${revision}`,
  };
}

function candidateCase(): CandidateCase {
  return {
    id: "case-1",
    roleId: "role-1",
    candidateId: "candidate-1",
    status: "active",
    notes: "Keep these notes",
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
    sources: [],
    updatedAt: "2026-09-20T00:00:00.000Z",
  };
}

describe("canonical workflow UI execution contract", () => {
  it("preserves saved resume forms and safely recovers legacy resume text for editing", () => {
    const current = candidateCase();
    const savedForm = {
      format: "tttg-resume-form-v1" as const,
      reviewed: false,
      name: "Synthetic Candidate",
      headline: "Maintenance Leader",
      summary: "Source-backed summary.",
      skills: "Preventive maintenance",
      jobs: [],
      educationHeading: "Education",
      education: "Synthetic College",
      sections: [],
    };
    current.documents.resume.content = savedForm;
    expect(resumeDraftForEdit(current)).toEqual(savedForm);

    const legacySavedForm: Record<string, unknown> = { ...savedForm };
    delete legacySavedForm.reviewed;
    current.documents.resume.content = {
      ...legacySavedForm,
      summary: "Recruiter-corrected legacy summary.",
    };
    current.sources = [{
      id: "legacy-source-resume",
      kind: "resume",
      filename: "legacy-synthetic-resume.txt",
      contentType: "text/plain",
      sizeBytes: 160,
      sha256: "sha-legacy-synthetic-resume",
      captureTime: "2026-09-22T00:00:00.000Z",
      lifecycleStatus: "reviewed",
      reviewStatus: "reviewed",
      parsedText: "Synthetic Candidate\nMaintenance Leader\n\nProfessional Summary\nOriginal source summary.",
      classificationMethod: "explicit",
    }];
    expect(resumeDraftForEdit(current)).toMatchObject({
      reviewed: false,
      summary: "Recruiter-corrected legacy summary.",
    });

    current.documents.resume.content = { time: 0, version: "2.31.0", blocks: [] };
    current.sources = [{
      id: "source-resume",
      kind: "resume",
      filename: "synthetic-resume.txt",
      contentType: "text/plain",
      sizeBytes: 160,
      sha256: "sha-synthetic-resume",
      captureTime: "2026-09-23T00:00:00.000Z",
      lifecycleStatus: "reviewed",
      reviewStatus: "reviewed",
      parsedText: "Synthetic Candidate\nMaintenance Leader\n\nProfessional Summary\nSource-backed summary.\n\nCore Competencies\nPreventive maintenance",
      classificationMethod: "explicit",
    }];
    expect(resumeDraftForEdit(current)).toMatchObject({
      name: "Synthetic Candidate",
      headline: "Maintenance Leader",
      summary: "Source-backed summary.",
      skills: "Preventive maintenance",
    });

    current.sources = [];
    expect(resumeDraftForEdit(current)).toBeNull();
  });

  it("refuses to replace the visible case when candidate intake finishes in a changed context", () => {
    const originating = { roleId: "role-1", caseId: "case-1" };

    expect(candidateIntakeContextIsCurrent(originating, { roleId: "role-1", caseId: "case-1" })).toBe(true);
    expect(candidateIntakeContextIsCurrent(originating, { roleId: "role-2", caseId: "case-1" })).toBe(false);
    expect(candidateIntakeContextIsCurrent(originating, { roleId: "role-1", caseId: "case-2" })).toBe(false);
    expect(workstationSource).toContain("Save or cancel the current output edit before creating another candidate case.");
    expect(workstationSource).toContain('caseSaveState !== "saved" && !(await persistCase())');
    expect(workstationSource.match(/candidateIntakeContextIsCurrent\(originatingContext, currentContext\)/g)).toHaveLength(2);
    expect(workstationSource).toMatch(/const originatingContext:[\s\S]*?const contextChange = await prepareCandidateContextChange[\s\S]*?if \(creatingFromResume\)[\s\S]*?workstationApi\.uploadSources[\s\S]*?candidateIntakeContextIsCurrent\(originatingContext, currentContext\)/);
  });

  it("centrally clears stale action feedback around dialogs and successful dialog completion", () => {
    expect(workstationSource).toContain("const clearActionFeedback = useCallback");
    expect(workstationSource).toMatch(/const openPasteDialog[\s\S]*?clearActionFeedback\(\);[\s\S]*?setPasteOpen\(true\)/);
    expect(workstationSource).toMatch(/const openAddSources[\s\S]*?clearActionFeedback\(\);[\s\S]*?setAddSourcesOpen\(true\)/);
    expect(workstationSource).toContain("closePasteDialog");
    expect(workstationSource).toContain("closeCreationDialog");
  });

  it("keeps new-candidate type correction reachable and source mutations exclusive with output edits", () => {
    expect(workstationSource).toContain('aria-label="Candidate source type"');
    expect(workstationSource).toMatch(/sourceTarget === "new_candidate"[\s\S]*?Candidate source type[\s\S]*?effectivePastedKind === "resume"/);
    expect(workstationSource).toContain("CANDIDATE_SOURCE_KIND_OPTIONS.map");
    expect(workstationSource).toContain("if (!current || outputEditIsBusy(outputEditBusy, sourceBusy)) return;");
    expect(workstationSource).toContain("if (!session || draft === null || outputEditIsBusy(outputEditBusy, sourceBusy)) return;");
    expect(workstationSource).toContain("editBusy={outputEditIsBusy(outputEditBusy, sourceBusy)}");
  });

  it("guards candidate selection and post-capability UI commits by the active request and case", () => {
    const openCase = workstationSource.slice(
      workstationSource.indexOf("const openSelectedCase"),
      workstationSource.indexOf("const startResize"),
    );
    expect(openCase).toContain("const requestToken = beginLatestRequest(caseSelectionRequestRef)");
    expect(openCase).toMatch(/catch \(error\)[\s\S]*?latestRequestIsCurrent\(caseSelectionRequestRef, requestToken\)[\s\S]*?showActionError/);
    expect(openCase).toMatch(/finally[\s\S]*?latestRequestIsCurrent\(caseSelectionRequestRef, requestToken\)[\s\S]*?setLoading\(false\)/);
    expect(workstationSource).toMatch(/const reportFeedback[\s\S]*?if \(current && activeCaseRef\.current\?\.id !== current\.id\) return/);
    expect(workstationSource).toMatch(/if \(activeCaseRef\.current\?\.id === executionCase\.id\)[\s\S]*?selectOutputKind\(nextOutputKind\)[\s\S]*?if \(activeCaseRef\.current\?\.id === executionCase\.id\)[\s\S]*?reportFeedback\(capabilityExecutionMessage/);
  });

  it("prepares once, refuses without a persisted run, and only then executes that run", () => {
    const prepareAt = workstationSource.indexOf("workstationApi.prepareCapability");
    const refusalAt = workstationSource.indexOf("if (!prepared.run)", prepareAt);
    const executeAt = workstationSource.indexOf("workstationApi.executeCapabilityRun", refusalAt);

    expect(prepareAt).toBeGreaterThan(-1);
    expect(refusalAt).toBeGreaterThan(prepareAt);
    expect(executeAt).toBeGreaterThan(refusalAt);
    expect(workstationSource).toContain("Workflow not run:");
    expect(workstationSource).toContain("Branded PDF saved.");
    expect(workstationSource).toContain("Draft outputs were saved as read-only previews.");
    expect(workstationSource).not.toContain("createAutofilledDraft");
  });

  it("offers execution only for a registry executor that is actually mounted", () => {
    const writeUp = capabilityById("write-up")!;
    const interfaceOnly = capabilityById("applicant-screening")!;
    expect(mountedExecutorFor(writeUp)).toMatchObject({
      id: "write-up-candidate",
      mounted: true,
    });
    expect(mountedExecutorFor(interfaceOnly)).toBeUndefined();
    expect(mountedExecutorFor(capabilityById("loxo")!)).toBeUndefined();
    expect(mountedExecutorFor(capabilityById("brandedresume")!)).toMatchObject({
      id: "brand-resume",
      mounted: true,
      operationId: "build-branded-resume",
    });
    expect(mountedExecutorFor({
      ...interfaceOnly,
      executorFeatures: [{ ...interfaceOnly.executorFeatures[0], mounted: true }],
    })).toBeUndefined();
    expect(writeUp.operations.find((operation) => operation.id === "draft-package")?.label)
      .toBe("Draft candidate package");
  });

  it("exposes the repository-defined structured inputs instead of sending an empty prompt", () => {
    const fields = capabilityInputFields(capabilityById("offer-letter")!);
    expect(fields.map((field) => field.key)).toEqual([
      "candidate_full_name",
      "job_title",
      "start_date",
      "base_salary",
      "pay_frequency",
      "employment_type",
      "reporting_manager_name",
      "reporting_manager_title",
      "company_name",
      "signing_authority_name",
      "signing_authority_title",
    ]);
    expect(fields.every((field) => field.required)).toBe(true);
    expect(serializeCapabilityInputs({
      candidate_full_name: "Synthetic Candidate",
      job_title: "Maintenance Manager",
      blank_value: "   ",
    })).toBe(JSON.stringify({
      candidate_full_name: "Synthetic Candidate",
      job_title: "Maintenance Manager",
    }));
    expect(resolveCapabilityInputValues(fields, {
      candidate_full_name: "Synthetic Candidate",
      job_title: "Maintenance Manager",
      company_name: "Synthetic Manufacturing",
    }, {
      job_title: "Human-reviewed title",
    })).toEqual({
      candidate_full_name: "Synthetic Candidate",
      job_title: "Human-reviewed title",
      company_name: "Synthetic Manufacturing",
      start_date: "",
      base_salary: "",
      pay_frequency: "",
      employment_type: "",
      reporting_manager_name: "",
      reporting_manager_title: "",
      signing_authority_name: "",
      signing_authority_title: "",
    });
    expect(resolveCapabilityInputValues([], {
      candidate_full_name: "Synthetic Candidate",
    }, {})).toEqual({});
    expect(workstationSource).toContain("extraInput,");
    expect(workstationSource).not.toContain('extraInput: ""');
  });

  it("exposes the optional branded-resume presentation mode without making it a build gate", () => {
    expect(capabilityInputFields(capabilityById("brandedresume")!)).toEqual([{
      key: "resume_mode",
      label: "Presentation mode",
      required: false,
      allowedValues: ["named_submission", "internal_mpc"],
      multiline: false,
    }]);
  });

  it("keeps output read-only until Edit, exposes Cancel, and clears the local draft on cancel", () => {
    expect(workstationSource).not.toContain('className="output-version-row"');
    expect(workstationSource).toContain("effectiveRevision === document.revision");
    expect(workstationSource).toContain('aria-label="Output history"');
    expect(workstationSource).toContain("<Edit3");
    expect(workstationSource).toContain("Save changes");
    expect(workstationSource).toContain(">Cancel</Button>");
    expect(workstationSource).toMatch(/const cancelOutputEdit = \(\) => \{[\s\S]*?setOutputDraft\(null\);[\s\S]*?setOutputEditSession\(null\);/);
    expect(workstationSource).toContain('key={`${activeCase.id}-${outputKind}-${activeCase.documents[outputKind].revision}`}');
  });

  it("saves an optimistic edited revision with inherited source and run provenance", async () => {
    const current = candidateCase();
    current.documents.submission = document("submission", 7);
    const versions: DocumentVersion[] = [{
      kind: "submission",
      revision: 7,
      content: current.documents.submission.content,
      sourceRefs: ["resume:sha-resume", "call:sha-call", "jd:sha-jd"],
      capabilityRunId: "run-canonical-1",
      origin: "generated",
      createdAt: "2026-09-20T00:00:00.000Z",
    }];
    const session = editSessionForCurrentDocument(current, "submission", versions)!;
    const saved = document("submission", 8);
    const saveDocument = vi.fn(async () => saved);

    await expect(saveEditedOutput(saveDocument, session, { name: "Human-reviewed edit" }))
      .resolves.toBe(saved);
    expect(saveDocument).toHaveBeenCalledWith("case-1", "submission", {
      expectedRevision: 7,
      content: { name: "Human-reviewed edit" },
      origin: "edited",
      sourceRefs: ["resume:sha-resume", "call:sha-call", "jd:sha-jd"],
      capabilityRunId: "run-canonical-1",
    });
  });

  it("marks only an explicitly saved resume form as reviewed for PDF export", async () => {
    const current = candidateCase();
    current.sources = [{
      id: "resume",
      kind: "resume",
      filename: "resume.txt",
      contentType: "text/plain",
      sizeBytes: 100,
      sha256: "sha-resume",
      captureTime: "2026-09-20T00:00:00.000Z",
      lifecycleStatus: "reviewed",
      reviewStatus: "reviewed",
      parsedText: "Synthetic Candidate resume",
      classificationMethod: "explicit",
    }];
    const versions: DocumentVersion[] = [{
      kind: "resume",
      revision: 1,
      content: current.documents.resume.content,
      sourceRefs: ["resume:sha-resume:resume:reviewed:reviewed:explicit"],
      capabilityRunId: "run-write-up-1",
      origin: "generated",
      createdAt: "2026-09-20T00:00:00.000Z",
    }];
    const session = editSessionForCurrentDocument(current, "resume", versions)!;
    const saveDocument = vi.fn(async () => document("resume", 2));
    const draft = {
      format: "tttg-resume-form-v1" as const,
      reviewed: false,
      name: "Synthetic Candidate",
      headline: "Maintenance Leader",
      summary: "Source-backed summary.",
      skills: "Preventive maintenance",
      jobs: [],
      educationHeading: "",
      education: "",
      sections: [],
    };

    await saveEditedOutput(saveDocument, session, draft);

    expect(saveDocument).toHaveBeenCalledWith("case-1", "resume", expect.objectContaining({
      origin: "edited",
      sourceRefs: ["resume:sha-resume:resume:reviewed:reviewed:explicit"],
      capabilityRunId: "run-write-up-1",
      content: expect.objectContaining({ reviewed: true, summary: "Source-backed summary." }),
    }));

    const legacyDraft: Record<string, unknown> = { ...draft };
    delete legacyDraft.reviewed;
    await saveEditedOutput(saveDocument, session, legacyDraft);
    expect(saveDocument).toHaveBeenLastCalledWith("case-1", "resume", expect.objectContaining({
      content: expect.objectContaining({ reviewed: true, summary: "Source-backed summary." }),
    }));
  });

  it("reloads saved run history by active case and summarizes evidence without raw values", async () => {
    const run = {
      id: "run-1",
      caseId: "case-1",
      capabilityId: "write-up",
      sourceRefs: ["resume:private-sha", "call:private-sha"],
      evidence: {
        documentRevisions: { resume: 2, submission: 4 },
        secret: "must-not-render",
      },
    } as CapabilityRunRecord;
    const listCapabilityRuns = vi.fn(async () => [run]);

    await expect(loadCapabilityRunsForCase(listCapabilityRuns, "case-1")).resolves.toEqual([run]);
    expect(listCapabilityRuns).toHaveBeenCalledWith("case-1");
    expect(workstationSource).toContain("void loadCapabilityRuns(next.id)");
    expect(summarizeRunEvidence(run)).toBe("2 source references · 2 persisted outputs · execution evidence recorded");
    expect(summarizeRunEvidence(run)).not.toContain("must-not-render");
    expect(summarizeRunEvidence(run)).not.toContain("private-sha");
  });

  it("reloads persisted PDF artifacts with the active case and after execution or review", async () => {
    const artifact = {
      id: "artifact-1",
      caseId: "case-1",
      runId: "run-1",
      kind: "brandedresume",
      filename: "Synthetic Resume.pdf",
      contentType: "application/pdf",
      sha256: "c".repeat(64),
      sizeBytes: 1234,
      revision: 1,
      pageCount: 1,
      visualQaStatus: "pending",
      reviewedAt: null,
      createdAt: "2026-09-20T12:00:00.000Z",
    } satisfies CaseArtifactSummary;
    const listCaseArtifacts = vi.fn(async () => [artifact]);

    await expect(loadCaseArtifactsForCase(listCaseArtifacts, "case-1"))
      .resolves.toEqual([artifact]);
    expect(listCaseArtifacts).toHaveBeenCalledWith("case-1");
    expect(workstationSource).toContain("void loadCaseArtifacts(next.id)");
    expect(workstationSource).toContain("workstationApi.reviewCaseArtifact");
    expect(workstationSource).toContain("reviewCaseArtifactAndRefresh");
  });

  it("refreshes both the run status and artifact status after a visual-QA decision", async () => {
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
      artifact: { id: "artifact-1", visualQaStatus: "failed" },
      run: { id: "run-1", status: "failed" },
    };
    const events: string[] = [];
    const reviewCaseArtifact = vi.fn(async () => {
      events.push("review");
      return result;
    });
    const refreshRuns = vi.fn(async () => { events.push("runs"); return []; });
    const refreshArtifacts = vi.fn(async () => { events.push("artifacts"); return []; });

    await expect(reviewCaseArtifactAndRefresh(
      reviewCaseArtifact as never,
      refreshRuns,
      refreshArtifacts,
      "case-1",
      "artifact-1",
      review,
    )).resolves.toBe(result);
    expect(events[0]).toBe("review");
    expect(new Set(events.slice(1))).toEqual(new Set(["runs", "artifacts"]));
    expect(refreshRuns).toHaveBeenCalledWith("case-1");
    expect(refreshArtifacts).toHaveBeenCalledWith("case-1");
  });

  it("does not conflate editable drafts with persisted branded PDFs", () => {
    const run = {
      id: "run-1",
      status: "draft_ready",
    } as CapabilityRunRecord;
    const draftResult = {
      run,
      reused: false,
      documents: [document("resume", 2)],
    } as CapabilityExecutionResponse;
    const pdfResult = {
      run: { ...run, status: "awaiting_visual_qa" },
      reused: false,
      documents: [],
    } as CapabilityExecutionResponse;

    expect(capabilityExecutionMessage(draftResult, "PDF build remains incomplete."))
      .toBe("Draft outputs were saved as read-only previews. PDF build remains incomplete.");
    expect(capabilityExecutionMessage(pdfResult, "ignored for PDF state"))
      .toBe("Branded PDF saved. Open the exact PDF and complete human visual QA before this run can complete.");
    expect(workstationSource).toContain('resume: "Resume"');
    expect(workstationSource).not.toContain('resume: "Branded resume"');
  });

  it("merges server-persisted execution documents without replacing case state or untouched outputs", () => {
    const current = candidateCase();
    const submission = document("submission", 2);
    submission.content = { name: "Source-grounded candidate" };
    const email = document("email", 4);

    const merged = mergePersistedDocuments(current, [submission, email]);

    expect(merged).not.toBe(current);
    expect(merged.notes).toBe("Keep these notes");
    expect(merged.documents.submission).toBe(submission);
    expect(merged.documents.email).toBe(email);
    expect(merged.documents.resume).toBe(current.documents.resume);
  });
});
