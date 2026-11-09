CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`last_activity_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'activo' NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "users_role_check" CHECK("users"."role" IN ('admin', 'editor', 'consulta')),
	CONSTRAINT "users_status_check" CHECK("users"."status" IN ('activo', 'inactivo'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);