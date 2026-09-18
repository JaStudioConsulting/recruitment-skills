import {
  EMPTY_RESUME,
  EMPTY_SUBMISSION,
  STORED_DOCUMENT_KINDS,
  type CaseDocument,
  type StoredDocumentKind,
} from "./workstation-types";

export function defaultDocumentContent(
  kind: StoredDocumentKind,
): CaseDocument["content"] {
  if (kind === "resume") return EMPTY_RESUME;
  if (kind === "submission") return EMPTY_SUBMISSION;
  return "";
}

/**
 * Complete a stored document set without rewriting any document already saved.
 * The revision-zero Loxo placeholder lets pre-existing cases opt into the new
 * output on first save while all legacy documents keep their content/revision.
 */
export function completeStoredDocuments(
  documents: readonly CaseDocument[],
): Record<StoredDocumentKind, CaseDocument> {
  const map = {} as Record<StoredDocumentKind, CaseDocument>;
  for (const kind of STORED_DOCUMENT_KINDS) {
    const existing = documents.find((document) => document.kind === kind);
    map[kind] = existing ?? {
      kind,
      revision: 0,
      content: defaultDocumentContent(kind),
      updatedAt: "",
    };
  }
  return map;
}
