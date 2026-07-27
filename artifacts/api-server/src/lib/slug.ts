import crypto from "crypto";
import { db, supportPagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Support page URLs are public and unauthenticated, so the slug must be an
// unguessable random token (privacy requirement) rather than a readable name.
// 12 characters from a 62-character alphabet is ~71 bits of entropy.
//
// Extracted from routes/organiser.ts so gift activation creates pages with
// exactly the same class of URL — a page made by a recipient must be no more
// guessable than one made by an organiser.
const SLUG_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const SLUG_LENGTH = 12;

export function generateSlug(): string {
  // Rejection-sample bytes to avoid modulo bias (256 is not a multiple of 62).
  const maxUnbiased = 256 - (256 % SLUG_ALPHABET.length); // 248
  const chars: string[] = [];
  while (chars.length < SLUG_LENGTH) {
    const buf = crypto.randomBytes(SLUG_LENGTH);
    for (let i = 0; i < buf.length && chars.length < SLUG_LENGTH; i++) {
      if (buf[i] < maxUnbiased) {
        chars.push(SLUG_ALPHABET[buf[i] % SLUG_ALPHABET.length]);
      }
    }
  }
  return chars.join("");
}

export async function uniqueSlug(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const slug = generateSlug();
    const existing = await db.query.supportPagesTable.findFirst({
      where: eq(supportPagesTable.slug, slug),
    });
    if (!existing) return slug;
  }
  // With ~71 bits of entropy, 10 collisions is effectively impossible; fall
  // back to another fresh token rather than a weaker one.
  return generateSlug();
}
