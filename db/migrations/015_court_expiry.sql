-- Courting expires.
--
-- `court_value` was permanent: pay once and you sat at the top of the
-- board forever. The rule asked for is a standing you have to keep:
-- 30 days from the last court, then the value falls to zero. Courting
-- again resets the clock to a full 30 days.
--
-- Two things are needed for that.

-- 1. An explicit expiry on the courtship, rather than deriving it from
--    created_at everywhere. A re-court sets it forward, and it is the
--    single column a sweep and a countdown can both read.
ALTER TABLE courtships
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE courtships
SET expires_at = created_at + interval '30 days'
WHERE expires_at IS NULL;

ALTER TABLE courtships ALTER COLUMN expires_at SET NOT NULL;

-- The sweep asks "what has expired" every few minutes, so that lookup
-- has to be an index scan rather than a table scan.
CREATE INDEX IF NOT EXISTS courtships_expires_idx ON courtships (expires_at);

-- 2. A record of the decay.
--
--    court_events cannot hold this: courter_id is NOT NULL and a CHECK
--    forbids courter_id = target_id, because that table models "X
--    courted Y" and an expiry has no X. Writing one would mean claiming
--    somebody performed it. So expiries are logged on their own table
--    instead, keyed by the person whose value lapsed.
CREATE TABLE IF NOT EXISTS court_expiries (
  id           bigserial PRIMARY KEY,
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  value_before bigint NOT NULL,
  expired_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS court_expiries_account_idx
  ON court_expiries (account_id, expired_at DESC);

-- Any courtship already past its window is expired immediately, so the
-- first sweep after deploy does not have to catch up on a backlog while
-- serving traffic.
INSERT INTO court_expiries (account_id, value_before)
SELECT c.target_id, p.court_value
FROM courtships c
JOIN profiles p ON p.account_id = c.target_id
WHERE c.expires_at <= now() AND p.court_value > 0;

UPDATE profiles p
SET court_value = 0, updated_at = now()
FROM courtships c
WHERE c.target_id = p.account_id
  AND c.expires_at <= now()
  AND p.court_value > 0;

DELETE FROM courtships WHERE expires_at <= now();
