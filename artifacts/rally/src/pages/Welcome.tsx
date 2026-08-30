import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

/**
 * Bug #074 — the doorway in front of the management screen.
 *
 * The link texted to the affected person dropped them straight onto "Your
 * people": an admin console, with no explanation of what the page was, who made
 * it, or why it existed. This is the crisis-path sibling of the #035 gift
 * opener, worded for someone who did NOT receive a gift and never asked for any
 * of this.
 *
 * ⚠️ NO TASK EXAMPLES IN THE PARAGRAPH, DELIBERATELY. The obvious version of
 * this copy lists "a meal, a lift, the school run" — which is bug #076, live
 * right now on the activation page, naming the school run to someone who has
 * just been bereaved. If examples are ever wanted here they must be
 * occasion-aware. Do not add them "while you're in there".
 *
 * ⚠️ THE HEADING STATES THE ARRANGEMENT, NEVER THE PERSON'S IGNORANCE (Kate's
 * 22 August rule). "Ellen set this page up for you" — never "you may not know
 * about this", which tells someone they have been discussed behind their back.
 */
interface WelcomeInfo {
  setUpByFirstName: string | null;
  recipientFirstName: string | null;
  occasion: string | null;
  isRecipient: boolean;
}

export default function Welcome() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const [info, setInfo] = useState<WelcomeInfo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiFetch<WelcomeInfo>(`/welcome/${token}`)
      .then(setInfo)
      .catch(() => setFailed(true));
  }, [token]);

  // A bad or revoked token, or a network failure: send them to /manage rather
  // than stranding them on a doorway. That screen owns the real error states,
  // and this one must never be the reason somebody can't reach their own page.
  useEffect(() => {
    if (failed) setLocation(`/manage/${token}`);
  }, [failed, token, setLocation]);

  if (!info) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const who = info.setUpByFirstName;

  // The nameless variant exists for organisers created before migration 0014,
  // who have no name on file. It still states the arrangement — it simply can't
  // name the person. "Someone set this page up for you" is deliberately NOT
  // used: an unnamed actor is eerie, which is the opposite of the point.
  const heading = who
    ? `${who} set this page up for you`
    : "This page was set up for you";

  const secondLine = who
    ? `Have a look when you're ready. You can change anything on it, or leave ${who} to keep running it.`
    : "Have a look when you're ready. You can change anything on it, or leave it running as it is.";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-5 py-14">
        <div className="text-center mb-10">
          <img
            src="/brand/aunt-lucy-mark.svg"
            alt=""
            className="w-14 h-14 mx-auto mb-8 opacity-90"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          <h1 className="font-serif text-3xl font-bold text-foreground leading-tight">
            {heading}
          </h1>
        </div>

        <div className="bg-card rounded-3xl shadow-sm border border-border/50 p-6 space-y-5">
          <p className="text-foreground/90 leading-relaxed">
            When people say &ldquo;let me know if I can help&rdquo;, nobody ever knows what
            to say back. This page turns that into something practical: the people around
            you can see what would actually help, and pick something &mdash; without you
            having to ask.
          </p>
          <p className="text-foreground/90 leading-relaxed">{secondLine}</p>

          <div className="pt-1">
            <Button
              size="lg"
              className="w-full font-serif text-base"
              onClick={() => setLocation(`/manage/${token}`)}
            >
              See what&rsquo;s on the page
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
