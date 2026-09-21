CREATE TABLE `source_intakes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`sha256` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`parser_version` text NOT NULL,
	`parsed_text` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "source_intakes_sha256_check" CHECK(length("source_intakes"."sha256") = 64),
	CONSTRAINT "source_intakes_size_bytes_check" CHECK("source_intakes"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_intakes_owner_content_uidx` ON `source_intakes` (`owner_id`,`sha256`,`content_type`,`parser_version`);--> statement-breakpoint
CREATE INDEX `source_intakes_owner_created_idx` ON `source_intakes` (`owner_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `case_sources` ADD `intake_record_id` text REFERENCES source_intakes(id);--> statement-breakpoint
ALTER TABLE `role_sources` ADD `intake_record_id` text REFERENCES source_intakes(id);--> statement-breakpoint
ALTER TABLE `roles` ADD `identity_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `roles_owner_identity_uidx` ON `roles` (`owner_id`,`identity_key`);