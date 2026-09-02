/**
 * Bug #095 — the entity on the website footer and the entity on the tax
 * receipt must never disagree.
 *
 * #095 put the legal name and ABN on the WEBSITE FOOTER, on the reasoning that
 * a buyer who suspects a scam wants a name they can check against the public
 * register. That only works if it is the same name and the same number the
 * receipt gives them — and #092 was, in production, a WRONG LEGAL ENTITY ON A
 * TAX DOCUMENT, so this is not a hypothetical failure mode.
 *
 * The two packages cannot import from each other, so there are two sources:
 * rally's LEGAL_ENTITY constant, and supplierName() / supplierAbn() here. Two
 * instead of the eight there were before, and this test is what stops those two
 * drifting — the same solution as #073's lift-wait minutes and #082's
 * "Time to be confirmed", proven the same way, by reading the other package's
 * source rather than importing it.
 *
 * ── WHAT THIS DOES *NOT* CATCH, STATED PLAINLY ──────────────────────────────
 * The API's values are env-overridable (BUSINESS_LEGAL_NAME / BUSINESS_ABN) and
 * deliberately so: a receipt is a tax document and its supplier must be
 * changeable without a deploy. So this compares the two SOURCE DEFAULTS. If
 * production ever sets those env vars to something the frontend does not say,
 * no test can see it — that is a deploy-time check, not a build-time one, and
 * it is the reason to think twice before setting them at all.
 *
 * If these ever move into a shared package, delete this test and import from
 * there instead.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RALLY_SOURCE = path.resolve(__dirname, "../../../rally/src/lib/legalEntity.ts");
const EMAIL_SOURCE = path.resolve(__dirname, "./email.ts");

/**
 * Pull the fields out of rally's LEGAL_ENTITY without importing rally.
 * Literal regexes, not RegExp(string): the escaping is easier to read and
 * impossible to get half-right.
 */
const RALLY_FIELD = {
  name: /^\s*name:\s*"([^"]*)",/m,
  abn: /^\s*abn:\s*"([^"]*)",/m,
} as const;

function rallyField(field: keyof typeof RALLY_FIELD): string {
  const src = fs.readFileSync(RALLY_SOURCE, "utf8");
  const m = src.match(RALLY_FIELD[field]);
  if (!m) throw new Error(`LEGAL_ENTITY.${field} not found in rally's legalEntity.ts`);
  return m[1];
}

/** The fallback baked into supplierName()/supplierAbn() — the shipped default. */
const API_DEFAULT = {
  supplierName: /function supplierName\(\): string \{[\s\S]*?\|\| "([^"]*)";/,
  supplierAbn: /function supplierAbn\(\): string \{[\s\S]*?\|\| "([^"]*)";/,
} as const;

function apiDefault(fn: keyof typeof API_DEFAULT): string {
  const src = fs.readFileSync(EMAIL_SOURCE, "utf8");
  const m = src.match(API_DEFAULT[fn]);
  if (!m) throw new Error(`${fn}'s default not found in email.ts`);
  return m[1];
}

describe("the legal entity on the footer and on the receipt", () => {
  it("both source files are where this test thinks they are", () => {
    // Guards the guard: a moved file should fail readably, not throw.
    expect(fs.existsSync(RALLY_SOURCE)).toBe(true);
    expect(fs.existsSync(EMAIL_SOURCE)).toBe(true);
  });

  it("the legal name matches exactly", () => {
    expect(rallyField("name")).toBe(apiDefault("supplierName"));
  });

  it("the ABN matches exactly", () => {
    expect(rallyField("abn")).toBe(apiDefault("supplierAbn"));
  });

  it("the ABN is 11 digits, spaced the way the register prints it", () => {
    // The spacing is not cosmetic. Someone checking this is copying it into
    // the ABN Lookup search box, and the footer, the legal pages and the tax
    // receipt should all give them the same string to copy.
    expect(rallyField("abn")).toMatch(/^\d{2} \d{3} \d{3} \d{3}$/);
  });
});
