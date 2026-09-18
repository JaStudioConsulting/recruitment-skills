import { describe, expect, it } from "vitest";

import {
  extractResumeHeadline,
  extractResumeLocation,
  extractResumeSummary,
  prefillSubmissionFromResume,
} from "../lib/submission-prefill";
import { EMPTY_SUBMISSION } from "../lib/workstation-types";

const candidate = {
  id: "candidate-1",
  name: "Alex Morgan",
  currentTitle: "Maintenance Manager",
};

const clearResume = `
ALEX MORGAN
Maintenance Manager
Toronto, ON
alex@example.com

PROFESSIONAL SUMMARY
Hands-on maintenance leader in food manufacturing.
Builds preventive maintenance programs and develops technicians.

PROFESSIONAL EXPERIENCE
Plant Manager
North Plant — Hamilton, ON
`;

describe("resume submission prefill", () => {
  it("fills only obvious blank fields from an explicitly matching resume", () => {
    const result = prefillSubmissionFromResume({
      current: { ...EMPTY_SUBMISSION },
      candidate,
      parsedText: clearResume,
    });

    expect(result.filledFields).toEqual(["name", "title", "location", "profileSummary"]);
    expect(result.document).toMatchObject({
      name: "Alex Morgan",
      title: "Maintenance Manager",
      location: "Toronto, ON",
      profileSummary: "Hands-on maintenance leader in food manufacturing.\nBuilds preventive maintenance programs and develops technicians.",
    });
    expect(result.document.compensationTarget).toBe("");
    expect(result.document.currentCompensation).toBe("");
    expect(result.document.vacation).toBe("");
    expect(result.document.workStatus).toBe("");
    expect(result.document.interviewAvailability).toBe("");
    expect(result.document.startDateNotice).toBe("");
    expect(result.document.reasonForLeaving).toBe("");
  });

  it("never overwrites recruiter-entered values or fills call-only facts", () => {
    const current = {
      ...EMPTY_SUBMISSION,
      title: "Recruiter-approved title",
      location: "Hamilton, ON",
      profileSummary: "Recruiter-approved summary.",
    };
    const result = prefillSubmissionFromResume({
      current,
      candidate,
      parsedText: `${clearResume}\nCanadian Citizen | Available immediately | Expected salary $120,000`,
    });

    expect(result.filledFields).toEqual(["name"]);
    expect(result.document).toMatchObject({
      ...current,
      name: "Alex Morgan",
    });
    expect(result.document.workStatus).toBe("");
    expect(result.document.startDateNotice).toBe("");
    expect(result.document.compensationTarget).toBe("");
  });

  it("fails closed when the resume header does not match the selected candidate", () => {
    const result = prefillSubmissionFromResume({
      current: { ...EMPTY_SUBMISSION },
      candidate,
      parsedText: clearResume.replace("ALEX MORGAN", "JORDAN LEE"),
    });

    expect(result.filledFields).toEqual([]);
    expect(result.document).toEqual(EMPTY_SUBMISSION);
  });

  it("does not mistake employer or school locations for the candidate location", () => {
    const text = `ALEX MORGAN\nMaintenance Manager\nPROFESSIONAL EXPERIENCE\nNorth Plant\nHamilton, ON\nEDUCATION\nVancouver, BC`;
    expect(extractResumeLocation(text)).toBe("");
  });

  it("uses an adjacent resume headline only when the saved current title is blank", () => {
    expect(extractResumeHeadline(clearResume, "Alex Morgan")).toBe("Maintenance Manager");
    const result = prefillSubmissionFromResume({
      current: { ...EMPTY_SUBMISSION },
      candidate: { ...candidate, currentTitle: null },
      parsedText: clearResume,
    });
    expect(result.document.title).toBe("Maintenance Manager");
  });

  it("copies only the explicit summary section through the next heading", () => {
    expect(extractResumeSummary(clearResume)).toBe(
      "Hands-on maintenance leader in food manufacturing.\nBuilds preventive maintenance programs and develops technicians.",
    );
  });
});
