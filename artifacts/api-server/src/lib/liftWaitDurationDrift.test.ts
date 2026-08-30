/**
 * Bug #073 — the tile and the diary entry must never disagree.
 *
 * The wait pill now STATES the duration the calendar blocks ("allow up to about
 * 4 hours"), derived from a copy of the minutes that lives in the rally
 * package. Rally's only workspace dependency is @workspace/api-client-react, so
 * there is nowhere shared to put the numbers today and they are duplicated.
 *
 * This test is what makes that duplication safe. It reads rally's source
 * directly and fails if the two tables drift, because a mismatch is not
 * cosmetic: the tile would promise a helper one thing while their calendar
 * reserved another, which is a sharper version of the bug being fixed.
 *
 * If the numbers ever move into a shared package, delete this test and import
 * from there instead — the cross-package file read is the price of the
 * duplication, not something to keep for its own sake.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { LIFT_WAIT_MODE_MINUTES } from "./liftWaitMode";
import { TIME_TBC } from "./timeTbc";

const RALLY_SOURCE = path.resolve(__dirname, "../../../rally/src/lib/liftWaitMode.ts");

/** Pull the rally-side minutes out of the source text, without importing rally. */
function rallyMinutes(): Record<string, number> {
  const src = fs.readFileSync(RALLY_SOURCE, "utf8");
  const block = src.match(
    /export const LIFT_WAIT_MODE_MINUTES: Record<LiftWaitMode, number> = \{([\s\S]*?)\};/,
  );
  if (!block) throw new Error("LIFT_WAIT_MODE_MINUTES not found in rally's liftWaitMode.ts");
  const out: Record<string, number> = {};
  for (const [, key, value] of block[1].matchAll(/^\s*(\w+):\s*(\d+),/gm)) {
    out[key] = Number(value);
  }
  return out;
}

describe("lift wait durations", () => {
  it("rally's source file is where this test thinks it is", () => {
    // Guards the guard: a moved file would otherwise make this suite throw
    // rather than fail with something readable.
    expect(fs.existsSync(RALLY_SOURCE)).toBe(true);
  });

  it("the tile's minutes match the calendar's minutes exactly", () => {
    expect(rallyMinutes()).toEqual(LIFT_WAIT_MODE_MINUTES);
  });

  it("a waiting lift really is the long one the pill now warns about", () => {
    // If this ever drops below a couple of hours the pill's "allow up to about
    // N hours" stops being the warning it exists to be.
    expect(LIFT_WAIT_MODE_MINUTES.wait).toBeGreaterThanOrEqual(120);
  });
});

/**
 * Bug #082 — the same duplication problem as the minutes above, so the same
 * guard. #033 decided this wording and put it in rally; the server needed its
 * own copy because the two packages cannot import from each other. If they ever
 * diverge, the task tile and the email about that same task would describe an
 * unset time with two different phrases — a smaller version of the very bug
 * being fixed, which was the tile saying one thing and the email nothing.
 */
describe("the 'time to be confirmed' wording", () => {
  it("matches rally's copy exactly", () => {
    const src = fs.readFileSync(RALLY_SOURCE, "utf8");
    const m = src.match(/export const TIME_TBC = "([^"]*)";/);
    if (!m) throw new Error("TIME_TBC not found in rally's liftWaitMode.ts");
    expect(m[1]).toBe(TIME_TBC);
  });
});
