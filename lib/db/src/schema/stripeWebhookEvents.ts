import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Idempotency ledger for the Stripe webhook. Stripe retries delivery until it
// receives a 2xx and the same event can also be replayed by hand from the
// dashboard, so every event id is recorded here *before* any work happens. The
// primary key is Stripe's own event id: a duplicate delivery loses the insert
// race, and the handler treats that unique violation as "already processed".
export const stripeWebhookEventsTable = pgTable("stripe_webhook_events", {
  // Stripe's event id (evt_…) — deliberately the PK, not a surrogate id.
  eventId: text("event_id").primaryKey(),
  type: text("type").notNull(),
  // The gift this event resolved to, when it resolved to one. Null for events
  // we acknowledge but don't act on, so the ledger stays a complete record of
  // what we've seen rather than only what we processed.
  giftId: text("gift_id"),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
});

export const insertStripeWebhookEventSchema = createInsertSchema(
  stripeWebhookEventsTable,
).omit({
  receivedAt: true,
});
export type InsertStripeWebhookEvent = z.infer<
  typeof insertStripeWebhookEventSchema
>;
export type StripeWebhookEvent = typeof stripeWebhookEventsTable.$inferSelect;
