import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import {
  LIFT_WAIT_MODE_HELPER_LINES,
  LIFT_WAIT_MODE_TILE_LINES,
  asLiftWaitMode,
} from "@/lib/liftWaitMode";
import {
  taskLabel,
  taskNoun,
  taskWhenCard,
  taskWhenClause,
} from "@workspace/task-copy";
import { CarFront, CheckCircle2, Clock, Loader2, XCircle, MapPin, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { claimInvite } from "@/lib/inviteClaimRequest";
import { SiteFooter } from "@/components/SiteFooter";

/**
 * The page isn't live yet (a draft, or waiting to be switched on). The server
 * sends nothing about the task until it is — only the two names the invitation
 * message already carried.
 */
interface InviteNotLive {
  pageLive: false;
  helperName: string;
  page: { recipientName: string };
}

/**
 * ✅ Approved copy, Kate, 16 Sep 2026 (bug #115) — word-for-word. Mirrors the
 * "Not live yet" state on /s/:slug (bug #028). The server's claim refusal in
 * api-server lib/inviteClaim.ts carries the same body.
 */
const NOT_LIVE_YET_TITLE = "Not live yet";
function notLiveYetBody(recipientName: string): string {
  const recipientFirstName = recipientName.trim().split(/\s+/)[0] || recipientName.trim();
  return `${recipientFirstName}'s page is still being set up. Hang on to this message — this link will work as soon as it's switched on.`;
}

interface InviteDetails {
  pageLive: true;
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
    /** Bug #033 — null unless this is an answered lift. */
    liftWaitMode: string | null;
    notes: string | null;
  };
  page: {
    recipientName: string;
    location: string | null;
    situationDescription: string | null;
    slug: string;
  };
}

// Icons stay here — they are a rally concern. The NAMES come from
// @workspace/task-copy, which api-server imports too (row #136).
const SLOT_ICONS: Record<string, string> = {
  meal: "🍲",
  school_pickup: "🚗",
  child_care: "👶",
  errand: "🧺",
  dog_walking: "🐕",
  shopping: "🛒",
  visit: "☕",
  other: "💛",
};

export default function InviteClaim() {
  const { token } = useParams<{ token: string }>();
  const [details, setDetails] = useState<InviteDetails | InviteNotLive | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bug #090 — a CLOSED page is not a dead link, and must not be shown as one.
  // Tracked separately from `error` because the two get different screens: the
  // generic one is headed "Invitation not found", which contradicts a body
  // saying the page has closed.
  const [pageClosed, setPageClosed] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  // Present only after a fresh claim in this session — the private handle to
  // release this slot again if plans change. Not returned by GET /invite (a
  // re-visit shows the static "already confirmed" screen), so this stays null on
  // reload, which is fine: the confirmation email carries the same link.
  const [cancelToken, setCancelToken] = useState<string | null>(null);
  // The https .ics for this claim, offered as a one-tap download (bug #037 — it
  // was a webcal:// subscribe link until 6 September 2026). Returned only on a
  // fresh claim of a dated slot. null on reload (same as cancelToken) — the
  // link isn't re-fetched, which is fine here since this path sends no email.
  const [calendarUrl, setCalendarUrl] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<InviteDetails | InviteNotLive>(`/invite/${token}`)
      .then((data) => {
        setDetails(data);
        if (data.pageLive !== false && data.claimedByYou) setClaimed(true);
      })
      .catch((err: any) => {
        // The server's machine-readable refusal, not its words — the copy can
        // be reworded without this branch going quiet.
        if (err?.reason === "page_closed") setPageClosed(true);
        else setError(err.message ?? "This invitation is invalid.");
      })
      .finally(() => setIsLoading(false));
  }, [token]);

  async function handleClaim() {
    setIsClaiming(true);
    setClaimError(null);
    try {
      // The request itself lives in lib/inviteClaimRequest.ts so the server's
      // test sends exactly what this button sends (no body).
      const res = await claimInvite(token);
      if (res?.cancelToken) setCancelToken(res.cancelToken);
      if (res?.calendarUrl) setCalendarUrl(res.calendarUrl);
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

  // ⏸️ TODO(copy) — an invitation to a page that has CLOSED (bug #090).
  //
  // It used to answer "This invitation link is invalid or has expired" under an
  // "Invitation not found" heading, which reads as our mistake or theirs to
  // somebody who was asked personally. It reads as closed now, and — ruling 6 —
  // says nothing about why, and does not name the recipient: holding the token
  // is not proof of who is holding it.
  if (pageClosed) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm text-center" data-testid="invite-closed">
            <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Clock className="w-8 h-8 text-primary" />
            </div>
            <h1 className="font-serif text-2xl font-bold text-foreground mb-3">
              This page has closed
            </h1>
            <p className="text-muted-foreground leading-relaxed">
              Thank you for being willing to help. There's nothing more needed here.
            </p>
          </div>
        </div>
        <SiteFooter compact />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center p-6">
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
        <SiteFooter compact />
      </div>
    );
  }

  if (!details) return null;

  // Checked before anything reads the task: a not-live answer carries none.
  if (details.pageLive === false) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm text-center">
            <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Clock className="w-8 h-8 text-primary" />
            </div>
            <h1 className="font-serif text-2xl font-bold text-foreground mb-3">
              {NOT_LIVE_YET_TITLE}
            </h1>
            <p className="text-muted-foreground leading-relaxed">{notLiveYetBody(details.page.recipientName)}</p>
          </div>
        </div>
        <SiteFooter compact />
      </div>
    );
  }

  const { slot, page } = details;
  const slotIcon = SLOT_ICONS[slot.slotType] ?? SLOT_ICONS.other;
  // Heading form for the card, mid-sentence form (with its article) for the
  // confirmation sentence — row #136. Lower-casing a heading is not a grammar.
  const slotLabel = taskLabel(slot.slotType, slot.customLabel);
  const slotNoun = taskNoun(slot.slotType, slot.customLabel);
  // Row #139 — one format. The card takes the "·" join, the sentence takes "at".
  const whenCard = taskWhenCard(slot.slotDate, slot.slotTime ?? null);
  const whenSentence = taskWhenClause(slot.slotDate, slot.slotTime ?? null);
  // Bug #033. Null renders nothing at all — no line, no empty space.
  const waitMode = asLiftWaitMode(slot.liftWaitMode);

  if (claimed) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm text-center">
            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-primary" />
            </div>
            <h1 className="font-serif text-2xl font-bold text-foreground mb-3">
              You're confirmed!
            </h1>
            <p className="text-muted-foreground leading-relaxed mb-2">
              Thank you, {details.helperName}. You're helping{" "}
              <strong>{page.recipientName}</strong> with{" "}
              <strong>{slotNoun}</strong> {whenSentence}.
              {waitMode ? ` ${LIFT_WAIT_MODE_HELPER_LINES[waitMode]}` : ""}
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              The family will be so grateful for your support.
            </p>
            {/* Approved copy, bug #037 — matches ClaimDialog.tsx and the
                confirmation email word-for-word. A one-tap .ics download, which
                never updates, so nothing here may promise that it will. */}
            {calendarUrl && (
              <p className="text-muted-foreground text-sm leading-relaxed mt-4">
                <a href={calendarUrl} className="text-primary font-bold underline">
                  Add this to your calendar
                </a>
                <br />
                so it's there when you need it.
              </p>
            )}
            {cancelToken && (
              <p className="text-muted-foreground text-sm leading-relaxed mt-4">
                Plans change? You can{" "}
                <Link href={`/release/${cancelToken}`} className="text-primary font-medium underline">
                  release this slot
                </Link>{" "}
                any time.
              </p>
            )}
          </div>
        </div>
        <SiteFooter compact />
      </div>
    );
  }

  if (details.alreadyClaimed && !details.claimedByYou) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center p-6">
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
        <SiteFooter compact />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-primary text-white px-5 py-8">
        <div className="max-w-sm mx-auto">
          <div className="flex items-center gap-2 text-white/70 text-sm mb-3">
            <ShieldCheck className="w-4 h-4" />
            Personal invitation
          </div>
          <h1 className="text-white font-serif text-2xl font-bold mb-1">
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
              {slotIcon}
            </span>
            <div>
              <h2 className="font-serif font-semibold text-foreground text-lg">
                {slotLabel}
              </h2>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {whenCard}
              </p>
              {waitMode && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <CarFront className="w-3.5 h-3.5" />
                  {LIFT_WAIT_MODE_TILE_LINES[waitMode]}
                </p>
              )}
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
          By confirming, the family will know you're helping. If plans change,
          please contact the organiser directly.
        </p>
      </div>
      <SiteFooter compact />
    </div>
  );
}
