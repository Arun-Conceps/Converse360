-- ============================================================
-- 100_note_mentions.sql — private notes in the thread, with @mentions.
--
-- `contact_notes` already holds a team's private notes about a contact
-- (the inbox sidebar reads and writes it). This lets an agent write one
-- from the conversation itself, tag a teammate with @name, and have that
-- teammate told. Nothing here is ever sent to the customer: notes never
-- touch `messages`, which is the table every send path writes.
--
-- ⚠️ NOTES STAY CONTACT-LEVEL, NOT CONVERSATION-LEVEL.
--   A note about a customer belongs to the customer: the next agent who
--   opens a LATER conversation with the same person should still see
--   "prefers calls after 6pm". `conversation_id` is therefore only a record
--   of WHERE it was written, so a mention can link back to that thread. It
--   is nullable and SET NULL on delete, and notes are fetched by
--   contact_id, never by it.
--
-- ⚠️ THE NOTIFICATION IS WRITTEN BY A TRIGGER, NOT BY THE BROWSER.
--   `notifications` has no INSERT policy for `authenticated` (027), and it
--   should not get one: a client that can write notifications can send
--   anyone in any workspace a "your account is locked" alert. So the
--   browser writes the NOTE, including who it mentions, and a SECURITY
--   DEFINER trigger decides who is actually notified. The trigger is where
--   the checks live, because it is the only place that is not
--   attacker-controlled:
--     - a mentioned user is notified only if they are a MEMBER of the
--       note's own workspace (a forged id for somebody in another
--       workspace is dropped, not delivered);
--     - the author is never notified about their own note;
--     - the link target `conversation_id` is used only if that
--       conversation belongs to the same workspace.
-- ============================================================

ALTER TABLE public.contact_notes
  ADD COLUMN IF NOT EXISTS mentioned_user_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS conversation_id UUID
    REFERENCES public.conversations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.contact_notes.mentioned_user_ids IS
  'Teammates tagged with @name in the note text. Untrusted input: the notify trigger re-checks workspace membership (migration 100).';
COMMENT ON COLUMN public.contact_notes.conversation_id IS
  'Where the note was written, so a mention can link back to the thread. Notes belong to the contact; never filter by this.';

-- "Notes that mention me" is the one lookup this column exists for.
CREATE INDEX IF NOT EXISTS idx_contact_notes_mentions
  ON public.contact_notes USING GIN (mentioned_user_ids)
  WHERE mentioned_user_ids <> '{}';

-- ------------------------------------------------------------
-- A new notification type. 091 left the list at two; the frontend's
-- NotificationType is extended to match in the same change.
-- ------------------------------------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('conversation_assigned', 'automation', 'note_mention'));

-- ------------------------------------------------------------
-- The trigger.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_note_mentions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author TEXT;
  v_conversation UUID;
BEGIN
  IF NEW.mentioned_user_ids IS NULL OR cardinality(NEW.mentioned_user_ids) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(btrim(p.full_name), ''), p.email, 'A teammate')
    INTO v_author
    FROM profiles p
   WHERE p.user_id = NEW.user_id;

  -- Only link to a conversation in the SAME workspace.
  SELECT c.id
    INTO v_conversation
    FROM conversations c
   WHERE c.id = NEW.conversation_id
     AND c.account_id = NEW.account_id;

  INSERT INTO notifications
    (account_id, user_id, type, conversation_id, contact_id, actor_user_id, title, body)
  SELECT
    NEW.account_id,
    m.user_id,
    'note_mention',
    v_conversation,
    NEW.contact_id,
    NEW.user_id,
    COALESCE(v_author, 'A teammate') || ' mentioned you in a note',
    left(NEW.note_text, 140)
  FROM (SELECT DISTINCT unnest(NEW.mentioned_user_ids) AS user_id) mentioned
  JOIN account_members m
    ON m.user_id = mentioned.user_id
   AND m.account_id = NEW.account_id
  WHERE m.user_id <> NEW.user_id;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.notify_note_mentions() OWNER TO postgres;
-- A trigger function is never called directly; do not leave it callable.
REVOKE ALL ON FUNCTION public.notify_note_mentions() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_notify_note_mentions ON public.contact_notes;
CREATE TRIGGER trg_notify_note_mentions
  AFTER INSERT ON public.contact_notes
  FOR EACH ROW
  WHEN (cardinality(NEW.mentioned_user_ids) > 0)
  EXECUTE FUNCTION public.notify_note_mentions();

-- ------------------------------------------------------------
-- Realtime, so a note one agent writes appears in a teammate's open
-- thread without a refresh. Realtime applies the table's SELECT policy
-- (017: is_account_member), so it delivers only to members.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'contact_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_notes;
  END IF;
END $$;
