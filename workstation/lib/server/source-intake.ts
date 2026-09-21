import type {
  SourceKind,
  SourceLifecycleStatus,
} from "@/lib/workstation-types";
import {
  inferSourceKindFromFilename,
  inferSourceKindFromText,
  type SourceClassificationMethod,
} from "../source-intake";

export { canReviewSource, normalizeSourceLifecycleStatus, sourceIsUsable } from "../source-intake";
export type { SourceClassificationMethod } from "../source-intake";

export const MAX_PARSED_TEXT_BYTES = 2 * 1024 * 1024;
export const MAX_PARSABLE_DOCUMENT_BYTES = 10 * 1024 * 1024;

const TEXT_CONTENT_TYPES = new Set(["text/plain", "text/markdown"]);

export type SourceIntakeResult = {
  kind: SourceKind;
  lifecycleStatus: SourceLifecycleStatus;
  parsedText: string | null;
  classificationMethod: SourceClassificationMethod | null;
};

export function classifyParsedSourceContent(input: {
  parsedText: string | null;
  filename: string;
  requestedKind?: SourceKind;
}): SourceIntakeResult {
  const requestedKind = input.requestedKind ?? "other";
  const inferredFromFilename = inferSourceKindFromFilename(input.filename);
  const initialKind = requestedKind !== "other"
    ? requestedKind
    : inferredFromFilename ?? "other";
  const initialMethod: SourceClassificationMethod = requestedKind !== "other"
    ? "explicit"
    : inferredFromFilename
      ? "filename"
      : "uncertain";
  const parsedText = input.parsedText?.trim() || null;

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

  const inferredFromContent = inferSourceKindFromText(parsedText);
  if (inferredFromContent && inferredFromContent !== inferredFromFilename) {
    return {
      kind: inferredFromContent,
      lifecycleStatus: "classified",
      parsedText,
      classificationMethod: "content",
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

export function inspectSourceContent(input: {
  bytes: ArrayBuffer;
  contentType: string;
  filename: string;
  requestedKind?: SourceKind;
}): SourceIntakeResult {
  if (!TEXT_CONTENT_TYPES.has(input.contentType) || input.bytes.byteLength > MAX_PARSED_TEXT_BYTES) {
    return classifyParsedSourceContent({
      parsedText: null,
      filename: input.filename,
      requestedKind: input.requestedKind,
    });
  }

  let parsedText: string;
  try {
    parsedText = new TextDecoder("utf-8", { fatal: true }).decode(input.bytes).trim();
  } catch {
    parsedText = "";
  }
  return classifyParsedSourceContent({
    parsedText,
    filename: input.filename,
    requestedKind: input.requestedKind,
  });
}

export async function inspectUploadedSourceContent(input: {
  bytes: ArrayBuffer;
  contentType: string;
  filename: string;
  requestedKind?: SourceKind;
}): Promise<SourceIntakeResult> {
  if (TEXT_CONTENT_TYPES.has(input.contentType)) return inspectSourceContent(input);
  if (input.bytes.byteLength > MAX_PARSABLE_DOCUMENT_BYTES) return inspectSourceContent(input);

  let parsedText: string | null = null;
  try {
    if (input.contentType === "application/pdf") {
      const { extractText } = await import("unpdf");
      // pdf.js transfers the supplied ArrayBuffer to its worker and detaches it.
      // Source intake still needs the original bytes for the subsequent R2 put,
      // so parsing must receive an owned copy rather than the upload buffer.
      const parseBytes = Uint8Array.from(new Uint8Array(input.bytes));
      const result = await extractText(parseBytes, { mergePages: true });
      parsedText = result.text;
    } else if (input.contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const mammoth = await import("mammoth");
      try {
        parsedText = (await mammoth.extractRawText({ arrayBuffer: input.bytes })).value;
      } catch (error) {
        if (typeof Buffer === "undefined") throw error;
        parsedText = (await mammoth.extractRawText({ buffer: Buffer.from(input.bytes) })).value;
      }
    }
  } catch {
    return inspectSourceContent(input);
  }

  if (!parsedText?.trim()) return inspectSourceContent(input);
  return classifyParsedSourceContent({
    parsedText,
    filename: input.filename,
    requestedKind: input.requestedKind,
  });
}
