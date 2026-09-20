/**
 * Closing a page — the words (bug #090).
 *
 * ⚠️ The copy itself is NOT approved and will change. These tests are written
 * to survive a rewording: they assert the SHAPE the rulings fix — the fixed
 * fact is present, it names the task, it is attributed to the closer and never
 * to Aunt Lucy, and it never says why — not the exact sentences.
 */
import { describe, expect, it } from "vitest";
import {
  CLOSED_INVITE_MESSAGE,
  CLOSED_PAGE_MESSAGE,
  closerFirstName,
  grantHolderClosureMessage,
  helperClosureMessage,
  helperClosureSubject,
} from "./pageClosureCopy";

const BASE = {
  helperName: "Priya Nair",
  recipientName: "Tammy Hughes",
  closerFirst: "Fergus",
  slotType: "school_pickup",
  customLabel: null,
  slotDate: "2026-09-22",
  slotTime: "15:15",
  occasion: null as string | null,
  note: null as string | null,
};

describe("the fixed fact", () => {
  it("IS PRESENT WHEN THE OPTIONAL BOX IS EMPTY — the safety floor", () => {
    // ⚠️ THE TEST THIS FILE EXISTS FOR. If a family writes only "thank you all
    // so much" and nobody registers that the school run is off, a child is left
    // at school. So the task detail must survive an EMPTY box, and this asserts
    // it for all three ways of saying "nothing was added".
    for (const note of [null, "", "   "]) {
      const body = helperClosureMessage({ ...BASE, note });
      expect(body).toContain("the school pickup");
      expect(body).toContain("Tuesday 22 September");
      expect(body).toMatch(/isn't going ahead/);
    }
  });

  it("is still present when the box WAS filled in, and the note is attributed", () => {
    const body = helperClosureMessage({ ...BASE, note: "Tammy passed away on Friday." });
    // The fact, unchanged…
    expect(body).toContain("the school pickup");
    expect(body).toMatch(/isn't going ahead/);
    // …and the note, clearly theirs and clearly separate.
    expect(body).toContain("From Fergus:");
    expect(body).toContain("Tammy passed away on Friday.");
    // The fact comes FIRST. A note that ran ahead of it would be read first and
    // the fact skimmed past.
    expect(body.indexOf("school pickup")).toBeLessThan(body.indexOf("From Fergus:"));
  });

  it("names an undated offer as one rather than inventing a day", () => {
    const body = helperClosureMessage({ ...BASE, slotDate: null, slotTime: null });
    expect(body).toContain("whenever suits");
  });

  it("uses the recipient's own wording for a task when they wrote some", () => {
    const body = helperClosureMessage({ ...BASE, customLabel: "the Tuesday run to netball" });
    expect(body).toContain("the Tuesday run to netball");
  });
});

describe("attribution", () => {
  it("is to the CLOSER, never to Aunt Lucy", () => {
    const body = helperClosureMessage(BASE);
    expect(body).toContain("Fergus has closed Tammy's Aunt Lucy page");
    // Aunt Lucy is not the one making a statement about somebody's situation.
    expect(body).not.toMatch(/Aunt Lucy (here|is letting|wanted)/);
  });

  it("goes passive rather than describing someone by their role when we have no name", () => {
    const body = helperClosureMessage({ ...BASE, closerFirst: null });
    expect(body).toContain("Tammy's Aunt Lucy page has been closed");
    expect(body).not.toMatch(/the organiser|the manager|someone running/i);
  });

  it("a recipient's own grant is named from the page; a manager's from the grant", () => {
    expect(closerFirstName({ role: "recipient", personName: null }, "Tammy Hughes")).toBe("Tammy");
    expect(closerFirstName({ role: "manager", personName: "Fergus Bell" }, "Tammy Hughes")).toBe(
      "Fergus",
    );
    // Nothing ever captured a name on the crisis/organiser setup paths.
    expect(closerFirstName({ role: "manager", personName: null }, "Tammy Hughes")).toBeNull();
  });
});

describe("it never says why", () => {
  // 🛑 The most important rule in this work. The fixed fact states what happened
  // to the TASK and makes no claim about the family.
  const REASONS = [
    /\bdied\b/i,
    /\bdeath\b/i,
    /passed away/i,
    /\bfuneral\b/i,
    /no longer needs?\b/i,
    /doesn't need\b/i,
    /\brecovered\b/i,
    /\bbetter now\b/i,
  ];

  it("says nothing about why on either register, and never names the occasion", () => {
    for (const occasion of [null, "bereavement", "new_baby", "illness_recovery", "surgery"]) {
      const body = helperClosureMessage({ ...BASE, occasion });
      // The positive control: this IS the real message, not an empty string.
      expect(body).toContain("the school pickup");
      for (const reason of REASONS) expect(body).not.toMatch(reason);
      expect(body).not.toMatch(/bereavement|new_baby|illness|surgery/i);
    }
  });

  it("the public page's message names nobody and explains nothing", () => {
    expect(CLOSED_PAGE_MESSAGE).toBe("This support page has been closed.");
    for (const reason of REASONS) expect(CLOSED_PAGE_MESSAGE).not.toMatch(reason);
    expect(CLOSED_INVITE_MESSAGE).not.toMatch(/invalid|expired/i);
  });

  it("the free-text box is the ONLY route by which a reason can reach a helper", () => {
    // Which is the point of ruling 4: the family may say why, in their own
    // words, deliberately. We never do it on their behalf.
    const silent = helperClosureMessage({ ...BASE, occasion: "bereavement", note: null });
    const spoken = helperClosureMessage({
      ...BASE,
      occasion: "bereavement",
      note: "Tammy died on Friday.",
    });
    expect(silent).not.toMatch(/died/i);
    expect(spoken).toMatch(/died/i);
  });
});

describe("two endings", () => {
  it("the bereavement register drops the cheerful clause the standard one carries", () => {
    const standard = helperClosureMessage({ ...BASE, occasion: "new_baby" });
    const gentle = helperClosureMessage({ ...BASE, occasion: "bereavement" });
    expect(standard).toContain("it counted");
    expect(gentle).not.toContain("it counted");
    expect(gentle).toContain("Thank you for being there for them");
  });

  it("neither register uses administrative phrasing", () => {
    for (const occasion of [null, "bereavement", "new_baby"]) {
      const body = helperClosureMessage({ ...BASE, occasion });
      expect(body).not.toMatch(/no longer required|not required|cancelled by the system/i);
    }
  });
});

describe("no link to a page that is closed", () => {
  it("carries no URL — the page it would point at answers 404", () => {
    expect(helperClosureMessage({ ...BASE, note: "x" })).not.toMatch(/https?:\/\//);
  });
});

describe("what the other grant-holders are told", () => {
  it("says how many helpers were told", () => {
    const one = grantHolderClosureMessage({
      recipientName: "Tammy Hughes",
      closerFirst: "Fergus",
      helpersTold: 1,
      tellHelpers: true,
    });
    expect(one.body).toContain("The one person");
    const many = grantHolderClosureMessage({
      recipientName: "Tammy Hughes",
      closerFirst: "Fergus",
      helpersTold: 3,
      tellHelpers: true,
    });
    expect(many.body).toContain("The 3 people");
  });

  it("says plainly when the closer is telling people themselves", () => {
    // A sister who assumes everybody was messaged, when her brother chose to
    // ring them himself, will not ring anyone.
    const silent = grantHolderClosureMessage({
      recipientName: "Tammy Hughes",
      closerFirst: "Fergus",
      helpersTold: 0,
      tellHelpers: false,
    });
    expect(silent.body).toContain("Fergus is letting the people who'd offered help know");
    expect(silent.body).toContain("nothing has been sent to them from here");
    // And it is NOT the same as "nobody had a task booked".
    const nobody = grantHolderClosureMessage({
      recipientName: "Tammy Hughes",
      closerFirst: "Fergus",
      helpersTold: 0,
      tellHelpers: true,
    });
    expect(nobody.body).toContain("nobody to tell");
    expect(nobody.body).not.toContain("themselves");
  });

  it("tells them it can be reopened", () => {
    const message = grantHolderClosureMessage({
      recipientName: "Tammy Hughes",
      closerFirst: null,
      helpersTold: 0,
      tellHelpers: true,
    });
    expect(message.body).toContain("reopened");
  });
});

describe("subject lines", () => {
  it("say something closed, and nothing about why", () => {
    expect(helperClosureSubject("Tammy Hughes")).toBe("Tammy's page has closed");
  });
});
