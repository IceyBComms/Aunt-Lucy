import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Plus, ExternalLink, LogOut, MapPin, Users, Check, Building2, ArrowRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import { SiteFooter } from "@/components/SiteFooter";

interface PageSummary {
  id: string;
  slug: string;
  recipientName: string;
  location: string | null;
  status: string;
  privacy: string;
  createdAt: string;
  closedAt: string | null;
  slotCount: number;
  claimedCount: number;
}

/**
 * The counts on a card, in words rather than jargon (Part A).
 *
 * "3 slots · 1 claimed" was the database talking. A slot is a row; what the
 * person wants to know is how much of it is covered. Zero is the case that
 * matters most and the one a number reads worst — "0 have someone" lands as a
 * failure, "nobody yet" as a fact about a page that has only just started.
 */
function taskCountLabel(n: number): string {
  return `${n} ${n === 1 ? "task" : "tasks"}`;
}

function coveredLabel(n: number): string {
  if (n === 0) return "nobody yet";
  return `${n} ${n === 1 ? "has" : "have"} someone`;
}

/**
 * "12 August" — the day a draft was started (Kate's ruling, 21 Sep 2026).
 *
 * No weekday: which Wednesday it was is not what tells two drafts apart, and
 * it made an already-long line longer. No year either, UNLESS the draft is
 * from a different year from today — in which case the year is the whole
 * point, because a draft left over from last year is a different kind of
 * thing from one started on Tuesday.
 */
function startedDate(iso: string): string {
  const d = new Date(iso);
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    ...(thisYear ? {} : { year: "numeric" }),
  });
}

/** "Tuesday, 12 August 2026" — the same en-AU form /manage uses. */
function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const STATUS_LABELS: Record<string, { label: string; colour: string }> = {
  active: { label: "Active", colour: "bg-primary/10 text-primary" },
  draft: { label: "Draft", colour: "bg-muted/60 text-muted-foreground" },
  closed: { label: "Closed", colour: "bg-destructive/10 text-destructive" },
};

export default function OrganiseDashboard() {
  const [, setLocation] = useLocation();
  const { token, organiser, isLoading: authLoading, signOut } = useAuth();

  const [pages, setPages] = useState<PageSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  /**
   * Bug #071 — the draft the person is being asked to confirm deleting.
   *
   * PATTERN P1: this is a one-way door, so it gets a warning that names the
   * REAL cost rather than restating the obvious. What is lost is the setup work
   * itself; what makes it safe to lose is that nothing has gone out yet. Both
   * halves are in the copy, so the person can decide rather than guess.
   */
  /**
   * PART A — the dashboard's door into /manage.
   *
   * /manage is reached by a grant token, and a grant token only ever arrives
   * by message. Signed in and looking straight at their own page, the
   * organiser had no way in unless they still had the text — and on a CLOSED
   * page no controls at all, so it could not even be reopened. The token is
   * fetched on CLICK, never with the page list, so one dashboard response
   * cannot spill a credential for every page at once.
   */
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<{ pageId: string; message: string } | null>(null);

  const [pendingDelete, setPendingDelete] = useState<PageSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function openManage(page: PageSummary) {
    setOpeningId(page.id);
    setOpenError(null);
    try {
      const res = await apiFetch<{ url: string }>(
        `/organiser/pages/${page.id}/manage-link`,
        { token: token! },
      );
      // Same tab: this is the person going to their own page, not opening a
      // reference alongside it.
      window.location.href = res.url;
    } catch (err: any) {
      setOpenError({
        pageId: page.id,
        message: err?.message ?? "That page couldn't be opened. Please try again.",
      });
      setOpeningId(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await apiFetch(`/organiser/pages/${pendingDelete.id}`, {
        method: "DELETE",
        token: token!,
      });
      setPages((p) => p.filter((x) => x.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err: any) {
      setDeleteError(err?.message ?? "That draft couldn't be deleted. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    if (!organiser) {
      setLocation("/organise");
      return;
    }

    apiFetch<PageSummary[]>("/organiser/pages", { token: token! })
      .then(setPages)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [organiser, authLoading, token, setLocation]);

  async function handleSignOut() {
    await signOut();
    setLocation("/organise");
  }

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-primary text-white px-5 py-8">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-serif text-2xl font-bold text-white">My dashboard</h1>
              <p className="text-white/70 text-sm mt-1">{organiser?.email}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 py-8">
        {/* Pilot applications shortcut — admin only */}
        {organiser?.isAdmin && (
          <button
            onClick={() => setLocation("/organise/pilot-applications")}
            className="w-full flex items-center gap-3 bg-primary/6 hover:bg-primary/10 border border-primary/20 rounded-2xl px-4 py-3 mb-6 text-left transition-colors"
          >
            <Building2 className="w-5 h-5 text-primary shrink-0" />
            <span className="text-sm font-medium text-primary">View pilot applications</span>
          </button>
        )}

        <div className="flex items-center justify-between mb-6">
          <h2 className="font-serif text-xl font-semibold text-foreground">Support pages</h2>
          {/*
            PART B (Kate, 21 September 2026) — admin only.
            Signing in is passwordless and unverified, so this button offered
            anyone who typed any address an unlimited supply of free pages,
            straight around the $59 gift. Paid pages arrive through the
            purchase; free ones through /hardest-times. The real lock is the
            403 on POST /organiser/pages — this only stops it being offered.
          */}
          {organiser?.isAdmin && (
            <Button
              variant="accent"
              size="sm"
              onClick={() => setLocation("/organise/create")}
              className="font-serif"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              New page
            </Button>
          )}
        </div>

        {pages.length === 0 ? (
          <div className="text-center py-16">
            {/*
              PART B again. An admin still gets the old invitation to create
              one. Everybody else is told plainly that there is nothing here
              and pointed at the front door — because for them a page is
              something that ARRIVES (a gift, or the crisis form), not
              something this screen makes. This state is rare: a crisis
              organiser is dropped straight into setup and always has a page.
            */}
            {organiser?.isAdmin ? (
              <>
                <p className="text-muted-foreground mb-2">You haven't created any support pages yet.</p>
                <p className="text-sm text-muted-foreground mb-6">
                  When someone you know needs help, create a page and share the link.
                </p>
                <Button onClick={() => setLocation("/organise/create")} className="font-serif">
                  Create your first page
                </Button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground mb-2">Nothing here yet.</p>
                <a
                  href={`${BASE}/`}
                  className="text-sm text-primary font-medium underline underline-offset-4"
                >
                  Start from the Aunt Lucy home page
                </a>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {pages.map((page, i) => {
              const status = STATUS_LABELS[page.status] ?? STATUS_LABELS.draft;
              const pageUrl = `${window.location.origin}${BASE}/s/${page.slug}`;

              return (
                <motion.div
                  key={page.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.05 }}
                  className="bg-card rounded-3xl border border-border/50 shadow-sm p-5"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="font-serif font-semibold text-foreground text-lg leading-tight">
                        Support for {page.recipientName}
                      </h3>
                      {page.location && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3.5 h-3.5" />
                          {page.location}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${status.colour}`}>
                      {status.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Users className="w-4 h-4" />
                      <span>{taskCountLabel(page.slotCount)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-primary font-medium">
                      <Check className="w-4 h-4" />
                      <span>{coveredLabel(page.claimedCount)}</span>
                    </div>
                  </div>

                  {/*
                    Row #130 — two drafts for the same person were identical
                    cards. The date is what tells them apart, and "Not live
                    yet" says the thing a "Draft" pill only implies.
                  */}
                  {page.status === "draft" && (
                    <p className="text-sm text-muted-foreground mb-4">
                      Not live yet · started {startedDate(page.createdAt)}
                    </p>
                  )}

                  {page.status === "closed" && page.closedAt && (
                    <p className="text-sm text-muted-foreground mb-4">
                      Closed on {longDate(page.closedAt)}
                    </p>
                  )}

                  {page.status === "active" && (
                    <div className="flex flex-col gap-2">
                      {/*
                        The primary action, full width. Everything a running
                        page needs — adding a task, inviting someone, closing
                        it — lives behind this one door, so it outranks the two
                        share controls rather than sitting beside them.
                      */}
                      <button
                        onClick={() => openManage(page)}
                        disabled={openingId === page.id}
                        className="w-full flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 px-3 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-60"
                      >
                        {openingId === page.id ? "Opening…" : "Make changes"}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(pageUrl);
                          }}
                          className="flex-1 text-sm text-center py-2 px-3 rounded-xl bg-secondary/50 hover:bg-secondary/80 text-foreground/80 transition-colors"
                        >
                          Copy link
                        </button>
                        {/*
                          Renamed from "View": it opens the PUBLIC page, which
                          is a different thing from the page you manage, and
                          the old label did not say which one you were about
                          to get.
                        */}
                        <a
                          href={`${BASE}/s/${page.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-sm py-2 px-3 rounded-xl bg-secondary/50 hover:bg-secondary/80 text-foreground/80 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          View as a helper
                        </a>
                      </div>
                    </div>
                  )}

                  {/*
                    A CLOSED page had no controls whatsoever — it was a card
                    you could read and nothing else, and closing was therefore
                    a one-way door from here even though /manage has offered
                    reopening since #090. Same button, same door.
                  */}
                  {page.status === "closed" && (
                    <button
                      onClick={() => openManage(page)}
                      disabled={openingId === page.id}
                      className="w-full flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 px-3 rounded-xl bg-secondary/50 hover:bg-secondary/80 text-foreground/80 transition-colors disabled:opacity-60"
                    >
                      {openingId === page.id ? "Opening…" : "Make changes"}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {openError?.pageId === page.id && (
                    <p className="mt-2 text-sm text-destructive">{openError.message}</p>
                  )}

                  {/*
                    Bug #071 — a draft had NO controls at all: no way in, no way
                    out, and it sat here for ever. Continuing is the primary
                    action because being interrupted is the normal case, not the
                    exception — especially on the crisis path.
                  */}
                  {page.status === "draft" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setLocation(`/organise/create/${page.id}/slots`)}
                        className="flex-1 flex items-center justify-center gap-1.5 text-sm py-2 px-3 rounded-xl bg-primary/10 hover:bg-primary/15 text-primary font-medium transition-colors"
                      >
                        Continue setting up
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setDeleteError(null);
                          setPendingDelete(page);
                        }}
                        aria-label={`Delete draft for ${page.recipientName}`}
                        className="flex items-center gap-1.5 text-sm py-2 px-3 rounded-xl bg-secondary/50 hover:bg-secondary/80 text-foreground/70 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/*
        The confirm. Copy is Kate's approved wording, verbatim — it names what
        is lost AND why losing it is safe, which is what earns the interruption
        (PATTERN P1). "Keep it" rather than "Cancel": the safe choice should
        read as a choice, not as backing out.
      */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/40 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-draft-title"
        >
          <div className="w-full max-w-sm bg-card rounded-3xl shadow-xl p-6">
            <h2
              id="delete-draft-title"
              className="font-serif text-xl font-bold text-foreground mb-2"
            >
              Delete this draft?
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-6">
              Nothing has been sent and nobody has seen it. This can&rsquo;t be undone.
            </p>
            {deleteError && (
              <p className="text-sm text-destructive mb-4">{deleteError}</p>
            )}
            {/*
              Kate's rule, 30 Aug: green is the thing you want them to do, quiet
              is the escape hatch — and deleting a draft nobody has seen IS the
              escape hatch, not a catastrophe. Red is a currency; spending it
              here devalues it for the day something genuinely destructive needs
              it. The seriousness is carried by the sentence above, which says
              plainly that this can't be undone; the buttons don't need to shout
              it a second time.

              Order is deliberate: DOM is [Delete, Keep it], so the reversible
              choice sits on top on a phone and on the right on a desktop — the
              conventional resting place for the safe one, in both layouts.
            */}
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <Button
                variant="secondary"
                className="flex-1 font-serif"
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </Button>
              <Button
                className="flex-1 font-serif"
                onClick={() => setPendingDelete(null)}
                disabled={isDeleting}
              >
                Keep it
              </Button>
            </div>
          </div>
        </div>
      )}
      <SiteFooter compact />
    </div>
  );
}
