import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { format, parseISO } from "date-fns";
import { CheckCircle2, Clock, Loader2, XCircle, MapPin, HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

// The helper's own view of the claim they made, fetched by the private release
// token from their confirmation email. Mirrors InviteClaim's shape and style —
// a token-gated, account-free flow.
interface ReleaseDetails {
  slot: {
    id: string;
    slotType: string;
    customLabel: string | null;
    slotDate: string | null;
    slotTime: string | null;
    notes: string | null;
  };
  helperName: string | null;
  page: {
    recipientName: string;
    location: string | null;
  };
}

const SLOT_TYPE_LABELS: Record<string, { icon: string; label: string }> = {
  meal: { icon: "🍲", label: "Meal" },
  school_pickup: { icon: "🚗", label: "School pickup" },
  child_care: { icon: "👶", label: "Child care" },
  errand: { icon: "🧺", label: "Errand" },
  dog_walking: { icon: "🐕", label: "Dog walking" },
  shopping: { icon: "🛒", label: "Shopping" },
  visit: { icon: "☕", label: "Visit" },
  other: { icon: "💛", label: "Help" },
};

function formatTime(timeStr: string): string {
  const [h, min] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
}

export default function ReleaseSlot() {
  const { token } = useParams<{ token: string }>();
  const [details, setDetails] = useState<ReleaseDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReleasing, setIsReleasing] = useState(false);
  const [released, setReleased] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [releaseError, setReleaseError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ReleaseDetails>(`/slots/release/${token}`)
      .then((data) => setDetails(data))
      .catch((err: any) => setError(err.message ?? "This link is no longer active."))
      .finally(() => setIsLoading(false));
  }, [token]);

  async function handleRelease() {
    setIsReleasing(true);
    setReleaseError(null);
    try {
      await apiFetch(`/slots/release/${token}`, { method: "POST" });
      setReleased(true);
    } catch (err: any) {
      setReleaseError(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setIsReleasing(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  // Covers a stale link, an already-released slot, or one someone else has since
  // re-taken — all the same to the helper, none of them an error to worry about.
  if (error || !details) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-serif text-2xl font-bold text-foreground mb-3">
            Nothing to release
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            This slot has already been released, or the link is no longer active.
            Thank you for letting everyone know.
          </p>
        </div>
      </div>
    );
  }

  const { slot, page } = details;
  const slotMeta = SLOT_TYPE_LABELS[slot.slotType] ?? SLOT_TYPE_LABELS.other;
  const slotLabel = slot.customLabel || slotMeta.label;
  // Undated slots are flexible offers — show words, not a fabricated date.
  const formattedDate = slot.slotDate
    ? format(parseISO(slot.slotDate), "EEEE, MMMM d")
    : null;
  const formattedTime = slot.slotDate && slot.slotTime ? formatTime(slot.slotTime) : null;

  if (released) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <HeartHandshake className="w-10 h-10 text-primary" />
          </div>
          <h1 className="font-serif text-2xl font-bold text-foreground mb-3">
            All done — it's open again
          </h1>
          <p className="text-muted-foreground leading-relaxed mb-2">
            Thanks for letting us know. <strong>{slotLabel}</strong> is back on{" "}
            {page.recipientName}'s page for someone else to pick up.
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            No hard feelings at all — life happens. Thank you for wanting to help.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-white px-5 py-8">
        <div className="max-w-sm mx-auto">
          <h1 className="text-white font-serif text-2xl font-bold mb-1">
            Can't make it?
          </h1>
          <p className="text-white/80 leading-relaxed">
            That's completely okay. Release this slot and someone else can step in
            for <strong className="text-white">{page.recipientName}</strong>.
          </p>
        </div>
      </div>

      <div className="max-w-sm mx-auto px-5 py-8 space-y-6">
        {/* Slot card */}
        <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-12 h-12 rounded-2xl bg-secondary/80 flex items-center justify-center text-2xl">
              {slotMeta.icon}
            </span>
            <div>
              <h2 className="font-serif font-semibold text-foreground text-lg">
                {slotLabel}
              </h2>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {formattedDate ?? "Whenever suits"}
                {formattedTime && ` • ${formattedTime}`}
              </p>
            </div>
          </div>

          {page.location && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              {page.location}
            </p>
          )}
        </div>

        {releaseError && (
          <p className="text-sm text-destructive text-center">{releaseError}</p>
        )}

        <Button
          size="lg"
          variant="destructive"
          className="w-full font-serif text-base"
          onClick={handleRelease}
          disabled={isReleasing}
        >
          {isReleasing ? "Releasing…" : "Release this slot"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          {page.recipientName} won't see any fuss — just that the slot's open
          again. You can still claim another slot any time.
        </p>
      </div>
    </div>
  );
}
