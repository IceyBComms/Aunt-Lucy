import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Shared enums that more than one table needs.
 *
 * `gift_occasion` began life on the gifts table but is now also carried onto a
 * support page at activation (so the invite copy and the bereavement handling
 * have the occasion without having to walk back to the gift, and so
 * organiser-created pages can set one too). It lives here rather than in either
 * table file to avoid a circular import between gifts.ts and supportPages.ts.
 */
export const giftOccasionEnum = pgEnum("gift_occasion", [
  "new_baby",
  "illness_recovery",
  // Bug #058. Added by migration 0012 with AFTER 'illness_recovery', so this
  // declared order matches the physical order of the Postgres type and
  // drizzle-kit sees no drift.
  "surgery",
  "bereavement",
  "ongoing_support",
  "other",
]);
