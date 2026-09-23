import { describe, expect, it } from "vitest";

import { featureByPrimaryCapability } from "../lib/capabilities/catalog";
import { prepareCapabilityFromContext } from "../lib/capabilities/prepare";
import { capabilityById } from "../lib/capabilities/registry";
import { emptyResumeForm } from "../lib/resume-form";
import type { CandidateCase, CandidateRecord, ConnectorCapability, RoleRecord, SourceKind } from "../lib/workstation-types";

function source(id: string, kind: SourceKind, lifecycleStatus: "classified" | "parsed" = "classified") {
  return {
    id, kind, filename: `${id}.txt`, contentType: "text/plain", sizeBytes: 10, sha256: `sha-${id}`,
    captureTime: "2026-09-20T00:00:00.000Z", lifecycleStatus, reviewStatus: "unreviewed" as const,
    parsedText: `${kind} synthetic evidence`, classificationMethod: lifecycleStatus === "classified" ? "content" as const : "uncertain" as const,
  };
}

function context() {
  const document = (kind: CandidateCase["documents"][keyof CandidateCase["documents"]]["kind"]) => ({ kind, revision: 1, content: "", updatedAt: "2026-09-20T00:00:00.000Z" });
  const candidateCase: CandidateCase = {
    id: "case-1", roleId: "role-1", candidateId: "candidate-1", status: "active", notes: "Confirmed call note", notesDrawingSvg: "", notesFont: "System", notesSize: 20, revision: 2,
    facts: [], assistant: { missing: [], askNext: [], fitConcern: "", nextAction: "" }, externalRefs: {},
    documents: { resume: document("resume"), write_up: document("write_up"), submission: document("submission"), email: document("email"), loxo_update: document("loxo_update") },
    sources: [source("resume", "resume"), source("transcript", "transcript"), source("jd", "job_description"), source("held", "other", "parsed")],
    updatedAt: "2026-09-20T00:00:00.000Z",
  };
  const role: RoleRecord = { id: "role-1", title: "Maintenance Manager", client: "Synthetic Manufacturing", status: "active" };
  const candidate: CandidateRecord = { id: "candidate-1", name: "Synthetic Candidate", currentTitle: "Maintenance Supervisor" };
  const connectors: ConnectorCapability[] = [
    { id: "loxo", label: "Loxo", status: "not_connected", detail: "Not connected" },
    { id: "tracker", label: "Tracker", status: "not_connected", detail: "Not connected" },
  ];
  return {
    candidateCase,
    role,
    candidate,
    connectors,
    availableExecutorIds: ["write-up-candidate"],
  };
}

describe("canonical capability preparation", () => {
  it("prepares write-up from reusable Job and candidate sources with a stable SHA-256 snapshot", async () => {
    const prepared = await prepareCapabilityFromContext("write-up", context(), {
      extraInput: "Named destination: Synthetic Client", provider: "manual", model: "none", now: "2026-09-20T01:00:00.000Z",
    });
    expect(prepared).toMatchObject({
      capabilityId: "write-up",
      executorId: "write-up-candidate",
      implementationStatus: "partial",
      outputKind: "submission",
      canExecute: true,
      blocker: "",
      missing: [],
      preparedAt: "2026-09-20T01:00:00.000Z",
    });
    expect(prepared.sourceRefs).toEqual([
      "jd:sha-jd:job_description:classified:unreviewed:content",
      "resume:sha-resume:resume:classified:unreviewed:content",
      "transcript:sha-transcript:transcript:classified:unreviewed:content",
    ]);
    expect(prepared.inputSnapshotHash).toMatch(/^[0-9a-f]{64}$/);

    const changed = await prepareCapabilityFromContext("write-up", context(), {
      extraInput: "Different destination", provider: "manual", model: "none", now: "2026-09-20T01:00:00.000Z",
    });
    expect(changed.inputSnapshotHash).not.toBe(prepared.inputSnapshotHash);
  });

  it("invalidates a prepared identity when the same source is reclassified", async () => {
    const beforeContext = context();
    const options = {
      extraInput: "",
      provider: "workstation",
      model: "write-up-candidate-v1",
      now: "2026-09-20T01:00:00.000Z",
    };
    const before = await prepareCapabilityFromContext("write-up", beforeContext, options);

    const afterContext = context();
    afterContext.candidateCase.sources = afterContext.candidateCase.sources.map((item) => item.id === "resume"
      ? {
          ...item,
          kind: "call_notes" as const,
          lifecycleStatus: "reviewed" as const,
          reviewStatus: "reviewed" as const,
          classificationMethod: "manual" as const,
        }
      : item);
    const after = await prepareCapabilityFromContext("write-up", afterContext, options);

    expect(after.inputSnapshotHash).not.toBe(before.inputSnapshotHash);
    expect(after.sourceRefs).toContain("resume:sha-resume:call_notes:reviewed:reviewed:manual");
    expect(after.sourceRefs).not.toContain("resume:sha-resume:resume:classified:unreviewed:content");
  });

  it("blocks preparation while a reclassified autofill awaits human submission review", async () => {
    const input = context();
    input.candidateCase.assistant.reviewRequired = [{
      id: "submission-source-review:resume",
      sourceId: "resume",
      sourceRef: "auto-prefill:resume:sha-resume:resume",
      documentKind: "submission",
      previousKind: "resume",
      currentKind: "call_notes",
      reason: "Avery North - Resume.txt changed from Resume to Call notes after filling submission fields.",
      createdAt: "2026-09-20T01:00:00.000Z",
    }];
    const options = {
      extraInput: "",
      provider: "workstation",
      model: "write-up-candidate-v1",
      now: "2026-09-20T01:05:00.000Z",
    };

    const blocked = await prepareCapabilityFromContext("write-up", input, options);
    expect(blocked.canExecute).toBe(false);
    expect(blocked.blocker).toContain("Human review required");
    expect(blocked.blocker).toContain("Open Generated > Submission");

    const reviewedInput = context();
    const reviewed = await prepareCapabilityFromContext("write-up", reviewedInput, options);
    expect(reviewed.canExecute).toBe(true);
    expect(reviewed.inputSnapshotHash).not.toBe(blocked.inputSnapshotHash);
  });

  it("binds every supporting authority digest into the prepared identity", async () => {
    const options = {
      extraInput: "",
      provider: "workstation",
      model: "write-up-candidate-v1",
      now: "2026-09-20T01:00:00.000Z",
    };
    const prepared = await prepareCapabilityFromContext("write-up", context(), options);
    expect(prepared.supportingAuthorities).toEqual([
      { id: "brandedresume", authorityDigest: expect.stringMatching(/^[0-9a-f]{64}$/) },
    ]);

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
    const changed = await prepareCapabilityFromContext("write-up", context(), options, {
      capabilityById: (id) => id === "write-up" ? changedCapability : capabilityById(id),
      featureByPrimaryCapability,
    });

    expect(changed.supportingAuthorities).toEqual([
      { id: "brandedresume", authorityDigest: "f".repeat(64) },
    ]);
    expect(changed.inputSnapshotHash).not.toBe(prepared.inputSnapshotHash);
  });

  it("refuses feature IDs and interface-only capabilities without invoking an executor", async () => {
    await expect(prepareCapabilityFromContext("write-up-candidate", context(), { extraInput: "", provider: "manual", model: "none" }))
      .rejects.toThrow("Canonical capability was not found");
    const interfaceOnly = await prepareCapabilityFromContext("applicant-screening", context(), { extraInput: "Synthetic applicants", provider: "manual", model: "none" });
    expect(interfaceOnly.canExecute).toBe(false);
    expect(interfaceOnly.blocker).toBe("The repository guide is present, but the workstation has no mounted screening executor or persisted screening run.");
  });

  it("returns the exact blocker for unavailable external adapters", async () => {
    const tracker = await prepareCapabilityFromContext("tracker", context(), { extraInput: "", provider: "manual", model: "none" });
    expect(tracker.canExecute).toBe(false);
    expect(tracker.missing).toContain("Connected read-only Tracker adapter");
    expect(tracker.blocker).toContain("no live Gmail or Sheets adapter");
  });

  it("binds reviewed resume edits and optional mode into an executable branded-resume snapshot", async () => {
    const input = context();
    input.availableExecutorIds = [...input.availableExecutorIds, "brand-resume"];
    const unreviewed = await prepareCapabilityFromContext("brandedresume", input, {
      extraInput: "",
      provider: "manual",
      model: "none",
    });
    expect(unreviewed.canExecute).toBe(false);
    expect(unreviewed.missing).toEqual([
      "Human-reviewed editable resume",
      "Reviewed job description",
    ]);

    input.candidateCase.documents.resume = {
      ...input.candidateCase.documents.resume,
      revision: 2,
      sourceRefs: ["resume:sha-resume:resume:classified:unreviewed:content"],
      content: {
        ...emptyResumeForm(),
        reviewed: true,
        name: "Synthetic Candidate",
        summary: "Human-reviewed source-grounded summary.",
      },
    };
    input.candidateCase.sources = input.candidateCase.sources.map((item) =>
      item.kind === "job_description"
        ? {
            ...item,
            lifecycleStatus: "reviewed" as const,
            reviewStatus: "reviewed" as const,
            classificationMethod: "manual" as const,
          }
        : item,
    );
    const brandedResume = await prepareCapabilityFromContext("brandedresume", input, {
      extraInput: "",
      provider: "manual",
      model: "none",
    });

    expect(brandedResume.executorId).toBe("brand-resume");
    expect(brandedResume.outputKind).toBe("pdf");
    expect(brandedResume.canExecute).toBe(true);
    expect(brandedResume.blocker).toBe("");

    const editedInput = context();
    editedInput.availableExecutorIds = [...editedInput.availableExecutorIds, "brand-resume"];
    editedInput.candidateCase.documents.resume = {
      ...editedInput.candidateCase.documents.resume,
      revision: 2,
      sourceRefs: ["resume:sha-resume:resume:classified:unreviewed:content"],
      content: {
        ...emptyResumeForm(),
        reviewed: true,
        name: "Human reviewed name",
        summary: "Human-reviewed source-grounded summary.",
      },
    };
    editedInput.candidateCase.sources = input.candidateCase.sources;
    const afterEdit = await prepareCapabilityFromContext("brandedresume", editedInput, {
      extraInput: "",
      provider: "manual",
      model: "none",
      now: brandedResume.preparedAt,
    });
    expect(afterEdit.inputSnapshotHash).not.toBe(brandedResume.inputSnapshotHash);

    const internalMpc = await prepareCapabilityFromContext("brandedresume", input, {
      extraInput: JSON.stringify({ resume_mode: "internal_mpc" }),
      provider: "manual",
      model: "none",
      now: brandedResume.preparedAt,
    });
    expect(internalMpc.canExecute).toBe(true);
    expect(internalMpc.missing).toEqual([]);
    expect(internalMpc.inputSnapshotHash).not.toBe(brandedResume.inputSnapshotHash);

    const replacedSource = context();
    replacedSource.availableExecutorIds = [...replacedSource.availableExecutorIds, "brand-resume"];
    replacedSource.candidateCase.documents.resume = input.candidateCase.documents.resume;
    replacedSource.candidateCase.sources = input.candidateCase.sources.map((item) => item.id === "resume"
      ? { ...item, sha256: "sha-replacement-resume" }
      : item);
    const staleReview = await prepareCapabilityFromContext("brandedresume", replacedSource, {
      extraInput: "",
      provider: "manual",
      model: "none",
    });
    expect(staleReview.canExecute).toBe(false);
    expect(staleReview.missing).toEqual(["Human-reviewed editable resume"]);
    expect(staleReview.blocker).toContain("Resume sources changed after this form was reviewed");

    const legacyReview = context();
    legacyReview.availableExecutorIds = [...legacyReview.availableExecutorIds, "brand-resume"];
    legacyReview.candidateCase.documents.resume = {
      ...input.candidateCase.documents.resume,
      sourceRefs: undefined,
    };
    legacyReview.candidateCase.sources = input.candidateCase.sources;
    const missingLegacyProvenance = await prepareCapabilityFromContext("brandedresume", legacyReview, {
      extraInput: "",
      provider: "manual",
      model: "none",
    });
    expect(missingLegacyProvenance.canExecute).toBe(false);
    expect(missingLegacyProvenance.blocker).toContain("Resume sources changed after this form was reviewed");
  });

  it("requires reviewed role and call evidence before a branded-resume run can execute", async () => {
    const input = context();
    input.availableExecutorIds = [...input.availableExecutorIds, "brand-resume"];
    input.candidateCase.notes = "";
    input.candidateCase.documents.resume = {
      ...input.candidateCase.documents.resume,
      revision: 2,
      sourceRefs: ["resume:sha-resume:resume:classified:unreviewed:content"],
      content: {
        ...emptyResumeForm(),
        reviewed: true,
        name: "Synthetic Candidate",
        summary: "Role-specific, human-reviewed summary.",
      },
    };

    const unreviewedEvidence = await prepareCapabilityFromContext("brandedresume", input, {
      extraInput: "",
      provider: "manual",
      model: "none",
    });
    expect(unreviewedEvidence.canExecute).toBe(false);
    expect(unreviewedEvidence.missing).toEqual([
      "Reviewed job description",
      "Reviewed call notes or transcript",
    ]);

    input.candidateCase.sources = input.candidateCase.sources.map((item) =>
      item.kind === "job_description" || item.kind === "transcript"
        ? {
            ...item,
            lifecycleStatus: "reviewed" as const,
            reviewStatus: "reviewed" as const,
            classificationMethod: "manual" as const,
          }
        : item,
    );
    const reviewedEvidence = await prepareCapabilityFromContext("brandedresume", input, {
      extraInput: "",
      provider: "manual",
      model: "none",
    });
    expect(reviewedEvidence.canExecute).toBe(true);
    expect(reviewedEvidence.missing).toEqual([]);
    expect(reviewedEvidence.sourceRefs).toEqual(expect.arrayContaining([
      "jd:sha-jd:job_description:reviewed:reviewed:manual",
      "transcript:sha-transcript:transcript:reviewed:reviewed:manual",
    ]));
  });

  it("uses versioned typed Workstation notes as call evidence when no call file exists", async () => {
    const input = context();
    input.candidateCase = {
      ...input.candidateCase,
      notes: "Compensation Target: $115,000",
      revision: 9,
      sources: input.candidateCase.sources.filter((item) => item.kind !== "transcript" && item.kind !== "call_notes"),
    };

    const prepared = await prepareCapabilityFromContext("write-up", input, {
      extraInput: "",
      provider: "manual",
      model: "none",
    });

    expect(prepared.canExecute).toBe(true);
    expect(prepared.missing).not.toContain("Reviewed call notes or transcript");
    expect(prepared.sourceRefs).toContain("case-notes:case-1:9");
  });

  it("does not treat arbitrary offer text as all seven required offer groups", async () => {
    const arbitrary = await prepareCapabilityFromContext("offer-letter", context(), {
      extraInput: "Everything is confirmed.",
      provider: "manual",
      model: "none",
    });

    expect(arbitrary.requirements.filter((requirement) => requirement.required && requirement.met)).toHaveLength(0);
    expect(arbitrary.missing).toEqual([
      "Candidate full name",
      "Job title",
      "Start date",
      "Base salary and pay frequency",
      "Employment type",
      "Reporting manager name and title",
      "Company and signing authority name and title",
    ]);

    const complete = await prepareCapabilityFromContext("offer-letter", context(), {
      extraInput: JSON.stringify({
        candidate_full_name: "Synthetic Candidate",
        job_title: "Maintenance Manager",
        start_date: "2026-10-01",
        base_salary: "$100,000",
        pay_frequency: "annual",
        employment_type: "full-time",
        reporting_manager_name: "Synthetic Manager",
        reporting_manager_title: "Plant Manager",
        company_name: "Synthetic Manufacturing",
        signing_authority_name: "Synthetic Signer",
        signing_authority_title: "President",
      }),
      provider: "manual",
      model: "none",
    });

    expect(complete.requirements.filter((requirement) => requirement.required && !requirement.met)).toEqual([]);
    expect(complete.missing).toEqual([]);
    expect(complete.canExecute).toBe(false);
    expect(complete.blocker).toMatch(/seven-field completeness gate/);
  });
});
