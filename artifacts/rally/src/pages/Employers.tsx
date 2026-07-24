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

const STEPS = [
  {
    title: "You gift it.",
    body: "Buy an Aunt Lucy page for your team member, invite colleagues to sign it with their own warm notes, and choose when it arrives. Two minutes. No IT, no logins.",
  },
  {
    title: "They add their trusted circle.",
    // NOTE: the "hand the whole thing to a partner or friend to run" promise below
    // is copy-approved but the hand-off control (name + phone) in the activation
    // flow is NOT yet wired — see PR notes / checks A. Kept verbatim per brief.
    body: "When they've got a quiet moment, they tell Aunt Lucy what they'll need and who they trust — family, friends, colleagues. Not up to it? They can hand the whole thing to a partner or friend to run for them. Nothing's live yet.",
  },
  {
    title: "Aunt Lucy takes it from there.",
    body: "One tap, and the support begins to flow — meals, lifts, whatever's needed, and for weeks, not just the first rushed few days.",
  },
];

// Reuses Home's slot grid — same items, so the two pages read as siblings.
const SLOT_TYPES = [
  { icon: Utensils, label: "Meals and food delivery" },
  { icon: ShoppingBag, label: "Grocery runs" },
  { icon: Dog, label: "Dog walking" },
  { icon: Car, label: "School and kinder pickups" },
  { icon: Shirt, label: "Laundry and errands" },
  { icon: Heart, label: "Timed, welcome visits" },
  { icon: BellOff, label: "\"No visitors this week\"" },
];

export default function Employers() {
  const [, setLocation] = useLocation();

  // "Enquire about packs" is an enquiry, NOT an instant purchase — multi-gift
  // pack fulfilment isn't built, so this must never point at a Stripe pack link.
  // Uses the same support address already used elsewhere in the app.
  const packEnquiryHref =
    "mailto:hello@auntlucy.com.au?subject=Aunt%20Lucy%20%E2%80%94%20multi-gift%20pack%20enquiry";

  const FAQ: { q: string; a: React.ReactNode }[] = [
    {
      q: "Does our employee have to do anything?",
      a: "Only when they're ready — they open a page that's already set up and tap \"make it live\". And if they're not up to it themselves, they can hand the whole page to a partner or friend to set up and run for them. No account, ever.",
    },
    {
      q: "Does this need IT, an integration or a login?",
      a: "None of it. There's nothing to install, no system to connect, no SSO, no admin access — you buy a gift page like any online purchase. Your IT team doesn't need to be involved.",
    },
    {
      q: "Can the company see their page or what they're going through?",
      a: "No. You're the giver, not an admin — you don't get access to their page, their tasks, or any personal details. That stays between them and the people they choose to let in.",
    },
    {
      q: "Is their information secure?",
      a: (
        <>
          Yes. Each page is private, reached only by its own secure link, and
          sensitive tasks are only ever shown to the people they trust.
          Everything's handled under our{" "}
          <button
            onClick={() => setLocation("/privacy")}
            className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
          >
            Privacy Policy
          </button>
          , with extra care for sensitive information.
        </>
      ),
    },
    {
      q: "Can the whole team sign it?",
      a: "Yes — invite colleagues to add their own warm notes before it's sent, so it arrives as a message from everyone, not just one name.",
    },
    {
      q: "Can we brand it as ours?",
      a: "On the roadmap for larger orgs — mention it when you enquire.",
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Nav — logo returns home, Sign in for organisers/admins */}
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
          For HR &amp; People teams · Free for helpers · No app needed
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="font-serif text-5xl sm:text-6xl font-bold text-foreground leading-[1.1] mb-6 max-w-3xl"
        >
          Give your people help,{" "}
          <span className="text-primary">not more stuff.</span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="font-serif text-2xl sm:text-3xl text-foreground leading-snug mb-6"
        >
          Gift someone on your team their own Aunt Lucy.
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
          Everyone signs the card. This is how your team actually shows up.
        </motion.p>

        <motion.div variants={fadeUp} className="flex flex-col items-center gap-4">
          <Button
            asChild
            size="lg"
            variant="accent"
            className="text-base px-8 py-6 h-auto font-serif shadow-lg shadow-accent/20 hover:shadow-accent/30 transition-shadow"
          >
            {/* → /buy, Workplace $79 tier. Placeholder href — the app's per-tier
                Stripe payment links (Item 2) aren't wired yet; there's no /buy
                route. Matches the existing placeholder convention on Home. */}
            <a href="#">Gift Aunt Lucy</a>
          </Button>
        </motion.div>
      </motion.section>

      {/* The problem */}
      <section className="bg-card border-t border-border/50 py-20 px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="max-w-2xl mx-auto text-center"
        >
          <h2 className="font-serif text-3xl font-bold text-foreground mb-5">
            You want to do something real. You send flowers.
          </h2>
          <p className="text-muted-foreground leading-relaxed text-lg mb-6">
            When someone on your team has a baby, an operation, or a family
            emergency, everyone wants to help. So you sign a card, send flowers,
            point them at the EAP — and quietly hope it's enough. But what they
            need is dinner handled and the school run covered, for more than a
            day.
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

      {/* Why it's worth it — HR-only business case */}
      <section className="bg-card border-t border-border/50 py-20 px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="max-w-2xl mx-auto text-center"
        >
          <p className="text-sm font-medium text-primary uppercase tracking-wide mb-3">
            Why it's worth it
          </p>
          <h2 className="font-serif text-3xl font-bold text-foreground mb-6">
            Looking after people is good business.
          </h2>
          <p className="text-muted-foreground leading-relaxed text-lg mb-5">
            How you treat someone in their hardest week is what they remember.
            Only{" "}
            <strong className="font-semibold text-foreground">24%</strong> of
            employees strongly agree their employer cares about their wellbeing —
            and the ones who do are{" "}
            <strong className="font-semibold text-foreground">
              69% less likely to be job-hunting
            </strong>{" "}
            and{" "}
            <strong className="font-semibold text-foreground">
              five times more likely to recommend
            </strong>{" "}
            you <span className="italic">(Gallup)</span>. Replacing someone who
            leaves costs{" "}
            <strong className="font-semibold text-foreground">
              half to twice their salary
            </strong>{" "}
            <span className="italic">(SHRM)</span>.
          </p>
          <p className="text-muted-foreground leading-relaxed text-lg">
            It matters most for new parents: up to{" "}
            <strong className="font-semibold text-foreground">
              1 in 5 mums and 1 in 10 dads
            </strong>{" "}
            face anxiety or depression after a baby{" "}
            <span className="italic">(PANDA)</span>, and practical support in
            those early weeks is one of the strongest{" "}
            <strong className="font-semibold text-foreground">
              protective factors
            </strong>{" "}
            there is.
          </p>
        </motion.div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-6">
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
              One team member. Eight weeks of real support.
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              $79 for one Aunt Lucy gift page, valid for 12 months. Eight weeks
              of coordinated support from the moment they need it. GST included.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Buying for the whole organisation? We do 5- and 10-packs at a lower
              per-gift price, set up with you directly so every gift's looked
              after properly.
            </p>
          </div>
          <div className="shrink-0 flex flex-col gap-3">
            <Button
              asChild
              size="lg"
              variant="outline"
              className="font-serif text-base border-primary/40 text-primary hover:bg-primary/5"
            >
              {/* → /buy, Workplace $79 tier. Placeholder href — see hero note. */}
              <a href="#">Gift Aunt Lucy — $79</a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="font-serif text-base text-muted-foreground hover:text-foreground"
            >
              {/* Enquiry only — NOT a pack payment link (packs aren't fulfilled yet). */}
              <a href={packEnquiryHref}>Enquire about packs</a>
            </Button>
          </div>
        </motion.div>
      </section>

      {/* Questions / FAQ */}
      <section className="bg-card border-t border-border/50 py-20 px-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-serif text-3xl font-bold text-foreground text-center mb-12">
            Questions
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

      {/* The close */}
      <section className="bg-primary py-20 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="max-w-xl mx-auto"
        >
          <h2 className="font-serif text-4xl font-bold text-primary-foreground mb-10">
            Your people deserve more than another bunch of flowers.
          </h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              asChild
              size="lg"
              className="bg-white text-primary hover:bg-white/90 text-base px-8 py-6 h-auto font-serif shadow-xl"
            >
              {/* → /buy, Workplace $79 tier. Placeholder href — see hero note. */}
              <a href="#">Gift Aunt Lucy — $79</a>
            </Button>
            <Button
              asChild
              size="lg"
              className="bg-white/15 text-primary-foreground hover:bg-white/25 text-base px-8 py-6 h-auto font-serif border border-white/30"
            >
              {/* Enquiry only — NOT a pack payment link. */}
              <a href={packEnquiryHref}>Enquire about packs</a>
            </Button>
          </div>
          <p className="text-primary-foreground/50 text-sm mt-4">
            Two minutes to gift · Free for helpers · No app needed
          </p>
        </motion.div>
      </section>

      {/* Footer — same tribute as Home */}
      <footer className="border-t border-border/50 py-8 px-6">
        <p className="max-w-2xl mx-auto text-center text-sm text-muted-foreground leading-relaxed mb-8">
          Aunt Lucy is named for every warm, capable, quietly brilliant woman
          who's ever shown up with a casserole, taken the kids for an afternoon,
          and made everything feel manageable again. This is to honour her — and
          provide support to everyone who needs her.
        </p>
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
