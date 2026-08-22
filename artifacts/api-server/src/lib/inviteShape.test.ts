import { describe, it, expect } from "vitest";
import { inviteShape } from "./inviteShape";

// Bug #031. The organiser per-slot invite endpoint used to decide BOTH the kind
// and the channel from one ternary on the contact format, so an email address
// silently produced a general page invite with no grant token — while the row
// still pointed at the trusted slot. These tests pin the two decisions apart.
describe("inviteShape", () => {
  describe("kind comes from whether a task was chosen", () => {
    it("is trusted for a chosen task, whatever the contact format", () => {
      expect(inviteShape({ slotChosen: true, contactIsEmail: false }).kind).toBe("trusted");
      expect(inviteShape({ slotChosen: true, contactIsEmail: true }).kind).toBe("trusted");
    });

    it("is general when no task was chosen, whatever the contact format", () => {
      expect(inviteShape({ slotChosen: false, contactIsEmail: false }).kind).toBe("general");
      expect(inviteShape({ slotChosen: false, contactIsEmail: true }).kind).toBe("general");
    });
  });

  describe("channel comes from the contact format", () => {
    it("emails an email address, whether or not a task was chosen", () => {
      expect(inviteShape({ slotChosen: true, contactIsEmail: true }).channel).toBe("email");
      expect(inviteShape({ slotChosen: false, contactIsEmail: true }).channel).toBe("email");
    });

    it("texts a mobile number, whether or not a task was chosen", () => {
      expect(inviteShape({ slotChosen: true, contactIsEmail: false }).channel).toBe("sms");
      expect(inviteShape({ slotChosen: false, contactIsEmail: false }).channel).toBe("sms");
    });
  });

  describe("the grant token follows the kind, never the channel", () => {
    it("mints one for an emailed trusted invite — the regression itself", () => {
      const shape = inviteShape({ slotChosen: true, contactIsEmail: true });
      expect(shape).toEqual({ kind: "trusted", channel: "email", needsInviteToken: true });
    });

    it("mints one for a texted trusted invite, as it always did", () => {
      expect(inviteShape({ slotChosen: true, contactIsEmail: false }).needsInviteToken).toBe(true);
    });

    it("mints none for a general invite on either channel", () => {
      expect(inviteShape({ slotChosen: false, contactIsEmail: true }).needsInviteToken).toBe(false);
      expect(inviteShape({ slotChosen: false, contactIsEmail: false }).needsInviteToken).toBe(false);
    });
  });

  it("never leaves the broken combination: a slot-scoped invite with no grant", () => {
    for (const contactIsEmail of [true, false]) {
      const shape = inviteShape({ slotChosen: true, contactIsEmail });
      // slot_id set + kind 'general' + invite_token null was the unclaimable row.
      expect(shape.kind).not.toBe("general");
      expect(shape.needsInviteToken).toBe(true);
    }
  });
});
