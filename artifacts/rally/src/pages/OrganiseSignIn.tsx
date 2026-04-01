import { useState } from "react";
import { useLocation } from "wouter";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";

export default function OrganiseSignIn() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { organiser, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && organiser) {
      setLocation("/organise/dashboard");
    }
  }, [organiser, authLoading, setLocation]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await apiFetch("/auth/magic-link", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setLocation("/organise/check-email");
    } catch (err: any) {
      setError(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-5">
            <Heart className="w-8 h-8 text-primary fill-primary/20" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
            Aunt Lucy
          </h1>
          <p className="text-muted-foreground text-center text-sm leading-relaxed">
            Coordinate care for the people you love.
          </p>
        </div>

        <div className="bg-card rounded-3xl shadow-sm border border-border/50 p-6">
          <h2 className="font-serif text-xl font-semibold text-foreground mb-1">
            Sign in to organise
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Enter your email and we'll send you a sign-in link — no password needed.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-foreground/80 pl-1">
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            {error && (
              <p className="text-sm text-destructive pl-1">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full font-serif text-base"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? "Sending..." : "Send me a sign-in link"}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Already helping someone?{" "}
          <a href="/" className="underline underline-offset-2 hover:text-foreground transition-colors">
            Find a support page
          </a>
        </p>
      </div>
    </div>
  );
}
