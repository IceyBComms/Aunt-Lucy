import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Building2, LogOut, ArrowLeft, Phone, Mail, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";

const ORG_TYPE_LABELS: Record<string, string> = {
  healthcare: "Healthcare / hospital",
  school: "School or early childhood",
  community: "Community or welfare org",
  faith: "Faith community",
  social_work: "Social work / counselling",
  other: "Other",
};

interface PilotApplication {
  id: string;
  fullName: string;
  role: string;
  email: string;
  phone: string | null;
  orgName: string;
  orgType: string;
  usageDescription: string;
  hearAboutUs: string | null;
  createdAt: string;
}

export default function OrganisePilotApplications() {
  const [, setLocation] = useLocation();
  const { token, organiser, isLoading: authLoading, signOut } = useAuth();
  const [applications, setApplications] = useState<PilotApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!organiser) {
      setLocation("/organise");
      return;
    }
    apiFetch<PilotApplication[]>("/organiser/pilot-applications", { token: token! })
      .then(setApplications)
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-white px-5 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-serif text-2xl font-bold">Pilot applications</h1>
              <p className="text-white/70 text-sm mt-1">
                {applications.length} {applications.length === 1 ? "application" : "applications"}
              </p>
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

      <div className="max-w-2xl mx-auto px-5 py-8">
        <button
          onClick={() => setLocation("/organise/dashboard")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </button>

        {applications.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-7 h-7 text-primary" />
            </div>
            <p className="text-muted-foreground">No applications yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              They'll appear here once someone submits the pilot form.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {applications.map((app, i) => {
              const isOpen = expanded === app.id;
              const date = new Date(app.createdAt).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              });

              return (
                <motion.div
                  key={app.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.04 }}
                  className="bg-card border border-border/50 rounded-3xl shadow-sm overflow-hidden"
                >
                  {/* Summary row */}
                  <button
                    className="w-full text-left p-5 hover:bg-muted/20 transition-colors"
                    onClick={() => setExpanded(isOpen ? null : app.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">{app.fullName}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {app.role} · {app.orgName}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/8 text-primary">
                          {ORG_TYPE_LABELS[app.orgType] ?? app.orgType}
                        </span>
                        <p className="text-xs text-muted-foreground mt-1.5">{date}</p>
                      </div>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="border-t border-border/50 px-5 pb-5 pt-4 space-y-4">
                      <div className="flex flex-wrap gap-3">
                        <a
                          href={`mailto:${app.email}`}
                          className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                        >
                          <Mail className="w-4 h-4" />
                          {app.email}
                        </a>
                        {app.phone && (
                          <a
                            href={`tel:${app.phone}`}
                            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                          >
                            <Phone className="w-4 h-4" />
                            {app.phone}
                          </a>
                        )}
                        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          {date}
                        </span>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                          How they plan to use Aunt Lucy
                        </p>
                        <p className="text-sm text-foreground leading-relaxed bg-muted/30 rounded-xl px-4 py-3">
                          {app.usageDescription}
                        </p>
                      </div>

                      {app.hearAboutUs && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                            How they heard about us
                          </p>
                          <p className="text-sm text-muted-foreground">{app.hearAboutUs}</p>
                        </div>
                      )}

                      <div className="pt-1">
                        <Button
                          size="sm"
                          variant="accent"
                          className="font-serif"
                          onClick={() => {
                            window.location.href = `mailto:${app.email}?subject=Aunt Lucy pilot — following up&body=Hi ${app.fullName.split(" ")[0]},`;
                          }}
                        >
                          Reply by email
                        </Button>
                      </div>
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
