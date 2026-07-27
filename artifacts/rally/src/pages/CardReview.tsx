import { useState } from "react";
import { useRoute } from "wouter";
import { motion } from "framer-motion";
import { Heart, Copy, Check, Trash2, Send, Loader2, X } from "lucide-react";
import {
  useGetOrganiserCard,
  useRemoveSigning,
  useSealCard,
  useUpdateCardOrganisation,
  getGetOrganiserCardQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const NOTE_TINTS = ["#fdf4ee", "#f4f6f0", "#fbf1e8", "#f5f2ea", "#fdf3f0", "#f2f5f1"];

function apiError(err: unknown): string {
  const data = (err as { data?: { error?: string } } | null)?.data;
  return data?.error ?? "Something went wrong — please try again.";
}

export default function CardReview() {
  const [, params] = useRoute("/card/:organiserToken");
  const token = params?.organiserToken ?? "";
  const queryClient = useQueryClient();
  const queryKey = getGetOrganiserCardQueryKey(token);

  const { data, isLoading, isError } = useGetOrganiserCard(token, {
    query: { queryKey, enabled: !!token, retry: false },
  });

  const [copied, setCopied] = useState(false);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [confirmSeal, setConfirmSeal] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const remove = useRemoveSigning({ mutation: { onSuccess: invalidate } });
  const seal = useSealCard({ mutation: { onSuccess: invalidate } });
  const updateOrg = useUpdateCardOrganisation({ mutation: { onSuccess: invalidate } });

  function copyLink(link: string) {
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function removeNote(id: string) {
    if (!window.confirm("Remove this note? It won't appear on the card.")) return;
    remove.mutate({ organiserToken: token, id });
  }

  function saveOrg() {
    updateOrg.mutate({
      organiserToken: token,
      data: { organisationName: (orgName ?? "").trim() },
    });
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen w-full bg-[#faf7f2]">
      <div className="mx-auto min-h-screen w-full max-w-[34rem] px-6 pb-16">
        <div className="flex items-center gap-2 pt-[1.4rem] text-[0.85rem] text-[#8b7e74]">
          <Heart className="h-4 w-4 text-[#e76f51]" fill="currentColor" />
          Your team card ·{" "}
          <strong className="font-serif font-semibold text-[#52493f]">
            Aunt Lucy
          </strong>
        </div>
        {children}
      </div>
    </div>
  );

  if (isLoading) {
    return shell(
      <div className="flex flex-col items-center gap-4 py-[4rem] text-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#2d6a4f]" />
        <p className="font-serif text-[#8b7e74]">Opening your card…</p>
      </div>,
    );
  }

  if (isError || !data) {
    return shell(
      <div className="flex flex-col items-center gap-3 py-[3.5rem] text-center">
        <h1 className="font-serif text-[1.8rem] font-semibold text-[#2c2c2c]">
          This card link isn't valid
        </h1>
        <p className="max-w-[34ch] text-[#52493f]">
          Please double-check the link from your confirmation email.
        </p>
      </div>,
    );
  }

  const { recipientFirstName, organisationName, signingLink, sealed, signings } = data;
  const orgValue = orgName ?? organisationName ?? "";

  // Already sent — a calm confirmation, no controls.
  if (sealed) {
    return shell(
      <div className="flex flex-col items-center gap-[1.1rem] py-[3.5rem] text-center">
        <div
          className="grid h-[72px] w-[72px] place-items-center rounded-full shadow-[0_12px_26px_-10px_rgba(45,106,79,0.6)]"
          style={{
            background: "radial-gradient(120% 120% at 30% 25%, #3f8a68, #245842)",
          }}
          aria-hidden="true"
        >
          <Check className="h-[34px] w-[34px] text-white" strokeWidth={2.5} />
        </div>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[#d15b3e]">
          Sent 💛
        </p>
        <h1 className="font-serif text-[1.9rem] font-semibold text-[#2c2c2c]">
          {recipientFirstName}'s card is on its way
        </h1>
        <p className="max-w-[36ch] text-[#52493f]">
          The card's sealed with {signings.length}{" "}
          {signings.length === 1 ? "note" : "notes"}. {recipientFirstName} will
          see it when they open their gift.
        </p>
      </div>,
    );
  }

  return (
    <>
      {shell(
        <>
          {/* Share */}
          <div className="mt-[1.4rem] rounded-[1.2rem] border border-[#e7ddd0] bg-white px-6 py-6 shadow-[0_10px_30px_-20px_rgba(74,58,42,0.4)]">
            <h1 className="font-serif text-[1.6rem] font-semibold text-[#2c2c2c]">
              Your team card is ready
            </h1>
            <p className="mt-2 text-[0.98rem] leading-[1.55] text-[#52493f]">
              Share this link so everyone can add a note — one link, no accounts,
              a few seconds each. When you're ready, you'll review the card and
              send it to {recipientFirstName}.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <input
                readOnly
                value={signingLink}
                className="min-w-0 flex-1 truncate rounded-[0.8rem] border border-[#e7ddd0] bg-[#faf7f2] px-3 py-2.5 text-[0.9rem] text-[#52493f]"
              />
              <button
                type="button"
                onClick={() => copyLink(signingLink)}
                className="inline-flex flex-none items-center gap-1.5 rounded-full bg-[#2d6a4f] px-4 py-2.5 text-[0.9rem] font-semibold text-white transition hover:bg-[#245842]"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" /> Copy the signing link
                  </>
                )}
              </button>
            </div>

            {/* Optional organisation name */}
            <div className="mt-5 border-t border-[#f0e9df] pt-4">
              <label
                htmlFor="org-name"
                className="text-[0.85rem] font-semibold text-[#52493f]"
              >
                Your organisation{" "}
                <span className="font-normal text-[#8b7e74]">
                  (optional — shows as "everyone at …")
                </span>
              </label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="org-name"
                  value={orgValue}
                  maxLength={80}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g. Brightpath Studio"
                  className="min-w-0 flex-1 rounded-[0.8rem] border border-[#e7ddd0] bg-white px-3 py-2.5 text-[0.9rem] text-[#2c2c2c] focus:border-[#2d6a4f] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={saveOrg}
                  disabled={updateOrg.isPending || orgValue.trim() === (organisationName ?? "")}
                  className="flex-none rounded-full border border-[#2d6a4f] px-4 py-2.5 text-[0.9rem] font-semibold text-[#2d6a4f] transition hover:bg-[#2d6a4f]/5 disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="mt-8">
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif text-[1.5rem] font-semibold text-[#2c2c2c]">
                {recipientFirstName}'s card
              </h2>
              <span className="text-[0.9rem] text-[#8b7e74]">
                {signings.length} {signings.length === 1 ? "note" : "notes"} so far
              </span>
            </div>

            {signings.length === 0 ? (
              <p className="mt-6 rounded-[1.1rem] border border-dashed border-[#e0d6c8] px-5 py-8 text-center text-[#8b7e74]">
                No notes yet. Share the link above and they'll appear here.
              </p>
            ) : (
              <div className="mt-4 flex flex-col gap-[0.9rem]">
                {signings.map((note, i) => (
                  <div
                    key={note.id}
                    className="group relative rounded-[1.1rem] border px-[1.25rem] pt-[1.15rem] pb-[1.05rem] shadow-[0_10px_30px_-20px_rgba(74,58,42,0.4)]"
                    style={{
                      background: NOTE_TINTS[i % NOTE_TINTS.length],
                      borderColor: "rgba(140,110,80,0.14)",
                    }}
                  >
                    <p className="mb-[0.6rem] whitespace-pre-wrap break-words pr-8 text-[1.02rem] leading-[1.5] text-[#2c2c2c]">
                      {note.message}
                    </p>
                    <span className="font-serif text-[1.05rem] italic text-[#245842]">
                      <span className="not-italic text-[#8b7e74]">— </span>
                      {note.signerName}
                    </span>
                    <button
                      type="button"
                      aria-label="Remove this note"
                      onClick={() => removeNote(note.id)}
                      disabled={remove.isPending}
                      className="absolute right-3 top-3 rounded-full p-1.5 text-[#b8ac9e] transition hover:bg-white/60 hover:text-[#d15b3e] disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(remove.isError || seal.isError || updateOrg.isError) && (
            <p className="mt-4 rounded-[0.75rem] bg-[#fbeae5] px-4 py-3 text-[0.9rem] text-[#b23a20]">
              {apiError(remove.error || seal.error || updateOrg.error)}
            </p>
          )}

          {/* Send */}
          <button
            type="button"
            onClick={() => setConfirmSeal(true)}
            disabled={seal.isPending}
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#2d6a4f] px-8 py-4 font-serif text-[1.1rem] font-semibold text-white shadow-[0_14px_30px_-12px_rgba(45,106,79,0.7)] transition hover:-translate-y-0.5 hover:bg-[#245842] disabled:opacity-50"
          >
            {seal.isPending ? (
              <>
                Sending… <Loader2 className="h-5 w-5 animate-spin" />
              </>
            ) : (
              <>
                Send the card <Send className="h-5 w-5" />
              </>
            )}
          </button>
          <p className="mt-2 text-center text-[0.82rem] text-[#8b7e74]">
            Sending seals the card — no more notes after that.
          </p>
        </>,
      )}

      {/* Confirm seal */}
      {confirmSeal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-[26rem] rounded-[1.4rem] bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between">
              <h3 className="font-serif text-[1.35rem] font-semibold text-[#2c2c2c]">
                Send {recipientFirstName}'s card?
              </h3>
              <button
                type="button"
                aria-label="Cancel"
                onClick={() => setConfirmSeal(false)}
                className="rounded-full p-1 text-[#b8ac9e] hover:bg-[#faf7f2]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-3 text-[0.98rem] leading-[1.55] text-[#52493f]">
              Sending seals the card — no more notes can be added, and{" "}
              {recipientFirstName} will see it when they open their gift. Ready to
              send?
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmSeal(false)}
                className="flex-1 rounded-full border border-[#e7ddd0] py-3 font-semibold text-[#52493f] transition hover:bg-[#faf7f2]"
              >
                Not yet
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmSeal(false);
                  seal.mutate({ organiserToken: token });
                }}
                className="flex-1 rounded-full bg-[#2d6a4f] py-3 font-semibold text-white transition hover:bg-[#245842]"
              >
                Send the card
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
