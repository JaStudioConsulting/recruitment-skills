import { sql } from "drizzle-orm";
import {
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
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
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
    contextStatus: text("context_status").notNull().default("active"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("role_sources_storage_key_uidx").on(table.storageKey),
    index("role_sources_role_created_idx").on(table.roleId, table.createdAt),
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
