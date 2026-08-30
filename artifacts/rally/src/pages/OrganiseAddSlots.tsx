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
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { format, addDays, parseISO } from "date-fns";
import {
  LIFT_WAIT_MODES,
  LIFT_WAIT_MODE_LABELS,
  LIFT_WAIT_MODE_HINTS,
  isLiftCandidate,
  type LiftWaitMode,
} from "@/lib/liftWaitMode";

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

/** How long a draft must sit unchanged before it saves itself. */
const AUTOSAVE_IDLE_MS = 1200;

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
            onChange={(e) => onChange({ ...slot, slotTime: e.target.value })}
          />
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
              mobile number or email — they'll receive a direct invite when you save.
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
  const [slots, setSlots] = useState<SlotDraft[]>([]);
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
        setSlots(page.slots.length > 0 ? [] : [emptySlot()]);
      })
      .catch(() => {
        // Never strand them on a spinner: fall back to the original behaviour.
        if (!cancelled) setSlots([emptySlot()]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPage(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pageId, token]);

  /**
   * Bug #084 — AUTOSAVE, AND HOW IT CANNOT DOUBLE-CREATE.
   *
   * The de-duplication is not a check, it is the shape of the data. There are
   * two lists: `savedSlots` is what the server has, `slots` is what it does
   * not. `handleSubmit` iterates ONLY `slots`. So when autosave persists a
   * draft, that draft LEAVES `slots` and joins `savedSlots` — a move, never a
   * copy and never a flag. A saved task is therefore not in the list Continue
   * walks, by construction rather than by a guard somebody has to remember.
   *
   * Both paths also go through the SAME `persistDraft`, so there is one
   * creation routine rather than two that could drift apart. That matters more
   * than it looks: #071 existed because leaving and returning re-POSTed
   * everything, and autosave is the most likely way to reintroduce exactly that.
   *
   * `inFlight` holds the promise for each draft currently being written, so
   * Continue can wait for them to settle before walking what is left. Without
   * it, pressing Continue mid-autosave could write the same draft twice.
   */
  const inFlight = useRef<Map<string, Promise<void>>>(new Map());
  /** Mirrors `slots` so async code reads the current list, not a stale closure. */
  const slotsRef = useRef<SlotDraft[]>([]);
  slotsRef.current = slots;
  /** Quiet, temporary "Saved" marks — see the note where they render. */
  const [justSaved, setJustSaved] = useState<string[]>([]);

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
    setSlots((s) => [...s, emptySlot()]);
  }

  function updateSlot(id: string, updated: SlotDraft) {
    setSlots((s) => s.map((sl) => (sl.id === id ? updated : sl)));
  }

  function removeSlot(id: string) {
    setSlots((s) => s.filter((sl) => sl.id !== id));
  }

  /**
   * Create ONE draft on the server and hand back the rows it became.
   *
   * The only place tasks are created. Autosave calls it; Continue calls it for
   * whatever autosave has not already taken. A draft with repeatDays > 1 becomes
   * several rows, and all of them are returned, so the saved list reflects what
   * the server actually holds rather than what the form looked like.
   *
   * Throws on failure, and deliberately does not remove the draft in that case:
   * an unsaved draft must stay in `slots` so Continue still tries it.
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
   * THE MOVE. This is the whole de-duplication: the draft is removed from
   * `slots` in the same update that adds its rows to `savedSlots`, so it can
   * never be in both lists and Continue can never see it again.
   */
  function markPersisted(draftId: string, rows: SavedSlot[]) {
    setSlots((cur) => cur.filter((d) => d.id !== draftId));
    setSavedSlots((cur) => [...cur, ...rows]);
    setJustSaved((cur) => [...cur, ...rows.map((r) => r.id)]);
  }

  // Autosave: a completed, edited draft saves itself once it has sat still.
  // Any keystroke restarts the clock, so nothing saves mid-sentence.
  useEffect(() => {
    if (isLoadingPage || isLoading) return;
    const ready = slots.filter(
      (d) => !inFlight.current.has(d.id) && isDraftTouched(d) && isDraftComplete(d),
    );
    if (ready.length === 0) return;
    const timer = setTimeout(() => {
      for (const draft of ready) {
        if (inFlight.current.has(draft.id)) continue;
        const job = persistDraft(draft)
          .then((rows) => {
            markPersisted(draft.id, rows);
          })
          .catch(() => {
            // Silent on purpose: the draft stays put and Continue will try it
            // again. A failed autosave must never look like a lost task, and
            // must never interrupt someone mid-form with an error they cannot
            // act on.
          })
          .finally(() => {
            inFlight.current.delete(draft.id);
          });
        inFlight.current.set(draft.id, job);
      }
    }, AUTOSAVE_IDLE_MS);
    return () => clearTimeout(timer);
  }, [slots, isLoading, isLoadingPage]);

  // Clear the quiet "Saved" marks after a few seconds. They are an
  // acknowledgement, not a permanent badge.
  useEffect(() => {
    if (justSaved.length === 0) return;
    const t = setTimeout(() => setJustSaved([]), 4000);
    return () => clearTimeout(t);
  }, [justSaved]);

  // Validate: trusted slots must have at least one helper
  const hasTrustedWithNoHelpers = slots.some(
    (s) =>
      (SENSITIVE_TYPES.has(s.slotType) || s.trustedHelpersOnly) &&
      s.trustedHelpers.length === 0,
  );

  // Bug #033 — a lift needs both halves before it can go out on this path. The
  // server enforces the same two rules (400s without them); this is just the
  // kinder, earlier version of the same refusal.
  const liftMissingWaitMode = slots.some(
    (s) => isLiftCandidate(s.slotType, true) && !s.liftWaitMode,
  );
  const liftMissingTime = slots.some(
    (s) => isLiftCandidate(s.slotType, true) && !s.slotTime,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
    if (slots.length === 0 && savedSlots.length === 0) {
      setError("Add at least one task before publishing the page.");
      return;
    }
    setError(null);
    setIsLoading(true);

    try {
      // Bug #084 — wait for any autosave already writing before deciding what
      // is left. Without this, a draft mid-save would still be in `slots` here
      // and would be written a SECOND time: the #071 duplicate, arriving by the
      // new route. Settled, not resolved — a failed autosave leaves its draft
      // in place, which is exactly what should then be retried below.
      if (inFlight.current.size > 0) {
        await Promise.allSettled([...inFlight.current.values()]);
      }

      // Whatever autosave did not already take. Read from the ref, because the
      // awaits above mean the captured `slots` may be stale.
      for (const slot of slotsRef.current) {
        const rows = await persistDraft(slot);
        markPersisted(slot.id, rows);
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
    <div className="min-h-screen bg-background">
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
              : "Each slot is one task a helper can claim. School pickups and child care require a personal invitation for safety."}
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
                      {/*
                        Bug #084 — the quiet acknowledgement. No banner and no
                        toast: the task VISIBLY MOVING out of the form and into
                        "Already added" is most of the signal, and this word is
                        the rest of it. It fades after a few seconds because it
                        is an acknowledgement, not a badge — a permanent "Saved"
                        on every row would say nothing, and a toast would steal
                        attention from someone mid-form.
                      */}
                      {justSaved.includes(slot.id) && (
                        <span className="ml-2 text-xs font-normal text-primary/80">
                          Saved
                        </span>
                      )}
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
            {isResuming && slots.length === 0 ? "Add another task" : "Add another slot"}
          </button>

          {error && <p className="text-sm text-destructive pl-1">{error}</p>}

          <div className="pt-2">
            <Button
              type="submit"
              size="lg"
              className="w-full font-serif text-base"
              disabled={isLoading || (slots.length === 0 && savedSlots.length === 0)}
            >
              {isLoading ? "Saving & sending invites…" : "Continue — publish page →"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
