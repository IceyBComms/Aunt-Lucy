/**
 * Bug #085 — the first email the person running a page ever receives must call
 * them by their own name.
 *
 * Kate set a page up as FERGUS for TAMMY on production; the "keep this link"
 * email went to fergus@ and opened "Hi Tammy". Same family as #039 and #025's
 * addressee swap — a string written for one audience reaching another.
 *
 * These assert the swap comes from the SHARED rule (lib/claimNotifyCopy's
 * claimAddressee), not a second conditional grown alongside it.
 */
import { describe, expect, it } from "vitest";
import { buildCrisisPageSavedEmail } from "./email";

const LINK = "https://www.auntlucy.com.au/organise/dashboard";

describe("who the keep-this-link email is addressed to", () => {
  it("someone else's page: greets the RUNNER, and the page is the recipient's", () => {
    const e = buildCrisisPageSavedEmail({
      to: "fergus@vouch.com.au",
      name: "Fergus",
      recipientName: "Tammy",
      isRecipient: false,
      pageLink: LINK,
    });
    expect(e.text).toContain("Hi Fergus,");
    expect(e.text).toContain("Here's Tammy's page");
    // The exact production fault, asserted as absent.
    expect(e.text).not.toContain("Hi Tammy");
    expect(e.text).not.toContain("Here's your page");
    expect(e.html).toContain("Hi Fergus,");
    expect(e.html).toContain("Here's Tammy's page");
  });

  it("their own page: greets them and the page is theirs", () => {
    const e = buildCrisisPageSavedEmail({
      to: "val@example.com",
      name: "Val",
      recipientName: "Val",
      isRecipient: true,
      pageLink: LINK,
    });
    expect(e.text).toContain("Hi Val,");
    expect(e.text).toContain("Here's your page");
  });

  it("defaults to the for-self wording, so the old single-caller behaviour is untouched", () => {
    const e = buildCrisisPageSavedEmail({ to: "v@x.com", name: "Val", pageLink: LINK });
    expect(e.text).toContain("Hi Val,");
    expect(e.text).toContain("Here's your page");
  });

  it("uses first names only, on both halves of the swap", () => {
    const e = buildCrisisPageSavedEmail({
      to: "f@x.com",
      name: "Fergus Barrow",
      recipientName: "Tammy Whitlam",
      isRecipient: false,
      pageLink: LINK,
    });
    expect(e.text).toContain("Hi Fergus,");
    expect(e.text).toContain("Here's Tammy's page");
    expect(e.text).not.toContain("Barrow");
    expect(e.text).not.toContain("Whitlam");
  });

  it("an organiser with no name on file gets 'there', never the wrong name", () => {
    // Every organiser created before migration 0014 has no name. "Hi there" is
    // honest; "Hi Tammy" to Fergus is the bug. The route passes "there".
    const e = buildCrisisPageSavedEmail({
      to: "f@x.com",
      name: "there",
      recipientName: "Tammy",
      isRecipient: false,
      pageLink: LINK,
    });
    expect(e.text).toContain("Hi there,");
    expect(e.text).not.toContain("Hi Tammy");
    expect(e.text).toContain("Here's Tammy's page");
  });
});
