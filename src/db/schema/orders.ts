import { bigint, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serviceHref: text("service_href").notNull(),
    note: text("note"),
    status: text("status").notNull().default("uploading"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("orders_user_created_idx").on(table.userId, table.createdAt)],
);

export const orderFiles = pgTable(
  "order_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    originalName: text("original_name").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    contentType: text("content_type"),
    storageKey: text("storage_key").notNull(),
    uploadId: text("upload_id"),
    mode: text("mode").notNull(),
    partSize: integer("part_size").notNull(),
    partCount: integer("part_count").notNull(),
    partsCompleted: integer("parts_completed").notNull().default(0),
    status: text("status").notNull().default("uploading"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("order_files_order_idx").on(table.orderId)],
);

export const uploadParts = pgTable(
  "upload_parts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => orderFiles.id, { onDelete: "cascade" }),
    partNumber: integer("part_number").notNull(),
    etag: text("etag").notNull(),
  },
  (table) => [uniqueIndex("upload_parts_file_part_unique").on(table.fileId, table.partNumber)],
);
