import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Calendar,
  CalendarClock,
  Check,
  Clock,
  Copy,
  Loader2,
  Lock,
  Pencil,
  Plus,
  ShieldCheck,
  Undo2,
  Users,
  Utensils,
  X,
} from "lucide-react";
import {
  useGetGiftReview,
  useActivateGift,
  getGetGiftReviewQueryKey,
  type SuggestedTask,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { situationHint, trustedHint } from "@/lib/inviteCopyHints";

/** A task as the recipient is currently steering it, before activation. */
interface DraftTask {
  key: string;
  slotType: SuggestedTask["slotType"];
  label: string;
  /** Undated is the norm — a flexible offer claimed whenever suits. */
  slotDate: string | null;
  /**
   * Time of day (HH:MM). Captured mainly for school pickups (bug #005), where
   * the time is the whole point and this flow previously had no way to set one.
   * Null everywhere else.
   */
  slotTime: string | null;
  /** Meal-only detail (bug #006). Null on every other type. */
  dietaryNotes: string | null;
  headcount: number | null;
  trustedHelpersOnly: boolean;
  /** Killed tasks stay in the list so "undo" is one tap away. */
  kept: boolean;
}

const SLOT_TYPE_OPTIONS: { value: SuggestedTask["slotType"]; label: string }[] = [
  { value: "meal", label: "A meal" },
  { value: "shopping", label: "Shopping" },
  { value: "errand", label: "An errand or lift" },
  { value: "visit", label: "A visit" },
  { value: "dog_walking", label: "The dog" },
  { value: "school_pickup", label: "School pickup" },
  { value: "child_care", label: "Looking after the kids" },
  { value: "other", label: "Something else" },
];

/**
 * Mirrors the server rule: these two are always trusted-only and the toggle is
 * shown locked rather than hidden, so the recipient can see why.
 */
const ALWAYS_TRUSTED = ["school_pickup", "child_care"];

/**
 * Bug #035a. "Trusted people only" was never explained anywhere, on the one
 * control where getting it wrong has real consequences. Stated once, used at
 * both spots where the checkbox is actually a choice — never on the read-only
 * badge, which is a summary rather than a decision.
 */
const TRUSTED_ONLY_HINT =
  "Only the people you tick as trusted will see this one — for things like pickups or minding the kids.";

function prettyDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** "15:00" → "3:00 PM". Tolerant of a stored HH:MM:SS. */
function prettyTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return hhmm;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${(mStr ?? "00").padStart(2, "0")} ${ampm}`;
}

function todayIso(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function GiftActivation({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetGiftReview(token, {
    query: { queryKey: getGetGiftReviewQueryKey(token), enabled: !!token, retry: false },
  });

  const [tasks, setTasks] = useState<DraftTask[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [goLiveDate, setGoLiveDate] = useState("");
  const [goodToKnow, setGoodToKnow] = useState("");
  const [copied, setCopied] = useState(false);
  const [manageCopied, setManageCopied] = useState(false);
  // Pronoun + situation line power the warm invite copy sent to helpers later.
  // Defaulted, optional to change — steering, never homework.
  const [pronouns, setPronouns] = useState<"she_her" | "he_him" | "they_them">(
    "they_them",
  );
  // The two invite-copy lines. Both start empty and stay empty unless the
  // recipient types over the ghost-text default — an untouched field sends null,
  // so the occasion (and baby-stage) default is resolved live at send time.
  const [situationLine, setSituationLine] = useState("");
  const [trustedLine, setTrustedLine] = useState("");
  // new_baby only: "has the baby arrived yet?" — optional, steers which default
  // wording the two fields hint at. Null until answered.
  const [babyStage, setBabyStage] = useState<"expecting" | "arrived" | null>(null);
  // Where to reach the recipient about their own page (Item 8). Prefilled from
  // the gift when we hold an email, asked for when we don't. Optional — skipping
  // just means notifications wait until an email is added later via /manage.
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientMobile, setRecipientMobile] = useState("");
  const [emailEdited, setEmailEdited] = useState(false);

  // Seed the local draft once the suggestions arrive. Everything the recipient
  // does lives here in the browser until they tap "Make it live" — nothing is
  // written server-side while they are still deciding.
  useEffect(() => {
    if (data && !data.activated && tasks.length === 0 && data.suggestions.length > 0) {
      setTasks(
        data.suggestions.map((s) => ({
          key: s.key,
          slotType: s.slotType,
          label: s.label,
          slotDate: null,
          slotTime: null,
          dietaryNotes: null,
          headcount: null,
          trustedHelpersOnly: s.trustedHelpersOnly,
          kept: true,
        })),
      );
    }
  }, [data, tasks.length]);

  // Prefill the email from the one we already hold (from the gift), once.
  useEffect(() => {
    if (data && !data.activated && data.recipientEmail && !emailEdited) {
      setRecipientEmail(data.recipientEmail);
    }
  }, [data, emailEdited]);

  const activate = useActivateGift({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetGiftReviewQueryKey(token) });
      },
    },
  });

  const keptCount = useMemo(() => tasks.filter((t) => t.kept).length, [tasks]);

  const update = (key: string, patch: Partial<DraftTask>) =>
    setTasks((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  const activatedPage = data?.activated
    ? {
        slug: data.slug,
        status: data.status,
        scheduledActivateAt: data.scheduledActivateAt,
        manageToken: data.manageToken ?? null,
      }
    : activate.data
      ? {
          slug: activate.data.slug,
          status: activate.data.status,
          scheduledActivateAt: activate.data.scheduledActivateAt ?? null,
          manageToken: activate.data.manageToken ?? null,
        }
      : null;

  const pageUrl = activatedPage?.slug
    ? `${window.location.origin}/s/${activatedPage.slug}`
    : "";

  if (isLoading) {
    return (
      <section className="flex flex-col items-center gap-3 px-6 py-16">
        <Loader2 className="h-7 w-7 animate-spin text-[#2d6a4f]" />
      </section>
    );
  }

  // ── Already live (or just made live) ──
  if (activatedPage?.slug) {
    const scheduled = activatedPage.scheduledActivateAt;
    return (
      <section className="mx-[1.25rem] mt-8 rounded-t-[1.6rem] border border-b-0 border-[#e7ddd0] bg-gradient-to-b from-[#faf7f2] to-[#f3eadd] px-[1.6rem] pt-[2.3rem] pb-[2.5rem] text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#2d6a4f]">
          <Check className="h-7 w-7 text-white" strokeWidth={3} />
        </div>
        <h2 className="mb-[0.6rem] font-serif text-[1.75rem] font-semibold text-[#2c2c2c]">
          {scheduled ? "All set for later." : "It's live."}
        </h2>
        <p className="mx-auto mb-[1.5rem] max-w-[28ch] text-[1rem] text-[#52493f]">
          {scheduled
            ? `Your page goes live on ${new Date(scheduled).toLocaleDateString("en-AU", { day: "numeric", month: "long" })}. We'll take care of it — nothing more for you to do.`
            : "Share this link with anyone who's offered to help. They won't need an account."}
        </p>

        <div className="mx-auto mb-4 flex max-w-full items-center gap-2 rounded-full border border-[#e7ddd0] bg-white px-4 py-3">
          <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-[0.9rem] text-[#52493f]">
            {pageUrl}
          </span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(pageUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="flex flex-none items-center gap-1.5 rounded-full bg-[#2d6a4f] px-3 py-1.5 text-[0.8rem] font-semibold text-white transition-colors hover:bg-[#245842]"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <a
          href={`/s/${activatedPage.slug}`}
          className="inline-flex items-center gap-[0.55rem] font-serif text-[1.05rem] font-semibold text-[#2d6a4f] underline underline-offset-4"
        >
          See your page
          <ArrowRight className="h-4 w-4" />
        </a>

        {/* Private management link — add people and let Aunt Lucy do the asking */}
        {activatedPage.manageToken && (
          <div className="mt-7 border-t border-[#e7ddd0] pt-6">
            <h3 className="mb-1.5 font-serif text-[1.2rem] font-semibold text-[#2c2c2c]">
              Want us to round up your people?
            </h3>
            <p className="mx-auto mb-4 max-w-[30ch] text-[0.95rem] text-[#52493f]">
              Add a few names and Aunt Lucy will do the asking — gently, no
              pressure on anyone. This is your private link; keep it handy.
            </p>
            <a
              href={`/manage/${activatedPage.manageToken}`}
              className="inline-flex items-center gap-2 rounded-full bg-[#2d6a4f] px-6 py-3 font-serif text-[1.02rem] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(45,106,79,0.7)] transition-all hover:-translate-y-0.5 hover:bg-[#245842]"
            >
              Add your people
              <ArrowRight className="h-4 w-4" />
            </a>
            <div className="mx-auto mt-3 flex max-w-full items-center gap-2 rounded-full border border-[#e7ddd0] bg-white px-4 py-2.5">
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-[0.82rem] text-[#8b7e74]">
                {`${window.location.origin}/manage/${activatedPage.manageToken}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    `${window.location.origin}/manage/${activatedPage.manageToken}`,
                  );
                  setManageCopied(true);
                  setTimeout(() => setManageCopied(false), 2000);
                }}
                className="flex flex-none items-center gap-1.5 rounded-full bg-[#f3eadd] px-3 py-1.5 text-[0.78rem] font-semibold text-[#2d6a4f]"
              >
                {manageCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {manageCopied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </section>
    );
  }

  // ── Not yet paid / not ready ──
  if (data && !data.activated && data.canActivate === false) {
    return (
      <section className="mx-[1.25rem] mt-8 rounded-[1.6rem] border border-[#e7ddd0] bg-[#faf7f2] px-[1.6rem] py-[2.3rem] text-center">
        <p className="text-[1rem] text-[#52493f]">
          This gift isn't quite ready yet. Hold onto this link — we'll let you
          know the moment it is.
        </p>
      </section>
    );
  }

  // Ghost-text hints for the two invite-copy fields. new_baby swaps by stage;
  // every other occasion uses the server-provided occasion default.
  const isNewBaby = data?.occasion === "new_baby";
  const situationPlaceholder = situationHint({
    occasion: data?.occasion,
    babyStage,
    pronouns,
    agnosticDefault: data?.situationLine ?? "just welcomed their new baby",
  });
  const trustedPlaceholder = trustedHint({
    occasion: data?.occasion,
    babyStage,
    pronouns,
    agnosticDefault: data?.trustedLine ?? "getting ready for the new baby",
  });

  return (
    <section className="px-6 pt-[2.4rem]">
      {/* THE OPENER (bug #035) — until now this page asked her to approve a list
          without ever saying what Aunt Lucy is. Deliberately plain prose in the
          page's own type: the moment it looks like an ad, the page stops feeling
          like hers. The one link opens in a new tab — she is mid-decision here,
          and navigating her away is a leak, not a visit. */}
      <div className="mx-auto mb-[2.2rem] flex max-w-[34ch] flex-col gap-[0.85rem] text-[1rem] leading-relaxed text-[#52493f]">
        <p>
          When something big happens, everyone says, "Let me know what I can
          do."
        </p>
        <p>
          But when you need it most, asking is the last thing you can face.
        </p>
        <p>
          <a
            href={import.meta.env.BASE_URL || "/"}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#2d6a4f] underline underline-offset-2"
          >
            Aunt Lucy
          </a>{" "}
          is the page that sorts it out for you. You approve a short list of
          things that would genuinely help — a meal, a lift, the school run —
          then share one link, and your people pick what suits them. No one has
          to ask, and you never have to organise a thing.
        </p>
      </div>

      {/* THE STEER */}
      <div className="mb-[1.4rem] text-center">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[#d15b3e]">
          Your page, ready to go
        </p>
        <h2 className="mt-2 font-serif text-[1.7rem] font-semibold leading-tight text-[#2c2c2c]">
          Here's what we thought might help
        </h2>
        <p className="mx-auto mt-2 max-w-[30ch] text-[0.97rem] text-[#8b7e74]">
          We've had a guess at what might be useful. Change anything, or nothing
          — it's yours.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {tasks.map((task) => {
            const locked = ALWAYS_TRUSTED.includes(task.slotType);
            const editing = editingKey === task.key;
            const isMeal = task.slotType === "meal";
            const isSchoolPickup = task.slotType === "school_pickup";

            // ── Killed: a quiet strip with one-tap undo, no explanation asked ──
            if (!task.kept) {
              return (
                <motion.div
                  key={task.key}
                  layout
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-between rounded-[0.9rem] border border-dashed border-[#e0d6c8] px-4 py-2.5"
                >
                  <span className="text-[0.9rem] text-[#a89c90] line-through">
                    {task.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => update(task.key, { kept: true })}
                    className="flex items-center gap-1.5 text-[0.82rem] font-semibold text-[#2d6a4f]"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    Undo
                  </button>
                </motion.div>
              );
            }

            return (
              <motion.div
                key={task.key}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-[1.1rem] border border-[#e7ddd0] bg-white px-[1.15rem] py-[1.05rem] shadow-[0_8px_24px_-18px_rgba(74,58,42,0.4)]"
              >
                {editing ? (
                  <div className="flex flex-col gap-3">
                    <input
                      value={task.label}
                      onChange={(e) => update(task.key, { label: e.target.value })}
                      className="w-full rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2.5 text-[1rem] text-[#2c2c2c] focus:border-[#2d6a4f] focus:outline-none"
                      aria-label="What would help"
                    />

                    <div className="flex flex-col gap-1">
                      <label className="flex items-center gap-2.5 text-[0.9rem] text-[#52493f]">
                        <input
                          type="checkbox"
                          checked={task.trustedHelpersOnly}
                          disabled={locked}
                          onChange={(e) =>
                            update(task.key, { trustedHelpersOnly: e.target.checked })
                          }
                          className="h-4 w-4 accent-[#2d6a4f]"
                        />
                        Trusted people only
                        {locked && (
                          <span className="text-[0.78rem] text-[#8b7e74]">
                            — always, for anything with the kids
                          </span>
                        )}
                      </label>
                      {/* Bug #035a: the control with the most consequence on the
                          page, and nothing anywhere said what it did. */}
                      <p className="pl-[1.65rem] text-[0.8rem] leading-snug text-[#8b7e74]">
                        {TRUSTED_ONLY_HINT}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={task.slotDate ?? ""}
                        min={todayIso()}
                        onChange={(e) =>
                          update(task.key, { slotDate: e.target.value || null })
                        }
                        className="rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2 text-[0.9rem] text-[#2c2c2c] focus:border-[#2d6a4f] focus:outline-none"
                        aria-label="A specific date, if it needs one"
                      />
                      {task.slotDate && (
                        <button
                          type="button"
                          onClick={() => update(task.key, { slotDate: null })}
                          className="text-[0.82rem] font-semibold text-[#8b7e74] underline underline-offset-2"
                        >
                          Clear date
                        </button>
                      )}
                    </div>
                    <p className="-mt-1 text-[0.8rem] text-[#8b7e74]">
                      Most things don't need a date — helpers pick a time that
                      works.
                    </p>

                    {/* Pickup time (bug #005). School pickup is the one task
                        where the time is the whole point — "3pm or 3:30pm?" —
                        so the recipient can set it here. */}
                    {isSchoolPickup && (
                      <div className="flex flex-col gap-1">
                        <label className="text-[0.82rem] font-medium text-[#52493f]">
                          Pickup time
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            value={task.slotTime ?? ""}
                            onChange={(e) =>
                              update(task.key, { slotTime: e.target.value || null })
                            }
                            className="rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2 text-[0.9rem] text-[#2c2c2c] focus:border-[#2d6a4f] focus:outline-none"
                            aria-label="Pickup time"
                          />
                          {task.slotTime && (
                            <button
                              type="button"
                              onClick={() => update(task.key, { slotTime: null })}
                              className="text-[0.82rem] font-semibold text-[#8b7e74] underline underline-offset-2"
                            >
                              Clear time
                            </button>
                          )}
                        </div>
                        <p className="text-[0.8rem] text-[#8b7e74]">
                          So your helper knows exactly when to be there.
                        </p>
                      </div>
                    )}

                    {/* Meal detail (bug #006) — how many, and any dietary needs.
                        Both optional; a helper cooking blind is the problem. */}
                    {isMeal && (
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-[0.82rem] font-medium text-[#52493f]">
                            Feeding how many?
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            inputMode="numeric"
                            placeholder="e.g. 4"
                            value={task.headcount ?? ""}
                            onChange={(e) =>
                              update(task.key, {
                                headcount: e.target.value
                                  ? Number(e.target.value)
                                  : null,
                              })
                            }
                            className="w-32 rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2 text-[0.9rem] text-[#2c2c2c] focus:border-[#2d6a4f] focus:outline-none"
                            aria-label="How many people to feed"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[0.82rem] font-medium text-[#52493f]">
                            Dietary needs
                          </label>
                          <input
                            value={task.dietaryNotes ?? ""}
                            placeholder="e.g. no nuts, vegetarian"
                            onChange={(e) =>
                              update(task.key, {
                                dietaryNotes: e.target.value || null,
                              })
                            }
                            className="rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2 text-[0.9rem] text-[#2c2c2c] focus:border-[#2d6a4f] focus:outline-none"
                            aria-label="Dietary needs"
                          />
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setEditingKey(null)}
                      className="self-start rounded-full bg-[#2d6a4f] px-4 py-2 text-[0.88rem] font-semibold text-white"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[1.02rem] leading-snug text-[#2c2c2c]">
                        {task.label}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span
                          className={`inline-flex items-center gap-1 text-[0.78rem] ${
                            task.trustedHelpersOnly
                              ? "font-semibold text-[#a9701f]"
                              : "text-[#8b7e74]"
                          }`}
                        >
                          {task.trustedHelpersOnly ? (
                            <>
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Trusted people only
                            </>
                          ) : (
                            "Anyone can help"
                          )}
                        </span>
                        {/* A date appears only when the task genuinely needs one. */}
                        {task.slotDate && (
                          <span className="inline-flex items-center gap-1 text-[0.78rem] text-[#8b7e74]">
                            <Calendar className="h-3.5 w-3.5" />
                            {prettyDate(task.slotDate)}
                          </span>
                        )}
                        {/* Pickup time (#005) and meal detail (#006), shown back
                            so the recipient sees what they set at a glance. */}
                        {isSchoolPickup && task.slotTime && (
                          <span className="inline-flex items-center gap-1 text-[0.78rem] text-[#8b7e74]">
                            <Clock className="h-3.5 w-3.5" />
                            {prettyTime(task.slotTime)}
                          </span>
                        )}
                        {isMeal && task.headcount && (
                          <span className="inline-flex items-center gap-1 text-[0.78rem] text-[#8b7e74]">
                            <Users className="h-3.5 w-3.5" />
                            Feeds {task.headcount}
                          </span>
                        )}
                        {isMeal && task.dietaryNotes && (
                          <span className="inline-flex items-center gap-1 text-[0.78rem] text-[#8b7e74]">
                            <Utensils className="h-3.5 w-3.5" />
                            {task.dietaryNotes}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-none items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingKey(task.key)}
                        aria-label={`Change "${task.label}"`}
                        className="grid h-8 w-8 place-items-center rounded-full text-[#8b7e74] transition-colors hover:bg-[#f3eadd] hover:text-[#2d6a4f]"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => update(task.key, { kept: false })}
                        aria-label={`Remove "${task.label}"`}
                        className="grid h-8 w-8 place-items-center rounded-full text-[#8b7e74] transition-colors hover:bg-[#f3eadd] hover:text-[#d15b3e]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* ADD YOUR OWN */}
      {adding ? (
        <AddTaskForm
          onCancel={() => setAdding(false)}
          onAdd={(t) => {
            setTasks((prev) => [...prev, t]);
            setAdding(false);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-[1.1rem] border border-dashed border-[#d9cdbd] py-3.5 text-[0.95rem] font-semibold text-[#2d6a4f] transition-colors hover:bg-[#f6ece5]"
        >
          <Plus className="h-4 w-4" />
          Add something else
        </button>
      )}

      {/* GOOD TO KNOW — an optional note every helper sees */}
      <div className="mt-7">
        <label
          htmlFor="good-to-know"
          className="mb-1.5 block font-serif text-[1.05rem] font-semibold text-[#2c2c2c]"
        >
          Good to know{" "}
          <span className="font-sans text-[0.85rem] font-normal text-[#8b7e74]">
            (optional)
          </span>
        </label>
        <p className="mb-2.5 text-[0.88rem] text-[#8b7e74]">
          One or two things that make it easy for people to help — shown to
          everyone who lends a hand.
        </p>
        <textarea
          id="good-to-know"
          value={goodToKnow}
          maxLength={500}
          onChange={(e) => setGoodToKnow(e.target.value)}
          rows={3}
          placeholder="For example… a quick text before you come is easier than a knock at the door. Doorstep drop-offs are always perfect."
          className="w-full rounded-[0.9rem] border border-[#e0d6c8] bg-white px-3.5 py-3 text-[0.97rem] leading-relaxed text-[#2c2c2c] placeholder:text-[#b3a99d] focus:border-[#2d6a4f] focus:outline-none"
        />
      </div>

      {/* ABOUT YOU — the words Aunt Lucy actually sends your people. Given a
          little more presence than the other optional blocks: this text lands in
          a stranger's inbox, so it's worth a second's read. */}
      <div className="mt-8 rounded-[1.1rem] border border-[#e0d6c8] bg-[#fbf7f0] px-4 py-4">
        <h3 className="mb-1 font-serif text-[1.12rem] font-semibold text-[#2c2c2c]">
          When Aunt Lucy writes to your people{" "}
          <span className="font-sans text-[0.85rem] font-normal text-[#8b7e74]">
            (optional)
          </span>
        </h3>
        <p className="mb-3 text-[0.9rem] leading-relaxed text-[#52493f]">
          This becomes part of the message your people get when you invite them —
          make it sound like you. Leave a line as-is and we'll use the gentle
          wording shown. You can change any of it anytime.
        </p>

        <div className="flex flex-col gap-3.5 rounded-[0.9rem] border border-[#e7ddd0] bg-white px-3.5 py-3.5">
          <label className="text-[0.9rem] text-[#52493f]">
            Refer to you as
            <select
              value={pronouns}
              onChange={(e) =>
                setPronouns(e.target.value as "she_her" | "he_him" | "they_them")
              }
              className="mt-1 w-full rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2.5 text-[0.95rem] text-[#2c2c2c] focus:border-[#2d6a4f] focus:outline-none"
            >
              <option value="they_them">they / them</option>
              <option value="she_her">she / her</option>
              <option value="he_him">he / him</option>
            </select>
          </label>

          {/* new_baby only: "has the baby arrived?" — sits directly above the
              line it steers, so the connection is visible. Optional; never
              blocks activation. */}
          {isNewBaby && (
            <div className="text-[0.9rem] text-[#52493f]">
              Has the baby arrived yet?
              <div className="mt-1.5 flex gap-2">
                {[
                  { value: "expecting" as const, label: "Not yet, we're expecting" },
                  { value: "arrived" as const, label: "Yes, they're here" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setBabyStage((s) => (s === opt.value ? null : opt.value))
                    }
                    className={`flex-1 rounded-full border px-3 py-2 text-[0.85rem] font-semibold transition ${
                      babyStage === opt.value
                        ? "border-[#2d6a4f] bg-[#2d6a4f] text-white"
                        : "border-[#e0d6c8] bg-[#faf7f2] text-[#52493f]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="text-[0.9rem] text-[#52493f]">
            The everyday invite
            <span className="ml-1.5 text-[0.8rem] text-[#8b7e74]">
              — {data?.recipientName ?? "they"}'s…
            </span>
            <input
              value={situationLine}
              maxLength={120}
              onChange={(e) => setSituationLine(e.target.value)}
              placeholder={`e.g. ${situationPlaceholder}`}
              className="mt-1 w-full rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2.5 text-[0.95rem] text-[#2c2c2c] placeholder:text-[#b3a99d] focus:border-[#2d6a4f] focus:outline-none"
            />
          </label>

          {/* The trusted "support circle" line (9b) — its counterpart, for the
              close people you'd trust with the sensitive things. Same
              placeholder-or-default behaviour. */}
          <label className="text-[0.9rem] text-[#52493f]">
            The note for trusted people
            <span className="ml-1.5 text-[0.8rem] text-[#8b7e74]">
              — for anyone you'd trust with pickups or minding the kids
            </span>
            <input
              value={trustedLine}
              maxLength={120}
              onChange={(e) => setTrustedLine(e.target.value)}
              placeholder={`e.g. ${trustedPlaceholder}`}
              className="mt-1 w-full rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2.5 text-[0.95rem] text-[#2c2c2c] placeholder:text-[#b3a99d] focus:border-[#2d6a4f] focus:outline-none"
            />
          </label>
        </div>
      </div>

      {/* WHERE SHOULD WE REACH YOU — powers the "help arriving" notifications.
          Optional; prefilled from the gift. */}
      <div className="mt-7">
        <h3 className="mb-1.5 font-serif text-[1.05rem] font-semibold text-[#2c2c2c]">
          Where should we reach you?{" "}
          <span className="font-sans text-[0.85rem] font-normal text-[#8b7e74]">
            (optional)
          </span>
        </h3>
        <p className="mb-2.5 text-[0.88rem] text-[#8b7e74]">
          Add your mobile and we'll text you when someone puts their hand up. No app
          to check, no chasing — just a quiet heads-up when help is on the way.
        </p>
        <div className="flex flex-col gap-3 rounded-[0.9rem] border border-[#e0d6c8] bg-white px-3.5 py-3">
          <label className="text-[0.9rem] text-[#52493f]">
            Email
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => {
                setEmailEdited(true);
                setRecipientEmail(e.target.value);
              }}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2.5 text-[0.95rem] text-[#2c2c2c] placeholder:text-[#b3a99d] focus:border-[#2d6a4f] focus:outline-none"
            />
          </label>
          <label className="text-[0.9rem] text-[#52493f]">
            Mobile{" "}
            <span className="text-[0.8rem] text-[#8b7e74]">(for text updates too)</span>
            <input
              type="tel"
              value={recipientMobile}
              onChange={(e) => setRecipientMobile(e.target.value)}
              placeholder="0400 000 000"
              className="mt-1 w-full rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2.5 text-[0.95rem] text-[#2c2c2c] placeholder:text-[#b3a99d] focus:border-[#2d6a4f] focus:outline-none"
            />
          </label>
        </div>
      </div>

      {/* ACTIVATION */}
      <div className="-mx-6 mt-9 rounded-t-[1.6rem] border border-b-0 border-[#e7ddd0] bg-gradient-to-b from-[#faf7f2] to-[#f3eadd] px-[1.6rem] pt-[2.3rem] pb-[2.5rem] text-center">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[#d15b3e]">
          Whenever you're ready
        </p>
        <h2 className="mt-2 mb-[0.7rem] font-serif text-[1.75rem] font-semibold text-[#2c2c2c]">
          Ready when you are
        </h2>
        <p className="mx-auto mb-[1.5rem] max-w-[28ch] text-[1rem] text-[#52493f]">
          {keptCount > 0
            ? `${keptCount} ${keptCount === 1 ? "way" : "ways"} people can help. You can change all of this later.`
            : "You can add things later, whenever you feel like it."}
        </p>

        {showSchedule && (
          <div className="mx-auto mb-5 max-w-[24rem] rounded-[1rem] border border-[#e7ddd0] bg-white px-4 py-4 text-left">
            <label className="mb-2 flex items-center gap-2 text-[0.88rem] font-semibold text-[#2c2c2c]">
              <CalendarClock className="h-4 w-4 text-[#2d6a4f]" />
              Go live on
            </label>
            <input
              type="date"
              value={goLiveDate}
              min={todayIso()}
              onChange={(e) => setGoLiveDate(e.target.value)}
              className="w-full rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2.5 text-[0.95rem] text-[#2c2c2c] focus:border-[#2d6a4f] focus:outline-none"
            />
            <p className="mt-2 text-[0.82rem] text-[#8b7e74]">
              Nothing is visible to anyone until then.
            </p>
          </div>
        )}

        <button
          type="button"
          disabled={activate.isPending}
          onClick={() =>
            activate.mutate({
              redemptionToken: token,
              data: {
                tasks: tasks
                  .filter((t) => t.kept && t.label.trim())
                  .map((t) => ({
                    slotType: t.slotType,
                    label: t.label.trim(),
                    slotDate: t.slotDate,
                    // #005 pickup time + #006 meal detail. Server ignores each
                    // on the types they don't apply to.
                    slotTime: t.slotType === "school_pickup" ? t.slotTime : null,
                    dietaryNotes: t.slotType === "meal" ? t.dietaryNotes : null,
                    headcount: t.slotType === "meal" ? t.headcount : null,
                    trustedHelpersOnly: t.trustedHelpersOnly,
                  })),
                scheduledActivateAt:
                  showSchedule && goLiveDate
                    ? new Date(goLiveDate + "T09:00:00").toISOString()
                    : null,
                goodToKnow: goodToKnow.trim() || null,
                recipientPronouns: pronouns,
                situationLine: situationLine.trim() || null,
                trustedLine: trustedLine.trim() || null,
                babyStage,
                recipientEmail: recipientEmail.trim() || null,
                recipientMobile: recipientMobile.trim() || null,
              },
            })
          }
          className="inline-flex items-center gap-[0.55rem] rounded-full bg-[#2d6a4f] px-[2.1rem] py-4 font-serif text-[1.12rem] font-semibold text-white shadow-[0_14px_30px_-12px_rgba(45,106,79,0.7)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#245842] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#2d6a4f]/35 disabled:opacity-70"
        >
          {activate.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              Make it live
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </button>

        {activate.isError && (
          <p className="mt-3 text-[0.88rem] text-[#c0563a]">
            That didn't go through. Have another go in a moment.
          </p>
        )}

        <div className="mt-[1.1rem]">
          <button
            type="button"
            onClick={() => setShowSchedule((s) => !s)}
            className="text-[0.88rem] text-[#8b7e74] underline underline-offset-4 transition-colors hover:text-[#2d6a4f]"
          >
            {showSchedule ? "Actually, go live now" : "Go live on a later date"}
          </button>
        </div>

        <p className="mt-[1rem] flex items-center justify-center gap-1.5 text-[0.85rem] text-[#8b7e74]">
          <Lock className="h-[15px] w-[15px] text-[#2d6a4f]" />
          Private and free · no account needed
        </p>
      </div>
    </section>
  );
}

/** The optional "add something else" row. Deliberately three fields, no more. */
function AddTaskForm({
  onAdd,
  onCancel,
}: {
  onAdd: (task: DraftTask) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [slotType, setSlotType] = useState<SuggestedTask["slotType"]>("other");
  const [trusted, setTrusted] = useState(false);

  const locked = ALWAYS_TRUSTED.includes(slotType);

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-[1.1rem] border border-[#e7ddd0] bg-white px-[1.15rem] py-[1.05rem]">
      <input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="What would actually help?"
        className="w-full rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2.5 text-[1rem] text-[#2c2c2c] focus:border-[#2d6a4f] focus:outline-none"
      />
      <select
        value={slotType}
        onChange={(e) => setSlotType(e.target.value as SuggestedTask["slotType"])}
        className="w-full rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2.5 text-[0.95rem] text-[#2c2c2c] focus:border-[#2d6a4f] focus:outline-none"
        aria-label="What kind of help"
      >
        {SLOT_TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2.5 text-[0.9rem] text-[#52493f]">
          <input
            type="checkbox"
            checked={locked || trusted}
            disabled={locked}
            onChange={(e) => setTrusted(e.target.checked)}
            className="h-4 w-4 accent-[#2d6a4f]"
          />
          Trusted people only
        </label>
        <p className="pl-[1.65rem] text-[0.8rem] leading-snug text-[#8b7e74]">
          {TRUSTED_ONLY_HINT}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!label.trim()}
          onClick={() =>
            onAdd({
              // Prefixed so it can never collide with a suggestion key.
              key: `custom-${Date.now()}`,
              slotType,
              label: label.trim(),
              slotDate: null,
              slotTime: null,
              dietaryNotes: null,
              headcount: null,
              trustedHelpersOnly: locked || trusted,
              kept: true,
            })
          }
          className="rounded-full bg-[#2d6a4f] px-4 py-2 text-[0.88rem] font-semibold text-white disabled:opacity-50"
        >
          Add it
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[0.88rem] text-[#8b7e74] underline underline-offset-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
