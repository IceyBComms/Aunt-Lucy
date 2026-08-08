import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { logger } from "../lib/logger";
import { formatMoney } from "../lib/gst";
import {
  computeFounderStats,
  computeWeeklyTrend,
  type FounderStats,
  type WeeklyTrendRow,
} from "../lib/founderStats";

const router: IRouter = Router();

/** Constant-time secret compare (see the cron endpoints for the same pattern). */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function auDate(date: Date): string {
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Sydney",
  });
}

function statRow(label: string, value: string): string {
  return `<tr><td class="l">${esc(label)}</td><td class="v">${esc(value)}</td></tr>`;
}

function renderTrend(rows: WeeklyTrendRow[]): string {
  const max = Math.max(1, ...rows.map((r) => r.pagesCreated));
  const body = rows
    .map((r) => {
      const w = Math.round((r.pagesCreated / max) * 100);
      return `<tr>
        <td class="l">${esc(auDate(r.weekStart))}</td>
        <td class="v">${r.pagesCreated}</td>
        <td class="v">${r.pagesActivated}</td>
        <td class="v">${r.slotsClaimed}</td>
        <td class="v">${r.giftsSold}</td>
        <td class="bar"><span style="width:${w}%"></span></td>
      </tr>`;
    })
    .join("\n");
  return `<table class="trend">
    <thead><tr>
      <th class="l">Week of</th><th>Pages</th><th>Activated</th><th>Claims</th><th>Gifts</th><th class="bar">Pages created</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function renderDashboard(stats: FounderStats, trend: WeeklyTrendRow[]): string {
  const o = stats.pages.byOrigin;
  const ow = stats.pages.byOriginWeek;

  const weekRows = [
    statRow("Pages created", String(stats.pages.createdWeek)),
    statRow("· gift", String(ow.gift)),
    statRow("· crisis (free)", String(ow.crisisFree)),
    statRow("· organiser", String(ow.organiser)),
    statRow("Pages activated", String(stats.pages.activatedWeek)),
    statRow("Slots claimed", String(stats.slots.claimedWeek)),
    statRow("Distinct helpers", String(stats.slots.distinctHelpersWeek)),
    statRow("Releases (un-claims)", String(stats.slots.releasesWeek)),
    statRow("Gifts sold", String(stats.gifts.soldWeek)),
    statRow("Gift revenue (inc GST)", `$${formatMoney(stats.gifts.revenueCentsWeek)}`),
    stats.gifts.compsWeek > 0 ? statRow("Comps ($0)", String(stats.gifts.compsWeek)) : "",
  ].join("\n");

  const totalRows = [
    statRow("Pages created", String(stats.pages.createdTotal)),
    statRow("· gift", String(o.gift)),
    statRow("· crisis (free)", String(o.crisisFree)),
    statRow("· organiser", String(o.organiser)),
    statRow("· other / legacy", String(o.other)),
    statRow("Pages activated", String(stats.pages.activatedTotal)),
    statRow("Activation rate", pct(stats.pages.activationRate)),
    statRow("Slots claimed", String(stats.slots.claimedTotal)),
    statRow("Distinct helpers", String(stats.slots.distinctHelpersTotal)),
    statRow("Releases (un-claims)", String(stats.slots.releasesTotal)),
    statRow("Gifts sold", String(stats.gifts.soldTotal)),
    statRow("Gift revenue (inc GST)", `$${formatMoney(stats.gifts.revenueCentsTotal)}`),
    stats.gifts.compsTotal > 0 ? statRow("Comps ($0)", String(stats.gifts.compsTotal)) : "",
  ].join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Aunt Lucy — stats</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin:0; padding:24px; background:#FAF7F2; color:#222;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
    h1 { font-size:20px; margin:0 0 2px; }
    .sub { color:#777; font-size:13px; margin:0 0 24px; }
    .grid { display:flex; flex-wrap:wrap; gap:24px; }
    .card { background:#fff; border-radius:10px; padding:20px 24px; box-shadow:0 1px 3px rgba(0,0,0,0.08);
      flex:1 1 300px; min-width:280px; }
    .card h2 { font-size:12px; letter-spacing:0.06em; text-transform:uppercase; color:#888; margin:0 0 12px; }
    table { width:100%; border-collapse:collapse; }
    td.l, th.l { text-align:left; }
    td.v, th { text-align:right; }
    td { padding:5px 0; font-size:14px; border-bottom:1px solid #f0ece4; }
    td.v { font-weight:600; color:#2D6A4F; white-space:nowrap; }
    .trend { margin-top:8px; }
    .trend th { font-size:11px; color:#888; text-transform:uppercase; letter-spacing:0.04em; padding-bottom:8px; }
    .trend td { font-size:13px; }
    .trend .bar { width:34%; }
    .trend .bar span { display:inline-block; height:10px; background:#E76F51; border-radius:3px; min-width:1px; }
    .section { margin-top:32px; }
    .note { color:#999; font-size:12px; margin-top:24px; max-width:640px; line-height:1.5; }
    @media (prefers-color-scheme: dark) {
      body { background:#1a1a1a; color:#e8e8e8; }
      .card { background:#242424; box-shadow:none; }
      td { border-bottom-color:#333; }
      td.v { color:#7fc9a6; }
      .sub, .card h2, .trend th, .note { color:#999; }
    }
  </style>
</head>
<body>
  <h1>Aunt Lucy — stats</h1>
  <p class="sub">Generated ${esc(auDate(stats.generatedAt))} · this week = last 7 days</p>

  <div class="grid">
    <div class="card">
      <h2>This week (last 7 days)</h2>
      <table>${weekRows}</table>
    </div>
    <div class="card">
      <h2>Running totals (all time)</h2>
      <table>${totalRows}</table>
    </div>
  </div>

  <div class="section card">
    <h2>Week by week</h2>
    ${renderTrend(trend)}
  </div>

  <p class="note">
    Distinct helpers and releases are approximate (no helper accounts; only the
    latest release per slot is retained). Activation is inferred from page status
    (no activation timestamp exists). Read-only — see founderStats.ts.
  </p>
</body>
</html>`;
}

/**
 * GET /api/admin/stats/:secret — the read-only founder dashboard.
 *
 * Link-as-key, matching the rest of the app: the URL *is* the password. Served
 * only when ADMIN_STATS_SECRET is set and the path secret matches it (constant
 * time). Fails closed (503) when the env var is unset, and answers a wrong
 * secret with a plain 404 so the endpoint doesn't advertise itself. Always
 * noindex. No links point here from anywhere in the app.
 */
router.get("/admin/stats/:secret", async (req: Request, res: Response) => {
  res.set("X-Robots-Tag", "noindex, nofollow");

  const expected = process.env.ADMIN_STATS_SECRET;
  if (!expected) {
    logger.error("ADMIN_STATS_SECRET not set — admin stats dashboard is disabled");
    res.status(503).type("text/plain").send("Stats dashboard is not configured.");
    return;
  }

  const provided = req.params.secret;
  if (typeof provided !== "string" || !secretMatches(provided, expected)) {
    res.status(404).type("text/plain").send("Not found.");
    return;
  }

  const [stats, trend] = await Promise.all([
    computeFounderStats(),
    computeWeeklyTrend(12),
  ]);

  res.status(200).type("text/html").send(renderDashboard(stats, trend));
});

export default router;
