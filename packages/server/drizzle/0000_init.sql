CREATE TABLE `commands` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`event_id` text,
	`seq` integer,
	`type` text NOT NULL,
	`command` text NOT NULL,
	`user_id` text NOT NULL,
	`device_id` text NOT NULL,
	`base_version` integer,
	`issued_at` text NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commands_event_seq_idx` ON `commands` (`event_id`,`seq`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`visibility` text NOT NULL,
	`progress` text NOT NULL,
	`version` integer NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_owner_idx` ON `events` (`owner_id`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`last_name` text NOT NULL,
	`first_name` text NOT NULL,
	`gender` text NOT NULL,
	`club` text,
	`rating` integer,
	`birth_year` integer,
	`contact` text,
	`external_id` text,
	`merged_into_id` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer NOT NULL,
	`deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `players_revision_idx` ON `players` (`revision`);--> statement-breakpoint
CREATE TABLE `rejected_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`event_id` text,
	`type` text NOT NULL,
	`command` text NOT NULL,
	`reason` text NOT NULL,
	`user_id` text NOT NULL,
	`device_id` text NOT NULL,
	`issued_at` text NOT NULL,
	`received_at` integer NOT NULL,
	`resolved_at` integer,
	`resolution` text
);
--> statement-breakpoint
CREATE INDEX `rejected_user_idx` ON `rejected_commands` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_id` text NOT NULL,
	`device_label` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`login` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_login_unique` ON `users` (`login`);