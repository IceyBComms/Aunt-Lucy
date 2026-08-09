import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { format, parseISO } from "date-fns";
import { CheckCircle2, Clock, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TeacupMark } from "@/components/TeacupMark";
import { apiFetch } from "@/lib/api";
import { helper as copy } from "@/lib/item17Copy";

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
    // Item 17: flexible → a helper may nudge the time; fixed → note only.
    flexibility: "flexible" | "fixed";
    claimedNote: string | null;
  };
  helperName: string | null;
  page: {
    recipientName: string;
    location: string | null;
    slug: string;
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
  const ampm = h >= 12 ? "pm" : "am";
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

  // Item 17 — reschedule (flexible) / leave a note (any task).
  const [newTime, setNewTime] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState<null | "time" | "note">(null);
  const [passedOn, setPassedOn] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ReleaseDetails>(`/slots/release/${token}`)
      .then((data) => {
        setDetails(data);
        setNewTime((data.slot.slotTime ?? "").slice(0, 5));
        setNote(data.slot.claimedNote ?? "");
      })
      .catch((err: any) => setError(err.message ?? "This link is no longer active."))
      .finally(() => setIsLoading(false));
  }, [token]);

  async function handleReschedule() {
    if (!newTime) {
      setActionError(copy.errors.badTime);
      return;
    }
    setSubmitting("time");
    setActionError(null);
    try {
      await apiFetch(`/slots/reschedule/${token}`, {
        method: "POST",
        body: JSON.stringify({ slotTime: newTime, note: note.trim() || undefined }),
      });
      setPassedOn(true);
    } catch (err: any) {
      setActionError(err.message ?? copy.errors.fallback);
    } finally {
      setSubmitting(null);
    }
  }

  async function handleNote() {
    if (note.trim().length > 200) {
      setActionError(copy.errors.noteTooLong);
      return;
    }
    setSubmitting("note");
    setActionError(null);
    try {
      await apiFetch(`/slots/note/${token}`, {
        method: "POST",
        body: JSON.stringify({ note: note.trim() }),
      });
      setPassedOn(true);
    } catch (err: any) {
      setActionError(err.message ?? copy.errors.fallback);
    } finally {
      setSubmitting(null);
    }
  }

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
  const recipientFirstName = page.recipientName.split(/\s+/)[0] || page.recipientName;
  // Undated slots are flexible offers — show words, not a fabricated date.
  // Australian format: "Saturday 15 August" (day before month), not US month-first.
  const formattedDate = slot.slotDate
    ? format(parseISO(slot.slotDate), "EEEE d MMMM")
    : null;
  const formattedTime = slot.slotDate && slot.slotTime ? formatTime(slot.slotTime) : null;

  if (released) {
    // Fixed tasks are time-sensitive: the recipient has just been texted, so the
    // confirmation says so. Flexible keeps the original "it's open again" wording.
    if (slot.flexibility === "fixed") {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm text-center">
            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <TeacupMark className="w-10 h-10" />
            </div>
            <p className="font-serif text-xl font-semibold text-foreground leading-relaxed">
              {copy.confirmationFixedCancel(recipientFirstName)}
            </p>
            <a
              href={`/s/${page.slug}`}
              className="mt-5 inline-block text-sm text-primary underline underline-offset-4 hover:opacity-80"
            >
              {copy.seeElseLink}
            </a>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <TeacupMark className="w-10 h-10" />
          </div>
          <p className="font-serif text-xl font-semibold text-foreground leading-relaxed">
            {copy.confirmationFlexibleCancel(recipientFirstName)}
          </p>
          <a
            href={`/s/${page.slug}`}
            className="mt-5 inline-block text-sm text-primary underline underline-offset-4 hover:opacity-80"
          >
            {copy.seeElseLink}
          </a>
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
            Plans changed?
          </h1>
          <p className="text-white/80 leading-relaxed">
            {slot.flexibility === "flexible"
              ? copy.introFlexible(recipientFirstName)
              : copy.introFixed(recipientFirstName)}
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
                {formattedTime && `, ${formattedTime}`}
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

        {/* Item 17 — reschedule (flexible) or leave a note (any task). */}
        {passedOn ? (
          <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6 text-center">
            <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-7 h-7 text-primary" />
            </div>
            <p className="font-serif text-lg font-semibold text-foreground">
              {copy.confirmation}
            </p>
          </div>
        ) : slot.flexibility === "flexible" ? (
          <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-5 space-y-3">
            <div>
              <h3 className="font-serif font-semibold text-foreground text-lg">
                {copy.reschedule.label}
              </h3>
              <p className="text-sm text-muted-foreground">{copy.reschedule.help}</p>
            </div>
            <input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground focus:border-primary focus:outline-none"
            />
            <div>
              <textarea
                value={note}
                maxLength={200}
                rows={2}
                onChange={(e) => setNote(e.target.value)}
                placeholder={copy.reschedule.notePlaceholder}
                className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <p className="mt-1 text-right text-xs text-muted-foreground">
                {copy.noteCounter(note.length)}
              </p>
            </div>
            {actionError && <p className="text-sm text-destructive">{actionError}</p>}
            <Button
              size="lg"
              className="w-full font-serif text-base"
              onClick={handleReschedule}
              disabled={submitting === "time"}
            >
              {submitting === "time" ? copy.reschedule.buttonBusy : copy.reschedule.button}
            </Button>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {copy.dateChangeGuardrail(recipientFirstName)}
            </p>
          </div>
        ) : (
          <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-5 space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {copy.fixedNote.lead}
            </p>
            <div>
              <textarea
                value={note}
                maxLength={200}
                rows={2}
                onChange={(e) => setNote(e.target.value)}
                placeholder={copy.reschedule.notePlaceholder}
                className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <p className="mt-1 text-right text-xs text-muted-foreground">
                {copy.noteCounter(note.length)}
              </p>
            </div>
            {actionError && <p className="text-sm text-destructive">{actionError}</p>}
            <Button
              size="lg"
              className="w-full font-serif text-base"
              onClick={handleNote}
              disabled={submitting === "note" || !note.trim()}
            >
              {submitting === "note" ? "Passing on…" : copy.fixedNote.button}
            </Button>
          </div>
        )}

        {releaseError && (
          <p className="text-sm text-destructive text-center">{releaseError}</p>
        )}

        {!passedOn && (
          <>
            {slot.flexibility === "fixed" && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {copy.fixedNote.cancelBlurb(slotLabel, recipientFirstName)}
              </p>
            )}
            <Button
              size="lg"
              variant="outline"
              className="w-full font-serif text-base"
              onClick={handleRelease}
              disabled={isReleasing}
            >
              {isReleasing
                ? copy.cancelButtonBusy
                : slot.flexibility === "fixed"
                  ? copy.cancelButtonFixed
                  : copy.cancelButtonFlexible}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {slot.flexibility === "fixed"
                ? copy.footerFixed(recipientFirstName)
                : copy.footerFlexible(recipientFirstName)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
