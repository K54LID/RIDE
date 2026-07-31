-- Story replies land in the chat.
--
-- A reply to a story used to go into `story_replies` and nowhere else:
-- the author got a notification, but there was no conversation to
-- continue in, and the reply itself was only visible in the story's
-- viewer panel. Replying to someone's story is the start of a
-- conversation, so it now also creates a real message in the private
-- chat between the two people.
--
-- The message needs to say what it is replying to. `reply_to_id` points
-- at another message and can't carry a story, so messages get their own
-- nullable reference. Null for every ordinary message.
--
-- ON DELETE SET NULL rather than CASCADE: stories expire and get
-- deleted, and losing the conversation when that happens would be worse
-- than losing the thumbnail. The message survives, minus its context.

ALTER TABLE messages
  ADD COLUMN story_id uuid REFERENCES stories(id) ON DELETE SET NULL;

CREATE INDEX messages_story_idx ON messages (story_id) WHERE story_id IS NOT NULL;
