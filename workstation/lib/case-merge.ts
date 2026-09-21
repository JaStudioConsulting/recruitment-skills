import { STORED_DOCUMENT_KINDS, type CandidateCase } from "./workstation-types";

/**
 * Merge overlapping hydrated responses without allowing an older response to
 * regress a document revision already observed by the client.
 */
export function mergeCandidateCaseSnapshots(
  current: CandidateCase | null,
  incoming: CandidateCase,
): CandidateCase {
  if (!current || current.id !== incoming.id) return incoming;

  // Source uploads and reviews return a fully hydrated case without advancing
  // the optimistic case revision. If one of those responses arrives after a
  // notes/status save, keep the newer case-owned draft fields while still
  // accepting the response's source, assistant, and document changes.
  const currentCaseStateIsNewer = current.revision > incoming.revision;

  const documents = { ...incoming.documents };
  for (const kind of STORED_DOCUMENT_KINDS) {
    if (current.documents[kind].revision > incoming.documents[kind].revision) {
      documents[kind] = current.documents[kind];
    }
  }

  const sources = [...incoming.sources];
  const sourceIds = new Set(sources.map((source) => source.id));
  for (const source of current.sources) {
    if (!sourceIds.has(source.id)) sources.push(source);
  }

  return {
    ...incoming,
    ...(currentCaseStateIsNewer ? {
      status: current.status,
      notes: current.notes,
      notesDrawingSvg: current.notesDrawingSvg,
      notesFont: current.notesFont,
      notesSize: current.notesSize,
      revision: current.revision,
    } : {}),
    documents,
    sources,
    updatedAt: current.updatedAt > incoming.updatedAt ? current.updatedAt : incoming.updatedAt,
  };
}
