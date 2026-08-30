/**
 * Bug #025 — a task claim must reach everyone with active access to the page.
 *
 * The two cases Kate named, and they are the two the live bug got wrong:
 *   1. a page with a recipient AND a manager grant — BOTH told, once each;
 *   2. a crisis-style page with NO recipientEmail and only grants — previously
 *      silent, and the reason this bug mattered at all.
 *
 * Every assertion here was sabotaged before being trusted (see the sabotage log
 * on the bug record): the fix was reverted or subtly broken and each test was
 * confirmed to go red on exactly the guarantee it claims to defend.
 */
import { describe, expect, it } from "vitest";
import { buildNotifyTargets, type NotifyGrant, type NotifyTarget } from "./notifyTargets";
import { notifyPageOfClaims, type ClaimNotifySenders } from "./claimNotifyDispatch";
import { buildRecipientClaimSms } from "./claimNotifyCopy";
import { buildRecipientClaimNotificationEmail } from "./email";
import { measureSms } from "./smsSegments";

const PAGE = { id: "p1", slug: "xK9mR2pQ4w", recipientName: "Nadia Whitlam", occasion: null };

function senders(over: Partial<ClaimNotifySenders> = {}) {
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
    ...over,
  };
  return { s, emails, texts };
}

const run = (
  targets: NotifyTarget[],
  s: ClaimNotifySenders,
  claimCount = 1,
  page = PAGE,
) =>
  notifyPageOfClaims({
    page,
    targets,
    claimCount,
    senders: s,
    buildSmsBody: buildRecipientClaimSms,
    onError: () => {},
  });

describe("who a claim notification reaches", () => {
  it("CASE 1 — a page with a recipient and a manager tells BOTH, once each", async () => {
    const grants: NotifyGrant[] = [
      { token: "tok-recipient", role: "recipient", personName: null, contact: null },
      {
        token: "tok-manager",
        role: "manager",
        personName: "Bree Whitlam",
        contact: "bree@example.com",
      },
    ];
    const targets = buildNotifyTargets(
      { recipientEmail: "nadia@example.com", recipientMobile: null },
      grants,
    );
    expect(targets).toHaveLength(2);

    const { s, emails } = senders();
    const tally = await run(targets, s);

    expect(tally).toMatchObject({ targets: 2, delivered: 2, failed: 0 });
    expect(emails.map((e) => e.to).sort()).toEqual(["bree@example.com", "nadia@example.com"]);
    // Exactly once each — a duplicate here would be the batching leaking.
    expect(emails).toHaveLength(2);
  });

  it("CASE 1 — each reader gets their OWN token, never a shared one", async () => {
    const targets = buildNotifyTargets(
      { recipientEmail: "nadia@example.com", recipientMobile: null },
      [
        { token: "tok-recipient", role: "recipient", personName: null, contact: null },
        { token: "tok-manager", role: "manager", personName: "Bree", contact: "bree@example.com" },
      ],
    );
    const { s, emails } = senders();
    await run(targets, s);

    const byTo = Object.fromEntries(emails.map((e) => [e.to as string, e.manageLink as string]));
    expect(byTo["nadia@example.com"]).toContain("tok-recipient");
    expect(byTo["bree@example.com"]).toContain("tok-manager");
    // The manager must never hold the recipient's private handle.
    expect(byTo["bree@example.com"]).not.toContain("tok-recipient");
  });

  it("CASE 2 — a crisis page with NO recipientEmail still reaches its grant holders", async () => {
    // Exactly what crisis.ts creates: no page-level contact at all, one manager
    // grant carrying a mobile. This resolved to zero readers before the fix.
    const targets = buildNotifyTargets({ recipientEmail: null, recipientMobile: null }, [
      { token: "tok-sister", role: "manager", personName: "Bree Whitlam", contact: "+61400111222" },
    ]);
    expect(targets).toHaveLength(1);

    const { s, texts, emails } = senders();
    const tally = await run(targets, s);

    expect(tally).toMatchObject({ targets: 1, delivered: 1, failed: 0 });
    // Mobile-only, so it must go by SMS — email-only would leave this silent,
    // which is the whole of bug #025.
    expect(texts).toHaveLength(1);
    expect(emails).toHaveLength(0);
    expect(texts[0].to).toBe("+61400111222");
    expect(texts[0].body).toContain("tok-sister");
  });

  it("CASE 2 — a crisis page with no contact and no grants tells nobody, and says so", async () => {
    const targets = buildNotifyTargets({ recipientEmail: null, recipientMobile: null }, []);
    expect(targets).toHaveLength(0);
    const { s } = senders();
    // targets 0 is what makes the route revert the stamp and retry later.
    expect(await run(targets, s)).toMatchObject({ targets: 0, delivered: 0 });
  });

  it("the same contact on the page and on a grant is messaged once", async () => {
    const targets = buildNotifyTargets(
      { recipientEmail: "nadia@example.com", recipientMobile: null },
      [{ token: "tok-self", role: "recipient", personName: null, contact: "nadia@example.com" }],
    );
    expect(targets).toHaveLength(1);
    const { s, emails } = senders();
    await run(targets, s);
    expect(emails).toHaveLength(1);
  });

  it("one unreachable reader does not cost the others their news", async () => {
    const targets = buildNotifyTargets(
      { recipientEmail: "nadia@example.com", recipientMobile: null },
      [{ token: "tok-manager", role: "manager", personName: "Bree", contact: "bree@example.com" }],
    );
    const seen: string[] = [];
    const { s } = senders({
      sendEmail: async (a) => {
        if (a.to === "nadia@example.com") throw new Error("Resend timeout");
        seen.push(a.to);
        return true;
      },
    });
    const tally = await run(targets, s);
    // The throw is contained, the manager is still told, and the page is still
    // counted as failed so the stamp reverts and the recipient is retried.
    expect(tally).toMatchObject({ delivered: 1, failed: 1 });
    expect(seen).toEqual(["bree@example.com"]);
  });

  it("a suppressed reader is skipped, not counted a failure", async () => {
    const targets = buildNotifyTargets(
      { recipientEmail: "nadia@example.com", recipientMobile: null },
      [],
    );
    const { s } = senders({ isSuppressed: async () => true });
    expect(await run(targets, s)).toMatchObject({ delivered: 0, failed: 0, suppressed: 1 });
  });
});

describe("the addressee swap (#039 family)", () => {
  const claims = [
    {
      helperName: "Tom",
      slotType: "meal" as const,
      customLabel: null,
      slotDate: null,
      slotTime: null,
      note: null,
    },
  ];

  it("addresses the recipient as 'you'", () => {
    const e = buildRecipientClaimNotificationEmail({
      to: "nadia@example.com",
      recipientFirstName: "Nadia",
      isRecipient: true,
      manageLink: "https://x/manage/t",
      claims,
    });
    expect(e.subject).toBe("Someone's just shown up for you 💛");
    expect(e.text).toContain("you're being looked after");
  });

  it("addresses a manager by the recipient's NAME, never as 'you'", () => {
    const e = buildRecipientClaimNotificationEmail({
      to: "bree@example.com",
      recipientFirstName: "Nadia",
      isRecipient: false,
      greetingFirstName: "Bree",
      manageLink: "https://x/manage/t",
      claims,
    });
    expect(e.subject).toBe("Someone's just shown up for Nadia 💛");
    expect(e.text).toContain("Hi Bree,");
    expect(e.text).toContain("Nadia is being looked after");
    // The reader running the page is not the one being cared for.
    expect(e.subject).not.toContain("for you");
    expect(e.text).not.toContain("you're being looked after");
  });

  it("keeps the plural form and the bereavement register while swapping addressee", () => {
    const two = [...claims, { ...claims[0], helperName: "Sam" }];
    const e = buildRecipientClaimNotificationEmail({
      to: "bree@example.com",
      recipientFirstName: "Nadia",
      isRecipient: false,
      greetingFirstName: "Bree",
      manageLink: "https://x/manage/t",
      claims: two,
      occasion: "bereavement",
    });
    expect(e.subject).toBe("Nadia's people are here 💛");
    expect(e.text).toContain("A gentle note — ");
    expect(e.text).toContain("a few of Nadia's people have stepped in");
  });
});

describe("the SMS body stays GSM-7", () => {
  const LINK = "https://www.auntlucy.com.au/manage/" + "a".repeat(64);
  const cases = [
    ["single", { claimCount: 1, occasion: null }],
    ["several", { claimCount: 3, occasion: null }],
    ["bereavement single", { claimCount: 1, occasion: "bereavement" }],
    ["bereavement several", { claimCount: 3, occasion: "bereavement" }],
  ] as const;

  for (const [label, opts] of cases) {
    it(`${label} — no emoji, no em dash, no curly apostrophe`, () => {
      for (const isRecipient of [true, false]) {
        const body = buildRecipientClaimSms({
          recipientFirstName: "Nadia",
          isRecipient,
          manageLink: LINK,
          ...opts,
        });
        // A single emoji or em dash would flip the whole body to UCS-2 and cut
        // the per-segment budget from 153 characters to 67.
        expect(measureSms(body).encoding).toBe("GSM-7");
        expect(body).not.toMatch(/[‘’“”—–]/);
        expect(body).not.toMatch(/\p{Extended_Pictographic}/u);
      }
    });
  }
});
