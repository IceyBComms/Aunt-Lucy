import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export default function OrganiseCreatePage() {
  const [, setLocation] = useLocation();
  const { token } = useAuth();

  const [form, setForm] = useState({
    recipientName: "",
    situationDescription: "",
    location: "",
    privacy: "open" as "open" | "pin_protected",
    pin: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.privacy === "pin_protected" && !/^\d{4,8}$/.test(form.pin)) {
      setError("Please enter a 4–8 digit PIN.");
      return;
    }

    setIsLoading(true);
    try {
      const page = await apiFetch<{ id: string; slug: string }>("/organiser/pages", {
        method: "POST",
        body: JSON.stringify(form),
        token: token!,
      });
      setLocation(`/organise/create/${page.id}/slots`);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-5 py-10">
        <button
          onClick={() => setLocation("/organise/dashboard")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </button>

        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary mb-2">Step 1 of 3</p>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
            About the support page
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Tell helpers a little about who they're supporting and what's happening.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="recipientName" className="text-foreground/80 pl-1">
              Who needs support?
            </Label>
            <Input
              id="recipientName"
              placeholder="e.g. Sarah"
              value={form.recipientName}
              onChange={(e) => set("recipientName", e.target.value)}
              required
              autoFocus
            />
            <p className="text-xs text-muted-foreground pl-1">First name only is fine — this appears on the public page.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="situationDescription" className="text-foreground/80 pl-1">
              What's the situation?{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="situationDescription"
              placeholder="e.g. Sarah is recovering from surgery and could use some help with meals and the kids for the next few weeks."
              rows={3}
              value={form.situationDescription}
              onChange={(e) => set("situationDescription", e.target.value)}
            />
            <p className="text-xs text-muted-foreground pl-1">This is shown to helpers on the support page. Keep it warm and brief.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="location" className="text-foreground/80 pl-1">
              General location{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="location"
              placeholder="e.g. Fitzroy, Melbourne"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
            />
            <p className="text-xs text-muted-foreground pl-1">Suburb or city only — helps helpers know if they can realistically help.</p>
          </div>

          <div className="space-y-3">
            <Label className="text-foreground/80 pl-1">Page privacy</Label>
            <div className="space-y-2">
              {[
                {
                  value: "open",
                  label: "Open",
                  desc: "Anyone with the link can see the page and claim slots.",
                },
                {
                  value: "pin_protected",
                  label: "PIN protected",
                  desc: "Visitors must enter a PIN before they can see the page.",
                },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-colors ${
                    form.privacy === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="privacy"
                    value={opt.value}
                    checked={form.privacy === opt.value}
                    onChange={() => set("privacy", opt.value)}
                    className="mt-0.5 accent-primary"
                  />
                  <div>
                    <p className="font-medium text-foreground text-sm">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {form.privacy === "pin_protected" && (
            <div className="space-y-1.5">
              <Label htmlFor="pin" className="text-foreground/80 pl-1">PIN</Label>
              <Input
                id="pin"
                type="text"
                inputMode="numeric"
                pattern="\d{4,8}"
                placeholder="e.g. 1234"
                value={form.pin}
                onChange={(e) => set("pin", e.target.value.replace(/\D/g, ""))}
                maxLength={8}
              />
              <p className="text-xs text-muted-foreground pl-1">4–8 digits. Share this with people you want to have access.</p>
            </div>
          )}

          {error && <p className="text-sm text-destructive pl-1">{error}</p>}

          <div className="pt-2">
            <Button
              type="submit"
              size="lg"
              className="w-full font-serif text-base"
              disabled={isLoading}
            >
              {isLoading ? "Creating page..." : "Continue — add help slots →"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
