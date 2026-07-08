import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/** Append-only journal of request balance operations. Rows are never updated or deleted. */
export const requestLedgerTable = pgTable("request_ledger", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  userId: integer("user_id"),
  /** charge | credit | refund | bonus */
  type: text("type").notNull(),
  amount: integer("amount").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  refType: text("ref_type"),
  refId: text("ref_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RequestLedgerEntry = typeof requestLedgerTable.$inferSelect;
export type InsertRequestLedgerEntry = typeof requestLedgerTable.$inferInsert;
