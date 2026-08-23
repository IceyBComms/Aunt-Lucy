import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

/**
 * Baked in by build.mjs via esbuild `define`. Declared, not imported: outside a
 * bundled build (vitest, tsx) the identifier simply does not exist, and `typeof`
 * on an undeclared name is safe rather than a ReferenceError — so the runtime
 * env var below takes over.
 */
declare const __BUILD_COMMIT__: string | undefined;

/**
 * What this process was built from. Null, never a placeholder: "unknown" reads
 * like an answer and would let a stale deploy pass a check it should fail.
 */
const BUILD_COMMIT: string | null =
  (typeof __BUILD_COMMIT__ === "string" && __BUILD_COMMIT__ !== "" ? __BUILD_COMMIT__ : null) ??
  (process.env.RAILWAY_GIT_COMMIT_SHA?.trim() || null);

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok", commit: BUILD_COMMIT });
  res.json(data);
});

export default router;
