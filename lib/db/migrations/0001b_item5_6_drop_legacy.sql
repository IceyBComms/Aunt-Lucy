-- Item 5 + 6 — drop the superseded trusted_helper_invites table (DESTRUCTIVE HALF).
--
-- REVIEW-ONLY DRAFT. Not applied anywhere. This is the split-out DESTRUCTIVE
-- half of the original 0001_item5_6_invites.sql.
--
-- ⚠️ IRREVERSIBLE. A dropped table cannot be un-dropped. Safe here ONLY because
-- the table is empty (verified 0 rows on prod, 2026-07-26) and superseded by
-- helper_invites. The guard below re-checks emptiness at apply time and aborts
-- if a row appeared since.
--
-- SEQUENCING — this is the LAST prod step, run in Phase C AFTER:
--   1. 0000 + 0003 (enum) + 0001a + 0002 have been applied, AND
--   2. the new code (top branch) has been deployed to Railway/Vercel — the new
--      code uses helper_invites and no longer references trusted_helper_invites.
-- Running this while the OLD main code is still live would break its invitesRouter
-- (it reads/writes trusted_helper_invites). Do not run early.
--
-- Immediately before applying, re-run the empty-check gate by hand as well:
--   SELECT count(*) FROM trusted_helper_invites;   -- must be 0

BEGIN;

-- Safety gate: refuse to drop if the table somehow holds rows. Belt-and-braces
-- on top of the manual count above — if this raises, STOP and investigate; do
-- not force the drop.
DO $$
BEGIN
  IF to_regclass('public.trusted_helper_invites') IS NOT NULL THEN
    IF (SELECT count(*) FROM "trusted_helper_invites") > 0 THEN
      RAISE EXCEPTION
        'ABORT: trusted_helper_invites is not empty (% rows) — refusing to DROP',
        (SELECT count(*) FROM "trusted_helper_invites");
    END IF;
  END IF;
END $$;

-- Drop the superseded table (confirmed empty above and in the manual gate).
DROP TABLE IF EXISTS "trusted_helper_invites";

COMMIT;

-- Verify after applying (expect NULL):
--   SELECT to_regclass('public.trusted_helper_invites');
