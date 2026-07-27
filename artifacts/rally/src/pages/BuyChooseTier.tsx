import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useListGiftTiers } from "@workspace/api-client-react";
import type { GiftTier } from "@workspace/api-client-react";
import { formatPrice } from "@/lib/money";

/**
 * Step 1 of the purchase flow — which gift.
 *
 * Prices and tiers come from the server (GET /gift-tiers) rather than living
 * here, so the figure on this page can never drift from what Stripe charges.
 * The pack tiers arrive with sellable: false and no payment link; they are shown
 * as coming soon because multi-gift fulfilment doesn't exist yet (see Item 12).
 */
export default function BuyChooseTier() {
  const [, setLocation] = useLocation();
  const { data: tiers, isLoading, isError } = useListGiftTiers();

  const forSale = (tiers ?? []).filter((t) => t.sellable);
  const comingSoon = (tiers ?? []).filter((t) => !t.sellable);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-5 py-10">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="mb-8">
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
            Turn good intentions into real help.
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Choose the gift, and we'll walk you through the rest. It takes about
            two minutes.
          </p>
        </div>

        {isLoading && (
          <p className="text-sm text-muted-foreground pl-1">Loading…</p>
        )}

        {isError && (
          <p className="text-sm text-destructive pl-1">
            We couldn't load the prices just now. Please refresh and try again.
          </p>
        )}

        <div className="space-y-3">
          {forSale.map((tier, i) => (
            <button
              key={tier.id}
              onClick={() => setLocation(`/buy/${tier.id}`)}
              className={`w-full text-left p-5 rounded-3xl border-2 transition-colors ${
                // The consumer gift leads — it's the primary commercial flow.
                i === 0
                  ? "border-primary bg-primary/5 hover:bg-primary/10"
                  : "border-border bg-card hover:border-primary/30"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <p className="font-serif text-lg font-bold text-foreground">
                  {tier.label}
                </p>
                <p className="font-serif text-lg font-bold text-foreground whitespace-nowrap">
                  {formatPrice(tier.amountCents)}
                </p>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {tier.blurb}
              </p>
              <p className="text-xs text-muted-foreground/80 mt-2">
                {tier.id === "workplace_individual"
                  ? "Support your people when it matters most. GST included."
                  : "GST included"}
              </p>
            </button>
          ))}
        </div>

        {comingSoon.length > 0 && (
          <div className="mt-10">
            {/* Deliberately not the workplace headline ("Support your people
                when it matters most") — that belongs to the tier you can
                actually buy, not to the two that are gated off. */}
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              For bigger teams
            </p>
            <div className="space-y-3">
              {comingSoon.map((tier) => (
                <ComingSoonTier key={tier.id} tier={tier} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3 pl-1">
              Buying for a whole team?{" "}
              <a
                href="mailto:hello@auntlucy.com.au?subject=Aunt%20Lucy%20for%20our%20team"
                className="underline hover:text-foreground transition-colors"
              >
                Talk to us
              </a>{" "}
              — we'll sort it out with you directly.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A pack tier, shown but not buyable. Rendered as a div rather than a disabled
 * button so it reads as information rather than a broken control.
 */
function ComingSoonTier({ tier }: { tier: GiftTier }) {
  return (
    <div className="p-5 rounded-3xl border-2 border-dashed border-border bg-muted/30">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <p className="font-serif text-lg font-bold text-muted-foreground">
          {tier.label}
        </p>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
          Coming soon
        </p>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {tier.blurb}
      </p>
    </div>
  );
}
