import type {
  CapabilityState,
  CapabilityStatus,
  LogicalCapability,
} from "./types";

const RECOVERABLE_STATUSES = new Set<CapabilityStatus>([
  "auth_required",
  "approval_required",
  "precondition_changed",
]);

export function isCapabilityReady(
  state: CapabilityState,
): state is CapabilityState & { status: "ready"; provider: NonNullable<CapabilityState["provider"]> } {
  return state.status === "ready" && state.provider !== null;
}

export function isRecoverableCapabilityState(
  status: CapabilityStatus,
): boolean {
  return RECOVERABLE_STATUSES.has(status);
}

export function unsupportedCapabilityState(input: {
  capability: LogicalCapability;
  status: Exclude<CapabilityStatus, "ready">;
  detail: string;
  checkedAt?: Date;
}): CapabilityState {
  return {
    capability: input.capability,
    status: input.status,
    provider: null,
    detail: input.detail,
    checkedAt: (input.checkedAt ?? new Date()).toISOString(),
    operations: [],
  };
}

export function userActionForStatus(status: CapabilityStatus): string {
  switch (status) {
    case "ready":
      return "No action required.";
    case "auth_required":
      return "Reconnect provider through host connector settings.";
    case "approval_required":
      return "Review and approve exact prepared change.";
    case "precondition_changed":
      return "Refresh external state and prepare a new preview.";
    case "unknown_result":
      return "Reconcile exact external IDs before retrying.";
    case "unsupported_file_type":
      return "Keep original source and provide a supported replacement for parsing.";
    case "pdf_builder_unavailable":
      return "Inject PDF runtime capability; saved document remains available.";
    case "permission_denied":
      return "Use host settings to grant required permission.";
    case "connector_unavailable":
    case "tool_missing":
    case "provider_stub":
    case "unsupported":
      return "Action unavailable in current host. No fallback was executed.";
  }
}
