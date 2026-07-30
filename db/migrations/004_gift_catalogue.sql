-- Gift catalogue, featured slots seed, and notification support.
--
-- Gifts are data, so new ones (and limited-time drops) ship without a
-- deploy. `asset_key` names an emoji glyph for now; swapping in Lottie
-- files later is a column update, not a schema change.

INSERT INTO gift_catalog (slug, name, category, rarity, coin_cost, asset_key) VALUES
  -- Friendship
  ('coffee',    'Coffee',      'friendship', 'common',  5,    '☕'),
  ('tea',       'Tea',         'friendship', 'common',  5,    '🍵'),
  ('flower',    'Flower',      'friendship', 'common',  8,    '🌸'),
  ('cake',      'Cake',        'friendship', 'common',  12,   '🍰'),
  ('beer',      'Beer',        'friendship', 'common',  15,   '🍺'),
  ('pizza',     'Pizza',       'friendship', 'common',  18,   '🍕'),
  -- Romantic
  ('rose',      'Red rose',    'romantic',   'common',  20,   '🌹'),
  ('heart',     'Heart',       'romantic',   'common',  25,   '❤️'),
  ('wine',      'Wine',        'romantic',   'rare',    40,   '🍷'),
  ('chocolate', 'Chocolates',  'romantic',   'rare',    45,   '🍫'),
  ('kiss',      'Kiss',        'romantic',   'rare',    60,   '💋'),
  ('bouquet',   'Bouquet',     'romantic',   'rare',    90,   '💐'),
  -- Luxury
  ('perfume',   'Perfume',     'luxury',     'rare',    120,  '🧴'),
  ('watch',     'Watch',       'luxury',     'rare',    200,  '⌚'),
  ('ring',      'Ring',        'luxury',     'premium', 350,  '💍'),
  ('diamond',   'Diamond',     'luxury',     'premium', 500,  '💎'),
  ('crown',     'Crown',       'luxury',     'premium', 750,  '👑'),
  ('money',     'Cash stack',  'luxury',     'premium', 900,  '💰'),
  -- Premium
  ('car',       'Sports car',  'premium',    'premium', 1500, '🏎️'),
  ('yacht',     'Yacht',       'premium',    'premium', 2500, '🛥️'),
  ('jet',       'Private jet', 'premium',    'premium', 4000, '✈️'),
  ('castle',    'Castle',      'premium',    'premium', 6000, '🏰'),
  -- Unique — the top of the shop
  ('dragon',    'Dragon',      'unique',     'unique',  10000, '🐉'),
  ('galaxy',    'Galaxy',      'unique',     'unique',  15000, '🌌'),
  ('phoenix',   'Phoenix',     'unique',     'unique',  25000, '🔥');

-- Limited drops: a window, a supply, and nothing else special about them.
INSERT INTO gift_catalog (slug, name, category, rarity, coin_cost, asset_key,
                          available_from, available_to, total_supply) VALUES
  ('pride_flag', 'Pride flag', 'limited', 'limited', 300, '🏳️‍🌈',
   now(), now() + interval '90 days', 5000),
  ('teddy',      'Teddy bear', 'limited', 'limited', 150, '🧸',
   now(), now() + interval '90 days', 10000);

-- Featured slots were seeded empty in 001; make sure all five exist even
-- if that insert was skipped on an older database.
INSERT INTO featured_slots (position) VALUES (1),(2),(3),(4),(5)
  ON CONFLICT (position) DO NOTHING;

-- Notification read tracking needs an index for the unread badge.
CREATE INDEX IF NOT EXISTS notifications_account_created_idx
  ON notifications (account_id, created_at DESC);

-- Referral codes: short, shareable, one per account.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_idx
  ON profiles (referral_code) WHERE referral_code IS NOT NULL;

-- Courting needs an index for "who courted me" on the profile.
CREATE INDEX IF NOT EXISTS court_events_courter_idx
  ON court_events (courter_id, created_at DESC);
