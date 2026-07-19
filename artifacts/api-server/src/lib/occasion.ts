/**
 * The gift occasion vocabulary, mirroring gift_occasion in the database.
 *
 * Lives in its own module because both the gift routes and the suggestion
 * defaults need it, and neither should own it.
 */
export const OCCASIONS = [
  "new_baby",
  "illness_recovery",
  "bereavement",
  "ongoing_support",
  "other",
] as const;

export type Occasion = (typeof OCCASIONS)[number];

export function asOccasion(value: unknown): Occasion | null {
  return typeof value === "string" && OCCASIONS.includes(value as Occasion)
    ? (value as Occasion)
    : null;
}
