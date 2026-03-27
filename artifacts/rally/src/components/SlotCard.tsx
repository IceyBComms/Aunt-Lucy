import { SlotResponse } from "@workspace/api-client-react/src/generated/api.schemas";
import { Button } from "./ui/button";
import { format, parseISO } from "date-fns";
import { CheckCircle2, Clock } from "lucide-react";
import { motion } from "framer-motion";

interface SlotCardProps {
  slot: SlotResponse;
  onClaim: (slot: SlotResponse) => void;
  index: number;
}

const getSlotDetails = (type: string) => {
  const map: Record<string, { icon: string; label: string }> = {
    meal: { icon: "🍲", label: "Meal" },
    school_pickup: { icon: "🚗", label: "School Pickup" },
    errand: { icon: "🧺", label: "Errand" },
    dog_walking: { icon: "🐕", label: "Dog Walking" },
    shopping: { icon: "🛒", label: "Shopping" },
    visit: { icon: "☕", label: "Visit" },
    other: { icon: "💛", label: "Other" },
  };
  return map[type] || map.other;
};

export function SlotCard({ slot, onClaim, index }: SlotCardProps) {
  const details = getSlotDetails(slot.slotType);
  const dateObj = parseISO(slot.slotDate);
  const formattedDate = format(dateObj, "EEEE, MMMM d");
  
  let formattedTime = "";
  if (slot.slotTime) {
    // Basic formatting for time "18:00" -> "6:00 PM"
    const [hours, minutes] = slot.slotTime.split(":");
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    formattedTime = `${h12}:${minutes} ${ampm}`;
  }

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
            {details.icon}
          </span>
          <div>
            <h3 className="font-serif font-semibold text-foreground text-lg">
              {slot.customLabel || details.label}
            </h3>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {formattedDate} {formattedTime && `• ${formattedTime}`}
            </p>
          </div>
        </div>
        
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
          {details.icon}
        </span>
        <div>
          <h3 className="font-serif font-semibold text-foreground text-lg">
            {slot.customLabel || details.label}
          </h3>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {formattedDate} {formattedTime && `• ${formattedTime}`}
          </p>
        </div>
      </div>
      
      {slot.notes && (
        <div className="mb-6 p-4 rounded-2xl bg-secondary/30 text-sm text-foreground/80 leading-relaxed">
          {slot.notes}
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
