import { pgTable, serial, text, boolean, timestamp, doublePrecision, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  // Auth fields — nullable so anonymous sessions keep working
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  name: text("name"),
  birthDate: text("birth_date"),
  birthTime: text("birth_time"),
  birthTimeUnknown: boolean("birth_time_unknown").notNull().default(false),
  birthPlace: text("birth_place"),
  birthLat: doublePrecision("birth_lat"),
  birthLng: doublePrecision("birth_lng"),
  gender: text("gender"),
  language: text("language").default("ru"),
  onboardingDone: boolean("onboarding_done").notNull().default(false),
  tonePreferredDepth: text("tone_preferred_depth"),
  tonePreferredStyle: text("tone_preferred_style"),
  toneEmotionalSensitivity: text("tone_emotional_sensitivity"),
  toneFamiliarityLevel: text("tone_familiarity_level"),
  requestsBalance: integer("requests_balance").notNull().default(0),
  requestsUsed: integer("requests_used").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const upsertUserSchema = insertUserSchema.partial().required({
  sessionId: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpsertUser = z.infer<typeof upsertUserSchema>;
export type User = typeof usersTable.$inferSelect;
