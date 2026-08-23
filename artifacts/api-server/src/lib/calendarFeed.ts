// A subscribable .ics calendar feed for a single claim.
//
// One feed per claim, reached only through the private calendar_token minted at
// claim time (the sibling of cancel_token — see the schema comment on
// slots.calendar_token). The token IS the access, exactly like the release link:
// no account, nothing to remember beyond the link the helper already has.
//
// The feed is generated fresh on every fetch from the live slot row, so it
// always reflects current state:
//   • claimed  → a VEVENT with STATUS:CONFIRMED (a time change since claim time
//                simply shows the new time next time the calendar app polls).
//   • released → the SAME VEVENT with STATUS:CANCELLED, so a subscribed calendar
//                is told to clear the entry rather than left with a stale one (a
//                bare 404 often doesn't clean up). This only works because
//                calendar_token, unlike cancel_token, survives a release.
//   • undated  → an empty calendar (a "whenever suits" offer is not an
//                appointment, so there is nothing to put on a calendar).
//
// Times are emitted as FLOATING wall-clock (no timezone), matching how the rest
// of the app treats slot_time: the setup person enters a local Australian
// wall-clock time and every helper is local, so "3:00pm" means 3:00pm on the
// helper's own device. This avoids a VTIMEZONE dependency and the DST bugs that
// come with a fixed UTC offset. A helper who travels interstate is the one edge
// this doesn't cover, which is an acceptable trade for v1.

import ical, { ICalEventStatus, ICalCalendarMethod } from "ical-generator";
import { getAppBaseUrl } from "./appUrl";
import { taskLabel } from "./item17Copy";
import {
  LIFT_WAIT_MODE_HELPER_LINES,
  liftWaitMinutes,
  liftWaitSummarySuffix,
  type LiftWaitMode,
} from "./liftWaitMode";

// The domain half of each event's UID. Kept stable and derived from the slot id
// so the SAME event is updated (not duplicated) across fetches when the time
// changes, and a later CANCELLED lands on the entry the calendar already holds.
const UID_DOMAIN = "auntlucy.com.au";

// No end time is stored, so a timed task is shown as a one-hour block — long
// enough to read as a real appointment, short enough not to swallow the day.
const DEFAULT_EVENT_MINUTES = 60;

export interface CalendarClaimData {
  /** Stable slot id — becomes the event UID so updates/cancels reconcile. */
  slotId: string;
  slotType: string;
  customLabel: string | null;
  /** "YYYY-MM-DD" or null (an undated, whenever-suits offer). */
  slotDate: string | null;
  /** "HH:MM" / "HH:MM:SS" or null (a dated task with no set time = all-day). */
  slotTime: string | null;
  /** The recipient's first name only — the event title never carries more. */
  recipientFirstName: string;
  /** page.location, free text, already shown to this helper in their email. */
  location: string | null;
  /** Is the claim currently live? false once released → STATUS:CANCELLED. */
  claimed: boolean;
  /**
   * Bug #033 — for a lift, whether the helper waits. Null on everything else.
   *
   * This is the field that makes a lift a DIFFERENT DIARY ENTRY rather than the
   * same entry with different words: see the duration logic below. Null keeps
   * the event byte-identical to what this built before the field existed.
   */
  liftWaitMode: LiftWaitMode | null;
}

/**
 * A floating wall-clock instant for a slot. Built as a UTC instant so
 * ical-generator's `floating: true` emits the exact clock components with no
 * timezone conversion (verified: "15:00" → DTSTART:...T150000).
 */
function floatingInstant(slotDate: string, slotTime: string | null): Date {
  const hhmmss = slotTime
    ? slotTime.length === 5
      ? `${slotTime}:00` // "HH:MM" → "HH:MM:SS"
      : slotTime
    : "00:00:00";
  return new Date(`${slotDate}T${hhmmss}Z`);
}

/**
 * Builds the .ics body for one claim. Always returns a valid VCALENDAR — an
 * undated claim yields an events-free calendar rather than throwing.
 */
export function buildClaimIcs(data: CalendarClaimData): string {
  const cal = ical({
    name: "Aunt Lucy",
    prodId: { company: "Aunt Lucy", product: "aunt-lucy", language: "EN" },
  });
  // PUBLISH is the method for a subscribed feed the client polls (as opposed to
  // REQUEST, which is for emailed iTIP invitations).
  cal.method(ICalCalendarMethod.PUBLISH);

  // Only a dated task is an appointment; an undated offer gets an empty calendar.
  if (data.slotDate) {
    const label = taskLabel(data.slotType, data.customLabel);
    const timed = !!data.slotTime;
    const waitSuffix = liftWaitSummarySuffix(data.liftWaitMode);
    const start = floatingInstant(data.slotDate, data.slotTime);

    const event = cal.createEvent({
      // Stable UID: same event updated across fetches, cancel lands on it.
      id: `slot-${data.slotId}@${UID_DOMAIN}`,
      start,
      floating: true,
      allDay: !timed,
      // The wait-or-not answer rides in the TITLE as well as the duration: a
      // helper scanning a week view sees the words without opening the event.
      // Omitted entirely when unset, so a non-lift title is unchanged.
      summary: waitSuffix
        ? `Helping ${data.recipientFirstName}: ${label} (${waitSuffix})`
        : `Helping ${data.recipientFirstName}: ${label}`,
      status: data.claimed
        ? ICalEventStatus.CONFIRMED
        : ICalEventStatus.CANCELLED,
      // A cancel must look "newer" than any CONFIRMED copy a client cached, so
      // it always supersedes it.
      sequence: data.claimed ? 0 : 1,
    });

    if (timed) {
      // Bug #033 — the duration itself carries the size of the ask, because that
      // is what a helper's calendar actually reserves. "Lift to hospital, 45
      // minutes" and "lift to hospital, half a day" are different diary entries;
      // a helper who blocks out the wrong one cancels, and printing the answer
      // in the description alone would not have changed a single calendar.
      // Falls back to the unchanged one-hour default when there is no answer.
      const minutes = liftWaitMinutes(data.liftWaitMode) ?? DEFAULT_EVENT_MINUTES;
      event.end(new Date(start.getTime() + minutes * 60_000));
    }

    // Bug #033 — the full sentence in the event body, so a helper who opens the
    // entry gets the reason the block is that long. Set only for an answered
    // lift; every other event carries no description at all, exactly as before.
    if (data.liftWaitMode) {
      event.description(LIFT_WAIT_MODE_HELPER_LINES[data.liftWaitMode]);
    }

    // Location is page-level free text, already emailed to this same helper, so
    // including it here is no new exposure. Omitted entirely when unset.
    if (data.location && data.location.trim()) {
      event.location(data.location.trim());
    }
  }

  return cal.toString();
}

/** The direct https URL of a claim's feed (also works as a one-tap download). */
export function calendarFeedUrl(calendarToken: string): string {
  return `${getAppBaseUrl()}/api/calendar/${calendarToken}.ics`;
}

/**
 * The webcal:// form of the same URL. webcal is the scheme calendar apps treat
 * as "subscribe to this live feed", so later time changes and cancellations are
 * picked up on the app's normal refresh — the reason this feature exists.
 */
export function calendarSubscribeUrl(calendarToken: string): string {
  return calendarFeedUrl(calendarToken).replace(/^https?:\/\//i, "webcal://");
}
