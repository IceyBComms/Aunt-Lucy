import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { CheckCircle2, Copy, ExternalLink } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { SiteFooter } from "@/components/SiteFooter";
import { SLOT_TYPES } from "@/pages/OrganiseAddSlots";
import { SETUP_PUBLISH_COPY as COPY } from "@/lib/setupPublishCopy";

interface PublishSlot {
  id: string;
  slotType: string;
  customLabel: string | null;
  slotDate: string | null;
  slotTime: string | null;
}

interface PublishPage {
  slug: string;
  recipientName: string;
  status: string;
  /** "open" | "pin_protected" — decides which confirm body is true. */
  privacy: string;
  /**
   * Invitations added while this page was a draft, waiting for it to go live
   * (#113). Publishing sends them straight away, so when there are any the
   * step-3 line and the confirm say so; when there are none they say nothing
   * is sent, which is then true.
   */
  heldInviteCount?: number;
  slots: PublishSlot[];
}

export default function OrganisePublish() {
  const { pageId } = useParams<{ pageId: string }>();
  const [, setLocation] = useLocation();
  const { token } = useAuth();

  const [page, setPage] = useState<PublishPage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  /** The refusal was "already live", so the link beneath it is true. */
  const [refusedAsLive, setRefusedAsLive] = useState(false);
  const [copied, setCopied] = useState(false);

  /**
   * 14 Sep 2026 — READ ONLY.
   *
   * This effect used to POST /publish. LOADING THIS SCREEN WAS THE ACTIVATION:
   * there was no activate control anywhere on the organiser or crisis path, so
   * pressing Continue, following an old link, pressing back or refreshing step 3
   * made a page live whether or not anyone meant it to. Now it only asks what
   * state the page is in. Going live is the button and the confirm below.
   *
   * This screen is the courtesy, not the guard: the server refuses a page that
   * is not a draft or has no tasks (canPublish, api-server/src/lib/pagePublish).
   */
  useEffect(() => {
    let cancelled = false;
    apiFetch<PublishPage>(`/organiser/pages/${pageId}`, { token: token! })
      .then((p) => {
        if (!cancelled) setPage(p);
      })
      .catch((err: any) => {
        if (!cancelled) setLoadError(err.message ?? "Page not found.");
      });
    return () => {
      cancelled = true;
    };
  }, [pageId, token]);

  /** The only place on this path that makes a page live — after the confirm. */
  async function confirmPublish() {
    setIsPublishing(true);
    setPublishError(null);
    setRefusedAsLive(false);
    try {
      const { slug, status } = await apiFetch<{ slug: string; status: string }>(
        `/organiser/pages/${pageId}/publish`,
        { method: "POST", token: token! },
      );
      setPage((p) => (p ? { ...p, slug, status } : p));
      setConfirming(false);
    } catch (err: any) {
      setPublishError(err.message ?? COPY.publishFailed);
      // "This page is already live." — it went live after this screen loaded
      // (another tab, a second press). The link is on this screen, so it goes
      // beneath the refusal rather than leaving them to hunt for it. Keyed on
      // the server's reason, never the message, so a copy change can't break it.
      setRefusedAsLive(err?.reason === "not_draft");
    } finally {
      setIsPublishing(false);
    }
  }

  const pageUrl = page
    ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/s/${page.slug}`
    : null;

  function copyLink() {
    if (!pageUrl) return;
    navigator.clipboard.writeText(pageUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const errorScreen = (message: string) => (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex-col flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <p className="text-muted-foreground mb-4">{message}</p>
          <Button onClick={() => setLocation("/organise/dashboard")}>Go to dashboard</Button>
        </div>
      </div>
      <SiteFooter compact />
    </div>
  );

  if (loadError) return errorScreen(loadError);

  if (!page) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Already live — just published, or reached again by an old link or the back
  // button. Show the link; never publish again.
  if (page.status === "active") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="max-w-lg mx-auto px-5 py-10" data-testid="publish-live">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary mb-2">Step 3 of 3</p>
          </div>

          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-primary fill-primary/10" />
            </div>
            <h1 className="font-serif text-3xl font-bold text-foreground mb-3">
              Your page is live!
            </h1>
            <p className="text-muted-foreground leading-relaxed">
              Share the link below with people who want to help. Anyone with the link can see the page and claim a slot.
            </p>
          </div>

          <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-5 mb-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Your shareable link
            </p>
            <div className="flex items-center gap-3">
              <p className="flex-1 text-sm font-medium text-foreground break-all bg-secondary/40 rounded-xl px-3 py-2.5">
                {pageUrl}
              </p>
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                variant="accent"
                className="flex-1 font-serif"
                onClick={copyLink}
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy link
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => window.open(pageUrl!, "_blank")}
                aria-label="Open page"
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => setLocation("/organise/dashboard")}
          >
            Go to my dashboard
          </Button>
        </div>
        <SiteFooter compact />
      </div>
    );
  }

  // Not a draft and not active. Today the only such status is `closed`, and
  // NOTHING in the code writes `closed` yet (#090) — so this branch cannot be
  // reached. When closure ships it will be, and notDraft ("This page is already
  // live.") is WRONG here by construction: the page reaching this line is the
  // one that is NOT live. No link is shown for the same reason. See the note on
  // notDraft in setupPublishCopy.
  if (page.status !== "draft") return errorScreen(COPY.notDraft);

  const hasTasks = page.slots.length > 0;
  const hasInvitations = (page.heldInviteCount ?? 0) > 0;
  const confirmBody = hasInvitations ? COPY.confirmBodyWithInvitations : COPY.confirmBody;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="max-w-lg w-full mx-auto px-5 py-10" data-testid="publish-step">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary mb-2">Step 3 of 3</p>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">{COPY.step3Heading}</h1>
          <p className="text-muted-foreground leading-relaxed">
            {hasTasks
              ? hasInvitations
                ? COPY.step3BodyWithInvitations
                : COPY.step3Body
              : COPY.noTasks}
          </p>
        </div>

        {hasTasks && (
          <ul className="mb-8 space-y-2">
            {page.slots.map((slot) => {
              const meta =
                SLOT_TYPES.find((t) => t.value === slot.slotType) ??
                SLOT_TYPES[SLOT_TYPES.length - 1];
              return (
                <li
                  key={slot.id}
                  className="flex items-center gap-3 bg-secondary/40 border border-border/50 rounded-2xl px-4 py-3"
                >
                  <span className="text-lg shrink-0" aria-hidden="true">
                    {meta.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {slot.customLabel || meta.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {slot.slotDate
                        ? format(parseISO(slot.slotDate), "EEE d MMM")
                        : "Whenever suits"}
                      {slot.slotTime ? ` · ${slot.slotTime}` : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {hasTasks && (
          <Button
            size="lg"
            className="w-full font-serif text-base"
            onClick={() => {
              setPublishError(null);
              setConfirming(true);
            }}
          >
            {COPY.step3Button}
          </Button>
        )}
        <Button
          variant={hasTasks ? "ghost" : "default"}
          className="w-full mt-3"
          onClick={() => setLocation(`/organise/create/${pageId}/slots`)}
        >
          {COPY.backToTasks}
        </Button>
      </div>

      {/*
        The confirm. Nothing is published until it is answered. Same shape as
        the dashboard's delete-draft confirm (#071), with the colours the other
        way round: here the thing we want them to do IS going live, so it is the
        primary button, and "Not yet" is the quiet way out. DOM order [Not yet,
        Make it live] puts the primary on top on a phone and on the right on a
        desktop.
      */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/40 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="publish-confirm-title"
        >
          <div className="w-full max-w-sm bg-card rounded-3xl shadow-xl p-6">
            <h2
              id="publish-confirm-title"
              className="font-serif text-xl font-bold text-foreground mb-2"
            >
              {COPY.confirmTitle(page.recipientName)}
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-6">
              {page.privacy === "pin_protected" ? confirmBody.pinProtected : confirmBody.open}
            </p>
            {publishError && <p className="text-sm text-destructive mb-4">{publishError}</p>}
            {publishError && refusedAsLive && pageUrl && (
              <p
                data-testid="refusal-link"
                className="-mt-2 mb-4 text-sm font-medium text-foreground break-all bg-secondary/40 rounded-xl px-3 py-2.5"
              >
                {pageUrl}
              </p>
            )}
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <Button
                variant="secondary"
                className="flex-1 font-serif"
                onClick={() => setConfirming(false)}
                disabled={isPublishing}
              >
                {COPY.confirmNo}
              </Button>
              <Button
                className="flex-1 font-serif"
                onClick={confirmPublish}
                disabled={isPublishing}
              >
                {isPublishing ? COPY.confirmYesBusy : COPY.confirmYes}
              </Button>
            </div>
          </div>
        </div>
      )}
      <SiteFooter compact />
    </div>
  );
}
