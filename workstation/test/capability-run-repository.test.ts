import { describe, expect, it } from "vitest";

import {
  capabilityRunTransitionPatch,
  validateCaseArtifactAttachment,
  validateCapabilityRunTransition,
  validateVisualQaTransition,
  type CapabilityRunRecord,
  type CapabilityRunStatus,
  type CreateCaseArtifactInput,
} from "../lib/server/capability-run-repository";

const ALLOWED_TRANSITIONS: Record<CapabilityRunStatus, CapabilityRunStatus[]> = {
  prepared: ["running", "refused", "cancelled"],
  running: ["draft_ready", "awaiting_visual_qa", "completed", "failed", "cancelled"],
  draft_ready: ["running", "completed", "cancelled"],
  awaiting_visual_qa: ["completed", "failed"],
  completed: [],
  refused: [],
  cancelled: [],
  failed: [],
};

describe("capability run lifecycle", () => {
  it("allows exactly the audited state transitions", () => {
    const statuses = Object.keys(ALLOWED_TRANSITIONS) as CapabilityRunStatus[];

    for (const current of statuses) {
      for (const next of statuses) {
        if (ALLOWED_TRANSITIONS[current].includes(next)) {
          expect(validateCapabilityRunTransition(current, next)).toBe(next);
        } else {
          expect(() => validateCapabilityRunTransition(current, next)).toThrow(
            `Capability run cannot transition from ${current} to ${next}.`,
          );
        }
      }
    }
  });

  it("builds a mutable-only patch and rejects attempts to replace prepared identity", () => {
    const patch = capabilityRunTransitionPatch(
      {
        status: "running",
        startedAt: "2026-09-20T01:00:00.000Z",
        resultJson: null,
        evidenceJson: "{}",
        errorJson: null,
      },
      {
        status: "draft_ready",
        result: { title: "Synthetic grounded draft" },
      },
      "2026-09-20T01:01:00.000Z",
    );

    expect(patch).toEqual({
      status: "draft_ready",
      resultJson: JSON.stringify({ title: "Synthetic grounded draft" }),
      updatedAt: "2026-09-20T01:01:00.000Z",
    });
    expect(patch).not.toHaveProperty("capabilityId");
    expect(() => capabilityRunTransitionPatch(
      {
        status: "prepared",
        startedAt: null,
        resultJson: null,
        evidenceJson: "{}",
        errorJson: null,
      },
      {
        status: "running",
        input: { extraInput: "replacement-is-forbidden" },
      } as never,
      "2026-09-20T01:00:00.000Z",
    )).toThrow("Prepared capability run fields are immutable.");
  });

  it("requires persisted result and evidence before completion", () => {
    const current = {
      status: "running" as const,
      startedAt: "2026-09-20T01:00:00.000Z",
      resultJson: null,
      evidenceJson: "{}",
      errorJson: null,
    };

    expect(() => capabilityRunTransitionPatch(
      current,
      { status: "completed", result: { output: "draft" } },
      "2026-09-20T01:02:00.000Z",
    )).toThrow("Completed capability runs require result and evidence.");

    expect(capabilityRunTransitionPatch(
      current,
      {
        status: "completed",
        result: { output: "draft" },
        evidence: { executor: "synthetic" },
      },
      "2026-09-20T01:02:00.000Z",
    )).toMatchObject({
      status: "completed",
      finishedAt: "2026-09-20T01:02:00.000Z",
    });
  });

  it("keeps visual QA pending until a reviewer records evidence", () => {
    expect(validateVisualQaTransition("pending", "passed", "reviewer-1", {
      pagesReviewed: 2,
    })).toBe("passed");
    expect(() => validateVisualQaTransition("pending", "passed", "", {
      pagesReviewed: 2,
    })).toThrow("Visual QA requires a reviewer and review evidence.");
    expect(() => validateVisualQaTransition("pending", "failed", "reviewer-1", {}))
      .toThrow("Visual QA requires a reviewer and review evidence.");
    expect(() => validateVisualQaTransition("passed", "failed", "reviewer-1", {
      pagesReviewed: 2,
    })).toThrow("Visual QA cannot transition from passed to failed.");
  });

  it("allows artifact insertion only for the matching running PDF run", () => {
    const run = {
      id: "run-1",
      caseId: "case-1",
      capabilityId: "brandedresume",
      outputKind: "pdf",
      status: "running",
    } as CapabilityRunRecord;
    const artifact = {
      id: "artifact-1",
      caseId: "case-1",
      runId: "run-1",
      kind: "brandedresume",
      contentType: "application/pdf",
    } as CreateCaseArtifactInput;

    expect(validateCaseArtifactAttachment(run, artifact)).toBeUndefined();
    expect(() => validateCaseArtifactAttachment(
      { ...run, status: "cancelled" },
      artifact,
    )).toThrow("running capability run");
    expect(() => validateCaseArtifactAttachment(
      { ...run, outputKind: "document" },
      artifact,
    )).toThrow("PDF output");
    expect(() => validateCaseArtifactAttachment(
      { ...run, capabilityId: "complete-reference-check" },
      artifact,
    )).toThrow("capability does not match");
    expect(() => validateCaseArtifactAttachment(
      { ...run, caseId: "case-other" },
      artifact,
    )).toThrow("does not belong to the case");
    expect(() => validateCaseArtifactAttachment(
      { ...run, id: "run-other" },
      artifact,
    )).toThrow("does not match the run");
    expect(() => validateCaseArtifactAttachment(
      run,
      { ...artifact, contentType: "text/plain" },
    )).toThrow("application/pdf");
  });
});
