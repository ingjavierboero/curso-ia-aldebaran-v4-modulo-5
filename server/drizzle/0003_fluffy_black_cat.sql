CREATE TABLE `client_products` (
	`client_id` text NOT NULL,
	`product_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`client_id`, `product_id`),
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `client_products_product_id_idx` ON `client_products` (`product_id`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`business_name` text NOT NULL,
	`cuit` text NOT NULL,
	`address` text NOT NULL,
	`billing_email` text NOT NULL,
	`iva_condition` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "clients_iva_condition_check" CHECK("clients"."iva_condition" IN (1, 4, 5, 6, 7, 8, 9, 10, 13, 15, 16)),
	CONSTRAINT "clients_status_check" CHECK("clients"."status" IN ('activo', 'inactivo'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clients_cuit_unique` ON `clients` (`cuit`);--> statement-breakpoint
CREATE UNIQUE INDEX `clients_billing_email_unique` ON `clients` (`billing_email`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_normalized` text NOT NULL,
	`price_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "products_price_cents_check" CHECK("products"."price_cents" > 0),
	CONSTRAINT "products_currency_check" CHECK("products"."currency" IN ('ARS', 'USD')),
	CONSTRAINT "products_status_check" CHECK("products"."status" IN ('activo', 'inactivo'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_name_normalized_unique` ON `products` (`name_normalized`);