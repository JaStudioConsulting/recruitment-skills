import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  candidateCases,
  candidates,
  capabilityRuns,
  caseActivity,
  caseDocumentVersions,
  caseDocuments,
  caseSources,
  roleSources,
  roles,
  sourceIntakes,
} from "@/db/schema";
import { ApiError } from "@/lib/server/api";
import { connectorCapabilities } from "@/lib/server/connectors";
import {
  coerceSubmissionDocument,
  prefillSubmissionFromResume,
} from "@/lib/submission-prefill";
import {
  canReviewSource,
  normalizeSourceLifecycleStatus,
} from "@/lib/server/source-intake";
import {
  completeStoredDocuments,
  defaultDocumentContent,
  resolveDocumentSourceRefs,
} from "@/lib/document-model";
import {
  SOURCE_KINDS,
  STORED_DOCUMENT_KINDS,
  isStoredDocumentKind,
  type AssistantState,
  type CandidateCase,
  type CandidateFact,
  type CandidateRecord,
  type CaseDocument,
  type CaseSource,
  type DocumentVersion,
  type JobSource,
  type SourceKind,
  type SourceLifecycleStatus,
  type StoredDocumentKind,
  type RoleRecord,
  type WorkspacePayload,
} from "@/lib/workstation-types";
import type { UpdateCaseInput } from "@/lib/contracts/workstation";
import {
  jobIdentitiesMatch,
  normalizedJobIdentityKey,
} from "@/lib/source-intake";

const EMPTY_ASSISTANT: AssistantState = {
  missing: [],
  askNext: [],
  fitConcern: "No evidence-based review has run.",
  nextAction: "Attach source material and add candidate notes.",
};

function now() {
  return new Date().toISOString();
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function roleRecord(row: typeof roles.$inferSelect): RoleRecord {
  return { id: row.id, title: row.title, client: row.client, status: row.status };
}

function candidateRecord(row: typeof candidates.$inferSelect): CandidateRecord {
  return { id: row.id, name: row.name, currentTitle: row.currentTitle };
}

type SourceRecordRow = Pick<
  typeof caseSources.$inferSelect,
  | "id"
  | "kind"
  | "filename"
  | "contentType"
  | "sizeBytes"
  | "sha256"
  | "reviewStatus"
  | "lifecycleStatus"
  | "parsedText"
  | "classificationMethod"
  | "createdAt"
>;

function sourceRecord(row: SourceRecordRow): CaseSource {
  const kind = SOURCE_KINDS.includes(row.kind as SourceKind)
    ? (row.kind as SourceKind)
    : "other";
  const classificationMethod = row.classificationMethod === "explicit" ||
      row.classificationMethod === "filename" ||
      row.classificationMethod === "content" ||
      row.classificationMethod === "manual" ||
      row.classificationMethod === "uncertain"
    ? row.classificationMethod
    : null;
  return {
    id: row.id,
    kind,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    captureTime: row.createdAt,
    lifecycleStatus: normalizeSourceLifecycleStatus(row.lifecycleStatus),
    reviewStatus: row.reviewStatus === "reviewed" ? "reviewed" : "unreviewed",
    parsedText: row.parsedText,
    classificationMethod,
  };
}

function jobSourceRecord(row: typeof roleSources.$inferSelect): JobSource {
  return {
    ...sourceRecord(row),
    roleId: row.roleId,
    contextStatus: row.contextStatus === "superseded" ? "superseded" : "active",
  };
}

function documentRecord(
  row: typeof caseDocuments.$inferSelect,
  knownKind?: StoredDocumentKind,
): CaseDocument {
  const kind = knownKind ?? (isStoredDocumentKind(row.kind) ? row.kind : null);
  if (!kind) throw new Error(`Unsupported case document kind: ${row.kind}`);
  return {
    kind,
    revision: row.revision,
    content: parseJson(row.contentJson, defaultDocumentContent(kind)),
    updatedAt: row.updatedAt,
  };
}

function documentMap(rows: Array<typeof caseDocuments.$inferSelect>) {
  return completeStoredDocuments(rows.flatMap((row) => {
    return isStoredDocumentKind(row.kind) ? [documentRecord(row, row.kind)] : [];
  }));
}

export async function assertOwnedCase(userId: string, caseId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(candidateCases)
    .where(and(eq(candidateCases.id, caseId), eq(candidateCases.ownerId, userId)))
    .limit(1);
  if (!row) throw new ApiError(404, "Candidate case was not found.");
  return row;
}

export async function assertOwnedRole(userId: string, roleId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.ownerId, userId)))
    .limit(1);
  if (!row) throw new ApiError(404, "Job folder was not found.");
  return row;
}

export async function getRoleSources(userId: string, roleId: string): Promise<JobSource[]> {
  await assertOwnedRole(userId, roleId);
  const rows = await getDb()
    .select()
    .from(roleSources)
    .where(eq(roleSources.roleId, roleId))
    .orderBy(desc(roleSources.createdAt));
  return rows.map(jobSourceRecord);
}

export async function getCandidateCase(
  userId: string,
  caseId: string,
): Promise<CandidateCase> {
  const db = getDb();
  const row = await assertOwnedCase(userId, caseId);
  const [documents, sources] = await Promise.all([
    db.select().from(caseDocuments).where(eq(caseDocuments.caseId, caseId)),
    db
      .select()
      .from(caseSources)
      .where(eq(caseSources.caseId, caseId))
      .orderBy(desc(caseSources.createdAt)),
  ]);

  return {
    id: row.id,
    roleId: row.roleId,
    candidateId: row.candidateId,
    status: row.status,
    notes: row.notes,
    notesDrawingSvg: row.notesDrawingSvg,
    notesFont: row.notesFont,
    notesSize: row.notesSize,
    revision: row.revision,
    facts: parseJson<CandidateFact[]>(row.factsJson, []),
    assistant: parseJson<AssistantState>(row.assistantJson, EMPTY_ASSISTANT),
    externalRefs: parseJson<Record<string, string>>(row.externalRefsJson, {}),
    documents: documentMap(documents),
    sources: sources.map(sourceRecord),
    updatedAt: row.updatedAt,
  };
}

export async function loadWorkspace(userId: string): Promise<WorkspacePayload> {
  const db = getDb();
  const [roleRows, candidateRows, caseRows] = await Promise.all([
    db.select().from(roles).where(eq(roles.ownerId, userId)).orderBy(desc(roles.updatedAt)),
    db
      .select()
      .from(candidates)
      .where(eq(candidates.ownerId, userId))
      .orderBy(desc(candidates.updatedAt)),
    db
      .select({ id: candidateCases.id })
      .from(candidateCases)
      .where(eq(candidateCases.ownerId, userId))
      .orderBy(desc(candidateCases.updatedAt)),
  ]);
  const caseRowsHydrated = await Promise.all(
    caseRows.map(({ id }) => getCandidateCase(userId, id)),
  );
  const jobSourceEntries = await Promise.all(
    roleRows.map(async (role) => [role.id, await getRoleSources(userId, role.id)] as const),
  );
  return {
    roles: roleRows.map(roleRecord),
    candidates: candidateRows.map(candidateRecord),
    cases: caseRowsHydrated,
    jobSourcesByRoleId: Object.fromEntries(jobSourceEntries),
    connectors: connectorCapabilities,
  };
}

export type RoleIdentityRow = {
  id: string;
  ownerId: string;
  title: string;
  client: string | null;
  identityKey: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type RoleIdentityDependencies = {
  findByIdentityKey: (ownerId: string, identityKey: string) => Promise<RoleIdentityRow | null>;
  listLegacyRoles: (ownerId: string) => Promise<RoleIdentityRow[]>;
  claimLegacyRole: (
    ownerId: string,
    roleId: string,
    identityKey: string,
    updatedAt: string,
  ) => Promise<RoleIdentityRow | null>;
  insertRole: (row: RoleIdentityRow) => Promise<RoleIdentityRow | null>;
  randomUUID: () => string;
  now: () => string;
};

export async function findOrCreateRoleWithDependencies(
  userId: string,
  input: { title: string; client?: string },
  dependencies: RoleIdentityDependencies,
): Promise<RoleRecord> {
  const identityKey = normalizedJobIdentityKey(input);
  if (!identityKey) throw new ApiError(400, "A Job title is required.");

  const current = await dependencies.findByIdentityKey(userId, identityKey);
  if (current) return roleRecord(current as typeof roles.$inferSelect);

  const legacyMatch = (await dependencies.listLegacyRoles(userId))
    .find((role) => jobIdentitiesMatch(role, input));
  if (legacyMatch) {
    const claimed = await dependencies.claimLegacyRole(
      userId,
      legacyMatch.id,
      identityKey,
      dependencies.now(),
    );
    if (claimed) return roleRecord(claimed as typeof roles.$inferSelect);
    const concurrentClaim = await dependencies.findByIdentityKey(userId, identityKey);
    if (concurrentClaim) return roleRecord(concurrentClaim as typeof roles.$inferSelect);
  }

  const timestamp = dependencies.now();
  const created = await dependencies.insertRole({
    id: dependencies.randomUUID(),
    ownerId: userId,
    title: input.title,
    client: input.client || null,
    identityKey,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  if (created) return roleRecord(created as typeof roles.$inferSelect);

  const concurrent = await dependencies.findByIdentityKey(userId, identityKey);
  if (concurrent) return roleRecord(concurrent as typeof roles.$inferSelect);
  throw new ApiError(409, "The Job identity changed during creation. Retry the request.");
}

const roleIdentityDependencies: RoleIdentityDependencies = {
  async findByIdentityKey(ownerId, identityKey) {
    const [row] = await getDb()
      .select()
      .from(roles)
      .where(and(eq(roles.ownerId, ownerId), eq(roles.identityKey, identityKey)))
      .limit(1);
    return row ?? null;
  },
  async listLegacyRoles(ownerId) {
    return getDb()
      .select()
      .from(roles)
      .where(and(eq(roles.ownerId, ownerId), isNull(roles.identityKey)));
  },
  async claimLegacyRole(ownerId, roleId, identityKey, updatedAt) {
    try {
      const [row] = await getDb()
        .update(roles)
        .set({ identityKey, updatedAt })
        .where(and(
          eq(roles.ownerId, ownerId),
          eq(roles.id, roleId),
          isNull(roles.identityKey),
        ))
        .returning();
      return row ?? null;
    } catch (error) {
      if (error instanceof Error && /unique constraint/i.test(error.message)) return null;
      throw error;
    }
  },
  async insertRole(row) {
    const [created] = await getDb()
      .insert(roles)
      .values(row)
      .onConflictDoNothing()
      .returning();
    return created ?? null;
  },
  randomUUID: () => crypto.randomUUID(),
  now,
};

export function createRole(
  userId: string,
  input: { title: string; client?: string },
): Promise<RoleRecord> {
  return findOrCreateRoleWithDependencies(userId, input, roleIdentityDependencies);
}

export async function createCandidate(
  userId: string,
  input: { name: string; currentTitle?: string },
): Promise<CandidateRecord> {
  const db = getDb();
  const timestamp = now();
  const [row] = await db
    .insert(candidates)
    .values({
      id: crypto.randomUUID(),
      ownerId: userId,
      name: input.name,
      currentTitle: input.currentTitle || null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning();
  return candidateRecord(row);
}

async function activity(input: {
  caseId: string;
  actorId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  fromRevision?: number | null;
  toRevision?: number | null;
  details?: Record<string, unknown>;
}) {
  await getDb().insert(caseActivity).values({
    id: crypto.randomUUID(),
    caseId: input.caseId,
    actorId: input.actorId,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    fromRevision: input.fromRevision ?? null,
    toRevision: input.toRevision ?? null,
    detailsJson: JSON.stringify(input.details ?? {}),
    createdAt: now(),
  });
}

export async function openCandidateCase(
  userId: string,
  input: { roleId: string; candidateId: string },
): Promise<CandidateCase> {
  const db = getDb();
  const [role, candidate, existing] = await Promise.all([
    db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.id, input.roleId), eq(roles.ownerId, userId)))
      .limit(1),
    db
      .select({ id: candidates.id })
      .from(candidates)
      .where(and(eq(candidates.id, input.candidateId), eq(candidates.ownerId, userId)))
      .limit(1),
    db
      .select({ id: candidateCases.id })
      .from(candidateCases)
      .where(
        and(
          eq(candidateCases.ownerId, userId),
          eq(candidateCases.roleId, input.roleId),
          eq(candidateCases.candidateId, input.candidateId),
        ),
      )
      .limit(1),
  ]);
  if (!role[0] || !candidate[0]) {
    throw new ApiError(404, "The selected role or candidate was not found.");
  }
  if (existing[0]) return getCandidateCase(userId, existing[0].id);

  const id = crypto.randomUUID();
  const timestamp = now();
  const statements = [
    db.insert(candidateCases).values({
      id,
      ownerId: userId,
      roleId: input.roleId,
      candidateId: input.candidateId,
      assistantJson: JSON.stringify(EMPTY_ASSISTANT),
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
    ...STORED_DOCUMENT_KINDS.map((kind) =>
      db.insert(caseDocuments).values({
        caseId: id,
        kind,
        contentJson: JSON.stringify(defaultDocumentContent(kind)),
        revision: 1,
        updatedBy: userId,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ),
    ...STORED_DOCUMENT_KINDS.map((kind) =>
      db.insert(caseDocumentVersions).values({
        caseId: id,
        kind,
        revision: 1,
        contentJson: JSON.stringify(defaultDocumentContent(kind)),
        sourceRefsJson: "[]",
        origin: "generated",
        createdBy: userId,
        createdAt: timestamp,
      }),
    ),
    db.insert(caseActivity).values({
      id: crypto.randomUUID(),
      caseId: id,
      actorId: userId,
      eventType: "case_created",
      entityType: "case",
      entityId: id,
      fromRevision: null,
      toRevision: 1,
      detailsJson: JSON.stringify({ roleId: input.roleId, candidateId: input.candidateId }),
      createdAt: timestamp,
    }),
  ] as const;
  try {
    await db.batch(statements);
  } catch (error) {
    // A duplicate concurrent open is harmless; the unique tuple owns identity.
    const [concurrent] = await db
      .select({ id: candidateCases.id })
      .from(candidateCases)
      .where(
        and(
          eq(candidateCases.ownerId, userId),
          eq(candidateCases.roleId, input.roleId),
          eq(candidateCases.candidateId, input.candidateId),
        ),
      )
      .limit(1);
    if (concurrent) return getCandidateCase(userId, concurrent.id);
    throw error;
  }
  return getCandidateCase(userId, id);
}

export async function updateCandidateCase(
  userId: string,
  caseId: string,
  input: UpdateCaseInput,
): Promise<CandidateCase> {
  const db = getDb();
  const timestamp = now();
  const [updated] = await db
    .update(candidateCases)
    .set({
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.notesDrawingSvg !== undefined ? { notesDrawingSvg: input.notesDrawingSvg } : {}),
      ...(input.notesFont !== undefined ? { notesFont: input.notesFont } : {}),
      ...(input.notesSize !== undefined ? { notesSize: input.notesSize } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      revision: sql`${candidateCases.revision} + 1`,
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(candidateCases.id, caseId),
        eq(candidateCases.ownerId, userId),
        eq(candidateCases.revision, input.expectedRevision),
      ),
    )
    .returning({ revision: candidateCases.revision });

  if (!updated) {
    const current = await assertOwnedCase(userId, caseId);
    throw new ApiError(409, "Candidate case changed before this save completed.", {
      currentRevision: current.revision,
    });
  }
  await activity({
    caseId,
    actorId: userId,
    eventType: "case_saved",
    entityType: "case",
    entityId: caseId,
    fromRevision: input.expectedRevision,
    toRevision: updated.revision,
    details: {
      fields: ["notes", "notesDrawingSvg", "notesFont", "notesSize", "status"].filter(
        (key) => input[key as keyof UpdateCaseInput] !== undefined,
      ),
    },
  });
  return getCandidateCase(userId, caseId);
}

export async function saveCaseDocument(
  userId: string,
  caseId: string,
  kind: StoredDocumentKind,
  expectedRevision: number,
  content: CaseDocument["content"],
  metadata: {
    origin?: "generated" | "edited";
    sourceRefs?: string[];
    capabilityRunId?: string | null;
  } = {},
): Promise<CaseDocument> {
  const db = getDb();
  await assertOwnedCase(userId, caseId);
  let contentJson: string;
  try {
    contentJson = JSON.stringify(content);
  } catch {
    throw new ApiError(400, "Document content must be JSON serializable.");
  }
  if (contentJson === undefined || contentJson.length > 4_000_000) {
    throw new ApiError(413, "Document content is too large.");
  }
  const timestamp = now();
  let existingSourceRefs: string[] = [];
  let existingCapabilityRunId: string | null = null;
  if ((metadata.sourceRefs === undefined || metadata.capabilityRunId === undefined) &&
      expectedRevision > 0) {
    const [existingVersion] = await db
      .select({
        sourceRefsJson: caseDocumentVersions.sourceRefsJson,
        capabilityRunId: caseDocumentVersions.capabilityRunId,
      })
      .from(caseDocumentVersions)
      .where(
        and(
          eq(caseDocumentVersions.caseId, caseId),
          eq(caseDocumentVersions.kind, kind),
          eq(caseDocumentVersions.revision, expectedRevision),
        ),
      )
      .limit(1);
    existingSourceRefs = existingVersion
      ? parseJson<string[]>(existingVersion.sourceRefsJson, [])
      : [];
    existingCapabilityRunId = existingVersion?.capabilityRunId ?? null;
  }
  const sourceRefs = resolveDocumentSourceRefs(
    metadata.sourceRefs,
    existingSourceRefs,
  );
  const capabilityRunId = metadata.capabilityRunId === undefined
    ? existingCapabilityRunId
    : metadata.capabilityRunId;
  if (capabilityRunId) {
    const [ownedRun] = await db
      .select({ id: capabilityRuns.id })
      .from(capabilityRuns)
      .where(and(
        eq(capabilityRuns.id, capabilityRunId),
        eq(capabilityRuns.caseId, caseId),
      ))
      .limit(1);
    if (!ownedRun) {
      throw new ApiError(409, "The capability run does not belong to this candidate case.");
    }
  }

  // Existing cases predate loxo_update. Hydration presents a missing row as
  // revision 0, then the first save materializes revision 1.
  if (expectedRevision === 0) {
    if (kind !== "loxo_update") {
      throw new ApiError(409, "Only a newly introduced document may start at revision 0.", {
        currentRevision: null,
      });
    }
    const [created] = await db
      .insert(caseDocuments)
      .values({
        caseId,
        kind,
        contentJson,
        revision: 1,
        updatedBy: userId,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing()
      .returning();
    if (!created) {
      const [current] = await db
        .select({ revision: caseDocuments.revision })
        .from(caseDocuments)
        .where(and(eq(caseDocuments.caseId, caseId), eq(caseDocuments.kind, kind)))
        .limit(1);
      throw new ApiError(409, "Document changed before this save completed.", {
        currentRevision: current?.revision ?? null,
      });
    }
    await Promise.all([
      db.insert(caseDocumentVersions).values({
        caseId,
        kind,
        revision: created.revision,
        contentJson,
        sourceRefsJson: JSON.stringify(sourceRefs),
        capabilityRunId,
        origin: metadata.origin ?? "edited",
        createdBy: userId,
        createdAt: timestamp,
      }).onConflictDoNothing(),
      db
        .update(candidateCases)
        .set({ updatedAt: timestamp })
        .where(and(eq(candidateCases.id, caseId), eq(candidateCases.ownerId, userId))),
      activity({
        caseId,
        actorId: userId,
        eventType: "document_saved",
        entityType: "document",
        entityId: `${caseId}:${kind}`,
        fromRevision: 0,
        toRevision: created.revision,
        details: { kind, materialized: true },
      }),
    ]);
    return documentRecord(created, kind);
  }

  const [updated] = await db
    .update(caseDocuments)
    .set({
      contentJson,
      revision: sql`${caseDocuments.revision} + 1`,
      updatedBy: userId,
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(caseDocuments.caseId, caseId),
        eq(caseDocuments.kind, kind),
        eq(caseDocuments.revision, expectedRevision),
      ),
    )
    .returning();
  if (!updated) {
    const [current] = await db
      .select({ revision: caseDocuments.revision })
      .from(caseDocuments)
      .where(and(eq(caseDocuments.caseId, caseId), eq(caseDocuments.kind, kind)))
      .limit(1);
    throw new ApiError(409, "Document changed before this save completed.", {
      currentRevision: current?.revision ?? null,
    });
  }
  await Promise.all([
    db.insert(caseDocumentVersions).values({
      caseId,
      kind,
      revision: updated.revision,
      contentJson,
      sourceRefsJson: JSON.stringify(sourceRefs),
      capabilityRunId,
      origin: metadata.origin ?? "edited",
      createdBy: userId,
      createdAt: timestamp,
    }).onConflictDoNothing(),
    db
      .update(candidateCases)
      .set({ updatedAt: timestamp })
      .where(and(eq(candidateCases.id, caseId), eq(candidateCases.ownerId, userId))),
    activity({
      caseId,
      actorId: userId,
      eventType: "document_saved",
      entityType: "document",
      entityId: `${caseId}:${kind}`,
      fromRevision: expectedRevision,
      toRevision: updated.revision,
      details: { kind },
    }),
  ]);
  return documentRecord(updated, kind);
}

export async function listDocumentVersions(
  userId: string,
  caseId: string,
  kind: StoredDocumentKind,
): Promise<DocumentVersion[]> {
  await assertOwnedCase(userId, caseId);
  const rows = await getDb()
    .select()
    .from(caseDocumentVersions)
    .where(and(eq(caseDocumentVersions.caseId, caseId), eq(caseDocumentVersions.kind, kind)))
    .orderBy(desc(caseDocumentVersions.revision));
  return rows.map((row) => ({
    kind,
    revision: row.revision,
    content: parseJson(row.contentJson, defaultDocumentContent(kind)),
    sourceRefs: parseJson<string[]>(row.sourceRefsJson, []),
    capabilityRunId: row.capabilityRunId,
    origin: row.origin === "generated" ? "generated" : "edited",
    createdAt: row.createdAt,
  }));
}

export type SourceIntakeFingerprint = {
  sha256: string;
  contentType: string;
  parserVersion: string;
};

export type PersistedSourceIntakeRecord = SourceIntakeFingerprint & {
  id: string;
  sizeBytes: number;
  parsedText: string | null;
  createdAt: string;
};

export async function getPersistedSourceIntake(
  userId: string,
  fingerprint: SourceIntakeFingerprint,
): Promise<PersistedSourceIntakeRecord | null> {
  const [record] = await getDb()
    .select()
    .from(sourceIntakes)
    .where(and(
      eq(sourceIntakes.ownerId, userId),
      eq(sourceIntakes.sha256, fingerprint.sha256),
      eq(sourceIntakes.contentType, fingerprint.contentType),
      eq(sourceIntakes.parserVersion, fingerprint.parserVersion),
    ))
    .limit(1);
  return record ? {
    id: record.id,
    sha256: record.sha256,
    contentType: record.contentType,
    sizeBytes: record.sizeBytes,
    parserVersion: record.parserVersion,
    parsedText: record.parsedText,
    createdAt: record.createdAt,
  } : null;
}

export async function persistSourceIntake(
  userId: string,
  intake: SourceIntakeFingerprint & {
    sizeBytes: number;
    parsedText: string | null;
  },
): Promise<PersistedSourceIntakeRecord> {
  const [created] = await getDb()
    .insert(sourceIntakes)
    .values({
      id: crypto.randomUUID(),
      ownerId: userId,
      ...intake,
      createdAt: now(),
    })
    .onConflictDoNothing()
    .returning();
  if (created) {
    return {
      id: created.id,
      sha256: created.sha256,
      contentType: created.contentType,
      sizeBytes: created.sizeBytes,
      parserVersion: created.parserVersion,
      parsedText: created.parsedText,
      createdAt: created.createdAt,
    };
  }
  const concurrent = await getPersistedSourceIntake(userId, intake);
  if (concurrent) return concurrent;
  throw new ApiError(409, "Source intake changed during persistence. Retry the upload.");
}

export type NewSource = {
  id: string;
  caseId: string;
  kind: SourceKind;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  lifecycleStatus: SourceLifecycleStatus;
  parsedText: string | null;
  classificationMethod: CaseSource["classificationMethod"];
  intakeRecordId?: string | null;
};

export async function insertSource(userId: string, source: NewSource) {
  const db = getDb();
  await assertOwnedCase(userId, source.caseId);
  const timestamp = now();
  await db.insert(caseSources).values({
    ...source,
    reviewStatus: source.lifecycleStatus === "classified" ? "reviewed" : "unreviewed",
    createdBy: userId,
    createdAt: timestamp,
  });
  await Promise.all([
    db
      .update(candidateCases)
      .set({ updatedAt: timestamp })
      .where(and(eq(candidateCases.id, source.caseId), eq(candidateCases.ownerId, userId))),
    activity({
      caseId: source.caseId,
      actorId: userId,
      eventType: "source_attached",
      entityType: "source",
      entityId: source.id,
      details: {
        kind: source.kind,
        filename: source.filename,
        contentType: source.contentType,
        sizeBytes: source.sizeBytes,
        sha256: source.sha256,
        intakeRecordId: source.intakeRecordId ?? null,
        lifecycleStatus: source.lifecycleStatus,
        classificationMethod: source.classificationMethod,
      },
    }),
  ]);
}

export type NewRoleSource = Omit<NewSource, "caseId"> & { roleId: string };

export async function insertRoleSource(userId: string, source: NewRoleSource) {
  await assertOwnedRole(userId, source.roleId);
  await getDb().insert(roleSources).values({
    ...source,
    reviewStatus: source.lifecycleStatus === "classified" ? "reviewed" : "unreviewed",
    contextStatus: "active",
    createdBy: userId,
    createdAt: now(),
  });
}

export async function getOwnedRoleSource(userId: string, roleId: string, sourceId: string) {
  await assertOwnedRole(userId, roleId);
  const [source] = await getDb().select().from(roleSources).where(and(
    eq(roleSources.id, sourceId),
    eq(roleSources.roleId, roleId),
  )).limit(1);
  if (!source) throw new ApiError(404, "Job source was not found.");
  return source;
}

export async function reviewRoleSource(
  userId: string,
  roleId: string,
  sourceId: string,
  kind?: SourceKind,
): Promise<JobSource[]> {
  const source = await getOwnedRoleSource(userId, roleId, sourceId);
  const lifecycle = normalizeSourceLifecycleStatus(source.lifecycleStatus);
  if (!canReviewSource(lifecycle, kind)) {
    throw new ApiError(409, "The source must be parsed and classified before review.");
  }
  await getDb().update(roleSources).set({
    kind: kind ?? source.kind,
    lifecycleStatus: "reviewed",
    reviewStatus: "reviewed",
    classificationMethod: kind ? "manual" : source.classificationMethod,
  }).where(and(eq(roleSources.id, sourceId), eq(roleSources.roleId, roleId)));
  return getRoleSources(userId, roleId);
}

export async function reviewSource(
  userId: string,
  caseId: string,
  sourceId: string,
  kind?: SourceKind,
): Promise<CandidateCase> {
  const db = getDb();
  const [source, ownedCase] = await Promise.all([
    getOwnedSource(userId, caseId, sourceId),
    assertOwnedCase(userId, caseId),
  ]);
  const currentLifecycleStatus = normalizeSourceLifecycleStatus(source.lifecycleStatus);
  if (!canReviewSource(currentLifecycleStatus, kind)) {
    throw new ApiError(409, "The source must be parsed and classified before review.", {
      currentLifecycleStatus,
      requiresKind: currentLifecycleStatus === "parsed",
    });
  }

  const reviewedKind = kind ?? source.kind;
  const timestamp = now();
  await Promise.all([
    db
      .update(caseSources)
      .set({
        kind: reviewedKind,
        lifecycleStatus: "reviewed",
        reviewStatus: "reviewed",
        classificationMethod: kind ? "manual" : source.classificationMethod,
      })
      .where(and(eq(caseSources.id, sourceId), eq(caseSources.caseId, caseId))),
    db
      .update(candidateCases)
      .set({ updatedAt: timestamp })
      .where(and(eq(candidateCases.id, caseId), eq(candidateCases.ownerId, userId))),
    activity({
      caseId,
      actorId: userId,
      eventType: "source_reviewed",
      entityType: "source",
      entityId: sourceId,
      details: {
        previousKind: source.kind,
        kind: reviewedKind,
        previousLifecycleStatus: currentLifecycleStatus,
        lifecycleStatus: "reviewed",
      },
    }),
  ]);

  if (reviewedKind === "resume" && source.parsedText?.trim()) {
    const [[candidate], [submissionRow]] = await Promise.all([
      db.select().from(candidates).where(and(
        eq(candidates.id, ownedCase.candidateId),
        eq(candidates.ownerId, userId),
      )).limit(1),
      db.select().from(caseDocuments).where(and(
        eq(caseDocuments.caseId, caseId),
        eq(caseDocuments.kind, "submission"),
      )).limit(1),
    ]);
    if (candidate && submissionRow) {
      const prefill = prefillSubmissionFromResume({
        current: coerceSubmissionDocument(parseJson(submissionRow.contentJson, {})),
        candidate: candidateRecord(candidate),
        parsedText: source.parsedText,
      });
      if (prefill.filledFields.length) {
        try {
          await saveCaseDocument(
            userId,
            caseId,
            "submission",
            submissionRow.revision,
            prefill.document,
          );
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 409) throw error;
        }
      }
    }
  }
  return getCandidateCase(userId, caseId);
}

export async function getOwnedSource(userId: string, caseId: string, sourceId: string) {
  const db = getDb();
  await assertOwnedCase(userId, caseId);
  const [source] = await db
    .select()
    .from(caseSources)
    .where(and(eq(caseSources.id, sourceId), eq(caseSources.caseId, caseId)))
    .limit(1);
  if (!source) throw new ApiError(404, "Source was not found.");
  return source;
}

export async function getCapabilityCaseContext(userId: string, caseId: string) {
  const db = getDb();
  const candidateCase = await getCandidateCase(userId, caseId);
  const [[role], [candidate], sharedSources] = await Promise.all([
    db.select().from(roles).where(and(eq(roles.id, candidateCase.roleId), eq(roles.ownerId, userId))).limit(1),
    db.select().from(candidates).where(and(eq(candidates.id, candidateCase.candidateId), eq(candidates.ownerId, userId))).limit(1),
    getRoleSources(userId, candidateCase.roleId),
  ]);
  if (!role || !candidate) throw new ApiError(404, "The selected role or candidate was not found.");
  return {
    candidateCase: {
      ...candidateCase,
      sources: [
        ...candidateCase.sources,
        ...sharedSources.filter((source) => source.contextStatus === "active"),
      ],
    },
    role: roleRecord(role),
    candidate: candidateRecord(candidate),
  };
}
