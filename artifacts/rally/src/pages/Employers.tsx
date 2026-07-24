import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { TeacupMark } from "@/components/TeacupMark";
import {
  Heart,
  Utensils,
  Car,
  ShoppingBag,
  Dog,
  Shirt,
  BellOff,
  ChevronDown,
} from "lucide-react";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: "easeOut" },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.12 } },
};

const STATS = [
  {
    stat: "1 in 5 new mothers and 1 in 10 new fathers in Australia experience perinatal depression and anxiety. With the right support around them, that risk drops significantly.",
    source: "Gidget Foundation Australia",
  },
  {
    stat: "Social support reduces the prevalence of postnatal depression by 30–40%. Practical help — meals, errands, someone to walk the dog — isn't just kind. It's protective.",
    source: "Clinical and Experimental Obstetrics & Gynecology, 2023",
  },
];

const STEPS = [
  {
    title: "You gift it",
    body: "Purchase an Aunt Lucy page for your employee as part of their parental leave send-off. Available individually or in bulk. Invoice billing available for 10-pack and above.",
  },
  {
    title: "Your team signs the card",
    body: "Share a private link with colleagues before delivery day. Everyone leaves a short warm note — no account needed, takes 60 seconds. Everything is held until delivery.",
  },
  {
    title: "Your employee receives something genuinely special",
    body: "On their last day — or whenever you choose — they receive a beautifully designed digital gift. Their name. Your organisation's message. Every colleague note, revealed as they scroll.",
  },
  {
    title: "They set it up before leave starts",
    body: "While they still have energy, they configure their support page — what help they need, who they trust, when visitors are welcome. Everything is ready. Nothing is live yet.",
  },
  {
    title: "They launch it when the moment comes",
    body: "When labour starts, when they get home from hospital, when they're ready — one button. Their support network is notified. Helpers claim slots. Eight weeks of real support begins.",
  },
  {
    title: "You've done something that lasts",
    body: "Not flowers that die in a week. Not a hamper that's gone in two days. Eight weeks of coordinated practical support — and an employee who knows their workplace genuinely showed up for them.",
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

const PRICING = [
  {
    name: "Individual gift",
    price: "$79",
    detail: "One employee. The most thoughtful parental leave send-off you can give.",
    cta: "Gift an individual page",
  },
  {
    name: "5-pack",
    price: "$329",
    sub: "$65.80 per gift — save $66",
    detail: "For teams with a few employees going on leave through the year.",
    cta: "Buy a 5-pack",
    featured: true,
  },
  {
    name: "10-pack",
    price: "$549",
    sub: "$54.90 per gift — save $241",
    detail: "Best value for organisations with regular parental leave activity.",
    cta: "Buy a 10-pack",
  },
  {
    name: "Annual subscription",
    price: "Let's talk",
    detail: "Unlimited pages, invoice billing, priority support, optional custom branding.",
    cta: "Book a chat",
  },
];

const FAQ = [
  {
    q: "What if our employee doesn't want to activate it?",
    a: "No problem. The gift code is valid for 12 months. They set it up and launch it only when they're ready — nothing goes live until they choose. If they never use it, the gift still delivered something real: the warm notes from their team on their last day.",
  },
  {
    q: "What's the admin burden on us?",
    a: "Close to zero. You purchase, receive a gift code, and share a signing link with your team. Aunt Lucy handles everything else.",
  },
  {
    q: "Do helpers need to download an app or create an account?",
    a: "No. Helpers click a link, see what's needed, and claim a slot. That's it.",
  },
  {
    q: "Can we add our own message?",
    a: "Yes. At purchase you write a personal note from your organisation. It appears prominently in the gift your employee receives.",
  },
  {
    q: "Does this work for all types of parental leave?",
    a: "Yes — Aunt Lucy works for mothers, fathers, non-birthing partners, adoptive parents and families via surrogacy. Any new parent going on leave.",
  },
  {
    q: "Do you offer invoicing?",
    a: "Yes for the 10-pack and annual subscription. Individual and 5-pack purchases are by card via our secure Stripe checkout.",
  },
  {
    q: "Can we use Aunt Lucy for other life events?",
    a: "Right now Aunt Lucy is focused on the new parent experience. Broader life event support is on the roadmap.",
  },
];

export default function Employers() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Nav */}
      <nav className="w-full px-6 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-2.5"
          >
            <TeacupMark className="w-10 h-10" />
            <span className="font-serif font-bold text-foreground text-lg">Aunt Lucy</span>
          </button>
          <button
            onClick={() => setLocation("/organise")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in
          </button>
        </div>
      </nav>

      {/* Hero */}
      <motion.section
        className="flex flex-col items-center text-center px-6 pt-12 pb-20"
        variants={stagger}
        initial="initial"
        animate="animate"
      >
        <motion.div
          variants={fadeUp}
          className="inline-flex items-center gap-2 bg-primary/8 text-primary text-sm font-medium px-4 py-1.5 rounded-full mb-8"
        >
          <Heart className="w-3.5 h-3.5 fill-primary/30" />
          Aunt Lucy for Employers
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="font-serif text-5xl sm:text-6xl font-bold text-foreground leading-[1.1] mb-6 max-w-3xl"
        >
          The parental leave gift that{" "}
          <span className="text-primary">actually helps.</span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="text-xl text-muted-foreground leading-relaxed max-w-xl mb-8"
        >
          Most employers send flowers. The best ones send an Aunt Lucy.
        </motion.p>

        <motion.p
          variants={fadeUp}
          className="text-lg text-muted-foreground leading-relaxed max-w-2xl mb-8"
        >
          When an employee goes on parental leave, they receive a lot of
          goodwill. What they rarely get is organised, practical support for the
          weeks when they need it most. Aunt Lucy changes that. You gift your
          employee a private support page. Before their leave starts, while they
          still have energy and clarity, they set it up exactly how they want —
          the help they need, who they trust, when visitors are welcome. Then
          when the moment comes — baby has arrived, they're heading to hospital,
          they're finally home — they hit one button. Their support network is
          notified. The help begins. They don't have to think about it again.
        </motion.p>

        <motion.p
          variants={fadeUp}
          className="font-serif text-lg font-semibold text-foreground max-w-xl mb-10"
        >
          You gift it. They set it up on their terms. Their people show up when
          it counts.
        </motion.p>

        <motion.div variants={fadeUp} className="flex flex-col items-center gap-4">
          <Button
            asChild
            size="lg"
            variant="accent"
            className="text-base px-8 py-6 h-auto font-serif shadow-lg shadow-accent/20 hover:shadow-accent/30 transition-shadow"
          >
            {/* Placeholder — Stripe checkout link added later */}
            <a href="#">Gift it to your team</a>
          </Button>
        </motion.div>
      </motion.section>

      {/* Who is Aunt Lucy */}
      <section className="bg-card border-t border-border/50 py-20 px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="max-w-2xl mx-auto text-center"
        >
          <h2 className="font-serif text-3xl font-bold text-foreground mb-5">
            Who is Aunt Lucy?
          </h2>
          <p className="text-muted-foreground leading-relaxed text-lg">
            You know an Aunt Lucy. She's the one who quietly sorted everything
            when your family needed it most — no fuss, no fanfare, just the right
            person appearing with the right thing at the right time. She brings
            the food nobody asked for but everyone needed. She handles the
            awkward conversations. She makes everything feel manageable without
            ever making a fuss about it. Not everyone is lucky enough to have an
            Aunt Lucy. But everyone deserves one. That's what this gives your
            employee.
          </p>
        </motion.div>
      </section>

      {/* Why this matters */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45 }}
            className="max-w-2xl mx-auto text-center mb-12"
          >
            <h2 className="font-serif text-3xl font-bold text-foreground mb-5">
              Why this matters
            </h2>
            <p className="text-muted-foreground leading-relaxed text-lg">
              New parents are navigating one of the most significant transitions
              of their lives — often while managing financial pressure, physical
              recovery, sleep deprivation and the emotional weight of a
              completely new identity. The research is clear that practical
              support during this period makes a real difference:
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 gap-6 mb-12">
            {STATS.map((item, i) => (
              <motion.div
                key={item.source}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="bg-card border border-border/60 rounded-2xl p-7 text-left"
              >
                <p className="text-foreground leading-relaxed mb-4">
                  {item.stat}
                </p>
                <p className="text-sm text-muted-foreground italic">
                  {item.source}
                </p>
              </motion.div>
            ))}
          </div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45 }}
            className="max-w-2xl mx-auto text-center text-muted-foreground leading-relaxed text-lg"
          >
            Employees who feel genuinely supported during parental leave are more
            likely to return, more likely to stay, and more likely to speak well
            of where they work. The business case is real. But the human case is
            stronger.
          </motion.p>
        </div>
      </section>

      {/* The feature HR managers love */}
      <section className="bg-card border-t border-border/50 py-20 px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="max-w-2xl mx-auto text-center"
        >
          <p className="text-sm font-medium text-primary uppercase tracking-wide mb-3">
            The feature HR managers love
          </p>
          <h2 className="font-serif text-3xl font-bold text-foreground mb-5">
            Set up before leave. Launch when it counts.
          </h2>
          <p className="text-muted-foreground leading-relaxed text-lg">
            Most parental support tools assume the person who needs help will
            organise it. That's the wrong assumption. Aunt Lucy works
            differently. Your employee receives their gift while they still have
            capacity — before the baby arrives, before the exhaustion sets in.
            They set up their support page in their own time: meals, errands,
            school pickups for older kids, visiting preferences, trusted helpers
            for sensitive tasks. Everything is ready. Nothing is live. Then when
            the moment comes — one button. Their network is notified. Eight weeks
            of coordinated support begins. They don't have to manage a thing.
            This is the feature that makes Aunt Lucy genuinely useful rather than
            just thoughtful.
          </p>
        </motion.div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6">
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
                <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary font-serif text-xl font-bold mb-5">
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
      <section className="bg-card border-t border-border/50 py-20 px-6">
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
                className="bg-background border border-border/60 rounded-2xl p-5 flex flex-col items-center gap-3"
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
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-medium text-primary uppercase tracking-wide mb-2">
              Pricing
            </p>
            <h2 className="font-serif text-3xl font-bold text-foreground mb-3">
              Choose what fits your team.
            </h2>
            <p className="text-muted-foreground">
              All prices in AUD and include GST.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PRICING.map((tier, i) => (
              <motion.div
                key={tier.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className={`rounded-2xl p-6 flex flex-col border ${
                  tier.featured
                    ? "border-primary/40 bg-card shadow-lg shadow-primary/5"
                    : "border-border/60 bg-card"
                }`}
              >
                {tier.featured && (
                  <span className="self-start bg-primary/10 text-primary text-xs font-medium px-3 py-1 rounded-full mb-4">
                    Popular
                  </span>
                )}
                <h3 className="font-serif text-lg font-semibold text-foreground mb-2">
                  {tier.name}
                </h3>
                <p className="font-serif text-3xl font-bold text-foreground mb-1">
                  {tier.price}
                </p>
                {tier.sub && (
                  <p className="text-sm text-primary font-medium mb-3">{tier.sub}</p>
                )}
                <p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-6">
                  {tier.detail}
                </p>
                <Button
                  asChild
                  variant={tier.featured ? "default" : "outline"}
                  className={`w-full font-serif ${
                    tier.featured
                      ? ""
                      : "border-primary/40 text-primary hover:bg-primary/5"
                  }`}
                >
                  {/* Placeholder — Stripe checkout / booking link added later */}
                  <a href="#">{tier.cta}</a>
                </Button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-card border-t border-border/50 py-20 px-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-serif text-3xl font-bold text-foreground text-center mb-12">
            Frequently asked questions
          </h2>
          <div className="flex flex-col gap-3">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group bg-background border border-border/60 rounded-2xl px-6 py-5"
              >
                <summary className="flex items-center justify-between cursor-pointer list-none font-serif font-semibold text-foreground">
                  {item.q}
                  <ChevronDown className="w-5 h-5 text-primary shrink-0 ml-4 transition-transform group-open:rotate-180" />
                </summary>
                <p className="text-muted-foreground leading-relaxed mt-4">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="bg-primary py-20 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl mx-auto"
        >
          <h2 className="font-serif text-4xl font-bold text-primary-foreground mb-10">
            Ready to give your team something that actually helps?
          </h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
            <Button
              asChild
              size="lg"
              className="bg-white text-primary hover:bg-white/90 text-base px-6 py-6 h-auto font-serif shadow-xl"
            >
              {/* Placeholder — Stripe checkout link added later */}
              <a href="#">Gift an individual page — $79</a>
            </Button>
            <Button
              asChild
              size="lg"
              className="bg-white/15 text-primary-foreground hover:bg-white/25 text-base px-6 py-6 h-auto font-serif border border-white/30"
            >
              {/* Placeholder — Stripe checkout link added later */}
              <a href="#">Buy a 5-pack — $329</a>
            </Button>
            <Button
              asChild
              size="lg"
              className="bg-white/15 text-primary-foreground hover:bg-white/25 text-base px-6 py-6 h-auto font-serif border border-white/30"
            >
              {/* Placeholder — Stripe checkout link added later */}
              <a href="#">Buy a 10-pack — $549</a>
            </Button>
          </div>
          <p className="text-primary-foreground/70 text-sm max-w-lg mx-auto leading-relaxed">
            Need more than 10, want invoice billing, or want to talk it through?
            Email{" "}
            <a
              href="mailto:hello@auntlucy.com.au"
              className="underline underline-offset-2 hover:text-primary-foreground transition-colors"
            >
              hello@auntlucy.com.au
            </a>
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
          <p>Built in Australia for Australian families.</p>
        </div>
      </footer>
    </div>
  );
}
