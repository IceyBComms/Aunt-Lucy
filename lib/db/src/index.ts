import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon scales the compute to zero after a few minutes idle, so the first
  // connection after a quiet spell (e.g. the first cron run after a deploy) is
  // a cold start. Give a single connect a generous ceiling so a normal wake-up
  // completes in one attempt, but DON'T wait forever — the pg default of 0
  // means a genuinely stuck connect hangs until the caller (cron-job.org) times
  // out, which is exactly the failure we're fixing.
  connectionTimeoutMillis: 10_000,
  // Close idle clients a little sooner than Neon would recycle them, and keep
  // the TCP socket alive to cut down on silently-dropped connections.
  idleTimeoutMillis: 30_000,
  keepAlive: true,
  max: 10,
});

// node-postgres emits an 'error' event on the pool when an *idle* backend
// connection dies out from under it (Neon recycling the compute, a network
// blip). Node's rule for EventEmitters is that an 'error' with no listener is
// re-thrown as an uncaught exception — which can crash the whole process. We
// log and carry on instead: the pool discards the dead client and opens a fresh
// one on the next query, so a routine idle disconnect never takes the app down.
pool.on("error", (err) => {
  // lib/db has no app logger (it sits below the API server); stderr is captured
  // by the platform's log stream.
  console.error(
    "[db] idle client error (handled — pool will recover):",
    err instanceof Error ? err.message : err,
  );
});

export const db = drizzle(pool, { schema });

/**
 * Wakes the database and confirms the pool holds a live connection before the
 * caller does real work.
 *
 * Neon's scale-to-zero means the first query after an idle spell can fail or
 * crawl while the compute resumes. Rather than let that surface as a failed
 * request, we run a trivial `select 1` and retry it with exponential backoff:
 * by the second or third attempt the compute is awake and the real queries then
 * run against a warm connection. `select 1` has no logic that can fail, so any
 * error from it is a connection problem and safe to retry.
 *
 * Throws only if the database is still unreachable after every attempt — a
 * genuine outage, which the caller should surface rather than hide.
 *
 * Defaults: 4 attempts, backoff 1s → 2s → 4s (worst case ~7s of waiting plus
 * connect time). Tune via the options if a specific caller needs to fail faster
 * or wait longer.
 */
export async function ensureDbAwake(
  opts: { attempts?: number; baseDelayMs?: number } = {},
): Promise<void> {
  const attempts = opts.attempts ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 1_000;

  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await pool.query("select 1");
      return;
    } catch (err) {
      lastErr = err;
      const isLast = attempt === attempts - 1;
      if (isLast) break;
      const delay = baseDelayMs * 2 ** attempt; // 1000, 2000, 4000, …
      console.error(
        `[db] wake-up attempt ${attempt + 1}/${attempts} failed (` +
          `${err instanceof Error ? err.message : err}); retrying in ${delay}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}

export * from "./schema";
