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
  if (kind === "capability_runs") return {};
  return "";
}

/**
 * Complete a stored document set without rewriting any document already saved.
 * Revision-zero placeholders let pre-existing cases opt into newly introduced
 * document kinds on first save while legacy documents keep their content.
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
