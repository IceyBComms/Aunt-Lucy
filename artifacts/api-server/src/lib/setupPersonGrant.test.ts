/**
 * Bug #081 — a claim on a crisis page must now reach the person running it.
 *
 * #025 widened WHO a notification can reach and is deployed. This proves the
 * other half: that the crisis path actually puts somebody in that set. The case
 * Kate named is the first test below — a crisis page with NO recipient contact
 * at all, which is what `crisis.ts` creates every single time unless the
 * affected person happened to be looped in.
 *
 * These drive the whole decision chain with no database: the grant the route
 * would insert → the audience that grant produces → the message that audience
 * receives. Every assertion was sabotaged, and each mutation was confirmed to
 * have LANDED before its result was trusted (PATTERN P2).
 */
import { describe, expect, it } from "vitest";
import { setupPersonGrantInput } from "./setupPersonGrant";
import { buildNotifyTargets, type NotifyGrant } from "./notifyTargets";
import { notifyPageOfClaims, type ClaimNotifySenders } from "./claimNotifyDispatch";
import { buildRecipientClaimSms } from "./claimNotifyCopy";

/** Exactly what crisis.ts creates: no page-level contact of any kind. */
const CRISIS_PAGE_CONTACT = { recipientEmail: null, recipientMobile: null };

const PAGE = { id: "p1", slug: "xK9mR2pQ4w", recipientName: "Val Harding", occasion: "bereavement" };

/** The grant row the route would insert, as the audience rule sees it. */
function grantFrom(opts: { contact: string; name: string | null; forSelf: boolean }): NotifyGrant {
  const input = setupPersonGrantInput(opts);
  return {
    token: "tok-setup",
    role: input.role,
    personName: input.personName,
    contact: input.personContact,
  };
}

function senders() {
  const emails: Array<Record<string, unknown>> = [];
  const texts: Array<{ to: string; body: string }> = [];
  const s: ClaimNotifySenders = {
    sendEmail: async (a) => {
      emails.push(a as unknown as Record<string, unknown>);
      return true;
    },
    sendSms: async (a) => {
      texts.push(a);
      return true;
    },
    isSuppressed: async () => false,
    manageLinkFor: (t) => `https://www.auntlucy.com.au/manage/${t}`,
    publicPageLink: (slug) => `https://www.auntlucy.com.au/s/${slug}`,
  };
  return { s, emails, texts };
}

const deliver = (targets: ReturnType<typeof buildNotifyTargets>, s: ClaimNotifySenders) =>
  notifyPageOfClaims({
    page: PAGE,
    targets,
    claimCount: 1,
    senders: s,
    buildSmsBody: buildRecipientClaimSms,
    onError: () => {},
  });

describe("the case that matters: a crisis page with no recipient contact", () => {
  it("a claim REACHES the setup person, where before it reached nobody", async () => {
    const grant = grantFrom({ contact: "ellen@example.com", name: "Ellen", forSelf: false });
    const targets = buildNotifyTargets(CRISIS_PAGE_CONTACT, [grant]);

    expect(targets).toHaveLength(1);

    const { s, emails } = senders();
    const tally = await deliver(targets, s);

    expect(tally).toMatchObject({ targets: 1, delivered: 1, failed: 0 });
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe("ellen@example.com");
  });

  it("and reached NOBODY without that grant — the state this bug describes", async () => {
    // The same page as above with no setup-person grant: the exact behaviour in
    // production before this fix. If this ever passes with a target, the test
    // above has stopped proving anything.
    const targets = buildNotifyTargets(CRISIS_PAGE_CONTACT, []);
    expect(targets).toEqual([]);
    expect(await deliver(targets, senders().s)).toMatchObject({ targets: 0, delivered: 0 });
  });

  it("gives them their OWN management link, not the public page", async () => {
    const targets = buildNotifyTargets(CRISIS_PAGE_CONTACT, [
      grantFrom({ contact: "ellen@example.com", name: "Ellen", forSelf: false }),
    ]);
    const { s, emails } = senders();
    await deliver(targets, s);
    expect(emails[0].manageLink).toContain("/manage/tok-setup");
    expect(emails[0].manageLink).not.toContain("/s/");
  });
});

describe("the role decides the words, not just the access", () => {
  it("someone else's page: they are a MANAGER and read the person's name", async () => {
    const targets = buildNotifyTargets(CRISIS_PAGE_CONTACT, [
      grantFrom({ contact: "ellen@example.com", name: "Ellen", forSelf: false }),
    ]);
    expect(targets[0].isRecipient).toBe(false);

    const { s, emails } = senders();
    await deliver(targets, s);
    // Ellen is running the page; she is not the one being cared for.
    expect(emails[0].isRecipient).toBe(false);
    expect(emails[0].greetingFirstName).toBe("Ellen");
    expect(emails[0].recipientFirstName).toBe("Val");
  });

  it("their own page: they are the RECIPIENT and read 'you'", async () => {
    const targets = buildNotifyTargets(CRISIS_PAGE_CONTACT, [
      grantFrom({ contact: "val@example.com", name: "Val", forSelf: true }),
    ]);
    expect(targets[0].isRecipient).toBe(true);

    const { s, emails } = senders();
    await deliver(targets, s);
    expect(emails[0].isRecipient).toBe(true);
  });

  it("a mobile-only setup person gets the SMS, addressed to the right person", async () => {
    const targets = buildNotifyTargets(CRISIS_PAGE_CONTACT, [
      grantFrom({ contact: "+61400111222", name: "Ellen", forSelf: false }),
    ]);
    const { s, texts, emails } = senders();
    await deliver(targets, s);
    expect(emails).toHaveLength(0);
    expect(texts).toHaveLength(1);
    // Bereavement register, and about Val rather than at Ellen.
    expect(texts[0].body).toContain("A gentle note");
    expect(texts[0].body).toContain("Val");
    expect(texts[0].body).not.toContain("help you");
  });
});

describe("the grant the route would insert", () => {
  it("is a manager grant when the page is for someone else", () => {
    expect(setupPersonGrantInput({ contact: "e@x.com", name: "Ellen", forSelf: false })).toEqual({
      role: "manager",
      personName: "Ellen",
      personContact: "e@x.com",
    });
  });

  it("is a recipient grant when the page is their own", () => {
    expect(setupPersonGrantInput({ contact: "v@x.com", name: "Val", forSelf: true }).role).toBe(
      "recipient",
    );
  });

  it("keeps a null name null rather than inventing one", () => {
    // Every organiser created before migration 0014 has no name, so this is the
    // normal case for an existing account, not an edge case.
    expect(setupPersonGrantInput({ contact: "e@x.com", name: null, forSelf: false })).toMatchObject(
      { personName: null },
    );
    expect(setupPersonGrantInput({ contact: "e@x.com", name: "   ", forSelf: false })).toMatchObject(
      { personName: null },
    );
  });
});

describe("what must not change", () => {
  it("a gift page with a recipient email behaves exactly as before", async () => {
    // No grants at all, page-level contact only: the long-standing working case.
    const targets = buildNotifyTargets(
      { recipientEmail: "nadia@example.com", recipientMobile: null },
      [],
    );
    expect(targets).toHaveLength(1);
    expect(targets[0].isRecipient).toBe(true);

    const { s, emails } = senders();
    await deliver(targets, s);
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe("nadia@example.com");
  });

  it("does not message the setup person twice when they are also looped in", async () => {
    // Same contact on a setup grant and a section-E recipient grant: one human,
    // one message.
    const targets = buildNotifyTargets(CRISIS_PAGE_CONTACT, [
      grantFrom({ contact: "val@example.com", name: "Val", forSelf: true }),
      { token: "tok-e", role: "recipient", personName: "Val", contact: "val@example.com" },
    ]);
    expect(targets).toHaveLength(1);
  });
});
