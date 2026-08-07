/**
 * A tiny in-memory fixed-window rate limiter — no dependency, no store.
 *
 * Deliberately light-touch (per the Item 14 brief): enough to blunt a script
 * hammering the free crisis-page endpoint, not a fortress. It lives in process
 * memory, so it resets on deploy and does not coordinate across instances — fine
 * for a single Railway service and a low-volume, abuse-guardrail use.
 *
 * Never used to gate anything a real person's wellbeing depends on: the crisis
 * route treats a limiter trip as "slow down", never as a hard denial of help.
 */

interface Window {
  count: number;
  /** Epoch ms when this window opened; it expires `windowMs` later. */
  startedAt: number;
}

const buckets = new Map<string, Window>();

/**
 * Records a hit for `key` and reports whether it is now over `limit` within the
 * trailing `windowMs`. Returns `{ limited, retryAfterMs }`.
 *
 * Keys are caller-namespaced (e.g. "crisis:email:foo@bar.com"), so two callers
 * never collide. Expired windows are lazily reset on next touch; a periodic
 * sweep keeps the map from growing unbounded under many distinct keys.
 */
export function hitRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): { limited: boolean; retryAfterMs: number } {
  const existing = buckets.get(key);

  if (!existing || now - existing.startedAt >= windowMs) {
    buckets.set(key, { count: 1, startedAt: now });
    return { limited: false, retryAfterMs: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      limited: true,
      retryAfterMs: existing.startedAt + windowMs - now,
    };
  }
  return { limited: false, retryAfterMs: 0 };
}

/**
 * Drops windows that have fully expired. Called on a timer from the limiter
 * itself so no caller has to remember to. Cheap: one pass over the map.
 */
function sweep(now: number = Date.now()): void {
  for (const [key, win] of buckets) {
    // A window can't matter once more than the longest plausible window has
    // passed; 1 hour is comfortably beyond anything this file uses.
    if (now - win.startedAt >= 60 * 60 * 1000) {
      buckets.delete(key);
    }
  }
}

// Unref so this timer never keeps the process alive on its own (e.g. in tests).
const sweepTimer = setInterval(() => sweep(), 10 * 60 * 1000);
if (typeof sweepTimer.unref === "function") sweepTimer.unref();

/** Test-only: wipe all windows so cases don't leak state into each other. */
export function __resetRateLimitsForTest(): void {
  buckets.clear();
}
