-- Stories interactions, chat reactions, saved posts, media links.

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

-- One reaction per person per message; sending another replaces it.
CREATE TABLE message_reactions (
  message_id bigint NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  emoji      text NOT NULL CHECK (char_length(emoji) <= 8),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, account_id)
);

-- Messages carry media the same way posts do.
ALTER TABLE messages ADD COLUMN media_id uuid REFERENCES media(id) ON DELETE SET NULL;

-- The queries the chat and story screens run constantly.
CREATE INDEX messages_conversation_idx ON messages (conversation_id, id DESC);
CREATE INDEX conversation_members_account_idx ON conversation_members (account_id);
CREATE INDEX stories_live_idx ON stories (author_id, expires_at DESC);
