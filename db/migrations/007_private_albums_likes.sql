-- Private album access grants, and like aggregation for the leaderboard.

-- Who may see whose private photos. A row is a grant; deleting it
-- revokes. Kept separate from the photos themselves so revoking access
-- never risks touching the media.
CREATE TABLE album_grants (
  owner_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  viewer_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, viewer_id),
  CHECK (owner_id <> viewer_id)
);
CREATE INDEX album_grants_viewer_idx ON album_grants (viewer_id);

-- The likes leaderboard sums likes across every post a person wrote.
-- Without this index that is a sequential scan of posts per author.
CREATE INDEX posts_author_likes_idx
  ON posts (author_id) INCLUDE (like_count)
  WHERE deleted_at IS NULL;

-- Post deletion currently soft-deletes. Rows that have been soft-deleted
-- for a while carry no value and keep media alive; this index lets a
-- future purge job find them cheaply.
CREATE INDEX posts_deleted_idx ON posts (deleted_at) WHERE deleted_at IS NOT NULL;
