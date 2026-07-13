import { motion } from "framer-motion";
import { Heart, ChevronDown, ArrowRight, Lock } from "lucide-react";

// Placeholder content mirroring the approved mockup. Data wiring (recipient,
// organisation, message and signings pulled from the gift record) comes in a
// later task — this component is presentational only for now.
const RECIPIENT = "Sarah";
const ORG = "Brightpath Studio";

const LETTER_LEAD = `${RECIPIENT} — before you head off, we wanted to say something properly.`;

const LETTER_PARAGRAPHS = [
  "These next few months are going to be big, beautiful and, let's be honest, a little bit chaotic. We couldn't be happier for you and Dan.",
  "So we've sorted something practical. Whenever you're ready, this becomes your own private page where we can drop off meals, run the odd errand, or just lend a hand around the house — no asking required, no fuss.",
  "Go and soak up every newborn cuddle. We've got your back over here.",
];

const NOTES = [
  {
    tint: "#fdf4ee",
    message:
      "So thrilled for you! Can't wait to meet the little one. I'm on standby for as many lasagnes as you can eat.",
    name: "Priya",
  },
  {
    tint: "#f4f6f0",
    message:
      "Enjoy every cuddle. The studio won't be the same without your very particular coffee order. See you when you're ready. x",
    name: "Tom",
  },
  {
    tint: "#fbf1e8",
    message:
      "Sending you so much love. I've done the newborn thing twice — ring me at 3am, I'll be up too. Genuinely, anytime.",
    name: "Meg",
  },
  {
    tint: "#f5f2ea",
    message:
      "Congratulations Sarah! Put your feet up and let us do the running around. School runs, shopping, whatever — just say.",
    name: "Hannah",
  },
  {
    tint: "#fdf3f0",
    message:
      "The best is yet to come. So happy for you and Dan. We'll keep your desk plant alive, promise.",
    name: "Dev",
  },
  {
    tint: "#f2f5f1",
    message:
      "Wishing you rest, cuddles and the occasional full night's sleep. We're all cheering you on from Fitzroy.",
    name: "James",
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: "easeOut" },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.12 } },
};

export default function GiftExperience() {
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
          <motion.div
            variants={fadeUp}
            className="relative grid h-[74px] w-[74px] place-items-center rounded-full"
            style={{
              background:
                "radial-gradient(120% 120% at 30% 25%, #e76f51 0%, #d15b3e 78%)",
              boxShadow:
                "inset 0 2px 4px rgba(255,255,255,0.35), inset 0 -6px 12px rgba(120,40,20,0.4), 0 8px 20px -8px rgba(209,91,62,0.6)",
            }}
            aria-hidden="true"
          >
            <div className="absolute inset-[7px] rounded-full border-[1.5px] border-dashed border-white/50" />
            <Heart className="relative h-[30px] w-[30px] text-white" fill="currentColor" />
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
            {RECIPIENT}
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="max-w-[22ch] text-[1.02rem] text-[#52493f]"
          >
            The whole team at{" "}
            <strong className="font-semibold text-[#2d6a4f]">{ORG}</strong> put
            this together, just for you.
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
        <section className="px-6 py-[1.4rem]">
          <motion.article
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5 }}
            className="relative rounded-[1.4rem] border border-[#e7ddd0] bg-white px-[1.6rem] pt-[1.9rem] pb-[1.7rem] shadow-[0_10px_30px_-18px_rgba(74,58,42,0.4)]"
          >
            <span className="absolute -top-[0.85rem] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#2d6a4f] px-[0.95rem] py-[0.4rem] text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_6px_16px_-8px_rgba(45,106,79,0.7)]">
              Gifted by {ORG}
            </span>

            <p className="mb-[0.9rem] mt-[0.6rem] font-serif text-[1.28rem] leading-[1.4] text-[#2c2c2c]">
              {LETTER_LEAD}
            </p>

            {LETTER_PARAGRAPHS.map((para, i) => (
              <p key={i} className="mb-[0.9rem] text-[1rem] text-[#52493f]">
                {para}
              </p>
            ))}

            <div className="mt-[1.3rem] flex items-center gap-3 border-t border-[#e7ddd0] pt-[1.1rem]">
              <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-[#f3eadd] font-serif text-[1.1rem] font-bold text-[#2d6a4f]">
                B
              </div>
              <div className="leading-tight">
                <div className="font-serif font-semibold text-[#2c2c2c]">
                  Everyone at Brightpath
                </div>
                <div className="text-[0.82rem] text-[#8b7e74]">
                  Your team · Fitzroy
                </div>
              </div>
            </div>
          </motion.article>
        </section>

        {/* COLLEAGUE NOTES — gift_signings */}
        <div className="px-6 pt-[2.2rem] pb-[0.4rem] text-center">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[#d15b3e]">
            Signed with love
          </p>
          <h2 className="mt-2 font-serif text-[1.7rem] font-semibold text-[#2c2c2c]">
            What the team wanted to say
          </h2>
          <p className="mt-2 text-[0.95rem] text-[#8b7e74]">
            Twelve of your colleagues left you a note.
          </p>
        </div>

        <div className="flex flex-col gap-[1.05rem] px-6 pt-[1.4rem] pb-[0.6rem]">
          {NOTES.map((note, i) => {
            const deg = i % 2 === 0 ? -1.1 : 1;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16, rotate: deg }}
                whileInView={{ opacity: 1, y: 0, rotate: deg }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ duration: 0.4 }}
                className="rounded-[1.1rem] border px-[1.25rem] pt-[1.15rem] pb-[1.05rem] shadow-[0_10px_30px_-18px_rgba(74,58,42,0.4)]"
                style={{ background: note.tint, borderColor: "rgba(140,110,80,0.14)" }}
              >
                <p className="mb-[0.7rem] text-[1.02rem] leading-[1.5] text-[#2c2c2c]">
                  {note.message}
                </p>
                <span className="font-serif text-[1.05rem] italic text-[#245842]">
                  <span className="not-italic text-[#8b7e74]">— </span>
                  {note.name}
                </span>
              </motion.div>
            );
          })}
        </div>

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
