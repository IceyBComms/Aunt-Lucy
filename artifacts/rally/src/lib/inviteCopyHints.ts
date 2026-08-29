/**
 * Ghost-text hints for the two invite-copy fields (the standard "situation" line
 * and the trusted "support circle" line) shown on the activation and /manage
 * screens.
 *
 * These are DISPLAY-ONLY. The real send-time copy is resolved server-side from
 * the stored baby_stage / occasion (see api-server/src/lib/inviteCopy.ts) — a
 * blank field sends null and the server fills the default. The new_baby stage
 * wordings below MUST mirror NEW_BABY_*_BY_STAGE in that server module; the two
 * can't share a package (api-server vs rally), so this is a deliberate, small,
 * commented duplication of exactly the two answered-stage strings. The
 * stage-agnostic (null) default always comes from the server (passed in as
 * `agnosticDefault`), so it is never duplicated here.
 */
import type { BabyStage, GiftOccasion, RecipientPronouns } from "@workspace/api-client-react";

/**
 * The last-resort ghost text, for when the server sends no occasion default at
 * all — both `situationLine` and `trustedLine` are nullable in the API response.
 *
 * ⚠️ Bug #059. This slot used to hold NEW-BABY literals: "just welcomed their
 * new baby" and "getting ready for the new baby". Unreachable in practice,
 * because the server always sends a default — but unreachable is not the same
 * as safe. The day anything upstream changed, a bereaved recipient would have
 * been shown, as the suggested wording for her own invite, that her friends
 * were about to be told she had just had a baby. Nothing would have failed and
 * nobody would have been alerted.
 *
 * This is the `other` wording from SITUATION_LINE_DEFAULTS and
 * TRUSTED_LINE_DEFAULTS in api-server/src/lib/inviteCopy.ts, where both entries
 * are this same string. One constant covers both fields for that reason. It is
 * occasion-neutral by construction, so a null is TRUE on every occasion rather
 * than merely harmless on most of them.
 *
 * ✅ Kate's ruling, 30 Aug 2026: take the neutral wording now; making the two
 * API fields non-nullable is a contract change for another day.
 */
export const NEUTRAL_LINE_FALLBACK = "got a lot on right now";

/** Resolve {poss}/{obj} pronoun tokens in an occasion line for display. */
export function resolvePronounTokens(
  line: string,
  p: RecipientPronouns,
): string {
  const map = {
    she_her: { poss: "her", obj: "her" },
    he_him: { poss: "his", obj: "him" },
    they_them: { poss: "their", obj: "them" },
  }[p];
  return line.replace(/\{poss\}/g, map.poss).replace(/\{obj\}/g, map.obj);
}

const NEW_BABY_SITUATION_BY_STAGE: Record<BabyStage, string> = {
  expecting: "getting ready to welcome a new baby",
  arrived: "just welcomed {poss} new baby",
};

const NEW_BABY_TRUSTED_BY_STAGE: Record<BabyStage, string> = {
  expecting: "getting ready for the new baby",
  arrived: "finding {poss} feet with the new baby",
};

interface HintOpts {
  occasion: GiftOccasion | null | undefined;
  babyStage: BabyStage | null;
  pronouns: RecipientPronouns;
  /** The stage-agnostic occasion default from the server, used when not new_baby
   *  or when the baby stage is unanswered. */
  agnosticDefault: string;
}

export function situationHint(opts: HintOpts): string {
  const base =
    opts.occasion === "new_baby" && opts.babyStage
      ? NEW_BABY_SITUATION_BY_STAGE[opts.babyStage]
      : opts.agnosticDefault;
  return resolvePronounTokens(base, opts.pronouns);
}

export function trustedHint(opts: HintOpts): string {
  const base =
    opts.occasion === "new_baby" && opts.babyStage
      ? NEW_BABY_TRUSTED_BY_STAGE[opts.babyStage]
      : opts.agnosticDefault;
  return resolvePronounTokens(base, opts.pronouns);
}
