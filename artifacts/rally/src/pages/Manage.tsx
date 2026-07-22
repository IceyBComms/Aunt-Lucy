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
  type InvitePreview,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

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
  }
  return out;
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

  // New-contact form
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [trusted, setTrusted] = useState(false);

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
          always sees who claimed, regardless of the helper's public choice.
          PLACEHOLDER copy — Kate to approve. */}
      {claimedTasks.length > 0 && (
        <section className="mb-7">
          <h2 className="mb-1 font-serif text-[1.15rem] font-semibold text-[#2c2c2c]">
            Help on the way 💛
          </h2>
          <p className="mb-3 text-[0.9rem] text-[#8b7e74]">
            People who've stepped in — nothing for you to do, just lovely to see.
          </p>
          <div className="flex flex-col gap-2.5">
            {claimedTasks.map((t) => {
              const when = formatWhen(t.slotDate ?? null, t.slotTime ?? null);
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
        </section>
      )}

      {/* Where we'll reach you (Item 8) — editable so a recipient who skipped it
          at activation can add it. PLACEHOLDER copy — Kate to approve. */}
      <section className="mb-7 rounded-[1.1rem] border border-[#e7ddd0] bg-white px-5 py-5">
        <h2 className="mb-1 font-serif text-[1.15rem] font-semibold text-[#2c2c2c]">
          Where we'll reach you
        </h2>
        <p className="mb-3 text-[0.88rem] text-[#8b7e74]">
          We'll let you know when someone's helped — nothing else.
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
                <span className="text-[#8b7e74]">
                  {i.claimedAt
                    ? "helping 💛"
                    : i.status === "sent"
                      ? "invited"
                      : i.status === "queued"
                        ? "queued"
                        : i.status}
                </span>
              </div>
            ))}
          </div>
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
    </div>
  );
}

export default Manage;
