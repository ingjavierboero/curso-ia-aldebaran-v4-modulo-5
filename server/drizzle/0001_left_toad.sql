CREATE TABLE `job_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_name` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text NOT NULL,
	`outcome` text NOT NULL,
	CONSTRAINT "job_runs_outcome_check" CHECK("job_runs"."outcome" IN ('ok', 'error'))
);
--> statement-breakpoint
CREATE INDEX `job_runs_job_outcome_finished_idx` ON `job_runs` (`job_name`,`outcome`,`finished_at`);