import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CANDIDATE_SOURCE_KIND_OPTIONS,
  JOB_SOURCE_KIND_OPTIONS,
  SourceTypeCorrectionControls,
} from "../components/workstation/recruiter-workstation";
import { workstationApi } from "../lib/api-client";
import type { CaseSource } from "../lib/workstation-types";

const source: CaseSource = {
  id: "source-1",
  kind: "resume",
  filename: "JD Smith Resume.pdf",
  contentType: "application/pdf",
  sizeBytes: 1024,
  sha256: "a".repeat(64),
  captureTime: "2026-09-21T01:00:00.000Z",
  lifecycleStatus: "classified",
  reviewStatus: "unreviewed",
  parsedText: "Experience\nEducation\nSkills",
  classificationMethod: "content",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("source type correction controls", () => {
  it("allows uncertain sources to remain truthfully Other instead of forcing a false classification", () => {
    expect(CANDIDATE_SOURCE_KIND_OPTIONS).toEqual([
      "resume", "transcript", "job_description", "call_notes", "pasted_text", "other",
    ]);
    expect(JOB_SOURCE_KIND_OPTIONS).toEqual(["job_description", "call_notes", "pasted_text", "other"]);
  });

  it("renders an explicit Edit type entry point for readable automatic classifications", () => {
    const html = renderToStaticMarkup(createElement(SourceTypeCorrectionControls, {
      source,
      editing: false,
      selectedKind: source.kind,
      options: ["resume", "transcript", "job_description", "call_notes"],
      busy: false,
      onEdit: vi.fn(),
      onKindChange: vi.fn(),
      onSave: vi.fn(),
      onCancel: vi.fn(),
    }));

    expect(html).toContain("Edit type");
    expect(html).toContain("Edit type for JD Smith Resume.pdf");
    expect(html).not.toContain("<select");
  });

  it("renders the selected type with separate Save and Cancel actions while editing", () => {
    const html = renderToStaticMarkup(createElement(SourceTypeCorrectionControls, {
      source,
      editing: true,
      selectedKind: "call_notes",
      options: ["resume", "transcript", "job_description", "call_notes"],
      busy: false,
      onEdit: vi.fn(),
      onKindChange: vi.fn(),
      onSave: vi.fn(),
      onCancel: vi.fn(),
    }));

    expect(html).toContain("Source type for JD Smith Resume.pdf");
    expect(html).toContain('value="call_notes" selected=""');
    expect(html).toContain("Save type for JD Smith Resume.pdf");
    expect(html).toContain("Cancel type edit for JD Smith Resume.pdf");
  });

  it("sends corrected candidate and Job kinds through the persisted review routes", async () => {
    const fetchMock = vi.fn(async () => Response.json([]));
    vi.stubGlobal("fetch", fetchMock);

    await workstationApi.reviewSource("case-1", "source-1", "call_notes");
    await workstationApi.reviewJobSource("role-1", "source-2", "job_description");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/cases/case-1/sources/source-1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ lifecycleStatus: "reviewed", kind: "call_notes" }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/roles/role-1/sources/source-2", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ lifecycleStatus: "reviewed", kind: "job_description" }),
    }));
  });
});
