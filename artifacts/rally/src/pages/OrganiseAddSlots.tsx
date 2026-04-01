import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { Plus, Trash2, ArrowLeft, Clock, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { format, addDays, parseISO } from "date-fns";

const SLOT_TYPES = [
  { value: "meal", icon: "🍲", label: "Meal" },
  { value: "school_pickup", icon: "🚗", label: "School Pickup" },
  { value: "errand", icon: "🧺", label: "Errand" },
  { value: "dog_walking", icon: "🐕", label: "Dog Walking" },
  { value: "shopping", icon: "🛒", label: "Shopping" },
  { value: "visit", icon: "☕", label: "Visit" },
  { value: "other", icon: "💛", label: "Other" },
];

interface SlotDraft {
  id: string;
  slotType: string;
  customLabel: string;
  slotDate: string;
  slotTime: string;
  notes: string;
  repeatDays: number;
}

function today() {
  return format(new Date(), "yyyy-MM-dd");
}

function emptySlot(): SlotDraft {
  return {
    id: crypto.randomUUID(),
    slotType: "meal",
    customLabel: "",
    slotDate: today(),
    slotTime: "18:00",
    notes: "",
    repeatDays: 1,
  };
}

function SlotForm({
  slot,
  onChange,
  onRemove,
  showRemove,
}: {
  slot: SlotDraft;
  onChange: (updated: SlotDraft) => void;
  onRemove: () => void;
  showRemove: boolean;
}) {
  const sel = SLOT_TYPES.find((t) => t.value === slot.slotType) ?? SLOT_TYPES[0];

  return (
    <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-2xl">{sel.icon}</span>
        {showRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive transition-colors"
            aria-label="Remove slot"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Slot type */}
      <div className="space-y-1.5">
        <Label className="text-foreground/80 pl-1 text-sm">Type of help</Label>
        <div className="grid grid-cols-2 gap-2">
          {SLOT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => onChange({ ...slot, slotType: t.value })}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors text-left ${
                slot.slotType === t.value
                  ? "border-primary bg-primary/5 text-foreground font-medium"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {slot.slotType === "other" && (
        <div className="space-y-1.5">
          <Label className="text-foreground/80 pl-1 text-sm">Custom label</Label>
          <Input
            placeholder="e.g. Childcare, Garden help..."
            value={slot.customLabel}
            onChange={(e) => onChange({ ...slot, customLabel: e.target.value })}
          />
        </div>
      )}

      {/* Date + Time */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-foreground/80 pl-1 text-sm flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Date
          </Label>
          <Input
            type="date"
            value={slot.slotDate}
            min={today()}
            onChange={(e) => onChange({ ...slot, slotDate: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-foreground/80 pl-1 text-sm">
            Time{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            type="time"
            value={slot.slotTime}
            onChange={(e) => onChange({ ...slot, slotTime: e.target.value })}
          />
        </div>
      </div>

      {/* Task instructions */}
      <div className="space-y-1.5">
        <Label className="text-foreground/80 pl-1 text-sm flex items-center gap-1.5">
          <ClipboardList className="w-3.5 h-3.5" /> Task instructions{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          placeholder="e.g. Vegetarian household — no meat please. The key is under the mat."
          rows={2}
          value={slot.notes}
          onChange={(e) => onChange({ ...slot, notes: e.target.value })}
        />
        <p className="text-xs text-muted-foreground pl-1">Helpers will see this when they claim the slot.</p>
      </div>

      {/* Repeat */}
      <div className="space-y-1.5">
        <Label className="text-foreground/80 pl-1 text-sm">Repeat for consecutive days</Label>
        <div className="flex items-center gap-3">
          <Input
            type="number"
            min={1}
            max={14}
            value={slot.repeatDays}
            onChange={(e) =>
              onChange({
                ...slot,
                repeatDays: Math.min(14, Math.max(1, parseInt(e.target.value) || 1)),
              })
            }
            className="w-20"
          />
          <span className="text-sm text-muted-foreground">
            {slot.repeatDays === 1
              ? "day (no repeat)"
              : `days — creates ${slot.repeatDays} slots`}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function OrganiseAddSlots() {
  const { pageId } = useParams<{ pageId: string }>();
  const [, setLocation] = useLocation();
  const { token } = useAuth();

  const [slots, setSlots] = useState<SlotDraft[]>([emptySlot()]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addSlot() {
    setSlots((s) => [...s, emptySlot()]);
  }

  function updateSlot(id: string, updated: SlotDraft) {
    setSlots((s) => s.map((sl) => (sl.id === id ? updated : sl)));
  }

  function removeSlot(id: string) {
    setSlots((s) => s.filter((sl) => sl.id !== id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Expand repeated slots
      const expanded: Omit<SlotDraft, "id" | "repeatDays">[] = [];
      for (const slot of slots) {
        for (let i = 0; i < slot.repeatDays; i++) {
          const date = format(addDays(parseISO(slot.slotDate), i), "yyyy-MM-dd");
          expanded.push({
            slotType: slot.slotType,
            customLabel: slot.customLabel,
            slotDate: date,
            slotTime: slot.slotTime,
            notes: slot.notes,
          });
        }
      }

      for (const slot of expanded) {
        await apiFetch(`/organiser/pages/${pageId}/slots`, {
          method: "POST",
          body: JSON.stringify({
            slotType: slot.slotType,
            customLabel: slot.customLabel || null,
            slotDate: slot.slotDate,
            slotTime: slot.slotTime || null,
            notes: slot.notes || null,
          }),
          token: token!,
        });
      }

      setLocation(`/organise/create/${pageId}/publish`);
    } catch (err: any) {
      setError(err.message ?? "Failed to save slots. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-5 py-10">
        <button
          onClick={() => setLocation("/organise/create")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to page details
        </button>

        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary mb-2">Step 2 of 3</p>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
            Add help slots
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Each slot is one task a helper can claim. Add as many as you need.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {slots.map((slot) => (
            <SlotForm
              key={slot.id}
              slot={slot}
              onChange={(updated) => updateSlot(slot.id, updated)}
              onRemove={() => removeSlot(slot.id)}
              showRemove={slots.length > 1}
            />
          ))}

          <button
            type="button"
            onClick={addSlot}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            Add another slot
          </button>

          {error && <p className="text-sm text-destructive pl-1">{error}</p>}

          <div className="pt-2">
            <Button
              type="submit"
              size="lg"
              className="w-full font-serif text-base"
              disabled={isLoading || slots.length === 0}
            >
              {isLoading ? "Saving slots..." : "Continue — publish page →"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
