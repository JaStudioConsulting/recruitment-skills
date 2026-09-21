CREATE TABLE `capability_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`role_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`capability_id` text NOT NULL,
	`executor_id` text,
	`supporting_authority_ids_json` text DEFAULT '[]' NOT NULL,
	`authority_digest` text NOT NULL,
	`source_refs_json` text DEFAULT '[]' NOT NULL,
	`input_snapshot_hash` text NOT NULL,
	`input_json` text NOT NULL,
	`output_kind` text,
	`implementation_status` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prepared_at` text NOT NULL,
	`status` text DEFAULT 'prepared' NOT NULL,
	`result_json` text,
	`evidence_json` text DEFAULT '{}' NOT NULL,
	`error_json` text,
	`started_at` text,
	`finished_at` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `candidate_cases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "capability_runs_status_check" CHECK("capability_runs"."status" in ('prepared', 'running', 'draft_ready', 'awaiting_visual_qa', 'completed', 'refused', 'cancelled', 'failed')),
	CONSTRAINT "capability_runs_implementation_status_check" CHECK("capability_runs"."implementation_status" in ('working', 'partial', 'interface_only', 'blocked', 'not_applicable')),
	CONSTRAINT "capability_runs_authority_digest_check" CHECK(length("capability_runs"."authority_digest") = 64),
	CONSTRAINT "capability_runs_input_snapshot_hash_check" CHECK(length("capability_runs"."input_snapshot_hash") = 64)
);
--> statement-breakpoint
CREATE INDEX `capability_runs_case_prepared_idx` ON `capability_runs` (`case_id`,`prepared_at`);--> statement-breakpoint
CREATE INDEX `capability_runs_case_capability_idx` ON `capability_runs` (`case_id`,`capability_id`);--> statement-breakpoint
CREATE TABLE `case_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`run_id` text NOT NULL,
	`kind` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`storage_key` text NOT NULL,
	`sha256` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`evidence_json` text DEFAULT '{}' NOT NULL,
	`visual_qa_status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`review_evidence_json` text DEFAULT '{}' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `candidate_cases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`run_id`) REFERENCES `capability_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "case_artifacts_visual_qa_status_check" CHECK("case_artifacts"."visual_qa_status" in ('pending', 'passed', 'failed')),
	CONSTRAINT "case_artifacts_size_bytes_check" CHECK("case_artifacts"."size_bytes" >= 0),
	CONSTRAINT "case_artifacts_revision_check" CHECK("case_artifacts"."revision" >= 1),
	CONSTRAINT "case_artifacts_sha256_check" CHECK(length("case_artifacts"."sha256") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `case_artifacts_storage_key_uidx` ON `case_artifacts` (`storage_key`);--> statement-breakpoint
CREATE INDEX `case_artifacts_case_created_idx` ON `case_artifacts` (`case_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `case_artifacts_run_created_idx` ON `case_artifacts` (`run_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `case_document_versions` ADD `capability_run_id` text REFERENCES capability_runs(id);