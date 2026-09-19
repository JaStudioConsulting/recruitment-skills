import { describe, expect, it, vi } from "vitest";

import { FEATURES } from "../lib/capabilities/catalog";
import {
  INTERVIEW_TEXT_FIELDS,
  REFERENCE_ANSWER_FIELDS,
  emptyInterviewPayload,
  emptyReferencePayload,
  setValueAtPath,
  stringAtPath,
  problemsFromBuilderDetail,
  validateManualArtifactPayload,
  valueAtPath,
} from "../lib/capabilities/manual-artifacts";
import { createEmptyDraft, fillInAvailable, labelledFieldsText, tableText } from "../lib/capabilities/manual-drafts";
import { clearAutofillSource, createAutofilledDraft, parseResumeText, stripContactDetails } from "../lib/capabilities/deterministic-autofill";
import { buildManualArtifact } from "../lib/server/manual-artifact";
import type { CandidateCase } from "../lib/workstation-types";

describe("manual fill-in declarations", () => {
  it("makes every feature except the two disconnected adapters available without AI", () => {
    const available = FEATURES.filter(fillInAvailable).map((feature) => feature.id);
    expect(available).toHaveLength(13);
    expect(available).not.toContain("loxo-pipeline-review");
    expect(available).not.toContain("tracker-review");
    expect(FEATURES.filter((feature) => !fillInAvailable(feature)).map((feature) => feature.id)).toEqual([
      "loxo-pipeline-review", "tracker-review",
    ]);
  });

  it("creates an immediate empty editable draft for every available result kind", () => {
    for (const feature of FEATURES.filter(fillInAvailable)) {
      const draft = createEmptyDraft(feature, "2026-09-18T00:00:00.000Z");
      expect(draft).toMatchObject({ featureId: feature.id, resultKind: feature.result_kind, provider: "manual", model: "none", title: "", unknowns: [] });
      if (draft.resume) {
        expect([draft.resume.name, draft.resume.headline, draft.resume.summary, draft.resume.skills, draft.resume.education]).toEqual(["", "", "", "", ""]);
        expect(Object.values(draft.resume.jobs[0]).every((value) => value === "")).toBe(true);
      }
      if (draft.submission) expect(Object.values(draft.submission).every((value) => value === "")).toBe(true);
      if (draft.document !== undefined) expect(draft.document).toBe("");
      if (draft.fields) expect(draft.fields.every((field) => field.value === "")).toBe(true);
      if (draft.table) expect(draft.table.rows.flat().every((value) => value === "")).toBe(true);
    }
  });

  it("uses the declared offer fields and exact table columns", () => {
    const offer = createEmptyDraft(FEATURES.find((feature) => feature.id === "offer-letter")!);
    expect(offer.fields?.map((field) => field.label)).toContain("Base Salary and Pay Frequency");
    expect(offer.fields?.map((field) => field.label)).toContain("Signing Authority Title");
    const sourcing = createEmptyDraft(FEATURES.find((feature) => feature.id === "source-candidates")!);
    expect(sourcing.table?.columns).toEqual(["Full Name", "Company", "Tenure", "LinkedIn Link", "Contact Info", "Eligibility", "Evidence Status"]);
    const screening = createEmptyDraft(FEATURES.find((feature) => feature.id === "screen-applicants")!);
    expect(screening.table?.columns).toEqual(["Rank", "Candidate", "Score", "Tier", "Key Differentiator", "Evidence and Gaps"]);
  });

  it("formats manual form and table copy text without generating content", () => {
    expect(labelledFieldsText([{ label: "Candidate Full Name", value: "Synthetic Person" }])).toBe("Candidate Full Name: Synthetic Person");
    expect(tableText(["Candidate", "Tier"], [["Synthetic Person", "Review"]])).toBe("Candidate\tTier\nSynthetic Person\tReview");
  });
});

describe("manual PDF payloads", () => {
  it("keeps every reference question optional while requiring identity and completion fields", () => {
    let payload = emptyReferencePayload();
    expect(REFERENCE_ANSWER_FIELDS.every(([path]) => stringAtPath(payload, path) === "")).toBe(true);
    for (const [path, value] of [
      ["candidate.full_name", "Synthetic Candidate"], ["candidate.position_applied_for", "Synthetic Role"],
      ["candidate.company_name", "Synthetic Client"], ["reference.full_name", "Synthetic Reference"],
      ["reference.job_title", "Synthetic Manager"], ["reference.company_name", "Synthetic Employer"],
      ["reference.professional_relationship", "Synthetic reporting relationship"], ["completed_by", "Synthetic Recruiter"], ["date", "2026-09-18"],
    ]) payload = setValueAtPath(payload, path, value);
    expect(validateManualArtifactPayload("reference-check-pdf", payload)).toEqual([]);
    expect(valueAtPath(payload, "answers.strengths")).toEqual([]);
  });

  it("names empty interview fields and accepts a complete synthetic minimum payload", () => {
    let payload = emptyInterviewPayload();
    const emptyProblems = validateManualArtifactPayload("interview-prep-pdf", payload);
    expect(emptyProblems.some((problem) => problem.path === "brief.document.company")).toBe(true);
    expect(emptyProblems.some((problem) => problem.path === "brief.source_control.authoritative_sources")).toBe(true);
    for (const [path] of INTERVIEW_TEXT_FIELDS) payload = setValueAtPath(payload, path, path.endsWith("as_of") ? "2026-09-18" : "Synthetic evidence text");
    payload = setValueAtPath(payload, "brief.source_control.publication_status", "draft_only");
    payload = setValueAtPath(payload, "brief.source_control.authoritative_sources", ["Synthetic source A", "Synthetic source B"]);
    expect(validateManualArtifactPayload("interview-prep-pdf", payload)).toEqual([]);
  });

  it("refuses invalid manual data before calling the broker", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result = await buildManualArtifact("reference-check-pdf", "build_reference_check_pdf", emptyReferencePayload(), { endpoint: "http://127.0.0.1:8000/mcp", fetchImpl });
    expect(result).toMatchObject({ status: "refused", problems: expect.arrayContaining([expect.objectContaining({ path: "candidate.full_name" })]) });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns the brokered PDF only after manual payload validation", async () => {
    let payload = emptyReferencePayload();
    for (const [path, value] of [
      ["candidate.full_name", "Synthetic Candidate"], ["candidate.position_applied_for", "Synthetic Role"],
      ["candidate.company_name", "Synthetic Client"], ["reference.full_name", "Synthetic Reference"],
      ["reference.job_title", "Synthetic Manager"], ["reference.company_name", "Synthetic Employer"],
      ["reference.professional_relationship", "Synthetic reporting relationship"], ["completed_by", "Synthetic Recruiter"], ["date", "2026-09-18"],
    ]) payload = setValueAtPath(payload, path, value);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ result: { structuredContent: { ok: true, filename: "Synthetic.pdf", download_url: "/files/synthetic.pdf" } } }), { status: 200 })) as unknown as typeof fetch;
    await expect(buildManualArtifact("reference-check-pdf", "build_reference_check_pdf", payload, { endpoint: "http://127.0.0.1:8000/mcp", fetchImpl }))
      .resolves.toEqual({ status: "built", filename: "Synthetic.pdf", downloadUrl: "/files/synthetic.pdf" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("maps the interview builder's shortened field path back to the visible field", () => {
    expect(problemsFromBuilderDetail("rendered PDF is missing document.role: Synthetic Role"))
      .toEqual([{ path: "brief.document.role", message: "rendered PDF is missing document.role: Synthetic Role" }]);
  });
});

const RESUME_LAYOUTS = [
  {
    name: "single column",
    text: `Alex Example\nMaintenance Manager\nPROFESSIONAL SUMMARY\nKeeps plant equipment available.\nCORE SKILLS\nPreventive Maintenance, Team Leadership\nPROFESSIONAL EXPERIENCE\nMaintenance Manager\nExample Components | Toronto, ON\nJan 2020 - Present\n- Led maintenance planning.\nEDUCATION\nDiploma, Mechanical Technology`,
    expected: ["resume.name", "resume.headline", "resume.summary", "resume.skills", "resume.jobs.0.title", "resume.jobs.0.company", "resume.jobs.0.location", "resume.jobs.0.dates", "resume.jobs.0.bullets", "resume.education"],
  },
  {
    name: "pipe header",
    text: `Blair Sample\nProduction Supervisor\nEXPERIENCE\nProduction Supervisor | Sample Plastics | Feb 2021 - Present\nDirected daily production.\nSKILLS\nScheduling, Safety`,
    expected: ["resume.name", "resume.headline", "resume.skills", "resume.jobs.0.title", "resume.jobs.0.company", "resume.jobs.0.dates", "resume.jobs.0.bullets"],
  },
  {
    name: "dates first",
    text: `Casey Fixture\nPlant Accountant\nWORK HISTORY\n04/2022 - 08/2025\nPlant Accountant\nFixture Industries | Hamilton, ON\nPrepared monthly close.\nEDUCATION\nBachelor of Commerce`,
    expected: ["resume.name", "resume.headline", "resume.jobs.0.title", "resume.jobs.0.company", "resume.jobs.0.location", "resume.jobs.0.dates", "resume.jobs.0.bullets", "resume.education"],
  },
  {
    name: "year only",
    text: `Dana Layout\nMaintenance Planner\nEMPLOYMENT\nMaintenance Planner\nYear Only Manufacturing\n2019 - 2021\nPlanned preventive work.`,
    expected: ["resume.name", "resume.headline", "resume.jobs.0.title", "resume.jobs.0.company", "resume.jobs.0.dates", "resume.jobs.0.bullets"],
  },
  {
    name: "sentence duties",
    text: `Evan Format\nOperations Manager\nEXPERIENCE\nOperations Manager, Sentence Works (Welland, ON)\nApril 2023 to current\nManaged daily operations. Coordinated production schedules.`,
    expected: ["resume.name", "resume.headline", "resume.jobs.0.title", "resume.jobs.0.company", "resume.jobs.0.location", "resume.jobs.0.dates", "resume.jobs.0.bullets"],
  },
  {
    name: "messy spacing",
    text: `  Frankie   Example  \n  Senior   Buyer  \n TECHNICAL SKILLS : \n ERP , Purchasing , Negotiation \n PROFESSIONAL EXPERIENCE : \n Senior Buyer \n Messy Components | London, ON \n Sept 2018 — Mar 2024 \n • Managed supplier contracts.`,
    expected: ["resume.name", "resume.headline", "resume.skills", "resume.jobs.0.title", "resume.jobs.0.company", "resume.jobs.0.location", "resume.jobs.0.dates", "resume.jobs.0.bullets"],
  },
] as const;

describe("deterministic source auto-fill", () => {
  it("parses six synthetic resume layouts and records honest fill rates", () => {
    const metrics = RESUME_LAYOUTS.map((layout) => {
      const parsed = parseResumeText(layout.text, `${layout.name}.txt`);
      const filled = layout.expected.filter((path) => parsed.sources[path]).length;
      return { layout: layout.name, filled, expected: layout.expected.length, rate: Math.round((filled / layout.expected.length) * 100) };
    });
    console.info("AUTOFILL_FILL_RATES", JSON.stringify(metrics));
    expect(metrics).toEqual(RESUME_LAYOUTS.map((layout) => ({ layout: layout.name, filled: layout.expected.length, expected: layout.expected.length, rate: 100 })));
    expect(parseResumeText(RESUME_LAYOUTS[1].text, "pipe.txt").form.jobs[0]).toMatchObject({ title: "Production Supervisor", company: "Sample Plastics", dates: "Feb-2021 - Present" });
    expect(parseResumeText(RESUME_LAYOUTS[2].text, "dates-first.txt").form.jobs[0]).toMatchObject({ dates: "Apr-2022 - Aug-2025" });
    expect(parseResumeText(RESUME_LAYOUTS[3].text, "year.txt").form.jobs[0].dates).toBe("2019 - 2021");
  });

  it("strips contact details from a synthetic resume before any field is filled", () => {
    const text = `Gale Contact\nMaintenance Lead\nEmail: gale@example.invalid\nContact No.: 416-555-0100\nhttps://linkedin.com/in/gale-contact\nSUMMARY\nMaintenance leader. Call 647-555-0101.\nSKILLS\nPlanning`;
    const parsed = parseResumeText(text, "contact-layout.txt");
    expect(JSON.stringify(parsed.form)).not.toMatch(/example\.invalid|555-010|linkedin\.com/i);
    expect(stripContactDetails(text)).not.toMatch(/example\.invalid|555-010|linkedin\.com/i);
    expect(parsed.form.name).toBe("Gale Contact");
  });

  it("pre-fills resume, JD, and only explicitly labelled call facts with provenance", () => {
    const candidateCase = {
      sources: [
        { kind: "resume", filename: "synthetic-resume.txt", lifecycleStatus: "reviewed", parsedText: RESUME_LAYOUTS[0].text },
        { kind: "job_description", filename: "synthetic-jd.txt", lifecycleStatus: "reviewed", parsedText: "Job Title: Maintenance Manager\nClient: Synthetic Manufacturing\nLocation: Toronto, ON" },
        { kind: "call_notes", filename: "synthetic-call.txt", lifecycleStatus: "reviewed", parsedText: "Compensation: $100,000\nNotice: Two weeks\nLocation: Hamilton, ON\nCandidate sounded enthusiastic" },
      ],
    } as CandidateCase;
    const resumeFeature = FEATURES.find((feature) => feature.id === "brand-resume")!;
    const resumeDraft = createAutofilledDraft(resumeFeature, candidateCase);
    expect(resumeDraft.resume?.name).toBe("Alex Example");
    expect(resumeDraft.autofill?.["resume.name"]).toBe("synthetic-resume.txt");
    const edited = clearAutofillSource(resumeDraft, "resume.name");
    expect(edited.autofill?.["resume.name"]).toBeUndefined();

    const submissionFeature = FEATURES.find((feature) => feature.id === "write-up-candidate")!;
    const submission = createAutofilledDraft(submissionFeature, candidateCase);
    expect(submission.submission).toMatchObject({ name: "Alex Example", title: "Maintenance Manager", compensationTarget: "$100,000", startDateNotice: "Two weeks", location: "Hamilton, ON" });
    expect(JSON.stringify(submission)).not.toContain("enthusiastic");

    const vetFeature = FEATURES.find((feature) => feature.id === "vet-candidate")!;
    const vet = createAutofilledDraft(vetFeature, candidateCase);
    expect(vet.document).toContain("Compensation Target: $100,000");
    expect(vet.document).toContain("Notice: Two weeks");
    expect(vet.document).not.toContain("Candidate sounded enthusiastic");

    const offerFeature = FEATURES.find((feature) => feature.id === "offer-letter")!;
    const offer = createAutofilledDraft(offerFeature, candidateCase);
    expect(offer.fields?.find((field) => field.label === "Company Name")?.value).toBe("Synthetic Manufacturing");
    expect(offer.fields?.find((field) => field.label === "Start Date")?.value).toBe("");

    const sourceFeature = FEATURES.find((feature) => feature.id === "source-candidates")!;
    const source = createAutofilledDraft(sourceFeature, candidateCase);
    expect(source.table?.rows[0].slice(0, 3)).toEqual(["Alex Example", "Example Components", "Jan-2020 - Present"]);
    expect(source.table?.rows[0].slice(3)).toEqual(["", "", "", ""]);
  });
});
