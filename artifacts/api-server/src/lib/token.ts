import crypto from "crypto";

/**
 * Unguessable public tokens for URLs that are handed out but never authenticated
 * — support page slugs and gift redemption tokens.
 *
 * These URLs are the only thing standing between a stranger and a family's
 * support page, so the token must be random rather than derived from anything
 * readable (privacy requirement, CLAUDE.md). 12 characters from a 62-character
 * alphabet is ~71 bits of entropy.
 */
const TOKEN_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const TOKEN_LENGTH = 12;

export function generateToken(): string {
  // Rejection-sample bytes to avoid modulo bias (256 is not a multiple of 62).
  const maxUnbiased = 256 - (256 % TOKEN_ALPHABET.length); // 248
  const chars: string[] = [];
  while (chars.length < TOKEN_LENGTH) {
    const buf = crypto.randomBytes(TOKEN_LENGTH);
    for (let i = 0; i < buf.length && chars.length < TOKEN_LENGTH; i++) {
      if (buf[i] < maxUnbiased) {
        chars.push(TOKEN_ALPHABET[buf[i] % TOKEN_ALPHABET.length]);
      }
    }
  }
  return chars.join("");
}

/**
 * A token that is not already taken, checked against the table it is for.
 *
 * With ~71 bits of entropy a collision is effectively impossible; the loop is
 * belt-and-braces so a unique-constraint violation can never surface to a buyer
 * mid-purchase.
 */
export async function uniqueToken(
  isTaken: (token: string) => Promise<boolean>,
): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const token = generateToken();
    if (!(await isTaken(token))) return token;
  }
  // Fall back to another fresh token rather than a weaker one.
  return generateToken();
}
