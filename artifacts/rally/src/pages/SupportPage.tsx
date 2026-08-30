import { useState } from "react";
import { useRoute } from "wouter";
import { useSupportPageFlow } from "@/hooks/use-rally";
import { SlotCard } from "@/components/SlotCard";
import { ClaimDialog } from "@/components/ClaimDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Heart, MapPin, Loader2, Clock } from "lucide-react";
import { motion } from "framer-motion";
import type { SlotResponse, ClaimSlotRequest } from "@workspace/api-client-react";

export default function SupportPage() {
  const [, params] = useRoute("/s/:slug");
  const slug = params?.slug || "";
  
  const { data: page, isLoading, isError, notLiveYet, needsPin, submitPin, claimSlot, isClaiming } = useSupportPageFlow(slug);

  const [pinInput, setPinInput] = useState("");
  const [pinSubmitted, setPinSubmitted] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotResponse | null>(null);
  // The claim response once a claim succeeds — carries calendarUrl. Keeps the
  // dialog open on a confirmation view (with the "Add to your calendar" link)
  // instead of closing straight away, matching the trusted-invite path.
  const [claimedResult, setClaimedResult] = useState<SlotResponse | null>(null);

  const closeClaimDialog = () => {
    setSelectedSlot(null);
    setClaimedResult(null);
  };

  const handleClaimSubmit = async (formData: ClaimSlotRequest) => {
    if (!selectedSlot || !page) return;
    const result = await claimSlot(selectedSlot.id, formData);
    if (result) {
      // Keep the dialog open, swapped to the confirmation view so the helper
      // gets the "Add to your calendar" link — the whole point of this change.
      setClaimedResult(result);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground font-serif text-lg">Loading page...</p>
      </div>
    );
  }

  if (needsPin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-card rounded-3xl p-8 shadow-xl border border-border/50 text-center"
        >
          {/*
            Bug #072 — this screen used to read "Protected Page — This support
            page requires a PIN to view. Please enter it below.": system-shaped
            language on a page about someone's worst week, and for some helpers
            the FIRST Aunt Lucy they ever meet. Copy below is Kate's approved
            wording, verbatim.

            NO NAME IS INTERPOLATED, DELIBERATELY. The page is protected, so the
            recipient's name may not be available here — and a blank where a
            name should be reads as a fault, not as discretion.

            THE PICTURE HAD TO AGREE WITH THE WORDS (Kate, 30 Aug; see PATTERN
            P6). This first shipped as copy-only, leaving a shield-and-alarm
            icon sitting above "Just checking it's you" — a security motif
            framing a friend arriving to help as a threat to be screened, and
            arguing with every word beneath it. The teacup replaces it: for some
            helpers this screen is the first Aunt Lucy they ever meet, so the
            mark is doing useful work rather than merely being harmless.
          */}
          <img
            src="/brand/aunt-lucy-mark.svg"
            alt=""
            className="w-14 h-14 mx-auto mb-6"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          <h1 className="text-3xl font-serif font-bold text-foreground mb-3">
            Just checking it&rsquo;s you
          </h1>
          <p className="text-muted-foreground mb-8 leading-relaxed">
            This page is kept private, so it needs a short code. Whoever sent you the
            link will have it.
          </p>
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (pinInput.trim()) {
                setPinSubmitted(true);
                submitPin(pinInput.trim());
              }
            }}
            className="space-y-4"
          >
            <Label htmlFor="pin" className="sr-only">
              Your code
            </Label>
            <Input
              id="pin"
              type="password"
              placeholder="Your code"
              aria-label="Your code"
              value={pinInput}
              onChange={(e) => { setPinInput(e.target.value); setPinSubmitted(false); }}
              className={`text-center text-2xl tracking-widest py-4 h-auto${pinSubmitted && isError ? " border-destructive focus-visible:ring-destructive/20" : ""}`}
              maxLength={8}
            />
            {pinSubmitted && isError && (
              <p className="text-sm text-destructive text-center">
                That PIN isn't right. Please check with the person who shared this link.
              </p>
            )}
            <Button type="submit" size="lg" className="w-full text-lg font-serif">
              Open the page
            </Button>
          </form>
        </motion.div>
      </div>
    );
  }

  // A page that exists but hasn't been switched on yet. This is checked before
  // the generic branch below so the visitor is told to hang on to their link
  // rather than that the page doesn't exist. Only a 404 carrying the server's
  // own "isn't available yet" message gets here — see isNotLiveYetError in
  // use-rally.ts — so a guessed slug still falls through to the generic text.
  if (notLiveYet) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md text-center"
        >
          <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mx-auto mb-6 text-primary">
            <Clock className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-foreground mb-4">Not live yet</h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            The page is still being set up. Hang on to this link — it'll work as soon as it's switched on.
          </p>
        </motion.div>
      </div>
    );
  }

  if (isError || !page) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md text-center"
        >
          <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mx-auto mb-6 text-muted-foreground">
            <Heart className="w-10 h-10 opacity-50" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-foreground mb-4">Page not found</h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            This page doesn't exist or has been removed. If someone shared a link with you, please double-check it.
          </p>
        </motion.div>
      </div>
    );
  }

  const openSlots = page.slots.filter(s => !s.isClaimed);
  const claimedSlots = page.slots.filter(s => s.isClaimed);
  const allClaimed = page.slots.length > 0 && openSlots.length === 0;

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      {/* Header / Hero Section */}
      <div className="bg-primary text-primary-foreground py-16 px-6 sm:px-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
        <div className="max-w-3xl mx-auto relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <h1 className="text-primary-foreground text-4xl sm:text-5xl md:text-6xl font-serif font-bold tracking-tight mb-4">
              Support for {page.recipientName}
            </h1>

            <p className="text-primary-foreground/90 text-lg sm:text-xl leading-relaxed mb-6 max-w-2xl">
              Someone set this up because {page.recipientName}'s got a lot on
              right now — pick anything that suits, whenever suits. No pressure.
            </p>

            {page.location && (
              <p className="flex items-center gap-2 text-primary-foreground/80 text-lg mb-6">
                <MapPin className="w-5 h-5" />
                {page.location}
              </p>
            )}
            
            {page.situationDescription && (
              <div className="bg-primary-foreground/10 rounded-3xl p-6 sm:p-8 backdrop-blur-sm border border-primary-foreground/20">
                <p className="text-lg sm:text-xl leading-relaxed font-medium">
                  "{page.situationDescription}"
                </p>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-12">
        {/* Ambient presence (Item 7): the warmth of "people are helping" without
            naming anyone. Count is distinct people, deduped server-side. */}
        {page.helpingCount > 0 && (
          <div className="mb-8 flex items-center justify-center gap-2 rounded-full bg-primary/5 border border-primary/10 px-5 py-3 text-center">
            <Heart className="w-4 h-4 text-primary flex-none" />
            <p className="text-sm sm:text-base text-foreground/80 font-medium">
              {page.helpingCount === 1
                ? "1 person is helping out"
                : `${page.helpingCount} people are helping out`}
              {" "}💛
            </p>
          </div>
        )}

        {/* A "good to know" note from the recipient, shown to every helper.
            Plain text — React escapes it; never rendered as raw HTML. */}
        {page.goodToKnow && (
          <div className="mb-10 rounded-3xl bg-secondary/60 border border-secondary-border p-6 sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary/70 mb-2">
              Good to know
            </p>
            <p className="text-foreground/80 text-base sm:text-lg leading-relaxed">
              {page.goodToKnow}
            </p>
          </div>
        )}

        {page.slots.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-3xl border border-border border-dashed">
            <Heart className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-xl font-serif font-medium text-foreground">
              {page.recipientName}'s all sorted for the time being — thanks for checking in.
            </h3>
            <p className="text-muted-foreground mt-2">Do pop back soon.</p>
          </div>
        ) : allClaimed ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16 px-6 bg-secondary rounded-3xl border border-secondary-border mb-12"
          >
            <div className="text-5xl mb-6">💛</div>
            <h2 className="text-2xl font-serif font-bold text-foreground mb-3">
              Everything is covered
            </h2>
            <p className="text-muted-foreground text-lg">
              What an incredible community. All current needs have been met.
            </p>
          </motion.div>
        ) : (
          <div className="mb-16">
            <h2 className="text-2xl font-serif font-bold text-foreground mb-6 px-2">
              Ways to help right now
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {openSlots.map((slot, i) => (
                <SlotCard 
                  key={slot.id} 
                  slot={slot} 
                  onClaim={setSelectedSlot} 
                  index={i} 
                />
              ))}
            </div>
          </div>
        )}

        {claimedSlots.length > 0 && (
          <div>
            <h2 className="text-xl font-serif font-bold text-muted-foreground mb-6 px-2 flex items-center gap-3">
              Already claimed <span className="text-sm font-sans font-normal bg-secondary px-3 py-1 rounded-full text-foreground/70">{claimedSlots.length}</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {claimedSlots.map((slot, i) => (
                <SlotCard 
                  key={slot.id} 
                  slot={slot} 
                  onClaim={() => {}} 
                  index={i} 
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto py-8 text-center text-muted-foreground text-sm font-medium">
        Powered by <span className="font-serif font-bold text-foreground">Aunt Lucy</span>
      </footer>

      {/* Modals */}
      <ClaimDialog
        slot={selectedSlot}
        recipientName={page.recipientName}
        isOpen={!!selectedSlot}
        onClose={closeClaimDialog}
        onSubmit={handleClaimSubmit}
        isSubmitting={isClaiming}
        claimedResult={claimedResult}
      />
    </div>
  );
}
