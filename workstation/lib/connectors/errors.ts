import type {
  CapabilityState,
  CapabilityStatus,
  LogicalCapability,
  LogicalOperation,
} from "./types";

export class ConnectorContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ConnectorContractError";
    this.code = code;
  }
}

export class CapabilityUnavailableError extends ConnectorContractError {
  readonly capability: LogicalCapability;
  readonly status: CapabilityStatus;

  constructor(state: CapabilityState) {
    super(
      "capability_unavailable",
      `${state.capability} unavailable: ${state.status}. ${state.detail}`,
    );
    this.name = "CapabilityUnavailableError";
    this.capability = state.capability;
    this.status = state.status;
  }
}

export class UnsupportedOperationError extends ConnectorContractError {
  readonly operation: LogicalOperation;

  constructor(operation: LogicalOperation, detail: string) {
    super("unsupported_operation", `${operation} unsupported. ${detail}`);
    this.name = "UnsupportedOperationError";
    this.operation = operation;
  }
}
