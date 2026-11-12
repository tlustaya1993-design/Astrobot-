import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const supportTickets = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  publicId: uuid("public_id").defaultRandom().notNull(),
  sessionId: text("session_id").notNull(),
  conversationId: integer("conversation_id"),
  status: text("status").notNull().default("open"),
  description: text("description").notNull(),
  expectedBehavior: text("expected_behavior"),
  screenshotUrl: text("screenshot_url"),
  n8nTicketId: integer("n8n_ticket_id"),
  n8nPublicId: text("n8n_public_id"),
  bridgeOpen: boolean("bridge_open").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const supportMessages = pgTable("support_messages", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id")
    .notNull()
    .references(() => supportTickets.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  source: text("source").notNull().default("app"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({
  id: true,
  publicId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSupportMessageSchema = createInsertSchema(supportMessages).omit({
  id: true,
  createdAt: true,
});

export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type SupportMessage = typeof supportMessages.$inferSelect;
export type InsertSupportMessage = z.infer<typeof insertSupportMessageSchema>;
