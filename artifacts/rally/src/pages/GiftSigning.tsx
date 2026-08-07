import { useState, type FormEvent } from "react";
import { useRoute } from "wouter";
import { motion } from "framer-motion";
import { Heart, ArrowRight, Check, Loader2 } from "lucide-react";
import {
  useGetSignCard,
  useSignCard,
  getGetSignCardQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

// A note, not an essay — the server enforces this too.
const MAX = 500;

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "•";
}

function apiError(err: unknown): string {
  const data = (err as { data?: { error?: string } } | null)?.data;
  return data?.error ?? "Something went wrong — please try again.";
}

export default function GiftSigning() {
  const [, params] = useRoute("/sign/:signingToken");
  const token = params?.signingToken ?? "";
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useGetSignCard(token, {
    query: {
      queryKey: getGetSignCardQueryKey(token),
      enabled: !!token,
      retry: false,
    },
  });

  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const sign = useSignCard({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSignCardQueryKey(token) });
        setSubmitted(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      },
    },
  });

  const canSubmit =
    name.trim().length > 0 && message.trim().length > 0 && !sign.isPending;
  const counterWarn = message.length > MAX - 40;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    sign.mutate({
      signingToken: token,
      data: { signerName: name.trim(), message: message.trim() },
    });
  }

  function handleAnother() {
    setName("");
    setMessage("");
    setSubmitted(false);
    sign.reset();
  }

  const shell = (children: React.ReactNode) => (
    <div
      className="min-h-screen w-full bg-[#faf7f2]"
      style={{
        background:
          "radial-gradient(120% 55% at 50% -8%, #f6ece5 0%, #faf7f2 55%), #faf7f2",
      }}
    >
      <div className="mx-auto min-h-screen w-full max-w-[30rem] pb-10">
        <div className="flex items-center gap-2 px-6 pt-[1.2rem] text-[0.85rem] text-[#8b7e74]">
          <Heart className="h-4 w-4 text-[#e76f51]" fill="currentColor" />
          A gift being put together with{" "}
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
      <div className="flex flex-col items-center gap-4 px-7 py-[4rem] text-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#2d6a4f]" />
        <p className="font-serif text-[#8b7e74]">Opening the card…</p>
      </div>,
    );
  }

  if (isError || !data) {
    return shell(
      <div className="flex flex-col items-center gap-3 px-7 py-[3.5rem] text-center">
        <h1 className="font-serif text-[1.8rem] font-semibold text-[#2c2c2c]">
          This signing link isn't valid
        </h1>
        <p className="max-w-[30ch] text-[#52493f]">
          The link may be incomplete. If someone shared it with you, please
          double-check it.
        </p>
      </div>,
    );
  }

  const { recipientFirstName, organiserName, organisationName, signedCount, closed } =
    data;

  // The card's already been sent — thank them warmly and show nothing to fill in.
  if (closed && !submitted) {
    return shell(
      <div className="flex flex-col items-center gap-[1.1rem] px-7 py-[3.5rem] text-center">
        <div
          className="grid h-[60px] w-[60px] place-items-center rounded-full font-serif text-[1.5rem] font-bold text-[#d15b3e]"
          style={{ background: "linear-gradient(135deg, #f0d9cb, #e9c4b0)" }}
          aria-hidden="true"
        >
          {initialOf(recipientFirstName)}
        </div>
        <h1 className="font-serif text-[1.8rem] font-semibold text-[#2c2c2c]">
          {recipientFirstName}'s card is on its way
        </h1>
        <p className="max-w-[30ch] text-[#52493f]">
          This card's been sent already — but thank you for wanting to sign.
        </p>
      </div>,
    );
  }

  if (submitted) {
    return shell(
      <div className="flex flex-col items-center gap-[1.1rem] px-7 py-[3.5rem] text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="grid h-[72px] w-[72px] place-items-center rounded-full shadow-[0_12px_26px_-10px_rgba(45,106,79,0.6)]"
          style={{
            background: "radial-gradient(120% 120% at 30% 25%, #3f8a68, #245842)",
          }}
          aria-hidden="true"
        >
          <Check className="h-[34px] w-[34px] text-white" strokeWidth={2.5} />
        </motion.div>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[#d15b3e]">
          Your note's in 💛
        </p>
        <h2 className="font-serif text-[1.8rem] font-semibold text-[#2c2c2c]">
          Your note's on the card.
        </h2>
        <p className="max-w-[30ch] text-[#52493f]">
          Your note's been added to {recipientFirstName}'s card. When everyone's
          signed, {organiserName} will send it — and it'll be waiting for{" "}
          {recipientFirstName} when they're ready.
        </p>
        <button
          type="button"
          onClick={handleAnother}
          className="mt-1 cursor-pointer font-semibold text-[#2d6a4f] underline underline-offset-[3px]"
        >
          Add another note
        </button>
      </div>,
    );
  }

  return shell(
    <>
      {/* Intro */}
      <div className="flex flex-col items-center gap-[0.9rem] px-6 pt-[1.6rem] pb-[0.4rem] text-center">
        <div
          className="grid h-[60px] w-[60px] place-items-center rounded-full font-serif text-[1.5rem] font-bold text-[#d15b3e] shadow-[inset_0_2px_5px_rgba(255,255,255,0.5),0_8px_18px_-10px_rgba(209,91,62,0.5)]"
          style={{ background: "linear-gradient(135deg, #f0d9cb, #e9c4b0)" }}
          aria-hidden="true"
        >
          {initialOf(recipientFirstName)}
        </div>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[#d15b3e]">
          A card for {recipientFirstName}
        </p>
        <h1 className="font-serif text-[1.9rem] font-semibold leading-[1.15] text-[#2c2c2c]">
          Add your note to {recipientFirstName}'s card
        </h1>
        <p className="max-w-[32ch] text-[1rem] text-[#52493f]">
          <strong className="font-semibold text-[#2d6a4f]">{organiserName}</strong>{" "}
          is putting together a card
          {organisationName ? (
            <>
              {" "}from everyone at{" "}
              <strong className="font-semibold text-[#2d6a4f]">
                {organisationName}
              </strong>
            </>
          ) : (
            <> for {recipientFirstName}</>
          )}
          . A line or two is all it takes — it means more than you'd think.
        </p>
      </div>

      {/* Live preview */}
      <div className="px-6 pt-[1.6rem] pb-[0.4rem]">
        <p className="mb-3 text-center text-[0.78rem] uppercase tracking-[0.14em] text-[#8b7e74]">
          Your note, as it'll appear
        </p>
        <div
          className="min-h-[6.2rem] rounded-[1.1rem] border px-[1.3rem] pt-[1.25rem] pb-[1.15rem] shadow-[0_10px_30px_-18px_rgba(74,58,42,0.4)]"
          style={{
            background: "#fdf4ee",
            borderColor: "rgba(140,110,80,0.16)",
            transform: "rotate(-1deg)",
          }}
        >
          {message.trim() ? (
            <p className="mb-[0.7rem] whitespace-pre-wrap break-words text-[1.04rem] leading-[1.5] text-[#2c2c2c]">
              {message}
            </p>
          ) : (
            <p className="mb-[0.7rem] text-[1.04rem] italic leading-[1.5] text-[#8b7e74]">
              Your message will appear here…
            </p>
          )}
          <span
            className={`font-serif text-[1.05rem] italic ${
              name.trim() ? "text-[#245842]" : "text-[#8b7e74]"
            }`}
          >
            <span className="not-italic text-[#8b7e74]">— </span>
            {name.trim() || "your name"}
          </span>
        </div>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-[1.1rem] px-6 pt-[1.4rem]"
      >
        <div className="flex flex-col gap-[0.45rem]">
          <label
            htmlFor="signer-name"
            className="text-[0.9rem] font-semibold text-[#52493f]"
          >
            Your name
          </label>
          <input
            id="signer-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoComplete="name"
            placeholder={'e.g. Priya — or "the whole Finance team"'}
            className="w-full rounded-[0.9rem] border-[1.5px] border-[#e7ddd0] bg-white px-4 py-[0.85rem] text-[1rem] text-[#2c2c2c] transition placeholder:text-[#b8ac9e] focus:border-[#2d6a4f] focus:shadow-[0_0_0_4px_rgba(45,106,79,0.12)] focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-[0.45rem]">
          <label
            htmlFor="signer-message"
            className="flex items-baseline justify-between text-[0.9rem] font-semibold text-[#52493f]"
          >
            Your note
            <span
              className={`text-[0.8rem] font-medium tabular-nums ${
                counterWarn ? "text-[#d15b3e]" : "text-[#8b7e74]"
              }`}
            >
              {message.length} / {MAX}
            </span>
          </label>
          <textarea
            id="signer-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={MAX}
            placeholder="Thinking of you — the whole team's got your back. Take all the time you need."
            className="min-h-[5.5rem] w-full resize-none rounded-[0.9rem] border-[1.5px] border-[#e7ddd0] bg-white px-4 py-[0.85rem] text-[1rem] leading-[1.5] text-[#2c2c2c] transition placeholder:text-[#b8ac9e] focus:border-[#2d6a4f] focus:shadow-[0_0_0_4px_rgba(45,106,79,0.12)] focus:outline-none"
          />
        </div>

        {sign.isError && (
          <p className="rounded-[0.75rem] bg-[#fbeae5] px-4 py-3 text-[0.9rem] text-[#b23a20]">
            {apiError(sign.error)}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-[0.3rem] inline-flex items-center justify-center gap-2 rounded-full bg-[#2d6a4f] px-8 py-4 font-serif text-[1.1rem] font-semibold text-white shadow-[0_14px_30px_-12px_rgba(45,106,79,0.7)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#245842] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#2d6a4f]/35 disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-45 disabled:shadow-none"
        >
          {sign.isPending ? (
            <>
              Adding…
              <Loader2 className="h-[19px] w-[19px] animate-spin" />
            </>
          ) : (
            <>
              Add my note
              <ArrowRight className="h-[19px] w-[19px]" />
            </>
          )}
        </button>
      </form>

      <p className="px-6 pt-[1.1rem] text-center text-[0.85rem] leading-[1.5] text-[#8b7e74]">
        <span className="font-semibold text-[#245842]">
          {signedCount > 0
            ? `${signedCount} ${signedCount === 1 ? "person has" : "people have"} signed so far`
            : "Be the first to sign."}
        </span>
        <br />
        Your note becomes part of {recipientFirstName}'s card · free · no account
        needed.
      </p>
    </>,
  );
}
