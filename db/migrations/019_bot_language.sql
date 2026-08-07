-- Language chosen in the bot chat.
--
-- The bot asks which language to continue in as the very first thing
-- /start does, which is before any account exists — the account is only
-- created when onboarding is submitted from the Mini App. So the choice
-- cannot live on profiles or telegram_identities; it has to be keyed by
-- the Telegram user id alone.
--
-- Telegram's own `language_code` is a hint, not a choice: it reflects
-- the phone's UI language, which is frequently not the language someone
-- wants to read a dating app in. Once a person picks, that pick wins for
-- everything the bot ever sends them.

CREATE TABLE IF NOT EXISTS bot_preferences (
  telegram_id bigint PRIMARY KEY,
  locale      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
