import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Calendar,
  CalendarClock,
  Check,
  Copy,
  Loader2,
  Lock,
  Pencil,
  Plus,
  ShieldCheck,
  Undo2,
  X,
} from "lucide-react";
import {
  useGetGiftReview,
  useActivateGift,
  getGetGiftReviewQueryKey,
  type SuggestedTask,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

/** A task as the recipient is currently steering it, before activation. */
interface DraftTask {
  key: string;
  slotType: SuggestedTask["slotType"];
  label: string;
  /** Undated is the norm — a flexible offer claimed whenever suits. */
  slotDate: string | null;
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

function prettyDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
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
          trustedHelpersOnly: s.trustedHelpersOnly,
          kept: true,
        })),
      );
    }
  }, [data, tasks.length]);

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
    ? { slug: data.slug, status: data.status, scheduledActivateAt: data.scheduledActivateAt }
    : activate.data
      ? {
          slug: activate.data.slug,
          status: activate.data.status,
          scheduledActivateAt: activate.data.scheduledActivateAt ?? null,
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

  return (
    <section className="px-6 pt-[2.4rem]">
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
          placeholder="It's a bit chaotic here and hard to say what'll work — a quick text before you come saves waking the baby. Doorstep drop-offs are always perfect."
          className="w-full rounded-[0.9rem] border border-[#e0d6c8] bg-white px-3.5 py-3 text-[0.97rem] leading-relaxed text-[#2c2c2c] placeholder:text-[#b3a99d] focus:border-[#2d6a4f] focus:outline-none"
        />
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
                    trustedHelpersOnly: t.trustedHelpersOnly,
                  })),
                scheduledActivateAt:
                  showSchedule && goLiveDate
                    ? new Date(goLiveDate + "T09:00:00").toISOString()
                    : null,
                goodToKnow: goodToKnow.trim() || null,
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
