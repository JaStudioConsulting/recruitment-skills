import { describe, expect, it } from "vitest";

import {
  canReviewSource,
  inspectSourceContent,
  normalizeSourceLifecycleStatus,
} from "../lib/server/source-intake";

function bytes(value: string) {
  return new TextEncoder().encode(value).buffer as ArrayBuffer;
}

describe("source intake", () => {
  it("parses and classifies a clearly named plain-text resume", () => {
    expect(inspectSourceContent({
      bytes: bytes("Professional Experience\nPlant Manager\nEducation\nSkills"),
      contentType: "text/plain",
      filename: "Jane Doe Resume.txt",
    })).toEqual({
      kind: "resume",
      lifecycleStatus: "classified",
      parsedText: "Professional Experience\nPlant Manager\nEducation\nSkills",
      classificationMethod: "filename",
    });
  });

  it("uses content signals when the filename is inconclusive", () => {
    const result = inspectSourceContent({
      bytes: bytes("JOB DESCRIPTION\nResponsibilities\nQualifications\nRequirements"),
      contentType: "text/markdown",
      filename: "source-1.md",
    });
    expect(result).toMatchObject({
      kind: "job_description",
      lifecycleStatus: "classified",
      classificationMethod: "content",
    });
  });

  it("keeps ambiguous parsed text visible for human classification", () => {
    expect(inspectSourceContent({
      bytes: bytes("Met the candidate and discussed the opportunity."),
      contentType: "text/plain",
      filename: "source.txt",
    })).toEqual({
      kind: "other",
      lifecycleStatus: "parsed",
      parsedText: "Met the candidate and discussed the opportunity.",
      classificationMethod: "uncertain",
    });
  });

  it("does not claim that a PDF was parsed without a PDF parser", () => {
    expect(inspectSourceContent({
      bytes: bytes("not actually parsed"),
      contentType: "application/pdf",
      filename: "Jane Doe Resume.pdf",
    })).toEqual({
      kind: "resume",
      lifecycleStatus: "uploaded",
      parsedText: null,
      classificationMethod: "filename",
    });
  });

  it("honours an explicit canonical source kind for parsed text", () => {
    expect(inspectSourceContent({
      bytes: bytes("Compensation: $100,000\nStart date: October 1"),
      contentType: "text/plain",
      filename: "notes.txt",
      requestedKind: "call_notes",
    })).toMatchObject({
      kind: "call_notes",
      lifecycleStatus: "classified",
      classificationMethod: "explicit",
    });
  });

  it("normalizes legacy or unknown database statuses to uploaded", () => {
    expect(normalizeSourceLifecycleStatus("unreviewed")).toBe("uploaded");
    expect(normalizeSourceLifecycleStatus("unexpected")).toBe("uploaded");
    expect(normalizeSourceLifecycleStatus("classified")).toBe("classified");
  });

  it("allows human classification and review together only after parsing", () => {
    expect(canReviewSource("parsed", "call_notes")).toBe(true);
    expect(canReviewSource("parsed")).toBe(false);
    expect(canReviewSource("classified")).toBe(true);
    expect(canReviewSource("uploaded", "resume")).toBe(false);
  });
});
