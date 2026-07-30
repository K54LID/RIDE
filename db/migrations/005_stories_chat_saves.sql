-- Stories interactions, saved posts, chat media, message reaction timestamps.
--
-- NOTE: message_reactions, messages_conversation_idx and
-- conversation_members_account_idx already exist in 001. This file only
-- adds what 001 did not define.

-- Woof reactions on stories: one per viewer per story.
CREATE TABLE story_reactions (
  story_id   uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, account_id)
);

-- Replies land with the story's author; they surface in the viewers
-- sheet rather than opening a chat thread (chat threads come from the
-- Chats tab — a story reply is a lighter gesture).
CREATE TABLE story_replies (
  id         bigserial PRIMARY KEY,
  story_id   uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  sender_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (char_length(body) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX story_replies_story_idx ON story_replies (story_id, id);

-- Saved posts (bookmarks).
CREATE TABLE saved_posts (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, post_id)
);
CREATE INDEX saved_posts_account_idx ON saved_posts (account_id, created_at DESC);

-- message_reactions exists since 001 but has no created_at. The reaction
-- handler writes it on every upsert (ON CONFLICT ... DO UPDATE SET
-- created_at = now()), so without this column reacting fails at runtime.
ALTER TABLE message_reactions
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

-- Bound the emoji column; 001 left it unconstrained text.
ALTER TABLE message_reactions
  ADD CONSTRAINT message_reactions_emoji_len CHECK (char_length(emoji) <= 8);

-- Messages carry media the same way posts do.
ALTER TABLE messages ADD COLUMN media_id uuid REFERENCES media(id) ON DELETE SET NULL;

-- Story rail queries this on every Home load.
CREATE INDEX stories_live_idx ON stories (author_id, expires_at DESC);
