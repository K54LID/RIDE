-- =====================================================================
-- RIDE — initial schema
-- PostgreSQL 16 + PostGIS 3.4
--
-- Design rules encoded here:
--   1. Telegram identity is isolated in its own table. Nothing that
--      serves public profile data may join to it. Username is never
--      stored at all.
--   2. Location is stored ONLY grid-snapped (~500m). Precise
--      coordinates never touch disk. Prevents trilateration.
--   3. Coins use an append-only ledger as source of truth. Balance is
--      a materialized cache, never written to directly.
--   4. No health data. No HIV status field. Deliberate omission.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------

CREATE TYPE account_status     AS ENUM ('active','suspended','banned','deleted');
CREATE TYPE account_role       AS ENUM ('user','moderator','admin');
CREATE TYPE verification_state AS ENUM ('none','pending','approved','rejected');
CREATE TYPE media_kind         AS ENUM ('image','video');
CREATE TYPE post_kind          AS ENUM ('media','text','checkin');
CREATE TYPE message_kind       AS ENUM ('text','image','video','voice','gif','sticker','location','system');
CREATE TYPE gift_rarity        AS ENUM ('common','rare','premium','limited','unique');
CREATE TYPE ledger_reason      AS ENUM (
  'stars_purchase','daily_login','referral_bonus','achievement','leaderboard_reward',
  'admin_credit','gift_sent','gift_received','court_spend','featured_slot',
  'profile_boost','vip_purchase','refund'
);
CREATE TYPE report_state       AS ENUM ('open','reviewing','actioned','dismissed');

-- ---------------------------------------------------------------------
-- IDENTITY  (restricted — no public-facing query may touch this table)
-- ---------------------------------------------------------------------

CREATE TABLE accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status          account_status NOT NULL DEFAULT 'active',
  role            account_role   NOT NULL DEFAULT 'user',
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

-- Telegram linkage. Deliberately separate so that ORM-level mistakes
-- cannot leak telegram_id into a profile serializer.
-- We store telegram_id (required for auth + Stars invoicing) but NOT
-- username, first_name, last_name, or photo_url.
CREATE TABLE telegram_identities (
  account_id      uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  telegram_id     bigint NOT NULL UNIQUE,
  language_code   text,
  is_premium      boolean NOT NULL DEFAULT false,
  linked_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- PROFILE
-- ---------------------------------------------------------------------

CREATE TABLE profiles (
  account_id          uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  handle              citext,                    -- in-app handle, unrelated to Telegram
  display_name        text NOT NULL,
  bio                 text,
  birth_date          date NOT NULL,
  age_gate_passed_at  timestamptz,               -- explicit 18+ confirmation
  gender              text,
  pronouns            text,
  orientation         text,
  looking_for         text[],
  relationship_status text,
  height_cm           smallint CHECK (height_cm BETWEEN 100 AND 250),
  weight_kg           smallint CHECK (weight_kg BETWEEN 30 AND 300),
  body_type           text,
  tribes              text[],
  interests           text[],
  languages           text[],

  verification        verification_state NOT NULL DEFAULT 'none',
  verified_at         timestamptz,

  court_value         bigint NOT NULL DEFAULT 1,
  vip_until           timestamptz,
  ghost_mode          boolean NOT NULL DEFAULT false,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX profiles_handle_key ON profiles (lower(handle)) WHERE handle IS NOT NULL;
CREATE INDEX profiles_court_value_idx  ON profiles (court_value DESC);
CREATE INDEX profiles_display_name_trgm ON profiles USING gin (display_name gin_trgm_ops);

-- Hard guarantee: nobody under 18.
ALTER TABLE profiles ADD CONSTRAINT profiles_min_age
  CHECK (birth_date <= (CURRENT_DATE - INTERVAL '18 years'));

CREATE TABLE profile_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  storage_key  text NOT NULL,
  position     smallint NOT NULL DEFAULT 0,
  is_private   boolean NOT NULL DEFAULT false,   -- private album
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX profile_photos_account_idx ON profile_photos (account_id, is_private, position);

-- Selfie verification queue. Selfies are write-once, admin-read-only,
-- and purged on decision.
CREATE TABLE verification_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  storage_key   text NOT NULL,
  state         verification_state NOT NULL DEFAULT 'pending',
  reviewed_by   uuid REFERENCES accounts(id),
  reviewed_at   timestamptz,
  reject_reason text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_requests_pending_idx ON verification_requests (created_at)
  WHERE state = 'pending';

-- ---------------------------------------------------------------------
-- LOCATION  —  grid-snapped only
-- ---------------------------------------------------------------------
-- The API layer snaps to a ~500m grid BEFORE insert. Precise lat/lng is
-- never persisted. Distances are returned to clients as buckets, never
-- as exact metres, or trilateration reconstructs the raw point.

CREATE TABLE user_locations (
  account_id   uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  cell         geography(Point, 4326) NOT NULL,
  country_code char(2),
  travel_mode  boolean NOT NULL DEFAULT false,   -- VIP: manually set cell
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_locations_cell_idx ON user_locations USING gist (cell);

-- ---------------------------------------------------------------------
-- SOCIAL GRAPH
-- ---------------------------------------------------------------------

CREATE TABLE follows (
  follower_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  followee_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX follows_followee_idx ON follows (followee_id, created_at DESC);

CREATE TABLE friendships (
  requester_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  accepted_at  timestamptz,
  is_favorite  boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);
CREATE INDEX friendships_addressee_idx ON friendships (addressee_id) WHERE accepted_at IS NULL;

CREATE TABLE blocks (
  blocker_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  blocked_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE INDEX blocks_blocked_idx ON blocks (blocked_id);

-- ---------------------------------------------------------------------
-- WOOFS  (profile-level, distinct from post likes)
-- ---------------------------------------------------------------------

CREATE TABLE woofs (
  id          bigserial PRIMARY KEY,
  sender_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  target_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_id <> target_id)
);
-- One woof per pair per day; rate limiting lives in Redis on top of this.
CREATE UNIQUE INDEX woofs_daily_unique
  ON woofs (sender_id, target_id, (created_at::date));
CREATE INDEX woofs_target_idx ON woofs (target_id, created_at DESC);

-- ---------------------------------------------------------------------
-- FEED
-- ---------------------------------------------------------------------

CREATE TABLE posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id     uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind          post_kind NOT NULL DEFAULT 'media',
  body          text,
  place_name    text,
  place_cell    geography(Point, 4326),          -- also grid-snapped
  is_pinned     boolean NOT NULL DEFAULT false,
  like_count    integer NOT NULL DEFAULT 0,
  comment_count integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX posts_author_idx ON posts (author_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX posts_feed_idx   ON posts (created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE post_media (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  kind        media_kind NOT NULL,
  storage_key text NOT NULL,
  width       integer,
  height      integer,
  duration_ms integer,
  position    smallint NOT NULL DEFAULT 0
);
CREATE INDEX post_media_post_idx ON post_media (post_id, position);

CREATE TABLE post_likes (
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, account_id)
);

CREATE TABLE comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  parent_id  uuid REFERENCES comments(id) ON DELETE CASCADE,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX comments_post_idx ON comments (post_id, created_at) WHERE deleted_at IS NULL;

CREATE TABLE stories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind        media_kind NOT NULL,
  storage_key text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now() + INTERVAL '24 hours'
);
CREATE INDEX stories_active_idx ON stories (author_id, created_at DESC);
CREATE INDEX stories_expiry_idx ON stories (expires_at);

CREATE TABLE story_views (
  story_id   uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  viewed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_id)
);

-- ---------------------------------------------------------------------
-- MESSAGING
-- ---------------------------------------------------------------------

CREATE TABLE conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversation_members (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  last_read_at    timestamptz,
  is_pinned       boolean NOT NULL DEFAULT false,
  is_archived     boolean NOT NULL DEFAULT false,
  PRIMARY KEY (conversation_id, account_id)
);
CREATE INDEX conversation_members_account_idx ON conversation_members (account_id);

-- Enforces exactly one 1:1 conversation per unordered pair.
CREATE TABLE direct_conversation_keys (
  conversation_id uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  low_id          uuid NOT NULL,
  high_id         uuid NOT NULL,
  UNIQUE (low_id, high_id),
  CHECK (low_id < high_id)
);

CREATE TABLE messages (
  id              bigserial PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind            message_kind NOT NULL DEFAULT 'text',
  body            text,
  storage_key     text,
  duration_ms     integer,
  reply_to_id     bigint REFERENCES messages(id) ON DELETE SET NULL,
  edited_at       timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON messages (conversation_id, id DESC);

CREATE TABLE message_reactions (
  message_id bigint NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  account_id uuid   NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  emoji      text   NOT NULL,
  PRIMARY KEY (message_id, account_id)
);

-- ---------------------------------------------------------------------
-- COIN ECONOMY  —  append-only ledger
-- ---------------------------------------------------------------------

CREATE TABLE coin_ledger (
  id             bigserial PRIMARY KEY,
  account_id     uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  delta          bigint NOT NULL CHECK (delta <> 0),
  reason         ledger_reason NOT NULL,
  ref_type       text,
  ref_id         text,
  idempotency_key text UNIQUE,                   -- guards double-credit on retries
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coin_ledger_account_idx ON coin_ledger (account_id, id DESC);

-- Cache only. Rebuildable via SUM(delta) over the ledger.
CREATE TABLE coin_balances (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  balance    bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE star_purchases (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  telegram_charge_id    text UNIQUE NOT NULL,
  stars_amount          integer NOT NULL,
  coins_granted         bigint NOT NULL,
  refunded_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- GIFTS
-- ---------------------------------------------------------------------

CREATE TABLE gift_catalog (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text UNIQUE NOT NULL,
  name          text NOT NULL,
  category      text NOT NULL,
  rarity        gift_rarity NOT NULL DEFAULT 'common',
  coin_cost     bigint NOT NULL CHECK (coin_cost > 0),
  asset_key     text NOT NULL,                   -- Lottie/animation asset
  available_from timestamptz,
  available_to   timestamptz,                    -- limited-edition window
  total_supply   integer,                        -- NULL = unlimited
  is_active      boolean NOT NULL DEFAULT true
);

CREATE TABLE gift_transfers (
  id          bigserial PRIMARY KEY,
  gift_id     uuid NOT NULL REFERENCES gift_catalog(id),
  sender_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  coin_cost   bigint NOT NULL,
  message     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_id <> receiver_id)
);
CREATE INDEX gift_transfers_receiver_idx ON gift_transfers (receiver_id, created_at DESC);

-- Drives the profile showcase with the count badge.
CREATE TABLE gift_collections (
  account_id uuid   NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  gift_id    uuid   NOT NULL REFERENCES gift_catalog(id),
  quantity   integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  first_at   timestamptz NOT NULL DEFAULT now(),
  last_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, gift_id)
);

-- ---------------------------------------------------------------------
-- COURTING
-- ---------------------------------------------------------------------
-- Note: the 1/2/4/8...128 doubling curve caps out after 7 purchases.
-- Storing cost per event rather than deriving it means the curve can be
-- rebalanced later without a migration.

CREATE TABLE court_events (
  id            bigserial PRIMARY KEY,
  courter_id    uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  target_id     uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  coin_cost     bigint NOT NULL,
  value_before  bigint NOT NULL,
  value_after   bigint NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (courter_id <> target_id)
);
CREATE INDEX court_events_target_idx ON court_events (target_id, created_at DESC);

-- ---------------------------------------------------------------------
-- FEATURED SLOTS
-- ---------------------------------------------------------------------
-- Five rows, fixed. Purchase = shift everyone down, insert at position 1.
-- expires_at guarantees a paying user gets a minimum guaranteed window
-- even under heavy contention.

CREATE TABLE featured_slots (
  position    smallint PRIMARY KEY CHECK (position BETWEEN 1 AND 5),
  account_id  uuid REFERENCES accounts(id) ON DELETE SET NULL,
  purchased_at timestamptz,
  expires_at   timestamptz
);
INSERT INTO featured_slots (position) VALUES (1),(2),(3),(4),(5);

-- ---------------------------------------------------------------------
-- ACHIEVEMENTS / REFERRALS / LEADERBOARDS
-- ---------------------------------------------------------------------

CREATE TABLE achievements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text UNIQUE NOT NULL,
  family       text NOT NULL,                    -- e.g. 'woofs_received'
  tier         smallint NOT NULL DEFAULT 1,
  threshold    bigint NOT NULL,
  name         text NOT NULL,
  description  text,
  badge_key    text,
  coin_reward  bigint NOT NULL DEFAULT 0,
  UNIQUE (family, tier)
);

CREATE TABLE user_achievements (
  account_id     uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, achievement_id)
);

CREATE TABLE referrals (
  invitee_id  uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  inviter_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  rewarded_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (invitee_id <> inviter_id)
);
CREATE INDEX referrals_inviter_idx ON referrals (inviter_id);

CREATE TABLE login_streaks (
  account_id     uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  last_claim_on  date
);

-- Live leaderboards run in Redis (ZSET). This table is the immutable
-- record of closed periods, used for reward payout and frame grants.
CREATE TABLE leaderboard_snapshots (
  id           bigserial PRIMARY KEY,
  board        text NOT NULL,                    -- 'most_woofed','court_value',...
  period       text NOT NULL,                    -- 'daily','weekly','monthly'
  period_start date NOT NULL,
  period_end   date NOT NULL,
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  rank         integer NOT NULL,
  score        bigint NOT NULL,
  reward_coins bigint NOT NULL DEFAULT 0,
  paid_at      timestamptz,
  UNIQUE (board, period, period_start, account_id)
);
CREATE INDEX leaderboard_snapshots_lookup_idx
  ON leaderboard_snapshots (board, period, period_start, rank);

-- ---------------------------------------------------------------------
-- MODERATION
-- ---------------------------------------------------------------------

CREATE TABLE reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  subject_type text NOT NULL,                    -- 'account','post','comment','message'
  subject_id   text NOT NULL,
  reason       text NOT NULL,
  details      text,
  state        report_state NOT NULL DEFAULT 'open',
  handled_by   uuid REFERENCES accounts(id),
  handled_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_open_idx ON reports (created_at) WHERE state = 'open';

CREATE TABLE moderation_actions (
  id          bigserial PRIMARY KEY,
  actor_id    uuid NOT NULL REFERENCES accounts(id),
  target_id   uuid REFERENCES accounts(id) ON DELETE SET NULL,
  action      text NOT NULL,
  reason      text,
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_actions_target_idx ON moderation_actions (target_id, created_at DESC);

-- Granular moderator permissions, so admins can revoke individual
-- capabilities rather than the whole role.
CREATE TABLE moderator_permissions (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  permission text NOT NULL,                      -- 'ban','delete_content','approve_verification',...
  granted_by uuid REFERENCES accounts(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, permission)
);

-- ---------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------

CREATE TABLE notifications (
  id         bigserial PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  actor_id   uuid REFERENCES accounts(id) ON DELETE CASCADE,
  payload    jsonb NOT NULL DEFAULT '{}',
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_unread_idx
  ON notifications (account_id, id DESC) WHERE read_at IS NULL;
