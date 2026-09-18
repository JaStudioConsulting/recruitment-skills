import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  candidateCases,
  candidates,
  caseActivity,
  caseDocuments,
  caseSources,
  roles,
} from "@/db/schema";
import { ApiError } from "@/lib/server/api";
import { connectorCapabilities } from "@/lib/server/connectors";
import {
  canReviewSource,
  normalizeSourceLifecycleStatus,
} from "@/lib/server/source-intake";
import {
  completeStoredDocuments,
  defaultDocumentContent,
} from "@/lib/document-model";
import {
  SOURCE_KINDS,
  STORED_DOCUMENT_KINDS,
  type AssistantState,
  type CandidateCase,
  type CandidateFact,
  type CandidateRecord,
  type CaseDocument,
  type CaseSource,
  type SourceKind,
  type SourceLifecycleStatus,
  type StoredDocumentKind,
  type RoleRecord,
  type WorkspacePayload,
} from "@/lib/workstation-types";
import type { UpdateCaseInput } from "@/lib/contracts/workstation";

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

function sourceRecord(row: typeof caseSources.$inferSelect): CaseSource {
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

function documentRecord(row: typeof caseDocuments.$inferSelect): CaseDocument {
  return {
    kind: row.kind,
    revision: row.revision,
    content: parseJson(row.contentJson, defaultDocumentContent(row.kind)),
    updatedAt: row.updatedAt,
  };
}

function documentMap(rows: Array<typeof caseDocuments.$inferSelect>) {
  return completeStoredDocuments(rows.map(documentRecord));
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
  return {
    roles: roleRows.map(roleRecord),
    candidates: candidateRows.map(candidateRecord),
    cases: caseRowsHydrated,
    connectors: connectorCapabilities,
  };
}

export async function createRole(
  userId: string,
  input: { title: string; client?: string },
): Promise<RoleRecord> {
  const db = getDb();
  const timestamp = now();
  const [row] = await db
    .insert(roles)
    .values({
      id: crypto.randomUUID(),
      ownerId: userId,
      title: input.title,
      client: input.client || null,
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning();
  return roleRecord(row);
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
      fields: ["notes", "notesFont", "notesSize", "status"].filter(
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

  // Existing cases predate loxo_update. Hydration presents that missing row as
  // revision 0, and its first save atomically materializes revision 1. No other
  // document kind may use revision 0 to recreate a missing or deleted row.
  if (expectedRevision === 0) {
    if (kind !== "loxo_update") {
      throw new ApiError(409, "Only a missing Loxo update document may start at revision 0.", {
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
    return documentRecord(created);
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
  return documentRecord(updated);
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
};

export async function insertSource(userId: string, source: NewSource) {
  const db = getDb();
  await assertOwnedCase(userId, source.caseId);
  const timestamp = now();
  await db.insert(caseSources).values({
    ...source,
    reviewStatus: "unreviewed",
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
        lifecycleStatus: source.lifecycleStatus,
        classificationMethod: source.classificationMethod,
      },
    }),
  ]);
}

export async function reviewSource(
  userId: string,
  caseId: string,
  sourceId: string,
  kind?: SourceKind,
): Promise<CandidateCase> {
  const db = getDb();
  const source = await getOwnedSource(userId, caseId, sourceId);
  const currentLifecycleStatus = normalizeSourceLifecycleStatus(source.lifecycleStatus);
  if (!canReviewSource(currentLifecycleStatus, kind)) {
    throw new ApiError(409, "The source must be parsed and classified before review.", {
      currentLifecycleStatus,
      requiresKind: currentLifecycleStatus === "parsed",
    });
  }

  const timestamp = now();
  await Promise.all([
    db
      .update(caseSources)
      .set({
        kind: kind ?? source.kind,
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
        kind: kind ?? source.kind,
        previousLifecycleStatus: currentLifecycleStatus,
        lifecycleStatus: "reviewed",
      },
    }),
  ]);
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
