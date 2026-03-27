import { useState } from "react";
import { useRoute } from "wouter";
import { useSupportPageFlow } from "@/hooks/use-rally";
import { SlotCard } from "@/components/SlotCard";
import { ClaimDialog } from "@/components/ClaimDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Heart, MapPin, ShieldAlert, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import type { SlotResponse, ClaimSlotRequest } from "@workspace/api-client-react/src/generated/api.schemas";

export default function SupportPage() {
  const [, params] = useRoute("/s/:slug");
  const slug = params?.slug || "";
  
  const { data: page, isLoading, isError, needsPin, submitPin, claimSlot, isClaiming } = useSupportPageFlow(slug);

  const [pinInput, setPinInput] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<SlotResponse | null>(null);

  const handleClaimSubmit = async (formData: ClaimSlotRequest) => {
    if (!selectedSlot || !page) return;
    const success = await claimSlot(selectedSlot.id, formData, page.recipientName);
    if (success) {
      setSelectedSlot(null);
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
          <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mx-auto mb-6 text-primary">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-foreground mb-3">Protected Page</h1>
          <p className="text-muted-foreground mb-8">
            This support page requires a PIN to view. Please enter it below.
          </p>
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (pinInput.trim()) submitPin(pinInput.trim());
            }}
            className="space-y-4"
          >
            <Input 
              type="password" 
              placeholder="Enter PIN" 
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="text-center text-2xl tracking-widest py-4 h-auto"
              maxLength={8}
            />
            <Button type="submit" size="lg" className="w-full text-lg">
              View Page
            </Button>
          </form>
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
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-serif font-bold tracking-tight mb-4">
              Support for {page.recipientName}
            </h1>
            
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
        {page.slots.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-3xl border border-border border-dashed">
            <Heart className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-xl font-serif font-medium text-foreground">No slots added yet.</h3>
            <p className="text-muted-foreground mt-2">Check back later for ways to help.</p>
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
        Powered by <span className="font-serif font-bold text-foreground">Rally</span>
      </footer>

      {/* Modals */}
      <ClaimDialog 
        slot={selectedSlot}
        isOpen={!!selectedSlot}
        onClose={() => setSelectedSlot(null)}
        onSubmit={handleClaimSubmit}
        isSubmitting={isClaiming}
      />
    </div>
  );
}
