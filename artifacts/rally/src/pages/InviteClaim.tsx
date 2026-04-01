import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { format, parseISO } from "date-fns";
import { CheckCircle2, Clock, Loader2, XCircle, MapPin, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

interface InviteDetails {
  inviteId: string;
  helperName: string;
  alreadyClaimed: boolean;
  claimedByYou: boolean;
  slot: {
    id: string;
    slotType: string;
    customLabel: string | null;
    slotDate: string;
    slotTime: string | null;
    notes: string | null;
  };
  page: {
    recipientName: string;
    location: string | null;
    situationDescription: string | null;
    slug: string;
  };
}

const SLOT_TYPE_LABELS: Record<string, { icon: string; label: string }> = {
  meal: { icon: "🍲", label: "Meal" },
  school_pickup: { icon: "🚗", label: "School Pickup" },
  child_care: { icon: "👶", label: "Child Care" },
  errand: { icon: "🧺", label: "Errand" },
  dog_walking: { icon: "🐕", label: "Dog Walking" },
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

export default function InviteClaim() {
  const { token } = useParams<{ token: string }>();
  const [details, setDetails] = useState<InviteDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<InviteDetails>(`/invite/${token}`)
      .then((data) => {
        setDetails(data);
        if (data.claimedByYou) setClaimed(true);
      })
      .catch((err: any) => setError(err.message ?? "This invitation is invalid."))
      .finally(() => setIsLoading(false));
  }, [token]);

  async function handleClaim() {
    setIsClaiming(true);
    setClaimError(null);
    try {
      await apiFetch(`/invite/${token}/claim`, { method: "POST" });
      setClaimed(true);
    } catch (err: any) {
      setClaimError(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setIsClaiming(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <XCircle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="font-serif text-2xl font-bold text-foreground mb-3">
            Invitation not found
          </h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!details) return null;

  const { slot, page } = details;
  const slotMeta =
    SLOT_TYPE_LABELS[slot.slotType] ?? SLOT_TYPE_LABELS.other;
  const slotLabel = slot.customLabel || slotMeta.label;
  const dateObj = parseISO(slot.slotDate);
  const formattedDate = format(dateObj, "EEEE, MMMM d");
  const formattedTime = slot.slotTime ? formatTime(slot.slotTime) : null;

  if (claimed) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-primary" />
          </div>
          <h1 className="font-serif text-2xl font-bold text-foreground mb-3">
            You're confirmed!
          </h1>
          <p className="text-muted-foreground leading-relaxed mb-2">
            Thank you, {details.helperName}. You're helping{" "}
            <strong>{page.recipientName}</strong> with a{" "}
            <strong>{slotLabel}</strong> on <strong>{formattedDate}</strong>
            {formattedTime ? ` at ${formattedTime}` : ""}.
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            The family will be so grateful for your support.
          </p>
        </div>
      </div>
    );
  }

  if (details.alreadyClaimed && !details.claimedByYou) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-serif text-2xl font-bold text-foreground mb-3">
            This slot is taken
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Someone else has already claimed this slot. The family has plenty of
            support lined up — thank you for being willing to help.
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
          <div className="flex items-center gap-2 text-white/70 text-sm mb-3">
            <ShieldCheck className="w-4 h-4" />
            Personal invitation
          </div>
          <h1 className="font-serif text-2xl font-bold mb-1">
            Hi {details.helperName},
          </h1>
          <p className="text-white/80 leading-relaxed">
            You've been personally invited to help{" "}
            <strong className="text-white">{page.recipientName}</strong>.
          </p>
        </div>
      </div>

      <div className="max-w-sm mx-auto px-5 py-8 space-y-6">
        {/* Situation */}
        {page.situationDescription && (
          <div className="bg-primary/5 rounded-2xl p-4 border border-primary/10">
            <p className="text-sm text-foreground/80 leading-relaxed italic">
              "{page.situationDescription}"
            </p>
          </div>
        )}

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
                {formattedDate}
                {formattedTime && ` • ${formattedTime}`}
              </p>
            </div>
          </div>

          {page.location && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mb-4">
              <MapPin className="w-3.5 h-3.5" />
              {page.location}
            </p>
          )}

          {slot.notes && (
            <div className="rounded-2xl bg-primary/5 border border-primary/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary/70 mb-1.5">
                Task instructions
              </p>
              <p className="text-sm text-foreground/80 leading-relaxed">
                {slot.notes}
              </p>
            </div>
          )}
        </div>

        {claimError && (
          <p className="text-sm text-destructive text-center">{claimError}</p>
        )}

        <Button
          size="lg"
          className="w-full font-serif text-base"
          onClick={handleClaim}
          disabled={isClaiming}
        >
          {isClaiming ? "Confirming…" : "Yes, I'll help with this"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          By confirming, the family will know you're coming. If plans change,
          please contact the organiser directly.
        </p>
      </div>
    </div>
  );
}
