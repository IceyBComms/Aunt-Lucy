import { db, supportPagesTable } from "@workspace/db";
import { isNotNull, eq } from "drizzle-orm";
import bcrypt from "bcrypt";

const BCRYPT_COST = 10;

/** True if the stored value is already a bcrypt hash (vs a legacy plaintext PIN). */
function isBcryptHash(value: string): boolean {
  return /^\$2[aby]\$/.test(value);
}

/**
 * One-off, idempotent backfill: converts any plaintext PIN in support_pages to
 * a bcrypt hash. Rows that are already hashed are skipped, so this is safe to
 * run repeatedly. Run once after deploying the PIN-hashing change:
 *
 *   pnpm --filter @workspace/scripts run hash-pins
 */
async function main(): Promise<void> {
  console.log("Backfilling plaintext PINs → bcrypt hashes...");

  const pages = await db
    .select({
      id: supportPagesTable.id,
      slug: supportPagesTable.slug,
      pin: supportPagesTable.pin,
    })
    .from(supportPagesTable)
    .where(isNotNull(supportPagesTable.pin));

  let hashed = 0;
  let skipped = 0;

  for (const page of pages) {
    if (!page.pin || isBcryptHash(page.pin)) {
      skipped++;
      continue;
    }

    const hash = await bcrypt.hash(page.pin, BCRYPT_COST);
    await db
      .update(supportPagesTable)
      .set({ pin: hash })
      .where(eq(supportPagesTable.id, page.id));

    hashed++;
    console.log(`  hashed PIN for /${page.slug}`);
  }

  console.log(`Done. ${hashed} hashed, ${skipped} already hashed/skipped.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
