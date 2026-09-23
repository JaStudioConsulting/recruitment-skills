import { describe, expect, it } from "vitest";

import {
  RESUME_FORM_FORMAT,
  emptyResumeForm,
  isResumeForm,
  resumeFormHasContent,
  resumeFormToCandidate,
  toResumeForm,
} from "../lib/resume-form";

// Synthetic candidate only.
function filled() {
  return {
    ...emptyResumeForm(),
    name: "  Sample Person ",
    headline: "Plant Manager",
    summary: "Runs two plants.",
    skills: "Lean Manufacturing\n\n  OEE  \nRoot Cause Analysis\nKaizen\n",
    jobs: [
      { title: "Plant Manager", company: "Example Fabrication", location: "Hamilton, ON", dates: "Mar-2019 - Present", bullets: "Cut scrap **22%**.\n\nLed **40** people." },
      { title: "", company: "", location: "", dates: "", bullets: "" },
    ],
    education: "**Diploma, Mechanical Technology** - Example College\n",
    sections: [
      { heading: "Licenses", items: "**309A**\n" },
      { heading: "", items: "" },
    ],
  };
}

describe("TTTG resume form", () => {
  it("converts to the candidate.json shape the builder expects", () => {
    expect(resumeFormToCandidate(filled())).toEqual({
      name: "Sample Person",
      headline: "Plant Manager",
      summary: "Runs two plants.",
      skills: ["Lean Manufacturing", "OEE", "Root Cause Analysis", "Kaizen"],
      experience: [{
        title: "Plant Manager",
        company: "Example Fabrication",
        location: "Hamilton, ON",
        dates: "Mar-2019 - Present",
        bullets: ["Cut scrap **22%**.", "Led **40** people."],
      }],
      education: ["**Diploma, Mechanical Technology** - Example College"],
      sections: [{ heading: "Licenses", items: ["**309A**"] }],
    });
  });

  it("drops blank jobs and sections but never drops typed content", () => {
    const candidate = resumeFormToCandidate(filled());
    expect(candidate.experience).toHaveLength(1);
    expect(candidate.sections).toHaveLength(1);
  });

  it("sends a custom education heading only when one is typed", () => {
    expect(resumeFormToCandidate(filled())).not.toHaveProperty("education_heading");
    expect(resumeFormToCandidate({ ...filled(), educationHeading: "Education" }).education_heading).toBe("Education");
  });

  it("treats a form with only a name as having no resume content", () => {
    expect(resumeFormHasContent({ ...emptyResumeForm(), name: "Sample Person" })).toBe(false);
    expect(resumeFormHasContent(filled())).toBe(true);
  });

  it("opens a legacy editor document or empty content as a blank form", () => {
    expect(toResumeForm({ time: 0, version: "2.31.0", blocks: [] })).toEqual(emptyResumeForm());
    expect(toResumeForm(undefined)).toEqual(emptyResumeForm());
    expect(toResumeForm("")).toEqual(emptyResumeForm());
  });

  it("round-trips a saved form exactly", () => {
    const saved = JSON.parse(JSON.stringify(filled()));
    expect(isResumeForm(saved)).toBe(true);
    expect(toResumeForm(saved)).toEqual(filled());
    expect(saved.format).toBe(RESUME_FORM_FORMAT);
  });

  it("rejects malformed discriminator-only forms while keeping them recoverable in the editor", () => {
    const malformed = { format: RESUME_FORM_FORMAT, reviewed: true, name: "Sample Person" };
    expect(isResumeForm(malformed)).toBe(false);
    expect(isResumeForm({ ...filled(), jobs: "not-an-array" })).toBe(false);
    expect(isResumeForm({ ...filled(), sections: "not-an-array" })).toBe(false);
    expect(isResumeForm({ ...filled(), jobs: [{ ...filled().jobs[0], bullets: 7 }] })).toBe(false);
    expect(isResumeForm({ ...filled(), sections: [{ heading: "Licenses", items: false }] })).toBe(false);
    expect(toResumeForm(malformed)).toEqual({
      ...emptyResumeForm(),
      reviewed: true,
      name: "Sample Person",
      jobs: [],
    });
  });
});
