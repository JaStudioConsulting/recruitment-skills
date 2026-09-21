import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ARTIFACT_VISUAL_QA_CHECKS,
  artifactDownloadUrl,
  artifactKindLabel,
  buildArtifactVisualQaReview,
  formatArtifactBytes,
  toCaseArtifactSummary,
} from "../lib/artifact-browser";
import { ArtifactReviewCard, artifactsForRun } from "../components/workstation/workflow-browser";
import type { CaseArtifactRecord } from "../lib/server/capability-run-repository";

const workflowBrowserSource = await readFile(
  new URL("../components/workstation/workflow-browser.tsx", import.meta.url),
  "utf8",
);

function storedArtifact(): CaseArtifactRecord {
  return {
    id: "artifact-1",
    caseId: "case-1",
    runId: "run-1",
    kind: "brandedresume",
    filename: "Synthetic Candidate Resume.pdf",
    contentType: "application/pdf",
    storageKey: "cases/case-1/private-storage-key.pdf",
    sha256: "c".repeat(64),
    sizeBytes: 12_345,
    revision: 1,
    evidence: {
      builderToken: "must-not-reach-browser",
      persistence: { pageCount: 2, storage: "workstation_r2" },
    },
    visualQaStatus: "pending",
    reviewedBy: null,
    reviewedAt: null,
    reviewEvidence: { privateNote: "must-not-reach-browser" },
    createdBy: "user-1",
    createdAt: "2026-09-20T12:00:00.000Z",
  };
}

describe("browser PDF artifact lifecycle contract", () => {
  it("exposes only immutable browser-safe artifact metadata", () => {
    const summary = toCaseArtifactSummary(storedArtifact());

    expect(summary).toEqual({
      id: "artifact-1",
      caseId: "case-1",
      runId: "run-1",
      kind: "brandedresume",
      filename: "Synthetic Candidate Resume.pdf",
      contentType: "application/pdf",
      sha256: "c".repeat(64),
      sizeBytes: 12_345,
      revision: 1,
      pageCount: 2,
      visualQaStatus: "pending",
      reviewedAt: null,
      createdAt: "2026-09-20T12:00:00.000Z",
    });
    expect(summary).not.toHaveProperty("storageKey");
    expect(summary).not.toHaveProperty("evidence");
    expect(summary).not.toHaveProperty("reviewEvidence");
    expect(JSON.stringify(summary)).not.toContain("must-not-reach-browser");
  });

  it("exposes a page count only when persisted evidence contains a safe positive integer", () => {
    expect(toCaseArtifactSummary({
      ...storedArtifact(),
      evidence: { persistence: { pageCount: "2" } },
    }).pageCount).toBeNull();
    expect(toCaseArtifactSummary({
      ...storedArtifact(),
      evidence: { persistence: { pageCount: 0 } },
    }).pageCount).toBeNull();
    expect(toCaseArtifactSummary({
      ...storedArtifact(),
      evidence: { persistence: { pageCount: 2.5 } },
    }).pageCount).toBeNull();
  });

  it("requires the exact opened artifact and one explicit seven-check record per PDF page", () => {
    const artifact = toCaseArtifactSummary(storedArtifact());
    const passedPage = (page: number) => ({
      page,
      no_clipping: true,
      no_overlap: true,
      no_orphaned_content: true,
      bullets_intact: true,
      logo_layout_ok: true,
      privacy_ok: true,
      page_breaks_natural: true,
    });
    const draft = {
      openedArtifactId: artifact.id,
      openedArtifactSha256: artifact.sha256,
      pages: [passedPage(1), passedPage(2)],
      notes: "Checked all pages: identity, margins, page breaks, and clipping are correct.",
    };

    expect(() => buildArtifactVisualQaReview(artifact, "passed", {
      ...draft,
      openedArtifactId: "artifact-other",
    })).toThrow("Open this exact PDF");
    expect(() => buildArtifactVisualQaReview(artifact, "passed", {
      ...draft,
      openedArtifactSha256: "d".repeat(64),
    })).toThrow("Open this exact PDF");
    expect(() => buildArtifactVisualQaReview(artifact, "passed", {
      ...draft,
      pages: [passedPage(1)],
    })).toThrow("exactly one visual-QA record per PDF page");
    expect(() => buildArtifactVisualQaReview(artifact, "passed", {
      ...draft,
      pages: [passedPage(1), passedPage(1)],
    })).toThrow("cover every page 1..N exactly once");
    expect(() => buildArtifactVisualQaReview(artifact, "passed", {
      ...draft,
      pages: [passedPage(1), { ...passedPage(2), privacy_ok: null }],
    })).toThrow("Complete all seven visual checks");
    expect(() => buildArtifactVisualQaReview(artifact, "failed", {
      ...draft,
      notes: "   ",
    })).toThrow("written visual-QA evidence");
    expect(() => buildArtifactVisualQaReview(artifact, "failed", draft))
      .toThrow("Failed visual QA requires at least one failed check");
    expect(() => buildArtifactVisualQaReview(artifact, "passed", {
      ...draft,
      pages: [passedPage(1), { ...passedPage(2), no_clipping: false }],
    })).toThrow("Passed visual QA requires every check to pass");

    expect(buildArtifactVisualQaReview(artifact, "passed", draft)).toEqual({
      status: "passed",
      evidence: {
        artifactId: artifact.id,
        artifactSha256: artifact.sha256,
        expected_page_count: 2,
        human_visual_inspection_complete: true,
        pages: draft.pages,
        notes: draft.notes,
      },
    });
    expect(ARTIFACT_VISUAL_QA_CHECKS).toEqual([
      "no_clipping",
      "no_overlap",
      "no_orphaned_content",
      "bullets_intact",
      "logo_layout_ok",
      "privacy_ok",
      "page_breaks_natural",
    ]);
  });

  it("uses an authenticated same-origin inline PDF URL", () => {
    expect(artifactDownloadUrl("case 1", "artifact/1")).toBe(
      "/api/cases/case%201/artifacts/stored/artifact%2F1/download?inline=1",
    );
  });

  it("groups only the persisted PDFs belonging to the displayed run", () => {
    const first = toCaseArtifactSummary(storedArtifact());
    const second = { ...first, id: "artifact-2", runId: "run-2" };

    expect(artifactsForRun([first, second], "run-1")).toEqual([first]);
    expect(formatArtifactBytes(12_345)).toBe("12.1 KB");
    expect(artifactKindLabel(first)).toBe("Branded PDF");
    expect(artifactKindLabel({ ...first, kind: "interview-prep-material" }))
      .toBe("Interview prep PDF");
    expect(artifactKindLabel({ ...first, kind: "complete-reference-check" }))
      .toBe("Reference check PDF");
  });

  it("renders immutable branded-PDF identity and explicit gated QA controls", () => {
    expect(workflowBrowserSource).toContain("artifactKindLabel");
    expect(workflowBrowserSource).toContain("Open PDF");
    expect(workflowBrowserSource).toContain("ARTIFACT_VISUAL_QA_CHECKS");
    for (const check of ARTIFACT_VISUAL_QA_CHECKS) {
      expect(workflowBrowserSource).toContain(check);
    }
    expect(workflowBrowserSource).toContain("Pass visual QA");
    expect(workflowBrowserSource).toContain("Fail visual QA");
    expect(workflowBrowserSource).toContain("buildArtifactVisualQaReview");
    expect(workflowBrowserSource).toContain("artifact.sha256");
    expect(workflowBrowserSource).toContain("await onReviewArtifact");
    expect(workflowBrowserSource).not.toContain("artifact.storageKey");
    expect(workflowBrowserSource).not.toContain("artifact.evidence");
    expect(workflowBrowserSource).not.toContain("artifact.reviewEvidence");
  });

  it("renders pending QA with the authenticated PDF link and locked decisions", () => {
    const artifact = toCaseArtifactSummary(storedArtifact());
    const html = renderToStaticMarkup(createElement(ArtifactReviewCard, {
      artifact,
      activeCaseId: artifact.caseId,
      onReviewArtifact: async () => { throw new Error("not invoked during render"); },
    }));

    expect(html).toContain("Branded PDF");
    expect(html).toContain("Synthetic Candidate Resume.pdf");
    expect(html).toContain("Artifact ID");
    expect(html).toContain(artifact.id);
    expect(html).toContain(artifact.sha256);
    expect(html).toContain("12.1 KB");
    expect(html).toContain("2 pages");
    expect(html).toContain("/api/cases/case-1/artifacts/stored/artifact-1/download?inline=1");
    expect(html).toContain("Open PDF");
    expect(html).toContain("Page 1");
    expect(html).toContain("Page 2");
    expect(html).toContain("No clipping");
    expect(html).toContain("Page breaks natural");
    expect(html).not.toContain("I reviewed every page of this exact PDF");
    expect(html).toMatch(/disabled=""[^>]*>.*Pass visual QA/);
    expect(html).toMatch(/disabled=""[^>]*>.*Fail visual QA/);
    expect(html).not.toContain("private-storage-key");
    expect(html).not.toContain("must-not-reach-browser");
  });
});
