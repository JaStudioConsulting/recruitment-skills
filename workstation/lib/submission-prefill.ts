import {
  EMPTY_SUBMISSION,
  type CandidateRecord,
  type SubmissionDocument,
} from "./workstation-types";

export const RESUME_PREFILL_FIELDS = ["name", "title", "location", "profileSummary"] as const;
export type ResumePrefillField = (typeof RESUME_PREFILL_FIELDS)[number];

const CANADIAN_REGION = "AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT|Alberta|British Columbia|Manitoba|New Brunswick|Newfoundland(?: and Labrador)?|Nova Scotia|Northwest Territories|Nunavut|Ontario|Prince Edward Island|Quebec|Saskatchewan|Yukon";
const US_STATE = "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";
const LOCATION = new RegExp(`^[\\p{L}][\\p{L} .'-]{1,70},\\s*(?:${CANADIAN_REGION}|${US_STATE})(?:\\s+[A-Z]\\d[A-Z]\\s?\\d[A-Z]\\d|\\s+\\d{5}(?:-\\d{4})?)?(?:,\\s*(?:Canada|USA|United States))?$`, "iu");
const SUMMARY_HEADING = /^(?:professional\s+summary|profile\s+summary|professional\s+profile|career\s+profile|summary)\s*:?(.*)$/i;
const SECTION_HEADING = /^(?:professional\s+experience|work\s+experience|experience|employment\s+history|career\s+history|education|certifications?|licenses?|core\s+competencies|skills|technical\s+skills|additional\s+information|projects|awards?)\s*:?(?:\s*)$/i;

function cleanLines(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim());
}

function folded(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function extractResumeLocation(text: string): string {
  const lines: string[] = [];
  for (const line of cleanLines(text)) {
    if (lines.length >= 16 || SECTION_HEADING.test(line) || SUMMARY_HEADING.test(line)) break;
    if (line) lines.push(line);
  }
  for (const line of lines) {
    for (const part of line.split(/[|•;]/).map((value) => value.trim()).filter(Boolean)) {
      if (LOCATION.test(part)) return part;
    }
  }
  return "";
}

export function extractResumeHeadline(text: string, candidateName: string): string {
  const lines = cleanLines(text).filter(Boolean).slice(0, 14);
  const nameIndex = lines.findIndex((line) => folded(line) === folded(candidateName));
  if (nameIndex < 0) return "";

  for (const line of lines.slice(nameIndex + 1, nameIndex + 4)) {
    if (!line || line.length > 100 || SECTION_HEADING.test(line) || SUMMARY_HEADING.test(line)) continue;
    if (LOCATION.test(line) || /@|https?:|www\.|linkedin|\+?\d[\d(). -]{7,}/i.test(line)) continue;
    if (!/[\p{L}]/u.test(line) || (line.match(/\d/g)?.length ?? 0) > 2) continue;
    return line;
  }
  return "";
}

export function extractResumeSummary(text: string): string {
  const lines = cleanLines(text);
  const start = lines.findIndex((line) => SUMMARY_HEADING.test(line));
  if (start < 0) return "";

  const headingMatch = lines[start].match(SUMMARY_HEADING);
  const summary: string[] = headingMatch?.[1]?.trim() ? [headingMatch[1].trim()] : [];
  for (const line of lines.slice(start + 1)) {
    if (SECTION_HEADING.test(line) || SUMMARY_HEADING.test(line)) break;
    if (line) summary.push(line);
    if (summary.join("\n").length >= 1_800) break;
  }
  return summary.join("\n").slice(0, 1_800).trim();
}

export function coerceSubmissionDocument(value: unknown): SubmissionDocument {
  if (!value || typeof value !== "object" || Array.isArray(value) || "blocks" in value) {
    return { ...EMPTY_SUBMISSION };
  }
  const raw = value as Partial<Record<keyof SubmissionDocument, unknown>>;
  return Object.fromEntries(
    Object.keys(EMPTY_SUBMISSION).map((key) => [key, typeof raw[key as keyof SubmissionDocument] === "string" ? raw[key as keyof SubmissionDocument] : ""]),
  ) as SubmissionDocument;
}

export function prefillSubmissionFromResume(input: {
  current: SubmissionDocument;
  candidate: CandidateRecord;
  parsedText: string;
}): { document: SubmissionDocument; filledFields: ResumePrefillField[] } {
  const candidateIsExplicit = cleanLines(input.parsedText)
    .filter(Boolean)
    .slice(0, 8)
    .some((line) => folded(line) === folded(input.candidate.name));
  if (!candidateIsExplicit) return { document: input.current, filledFields: [] };

  const next = { ...input.current };
  const filledFields: ResumePrefillField[] = [];
  const suggestions: Record<ResumePrefillField, string> = {
    name: input.candidate.name.trim(),
    title: input.candidate.currentTitle?.trim() || extractResumeHeadline(input.parsedText, input.candidate.name),
    location: extractResumeLocation(input.parsedText),
    profileSummary: extractResumeSummary(input.parsedText),
  };

  for (const field of RESUME_PREFILL_FIELDS) {
    if (!next[field].trim() && suggestions[field]) {
      next[field] = suggestions[field];
      filledFields.push(field);
    }
  }
  return { document: filledFields.length ? next : input.current, filledFields };
}
