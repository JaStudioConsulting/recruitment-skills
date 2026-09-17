import {
  definitionForOperation,
  type CapabilityRegistry,
} from "../connectors";
import type {
  LogicalOperation,
  OperationRequest,
  SourceReference,
} from "../connectors/types";
import { OrchestrationContractError } from "./errors";

export interface ResolveOperationInput<TPayload = unknown> {
  operationId?: string;
  operation: LogicalOperation;
  caseId: string;
  actorId: string;
  payload: TPayload;
  sourceRefs?: readonly SourceReference[];
  preconditionSnapshot?: unknown;
  approvalId?: string;
  idempotencyKey?: string;
}

export function resolveOperationRequest<TPayload>(
  registry: CapabilityRegistry,
  input: ResolveOperationInput<TPayload>,
): OperationRequest<TPayload> {
  const definition = definitionForOperation(input.operation);
  const capability = registry.resolve(input.operation);

  if (definition.approvalRequired && !input.approvalId) {
    throw new OrchestrationContractError(
      "approval_required",
      `${input.operation} requires an approved preview.`,
    );
  }
  if (definition.approvalRequired && !input.idempotencyKey) {
    throw new OrchestrationContractError(
      "idempotency_required",
      `${input.operation} requires an idempotency key.`,
    );
  }
  if (definition.mode === "write" && input.preconditionSnapshot === undefined) {
    throw new OrchestrationContractError(
      "precondition_required",
      `${input.operation} requires a current precondition snapshot.`,
    );
  }

  return {
    operationId: input.operationId ?? crypto.randomUUID(),
    operation: input.operation,
    capability: definition.capability,
    caseId: input.caseId,
    actorId: input.actorId,
    mode: definition.mode,
    provider: capability.provider!,
    payload: input.payload,
    sourceRefs: input.sourceRefs ?? [],
    preconditionSnapshot: input.preconditionSnapshot,
    approvalId: input.approvalId,
    idempotencyKey: input.idempotencyKey,
  };
}

export function requiresApproval(operation: LogicalOperation): boolean {
  return definitionForOperation(operation).approvalRequired;
}
