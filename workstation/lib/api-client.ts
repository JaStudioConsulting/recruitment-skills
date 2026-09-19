import type { BrandResumeRequest, BrandResumeResult } from "./server/resume-builder";
import type { CapabilityRunRequest, CapabilityRunResponse, ManualArtifactBuildResponse } from "./capabilities/types";
import type { CandidateCase, CandidateRecord, CaseDocument, RoleRecord, SourceKind, StoredDocumentKind, WorkspacePayload } from "./workstation-types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : `Request failed with status ${response.status}.`;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export const workstationApi = {
  load: () => request<WorkspacePayload>("/api/workspace"),
  createRole: (input: { title: string; client: string }) => request<RoleRecord>("/api/roles", { method: "POST", body: JSON.stringify(input) }),
  createCandidate: (input: { name: string; currentTitle: string }) => request<CandidateRecord>("/api/candidates", { method: "POST", body: JSON.stringify(input) }),
  openCase: (input: { roleId: string; candidateId: string }) => request<CandidateCase>("/api/cases", { method: "POST", body: JSON.stringify(input) }),
  updateCase: (caseId: string, input: { expectedRevision: number; notes?: string; notesDrawingSvg?: string; notesFont?: string; notesSize?: number; status?: string }) => request<CandidateCase>(`/api/cases/${caseId}`, { method: "PATCH", body: JSON.stringify(input) }),
  brandResume: (caseId: string, input: BrandResumeRequest) => request<BrandResumeResult>(`/api/cases/${caseId}/brand-resume`, { method: "POST", body: JSON.stringify(input) }),
  saveDocument: (caseId: string, kind: StoredDocumentKind, input: { expectedRevision: number; content: CaseDocument["content"] }) => request<CaseDocument>(`/api/cases/${caseId}/documents/${kind}`, { method: "PUT", body: JSON.stringify(input) }),
  runCapability: (caseId: string, featureId: string, input: CapabilityRunRequest) => request<CapabilityRunResponse>(`/api/cases/${caseId}/capabilities/${featureId}`, { method: "POST", body: JSON.stringify(input) }),
  buildCapabilityArtifact: (caseId: string, featureId: string, payload: Record<string, unknown>) => request<ManualArtifactBuildResponse>(`/api/cases/${caseId}/artifacts/${featureId}`, { method: "POST", body: JSON.stringify({ payload }) }),
  cancelCapability: (caseId: string, runId: string) => request<{ status: "cancelled" | "not_running" }>(`/api/cases/${caseId}/capabilities/cancel/${runId}`, { method: "POST" }),
  async uploadSource(caseId: string, kind: SourceKind, file: File): Promise<CandidateCase> {
    const body = new FormData(); body.set("kind", kind); body.set("file", file);
    const response = await fetch(`/api/cases/${caseId}/sources`, { method: "POST", body });
    if (!response.ok) {
      const error: unknown = await response.json().catch(() => null);
      const message = error && typeof error === "object" && "error" in error && typeof error.error === "string"
        ? error.error
        : "Source upload failed.";
      throw new Error(message);
    }
    return response.json() as Promise<CandidateCase>;
  },
  async uploadSources(
    caseId: string,
    files: readonly File[],
    kinds: readonly SourceKind[] = [],
  ): Promise<CandidateCase> {
    if (kinds.length > 0 && kinds.length !== files.length) {
      throw new Error("Source kinds must match the uploaded files.");
    }
    const body = new FormData();
    for (const file of files) body.append("files", file);
    for (const kind of kinds) body.append("kinds", kind);
    const response = await fetch(`/api/cases/${caseId}/sources`, { method: "POST", body });
    if (!response.ok) {
      const error: unknown = await response.json().catch(() => null);
      const message = error && typeof error === "object" && "error" in error && typeof error.error === "string"
        ? error.error
        : "Source upload failed.";
      throw new Error(message);
    }
    return response.json() as Promise<CandidateCase>;
  },
  reviewSource: (
    caseId: string,
    sourceId: string,
    kind?: SourceKind,
  ) => request<CandidateCase>(`/api/cases/${caseId}/sources/${sourceId}`, {
    method: "PATCH",
    body: JSON.stringify({ lifecycleStatus: "reviewed", ...(kind ? { kind } : {}) }),
  }),
};
