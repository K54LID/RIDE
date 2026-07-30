-- Woof cooldown becomes time-based, and courtship becomes visible.

-- The old index allowed one woof per calendar day, so a woof at 23:50
-- unlocked another at 00:01. A 12-hour cooldown is what was asked for
-- and it can't be expressed as a unique index, so the rule moves into
-- the handler and the index is replaced by a lookup index.
DROP INDEX IF EXISTS woofs_daily_unique;
CREATE INDEX woofs_pair_recent_idx ON woofs (sender_id, target_id, created_at DESC);

-- Who currently holds a courtship, so a courted profile can show the
-- person who paid for it. Updated on every court; one row per target.
CREATE TABLE courtships (
  target_id   uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  courter_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  coin_cost   bigint NOT NULL,
  court_value bigint NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (target_id <> courter_id)
);
CREATE INDEX courtships_courter_idx ON courtships (courter_id, created_at DESC);

-- Backfill from the existing event log so history isn't lost.
INSERT INTO courtships (target_id, courter_id, coin_cost, court_value, created_at)
SELECT DISTINCT ON (target_id) target_id, courter_id, coin_cost, value_after, created_at
FROM court_events
ORDER BY target_id, created_at DESC
ON CONFLICT (target_id) DO NOTHING;
