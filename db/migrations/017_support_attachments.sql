-- Support messages gain a screenshot and a reply.
--
-- Two gaps in 014:
--
--   1. A bug report without a screenshot is a description of a screen
--      nobody can see. `media_id` holds one optional image, reusing the
--      existing media pipeline rather than inventing a second one, so
--      it is served through the same authenticated proxy and cleaned up
--      by the same cascade.
--
--   2. Resolving a message told the person nothing. `reply` is what the
--      admin writes back, delivered to the person's bot chat. It is
--      nullable because "handled" without a note is still a valid
--      outcome — the person gets the standard thank-you either way.
--
-- ON DELETE SET NULL on the media: deleting an image should not delete
-- the report describing it.

ALTER TABLE support_messages
  ADD COLUMN IF NOT EXISTS media_id uuid REFERENCES media(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply text;

-- The panel lists open messages first but now also needs to show what
-- was already handled, so an admin can find a thread they replied to.
CREATE INDEX IF NOT EXISTS support_messages_recent_idx
  ON support_messages (created_at DESC);
