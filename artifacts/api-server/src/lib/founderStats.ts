import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Founder analytics — read-only.
 *
 * Every query in this module is a plain SELECT. Nothing here writes, updates or
 * deletes; it is safe to run against production and is the single source of the
 * numbers shown in both the weekly founder digest email (Part B) and the admin
 * stats dashboard (Part C), so the two can never drift apart.
 *
 * A few honest approximations, forced by the current schema (no schema change
 * was made for this feature):
 *
 * - **Activation** — there is no `activated_at` column. A page counts as
 *   activated once its `status` is `active` or `closed` (a page only reaches
 *   `closed` after it has been live). Today nothing sets `closed`, so this is
 *   exact; the `closed` clause future-proofs it.
 * - **Gift-origin pages** — gift-redeemed pages carry `origin = NULL` (only the
 *   crisis and organiser paths stamp `origin`). A page is therefore treated as
 *   a gift page when a `gifts` row points at it (or, defensively, when
 *   `origin = 'gift'`). Anything left over is bucketed as `other` (legacy).
 * - **Distinct helpers** — there is no helper account or helpers table. A helper
 *   is identified by the free-text name/contact snapshot captured on the slot at
 *   claim time, so the distinct count is inherently fuzzy (one person using two
 *   phone numbers counts twice).
 * - **Releases** — only the most recent release per slot is retained
 *   (`claim_cancelled_at`), so a slot released more than once counts once.
 * - **Gifts sold / revenue** — counts only rows with a real Stripe
 *   `payment_reference` and `amount_cents > 0` (and not refunded). Test/seed
 *   rows have no payment_reference, so they never inflate the numbers, and $0
 *   VIP/comp checkouts are reported separately as `comps` — never mixed into
 *   sales or revenue.
 *
 * "This week" is a rolling 7-day window ending now — deliberately calendar- and
 * timezone-agnostic, so the digest reports the same thing no matter the exact
 * minute the Monday cron fires.
 */

/** How many days the rolling "this week" window covers. */
export const WEEK_WINDOW_DAYS = 7;

/**
 * What counts as a real gift *sale*: a completed Stripe payment
 * (payment_reference present) for actual money (amount_cents > 0), excluding
 * refunds. Test/seed rows have no payment_reference; $0 VIP/comp checkouts have
 * a reference but zero amount — neither is a sale. Kept as raw SQL fragments so
 * the headline and trend queries share one definition and can't drift. These
 * are constants (no user input), so sql.raw is safe here.
 */
const SALE_PREDICATE =
  "payment_reference IS NOT NULL AND amount_cents > 0 AND status <> 'refunded'";
/** A $0 VIP/comp checkout: a real Stripe checkout for zero money, reported on its own. */
const COMP_PREDICATE =
  "payment_reference IS NOT NULL AND amount_cents = 0 AND status <> 'refunded'";

export interface OriginCounts {
  crisisFree: number;
  organiser: number;
  gift: number;
  other: number;
}

export interface FounderStats {
  /** When these numbers were computed. */
  generatedAt: Date;
  /** Start of the rolling window ("this week" = created/claimed on or after this). */
  weekStart: Date;
  pages: {
    createdTotal: number;
    createdWeek: number;
    byOrigin: OriginCounts;
    byOriginWeek: OriginCounts;
    activatedTotal: number;
    activatedWeek: number;
    /** activatedTotal / createdTotal as a 0–1 fraction (0 when no pages). */
    activationRate: number;
  };
  slots: {
    claimedTotal: number;
    claimedWeek: number;
    distinctHelpersTotal: number;
    distinctHelpersWeek: number;
    releasesTotal: number;
    releasesWeek: number;
  };
  gifts: {
    soldTotal: number;
    soldWeek: number;
    revenueCentsTotal: number;
    revenueCentsWeek: number;
    /** $0 VIP/comp checkouts — real Stripe, zero money. Never counted as sales. */
    compsTotal: number;
    compsWeek: number;
  };
}

export interface WeeklyTrendRow {
  /** Monday 00:00 UTC that starts the bucket (date_trunc('week', ...)). */
  weekStart: Date;
  pagesCreated: number;
  pagesActivated: number;
  slotsClaimed: number;
  giftsSold: number;
}

/** pg returns bigint/numeric as strings and NULL for empty aggregates. */
function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** drizzle-orm/node-postgres returns a pg QueryResult; normalise to rows. */
function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

/**
 * Computes the headline stats — this week plus running totals. One SELECT per
 * source table (support_pages, slots, gifts); all read-only.
 */
export async function computeFounderStats(now: Date = new Date()): Promise<FounderStats> {
  const weekStart = new Date(now.getTime() - WEEK_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // ── Pages: creation, origin breakdown, activation ──────────────────────────
  const pagesResult = await db.execute(sql`
    WITH derived AS (
      SELECT
        sp.created_at,
        sp.status,
        CASE
          WHEN sp.origin = 'crisis_free' THEN 'crisis_free'
          WHEN sp.origin = 'organiser'   THEN 'organiser'
          WHEN sp.origin = 'gift'        THEN 'gift'
          WHEN EXISTS (SELECT 1 FROM gifts g WHERE g.page_id = sp.id) THEN 'gift'
          ELSE 'other'
        END AS origin
      FROM support_pages sp
    )
    SELECT
      count(*)::int AS created_total,
      count(*) FILTER (WHERE created_at >= ${weekStart})::int AS created_week,
      count(*) FILTER (WHERE origin = 'crisis_free')::int AS crisis_free_total,
      count(*) FILTER (WHERE origin = 'organiser')::int   AS organiser_total,
      count(*) FILTER (WHERE origin = 'gift')::int         AS gift_total,
      count(*) FILTER (WHERE origin = 'other')::int        AS other_total,
      count(*) FILTER (WHERE origin = 'crisis_free' AND created_at >= ${weekStart})::int AS crisis_free_week,
      count(*) FILTER (WHERE origin = 'organiser'   AND created_at >= ${weekStart})::int AS organiser_week,
      count(*) FILTER (WHERE origin = 'gift'        AND created_at >= ${weekStart})::int AS gift_week,
      count(*) FILTER (WHERE origin = 'other'       AND created_at >= ${weekStart})::int AS other_week,
      count(*) FILTER (WHERE status IN ('active','closed'))::int AS activated_total,
      count(*) FILTER (WHERE status IN ('active','closed') AND created_at >= ${weekStart})::int AS activated_week
    FROM derived
  `);
  const p = rowsOf(pagesResult)[0] ?? {};

  // ── Slots: claims, distinct helpers, releases ──────────────────────────────
  const slotsResult = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE is_claimed)::int AS claimed_total,
      count(*) FILTER (WHERE is_claimed AND claimed_at >= ${weekStart})::int AS claimed_week,
      count(DISTINCT lower(coalesce(nullif(btrim(claimed_by_contact), ''), nullif(btrim(claimed_by_name), ''))))
        FILTER (WHERE is_claimed)::int AS helpers_total,
      count(DISTINCT lower(coalesce(nullif(btrim(claimed_by_contact), ''), nullif(btrim(claimed_by_name), ''))))
        FILTER (WHERE is_claimed AND claimed_at >= ${weekStart})::int AS helpers_week,
      count(*) FILTER (WHERE claim_cancelled_at IS NOT NULL)::int AS releases_total,
      count(*) FILTER (WHERE claim_cancelled_at >= ${weekStart})::int AS releases_week
    FROM slots
  `);
  const s = rowsOf(slotsResult)[0] ?? {};

  // ── Gifts: real sales + revenue (inc GST, in cents), comps kept separate ───
  const giftsResult = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE ${sql.raw(SALE_PREDICATE)})::int AS sold_total,
      count(*) FILTER (WHERE (${sql.raw(SALE_PREDICATE)}) AND created_at >= ${weekStart})::int AS sold_week,
      coalesce(sum(amount_cents) FILTER (WHERE ${sql.raw(SALE_PREDICATE)}), 0)::bigint AS revenue_total,
      coalesce(sum(amount_cents) FILTER (WHERE (${sql.raw(SALE_PREDICATE)}) AND created_at >= ${weekStart}), 0)::bigint AS revenue_week,
      count(*) FILTER (WHERE ${sql.raw(COMP_PREDICATE)})::int AS comps_total,
      count(*) FILTER (WHERE (${sql.raw(COMP_PREDICATE)}) AND created_at >= ${weekStart})::int AS comps_week
    FROM gifts
  `);
  const g = rowsOf(giftsResult)[0] ?? {};

  const createdTotal = toNum(p.created_total);
  const activatedTotal = toNum(p.activated_total);

  return {
    generatedAt: now,
    weekStart,
    pages: {
      createdTotal,
      createdWeek: toNum(p.created_week),
      byOrigin: {
        crisisFree: toNum(p.crisis_free_total),
        organiser: toNum(p.organiser_total),
        gift: toNum(p.gift_total),
        other: toNum(p.other_total),
      },
      byOriginWeek: {
        crisisFree: toNum(p.crisis_free_week),
        organiser: toNum(p.organiser_week),
        gift: toNum(p.gift_week),
        other: toNum(p.other_week),
      },
      activatedTotal,
      activatedWeek: toNum(p.activated_week),
      activationRate: createdTotal > 0 ? activatedTotal / createdTotal : 0,
    },
    slots: {
      claimedTotal: toNum(s.claimed_total),
      claimedWeek: toNum(s.claimed_week),
      distinctHelpersTotal: toNum(s.helpers_total),
      distinctHelpersWeek: toNum(s.helpers_week),
      releasesTotal: toNum(s.releases_total),
      releasesWeek: toNum(s.releases_week),
    },
    gifts: {
      soldTotal: toNum(g.sold_total),
      soldWeek: toNum(g.sold_week),
      revenueCentsTotal: toNum(g.revenue_total),
      revenueCentsWeek: toNum(g.revenue_week),
      compsTotal: toNum(g.comps_total),
      compsWeek: toNum(g.comps_week),
    },
  };
}

/**
 * Week-by-week trend for the dashboard, oldest first, zero-filled so every week
 * in the window has a row even with no activity. Buckets by Postgres
 * `date_trunc('week', ...)` (Monday 00:00 UTC). Read-only.
 */
export async function computeWeeklyTrend(weeks = 12): Promise<WeeklyTrendRow[]> {
  // Clamp to a sane range — this value is only ever set in code, but keep the
  // generated series bounded regardless.
  const span = Math.max(1, Math.min(52, Math.floor(weeks)));

  const result = await db.execute(sql`
    WITH series AS (
      SELECT generate_series(
        date_trunc('week', now()) - ((${span}::int - 1) * interval '1 week'),
        date_trunc('week', now()),
        interval '1 week'
      ) AS wk
    )
    SELECT
      s.wk AS week_start,
      (SELECT count(*) FROM support_pages sp
         WHERE date_trunc('week', sp.created_at) = s.wk)::int AS pages_created,
      (SELECT count(*) FROM support_pages sp
         WHERE date_trunc('week', sp.created_at) = s.wk
           AND sp.status IN ('active','closed'))::int AS pages_activated,
      (SELECT count(*) FROM slots sl
         WHERE sl.is_claimed AND sl.claimed_at IS NOT NULL
           AND date_trunc('week', sl.claimed_at) = s.wk)::int AS slots_claimed,
      (SELECT count(*) FROM gifts gg
         WHERE ${sql.raw(SALE_PREDICATE)}
           AND date_trunc('week', gg.created_at) = s.wk)::int AS gifts_sold
    FROM series s
    ORDER BY s.wk
  `);

  return rowsOf(result).map((r) => ({
    weekStart: new Date(r.week_start as string),
    pagesCreated: toNum(r.pages_created),
    pagesActivated: toNum(r.pages_activated),
    slotsClaimed: toNum(r.slots_claimed),
    giftsSold: toNum(r.gifts_sold),
  }));
}
