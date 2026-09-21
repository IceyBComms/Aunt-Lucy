import { useEffect, useRef, useState } from "react";
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
import {
  PARTIAL_TIME_MESSAGE,
  findPartialTimeInput,
  isPartialTime,
} from "@/lib/partialTime";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import {
  SLOT_TYPES as TASK_SLOT_TYPES,
  taskLabel,
} from "@workspace/task-copy";
import { useAuth } from "@/contexts/AuthContext";
import { format, addDays, parseISO } from "date-fns";
import {
  LIFT_WAIT_MODES,
  LIFT_WAIT_MODE_LABELS,
  LIFT_WAIT_MODE_HINTS,
  isLiftCandidate,
  type LiftWaitMode,
} from "@/lib/liftWaitMode";
import { SiteFooter } from "@/components/SiteFooter";
import { SETUP_PUBLISH_COPY } from "@/lib/setupPublishCopy";

// The icons and the trusted-by-default flag stay here — the icons are a rally
// concern and the flag is the access model's, not the copy's. The NAMES come
// from @workspace/task-copy, which api-server imports too (row #136).
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

/** Always trusted-only: it means handing someone your children. */
const ALWAYS_TRUSTED = new Set(["school_pickup", "child_care"]);

export const SLOT_TYPES = TASK_SLOT_TYPES.map((value) => ({
  value,
  icon: SLOT_ICONS[value],
  label: taskLabel(value),
  trusted: ALWAYS_TRUSTED.has(value),
}));

const SENSITIVE_TYPES = new Set(["school_pickup", "child_care"]);

/** A task already saved on the server — shown on resume, not re-posted. */
interface SavedSlot {
  id: string;
  slotType: string;
  customLabel: string | null;
  slotDate: string | null;
  slotTime: string | null;
  trustedHelpersOnly: boolean;
  isClaimed: boolean;
}

interface TrustedHelper {
  id: string;
  name: string;
  contact: string;
}

interface SlotDraft {
  // NOTE: liftWaitMode lives below with the other per-task fields.
  id: string;
  slotType: string;
  customLabel: string;
  slotDate: string;
  slotTime: string;
  notes: string;
  // Meal-only detail (bug #006). Kept as strings for the inputs; sent only when
  // the slot is a meal, coerced server-side.
  dietaryNotes: string;
  headcount: string;
  /**
   * Bug #033 — for a lift, whether the helper waits. "" means unanswered.
   *
   * REQUIRED before submit on this path only (see the guard below): this is the
   * setup person or page runner, who knows the details. On the recipient's own
   * activation screen the same question is strongly prompted but never blocks,
   * because someone whose hospital hasn't given them a time yet must still be
   * able to make their page live.
   */
  liftWaitMode: LiftWaitMode | "";
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
    // Bug #082 — EMPTY, not 6pm. The field is labelled "(optional)" and used to
    // arrive holding a time nobody chose, so a helper could read a task and turn
    // up at 6pm because the page said 6pm. A form that states a value and calls
    // it optional is contradicting itself in the same breath.
    //
    // ⚠️ THIS DOES NOT WEAKEN #033. A lift still REQUIRES a time on this path —
    // the liftMissingTime guard below refuses to submit without one. Optional
    // means the person chooses, not that the product stops asking.
    slotTime: "",
    notes: "",
    dietaryNotes: "",
    headcount: "",
    liftWaitMode: "",
    repeatDays: 1,
    trustedHelpersOnly: false,
    trustedHelpers: [],
  };
}

/**
 * Bug #084 — is this draft finished enough to be a REAL task on someone's page?
 *
 * Deliberately the SAME rules the Continue guards enforce, because a task
 * autosaved on looser rules would be a task the server rejects, or worse one it
 * accepts in a state the organiser never intended. If these two ever disagree,
 * autosave becomes a second definition of "valid" and the looser one wins.
 */
function isDraftComplete(slot: SlotDraft): boolean {
  if (!slot.slotDate) return false;
  const isTrusted = SENSITIVE_TYPES.has(slot.slotType) || slot.trustedHelpersOnly;
  // An invitation-only task with nobody invited is not a task, it is a hole.
  if (isTrusted && slot.trustedHelpers.length === 0) return false;
  // Bug #033 — a lift needs both halves before it can go out on this path.
  if (isLiftCandidate(slot.slotType, true)) {
    if (!slot.liftWaitMode) return false;
    if (!slot.slotTime) return false;
  }
  return true;
}

/**
 * Has anyone actually touched this draft? (bug #084)
 *
 * A pristine `emptySlot()` — meal, today, 6pm — passes every completeness rule
 * above, so without this an untouched form would autosave a task nobody asked
 * for the moment the screen loaded. That is #078's fault arriving by a new
 * route: a real slot on a real page that no human chose.
 *
 * Pressing Continue still saves an untouched default, because that IS a
 * deliberate choice. Autosave only ever acts on something someone edited.
 */
function isDraftTouched(slot: SlotDraft): boolean {
  const pristine = emptySlot();
  return (
    slot.slotType !== pristine.slotType ||
    slot.customLabel.trim() !== "" ||
    slot.slotDate !== pristine.slotDate ||
    slot.slotTime !== pristine.slotTime ||
    slot.notes.trim() !== "" ||
    slot.dietaryNotes.trim() !== "" ||
    slot.headcount.trim() !== "" ||
    slot.liftWaitMode !== "" ||
    slot.repeatDays !== pristine.repeatDays ||
    slot.trustedHelpersOnly !== pristine.trustedHelpersOnly ||
    slot.trustedHelpers.length > 0
  );
}

/**
 * Where a card is: on screen only, being written, or on the server. ONE field,
 * never two flags that could disagree about whether a task exists.
 */
type CardState = "draft" | "saving" | "saved";

type Card =
  | { id: string; state: "draft" | "saving"; draft: SlotDraft }
  | { id: string; state: "saved"; draft: SlotDraft; rows: SavedSlot[] };

function draftCard(draft: SlotDraft): Card {
  return { id: draft.id, state: "draft", draft };
}

/**
 * THE 00:30 GUARD (14 Sep 2026). Is any field in this card showing something
 * the browser could not turn into a value?
 *
 * Kate's "Errand — Mon 14 Sep · 00:30" was not coerced by this code — nothing
 * here or on the server rewrites a time. It was the browser, and it was
 * reproduced in Chromium on Kate's own machine: a 12-hour <input type="time">
 * reports NOTHING (value "", badInput true, no input event) while any segment
 * is blank, but the instant every segment holds anything it reports a complete,
 * valid "HH:MM" — with no way to tell a half-typed segment from a finished one.
 * With AM/PM already set, typing the hour "12" then the minute "3" fires
 * "00:03", and the "0" fires "00:30". The old autosave read "the value parses"
 * as "they have finished", waited 1.2s, saved it and removed the card.
 *
 * Saving on LEAVE fixes the timing: by the time focus goes elsewhere, what the
 * field shows is what they meant. This fixes the rest — a field left genuinely
 * partial ("12:30 --") still reports badInput, and a card like that is not
 * saved at all. The partial time is discarded, never guessed at: the card stays
 * a draft, and Continue's native form validation stops on the same field.
 */
function hasPartialInput(card: HTMLElement): boolean {
  return Array.from(card.querySelectorAll("input")).some((i) => i.validity?.badInput);
}

function TrustedHelperInput({
  onAdd,
}: {
  onAdd: (h: TrustedHelper) => void;
}) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");

  function handleAdd() {
    const n = name.trim();
    const c = contact.trim();
    if (!n || !c) return;
    onAdd({ id: crypto.randomUUID(), name: n, contact: c });
    setName("");
    setContact("");
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
          placeholder="Mobile or email"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
      </div>
      <button
        type="button"
        onClick={handleAdd}
        disabled={!name.trim() || !contact.trim()}
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
  status,
  onChange,
  onRemove,
  onLeave,
  timePartial,
  onTimePartial,
  showRemove,
}: {
  slot: SlotDraft;
  status: CardState;
  onChange: (updated: SlotDraft) => void;
  onRemove: () => void;
  /** Focus has left this card's subtree — see the onBlur below. */
  onLeave: (card: HTMLElement) => void;
  /** Row #144 — is THIS card's time box currently half-typed? */
  timePartial: boolean;
  /** Row #144 — the card reporting its own time box's state upwards. */
  onTimePartial: (partial: boolean) => void;
  showRemove: boolean;
}) {
  const sel = SLOT_TYPES.find((t) => t.value === slot.slotType) ?? SLOT_TYPES[0];
  const isSensitiveType = SENSITIVE_TYPES.has(slot.slotType);
  const isTrusted = isSensitiveType || slot.trustedHelpersOnly;
  const isMeal = slot.slotType === "meal";
  const isSchoolPickup = slot.slotType === "school_pickup";
  // Organiser slots are ALWAYS dated (the date input is required), so every
  // errand on this path is a lift. Same rule as the server and the recipient's
  // activation screen — one definition of a lift, in one place.
  const isLift = isLiftCandidate(slot.slotType, true);

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
      data-testid="slot-card"
      data-card-state={status}
      /*
        14 Sep 2026 — THE CARD SAVES WHEN YOU LEAVE IT, NOT WHEN IT PARSES.

        `relatedTarget` is where focus is going. If that is still inside this
        card — Date to Time, a type button to the notes — the person has not
        left, so nothing happens. Only focus leaving the subtree counts.

        tabIndex -1 is what makes that reliable: Safari does not focus a button
        on click, so without a focusable card a tap on "Meal" would report focus
        going nowhere and read as leaving. With it, the tap lands on the card.

        The final decision waits one tick, until focus has actually LANDED.
        Mid-blur, the document is between elements and cannot say where focus
        is going (jsdom even reports hasFocus() false there). After it lands:
        focus back inside the card is not leaving, and a window that has lost
        focus altogether — they switched apps to check a calendar — is not
        leaving either, and must not commit a half-typed time. Focus returns to
        the same field when they come back.
      */
      tabIndex={-1}
      onBlur={(e) => {
        const card = e.currentTarget;
        if (card.contains(e.relatedTarget as Node | null)) return;
        setTimeout(() => {
          if (!document.hasFocus()) return;
          if (card.contains(document.activeElement)) return;
          onLeave(card);
        }, 0);
      }}
      className={`rounded-3xl border-2 shadow-sm p-5 space-y-4 focus:outline-none ${
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
          {/* The quiet saved indicator. It stays for as long as the card does,
              because it is also the reason the fields below are locked. */}
          {status === "saved" && (
            <span data-testid="card-saved" className="text-xs text-primary/80">
              Saved
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

      {/*
        Locked once saving starts. A saved card stays where it is, but editing
        it would be editing a copy nobody writes back — #084's silent loss by a
        new route — so its fields are disabled rather than quietly ignored. The
        bin above still removes it from the page.
      */}
      <fieldset disabled={status !== "draft"} className="space-y-4 min-w-0 border-0 p-0 m-0">
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
                  // Bug #082 — the school-pickup nudge is GONE, not ported. It
                  // existed to correct a bad default (6pm on a school pickup) by
                  // replacing it with a better guess. With no default there is
                  // nothing to correct, and guessing 3pm here would just be the
                  // same bug wearing a friendlier number: a time nobody chose,
                  // on a field that says optional.
                  slotTime: slot.slotTime,
                  // Bug #033 — drop the wait answer if this stops being a lift,
                  // so switching errand → meal can never carry a stale
                  // "wait and bring them home" onto a lasagne.
                  liftWaitMode: t.value === "errand" ? slot.liftWaitMode : "",
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
            {isSchoolPickup ? "Pickup time" : "Time"}{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            type="time"
            value={slot.slotTime}
            /* Row #144. A change means the browser parsed something, so the box
               is no longer half-typed. A box BECOMING half-typed fires no
               change event at all, which is why blur and the Continue guard
               both read validity instead of value. */
            onChange={(e) => {
              onChange({ ...slot, slotTime: e.target.value });
              onTimePartial(false);
            }}
            onBlur={(e) => onTimePartial(isPartialTime(e.currentTarget))}
            aria-invalid={timePartial || undefined}
          />
          {/* Row #144 — beside the box. This is also what the person sees when
              the card quietly did not autosave, which used to be silent: focus
              left, hasPartialInput said no, and nothing happened or was said. */}
          {timePartial && (
            <p
              data-testid="slot-time-help"
              className="pl-1 text-xs leading-snug text-destructive"
            >
              {PARTIAL_TIME_MESSAGE}
            </p>
          )}
        </div>
      </div>

      {isSchoolPickup && (
        <p className="-mt-2 text-xs text-muted-foreground pl-1">
          Set the pickup time so your helper knows exactly when to be there.
        </p>
      )}

      {/* The wait-or-not control (bug #033). Organiser slots are always dated,
          so every errand here is a lift. REQUIRED on this path — the submit
          guard below refuses without it — because this is the person who knows
          the details. Functional labels by design; they live in one copy module
          so a review reword costs one line. */}
      {isLift && (
        <div className="space-y-1.5">
          <Label className="text-foreground/80 pl-1 text-sm">
            Does the helper wait?{" "}
            <span className="font-normal text-muted-foreground">(required)</span>
          </Label>
          <div className="grid gap-2">
            {LIFT_WAIT_MODES.map((mode) => {
              const active = slot.liftWaitMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ ...slot, liftWaitMode: mode })}
                  className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors ${
                    active
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <span
                    className={`text-sm ${active ? "text-foreground font-medium" : "text-muted-foreground"}`}
                  >
                    {LIFT_WAIT_MODE_LABELS[mode]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {LIFT_WAIT_MODE_HINTS[mode]}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="pl-1 text-xs text-muted-foreground">
            Helpers see this before they claim — it's the difference between a
            short trip and half a day.
          </p>
        </div>
      )}

      {/* Meal detail (bug #006) — headcount + dietary needs, both encouraged,
          neither required. Only shown for meals. */}
      {isMeal && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-foreground/80 pl-1 text-sm">
              Feeding how many?{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              type="number"
              min={1}
              max={100}
              inputMode="numeric"
              placeholder="e.g. 4"
              value={slot.headcount}
              onChange={(e) => onChange({ ...slot, headcount: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-foreground/80 pl-1 text-sm">
              Dietary needs{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              placeholder="e.g. no nuts, vego"
              value={slot.dietaryNotes}
              onChange={(e) => onChange({ ...slot, dietaryNotes: e.target.value })}
            />
          </div>
        </div>
      )}

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
              mobile number or email — they'll get a personal invitation once the page is live.
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
                    <p className="text-xs text-muted-foreground">{h.contact}</p>
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
      </fieldset>
    </div>
  );
}

export default function OrganiseAddSlots() {
  const { pageId } = useParams<{ pageId: string }>();
  const [, setLocation] = useLocation();
  const { token } = useAuth();

  /**
   * Bug #071 — RESUMING A DRAFT.
   *
   * This screen used to start at `[emptySlot()]` unconditionally and never ask
   * the server what was already saved. That made re-opening a draft actively
   * dangerous rather than merely missing: every task the person had already
   * added was invisible, and pressing Continue POSTed the form again, silently
   * duplicating the lot. So the fix is not "add a link back" — it is this.
   *
   * Tasks already on the server are shown as saved, and are removed by deleting
   * them rather than by editing a copy that would never be written back. The
   * form below only ever creates NEW ones. Nothing the person typed earlier can
   * be silently ignored, because nothing here pretends to edit it.
   */
  const [savedSlots, setSavedSlots] = useState<SavedSlot[]>([]);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [cards, setCards] = useState<Card[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ status: string; slots: SavedSlot[] }>(`/organiser/pages/${pageId}`, {
      token: token!,
    })
      .then((page) => {
        if (cancelled) return;
        setSavedSlots(page.slots);
        // A fresh page opens on one blank task, exactly as before. A resumed
        // one opens on what is already there, with no blank task demanding to
        // be filled in — someone coming back to a half-finished page is being
        // shown their work, not handed a form.
        setCards(page.slots.length > 0 ? [] : [draftCard(emptySlot())]);
      })
      .catch(() => {
        // Never strand them on a spinner: fall back to the original behaviour.
        if (!cancelled) setCards([draftCard(emptySlot())]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPage(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pageId, token]);

  /**
   * Bug #084, REWORKED 14 Sep 2026 — AUTOSAVE, AND HOW IT CANNOT DOUBLE-CREATE.
   *
   * #084 saved a draft ~1.2s after its fields parsed and then MOVED it out of
   * the form. Kate reproduced what that does four times: a task committed while
   * she was still typing it ("Errand — Mon 14 Sep · 00:30", see hasPartialInput)
   * and the card she was typing into gone from under her. So:
   *
   *   1. A card saves when focus LEAVES it (SlotForm's onBlur), not on a timer.
   *   2. A saved card STAYS WHERE IT IS, locked, with a quiet "Saved". It
   *      collapses into "Already added" only when the person asks for another
   *      task, or presses Continue.
   *
   * De-duplication is still the shape of the data rather than a guard at
   * submit. Each card has ONE `state` — draft, saving or saved — and a save
   * changes it in place, so a card can never be both a draft and on the server.
   * And there is ONE creation routine, `saveCard`, which autosave and Continue
   * both go through: it hands back a write already in flight rather than
   * starting another, and does nothing for a card the server already holds.
   * #071 existed because leaving and returning re-POSTed everything; a second
   * creation path is exactly how that comes back.
   *
   * `persisted` is written synchronously, at the moment a write succeeds.
   * Continue checks it after awaiting in-flight saves, when React may not have
   * re-rendered yet — reading `cards` at that point would be reading the past,
   * and writing a task twice.
   */
  const inFlight = useRef<Map<string, Promise<void>>>(new Map());
  const persisted = useRef<Set<string>>(new Set());
  /** Mirrors `cards`, for the leave handler, which runs a tick after its render. */
  const cardsRef = useRef<Card[]>([]);
  cardsRef.current = cards;
  /** Cards the person asked to collapse while their save was still in flight. */
  const collapseWhenSaved = useRef<Set<string>>(new Set());
  /**
   * Row #144 — the card whose time box is half-typed, or null.
   *
   * ONE at a time, deliberately: the guard stops at the first, focuses it and
   * says so, so there is only ever one card being asked about. A set would let
   * three cards shout at once about a form the person can only fix one field of.
   */
  const [partialTimeCardId, setPartialTimeCardId] = useState<string | null>(null);
  /** The form element, so the Continue guard can find the offending box in it. */
  const formRef = useRef<HTMLFormElement>(null);

  const isResuming = savedSlots.length > 0;

  async function removeSavedSlot(id: string) {
    const previous = savedSlots;
    setSavedSlots((s) => s.filter((sl) => sl.id !== id));
    try {
      await apiFetch(`/organiser/slots/${id}`, { method: "DELETE", token: token! });
    } catch {
      setSavedSlots(previous);
      setError("That task couldn't be removed. Please try again.");
    }
  }

  function addSlot() {
    // Asking for another task is one of the two moments a saved card
    // collapses. A card still mid-save collapses the moment its save lands.
    const saved = cards.filter(
      (c): c is Extract<Card, { state: "saved" }> => c.state === "saved",
    );
    const savedIds = new Set(saved.map((c) => c.id));
    for (const c of cards) {
      if (c.state === "saving") collapseWhenSaved.current.add(c.id);
    }
    setSavedSlots((cur) => [...cur, ...saved.flatMap((c) => c.rows)]);
    setCards((cur) => [...cur.filter((c) => !savedIds.has(c.id)), draftCard(emptySlot())]);
  }

  function updateSlot(id: string, updated: SlotDraft) {
    setCards((cur) =>
      cur.map((c) => (c.id === id && c.state === "draft" ? { ...c, draft: updated } : c)),
    );
  }

  function removeSlot(id: string) {
    setCards((cur) => cur.filter((c) => c.id !== id));
  }

  /** Take a saved card off the page: every row it became goes with it. */
  async function removeSavedCard(id: string) {
    const index = cards.findIndex((c) => c.id === id);
    const card = cards[index];
    if (!card || card.state !== "saved") return;
    setCards((cur) => cur.filter((c) => c.id !== id));
    const remaining = [...card.rows];
    try {
      while (remaining.length > 0) {
        await apiFetch(`/organiser/slots/${remaining[0].id}`, { method: "DELETE", token: token! });
        remaining.shift();
      }
      persisted.current.delete(id);
    } catch {
      // Put back whatever is still on the server, where it was.
      setCards((cur) => {
        const next = [...cur];
        next.splice(Math.min(index, next.length), 0, { ...card, rows: remaining });
        return next;
      });
      setError("That task couldn't be removed. Please try again.");
    }
  }

  /**
   * Create ONE draft on the server and hand back the rows it became.
   *
   * Only ever called by `saveCard`. A draft with repeatDays > 1 becomes several
   * rows, and all of them are returned, so the saved list reflects what the
   * server actually holds rather than what the form looked like.
   */
  async function persistDraft(slot: SlotDraft): Promise<SavedSlot[]> {
    const isTrusted = SENSITIVE_TYPES.has(slot.slotType) || slot.trustedHelpersOnly;
    const created: SavedSlot[] = [];

    for (let i = 0; i < slot.repeatDays; i++) {
      const date = format(addDays(parseISO(slot.slotDate), i), "yyyy-MM-dd");
      const row = await apiFetch<{ id: string }>(`/organiser/pages/${pageId}/slots`, {
        method: "POST",
        body: JSON.stringify({
          slotType: slot.slotType,
          customLabel: slot.customLabel || null,
          slotDate: date,
          slotTime: slot.slotTime || null,
          liftWaitMode: slot.liftWaitMode || null,
          notes: slot.notes || null,
          trustedHelpersOnly: isTrusted,
          dietaryNotes:
            slot.slotType === "meal" ? slot.dietaryNotes.trim() || null : null,
          headcount:
            slot.slotType === "meal" && slot.headcount.trim()
              ? Number(slot.headcount)
              : null,
        }),
        token: token!,
      });

      if (isTrusted && slot.trustedHelpers.length > 0) {
        for (const helper of slot.trustedHelpers) {
          await apiFetch(`/organiser/pages/${pageId}/slots/${row.id}/invites`, {
            method: "POST",
            body: JSON.stringify({ name: helper.name, contact: helper.contact }),
            token: token!,
          });
        }
      }

      created.push({
        id: row.id,
        slotType: slot.slotType,
        customLabel: slot.customLabel || null,
        slotDate: date,
        slotTime: slot.slotTime || null,
        trustedHelpersOnly: isTrusted,
        isClaimed: false,
      });
    }
    return created;
  }

  /**
   * THE ONE CREATION ROUTINE. Writes a card and marks it saved IN PLACE — the
   * card is not removed, unmounted or moved (that was the #084 behaviour Kate
   * lost a card to). Autosave and Continue both come through here.
   *
   * On failure the card goes back to being an editable draft, still in the
   * list Continue walks, and the error is re-thrown for the caller to decide.
   */
  function saveCard(id: string, draft: SlotDraft): Promise<void> {
    if (persisted.current.has(id)) return Promise.resolve();
    const pending = inFlight.current.get(id);
    if (pending) return pending;

    setCards((cur) =>
      cur.map<Card>((c) => (c.id === id && c.state === "draft" ? { ...c, state: "saving" } : c)),
    );

    const job = persistDraft(draft)
      .then(
        (rows) => {
          persisted.current.add(id);
          if (collapseWhenSaved.current.delete(id)) {
            setCards((cur) => cur.filter((c) => c.id !== id));
            setSavedSlots((cur) => [...cur, ...rows]);
            return;
          }
          setCards((cur) =>
            cur.map<Card>((c) => (c.id === id ? { id, state: "saved", draft: c.draft, rows } : c)),
          );
        },
        (err) => {
          collapseWhenSaved.current.delete(id);
          setCards((cur) =>
            cur.map<Card>((c) =>
              c.id === id && c.state === "saving" ? { ...c, state: "draft" } : c,
            ),
          );
          throw err;
        },
      )
      .finally(() => {
        inFlight.current.delete(id);
      });
    inFlight.current.set(id, job);
    return job;
  }

  /**
   * Focus has left a card. Save it if, and only if, it is a draft someone has
   * actually touched, it is complete by the same rules Continue enforces, and
   * nothing in it is half-typed.
   *
   * Silent on FAILURE, on purpose: the card stays a draft and Continue tries
   * again. A failed autosave must never look like a lost task, or interrupt
   * someone mid-form with an error they cannot act on.
   *
   * ⚠️ Row #144 — but NOT silent on a half-typed field any more. That branch
   * used to return with nothing said, so a person who typed a time and left the
   * card saw a card that did not save and was told nothing about why. The card
   * still does not save; it now says which box needs finishing.
   */
  function handleCardLeave(id: string, el: HTMLElement) {
    const card = cardsRef.current.find((c) => c.id === id);
    if (!card || card.state !== "draft") return;
    if (hasPartialInput(el)) {
      if (findPartialTimeInput(el)) setPartialTimeCardId(id);
      return;
    }
    if (!isDraftTouched(card.draft) || !isDraftComplete(card.draft)) return;
    saveCard(id, card.draft).catch(() => {});
  }

  // Only drafts need checking — a saving or saved card already passed these
  // rules to get there.
  const drafts = cards.filter((c) => c.state === "draft").map((c) => c.draft);

  // Validate: trusted slots must have at least one helper
  const hasTrustedWithNoHelpers = drafts.some(
    (s) =>
      (SENSITIVE_TYPES.has(s.slotType) || s.trustedHelpersOnly) &&
      s.trustedHelpers.length === 0,
  );

  // Bug #033 — a lift needs both halves before it can go out on this path. The
  // server enforces the same two rules (400s without them); this is just the
  // kinder, earlier version of the same refusal.
  const liftMissingWaitMode = drafts.some(
    (s) => isLiftCandidate(s.slotType, true) && !s.liftWaitMode,
  );
  const liftMissingTime = drafts.some(
    (s) => isLiftCandidate(s.slotType, true) && !s.slotTime,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Row #144 — a half-typed time stops Continue before anything is written.
    //
    // The browser's own constraint validation already refuses to submit a form
    // holding a badInput field, so in a real browser this rarely runs — but it
    // is what makes the refusal OURS rather than a generic bubble, and it is
    // the half a test can exercise (validity cannot be typed, only defined).
    const partial = findPartialTimeInput(formRef.current ?? (e.target as ParentNode));
    if (partial) {
      const card = partial.closest<HTMLElement>('[data-testid="slot-card"]');
      const index = card
        ? Array.from(
            (formRef.current ?? document).querySelectorAll('[data-testid="slot-card"]'),
          ).indexOf(card)
        : -1;
      setPartialTimeCardId(index >= 0 && cards[index] ? cards[index].id : null);
      setError(null);
      partial.focus();
      return;
    }
    if (hasTrustedWithNoHelpers) {
      setError(
        "Please add at least one trusted helper for each invitation-only slot.",
      );
      return;
    }
    if (liftMissingWaitMode) {
      setError(
        "For a lift, say whether the helper waits — it's the difference between a short trip and half a day.",
      );
      return;
    }
    if (liftMissingTime) {
      setError("A lift needs a time so the helper knows when to be there.");
      return;
    }
    if (cards.length === 0 && savedSlots.length === 0) {
      setError("Add at least one task before publishing the page.");
      return;
    }
    setError(null);
    setIsLoading(true);

    try {
      // Every card on screen, through the one creation routine. A card whose
      // autosave is still writing is awaited, not written again (the #071
      // duplicate by the autosave route); one whose autosave FAILED is tried
      // again here; one already on the server is a no-op inside saveCard.
      for (const card of cards) {
        if (card.state === "saved") continue;
        const pending = inFlight.current.get(card.id);
        if (pending) {
          try {
            await pending;
            continue;
          } catch {
            // Its autosave failed. Fall through and try it once more.
          }
        }
        await saveCard(card.id, card.draft);
      }

      setLocation(`/organise/create/${pageId}/publish`);
    } catch (err: any) {
      setError(err.message ?? "Failed to save slots. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoadingPage) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="max-w-lg mx-auto px-5 py-10">
        <button
          onClick={() => setLocation("/organise/dashboard")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </button>

        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary mb-2">
            Step 2 of 3
          </p>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
            {isResuming ? "Pick up where you left off" : "Add help slots"}
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            {isResuming
              ? "Nothing has been sent yet. Here's what you'd already added — add more if you'd like, or carry on to publish."
              : "Each slot is one task a helper can claim. School runs and child care require a personal invitation for safety."}
          </p>
          {/*
            Bug #084 — say it once, plainly. Someone who has just lost a task by
            leaving will not risk it again on faith, and the "Saved" marks only
            appear AFTER the first one saves. This is the line that makes the
            first departure survivable.
          */}
          <p className="mt-2 text-sm text-muted-foreground/90">
            Each task saves itself as you finish it, so you can leave and come
            back whenever you need to.
          </p>
        </div>

        {isResuming && (
          <div className="mb-6 space-y-2">
            <p className="text-sm font-semibold text-foreground/80 pl-1">
              Already added
            </p>
            {savedSlots.map((slot) => {
              const meta =
                SLOT_TYPES.find((t) => t.value === slot.slotType) ??
                SLOT_TYPES[SLOT_TYPES.length - 1];
              return (
                <div
                  key={slot.id}
                  className="flex items-center gap-3 bg-secondary/40 border border-border/50 rounded-2xl px-4 py-3"
                >
                  <span className="text-lg shrink-0" aria-hidden="true">
                    {meta.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {slot.customLabel || meta.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {slot.slotDate
                        ? format(parseISO(slot.slotDate), "EEE d MMM")
                        : "Whenever suits"}
                      {slot.slotTime ? ` · ${slot.slotTime}` : ""}
                      {slot.trustedHelpersOnly ? " · invitation only" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSavedSlot(slot.id)}
                    aria-label={`Remove ${slot.customLabel || meta.label}`}
                    className="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          {cards.map((card) => (
            <SlotForm
              key={card.id}
              slot={card.draft}
              status={card.state}
              onChange={(updated) => updateSlot(card.id, updated)}
              onRemove={() =>
                card.state === "saved" ? removeSavedCard(card.id) : removeSlot(card.id)
              }
              onLeave={(el) => handleCardLeave(card.id, el)}
              timePartial={partialTimeCardId === card.id}
              onTimePartial={(partial) =>
                setPartialTimeCardId((cur) =>
                  partial ? card.id : cur === card.id ? null : cur,
                )
              }
              // A saved card can always be taken off the page; a draft only when
              // it is not the last one; a card mid-save not at all.
              showRemove={
                card.state === "saved" || (card.state === "draft" && cards.length > 1)
              }
            />
          ))}

          <button
            type="button"
            onClick={addSlot}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            {isResuming && cards.length === 0 ? "Add another task" : "Add another slot"}
          </button>

          {error && <p className="text-sm text-destructive pl-1">{error}</p>}

          <div className="pt-2">
            <Button
              type="submit"
              size="lg"
              className="w-full font-serif text-base"
              disabled={isLoading || (cards.length === 0 && savedSlots.length === 0)}
            >
              {/* Step 3 no longer publishes on arrival, so this button no longer
                  says it does. And nothing is sent from step 2 any more —
                  invitations are held until publish (#113) — so the busy
                  state just says "Saving…" (Kate, 14 Sep). */}
              {isLoading ? "Saving…" : SETUP_PUBLISH_COPY.step2Continue}
            </Button>
          </div>
        </form>
      </div>
      <SiteFooter compact />
    </div>
  );
}
