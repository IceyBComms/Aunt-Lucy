import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { SiteFooter } from "@/components/SiteFooter";

export default function OrganiseCheckEmail() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Mail className="w-10 h-10 text-primary" />
          </div>

          <h1 className="font-serif text-2xl font-bold text-foreground mb-3">
            Check your inbox
          </h1>
          <p className="text-muted-foreground leading-relaxed mb-2">
            We've sent you a sign-in link. Click it and you'll be taken straight to your account.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-8">
            The link expires in one hour. If you don't see it, check your spam folder.
          </p>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => setLocation("/organise")}
          >
            Back to sign in
          </Button>
        </div>
      </div>
      <SiteFooter compact />
    </div>
  );
}
