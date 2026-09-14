/**
 * rally's first test runner (14 Sep 2026).
 *
 * Separate from vite.config.ts on purpose: that file throws without PORT and
 * BASE_PATH, which a test run has no business needing. Until now every check on
 * this package lived in api-server and READ rally's source as text — enough for
 * "does this file render a footer", not for "does loading this screen publish
 * a page" or "does this card save while someone is still typing". Those are
 * behaviours, and a behaviour needs a render.
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.tsx"],
  },
});
