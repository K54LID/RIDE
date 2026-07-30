-- Chat management: per-member "delete chat".
--
-- Deleting a chat is personal — the other member keeps their copy. A
-- cleared_at watermark hides everything at or before that moment for
-- the member who deleted, while is_archived (from 001) removes the row
-- from their list until a new message arrives. is_pinned also already
-- exists in 001; this migration only adds the missing watermark.

ALTER TABLE conversation_members
  ADD COLUMN cleared_at timestamptz;
