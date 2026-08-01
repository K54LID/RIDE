-- Lapsed court value returns to 2, not 0.
--
-- 015 set it to 0. That is wrong: a court costs double the target's
-- current value, so at 0 the next court costs nothing, and so does
-- every one after it. The whole economy collapses to free.
--
-- This is a separate file rather than an edit to 015 because 015 has
-- already run on production. Editing it changed its checksum and the
-- migration runner — correctly — refused to boot:
--
--   Error: Migration 015_court_expiry.sql was modified after being
--   applied. Migrations are immutable once applied.
--
-- 015 has been restored to the exact bytes that were applied, and the
-- behavioural change lives here instead.

-- Anyone already floored at 0 by 015 is lifted to the base value.
-- Only people with no live courtship: someone mid-courtship keeps
-- whatever they were courted to.
UPDATE profiles p
SET court_value = 2, updated_at = now()
WHERE p.court_value < 2
  AND NOT EXISTS (
    SELECT 1 FROM courtships c
    WHERE c.target_id = p.account_id AND c.expires_at > now()
  );

-- Fresh installs never hit the 0 case at all: profiles.court_value
-- already defaults to 1 and the expiry worker writes 2 from now on.
-- This file is safe to re-run — it only ever raises a value that is
-- below the floor, and never touches a live courtship.
