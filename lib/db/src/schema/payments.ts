import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  provider: text("provider").notNull().default("yookassa"),
  providerPaymentId: text("provider_payment_id").notNull().unique(),
  appPaymentId: text("app_payment_id").notNull().unique(),
  packageCode: text("package_code").notNull(),
  creditsGranted: integer("credits_granted").notNull(),
  amountRub: text("amount_rub").notNull(),
  currency: text("currency").notNull().default("RUB"),
  status: text("status").notNull().default("pending"),
  description: text("description"),
  metadataJson: text("metadata_json"),
  creditsAppliedAt: timestamp("credits_applied_at", { withTimezone: true }),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),
  providerRefundId: text("provider_refund_id"),
  webhookVerified: boolean("webhook_verified").notNull().default(false),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Payment = typeof paymentsTable.$inferSelect;
