import type {
  AllowedProviderId,
  LogicalCapability,
  LogicalOperation,
} from "../connectors/types";
import { ApprovalContractError } from "./errors";
import { sha256, timingSafeStringEqual } from "./stable-hash";

export const APPROVAL_SCHEMA_VERSION = 1 as const;

export interface ApprovalChange {
  path: string;
  label: string;
  before: unknown;
  after: unknown;
  sourceRefs?: readonly string[];
}

export interface ApprovalPreview<TPayload = unknown, TPreconditions = unknown> {
  schemaVersion: typeof APPROVAL_SCHEMA_VERSION;
  approvalId: string;
  operation: LogicalOperation;
  capability: LogicalCapability;
  provider: AllowedProviderId;
  caseId: string;
  proposedBy: string;
  summary: string;
  changes: readonly ApprovalChange[];
  payload: TPayload;
  preconditions: TPreconditions;
  payloadHash: string;
  preconditionHash: string;
  approvalHash: string;
  createdAt: string;
  expiresAt: string;
}

export interface ApprovalGrant {
  schemaVersion: typeof APPROVAL_SCHEMA_VERSION;
  approvalId: string;
  approvalHash: string;
  approvedBy: string;
  approvedAt: string;
  expiresAt: string;
  idempotencyKey: string;
  consumedAt: string | null;
}

export interface CreateApprovalPreviewInput<
  TPayload = unknown,
  TPreconditions = unknown,
> {
  approvalId?: string;
  operation: LogicalOperation;
  capability: LogicalCapability;
  provider: AllowedProviderId;
  caseId: string;
  proposedBy: string;
  summary: string;
  changes: readonly ApprovalChange[];
  payload: TPayload;
  preconditions: TPreconditions;
  createdAt?: Date;
  expiresAt: Date;
}

function previewHashInput(
  preview: Omit<ApprovalPreview, "approvalHash">,
): unknown {
  return {
    schemaVersion: preview.schemaVersion,
    approvalId: preview.approvalId,
    operation: preview.operation,
    capability: preview.capability,
    provider: preview.provider,
    caseId: preview.caseId,
    proposedBy: preview.proposedBy,
    summary: preview.summary,
    changes: preview.changes,
    payloadHash: preview.payloadHash,
    preconditionHash: preview.preconditionHash,
    createdAt: preview.createdAt,
    expiresAt: preview.expiresAt,
  };
}

export async function createApprovalPreview<TPayload, TPreconditions>(
  input: CreateApprovalPreviewInput<TPayload, TPreconditions>,
): Promise<ApprovalPreview<TPayload, TPreconditions>> {
  const createdAt = input.createdAt ?? new Date();
  if (input.expiresAt.getTime() <= createdAt.getTime()) {
    throw new ApprovalContractError(
      "invalid_expiration",
      "Approval preview expiration must be after creation time.",
    );
  }
  if (input.changes.length === 0) {
    throw new ApprovalContractError(
      "empty_preview",
      "Approval preview must contain at least one explicit change.",
    );
  }

  const payloadHash = await sha256(input.payload);
  const preconditionHash = await sha256(input.preconditions);
  const previewWithoutHash = {
    schemaVersion: APPROVAL_SCHEMA_VERSION,
    approvalId: input.approvalId ?? crypto.randomUUID(),
    operation: input.operation,
    capability: input.capability,
    provider: input.provider,
    caseId: input.caseId,
    proposedBy: input.proposedBy,
    summary: input.summary,
    changes: input.changes,
    payload: input.payload,
    preconditions: input.preconditions,
    payloadHash,
    preconditionHash,
    createdAt: createdAt.toISOString(),
    expiresAt: input.expiresAt.toISOString(),
  } satisfies Omit<ApprovalPreview<TPayload, TPreconditions>, "approvalHash">;

  return {
    ...previewWithoutHash,
    approvalHash: await sha256(previewHashInput(previewWithoutHash)),
  };
}

export function grantApproval(
  preview: ApprovalPreview,
  input: {
    approvedBy: string;
    idempotencyKey: string;
    approvedAt?: Date;
  },
): ApprovalGrant {
  const approvedAt = input.approvedAt ?? new Date();
  if (approvedAt.getTime() > Date.parse(preview.expiresAt)) {
    throw new ApprovalContractError(
      "approval_expired",
      "Expired approval preview cannot be approved.",
    );
  }
  if (!input.idempotencyKey.trim()) {
    throw new ApprovalContractError(
      "missing_idempotency_key",
      "Approval requires a non-empty idempotency key.",
    );
  }

  return {
    schemaVersion: APPROVAL_SCHEMA_VERSION,
    approvalId: preview.approvalId,
    approvalHash: preview.approvalHash,
    approvedBy: input.approvedBy,
    approvedAt: approvedAt.toISOString(),
    expiresAt: preview.expiresAt,
    idempotencyKey: input.idempotencyKey,
    consumedAt: null,
  };
}

export async function assertApprovalExecutable<TPayload, TPreconditions>(input: {
  preview: ApprovalPreview<TPayload, TPreconditions>;
  grant: ApprovalGrant;
  currentPayload: TPayload;
  currentPreconditions: TPreconditions;
  idempotencyKey: string;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const { preview, grant } = input;

  if (grant.consumedAt !== null) {
    throw new ApprovalContractError(
      "approval_consumed",
      "Approval is single-use and has already been consumed.",
    );
  }
  if (now.getTime() > Date.parse(grant.expiresAt)) {
    throw new ApprovalContractError("approval_expired", "Approval has expired.");
  }
  if (
    grant.approvalId !== preview.approvalId ||
    !timingSafeStringEqual(grant.approvalHash, preview.approvalHash)
  ) {
    throw new ApprovalContractError(
      "approval_mismatch",
      "Approval grant does not match preview.",
    );
  }
  if (grant.idempotencyKey !== input.idempotencyKey) {
    throw new ApprovalContractError(
      "idempotency_mismatch",
      "Approval grant does not match execution idempotency key.",
    );
  }

  const recomputedApprovalHash = await sha256(previewHashInput(preview));
  if (!timingSafeStringEqual(recomputedApprovalHash, preview.approvalHash)) {
    throw new ApprovalContractError(
      "preview_changed",
      "Approval preview changed after it was prepared.",
    );
  }

  const currentPayloadHash = await sha256(input.currentPayload);
  if (!timingSafeStringEqual(currentPayloadHash, preview.payloadHash)) {
    throw new ApprovalContractError(
      "payload_changed",
      "Operation payload changed after approval preview.",
    );
  }

  const currentPreconditionHash = await sha256(input.currentPreconditions);
  if (!timingSafeStringEqual(currentPreconditionHash, preview.preconditionHash)) {
    throw new ApprovalContractError(
      "precondition_changed",
      "External preconditions changed. Prepare and approve a new preview.",
    );
  }
}

export function consumeApproval(
  grant: ApprovalGrant,
  consumedAt: Date = new Date(),
): ApprovalGrant {
  if (grant.consumedAt !== null) {
    throw new ApprovalContractError(
      "approval_consumed",
      "Approval is single-use and has already been consumed.",
    );
  }
  return { ...grant, consumedAt: consumedAt.toISOString() };
}
