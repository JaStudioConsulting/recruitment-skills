import { and, desc, eq, exists, ne, notExists, sql } from "drizzle-orm";

import { capabilityRuns, caseArtifacts } from "../../db/schema";
import type { PreparedCapability } from "../capabilities/prepare";

export const CAPABILITY_RUN_STATUSES = [
  "prepared",
  "running",
  "draft_ready",
  "awaiting_visual_qa",
  "completed",
  "refused",
  "cancelled",
  "failed",
] as const;

export type CapabilityRunStatus = (typeof CAPABILITY_RUN_STATUSES)[number];
export type VisualQaStatus = "pending" | "passed" | "failed";

const TERMINAL_RUN_STATUSES = new Set<CapabilityRunStatus>([
  "completed",
  "refused",
  "cancelled",
  "failed",
]);

const RUN_TRANSITIONS: Record<CapabilityRunStatus, readonly CapabilityRunStatus[]> = {
  prepared: ["running", "refused", "cancelled"],
  running: ["draft_ready", "awaiting_visual_qa", "completed", "failed", "cancelled"],
  draft_ready: ["running", "completed", "cancelled"],
  awaiting_visual_qa: ["completed", "failed"],
  completed: [],
  refused: [],
  cancelled: [],
  failed: [],
};

const TRANSITION_INPUT_KEYS = new Set(["status", "result", "evidence", "error"]);

export class CapabilityRunTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapabilityRunTransitionError";
  }
}

export type CapabilityRunTransition = {
  status: CapabilityRunStatus;
  result?: unknown;
  evidence?: unknown;
  error?: unknown;
};

export type CapabilityRunTransitionState = {
  status: CapabilityRunStatus;
  startedAt: string | null;
  resultJson: string | null;
  evidenceJson: string;
  errorJson: string | null;
};

export type CapabilityRunTransitionPatch = {
  status: CapabilityRunStatus;
  resultJson?: string | null;
  evidenceJson?: string;
  errorJson?: string | null;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
};

function parseJson(raw: string | null, fallback: unknown) {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return fallback;
  }
}

function serializeJson(value: unknown, label: string) {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error();
    return serialized;
  } catch {
    throw new CapabilityRunTransitionError(`${label} must be JSON serializable.`);
  }
}

function hasEvidence(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function hasOwn(input: object, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

export function validateCapabilityRunTransition(
  current: CapabilityRunStatus,
  next: CapabilityRunStatus,
): CapabilityRunStatus {
  if (!CAPABILITY_RUN_STATUSES.includes(current) ||
      !CAPABILITY_RUN_STATUSES.includes(next) ||
      !RUN_TRANSITIONS[current].includes(next)) {
    throw new CapabilityRunTransitionError(
      `Capability run cannot transition from ${current} to ${next}.`,
    );
  }
  return next;
}

export function capabilityRunTransitionPatch(
  current: CapabilityRunTransitionState,
  transition: CapabilityRunTransition,
  timestamp: string,
): CapabilityRunTransitionPatch {
  if (Object.keys(transition).some((key) => !TRANSITION_INPUT_KEYS.has(key))) {
    throw new CapabilityRunTransitionError("Prepared capability run fields are immutable.");
  }
  validateCapabilityRunTransition(current.status, transition.status);

  const nextResult = hasOwn(transition, "result")
    ? transition.result
    : parseJson(current.resultJson, null);
  const nextEvidence = hasOwn(transition, "evidence")
    ? transition.evidence
    : parseJson(current.evidenceJson, {});
  const nextError = hasOwn(transition, "error")
    ? transition.error
    : parseJson(current.errorJson, null);

  if ((transition.status === "draft_ready" || transition.status === "awaiting_visual_qa") &&
      !hasEvidence(nextResult)) {
    throw new CapabilityRunTransitionError(
      `${transition.status} capability runs require a persisted result.`,
    );
  }
  if (transition.status === "completed" &&
      (!hasEvidence(nextResult) || !hasEvidence(nextEvidence))) {
    throw new CapabilityRunTransitionError(
      "Completed capability runs require result and evidence.",
    );
  }
  if ((transition.status === "failed" || transition.status === "refused") &&
      !hasEvidence(nextError)) {
    throw new CapabilityRunTransitionError(
      `${transition.status} capability runs require error evidence.`,
    );
  }

  const patch: CapabilityRunTransitionPatch = {
    status: transition.status,
    updatedAt: timestamp,
  };
  if (hasOwn(transition, "result")) {
    patch.resultJson = transition.result === null
      ? null
      : serializeJson(transition.result, "Capability run result");
  }
  if (hasOwn(transition, "evidence")) {
    patch.evidenceJson = serializeJson(transition.evidence, "Capability run evidence");
  }
  if (hasOwn(transition, "error")) {
    patch.errorJson = transition.error === null
      ? null
      : serializeJson(transition.error, "Capability run error");
  }
  if (transition.status === "running" && current.startedAt === null) {
    patch.startedAt = timestamp;
  }
  if (TERMINAL_RUN_STATUSES.has(transition.status)) {
    patch.finishedAt = timestamp;
  }
  return patch;
}

export function validateVisualQaTransition(
  current: VisualQaStatus,
  next: Exclude<VisualQaStatus, "pending">,
  reviewer: string,
  evidence: unknown,
): Exclude<VisualQaStatus, "pending"> {
  if (current !== "pending") {
    throw new CapabilityRunTransitionError(
      `Visual QA cannot transition from ${current} to ${next}.`,
    );
  }
  if (!reviewer.trim() || !hasEvidence(evidence)) {
    throw new CapabilityRunTransitionError(
      "Visual QA requires a reviewer and review evidence.",
    );
  }
  serializeJson(evidence, "Visual QA evidence");
  return next;
}

export type CapabilityRunRecord = {
  id: string;
  caseId: string;
  roleId: string;
  candidateId: string;
  capabilityId: string;
  executorId: string | null;
  supportingAuthorityIds: string[];
  authorityDigest: string;
  sourceRefs: string[];
  inputSnapshotHash: string;
  input: CapabilityRunInputSnapshot;
  outputKind: string | null;
  implementationStatus: PreparedCapability["implementationStatus"];
  provider: string;
  model: string;
  preparedAt: string;
  status: CapabilityRunStatus;
  result: unknown;
  evidence: unknown;
  error: unknown;
  startedAt: string | null;
  finishedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type CaseArtifactRecord = {
  id: string;
  caseId: string;
  runId: string;
  kind: string;
  filename: string;
  contentType: string;
  storageKey: string;
  sha256: string;
  sizeBytes: number;
  revision: number;
  evidence: unknown;
  visualQaStatus: VisualQaStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewEvidence: unknown;
  createdBy: string;
  createdAt: string;
};

export type CaseArtifactVisualQaFinalizationResult = {
  artifact: CaseArtifactRecord;
  run: CapabilityRunRecord;
};

export type CreateCapabilityRunInput = {
  id: string;
  caseId: string;
  prepared: PreparedCapability;
  input: CapabilityRunInputSnapshot;
};

export type CapabilityRunInputSnapshot = {
  extraInput: string;
  provider: string;
  model: string;
  [key: string]: unknown;
};

export type CreateCaseArtifactInput = {
  id: string;
  caseId: string;
  runId: string;
  kind: string;
  filename: string;
  contentType: string;
  storageKey: string;
  sha256: string;
  sizeBytes: number;
  revision?: number;
  evidence?: unknown;
};

export function validateCaseArtifactAttachment(
  run: Pick<
    CapabilityRunRecord,
    "id" | "caseId" | "capabilityId" | "outputKind" | "status"
  >,
  artifact: Pick<
    CreateCaseArtifactInput,
    "caseId" | "runId" | "kind" | "contentType"
  >,
): void {
  if (run.caseId !== artifact.caseId) {
    throw new CapabilityRunTransitionError(
      "The capability run does not belong to the case for this artifact.",
    );
  }
  if (run.id !== artifact.runId) {
    throw new CapabilityRunTransitionError(
      "The artifact does not match the run that prepared it.",
    );
  }
  if (run.status !== "running") {
    throw new CapabilityRunTransitionError(
      `Artifacts require a running capability run, not ${run.status}.`,
    );
  }
  if (run.outputKind !== "pdf") {
    throw new CapabilityRunTransitionError(
      "Artifacts require a capability run with PDF output.",
    );
  }
  if (run.capabilityId !== artifact.kind) {
    throw new CapabilityRunTransitionError(
      "The artifact capability does not match the prepared run.",
    );
  }
  if (artifact.contentType !== "application/pdf") {
    throw new CapabilityRunTransitionError(
      "Persisted capability artifacts must use application/pdf.",
    );
  }
}

function capabilityRunRecord(
  row: typeof capabilityRuns.$inferSelect,
): CapabilityRunRecord {
  return {
    id: row.id,
    caseId: row.caseId,
    roleId: row.roleId,
    candidateId: row.candidateId,
    capabilityId: row.capabilityId,
    executorId: row.executorId,
    supportingAuthorityIds: parseJson(row.supportingAuthorityIdsJson, []) as string[],
    authorityDigest: row.authorityDigest,
    sourceRefs: parseJson(row.sourceRefsJson, []) as string[],
    inputSnapshotHash: row.inputSnapshotHash,
    input: parseJson(row.inputJson, {
      extraInput: "",
      provider: row.provider,
      model: row.model,
    }) as CapabilityRunInputSnapshot,
    outputKind: row.outputKind,
    implementationStatus: row.implementationStatus,
    provider: row.provider,
    model: row.model,
    preparedAt: row.preparedAt,
    status: row.status,
    result: parseJson(row.resultJson, null),
    evidence: parseJson(row.evidenceJson, {}),
    error: parseJson(row.errorJson, null),
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function caseArtifactRecord(
  row: typeof caseArtifacts.$inferSelect,
): CaseArtifactRecord {
  return {
    id: row.id,
    caseId: row.caseId,
    runId: row.runId,
    kind: row.kind,
    filename: row.filename,
    contentType: row.contentType,
    storageKey: row.storageKey,
    sha256: row.sha256,
    sizeBytes: row.sizeBytes,
    revision: row.revision,
    evidence: parseJson(row.evidenceJson, {}),
    visualQaStatus: row.visualQaStatus,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    reviewEvidence: parseJson(row.reviewEvidenceJson, {}),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function repositoryDependencies() {
  const [{ getDb }, { assertOwnedCase }] = await Promise.all([
    import("@/db"),
    import("@/lib/server/case-repository"),
  ]);
  return { db: getDb(), assertOwnedCase };
}

async function apiError(status: number, message: string, details?: unknown) {
  const { ApiError } = await import("@/lib/server/api");
  return new ApiError(status, message, details);
}

async function assertRunInCase(
  caseId: string,
  runId: string,
): Promise<typeof capabilityRuns.$inferSelect> {
  const { db } = await repositoryDependencies();
  const [row] = await db
    .select()
    .from(capabilityRuns)
    .where(and(eq(capabilityRuns.id, runId), eq(capabilityRuns.caseId, caseId)))
    .limit(1);
  if (!row) throw await apiError(404, "Capability run was not found.");
  return row;
}

export async function createCapabilityRun(
  userId: string,
  input: CreateCapabilityRunInput,
): Promise<CapabilityRunRecord> {
  const { db, assertOwnedCase } = await repositoryDependencies();
  const ownedCase = await assertOwnedCase(userId, input.caseId);
  const timestamp = new Date().toISOString();
  const [created] = await db
    .insert(capabilityRuns)
    .values({
      id: input.id,
      caseId: input.caseId,
      roleId: ownedCase.roleId,
      candidateId: ownedCase.candidateId,
      capabilityId: input.prepared.capabilityId,
      executorId: input.prepared.executorId,
      supportingAuthorityIdsJson: serializeJson(
        input.prepared.supportingAuthorityIds,
        "Supporting authority IDs",
      ),
      authorityDigest: input.prepared.authorityDigest,
      sourceRefsJson: serializeJson(input.prepared.sourceRefs, "Source references"),
      inputSnapshotHash: input.prepared.inputSnapshotHash,
      inputJson: serializeJson(input.input, "Capability run input"),
      outputKind: input.prepared.outputKind,
      implementationStatus: input.prepared.implementationStatus,
      provider: input.input.provider,
      model: input.input.model,
      preparedAt: input.prepared.preparedAt,
      status: "prepared",
      resultJson: null,
      evidenceJson: "{}",
      errorJson: null,
      startedAt: null,
      finishedAt: null,
      createdBy: userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoNothing()
    .returning();
  if (!created) {
    throw await apiError(409, "Capability run IDs are append-only and cannot be replaced.");
  }
  return capabilityRunRecord(created);
}

export async function listCapabilityRuns(
  userId: string,
  caseId: string,
): Promise<CapabilityRunRecord[]> {
  const { db, assertOwnedCase } = await repositoryDependencies();
  await assertOwnedCase(userId, caseId);
  const rows = await db
    .select()
    .from(capabilityRuns)
    .where(eq(capabilityRuns.caseId, caseId))
    .orderBy(desc(capabilityRuns.preparedAt), desc(capabilityRuns.createdAt));
  return rows.map(capabilityRunRecord);
}

export async function getCapabilityRun(
  userId: string,
  caseId: string,
  runId: string,
): Promise<CapabilityRunRecord> {
  const { assertOwnedCase } = await repositoryDependencies();
  await assertOwnedCase(userId, caseId);
  return capabilityRunRecord(await assertRunInCase(caseId, runId));
}

export async function transitionCapabilityRun(
  userId: string,
  caseId: string,
  runId: string,
  transition: CapabilityRunTransition,
): Promise<CapabilityRunRecord> {
  const { db, assertOwnedCase } = await repositoryDependencies();
  await assertOwnedCase(userId, caseId);
  const current = await assertRunInCase(caseId, runId);
  let patch: CapabilityRunTransitionPatch;
  try {
    patch = capabilityRunTransitionPatch(current, transition, new Date().toISOString());
  } catch (error) {
    if (!(error instanceof CapabilityRunTransitionError)) throw error;
    throw await apiError(409, error.message, { currentStatus: current.status });
  }

  if (transition.status === "completed" && current.outputKind === "pdf") {
    const artifacts = await db
      .select({ visualQaStatus: caseArtifacts.visualQaStatus })
      .from(caseArtifacts)
      .where(and(eq(caseArtifacts.caseId, caseId), eq(caseArtifacts.runId, runId)));
    if (artifacts.length === 0 || artifacts.some((artifact) => artifact.visualQaStatus !== "passed")) {
      throw await apiError(
        409,
        "PDF capability runs require a persisted artifact with passed visual QA before completion.",
      );
    }
  }

  // Cancellation and artifact attachment are competing terminal decisions for
  // a running PDF build. Keep the check inside the UPDATE so D1 serializes the
  // race: cancellation wins only while no artifact row exists; otherwise the
  // artifact insert wins and execution must advance to visual QA.
  const cancellationHasNoArtifact = transition.status === "cancelled" && current.status === "running"
    ? notExists(
        db
          .select({ id: caseArtifacts.id })
          .from(caseArtifacts)
          .where(and(
            eq(caseArtifacts.caseId, caseId),
            eq(caseArtifacts.runId, runId),
          )),
      )
    : undefined;

  const [updated] = await db
    .update(capabilityRuns)
    .set(patch)
    .where(and(
      eq(capabilityRuns.id, runId),
      eq(capabilityRuns.caseId, caseId),
      eq(capabilityRuns.status, current.status),
      cancellationHasNoArtifact,
    ))
    .returning();
  if (!updated) {
    const latest = await assertRunInCase(caseId, runId);
    if (transition.status === "cancelled" && latest.status === "running") {
      const [attachedArtifact] = await db
        .select({ id: caseArtifacts.id })
        .from(caseArtifacts)
        .where(and(
          eq(caseArtifacts.caseId, caseId),
          eq(caseArtifacts.runId, runId),
        ))
        .limit(1);
      if (attachedArtifact) {
        throw await apiError(
          409,
          "Capability run cannot be cancelled after its PDF artifact was persisted. Execution must advance to visual QA.",
          { currentStatus: latest.status, artifactId: attachedArtifact.id },
        );
      }
    }
    throw await apiError(409, "Capability run changed before this transition completed.", {
      currentStatus: latest.status,
    });
  }
  return capabilityRunRecord(updated);
}

export async function createCaseArtifact(
  userId: string,
  input: CreateCaseArtifactInput,
): Promise<CaseArtifactRecord> {
  const { db, assertOwnedCase } = await repositoryDependencies();
  await assertOwnedCase(userId, input.caseId);
  const currentRun = await assertRunInCase(input.caseId, input.runId);
  try {
    validateCaseArtifactAttachment(capabilityRunRecord(currentRun), input);
  } catch (error) {
    if (!(error instanceof CapabilityRunTransitionError)) throw error;
    throw await apiError(409, error.message, {
      currentStatus: currentRun.status,
      currentOutputKind: currentRun.outputKind,
    });
  }
  const evidenceJson = serializeJson(input.evidence ?? {}, "Artifact evidence");
  const timestamp = new Date().toISOString();
  const [created] = await db
    .insert(caseArtifacts)
    .select(sql`
      select
        ${input.id},
        ${input.caseId},
        ${input.runId},
        ${input.kind},
        ${input.filename},
        ${input.contentType},
        ${input.storageKey},
        ${input.sha256},
        ${input.sizeBytes},
        ${input.revision ?? 1},
        ${evidenceJson},
        ${"pending"},
        ${null},
        ${null},
        ${"{}"},
        ${userId},
        ${timestamp}
      from ${capabilityRuns}
      where ${and(
        eq(capabilityRuns.id, input.runId),
        eq(capabilityRuns.caseId, input.caseId),
        eq(capabilityRuns.status, "running"),
        eq(capabilityRuns.outputKind, "pdf"),
        eq(capabilityRuns.capabilityId, input.kind),
      )}
      limit 1
    `)
    .onConflictDoNothing()
    .returning();
  if (!created) {
    const latestRun = await assertRunInCase(input.caseId, input.runId);
    if (latestRun.status !== "running") {
      throw await apiError(
        409,
        `Capability run changed before artifact persistence completed and is now ${latestRun.status}. No artifact record was persisted.`,
        { currentStatus: latestRun.status },
      );
    }
    throw await apiError(409, "Case artifacts are append-only and cannot be replaced.");
  }
  return caseArtifactRecord(created);
}

export async function listCaseArtifacts(
  userId: string,
  caseId: string,
  runId?: string,
): Promise<CaseArtifactRecord[]> {
  const { db, assertOwnedCase } = await repositoryDependencies();
  await assertOwnedCase(userId, caseId);
  const rows = await db
    .select()
    .from(caseArtifacts)
    .where(runId
      ? and(eq(caseArtifacts.caseId, caseId), eq(caseArtifacts.runId, runId))
      : eq(caseArtifacts.caseId, caseId))
    .orderBy(desc(caseArtifacts.createdAt));
  return rows.map(caseArtifactRecord);
}

export async function getCaseArtifact(
  userId: string,
  caseId: string,
  artifactId: string,
): Promise<CaseArtifactRecord> {
  const { db, assertOwnedCase } = await repositoryDependencies();
  await assertOwnedCase(userId, caseId);
  const [artifact] = await db
    .select()
    .from(caseArtifacts)
    .where(and(eq(caseArtifacts.id, artifactId), eq(caseArtifacts.caseId, caseId)))
    .limit(1);
  if (!artifact) throw await apiError(404, "Case artifact was not found.");
  return caseArtifactRecord(artifact);
}

export async function finalizeCaseArtifactVisualQa(
  userId: string,
  caseId: string,
  artifactId: string,
  status: Exclude<VisualQaStatus, "pending">,
  evidence: unknown,
): Promise<CaseArtifactVisualQaFinalizationResult> {
  const { db, assertOwnedCase } = await repositoryDependencies();
  await assertOwnedCase(userId, caseId);
  const [currentArtifactRow] = await db
    .select()
    .from(caseArtifacts)
    .where(and(eq(caseArtifacts.id, artifactId), eq(caseArtifacts.caseId, caseId)))
    .limit(1);
  if (!currentArtifactRow) throw await apiError(404, "Case artifact was not found.");
  const currentArtifact = caseArtifactRecord(currentArtifactRow);
  try {
    validateVisualQaTransition(currentArtifact.visualQaStatus, status, userId, evidence);
  } catch (error) {
    if (!(error instanceof CapabilityRunTransitionError)) throw error;
    throw await apiError(409, error.message, {
      currentVisualQaStatus: currentArtifact.visualQaStatus,
    });
  }

  const currentRunRow = await assertRunInCase(caseId, currentArtifact.runId);
  const currentRun = capabilityRunRecord(currentRunRow);
  if (currentRun.status !== "awaiting_visual_qa") {
    throw await apiError(
      409,
      `Capability run ${currentRun.status} is not awaiting visual QA.`,
      { currentStatus: currentRun.status },
    );
  }
  if (currentRun.outputKind !== "pdf") {
    throw await apiError(409, "Visual QA finalization requires a PDF capability run.");
  }

  const timestamp = new Date().toISOString();
  const reviewEvidenceJson = serializeJson(evidence, "Visual QA evidence");
  const artifactRows = await db
    .select({ id: caseArtifacts.id })
    .from(caseArtifacts)
    .where(and(
      eq(caseArtifacts.caseId, caseId),
      eq(caseArtifacts.runId, currentRun.id),
    ));
  if (artifactRows.length === 0) {
    throw await apiError(409, "PDF capability runs require a persisted artifact for visual QA.");
  }

  const qaEvidence = {
    artifactId: currentArtifact.id,
    artifactSha256: currentArtifact.sha256,
    reviewedBy: userId,
    reviewedAt: timestamp,
    status,
    evidence,
  };
  const transition: CapabilityRunTransition = status === "failed"
    ? {
        status: "failed",
        evidence: {
          ...recordValue(currentRun.evidence),
          visualQa: qaEvidence,
        },
        error: {
          code: "visual_qa_failed",
          message: "The persisted PDF failed human visual QA.",
          artifactId: currentArtifact.id,
        },
      }
    : {
        status: "completed",
        result: currentRun.result,
        evidence: {
          ...recordValue(currentRun.evidence),
          visualQa: qaEvidence,
          artifactIds: artifactRows.map((artifact) => artifact.id),
        },
      };
  let runPatch: CapabilityRunTransitionPatch;
  try {
    runPatch = capabilityRunTransitionPatch(currentRunRow, transition, timestamp);
  } catch (error) {
    if (!(error instanceof CapabilityRunTransitionError)) throw error;
    throw await apiError(409, error.message, { currentStatus: currentRun.status });
  }

  const reviewedArtifactExists = exists(
    db
      .select({ id: caseArtifacts.id })
      .from(caseArtifacts)
      .where(and(
        eq(caseArtifacts.id, artifactId),
        eq(caseArtifacts.caseId, caseId),
        eq(caseArtifacts.runId, currentRun.id),
        eq(caseArtifacts.visualQaStatus, status),
        eq(caseArtifacts.reviewedBy, userId),
        eq(caseArtifacts.reviewedAt, timestamp),
        eq(caseArtifacts.reviewEvidenceJson, reviewEvidenceJson),
      )),
  );
  const everyArtifactPassed = notExists(
    db
      .select({ id: caseArtifacts.id })
      .from(caseArtifacts)
      .where(and(
        eq(caseArtifacts.caseId, caseId),
        eq(caseArtifacts.runId, currentRun.id),
        ne(caseArtifacts.visualQaStatus, "passed"),
      )),
  );

  const reviewStatement = db
    .update(caseArtifacts)
    .set({
      visualQaStatus: status,
      reviewedBy: userId,
      reviewedAt: timestamp,
      reviewEvidenceJson,
    })
    .where(and(
      eq(caseArtifacts.id, artifactId),
      eq(caseArtifacts.caseId, caseId),
      eq(caseArtifacts.visualQaStatus, "pending"),
    ))
    .returning();

  const runStatement = db
    .update(capabilityRuns)
    .set(runPatch)
    .where(and(
      eq(capabilityRuns.id, currentRun.id),
      eq(capabilityRuns.caseId, caseId),
      eq(capabilityRuns.status, "awaiting_visual_qa"),
      reviewedArtifactExists,
      status === "passed" ? everyArtifactPassed : undefined,
    ))
    .returning();

  // D1 executes batch statements in order as one SQL transaction. If the run
  // update throws, the preceding artifact review is rolled back with it.
  const [reviewedRows, transitionedRows] = await db.batch([
    reviewStatement,
    runStatement,
  ] as const);
  const reviewedRow = reviewedRows[0];
  const transitionedRow = transitionedRows[0];
  if (!reviewedRow) {
    const [latestArtifact] = await db
      .select({ visualQaStatus: caseArtifacts.visualQaStatus })
      .from(caseArtifacts)
      .where(and(eq(caseArtifacts.id, artifactId), eq(caseArtifacts.caseId, caseId)))
      .limit(1);
    throw await apiError(409, "Artifact visual QA changed before this review completed.", {
      currentVisualQaStatus: latestArtifact?.visualQaStatus,
    });
  }
  if (transitionedRow) {
    return {
      artifact: caseArtifactRecord(reviewedRow),
      run: capabilityRunRecord(transitionedRow),
    };
  }

  const latestRunRow = await assertRunInCase(caseId, currentRun.id);
  if (latestRunRow.status !== "awaiting_visual_qa") {
    return {
      artifact: caseArtifactRecord(reviewedRow),
      run: capabilityRunRecord(latestRunRow),
    };
  }

  if (status === "passed") {
    const [unpassedArtifact] = await db
      .select({ id: caseArtifacts.id })
      .from(caseArtifacts)
      .where(and(
        eq(caseArtifacts.caseId, caseId),
        eq(caseArtifacts.runId, currentRun.id),
        ne(caseArtifacts.visualQaStatus, "passed"),
      ))
      .limit(1);
    if (unpassedArtifact) {
      return {
        artifact: caseArtifactRecord(reviewedRow),
        run: capabilityRunRecord(latestRunRow),
      };
    }
  }

  // A zero-row CAS is not a D1 statement failure. Restore the artifact with a
  // second CAS before surfacing the conflict so awaiting_visual_qa is retryable.
  const [restored] = await db
    .update(caseArtifacts)
    .set({
      visualQaStatus: "pending",
      reviewedBy: null,
      reviewedAt: null,
      reviewEvidenceJson: "{}",
    })
    .where(and(
      eq(caseArtifacts.id, artifactId),
      eq(caseArtifacts.caseId, caseId),
      eq(caseArtifacts.visualQaStatus, status),
      eq(caseArtifacts.reviewedBy, userId),
      eq(caseArtifacts.reviewedAt, timestamp),
      eq(caseArtifacts.reviewEvidenceJson, reviewEvidenceJson),
    ))
    .returning({ id: caseArtifacts.id });
  if (!restored) {
    throw await apiError(
      500,
      "Visual QA finalization conflicted and the artifact could not be restored for retry.",
    );
  }
  throw await apiError(409, "Capability run changed before visual QA finalization completed.", {
    currentStatus: latestRunRow.status,
  });
}
