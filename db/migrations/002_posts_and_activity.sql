-- Post visibility, activity tracking, and the indexes discovery needs.

CREATE TYPE post_visibility AS ENUM ('public', 'followers', 'friends', 'private');

ALTER TABLE posts
  ADD COLUMN visibility post_visibility NOT NULL DEFAULT 'public';

CREATE INDEX posts_public_feed_idx
  ON posts (created_at DESC)
  WHERE deleted_at IS NULL AND visibility = 'public';

-- Discovery sorts by recency of activity constantly; accounts.last_seen_at
-- had no index and every browse would have seq-scanned.
CREATE INDEX accounts_active_idx
  ON accounts (last_seen_at DESC)
  WHERE status = 'active';

-- Filter predicates used by advanced search.
CREATE INDEX profiles_birth_date_idx ON profiles (birth_date);
CREATE INDEX profiles_gender_idx     ON profiles (gender) WHERE gender IS NOT NULL;
CREATE INDEX profiles_interests_gin  ON profiles USING gin (interests);
CREATE INDEX profiles_languages_gin  ON profiles USING gin (languages);
CREATE INDEX profiles_looking_gin    ON profiles USING gin (looking_for);

-- Star purchases are matched back by Telegram's payload on the webhook.
ALTER TABLE star_purchases
  ADD COLUMN payload text UNIQUE;
