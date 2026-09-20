CREATE TABLE `case_document_versions` (
	`case_id` text NOT NULL,
	`kind` text NOT NULL,
	`revision` integer NOT NULL,
	`content_json` text NOT NULL,
	`source_refs_json` text DEFAULT '[]' NOT NULL,
	`origin` text DEFAULT 'edited' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`case_id`, `kind`, `revision`),
	FOREIGN KEY (`case_id`) REFERENCES `candidate_cases`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `case_document_versions_case_kind_idx` ON `case_document_versions` (`case_id`,`kind`);--> statement-breakpoint
INSERT OR IGNORE INTO `case_document_versions`
  (`case_id`, `kind`, `revision`, `content_json`, `source_refs_json`, `origin`, `created_by`, `created_at`)
SELECT
  `case_id`, `kind`, `revision`, `content_json`, '[]', 'edited', `updated_by`, `updated_at`
FROM `case_documents`;--> statement-breakpoint
CREATE TABLE `role_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text NOT NULL,
	`kind` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`storage_key` text NOT NULL,
	`review_status` text DEFAULT 'unreviewed' NOT NULL,
	`lifecycle_status` text DEFAULT 'uploaded' NOT NULL,
	`parsed_text` text,
	`classification_method` text,
	`context_status` text DEFAULT 'active' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `role_sources_storage_key_uidx` ON `role_sources` (`storage_key`);--> statement-breakpoint
CREATE INDEX `role_sources_role_created_idx` ON `role_sources` (`role_id`,`created_at`);
