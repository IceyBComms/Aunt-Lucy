import { useLocation } from "wouter";
import { TeacupMark } from "@/components/TeacupMark";
import { SiteFooter } from "@/components/SiteFooter";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-serif text-xl font-bold text-foreground mb-3">{title}</h2>
      <div className="space-y-3 text-muted-foreground leading-relaxed text-sm">{children}</div>
    </section>
  );
}

function MailLink({
  address,
  children,
}: {
  address: string;
  children?: React.ReactNode;
}) {
  return (
    <a
      href={`mailto:${address}`}
      className="text-primary underline underline-offset-2"
    >
      {children ?? address}
    </a>
  );
}

export default function PrivacyPolicy() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Nav */}
      <nav className="w-full px-6 py-5 border-b border-border/50">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-2.5 group"
          >
            <TeacupMark className="w-10 h-10" />
            <span className="font-serif font-bold text-foreground text-lg group-hover:text-primary transition-colors">
              Aunt Lucy
            </span>
          </button>
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 px-6 py-14">
        <div className="max-w-2xl mx-auto">
          <p className="text-sm text-muted-foreground mb-2">Last updated: 8 August 2026</p>
          <h1 className="font-serif text-4xl font-bold text-foreground mb-10">Privacy Policy</h1>

          <Section title="The short version">
            <p>
              Aunt Lucy exists to organise real help for people in hard moments — which means we
              hold some personal, sometimes tender, information. We collect only what the service
              needs, we never sell it, we never use it to advertise to you or your people, and when
              a page winds down you can ask us to remove it. This page explains the details.
            </p>
          </Section>

          <Section title="Who we are">
            <p>
              Aunt Lucy (auntlucy.com.au) is operated by{" "}
              <strong className="text-foreground">Icebreaker Communications</strong> (ABN 34 327
              702 731), based in Victoria, Australia. Questions, requests, worries:{" "}
              <MailLink address="hello@auntlucy.com.au" />. We handle personal information in line
              with the Australian Privacy Act 1988 and the Australian Privacy Principles.
            </p>
          </Section>

          <Section title="What Aunt Lucy is — and who pays">
            <p>
              Aunt Lucy is a support-coordination service. Usually, someone{" "}
              <strong className="text-foreground">buys</strong> Aunt Lucy as a gift ($59 consumer,
              $79 workplace, prices at checkout) for a person going through a big life moment.{" "}
              <strong className="text-foreground">
                The person the support is for is never charged
              </strong>{" "}
              — not for receiving a gift, not for using their page, and helpers are never charged
              either. For the hardest times — a loss, a sudden illness or crisis — Aunt Lucy is{" "}
              <strong className="text-foreground">free</strong>, set up directly at
              auntlucy.com.au/hardest-times, no card details asked.
            </p>
          </Section>

          <Section title="What we collect">
            <p>
              <strong className="text-foreground">From buyers:</strong> your name, email, and what's
              needed for the gift (who it's for, delivery date, an optional message). Payment is
              handled by <strong className="text-foreground">Stripe</strong> — your card details go
              to Stripe, not to us; we never see or store your full card number. We issue a tax
              invoice.
            </p>
            <p>
              <strong className="text-foreground">
                From the person being supported (and whoever sets up for them):
              </strong>{" "}
              the recipient's first name, email and/or mobile, the occasion (for example a new baby,
              an illness, a loss), the tasks on the page, and optional notes — like a "good to know"
              note for visitors.
            </p>
            <p>
              <strong className="text-foreground">From helpers:</strong> the name and mobile/email
              that someone in the recipient's circle adds so you can be invited, and — if you claim
              a task — your claim details and whether you chose to show your name. Helpers never
              create accounts or passwords.
            </p>
            <p>
              <strong className="text-foreground">From workplace gifts:</strong> colleagues' names
              and the messages they sign on the team card.
            </p>
            <p>
              <strong className="text-foreground">Automatically:</strong> our hosting providers keep
              standard access logs (including IP addresses and timestamps) that keep the service
              running and help us spot abuse. We don't run advertising trackers, and we don't show ads.
            </p>
          </Section>

          <Section title="Sensitive information, handled gently">
            <p>
              By its nature, an Aunt Lucy page can reveal health or bereavement context — that a
              baby has arrived, that someone is unwell, that someone has died. We treat all of it as
              sensitive: we hold only what you choose to share, we show it only to the people the
              page is shared with, and we never use it for marketing, profiling, or anything beyond
              running the page. Pages live behind private, hard-to-guess links rather than public
              listings — please treat those links as private and share them only with the people
              they're meant for.
            </p>
          </Section>

          <Section title="What we use information for">
            <p>
              Running your page; delivering the gift; sending the invitations and notifications the
              recipient (or their chosen admin) approves; receipts and tax invoices; keeping the
              service safe. That's the list.{" "}
              <strong className="text-foreground">
                We never sell personal information. We never share it for advertising. We never run
                ads against anyone's hard time.
              </strong>
            </p>
          </Section>

          <Section title="Messages to helpers">
            <p>
              Aunt Lucy only contacts a helper because someone they know — the person being
              supported, or someone acting for them — personally chose them and approved the
              message. Every text and email says who it's about and who sent it (Aunt Lucy, a
              product of Icebreaker Communications), and carries a free, instant opt-out: reply{" "}
              <strong className="text-foreground">STOP</strong> to a text, or use the unsubscribe
              link in an email. Opt-outs are honoured immediately and remembered.
            </p>
          </Section>

          <Section title="Who else touches your information">
            <p>
              We use a small set of service providers to run Aunt Lucy:{" "}
              <strong className="text-foreground">Stripe</strong> (payments),{" "}
              <strong className="text-foreground">Resend</strong> (email delivery),{" "}
              <strong className="text-foreground">Twilio</strong> (SMS, sent from an Australian
              number), <strong className="text-foreground">Neon</strong> (database), and{" "}
              <strong className="text-foreground">Railway</strong> and{" "}
              <strong className="text-foreground">Vercel</strong> (hosting). Each holds only what
              its job requires, under its own security and privacy terms. Some of these providers
              store or process data outside Australia — including the United States and Japan (our
              email provider's servers are in Japan). By using Aunt Lucy you consent to that
              overseas handling, which is standard for modern web services.
            </p>
          </Section>

          <Section title="How long we keep things, and how to be removed">
            <p>
              Support pages are meant to be temporary — they wind down when the hard time eases.
              When a page is closed, it stops being visible to helpers. If you'd like your
              information removed — whether you're a recipient, a buyer, a helper, or someone whose
              details were added — email <MailLink address="hello@auntlucy.com.au" /> and we'll
              remove it promptly. (One exception: we keep opt-out records so we never message you
              again, and transaction records we're legally required to hold.)
            </p>
            <p>
              You can ask us to delete your information at any time by{" "}
              <MailLink address="hello@auntlucy.com.au">emailing us</MailLink>, and we'll remove
              it. We're building a way for you to delete it yourself inside Aunt Lucy, and we'll
              update this page when that's ready.
            </p>
          </Section>

          <Section title="Access, correction, and complaints">
            <p>
              You can ask us any time what information we hold about you, and ask us to correct it —
              email <MailLink address="hello@auntlucy.com.au" />. If you have a privacy complaint,
              tell us first and we'll do our best to put it right quickly. If you're not satisfied
              with our response, you can contact the Office of the Australian Information
              Commissioner (
              <a
                href="https://oaic.gov.au"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                oaic.gov.au
              </a>
              ).
            </p>
          </Section>

          <Section title="Changes to this policy">
            <p>
              If we change this policy in a way that matters, we'll put a notice on the site. The
              "last updated" date at the top always tells you when it last changed.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              <strong className="text-foreground">Aunt Lucy</strong> — a product of Icebreaker
              Communications (ABN 34 327 702 731)
            </p>
            <p>
              <strong className="text-foreground">Email:</strong>{" "}
              <MailLink address="hello@auntlucy.com.au" />
            </p>
          </Section>
        </div>
      </div>

      {/* Footer */}
      <SiteFooter compact />
    </div>
  );
}
