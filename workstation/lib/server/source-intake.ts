import type {
  SourceKind,
  SourceLifecycleStatus,
} from "@/lib/workstation-types";

export const MAX_PARSED_TEXT_BYTES = 2 * 1024 * 1024;

const TEXT_CONTENT_TYPES = new Set(["text/plain", "text/markdown"]);

export type SourceClassificationMethod =
  | "explicit"
  | "filename"
  | "content"
  | "manual"
  | "uncertain";

export type SourceIntakeResult = {
  kind: SourceKind;
  lifecycleStatus: SourceLifecycleStatus;
  parsedText: string | null;
  classificationMethod: SourceClassificationMethod | null;
};

function filenameKind(filename: string): SourceKind | null {
  const normalized = filename.toLowerCase().replace(/[._-]+/g, " ");
  if (/\b(job description|position description|jd)\b/.test(normalized)) {
    return "job_description";
  }
  if (/\b(transcript|call transcript|otter)\b/.test(normalized)) {
    return "transcript";
  }
  if (/\b(call notes?|interview notes?|screen notes?)\b/.test(normalized)) {
    return "call_notes";
  }
  if (/\b(resume|résumé|curriculum vitae|cv)\b/.test(normalized)) {
    return "resume";
  }
  return null;
}

function countMatches(text: string, patterns: readonly RegExp[]) {
  return patterns.reduce((total, pattern) => total + Number(pattern.test(text)), 0);
}

function contentKind(text: string): SourceKind | null {
  const sample = text.slice(0, 120_000).toLowerCase();

  const transcriptSpeakers = text.match(/^(?:speaker\s*\d+|[A-Z][A-Za-z .'-]{1,35}):/gm)?.length ?? 0;
  const transcriptTimestamps = text.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g)?.length ?? 0;
  if (transcriptSpeakers >= 3 || transcriptTimestamps >= 4) return "transcript";

  const jobSignals = countMatches(sample, [
    /\bjob description\b/,
    /\bresponsibilities\b/,
    /\bqualifications\b/,
    /\brequirements\b/,
    /\babout the role\b/,
  ]);
  if (jobSignals >= 3) return "job_description";

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
  if (value === "parsed" || value === "classified" || value === "reviewed") {
    return value;
  }
  return "uploaded";
}

export function canReviewSource(
  lifecycleStatus: SourceLifecycleStatus,
  requestedKind?: SourceKind,
) {
  return lifecycleStatus === "classified" ||
    (lifecycleStatus === "parsed" && requestedKind !== undefined);
}

export function inspectSourceContent(input: {
  bytes: ArrayBuffer;
  contentType: string;
  filename: string;
  requestedKind?: SourceKind;
}): SourceIntakeResult {
  const requestedKind = input.requestedKind ?? "other";
  const inferredFromFilename = filenameKind(input.filename);
  const initialKind = requestedKind !== "other"
    ? requestedKind
    : inferredFromFilename ?? "other";
  const initialMethod: SourceClassificationMethod = requestedKind !== "other"
    ? "explicit"
    : inferredFromFilename
      ? "filename"
      : "uncertain";

  if (!TEXT_CONTENT_TYPES.has(input.contentType) || input.bytes.byteLength > MAX_PARSED_TEXT_BYTES) {
    return {
      kind: initialKind,
      lifecycleStatus: "uploaded",
      parsedText: null,
      classificationMethod: initialMethod,
    };
  }

  let parsedText: string;
  try {
    parsedText = new TextDecoder("utf-8", { fatal: true }).decode(input.bytes).trim();
  } catch {
    return {
      kind: initialKind,
      lifecycleStatus: "uploaded",
      parsedText: null,
      classificationMethod: initialMethod,
    };
  }

  if (!parsedText) {
    return {
      kind: initialKind,
      lifecycleStatus: "uploaded",
      parsedText: null,
      classificationMethod: initialMethod,
    };
  }

  if (requestedKind !== "other") {
    return {
      kind: requestedKind,
      lifecycleStatus: "classified",
      parsedText,
      classificationMethod: "explicit",
    };
  }

  if (inferredFromFilename) {
    return {
      kind: inferredFromFilename,
      lifecycleStatus: "classified",
      parsedText,
      classificationMethod: "filename",
    };
  }

  const inferredFromContent = contentKind(parsedText);
  return inferredFromContent
    ? {
        kind: inferredFromContent,
        lifecycleStatus: "classified",
        parsedText,
        classificationMethod: "content",
      }
    : {
        kind: "other",
        lifecycleStatus: "parsed",
        parsedText,
        classificationMethod: "uncertain",
      };
}
