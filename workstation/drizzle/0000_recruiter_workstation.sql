CREATE TABLE `candidate_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`role_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`notes_font` text DEFAULT 'System' NOT NULL,
	`notes_size` integer DEFAULT 20 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`facts_json` text DEFAULT '[]' NOT NULL,
	`assistant_json` text DEFAULT '{}' NOT NULL,
	`external_refs_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `candidate_cases_owner_role_candidate_uidx` ON `candidate_cases` (`owner_id`,`role_id`,`candidate_id`);--> statement-breakpoint
CREATE INDEX `candidate_cases_owner_updated_idx` ON `candidate_cases` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `candidate_cases_owner_role_idx` ON `candidate_cases` (`owner_id`,`role_id`);--> statement-breakpoint
CREATE TABLE `candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`current_title` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `candidates_owner_updated_idx` ON `candidates` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `case_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`event_type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`from_revision` integer,
	`to_revision` integer,
	`details_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `candidate_cases`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `case_activity_case_created_idx` ON `case_activity` (`case_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `case_activity_entity_revision_uidx` ON `case_activity` (`entity_type`,`entity_id`,`to_revision`);--> statement-breakpoint
CREATE TABLE `case_documents` (
	`case_id` text NOT NULL,
	`kind` text NOT NULL,
	`content_json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`case_id`, `kind`),
	FOREIGN KEY (`case_id`) REFERENCES `candidate_cases`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `case_documents_case_idx` ON `case_documents` (`case_id`);--> statement-breakpoint
CREATE TABLE `case_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`kind` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`storage_key` text NOT NULL,
	`review_status` text DEFAULT 'unreviewed' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `candidate_cases`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `case_sources_storage_key_uidx` ON `case_sources` (`storage_key`);--> statement-breakpoint
CREATE INDEX `case_sources_case_created_idx` ON `case_sources` (`case_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`client` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `roles_owner_updated_idx` ON `roles` (`owner_id`,`updated_at`);
