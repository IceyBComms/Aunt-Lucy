/**
 * Going live is a deliberate act (14 Sep 2026).
 *
 * Step 3 of the organiser/crisis path used to publish in a mount effect, and
 * the route behind it checked nothing. These tests are the server-side half of
 * the fix — the half that actually guards it, because a frontend button does
 * not stop an old link, a back button or a direct request.
 *
 * P2: an absence ("refuses") passes for free if the function refuses
 * everything. So the FIRST test is the positive control — a draft with a task
 * really is allowed — and the refusals are only meaningful beside it.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { canPublish } from "./pagePublish";

describe("the publish route goes through it", () => {
  // P5: a pure rule the route forgot to call guards nothing. Read the route's
  // source, the established shape here (see routeFooterCoverage).
  const src = fs.readFileSync(path.resolve(__dirname, "../routes/organiser.ts"), "utf8");
  const start = src.indexOf('router.post("/organiser/pages/:pageId/publish"');
  const route = start < 0 ? "" : src.slice(start, src.indexOf("\n});", start));

  it("finds the publish route (or this test is reading the wrong shape)", () => {
    expect(start).toBeGreaterThan(-1);
    expect(route).toContain('.set({ status: "active" })');
  });

  it("decides with canPublish over the page's own slots, BEFORE any update", () => {
    const verdictAt = route.indexOf("canPublish(page, page?.slots");
    expect(verdictAt).toBeGreaterThan(-1);
    expect(verdictAt).toBeLessThan(route.indexOf(".update(supportPagesTable)"));
    expect(route).toContain("slots: { columns: { id: true } }");
    expect(route).toMatch(/if \(!verdict\.ok\) \{\s*res\.status\(verdict\.status\)/);
  });

  it("only flips a row that is STILL a draft — two presses cannot both publish", () => {
    expect(route).toMatch(/\.where\(and\(eq\(supportPagesTable\.id, [^)]*\), eq\(supportPagesTable\.status, "draft"\)\)\)/);
  });
});

const oneTask = [{ id: "slot-1" }];

describe("what may go live — the positive control", () => {
  it("allows a draft with one task", () => {
    expect(canPublish({ status: "draft" }, oneTask)).toEqual({ ok: true });
  });

  it("allows a draft with several tasks", () => {
    expect(canPublish({ status: "draft" }, [{}, {}, {}])).toEqual({ ok: true });
  });
});

describe("what may NOT go live", () => {
  it("refuses a draft with no tasks", () => {
    expect(canPublish({ status: "draft" }, [])).toMatchObject({
      ok: false,
      status: 409,
      reason: "no_tasks",
    });
  });

  it("refuses a page that is already active — a stale step-3 link", () => {
    expect(canPublish({ status: "active" }, oneTask)).toMatchObject({
      ok: false,
      status: 409,
      reason: "not_draft",
    });
  });

  it("refuses a CLOSED page — a back button must not reopen it", () => {
    expect(canPublish({ status: "closed" }, oneTask)).toMatchObject({
      ok: false,
      reason: "not_draft",
    });
  });

  it("refuses a page it cannot find, as not-found", () => {
    expect(canPublish(null, oneTask)).toMatchObject({ ok: false, status: 404, reason: "not_found" });
    expect(canPublish(undefined, oneTask)).toMatchObject({ ok: false, status: 404 });
  });

  it("checks status BEFORE tasks — an active page with no tasks is 'not a draft'", () => {
    // Order matters for the message: telling someone to add a task to a page
    // that is already live would send them looking for the wrong fix.
    expect(canPublish({ status: "active" }, [])).toMatchObject({ reason: "not_draft" });
  });

  it("every refusal carries a message to show the person", () => {
    for (const v of [canPublish(null, []), canPublish({ status: "active" }, []), canPublish({ status: "draft" }, [])]) {
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.error.length).toBeGreaterThan(0);
    }
  });
});
