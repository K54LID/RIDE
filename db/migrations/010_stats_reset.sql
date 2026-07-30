-- Admin "reset rank statistics" support.
--
-- Rather than deleting other people's woofs, likes, gifts and follows
-- (their actions, not the target's), rank and counter queries simply
-- ignore events that predate the watermark. Non-destructive, auditable,
-- and a second reset just moves the line forward.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stats_reset_at timestamptz;
