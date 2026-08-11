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
