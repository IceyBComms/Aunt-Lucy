/**
 * SMS segment accounting — what a body will actually be *billed* as.
 *
 * A single character outside the GSM 7-bit alphabet forces the whole message to
 * UCS-2, which drops the per-segment capacity from 153 characters to 67. An em
 * dash or a 💛 can therefore turn a two-segment message into a five-segment one
 * without changing a visible word. This module exists so that shows up in the
 * logs rather than only in the Twilio bill.
 *
 * It measures; it never rewrites. Copy is approved wording and is sent exactly
 * as composed (see inviteCopy.ts / item17Copy.ts).
 *
 * Sources:
 *   • Alphabet + extension table — 3GPP TS 23.038 GSM 7-bit default alphabet,
 *     transcribed from the standard's table as reproduced at
 *     https://en.wikipedia.org/wiki/GSM_03.38 (checked, not written from memory).
 *   • Segment sizes — Twilio, "What is the SMS character limit?":
 *     GSM-7 160 single / 153 multipart, UCS-2 70 single / 67 multipart.
 */

// The basic table, in standard order: 0x00–0x0F of each column. LF, CR and ESC
// are the three control characters that live in it.
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅå" +
  "Δ_ΦΓΛΩΠΨΣΘΞÆæßÉ" +
  " !\"#¤%&'()*+,-./" +
  "0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNO" +
  "PQRSTUVWXYZÄÖÑÜ§" +
  "¿abcdefghijklmno" +
  "pqrstuvwxyzäöñüà";

// The extension table: reachable only behind an ESC, so each costs TWO septets.
// (The table also holds FF; SS2 is a shift control and never appears in copy.)
const GSM7_EXTENDED = "\f^{}\\[~]|€";

const GSM7_SINGLE = 160;
const GSM7_MULTI = 153;
const UCS2_SINGLE = 70;
const UCS2_MULTI = 67;

export interface SmsSize {
  encoding: "GSM-7" | "UCS-2";
  /** Billed units: septets for GSM-7 (extension chars count 2), UTF-16 code units for UCS-2. */
  chars: number;
  segments: number;
}

const segmentsFor = (units: number, single: number, multi: number): number =>
  units <= single ? 1 : Math.ceil(units / multi);

/** How `body` will be encoded and billed. Pure; no side effects. */
export function measureSms(body: string): SmsSize {
  let septets = 0;
  let gsm7 = true;
  for (const ch of body) {
    if (GSM7_BASIC.includes(ch)) septets += 1;
    else if (GSM7_EXTENDED.includes(ch)) septets += 2;
    else {
      gsm7 = false;
      break;
    }
  }

  if (gsm7) {
    return {
      encoding: "GSM-7",
      chars: septets,
      segments: segmentsFor(septets, GSM7_SINGLE, GSM7_MULTI),
    };
  }

  // UCS-2 is counted in UTF-16 code units, so an astral character (any emoji)
  // costs two on its own.
  let units = 0;
  for (const ch of body) units += (ch.codePointAt(0) ?? 0) > 0xffff ? 2 : 1;
  return {
    encoding: "UCS-2",
    chars: units,
    segments: segmentsFor(units, UCS2_SINGLE, UCS2_MULTI),
  };
}
