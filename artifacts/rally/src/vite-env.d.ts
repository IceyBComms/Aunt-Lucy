/// <reference types="vite/client" />

// Client-exposed build-time variables. Anything read via `import.meta.env` in
// the frontend must be declared here so it type-checks. Only `VITE_`-prefixed
// vars are exposed to the browser by Vite.
interface ImportMetaEnv {
  /**
   * Base URL of the self-hosted Umami tracking script, e.g.
   * `https://umami.up.railway.app/script.js`. Leave unset to disable analytics
   * entirely — no script is injected, no requests are made.
   */
  readonly VITE_UMAMI_URL?: string;
  /** Umami website id (a UUID) for this site. Unset = analytics disabled. */
  readonly VITE_UMAMI_WEBSITE_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
