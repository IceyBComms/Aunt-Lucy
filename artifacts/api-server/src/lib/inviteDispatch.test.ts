import { describe, it, expect } from "vitest";
import { runInviteBatch, placeInvite, type InviteDelivery } from "./inviteDispatch";

/**
 * Bug #048 — one bad invite must lose ONE invite, visibly, never the remainder
 * of the batch.
 *
 * These tests exist because the old loop had no try/catch in it and claimed the
 * whole batch as `sent` before sending, so a single throw at invite 3 of 5 left
 * invites 4 and 5 marked delivered having never been sent. Every test below
 * therefore asserts three things, not one:
 *   1. the invites BEHIND the failure still went;
 *   2. the failing invite is visibly failed, with failedAt set;
 *   3. nothing is falsely marked sent.
 * The third is the one that actually encodes the bug.
 */

type Row = { id: string };

/** A tiny stand-in for the helper_invites table: id → the status written. */
class FakeOutbox {
  readonly status = new Map<string, string>();
  readonly failedAt = new Map<string, Date>();
  readonly sentAt = new Map<string, Date>();
  readonly delivered: string[] = [];
  readonly errors: { id: string; stage: string }[] = [];

  /** Rows the dispatcher claimed but never wrote an outcome for — i.e. rows
   *  still sitting in `sending` when the run ended. */
  stuckIn(claimed: readonly Row[]): string[] {
    return claimed.filter((r) => !this.status.has(r.id)).map((r) => r.id);
  }
}

function batchOf(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({ id: `invite-${i + 1}` }));
}

/**
 * Handlers wired to a FakeOutbox. `deliver` sends everything successfully
 * unless `failAt` names an invite, in which case `deliverFails` decides the
 * shape of the failure. `recordFails` instead breaks the write that records the
 * outcome, leaving the row claimed.
 */
function handlersFor(
  outbox: FakeOutbox,
  opts: {
    failAt?: string;
    deliverFails?: (id: string) => Promise<InviteDelivery>;
    recordFails?: string;
  } = {},
) {
  return {
    async deliver(invite: Row): Promise<InviteDelivery> {
      if (opts.failAt === invite.id && opts.deliverFails) {
        return opts.deliverFails(invite.id);
      }
      outbox.delivered.push(invite.id);
      return "sent" as const;
    },
    async markSent(invite: Row) {
      if (opts.recordFails === invite.id) {
        throw new Error(`db down while recording ${invite.id}`);
      }
      outbox.status.set(invite.id, "sent");
      outbox.sentAt.set(invite.id, new Date());
    },
    async markFailed(invite: Row) {
      if (opts.recordFails === invite.id) {
        throw new Error(`db down while recording ${invite.id}`);
      }
      outbox.status.set(invite.id, "failed");
      outbox.failedAt.set(invite.id, new Date());
    },
    async markCancelled(invite: Row) {
      outbox.status.set(invite.id, "cancelled");
    },
    async markHeld(invite: Row) {
      outbox.status.set(invite.id, "queued");
    },
    onError(_err: unknown, invite: Row, stage: string) {
      outbox.errors.push({ id: invite.id, stage });
    },
  };
}

/** The three assertions every break-test owes, in one place. */
function expectOnlyInviteThreeLost(outbox: FakeOutbox, claimed: readonly Row[]) {
  // 1. The batch ran past the failure — 4 and 5 went.
  expect(outbox.delivered).toEqual([
    "invite-1",
    "invite-2",
    "invite-4",
    "invite-5",
  ]);
  expect(outbox.status.get("invite-4")).toBe("sent");
  expect(outbox.status.get("invite-5")).toBe("sent");

  // 2. Invite 3 is visibly failed, with a failedAt and no sentAt.
  expect(outbox.status.get("invite-3")).toBe("failed");
  expect(outbox.failedAt.get("invite-3")).toBeInstanceOf(Date);
  expect(outbox.sentAt.has("invite-3")).toBe(false);

  // 3. Nothing is falsely sent, and no claimed row was left unaccounted for.
  //    This is the assertion the old code could not pass.
  expect(outbox.status.get("invite-3")).not.toBe("sent");
  expect([...outbox.status.values()].filter((s) => s === "sent")).toHaveLength(4);
  expect(outbox.stuckIn(claimed)).toEqual([]);
}

describe("runInviteBatch — a failure at invite 3 of 5", () => {
  it("survives a thrown error and still sends 4 and 5", async () => {
    const outbox = new FakeOutbox();
    const claimed = batchOf(5);

    const tally = await runInviteBatch(
      claimed,
      handlersFor(outbox, {
        failAt: "invite-3",
        // A throw from inside the send — the #046 renderer shape.
        deliverFails: async () => {
          throw new Error("renderer refused this invite");
        },
      }),
    );

    expectOnlyInviteThreeLost(outbox, claimed);
    expect(tally).toEqual({ sent: 4, failed: 1, cancelled: 0, held: 0, stuck: 0 });
    expect(outbox.errors).toEqual([{ id: "invite-3", stage: "deliver" }]);
  });

  it("survives a rejected promise and still sends 4 and 5", async () => {
    const outbox = new FakeOutbox();
    const claimed = batchOf(5);

    const tally = await runInviteBatch(
      claimed,
      handlersFor(outbox, {
        failAt: "invite-3",
        // A rejection that was never a `throw` — the shape a timed-out fetch to
        // Resend or Twilio actually arrives in.
        deliverFails: () =>
          Promise.reject(new Error("ETIMEDOUT posting to the send API")),
      }),
    );

    expectOnlyInviteThreeLost(outbox, claimed);
    expect(tally).toEqual({ sent: 4, failed: 1, cancelled: 0, held: 0, stuck: 0 });
    expect(outbox.errors).toEqual([{ id: "invite-3", stage: "deliver" }]);
  });

  it("survives a DB error raised while sending and still sends 4 and 5", async () => {
    const outbox = new FakeOutbox();
    const claimed = batchOf(5);

    // A real Postgres error shape, not a bare Error — deliver() does two
    // database reads (the page and the contact) before it renders anything, and
    // that is exactly where a dropped Neon connection dies.
    const pgError = Object.assign(
      new Error("terminating connection due to administrator command"),
      { code: "57P01", severity: "FATAL" },
    );

    const tally = await runInviteBatch(
      claimed,
      handlersFor(outbox, {
        failAt: "invite-3",
        deliverFails: async () => {
          throw pgError;
        },
      }),
    );

    expectOnlyInviteThreeLost(outbox, claimed);
    expect(tally).toEqual({ sent: 4, failed: 1, cancelled: 0, held: 0, stuck: 0 });
  });
});

describe("runInviteBatch — when the outcome itself cannot be written", () => {
  it("leaves the row in sending rather than guessing, and still sends 4 and 5", async () => {
    const outbox = new FakeOutbox();
    const claimed = batchOf(5);

    // The message went out; the UPDATE that records it is what failed. We
    // cannot honestly call this sent OR failed, so it keeps its claim.
    const tally = await runInviteBatch(
      claimed,
      handlersFor(outbox, { recordFails: "invite-3" }),
    );

    expect(outbox.delivered).toContain("invite-4");
    expect(outbox.delivered).toContain("invite-5");
    expect(outbox.status.get("invite-4")).toBe("sent");
    expect(outbox.status.get("invite-5")).toBe("sent");

    // Stuck in `sending`: no status written at all, and counted as such.
    expect(outbox.stuckIn(claimed)).toEqual(["invite-3"]);
    expect(tally).toEqual({ sent: 4, failed: 0, cancelled: 0, held: 0, stuck: 1 });
    expect(outbox.errors).toEqual([{ id: "invite-3", stage: "record" }]);
  });
});

describe("runInviteBatch — the ordinary outcomes still work", () => {
  it("records sent, cancelled and not_sent independently", async () => {
    const outbox = new FakeOutbox();
    const claimed = batchOf(3);

    const tally = await runInviteBatch(claimed, {
      async deliver(invite: Row): Promise<InviteDelivery> {
        if (invite.id === "invite-2") return "cancelled";
        if (invite.id === "invite-3") return "not_sent";
        return "sent";
      },
      async markSent(i: Row) {
        outbox.status.set(i.id, "sent");
      },
      async markFailed(i: Row) {
        outbox.status.set(i.id, "failed");
        outbox.failedAt.set(i.id, new Date());
      },
      async markCancelled(i: Row) {
        outbox.status.set(i.id, "cancelled");
      },
      async markHeld(i: Row) {
        outbox.status.set(i.id, "queued");
      },
      onError() {},
    });

    expect(outbox.status.get("invite-1")).toBe("sent");
    expect(outbox.status.get("invite-2")).toBe("cancelled");
    expect(outbox.status.get("invite-3")).toBe("failed");
    expect(tally).toEqual({ sent: 1, failed: 1, cancelled: 1, held: 0, stuck: 0 });
  });
});

describe("runInviteBatch — a held invite (the page isn't live)", () => {
  it("hands the claim back to queued, sends nothing, and counts it held", async () => {
    const outbox = new FakeOutbox();
    const claimed = batchOf(3);

    const tally = await runInviteBatch(claimed, {
      ...handlersFor(outbox),
      async deliver(invite: Row): Promise<InviteDelivery> {
        if (invite.id === "invite-2") return "held";
        outbox.delivered.push(invite.id);
        return "sent";
      },
    });

    expect(outbox.delivered).toEqual(["invite-1", "invite-3"]);
    expect(outbox.status.get("invite-2")).toBe("queued");
    expect(outbox.sentAt.has("invite-2")).toBe(false);
    expect(outbox.failedAt.has("invite-2")).toBe(false);
    expect(outbox.stuckIn(claimed)).toEqual([]);
    expect(tally).toEqual({ sent: 2, failed: 0, cancelled: 0, held: 1, stuck: 0 });
  });
});

/**
 * Nothing leaves a draft (Kate's ruling, 14 Sep 2026) — the inline send paths.
 *
 * P2 amendment. "No SMS was sent" is an ABSENCE, and it is satisfied for free
 * by a path that never ran. So every hold test here proves two things at once:
 *   (a) the path RAN — the invite row exists, and it is queued;
 *   (b) it CHOSE to hold — the sender was never called.
 * And the live-page test beside it proves the guard discriminates: a guard that
 * blocks everything passes (a) and (b) perfectly and breaks the product.
 */
describe("placeInvite — step 2 and Send now", () => {
  type InviteRow = { id: string; status: string; sentAt?: Date; failedAt?: Date };

  function fakeInviteTable(opts: { sendOk?: boolean } = {}) {
    const rows = new Map<string, InviteRow>();
    const sendCalls: string[] = [];
    let n = 0;
    return {
      rows,
      sendCalls,
      handlers: {
        async insertQueued() {
          const row = { id: `invite-${++n}`, status: "queued" };
          rows.set(row.id, row);
          return row;
        },
        async send(row: InviteRow) {
          sendCalls.push(row.id);
          return opts.sendOk ?? true;
        },
        async markSent(row: InviteRow) {
          rows.set(row.id, { ...row, status: "sent", sentAt: new Date() });
        },
        async markFailed(row: InviteRow) {
          rows.set(row.id, { ...row, status: "failed", failedAt: new Date() });
        },
      },
    };
  }

  const now = new Date("2026-09-14T09:00:00Z");
  const invite = { scheduledFor: now, contactOptedOut: false };

  it("DRAFT page: the invite row EXISTS and is queued, AND the sender was NOT called", async () => {
    const table = fakeInviteTable();

    const placed = await placeInvite({ status: "draft" }, invite, table.handlers, now);

    // (a) The path ran: a real row, written, and still queued for the dispatcher.
    expect(table.rows.size).toBe(1);
    expect(table.rows.get(placed.row.id)).toEqual({ id: "invite-1", status: "queued" });
    expect(placed.status).toBe("queued");
    // (b) It chose to hold: nothing went on the wire.
    expect(table.sendCalls).toEqual([]);
  });

  it("LIVE page: the same call DOES send, and the row is stamped sent", async () => {
    const table = fakeInviteTable();

    const placed = await placeInvite({ status: "active" }, invite, table.handlers, now);

    expect(table.sendCalls).toEqual(["invite-1"]);
    expect(placed.status).toBe("sent");
    expect(table.rows.get("invite-1")).toMatchObject({ status: "sent" });
    expect(table.rows.get("invite-1")?.sentAt).toBeInstanceOf(Date);
  });

  it("LIVE page, sender refuses: stamped failed, exactly as before", async () => {
    const table = fakeInviteTable({ sendOk: false });

    const placed = await placeInvite({ status: "active" }, invite, table.handlers, now);

    expect(table.sendCalls).toEqual(["invite-1"]);
    expect(placed.status).toBe("failed");
    expect(table.rows.get("invite-1")).toMatchObject({ status: "failed" });
  });

  it("pending_approval page: row queued, sender not called", async () => {
    const table = fakeInviteTable();

    const placed = await placeInvite({ status: "pending_approval" }, invite, table.handlers, now);

    expect(table.rows.get(placed.row.id)?.status).toBe("queued");
    expect(table.sendCalls).toEqual([]);
  });
});
