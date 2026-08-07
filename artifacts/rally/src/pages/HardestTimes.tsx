import { useState } from "react";
import { useLocation } from "wouter";
import { Heart, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

/**
 * The free self-serve crisis entry (Item 14). Name + email + what's happened →
 * a page is created and the person is dropped straight into the existing setup
 * flow (or emailed a sign-in link if their address already has an account).
 *
 * NB: every user-facing string below is PLACEHOLDER copy pending Kate's crisis
 * copy pass — the most delicate wording in the product. Marked [KATE-COPY].
 */

// Keys are sent to the API (which maps them onto the occasion vocabulary);
// labels are what the person reads. [KATE-COPY] — labels pending approval.
const OCCASIONS: { key: string; label: string }[] = [
  { key: "bereavement", label: "Someone has died" },
  { key: "illness_injury", label: "A sudden illness or injury" },
  { key: "other_hardship", label: "Another hard time that arrived without warning" },
];

type CreateResponse =
  | { mode: "session"; sessionToken: string; pageId: string; slug: string }
  | { mode: "magic_link"; email: string };

export default function HardestTimes() {
  const [, setLocation] = useLocation();
  const { signIn } = useAuth();

  const [occasion, setOccasion] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailedTo, setEmailedTo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!occasion) {
      setError("Please choose what's happened."); // [KATE-COPY]
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiFetch<CreateResponse>("/crisis/pages", {
        method: "POST",
        body: JSON.stringify({ name, email, occasion }),
      });

      if (res.mode === "session") {
        // Frictionless: sign in and drop straight into the setup flow.
        signIn(res.sessionToken);
        setLocation(`/organise/create/${res.pageId}/slots`);
      } else {
        // Safe fallback: the email already has an account — we've sent a link.
        setEmailedTo(res.email);
      }
    } catch (err: any) {
      setError(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  // Fallback confirmation — the address already had an account, so we emailed a
  // sign-in link rather than handing over a session. [KATE-COPY]
  if (emailedTo) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <MailCheck className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-serif text-2xl font-bold text-foreground mb-3">
            Check your email
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Your address already has an Aunt Lucy account, so we've sent a
            sign-in link to <strong className="text-foreground">{emailedTo}</strong>.
            Open it and your page will be waiting.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-5">
            <Heart className="w-8 h-8 text-primary fill-primary/20" />
          </div>
          {/* [KATE-COPY] heading + intro line */}
          <h1 className="font-serif text-3xl font-bold text-foreground mb-3 text-center">
            The hardest times are free. Always.
          </h1>
          <p className="text-muted-foreground text-center leading-relaxed">
            A loss, a sudden illness, a crisis that arrived without warning —
            Aunt Lucy is free for these, for as long as you need. No card, no
            catch, no proof asked.
          </p>
        </div>

        <div className="bg-card rounded-3xl shadow-sm border border-border/50 p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Occasion — [KATE-COPY] labels */}
            <div className="space-y-3">
              <Label className="text-foreground/80 pl-1">
                What's happened?
              </Label>
              <div className="space-y-2">
                {OCCASIONS.map((opt) => (
                  <label
                    key={opt.key}
                    className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-colors ${
                      occasion === opt.key
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-primary/30"
                    }`}
                  >
                    <input
                      type="radio"
                      name="occasion"
                      value={opt.key}
                      checked={occasion === opt.key}
                      onChange={() => setOccasion(opt.key)}
                      className="mt-0.5 accent-primary"
                    />
                    <span className="text-sm text-foreground">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-foreground/80 pl-1">
                Who is this for?
              </Label>
              <Input
                id="name"
                placeholder="A first name is fine — it can be your own"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-foreground/80 pl-1">
                Your email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground pl-1">
                So you can get back to the page. No password needed.
              </p>
            </div>

            {error && <p className="text-sm text-destructive pl-1">{error}</p>}

            <Button
              type="submit"
              className="w-full font-serif text-base"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? "Setting things up…" : "Set up Aunt Lucy — free"}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Free, always, for the hardest times. {/* [KATE-COPY] */}
        </p>
      </div>
    </div>
  );
}
