import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ResumeFormEditor,
  ResumeFormPreview,
} from "../components/workstation/resume-form";
import { emptyResumeForm } from "../lib/resume-form";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

function rule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1] ?? "";
}

const resume = {
  ...emptyResumeForm(),
  name: "Synthetic Candidate",
  headline: "Maintenance Supervisor",
  summary: "Source-grounded synthetic summary.",
  skills: "CMMS\nPreventive maintenance\nRoot cause analysis\nSafety coordination",
  jobs: [{
    title: "Maintenance Supervisor",
    company: "Example Manufacturing",
    location: "Toronto, ON",
    dates: "2020 - Present",
    bullets: "Reduced synthetic downtime by **12%**.\nLed planned maintenance.",
  }],
  education: "**Diploma, Mechanical Technology** - Example College",
  sections: [{ heading: "Licences", items: "Synthetic licence" }],
};

describe("A-style editable resume canvas", () => {
  it("renders the complete branded hierarchy in the reusable preview", () => {
    const html = renderToStaticMarkup(createElement(ResumeFormPreview, { value: resume }));

    expect(html).toContain('src="/tttg-logo.png"');
    expect(html).toContain("Synthetic Candidate");
    expect(html).toContain("Maintenance Supervisor");
    expect(html).toContain(">Summary<");
    expect(html).toContain("Core Skills");
    expect(html).toContain("Professional Experience");
    expect(html).toContain("Education &amp; Certifications");
    expect(html).toContain("Licences");
    expect(html).toContain("<strong>12%</strong>");
    expect(html).toContain("<strong>Diploma, Mechanical Technology</strong>");
  });

  it("keeps the existing editor fields and add-remove controls on the page canvas", () => {
    const html = renderToStaticMarkup(createElement(ResumeFormEditor, {
      value: resume,
      onChange: vi.fn(),
    }));

    for (const label of [
      "Name",
      "Title (one current title)",
      "Summary",
      "Core skills, one per line",
      "Professional experience, most recent first",
      "Job title",
      "Dates",
      "Company",
      "Location",
      "Bullets, one per line",
      "Education heading (blank = Education & Certifications)",
      "Education and certifications, one per line",
      "Other sections from the original resume",
      "Heading",
      "Lines, one per line",
    ]) expect(html).toContain(label.replace("&", "&amp;"));
    for (const action of ["Remove job", "Add job", "Remove section", "Add section"]) {
      expect(html).toContain(action);
    }
  });

  it("locks the visual contract to Letter, Arial, centered logo and two-column skills", () => {
    expect(rule(".resume-paper")).toMatch(/width:\s*min\(100%,\s*8\.5in\)/);
    expect(rule(".resume-paper")).toMatch(/min-height:\s*11in/);
    expect(rule(".resume-paper")).toMatch(/font-family:\s*Arial,\s*Helvetica,\s*sans-serif/);
    expect(rule(".resume-paper")).toMatch(/color:\s*#000/);
    expect(rule(".resume-logo")).toMatch(/margin:\s*0 auto 10px/);
    expect(rule(".resume-section-heading, .resume-section-title-field")).toMatch(/border-bottom:\s*1\.2px solid #000/);
    expect(rule(".resume-skills-grid")).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  });
});
