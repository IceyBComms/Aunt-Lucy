import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { TeacupMark } from "@/components/TeacupMark";

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-10 scroll-mt-8">
      <h2 className="font-serif text-xl font-bold text-foreground mb-3">{title}</h2>
      <div className="space-y-3 text-muted-foreground leading-relaxed text-sm">{children}</div>
    </section>
  );
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-7">
      <h3 className="font-serif text-base font-bold text-foreground mb-2">{title}</h3>
      <div className="space-y-3 text-muted-foreground leading-relaxed text-sm">{children}</div>
    </div>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="border-l-2 border-primary/40 pl-4 italic text-muted-foreground">
      {children}
    </blockquote>
  );
}

function Bullets({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-5 space-y-2">{children}</ul>;
}

function B({ children }: { children: React.ReactNode }) {
  return <strong className="text-foreground">{children}</strong>;
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

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 text-[0.85em] text-foreground">
      {children}
    </code>
  );
}

export default function TermsOfService() {
  const [, setLocation] = useLocation();

  // If someone lands on /terms#refund directly (a link we point people to), jump
  // straight to the Refund section. ScrollToTop in App forces scroll back to the
  // top as wouter settles the route on mount, so re-assert the jump across a short
  // window to be the last scroll that wins. setTimeout (not requestAnimationFrame)
  // so it still fires when the page opens in a backgrounded/hidden tab.
  useEffect(() => {
    if (window.location.hash !== "#refund") return;
    const jump = () => document.getElementById("refund")?.scrollIntoView();
    const timers = [0, 60, 150, 300].map((d) => window.setTimeout(jump, d));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

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
          <p className="text-sm text-muted-foreground mb-2">
            Last updated: 10 August 2026 · Effective: 27 July 2026
          </p>
          <h1 className="font-serif text-4xl font-bold text-foreground mb-10">
            Terms of Service
          </h1>

          <Section title="1. Hello, and the short version">
            <p>
              Aunt Lucy helps friends, family and colleagues organise real, practical help for
              someone going through a hard time — a new baby, an illness, a loss, surgery, or another
              big life moment. These Terms are the agreement between you and us for using Aunt Lucy.
              We've tried to keep them human and clear.
            </p>
            <p>
              By buying, activating, or using Aunt Lucy — including tapping a link to help someone —
              you're agreeing to these Terms. If you don't agree, please don't use it.
            </p>
            <p>
              <B>"We", "us", "Aunt Lucy"</B> means Icebreaker Communications (ABN 34 327 702 731), a
              sole trader based at Pascoe Vale South, Victoria 3044, Australia — the provider of the
              Aunt Lucy service at auntlucy.com.au. <B>"You"</B> means anyone using the service.
            </p>
          </Section>

          <Section title="2. What Aunt Lucy is (and isn't)">
            <p>
              Aunt Lucy is a tool for <B>coordinating practical support</B>. Someone buys an Aunt
              Lucy for a person they care about (or for themselves); that person reviews a pre-built
              page of suggested tasks, keeps the ones that help, and shares it; the people around
              them ("helpers") pick tasks to do — a meal, a lift, a visit — without needing an
              account.
            </p>
            <p>
              <B>Aunt Lucy is not:</B>
            </p>
            <Bullets>
              <li>
                <B>an emergency or crisis service.</B> If someone is in danger or needs urgent help,
                contact <B>000</B> (or Lifeline <B>13 11 14</B>, or a doctor). Aunt Lucy does not
                monitor pages for emergencies and must never be relied on for urgent or
                life-threatening situations.
              </li>
              <li>
                <B>medical, legal, financial, or professional advice.</B> It helps organise
                casseroles and school pickups, not clinical care.
              </li>
              <li>
                <B>a guarantee that help will arrive.</B> Whether people actually pick up tasks is up
                to them. We provide the tool, not the volunteers.
              </li>
            </Bullets>
          </Section>

          <Section title="3. The roles — separate hats, not separate people">
            <p>
              Aunt Lucy works through a handful of <em>roles</em>. Any one person can wear several of
              them, and different people can share them — the roles are separate, the people needn't
              be:
            </p>
            <Bullets>
              <li>
                <B>Buyer</B> — the person or organisation who purchases an Aunt Lucy. Might be a
                friend, or an employer buying one for an employee. The buyer may or may not help set
                the page up (an employer usually won't).
              </li>
              <li>
                <B>Recipient</B> — the person the support is for. <B>The page always belongs to the
                recipient</B> — they can take it over or shut it down at any time — and they're never
                charged for <em>receiving</em> a gift someone else bought them.
              </li>
              <li>
                <B>Setup</B> — whoever prepares the page (reviews the suggested tasks, gathers
                contacts). Often the recipient, but just as often someone close to them, like a
                sister or a friend.
              </li>
              <li>
                <B>Activator</B> — whoever makes the page live. Usually the recipient, but it can be
                someone acting on their behalf.
              </li>
              <li>
                <B>Admin</B> — a person, other than the recipient, whom the recipient authorises to
                run the page for them (for example, a sister who manages it while they rest). An
                admin acts for the recipient, and the recipient can always take back control.
              </li>
              <li>
                <B>Helper</B> — anyone who claims a task (a meal, a lift, a visit). Helpers never
                need an account or an app; they just tap a link and pick something.
              </li>
            </Bullets>
            <p>
              <B>Buying Aunt Lucy for yourself</B> ("self-purchase") simply means one person wears
              the buyer, setup, activator and recipient hats all at once — for example, an expectant
              parent setting up their own support ahead of a new baby. That's a normal, supported
              use, not a special case.
            </p>
          </Section>

          <Section title="4. Buying an Aunt Lucy">
            <Bullets>
              <li>
                When you buy an Aunt Lucy, you're purchasing a <B>digital gift</B> — the gift
                experience (a keepsake, and for workplace gifts the colleagues' messages) plus access
                to set up and run a support page. Current gift types and prices are shown at
                checkout.
              </li>
              <li>
                <B>All prices are in Australian dollars and include GST</B> where applicable. You'll
                receive a tax invoice.
              </li>
              <li>
                Payments are handled by <B>Stripe</B>, our payment processor. We don't store your
                full card details; Stripe does, under its own terms and security.
              </li>
              <li>
                The gift is delivered to the recipient by the channel you choose (email or SMS), on
                the date you choose (immediately or scheduled).
              </li>
              <li>
                <B>Only the buyer pays.</B> If Aunt Lucy is given as a gift, the <em>recipient</em>{" "}
                is never charged for receiving it — a gift can be declined or left unactivated and
                the recipient is never billed. (If you buy Aunt Lucy for yourself, you're the buyer,
                so of course you pay.) What happens to the buyer's payment if a gift goes unused is
                covered in the <B>Refund &amp; Cancellation Policy</B> below.
              </li>
              <li>
                <B>Business/workplace and multi-gift packs:</B> some tiers are sold in packs of
                several gifts. When you buy a pack, you receive credits to give out individually —
                we'll confirm your purchase and help you set up each gift. You're responsible for
                handing out each gift appropriately.
              </li>
            </Bullets>
            <p>
              Refunds and cancellations are covered in the{" "}
              <a href="#refund" className="text-primary underline underline-offset-2">
                <B>Refund &amp; Cancellation Policy</B>
              </a>{" "}
              further down this page, which forms part of these Terms. In short: an Aunt Lucy is a{" "}
              <B>digital product</B>, so once the gift experience has been opened it's treated as
              delivered — full details, and your Australian Consumer Law rights, are in that section.
            </p>
          </Section>

          <Section title="5. The information you give us">
            <p>
              To make Aunt Lucy work, people add information — the recipient's details, task
              descriptions, notes, and <B>contacts</B> (names and phone numbers/emails of people who
              might help).
            </p>
            <p>
              When you add someone else's contact details, <B>you confirm that:</B>
            </p>
            <Bullets>
              <li>you have a genuine personal or professional relationship with them, and</li>
              <li>
                it's reasonable for them to receive a message about supporting the person concerned.
              </li>
            </Bullets>
            <p>
              You must <B>not</B> use Aunt Lucy to upload contacts you have no relationship with, or
              to message people who wouldn't reasonably expect to hear from you. You're responsible
              for the accuracy of what you enter, and for having the standing to enter it.
            </p>
            <p>
              We handle personal information — including sensitive information like health or
              bereavement context — under our{" "}
              <Link href="/privacy" className="text-primary underline underline-offset-2">
                <B>Privacy Policy</B>
              </Link>
              , which explains what we collect, why, how it's stored, and how someone can have it
              removed.
            </p>
          </Section>

          <Section title="6. Messages we send on your behalf">
            <p>
              When a recipient (or the admin they've authorised) approves inviting their contacts,
              Aunt Lucy sends texts and/or emails to those people on their behalf. By approving a
              send, they confirm they're authorising those messages.
            </p>
            <p>Every message:</p>
            <Bullets>
              <li>
                <B>leads with the recipient's name</B>, so the helper knows who it's about,
              </li>
              <li>
                <B>identifies Aunt Lucy</B> (and, through the link/footer, Icebreaker Communications)
                as the sender, and
              </li>
              <li>
                includes a <B>free, one-tap opt-out</B> — reply <B>STOP</B> to a text, or unsubscribe
                from an email. We honour opt-outs promptly.
              </li>
            </Bullets>
            <p>
              We do this to comply with the Australian Spam Act. Please don't try to use Aunt Lucy to
              get around someone's opt-out.
            </p>
          </Section>

          <Section title="7. Using Aunt Lucy properly (acceptable use)">
            <p>Please don't:</p>
            <Bullets>
              <li>use Aunt Lucy to harass, deceive, impersonate, or harm anyone;</li>
              <li>
                pretend to be someone you're not, or set up a page for a person without a genuine,
                caring reason;
              </li>
              <li>upload unlawful, offensive, or infringing content;</li>
              <li>
                try to break, overload, scrape, reverse-engineer, or gain unauthorised access to the
                service;
              </li>
              <li>
                use it for spam, marketing to strangers, or anything unrelated to organising genuine
                support.
              </li>
            </Bullets>
            <p>
              We can suspend or remove pages, content, or access that breach these Terms or that we
              reasonably believe are harmful — we'll try to be fair and, where sensible, get in touch
              first.
            </p>
          </Section>

          <Section title="8. Links, tokens and access">
            <p>
              Aunt Lucy uses private links (for recipients and admins to manage their page, and for
              helpers to view and claim tasks) instead of passwords, to keep it friction-free. Please
              treat these links as private and share them only with the people they're meant for.
              Anyone with a link may be able to see or do what that link allows, so share
              thoughtfully. If a link is shared more widely than intended, let us know and we'll help.
            </p>
          </Section>

          <Section title="9. Your content stays yours">
            <p>
              You keep ownership of what you add (tasks, notes, messages). You give us the permission
              we reasonably need to host it, display it to the right people, and send the messages
              you approve — solely to run the service for you. We don't sell your content or use it
              to advertise to your contacts.
            </p>
          </Section>

          <Section title="10. Availability">
            <p>
              We work hard to keep Aunt Lucy running, but we can't promise it will always be
              available, uninterrupted, or error-free. We may update, pause, or change features.
              We'll try to avoid disruption during the times a page is actively being used.
            </p>
          </Section>

          <Section title="11. Your rights under Australian Consumer Law">
            <p>
              Nothing in these Terms excludes, restricts, or modifies any right, guarantee, or remedy
              you have under the <B>Australian Consumer Law</B> that can't legally be excluded. Our
              services come with guarantees that can't be excluded under that law.
            </p>
            <p>To the extent the law allows, and subject to those consumer guarantees:</p>
            <Bullets>
              <li>
                Aunt Lucy is provided <B>"as is"</B>;
              </li>
              <li>
                we're not liable for indirect or consequential loss, or for outcomes that depend on
                other people (like whether helpers show up); and
              </li>
              <li>
                where we're liable for a failure of a service we can limit liability for, our
                liability is limited (at our option) to re-supplying the service or refunding what
                you paid for it.
              </li>
            </Bullets>
            <p>
              Because Aunt Lucy is expressly <B>not an emergency service</B>, we're not responsible
              for consequences arising from anyone relying on it as one.
            </p>
          </Section>

          <Section title="12. Winding down a page">
            <p>
              Support pages are meant to be temporary — they wind down when the hard time eases. A
              recipient (or an admin they've authorised) can close their page. When a page is closed,
              we deal with its data — including contacts — in line with our Privacy Policy. If you'd
              like your information removed, contact us (Section 15).
            </p>
          </Section>

          <Section title="13. Changes to these Terms">
            <p>
              We may update these Terms as Aunt Lucy grows or the law changes. If we make a
              significant change, we'll take reasonable steps to let affected users know (for example,
              a notice on the site). Continuing to use Aunt Lucy after a change means you accept the
              updated Terms.
            </p>
          </Section>

          <Section title="14. Governing law">
            <p>
              These Terms are governed by the laws of <B>Victoria, Australia</B>, and you and we
              submit to the courts of that place. This doesn't take away any right you have to bring
              a claim under the Australian Consumer Law wherever you're entitled to.
            </p>
          </Section>

          <Section title="15. Contact us">
            <p>
              Questions, problems, or a request to remove your information? We'd genuinely like to
              hear from you.
            </p>
            <p>
              <B>Aunt Lucy</B> — a product of Icebreaker Communications (ABN 34 327 702 731), a sole
              trader
            </p>
            <p>
              <B>Email:</B> <MailLink address="hello@auntlucy.com.au" />
            </p>
          </Section>

          <p className="text-sm text-muted-foreground italic leading-relaxed mb-12">
            Aunt Lucy arrives when she's needed, and leaves when she's no longer needed. Thank you
            for using her kindly.
          </p>

          {/* Refund & Cancellation Policy — deliberately part of this same page,
              not a standalone route. Anchor id="refund" so /terms#refund lands here. */}
          <hr className="border-border/60 mb-10" />

          <Section id="refund" title="Refund & Cancellation Policy">
            <Callout>
              This section forms part of, and should be read together with, the Terms above — it
              isn't a separate agreement, just its own clearly-marked part of this page so it's easy
              to find and to point people to directly (<Code>/terms#refund</Code>).
            </Callout>
          </Section>

          <Subsection title="The spirit of it">
            <p>
              Aunt Lucy exists to make a hard time a little easier — so the last thing we want is for
              a payment to become one more stress. Our refund approach is deliberately kind. If
              something's not right, or circumstances change, talk to us:{" "}
              <MailLink address="hello@auntlucy.com.au" />. We'll sort it out like human beings.
            </p>
            <p>Below is the detail, so you know where you stand.</p>
          </Subsection>

          <Subsection title="Your rights come first">
            <p>
              Nothing in this policy limits your rights under the{" "}
              <B>Australian Consumer Law (ACL)</B>. Our services come with consumer guarantees that
              can't be excluded. If there's a <B>major problem</B> with what you bought, you're
              entitled to a refund (or to have it put right) under the ACL — this policy is{" "}
              <em>in addition to</em> those rights, not instead of them.
            </p>
          </Subsection>

          <Subsection title="The simple rule">
            <p>
              An Aunt Lucy is a <B>digital product</B>. The simple rule is:
            </p>
            <Callout>
              <B>
                Before the gift experience has been opened, it's fully refundable. Once it's been
                opened, it's been delivered.
              </B>
            </Callout>
            <p>
              On top of that, faults and your ACL rights are always honoured, and we handle genuine
              hardship kindly.
            </p>
          </Subsection>

          <Subsection title="When you'll get a refund">
            <p>
              <B>We'll refund you in full when:</B>
            </p>
            <Bullets>
              <li>
                <B>The gift hasn't been opened yet and you change your mind.</B> A gift stays fully
                refundable right up until the recipient opens it — <B>however far in advance you
                bought it.</B> So a baby-shower gift bought a couple of months before the due date is
                refundable that whole time, as long as it hasn't been opened.
              </li>
              <li>
                <B>The gift is declined or never opened.</B> If it's gone completely unused, you
                shouldn't be out of pocket — ask us and we'll refund it.
              </li>
              <li>
                <B>You were charged twice, or bought by mistake.</B> Accidental or duplicate
                purchases are refunded, no fuss.
              </li>
              <li>
                <B>Something went wrong on our end</B> — the gift didn't deliver, the page didn't
                work as described, or you didn't get what you paid for. We'll fix it or refund it
                (your choice where the ACL gives you that choice).
              </li>
              <li>
                <B>Genuine hardship.</B> Aunt Lucy is bought for hard moments, and sometimes those
                moments turn. If the situation has changed and a refund would help, please just ask —
                we lean towards kindness.
              </li>
            </Bullets>
          </Subsection>

          <Subsection title="When a refund may not apply">
            <Bullets>
              <li>
                <B>Once the gift experience has been opened.</B> The gift experience — the keepsake,
                and (for workplace gifts) the colleagues' signed messages — is a digital product
                that's delivered the moment it's opened. After that, change-of-mind refunds generally
                don't apply, because you've received what was bought. Activating and using the
                support page is part of that same delivered product — and so is the moment they open
                it and see their people have already turned up for them. That's the real gift,
                whether or not any or every slot ends up claimed.
              </li>
              <li>
                <B>Change of mind on a delivered, fault-free product.</B> The ACL doesn't require a
                refund simply for change of mind once a digital product has been delivered.
              </li>
            </Bullets>
            <p>
              In both cases your ACL rights still apply if something's actually <em>faulty</em>, and
              if you're in a genuinely tough spot we'd still rather talk to you than hide behind a
              rule.
            </p>
          </Subsection>

          <Subsection title="Business & multi-gift packs">
            <Bullets>
              <li>
                <B>Unused gift credits</B> in a workplace/multi-gift pack can be refunded{" "}
                <B>within 12 months of purchase</B> if they haven't been handed out.
              </li>
              <li>
                Once a gift credit has been sent to a recipient and opened, that individual gift
                follows the rules above.
              </li>
            </Bullets>
          </Subsection>

          <Subsection title="How to request a refund">
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                Email <MailLink address="hello@auntlucy.com.au" /> from the address you bought with
                (or tell us the buyer's email).
              </li>
              <li>
                Tell us what you bought and, briefly, what's happened. You don't need to give us a
                detailed explanation.
              </li>
              <li>
                We'll reply within <B>2 business days</B>.
              </li>
            </ol>
            <p>
              <B>Refunds are made back to your original payment method</B> (via our payment
              processor, Stripe) and usually appear within <B>5–10 business days</B>, depending on
              your bank. Where GST applied, your refund includes it, and we'll issue an adjustment
              note.
            </p>
          </Subsection>

          <Subsection title="Cancellations">
            <Bullets>
              <li>
                <B>Before delivery:</B> if you've scheduled a gift for a future date and want to
                cancel before it's sent, contact us and we'll cancel and refund it.
              </li>
              <li>
                <B>Subscriptions:</B> Aunt Lucy is currently a one-off gift, not a subscription —
                there's nothing recurring to cancel. (Revisit this line if that ever changes.)
              </li>
            </Bullets>
          </Subsection>

          <Subsection title="Questions">
            <p>
              We'd genuinely rather hear from you than have you feel stuck. Same contact details as
              Section 15 above — <MailLink address="hello@auntlucy.com.au" />.
            </p>
          </Subsection>

          <p className="text-sm text-muted-foreground italic leading-relaxed">
            If a payment is ever standing between someone and a bit of help, that's the opposite of
            the point. Ask us.
          </p>
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
