import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { PostmarkMark } from "@/components/PostmarkMark";
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
    title: "You buy it",
    body: "Purchase an Aunt Lucy page for your friend. Write a personal message and choose when to deliver it — the baby shower, their last day at work, the due date.",
  },
  {
    title: "Your crew signs it",
    body: "Share a private link with friends before delivery day. Everyone leaves a short warm note. Takes 60 seconds. No account needed.",
  },
  {
    title: "They receive something beautiful",
    body: "A stunning digital gift — their name, your message, and every note from the people who love them, revealed as they scroll.",
  },
  {
    title: "They set it up while they still have energy",
    body: "Before baby arrives, they add everything they know they'll need — meals, dog walking, school pickups for older kids, visiting preferences. They decide who they trust with sensitive tasks. Everything is ready. Nothing is live yet.",
  },
  {
    title: "They hit go when the moment comes",
    body: "When labour starts, when they get home from hospital, when they're ready — one button and their support network is notified. Helpers claim slots. The help begins.",
  },
  {
    title: "Eight weeks of real support",
    body: "From the moment they launch it, their people show up for eight weeks — the window when new parents need it most and when support usually drops off.",
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
            <PostmarkMark className="w-10 h-10" />
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
          <Heart className="w-3.5 h-3.5 fill-primary/30" />
          Free for helpers · No app needed · 8 weeks of support from launch
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
          className="text-lg text-muted-foreground leading-relaxed max-w-xl mb-10"
        >
          The gift that sets up a support network before baby arrives — meals,
          errands, school pickups and visits, ready to go the moment they need
          it.
        </motion.p>

        <motion.div variants={fadeUp} className="flex flex-col items-center gap-4">
          <Button
            asChild
            size="lg"
            variant="accent"
            className="text-base px-8 py-6 h-auto font-serif shadow-lg shadow-accent/20 hover:shadow-accent/30 transition-shadow"
          >
            {/* Placeholder — $59 Stripe checkout link added later */}
            <a href="#">Gift an Aunt Lucy page — $59</a>
          </Button>
          <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
            Two minutes to buy · They set it up before baby arrives · One button
            to launch when the moment comes
          </p>
        </motion.div>
      </motion.section>

      {/* Section 1 — the problem */}
      <section className="bg-card border-t border-border/50 py-20 px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="max-w-2xl mx-auto text-center"
        >
          <h2 className="font-serif text-3xl font-bold text-foreground mb-5">
            Everyone means well. Nobody coordinates.
          </h2>
          <p className="text-muted-foreground leading-relaxed text-lg">
            When a baby arrives, friends and family want to help. They say "let
            me know if you need anything" — and they mean it. But the person who
            needs help is the last person who can organise it. Meals arrive in a
            rush then stop. Visitors show up at the wrong time. The dog doesn't
            get walked. And the new parent spends their precious energy managing
            visitors instead of resting. Aunt Lucy fixes that.
          </p>
        </motion.div>
      </section>

      {/* Section 2 — the solution */}
      <section className="py-20 px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="max-w-2xl mx-auto text-center"
        >
          <h2 className="font-serif text-3xl font-bold text-foreground mb-5">
            One page. One link. Everything organised.
          </h2>
          <p className="text-muted-foreground leading-relaxed text-lg">
            You give an Aunt Lucy page as a gift. Your friend receives it
            beautifully — with warm notes from everyone who signed it. While they
            still have energy, they can set it up exactly how they want: what
            help they need, who they trust with the kids, when visitors are
            welcome. Then when the moment comes — labour has started, baby is
            here, they are finally home — they hit one button. Their support
            network is notified. The help begins. They don't have to think about
            it again.
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
            Helpers click one link, see what's needed, and claim a slot. No app.
            No account. No fuss.
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
              One price. Eight weeks of real support.
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              $59 — one Aunt Lucy gift page. Valid for 12 months from purchase.
              Eight weeks of coordinated support from the moment they launch.
            </p>
            <a
              href="#"
              className="text-sm text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
            >
              Buying for a team or workplace? See employer pricing.
            </a>
          </div>
          <div className="shrink-0">
            <Button
              asChild
              size="lg"
              variant="outline"
              className="font-serif text-base border-primary/40 text-primary hover:bg-primary/5"
            >
              {/* Placeholder — $59 Stripe checkout link added later */}
              <a href="#">Gift an Aunt Lucy page — $59</a>
            </Button>
          </div>
        </motion.div>
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
            The people you love deserve more than another onesie.
          </h2>
          <Button
            asChild
            size="lg"
            className="bg-white text-primary hover:bg-white/90 text-base px-8 py-6 h-auto font-serif shadow-xl"
          >
            {/* Placeholder — $59 Stripe checkout link added later */}
            <a href="#">Give them Aunt Lucy — $59</a>
          </Button>
          <p className="text-primary-foreground/50 text-sm mt-4">
            Two minutes to buy · Free for helpers · No app needed
          </p>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 px-6">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-primary fill-primary/20" />
            <span className="font-serif font-semibold text-foreground">Aunt Lucy</span>
            <span>· auntlucy.com.au</span>
          </div>
          <div className="flex items-center gap-4">
            <p>© {new Date().getFullYear()} Aunt Lucy. Made with care in Australia.</p>
            <button
              onClick={() => setLocation("/privacy")}
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Privacy policy
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
