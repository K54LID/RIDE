-- Handles become the identity.
--
-- A handle is now what people see in comments, chats, alerts, stories,
-- ranks and everywhere else; the display name survives only on the
-- profile header and the Discover grid. That only works if everyone
-- actually has one, so `handle` stops being optional.
--
-- Existing rows may have NULL. Backfilling has to be deterministic and
-- collision-free, and it must not invent something that looks like a
-- name the person chose — they will be prompted to pick a real one on
-- next open, and until then they need *an* addressable handle.
--
-- Strategy: slugify the display name, and if that is empty or already
-- taken, fall back to `user_<first 8 of account_id>`, which is unique
-- by construction because account_id is.

-- 1. Slug from display_name where it yields something legal and free.
WITH candidate AS (
  SELECT p.account_id,
         NULLIF(
           substring(
             regexp_replace(lower(p.display_name), '[^a-z0-9_]', '', 'g')
             from 1 for 24),
           '') AS slug
  FROM profiles p
  WHERE p.handle IS NULL
),
usable AS (
  SELECT c.account_id, c.slug
  FROM candidate c
  WHERE c.slug IS NOT NULL
    AND length(c.slug) >= 3
    -- free against handles that already exist
    AND NOT EXISTS (SELECT 1 FROM profiles p2 WHERE lower(p2.handle) = c.slug)
    -- and unique among the rows we are about to fill in this same pass
    AND c.account_id = (
      SELECT c2.account_id FROM candidate c2
      WHERE c2.slug = c.slug
      ORDER BY c2.account_id
      LIMIT 1
    )
)
UPDATE profiles p
SET handle = u.slug
FROM usable u
WHERE p.account_id = u.account_id;

-- 2. Everyone still NULL gets a guaranteed-unique fallback.
UPDATE profiles
SET handle = 'user_' || substring(replace(account_id::text, '-', '') from 1 for 8)
WHERE handle IS NULL;

-- 3. Lock it in. The partial unique index on lower(handle) from 001
--    already prevents duplicates; NOT NULL is what is new here.
ALTER TABLE profiles ALTER COLUMN handle SET NOT NULL;

-- 4. The old index was partial (WHERE handle IS NOT NULL). With the
--    column NOT NULL the predicate is redundant, and a plain unique
--    index is usable by more plans.
DROP INDEX IF EXISTS profiles_handle_key;
CREATE UNIQUE INDEX profiles_handle_key ON profiles (lower(handle));
