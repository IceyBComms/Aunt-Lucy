// Cross-platform preinstall guard (runs on every install, before deps exist —
// use only Node built-ins here). Replaces the previous `sh -c '...'` command,
// which failed on Windows where `sh` is not available.
//
//  1. Remove stray npm/yarn lockfiles so only pnpm-lock.yaml is authoritative.
//  2. Enforce that pnpm (not npm/yarn) is being used.
import { existsSync, rmSync } from "node:fs";

for (const lockfile of ["package-lock.json", "yarn.lock"]) {
  if (existsSync(lockfile)) {
    rmSync(lockfile, { force: true });
  }
}

const userAgent = process.env.npm_config_user_agent ?? "";
if (!userAgent.startsWith("pnpm")) {
  console.error("\nThis repository uses pnpm. Please run `pnpm install` instead.\n");
  process.exit(1);
}
