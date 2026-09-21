import type { SlotResponse } from "@workspace/api-client-react";
import { Button } from "./ui/button";
import { CarFront, CheckCircle2, Clock, ClipboardList, Users, Utensils } from "lucide-react";
import { liftWaitTileLine, asLiftWaitMode } from "@/lib/liftWaitMode";
import { taskLabel, taskWhenCard } from "@workspace/task-copy";
import { motion } from "framer-motion";

interface SlotCardProps {
  slot: SlotResponse;
  onClaim: (slot: SlotResponse) => void;
  index: number;
}

// Icons stay here — they are a rally concern. The NAMES come from
// @workspace/task-copy, which api-server imports too (row #136).
const SLOT_ICONS: Record<string, string> = {
  meal: "🍲",
  school_pickup: "🚗",
  child_care: "👶",
  errand: "🧺",
  dog_walking: "🐕",
  shopping: "🛒",
  visit: "☕",
  other: "💛",
};

const slotIcon = (type: string) => SLOT_ICONS[type] ?? SLOT_ICONS.other;

export function SlotCard({ slot, onClaim, index }: SlotCardProps) {
  const icon = slotIcon(slot.slotType);
  const label = taskLabel(slot.slotType, slot.customLabel);
  // Meal detail a helper needs before cooking (bug #006). Meal-only; null on
  // everything else, so the pills simply don't render.
  const hasMealDetail =
    slot.slotType === "meal" && (!!slot.headcount || !!slot.dietaryNotes);

  // Bug #033 — does the helper wait? THIS is the line that fixes the bug:
  // without it a helper sees a lift and a time and nothing about whether the
  // afternoon is gone, and only finds out after they've already claimed.
  //
  // Rendered ONLY when answered. Null is the common case — every non-lift task,
  // and any lift nobody has answered — and renders nothing at all: no pill, no
  // gap. A dated "pick up a prescription" errand looks exactly as it did.
  const waitMode = asLiftWaitMode(slot.liftWaitMode);

  const detailPills = waitMode || hasMealDetail ? (
    <div className="mb-4 flex flex-wrap gap-2">
      {waitMode && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/70 px-3 py-1 text-xs font-medium text-foreground/80">
          <CarFront className="w-3.5 h-3.5" />
          {liftWaitTileLine(waitMode, !!slot.slotTime)}
        </span>
      )}
      {hasMealDetail && !!slot.headcount && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/70 px-3 py-1 text-xs font-medium text-foreground/80">
          <Users className="w-3.5 h-3.5" />
          Feeds {slot.headcount}
        </span>
      )}
      {hasMealDetail && slot.dietaryNotes && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/70 px-3 py-1 text-xs font-medium text-foreground/80">
          <Utensils className="w-3.5 h-3.5" />
          {slot.dietaryNotes}
        </span>
      )}
    </div>
  ) : null;
  // Row #139 — the ONE when, in its card form: "Tuesday 22 September · 3:00pm",
  // the year added only when it isn't this year. A slot with no date is a
  // flexible offer and reads "Whenever suits"; a DATED slot with no time reads
  // "Any time that day" (row #143), which replaces "Time to be confirmed" —
  // those words promised a confirmation nobody was going to send.
  const when = taskWhenCard(slot.slotDate ?? null, slot.slotTime ?? null);

  if (slot.isClaimed) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        className="group relative flex flex-col rounded-3xl bg-secondary/50 border border-secondary/80 p-5 transition-all overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-4 opacity-20 transform translate-x-4 -translate-y-4">
          <CheckCircle2 className="w-24 h-24 text-primary" />
        </div>
        
        <div className="flex items-center gap-3 mb-4 opacity-70">
          <span className="flex items-center justify-center w-12 h-12 rounded-2xl bg-background shadow-sm text-2xl saturate-50">
            {icon}
          </span>
          <div>
            <h3 className="font-serif font-semibold text-foreground text-lg">
              {label}
            </h3>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {when}
            </p>
          </div>
        </div>
        
        {detailPills}

        <div className="mt-auto pt-4 border-t border-border/50">
          <p className="text-sm font-medium text-primary flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Claimed by {slot.claimedByName || "a friend"}
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="flex flex-col rounded-3xl bg-card border-2 border-transparent shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.08)] hover:border-primary/10 p-5 transition-all duration-300"
    >
      <div className="flex items-center gap-3 mb-4">
        <span className="flex items-center justify-center w-12 h-12 rounded-2xl bg-secondary/80 text-2xl">
          {icon}
        </span>
        <div>
          <h3 className="font-serif font-semibold text-foreground text-lg">
            {label}
          </h3>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {when}
          </p>
        </div>
      </div>
      
      {detailPills}

      {slot.notes && (
        <div className="mb-6 rounded-2xl bg-primary/5 border border-primary/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary/70 flex items-center gap-1.5 mb-2">
            <ClipboardList className="w-3.5 h-3.5" />
            Task instructions
          </p>
          <p className="text-sm text-foreground/80 leading-relaxed">
            {slot.notes}
          </p>
        </div>
      )}

      <div className="mt-auto">
        <Button 
          variant="accent" 
          className="w-full font-serif font-medium text-lg"
          onClick={() => onClaim(slot)}
        >
          I can help with this
        </Button>
      </div>
    </motion.div>
  );
}
