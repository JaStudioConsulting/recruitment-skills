import type { SourceKind, SourceLifecycleStatus } from "@/lib/workstation-types";

export type SourceClassificationMethod = "explicit" | "filename" | "content" | "manual" | "uncertain";
export type JobIdentityProposal = {
  title: string;
  client: string;
  confidence: "high" | "medium" | "low";
  autoCreateEligible: boolean;
  evidence: string[];
};

export type CandidateIdentityProposal = {
  name: string;
  currentTitle: string;
  confidence: "high" | "medium" | "low";
  evidence: string[];
};

export type PastedSourceProposal = {
  kind: SourceKind;
  filename: string;
  job: JobIdentityProposal | null;
  candidate: CandidateIdentityProposal | null;
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

function normalizedTitleIdentity(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/#/g, " sharp ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedClientIdentity(value: string | null | undefined) {
  return normalizedIdentity(value)
    .replace(/\b(?:inc|incorporated|ltd|limited|corp|corporation|co|company)$/, "")
    .trim();
}

export function normalizedJobIdentityKey(identity: JobIdentity) {
  const title = normalizedTitleIdentity(identity.title);
  const client = normalizedClientIdentity(identity.client);
  if (!title || !client) return null;
  return JSON.stringify([title, client]);
}

export function jobIdentitiesMatch(existing: JobIdentity, proposed: JobIdentity) {
  const proposedKey = normalizedJobIdentityKey(proposed);
  return proposedKey !== null && normalizedJobIdentityKey(existing) === proposedKey;
}

const ROLE_TERMS = /\b(?:manager|director|supervisor|lead|engineer|technician|mechanic|millwright|electrician|accountant|controller|analyst|coordinator|recruiter|specialist|operator|machinist|welder|planner|estimator|developer|administrator|executive|president|officer|partner|consultant|representative)\b/i;
const SECTION_HEADING = /^(?:job description|(?:job|position|role) (?:description|overview|summary)|about(?: the role| us)?|overview|summary|(?:key )?responsibilities|duties|(?:required |minimum |preferred )?qualifications|(?:job )?requirements|skills|benefits|compensation|what you(?:'|’)ll do|who you are)$/i;
const COMPANY_SUFFIX = /\b(?:inc\.?|incorporated|ltd\.?|limited|corp\.?|corporation|company|co\.?|group|holdings|partners|manufacturing|industries|solutions|services|systems|technologies)\.?$/i;
const LOCATION_WORDS = /\b(?:ontario|canada|remote|hybrid|on-site|onsite|toronto|mississauga|brampton|hamilton|oakville|vaughan|markham|scarborough|burlington|kitchener|waterloo|guelph|london)\b/i;
const TRANSCRIPT_SPEAKER_LABEL = /^(speaker\s*\d+|[A-Z][A-Za-z .'-]{1,35})\s*(?:\((\d{1,2}:\d{2}(?::\d{2})?)\))?\s*:\s*\S/i;
const TRANSCRIPT_TIMESTAMP_PREFIX = /^(?:\[\s*)?\d{1,2}:\d{2}(?::\d{2})?(?:\s*\])?(?:\s*[-–—]\s*|\s+)/;
const CALL_NOTE_FIELD_LABEL = /^(?:name|title|compensation(?: target)?|target compensation|current compensation|salary(?: expectation)?|current salary|vacation|location|work status|work authorization|interview availability|availability to interview|start date(?:\s*\/\s*notice(?: period)?)?|notice(?: period)?|reason for (?:leaving|change|exploring)|profile summary|industry|specialty|niche|misc(?:ellaneous)? details)\s*:/i;
const JOB_IDENTITY_FIELD_LABEL = /^(?:job title|position title|role|position|company|client|employer|organization|department)\s*:/i;
const DOCUMENT_FIELD_LABEL = /^(?:summary|professional summary|experience|professional experience|work experience|education|skills|core competencies|certifications?|qualifications?|requirements?|responsibilities|duties|benefits)\s*:/i;
const NON_COMPANY_IDENTITY = /^(?:confidential|undisclosed|not disclosed|not provided|unknown|n\/?a|our client|the client|client|our company|the company|company)$/i;
const NON_PERSON_IDENTITY = /^(?:professional (?:summary|profile)|curriculum vitae|resume(?:\s*\/\s*cv)?|cv|executive summary)$/i;
const GENERIC_PROSE_LEAD = /^(?:we(?:'re| are| provide| offer| seek| need| have)|you(?:'re| are| will|'ll)|our (?:client|company|team|organization)|the (?:role|position|client|company|team|organization)|this (?:role|position|company)|an? (?:leading|growing|successful)|join|seeking|looking|responsible|reporting)\b/i;

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
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const transcriptTurns = lines.flatMap((line) => {
    const withoutTimestamp = line.replace(TRANSCRIPT_TIMESTAMP_PREFIX, "");
    const match = withoutTimestamp.match(TRANSCRIPT_SPEAKER_LABEL);
    const fieldLabel = `${match?.[1] ?? ""}:`;
    if (!match ||
        CALL_NOTE_FIELD_LABEL.test(fieldLabel) ||
        JOB_IDENTITY_FIELD_LABEL.test(fieldLabel) ||
        DOCUMENT_FIELD_LABEL.test(fieldLabel) ||
        SECTION_HEADING.test(match[1])) return [];
    return [{
      speaker: match[1].toLowerCase().replace(/\s+/g, " ").trim(),
      timestamped: withoutTimestamp !== line || Boolean(match[2]),
    }];
  });
  const speakerCounts = new Map<string, number>();
  for (const turn of transcriptTurns) {
    speakerCounts.set(turn.speaker, (speakerCounts.get(turn.speaker) ?? 0) + 1);
  }
  const turnChanges = transcriptTurns.slice(1)
    .filter((turn, index) => turn.speaker !== transcriptTurns[index].speaker)
    .length;
  const repeatedSpeakerStructure = transcriptTurns.length >= 3 &&
    speakerCounts.size >= 2 &&
    [...speakerCounts.values()].some((count) => count >= 2) &&
    turnChanges >= 2;
  const timestampedDialogueLines = lines.filter((line) => TRANSCRIPT_TIMESTAMP_PREFIX.test(line)).length;
  if (repeatedSpeakerStructure || timestampedDialogueLines >= 4) return "transcript";

  const jobSignals = countMatches(sample, [
    /\bjob description\b/,
    /\bresponsibilities\b/,
    /\bqualifications\b/,
    /\brequirements\b/,
    /\babout the role\b/,
    /\bwhat you(?:'|’)ll do\b/,
    /\bduties\b/,
    /\bwho you are\b/,
    /\bskills\b/,
  ]);

  const resumeSignals = countMatches(sample, [
    /\bprofessional (?:experience|summary)\b/,
    /\bwork experience\b/,
    /\bexperience\b/,
    /\beducation\b/,
    /\bcertifications?\b/,
    /\bcore competencies\b/,
    /\bskills\b/,
  ]);
  const strongResumeStructure = /\b(?:professional |work )?experience\b/.test(sample) &&
    /\beducation\b/.test(sample) &&
    /\b(?:skills|core competencies|professional (?:summary|profile))\b/.test(sample);
  const strongJobHeader = !personHeading(lines) && Boolean(headerIdentity(lines)?.company);
  if (jobSignals >= 3 && strongJobHeader) return "job_description";
  if (resumeSignals >= 3 && (jobSignals < 3 || (strongResumeStructure && resumeSignals >= jobSignals))) return "resume";
  if (jobSignals >= 3) return "job_description";
  if (resumeSignals >= 3) return "resume";

  const callNoteSignals = countMatches(sample, [
    /\b(?:salary|compensation)\b/,
    /\bnotice period\b/,
    /\bstart date\b/,
    /\binterview availability\b/,
    /\breason for leaving\b/,
    /\bwork status\b/,
  ]);
  const callNoteFields = lines.filter((line) => CALL_NOTE_FIELD_LABEL.test(line)).length;
  if (callNoteSignals >= 3 || callNoteFields >= 3) return "call_notes";
  return null;
}

export function normalizeSourceLifecycleStatus(value: string): SourceLifecycleStatus {
  if (value === "parsed" || value === "classified" || value === "reviewed") return value;
  return "uploaded";
}

export function canReviewSource(lifecycleStatus: SourceLifecycleStatus, requestedKind?: SourceKind) {
  return lifecycleStatus === "classified" ||
    ((lifecycleStatus === "parsed" || lifecycleStatus === "reviewed") && requestedKind !== undefined);
}

export function sourceIsUsable(source: { parsedText: string | null; lifecycleStatus: string; classificationMethod: string | null }) {
  if (!source.parsedText?.trim()) return false;
  if (source.lifecycleStatus === "reviewed") return true;
  return source.lifecycleStatus === "classified" &&
    (source.classificationMethod === "explicit" || source.classificationMethod === "filename" || source.classificationMethod === "content");
}

export function sourceEvidenceRef(source: {
  id: string;
  sha256: string;
  kind: string;
  lifecycleStatus: string;
  reviewStatus: string;
  classificationMethod: string | null;
}) {
  return [
    source.id,
    source.sha256,
    source.kind,
    source.lifecycleStatus,
    source.reviewStatus,
    source.classificationMethod ?? "unknown",
  ].join(":");
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

function looksLikeExplicitCompany(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  if (!value || value.length > 120 || words.length > 12 || SECTION_HEADING.test(value) || NON_COMPANY_IDENTITY.test(value)) return false;
  if (/https?:\/\//i.test(value) || /^\$?\d/.test(value) || looksLikeRole(value) || GENERIC_PROSE_LEAD.test(value)) return false;
  return true;
}

function looksLikeStrongUnlabelledCompany(value: string) {
  if (!looksLikeExplicitCompany(value) || !COMPANY_SUFFIX.test(value)) return false;
  return !LOCATION_WORDS.test(value) && !/,\s*[A-Z]{2}\b/.test(value);
}

function headerIdentity(lines: string[]) {
  const headings = lines.slice(0, 12).map((raw) => ({ raw: raw.trim(), value: cleanHeadingLine(raw) })).filter((item) => item.value);
  const titleIndex = headings.findIndex((item) => looksLikeRole(item.value) && !/:/.test(item.value));
  if (titleIndex < 0) return null;
  const company = [
    ...headings.slice(Math.max(0, titleIndex - 2), titleIndex).reverse(),
    ...headings.slice(titleIndex + 1, titleIndex + 4),
  ].find((item) => looksLikeStrongUnlabelledCompany(item.value));
  return { title: headings[titleIndex], company };
}

function safeFilenamePart(value: string) {
  return value.replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

function personHeading(lines: string[]) {
  const value = cleanHeadingLine(lines.find((line) => line.trim()) ?? "");
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5 || /\d|[:@/]/.test(value) || SECTION_HEADING.test(value) || NON_PERSON_IDENTITY.test(value) || ROLE_TERMS.test(value) || COMPANY_SUFFIX.test(value)) return "";
  return value;
}

function candidateIdentity(lines: string[]) {
  const headings = lines
    .slice(0, 16)
    .map((raw) => ({ raw: raw.trim(), value: cleanHeadingLine(raw) }))
    .filter((item) => item.value);
  const labelledNameCandidate = labelledValue(lines, /^(?:candidate name|name)\s*:\s*(.+)$/i);
  const labelledName = labelledNameCandidate && !NON_PERSON_IDENTITY.test(labelledNameCandidate.value)
    ? labelledNameCandidate
    : null;
  const labelledTitle = labelledValue(lines, /^(?:current title|title|headline)\s*:\s*(.+)$/i);
  const headingName = personHeading(lines);
  const name = labelledName?.value ?? headingName;
  const nameIndex = headingName ? headings.findIndex((item) => item.value === headingName) : -1;
  const nearbyTitle = nameIndex >= 0
    ? headings.slice(nameIndex + 1, nameIndex + 4).find((item) => looksLikeRole(item.value) && !/:/.test(item.value))
    : null;
  const currentTitle = labelledTitle && looksLikeRole(labelledTitle.value)
    ? labelledTitle.value
    : nearbyTitle?.value ?? "";
  const evidence = [labelledName?.evidence ?? (headingName || null), labelledTitle?.evidence ?? nearbyTitle?.raw]
    .filter((value): value is string => Boolean(value));
  const confidence = name && currentTitle ? "high" : name ? "medium" : "low";
  return { name, currentTitle, confidence, evidence } satisfies CandidateIdentityProposal;
}

export function proposePastedSource(text: string): PastedSourceProposal {
  const normalized = text.trim();
  const lines = normalized.split(/\r?\n/);
  const kind = inferSourceKindFromText(normalized) ?? "other";
  let job: JobIdentityProposal | null = null;
  let candidate: CandidateIdentityProposal | null = null;

  if (kind === "job_description") {
    const labelledTitleCandidate = labelledValue(lines, /^(?:job title|position title|role|position)\s*:\s*(.+)$/i);
    const labelledClientCandidate = labelledValue(lines, /^(?:company|client|employer|organization)\s*:\s*(.+)$/i);
    const labelledTitle = labelledTitleCandidate && looksLikeRole(labelledTitleCandidate.value) ? labelledTitleCandidate : null;
    const labelledClient = labelledClientCandidate && looksLikeExplicitCompany(labelledClientCandidate.value) ? labelledClientCandidate : null;
    const pair = headerIdentity(lines);
    const title = labelledTitle?.value ?? pair?.title.value ?? "";
    const client = labelledClient?.value ?? pair?.company?.value ?? "";
    const evidence = [labelledTitle?.evidence ?? pair?.title.raw, labelledClient?.evidence ?? pair?.company?.raw].filter((value): value is string => Boolean(value));
    const confidence = title && client ? "high" : title || client ? "medium" : "low";
    job = { title, client, confidence, autoCreateEligible: Boolean(title && client), evidence };
  }

  if (kind === "resume") candidate = candidateIdentity(lines);

  let filename = "Pasted source.txt";
  if (kind === "job_description") {
    const identity = [safeFilenamePart(job?.client ?? ""), safeFilenamePart(job?.title ?? "")].filter(Boolean).join(" - ");
    filename = identity ? `${identity} - Job description.txt` : "Pasted job description.txt";
  } else if (kind === "resume") {
    const name = safeFilenamePart(personHeading(lines));
    filename = name ? `${name} - Resume.txt` : "Pasted resume.txt";
  } else if (kind === "transcript") filename = "Pasted transcript.txt";
  else if (kind === "call_notes") filename = "Pasted call notes.txt";

  return { kind, filename, job, candidate };
}
