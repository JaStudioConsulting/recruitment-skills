import { describe, expect, it } from "vitest";

import { featureByPrimaryCapability } from "../lib/capabilities/catalog";
import { prepareCapabilityFromContext } from "../lib/capabilities/prepare";
import { capabilityById } from "../lib/capabilities/registry";
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
    expect(prepared.sourceRefs).toEqual(["jd:sha-jd", "resume:sha-resume", "transcript:sha-transcript"]);
    expect(prepared.inputSnapshotHash).toMatch(/^[0-9a-f]{64}$/);

    const changed = await prepareCapabilityFromContext("write-up", context(), {
      extraInput: "Different destination", provider: "manual", model: "none", now: "2026-09-20T01:00:00.000Z",
    });
    expect(changed.inputSnapshotHash).not.toBe(prepared.inputSnapshotHash);
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

  it("binds reviewed resume edits into a blocked branded-resume snapshot", async () => {
    const input = context();
    input.availableExecutorIds = [...input.availableExecutorIds, "brand-resume"];
    const brandedResume = await prepareCapabilityFromContext("brandedresume", input, {
      extraInput: "",
      provider: "manual",
      model: "none",
    });

    expect(brandedResume.executorId).toBe("brand-resume");
    expect(brandedResume.outputKind).toBe("pdf");
    expect(brandedResume.canExecute).toBe(false);
    expect(brandedResume.blocker).toMatch(/active authorities conflict/);

    const editedInput = context();
    editedInput.availableExecutorIds = [...editedInput.availableExecutorIds, "brand-resume"];
    editedInput.candidateCase.documents.resume = {
      ...editedInput.candidateCase.documents.resume,
      revision: 2,
      content: { format: "tttg-resume-form-v1", name: "Human reviewed name" },
    };
    const afterEdit = await prepareCapabilityFromContext("brandedresume", editedInput, {
      extraInput: "",
      provider: "manual",
      model: "none",
      now: brandedResume.preparedAt,
    });
    expect(afterEdit.inputSnapshotHash).not.toBe(brandedResume.inputSnapshotHash);
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
