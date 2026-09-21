import type { CapabilityPreparationOptions } from "./capabilities/prepare";
import type {
  ArtifactVisualQaReview,
  ArtifactVisualQaReviewResult,
  CaseArtifactSummary,
} from "./artifact-browser";
import type { CapabilityPreparationResponse } from "./server/capability-service";
import type { CapabilityExecutionResponse } from "./server/capability-execution-service";
import type { CapabilityRunRecord } from "./server/capability-run-repository";
import type { UploadedSourceProposal } from "./source-intake";
import type { CandidateCase, CandidateRecord, CandidateSourceIntakeResult, CaseDocument, DocumentVersion, JobSource, RoleRecord, SourceKind, StoredDocumentKind, WorkspacePayload } from "./workstation-types";

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
  saveDocument: (caseId: string, kind: StoredDocumentKind, input: { expectedRevision: number; content: CaseDocument["content"]; origin?: "generated" | "edited"; sourceRefs?: string[]; capabilityRunId?: string | null }) => request<CaseDocument>(`/api/cases/${caseId}/documents/${kind}`, { method: "PUT", body: JSON.stringify(input) }),
  listDocumentVersions: (caseId: string, kind: StoredDocumentKind) => request<DocumentVersion[]>(`/api/cases/${caseId}/documents/${kind}/versions`),
  prepareCapability: (caseId: string, capabilityId: string, input: CapabilityPreparationOptions) => request<CapabilityPreparationResponse>(`/api/cases/${caseId}/capabilities/${capabilityId}/prepare`, { method: "POST", body: JSON.stringify(input) }),
  listCapabilityRuns: (caseId: string) => request<CapabilityRunRecord[]>(`/api/cases/${caseId}/capability-runs`),
  getCapabilityRun: (caseId: string, runId: string) => request<CapabilityRunRecord>(`/api/cases/${caseId}/capability-runs/${runId}`),
  executeCapabilityRun: (caseId: string, runId: string) => request<CapabilityExecutionResponse>(`/api/cases/${caseId}/capability-runs/${runId}/execute`, { method: "POST", body: "{}" }),
  cancelCapability: (caseId: string, runId: string) => request<CapabilityRunRecord>(`/api/cases/${caseId}/capability-runs/${runId}/cancel`, { method: "POST", body: "{}" }),
  listCaseArtifacts: (caseId: string) => request<CaseArtifactSummary[]>(`/api/cases/${caseId}/artifacts/stored`),
  reviewCaseArtifact: (
    caseId: string,
    artifactId: string,
    review: ArtifactVisualQaReview,
  ) => request<ArtifactVisualQaReviewResult>(
    `/api/cases/${caseId}/artifacts/stored/${artifactId}/visual-qa`,
    { method: "PATCH", body: JSON.stringify(review) },
  ),
  async proposeSource(file: File): Promise<UploadedSourceProposal> {
    const body = new FormData();
    body.set("file", file);
    const response = await fetch("/api/intake/source", { method: "POST", body });
    if (!response.ok) {
      const error: unknown = await response.json().catch(() => null);
      throw new Error(error && typeof error === "object" && "error" in error && typeof error.error === "string" ? error.error : "The source could not be parsed.");
    }
    return response.json() as Promise<UploadedSourceProposal>;
  },
  async intakeCandidateResume(input: {
    roleId: string;
    name: string;
    currentTitle: string;
    file: File;
  }): Promise<CandidateSourceIntakeResult> {
    const body = new FormData();
    body.set("roleId", input.roleId);
    body.set("name", input.name);
    body.set("currentTitle", input.currentTitle);
    body.set("kind", "resume");
    body.set("file", input.file);
    const response = await fetch("/api/intake/candidate-source", { method: "POST", body });
    if (!response.ok) {
      const error: unknown = await response.json().catch(() => null);
      throw new Error(error && typeof error === "object" && "error" in error && typeof error.error === "string"
        ? error.error
        : "The candidate and resume could not be saved.");
    }
    return response.json() as Promise<CandidateSourceIntakeResult>;
  },
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
  async uploadJobSources(roleId: string, files: readonly File[], kinds: readonly SourceKind[] = []): Promise<JobSource[]> {
    if (kinds.length && kinds.length !== files.length) throw new Error("Source kinds must match the uploaded files.");
    const body = new FormData();
    for (const file of files) body.append("files", file);
    for (const kind of kinds) body.append("kinds", kind);
    const response = await fetch(`/api/roles/${roleId}/sources`, { method: "POST", body });
    if (!response.ok) {
      const error: unknown = await response.json().catch(() => null);
      throw new Error(error && typeof error === "object" && "error" in error && typeof error.error === "string" ? error.error : "Job source upload failed.");
    }
    return response.json() as Promise<JobSource[]>;
  },
  reviewJobSource: (roleId: string, sourceId: string, kind?: SourceKind) => request<JobSource[]>(`/api/roles/${roleId}/sources/${sourceId}`, {
    method: "PATCH",
    body: JSON.stringify({ lifecycleStatus: "reviewed", ...(kind ? { kind } : {}) }),
  }),
};
