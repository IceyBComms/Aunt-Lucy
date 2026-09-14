import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Loader2, XCircle } from "lucide-react";
import { TeacupMark } from "@/components/TeacupMark";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { SiteFooter } from "@/components/SiteFooter";

// Opening this page must NEVER spend the sign-in token. Mail scanners, Safe
// Links and in-app browsers open links before the person does; if loading the
// page signed in, they would use the link up first. So loading only CHECKS the
// token (GET), and only the button below spends it (POST). Do not move the POST
// into the effect. (api-server/src/lib/magicLinkVerify.test.ts guards this.)
export default function OrganiseVerify() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { signIn } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const fromLink = params.get("token");

    if (!fromLink) {
      setError("No sign-in token found. Please request a new link.");
      setIsChecking(false);
      return;
    }

    apiFetch<{ status: "valid" }>(`/auth/verify?token=${encodeURIComponent(fromLink)}`)
      .then(() => setToken(fromLink))
      .catch((err: any) => {
        setError(err.message ?? "This link is invalid or has expired.");
      })
      .finally(() => setIsChecking(false));
  }, [search]);

  async function confirmSignIn() {
    if (!token) return;
    setIsSigningIn(true);
    try {
      const { sessionToken } = await apiFetch<{ sessionToken: string }>("/auth/verify", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      signIn(sessionToken);
      setLocation("/organise/dashboard");
    } catch (err: any) {
      setError(err.message ?? "This link is invalid or has expired.");
      setIsSigningIn(false);
    }
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
              Link expired
            </h1>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Button className="w-full" onClick={() => setLocation("/organise")}>
              Request a new link
            </Button>
          </div>
        </div>
        <SiteFooter compact />
      </div>
    );
  }

  if (isChecking || !token) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-muted-foreground">Checking your link…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm" data-testid="magic-link-confirm">
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-5">
            <TeacupMark className="w-8 h-8" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
            Aunt Lucy
          </h1>
        </div>

        <div className="bg-card rounded-3xl shadow-sm border border-border/50 p-6 text-center">
          <h2 className="font-serif text-xl font-semibold text-foreground mb-1">
            You're nearly in
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Tap the button to finish signing in.
          </p>
          <Button
            type="button"
            className="w-full font-serif text-base"
            size="lg"
            onClick={confirmSignIn}
            disabled={isSigningIn}
          >
            {isSigningIn ? "Signing you in…" : "Sign me in"}
          </Button>
        </div>
      </div>
    </div>
  );
}
