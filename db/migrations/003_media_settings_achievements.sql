-- Media records, per-user settings, and the achievement catalogue.

-- ---------------------------------------------------------------------
-- MEDIA
-- ---------------------------------------------------------------------
-- Files live in Telegram's own storage; we keep the file_id and stream
-- bytes back through an authenticated proxy. `storage` names the backend
-- so a later move to S3/R2 is a new value, not a schema change.

CREATE TYPE media_storage AS ENUM ('telegram', 's3');

CREATE TABLE media (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind        media_kind NOT NULL,
  storage     media_storage NOT NULL DEFAULT 'telegram',
  file_ref    text NOT NULL,              -- telegram file_id, or S3 key
  thumb_ref   text,
  width       integer,
  height      integer,
  duration_ms integer,
  bytes       integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_owner_idx ON media (owner_id, created_at DESC);

-- Link tables move to real media references.
ALTER TABLE post_media     ADD COLUMN media_id uuid REFERENCES media(id) ON DELETE CASCADE;
ALTER TABLE profile_photos ADD COLUMN media_id uuid REFERENCES media(id) ON DELETE CASCADE;
ALTER TABLE stories        ADD COLUMN media_id uuid REFERENCES media(id) ON DELETE CASCADE;

-- storage_key was the old placeholder; nothing wrote to it.
ALTER TABLE post_media     ALTER COLUMN storage_key DROP NOT NULL;
ALTER TABLE profile_photos ALTER COLUMN storage_key DROP NOT NULL;
ALTER TABLE stories        ALTER COLUMN storage_key DROP NOT NULL;

-- Exactly one primary photo per profile.
CREATE UNIQUE INDEX profile_photos_primary_idx
  ON profile_photos (account_id) WHERE position = 0 AND NOT is_private;

-- ---------------------------------------------------------------------
-- SETTINGS
-- ---------------------------------------------------------------------
-- Scalars get columns (queried in filters); notification toggles are a
-- jsonb blob because they are only ever read as a whole set.

CREATE TYPE visibility_level AS ENUM ('everyone', 'members', 'friends', 'nobody');

CREATE TABLE user_settings (
  account_id         uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  locale             text,
  profile_visibility visibility_level NOT NULL DEFAULT 'everyone',
  story_visibility   visibility_level NOT NULL DEFAULT 'everyone',
  show_online        boolean NOT NULL DEFAULT true,
  show_last_seen     boolean NOT NULL DEFAULT true,
  notifications      jsonb NOT NULL DEFAULT
    '{"all":true,"chats":true,"stories":true,"woofs":true,"comments":true,"gifts":true}'::jsonb,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- ACHIEVEMENTS
-- ---------------------------------------------------------------------
-- The catalogue is data, not code, so new achievements ship without a
-- deploy. `family` maps to a counter the engine knows how to read.

INSERT INTO achievements (slug, family, tier, threshold, name, description, coin_reward) VALUES
  ('first_login',      'login_days',       1, 1,    'Welcome aboard',   'Open RIDE for the first time',      10),
  ('streak_7',         'login_days',       2, 7,    'Regular',          'Seven days of showing up',          30),
  ('streak_30',        'login_days',       3, 30,   'Devoted',          'Thirty days of showing up',        100),
  ('first_post',       'posts_created',    1, 1,    'First words',      'Publish your first post',           10),
  ('posts_10',         'posts_created',    2, 10,   'Getting loud',     'Publish ten posts',                 25),
  ('posts_100',        'posts_created',    3, 100,  'Never quiet',      'Publish a hundred posts',          150),
  ('first_story',      'stories_created',  1, 1,    'Caught a moment',  'Post your first story',             10),
  ('stories_25',       'stories_created',  2, 25,   'Always on',        'Post twenty-five stories',          60),
  ('woofs_10',         'woofs_received',   1, 10,   'Noticed',          'Receive ten woofs',                 15),
  ('woofs_50',         'woofs_received',   2, 50,   'Wanted',           'Receive fifty woofs',               40),
  ('woofs_100',        'woofs_received',   3, 100,  'Magnetic',         'Receive a hundred woofs',           80),
  ('woofs_500',        'woofs_received',   4, 500,  'Irresistible',     'Receive five hundred woofs',       200),
  ('woofs_1000',       'woofs_received',   5, 1000, 'Legend',           'Receive a thousand woofs',         500),
  ('gifts_10',         'gifts_received',   1, 10,   'Spoiled',          'Receive ten gifts',                 15),
  ('gifts_50',         'gifts_received',   2, 50,   'Adored',           'Receive fifty gifts',               40),
  ('gifts_100',        'gifts_received',   3, 100,  'Treasured',        'Receive a hundred gifts',           80),
  ('followers_10',     'followers',        1, 10,   'Company',          'Reach ten followers',               15),
  ('followers_100',    'followers',        2, 100,  'A crowd',          'Reach a hundred followers',         60),
  ('followers_1000',   'followers',        3, 1000, 'Popular',          'Reach a thousand followers',       250),
  ('friends_5',        'friends',          1, 5,    'Circle',           'Make five friends',                 15),
  ('friends_25',       'friends',          2, 25,   'Community helper', 'Make twenty-five friends',          60),
  ('court_8',          'court_value',      1, 8,    'Courted',          'Reach court value 8',               20),
  ('court_64',         'court_value',      2, 64,   'Sought after',     'Reach court value 64',              80),
  ('court_512',        'court_value',      3, 512,  'Priceless',        'Reach court value 512',            300),
  ('verified',         'verified',         1, 1,    'Verified',         'Get your photo verified',           50),
  ('referrals_1',      'referrals',        1, 1,    'Recruiter',        'Invite your first friend',          30),
  ('referrals_10',     'referrals',        2, 10,   'Ambassador',       'Invite ten friends',               150),
  ('explorer',         'discover_views',   1, 50,   'Explorer',         'Browse fifty profiles',             20),
  ('traveler',         'countries_seen',   1, 3,    'Traveler',         'Be active in three countries',      75);

-- ---------------------------------------------------------------------
-- MODERATION SUPPORT
-- ---------------------------------------------------------------------
ALTER TABLE accounts ADD COLUMN suspended_until timestamptz;
ALTER TABLE accounts ADD COLUMN suspension_reason text;

CREATE INDEX accounts_role_idx ON accounts (role) WHERE role <> 'user';
