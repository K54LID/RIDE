-- Erase soft-deleted accounts, but keep what belongs to other people.
--
-- Account deletion used to flip `status` to 'deleted' and overwrite the
-- display name, leaving the profile, photos, posts, comments, messages
-- and media in place. Those rows are still here and still list in the
-- admin panel — exactly what someone who pressed "Delete account" was
-- told would not happen. Deletion is a hard delete now; this clears the
-- backlog.
--
-- What must survive: gifts sent and courts paid. Those are the
-- recipient's history. Someone who was gifted keeps the gift; someone
-- who was courted keeps the standing they were given. But both tables
-- reference the sender with ON DELETE CASCADE and a NOT NULL column, so
-- deleting the sender would delete the recipient's record of it.
--
-- So the columns become nullable and the constraints become SET NULL.
-- The transfer survives with an anonymous sender, which is the correct
-- reading of both requirements at once: the person is erased, the thing
-- they gave someone else is not.

ALTER TABLE gift_transfers ALTER COLUMN sender_id DROP NOT NULL;
ALTER TABLE gift_transfers DROP CONSTRAINT IF EXISTS gift_transfers_sender_id_fkey;
ALTER TABLE gift_transfers
  ADD CONSTRAINT gift_transfers_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES accounts(id) ON DELETE SET NULL;

ALTER TABLE court_events ALTER COLUMN courter_id DROP NOT NULL;
ALTER TABLE court_events DROP CONSTRAINT IF EXISTS court_events_courter_id_fkey;
ALTER TABLE court_events
  ADD CONSTRAINT court_events_courter_id_fkey
  FOREIGN KEY (courter_id) REFERENCES accounts(id) ON DELETE SET NULL;

-- The CHECK forbids courter = target. A NULL courter satisfies it
-- vacuously in SQL three-valued logic, so it needs no change — but say
-- so, because a future reader will wonder.

-- Now the purge. Four tables hold NO ACTION references and would abort
-- the delete on a constraint, so they go first.
DO $$
DECLARE
  dead uuid[];
BEGIN
  SELECT array_agg(id) INTO dead FROM accounts WHERE status = 'deleted';
  IF dead IS NULL THEN RETURN; END IF;

  DELETE FROM moderation_actions    WHERE actor_id = ANY(dead) OR target_id = ANY(dead);
  DELETE FROM moderator_permissions WHERE account_id = ANY(dead) OR granted_by = ANY(dead);
  DELETE FROM verification_requests WHERE account_id = ANY(dead) OR reviewed_by = ANY(dead);
  DELETE FROM reports               WHERE reporter_id = ANY(dead) OR handled_by = ANY(dead);
  DELETE FROM reports               WHERE subject_type = 'account'
                                      AND subject_id = ANY(SELECT unnest(dead)::text);

  -- Gifts and courts they *received* go with them; what they *sent*
  -- stays, with the sender nulled by the constraints above.
  DELETE FROM gift_transfers WHERE receiver_id = ANY(dead);
  DELETE FROM court_events   WHERE target_id   = ANY(dead);

  -- Everything else cascades from accounts.
  DELETE FROM accounts WHERE id = ANY(dead);
END $$;
