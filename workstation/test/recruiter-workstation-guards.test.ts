import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  AssistantReviewRequiredNotice,
  mergeSavedOutputEdit,
  outputEditIsBusy,
  prepareCandidateContextChange,
} from "../components/workstation/recruiter-workstation";
import { EMPTY_SUBMISSION, type CandidateCase, type CaseDocument, type SourceReviewRequirement } from "../lib/workstation-types";

const reviewRequirement: SourceReviewRequirement = {
  id: "submission-source-review:resume-1",
  sourceId: "resume-1",
  sourceRef: "auto-prefill:resume-1:sha:resume",
  documentKind: "submission",
  previousKind: "resume",
  currentKind: "call_notes",
  reason: "A source changed from Resume to Call notes after filling submission fields.",
  createdAt: "2026-09-21T12:00:00.000Z",
};

describe("candidate context-change guard", () => {
  it("blocks output Edit and Save controls while a source mutation is in flight", () => {
    expect(outputEditIsBusy(false, true)).toBe(true);
    expect(outputEditIsBusy(true, false)).toBe(true);
    expect(outputEditIsBusy(false, false)).toBe(false);
  });

  it("blocks every context change while an output edit is active without trying to save notes", async () => {
    const persistCase = vi.fn(async () => true);

    await expect(prepareCandidateContextChange({
      outputEditActive: true,
      caseSaveState: "unsaved",
      persistCase,
    })).resolves.toBe("output_edit");
    expect(persistCase).not.toHaveBeenCalled();
  });

  it("persists unsaved notes before allowing a candidate context change", async () => {
    const persistCase = vi.fn(async () => true);

    await expect(prepareCandidateContextChange({
      outputEditActive: false,
      caseSaveState: "unsaved",
      persistCase,
    })).resolves.toBe("ready");
    expect(persistCase).toHaveBeenCalledOnce();
  });

  it("stops the context change when notes cannot be saved", async () => {
    const persistCase = vi.fn(async () => false);

    await expect(prepareCandidateContextChange({
      outputEditActive: false,
      caseSaveState: "failed",
      persistCase,
    })).resolves.toBe("notes_save_failed");
  });
});

describe("persisted assistant review notice", () => {
  it("shows the concise submission correction path when review is required", () => {
    const html = renderToStaticMarkup(createElement(AssistantReviewRequiredNotice, {
      requirements: [reviewRequirement],
    }));

    expect(html).toContain("Submission review required");
    expect(html).toContain("Open Generated &gt; Submission &gt; Edit &gt; Save.");
    expect(html).toContain(reviewRequirement.reason);
  });

  it("renders no notice when there is no persisted review marker", () => {
    expect(renderToStaticMarkup(createElement(AssistantReviewRequiredNotice, { requirements: [] }))).toBe("");
    expect(renderToStaticMarkup(createElement(AssistantReviewRequiredNotice, {}))).toBe("");
  });

  it("does not repeat the navigation instruction when the persisted reason already contains it", () => {
    const html = renderToStaticMarkup(createElement(AssistantReviewRequiredNotice, {
      requirements: [{
        ...reviewRequirement,
        reason: `${reviewRequirement.reason} Open Generated > Submission > Edit > Save.`,
      }],
    }));

    expect(html.match(/Open Generated &gt; Submission &gt; Edit &gt; Save\./g)).toHaveLength(1);
  });

  it("removes the local notice and workflow blocker marker after a confirmed Submission edit", () => {
    const document = (kind: CaseDocument["kind"]): CaseDocument => ({
      kind,
      revision: 1,
      content: kind === "submission" ? EMPTY_SUBMISSION : "",
      updatedAt: "2026-09-21T12:00:00.000Z",
    });
    const candidateCase: CandidateCase = {
      id: "case-1",
      roleId: "role-1",
      candidateId: "candidate-1",
      status: "active",
      notes: "",
      notesDrawingSvg: "",
      notesFont: "System",
      notesSize: 20,
      revision: 1,
      facts: [],
      assistant: { missing: [], askNext: [], fitConcern: "", nextAction: "", reviewRequired: [reviewRequirement] },
      externalRefs: {},
      documents: {
        resume: document("resume"),
        write_up: document("write_up"),
        submission: document("submission"),
        email: document("email"),
        loxo_update: document("loxo_update"),
      },
      sources: [],
      updatedAt: "2026-09-21T12:00:00.000Z",
    };
    const savedSubmission = { ...document("submission"), revision: 2 };

    const reviewed = mergeSavedOutputEdit(candidateCase, savedSubmission);

    expect(reviewed.assistant.reviewRequired).toBeUndefined();
    expect(reviewed.documents.submission).toBe(savedSubmission);
    expect(renderToStaticMarkup(createElement(AssistantReviewRequiredNotice, {
      requirements: reviewed.assistant.reviewRequired,
    }))).toBe("");
  });
});
