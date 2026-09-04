import { Link } from "wouter";
import { TeacupMark } from "@/components/TeacupMark";
import { LEGAL_ENTITY } from "@/lib/legalEntity";

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
 *
 * ── WHY THE IDENTITY LINE IS IN BOTH MODES — Bug #095 ───────────────────────
 * A real buyer read the free crisis path and concluded it was a scam. The
 * pages already said "no card, no catch" THREE TIMES; more reassurance was the
 * failed treatment, because that is also what a scam says. What was missing was
 * a REASON and A NAME THAT CAN BE CHECKED — so this line names the person, the
 * entity and the ABN.
 *
 * It is NOT brand story, so `compact` does not drop it. Compact exists to keep
 * the product from talking about itself beside someone's bereavement; a helper
 * on a stranger's support page has MORE reason to want to know who is behind
 * this, not less. And it does not sell: it says who we are, with nothing to
 * click and nothing to buy.
 *
 * ── IDENTITY ONLY — NO REASON SENTENCE HERE (Kate's ruling, 4 Sep 2026) ──────
 * This line used to end "The paid version funds the free one, and the free one
 * is why I built it." Bug #109. It is gone, and must not come back.
 *
 * The ruling was made on the SECOND problem, not the first. The symptom was
 * doubling on the homepage, where the crisis block says it and the footer
 * said it again. The FAULT was the same sentence on `/s/:slug`, under a
 * stranger's illness — explaining how a paid product funds a free one to
 * someone who came to drop off a meal, and who is being sold nothing.
 *
 * So they are SPLIT: the footer carries identity only — name, entity, ABN —
 * on all six pages; the reason lives only where a free offer is actually
 * being made, which is the homepage crisis block and `/hardest-times`, each
 * in its own copy. Do not re-centralise them into here.
 *
 * FIRST PERSON IS DELIBERATE (Kate's ruling). "by me — Kate Robertson" is a
 * person taking responsibility; "by Kate Robertson" is a brand describing one,
 * and believability is the entire point of the line. Do not tidy it into
 * third person.
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

      {/* "Made with care in Australia" used to live on the copyright line. This
          replaces it rather than adding a block: same claim, plus who, plus the
          entity, plus the ABN — a superset of the weaker line that was already
          sitting in exactly the right place. Identity, and nothing else: the
          reason sentence was removed here by #109, see the ruling above.

          The entity and ABN come from LEGAL_ENTITY, not from a literal typed
          here. This is the one surface whose whole job is being CHECKABLE
          against the public register, and #092 was a wrong legal entity on a
          tax document — so it reads from the same constant as the legal pages
          rather than becoming a seventh independent copy of the number. */}
      <div className="max-w-2xl mx-auto mt-6 text-center text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} Aunt Lucy.</p>
        <p className="mt-1 leading-relaxed">
          Aunt Lucy was made in Australia by me — Kate Robertson, at{" "}
          {LEGAL_ENTITY.name}, ABN {LEGAL_ENTITY.abn}.
        </p>
      </div>
    </footer>
  );
}

export default SiteFooter;
