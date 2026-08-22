import { describe, it, expect } from "vitest";
import { classifyContact, isEmailAddress, isPhoneNumber } from "./contactChannel";

// The whole point of this module is the third answer. "no @, therefore SMS"
// would hand a person's NAME to Twilio, because slots.claimed_by_contact falls
// back to the helper's name on a trusted-invite claim that carried no contact
// (routes/invites.ts). These tests pin that down.

describe("classifyContact", () => {
  it("recognises email addresses", () => {
    for (const v of ["jane@example.com", "jane.smith+help@mail.co.uk", " jane@example.com "]) {
      expect(classifyContact(v)).toBe("email");
    }
  });

  it("recognises Australian mobiles as typed, in every common format", () => {
    for (const v of [
      "0412345678",
      "0412 345 678",
      "0412-345-678",
      "+61412345678",
      "+61 412 345 678",
      "(02) 9876 5432",
      "02 9876 5432",
    ]) {
      expect(classifyContact(v)).toBe("sms");
    }
  });

  it("refuses to treat a name as a phone number", () => {
    for (const v of ["Jane Smith", "Jane", "Mum", "Jo-Anne O'Brien"]) {
      expect(classifyContact(v)).toBe("unknown");
    }
  });

  it("refuses an empty or whitespace-only contact", () => {
    for (const v of ["", "   ", null, undefined]) {
      expect(classifyContact(v)).toBe("unknown");
    }
  });

  it("refuses obvious junk rather than guessing a channel", () => {
    for (const v of ["12345", "not-an-email@", "jane@example", "0412 345 678 extension nine"]) {
      expect(classifyContact(v)).toBe("unknown");
    }
  });

  it("rejects a number longer than E.164 allows", () => {
    expect(isPhoneNumber("1".repeat(15))).toBe(true);
    expect(isPhoneNumber("1".repeat(16))).toBe(false);
  });

  it("keeps the two predicates mutually exclusive", () => {
    for (const v of ["jane@example.com", "0412345678", "Jane Smith"]) {
      expect(isEmailAddress(v) && isPhoneNumber(v)).toBe(false);
    }
  });
});
