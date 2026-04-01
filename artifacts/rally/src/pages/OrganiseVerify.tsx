import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export default function OrganiseVerify() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const token = params.get("token");

    if (!token) {
      setError("No sign-in token found. Please request a new link.");
      return;
    }

    apiFetch<{ sessionToken: string }>(`/auth/verify?token=${token}`)
      .then(({ sessionToken }) => {
        signIn(sessionToken);
        setLocation("/organise/dashboard");
      })
      .catch((err: any) => {
        setError(err.message ?? "This link is invalid or has expired.");
      });
  }, [search, signIn, setLocation]);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
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
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-muted-foreground">Signing you in…</p>
      </div>
    </div>
  );
}
