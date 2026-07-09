import { logger } from "./logger";

// This module runs at import time and MUST be imported before any module that
// reads DATABASE_URL (e.g. @workspace/db, which throws on startup if it's
// missing). Importing it first means the diagnostic is logged even when the app
// is about to crash on a missing env var.
//
// It never logs secret values — only presence, length, and env var *names* — so
// it's safe to leave enabled in production.
const dbUrl = process.env.DATABASE_URL;

const dbRelatedEnvKeys = Object.keys(process.env)
  .filter((key) => /database|postgres|pg_|neon/i.test(key))
  .sort();

logger.info(
  {
    databaseUrlPresent: Boolean(dbUrl),
    databaseUrlLength: dbUrl?.length ?? 0,
    nodeEnv: process.env.NODE_ENV ?? null,
    port: process.env.PORT ?? null,
    // Names only — helps spot a mis-named/duplicated variable (e.g. a trailing
    // space or DATABASE_URI) without ever exposing a value.
    dbRelatedEnvKeys,
  },
  "Startup env diagnostic",
);
