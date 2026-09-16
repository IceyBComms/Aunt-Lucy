/**
 * The trusted-invite door: GET /invite/:token (look) and POST /invite/:token/claim
 * (say yes).
 *
 * Two faults fixed here on 16 September 2026, found when Kate invited herself to
 * a school pickup on a live page and got "Something went wrong.":
 *
 *   1. THE CRASH. The "Yes, I'll help with this" button sends the claim with NO
 *      body, and the handler's first line read `showName` straight off
 *      `req.body`. Express 5 leaves `req.body` undefined when nothing is sent, so
 *      every invited helper, by SMS or email, hit a 500 from 22 July (fccabd7)
 *      on. The fix is app-wide, in ONE place, not here: ensureRequestBody in
 *      lib/requestHygiene.ts makes an empty request `{}` for every handler.
 *
 *   2. THE HOLE THE CRASH WAS HIDING. Neither route checked the page's status.
 *      An invite sent from a DRAFT page (one went out on 14 Sep, before invites
 *      were held) could claim a task on a page nobody had published — and a claim
 *      messages people. With the crash gone that would have opened the same day.
 *      The claim now refuses unless the page is live, writes nothing and sends
 *      nothing; the look shows a calm "Not live yet" state instead of a button.
 *
 * "Live" is LIVE_PAGE_STATUS from inviteSendRule.ts — one allow-listed status,
 * the same one that decides whether an invite may be SENT, so "may this go out"
 * and "may this be claimed" cannot drift apart.
 *
 * Doing lives in the router below, against a small store interface, so the whole
 * route can be exercised over HTTP with no database (the magicLinkVerify.ts
 * shape). This file must not import @workspace/db for that reason.
 */
import crypto from "crypto";
import { Router, type IRouter } from "express";
import { LIVE_PAGE_STATUS } from "./inviteSendRule";
import { calendarFeedUrl } from "./calendarFeed";
import { firstName } from "./names";

export interface InviteClaimPage {
  id: string;
  status: string;
  /**
   * crisis_free | organiser | gift (null on older gift pages). Carried for the
   * log only — liveness is the status and nothing else, so a live page from any
   * of the three paths is claimable. Every go-live writes the same status:
   * publish (organiser AND crisis pages), gift activation, and the scheduled
   * activation cron all set `active`.
   */
  origin: string | null;
  recipientName: string;
  location: string | null;
  situationDescription: string | null;
  slug: string;
}

export interface InviteClaimSlot {
  id: string;
  isClaimed: boolean;
  slotType: string;
  customLabel: string | null;
  slotDate: string | null;
  slotTime: string | null;
  liftWaitMode: string | null;
  notes: string | null;
  dietaryNotes: string | null;
  headcount: number | null;
}

export interface InviteClaimRecord {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  claimedAt: Date | null;
  slot: InviteClaimSlot | null;
  /** The slot's page. Null only if the page row is gone. */
  page: InviteClaimPage | null;
}

export interface SlotClaimFields {
  claimedByName: string;
  claimedByContact: string;
  claimedAt: Date;
  claimedNameVisible: boolean;
  cancelToken: string;
  calendarToken: string;
}

export interface InviteClaimStore {
  findByToken(token: string): Promise<InviteClaimRecord | null>;
  /**
   * Atomic: claim only if the slot is still unclaimed. Returns the claimed slot,
   * or null if someone else got there first.
   */
  claimSlot(slotId: string, fields: SlotClaimFields): Promise<InviteClaimSlot | null>;
  markInviteClaimed(inviteId: string, now: Date): Promise<void>;
}

export interface InviteClaimedEvent {
  invite: InviteClaimRecord;
  page: InviteClaimPage;
  slot: InviteClaimSlot;
  cancelToken: string;
  calendarToken: string;
}

export interface InviteClaimDeps {
  store: InviteClaimStore;
  /** Fire-and-forget confirmation to the helper. The only message a claim sends. */
  onClaimed: (event: InviteClaimedEvent) => void;
  log: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void };
  clock?: () => Date;
}

export function isPageLive(page: Pick<InviteClaimPage, "status"> | null | undefined): boolean {
  return !!page && page.status === LIVE_PAGE_STATUS;
}

const INVALID_LINK = "This invitation link is invalid or has expired.";

/**
 * ✅ Approved copy, Kate, 16 Sep 2026 (bug #115) — word-for-word, the same body
 * as the invite page's "Not live yet" state (rally InviteClaim.tsx). Shown only
 * if that state fails to render, since the invite page checks `pageLive` on load
 * and never offers the button.
 */
export function invitePageNotLive(recipientName: string): string {
  return `${firstName(recipientName)}'s page is still being set up. Hang on to this message — this link will work as soon as it's switched on.`;
}

export function createInviteClaimRouter(deps: InviteClaimDeps): IRouter {
  const { store, onClaimed, log } = deps;
  const clock = deps.clock ?? (() => new Date());
  const router: IRouter = Router();

  // GET /api/invite/:token — get invite details
  router.get("/invite/:token", async (req, res) => {
    const invite = await store.findByToken(req.params.token);

    // A closed page's invite is answered exactly like a dead link — the same
    // choice /s/:slug makes for a closed page (bug #028 left that generic).
    if (!invite || !invite.slot || !invite.page || invite.page.status === "closed") {
      res.status(404).json({ error: INVALID_LINK });
      return;
    }

    const { slot, page } = invite;

    // Not live yet (draft, pending_approval, anything added to the enum later).
    // Nothing about the task or the page's situation leaves the server until the
    // page is published — the same promise /s/:slug keeps. The helper's name and
    // the recipient's name are already in the message that carried this link.
    if (!isPageLive(page)) {
      res.json({
        pageLive: false,
        helperName: invite.name,
        page: { recipientName: page.recipientName },
      });
      return;
    }

    res.json({
      pageLive: true,
      inviteId: invite.id,
      helperName: invite.name,
      alreadyClaimed: !!invite.claimedAt || slot.isClaimed,
      claimedByYou: !!invite.claimedAt,
      slot: {
        id: slot.id,
        slotType: slot.slotType,
        customLabel: slot.customLabel,
        slotDate: slot.slotDate,
        slotTime: slot.slotTime,
        liftWaitMode: slot.liftWaitMode,
        notes: slot.notes,
      },
      page: {
        recipientName: page.recipientName,
        location: page.location,
        situationDescription: page.situationDescription,
        slug: page.slug,
      },
    });
  });

  // POST /api/invite/:token/claim — claim via invite. The real button sends NO
  // body. That is safe only because ensureRequestBody (lib/requestHygiene.ts)
  // runs first; lib/inviteClaim.test.ts sends the real, bodiless request through
  // the same wiring and fails if it stops.
  router.post("/invite/:token/claim", async (req, res) => {
    const { showName } = req.body as { showName?: boolean };

    const invite = await store.findByToken(req.params.token);

    if (!invite || !invite.slot) {
      res.status(404).json({ error: "This invitation link is invalid." });
      return;
    }

    // Before anything that writes or sends. A page that isn't live cannot be
    // helped yet, whatever the invite says.
    if (!isPageLive(invite.page)) {
      log.warn(
        {
          inviteId: invite.id,
          pageStatus: invite.page?.status ?? "missing",
          pageOrigin: invite.page?.origin ?? null,
        },
        "Invite claim refused — page not live",
      );
      res.status(409).json({
        error: invite.page
          ? invitePageNotLive(invite.page.recipientName)
          : "This invitation link is invalid.",
        reason: "page_not_live",
      });
      return;
    }
    const page = invite.page!;

    if (invite.claimedAt) {
      res.status(409).json({ error: "You've already confirmed this slot." });
      return;
    }

    if (invite.slot.isClaimed) {
      res.status(409).json({
        error: "Sorry — this slot has already been claimed by someone else.",
      });
      return;
    }

    const now = clock();

    // Atomic conditional update: only claim if the slot is still unclaimed, exactly
    // like the public claim path. The isClaimed read above can go stale between two
    // near-simultaneous claims (two invites to the same slot, or an invite racing a
    // public claim); without this guard the second write would silently overwrite
    // the first helper's name/note. If we lose the race, the store returns null and
    // we report the 409 rather than stamping the invite as claimed.
    // A fresh release handle, exactly as the public claim path mints one — a
    // trusted helper releases their slot the same way anyone else does (the
    // release endpoint only ever touches the slot, never this invite row).
    const cancelToken = crypto.randomBytes(24).toString("hex");
    // Sibling calendar-feed handle, minted on the same claim as the public path
    // (see slots.ts). Survives release so the feed can render STATUS:CANCELLED.
    const calendarToken = crypto.randomBytes(24).toString("hex");

    const claimed = await store.claimSlot(invite.slot.id, {
      claimedByName: invite.name,
      claimedByContact: invite.mobile ?? invite.email ?? invite.name,
      claimedAt: now,
      // Same opt-in default as the public claim path. A trusted, named helper
      // still chooses whether other helpers see their name; the recipient always
      // does. (The invite page does not ask yet — a separate ruling for Kate.)
      claimedNameVisible: showName === true,
      cancelToken,
      calendarToken,
    });

    if (!claimed) {
      res.status(409).json({
        error: "Sorry — this slot has already been claimed by someone else.",
      });
      return;
    }

    await store.markInviteClaimed(invite.id, now);

    log.info({ inviteId: invite.id, name: invite.name }, "Trusted helper claimed slot");

    // Confirm the claim on the helper's own channel, exactly as the public path
    // does (bug #013).
    onClaimed({ invite, page, slot: claimed, cancelToken, calendarToken });

    // Hand back the release token so the confirmed screen can offer a "Can't make
    // it?" link, matching the public path. calendarUrl is the https .ics as a
    // one-tap download (bug #037), given only for a dated task.
    res.json({
      ok: true,
      claimedByName: invite.name,
      cancelToken,
      calendarUrl: claimed.slotDate ? calendarFeedUrl(calendarToken) : null,
    });
  });

  return router;
}
