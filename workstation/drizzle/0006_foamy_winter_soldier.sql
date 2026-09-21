ALTER TABLE `case_sources` ADD `context_status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
UPDATE `case_sources`
SET `review_status` = 'unreviewed'
WHERE `lifecycle_status` <> 'reviewed';--> statement-breakpoint
UPDATE `role_sources`
SET `review_status` = 'unreviewed'
WHERE `lifecycle_status` <> 'reviewed';--> statement-breakpoint
UPDATE `case_sources`
SET `context_status` = 'superseded'
WHERE `id` IN (
  SELECT `id`
  FROM (
    SELECT
      `id`,
      ROW_NUMBER() OVER (
        PARTITION BY `case_id`, `sha256`
        ORDER BY
          CASE WHEN `classification_method` = 'manual' THEN 0 ELSE 1 END,
          CASE WHEN `lifecycle_status` = 'reviewed' THEN 0 ELSE 1 END,
          `created_at`,
          `id`
      ) AS `source_rank`
    FROM `case_sources`
    WHERE `context_status` = 'active'
  ) AS `ranked_case_sources`
  WHERE `source_rank` > 1
);--> statement-breakpoint
UPDATE `role_sources`
SET `context_status` = 'superseded'
WHERE `id` IN (
  SELECT `id`
  FROM (
    SELECT
      `id`,
      ROW_NUMBER() OVER (
        PARTITION BY `role_id`, `sha256`
        ORDER BY
          CASE WHEN `classification_method` = 'manual' THEN 0 ELSE 1 END,
          CASE WHEN `lifecycle_status` = 'reviewed' THEN 0 ELSE 1 END,
          `created_at`,
          `id`
      ) AS `source_rank`
    FROM `role_sources`
    WHERE `context_status` = 'active'
  ) AS `ranked_role_sources`
  WHERE `source_rank` > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX `case_sources_case_sha256_active_uidx` ON `case_sources` (`case_id`,`sha256`) WHERE "case_sources"."context_status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX `role_sources_role_sha256_active_uidx` ON `role_sources` (`role_id`,`sha256`) WHERE "role_sources"."context_status" = 'active';
