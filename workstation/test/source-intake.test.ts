import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import {
  canReviewSource,
  classifyParsedSourceContent,
  inspectSourceContent,
  inspectUploadedSourceContent,
  normalizeSourceLifecycleStatus,
  sourceIsUsable,
} from "../lib/server/source-intake";
import { inferSourceKindFromText, jobIdentitiesMatch, proposePastedSource } from "../lib/source-intake";

function bytes(value: string) {
  return new TextEncoder().encode(value).buffer as ArrayBuffer;
}

function simplePdf(text: string) {
  const escaped = text.replace(/([\\()])/g, "\\$1");
  const stream = `BT\n/F1 11 Tf\n72 720 Td\n(${escaped}) Tj\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(new TextEncoder().encode(pdf).byteLength);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = new TextEncoder().encode(pdf).byteLength;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf).buffer as ArrayBuffer;
}

async function simpleDocx(paragraphs: string[]) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  const body = paragraphs
    .map((paragraph) => `<w:p><w:r><w:t>${paragraph}</w:t></w:r></w:p>`)
    .join("");
  zip.folder("word")?.file("document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  const output = await zip.generateAsync({ type: "uint8array" });
  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer;
}

describe("source intake", () => {
  it("matches only complete Job identities and ignores terminal legal suffix aliases", () => {
    expect(jobIdentitiesMatch(
      { title: "Maintenance Manager", client: "Atlantic Packaging" },
      { title: "maintenance manager", client: "Atlantic Packaging Inc." },
    )).toBe(true);
    expect(jobIdentitiesMatch(
      { title: "Maintenance Manager", client: "Atlantic Packaging" },
      { title: "maintenance manager", client: "ATLANTIC PACKAGING" },
    )).toBe(true);
    expect(jobIdentitiesMatch(
      { title: "Maintenance Manager", client: "" },
      { title: "Maintenance Manager", client: "Hanon Systems" },
    )).toBe(false);
    expect(jobIdentitiesMatch(
      { title: "Maintenance Manager", client: "Atlantic Packaging Group" },
      { title: "Maintenance Manager", client: "Atlantic Packaging" },
    )).toBe(false);
    expect(jobIdentitiesMatch(
      { title: "Maintenance Manager", client: "Atlantic Packaging Holdings" },
      { title: "Maintenance Manager", client: "Atlantic Packaging" },
    )).toBe(false);
  });

  it("preserves punctuation that changes a technical Job title", () => {
    expect(jobIdentitiesMatch(
      { title: "C++ Developer", client: "Example Technologies" },
      { title: "C# Developer", client: "Example Technologies" },
    )).toBe(false);
    expect(jobIdentitiesMatch(
      { title: "C++ Developer", client: "Example Technologies" },
      { title: "C Developer", client: "Example Technologies" },
    )).toBe(false);
    expect(jobIdentitiesMatch(
      { title: "C++  Developer", client: "Example Technologies Inc." },
      { title: "c++-developer", client: "Example Technologies" },
    )).toBe(true);
  });

  it("recognizes a complete pasted JD and extracts exact Job identity", () => {
    const text = `Job Title: Maintenance Manager
Company: Example Manufacturing Inc.
Location: Toronto, Ontario

Job Description
About the role
Responsibilities
Qualifications
Requirements`;
    expect(proposePastedSource(text)).toEqual({
      kind: "job_description",
      filename: "Example Manufacturing Inc. - Maintenance Manager - Job description.txt",
      job: {
        title: "Maintenance Manager",
        client: "Example Manufacturing Inc.",
        confidence: "high",
        autoCreateEligible: true,
        evidence: ["Job Title: Maintenance Manager", "Company: Example Manufacturing Inc."],
      },
      candidate: null,
    });
  });

  it("proposes candidate identity only from a resume heading", () => {
    const proposal = proposePastedSource(`Avery North
Maintenance Supervisor
Toronto, Ontario

Professional Experience
Maintenance Supervisor
Atlas Components

Education
Mechanical Technology Diploma

Skills
CMMS and preventive maintenance`);
    expect(proposal.kind).toBe("resume");
    expect(proposal.candidate).toEqual({
      name: "Avery North",
      currentTitle: "Maintenance Supervisor",
      confidence: "high",
      evidence: ["Avery North", "Maintenance Supervisor"],
    });
  });

  it("recognizes a common Job-board heading without inventing values", () => {
    const text = `Maintenance Manager
Example Manufacturing Inc.
Toronto, Ontario

About the role
Responsibilities
Qualifications
Requirements`;
    const proposal = proposePastedSource(text);
    expect(proposal.kind).toBe("job_description");
    expect(proposal.job).toMatchObject({
      title: "Maintenance Manager",
      client: "Example Manufacturing Inc.",
      confidence: "high",
      autoCreateEligible: true,
    });
    expect(proposal.job?.evidence).toEqual(["Maintenance Manager", "Example Manufacturing Inc."]);
  });

  it("does not treat a Job section heading as the client identity", () => {
    const proposal = proposePastedSource(`Production Supervisor
Position Overview
Responsibilities
Qualifications
Requirements`);

    expect(proposal.job).toEqual({
      title: "Production Supervisor",
      client: "",
      confidence: "medium",
      autoCreateEligible: false,
      evidence: ["Production Supervisor"],
    });
    expect(proposal.filename).toBe("Production Supervisor - Job description.txt");
  });

  it("does not treat generic prose as an unlabelled client identity", () => {
    const proposal = proposePastedSource(`Production Supervisor
We provide maintenance services
Responsibilities
Qualifications
Requirements`);

    expect(proposal.job).toMatchObject({
      title: "Production Supervisor",
      client: "",
      autoCreateEligible: false,
    });
  });

  it("accepts a strong unlabelled company suffix as client evidence", () => {
    const proposal = proposePastedSource(`Production Supervisor
Beacon Manufacturing
Position Overview
Responsibilities
Qualifications
Requirements`);

    expect(proposal.job).toEqual({
      title: "Production Supervisor",
      client: "Beacon Manufacturing",
      confidence: "high",
      autoCreateEligible: true,
      evidence: ["Production Supervisor", "Beacon Manufacturing"],
    });
  });

  it("accepts a guarded company suffix immediately before the Job title", () => {
    const proposal = proposePastedSource(`Example Manufacturing Inc.
Maintenance Manager
Responsibilities
Qualifications
Requirements`);

    expect(proposal.job).toEqual({
      title: "Maintenance Manager",
      client: "Example Manufacturing Inc.",
      confidence: "high",
      autoCreateEligible: true,
      evidence: ["Maintenance Manager", "Example Manufacturing Inc."],
    });
  });

  it("accepts a valid explicit Company value without requiring a suffix", () => {
    const proposal = proposePastedSource(`Job Title: Production Supervisor
Company: Acme
Responsibilities
Qualifications
Requirements`);

    expect(proposal.job).toMatchObject({
      title: "Production Supervisor",
      client: "Acme",
      confidence: "high",
      autoCreateEligible: true,
    });
  });

  it("rejects placeholder and section-heading values in labelled Job identity fields", () => {
    const confidential = proposePastedSource(`Job Title: Production Supervisor
Company: Confidential
Responsibilities
Qualifications
Requirements`);
    const generic = proposePastedSource(`Role: About the role
Client: Our client
Responsibilities
Qualifications
Requirements`);

    expect(confidential.job).toMatchObject({
      title: "Production Supervisor",
      client: "",
      autoCreateEligible: false,
    });
    expect(generic.job).toMatchObject({
      title: "",
      client: "",
      autoCreateEligible: false,
    });
  });

  it("prefers genuine transcript speaker structure over embedded JD vocabulary", () => {
    const proposal = proposePastedSource(`Role: Maintenance Manager
Client: Beacon Manufacturing
Recruiter: I will walk through the job description and responsibilities.
Candidate: I meet the qualifications and requirements.
Recruiter: Great, let us discuss next steps.`);

    expect(proposal.kind).toBe("transcript");
    expect(proposal.job).toBeNull();
  });

  it("holds Job creation when the company is not present", () => {
    const text = `Job Title: Maintenance Manager
Job Description
Responsibilities
Qualifications
Requirements`;
    const proposal = proposePastedSource(text);
    expect(proposal.kind).toBe("job_description");
    expect(proposal.job).toEqual({
      title: "Maintenance Manager",
      client: "",
      confidence: "medium",
      autoCreateEligible: false,
      evidence: ["Job Title: Maintenance Manager"],
    });
    expect(proposal.filename).toBe("Maintenance Manager - Job description.txt");
  });

  it("names a pasted candidate source without requiring a title field", () => {
    const proposal = proposePastedSource("Jane Sample\nProfessional Summary\nProfessional Experience\nEducation\nSkills");
    expect(proposal.kind).toBe("resume");
    expect(proposal.filename).toBe("Jane Sample - Resume.txt");
    expect(proposal.job).toBeNull();
  });

  it.each([
    "Professional Summary",
    "Professional Profile",
    "Curriculum Vitae",
    "Resume/CV",
    "Executive Summary",
  ])("does not propose the resume heading %s as a candidate name", (heading) => {
    const proposal = proposePastedSource(`${heading}\nExperience\nEducation\nSkills`);

    expect(proposal.kind).toBe("resume");
    expect(proposal.candidate).toMatchObject({ name: "", confidence: "low" });
    expect(proposal.filename).toBe("Pasted resume.txt");
  });

  it.each([
    "Professional Summary",
    "Professional Profile",
    "Curriculum Vitae",
    "Resume/CV",
    "Executive Summary",
  ])("does not accept the labelled heading %s as a candidate name", (heading) => {
    const proposal = proposePastedSource(`Name: ${heading}\nExperience\nEducation\nSkills`);

    expect(proposal.kind).toBe("resume");
    expect(proposal.candidate?.name).toBe("");
  });

  it("lets parsed content outrank a contradictory filename while an explicit kind still wins", () => {
    const parsedText = "Jane Smith\nExperience\nPlant Manager\nEducation\nSkills";

    expect(classifyParsedSourceContent({
      parsedText,
      filename: "JD Smith Resume.pdf",
    })).toMatchObject({
      kind: "resume",
      lifecycleStatus: "classified",
      classificationMethod: "content",
    });
    expect(classifyParsedSourceContent({
      parsedText,
      filename: "JD Smith Resume.pdf",
      requestedKind: "job_description",
    })).toMatchObject({
      kind: "job_description",
      lifecycleStatus: "classified",
      classificationMethod: "explicit",
    });
  });

  it("recognizes common resume, Job-description, and Loxo-note section sets", () => {
    expect(inferSourceKindFromText("Experience\nEducation\nSkills")).toBe("resume");
    expect(inferSourceKindFromText("What you'll do\nDuties\nWho you are\nSkills")).toBe("job_description");
    expect(inferSourceKindFromText(`Industry: Manufacturing
Specialty: Maintenance
Niche: Food production
Salary Expectation: $120,000
Reason for Exploring: Growth
Misc Details: Shift flexibility`)).toBe("call_notes");
  });

  it("prefers strong resume structure when mixed vocabulary also reaches the Job threshold", () => {
    expect(inferSourceKindFromText(`Professional Summary
Maintenance leader supporting production teams.
Experience
Maintenance Manager
Responsibilities included preventive maintenance planning.
Qualifications included a mechanical diploma.
Education
Mechanical Technology Diploma
Skills
CMMS and safety`)).toBe("resume");
  });

  it("prefers a strong top-of-document Job identity when section vocabulary overlaps a resume", () => {
    const proposal = proposePastedSource(`Maintenance Manager
Example Manufacturing Inc.

Responsibilities
Experience
Education
Qualifications
Skills`);

    expect(proposal.kind).toBe("job_description");
    expect(proposal.job).toMatchObject({
      title: "Maintenance Manager",
      client: "Example Manufacturing Inc.",
      confidence: "high",
      autoCreateEligible: true,
    });
  });

  it("keeps a named resume with a current-employer header on the resume path", () => {
    const proposal = proposePastedSource(`Avery North
Maintenance Manager
Atlas Manufacturing

Professional Experience
Responsibilities included preventive maintenance.
Qualifications include Red Seal.
Education
Skills`);

    expect(proposal.kind).toBe("resume");
    expect(proposal.candidate).toMatchObject({
      name: "Avery North",
      currentTitle: "Maintenance Manager",
    });
    expect(proposal.job).toBeNull();
  });

  it("does not treat a company-suffix heading as a candidate name", () => {
    const proposal = proposePastedSource(`Atlas Manufacturing Inc.
Professional Summary
Experience
Education
Skills`);

    expect(proposal.kind).toBe("resume");
    expect(proposal.candidate).toMatchObject({ name: "", confidence: "low" });
    expect(proposal.filename).toBe("Pasted resume.txt");
  });

  it("does not mistake colon-labelled call notes for transcript speakers", () => {
    const proposal = proposePastedSource(`Compensation: $100,000
Start date: October 1
Interview availability: Tuesday afternoon
Work status: Canadian citizen
Reason for leaving: Plant closure`);

    expect(proposal.kind).toBe("call_notes");
    expect(proposal.filename).toBe("Pasted call notes.txt");
  });

  it("recognizes a complete submission-style note as call notes", () => {
    const proposal = proposePastedSource(`Name: Jane Sample
Title: Plant Manager
Compensation Target: $120,000
Current Compensation: $110,000
Vacation: Three weeks
Location: Hamilton, ON
Work Status: Canadian citizen
Interview Availability: Tuesday afternoon
Start Date: Two weeks notice
Reason for Leaving: Plant closure`);

    expect(proposal.kind).toBe("call_notes");
    expect(proposal.filename).toBe("Pasted call notes.txt");
  });

  it("does not mistake standard Loxo update fields for transcript speakers", () => {
    const proposal = proposePastedSource(`Industry: Manufacturing
Specialty: Operations
Niche: Food production
Salary Expectation: $120,000
Reason for Exploring: Growth
Misc Details: Shift flexibility`);

    expect(proposal.kind).toBe("call_notes");
    expect(proposal.filename).toBe("Pasted call notes.txt");
  });

  it("still recognizes repeated genuine speaker labels as a transcript", () => {
    const proposal = proposePastedSource(`Recruiter: What compensation are you targeting?
Candidate: I am targeting $100,000.
Recruiter: When could you start?
Candidate: I would need two weeks.`);

    expect(proposal.kind).toBe("transcript");
    expect(proposal.filename).toBe("Pasted transcript.txt");
  });

  it("does not treat three unique colon labels as transcript speakers", () => {
    expect(inferSourceKindFromText(`Alpha: First value
Beta: Second value
Gamma: Third value`)).toBeNull();
    expect(inferSourceKindFromText(`Summary: Maintenance leader
Experience: Ten years
Education: Technical diploma
Skills: CMMS and preventive maintenance`)).toBe("resume");
  });

  it("recognizes repeated Recruiter/Candidate and Speaker 1/2 timestamped turns", () => {
    expect(inferSourceKindFromText(`[00:01] Recruiter: What compensation are you targeting?
[00:08] Candidate: I am targeting $100,000.
[00:15] Recruiter: When could you start?
[00:22] Candidate: I would need two weeks.`)).toBe("transcript");
    expect(inferSourceKindFromText(`00:01 Speaker 1: Tell me about your current role.
00:08 Speaker 2: I lead the maintenance team.
00:15 Speaker 1: What systems do you use?
00:22 Speaker 2: We use a CMMS.`)).toBe("transcript");
  });

  it("uses confident classifications immediately and holds only uncertain text", () => {
    expect(sourceIsUsable({ parsedText: "Professional Experience", lifecycleStatus: "classified", classificationMethod: "content" })).toBe(true);
    expect(sourceIsUsable({ parsedText: "Ambiguous note", lifecycleStatus: "parsed", classificationMethod: "uncertain" })).toBe(false);
    expect(sourceIsUsable({ parsedText: null, lifecycleStatus: "uploaded", classificationMethod: "filename" })).toBe(false);
  });
  it("parses and classifies a clearly named plain-text resume", () => {
    expect(inspectSourceContent({
      bytes: bytes("Professional Experience\nPlant Manager\nEducation\nSkills"),
      contentType: "text/plain",
      filename: "Jane Doe Resume.txt",
    })).toEqual({
      kind: "resume",
      lifecycleStatus: "classified",
      parsedText: "Professional Experience\nPlant Manager\nEducation\nSkills",
      classificationMethod: "filename",
    });
  });

  it("uses content signals when the filename is inconclusive", () => {
    const result = inspectSourceContent({
      bytes: bytes("JOB DESCRIPTION\nResponsibilities\nQualifications\nRequirements"),
      contentType: "text/markdown",
      filename: "source-1.md",
    });
    expect(result).toMatchObject({
      kind: "job_description",
      lifecycleStatus: "classified",
      classificationMethod: "content",
    });
  });

  it("keeps ambiguous parsed text visible for human classification", () => {
    expect(inspectSourceContent({
      bytes: bytes("Met the candidate and discussed the opportunity."),
      contentType: "text/plain",
      filename: "source.txt",
    })).toEqual({
      kind: "other",
      lifecycleStatus: "parsed",
      parsedText: "Met the candidate and discussed the opportunity.",
      classificationMethod: "uncertain",
    });
  });

  it("does not claim that a PDF was parsed without a PDF parser", () => {
    expect(inspectSourceContent({
      bytes: bytes("not actually parsed"),
      contentType: "application/pdf",
      filename: "Jane Doe Resume.pdf",
    })).toEqual({
      kind: "resume",
      lifecycleStatus: "uploaded",
      parsedText: null,
      classificationMethod: "filename",
    });
  });

  it("extracts and classifies text from an uploaded PDF", async () => {
    const result = await inspectUploadedSourceContent({
      bytes: simplePdf("Professional Experience Plant Manager Education Certifications Skills"),
      contentType: "application/pdf",
      filename: "Alex Morgan Resume.pdf",
    });

    expect(result).toMatchObject({
      kind: "resume",
      lifecycleStatus: "classified",
      classificationMethod: "filename",
    });
    expect(result.parsedText).toContain("Professional Experience");
  });

  it("does not detach uploaded PDF bytes while extracting text", async () => {
    const pdfBytes = simplePdf(
      "Professional Experience Plant Manager Education Certifications Skills",
    );
    const originalLength = pdfBytes.byteLength;

    await inspectUploadedSourceContent({
      bytes: pdfBytes,
      contentType: "application/pdf",
      filename: "Alex Morgan Resume.pdf",
    });

    expect(pdfBytes.byteLength).toBe(originalLength);
  });

  it("fails closed when a DOCX cannot be parsed", async () => {
    const result = await inspectUploadedSourceContent({
      bytes: bytes("not a real docx"),
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filename: "Alex Morgan Resume.docx",
    });

    expect(result).toMatchObject({
      kind: "resume",
      lifecycleStatus: "uploaded",
      parsedText: null,
      classificationMethod: "filename",
    });
  });

  it("extracts and classifies text from a valid DOCX", async () => {
    const result = await inspectUploadedSourceContent({
      bytes: await simpleDocx([
        "Alex Morgan",
        "Professional Experience",
        "Plant Manager",
        "Education",
        "Skills",
      ]),
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filename: "Alex Morgan Resume.docx",
    });

    expect(result).toMatchObject({
      kind: "resume",
      lifecycleStatus: "classified",
      classificationMethod: "filename",
    });
    expect(result.parsedText).toContain("Professional Experience");
    expect(result.parsedText).toContain("Plant Manager");
  });

  it("honours an explicit canonical source kind for parsed text", () => {
    expect(inspectSourceContent({
      bytes: bytes("Compensation: $100,000\nStart date: October 1"),
      contentType: "text/plain",
      filename: "notes.txt",
      requestedKind: "call_notes",
    })).toMatchObject({
      kind: "call_notes",
      lifecycleStatus: "classified",
      classificationMethod: "explicit",
    });
  });

  it("normalizes legacy or unknown database statuses to uploaded", () => {
    expect(normalizeSourceLifecycleStatus("unreviewed")).toBe("uploaded");
    expect(normalizeSourceLifecycleStatus("unexpected")).toBe("uploaded");
    expect(normalizeSourceLifecycleStatus("classified")).toBe("classified");
  });

  it("allows human classification and review together only after parsing", () => {
    expect(canReviewSource("parsed", "call_notes")).toBe(true);
    expect(canReviewSource("parsed")).toBe(false);
    expect(canReviewSource("classified")).toBe(true);
    expect(canReviewSource("reviewed", "resume")).toBe(true);
    expect(canReviewSource("uploaded", "resume")).toBe(false);
  });
});
