import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import {
  canReviewSource,
  inspectSourceContent,
  inspectUploadedSourceContent,
  normalizeSourceLifecycleStatus,
  sourceIsUsable,
} from "../lib/server/source-intake";

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
    expect(canReviewSource("uploaded", "resume")).toBe(false);
  });
});
