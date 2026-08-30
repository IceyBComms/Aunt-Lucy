import { Link } from "wouter";
import { TeacupMark } from "@/components/TeacupMark";

/**
 * The site footer — ONE component, two modes. Bug #041.
 *
 * The homepage already had a footer; the public support page (`/s/:slug`) had
 * nothing but "Powered by Aunt Lucy". So this EXTENDS the existing one rather
 * than adding a second: same markup, same links, with `compact` dropping the
 * brand-story paragraph.
 *
 * ── WHY COMPACT DROPS THE PARAGRAPH ─────────────────────────────────────────
 * "Aunt Lucy is named for every warm, capable, quietly brilliant woman…" is
 * lovely on a homepage, where the reader came to find out what this is. On a
 * support page the reader is looking at a friend's bereavement, and three
 * lines of brand story is the product talking about itself at exactly the
 * wrong moment. So: homepage tells the story, support page does not.
 *
 * ── INFORMATIONAL, NOT PROMOTIONAL ──────────────────────────────────────────
 * NOTHING IN HERE MAY SELL. No price, no "buy", no call to action, in either
 * mode. A helper reading about someone's surgery should be able to find out
 * who we are AFTERWARDS — not be sold to while they read. If a future change
 * wants a CTA in the footer, it belongs on the homepage's mode only, and it
 * needs Kate, not a judgement call here.
 */
type SiteFooterProps = {
  /**
   * Compact = the support-page mode: wordmark, the two policy links and the
   * contact address, with no brand-story paragraph. Defaults to the full
   * homepage footer.
   */
  compact?: boolean;
};

// Forwards to Kate's inbox. Kept as a constant so the visible text and the
// mailto: target can never drift apart — see the comment on the link below.
const SUPPORT_EMAIL = "hello@auntlucy.com.au";

const linkClass =
  "underline underline-offset-2 hover:text-foreground transition-colors";

export function SiteFooter({ compact = false }: SiteFooterProps) {
  return (
    <footer className="mt-auto border-t border-border/50 py-8 px-6">
      {!compact && (
        <p className="max-w-2xl mx-auto text-center text-sm text-muted-foreground leading-relaxed mb-8">
          Aunt Lucy is named for every warm, capable, quietly brilliant woman
          who's ever shown up with a casserole, taken the kids for an afternoon,
          and made everything feel manageable again. This is to honour her — and
          provide support to everyone who needs her.
        </p>
      )}

      {/* Two ends that BELONG at opposite ends: who we are, and where to go.
          The copyright used to sit in this row alongside the policy links,
          which made it read as a third link and left the wordmark stranded
          against a lopsided block. It now has its own line below. */}
      <div className="max-w-4xl mx-auto flex flex-col items-center gap-4 text-sm text-muted-foreground sm:flex-row sm:justify-between">
        {/* "Find out more" — DELIBERATELY the homepage, not /how-it-works.
            That page is not live, and a dead link in the footer of a page
            someone in crisis is reading is worse than no link at all. When
            /how-it-works ships this href retargets to it: a helper wants
            "what is this", not the sales homepage. Logged as bug #088. */}
        <Link
          href="/"
          className="flex items-center gap-2 hover:text-foreground transition-colors"
        >
          <TeacupMark className="w-4 h-4 flex-none" />
          <span className="font-serif font-semibold text-foreground">
            Aunt Lucy
          </span>
          <span>· auntlucy.com.au</span>
        </Link>

        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <Link href="/privacy" className={linkClass}>
            Privacy policy
          </Link>
          <Link href="/terms" className={linkClass}>
            Terms &amp; refunds
          </Link>
          {/* The VISIBLE TEXT is the actual address, not "Contact us".
              mailto: fails silently for anyone without a default mail client,
              and a contact method that quietly does nothing is worse than
              none — so the address stays readable and copyable even when the
              link itself does nothing. */}
          <span className="whitespace-nowrap">
            Questions?{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>
              {SUPPORT_EMAIL}
            </a>
          </span>
        </nav>
      </div>

      <p className="max-w-4xl mx-auto mt-6 text-center text-xs text-muted-foreground/80">
        © {new Date().getFullYear()} Aunt Lucy. Made with care in Australia.
      </p>
    </footer>
  );
}

export default SiteFooter;
