-- Contact support / report a bug.
--
-- Previously both buttons opened https://t.me/ — a link to nothing.
-- Messages now land in a table the admin panel reads, and are pushed to
-- every staff account through the same notification outbox everything
-- else uses.
--
-- Separate from `reports`: a report is about a subject (a post, an
-- account) and carries moderation semantics. This is a person writing a
-- sentence to whoever runs the app.
CREATE TABLE IF NOT EXISTS support_messages (
  id         bigserial PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('support', 'bug')),
  body       text NOT NULL CHECK (length(btrim(body)) > 0),
  state      text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'handled')),
  handled_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The panel only ever lists open messages, newest first.
CREATE INDEX IF NOT EXISTS support_messages_open_idx
  ON support_messages (created_at DESC) WHERE state = 'open';

-- Courting now pays the courted person half of what it cost.
--
-- The ledger reason is an enum, so the value has to exist before the
-- first payout is written. ADD VALUE is allowed inside a transaction on
-- PG12+ as long as the value is not *used* in that same transaction —
-- nothing here uses it, the first use is at runtime.
ALTER TYPE ledger_reason ADD VALUE IF NOT EXISTS 'court_payout';
