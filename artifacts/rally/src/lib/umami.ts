import { useEffect } from "react";

// Umami is our self-hosted, cookie-free analytics (see the PR runbook). Both
// values come from build-time env; when either is missing the script is simply
// never injected — no tag, no requests, no analytics. That keeps preview builds
// and anyone who hasn't set the vars completely clean.
const UMAMI_URL = import.meta.env.VITE_UMAMI_URL;
const UMAMI_WEBSITE_ID = import.meta.env.VITE_UMAMI_WEBSITE_ID;

/**
 * Injects the Umami tracking script once, on mount of the always-present root
 * component. Umami hooks the History API itself, so this single tag reports
 * pageviews for every client-side route (including /hardest-times) with no
 * per-route wiring.
 */
export function useUmami(): void {
  useEffect(() => {
    if (!UMAMI_URL || !UMAMI_WEBSITE_ID) return;
    // Guard against a double-inject (e.g. React 18 StrictMode dev remount).
    if (document.querySelector("script[data-aunt-lucy-umami]")) return;

    const script = document.createElement("script");
    script.defer = true;
    script.src = UMAMI_URL;
    script.setAttribute("data-website-id", UMAMI_WEBSITE_ID);
    script.setAttribute("data-aunt-lucy-umami", "");
    document.head.appendChild(script);
  }, []);
}
