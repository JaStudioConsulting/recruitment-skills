import type { SourceKind, SourceLifecycleStatus } from "@/lib/workstation-types";

export type SourceClassificationMethod = "explicit" | "filename" | "content" | "manual" | "uncertain";
export type JobIdentityProposal = {
  title: string;
  client: string;
  confidence: "high" | "medium" | "low";
  autoCreateEligible: boolean;
  evidence: string[];
};

export type PastedSourceProposal = {
  kind: SourceKind;
  filename: string;
  job: JobIdentityProposal | null;
};

export type UploadedSourceProposal = PastedSourceProposal & {
  originalFilename: string;
  parsedText: string | null;
  lifecycleStatus: SourceLifecycleStatus;
  classificationMethod: SourceClassificationMethod | null;
};

type JobIdentity = { title?: string | null; client?: string | null };

function normalizedIdentity(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizedJobIdentityKey(identity: JobIdentity) {
  const title = normalizedIdentity(identity.title);
  if (!title) return null;
  return JSON.stringify([title, normalizedIdentity(identity.client)]);
}

export function jobIdentitiesMatch(existing: JobIdentity, proposed: JobIdentity) {
  const proposedKey = normalizedJobIdentityKey(proposed);
  return proposedKey !== null && normalizedJobIdentityKey(existing) === proposedKey;
}

const ROLE_TERMS = /\b(?:manager|director|supervisor|lead|engineer|technician|mechanic|millwright|electrician|accountant|controller|analyst|coordinator|recruiter|specialist|operator|machinist|welder|planner|estimator|developer|administrator|executive|president|officer|partner|consultant|representative)\b/i;
const SECTION_HEADING = /^(?:job description|about(?: the role| us)?|overview|summary|responsibilities|duties|qualifications|requirements|skills|benefits|compensation|what you(?:'|’)ll do|who you are)$/i;
const COMPANY_SUFFIX = /\b(?:inc\.?|incorporated|ltd\.?|limited|corp\.?|corporation|company|co\.?|group|holdings|partners|manufacturing|industries|solutions|services|systems|technologies)\b/i;
const LOCATION_WORDS = /\b(?:ontario|canada|remote|hybrid|on-site|onsite|toronto|mississauga|brampton|hamilton|oakville|vaughan|markham|scarborough|burlington|kitchener|waterloo|guelph|london)\b/i;

function countMatches(text: string, patterns: readonly RegExp[]) {
  return patterns.reduce((total, pattern) => total + Number(pattern.test(text)), 0);
}

export function inferSourceKindFromFilename(filename: string): SourceKind | null {
  const normalized = filename.toLowerCase().replace(/[._-]+/g, " ");
  if (/\b(job description|position description|jd)\b/.test(normalized)) return "job_description";
  if (/\b(transcript|call transcript|otter)\b/.test(normalized)) return "transcript";
  if (/\b(call notes?|interview notes?|screen notes?)\b/.test(normalized)) return "call_notes";
  if (/\b(resume|résumé|curriculum vitae|cv)\b/.test(normalized)) return "resume";
  return null;
}

export function inferSourceKindFromText(text: string): SourceKind | null {
  const sample = text.slice(0, 120_000).toLowerCase();
  const jobSignals = countMatches(sample, [
    /\bjob description\b/,
    /\bresponsibilities\b/,
    /\bqualifications\b/,
    /\brequirements\b/,
    /\babout the role\b/,
  ]);
  if (jobSignals >= 3) return "job_description";

  const transcriptSpeakers = text.match(/^(?:speaker\s*\d+|[A-Z][A-Za-z .'-]{1,35}):/gm)?.length ?? 0;
  const transcriptTimestamps = text.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g)?.length ?? 0;
  if (transcriptSpeakers >= 3 || transcriptTimestamps >= 4) return "transcript";

  const resumeSignals = countMatches(sample, [
    /\bprofessional (?:experience|summary)\b/,
    /\bwork experience\b/,
    /\beducation\b/,
    /\bcertifications?\b/,
    /\bcore competencies\b/,
    /\bskills\b/,
  ]);
  if (resumeSignals >= 3) return "resume";

  const callNoteSignals = countMatches(sample, [
    /\b(?:salary|compensation)\b/,
    /\bnotice period\b/,
    /\bstart date\b/,
    /\binterview availability\b/,
    /\breason for leaving\b/,
    /\bwork status\b/,
  ]);
  if (callNoteSignals >= 3) return "call_notes";
  return null;
}

export function normalizeSourceLifecycleStatus(value: string): SourceLifecycleStatus {
  if (value === "parsed" || value === "classified" || value === "reviewed") return value;
  return "uploaded";
}

export function canReviewSource(lifecycleStatus: SourceLifecycleStatus, requestedKind?: SourceKind) {
  return lifecycleStatus === "classified" || (lifecycleStatus === "parsed" && requestedKind !== undefined);
}

export function sourceIsUsable(source: { parsedText: string | null; lifecycleStatus: string; classificationMethod: string | null }) {
  if (!source.parsedText?.trim()) return false;
  if (source.lifecycleStatus === "reviewed") return true;
  return source.lifecycleStatus === "classified" &&
    (source.classificationMethod === "explicit" || source.classificationMethod === "filename" || source.classificationMethod === "content");
}

function cleanHeadingLine(line: string) {
  return line.trim().replace(/^#{1,6}\s+/, "").replace(/^[-*•]\s+/, "").trim();
}

function labelledValue(lines: string[], labels: RegExp) {
  for (const line of lines.slice(0, 50)) {
    const match = cleanHeadingLine(line).match(labels);
    if (match?.[1]?.trim()) return { value: match[1].trim(), evidence: line.trim() };
  }
  return null;
}

function looksLikeRole(value: string) {
  return value.length <= 120 && ROLE_TERMS.test(value) && !SECTION_HEADING.test(value) && !/https?:\/\//i.test(value);
}

function looksLikeCompany(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  if (!value || value.length > 120 || words.length > 12 || SECTION_HEADING.test(value) || ROLE_TERMS.test(value)) return false;
  if (/https?:\/\//i.test(value) || /^\$?\d/.test(value) || LOCATION_WORDS.test(value) || /,\s*[A-Z]{2}\b/.test(value)) return false;
  return COMPANY_SUFFIX.test(value) || words.length >= 2;
}

function headerPair(lines: string[]) {
  const headings = lines.slice(0, 12).map((raw) => ({ raw: raw.trim(), value: cleanHeadingLine(raw) })).filter((item) => item.value);
  const titleIndex = headings.findIndex((item) => looksLikeRole(item.value) && !/:/.test(item.value));
  if (titleIndex < 0) return null;
  const company = headings.slice(titleIndex + 1, titleIndex + 4).find((item) => looksLikeCompany(item.value));
  if (!company) return null;
  return { title: headings[titleIndex], company };
}

function safeFilenamePart(value: string) {
  return value.replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

function personHeading(lines: string[]) {
  const value = cleanHeadingLine(lines.find((line) => line.trim()) ?? "");
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5 || /\d|[:@/]/.test(value) || SECTION_HEADING.test(value) || ROLE_TERMS.test(value)) return "";
  return value;
}

export function proposePastedSource(text: string): PastedSourceProposal {
  const normalized = text.trim();
  const lines = normalized.split(/\r?\n/);
  const kind = inferSourceKindFromText(normalized) ?? "other";
  let job: JobIdentityProposal | null = null;

  if (kind === "job_description") {
    const labelledTitle = labelledValue(lines, /^(?:job title|position title|role|position)\s*:\s*(.+)$/i);
    const labelledClient = labelledValue(lines, /^(?:company|client|employer|organization)\s*:\s*(.+)$/i);
    const pair = headerPair(lines);
    const title = labelledTitle?.value ?? pair?.title.value ?? "";
    const client = labelledClient?.value ?? pair?.company.value ?? "";
    const evidence = [labelledTitle?.evidence ?? pair?.title.raw, labelledClient?.evidence ?? pair?.company.raw].filter((value): value is string => Boolean(value));
    const confidence = title && client ? "high" : title || client ? "medium" : "low";
    job = { title, client, confidence, autoCreateEligible: confidence === "high", evidence };
  }

  let filename = "Pasted source.txt";
  if (kind === "job_description") {
    const identity = [safeFilenamePart(job?.client ?? ""), safeFilenamePart(job?.title ?? "")].filter(Boolean).join(" - ");
    filename = identity ? `${identity} - Job description.txt` : "Pasted job description.txt";
  } else if (kind === "resume") {
    const name = safeFilenamePart(personHeading(lines));
    filename = name ? `${name} - Resume.txt` : "Pasted resume.txt";
  } else if (kind === "transcript") filename = "Pasted transcript.txt";
  else if (kind === "call_notes") filename = "Pasted call notes.txt";

  return { kind, filename, job };
}
