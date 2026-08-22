import { describe, it, expect } from "vitest";
import {
  trustedInviteEmailSubject,
  trustedInviteEmailText,
  generalInviteEmailSubject,
  generalInviteEmailText,
  TRUSTED_INVITE_EMAIL_CTA,
} from "./inviteCopy";
import { renderHelperInviteEmailHtml } from "./email";

// Bug #032. Inviting an email contact to a trusted-only task used to be
// downgraded to a general page invite — the slot and its grant dropped, the
// wording generic, nobody told — because the trusted ask existed only as an
// SMS and there was no email body to send. These tests pin the approved body
// and the chrome that carries it.

const UNSUB = "https://www.auntlucy.com.au/unsubscribe/8c1f2a";

const params = {
  helperFirstName: "Priya",
  recipientFirstName: "Sarah",
  trustedLine: "finding her feet with the new baby",
  taskLabel: "School pickup for Ada",
  when: "Friday 4 September at 3:15pm",
  link: "https://www.auntlucy.com.au/invite/abc123",
  unsubscribeUrl: UNSUB,
};

const nineC = (unsubscribeUrl = UNSUB) =>
  generalInviteEmailText({
    helperFirstName: "Priya",
    recipientFirstName: "Sarah",
    situationLine: "just welcomed her new baby",
    pronounObj: "her",
    link: "https://www.auntlucy.com.au/s/xK9mR2pQ4w",
    unsubscribeUrl,
  });

describe("the trusted invite email copy", () => {
  it("uses the approved subject, led by the recipient's name", () => {
    expect(trustedInviteEmailSubject("Sarah")).toBe(
      "Sarah was hoping you might help with something",
    );
  });

  it("is the approved body, verbatim", () => {
    expect(trustedInviteEmailText(params)).toBe(
      [
        "Hi Priya,",
        "",
        "Sarah's finding her feet with the new baby, and you came to mind for something in particular:",
        "",
        "School pickup for Ada — Friday 4 September at 3:15pm",
        "",
        "This one's only being asked of a few people, which is why this note is just for you.",
        "",
        "Only if it suits — no pressure at all, and nothing happens if you'd rather not.",
        "",
        "Have a look → https://www.auntlucy.com.au/invite/abc123",
        "",
        "— Aunt Lucy",
        "",
        `Don't want to receive these emails? Unsubscribe here: ${UNSUB}`,
      ].join("\n"),
    );
  });

  // The whole point of the new body: an SMS deliberately doesn't name the task,
  // so if the email didn't either, the downgrade would still be losing the ask.
  it("names the task and when — that is what the general body could not do", () => {
    const body = trustedInviteEmailText(params);
    expect(body).toContain("School pickup for Ada");
    expect(body).toContain("Friday 4 September at 3:15pm");
    expect(body).not.toContain("have set up an Aunt Lucy page");
  });

  it("leaves no placeholder unresolved", () => {
    expect(trustedInviteEmailText(params)).not.toMatch(/\{[a-zA-Z]+\}/);
  });

  // {organiserFirstName} is not available at any build site that calls this —
  // see the note above the function. The approved fallback is the only wording.
  it("never claims to name an organiser it cannot know", () => {
    const body = trustedInviteEmailText(params);
    expect(body).toContain("and you came to mind for something in particular:");
    expect(body).not.toContain("thought of you for something in particular");
  });

  // Kate's ruling: the plain-text opt-out line is 9c's, verbatim, in the same
  // position — the last line, after the sign-off, with a blank line before it.
  // Derived from 9c's own output rather than retyped, so a reword there can
  // never leave these two silently diverged.
  it("ends with 9c's unsubscribe line, verbatim and in the same position", () => {
    const general = nineC().split("\n");
    const trusted = trustedInviteEmailText(params).split("\n");

    const generalLast = general[general.length - 1];
    expect(generalLast).toBe(
      `Don't want to receive these emails? Unsubscribe here: ${UNSUB}`,
    );
    expect(trusted[trusted.length - 1]).toBe(generalLast);
    expect(trusted[trusted.length - 2]).toBe("");
    expect(general[general.length - 2]).toBe("");
  });

  // The address is passed through from whatever the calling path already used.
  // This PR does not rewire any of them.
  it("spells out whatever address the caller passes, untouched", () => {
    const viaPublicPage = trustedInviteEmailText({
      ...params,
      unsubscribeUrl: "https://www.auntlucy.com.au/s/xK9mR2pQ4w",
    });
    expect(viaPublicPage.trimEnd().endsWith("https://www.auntlucy.com.au/s/xK9mR2pQ4w")).toBe(
      true,
    );
  });

  it("carries the recipient's optional personal opener above the body", () => {
    const body = trustedInviteEmailText({
      ...params,
      openingLine: "Hi love — hope the new job's treating you well.",
    });
    expect(body.startsWith("Hi love — hope the new job's treating you well.\n\nHi Priya,")).toBe(
      true,
    );
  });
});

describe("the branded chrome around it", () => {
  const html = renderHelperInviteEmailHtml({
    text: trustedInviteEmailText(params),
    link: params.link,
    ctaLabel: TRUSTED_INVITE_EMAIL_CTA,
    unsubscribeUrl: UNSUB,
  });

  it("renders the CTA as a button with the body's own words", () => {
    expect(html).toContain(">Have a look</span>");
    expect(html).toContain(`href="${params.link}"`);
  });

  it("does not also leave the CTA line sitting in the text", () => {
    expect(html).not.toContain("Have a look → https");
  });

  // The body line and the footer link are the same opt-out. The HTML must show
  // it once, as the footer — exactly as 9c has always behaved.
  it("shows the unsubscribe once, in the footer, not twice", () => {
    expect(html).not.toContain("Unsubscribe here: https");
    expect(html.split("Unsubscribe here").length - 1).toBe(1);
  });

  it("keeps every other line of the body", () => {
    expect(html).toContain("This one&#039;s only being asked of a few people".replace("&#039;", "'"));
    expect(html).toContain("School pickup for Ada — Friday 4 September at 3:15pm");
    expect(html).toContain("— Aunt Lucy");
  });

  it("renders the footer unsubscribe link exactly as it always has", () => {
    expect(html).toContain(
      `Don't want to receive these emails? <a href="${UNSUB}" style="color:#999;">Unsubscribe here</a>.`,
    );
  });
});

describe("the general 9c email is untouched by the new parameter", () => {
  it("keeps its own subject", () => {
    expect(generalInviteEmailSubject("Sarah")).toBe("A little way to help Sarah 💛");
  });

  // No ctaLabel passed — the default must still be 9c's wording, or every
  // existing caller would start rendering its CTA line twice.
  it("still strips its own CTA line and titles its own button", () => {
    const html = renderHelperInviteEmailHtml({
      text: nineC("https://www.auntlucy.com.au/unsubscribe/c1"),
      link: "https://www.auntlucy.com.au/s/xK9mR2pQ4w",
      unsubscribeUrl: "https://www.auntlucy.com.au/unsubscribe/c1",
    });
    expect(html).toContain(">See how you can help</span>");
    expect(html).not.toContain("See how you can help → https");
  });
});
