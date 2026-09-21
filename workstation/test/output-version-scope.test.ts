import { describe, expect, it, vi } from "vitest";

import {
  editSessionForScopedDocument,
  loadScopedDocumentVersions,
  outputVersionsForScope,
} from "../components/workstation/recruiter-workstation";
import type { CandidateCase, CaseDocument, DocumentVersion, StoredDocumentKind } from "../lib/workstation-types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function document(kind: StoredDocumentKind, revision = 1): CaseDocument {
  return { kind, revision, content: `${kind} ${revision}`, updatedAt: "2026-09-21T12:00:00.000Z" };
}

function candidateCase(id: string): CandidateCase {
  return {
    id,
    roleId: "role-1",
    candidateId: `candidate-${id}`,
    status: "active",
    notes: "",
    notesDrawingSvg: "",
    notesFont: "System",
    notesSize: 20,
    revision: 1,
    facts: [],
    assistant: { missing: [], askNext: [], fitConcern: "", nextAction: "" },
    externalRefs: {},
    documents: {
      resume: document("resume"),
      write_up: document("write_up"),
      submission: document("submission"),
      email: document("email"),
      loxo_update: document("loxo_update"),
    },
    sources: [],
    updatedAt: "2026-09-21T12:00:00.000Z",
  };
}

describe("output version request scope", () => {
  it("ignores candidate A versions that resolve after the UI switches to candidate B", async () => {
    const pending = deferred<DocumentVersion[]>();
    const versionA: DocumentVersion = {
      kind: "submission",
      revision: 1,
      content: { name: "Candidate A" },
      sourceRefs: ["candidate-a-source"],
      capabilityRunId: "candidate-a-run",
      origin: "generated",
      createdAt: "2026-09-21T12:00:00.000Z",
    };
    let active = { caseId: "case-a", kind: "submission" as const };
    const commit = vi.fn();
    const listVersions = vi.fn(() => pending.promise);

    const loading = loadScopedDocumentVersions(
      listVersions,
      { caseId: "case-a", kind: "submission" },
      (request) => request.caseId === active.caseId && request.kind === active.kind,
      commit,
    );
    active = { caseId: "case-b", kind: "submission" };
    pending.resolve([versionA]);

    const staleState = await loading;
    expect(commit).not.toHaveBeenCalled();
    expect(outputVersionsForScope(staleState, "case-b", "submission")).toEqual([]);
    expect(editSessionForScopedDocument(candidateCase("case-b"), "submission", staleState)).toBeNull();
  });
});
