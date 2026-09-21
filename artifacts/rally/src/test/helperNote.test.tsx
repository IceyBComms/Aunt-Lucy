/**
 * Bug #119 — "Pass it on" read as "your task has been handed to someone else".
 *
 * On a fixed task the helper's note button sat directly above "This one's time
 * sensitive so the sooner you cancel the better", and the confirmation said only
 * "Done — they'll know." These render the REAL release page against a fake
 * server that journals every call and holds the slot's state, so "you're still
 * down for it" is checked against what the server holds, not just the words.
 *
 * Also bug #117's page half: the "Support is on the way" subtitle.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import ReleaseSlot from "@/pages/ReleaseSlot";
import { family, helper as copy } from "@/lib/item17Copy";

const server = vi.hoisted(() => ({
  calls: [] as { path: string; method: string; body: unknown }[],
  slot: { isClaimed: true, claimedNote: null as string | null, slotType: "school_pickup" },
}));

vi.mock("@/lib/api", () => ({
  apiFetch: async (p: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    server.calls.push({ path: p, method, body });
    if (method === "GET" && p.startsWith("/slots/release/")) {
      return {
        slot: {
          id: "slot-1",
          slotType: server.slot.slotType,
          customLabel: null,
          slotDate: "2026-09-17",
          slotTime: "15:15",
          liftWaitMode: null,
          notes: null,
          flexibility: "fixed",
          claimedNote: server.slot.claimedNote,
        },
        helperName: "kate R",
        page: { recipientName: "Kate Example", location: null, slug: "s1ug" },
      };
    }
    if (method === "POST" && p.startsWith("/slots/note/")) {
      server.slot.claimedNote = (body as { note: string }).note;
      return { ok: true };
    }
    if (method === "POST" && p.startsWith("/slots/release/")) {
      server.slot.isClaimed = false;
      return { ok: true };
    }
    throw new Error(`unexpected ${method} ${p}`);
  },
}));

function renderRelease() {
  const { hook } = memoryLocation({ path: "/release/tok" });
  render(
    <Router hook={hook}>
      <Route path="/release/:token" component={ReleaseSlot} />
    </Router>,
  );
}

beforeEach(() => {
  server.calls = [];
  server.slot = { isClaimed: true, claimedNote: null, slotType: "school_pickup" };
});
afterEach(cleanup);

describe("leaving a note on a fixed task", () => {
  it("the button names who it goes to", async () => {
    renderRelease();
    expect(await screen.findByRole("button", { name: "Send my note to Kate" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pass it on" })).toBeNull();
  });

  // The inline name comes from ReleaseSlot's own SLOT_TYPE_LABELS, lower-cased.
  // It reads "school run" from 21 Sep 2026 (#127, Kate's ruling) — the rename
  // is display text only; the slot_type enum key is unchanged.
  it("after sending: 'You're still down for school run' AND the task is still claimed", async () => {
    renderRelease();
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "Ill be 25min late" } });
    fireEvent.click(screen.getByRole("button", { name: "Send my note to Kate" }));

    expect(
      await screen.findByText("Sent — Kate has your note. You're still down for school run."),
    ).toBeTruthy();
    // Positive control: the note really went to the server…
    expect(server.calls.filter((c) => c.method === "POST")).toEqual([
      { path: "/slots/note/tok", method: "POST", body: { note: "Ill be 25min late" } },
    ]);
    expect(server.slot.claimedNote).toBe("Ill be 25min late");
    // …and the helper is still on the task.
    expect(server.slot.isClaimed).toBe(true);
    // Never the raw key.
    expect(document.body.textContent).not.toContain("school_pickup");
  });
});

describe("a task with no set type (Kate's ruling, 16 Sep 2026)", () => {
  it("reads 'You're still down for this task.', not 'for help.'", async () => {
    server.slot.slotType = "other";
    renderRelease();
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "Running late" } });
    fireEvent.click(screen.getByRole("button", { name: "Send my note to Kate" }));

    expect(
      await screen.findByText("Sent — Kate has your note. You're still down for this task."),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain("still down for help");
    expect(server.slot.isClaimed).toBe(true);
  });
});

describe("the cancel section sits below a divider, under its own heading", () => {
  it("note button → divider → heading → time-sensitive line → cancel button, in that order", async () => {
    renderRelease();
    const noteButton = await screen.findByRole("button", { name: "Send my note to Kate" });
    const divider = screen.getByTestId("cancel-divider");
    const heading = screen.getByRole("heading", { name: copy.fixedNote.cancelHeading });
    const blurb = screen.getByText(/This one's time sensitive/);
    const cancel = screen.getByRole("button", { name: copy.cancelButtonFixed });

    const follows = (a: Element, b: Element) =>
      !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(noteButton, divider)).toBe(true);
    expect(follows(divider, heading)).toBe(true);
    expect(follows(heading, blurb)).toBe(true);
    expect(follows(blurb, cancel)).toBe(true);
  });
});

describe("the family page subtitle (Manage.tsx)", () => {
  it("with a note showing: no 'Nothing for you to do'", () => {
    expect(family.supportSubtitle(true)).toBe("The people who've said yes.");
  });

  it("with no notes: the full line — positive control", () => {
    expect(family.supportSubtitle(false)).toBe(
      "The people who've said yes. Nothing for you to do — just lovely to see.",
    );
  });

  it("Manage.tsx decides it from the notes actually on the page", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../pages/Manage.tsx"), "utf8");
    expect(source).toContain("copy.supportSubtitle(claimedTasks.some((t) => !!t.claimedNote))");
    expect(source).not.toContain("Nothing for you to do — just lovely to see.");
  });
});
