import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { CheckCircle2, Copy, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export default function OrganisePublish() {
  const { pageId } = useParams<{ pageId: string }>();
  const [, setLocation] = useLocation();
  const { token } = useAuth();

  const [slug, setSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ slug: string; status: string }>(`/organiser/pages/${pageId}/publish`, {
      method: "POST",
      token: token!,
    })
      .then(({ slug }) => setSlug(slug))
      .catch((err: any) => setError(err.message ?? "Failed to publish page."));
  }, [pageId, token]);

  const pageUrl = slug
    ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/s/${slug}`
    : null;

  function copyLink() {
    if (!pageUrl) return;
    navigator.clipboard.writeText(pageUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={() => setLocation("/organise/dashboard")}>Go to dashboard</Button>
        </div>
      </div>
    );
  }

  if (!slug) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-muted-foreground">Publishing your page…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-5 py-10">
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
    </div>
  );
}
