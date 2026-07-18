import { useRoute } from "wouter";
import { motion } from "framer-motion";
import { Heart, ChevronDown, ArrowRight, Lock, Loader2 } from "lucide-react";
import { useGetGift, getGetGiftQueryKey } from "@workspace/api-client-react";
import { PostmarkMark } from "@/components/PostmarkMark";

// Warm tints cycled through the colleague notes, matching the mockup.
const NOTE_TINTS = ["#fdf4ee", "#f4f6f0", "#fbf1e8", "#f5f2ea", "#fdf3f0", "#f2f5f1"];

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: "easeOut" },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.12 } },
};

export default function GiftExperience() {
  const [, params] = useRoute("/gift/:giftId");
  // The :giftId in the URL is the gift's unguessable redemption token.
  const token = params?.giftId ?? "";

  const { data, isLoading, isError } = useGetGift(token, {
    query: {
      queryKey: getGetGiftQueryKey(token),
      enabled: !!token,
      retry: false,
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#faf7f2] p-6">
        <Loader2 className="mb-4 h-9 w-9 animate-spin text-[#2d6a4f]" />
        <p className="font-serif text-lg text-[#8b7e74]">Opening your gift…</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#faf7f2] p-6 text-center">
        <PostmarkMark className="mb-6 h-20 w-20 opacity-70" />
        <h1 className="mb-3 font-serif text-3xl font-semibold text-[#2c2c2c]">
          This gift link isn't valid
        </h1>
        <p className="max-w-[32ch] text-[#52493f]">
          The link may be incomplete or the gift may have been removed. If
          someone shared it with you, please double-check it.
        </p>
      </div>
    );
  }

  const { recipientName, organisationMessage, giftedBy, signings } = data;
  const paragraphs = (organisationMessage ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const noteCount = signings.length;

  return (
    <div className="min-h-screen w-full bg-[#faf7f2]">
      <div className="mx-auto min-h-screen w-full max-w-[30rem] overflow-hidden bg-gradient-to-b from-[#f6ece5] via-[#faf7f2] to-[#faf7f2]">
        {/* HERO — the unwrapping */}
        <motion.header
          className="flex flex-col items-center gap-[1.15rem] px-7 pt-[3.4rem] pb-[2.6rem] text-center"
          variants={stagger}
          initial="initial"
          animate="animate"
        >
          <motion.div variants={fadeUp} aria-hidden="true">
            <PostmarkMark className="h-[84px] w-[84px]" />
          </motion.div>

          <motion.p
            variants={fadeUp}
            className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[#d15b3e]"
          >
            A little something for you
          </motion.p>

          <motion.h1
            variants={fadeUp}
            className="font-serif text-[clamp(3rem,15vw,3.9rem)] font-semibold leading-[1.02] tracking-tight text-[#2c2c2c]"
          >
            {recipientName}
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="max-w-[24ch] text-[1.02rem] text-[#52493f]"
          >
            <strong className="font-semibold text-[#2d6a4f]">{giftedBy}</strong>{" "}
            put this together, just for you.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-1 flex flex-col items-center gap-1.5 text-[0.78rem] uppercase tracking-[0.14em] text-[#8b7e74]"
          >
            <span>Have a read</span>
            <motion.span
              animate={{ y: [0, 4, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            >
              <ChevronDown className="h-[18px] w-[18px]" />
            </motion.span>
          </motion.div>
        </motion.header>

        {/* THE LETTER — organisation's message */}
        {paragraphs.length > 0 && (
          <section className="px-6 py-[1.4rem]">
            <motion.article
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5 }}
              className="relative rounded-[1.4rem] border border-[#e7ddd0] bg-white px-[1.6rem] pt-[1.9rem] pb-[1.7rem] shadow-[0_10px_30px_-18px_rgba(74,58,42,0.4)]"
            >
              <span className="absolute -top-[0.85rem] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#2d6a4f] px-[0.95rem] py-[0.4rem] text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_6px_16px_-8px_rgba(45,106,79,0.7)]">
                Gifted by {giftedBy}
              </span>

              {paragraphs.map((para, i) =>
                i === 0 ? (
                  <p
                    key={i}
                    className="mb-[0.9rem] mt-[0.6rem] font-serif text-[1.28rem] leading-[1.4] text-[#2c2c2c]"
                  >
                    {para}
                  </p>
                ) : (
                  <p key={i} className="mb-[0.9rem] text-[1rem] text-[#52493f]">
                    {para}
                  </p>
                ),
              )}

              <div className="mt-[1.3rem] flex items-center gap-3 border-t border-[#e7ddd0] pt-[1.1rem]">
                <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-[#f3eadd] font-serif text-[1.1rem] font-bold text-[#2d6a4f]">
                  {giftedBy.trim().charAt(0).toUpperCase()}
                </div>
                <div className="leading-tight">
                  <div className="font-serif font-semibold text-[#2c2c2c]">
                    {giftedBy}
                  </div>
                </div>
              </div>
            </motion.article>
          </section>
        )}

        {/* COLLEAGUE NOTES — gift_signings */}
        {noteCount > 0 && (
          <>
            <div className="px-6 pt-[2.2rem] pb-[0.4rem] text-center">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[#d15b3e]">
                Signed with love
              </p>
              <h2 className="mt-2 font-serif text-[1.7rem] font-semibold text-[#2c2c2c]">
                What everyone wanted to say
              </h2>
              <p className="mt-2 text-[0.95rem] text-[#8b7e74]">
                {noteCount} {noteCount === 1 ? "person" : "people"} left you a
                note.
              </p>
            </div>

            <div className="flex flex-col gap-[1.05rem] px-6 pt-[1.4rem] pb-[0.6rem]">
              {signings.map((note, i) => {
                const deg = i % 2 === 0 ? -1.1 : 1;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 16, rotate: deg }}
                    whileInView={{ opacity: 1, y: 0, rotate: deg }}
                    viewport={{ once: true, margin: "-30px" }}
                    transition={{ duration: 0.4 }}
                    className="rounded-[1.1rem] border px-[1.25rem] pt-[1.15rem] pb-[1.05rem] shadow-[0_10px_30px_-18px_rgba(74,58,42,0.4)]"
                    style={{
                      background: NOTE_TINTS[i % NOTE_TINTS.length],
                      borderColor: "rgba(140,110,80,0.14)",
                    }}
                  >
                    <p className="mb-[0.7rem] text-[1.02rem] leading-[1.5] text-[#2c2c2c]">
                      {note.message}
                    </p>
                    <span className="font-serif text-[1.05rem] italic text-[#245842]">
                      <span className="not-italic text-[#8b7e74]">— </span>
                      {note.signerName}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}

        {/* ACTIVATION */}
        <section className="mx-[1.25rem] mt-8 rounded-t-[1.6rem] border border-b-0 border-[#e7ddd0] bg-gradient-to-b from-[#faf7f2] to-[#f3eadd] px-[1.6rem] pt-[2.3rem] pb-[2.5rem] text-center">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[#d15b3e]">
            Whenever you're ready
          </p>
          <h2 className="mt-2 mb-[0.7rem] font-serif text-[1.75rem] font-semibold text-[#2c2c2c]">
            Ready when you are.
          </h2>
          <p className="mx-auto mb-[1.6rem] max-w-[26ch] text-[1rem] text-[#52493f]">
            Takes a couple of minutes. You choose what help you'd like, and we'll
            take it from there.
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-[0.55rem] rounded-full bg-[#2d6a4f] px-[2.1rem] py-4 font-serif text-[1.12rem] font-semibold text-white shadow-[0_14px_30px_-12px_rgba(45,106,79,0.7)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#245842] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#2d6a4f]/35"
          >
            Set up my page
            <ArrowRight className="h-5 w-5" />
          </button>
          <p className="mt-[1.1rem] flex items-center justify-center gap-1.5 text-[0.85rem] text-[#8b7e74]">
            <Lock className="h-[15px] w-[15px] text-[#2d6a4f]" />
            Private and free · no account needed
          </p>
        </section>

        <div className="flex items-center justify-center gap-[0.45rem] bg-[#f3eadd] px-6 pt-[1.4rem] pb-8 text-[0.8rem] text-[#8b7e74]">
          <Heart className="h-[15px] w-[15px] text-[#e76f51]" fill="currentColor" />
          Made with care ·{" "}
          <strong className="font-serif font-semibold text-[#52493f]">
            Aunt Lucy
          </strong>
        </div>
      </div>
    </div>
  );
}
