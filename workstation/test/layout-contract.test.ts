import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const workstation = await readFile(new URL("../components/workstation/recruiter-workstation.tsx", import.meta.url), "utf8");
const workflowBrowser = await readFile(new URL("../components/workstation/workflow-browser.tsx", import.meta.url), "utf8");
const handwriting = await readFile(new URL("../components/workstation/handwriting-canvas.tsx", import.meta.url), "utf8");

function rule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1] ?? "";
}

describe("bounded recruiter workstation layout", () => {
  it("bounds the shell and desk to the viewport", () => {
    expect(rule(".workstation-shell")).toMatch(/height:\s*100dvh/);
    expect(rule(".workstation-shell")).toMatch(/overflow:\s*hidden/);
    expect(rule(".desk-grid")).toMatch(/min-height:\s*0/);
    expect(rule(".desk-grid")).toMatch(/flex:\s*1 1 0/);
    expect(rule(".desk-grid")).toMatch(/overflow:\s*hidden/);
  });

  it("keeps the source resume independently scrollable", () => {
    expect(rule(".resume-source-scroll")).toMatch(/overflow:\s*auto/);
    expect(rule(".resume-source-scroll")).toMatch(/overscroll-behavior:\s*contain/);
    expect(rule(".resume-source-frame")).toMatch(/flex:\s*1 1 0/);
  });

  it("keeps the primary actions pinned above the safe area", () => {
    expect(rule(".action-bar")).toMatch(/position:\s*sticky/);
    expect(rule(".action-bar")).toMatch(/bottom:\s*0/);
    expect(rule(".action-bar")).toMatch(/safe-area-inset-bottom/);
  });

  it("supports persistent drawing notes and a resume-collapse focus view", () => {
    const colorisStyles = '@import "@melloware/coloris/dist/coloris.css";';
    const editorStyles = '@import "js-draw/Editor.css";';
    expect(css).toContain(colorisStyles);
    expect(css.indexOf(colorisStyles)).toBeLessThan(css.indexOf(editorStyles));
    expect(handwriting).toContain('import("js-draw")');
    expect(handwriting).toContain("loadFromSVG");
    expect(handwriting).toContain("toSVG");
    expect(handwriting).toContain("BackgroundComponentBackgroundType.SolidColor");
    expect(handwriting).toContain("autoresize: true");
    expect(workstation).toContain('aria-label="Notes input mode"');
    expect(workstation).toContain('aria-label={notesFocused ? "Show resume panel" : "Hide resume panel"}');
    expect(rule(".desk-grid.notes-focus")).toMatch(/grid-template-columns:\s*238px\s+minmax\(0,\s*1fr\)/);
    expect(rule(".desk-grid.notes-focus .document-pane")).toMatch(/display:\s*none/);
  });

  it("labels the source editor and keeps keyboard resizing from scrolling the page", () => {
    expect(workstation).toContain('aria-label={pasteScope === "job" ? "Job source text" : "Candidate source text"}');
    expect(workstation).toMatch(/event\.key === "ArrowLeft"\) \{ event\.preventDefault\(\); setSplitRatio/);
    expect(workstation).toMatch(/event\.key === "ArrowRight"\) \{ event\.preventDefault\(\); setSplitRatio/);
  });

  it("uses the Email tab as the only presentation-email heading", () => {
    expect(workstation).toContain('{kind === "email" ? <pre>');
    expect(workstation).not.toContain("Presentation email");
    expect(workstation).toContain("Loxo update bullets");
    expect(workstation).toContain('aria-label={`Edit ${kind}`}');
  });

  it("supports stacked portrait and split landscape tablet layouts", () => {
    expect(css).toMatch(/@media \(max-width: 1050px\)[\s\S]*?\.desk-grid\s*\{[^}]*grid-template-columns:\s*210px\s+minmax\(0,\s*1fr\)[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/@media \(min-width: 820px\) and \(max-width: 1050px\) and \(orientation: landscape\)[\s\S]*?\.desk-grid\s*\{[^}]*grid-template-columns:[^}]*200px[^}]*minmax\(300px,[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/@media \(min-width: 820px\) and \(max-width: 1050px\) and \(orientation: landscape\)[\s\S]*?\.notes-pane, \.document-pane\s*\{[^}]*min-height:\s*0/);
  });

  it("uses a project-like Job shell, one source composer, and one package action", () => {
    expect(workstation).toContain('id="job-project-select"');
    expect(workstation).toContain('aria-label="Job options"');
    expect(workstation).toContain("Add files or paste text");
    expect(workstation).toContain("Add sources");
    expect(workstation).toContain("Drag sources here");
    expect(workstation).toContain("Text input");
    expect(workstation).toContain('role="tab" aria-selected={workspaceView === "work"}');
    expect(workstation).toContain('role="tab" aria-selected={workspaceView === "sources"}');
    expect(workstation).toContain("New Job from source");
    expect(workstation).not.toContain("Paste JD");
    expect(workstation).not.toContain(">Paste text</Button>");
    expect(workstation).not.toContain("One workspace. From conversation to submission.");
    expect(workstation).not.toContain('className="job-breadcrumb"');
    expect(workstation).not.toContain('className="job-source-chip"');
    expect(workstation).not.toContain('className="brand-actions"');
    expect(workstation).not.toContain('className="after-call-progress"');
    expect(workstation).not.toContain('className="output-version-row"');
    expect(workstation).toContain("proposePastedSource");
    expect(workstation).toContain("Complete Job identity detected");
    expect(workstation).toContain("Candidate identity found — review before saving");
    expect(workstation).toContain("workstationApi.intakeCandidateResume");
    expect(workstation).not.toContain("resolveCandidateCase");
    expect(workstation).toContain("Candidate for source");
    expect(workstation).toContain("current.some((role) => role.id === created.id) ? current : [created, ...current]");
    expect(workstation).not.toContain("pastedSourceTitle");
    expect(workstation).not.toContain("This creates an internal workstation record only");
    expect(workstation).toContain("Save the role and company for reusable Job context.");
    expect(workstation).toContain("Save the candidate for use across recruiter workflows.");
    expect(workstation).toContain("Create after-call package");
    expect(workstation).toContain("WorkflowBrowser");
    expect(workstation).not.toContain("CapabilityEngine");
    expect(workstation).toContain('onClick={() => void executeCapability("write-up")}');
    expect(workstation).toContain("activeCaseAvailable={Boolean(activeCase)}");
    expect(workstation).toContain('onExecute={(capabilityId, extraInput) => executeCapability(capabilityId, extraInput, "workflow")}');
    expect(workstation).toContain("workstationApi.prepareCapability");
    expect(workstation).toContain("workstationApi.executeCapabilityRun");
    expect(workstation).toContain("workstationApi.listCapabilityRuns");
    expect(workflowBrowser).toContain("feature.mounted");
    expect(workflowBrowser).toContain("activeCaseAvailable");
    expect(workflowBrowser).toContain("disabled={!activeCaseAvailable || executing}");
    expect(workflowBrowser).toContain("{mountedExecutor ?");
    expect(workflowBrowser).toContain("serializeCapabilityInputs(selectedInputValues)");
    expect(workflowBrowser).toContain("await onExecute(");
    expect(workstation).not.toContain("createAfterCallPackage");
    expect(workstation).not.toContain("createAutofilledDraft");
    expect(workstation).toContain("Workflows");
    expect(workstation).toContain('aria-label="Output history"');
    expect(workstation).toContain("Save changes");
    expect(workstation).toContain("Cancel");
    expect(workstation).toContain("SourceTypeCorrectionControls");
    expect(workstation).toContain("Edit type");
    expect(workstation).toContain("Save type for");
    expect(workstation).toContain("Cancel type edit for");
    expect(workstation).toContain("CANDIDATE_SOURCE_KIND_OPTIONS.map");
    expect(workstation).toContain("JOB_SOURCE_KIND_OPTIONS.map");
    expect(workstation).toContain("sourceReviewKinds[source.id] || source.kind");
    expect(workstation).toContain('origin: "edited"');
    expect(workflowBrowser).toContain("Saved runs");
    expect(workflowBrowser).toContain("summarizeRunEvidence");
    expect(workflowBrowser).toContain("run.id");
    expect(workflowBrowser).toContain("run.status");
    expect(workflowBrowser).toContain("run.updatedAt");
    expect(workstation).toContain("Needs confirmation");
    expect(workstation).not.toContain("Create after-call drafts");
    expect(workstation).not.toContain("Vet candidate");
    expect(workstation).not.toContain("All features");
    expect(workstation).not.toContain("tttg-ai-provider");
    expect(workstation).not.toContain("AI drafting needs");
    expect(rule(".source-composer")).toMatch(/display:\s*flex/);
    expect(rule(".add-sources-dropzone")).toMatch(/border:\s*1px dashed/);
    expect(rule(".paste-kind-review")).toMatch(/display:\s*grid/);
  });

  it("lets narrow mobile pages scroll without losing bounded editors", () => {
    expect(css).toMatch(/@media \(max-width: 680px\)[\s\S]*?\.workstation-shell\s*\{[^}]*height:\s*auto[^}]*overflow:\s*visible/);
    expect(css).toMatch(/@media \(max-width: 680px\)[\s\S]*?\.desk-grid\s*\{[^}]*flex:\s*0 0 auto[^}]*overflow:\s*visible/);
    expect(css).toMatch(/@media \(max-width: 680px\)[\s\S]*?\.document-pane\s*\{[^}]*height:\s*min\(78dvh, 680px\)[^}]*min-height:\s*520px/);
  });
});
