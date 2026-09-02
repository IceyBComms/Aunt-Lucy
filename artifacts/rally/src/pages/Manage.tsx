import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import {
  ArrowRight,
  Check,
  Copy,
  Loader2,
  Send,
  ShieldCheck,
  Trash2,
  Clock,
  Pencil,
} from "lucide-react";
import {
  useGetManageState,
  getGetManageStateQueryKey,
  useAddContact,
  useDeleteContact,
  usePreviewInvites,
  useSendInvites,
  useScheduleInvites,
  useUpdateManageDetails,
  useEditTask,
  useCancelTask,
  useAddManager,
  useRevokeManager,
  useGrantRecipientAccess,
  useSubmitPageFeedback,
  type InvitePreview,
  type ManageTaskSummary,
  type ManageInviteStatus,
  type BabyStage,
  type RecipientPronouns,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { situationHint, trustedHint } from "@/lib/inviteCopyHints";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog-framer";
import { family as copy } from "@/lib/item17Copy";
import { feedback as fb } from "@/lib/feedbackCopy";
import {
  LIFT_WAIT_MODES,
  LIFT_WAIT_MODE_LABELS,
  LIFT_WAIT_MODE_TILE_LINES,
  TIME_TBC,
  asLiftWaitMode,
  isLiftCandidate,
  type LiftWaitMode,
} from "@/lib/liftWaitMode";

/**
 * What each invite state is called on the recipient's own page.
 *
 * EXHAUSTIVE ON PURPOSE (bug #048). The list below used to name `sent` and
 * `queued` and then fall through to printing the raw status, so a failed invite
 * already showed as the bare lowercase word "failed" beside a friend's name,
 * and the new `sending` state would have joined it. Typing this as a Record
 * over ManageInviteStatus means a future status is a compile error here rather
 * than another raw enum value leaking onto the page.
 *
 * "couldn't send" blames neither her nor the friend, and deliberately does not
 * promise a retry that isn't built — there is no control and no link, because
 * the resend is bug #009.
 */
const INVITE_STATUS_LABEL: Record<ManageInviteStatus, string> = {
  queued: "queued",
  sending: "sending now",
  sent: "invited",
  failed: "couldn't send",
  cancelled: "cancelled",
};

/** One row of the invite selection: whether to include, and which task (trusted). */
interface Selection {
  include: boolean;
  slotId: string | null;
}

/** "Friday, 1 August" / "Friday, 1 August · 3:00 pm" / "" when undated. */
function formatWhen(slotDate: string | null, slotTime: string | null): string {
  if (!slotDate) return "";
  const [y, m, d] = slotDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  let out = date.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  if (slotTime) {
    const [h, min] = slotTime.split(":").map(Number);
    const ampm = h >= 12 ? "pm" : "am";
    const h12 = h % 12 || 12;
    out += ` · ${h12}:${String(min).padStart(2, "0")}${ampm}`;
  } else {
    // Bug #033 — a dated task with no time yet says so here too, so the
    // recipient can see at a glance which of her tasks still need a time.
    out += ` · ${TIME_TBC}`;
  }
  return out;
}

/**
 * Bug #033 — the wait-or-not answer, appended to the "when" line.
 * Returns the line unchanged when there is no answer.
 */
function withWait(when: string, liftWaitMode: unknown): string {
  const mode = asLiftWaitMode(liftWaitMode);
  return mode ? `${when} · ${LIFT_WAIT_MODE_TILE_LINES[mode]}` : when;
}

export function Manage() {
  const [, params] = useRoute("/manage/:token");
  const token = params?.token ?? "";
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getGetManageStateQueryKey(token) });

  const { data, isLoading, isError } = useGetManageState(token, {
    query: { queryKey: getGetManageStateQueryKey(token), enabled: !!token, retry: false },
  });

  const addContact = useAddContact({ mutation: { onSuccess: invalidate } });
  const deleteContact = useDeleteContact({ mutation: { onSuccess: invalidate } });
  const preview = usePreviewInvites();
  const send = useSendInvites({ mutation: { onSuccess: invalidate } });
  const schedule = useScheduleInvites({ mutation: { onSuccess: invalidate } });
  const updateDetails = useUpdateManageDetails({ mutation: { onSuccess: invalidate } });
  // Separate instance so the invite-copy "Save" has its own pending/success state
  // independent of the "where should we reach you?" Save above.
  const updateCopy = useUpdateManageDetails({ mutation: { onSuccess: invalidate } });
  const editTask = useEditTask({ mutation: { onSuccess: invalidate } });
  const cancelTask = useCancelTask({ mutation: { onSuccess: invalidate } });
  // Access grants (sections A/C/E): share the running, take it back, loop the
  // recipient in. Each refreshes the "who has access" list on success.
  const addManager = useAddManager({ mutation: { onSuccess: invalidate } });
  const revokeManager = useRevokeManager({ mutation: { onSuccess: invalidate } });
  const grantAccess = useGrantRecipientAccess({ mutation: { onSuccess: invalidate } });
  // Feedback. No onSuccess: invalidate here — the button's own onSuccess needs
  // to clear the boxes and flip to the thank-you in the same beat, so it does
  // both there rather than splitting the two halves across two callbacks.
  const submitFeedback = useSubmitPageFeedback();

  // Item 17 — task edit / cancel. `editing` / `cancelling` hold the task whose
  // dialog is open; `flash` shows the shared "Done — Aunt Lucy's on it." line.
  const [editing, setEditing] = useState<ManageTaskSummary | null>(null);
  const [cancelling, setCancelling] = useState<ManageTaskSummary | null>(null);
  const [flash, setFlash] = useState(false);
  const [editForm, setEditForm] = useState({
    customLabel: "",
    slotDate: "",
    slotTime: "",
    liftWaitMode: "" as LiftWaitMode | "",
    notes: "",
    flexibility: "fixed" as "flexible" | "fixed",
    dietaryNotes: "",
    headcount: "",
  });

  const showFlash = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 2500);
  };

  const openEdit = (t: ManageTaskSummary) => {
    setEditForm({
      customLabel: t.customLabel ?? "",
      slotDate: t.slotDate ?? "",
      // A stored time may carry seconds (HH:MM:SS); the time input wants HH:MM.
      slotTime: (t.slotTime ?? "").slice(0, 5),
      liftWaitMode: asLiftWaitMode(t.liftWaitMode) ?? "",
      notes: t.notes ?? "",
      flexibility: t.flexibility,
      dietaryNotes: t.dietaryNotes ?? "",
      headcount: t.headcount != null ? String(t.headcount) : "",
    });
    setEditing(t);
  };

  const saveEdit = () => {
    if (!editing) return;
    const isMeal = editing.slotType === "meal";
    editTask.mutate(
      {
        token,
        slotId: editing.id,
        data: {
          customLabel: editForm.customLabel.trim() || null,
          slotDate: editForm.slotDate || null,
          slotTime: editForm.slotTime || null,
          // Bug #033 — "" clears it, correctly returning the task to rendering
          // nothing at all rather than a stale answer.
          liftWaitMode: editForm.liftWaitMode || null,
          notes: editForm.notes.trim() || null,
          flexibility: editForm.flexibility,
          ...(isMeal
            ? {
                dietaryNotes: editForm.dietaryNotes.trim() || null,
                headcount: editForm.headcount ? Number(editForm.headcount) : null,
              }
            : {}),
        },
      },
      {
        onSuccess: () => {
          setEditing(null);
          showFlash();
        },
      },
    );
  };

  const confirmCancel = () => {
    if (!cancelling) return;
    cancelTask.mutate(
      { token, slotId: cancelling.id },
      {
        onSuccess: () => {
          setCancelling(null);
          showFlash();
        },
      },
    );
  };

  // New-contact form
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [trusted, setTrusted] = useState(false);

  // Access-grant forms (sections A + E). Kept collapsed by default — sharing the
  // running of a page is a considered, occasional action, not a daily one.
  const [showAddManager, setShowAddManager] = useState(false);
  const [managerName, setManagerName] = useState("");
  const [managerContact, setManagerContact] = useState("");
  const [showGiveAccess, setShowGiveAccess] = useState(false);
  const [accessContact, setAccessContact] = useState("");

  // Feedback ("How it went"). `feedbackReopened` is the "Add something else"
  // link; `feedbackJustSent` shows the thank-you in the instant between the 201
  // and the refetch that sets data.feedbackGiven, so the form never flickers
  // back before the thank-you arrives.
  const [fbWentWell, setFbWentWell] = useState("");
  const [fbGotInTheWay, setFbGotInTheWay] = useState("");
  const [feedbackReopened, setFeedbackReopened] = useState(false);
  const [feedbackJustSent, setFeedbackJustSent] = useState(false);

  // Invite composition
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [openingLine, setOpeningLine] = useState("");
  const [previews, setPreviews] = useState<InvitePreview[] | null>(null);
  const [confirmBereavement, setConfirmBereavement] = useState(false);
  const [waveDate, setWaveDate] = useState("");
  const [copied, setCopied] = useState(false);

  const trustedTasks = useMemo(
    () => (data?.tasks ?? []).filter((t) => t.trustedHelpersOnly && !t.isClaimed),
    [data],
  );
  // Every task on the page, for the family management list (Item 17). Claimed
  // first (they carry the "someone's counting on this" weight), then by date.
  const allTasks = useMemo(
    () =>
      [...(data?.tasks ?? [])].sort((a, b) => {
        if (a.isClaimed !== b.isClaimed) return a.isClaimed ? -1 : 1;
        return (a.slotDate ?? "").localeCompare(b.slotDate ?? "");
      }),
    [data],
  );
  // Claimed tasks, newest first — the "watch help arrive" payoff (Item 8).
  const claimedTasks = useMemo(
    () =>
      (data?.tasks ?? [])
        .filter((t) => t.isClaimed)
        .sort((a, b) => (b.claimedAt ?? "").localeCompare(a.claimedAt ?? "")),
    [data],
  );

  // Where we reach the recipient when help arrives — editable so someone who
  // skipped it at activation can add it. Seeded once from the loaded state.
  const [reachEmail, setReachEmail] = useState("");
  const [reachMobile, setReachMobile] = useState("");
  const [reachSeeded, setReachSeeded] = useState(false);
  useEffect(() => {
    if (data && !reachSeeded) {
      setReachEmail(data.recipientEmail ?? "");
      setReachMobile(data.recipientMobile ?? "");
      setReachSeeded(true);
    }
  }, [data, reachSeeded]);

  // How Aunt Lucy writes to your people — the two invite-copy lines + (new_baby)
  // baby stage + pronouns. Seeded once from the stored RAW values (null → blank,
  // so the field shows ghost text). Blank fields save as null and fall back to
  // the occasion/baby-stage default at send time.
  const [situationLine, setSituationLine] = useState("");
  const [trustedLine, setTrustedLine] = useState("");
  const [babyStage, setBabyStage] = useState<BabyStage | null>(null);
  const [pronouns, setPronouns] = useState<RecipientPronouns>("they_them");
  const [copySeeded, setCopySeeded] = useState(false);
  useEffect(() => {
    if (data && !copySeeded) {
      setSituationLine(data.situationLine ?? "");
      setTrustedLine(data.trustedLine ?? "");
      setBabyStage(data.babyStage ?? null);
      setPronouns(data.recipientPronouns);
      setCopySeeded(true);
    }
  }, [data, copySeeded]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf7f2]">
        <Loader2 className="h-7 w-7 animate-spin text-[#2d6a4f]" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-[34rem] px-6 py-20 text-center">
        <p className="text-[1.05rem] text-[#52493f]">
          This management link isn't valid or has been turned off.
        </p>
      </div>
    );
  }

  const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const buildInvites = () =>
    Object.entries(selections)
      .filter(([, s]) => s.include)
      .map(([contactId, s]) => ({
        contactId,
        slotId: s.slotId,
        openingLine: openingLine.trim() || null,
      }));

  const anySelected = buildInvites().length > 0;
  const gated = data.bereavement && !confirmBereavement;

  // The thank-you PERSISTS: once this person has left feedback the block stays
  // as the thank-you on every later visit, and only the explicit "Add something
  // else" link puts the form back. `feedbackJustSent` covers the gap between
  // the 201 and the refetch, so the form never flashes back into view.
  const feedbackAnswered = data.feedbackGiven || feedbackJustSent;
  const showFeedbackForm = !feedbackAnswered || feedbackReopened;
  // Both boxes are optional; either one alone is enough to send.
  const feedbackReady = fbWentWell.trim().length > 0 || fbGotInTheWay.trim().length > 0;

  const onAddContact = () => {
    const c = contact.trim();
    addContact.mutate(
      {
        token,
        data: {
          name: name.trim(),
          mobile: c && !isEmail(c) ? c : null,
          email: c && isEmail(c) ? c : null,
          trusted,
        },
      },
      {
        onSuccess: () => {
          setName("");
          setContact("");
          setTrusted(false);
        },
      },
    );
  };

  const shareLink = data.shareLink;

  return (
    <div className="mx-auto max-w-[34rem] px-5 py-10">
      {/* Header */}
      <header className="mb-8 text-center">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[#d15b3e]">
          {data.recipientName}'s page
        </p>
        <h1 className="mt-2 font-serif text-[1.9rem] font-semibold text-[#2c2c2c]">
          Your people
        </h1>
        <p className="mx-auto mt-2 max-w-[32ch] text-[0.97rem] text-[#8b7e74]">
          Add a few names and we'll do the asking — gently, one wave at a time,
          so no one ever feels put on the spot.
        </p>
      </header>

      {/* See your card — the sealed workplace team-card keepsake, if any */}
      {data.cardKeepsakeUrl && (
        <a
          href={data.cardKeepsakeUrl}
          className="mb-7 flex items-center justify-between gap-3 rounded-[1.1rem] border border-[#e7ddd0] bg-white px-5 py-4 shadow-[0_10px_30px_-22px_rgba(74,58,42,0.5)] transition hover:-translate-y-0.5"
        >
          <span className="text-[0.97rem] font-semibold text-[#2c2c2c]">
            See your card 💛
          </span>
          <span className="text-[0.85rem] text-[#8b7e74]">
            The notes your team left you →
          </span>
        </a>
      )}

      {/* Bereavement: lead with self-share */}
      {data.bereavement && (
        <section className="mb-7 rounded-[1.1rem] border border-[#e7ddd0] bg-[#fbf3ee] px-5 py-4">
          <p className="mb-2 text-[0.95rem] leading-relaxed text-[#52493f]">
            At a time like this, sharing the link yourself — with just the people
            you choose, in your own words — is often the kindest way. Aunt Lucy
            can still send invites for you if you'd rather.
          </p>
          <div className="flex items-center gap-2 rounded-full border border-[#e7ddd0] bg-white px-4 py-2.5">
            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-[0.85rem] text-[#52493f]">
              {shareLink}
            </span>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(shareLink);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="flex flex-none items-center gap-1.5 rounded-full bg-[#2d6a4f] px-3 py-1.5 text-[0.78rem] font-semibold text-white"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </section>
      )}

      {/* Help arriving (Item 8) — the "watch help arrive" payoff. The recipient
          always sees who claimed, regardless of the helper's public choice. */}
      <section className="mb-7">
        <h2 className="mb-1 font-serif text-[1.15rem] font-semibold text-[#2c2c2c]">
          Support is on the way 💛
        </h2>
        <p className="mb-3 text-[0.9rem] text-[#8b7e74]">
          The people who've said yes. Nothing for you to do — just lovely to see.
        </p>
        {claimedTasks.length === 0 ? (
          <p className="rounded-[1rem] border border-dashed border-[#e7ddd0] bg-white px-4 py-4 text-[0.9rem] text-[#8b7e74]">
            No one's claimed a task just yet — but the moment someone does, they'll
            appear here, and we'll drop you a little note too.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {claimedTasks.map((t) => {
              const when = withWait(
                formatWhen(t.slotDate ?? null, t.slotTime ?? null),
                t.liftWaitMode,
              );
              return (
                <div
                  key={t.id}
                  className="rounded-[1rem] border border-[#e7ddd0] bg-white px-4 py-3"
                >
                  <p className="text-[0.98rem] text-[#2c2c2c]">
                    <span className="font-semibold">{t.claimedByName ?? "A friend"}</span>
                    {" — "}
                    {t.label}
                  </p>
                  {when && (
                    <p className="mt-0.5 text-[0.82rem] text-[#8b7e74]">{when}</p>
                  )}
                  {t.claimedNote && (
                    <p className="mt-1.5 rounded-[0.6rem] bg-[#f3eadd] px-3 py-2 text-[0.85rem] text-[#52493f]">
                      &ldquo;{t.claimedNote}&rdquo;
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Your tasks (Item 17) — change or cancel anything, claimed or not. */}
      {allTasks.length > 0 && (
        <section className="mb-7">
          <h2 className="mb-1 font-serif text-[1.15rem] font-semibold text-[#2c2c2c]">
            Your tasks
          </h2>
          <p className="mb-3 text-[0.9rem] text-[#8b7e74]">
            Plans change — that's alright. Change a time or take something off the
            list, and Aunt Lucy will let anyone who's helping know, kindly.
          </p>
          {flash && (
            <p className="mb-3 flex items-center gap-1.5 rounded-[0.7rem] bg-[#eef4ea] px-3.5 py-2.5 text-[0.9rem] text-[#2d6a4f]">
              <Check className="h-4 w-4" />
              {copy.done}
            </p>
          )}
          <div className="flex flex-col gap-2.5">
            {allTasks.map((t) => {
              const when = withWait(
                formatWhen(t.slotDate ?? null, t.slotTime ?? null),
                t.liftWaitMode,
              );
              return (
                <div
                  key={t.id}
                  className="rounded-[1rem] border border-[#e7ddd0] bg-white px-4 py-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.98rem] text-[#2c2c2c]">{t.label}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.82rem] text-[#8b7e74]">
                        {when && <span>{when}</span>}
                        <span className="inline-flex items-center rounded-full bg-[#f3eadd] px-2 py-0.5 text-[0.72rem] font-semibold text-[#8b7e74]">
                          {t.flexibility === "flexible" ? "Flexible time" : "Fixed time"}
                        </span>
                        {t.isClaimed && (
                          <span className="text-[#2d6a4f]">
                            {t.claimedByName ?? "A friend"} has this 💛
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-none items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(t)}
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.82rem] font-semibold text-[#2d6a4f] hover:bg-[#eef4ea]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {copy.editLink}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCancelling(t)}
                        aria-label={`Cancel ${t.label}`}
                        className="grid h-8 w-8 place-items-center rounded-full text-[#8b7e74] hover:bg-[#f3eadd] hover:text-[#d15b3e]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Where we'll reach you (Item 8) — editable so a recipient who skipped it
          at activation can add it. */}
      <section className="mb-7 rounded-[1.1rem] border border-[#e7ddd0] bg-white px-5 py-5">
        <h2 className="mb-1 font-serif text-[1.15rem] font-semibold text-[#2c2c2c]">
          Where should we send updates?
        </h2>
        <p className="mb-3 text-[0.88rem] text-[#8b7e74]">
          We'll let you know as help arrives — a little note each time someone
          steps in. Nothing else.
        </p>
        <div className="flex flex-col gap-2.5">
          <input
            value={reachEmail}
            onChange={(e) => setReachEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2.5 text-[0.97rem] text-[#2c2c2c] focus:border-[#2d6a4f] focus:outline-none"
          />
          <input
            value={reachMobile}
            onChange={(e) => setReachMobile(e.target.value)}
            placeholder="Mobile (optional)"
            className="w-full rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2.5 text-[0.97rem] text-[#2c2c2c] focus:border-[#2d6a4f] focus:outline-none"
          />
          <button
            type="button"
            disabled={updateDetails.isPending}
            onClick={() =>
              updateDetails.mutate({
                token,
                data: {
                  recipientEmail: reachEmail.trim() || null,
                  recipientMobile: reachMobile.trim() || null,
                },
              })
            }
            className="mt-1 self-start rounded-full bg-[#2d6a4f] px-5 py-2.5 text-[0.9rem] font-semibold text-white disabled:opacity-50"
          >
            {updateDetails.isPending ? "Saving…" : "Save"}
          </button>
          {updateDetails.isSuccess && (
            <p className="flex items-center gap-1.5 text-[0.88rem] text-[#2d6a4f]">
              <Check className="h-4 w-4" />
              Saved.
            </p>
          )}
          {updateDetails.isError && (
            <p className="text-[0.85rem] text-[#c0563a]">
              {(updateDetails.error as Error)?.message ?? "That didn't work — try again."}
            </p>
          )}
        </div>
      </section>

      {/* How Aunt Lucy writes to your people — the two invite-copy lines. Sits
          just above the people/invite config, since it sets how those messages
          read. Blank fields fall back to the gentle default shown as ghost text. */}
      <section className="mb-7 rounded-[1.1rem] border border-[#e7ddd0] bg-white px-5 py-5">
        <h2 className="mb-1 font-serif text-[1.15rem] font-semibold text-[#2c2c2c]">
          How Aunt Lucy writes to your people
        </h2>
        <p className="mb-3 text-[0.88rem] text-[#8b7e74]">
          This becomes part of the message your people get when you invite them —
          make it sound like you. Leave a line blank to use the gentle wording
          shown.
        </p>
        <div className="flex flex-col gap-3.5">
          <label className="text-[0.9rem] text-[#52493f]">
            {/* Bug #035c. `role` is derived from the grant behind *this* token,
                so it genuinely says who is holding the link — a recipient
                reading their own page shouldn't be addressed in third person. */}
            {data.role === "recipient" ? "Refer to you as" : `Refer to ${data.recipientName} as`}
            <select
              value={pronouns}
              onChange={(e) => setPronouns(e.target.value as RecipientPronouns)}
              className="mt-1 w-full rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2.5 text-[0.95rem] text-[#2c2c2c] focus:border-[#2d6a4f] focus:outline-none"
            >
              <option value="they_them">they / them</option>
              <option value="she_her">she / her</option>
              <option value="he_him">he / him</option>
            </select>
          </label>

          {data.occasion === "new_baby" && (
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
              — {data.recipientName}'s…
            </span>
            <input
              value={situationLine}
              maxLength={120}
              onChange={(e) => setSituationLine(e.target.value)}
              placeholder={((hint) => (hint ? `e.g. ${hint}` : ""))(
                situationHint({
                  occasion: data.occasion,
                  babyStage,
                  pronouns,
                  agnosticDefault: data.situationLineDefault ?? null,
                }),
              )}
              className="mt-1 w-full rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2.5 text-[0.95rem] text-[#2c2c2c] placeholder:text-[#b3a99d] focus:border-[#2d6a4f] focus:outline-none"
            />
          </label>

          <label className="text-[0.9rem] text-[#52493f]">
            The note for trusted people
            <span className="ml-1.5 text-[0.8rem] text-[#8b7e74]">
              — for the few people you'd trust with more — a house key, a
              pickup, the kids
            </span>
            <input
              value={trustedLine}
              maxLength={120}
              onChange={(e) => setTrustedLine(e.target.value)}
              placeholder={((hint) => (hint ? `e.g. ${hint}` : ""))(
                trustedHint({
                  occasion: data.occasion,
                  babyStage,
                  pronouns,
                  agnosticDefault: data.trustedLineDefault ?? null,
                }),
              )}
              className="mt-1 w-full rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2.5 text-[0.95rem] text-[#2c2c2c] placeholder:text-[#b3a99d] focus:border-[#2d6a4f] focus:outline-none"
            />
          </label>

          <button
            type="button"
            disabled={updateCopy.isPending}
            onClick={() =>
              updateCopy.mutate({
                token,
                data: {
                  recipientPronouns: pronouns,
                  situationLine: situationLine.trim() || null,
                  trustedLine: trustedLine.trim() || null,
                  babyStage,
                },
              })
            }
            className="mt-1 self-start rounded-full bg-[#2d6a4f] px-5 py-2.5 text-[0.9rem] font-semibold text-white disabled:opacity-50"
          >
            {updateCopy.isPending ? "Saving…" : "Save"}
          </button>
          {updateCopy.isSuccess && (
            <p className="flex items-center gap-1.5 text-[0.88rem] text-[#2d6a4f]">
              <Check className="h-4 w-4" />
              Saved.
            </p>
          )}
          {updateCopy.isError && (
            <p className="text-[0.85rem] text-[#c0563a]">
              {(updateCopy.error as Error)?.message ?? "That didn't work — try again."}
            </p>
          )}
        </div>
      </section>

      {/* Add a person */}
      <section className="mb-7 rounded-[1.1rem] border border-[#e7ddd0] bg-white px-5 py-5">
        <h2 className="mb-3 font-serif text-[1.15rem] font-semibold text-[#2c2c2c]">
          Add someone
        </h2>
        <div className="flex flex-col gap-2.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Their name"
            className="w-full rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2.5 text-[0.97rem] text-[#2c2c2c] focus:border-[#2d6a4f] focus:outline-none"
          />
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Mobile number or email"
            className="w-full rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2.5 text-[0.97rem] text-[#2c2c2c] focus:border-[#2d6a4f] focus:outline-none"
          />
          <label className="flex items-center gap-2.5 text-[0.9rem] text-[#52493f]">
            <input
              type="checkbox"
              checked={trusted}
              onChange={(e) => setTrusted(e.target.checked)}
              className="h-4 w-4 accent-[#2d6a4f]"
            />
            Someone I trust with the sensitive things (minding kids, pickups)
          </label>
          <button
            type="button"
            disabled={!name.trim() || !contact.trim() || addContact.isPending}
            onClick={onAddContact}
            className="mt-1 self-start rounded-full bg-[#2d6a4f] px-5 py-2.5 text-[0.9rem] font-semibold text-white disabled:opacity-50"
          >
            {addContact.isPending ? "Adding…" : "Add to my people"}
          </button>
          {addContact.isError && (
            <p className="text-[0.85rem] text-[#c0563a]">
              {(addContact.error as Error)?.message ?? "That didn't work — try again."}
            </p>
          )}
        </div>
      </section>

      {/* People list + invite selection */}
      {data.contacts.length > 0 && (
        <section className="mb-7">
          <h2 className="mb-3 font-serif text-[1.15rem] font-semibold text-[#2c2c2c]">
            Who to ask
          </h2>
          <div className="flex flex-col gap-2.5">
            {data.contacts.map((c) => {
              const sel = selections[c.id] ?? { include: false, slotId: null };
              return (
                <div
                  key={c.id}
                  className={`rounded-[1rem] border px-4 py-3 ${
                    c.optedOut
                      ? "border-dashed border-[#e0d6c8] opacity-60"
                      : "border-[#e7ddd0] bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      disabled={c.optedOut}
                      checked={sel.include}
                      onChange={(e) =>
                        setSelections((prev) => ({
                          ...prev,
                          [c.id]: { ...sel, include: e.target.checked },
                        }))
                      }
                      className="h-4 w-4 accent-[#2d6a4f]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.98rem] text-[#2c2c2c]">
                        {c.name}
                        {c.trusted && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[0.72rem] font-semibold text-[#a9701f]">
                            <ShieldCheck className="h-3 w-3" />
                            trusted
                          </span>
                        )}
                      </p>
                      <p className="truncate text-[0.8rem] text-[#8b7e74]">
                        {c.mobile ?? c.email}
                        {c.optedOut && " · opted out"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteContact.mutate({ token, contactId: c.id })}
                      aria-label={`Remove ${c.name}`}
                      className="grid h-8 w-8 flex-none place-items-center rounded-full text-[#8b7e74] hover:bg-[#f3eadd] hover:text-[#d15b3e]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Trusted person → optionally attach one sensitive task (9b) */}
                  {sel.include && c.trusted && trustedTasks.length > 0 && (
                    <select
                      value={sel.slotId ?? ""}
                      onChange={(e) =>
                        setSelections((prev) => ({
                          ...prev,
                          [c.id]: { ...sel, slotId: e.target.value || null },
                        }))
                      }
                      className="mt-2.5 w-full rounded-[0.6rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2 text-[0.88rem] text-[#2c2c2c] focus:border-[#2d6a4f] focus:outline-none"
                    >
                      <option value="">A general invite (anyone-can-help tasks)</option>
                      {trustedTasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          Ask about: {t.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Compose + review */}
      {data.contacts.length > 0 && (
        <section className="mb-7 rounded-[1.1rem] border border-[#e7ddd0] bg-white px-5 py-5">
          <label className="mb-1.5 block text-[0.9rem] font-semibold text-[#2c2c2c]">
            Add a personal line{" "}
            <span className="font-normal text-[#8b7e74]">(optional)</span>
          </label>
          <p className="mb-2 text-[0.83rem] text-[#8b7e74]">
            Shown above Aunt Lucy's message. The rest stays warm and no-pressure.
          </p>
          <textarea
            value={openingLine}
            maxLength={200}
            rows={2}
            onChange={(e) => setOpeningLine(e.target.value)}
            placeholder="Hi love — thought of you x"
            className="w-full rounded-[0.8rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2.5 text-[0.95rem] text-[#2c2c2c] placeholder:text-[#b3a99d] focus:border-[#2d6a4f] focus:outline-none"
          />

          <button
            type="button"
            disabled={!anySelected || preview.isPending}
            onClick={() =>
              preview.mutate(
                { token, data: { invites: buildInvites() } },
                { onSuccess: (r) => setPreviews(r.previews) },
              )
            }
            className="mt-3 inline-flex items-center gap-2 text-[0.9rem] font-semibold text-[#2d6a4f] underline underline-offset-4 disabled:opacity-40"
          >
            {preview.isPending ? "Preparing…" : "Preview the messages"}
          </button>

          {previews && (
            <div className="mt-4 flex flex-col gap-3">
              {previews.map((p) => (
                <div
                  key={p.contactId}
                  className="rounded-[0.8rem] bg-[#f3eadd] px-3.5 py-3 text-[0.88rem] leading-relaxed text-[#52493f]"
                >
                  {p.error ? (
                    <span className="text-[#c0563a]">{p.error}</span>
                  ) : (
                    <>
                      <p className="mb-1 text-[0.72rem] font-semibold uppercase tracking-wide text-[#8b7e74]">
                        {p.name} · {p.channel}
                        {p.kind === "trusted" && " · trusted"}
                      </p>
                      {p.subject && (
                        <p className="mb-1 font-semibold text-[#2c2c2c]">{p.subject}</p>
                      )}
                      <p className="whitespace-pre-wrap">{p.body}</p>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Bereavement confirmation gate */}
          {data.bereavement && anySelected && (
            <label className="mt-4 flex items-start gap-2.5 text-[0.88rem] text-[#52493f]">
              <input
                type="checkbox"
                checked={confirmBereavement}
                onChange={(e) => setConfirmBereavement(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#2d6a4f]"
              />
              I'd like Aunt Lucy to send these invites for me.
            </label>
          )}

          {/* Send / schedule */}
          <div className="mt-4 flex flex-col gap-3 border-t border-[#e7ddd0] pt-4">
            <button
              type="button"
              disabled={!anySelected || gated || send.isPending}
              onClick={() =>
                send.mutate(
                  {
                    token,
                    data: { invites: buildInvites(), confirmed: confirmBereavement },
                  },
                  { onSuccess: () => setPreviews(null) },
                )
              }
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#2d6a4f] px-6 py-3 font-serif text-[1.02rem] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(45,106,79,0.7)] transition-all hover:-translate-y-0.5 hover:bg-[#245842] disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {send.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-4 w-4" />}
              Send now
            </button>

            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                value={waveDate}
                onChange={(e) => setWaveDate(e.target.value)}
                className="flex-1 rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2 text-[0.88rem] text-[#2c2c2c] focus:border-[#2d6a4f] focus:outline-none"
              />
              <button
                type="button"
                disabled={!anySelected || gated || !waveDate || schedule.isPending}
                onClick={() =>
                  schedule.mutate(
                    {
                      token,
                      data: {
                        invites: buildInvites(),
                        confirmed: confirmBereavement,
                        scheduledFor: new Date(waveDate).toISOString(),
                      },
                    },
                    { onSuccess: () => setPreviews(null) },
                  )
                }
                className="inline-flex flex-none items-center gap-1.5 rounded-full border border-[#2d6a4f] px-4 py-2 text-[0.85rem] font-semibold text-[#2d6a4f] disabled:opacity-40"
              >
                <Clock className="h-4 w-4" />
                Next wave
              </button>
            </div>

            {(send.isSuccess || schedule.isSuccess) && (
              <p className="flex items-center gap-1.5 text-[0.9rem] text-[#2d6a4f]">
                <Check className="h-4 w-4" />
                Done — Aunt Lucy's on it.
              </p>
            )}
          </div>
        </section>
      )}

      {/* What's been sent */}
      {data.invites.length > 0 && (
        <section className="mb-7">
          <h2 className="mb-3 font-serif text-[1.15rem] font-semibold text-[#2c2c2c]">
            Invites so far
          </h2>
          <div className="flex flex-col gap-1.5">
            {data.invites.map((i) => (
              <div
                key={i.id}
                className="flex items-center justify-between rounded-[0.7rem] border border-[#e7ddd0] bg-white px-3.5 py-2 text-[0.88rem]"
              >
                <span className="text-[#2c2c2c]">{i.name}</span>
                {/* Every state is muted except "couldn't send", which takes the
                    body colour the name itself uses (bug #048). A friend who
                    was never reached should not read at the same weight as one
                    who was — that is the bug's own shape, in visual form. Body
                    colour and nothing else: no red, no bold, no icon, no badge.
                    There is no resend control yet, so it has to read as a fact
                    on a warm page, not as an alarm. */}
                <span
                  className={
                    !i.claimedAt && i.status === "failed"
                      ? "text-[#2c2c2c]"
                      : "text-[#8b7e74]"
                  }
                >
                  {i.claimedAt ? "helping 💛" : INVITE_STATUS_LABEL[i.status]}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Who has access (B) + share the running (A) + take it back (C) ──
          A considered, occasional area — kept quiet and low on the page. All
          copy here is a SUGGESTION for Kate to approve. */}
      <section className="mb-7 rounded-[1.1rem] border border-[#e7ddd0] bg-white px-5 py-5">
        <h2 className="mb-1 font-serif text-[1.15rem] font-semibold text-[#2c2c2c]">
          Who can run this page
        </h2>
        <p className="mb-3 text-[0.88rem] text-[#8b7e74]">
          The people who can see everything and help keep things organised. It's
          never a mystery who has the keys.
        </p>

        {/* Section E — gentle, non-urgent nudge to give the affected person their
            own always-on access, shown only while they don't yet have it. */}
        {!data.recipientHasOwnAccess && (
          <div className="mb-4 rounded-[1rem] border border-[#e7ddd0] bg-[#fbf3ee] px-4 py-3.5">
            <p className="text-[0.9rem] leading-relaxed text-[#52493f]">
              {data.recipientName} doesn't have their own way into this page yet.
              Whenever they're ready, you can give them their own private link —
              it's their page, after all.
            </p>
            {showGiveAccess ? (
              <div className="mt-3 flex flex-col gap-2.5">
                <input
                  value={accessContact}
                  onChange={(e) => setAccessContact(e.target.value)}
                  placeholder={`${data.recipientName}'s mobile or email`}
                  className="w-full rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2.5 text-[0.97rem] text-[#2c2c2c] focus:border-[#2d6a4f] focus:outline-none"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!accessContact.trim() || grantAccess.isPending}
                    onClick={() =>
                      grantAccess.mutate(
                        { token, data: { contact: accessContact.trim() } },
                        {
                          onSuccess: () => {
                            setAccessContact("");
                            setShowGiveAccess(false);
                          },
                        },
                      )
                    }
                    className="rounded-full bg-[#2d6a4f] px-5 py-2.5 text-[0.88rem] font-semibold text-white disabled:opacity-50"
                  >
                    {grantAccess.isPending ? "Sending…" : `Send ${data.recipientName} their link`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGiveAccess(false)}
                    className="text-[0.85rem] text-[#8b7e74]"
                  >
                    Not now
                  </button>
                </div>
                {grantAccess.isError && (
                  <p className="text-[0.85rem] text-[#c0563a]">
                    {(grantAccess.error as Error)?.message ?? "That didn't work — try again."}
                  </p>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowGiveAccess(true)}
                className="mt-2 text-[0.88rem] font-semibold text-[#2d6a4f] underline underline-offset-4"
              >
                Give {data.recipientName} their own access
              </button>
            )}
          </div>
        )}

        {/* Section B — the list of everyone with an active grant. */}
        <div className="flex flex-col gap-2">
          {data.managers.map((m) => {
            const isRecipient = m.role === "recipient";
            const displayName = isRecipient
              ? data.recipientName
              : m.personName ?? "A helper";
            return (
              <div
                key={m.grantId}
                className="flex items-center gap-3 rounded-[1rem] border border-[#e7ddd0] bg-[#faf7f2] px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.98rem] text-[#2c2c2c]">
                    {displayName}
                    {m.isSelf && (
                      <span className="ml-1.5 text-[0.8rem] text-[#8b7e74]">(you)</span>
                    )}
                    {isRecipient && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[0.72rem] font-semibold text-[#a9701f]">
                        <ShieldCheck className="h-3 w-3" />
                        their page
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[0.8rem] text-[#8b7e74]">
                    {isRecipient
                      ? "Can always see everything — this can't be removed"
                      : m.personContact ?? "Helping run the page"}
                  </p>
                </div>
                {m.canRevoke && (
                  <button
                    type="button"
                    disabled={revokeManager.isPending}
                    onClick={() => revokeManager.mutate({ token, grantId: m.grantId })}
                    aria-label={`Remove ${displayName}`}
                    className="grid h-8 w-8 flex-none place-items-center rounded-full text-[#8b7e74] hover:bg-[#f3eadd] hover:text-[#d15b3e] disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {revokeManager.isError && (
          <p className="mt-2 text-[0.85rem] text-[#c0563a]">
            {(revokeManager.error as Error)?.message ?? "That didn't work — try again."}
          </p>
        )}

        {/* Section A — share the running with someone new (collapsed default). */}
        <div className="mt-4 border-t border-[#e7ddd0] pt-4">
          {showAddManager ? (
            <div className="flex flex-col gap-2.5">
              <input
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                placeholder="Their name"
                className="w-full rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2.5 text-[0.97rem] text-[#2c2c2c] focus:border-[#2d6a4f] focus:outline-none"
              />
              <input
                value={managerContact}
                onChange={(e) => setManagerContact(e.target.value)}
                placeholder="Their mobile number or email"
                className="w-full rounded-[0.7rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2.5 text-[0.97rem] text-[#2c2c2c] focus:border-[#2d6a4f] focus:outline-none"
              />
              <p className="text-[0.8rem] text-[#8b7e74]">
                They'll get their own private link and can see and change
                everything you can. You can take this back any time.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!managerName.trim() || !managerContact.trim() || addManager.isPending}
                  onClick={() =>
                    addManager.mutate(
                      { token, data: { name: managerName.trim(), contact: managerContact.trim() } },
                      {
                        onSuccess: () => {
                          setManagerName("");
                          setManagerContact("");
                          setShowAddManager(false);
                        },
                      },
                    )
                  }
                  className="rounded-full bg-[#2d6a4f] px-5 py-2.5 text-[0.88rem] font-semibold text-white disabled:opacity-50"
                >
                  {addManager.isPending ? "Sending…" : "Send them access"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddManager(false)}
                  className="text-[0.85rem] text-[#8b7e74]"
                >
                  Cancel
                </button>
              </div>
              {addManager.isError && (
                <p className="text-[0.85rem] text-[#c0563a]">
                  {(addManager.error as Error)?.message ?? "That didn't work — try again."}
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddManager(true)}
              className="text-[0.9rem] font-semibold text-[#2d6a4f] underline underline-offset-4"
            >
              Share the running of this page with someone
            </button>
          )}
        </div>
      </section>

      {/* ── How it went (the feedback button) ─────────────────────────────
          Offered only once at least one task has been claimed: someone whose
          page has had no claims has nothing to report yet, and asking them
          reads as a product fishing rather than listening.

          It lives HERE, on the organiser's own management page, and NOT on the
          public /s/:slug — the reason is register, not scope. A "how did we do?"
          button on a public page sits beside someone's cancer, and every helper
          arriving to drop off a meal would be asked to rate an experience that
          is not theirs. Same fault as #072's shield icon: a perfectly reasonable
          element making the wrong claim about the moment.

          No section heading, on purpose. Kate's signed line IS the opening — a
          heading above it would be a second ask, and "How did it go?" in
          console chrome is exactly the survey register the copy avoids. */}
      {data.feedbackVisible && (
        <section className="mb-7 rounded-[1.1rem] border border-[#e7ddd0] bg-white px-5 py-5">
          {showFeedbackForm ? (
            <>
              <p className="text-[0.95rem] leading-relaxed text-[#52493f]">{fb.intro}</p>
              <p className="mt-1 text-[0.95rem] text-[#52493f]">{fb.signature}</p>

              <label className="mt-5 block">
                <span className="mb-1.5 block text-[0.9rem] font-semibold text-[#2c2c2c]">
                  {fb.labelWentWell}
                </span>
                <textarea
                  value={fbWentWell}
                  rows={3}
                  onChange={(e) => setFbWentWell(e.target.value)}
                  className="w-full rounded-[0.8rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2.5 text-[0.95rem] leading-relaxed text-[#2c2c2c] focus:border-[#2d6a4f] focus:outline-none"
                />
              </label>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-[0.9rem] font-semibold text-[#2c2c2c]">
                  {fb.labelGotInTheWay}
                </span>
                <textarea
                  value={fbGotInTheWay}
                  rows={3}
                  onChange={(e) => setFbGotInTheWay(e.target.value)}
                  className="w-full rounded-[0.8rem] border border-[#e0d6c8] bg-[#faf7f2] px-3 py-2.5 text-[0.95rem] leading-relaxed text-[#2c2c2c] focus:border-[#2d6a4f] focus:outline-none"
                />
              </label>

              <button
                type="button"
                disabled={!feedbackReady || submitFeedback.isPending}
                onClick={() =>
                  submitFeedback.mutate(
                    {
                      token,
                      data: {
                        wentWell: fbWentWell.trim() || null,
                        gotInTheWay: fbGotInTheWay.trim() || null,
                      },
                    },
                    {
                      onSuccess: () => {
                        // The thank-you REPLACES the form, immediately. Not a
                        // toast: a message that vanishes after four seconds
                        // says "a system received your data", and someone who
                        // has just written about their mother dying needs a
                        // person answering instead.
                        setFbWentWell("");
                        setFbGotInTheWay("");
                        setFeedbackReopened(false);
                        setFeedbackJustSent(true);
                        invalidate();
                      },
                    },
                  )
                }
                className="mt-5 rounded-full bg-[#2d6a4f] px-6 py-2.5 text-[0.95rem] font-semibold text-white disabled:opacity-40"
              >
                {submitFeedback.isPending ? fb.submitBusy : fb.submit}
              </button>

              {submitFeedback.isError && (
                <p className="mt-3 text-[0.88rem] text-[#c0563a]">{fb.failed}</p>
              )}
            </>
          ) : (
            <>
              <p className="text-[0.95rem] leading-relaxed text-[#52493f]">{fb.thanks}</p>
              <p className="mt-1 text-[0.95rem] text-[#52493f]">{fb.signature}</p>
              <button
                type="button"
                onClick={() => {
                  setFeedbackJustSent(false);
                  setFeedbackReopened(true);
                }}
                className="mt-4 text-[0.9rem] font-semibold text-[#2d6a4f] underline underline-offset-4"
              >
                {fb.addMore}
              </button>
            </>
          )}
        </section>
      )}

      <div className="mt-8 text-center">
        <a
          href={`/s/${data.slug}`}
          className="inline-flex items-center gap-1.5 text-[0.9rem] font-semibold text-[#2d6a4f] underline underline-offset-4"
        >
          See the page helpers see
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>

      {/* Edit task dialog (Item 17) */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <>
            <DialogHeader>
              <DialogTitle>{copy.editLink}</DialogTitle>
              {editing.isClaimed && (
                <DialogDescription>
                  {copy.editingClaimedNotice(editing.claimedByName ?? "A friend")}
                </DialogDescription>
              )}
            </DialogHeader>

            <div className="flex flex-col gap-4 text-left">
              <label className="flex flex-col gap-1.5">
                <span className="text-[0.85rem] font-semibold text-foreground">What</span>
                <input
                  value={editForm.customLabel}
                  onChange={(e) => setEditForm((f) => ({ ...f, customLabel: e.target.value }))}
                  placeholder={editing.label}
                  className="w-full rounded-[0.7rem] border border-border bg-background px-3 py-2.5 text-[0.97rem] text-foreground focus:border-primary focus:outline-none"
                />
              </label>

              <div className="flex gap-3">
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="text-[0.85rem] font-semibold text-foreground">Date</span>
                  <input
                    type="date"
                    value={editForm.slotDate}
                    onChange={(e) => setEditForm((f) => ({ ...f, slotDate: e.target.value }))}
                    className="w-full rounded-[0.7rem] border border-border bg-background px-3 py-2.5 text-[0.97rem] text-foreground focus:border-primary focus:outline-none"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="text-[0.85rem] font-semibold text-foreground">Time</span>
                  <input
                    type="time"
                    value={editForm.slotTime}
                    onChange={(e) => setEditForm((f) => ({ ...f, slotTime: e.target.value }))}
                    className="w-full rounded-[0.7rem] border border-border bg-background px-3 py-2.5 text-[0.97rem] text-foreground focus:border-primary focus:outline-none"
                  />
                </label>
              </div>

              {/* Bug #033 — the wait-or-not answer is editable here because it
                  is the fact most likely to change once the appointment is
                  actually booked. Shown only for a dated errand (the same
                  isLiftCandidate rule as everywhere else), and "Not set" is a
                  real choice: it returns the task to showing nothing at all. */}
              {isLiftCandidate(editing?.slotType ?? "", !!editForm.slotDate) && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[0.85rem] font-semibold text-foreground">
                    Does the helper wait?
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {LIFT_WAIT_MODES.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={editForm.liftWaitMode === mode}
                        onClick={() =>
                          setEditForm((f) => ({
                            ...f,
                            liftWaitMode: f.liftWaitMode === mode ? "" : mode,
                          }))
                        }
                        className={`rounded-full border px-4 py-2 text-[0.85rem] font-semibold transition ${
                          editForm.liftWaitMode === mode
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground"
                        }`}
                      >
                        {LIFT_WAIT_MODE_LABELS[mode]}
                      </button>
                    ))}
                  </div>
                  <p className="text-[0.8rem] text-muted-foreground">
                    {editForm.liftWaitMode
                      ? "Helpers see this before they claim. Changing it tells whoever already has this one."
                      : "Not set — helpers see nothing about waiting. Tap one to say."}
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <span className="text-[0.85rem] font-semibold text-foreground">
                  Can a helper nudge the time?
                </span>
                <div className="flex gap-2">
                  {(["flexible", "fixed"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setEditForm((f) => ({ ...f, flexibility: opt }))}
                      className={`flex-1 rounded-full border px-4 py-2 text-[0.85rem] font-semibold transition ${
                        editForm.flexibility === opt
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground"
                      }`}
                    >
                      {opt === "flexible" ? "Flexible" : "Fixed"}
                    </button>
                  ))}
                </div>
                <p className="text-[0.8rem] text-muted-foreground">
                  {editForm.flexibility === "flexible"
                    ? "A helper can shift the time of day themselves — good for meals and errands."
                    : "The time is set — a helper gets a note, never an edit. Good for pickups and appointments."}
                </p>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-[0.85rem] font-semibold text-foreground">
                  Notes <span className="font-normal text-muted-foreground">(optional)</span>
                </span>
                <textarea
                  value={editForm.notes}
                  rows={2}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full rounded-[0.7rem] border border-border bg-background px-3 py-2.5 text-[0.95rem] text-foreground focus:border-primary focus:outline-none"
                />
              </label>

              {editing.slotType === "meal" && (
                <div className="flex gap-3">
                  <label className="flex flex-1 flex-col gap-1.5">
                    <span className="text-[0.85rem] font-semibold text-foreground">Dietary needs</span>
                    <input
                      value={editForm.dietaryNotes}
                      onChange={(e) => setEditForm((f) => ({ ...f, dietaryNotes: e.target.value }))}
                      className="w-full rounded-[0.7rem] border border-border bg-background px-3 py-2.5 text-[0.95rem] text-foreground focus:border-primary focus:outline-none"
                    />
                  </label>
                  <label className="flex w-24 flex-col gap-1.5">
                    <span className="text-[0.85rem] font-semibold text-foreground">Feeding</span>
                    <input
                      type="number"
                      min={1}
                      value={editForm.headcount}
                      onChange={(e) => setEditForm((f) => ({ ...f, headcount: e.target.value }))}
                      className="w-full rounded-[0.7rem] border border-border bg-background px-3 py-2.5 text-[0.95rem] text-foreground focus:border-primary focus:outline-none"
                    />
                  </label>
                </div>
              )}

              {editTask.isError && (
                <p className="text-[0.85rem] text-destructive">
                  {(editTask.error as Error)?.message ?? "That didn't work — please try again."}
                </p>
              )}

              <button
                type="button"
                disabled={editTask.isPending}
                onClick={saveEdit}
                className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-[#2d6a4f] px-6 py-3 font-serif text-[1.02rem] font-semibold text-white disabled:opacity-50"
              >
                {editTask.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {copy.saveButtonBusy}
                  </>
                ) : (
                  copy.saveButton
                )}
              </button>
            </div>
          </>
        )}
      </Dialog>

      {/* Cancel task confirm dialog (Item 17) */}
      <Dialog open={cancelling !== null} onOpenChange={(o) => !o && setCancelling(null)}>
        {cancelling && (
          <>
            <DialogHeader>
              <DialogTitle>
                {cancelling.isClaimed
                  ? copy.cancelClaimed.title(cancelling.label)
                  : copy.cancelUnclaimed.title}
              </DialogTitle>
              <DialogDescription>
                {cancelling.isClaimed
                  ? copy.cancelClaimed.body(cancelling.claimedByName ?? "A friend")
                  : copy.cancelUnclaimed.body}
              </DialogDescription>
            </DialogHeader>

            {cancelTask.isError && (
              <p className="mb-3 text-[0.85rem] text-destructive">
                {(cancelTask.error as Error)?.message ?? "That didn't work — please try again."}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setCancelling(null)}
                className="rounded-full border border-border px-5 py-2.5 text-[0.9rem] font-semibold text-foreground"
              >
                {cancelling.isClaimed ? copy.cancelClaimed.keep : copy.cancelUnclaimed.keep}
              </button>
              <button
                type="button"
                disabled={cancelTask.isPending}
                onClick={confirmCancel}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#c0563a] px-5 py-2.5 text-[0.9rem] font-semibold text-white disabled:opacity-50"
              >
                {cancelTask.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {cancelling.isClaimed ? copy.cancelClaimed.confirm : copy.cancelUnclaimed.confirm}
              </button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}

export default Manage;
