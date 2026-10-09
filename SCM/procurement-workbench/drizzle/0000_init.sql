CREATE TABLE `bom_items` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source` text,
	`category` text NOT NULL,
	`material` text NOT NULL,
	`vendor_code` text NOT NULL,
	`manufacturer` text NOT NULL,
	`qty_per_tower` real NOT NULL,
	`unit_cost` integer DEFAULT 0 NOT NULL,
	`component_number` text,
	`currency` text,
	`incoterms` text,
	`total_qty` real,
	`amount_total` integer,
	`drawing_no` text,
	`section_info` text,
	`section_code` text,
	`kit` text,
	`old_code` text,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `bom_items_project_idx` ON `bom_items` (`project_id`);--> statement-breakpoint
CREATE TABLE `change_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`collection` text NOT NULL,
	`row_id` text NOT NULL,
	`action` text NOT NULL,
	`changed_by` text NOT NULL,
	`changed_at` text NOT NULL,
	`before_json` text,
	`after_json` text
);
--> statement-breakpoint
CREATE INDEX `change_log_row_idx` ON `change_log` (`collection`,`row_id`);--> statement-breakpoint
CREATE INDEX `change_log_changed_at_idx` ON `change_log` (`changed_at`);--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`material` text NOT NULL,
	`category` text NOT NULL,
	`batch` text NOT NULL,
	`po` text NOT NULL,
	`vendor_code` text NOT NULL,
	`manufacturer` text NOT NULL,
	`manufacturer_location` text,
	`payment_terms` text NOT NULL,
	`lead_time_weeks` real NOT NULL,
	`delivery_way` text NOT NULL,
	`incoterms` text NOT NULL,
	`po_date` text NOT NULL,
	`order_confirmation` text NOT NULL,
	`supplier_schedule` text NOT NULL,
	`actual_eta` text,
	`actual_arrival` text,
	`production_need` text NOT NULL,
	`qty` real NOT NULL,
	`freight_fee_received` integer DEFAULT false NOT NULL,
	`manufacturer_invoice_received` integer DEFAULT false NOT NULL,
	`goods_received` integer DEFAULT false NOT NULL,
	`customs_cleared` integer DEFAULT false NOT NULL,
	`arrived_pueblo` integer DEFAULT false NOT NULL,
	`freight_fee` integer DEFAULT 0 NOT NULL,
	`freight_invoice_number` text,
	`tariff` integer DEFAULT 0 NOT NULL,
	`tariff_invoice_received` integer DEFAULT false NOT NULL,
	`tariff_invoice_number` text,
	`material_cost` integer DEFAULT 0 NOT NULL,
	`forwarder` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `deliveries_project_idx` ON `deliveries` (`project_id`);--> statement-breakpoint
CREATE INDEX `deliveries_po_idx` ON `deliveries` (`po`);--> statement-breakpoint
CREATE TABLE `ecn_records` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`ecn_number` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`manufacturer` text NOT NULL,
	`status` text NOT NULL,
	`impact` text NOT NULL,
	`effective_week` text NOT NULL,
	`cost_impact` integer DEFAULT 0 NOT NULL,
	`notes` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `ecn_records_project_idx` ON `ecn_records` (`project_id`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`r2_key` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`uploaded_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_r2Key_unique` ON `files` (`r2_key`);--> statement-breakpoint
CREATE INDEX `files_owner_idx` ON `files` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE TABLE `internal_ncrs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`ncr_number` text NOT NULL,
	`material_info` text NOT NULL,
	`manufacturer` text NOT NULL,
	`qty` real NOT NULL,
	`cost` integer DEFAULT 0 NOT NULL,
	`eta` text NOT NULL,
	`goods_received` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `internal_ncrs_project_idx` ON `internal_ncrs` (`project_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`phase` text NOT NULL,
	`production_window` text NOT NULL,
	`plant` text NOT NULL,
	`budget` integer DEFAULT 0 NOT NULL,
	`status` text,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `purchase_po_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`project_code` text NOT NULL,
	`project_name` text NOT NULL,
	`po` text NOT NULL,
	`line_no` text NOT NULL,
	`manufacturer` text NOT NULL,
	`vendor_code` text NOT NULL,
	`payment_terms` text NOT NULL,
	`incoterms` text NOT NULL,
	`material` text NOT NULL,
	`material_code` text NOT NULL,
	`category` text NOT NULL,
	`unit` text NOT NULL,
	`po_qty` real NOT NULL,
	`unit_price` integer DEFAULT 0 NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`currency` text NOT NULL,
	`delivery_date` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `purchase_po_lines_project_po_idx` ON `purchase_po_lines` (`project_id`,`po`);--> statement-breakpoint
CREATE TABLE `supplier_material_allocations` (
	`plan_id` text NOT NULL,
	`po_line_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`qty` real NOT NULL,
	PRIMARY KEY(`plan_id`, `po_line_id`, `batch_id`)
);
--> statement-breakpoint
CREATE TABLE `supplier_ncrs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`ncr_number` text NOT NULL,
	`project_name` text NOT NULL,
	`material_code` text NOT NULL,
	`category` text NOT NULL,
	`qty` real NOT NULL,
	`replacement_received` integer DEFAULT false NOT NULL,
	`project_impact` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `supplier_ncrs_project_idx` ON `supplier_ncrs` (`project_id`);--> statement-breakpoint
CREATE TABLE `supplier_plan_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`delivery_id` text NOT NULL,
	`batch` text NOT NULL,
	`qty` real NOT NULL,
	`percentage` real NOT NULL,
	`pu_week` text NOT NULL,
	`need_week` text NOT NULL,
	`supplier_request_week` text NOT NULL,
	`status` text NOT NULL,
	`note` text NOT NULL,
	`commercial_invoice_files` text DEFAULT '[]' NOT NULL,
	`packing_list_files` text DEFAULT '[]' NOT NULL,
	`bl_number` text NOT NULL,
	`forwarder_eta` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `supplier_plan_batches_plan_idx` ON `supplier_plan_batches` (`plan_id`);--> statement-breakpoint
CREATE TABLE `supplier_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`po` text NOT NULL,
	`manufacturer` text NOT NULL,
	`category` text NOT NULL,
	`material` text NOT NULL,
	`incoterms` text NOT NULL,
	`to` text NOT NULL,
	`cc` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`attachments` text DEFAULT '[]' NOT NULL,
	`forwarder_email` text NOT NULL,
	`request_sent` integer DEFAULT false NOT NULL,
	`pickup_reminder_sent` integer DEFAULT false NOT NULL,
	`forwarder_notice_sent` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `supplier_plans_project_po_idx` ON `supplier_plans` (`project_id`,`po`);--> statement-breakpoint
CREATE TABLE `todo_items` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`owner` text NOT NULL,
	`mode` text NOT NULL,
	`priority` text NOT NULL,
	`due_week` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `todo_items_project_idx` ON `todo_items` (`project_id`);