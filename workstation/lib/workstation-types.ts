import type { OutputData } from "@editorjs/editorjs";

export const DOCUMENT_KINDS = ["resume", "write_up", "submission", "email"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export type SaveState = "saved" | "saving" | "unsaved" | "failed";

export type RoleRecord = { id: string; title: string; client: string | null; status: string };
export type CandidateRecord = { id: string; name: string; currentTitle: string | null };
export type FactStatus = "proposed" | "confirmed" | "conflicted" | "unavailable";
export type CandidateFact = { key: string; value: string | null; status: FactStatus; sourceId: string | null; confirmedAt: string | null };
export type AssistantState = { missing: string[]; askNext: string[]; fitConcern: string; nextAction: string };
export type SubmissionDocument = {
  name: string; title: string; compensationTarget: string; currentCompensation: string;
  vacation: string; location: string; workStatus: string; interviewAvailability: string;
  startDateNotice: string; reasonForLeaving: string; profileSummary: string;
};
export type CaseDocument = { kind: DocumentKind; revision: number; content: OutputData | string | SubmissionDocument; updatedAt: string };
export type CaseSource = { id: string; kind: string; filename: string; contentType: string; sizeBytes: number; sha256: string; captureTime: string; reviewStatus: string };
export type CandidateCase = {
  id: string; roleId: string; candidateId: string; status: string; notes: string;
  notesFont: string; notesSize: number; revision: number; facts: CandidateFact[];
  assistant: AssistantState; externalRefs: Record<string, string>;
  documents: Record<DocumentKind, CaseDocument>; sources: CaseSource[]; updatedAt: string;
};
export type ConnectorCapability = { id: string; label: string; status: "available" | "not_connected" | "unsupported"; detail: string };
export type WorkspacePayload = { roles: RoleRecord[]; candidates: CandidateRecord[]; cases: CandidateCase[]; connectors: ConnectorCapability[] };

export const EMPTY_RESUME: OutputData = { time: 0, version: "2.31.0", blocks: [] };
export const EMPTY_SUBMISSION: SubmissionDocument = {
  name: "", title: "", compensationTarget: "", currentCompensation: "", vacation: "",
  location: "", workStatus: "", interviewAvailability: "", startDateNotice: "",
  reasonForLeaving: "", profileSummary: "",
};
