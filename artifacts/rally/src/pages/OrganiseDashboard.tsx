import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Plus, ExternalLink, LogOut, MapPin, Users, Check, Building2 } from "lucide-react";
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
        {/* Pilot applications shortcut */}
        <button
          onClick={() => setLocation("/organise/pilot-applications")}
          className="w-full flex items-center gap-3 bg-primary/6 hover:bg-primary/10 border border-primary/20 rounded-2xl px-4 py-3 mb-6 text-left transition-colors"
        >
          <Building2 className="w-5 h-5 text-primary shrink-0" />
          <span className="text-sm font-medium text-primary">View pilot applications</span>
        </button>

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
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
