import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const memoriesTable = pgTable("user_memories", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Memory = typeof memoriesTable.$inferSelect;
export type InsertMemory = typeof memoriesTable.$inferInsert;
