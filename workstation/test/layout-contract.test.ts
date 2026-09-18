import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

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

  it("keeps document content independently scrollable", () => {
    expect(rule(".document-tabs")).toMatch(/overflow:\s*hidden/);
    expect(rule(".document-scroll")).toMatch(/overflow-y:\s*auto/);
    expect(rule(".document-scroll")).toMatch(/overscroll-behavior:\s*contain/);
  });

  it("keeps the primary actions pinned above the safe area", () => {
    expect(rule(".action-bar")).toMatch(/position:\s*sticky/);
    expect(rule(".action-bar")).toMatch(/bottom:\s*0/);
    expect(rule(".action-bar")).toMatch(/safe-area-inset-bottom/);
  });

  it("supports stacked portrait and split landscape tablet layouts", () => {
    expect(css).toMatch(/@media \(max-width: 1050px\)[\s\S]*?\.desk-grid\s*\{[^}]*grid-template-columns:\s*1fr[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/@media \(min-width: 820px\) and \(max-width: 1050px\) and \(orientation: landscape\)[\s\S]*?\.desk-grid\s*\{[^}]*grid-template-columns:[^}]*minmax\(280px,[^}]*minmax\(430px,[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/@media \(min-width: 820px\) and \(max-width: 1050px\) and \(orientation: landscape\)[\s\S]*?\.notes-pane, \.document-pane\s*\{[^}]*min-height:\s*0/);
  });

  it("lets narrow mobile pages scroll without losing bounded editors", () => {
    expect(css).toMatch(/@media \(max-width: 680px\)[\s\S]*?\.workstation-shell\s*\{[^}]*height:\s*auto[^}]*overflow:\s*visible/);
    expect(css).toMatch(/@media \(max-width: 680px\)[\s\S]*?\.desk-grid\s*\{[^}]*flex:\s*0 0 auto[^}]*overflow:\s*visible/);
    expect(css).toMatch(/@media \(max-width: 680px\)[\s\S]*?\.document-pane\s*\{[^}]*height:\s*min\(78dvh, 680px\)[^}]*min-height:\s*520px/);
  });
});
