/**
 * Bug #071 — deleting a draft must never be able to reach a live page.
 *
 * The brief named this as the risk worth more than the bug: "#071's delete must
 * not become a way to lose an ACTIVE page. If the same control can reach a live
 * page with helpers already committed, that's a far worse bug than the one
 * being fixed." These tests are that guarantee, and each was sabotaged.
 */
import { describe, expect, it } from "vitest";
import { canDeleteDraft } from "./draftDeletion";

const ME = "org-1";
const draft = { status: "draft", organiserId: ME };

describe("what may be deleted", () => {
  it("allows my own draft with no gift attached", () => {
    expect(canDeleteDraft(draft, ME, false)).toEqual({ ok: true });
  });
});

describe("what may NOT be deleted", () => {
  it("refuses an ACTIVE page — the one that would be worse than the bug", () => {
    const v = canDeleteDraft({ status: "active", organiserId: ME }, ME, false);
    expect(v.ok).toBe(false);
    expect(v).toMatchObject({ status: 409 });
  });

  it("refuses a CLOSED page", () => {
    expect(canDeleteDraft({ status: "closed", organiserId: ME }, ME, false).ok).toBe(false);
  });

  it("refuses somebody else's draft, as not-found rather than forbidden", () => {
    // 404 not 403: a stranger must not learn that this page id exists.
    expect(canDeleteDraft(draft, "org-2", false)).toMatchObject({ ok: false, status: 404 });
  });

  it("refuses a gift page, which owns no organiser at all", () => {
    expect(canDeleteDraft({ status: "draft", organiserId: null }, ME, false)).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("refuses a DRAFT that belongs to a gift — scheduled activation", () => {
    // The trap this lock exists for: a gift page IS a draft when the recipient
    // schedules activation for later, so "draft" alone does not mean throwaway.
    // Deleting it would destroy a page someone paid $59 for and orphan the gift.
    expect(canDeleteDraft(draft, ME, true)).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses a page that does not exist", () => {
    expect(canDeleteDraft(null, ME, false)).toMatchObject({ ok: false, status: 404 });
    expect(canDeleteDraft(undefined, ME, false)).toMatchObject({ ok: false, status: 404 });
  });
});
