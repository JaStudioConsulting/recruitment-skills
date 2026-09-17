export const LOGICAL_CAPABILITIES = [
  "gmail.read",
  "gmail.draft",
  "gmail.send",
  "calendar.read",
  "calendar.write",
  "drive.read",
  "drive.upload",
  "sheets.read",
  "tracker.write",
  "loxo.read",
  "loxo.write",
  "pdf.generate",
] as const;

export type LogicalCapability = (typeof LOGICAL_CAPABILITIES)[number];

export const LOGICAL_OPERATIONS = [
  "gmail.search",
  "gmail.read_message",
  "gmail.read_thread",
  "gmail.read_attachment",
  "gmail.create_draft",
  "gmail.update_draft",
  "gmail.send_draft",
  "calendar.search",
  "calendar.read_event",
  "calendar.read_availability",
  "calendar.create_event",
  "calendar.update_event",
  "drive.search",
  "drive.read_metadata",
  "drive.export",
  "drive.upload",
  "sheets.read_metadata",
  "sheets.read_range",
  "tracker.prepare_update",
  "tracker.execute_update",
  "loxo.read_job",
  "loxo.read_candidate",
  "loxo.read_person",
  "loxo.prepare_update",
  "loxo.update_person",
  "loxo.create_person_event",
  "pdf.generate",
] as const;

export type LogicalOperation = (typeof LOGICAL_OPERATIONS)[number];
export type OperationMode = "read" | "draft" | "write";

export const ALLOWED_PROVIDER_IDS = [
  "host.gmail",
  "host.calendar",
  "host.drive",
  "host.sheets",
  "host.loxo",
  "recruitment-mcp.pdf",
] as const;

export type AllowedProviderId = (typeof ALLOWED_PROVIDER_IDS)[number];

export const FORBIDDEN_RECRUITMENT_MCP_PROVIDER_IDS = [
  "recruitment-mcp.gmail",
  "recruitment-mcp.calendar",
  "recruitment-mcp.drive",
  "recruitment-mcp.sheets",
  "recruitment-mcp.loxo",
] as const;

export type CapabilityStatus =
  | "ready"
  | "auth_required"
  | "connector_unavailable"
  | "tool_missing"
  | "provider_stub"
  | "permission_denied"
  | "approval_required"
  | "precondition_changed"
  | "unsupported_file_type"
  | "pdf_builder_unavailable"
  | "unknown_result"
  | "unsupported";

export interface CapabilityState {
  capability: LogicalCapability;
  status: CapabilityStatus;
  provider: AllowedProviderId | null;
  detail: string;
  checkedAt: string;
  operations: readonly LogicalOperation[];
}

export interface CapabilityDeclaration {
  capability: LogicalCapability;
  provider: string;
  status: CapabilityStatus;
  detail?: string;
  checkedAt?: string;
}

export interface SourceReference {
  system: string;
  externalId: string;
  revision?: string;
  capturedAt?: string;
}

export interface OperationRequest<TPayload = unknown> {
  operationId: string;
  operation: LogicalOperation;
  capability: LogicalCapability;
  caseId: string;
  actorId: string;
  mode: OperationMode;
  provider: AllowedProviderId;
  payload: TPayload;
  sourceRefs: readonly SourceReference[];
  preconditionSnapshot?: unknown;
  approvalId?: string;
  idempotencyKey?: string;
}

export interface OperationSuccess<TResult = unknown> {
  status: "succeeded";
  operationId: string;
  provider: AllowedProviderId;
  externalIds: Readonly<Record<string, string>>;
  result: TResult;
  verifiedAt?: string;
}

export interface OperationFailure {
  status: "failed" | "unknown_result";
  operationId: string;
  provider: AllowedProviderId;
  code: string;
  detail: string;
  retryable: boolean;
  externalIds?: Readonly<Record<string, string>>;
}

export type OperationResult<TResult = unknown> =
  | OperationSuccess<TResult>
  | OperationFailure;

export interface HostToolBroker {
  capabilities(): Promise<readonly CapabilityDeclaration[]>;
  invoke<TPayload, TResult>(
    request: OperationRequest<TPayload>,
  ): Promise<OperationResult<TResult>>;
}
