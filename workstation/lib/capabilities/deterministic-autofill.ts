import { emptyResumeForm, type ResumeFormDocument, type ResumeFormJob, type ResumeFormSection } from "../resume-form";
import type { CandidateCase, CaseSource } from "../workstation-types";
import { sourceIsUsable } from "../source-intake";
import type { FeatureDefinition } from "./catalog";
import { stringAtPath, setValueAtPath } from "./manual-artifacts";
import { createEmptyDraft } from "./manual-drafts";
import type { CapabilityDraft } from "./types";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL = /(?:https?:\/\/|www\.)\S+|\b(?:[a-z0-9-]+\.)*linkedin\.com\/\S*/gi;
const PHONE = /(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}(?!\d)/g;
const CONTACT_LABEL = /^\s*(?:e-?mail|phone|mobile|cell|contact(?:\s+no\.?|\s+number)?|linkedin|website|url|address)\s*[:|-]?\s*/i;
const BULLET = /^\s*(?:[-*•●▪◦]|\d+[.)])\s*/;
const MONTHS: Record<string, string> = {
  jan: "Jan", january: "Jan", feb: "Feb", february: "Feb", mar: "Mar", march: "Mar", apr: "Apr", april: "Apr",
  may: "May", jun: "Jun", june: "Jun", jul: "Jul", july: "Jul", aug: "Aug", august: "Aug", sep: "Sep",
  sept: "Sep", september: "Sep", oct: "Oct", october: "Oct", nov: "Nov", november: "Nov", dec: "Dec", december: "Dec",
};
const MONTH_PATTERN = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const NAMED_DATE_PATTERN = `${MONTH_PATTERN}\\.?\\s*(?:-|,)?\\s*\\d{4}`;
const ENDPOINT_PATTERN = `(?:${NAMED_DATE_PATTERN}|\\d{1,2}\\/\\d{4}|\\d{4})`;
const DATE_RANGE = new RegExp(`\\(?\\s*(${ENDPOINT_PATTERN})\\s*(?:-|–|—|to)\\s*(Present|Current|${ENDPOINT_PATTERN})\\s*\\)?`, "i");
const COMPANY_SUFFIX = /\b(?:inc|incorporated|ltd|limited|llc|corp|corporation|company|co|group|industries|manufacturing|foods|products|systems|services)\.?\s*(?:\([^)]+\))?$/i;

type ParsedResume = { form: ResumeFormDocument; sources: Record<string, string> };
type JdFacts = { title: string; client: string; location: string; source: string };

function stripContactLine(line: string): string {
  let next = line.replace(EMAIL, "").replace(URL, "").replace(PHONE, "");
  if (CONTACT_LABEL.test(next)) next = next.replace(CONTACT_LABEL, "");
  return next.replace(/^[\s|,;:-]+|[\s|,;:-]+$/g, "").replace(/\s{2,}/g, " ").trim();
}

export function stripContactDetails(text: string): string {
  return text.split(/\r?\n/).map(stripContactLine).filter(Boolean).join("\n");
}

function cleanLines(text: string): string[] {
  return stripContactDetails(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function looksLikeName(line: string): boolean {
  const words = line.split(/\s+/);
  return !knownHeadingKind(line) &&
    words.length >= 2 &&
    words.length <= 4 &&
    !/\d/.test(line) &&
    words.every((word) => /^[A-Z][A-Za-z'’-]*$/.test(word));
}

type HeadingKind = "summary" | "skills" | "experience" | "education" | "other";

function knownHeadingKind(line: string): Exclude<HeadingKind, "other"> | null {
  const plain = line.replace(/[:|]+$/, "").trim();
  const normalized = plain.toLowerCase().replace(/&/g, "and").replace(/[^a-z ]/g, "").replace(/\s+/g, " ");
  if (["summary", "profile", "profile summary", "professional summary", "professional profile", "objective", "career objective"].includes(normalized)) return "summary";
  if (["skill", "skills", "core skills", "key skills", "core competencies", "technical skills", "areas of expertise"].includes(normalized)) return "skills";
  if (["experience", "work experience", "work history", "professional experience", "employment", "employment history"].includes(normalized)) return "experience";
  if (["education", "education and certifications", "certifications", "licenses", "licences", "education certifications and licenses"].includes(normalized)) return "education";
  return null;
}

function possibleOtherHeading(line: string): boolean {
  const plain = line.replace(/[:|]+$/, "").trim();
  const letters = plain.replace(/[^A-Za-z]/g, "");
  return plain.length <= 60 && letters.length >= 3 && (letters === letters.toUpperCase() || /:$/.test(line));
}

function headingKind(line: string): HeadingKind | null {
  return knownHeadingKind(line) ?? (possibleOtherHeading(line) ? "other" : null);
}

function normalizeLocation(value: string): string {
  return value.trim().replace(/^\(|\)$/g, "").replace(/\s*\/\s*/g, " / ").replace(/\s*,\s*/g, ", ").replace(/\s{2,}/g, " ");
}

function looksLikeLocation(line: string): boolean {
  const value = normalizeLocation(line);
  return /^[A-Za-z][A-Za-z .'-]*(?:\s*\/\s*[A-Za-z][A-Za-z .'-]*)*\s*,\s*[A-Za-z]{2}(?:\s*,\s*(?:Canada|USA|US))?$/i.test(value);
}

function looksLikeAddress(line: string): boolean {
  return looksLikeLocation(line) || /^\d+\s+/.test(line) || /\b(?:street|st|road|rd|avenue|ave|drive|dr|boulevard|blvd|lane|ln|court|ct)\b/i.test(line) || /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i.test(line);
}

function titleLike(line: string): boolean {
  return line.length <= 80 && !BULLET.test(line) && !DATE_RANGE.test(line) && !headingKind(line) && !looksLikeAddress(line) && !/[.!?]$/.test(line);
}

function normalizeEndpoint(value: string): string {
  const trimmed = value.trim();
  if (/^(present|current)$/i.test(trimmed)) return "Present";
  if (/^\d{4}$/.test(trimmed)) return trimmed;
  const numeric = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (numeric) {
    const month = Number(numeric[1]);
    return month >= 1 && month <= 12 ? `${Object.values(MONTHS).filter((item, index, values) => values.indexOf(item) === index)[month - 1]}-${numeric[2]}` : trimmed;
  }
  const named = trimmed.match(/^([A-Za-z]+)\.?\s*(?:-|,)?\s*(\d{4})$/);
  return named && MONTHS[named[1].toLowerCase()] ? `${MONTHS[named[1].toLowerCase()]}-${named[2]}` : trimmed;
}

export function normalizeDateRange(line: string): string {
  const match = line.match(DATE_RANGE);
  return match ? `${normalizeEndpoint(match[1])} - ${normalizeEndpoint(match[2])}` : "";
}

function parseCompanyLocation(value: string): { company: string; location: string } {
  const parenthesized = value.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenthesized && looksLikeLocation(parenthesized[2])) return { company: parenthesized[1].trim(), location: normalizeLocation(parenthesized[2]) };
  const parts = value.split("|").map((item) => item.trim()).filter(Boolean);
  if (parts.length >= 2 && looksLikeLocation(parts[parts.length - 1])) {
    return { company: parts.slice(0, -1).join(" | "), location: normalizeLocation(parts[parts.length - 1]) };
  }
  if (looksLikeLocation(value)) return { company: "", location: normalizeLocation(value) };
  return { company: value.trim(), location: "" };
}

type ParsedJobBlock = { dateIndex: number; nextDateIndex: number; consumed: Set<number>; job: ResumeFormJob };

function headerCandidate(line: string): boolean {
  if (BULLET.test(line) || DATE_RANGE.test(line) || knownHeadingKind(line)) return false;
  return looksLikeLocation(line) || COMPANY_SUFFIX.test(line) || !/[.!?]$/.test(line);
}

function adjacentHeaders(lines: string[], start: number, step: -1 | 1, stop: number): Array<[number, string]> {
  const headers: Array<[number, string]> = [];
  for (let index = start; step < 0 ? index > stop : index < stop; index += step) {
    if (!headerCandidate(lines[index]) || headers.length >= 3) break;
    if (step < 0) headers.unshift([index, lines[index]]); else headers.push([index, lines[index]]);
  }
  return headers;
}

function assignCompany(value: string, title: string, currentLocation: string): { company: string; location: string } {
  const parsed = parseCompanyLocation(value);
  const company = parsed.company && parsed.company.localeCompare(title, undefined, { sensitivity: "accent" }) !== 0 ? parsed.company : "";
  return { company, location: parsed.location || currentLocation };
}

function parseJobBlock(lines: string[], dateIndex: number, nextDateIndex: number, previousDateIndex: number): ParsedJobBlock {
  const dateLine = lines[dateIndex];
  const dateMatch = dateLine.match(DATE_RANGE)!;
  const beforeDate = dateLine.slice(0, dateMatch.index).replace(/[|,:;\s]+$/, "").trim();
  let title = "", company = "", location = "";
  const consumed = new Set<number>([dateIndex]);
  if (beforeDate) {
    const segments = beforeDate.split("|").map((part) => part.trim()).filter(Boolean);
    if (segments.length >= 2) {
      title = segments[0];
      ({ company, location } = assignCompany(segments.slice(1).join(" | "), title, location));
    }
    else {
      const combined = beforeDate.match(/^([^,]+),\s*(.+)$/);
      if (combined) {
        const parsed = parseCompanyLocation(combined[2]);
        if (parsed.location) { title = combined[1].trim(); company = parsed.company; location = parsed.location; }
        else title = beforeDate;
      } else title = beforeDate;
    }
  }

  const before = adjacentHeaders(lines, dateIndex - 1, -1, previousDateIndex);
  const after = adjacentHeaders(lines, dateIndex + 1, 1, nextDateIndex);
  for (const [index] of [...before, ...after]) consumed.add(index);

  const beforeValues = before.map(([, value]) => value);
  const beforeLocation = beforeValues.findIndex(looksLikeLocation);
  if (beforeLocation >= 0) location ||= normalizeLocation(beforeValues.splice(beforeLocation, 1)[0]);
  if (!title && beforeValues.length) title = beforeValues.shift()!;
  if (!company && beforeValues.length) ({ company, location } = assignCompany(beforeValues.shift()!, title, location));

  const afterValues = after.map(([, value]) => value);
  const afterLocation = afterValues.findIndex(looksLikeLocation);
  if (afterLocation >= 0) location ||= normalizeLocation(afterValues.splice(afterLocation, 1)[0]);
  if (!title && afterValues.length) {
    const candidate = afterValues[0];
    const parsed = parseCompanyLocation(candidate);
    const onlyValueIsCompany = afterValues.length === 1 && (afterLocation >= 0 || Boolean(parsed.location) || COMPANY_SUFFIX.test(candidate));
    if (onlyValueIsCompany) {
      ({ company, location } = assignCompany(afterValues.shift()!, title, location));
    } else title = afterValues.shift()!;
  }
  if (!company && afterValues.length) ({ company, location } = assignCompany(afterValues.shift()!, title, location));
  if (!location && afterValues.length && looksLikeLocation(afterValues[0])) location = normalizeLocation(afterValues[0]);

  if (company === title) company = "";
  if (location === title || location === company) location = "";
  return { dateIndex, nextDateIndex, consumed, job: { title, company, location, dates: normalizeDateRange(dateLine), bullets: "" } };
}

function parseJobs(lines: string[]): ResumeFormJob[] {
  const dates = lines.map((line, index) => DATE_RANGE.test(line) ? index : -1).filter((index) => index >= 0);
  const blocks = dates.map((dateIndex, index) => parseJobBlock(lines, dateIndex, dates[index + 1] ?? lines.length, dates[index - 1] ?? -1));
  const consumed = new Set(blocks.flatMap((block) => [...block.consumed]));
  return blocks.map((block) => {
    const bullets: string[] = [];
    let markedBullets = false;
    for (let index = block.dateIndex + 1; index < block.nextDateIndex; index += 1) {
      if (consumed.has(index)) continue;
      const line = lines[index];
      if (BULLET.test(line)) {
        bullets.push(line.replace(BULLET, "").trim());
        markedBullets = true;
      } else if (markedBullets && bullets.length) {
        bullets[bullets.length - 1] = `${bullets[bullets.length - 1]} ${line}`.trim();
      } else {
        bullets.push(...line.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((item) => item.trim()).filter(Boolean));
      }
    }
    return { ...block.job, bullets: bullets.join("\n") };
  });
}

function parseSkills(sectionLines: string[]): string[] {
  const skills: string[] = [];
  let markedBullets = false;
  for (const line of sectionLines) {
    if (BULLET.test(line)) {
      skills.push(line.replace(BULLET, "").trim());
      markedBullets = true;
    } else if (markedBullets && skills.length) {
      skills[skills.length - 1] = `${skills[skills.length - 1]} ${line}`.trim();
    } else {
      skills.push(...line.split(",").map((item) => item.trim()).filter(Boolean));
    }
  }
  return skills;
}

function sectionHeadingKind(lines: string[], index: number, activeKind: HeadingKind | undefined): HeadingKind | null {
  const known = knownHeadingKind(lines[index]);
  if (known) return known;
  if (!possibleOtherHeading(lines[index]) || index === lines.length - 1) return null;
  const adjacentToDate = lines.slice(Math.max(0, index - 2), index + 3).some((line) => DATE_RANGE.test(line));
  return activeKind === "experience" && adjacentToDate ? null : "other";
}

export function parseResumeText(text: string, filename: string): ParsedResume {
  const lines = cleanLines(text);
  const form: ResumeFormDocument = { format: "tttg-resume-form-v1", reviewed: false, name: "", headline: "", summary: "", skills: "", jobs: [], educationHeading: "", education: "", sections: [] };
  const sources: Record<string, string> = {};
  let cursor = 0;
  if (lines[0] && looksLikeName(lines[0])) { form.name = lines[0]; sources["resume.name"] = filename; cursor = 1; }
  while (lines[cursor] && looksLikeAddress(lines[cursor])) cursor += 1;
  if (lines[cursor] && titleLike(lines[cursor])) { form.headline = lines[cursor]; sources["resume.headline"] = filename; cursor += 1; }
  const sections: Array<{ heading: string; kind: HeadingKind; lines: string[] }> = [];
  let active: typeof sections[number] | null = null;
  for (let index = cursor; index < lines.length; index += 1) {
    const line = lines[index];
    const kind = sectionHeadingKind(lines, index, active?.kind);
    if (kind) { active = { heading: line.replace(/[:|]+$/, "").trim(), kind, lines: [] }; sections.push(active); }
    else if (active) active.lines.push(line);
  }
  const summary = sections.find((section) => section.kind === "summary");
  if (summary?.lines.length) { form.summary = summary.lines.join("\n"); sources["resume.summary"] = filename; }
  const skills = sections.find((section) => section.kind === "skills");
  if (skills?.lines.length) {
    form.skills = parseSkills(skills.lines).join("\n");
    if (form.skills) sources["resume.skills"] = filename;
  }
  const experience = sections.find((section) => section.kind === "experience");
  form.jobs = experience ? parseJobs(experience.lines) : [];
  form.jobs.forEach((job, index) => Object.entries(job).forEach(([key, value]) => { if (value) sources[`resume.jobs.${index}.${key}`] = filename; }));
  const education = sections.filter((section) => section.kind === "education");
  if (education.length) {
    form.educationHeading = education.map((section) => section.heading).join(" and ");
    form.education = education.flatMap((section) => section.lines).map((line) => line.replace(BULLET, "").trim()).filter(Boolean).join("\n");
    if (form.educationHeading) sources["resume.educationHeading"] = filename;
    if (form.education) sources["resume.education"] = filename;
  }
  form.sections = sections.filter((section) => section.kind === "other" && section.lines.length).map<ResumeFormSection>((section) => ({ heading: section.heading, items: section.lines.map((line) => line.replace(BULLET, "").trim()).join("\n") }));
  form.sections.forEach((section, index) => {
    sources[`resume.sections.${index}.heading`] = filename;
    sources[`resume.sections.${index}.items`] = filename;
  });
  if (!form.jobs.length) form.jobs = [{ title: "", company: "", location: "", dates: "", bullets: "" }];
  return { form, sources };
}

function reviewedSource(candidateCase: CandidateCase | null, kinds: string[]): CaseSource | undefined {
  return candidateCase?.sources.find((source) => sourceIsUsable(source) && kinds.includes(source.kind));
}

/**
 * Resolve the editable resume form from reviewed source evidence independently
 * of any executor output kind. The branded-resume executor produces a PDF,
 * while write-up still needs this source-grounded form as an intermediate.
 */
export function resumeFormFromCase(candidateCase: CandidateCase | null): ParsedResume {
  const resumeSource = reviewedSource(candidateCase, ["resume"]);
  return resumeSource
    ? parseResumeText(resumeSource.parsedText ?? "", resumeSource.filename)
    : { form: emptyResumeForm(), sources: {} };
}

function labelled(text: string, labels: string[]): string {
  for (const line of text.split(/\r?\n/)) {
    for (const label of labels) {
      const match = line.match(new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:|-]\\s*(.+?)\\s*$`, "i"));
      if (match?.[1]) return match[1].trim();
    }
  }
  return "";
}

export function parseJdText(text: string, filename: string): JdFacts {
  const lines = cleanLines(text);
  let title = labelled(text, ["Job Title", "Role", "Position"]);
  let client = labelled(text, ["Client", "Company", "Employer"]);
  const location = labelled(text, ["Location", "Work Location"]);
  if (!title && lines[0]) {
    const at = lines[0].match(/^(.{2,80}?)\s+at\s+(.{2,80})$/i);
    if (at) { title = at[1].trim(); client ||= at[2].trim(); }
    else if (titleLike(lines[0])) title = lines[0];
  }
  return { title, client, location, source: filename };
}

type TextEvidence = Pick<CaseSource, "kind" | "filename" | "parsedText">;

function explicitFacts(source: TextEvidence | undefined): Record<string, string> {
  const text = source?.parsedText ?? "";
  return {
    compensationTarget: labelled(text, ["Compensation Target", "Compensation", "Salary Expectation"]),
    currentCompensation: labelled(text, ["Current Compensation", "Current Salary"]),
    startDateNotice: labelled(text, ["Notice", "Notice Period"]),
    location: labelled(text, ["Location"]),
    vacation: labelled(text, ["Vacation"]),
    workStatus: labelled(text, ["Work Status", "Work Authorization"]),
    interviewAvailability: labelled(text, ["Interview Availability", "Availability to Interview"]),
    reasonForLeaving: labelled(text, ["Reason for Leaving", "Reason for Change"]),
  };
}

function sourceTextDraft(sources: Array<TextEvidence | undefined>): { document: string; source: string } {
  const present = sources.filter((source): source is TextEvidence => Boolean(source?.parsedText?.trim()));
  const blocks = present.flatMap((source) => {
    if (source.kind !== "call_notes" && source.kind !== "transcript") {
      return [`${source.filename}\n${stripContactDetails(source.parsedText ?? "")}`];
    }
    const facts = explicitFacts(source);
    const lines = [
      ["Compensation Target", facts.compensationTarget],
      ["Current Compensation", facts.currentCompensation],
      ["Notice", facts.startDateNotice],
      ["Location", facts.location],
    ].filter((entry) => entry[1]).map(([label, value]) => `${label}: ${stripContactLine(value)}`);
    return lines.length ? [`${source.filename}\n${lines.join("\n")}`] : [];
  });
  return { document: blocks.join("\n\n"), source: present.map((source) => source.filename).join(", ") };
}

export function createAutofilledDraft(feature: FeatureDefinition, candidateCase: CandidateCase | null, now = new Date().toISOString()): CapabilityDraft {
  const draft = createEmptyDraft(feature, now);
  const resumeSource = reviewedSource(candidateCase, ["resume"]);
  const jdSource = reviewedSource(candidateCase, ["job_description"]);
  const callSource = reviewedSource(candidateCase, ["transcript", "call_notes"]);
  const callEvidence: TextEvidence | undefined = callSource ?? (candidateCase?.notes.trim()
    ? { kind: "call_notes", filename: "Workstation notes", parsedText: candidateCase.notes }
    : undefined);
  const resume = resumeSource ? parseResumeText(resumeSource.parsedText ?? "", resumeSource.filename) : null;
  const jd = jdSource ? parseJdText(jdSource.parsedText ?? "", jdSource.filename) : { title: "", client: "", location: "", source: "" };
  const call = explicitFacts(callEvidence);
  const autofill: Record<string, string> = {};
  if (draft.resume && resume) { draft.resume = resume.form; Object.assign(autofill, resume.sources); }
  if (draft.submission) {
    const values = {
      name: resume?.form.name ?? "",
      title: resume?.form.headline ?? "",
      compensationTarget: call.compensationTarget,
      currentCompensation: call.currentCompensation,
      vacation: call.vacation,
      location: call.location,
      workStatus: call.workStatus,
      interviewAvailability: call.interviewAvailability,
      startDateNotice: call.startDateNotice,
      reasonForLeaving: call.reasonForLeaving,
    };
    for (const [key, value] of Object.entries(values)) if (value) {
      draft.submission = { ...draft.submission, [key]: value };
      autofill[`submission.${key}`] = key === "name" || key === "title" ? resumeSource!.filename : callEvidence!.filename;
    }
  }
  if (draft.fields) {
    const offerValues: Record<string, [string, string]> = {
      "Company Name": [jd.client, jd.source], "Candidate Full Name": [resume?.form.name ?? "", resumeSource?.filename ?? ""],
      "Job Title": [jd.title, jd.source], "Base Salary and Pay Frequency": [call.compensationTarget, callEvidence?.filename ?? ""],
      "Work Location": [call.location || jd.location, call.location ? callEvidence?.filename ?? "" : jd.source],
    };
    draft.fields = draft.fields.map((field, index) => {
      const [value, source] = offerValues[field.label] ?? ["", ""];
      if (value) autofill[`fields.${index}.value`] = source;
      return { ...field, value };
    });
  }
  if (draft.table && feature.id === "screen-applicants" && resume?.form.name) {
    draft.table.rows[0][1] = resume.form.name;
    autofill["table.rows.0.1"] = resumeSource!.filename;
  }
  if (draft.table && feature.id === "source-candidates") {
    const firstJob = resume?.form.jobs.find((job) => job.company || job.dates);
    const values = [resume?.form.name ?? "", firstJob?.company ?? "", firstJob?.dates ?? ""];
    values.forEach((value, index) => {
      if (!value) return;
      draft.table!.rows[0][index] = value;
      autofill[`table.rows.0.${index}`] = resumeSource!.filename;
    });
  }
  if (draft.resultKind === "document") {
    const relevant = feature.id === "draft-job-posting" ? sourceTextDraft([jdSource]) : sourceTextDraft([resumeSource, jdSource, callEvidence]);
    if (relevant.document) { draft.document = relevant.document; autofill.document = relevant.source; }
  }
  if (draft.resultKind === "pdf" && draft.artifactPayload) {
    if (feature.id === "reference-check-pdf") {
      for (const [path, value, source] of [
        ["candidate.full_name", resume?.form.name ?? "", resumeSource?.filename ?? ""],
        ["candidate.position_applied_for", jd.title, jd.source], ["candidate.company_name", jd.client, jd.source],
      ]) if (value) { draft.artifactPayload = setValueAtPath(draft.artifactPayload, path, value); autofill[`artifactPayload.${path}`] = source; }
    } else {
      for (const [path, value] of [["brief.document.company", jd.client], ["brief.document.role", jd.title], ["brief.document.location", jd.location]]) if (value) {
        draft.artifactPayload = setValueAtPath(draft.artifactPayload, path, value);
        autofill[`artifactPayload.${path}`] = jd.source;
      }
      const authorities = [jdSource, resumeSource].filter((source): source is CaseSource => Boolean(source)).map((source) => source.filename);
      if (authorities.length >= 2) {
        draft.artifactPayload = setValueAtPath(draft.artifactPayload, "brief.source_control.authoritative_sources", authorities);
        autofill["artifactPayload.brief.source_control.authoritative_sources"] = authorities.join(", ");
      }
    }
  }
  draft.autofill = autofill;
  return draft;
}

export function clearAutofillSource(draft: CapabilityDraft, path: string): CapabilityDraft {
  if (!draft.autofill || !Object.keys(draft.autofill).some((key) => key === path || key.startsWith(`${path}.`))) return draft;
  const autofill = { ...draft.autofill };
  for (const key of Object.keys(autofill)) if (key === path || key.startsWith(`${path}.`)) delete autofill[key];
  return { ...draft, autofill };
}

export function autofillCount(draft: CapabilityDraft): number {
  return Object.keys(draft.autofill ?? {}).length;
}

export function artifactAutofillSource(draft: CapabilityDraft, path: string): string | undefined {
  return draft.autofill?.[`artifactPayload.${path}`];
}

export function hasAutofilledArtifactValue(draft: CapabilityDraft, path: string): boolean {
  return Boolean(draft.artifactPayload && stringAtPath(draft.artifactPayload, path));
}
