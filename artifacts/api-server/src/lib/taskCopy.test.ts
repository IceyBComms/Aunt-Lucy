/**
 * @workspace/task-copy — the one task list and the one date format.
 *
 * ── What this file replaces ──────────────────────────────────────────────────
 * Two drift tests used to live beside this one and are DELETED (row #136):
 *   • the "school run" drift test, which read nine files and checked no display
 *     table had drifted back to "School pickup";
 *   • slotFlexibilityDrift, which read rally's mirror of the flexible/fixed
 *     rule and failed if it disagreed with the server's.
 * Both existed because the same thing was written down twice. It is now written
 * down once, so there is nothing to compare — and this is the test that the ONE
 * copy is complete and right.
 *
 * It lives in api-server rather than in the package because that is where this
 * repo's vitest runs. It imports the package exactly as the product does.
 *
 * The THREE REPAIRED SENTENCES are tested in rally instead, because they are
 * built by rally's own screen-copy module, which this package cannot import:
 * see artifacts/rally/src/test/taskSentences.test.tsx.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ANY_TIME_THAT_DAY,
  ANY_TIME_THAT_DAY_CLAUSE,
  CARD_JOIN,
  SLOT_TYPES,
  TASK_COPY,
  defaultFlexibility,
  defaultFlexibilityForType,
  formatShortDate,
  formatTaskDate,
  formatTaskTime,
  taskTimeLabel,
  taskLabel,
  taskNoun,
  taskPickerHint,
  taskShortNoun,
  taskWhenCard,
  taskWhenClause,
  taskWhenSentence,
} from "@workspace/task-copy";

// ─── THE LIST IS COMPLETE ────────────────────────────────────────────────────

/**
 * The slot_type enum, read from the DATABASE SCHEMA rather than retyped.
 *
 * This is the whole point of the test: a slot type added to the database and
 * not to the copy package would otherwise show up as a raw key on someone's
 * screen — which is #127, the bug that started all of this. Reading the schema
 * is what makes this a coverage test rather than a restatement.
 */
function slotTypeEnumFromSchema(): string[] {
  const src = fs.readFileSync(
    path.resolve(import.meta.dirname, "../../../../lib/db/src/schema/slots.ts"),
    "utf8",
  );
  const block = src.match(/slotTypeEnum[\s\S]*?\[([\s\S]*?)\]/);
  if (!block) throw new Error("slot_type enum not found in lib/db/src/schema/slots.ts");
  return [...block[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

describe("the one task list covers every slot type", () => {
  const fromSchema = slotTypeEnumFromSchema();

  it("the database's enum really was read", () => {
    // Positive control. Without it, a regex that stopped matching would leave
    // an empty list and every assertion below would pass on nothing.
    expect(fromSchema.length).toBeGreaterThan(5);
    expect(fromSchema).toContain("school_pickup");
  });

  it("every enum value has copy, and the package adds none of its own", () => {
    expect([...SLOT_TYPES].sort()).toEqual([...fromSchema].sort());
  });

  it("every form of every name is non-empty", () => {
    for (const type of fromSchema) {
      const copy = TASK_COPY[type as keyof typeof TASK_COPY];
      expect(copy, `no copy for ${type}`).toBeTruthy();
      for (const [form, value] of Object.entries(copy)) {
        expect(value.trim(), `${type}.${form} is empty`).not.toBe("");
      }
    }
  });

  it("every label is SENTENCE CASE — 'School run', never 'School Run'", () => {
    // Kate ruled the word "school run" (#127) and one capitalisation goes with
    // it. Title Case and sentence case were both live, each table internally
    // consistent, which is how "School Run" and "School run" were on two
    // screens for one task.
    for (const type of SLOT_TYPES) {
      const label = TASK_COPY[type].label;
      expect(label[0], `${type} label should start capitalised`).toBe(
        label[0].toUpperCase(),
      );
      const rest = label.slice(1);
      expect(rest, `${type} label has a capital mid-label: "${label}"`).toBe(
        rest.toLowerCase(),
      );
    }
  });

  it("no name anywhere is a raw enum key", () => {
    for (const type of SLOT_TYPES) {
      for (const value of Object.values(TASK_COPY[type])) {
        expect(value).not.toMatch(/_/);
      }
    }
  });

  it("a hand-typed label always wins, on every form", () => {
    const typed = "Bring the good sourdough";
    expect(taskLabel("meal", typed)).toBe(typed);
    expect(taskNoun("school_pickup", typed)).toBe(typed);
    expect(taskShortNoun("other", typed)).toBe(typed);
    // Whitespace is not a label.
    expect(taskLabel("meal", "   ")).toBe("Meal");
    expect(taskLabel("meal", null)).toBe("Meal");
  });

  it("an unknown type falls back rather than printing the key", () => {
    expect(taskLabel("hovercraft", null)).toBe(TASK_COPY.other.label);
    expect(taskNoun("hovercraft", null)).toBe(TASK_COPY.other.noun);
  });

  it("the picker hint is on ERRAND and nowhere else", () => {
    // There is no `lift` slot type — this codebase models a lift as a DATED
    // errand — so someone looking for one would not find it in the choices.
    expect(taskPickerHint("errand")).toContain("lift");

    // ⚠️ Null on every other type, and null must render NOTHING: no line, no
    // gap. A hint that quietly appeared under "Meal" would be a second table
    // starting, which is the shape this whole package exists to stop.
    for (const type of SLOT_TYPES) {
      if (type === "errand") continue;
      expect(taskPickerHint(type), type).toBeNull();
    }
    expect(taskPickerHint("hovercraft")).toBeNull();
  });

  it("the hint explains the TYPE, so a custom label cannot change it", () => {
    // Deliberately takes no customLabel: "Lift to the hospital Tuesday" is
    // still an errand, and what an errand covers is true either way.
    expect(taskPickerHint("errand")).toBe(TASK_COPY.errand.pickerHint);
  });

  it("every mid-sentence noun carries an article, or is a gerund", () => {
    // Row #136's fifth decision, and why a label was never enough. Lower-casing
    // one is not a grammar: it reads fine on the mass and gerund nouns BY LUCK
    // and wrong on every count noun — "still down for meal", "for errand",
    // "for visit". THIS is what makes the three repaired sentences sentences.
    for (const type of SLOT_TYPES) {
      expect(TASK_COPY[type].noun, type).toMatch(/^(a|an|the|looking|walking) /);
    }
  });
});

// ─── THE ONE DATE AND TIME FORMAT ────────────────────────────────────────────

describe("the one date format", () => {
  // A fixed "now", so the year rule is tested rather than today's clock.
  const IN_2026 = new Date("2026-09-21T00:00:00Z");

  it("this year: weekday, day, month, NO COMMA, no year", () => {
    expect(formatTaskDate("2026-09-22", IN_2026)).toBe("Tuesday 22 September");
  });

  it("another year: the year is added, and only then", () => {
    expect(formatTaskDate("2027-09-21", IN_2026)).toBe("Tuesday 21 September 2027");
    expect(formatTaskDate("2025-08-12", IN_2026)).toBe("Tuesday 12 August 2025");
  });

  it("there is no comma after the weekday, on any day of the week", () => {
    // "Sunday, August 23" was one of the three formats row #139 was filed over.
    for (let day = 1; day <= 7; day++) {
      const iso = `2026-09-${String(day).padStart(2, "0")}`;
      expect(formatTaskDate(iso, IN_2026)).not.toContain(",");
    }
  });

  it("the stored date is formatted AS WRITTEN — no timezone can shift it", () => {
    // The server runs in UTC and the reader is in Australia. A date parsed as
    // an instant prints as the previous day for one of them at the edges.
    // Both of these are in the current year, so neither carries one either.
    expect(formatTaskDate("2026-01-01", IN_2026)).toBe("Thursday 1 January");
    expect(formatTaskDate("2026-12-31", IN_2026)).toBe("Thursday 31 December");
  });

  it("the time is lower case with no space", () => {
    expect(formatTaskTime("15:00")).toBe("3:00pm");
    expect(formatTaskTime("09:05")).toBe("9:05am");
    expect(formatTaskTime("00:30")).toBe("12:30am");
    expect(formatTaskTime("12:00")).toBe("12:00pm");
    expect(formatTaskTime("15:00:00")).toBe("3:00pm");
  });

  it("the CARD join is ' · '", () => {
    expect(taskWhenCard("2026-09-22", "15:00", "fixed", IN_2026)).toBe(
      "Tuesday 22 September · 3:00pm",
    );
  });

  it("the SENTENCE join is ' at ' — the same words, joined differently", () => {
    expect(taskWhenSentence("2026-09-22", "15:00", "fixed", IN_2026)).toBe(
      "Tuesday 22 September at 3:00pm",
    );
    expect(taskWhenClause("2026-09-22", "15:00", "fixed", IN_2026)).toBe(
      "on Tuesday 22 September at 3:00pm",
    );
  });

  it("an undated task is words, and takes no 'on'", () => {
    expect(taskWhenCard(null, null, "fixed", IN_2026)).toBe("Whenever suits");
    expect(taskWhenClause(null, null, "fixed", IN_2026)).toBe("whenever suits");
  });

  it("the short form drops the weekday, and keeps the year rule", () => {
    expect(formatShortDate("2026-08-12T00:00:00.000Z", IN_2026)).toMatch(
      /^\d{1,2} August$/,
    );
    expect(formatShortDate("2025-08-12T00:00:00.000Z", IN_2026)).toMatch(
      /^\d{1,2} August 2025$/,
    );
  });
});

describe("a dated task with no time", () => {
  const IN_2026 = new Date("2026-09-21T00:00:00Z");

  it('reads "Any time that day" on a card', () => {
    expect(taskWhenCard("2026-09-22", null, "fixed", IN_2026)).toBe(
      "Tuesday 22 September · Any time that day",
    );
  });

  it("reads the same words, lower case, in a sentence", () => {
    expect(taskWhenSentence("2026-09-22", null, "fixed", IN_2026)).toBe(
      "Tuesday 22 September, any time that day",
    );
  });

  it("the clause is DERIVED, never a second string to keep in step", () => {
    expect(ANY_TIME_THAT_DAY_CLAUSE).toBe(
      ANY_TIME_THAT_DAY.charAt(0).toLowerCase() + ANY_TIME_THAT_DAY.slice(1),
    );
  });
});

/**
 * ROW #145 — "around", and the three places it may and may not appear.
 *
 * Kate's ruling, 21 September 2026: a flexible task with a time reads "around
 * 4:00pm"; a fixed one reads plain "4:00pm". She found it on a dated errand she
 * had marked "Around then is fine", whose public card read "4:00pm" — the same
 * words a school run gets.
 *
 * ⚠️ P2. "fixed does not say around" passes for free against a formatter that
 * never says it at all, so every negative here sits beside the positive from
 * the SAME inputs.
 */
describe("a flexible time says so", () => {
  const IN_2026 = new Date("2026-09-21T00:00:00Z");

  it("the time label carries the word, and only when flexible", () => {
    expect(taskTimeLabel("16:00", "flexible")).toBe("around 4:00pm");
    expect(taskTimeLabel("16:00", "fixed")).toBe("4:00pm");
  });

  it("Kate's two shapes, verbatim", () => {
    expect(taskWhenCard("2026-09-23", "16:00", "flexible", IN_2026)).toBe(
      "Wednesday 23 September · around 4:00pm",
    );
    expect(taskWhenSentence("2026-09-23", "16:00", "flexible", IN_2026)).toBe(
      "Wednesday 23 September at around 4:00pm",
    );
  });

  it("a FIXED task reads the same line without the word", () => {
    expect(taskWhenCard("2026-09-23", "16:00", "fixed", IN_2026)).toBe(
      "Wednesday 23 September · 4:00pm",
    );
    expect(taskWhenSentence("2026-09-23", "16:00", "fixed", IN_2026)).toBe(
      "Wednesday 23 September at 4:00pm",
    );
  });

  it("an UNTIMED task never takes it, however flexible it is", () => {
    // Row #143 forces an untimed task flexible on the server, so this is the
    // COMMON case, not an edge one — and "around any time that day" would be
    // the sentence every one of them shipped.
    expect(taskWhenCard("2026-09-23", null, "flexible", IN_2026)).toBe(
      "Wednesday 23 September · Any time that day",
    );
    expect(taskWhenSentence("2026-09-23", null, "flexible", IN_2026)).toBe(
      "Wednesday 23 September, any time that day",
    );
    expect(taskWhenClause(null, null, "flexible", IN_2026)).toBe("whenever suits");
  });
});

// ─── "TO BE CONFIRMED" IS GONE, AND "·" NEVER REACHES A TEXT ─────────────────

const REPO = path.resolve(import.meta.dirname, "../../../..");

/** Every shipped .ts/.tsx source file in the two artifacts and this package. */
function sourceFiles(): string[] {
  const roots = [
    path.join(REPO, "artifacts", "api-server", "src"),
    path.join(REPO, "artifacts", "rally", "src"),
    path.join(REPO, "lib", "task-copy", "src"),
  ];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      // Test files are excluded: this one has to NAME the phrase in order to
      // forbid it, and a test is not copy anybody reads on a screen.
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  roots.forEach(walk);
  return out;
}

/**
 * A file's CODE lines — comment lines dropped.
 *
 * ⚠️ Deliberate, and the same convention #127's drift test used: these files
 * legitimately record what the words USED to be and why they changed, and a
 * check that forbade the phrase outright would force us to delete the reason.
 *
 * ⚠️ No pattern here may span a line break — the repo has no .gitattributes and
 * these files are CRLF on disk (#124/#128).
 */
function codeLines(file: string): string[] {
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));
}

describe('"to be confirmed" is gone from the product', () => {
  const files = sourceFiles();

  it("the sweep really read the source", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.endsWith("SlotCard.tsx"))).toBe(true);
  });

  it("no file builds a string containing it", () => {
    const offenders = files.filter((f) =>
      codeLines(f).some((line) => /to be confirmed/i.test(line)),
    );
    expect(offenders.map((f) => path.relative(REPO, f))).toEqual([]);
  });

  it("every renderer of an untimed task says the same words instead", () => {
    // The surfaces that show a dated task with no time. Each must reach the
    // shared words rather than writing them out again.
    const RENDERERS = [
      "artifacts/rally/src/components/SlotCard.tsx",
      "artifacts/rally/src/components/GiftActivation.tsx",
      "artifacts/rally/src/pages/InviteClaim.tsx",
      "artifacts/rally/src/pages/ReleaseSlot.tsx",
      "artifacts/rally/src/pages/Manage.tsx",
      "artifacts/api-server/src/lib/calendarFeed.ts",
    ];
    for (const rel of RENDERERS) {
      const src = fs.readFileSync(path.join(REPO, rel), "utf8");
      expect(src, `${rel} no longer says it`).toMatch(
        /ANY_TIME_THAT_DAY|taskWhenCard|taskWhenSentence|taskWhenClause/,
      );
    }
  });
});

/**
 * ⚠️ A NINTH TABLE CANNOT BE STARTED.
 *
 * This is the guard that replaces the deleted drift test, and it is a stronger
 * one: the old test listed the nine files that named a task and checked their
 * spelling, so a TENTH file would simply not have been looked at. This forbids
 * the SHAPE instead — a slot_type key mapped to a display string — anywhere
 * outside the package, which is what every one of the eight tables looked like:
 *
 *     school_pickup: "School Run",
 *     school_pickup: { icon: "🚗", label: "School Run" },
 *
 * Icons are deliberately still allowed to live in rally: an emoji carries no
 * ASCII letter, so `school_pickup: "🚗"` passes and `school_pickup: "School
 * Run"` does not. Emoji were out of scope for this job and stayed put.
 *
 * `other` is NOT in the key list: it is also a value of the OCCASION enum, and
 * `other: "Other"` is a legitimate occasion label in four files. Seven keys is
 * enough — a table is a table because it covers the types, and nobody writes
 * one with only `other` in it.
 */
describe("no second task-name table can be started", () => {
  // A regex LITERAL, not a built string: the seven keys are spelled out so
  // nothing is lost to escaping between here and the pattern.
  const TABLE_LINE =
    /^\s*(?:meal|school_pickup|child_care|errand|dog_walking|shopping|visit)\s*:.*"[^"]*[A-Za-z][^"]*"/;

  it("the pattern really does catch what it is for", () => {
    // Positive control, on the exact lines the eight deleted tables held.
    expect(TABLE_LINE.test('  school_pickup: "School Run",')).toBe(true);
    expect(TABLE_LINE.test('  school_pickup: { icon: "🚗", label: "School run" },')).toBe(
      true,
    );
    expect(TABLE_LINE.test('  meal: "Dropping off a meal",')).toBe(true);
    // …and does NOT catch what the job deliberately left in place.
    expect(TABLE_LINE.test('  school_pickup: "🚗",')).toBe(false);
    expect(TABLE_LINE.test('  slotType: "school_pickup",')).toBe(false);
  });

  it("no shipped file outside @workspace/task-copy holds one", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      if (file.includes(path.join("lib", "task-copy"))) continue;
      for (const line of codeLines(file)) {
        if (TABLE_LINE.test(line)) {
          offenders.push(`${path.relative(REPO, file)}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * ⚠️ THE ONE THAT COSTS MONEY.
 *
 * "·" is not in the GSM-7 alphabet. One of them in a text drops the per-segment
 * capacity from 153 characters to 67 and roughly doubles what Kate pays for
 * that message. The card form exists for screens; every SMS body takes the
 * sentence form.
 */
describe("no SMS body can carry the card join", () => {
  const SMS_BUILDERS = [
    "artifacts/api-server/src/lib/sms.ts",
    "artifacts/api-server/src/lib/inviteCopy.ts",
    "artifacts/api-server/src/lib/item17Copy.ts",
    "artifacts/api-server/src/lib/claimNotify.ts",
    "artifacts/api-server/src/lib/claimNotifyDispatch.ts",
    "artifacts/api-server/src/lib/item17Notify.ts",
    "artifacts/api-server/src/lib/accessGrants.ts",
    "artifacts/api-server/src/lib/pageClosureCopy.ts",
    "artifacts/api-server/src/lib/pageClosureDb.ts",
    "artifacts/api-server/src/lib/queuedInviteSender.ts",
  ];

  it("the builders really were read", () => {
    for (const rel of SMS_BUILDERS) {
      expect(fs.existsSync(path.join(REPO, rel)), rel).toBe(true);
    }
  });

  it("not one of them contains a '·', in code or in a template", () => {
    const offenders: string[] = [];
    for (const rel of SMS_BUILDERS) {
      for (const line of codeLines(path.join(REPO, rel))) {
        if (line.includes(CARD_JOIN.trim())) offenders.push(`${rel}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("and the sentence form they use never produces one", () => {
    const now = new Date("2026-09-21T00:00:00Z");
    for (const time of ["15:00", null]) {
      for (const date of ["2026-09-22", null]) {
        expect(taskWhenSentence(date, time, "fixed", now)).not.toContain(CARD_JOIN.trim());
        expect(taskWhenClause(date, time, "fixed", now)).not.toContain(CARD_JOIN.trim());
        expect(taskWhenSentence(date, time, "flexible", now)).not.toContain(CARD_JOIN.trim());
        expect(taskWhenClause(date, time, "flexible", now)).not.toContain(CARD_JOIN.trim());
      }
    }
  });
});

// ─── THE FLEXIBILITY RULE, NOW IN ONE PLACE ──────────────────────────────────

describe("the flexible/fixed default", () => {
  it("is the same rule both doors and the server read", () => {
    expect(defaultFlexibility("meal", true)).toBe("flexible");
    expect(defaultFlexibility("shopping", true)).toBe("flexible");
    expect(defaultFlexibility("dog_walking", true)).toBe("flexible");
    expect(defaultFlexibility("school_pickup", true)).toBe("fixed");
    expect(defaultFlexibility("child_care", true)).toBe("fixed");
    expect(defaultFlexibility("visit", true)).toBe("fixed");
    expect(defaultFlexibility("other", true)).toBe("fixed");
  });

  it("a DATED errand is a lift (fixed); an undated one is laundry (flexible)", () => {
    expect(defaultFlexibility("errand", true)).toBe("fixed");
    expect(defaultFlexibility("errand", false)).toBe("flexible");
  });

  it("an unknown type takes the conservative fixed", () => {
    expect(defaultFlexibility("hovercraft", true)).toBe("fixed");
  });

  it("the forms' helper is the dated answer, for every type", () => {
    for (const type of SLOT_TYPES) {
      expect(defaultFlexibilityForType(type)).toBe(defaultFlexibility(type, true));
    }
  });
});
