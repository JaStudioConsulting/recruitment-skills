import { readFileSync } from "node:fs";
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
import { clearAutofillSource, createAutofilledDraft, parseResumeText, resumeFormFromCase, stripContactDetails } from "../lib/capabilities/deterministic-autofill";
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

  it("uses the declared offer fields, sourcing columns, and full screening-report shape", () => {
    const offer = createEmptyDraft(FEATURES.find((feature) => feature.id === "offer-letter")!);
    expect(offer.fields?.map((field) => field.label)).toContain("Base Salary and Pay Frequency");
    expect(offer.fields?.map((field) => field.label)).toContain("Signing Authority Title");
    const sourcing = createEmptyDraft(FEATURES.find((feature) => feature.id === "source-candidates")!);
    expect(sourcing.table?.columns).toEqual(["Full Name", "Company", "Tenure", "LinkedIn Link", "Contact Info", "Eligibility", "Evidence Status"]);
    const screeningFeature = FEATURES.find((feature) => feature.id === "screen-applicants")!;
    const screening = createEmptyDraft(screeningFeature);
    expect(screening.document).toBe("");
    expect(screeningFeature.deliverables).toEqual([
      "Candidate and role identity",
      "Screened date",
      "Tier and overall score",
      "Requirement-match table",
      "Strengths",
      "Concerns",
      "Suggested interview questions",
      "Recommendation",
      "Ranked batch comparison when multiple applicants are screened",
    ]);
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
    payload = setValueAtPath(payload, "source_ledger", `# Source ledger

## Claim 1
- Claim: Synthetic role claim
- Source: Synthetic source A
- Publication date: unavailable
- Retrieval date: 2026-09-18
- Scope: Synthetic role
- Status: supported

## Claim 2
- Claim: Synthetic company claim
- Source: Synthetic source B
- Publication date: 2026-09-01
- Retrieval date: 2026-09-18
- Scope: Synthetic company
- Status: supported`);
    payload = setValueAtPath(payload, "asset_ledger", `# Asset ledger

## Asset 1
- Creator: Synthetic creator
- Source page: repository://synthetic
- Direct asset URL or generated-file path: Synthetic evidence text
- Licence: Synthetic test licence
- Allowed use: Deterministic test
- Modifications: None
- Rendered caption: Synthetic caption`);
    expect(validateManualArtifactPayload("interview-prep-pdf", payload)).toEqual([]);
  });

  it("rejects filler interview ledgers before calling the builder", () => {
    let payload = emptyInterviewPayload();
    for (const [path] of INTERVIEW_TEXT_FIELDS) payload = setValueAtPath(payload, path, path.endsWith("as_of") ? "2026-09-18" : "a\nb\nc\nd");
    payload = setValueAtPath(payload, "brief.source_control.publication_status", "approved_for_candidate_use");
    payload = setValueAtPath(payload, "brief.source_control.authoritative_sources", ["Synthetic source A", "Synthetic source B"]);
    expect(validateManualArtifactPayload("interview-prep-pdf", payload)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "source_ledger" }),
      expect.objectContaining({ path: "asset_ledger" }),
    ]));
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

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const lines = (value: string) => value.split(/\r?\n/).filter(Boolean);

const RESUME_LAYOUTS = [
  {
    name: "A",
    text: fixture("resume-layout-a.txt"),
    expected: {
      name: "Jordan Mercer",
      headline: "Operations Manager",
      summary: "Manufacturing maintenance leader with experience improving equipment reliability.",
      skills: ["Preventive maintenance planning and weekly scheduling", "CMMS administration", "Team leadership", "Vendor management", "Safety compliance", "Root cause analysis", "Budget control", "Capital projects", "Reliability improvement", "Cross-functional communication"],
      jobs: [
        { title: "Maintenance Manager (Contract)", company: "Atlas & Finch (Industrial Services)", location: "Hamilton, ON", dates: "Jan-2023 - Present", bullets: ["Led maintenance planning across three synthetic facilities.", "Managed the maintenance budget."] },
        { title: "Reliability Supervisor", company: "Blue Maple Foods", location: "Mississauga, ON", dates: "Apr-2020 - Dec-2022", bullets: ["Improved preventive maintenance compliance."] },
        { title: "Maintenance Planner", company: "Cedar Works Ltd.", location: "Burlington, ON", dates: "Jan-2018 - Mar-2020", bullets: ["Planned weekly work orders."] },
        { title: "Maintenance Coordinator", company: "Delta Process Systems", location: "Oakville, ON", dates: "2016 - 2017", bullets: ["Coordinated shutdown schedules."] },
        { title: "Millwright Lead", company: "Evergreen Components", location: "Guelph, ON", dates: "May-2013 - Dec-2015", bullets: ["Led a synthetic trades team."] },
        { title: "Industrial Mechanic", company: "Foundry Test Group", location: "Cambridge, ON", dates: "Jun-2010 - Apr-2013", bullets: ["Completed corrective maintenance."] },
      ],
      education: ["Diploma, Mechanical Engineering Technology - Example College", "Certificate, Maintenance Management - Sample Institute"],
      sections: [{ heading: "TECHNICAL TOOLS", items: "Maximo\nSAP" }],
    },
  },
  {
    name: "B",
    text: fixture("resume-layout-b.txt"),
    expected: {
      name: "Morgan Ellis",
      headline: "Senior Accountant",
      summary: "Accounting professional with manufacturing reporting and close experience.",
      skills: ["Month-end close", "Financial reporting", "Inventory accounting", "Variance analysis"],
      jobs: [
        { title: "Senior Accountant", company: "Granite Ledger Manufacturing", location: "Toronto, ON", dates: "Feb-2022 - Present", bullets: ["Prepared monthly financial statements.", "Reconciled inventory accounts."] },
        { title: "Plant Accountant", company: "Harbour Fixture Company", location: "Etobicoke, ON", dates: "2019 - 2021", bullets: ["Supported plant reporting."] },
      ],
      education: ["Bachelor of Commerce - Example University"],
      sections: [],
    },
  },
  {
    name: "C",
    text: fixture("resume-layout-c.txt"),
    expected: {
      name: "Riley Chen",
      headline: "Maintenance Director",
      summary: "Reliability leader with multi-site manufacturing experience.",
      skills: ["Asset reliability", "Shutdown planning", "Team development"],
      jobs: [
        { title: "Maintenance Director", company: "Northwind Foods", location: "Toronto / Mississauga, ON", dates: "2026 - Present", bullets: ["Leads site maintenance strategy."] },
        { title: "Reliability Manager", company: "Orchard Test Products", location: "Hamilton, ON", dates: "Oct-2016 - 2026", bullets: ["Managed reliability programs."] },
        { title: "Maintenance Planner", company: "Prairie Components", location: "London, ON", dates: "Jan-2012 - Mar-2016", bullets: ["Planned preventive work."] },
      ],
      education: ["Diploma, Industrial Maintenance - Sample College", "CMRP - Synthetic Institute"],
      sections: [],
    },
  },
  {
    name: "D",
    text: fixture("resume-layout-d.txt"),
    expected: {
      name: "Taylor Dawson",
      headline: "Manufacturing Leader",
      summary: "Lead safe maintenance and production improvements in a manufacturing operation.",
      skills: ["Preventive maintenance planning and scheduling", "Supervisor coaching", "Root cause analysis"],
      jobs: [
        { title: "Maintenance Manager (Contract Assignments)", company: "NORTHSTAR INDUSTRIES INC.", location: "SUDBURY, ON", dates: "Apr-2023 - Present", bullets: ["Led maintenance planning for two synthetic production lines.", "Coordinated weekly shutdown work."] },
        { title: "Reliability Supervisor", company: "EASTERN FABRICATION LTD.", location: "NORTH BAY, ON", dates: "Oct-2022 - Mar-2023", bullets: ["Improved work-order quality and technician follow-through."] },
        { title: "Maintenance Planner", company: "NORTHERN COMPONENTS INC.", location: "SAULT STE. MARIE, ON", dates: "May-2022 - Sep-2022", bullets: ["Planned preventive tasks and maintained the backlog."] },
      ],
      education: ["Industrial Maintenance Certificate - Example College"],
      sections: [],
    },
  },
] as const;

describe("deterministic source auto-fill", () => {
  it.each(RESUME_LAYOUTS)("parses reviewer layout $name exactly", (layout) => {
    const parsed = parseResumeText(layout.text, `${layout.name}.txt`);
    const actualJobs = parsed.form.jobs.map((job) => ({ ...job, bullets: lines(job.bullets) }));
    expect(parsed.form.name).toBe(layout.expected.name);
    expect(parsed.form.headline).toBe(layout.expected.headline);
    expect(parsed.form.summary).toBe(layout.expected.summary);
    expect(lines(parsed.form.skills)).toEqual(layout.expected.skills);
    expect(parsed.form.jobs).toHaveLength(layout.expected.jobs.length);
    expect(actualJobs).toEqual(layout.expected.jobs);
    expect(actualJobs.map((job) => job.bullets.length)).toEqual(layout.expected.jobs.map((job) => job.bullets.length));
    expect(lines(parsed.form.education)).toEqual(layout.expected.education);
    expect(parsed.form.sections).toEqual(layout.expected.sections);
  });

  it("reports correctness-based field accuracy and dated-job recovery", () => {
    const metrics = RESUME_LAYOUTS.map((layout) => {
      const parsed = parseResumeText(layout.text, `${layout.name}.txt`);
      const actualJobs = parsed.form.jobs.map((job) => ({ ...job, bullets: lines(job.bullets) }));
      const fields: Array<[unknown, unknown]> = [
        [parsed.form.name, layout.expected.name], [parsed.form.headline, layout.expected.headline],
        [parsed.form.summary, layout.expected.summary], [lines(parsed.form.skills), layout.expected.skills],
        [lines(parsed.form.education), layout.expected.education], [parsed.form.sections, layout.expected.sections],
        ...layout.expected.jobs.flatMap((job, index) => [
          [actualJobs[index]?.title, job.title] as [unknown, unknown], [actualJobs[index]?.company, job.company] as [unknown, unknown],
          [actualJobs[index]?.location, job.location] as [unknown, unknown], [actualJobs[index]?.dates, job.dates] as [unknown, unknown],
          [actualJobs[index]?.bullets, job.bullets] as [unknown, unknown],
        ]),
      ];
      const correct = fields.filter(([actual, expected]) => JSON.stringify(actual) === JSON.stringify(expected)).length;
      return { layout: layout.name, correct, expected: fields.length, accuracy: Math.round((correct / fields.length) * 100), jobsFound: parsed.form.jobs.length, jobsExpected: layout.expected.jobs.length };
    });
    console.info("RESUME_FIELD_ACCURACY", JSON.stringify(metrics));
    expect(metrics.every((metric) => metric.jobsFound === metric.jobsExpected)).toBe(true);
    expect(metrics.every((metric) => metric.accuracy >= 90)).toBe(true);
  });

  it("leaves an unknown title, company, or location empty instead of shifting adjacent values", () => {
    const parsed = parseResumeText(`Avery Cautious
Maintenance Professional
SUMMARY
Synthetic maintenance experience.
SKILLS
Planning
EXPERIENCE
Jan 2020 - Present
Solo Company Ltd.
Toronto, ON
• Managed preventive work.
Maintenance Lead
2018 - 2019
Ottawa, ON
• Led scheduled maintenance.
Maintenance Planner
2016 - 2017
Sample Systems
• Planned work orders.`, "conservative-fields.txt");
    expect(parsed.form.jobs).toEqual([
      { title: "", company: "Solo Company Ltd.", location: "Toronto, ON", dates: "Jan-2020 - Present", bullets: "Managed preventive work." },
      { title: "Maintenance Lead", company: "", location: "Ottawa, ON", dates: "2018 - 2019", bullets: "Led scheduled maintenance." },
      { title: "Maintenance Planner", company: "Sample Systems", location: "", dates: "2016 - 2017", bullets: "Planned work orders." },
    ]);
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
        { kind: "resume", filename: "synthetic-resume.txt", lifecycleStatus: "reviewed", parsedText: fixture("synthetic-autofill-resume.txt") },
        { kind: "job_description", filename: "synthetic-jd.txt", lifecycleStatus: "reviewed", parsedText: "Job Title: Maintenance Manager\nClient: Synthetic Manufacturing\nLocation: Toronto, ON" },
        { kind: "call_notes", filename: "synthetic-call.txt", lifecycleStatus: "reviewed", parsedText: "Compensation: $100,000\nNotice: Two weeks\nLocation: Hamilton, ON\nCandidate sounded enthusiastic" },
      ],
    } as CandidateCase;
    const submissionFeature = FEATURES.find((feature) => feature.id === "write-up-candidate")!;
    const submission = createAutofilledDraft(submissionFeature, candidateCase);
    const resolvedResume = resumeFormFromCase(candidateCase);
    expect(resolvedResume.form.name).toBe("Alex Example");
    expect(resolvedResume.sources["resume.name"]).toBe("synthetic-resume.txt");
    const edited = clearAutofillSource({
      ...submission,
      autofill: { ...submission.autofill, ...resolvedResume.sources },
    }, "resume.name");
    expect(edited.autofill?.["resume.name"]).toBeUndefined();

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

  it("uses explicitly labelled workstation notes when no call file exists", () => {
    const candidateCase = {
      notes: "Compensation Target: $115,000\nNotice Period: Three weeks\nInterview Availability: Tuesday afternoon\nUnstructured opinion should not become a fact.",
      sources: [
        { kind: "resume", filename: "synthetic-resume.txt", lifecycleStatus: "reviewed", parsedText: fixture("synthetic-autofill-resume.txt") },
        { kind: "job_description", filename: "synthetic-jd.txt", lifecycleStatus: "reviewed", parsedText: "Job Title: Maintenance Manager\nClient: Synthetic Manufacturing" },
      ],
    } as CandidateCase;
    const draft = createAutofilledDraft(FEATURES.find((feature) => feature.id === "write-up-candidate")!, candidateCase);
    expect(draft.submission).toMatchObject({
      compensationTarget: "$115,000",
      startDateNotice: "Three weeks",
      interviewAvailability: "Tuesday afternoon",
    });
    expect(draft.autofill?.["submission.compensationTarget"]).toBe("Workstation notes");
    expect(JSON.stringify(draft)).not.toContain("Unstructured opinion");
  });
});
