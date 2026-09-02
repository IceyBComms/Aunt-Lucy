import { useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { TeacupMark } from "@/components/TeacupMark";
import { SiteFooter } from "@/components/SiteFooter";
import {
  Heart,
  Utensils,
  Car,
  ShoppingBag,
  Dog,
  Shirt,
  BellOff,
} from "lucide-react";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: "easeOut" },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.12 } },
};

const STEPS = [
  {
    title: "You gift it.",
    body: "Buy an Aunt Lucy page, add a personal note, choose when it arrives.",
  },
  {
    title: "They add their trusted circle.",
    body: "When they've got a quiet moment, they tell Aunt Lucy what they'll need and who they trust. Nothing's live yet.",
  },
  {
    title: "Aunt Lucy takes it from there.",
    body: "One tap, and the support begins to flow — meals, lifts, whatever's needed, and for weeks, not just the first rushed few days.",
  },
];

const SLOT_TYPES = [
  { icon: Utensils, label: "Meals and food delivery" },
  { icon: ShoppingBag, label: "Grocery runs" },
  { icon: Dog, label: "Dog walking" },
  { icon: Car, label: "School and kinder pickups" },
  { icon: Shirt, label: "Laundry and errands" },
  { icon: Heart, label: "Timed, welcome visits" },
  { icon: BellOff, label: "\"No visitors this week\"" },
];

export default function Home() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Nav */}
      <nav className="w-full px-6 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <TeacupMark className="w-10 h-10" />
            <span className="font-serif font-bold text-foreground text-lg">Aunt Lucy</span>
          </div>
          {/* "For employers" sits quietly beside sign-in — present for HR
              buyers, deliberately not competing with the consumer CTA. */}
          <div className="flex items-center gap-5">
            <button
              onClick={() => setLocation("/employers")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              For employers
            </button>
            <button
              onClick={() => setLocation("/organise")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <motion.section
        className="flex-1 flex flex-col items-center justify-center text-center px-6 pt-12 pb-20"
        variants={stagger}
        initial="initial"
        animate="animate"
      >
        <motion.div
          variants={fadeUp}
          className="inline-flex items-center gap-2 bg-primary/8 text-primary text-sm font-medium px-4 py-1.5 rounded-full mb-8"
        >
          Free for helpers · No app needed
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="font-serif text-5xl sm:text-6xl font-bold text-foreground leading-[1.1] mb-6 max-w-2xl"
        >
          Give them help,{" "}
          <span className="text-primary">not more stuff</span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="font-serif text-2xl sm:text-3xl text-foreground leading-snug mb-6"
        >
          Gift them their own Aunt Lucy
        </motion.p>

        <motion.p
          variants={fadeUp}
          className="text-lg text-muted-foreground leading-relaxed max-w-xl mb-4"
        >
          Aunt Lucy is the warm, organised friend who takes charge when life gets
          full-on — sorting the meals, picking up the kids, making endless cups
          of tea.
        </motion.p>

        <motion.p
          variants={fadeUp}
          className="text-lg text-foreground font-medium leading-relaxed max-w-xl mb-10"
        >
          Not everyone has an Aunt Lucy. But everyone deserves one.
        </motion.p>

        <motion.div variants={fadeUp} className="flex flex-col items-center gap-4">
          <Button
            asChild
            size="lg"
            variant="accent"
            className="text-base px-8 py-6 h-auto font-serif shadow-lg shadow-accent/20 hover:shadow-accent/30 transition-shadow"
          >
            <Link href="/buy">Gift Aunt Lucy</Link>
          </Button>
        </motion.div>
      </motion.section>

      {/* The problem — and Aunt Lucy's job */}
      <section className="bg-card border-t border-border/50 py-20 px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="max-w-2xl mx-auto text-center"
        >
          <h2 className="font-serif text-3xl font-bold text-foreground mb-5">
            Everyone means well. Nobody steps up.
          </h2>
          <p className="text-muted-foreground leading-relaxed text-lg mb-6">
            When life turns upside down — a new baby, an operation, an illness —
            everyone says "let me know if you need anything," and they mean it.
            But the person going through it is the last one who can organise
            it.
          </p>
          <p className="font-serif text-xl text-foreground leading-relaxed">
            That's Aunt Lucy's job: one page, one link, everything handled.
          </p>
        </motion.div>
      </section>

      {/* How it works */}
      <section className="bg-card border-t border-border/50 py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-serif text-3xl font-bold text-foreground text-center mb-14">
            How it works
          </h2>

          <div className="grid sm:grid-cols-3 gap-10">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="flex flex-col items-center text-center"
              >
                <div className="w-14 h-14 bg-accent text-accent-foreground rounded-full flex items-center justify-center font-serif text-2xl font-bold mb-5">
                  {i + 1}
                </div>
                <h3 className="font-serif text-lg font-semibold text-foreground mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Real help, not vague offers */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-serif text-3xl font-bold text-foreground mb-3">
            Real help, not vague offers
          </h2>
          <p className="text-muted-foreground mb-12">
            Helpers tap one link, see what's needed, and claim a slot. No app. No
            account. No fuss.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {SLOT_TYPES.map((type, i) => (
              <motion.div
                key={type.label}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="bg-card border border-border/60 rounded-2xl p-5 flex flex-col items-center gap-3"
              >
                <div className="w-11 h-11 bg-primary/8 rounded-xl flex items-center justify-center">
                  <type.icon className="w-5 h-5 text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground">{type.label}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-card border-t border-border/50 py-20 px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center gap-10"
        >
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-primary uppercase tracking-wide mb-2">
              Pricing
            </p>
            <h2 className="font-serif text-3xl font-bold text-foreground mb-4">
              One price. Eight weeks of coordinated support.
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              $59 for one Aunt Lucy gift page, valid for 12 months. Eight weeks
              of coordinated support from the moment they need it.
            </p>
            <Link
              href="/employers"
              className="text-sm text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
            >
              Buying for a team or workplace? See employer pricing.
            </Link>
          </div>
          <div className="shrink-0">
            <Button
              asChild
              size="lg"
              variant="outline"
              className="font-serif text-base border-primary/40 text-primary hover:bg-primary/5"
            >
              <Link href="/buy">Gift Aunt Lucy — $59</Link>
            </Button>
          </div>
        </motion.div>
      </section>

      {/* The quiet line — the free crisis path: present, never sold.

          Bug #095: a real buyer read this and concluded it was a scam. "No card,
          no catch" was already here, and said twice more on /hardest-times, so
          MORE REASSURANCE IS THE FAILED TREATMENT — it is what a scam says too.
          The sentence that replaced it gives a REASON instead. It stays in the
          same paragraph, same text-sm muted type, no heading, no box, no bold:
          anything that draws the eye turns an explanation into a pitch, and a
          pitch is what a suspicious reader is already braced for.

          "No card, no catch" is GONE from this block (Kate, 2 Sep) — it was the
          failed treatment, and the reason now does its job. It still stands
          twice on /hardest-times, which is a different reader at a different
          moment.

          THE LINK SAYS "Set up a page", NOT "Start free". "Start free" is
          freemium language — free-to-START — inside a sentence that says free
          ALWAYS, on the exact page where a buyer decided this was a con. It
          also did not foreshadow its destination, whose own button reads
          "Set up my page". Aunt Lucy is a $59 product with a free crisis path,
          never a free product with a paid tier; nothing here may blur that.

          NO ABN OR ENTITY NAME HERE — that belongs in the footer, not beside
          someone's diagnosis. It is in SiteFooter, which this page renders. */}
      <section className="py-12 px-6">
        <div className="max-w-xl mx-auto text-center">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Going through a loss or a sudden illness right now? Aunt Lucy is free
            for the hardest times — always. The paid version funds the free one,
            and the free one is why I built it.{" "}
            <button
              onClick={() => setLocation("/hardest-times")}
              className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
            >
              Set up a page
            </button>
          </p>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-primary py-20 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="max-w-xl mx-auto"
        >
          <h2 className="font-serif text-4xl font-bold text-primary-foreground mb-10">
            The people you love deserve more than another bunch of flowers.
          </h2>
          <Button
            asChild
            size="lg"
            className="bg-white text-primary hover:bg-white/90 text-base px-8 py-6 h-auto font-serif shadow-xl"
          >
            <Link href="/buy">Give them Aunt Lucy — $59</Link>
          </Button>
          <p className="text-primary-foreground/50 text-sm mt-4">
            Two minutes to gift · Free for helpers · No app needed
          </p>
        </motion.div>
      </section>

      <SiteFooter />
    </div>
  );
}
