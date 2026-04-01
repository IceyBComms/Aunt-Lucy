import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Heart, CheckCircle2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";

const ORG_TYPE_OPTIONS = [
  { value: "healthcare", label: "Healthcare or hospital" },
  { value: "school", label: "School or early childhood" },
  { value: "community", label: "Community or welfare organisation" },
  { value: "faith", label: "Faith community or church" },
  { value: "social_work", label: "Social work or counselling" },
  { value: "other", label: "Other" },
];

interface FormState {
  fullName: string;
  role: string;
  email: string;
  phone: string;
  orgName: string;
  orgType: string;
  usageDescription: string;
  hearAboutUs: string;
}

const empty: FormState = {
  fullName: "",
  role: "",
  email: "",
  phone: "",
  orgName: "",
  orgType: "",
  usageDescription: "",
  hearAboutUs: "",
};

export default function PilotApply() {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function update(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((f) => ({ ...f, [field]: e.target.value }));
      setErrors([]);
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    setIsSubmitting(true);

    try {
      await apiFetch("/pilot", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setSubmitted(true);
    } catch (err: any) {
      if (err.errors && Array.isArray(err.errors)) {
        setErrors(err.errors);
      } else {
        setErrors([err.message ?? "Something went wrong. Please try again."]);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.45 }}
          className="w-full max-w-sm text-center"
        >
          <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-primary" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-3">
            Application received
          </h1>
          <p className="text-muted-foreground leading-relaxed mb-8">
            Thank you for your interest in the Aunt Lucy pilot. We'll be in
            touch shortly to talk through how it could work for your
            organisation.
          </p>
          <Button variant="outline" onClick={() => setLocation("/")}>
            Back to home
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Nav */}
      <nav className="w-full px-6 py-5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-2.5 group"
          >
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
              <Heart className="w-5 h-5 text-primary fill-primary/20" />
            </div>
            <span className="font-serif font-bold text-foreground text-lg group-hover:text-primary transition-colors">
              Aunt Lucy
            </span>
          </button>
        </div>
      </nav>

      {/* Form */}
      <div className="flex-1 flex flex-col items-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-2xl"
        >
          {/* Header */}
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-primary uppercase tracking-wide mb-0.5">
                Pilot programme
              </p>
              <h1 className="font-serif text-3xl font-bold text-foreground leading-tight">
                Apply to join the pilot
              </h1>
            </div>
          </div>
          <p className="text-muted-foreground leading-relaxed mb-10 pl-16">
            We're working with a small group of organisations during our pilot.
            Tell us a bit about yourself and we'll follow up to find a time to
            talk.
          </p>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Your details */}
            <section className="bg-card border border-border/50 rounded-3xl p-6 space-y-5">
              <h2 className="font-serif text-lg font-semibold text-foreground">
                Your details
              </h2>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    value={form.fullName}
                    onChange={update("fullName")}
                    placeholder="Jane Smith"
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="role">Role / job title</Label>
                  <Input
                    id="role"
                    value={form.role}
                    onChange={update("role")}
                    placeholder="e.g. Social worker, Nurse unit manager"
                    required
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={update("email")}
                    placeholder="jane@example.org.au"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">
                    Phone{" "}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={update("phone")}
                    placeholder="+61 4xx xxx xxx"
                  />
                </div>
              </div>
            </section>

            {/* Organisation */}
            <section className="bg-card border border-border/50 rounded-3xl p-6 space-y-5">
              <h2 className="font-serif text-lg font-semibold text-foreground">
                Your organisation
              </h2>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="orgName">Organisation name</Label>
                  <Input
                    id="orgName"
                    value={form.orgName}
                    onChange={update("orgName")}
                    placeholder="e.g. Mercy Health"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="orgType">Organisation type</Label>
                  <select
                    id="orgType"
                    value={form.orgType}
                    onChange={update("orgType")}
                    required
                    className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring transition-colors"
                  >
                    <option value="" disabled>
                      Select one…
                    </option>
                    {ORG_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="usageDescription">
                  How do you expect to use Aunt Lucy?
                </Label>
                <textarea
                  id="usageDescription"
                  value={form.usageDescription}
                  onChange={update("usageDescription")}
                  required
                  rows={4}
                  placeholder="e.g. We work with families of patients in our palliative care ward. We often need to coordinate meals and transport for family members who live far from the hospital…"
                  className="flex w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring transition-colors resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="hearAboutUs">
                  How did you hear about Aunt Lucy?{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="hearAboutUs"
                  value={form.hearAboutUs}
                  onChange={update("hearAboutUs")}
                  placeholder="e.g. A colleague mentioned it, LinkedIn, etc."
                />
              </div>
            </section>

            {/* Errors */}
            {errors.length > 0 && (
              <ul className="space-y-1 pl-1">
                {errors.map((e) => (
                  <li key={e} className="text-sm text-destructive">
                    {e}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center pt-2">
              <Button
                type="submit"
                size="lg"
                variant="accent"
                className="font-serif text-base px-8"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Submitting…" : "Submit application"}
              </Button>
              <p className="text-sm text-muted-foreground">
                We'll follow up within a few days.
              </p>
            </div>
          </form>
        </motion.div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/50 py-6 px-6 mt-12">
        <div className="max-w-2xl mx-auto text-sm text-muted-foreground text-center">
          © {new Date().getFullYear()} Aunt Lucy · auntlucy.com.au
        </div>
      </footer>
    </div>
  );
}
