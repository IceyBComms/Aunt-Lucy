import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Plus, ExternalLink, LogOut, MapPin, Users, Check, Building2, ArrowRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";

interface PageSummary {
  id: string;
  slug: string;
  recipientName: string;
  location: string | null;
  status: string;
  privacy: string;
  createdAt: string;
  slotCount: number;
  claimedCount: number;
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
  const [pendingDelete, setPendingDelete] = useState<PageSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-white px-5 py-8">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-serif text-2xl font-bold">My dashboard</h1>
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
          <Button
            variant="accent"
            size="sm"
            onClick={() => setLocation("/organise/create")}
            className="font-serif"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New page
          </Button>
        </div>

        {pages.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground mb-2">You haven't created any support pages yet.</p>
            <p className="text-sm text-muted-foreground mb-6">
              When someone you know needs help, create a page and share the link.
            </p>
            <Button onClick={() => setLocation("/organise/create")} className="font-serif">
              Create your first page
            </Button>
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
                      <span>{page.slotCount} slots</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-primary font-medium">
                      <Check className="w-4 h-4" />
                      <span>{page.claimedCount} claimed</span>
                    </div>
                  </div>

                  {page.status === "active" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(pageUrl);
                        }}
                        className="flex-1 text-sm text-center py-2 px-3 rounded-xl bg-secondary/50 hover:bg-secondary/80 text-foreground/80 transition-colors"
                      >
                        Copy link
                      </button>
                      <a
                        href={`${BASE}/s/${page.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-sm py-2 px-3 rounded-xl bg-secondary/50 hover:bg-secondary/80 text-foreground/80 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        View
                      </a>
                    </div>
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
                        className="flex items-center gap-1.5 text-sm py-2 px-3 rounded-xl bg-secondary/50 hover:bg-secondary/80 text-foreground/70 hover:text-destructive transition-colors"
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
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <Button
                variant="outline"
                className="flex-1 font-serif"
                onClick={() => setPendingDelete(null)}
                disabled={isDeleting}
              >
                Keep it
              </Button>
              <Button
                variant="destructive"
                className="flex-1 font-serif"
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
