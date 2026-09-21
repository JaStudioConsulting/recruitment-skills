import { describe, expect, it } from "vitest";

import { executeWriteUp } from "../lib/server/capability-executors/write-up";
import type {
  CandidateCase,
  CandidateRecord,
  CaseSource,
  RoleRecord,
  SourceKind,
} from "../lib/workstation-types";

const RESUME_TEXT = `Alex Example
Maintenance Manager
alex@example.invalid | 416-555-0100 | https://linkedin.com/in/alex-example

PROFESSIONAL SUMMARY
Maintenance leader with explicit experience planning preventive work in a synthetic manufacturing setting.

CORE SKILLS
Preventive Maintenance, CMMS, Team Leadership, Safety

PROFESSIONAL EXPERIENCE
Maintenance Manager
Example Components | Toronto, ON
Jan 2020 - Present
- Led maintenance planning for synthetic production equipment.
- Coordinated preventive work with operations.

EDUCATION
Diploma, Mechanical Technology - Example College`;

function source(id: string, kind: SourceKind, parsedText: string): CaseSource {
  return {
    id,
    kind,
    filename: `${id}.txt`,
    contentType: "text/plain",
    sizeBytes: parsedText.length,
    sha256: `sha-${id}`,
    captureTime: "2026-09-20T00:00:00.000Z",
    lifecycleStatus: "reviewed",
    reviewStatus: "reviewed",
    parsedText,
    classificationMethod: "manual",
  };
}

function candidateCase(input: {
  sources?: CaseSource[];
  notes?: string;
  revision?: number;
} = {}): CandidateCase {
  return {
    id: "case-1",
    roleId: "role-1",
    candidateId: "candidate-1",
    status: "active",
    notes: input.notes ?? "",
    notesDrawingSvg: "",
    notesFont: "System",
    notesSize: 20,
    revision: input.revision ?? 7,
    facts: [],
    assistant: { missing: [], askNext: [], fitConcern: "", nextAction: "" },
    externalRefs: {},
    documents: {} as CandidateCase["documents"],
    sources: input.sources ?? [],
    updatedAt: "2026-09-20T01:00:00.000Z",
  };
}

const JD_TEXT = `Job Title: Maintenance Manager
Client: Synthetic Manufacturing
Location: Toronto, ON`;

const CALL_TEXT = `Compensation Target: $120,000
Current Compensation: $108,000
Vacation: Three weeks
Location: Hamilton, ON
Work Status: Canadian citizen
Interview Availability: Tuesday afternoon
Notice Period: Three weeks
Reason for Leaving: Plant closure`;

const ROLE: RoleRecord = {
  id: "role-1",
  title: "Maintenance Manager",
  client: "Synthetic Manufacturing",
  status: "active",
};

const CANDIDATE: CandidateRecord = {
  id: "candidate-1",
  name: "Alex Example",
  currentTitle: "Maintenance Manager",
};

describe("deterministic write-up executor", () => {
  it("returns a source-grounded draft-ready bundle without claiming canonical completion", () => {
    const result = executeWriteUp({
      mergedCase: candidateCase({
        sources: [
          source("resume", "resume", RESUME_TEXT),
          source("jd", "job_description", JD_TEXT),
          source("call", "transcript", CALL_TEXT),
        ],
      }),
      sourceRefs: ["resume:sha-resume", "call:sha-call", "jd:sha-jd"],
      role: ROLE,
      candidate: CANDIDATE,
      now: "2026-09-20T02:00:00.000Z",
    });

    expect(result).toMatchObject({
      status: "draft_ready",
      capabilityId: "write-up",
      executorId: "write-up-candidate",
      bundle: {
        resume: {
          name: "Alex Example",
          headline: "Maintenance Manager",
          jobs: [expect.objectContaining({ company: "Example Components", dates: "Jan-2020 - Present" })],
        },
        submission: {
          name: "Alex Example",
          title: "Maintenance Manager",
          compensationTarget: "$120,000",
          currentCompensation: "$108,000",
          vacation: "Three weeks",
          location: "Hamilton, ON",
          workStatus: "Canadian citizen",
          interviewAvailability: "Tuesday afternoon",
          startDateNotice: "Three weeks",
          reasonForLeaving: "Plant closure",
        },
        emailSubject: "New Candidate Submission - Maintenance Manager - Alex Example - Synthetic Manufacturing - Hamilton, ON",
        sourceRefs: ["call:sha-call", "jd:sha-jd", "resume:sha-resume"],
      },
      canonicalIncomplete: {
        brandedPdfBuilt: false,
        visualQaPassed: false,
        gmailDraftCreated: false,
        gmailAttachmentVerified: false,
        gmailDraftReadbackVerified: false,
        emailSent: false,
        loxoWritten: false,
        loxoReadbackVerified: false,
        canonicalPackageCompleted: false,
      },
    });
    expect(result.bundle.presentationEmailText).toContain("currently with Example Components");
    expect(result.bundle.presentationEmailText).toContain("Compensation Target: $120,000");
    expect(result.bundle.presentationEmailText.indexOf("Location: Hamilton, ON"))
      .toBeLessThan(result.bundle.presentationEmailText.indexOf("Compensation Target: $120,000"));
    expect(result.bundle.presentationEmailText.endsWith("CV attached.")).toBe(true);
    expect(result.bundle.presentationEmailText).not.toMatch(/signature|best,|regards,/i);
    expect(result.bundle.loxoNoteText).toContain("- Salary expectation: $120,000");
    expect(result.bundle.loxoNoteText).toContain("- Start date/notice period: Three weeks");
    expect(result).not.toHaveProperty("artifact");
    expect(result).not.toHaveProperty("emailDraft");
  });

  it("keeps missing facts blank and names the unknowns instead of inventing placeholders", () => {
    const result = executeWriteUp({
      mergedCase: candidateCase({
        sources: [source("resume", "resume", "Alex Example\nPROFESSIONAL SUMMARY\nMaintenance experience.")],
      }),
      sourceRefs: ["resume:sha-resume"],
      role: { ...ROLE, title: "", client: null },
      candidate: { ...CANDIDATE, currentTitle: null },
      now: "2026-09-20T02:00:00.000Z",
    });

    expect(result.status).toBe("draft_ready");
    expect(result.bundle.emailSubject).toBe("");
    expect(result.bundle.submission).toMatchObject({
      name: "Alex Example",
      title: "",
      compensationTarget: "",
      location: "",
      reasonForLeaving: "",
      profileSummary: "",
    });
    expect(result.bundle.unknowns).toEqual(expect.arrayContaining([
      "Reviewed call notes or transcript",
      "Reviewed job description",
      "Current title",
      "Target role",
      "Client",
      "Compensation Target",
      "Location",
      "Reason for Leaving",
      "Profile Summary",
    ]));
    expect(result.bundle.presentationEmailText.endsWith("CV attached.")).toBe(true);
    expect(`${result.bundle.presentationEmailText}\n${result.bundle.loxoNoteText}`).not.toMatch(/\[(?:confirm|unknown|missing)|tbd/i);
  });

  it("uses explicitly labelled typed Workstation notes without treating free text as fact", () => {
    const result = executeWriteUp({
      mergedCase: candidateCase({
        notes: `Compensation Target: $115,000
Notice Period: Three weeks
Interview Availability: Tuesday afternoon
Unstructured opinion should not become a fact.`,
        sources: [
          source("resume", "resume", RESUME_TEXT),
          source("jd", "job_description", JD_TEXT),
        ],
      }),
      sourceRefs: ["resume:sha-resume", "case-notes:case-1:7", "jd:sha-jd"],
      role: ROLE,
      candidate: CANDIDATE,
      now: "2026-09-20T02:00:00.000Z",
    });

    expect(result.bundle.submission).toMatchObject({
      compensationTarget: "$115,000",
      startDateNotice: "Three weeks",
      interviewAvailability: "Tuesday afternoon",
    });
    expect(result.bundle.presentationEmailText).not.toContain("Unstructured opinion");
    expect(result.bundle.loxoNoteText).not.toContain("Unstructured opinion");
    expect(result.bundle.sourceRefs).toEqual([
      "case-notes:case-1:7",
      "jd:sha-jd",
      "resume:sha-resume",
    ]);
  });

  it("is deterministic and preserves the caller's exact provenance values in sorted order", () => {
    const mergedCase = candidateCase({
      sources: [
        source("resume", "resume", RESUME_TEXT),
        source("jd", "job_description", JD_TEXT),
        source("call", "call_notes", CALL_TEXT),
      ],
    });
    const sourceRefs = ["resume:sha-resume", "jd:sha-jd", "call:sha-call"];
    const originalRefs = [...sourceRefs];

    const first = executeWriteUp({ mergedCase, role: ROLE, candidate: CANDIDATE, sourceRefs, now: "2026-09-20T02:00:00.000Z" });
    const second = executeWriteUp({ mergedCase, role: ROLE, candidate: CANDIDATE, sourceRefs, now: "2026-09-20T02:00:00.000Z" });

    expect(second).toEqual(first);
    expect(sourceRefs).toEqual(originalRefs);
    expect(first.bundle.sourceRefs).toEqual(["call:sha-call", "jd:sha-jd", "resume:sha-resume"]);
    expect(first.bundle.sourceRefs).not.toContain("resume.txt");
    expect(first.bundle.sourceRefs).not.toContain("jd.txt");
    expect(first.bundle.sourceRefs).not.toContain("call.txt");
  });

  it("uses saved Job and candidate identity only to fill source blanks", () => {
    const result = executeWriteUp({
      mergedCase: candidateCase({
        sources: [
          source("resume", "resume", "PROFESSIONAL SUMMARY\nSource-grounded maintenance experience."),
          source("jd", "job_description", "Location: Toronto, ON"),
        ],
      }),
      role: ROLE,
      candidate: CANDIDATE,
      sourceRefs: ["resume:sha-resume", "jd:sha-jd"],
      now: "2026-09-20T02:00:00.000Z",
    });

    expect(result.bundle.resume).toMatchObject({
      name: "Alex Example",
      headline: "Maintenance Manager",
    });
    expect(result.bundle.submission).toMatchObject({
      name: "Alex Example",
      title: "Maintenance Manager",
    });
    expect(result.bundle.emailSubject).toBe("");
    expect(result.bundle.unknowns).not.toContain("Candidate name");
    expect(result.bundle.unknowns).not.toContain("Current title");
    expect(result.bundle.unknowns).not.toContain("Target role");
    expect(result.bundle.unknowns).not.toContain("Client");
    expect(result.bundle.sourceRefs).toEqual([
      "candidate-record:candidate-1",
      "jd:sha-jd",
      "resume:sha-resume",
      "role-record:role-1",
    ]);
  });

  it("never overwrites explicit resume or JD facts with saved context", () => {
    const result = executeWriteUp({
      mergedCase: candidateCase({
        sources: [
          source("resume", "resume", RESUME_TEXT),
          source("jd", "job_description", JD_TEXT),
          source("call", "transcript", CALL_TEXT),
        ],
      }),
      role: { ...ROLE, title: "Conflicting Job", client: "Conflicting Client" },
      candidate: { ...CANDIDATE, name: "Conflicting Candidate", currentTitle: "Conflicting Title" },
      sourceRefs: ["resume:sha-resume", "jd:sha-jd", "call:sha-call"],
      now: "2026-09-20T02:00:00.000Z",
    });

    expect(result.bundle.resume).toMatchObject({
      name: "Alex Example",
      headline: "Maintenance Manager",
    });
    expect(result.bundle.submission).toMatchObject({
      name: "Alex Example",
      title: "Maintenance Manager",
    });
    expect(result.bundle.emailSubject).toContain("Synthetic Manufacturing");
    expect(result.bundle.emailSubject).not.toContain("Conflicting");
    expect(result.bundle.sourceRefs).not.toContain("candidate-record:candidate-1");
    expect(result.bundle.sourceRefs).not.toContain("role-record:role-1");
  });
});
