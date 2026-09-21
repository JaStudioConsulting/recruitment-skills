import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CapabilityDetail } from "../components/workstation/workflow-browser";
import { capabilityById } from "../lib/capabilities/registry";

describe("workflow execution feedback", () => {
  it("renders a blocked preparation error beside the workflow execute control", () => {
    const item = capabilityById("write-up");
    expect(item).toBeDefined();

    const html = renderToStaticMarkup(createElement(CapabilityDetail, {
      item: item!,
      activeCaseAvailable: true,
      runs: [],
      runsLoading: false,
      runsError: "",
      artifacts: [],
      artifactsLoading: false,
      artifactsError: "",
      executionFeedback: {
        caseId: "case-1",
        capabilityId: "write-up",
        message: "Workflow not run: Human review required before drafting.",
        error: true,
      },
      activeCaseId: "case-1",
      onReviewArtifact: vi.fn(),
      executing: false,
      inputValues: {},
      onInputChange: vi.fn(),
      onExecute: vi.fn(),
    }));

    expect(html).toContain('aria-label="Workflow execution"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Workflow not run: Human review required before drafting.");
  });
});
