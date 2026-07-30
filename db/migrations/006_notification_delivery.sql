-- Outbound Telegram delivery tracking.
--
-- Notifications are written inside the transaction that caused them, so
-- they cannot exist for an action that rolled back. Delivery is a
-- separate concern: a background worker picks up unpushed rows and
-- sends them. That means a Telegram outage delays messages instead of
-- failing the woof/gift/court that triggered them, and a rolled-back
-- transaction never produces a stray push.

ALTER TABLE notifications ADD COLUMN pushed_at timestamptz;

-- The worker's hot query: undelivered, newest first.
CREATE INDEX notifications_pending_push_idx
  ON notifications (created_at)
  WHERE pushed_at IS NULL;

-- Admins are notified of verification requests; find them fast.
CREATE INDEX accounts_staff_idx ON accounts (id) WHERE role IN ('admin', 'moderator');
