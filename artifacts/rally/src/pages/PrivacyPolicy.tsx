import { useLocation } from "wouter";
import { Heart } from "lucide-react";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-serif text-xl font-bold text-foreground mb-3">{title}</h2>
      <div className="space-y-3 text-muted-foreground leading-relaxed text-sm">{children}</div>
    </section>
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
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
              <Heart className="w-5 h-5 text-primary fill-primary/20" />
            </div>
            <span className="font-serif font-bold text-foreground text-lg group-hover:text-primary transition-colors">
              Aunt Lucy
            </span>
          </button>
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 px-6 py-14">
        <div className="max-w-2xl mx-auto">
          <p className="text-sm text-muted-foreground mb-2">Last updated: April 2026</p>
          <h1 className="font-serif text-4xl font-bold text-foreground mb-4">Privacy Policy</h1>
          <p className="text-muted-foreground leading-relaxed mb-10">
            Aunt Lucy is a free service that helps people coordinate practical support for
            someone going through a hard time. This policy explains what information we collect,
            why, and how it's handled. We comply with the Australian Privacy Act 1988.
          </p>

          <Section title="Who we are">
            <p>
              Aunt Lucy is operated by Icebreaker Communications, based in Australia. If you
              have any questions about this policy, please contact us at{" "}
              <a
                href="mailto:kate@icebreakercommunications.com"
                className="text-primary underline underline-offset-2"
              >
                kate@icebreakercommunications.com
              </a>
              .
            </p>
          </Section>

          <Section title="Information we collect">
            <p>
              <strong className="text-foreground">Organisers</strong> — the person who creates
              a support page — provide their email address when they sign in. We use this only
              to send a sign-in link and to identify their account.
            </p>
            <p>
              <strong className="text-foreground">Helpers</strong> — people who claim a help
              slot — provide their first name and optionally a contact (email or phone number).
              This is visible to the organiser only and is used to confirm who is helping and,
              if an email address is provided, to send a confirmation.
            </p>
            <p>
              <strong className="text-foreground">Trusted helpers</strong> invited by an organiser
              provide their name and mobile number. The mobile is used solely to send them an
              invitation link via SMS.
            </p>
            <p>
              <strong className="text-foreground">Pilot applicants</strong> — organisations
              applying to join the Aunt Lucy pilot — provide their name, role, organisation,
              email and, optionally, a phone number. This information is used only to evaluate
              and follow up on pilot applications.
            </p>
            <p>
              <strong className="text-foreground">Support page content</strong> — the name of
              the person receiving support, the situation description, and slot details — is
              entered by the organiser. We store this in order to display the support page to
              people the organiser shares it with.
            </p>
          </Section>

          <Section title="How we use this information">
            <p>We use the information we collect only to operate the Aunt Lucy service:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>To authenticate organisers via email sign-in links</li>
              <li>To coordinate help slots on behalf of the organiser</li>
              <li>To send helper confirmation emails and trusted-helper invitation SMS messages</li>
              <li>To follow up on pilot programme applications</li>
            </ul>
            <p>
              We do not use your information for marketing, advertising, or any purpose beyond
              operating the service. We do not sell or share personal information with third
              parties, except as described below.
            </p>
          </Section>

          <Section title="Third-party services">
            <p>
              Aunt Lucy uses the following third-party services to operate:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong className="text-foreground">Resend</strong> — to send sign-in and
                confirmation emails. Your email address is transmitted to Resend for delivery
                only.
              </li>
              <li>
                <strong className="text-foreground">Twilio</strong> — to send SMS invitation
                messages to trusted helpers. Mobile numbers are transmitted to Twilio for
                delivery only.
              </li>
              <li>
                <strong className="text-foreground">Replit</strong> — our hosting provider.
                All data is stored on Replit's infrastructure in accordance with their privacy
                and security policies.
              </li>
            </ul>
          </Section>

          <Section title="Data retention">
            <p>
              Support pages and their slot data are retained while the service is active. Organisers
              can close a support page at any time from their dashboard. If you would like us to
              delete your data, please contact us at the email address below.
            </p>
          </Section>

          <Section title="Security">
            <p>
              We take reasonable steps to protect the information we hold. Sensitive credentials
              (API keys, database passwords) are stored in encrypted secret storage and never
              written to source code. The contact details of helpers and the private notes on
              support pages are not exposed on public-facing pages.
            </p>
          </Section>

          <Section title="Your rights">
            <p>
              Under the Australian Privacy Act, you have the right to request access to the
              personal information we hold about you, and to ask us to correct or delete it.
              To make a request, please contact us at{" "}
              <a
                href="mailto:kate@icebreakercommunications.com"
                className="text-primary underline underline-offset-2"
              >
                kate@icebreakercommunications.com
              </a>
              . We will respond within a reasonable time.
            </p>
          </Section>

          <Section title="Changes to this policy">
            <p>
              We may update this policy from time to time. We'll note the date it was last
              updated at the top of this page. Continued use of Aunt Lucy after changes
              constitutes acceptance of the updated policy.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              For any privacy-related questions, please email{" "}
              <a
                href="mailto:kate@icebreakercommunications.com"
                className="text-primary underline underline-offset-2"
              >
                kate@icebreakercommunications.com
              </a>
              .
            </p>
          </Section>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/50 py-6 px-6">
        <div className="max-w-2xl mx-auto text-sm text-muted-foreground text-center">
          © {new Date().getFullYear()} Aunt Lucy · auntlucy.com.au
        </div>
      </footer>
    </div>
  );
}
