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
    expect(handwriting).toContain('import("js-draw")');
    expect(handwriting).toContain("loadFromSVG");
    expect(handwriting).toContain("toSVG");
    expect(handwriting).toContain("BackgroundComponentBackgroundType.SolidColor");
    expect(handwriting).toContain("autoresize: true");
    expect(workstation).toContain('aria-label="Notes input mode"');
    expect(workstation).toContain('aria-label={notesFocused ? "Show resume panel" : "Hide resume panel"}');
    expect(rule(".desk-grid.notes-focus")).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(rule(".desk-grid.notes-focus .document-pane")).toMatch(/display:\s*none/);
  });

  it("supports stacked portrait and split landscape tablet layouts", () => {
    expect(css).toMatch(/@media \(max-width: 1050px\)[\s\S]*?\.desk-grid\s*\{[^}]*grid-template-columns:\s*1fr[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/@media \(min-width: 820px\) and \(max-width: 1050px\) and \(orientation: landscape\)[\s\S]*?\.desk-grid\s*\{[^}]*grid-template-columns:[^}]*minmax\(390px,[^}]*minmax\(300px,[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/@media \(min-width: 820px\) and \(max-width: 1050px\) and \(orientation: landscape\)[\s\S]*?\.notes-pane, \.document-pane\s*\{[^}]*min-height:\s*0/);
  });

  it("uses Job folders, automatic intake, and one package action", () => {
    expect(workstation).toContain('label="Job folder"');
    expect(workstation).toContain("Job knowledge");
    expect(workstation).toContain("Paste JD");
    expect(workstation).toContain("Drop a Job description");
    expect(workstation).toContain("Paste the whole JD");
    expect(workstation).toContain("proposePastedSource");
    expect(workstation).toContain("Complete Job identity detected");
    expect(workstation).not.toContain("pastedSourceTitle");
    expect(workstation).not.toContain("This creates an internal workstation record only");
    expect(workstation).toContain("Save the role and company for reusable Job context.");
    expect(workstation).toContain("Save the candidate for use across recruiter workflows.");
    expect(workstation).toContain("Files are parsed and classified automatically");
    expect(workstation).toContain("Create after-call package");
    expect(workstation).toContain("WorkflowBrowser");
    expect(workstation).not.toContain("CapabilityEngine");
    expect(workstation).toContain('onClick={() => void executeCapability("write-up")}');
    expect(workstation).toContain("activeCaseAvailable={Boolean(activeCase)}");
    expect(workstation).toContain("onExecute={executeCapability}");
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
    expect(workstation).toContain("Read-only preview");
    expect(workstation).toContain("Save changes");
    expect(workstation).toContain("Cancel");
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
    expect(rule(".source-first-job-intake")).toMatch(/display:\s*flex/);
    expect(rule(".source-first-job-drop")).toMatch(/border:\s*1px dashed/);
    expect(rule(".paste-kind-review")).toMatch(/display:\s*grid/);
  });

  it("lets narrow mobile pages scroll without losing bounded editors", () => {
    expect(css).toMatch(/@media \(max-width: 680px\)[\s\S]*?\.workstation-shell\s*\{[^}]*height:\s*auto[^}]*overflow:\s*visible/);
    expect(css).toMatch(/@media \(max-width: 680px\)[\s\S]*?\.desk-grid\s*\{[^}]*flex:\s*0 0 auto[^}]*overflow:\s*visible/);
    expect(css).toMatch(/@media \(max-width: 680px\)[\s\S]*?\.document-pane\s*\{[^}]*height:\s*min\(78dvh, 680px\)[^}]*min-height:\s*520px/);
  });
});
