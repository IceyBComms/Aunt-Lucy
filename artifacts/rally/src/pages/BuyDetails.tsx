import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useListGiftTiers, useCreateGift } from "@workspace/api-client-react";
import type { GiftOccasion } from "@workspace/api-client-react";
import { formatPrice } from "@/lib/money";

/**
 * Step 2 of the purchase flow — who it's for, and when it should arrive.
 *
 * On submit this creates the gift row in `pending` status and then leaves the
 * app for Stripe. The server returns the checkout URL with client_reference_id
 * already attached — that parameter is how the Stripe webhook matches the
 * payment back to this gift, so the URL is used exactly as given.
 */

const OCCASIONS: { value: GiftOccasion; emoji: string; label: string }[] = [
  { value: "new_baby", emoji: "🍼", label: "New baby" },
  { value: "illness_recovery", emoji: "🏥", label: "Illness or recovery" },
  { value: "bereavement", emoji: "💙", label: "Loss" },
  { value: "ongoing_support", emoji: "🤍", label: "Ongoing support" },
  { value: "other", emoji: "", label: "Something else" },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BuyDetails() {
  const [, setLocation] = useLocation();
  const { tierId } = useParams<{ tierId: string }>();
  const { data: tiers, isLoading: tiersLoading } = useListGiftTiers();
  const createGift = useCreateGift();

  const tier = tiers?.find((t) => t.id === tierId);
  const isWorkplace = tierId === "workplace_individual";

  const [forSelf, setForSelf] = useState(false);
  const [form, setForm] = useState({
    purchaserName: "",
    purchaserEmail: "",
    recipientName: "",
    recipientEmail: "",
    recipientMobile: "",
    giftedByNote: "",
    deliveryDate: "",
  });
  const [contactMethod, setContactMethod] = useState<"email" | "mobile">("email");
  const [deliverWhen, setDeliverWhen] = useState<"now" | "date">("now");
  const [occasion, setOccasion] = useState<GiftOccasion>("new_baby");
  const [error, setError] = useState<string | null>(null);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // A workplace gift is always for someone else — you don't buy your own
  // parental leave present — so the fork is hidden on that tier.
  const showFork = !isWorkplace;
  const isForSelf = showFork && forSelf;

  // The tier is unknown, or a pack someone typed into the address bar. Send
  // them back rather than letting them fill in a form that can't be paid for.
  // (The server refuses these too — this is just so the dead end is friendly.)
  if (!tiersLoading && (!tier || !tier.sellable)) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-lg mx-auto px-5 py-10">
          <h1 className="font-serif text-2xl font-bold text-foreground mb-2">
            That gift isn't available yet
          </h1>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Have a look at what we can send today.
          </p>
          <Button onClick={() => setLocation("/buy")} size="lg">
            See the gifts
          </Button>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.purchaserName.trim() || !form.purchaserEmail.includes("@")) {
      setError("Just need a name and a situation — that's all.");
      return;
    }
    if (!isForSelf && !form.recipientName.trim()) {
      setError("Just need a name and a situation — that's all.");
      return;
    }

    try {
      const { checkoutUrl } = await createGift.mutateAsync({
        data: {
          tierId: tierId as never,
          purchaserName: form.purchaserName.trim(),
          purchaserEmail: form.purchaserEmail.trim(),
          forSelf: isForSelf,
          recipientName: isForSelf ? null : form.recipientName.trim(),
          // Only an email can be delivered to automatically. If they gave a
          // mobile we send them the link to pass on themselves, which is what
          // a null recipient email already means to fulfilment.
          recipientEmail:
            !isForSelf && contactMethod === "email"
              ? form.recipientEmail.trim() || null
              : null,
          occasion,
          giftedByNote: isForSelf ? null : form.giftedByNote.trim() || null,
          deliverAt:
            deliverWhen === "date" && form.deliveryDate
              ? new Date(`${form.deliveryDate}T09:00:00`).toISOString()
              : null,
        },
      });

      // Full navigation, not a router push — we're leaving the app for Stripe.
      window.location.assign(checkoutUrl);
    } catch {
      setError(
        "Something went wrong with the payment. Try again or use a different card.",
      );
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-5 py-10">
        <button
          onClick={() => setLocation("/buy")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Choose a different gift
        </button>

        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary mb-2">
            {tier ? `${tier.label} — ${formatPrice(tier.amountCents)}` : ""}
          </p>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
            {isWorkplace
              ? "Support your people when it matters most."
              : "Who's this for?"}
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            {isWorkplace
              ? "One gift page for one team member. They open it when they're ready — nothing goes live until they say so."
              : "Nothing is sent until you've paid, and nothing goes live until they open it."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {showFork && (
            <div className="space-y-3">
              <Label className="text-foreground/80 pl-1">Who is this for?</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: false, label: "Someone else" },
                  { value: true, label: "Myself" },
                ].map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => setForSelf(opt.value)}
                    className={`p-4 rounded-2xl border-2 text-sm font-medium transition-colors ${
                      forSelf === opt.value
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="purchaserName" className="text-foreground/80 pl-1">
              Your name
            </Label>
            <Input
              id="purchaserName"
              placeholder="e.g. Priya"
              value={form.purchaserName}
              onChange={(e) => set("purchaserName", e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="purchaserEmail" className="text-foreground/80 pl-1">
              Your email
            </Label>
            <Input
              id="purchaserEmail"
              type="email"
              placeholder="you@example.com"
              value={form.purchaserEmail}
              onChange={(e) => set("purchaserEmail", e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground pl-1">
              {isWorkplace
                ? "Your receipt and tax invoice (with our ABN) go here."
                : "Your receipt goes here."}
            </p>
          </div>

          {!isForSelf && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="recipientName" className="text-foreground/80 pl-1">
                  Their name
                </Label>
                <Input
                  id="recipientName"
                  placeholder="e.g. Sarah"
                  value={form.recipientName}
                  onChange={(e) => set("recipientName", e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground pl-1">
                  First name is plenty.
                </p>
              </div>

              <div className="space-y-3">
                <Label className="text-foreground/80 pl-1">
                  How should we reach them?
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "email" as const, label: "Email" },
                    { value: "mobile" as const, label: "Mobile" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setContactMethod(opt.value)}
                      className={`p-3 rounded-2xl border-2 text-sm font-medium transition-colors ${
                        contactMethod === opt.value
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {contactMethod === "email" ? (
                  <div className="space-y-1.5">
                    <Input
                      id="recipientEmail"
                      type="email"
                      placeholder="their@example.com"
                      value={form.recipientEmail}
                      onChange={(e) => set("recipientEmail", e.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground pl-1">
                      We'll send their gift here — nothing else, ever.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Input
                      id="recipientMobile"
                      type="tel"
                      inputMode="tel"
                      placeholder="0412 345 678"
                      value={form.recipientMobile}
                      onChange={(e) => set("recipientMobile", e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground pl-1">
                      We'll send the link to you, so you can pass it on yourself
                      whenever the moment feels right.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="space-y-3">
            <Label className="text-foreground/80 pl-1">
              What's the occasion?
            </Label>
            <div className="flex flex-wrap gap-2">
              {OCCASIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setOccasion(opt.value)}
                  className={`px-4 py-2.5 rounded-2xl border-2 text-sm font-medium transition-colors ${
                    occasion === opt.value
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  {opt.emoji && <span className="mr-1.5">{opt.emoji}</span>}
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground pl-1">
              This only shapes the words we use — it's never shown to helpers.
            </p>
          </div>

          {!isForSelf && (
            <div className="space-y-1.5">
              <Label htmlFor="giftedByNote" className="text-foreground/80 pl-1">
                A note from you{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Textarea
                id="giftedByNote"
                rows={3}
                placeholder={
                  isWorkplace
                    ? "e.g. From all of us at Brightpath — enjoy every minute."
                    : "e.g. Thinking of you. Lean on us — that's what we're here for."
                }
                value={form.giftedByNote}
                onChange={(e) => set("giftedByNote", e.target.value)}
              />
              <p className="text-xs text-muted-foreground pl-1">
                They'll see this when they open their gift.
              </p>
            </div>
          )}

          <div className="space-y-3">
            <Label className="text-foreground/80 pl-1">
              When should it arrive?
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "now" as const, label: "Now" },
                { value: "date" as const, label: "Choose a date" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDeliverWhen(opt.value)}
                  className={`p-3 rounded-2xl border-2 text-sm font-medium transition-colors ${
                    deliverWhen === opt.value
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {deliverWhen === "date" && (
              <Input
                type="date"
                min={today()}
                value={form.deliveryDate}
                onChange={(e) => set("deliveryDate", e.target.value)}
                required
              />
            )}
          </div>

          {error && <p className="text-sm text-destructive pl-1">{error}</p>}

          <div className="pt-2">
            <Button
              type="submit"
              size="lg"
              className="w-full font-serif text-base"
              disabled={createGift.isPending}
            >
              {createGift.isPending
                ? "Taking you to payment…"
                : isForSelf
                  ? "Set up for myself →"
                  : isWorkplace
                    ? "Buy for a team member →"
                    : "Gift Aunt Lucy →"}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-3">
              {tier ? `${formatPrice(tier.amountCents)}, GST included. ` : ""}
              You'll pay securely with Stripe.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
