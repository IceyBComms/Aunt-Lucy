import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Heart,
  CalendarCheck,
  Share2,
  Users,
  Utensils,
  Car,
  ShoppingBag,
  Dog,
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
    icon: CalendarCheck,
    title: "Create a support page",
    body: "Add help slots — meals, school pickups, grocery runs — with the dates and times that work.",
  },
  {
    icon: Share2,
    title: "Share one link",
    body: "Send the link to friends and family. No app to download, no account to create.",
  },
  {
    icon: Users,
    title: "Helpers claim slots",
    body: "People pick what they can do. You see who's covering what, all in one place.",
  },
];

const SLOT_TYPES = [
  { icon: Utensils, label: "Meals" },
  { icon: Car, label: "School pickups" },
  { icon: ShoppingBag, label: "Grocery runs" },
  { icon: Dog, label: "Dog walking" },
  { icon: Heart, label: "Visits" },
  { icon: Users, label: "Errands" },
];

export default function Home() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Nav */}
      <nav className="w-full px-6 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
              <Heart className="w-5 h-5 text-primary fill-primary/20" />
            </div>
            <span className="font-serif font-bold text-foreground text-lg">Aunt Lucy</span>
          </div>
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
          Free to use · No account needed for helpers
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="font-serif text-5xl sm:text-6xl font-bold text-foreground leading-[1.1] mb-6 max-w-2xl"
        >
          When someone needs help,{" "}
          <span className="text-primary">make it easy to give it</span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="text-lg text-muted-foreground leading-relaxed max-w-xl mb-10"
        >
          Aunt Lucy helps you coordinate practical support — meals, pickups,
          errands — for someone going through a hard time. One page, one link,
          no fuss.
        </motion.p>

        <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3 items-center">
          <Button
            size="lg"
            variant="accent"
            className="text-base px-8 py-6 h-auto font-serif shadow-lg shadow-accent/20 hover:shadow-accent/30 transition-shadow"
            onClick={() => setLocation("/organise")}
          >
            Create a support page
          </Button>
          <p className="text-sm text-muted-foreground">Takes about 3 minutes</p>
        </motion.div>
      </motion.section>

      {/* How it works */}
      <section className="bg-card border-t border-border/50 py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-serif text-3xl font-bold text-foreground text-center mb-3">
            How it works
          </h2>
          <p className="text-muted-foreground text-center mb-14">
            Set up in minutes. Your helpers do the rest.
          </p>

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
                <div className="relative mb-5">
                  <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center">
                    <step.icon className="w-7 h-7 text-primary" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </div>
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

      {/* What you can coordinate */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-serif text-3xl font-bold text-foreground mb-3">
            What you can coordinate
          </h2>
          <p className="text-muted-foreground mb-12">
            Add any mix of help slots to your support page.
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

      {/* Pilot programme */}
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
              Pilot programme
            </p>
            <h2 className="font-serif text-3xl font-bold text-foreground mb-4">
              Are you a healthcare or community organisation?
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We're partnering with a small group of organisations for our pilot
              — hospitals, schools, social workers, community groups. If your
              team coordinates support for people in crisis, we'd love to talk.
            </p>
          </div>
          <div className="shrink-0">
            <Button
              size="lg"
              variant="outline"
              className="font-serif text-base border-primary/40 text-primary hover:bg-primary/5"
              onClick={() => setLocation("/pilot")}
            >
              Apply to join the pilot
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
          <h2 className="font-serif text-4xl font-bold text-primary-foreground mb-4">
            Someone needs you right now
          </h2>
          <p className="text-primary-foreground/75 text-lg mb-10 leading-relaxed">
            Set up a support page in a few minutes and let the people who care
            do what they do best.
          </p>
          <Button
            size="lg"
            className="bg-white text-primary hover:bg-white/90 text-base px-8 py-6 h-auto font-serif shadow-xl"
            onClick={() => setLocation("/organise")}
          >
            Create a support page
          </Button>
          <p className="text-primary-foreground/50 text-sm mt-4">
            Free to use · No app required for helpers
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
          <p>© {new Date().getFullYear()} Aunt Lucy. Made with care in Australia.</p>
        </div>
      </footer>
    </div>
  );
}
