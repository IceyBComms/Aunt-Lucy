/**
 * Bugs #117 and #120 — what the family is told when a helper leaves a note.
 *
 * On 16 Sep 2026 Kate, as a helper, left "Ill be 25min late" on a school pickup
 * and the family was told "Nothing needed from you — just keeping you in the
 * loop." The rulings under test:
 *   • a FIXED task TODAY or TOMORROW (Australia/Sydney) gets the approved
 *     time-sensitive wording, by SMS when there is a mobile;
 *   • no note, ever, says "Nothing needed from you";
 *   • a flexible time change carries the helper's note, and drops "nothing
 *     needed from you";
 *   • a flexible cancellation drops "Nothing else needed from you." on the day.
 *
 * The send goes through the REAL notifyRecipientOfTaskEvent and the REAL
 * buildNotifyTargets; only the database lookup and the Twilio/Resend calls are
 * swapped, and each swap journals what it was asked to send (P2: every absence
 * below sits beside a record of what DID go).
 *
 * WHAT THIS DOES NOT CATCH: the /slots/note route's database read and write run
 * against nothing here. Its wiring to helperNoteNotice is read from source at
 * the bottom of this file.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { SupportPage } from "@workspace/db";
import { soonDay } from "./australianDay";
import {
  helperNoteNotice,
  recipientFlexibleCancelled,
  recipientFlexibleRescheduled,
} from "./item17Copy";
import { buildNotifyTargets } from "./notifyTargets";
import { measureSms } from "./smsSegments";

type Notify = typeof import("./item17Notify").notifyRecipientOfTaskEvent;
let notifyRecipientOfTaskEvent: Notify;

beforeAll(async () => {
  // item17Notify pulls in the db module; point it nowhere BEFORE the import so
  // the real .env can never be the one in use. Nothing here opens a connection.
  process.env.DATABASE_URL = "postgres://nobody:nothing@127.0.0.1:1/none";
  ({ notifyRecipientOfTaskEvent } = await import("./item17Notify"));
  // ⚠️ EXPLICIT TIMEOUT, raised from vitest's 10s default on 20 Sep 2026.
  // This hook cold-imports item17Notify's whole graph (db, Resend, Twilio) on a
  // worker competing with every other file in the suite, and it crept past 10s
  // once the suite grew. When it does, the WHOLE FILE fails with 29 skipped —
  // which reads exactly like a broken test rather than a slow one, and that
  // confusion is bug #124's whole lesson. The work here is an import: it opens
  // no connection and waits on nothing real, so a longer ceiling cannot hide a
  // hang that matters.
}, 30_000);

// 16 Sep 2026, 9:00am in Melbourne/Sydney (AEST, UTC+10).
const WED_9AM = new Date("2026-09-15T23:00:00Z");
// 16 Sep 2026, 11:30pm local.
const WED_1130PM = new Date("2026-09-16T13:30:00Z");

const NOTE = "Ill be 25min late";

const pickup = (slotDate: string | null, flexibility: "fixed" | "flexible" = "fixed") => ({
  slotType: "school_pickup",
  customLabel: null,
  slotDate,
  flexibility,
  claimedByName: "kate R",
});

/** A crisis page whose family has a mobile on file, and a setup-person grant. */
const CRISIS_PAGE = {
  id: "page-crisis",
  slug: "s1ug",
  status: "active",
  origin: "crisis_free",
  recipientName: "Kate Example",
  recipientMobile: "+61400000001",
  recipientEmail: null,
} as unknown as SupportPage;

async function send(notice: ReturnType<typeof helperNoteNotice>) {
  const texts: { to: string; body: string }[] = [];
  const emails: { to: string; subject: string; body: string }[] = [];
  await notifyRecipientOfTaskEvent(CRISIS_PAGE, notice, {
    resolveTargets: async (page) =>
      buildNotifyTargets(page, [
        { token: "g1", role: "manager", personName: "Kate", contact: "kate@example.com" },
      ]),
    isSuppressed: async () => false,
    sendSms: async ({ to, body }) => {
      texts.push({ to, body });
      return true;
    },
    sendEmail: async ({ to, subject, body }) => {
      emails.push({ to, subject, body });
      return true;
    },
  });
  return { texts, emails };
}

/** The EMAIL body — keeps the 💛. */
const APPROVED_TOMORROW =
  `Aunt Lucy here 💛 kate R left a note about the school run tomorrow: "${NOTE}". ` +
  `They're still doing it. If the timing matters, you may want a backup plan.`;

/** The SMS — Kate's ruling, 16 Sep 2026: no 💛, every fixed character GSM-7. */
const APPROVED_TOMORROW_SMS =
  `Aunt Lucy here: kate R left a note about the school run tomorrow: "${NOTE}". ` +
  `They're still doing it. If the timing matters, you may want a backup plan.`;

describe("soonDay — Australia/Sydney, by the calendar", () => {
  it("today, tomorrow, neither — positive controls for each answer", () => {
    expect(soonDay("2026-09-16", WED_9AM)).toBe("today");
    expect(soonDay("2026-09-17", WED_9AM)).toBe("tomorrow");
    expect(soonDay("2026-09-18", WED_9AM)).toBeNull();
    expect(soonDay("2026-09-15", WED_9AM)).toBeNull();
    expect(soonDay(null, WED_9AM)).toBeNull();
  });

  it("11:30pm local: tomorrow is still tomorrow, though UTC is on the same date", () => {
    expect(WED_1130PM.toISOString().slice(0, 10)).toBe("2026-09-16");
    expect(soonDay("2026-09-17", WED_1130PM)).toBe("tomorrow");
    expect(soonDay("2026-09-16", WED_1130PM)).toBe("today");
  });

  it("just after local midnight, yesterday's tomorrow is today", () => {
    const THU_0010 = new Date("2026-09-16T14:10:00Z"); // 17 Sep, 12:10am AEST
    expect(soonDay("2026-09-17", THU_0010)).toBe("today");
    expect(soonDay("2026-09-18", THU_0010)).toBe("tomorrow");
  });

  it("the 25-hour day daylight saving ends: 12:30am still finds tomorrow", () => {
    const APR5_0030 = new Date("2026-04-04T13:30:00Z"); // 5 Apr 2026, 12:30am AEDT
    expect(soonDay("2026-04-05", APR5_0030)).toBe("today");
    expect(soonDay("2026-04-06", APR5_0030)).toBe("tomorrow");
  });
});

describe("a note on a fixed task tomorrow, on a crisis page with a mobile", () => {
  it("texts the family the exact approved wording — the positive control", async () => {
    const { texts } = await send(
      helperNoteNotice({ slot: pickup("2026-09-17"), note: NOTE, now: WED_9AM }),
    );
    expect(texts).toEqual([{ to: "+61400000001", body: APPROVED_TOMORROW_SMS }]);
  });

  it("says nothing is needed nowhere — not in the SMS, not in any email", async () => {
    const { texts, emails } = await send(
      helperNoteNotice({ slot: pickup("2026-09-17"), note: NOTE, now: WED_9AM }),
    );
    expect(texts.length + emails.length).toBeGreaterThan(0);
    expect(JSON.stringify({ texts, emails })).not.toMatch(/nothing (else )?needed/i);
  });

  it("an email copy carries the approved subject and the same body", async () => {
    const { emails } = await send(
      helperNoteNotice({ slot: pickup("2026-09-17"), note: NOTE, now: WED_9AM }),
    );
    expect(emails).toEqual([
      { to: "kate@example.com", subject: "A note about tomorrow's school run", body: APPROVED_TOMORROW },
    ]);
  });

  it("sent at 11:30pm the night before, it still says tomorrow", async () => {
    const { texts } = await send(
      helperNoteNotice({ slot: pickup("2026-09-17"), note: NOTE, now: WED_1130PM }),
    );
    expect(texts[0].body).toBe(APPROVED_TOMORROW_SMS);
  });

  it("on the day, it says today", () => {
    const { message } = helperNoteNotice({ slot: pickup("2026-09-16"), note: NOTE, now: WED_9AM });
    expect(message.subject).toBe("A note about today's school run");
    expect(message.body).toContain("left a note about the school run today:");
  });
});

describe("every other note", () => {
  it("next week: the ordinary line, without 'Nothing needed from you'", async () => {
    const { texts } = await send(
      helperNoteNotice({ slot: pickup("2026-09-23"), note: NOTE, now: WED_9AM }),
    );
    // Still a fixed task, so still a text — the WORDS are what change.
    expect(texts).toEqual([
      {
        to: "+61400000001",
        body: `kate R left a note on the school run: "${NOTE}"\n\nJust keeping you in the loop.`,
      },
    ]);
    expect(texts[0].body).not.toMatch(/nothing needed/i);
  });

  it("a flexible task tomorrow is not given the time-sensitive wording", () => {
    const { message } = helperNoteNotice({
      slot: pickup("2026-09-17", "flexible"),
      note: NOTE,
      now: WED_9AM,
    });
    expect(message.subject).toBe("A small note on your page");
    expect(message.body).not.toMatch(/nothing needed/i);
  });
});

describe("flexible task messages (Kate's ruling applied)", () => {
  it("a new time carries the helper's note, and no 'nothing needed'", () => {
    const { body } = recipientFlexibleRescheduled({
      helperName: "Jo",
      task: "a meal",
      newTime: "6:30pm",
      note: "Running late at work",
    });
    expect(body).toBe(`Jo will bring a meal closer to 6:30pm now.\n\nTheir note: "Running late at work"`);
  });

  it("a new time with no note adds no note line", () => {
    const { body } = recipientFlexibleRescheduled({ helperName: "Jo", task: "a meal", newTime: "6:30pm" });
    expect(body).toBe("Jo will bring a meal closer to 6:30pm now.");
  });

  it("a cancellation today drops 'Nothing else needed'; another day keeps it", () => {
    const args = { helperName: "Jo", task: "a meal", shareLink: "https://x/s/y" };
    expect(recipientFlexibleCancelled({ ...args, isToday: true }).body).not.toMatch(/nothing else needed/i);
    expect(recipientFlexibleCancelled({ ...args, isToday: false }).body).toMatch(/Nothing else needed from you\.$/);
  });
});

describe("the time-sensitive note SMS stays GSM-7 (Kate's ruling, 16 Sep 2026; see #059)", () => {
  const smsFor = async (note: string) => {
    const { texts } = await send(
      helperNoteNotice({ slot: pickup("2026-09-17"), note, now: WED_9AM }),
    );
    return texts[0].body;
  };

  it("a 40-character plain note fits in 2 segments", async () => {
    expect(measureSms(await smsFor("x".repeat(40)))).toMatchObject({ encoding: "GSM-7", segments: 2 });
  });

  it("a 160-character plain note — recorded: 304 characters, 2 segments", async () => {
    // Two characters under two segments (2 × 153 = 306). Was 5 with the 💛, then
    // 307/3 until "school pickup" became "school run" on 21 Sep 2026 (#127) and
    // took three characters out of every fixed task's SMS.
    expect(measureSms(await smsFor("x".repeat(160)))).toMatchObject({
      encoding: "GSM-7",
      chars: 304,
      segments: 2,
    });
  });

  it("a note typed with I’ll is texted as I'll, and the text stays GSM-7", async () => {
    const body = await smsFor("I’ll be 25 min late");
    expect(body).toContain(`"I'll be 25 min late"`);
    expect(body).not.toContain("’");
    expect(measureSms(body).encoding).toBe("GSM-7");
  });

  it("curly double quotes, en and em dashes, and … are folded too", async () => {
    const body = await smsFor("“Traffic” – stuck — sorry…");
    expect(body).toContain(`""Traffic" - stuck - sorry..."`);
    expect(measureSms(body).encoding).toBe("GSM-7");
  });

  it("an emoji the helper typed is left as typed (and makes it unicode)", async () => {
    const body = await smsFor("late 😬");
    expect(body).toContain("late 😬");
    expect(measureSms(body).encoding).toBe("UCS-2");
  });

  it("the email keeps its 💛 and the note exactly as typed", async () => {
    const note = "I’ll be late";
    const { emails } = await send(
      helperNoteNotice({ slot: pickup("2026-09-17"), note, now: WED_9AM }),
    );
    expect(emails[0].body).toContain("Aunt Lucy here 💛");
    expect(emails[0].body).toContain(`"I’ll be late"`);
  });

  it("other Aunt Lucy SMS are untouched — 'can't do it after all' keeps its 💛", async () => {
    const { recipientFixedLostHelper } = await import("./item17Copy");
    const msg = recipientFixedLostHelper({
      helperName: "Jo",
      task: "the school run",
      when: "Thursday 17 September at 3:15pm",
      shareLink: "https://x/s/y",
    });
    expect(msg.body.startsWith("Aunt Lucy here 💛 Jo can't do")).toBe(true);
    expect(msg.smsBody).toBeUndefined();
  });

  it("a helper called O’Brien: straightened in the SMS, which stays in 2 segments", async () => {
    const { texts, emails } = await send(
      helperNoteNotice({
        slot: { ...pickup("2026-09-17"), claimedByName: "Sam O’Brien" },
        note: "Running 10 min late",
        now: WED_9AM,
      }),
    );
    expect(texts[0].body.startsWith("Aunt Lucy here: Sam O'Brien left a note about")).toBe(true);
    expect(measureSms(texts[0].body)).toMatchObject({ encoding: "GSM-7", segments: 2 });
    // The email is left as typed.
    expect(emails[0].body).toContain("Sam O’Brien");
  });

  it("a task name the family typed with curly punctuation is straightened too", () => {
    const { message } = helperNoteNotice({
      slot: { ...pickup("2026-09-17"), customLabel: "Mia’s swim – Tuesday…" },
      note: "late",
      now: WED_9AM,
    });
    expect(message.smsBody).toContain("left a note about Mia's swim - Tuesday... tomorrow:");
    expect(measureSms(message.smsBody!).encoding).toBe("GSM-7");
  });
});

describe("the email subject for a task with no set type (Kate, 16 Sep 2026)", () => {
  const untyped = (slotDate: string) => ({
    ...pickup(slotDate),
    slotType: "other",
  });

  it("tomorrow: 'A note about tomorrow's task'", () => {
    const { message } = helperNoteNotice({ slot: untyped("2026-09-17"), note: "late", now: WED_9AM });
    expect(message.subject).toBe("A note about tomorrow's task");
  });

  it("today: 'A note about today's task'", () => {
    const { message } = helperNoteNotice({ slot: untyped("2026-09-16"), note: "late", now: WED_9AM });
    expect(message.subject).toBe("A note about today's task");
    expect(message.subject).not.toContain("help");
  });
});

describe("the routes use these (read from source)", () => {
  const slots = fs.readFileSync(path.resolve(__dirname, "../routes/slots.ts"), "utf8");
  const noteRoute = slots.slice(slots.indexOf('router.post("/slots/note/:token"'));

  it("the note route decides its message through helperNoteNotice", () => {
    expect(noteRoute).toContain("helperNoteNotice({");
    expect(slots).not.toContain("recipientNotePassedOn(");
  });

  it("the note route only writes the note — the helper stays on the task", () => {
    expect(noteRoute).toContain(".set({ claimedNote: noteTrimmed })");
    expect(noteRoute.slice(0, noteRoute.indexOf("res.json"))).not.toMatch(/isClaimed:\s*false/);
  });

  it("the reschedule route passes the helper's note on", () => {
    expect(slots).toContain("note: noteTrimmed || null,");
  });

  it("the release route drops 'Nothing else needed' on the day", () => {
    expect(slots).toContain('isToday: soonDay(row.slotDate) === "today"');
  });
});
