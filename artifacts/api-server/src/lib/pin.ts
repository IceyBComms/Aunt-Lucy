import bcrypt from "bcrypt";
import crypto from "crypto";

const BCRYPT_COST = 10;

/** True if the stored value is a bcrypt hash rather than a legacy plaintext PIN. */
function isBcryptHash(value: string): boolean {
  return /^\$2[aby]\$/.test(value);
}

/** Hash a raw PIN for storage. */
export function hashPin(rawPin: string): Promise<string> {
  return bcrypt.hash(rawPin, BCRYPT_COST);
}

/**
 * Verify a submitted PIN against the stored value.
 *
 * Supports both bcrypt hashes and — transitionally — legacy plaintext PINs, so
 * existing PIN-protected pages keep working until the one-off backfill
 * (`pnpm --filter @workspace/scripts run hash-pins`) has hashed them. Once every
 * row is hashed, the plaintext branch below is dead code and can be removed.
 */
export async function verifyPin(
  submitted: string,
  stored: string | null,
): Promise<boolean> {
  if (!stored) return false;

  if (isBcryptHash(stored)) {
    return bcrypt.compare(submitted, stored);
  }

  // Legacy plaintext PIN — constant-time comparison.
  const a = Buffer.from(submitted);
  const b = Buffer.from(stored);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
