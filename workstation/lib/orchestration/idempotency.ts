import type {
  AllowedProviderId,
  LogicalOperation,
} from "../connectors/types";
import { IdempotencyContractError } from "./errors";
import { sha256 } from "./stable-hash";

export type IdempotencyStatus =
  | "started"
  | "succeeded"
  | "failed"
  | "unknown_result";

export interface IdempotencyRecord {
  key: string;
  operation: LogicalOperation;
  provider: AllowedProviderId;
  caseId: string;
  approvalHash: string | null;
  payloadHash: string;
  status: IdempotencyStatus;
  startedAt: string;
  completedAt: string | null;
  retryable: boolean;
  resultRef: string | null;
}

export async function createIdempotencyKey(input: {
  operation: LogicalOperation;
  provider: AllowedProviderId;
  caseId: string;
  approvalHash?: string;
  payloadHash: string;
}): Promise<string> {
  return sha256({
    namespace: "recruiter-workstation-operation",
    ...input,
    approvalHash: input.approvalHash ?? null,
  });
}

export function beginIdempotentOperation(input: {
  key: string;
  operation: LogicalOperation;
  provider: AllowedProviderId;
  caseId: string;
  approvalHash?: string;
  payloadHash: string;
  startedAt?: Date;
}): IdempotencyRecord {
  if (!input.key.trim()) {
    throw new IdempotencyContractError(
      "missing_idempotency_key",
      "Idempotency key cannot be empty.",
    );
  }
  return {
    key: input.key,
    operation: input.operation,
    provider: input.provider,
    caseId: input.caseId,
    approvalHash: input.approvalHash ?? null,
    payloadHash: input.payloadHash,
    status: "started",
    startedAt: (input.startedAt ?? new Date()).toISOString(),
    completedAt: null,
    retryable: false,
    resultRef: null,
  };
}

export function completeIdempotentOperation(
  record: IdempotencyRecord,
  input:
    | { status: "succeeded"; resultRef: string; completedAt?: Date }
    | { status: "failed"; retryable: boolean; completedAt?: Date }
    | { status: "unknown_result"; resultRef?: string; completedAt?: Date },
): IdempotencyRecord {
  if (record.status !== "started") {
    throw new IdempotencyContractError(
      "operation_already_completed",
      `Idempotency record is already ${record.status}.`,
    );
  }
  return {
    ...record,
    status: input.status,
    completedAt: (input.completedAt ?? new Date()).toISOString(),
    retryable: input.status === "failed" ? input.retryable : false,
    resultRef:
      input.status === "succeeded"
        ? input.resultRef
        : input.status === "unknown_result"
          ? (input.resultRef ?? null)
          : null,
  };
}

export function assertIdempotentExecutionAllowed(
  existing: IdempotencyRecord | null | undefined,
): void {
  if (!existing) return;
  if (existing.status === "failed" && existing.retryable) return;

  const message =
    existing.status === "unknown_result"
      ? "Operation result is unknown. Reconcile exact external IDs before retrying."
      : `Operation with this idempotency key is already ${existing.status}.`;
  throw new IdempotencyContractError("duplicate_execution", message);
}
