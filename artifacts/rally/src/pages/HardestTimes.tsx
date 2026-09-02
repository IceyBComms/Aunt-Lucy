import { useState } from "react";
import { useLocation } from "wouter";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TeacupMark } from "@/components/TeacupMark";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

/**
 * The free self-serve crisis entry (Item 14). Name + email + what's happened →
 * a page is created and the person is dropped straight into the existing setup
 * flow (or emailed a sign-in link if their address already has an account).
 *
 * Copy is Kate's approved crisis wording — the most delicate in the product.
 * Written in the organiser's own voice, because that's who's usually typing:
 * often a sister or best mate setting it up for someone.
 */

// Keys are sent to the API (which maps them onto the occasion vocabulary);
// labels are what the person reads.
const OCCASIONS: { key: string; label: string }[] = [
  { key: "bereavement", label: "We've lost someone" },
  { key: "illness_injury", label: "Someone's seriously ill or injured" },
  { key: "other_hardship", label: "Something else has hit us hard" },
];

type CreateResponse =
  | { mode: "session"; sessionToken: string; pageId: string; slug: string }
  | { mode: "magic_link"; email: string };

export default function HardestTimes() {
  const [, setLocation] = useLocation();
  const { signIn } = useAuth();

  const [occasion, setOccasion] = useState<string | null>(null);
  /**
   * Bug #070 — WHO IS THIS FOR?
   *
   * The form never asked, then interleaved two people's details: one "name"
   * field doing double duty (labelled "Who is this for?", hedged with "it can
   * be your own"), YOUR email, and THEIR contact. Whoever was filling it in had
   * to hold both roles in their head and guess which person each row meant.
   *
   * Ported from BuyDetails, deliberately NOT re-invented: same `forSelf`
   * boolean, same two-button fork, same for-self name read-back before the
   * name is committed. Two patterns for one question is how a product ends up
   * asking it two different ways.
   */
  const [forSelf, setForSelf] = useState(false);
  // Kept separate rather than one shared field. A remembered "your name" value
  // landing in the recipient row is exactly the stale-autofill fault of #056.
  const [recipientName, setRecipientName] = useState("");
  const [selfName, setSelfName] = useState("");
  /**
   * The setup person's own first name (#074, migration 0014).
   *
   * REQUIRED, not optional — Kate's 22 August ruling is that the who-set-it-up
   * line ALWAYS shows, and without a name it degrades to "Someone set this page
   * up for you", which on a bereavement page reads as eerie rather than
   * reassuring. The name is what makes the sentence comforting.
   *
   * Only asked on the someone-else branch: setting a page up for yourself, the
   * name above already IS your name.
   */
  const [organiserFirstName, setOrganiserFirstName] = useState("");
  const [email, setEmail] = useState("");
  // For-self only: the one name field becomes the page's name too, so we pause
  // once to read it back. Any edit, or flipping the fork, drops back to unread.
  const [confirmingSelf, setConfirmingSelf] = useState(false);
  // Section E — the affected person's own contact, so they can always get into
  // their own page. Entirely optional; the ready toggle only appears once a
  // contact is entered. Nothing is stored unless they're marked ready.
  const [recipientContact, setRecipientContact] = useState("");
  const [recipientReady, setRecipientReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailedTo, setEmailedTo] = useState<string | null>(null);

  // One value reaches the API either way — the fork only decides which field
  // the person was actually answering.
  const name = forSelf ? selfName : recipientName;

  function chooseFork(value: boolean) {
    setForSelf(value);
    setConfirmingSelf(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!occasion) {
      setError("Please choose what's happened.");
      return;
    }
    if (!name.trim()) {
      setError(forSelf ? "Please add your name." : "Please add their name.");
      return;
    }
    if (!forSelf && !organiserFirstName.trim()) {
      setError("Please add your first name — it's how we introduce you on the page.");
      return;
    }

    // On the for-self path this name becomes the page's name and the word every
    // helper reads, so pause once to read it back before anything is created.
    if (forSelf && !confirmingSelf) {
      setConfirmingSelf(true);
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiFetch<CreateResponse>("/crisis/pages", {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          occasion,
          // Only meaningful when someone else is the subject. Setting up your
          // own page, you ARE the affected person — asking for "their contact"
          // when you just gave your email is the muddle #070 is about.
          forSelf,
          // For-self, the one name field IS the setup person's name.
          organiserName: (forSelf ? selfName : organiserFirstName).trim() || undefined,
          recipientContact: forSelf ? undefined : recipientContact.trim() || undefined,
          recipientReady: !forSelf && recipientContact.trim() ? recipientReady : false,
        }),
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
  // sign-in link rather than handing over a session.
  if (emailedTo) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <MailCheck className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-serif text-2xl font-bold text-foreground mb-3">
            Check your email.
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            You've used Aunt Lucy before, so we've sent a sign-in link to{" "}
            <strong className="text-foreground">{emailedTo}</strong> — that's
            what keeps your pages safe. Click it and you'll land right back here,
            ready to go.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-4">
            Nothing after a couple of minutes? Check your spam folder, or come
            back and try again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <TeacupMark className="w-16 h-16 mb-5" />
          <h1 className="font-serif text-3xl font-bold text-foreground mb-3 text-center">
            Some news knocks the wind out of you.
          </h1>
          <p className="text-muted-foreground text-center leading-relaxed">
            Aunt Lucy is free for times like this — no card, no catch. Tell her
            what's happened, and in a couple of minutes you'll have one page
            where your people can actually help.
          </p>
        </div>

        <div className="bg-card rounded-3xl shadow-sm border border-border/50 p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
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

            {/* Bug #070 — the fork, ported from BuyDetails.tsx verbatim in shape:
                same two buttons, same "Someone else" default, same styling. */}
            <div className="space-y-3">
              <Label className="text-foreground/80 pl-1">Who is this for?</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: false, label: "Someone else" },
                  { value: true, label: "Myself" },
                ].map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => chooseFork(opt.value)}
                    className={`p-4 rounded-2xl border-2 text-sm font-medium transition-colors ${
                      forSelf === opt.value
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* SOMEONE ELSE — their name and their contact first, then you.
                The person the page is FOR leads; the person filling the form in
                is the supporting detail, not the subject. */}
            {!forSelf && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="recipientName" className="text-foreground/80 pl-1">
                    Their name
                  </Label>
                  <Input
                    id="recipientName"
                    placeholder="e.g. Val"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    // Someone else's name. A remembered value of your own
                    // landing here is the #056 fault.
                    autoComplete="off"
                    required
                  />
                  <p className="text-xs text-muted-foreground pl-1">
                    First name is plenty.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="recipientContact" className="text-foreground/80 pl-1">
                    {recipientName.trim() ? `${recipientName.trim()}'s` : "Their"} own contact{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="recipientContact"
                    placeholder="Their mobile or email"
                    value={recipientContact}
                    onChange={(e) => setRecipientContact(e.target.value)}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground pl-1">
                    So they can always get into their own page, if they want to. It's
                    their page — this just makes sure they can find it.
                  </p>
                  {recipientContact.trim() && (
                    <label className="mt-2 flex items-start gap-2.5 pl-1 text-sm text-foreground/80">
                      <input
                        type="checkbox"
                        checked={recipientReady}
                        onChange={(e) => setRecipientReady(e.target.checked)}
                        className="mt-0.5 accent-primary"
                      />
                      <span>
                        {recipientName.trim() || "They"} {recipientName.trim() ? "is" : "are"} ready
                        to know about this page now — send them their own link. Leave
                        this unticked and we'll hold off until you say so.
                      </span>
                    </label>
                  )}
                </div>
              </>
            )}

            {/* MYSELF — your name is the page's name, so it is asked once and
                read back below before anything is created. No "their contact"
                row: you are them, and you are about to give your email. */}
            {forSelf && (
              <div className="space-y-1.5">
                <Label htmlFor="selfName" className="text-foreground/80 pl-1">
                  Your name
                </Label>
                <Input
                  id="selfName"
                  placeholder="e.g. Val"
                  value={selfName}
                  onChange={(e) => {
                    setSelfName(e.target.value);
                    setConfirmingSelf(false);
                  }}
                  required
                />
                <p className="text-xs text-muted-foreground pl-1">
                  First name is plenty — it's what your helpers will see.
                </p>
              </div>
            )}

            {!forSelf && (
              <div className="space-y-1.5">
                <Label htmlFor="organiserFirstName" className="text-foreground/80 pl-1">
                  Your first name
                </Label>
                <Input
                  id="organiserFirstName"
                  placeholder="e.g. Ellen"
                  value={organiserFirstName}
                  onChange={(e) => setOrganiserFirstName(e.target.value)}
                  autoComplete="given-name"
                  required
                />
                <p className="text-xs text-muted-foreground pl-1">
                  So {recipientName.trim() || "they"} and their helpers know who set this up.
                </p>
              </div>
            )}

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

            {/* The read-back, ported from BuyDetails: the guard against a stray
                or autofilled name sailing through unseen onto a live page. */}
            {forSelf && confirmingSelf && selfName.trim() && (
              <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 space-y-2">
                <p className="text-sm text-foreground leading-relaxed">
                  We'll set the page up for{" "}
                  <strong className="font-semibold">{selfName.trim()}</strong> — that's
                  the name your page and your helpers will use.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingSelf(false);
                    document.getElementById("selfName")?.focus();
                  }}
                  className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                >
                  Change the name
                </button>
              </div>
            )}

            {error && <p className="text-sm text-destructive pl-1">{error}</p>}

            <Button
              type="submit"
              className="w-full font-serif text-base"
              size="lg"
              disabled={isLoading}
            >
              {isLoading
                ? "Setting things up…"
                : forSelf
                  ? confirmingSelf
                    ? "Yes, that's me →"
                    : "Set up my page"
                  : "Set up the page"}
            </Button>
          </form>
        </div>

        {/* Bug #095 — the reason, once. The reader here may BE the person this
            is about, so: one sentence, no emphasis, nothing else. The identical
            line at :184 is deliberately LEFT ALONE — two explanations on one
            page is a page protesting, which reads worse than one. And no ABN or
            entity name on this page at all: that is footer material, not
            something to put beside someone's diagnosis. */}
        <p className="text-center text-xs text-muted-foreground mt-6 leading-relaxed">
          This page is free — always. No card, no upsells, nothing to cancel.
          Times like this are why Aunt Lucy exists. The paid version funds the
          free one, and the free one is why I built it.
        </p>
      </div>
    </div>
  );
}
