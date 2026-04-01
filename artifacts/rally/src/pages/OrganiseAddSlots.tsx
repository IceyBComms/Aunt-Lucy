import { useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  Plus,
  Trash2,
  ArrowLeft,
  Clock,
  ClipboardList,
  ShieldCheck,
  UserPlus,
  X,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { format, addDays, parseISO } from "date-fns";

const SLOT_TYPES = [
  { value: "meal", icon: "🍲", label: "Meal", trusted: false },
  { value: "school_pickup", icon: "🚗", label: "School Pickup", trusted: true },
  { value: "child_care", icon: "👶", label: "Child Care", trusted: true },
  { value: "errand", icon: "🧺", label: "Errand", trusted: false },
  { value: "dog_walking", icon: "🐕", label: "Dog Walking", trusted: false },
  { value: "shopping", icon: "🛒", label: "Shopping", trusted: false },
  { value: "visit", icon: "☕", label: "Visit", trusted: false },
  { value: "other", icon: "💛", label: "Other", trusted: false },
];

const SENSITIVE_TYPES = new Set(["school_pickup", "child_care"]);

interface TrustedHelper {
  id: string;
  name: string;
  mobile: string;
}

interface SlotDraft {
  id: string;
  slotType: string;
  customLabel: string;
  slotDate: string;
  slotTime: string;
  notes: string;
  repeatDays: number;
  trustedHelpersOnly: boolean;
  trustedHelpers: TrustedHelper[];
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
    trustedHelpersOnly: false,
    trustedHelpers: [],
  };
}

function TrustedHelperInput({
  onAdd,
}: {
  onAdd: (h: TrustedHelper) => void;
}) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");

  function handleAdd() {
    const n = name.trim();
    const m = mobile.trim();
    if (!n || !m) return;
    onAdd({ id: crypto.randomUUID(), name: n, mobile: m });
    setName("");
    setMobile("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Input
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          placeholder="+61412 345 678"
          type="tel"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
      </div>
      <button
        type="button"
        onClick={handleAdd}
        disabled={!name.trim() || !mobile.trim()}
        className="flex items-center justify-center gap-1.5 py-2 px-3 text-sm text-primary border border-primary/30 rounded-xl hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <UserPlus className="w-3.5 h-3.5" />
        Add helper
      </button>
    </div>
  );
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
  const isSensitiveType = SENSITIVE_TYPES.has(slot.slotType);
  const isTrusted = isSensitiveType || slot.trustedHelpersOnly;

  function addHelper(h: TrustedHelper) {
    onChange({ ...slot, trustedHelpers: [...slot.trustedHelpers, h] });
  }

  function removeHelper(id: string) {
    onChange({
      ...slot,
      trustedHelpers: slot.trustedHelpers.filter((h) => h.id !== id),
    });
  }

  return (
    <div
      className={`rounded-3xl border-2 shadow-sm p-5 space-y-4 ${
        isTrusted
          ? "border-amber-200 bg-amber-50/50"
          : "bg-card border-border/50"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{sel.icon}</span>
          {isTrusted && (
            <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
              <ShieldCheck className="w-3 h-3" />
              Trusted helpers only
            </span>
          )}
        </div>
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
              onClick={() =>
                onChange({
                  ...slot,
                  slotType: t.value,
                  trustedHelpersOnly: SENSITIVE_TYPES.has(t.value)
                    ? true
                    : slot.trustedHelpersOnly,
                })
              }
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors text-left ${
                slot.slotType === t.value
                  ? "border-primary bg-primary/5 text-foreground font-medium"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
              {t.trusted && <ShieldCheck className="w-3 h-3 ml-auto text-amber-600 flex-shrink-0" />}
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

      {/* Trusted helpers toggle (non-sensitive types only) */}
      {!isSensitiveType && (
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={slot.trustedHelpersOnly}
            onChange={(e) =>
              onChange({ ...slot, trustedHelpersOnly: e.target.checked })
            }
            className="mt-0.5 accent-primary"
          />
          <div>
            <p className="text-sm font-medium text-foreground">
              Trusted helpers only
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Only people you personally invite can claim this slot.
            </p>
          </div>
        </label>
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
          placeholder={
            isTrusted
              ? "e.g. School is at 123 Oak St. Kids are Jack (6) and Emma (4)."
              : "e.g. Vegetarian household — no meat please."
          }
          rows={2}
          value={slot.notes}
          onChange={(e) => onChange({ ...slot, notes: e.target.value })}
        />
        <p className="text-xs text-muted-foreground pl-1">
          {isTrusted
            ? "Only invited helpers will see these instructions."
            : "Helpers will see this when they claim the slot."}
        </p>
      </div>

      {/* Trusted helpers section */}
      {isTrusted && (
        <div className="space-y-3 pt-1">
          <div className="flex items-start gap-2 p-3 bg-amber-100/60 rounded-2xl">
            <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-800 leading-relaxed">
              This slot requires a personal invitation. Add each helper's name and
              mobile number — they'll receive a direct SMS invite when you save.
            </p>
          </div>

          {slot.trustedHelpers.length > 0 && (
            <ul className="space-y-2">
              {slot.trustedHelpers.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center gap-3 bg-white rounded-xl px-3 py-2 border border-amber-200"
                >
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                    {h.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {h.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{h.mobile}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeHelper(h.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <TrustedHelperInput onAdd={addHelper} />

          {isTrusted && slot.trustedHelpers.length === 0 && (
            <p className="text-xs text-amber-700 text-center">
              Add at least one trusted helper to proceed.
            </p>
          )}
        </div>
      )}

      {/* Repeat */}
      <div className="space-y-1.5">
        <Label className="text-foreground/80 pl-1 text-sm">
          Repeat for consecutive days
        </Label>
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

  // Validate: trusted slots must have at least one helper
  const hasTrustedWithNoHelpers = slots.some(
    (s) =>
      (SENSITIVE_TYPES.has(s.slotType) || s.trustedHelpersOnly) &&
      s.trustedHelpers.length === 0,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (hasTrustedWithNoHelpers) {
      setError(
        "Please add at least one trusted helper for each invitation-only slot.",
      );
      return;
    }
    setError(null);
    setIsLoading(true);

    try {
      for (const slot of slots) {
        const isTrusted =
          SENSITIVE_TYPES.has(slot.slotType) || slot.trustedHelpersOnly;

        for (let i = 0; i < slot.repeatDays; i++) {
          const date = format(addDays(parseISO(slot.slotDate), i), "yyyy-MM-dd");

          const created = await apiFetch<{ id: string }>(
            `/organiser/pages/${pageId}/slots`,
            {
              method: "POST",
              body: JSON.stringify({
                slotType: slot.slotType,
                customLabel: slot.customLabel || null,
                slotDate: date,
                slotTime: slot.slotTime || null,
                notes: slot.notes || null,
                trustedHelpersOnly: isTrusted,
              }),
              token: token!,
            },
          );

          // Send invites for each trusted helper
          if (isTrusted && slot.trustedHelpers.length > 0) {
            for (const helper of slot.trustedHelpers) {
              await apiFetch(
                `/organiser/pages/${pageId}/slots/${created.id}/invites`,
                {
                  method: "POST",
                  body: JSON.stringify({
                    name: helper.name,
                    mobile: helper.mobile,
                  }),
                  token: token!,
                },
              );
            }
          }
        }
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
          <p className="text-sm font-semibold uppercase tracking-wide text-primary mb-2">
            Step 2 of 3
          </p>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
            Add help slots
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Each slot is one task a helper can claim. School pickups and child
            care require a personal invitation for safety.
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
              {isLoading ? "Saving & sending invites…" : "Continue — publish page →"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
