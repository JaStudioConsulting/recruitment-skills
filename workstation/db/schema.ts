import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const roles = sqliteTable(
  "roles",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    client: text("client"),
    identityKey: text("identity_key"),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("roles_owner_identity_uidx").on(table.ownerId, table.identityKey),
    index("roles_owner_updated_idx").on(table.ownerId, table.updatedAt),
  ],
);

export const candidates = sqliteTable(
  "candidates",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    currentTitle: text("current_title"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("candidates_owner_updated_idx").on(table.ownerId, table.updatedAt),
  ],
);

// Parsing is durable and content-addressed. Proposal and final attachment paths
// reuse this record so document bytes are not parsed twice.
export const sourceIntakes = sqliteTable(
  "source_intakes",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    sha256: text("sha256").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    parserVersion: text("parser_version").notNull(),
    parsedText: text("parsed_text"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("source_intakes_owner_content_uidx").on(
      table.ownerId,
      table.sha256,
      table.contentType,
      table.parserVersion,
    ),
    index("source_intakes_owner_created_idx").on(table.ownerId, table.createdAt),
    check("source_intakes_sha256_check", sql`length(${table.sha256}) = 64`),
    check("source_intakes_size_bytes_check", sql`${table.sizeBytes} >= 0`),
  ],
);

export const candidateCases = sqliteTable(
  "candidate_cases",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("active"),
    notes: text("notes").notNull().default(""),
    notesDrawingSvg: text("notes_drawing_svg").notNull().default(""),
    notesFont: text("notes_font").notNull().default("System"),
    notesSize: integer("notes_size").notNull().default(20),
    revision: integer("revision").notNull().default(1),
    factsJson: text("facts_json").notNull().default("[]"),
    assistantJson: text("assistant_json").notNull().default("{}"),
    externalRefsJson: text("external_refs_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("candidate_cases_owner_role_candidate_uidx").on(
      table.ownerId,
      table.roleId,
      table.candidateId,
    ),
    index("candidate_cases_owner_updated_idx").on(table.ownerId, table.updatedAt),
    index("candidate_cases_owner_role_idx").on(table.ownerId, table.roleId),
  ],
);

export const caseDocuments = sqliteTable(
  "case_documents",
  {
    caseId: text("case_id")
      .notNull()
      .references(() => candidateCases.id, { onDelete: "restrict" }),
    // Keep the legacy capability_runs storage value readable so deployments do
    // not need to rewrite or delete historical rows. Public document contracts
    // filter it out; new run history lives in the capabilityRuns table below.
    kind: text("kind", {
      enum: ["resume", "write_up", "submission", "email", "loxo_update", "capability_runs"],
    }).notNull(),
    contentJson: text("content_json").notNull(),
    revision: integer("revision").notNull().default(1),
    updatedBy: text("updated_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.caseId, table.kind] }),
    index("case_documents_case_idx").on(table.caseId),
  ],
);

export const caseSources = sqliteTable(
  "case_sources",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => candidateCases.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    storageKey: text("storage_key").notNull(),
    reviewStatus: text("review_status").notNull().default("unreviewed"),
    lifecycleStatus: text("lifecycle_status").notNull().default("uploaded"),
    parsedText: text("parsed_text"),
    classificationMethod: text("classification_method"),
    intakeRecordId: text("intake_record_id")
      .references(() => sourceIntakes.id, { onDelete: "restrict" }),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("case_sources_storage_key_uidx").on(table.storageKey),
    index("case_sources_case_created_idx").on(table.caseId, table.createdAt),
  ],
);

// Roles are presented as Job folders in the workstation. Sources attached here
// are reusable context for every candidate case opened inside the Job.
export const roleSources = sqliteTable(
  "role_sources",
  {
    id: text("id").primaryKey(),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    storageKey: text("storage_key").notNull(),
    reviewStatus: text("review_status").notNull().default("unreviewed"),
    lifecycleStatus: text("lifecycle_status").notNull().default("uploaded"),
    parsedText: text("parsed_text"),
    classificationMethod: text("classification_method"),
    intakeRecordId: text("intake_record_id")
      .references(() => sourceIntakes.id, { onDelete: "restrict" }),
    contextStatus: text("context_status").notNull().default("active"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("role_sources_storage_key_uidx").on(table.storageKey),
    index("role_sources_role_created_idx").on(table.roleId, table.createdAt),
  ],
);

export const capabilityRuns = sqliteTable(
  "capability_runs",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => candidateCases.id, { onDelete: "restrict" }),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "restrict" }),
    capabilityId: text("capability_id").notNull(),
    executorId: text("executor_id"),
    supportingAuthorityIdsJson: text("supporting_authority_ids_json").notNull().default("[]"),
    authorityDigest: text("authority_digest").notNull(),
    sourceRefsJson: text("source_refs_json").notNull().default("[]"),
    inputSnapshotHash: text("input_snapshot_hash").notNull(),
    inputJson: text("input_json").notNull(),
    outputKind: text("output_kind"),
    implementationStatus: text("implementation_status", {
      enum: ["working", "partial", "interface_only", "blocked", "not_applicable"],
    }).notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    preparedAt: text("prepared_at").notNull(),
    status: text("status", {
      enum: [
        "prepared",
        "running",
        "draft_ready",
        "awaiting_visual_qa",
        "completed",
        "refused",
        "cancelled",
        "failed",
      ],
    }).notNull().default("prepared"),
    resultJson: text("result_json"),
    evidenceJson: text("evidence_json").notNull().default("{}"),
    errorJson: text("error_json"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("capability_runs_case_prepared_idx").on(table.caseId, table.preparedAt),
    index("capability_runs_case_capability_idx").on(table.caseId, table.capabilityId),
    check(
      "capability_runs_status_check",
      sql`${table.status} in ('prepared', 'running', 'draft_ready', 'awaiting_visual_qa', 'completed', 'refused', 'cancelled', 'failed')`,
    ),
    check(
      "capability_runs_implementation_status_check",
      sql`${table.implementationStatus} in ('working', 'partial', 'interface_only', 'blocked', 'not_applicable')`,
    ),
    check("capability_runs_authority_digest_check", sql`length(${table.authorityDigest}) = 64`),
    check("capability_runs_input_snapshot_hash_check", sql`length(${table.inputSnapshotHash}) = 64`),
  ],
);

// case_documents remains the fast current snapshot. This table makes every
// saved edit or regeneration recoverable without changing legacy reads.
export const caseDocumentVersions = sqliteTable(
  "case_document_versions",
  {
    caseId: text("case_id")
      .notNull()
      .references(() => candidateCases.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    revision: integer("revision").notNull(),
    contentJson: text("content_json").notNull(),
    sourceRefsJson: text("source_refs_json").notNull().default("[]"),
    capabilityRunId: text("capability_run_id")
      .references(() => capabilityRuns.id, { onDelete: "restrict" }),
    origin: text("origin").notNull().default("edited"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.caseId, table.kind, table.revision] }),
    index("case_document_versions_case_kind_idx").on(table.caseId, table.kind),
  ],
);

export const caseActivity = sqliteTable(
  "case_activity",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => candidateCases.id, { onDelete: "restrict" }),
    actorId: text("actor_id").notNull(),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    fromRevision: integer("from_revision"),
    toRevision: integer("to_revision"),
    detailsJson: text("details_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("case_activity_case_created_idx").on(table.caseId, table.createdAt),
    uniqueIndex("case_activity_entity_revision_uidx").on(
      table.entityType,
      table.entityId,
      table.toRevision,
    ),
  ],
);

export const caseArtifacts = sqliteTable(
  "case_artifacts",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => candidateCases.id, { onDelete: "restrict" }),
    runId: text("run_id")
      .notNull()
      .references(() => capabilityRuns.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    storageKey: text("storage_key").notNull(),
    sha256: text("sha256").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    revision: integer("revision").notNull().default(1),
    evidenceJson: text("evidence_json").notNull().default("{}"),
    visualQaStatus: text("visual_qa_status", {
      enum: ["pending", "passed", "failed"],
    }).notNull().default("pending"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: text("reviewed_at"),
    reviewEvidenceJson: text("review_evidence_json").notNull().default("{}"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("case_artifacts_storage_key_uidx").on(table.storageKey),
    index("case_artifacts_case_created_idx").on(table.caseId, table.createdAt),
    index("case_artifacts_run_created_idx").on(table.runId, table.createdAt),
    check(
      "case_artifacts_visual_qa_status_check",
      sql`${table.visualQaStatus} in ('pending', 'passed', 'failed')`,
    ),
    check("case_artifacts_size_bytes_check", sql`${table.sizeBytes} >= 0`),
    check("case_artifacts_revision_check", sql`${table.revision} >= 1`),
    check("case_artifacts_sha256_check", sql`length(${table.sha256}) = 64`),
  ],
);
