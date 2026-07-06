/**
 * True if the given organiser email is the configured admin (ADMIN_EMAIL).
 *
 * Comparison is case-insensitive and trimmed. If ADMIN_EMAIL is unset, no one
 * is treated as admin (fail closed).
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!admin || !email) return false;
  return email.trim().toLowerCase() === admin;
}
