import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { capabilityRuns } from "@/db/schema";
import { resolveDocumentSourceRefs } from "@/lib/document-model";
import { ApiError } from "@/lib/server/api";
import {
  capabilityRunTransitionPatch,
  CapabilityRunTransitionError,
  getCapabilityRun,
  type CapabilityRunRecord,
} from "@/lib/server/capability-run-repository";
import { assertOwnedCase } from "@/lib/server/case-repository";
import {
  GENERATED_OUTPUT_KINDS,
  type CaseDocument,
  type GeneratedOutputKind,
} from "@/lib/workstation-types";

export type DraftReadyPackageDocument = {
  kind: GeneratedOutputKind;
  expectedRevision: number;
  content: CaseDocument["content"];
};

export type CommitDraftReadyDocumentPackageInput = {
  documents: DraftReadyPackageDocument[];
  sourceRefs: string[];
  result: unknown;
  evidence: unknown;
};

export type CommittedDraftReadyDocumentPackage = {
  run: CapabilityRunRecord;
  documents: CaseDocument[];
};

type PreparedDocument = DraftReadyPackageDocument & {
  contentJson: string;
  nextRevision: number;
  activityId: string;
};

function serializeDocumentContent(content: CaseDocument["content"]) {
  let contentJson: string | undefined;
  try {
    contentJson = JSON.stringify(content);
  } catch {
    throw new ApiError(400, "Document content must be JSON serializable.");
  }
  if (contentJson === undefined || contentJson.length > 4_000_000) {
    throw new ApiError(413, "Document content is too large.");
  }
  return contentJson;
}

function prepareDocuments(documents: DraftReadyPackageDocument[]): PreparedDocument[] {
  const byKind = new Map<GeneratedOutputKind, DraftReadyPackageDocument>();
  for (const document of documents) {
    if (byKind.has(document.kind)) {
      throw new ApiError(400, `The write-up package repeats ${document.kind}.`);
    }
    if (!Number.isInteger(document.expectedRevision) || document.expectedRevision < 0) {
      throw new ApiError(400, `The write-up package has an invalid ${document.kind} revision.`);
    }
    if (document.expectedRevision === 0 && document.kind !== "loxo_update") {
      throw new ApiError(409, "Only a newly introduced document may start at revision 0.");
    }
    byKind.set(document.kind, document);
  }
  if (byKind.size !== GENERATED_OUTPUT_KINDS.length ||
      GENERATED_OUTPUT_KINDS.some((kind) => !byKind.has(kind))) {
    throw new ApiError(400, "The write-up package must contain all four generated outputs exactly once.");
  }
  return GENERATED_OUTPUT_KINDS.map((kind) => {
    const document = byKind.get(kind)!;
    return {
      ...document,
      contentJson: serializeDocumentContent(document.content),
      nextRevision: document.expectedRevision + 1,
      activityId: crypto.randomUUID(),
    };
  });
}

function guardStatement(
  client: D1Database,
  conditions: string[],
  bindings: unknown[],
) {
  return client.prepare(
    `SELECT CASE WHEN (${conditions.join(" AND ")})
      THEN 1 ELSE json('write-up-package-guard-failed') END AS package_guard`,
  ).bind(...bindings);
}

export async function commitDraftReadyDocumentPackage(
  userId: string,
  caseId: string,
  runId: string,
  input: CommitDraftReadyDocumentPackageInput,
): Promise<CommittedDraftReadyDocumentPackage> {
  const db = getDb();
  await assertOwnedCase(userId, caseId);
  const [currentRun] = await db
    .select()
    .from(capabilityRuns)
    .where(and(eq(capabilityRuns.id, runId), eq(capabilityRuns.caseId, caseId)))
    .limit(1);
  if (!currentRun) throw new ApiError(404, "Capability run was not found.");

  const timestamp = new Date().toISOString();
  let runPatch;
  try {
    runPatch = capabilityRunTransitionPatch(currentRun, {
      status: "draft_ready",
      result: input.result,
      evidence: input.evidence,
    }, timestamp);
  } catch (error) {
    if (!(error instanceof CapabilityRunTransitionError)) throw error;
    throw new ApiError(409, error.message, { currentStatus: currentRun.status });
  }
  if (typeof runPatch.resultJson !== "string" || typeof runPatch.evidenceJson !== "string") {
    throw new ApiError(500, "The draft-ready package is missing persisted result evidence.");
  }

  const documents = prepareDocuments(input.documents);
  const sourceRefsJson = JSON.stringify(resolveDocumentSourceRefs(input.sourceRefs, []));
  const client = db.$client;
  const preconditions = [
    "EXISTS (SELECT 1 FROM candidate_cases WHERE id = ? AND owner_id = ?)",
    "EXISTS (SELECT 1 FROM capability_runs WHERE id = ? AND case_id = ? AND status = 'running')",
  ];
  const preconditionBindings: unknown[] = [caseId, userId, runId, caseId];
  for (const document of documents) {
    if (document.expectedRevision === 0) {
      preconditions.push(
        "NOT EXISTS (SELECT 1 FROM case_documents WHERE case_id = ? AND kind = ?)",
      );
      preconditionBindings.push(caseId, document.kind);
    } else {
      preconditions.push(
        "EXISTS (SELECT 1 FROM case_documents WHERE case_id = ? AND kind = ? AND revision = ?)",
      );
      preconditionBindings.push(caseId, document.kind, document.expectedRevision);
    }
  }

  const statements: D1PreparedStatement[] = [
    guardStatement(client, preconditions, preconditionBindings),
  ];
  for (const document of documents) {
    if (document.expectedRevision === 0) {
      statements.push(client.prepare(
        `INSERT INTO case_documents
          (case_id, kind, content_json, revision, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        caseId,
        document.kind,
        document.contentJson,
        document.nextRevision,
        userId,
        timestamp,
        timestamp,
      ));
    } else {
      statements.push(client.prepare(
        `UPDATE case_documents
         SET content_json = ?, revision = ?, updated_by = ?, updated_at = ?
         WHERE case_id = ? AND kind = ? AND revision = ?`,
      ).bind(
        document.contentJson,
        document.nextRevision,
        userId,
        timestamp,
        caseId,
        document.kind,
        document.expectedRevision,
      ));
    }
    statements.push(client.prepare(
      `INSERT INTO case_document_versions
        (case_id, kind, revision, content_json, source_refs_json, capability_run_id,
         origin, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'generated', ?, ?)`,
    ).bind(
      caseId,
      document.kind,
      document.nextRevision,
      document.contentJson,
      sourceRefsJson,
      runId,
      userId,
      timestamp,
    ));
    statements.push(client.prepare(
      `INSERT INTO case_activity
        (id, case_id, actor_id, event_type, entity_type, entity_id,
         from_revision, to_revision, details_json, created_at)
       VALUES (?, ?, ?, 'document_saved', 'document', ?, ?, ?, ?, ?)`,
    ).bind(
      document.activityId,
      caseId,
      userId,
      `${caseId}:${document.kind}`,
      document.expectedRevision,
      document.nextRevision,
      JSON.stringify({
        kind: document.kind,
        ...(document.expectedRevision === 0 ? { materialized: true } : {}),
      }),
      timestamp,
    ));
  }
  statements.push(client.prepare(
    "UPDATE candidate_cases SET updated_at = ? WHERE id = ? AND owner_id = ?",
  ).bind(timestamp, caseId, userId));
  statements.push(client.prepare(
    `UPDATE capability_runs
     SET status = 'draft_ready', result_json = ?, evidence_json = ?, updated_at = ?
     WHERE id = ? AND case_id = ? AND status = 'running'`,
  ).bind(
    runPatch.resultJson,
    runPatch.evidenceJson,
    timestamp,
    runId,
    caseId,
  ));

  const postconditions = [
    `EXISTS (
      SELECT 1 FROM capability_runs
      WHERE id = ? AND case_id = ? AND status = 'draft_ready'
        AND result_json = ? AND evidence_json = ?
    )`,
    "EXISTS (SELECT 1 FROM candidate_cases WHERE id = ? AND owner_id = ? AND updated_at = ?)",
  ];
  const postconditionBindings: unknown[] = [
    runId,
    caseId,
    runPatch.resultJson,
    runPatch.evidenceJson,
    caseId,
    userId,
    timestamp,
  ];
  for (const document of documents) {
    postconditions.push(
      `EXISTS (
        SELECT 1 FROM case_documents
        WHERE case_id = ? AND kind = ? AND revision = ? AND content_json = ?
      )`,
      `EXISTS (
        SELECT 1 FROM case_document_versions
        WHERE case_id = ? AND kind = ? AND revision = ? AND content_json = ?
          AND source_refs_json = ? AND capability_run_id = ? AND origin = 'generated'
      )`,
      `EXISTS (
        SELECT 1 FROM case_activity
        WHERE id = ? AND case_id = ? AND entity_type = 'document'
          AND entity_id = ? AND from_revision = ? AND to_revision = ?
      )`,
    );
    postconditionBindings.push(
      caseId,
      document.kind,
      document.nextRevision,
      document.contentJson,
      caseId,
      document.kind,
      document.nextRevision,
      document.contentJson,
      sourceRefsJson,
      runId,
      document.activityId,
      caseId,
      `${caseId}:${document.kind}`,
      document.expectedRevision,
      document.nextRevision,
    );
  }
  statements.push(guardStatement(client, postconditions, postconditionBindings));

  // D1 runs a batch sequentially inside one transaction and rolls the entire
  // package back if a document, evidence, activity, guard, or run update fails.
  await client.batch(statements);

  return {
    run: await getCapabilityRun(userId, caseId, runId),
    documents: documents.map((document) => ({
      kind: document.kind,
      revision: document.nextRevision,
      content: document.content,
      updatedAt: timestamp,
    })),
  };
}
