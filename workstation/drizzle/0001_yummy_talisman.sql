ALTER TABLE `case_sources` ADD `lifecycle_status` text DEFAULT 'uploaded' NOT NULL;--> statement-breakpoint
ALTER TABLE `case_sources` ADD `parsed_text` text;--> statement-breakpoint
ALTER TABLE `case_sources` ADD `classification_method` text;