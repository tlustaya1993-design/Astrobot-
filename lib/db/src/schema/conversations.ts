import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  title: text("title").notNull(),
  contactId: integer("contact_id"),
  /** Расширенный разбор по выбранному контакту (прогноз, соляр, прогрессии и т.д.) — дороже по «запросам». */
  contactExtendedMode: boolean("contact_extended_mode").notNull().default(false),
  /** JSON-массив строк: аспекты/сигналы уже разобранные в этом диалоге. */
  usedSignalsJson: text("used_signals_json"),
  /** Тема последнего крючка в конце ответа бота. */
  lastHookTopic: text("last_hook_topic"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
