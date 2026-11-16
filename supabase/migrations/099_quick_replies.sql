-- ============================================================
-- 099_quick_replies.sql — saved replies an agent inserts with "/".
--
-- An agent types "/pricing" in the inbox composer and the saved message
-- is dropped into the box, editable, before it is sent. Every competitor
-- in the 2026-11-12 review has this; until now only Instagram had
-- "saved replies", and only for Instagram.
--
-- ⚠️ BROWSER-WRITTEN UNDER RLS, LIKE media_assets (087).
--   A row is a shortcut and a block of text the workspace chose to share
--   with its own agents. It holds no credential and reaches no customer
--   until an agent presses send, so an API hop would add a round trip
--   and no authorization the policies do not already give.
--
-- ⚠️ THE POLICIES CALL is_account_member(), NOT `profiles p WHERE
--   p.account_id = …`. 095 made membership a table of its own and
--   dropped profiles.account_id; the inline join media_assets still
--   carries in 087 was rewritten by 096 and is not a pattern to copy.
--   Viewers may READ (the composer is read-only for them anyway) but only
--   an agent or above may write — the same line the composer draws.
--
-- ⚠️ THE SHORTCUT IS THE IDENTITY, AND IT IS LOWER-CASE.
--   UNIQUE (account_id, shortcut) means "/pricing" names one reply per
--   workspace. The CHECK pins the shape the composer matches against
--   (a-z, 0-9, "_" and "-", up to 32), so a row written by anything other
--   than our UI cannot contain a space or a slash and become unreachable
--   from the keyboard.
--
-- media_url / media_kind are present and nullable but not yet written by
-- the UI: attaching a library file to a quick reply is the follow-up, and
-- adding the columns now costs nothing where adding them later costs a
-- migration on a live table.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  shortcut TEXT NOT NULL
    CHECK (shortcut ~ '^[a-z0-9_-]{1,32}$'),
  -- 1024 matches MEDIA_CAPTION_MAX in the composer: the same text may
  -- later ride as a media caption, and a reply that cannot be a caption
  -- would be a trap.
  body TEXT NOT NULL
    CHECK (char_length(btrim(body)) BETWEEN 1 AND 1024),
  media_url TEXT,
  media_kind TEXT
    CHECK (media_kind IS NULL OR media_kind IN ('image', 'video', 'audio', 'document')),
  -- Who wrote it. SET NULL: a departed teammate's replies belong to the
  -- workspace, not to their user row.
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Drives the order in the "/" list: what the team reaches for most
  -- comes first. A counter rather than an event log — it feeds one sort
  -- and nothing else, and an agent bumping it is a single UPDATE.
  use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, shortcut)
);

CREATE INDEX IF NOT EXISTS idx_quick_replies_account_used
  ON public.quick_replies (account_id, use_count DESC, shortcut);

COMMENT ON TABLE public.quick_replies IS
  'Workspace saved replies inserted from the inbox composer with "/". Written from the browser under RLS (migration 099).';

ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read their workspace quick replies" ON public.quick_replies;
CREATE POLICY "Members read their workspace quick replies"
  ON public.quick_replies FOR SELECT
  USING (public.is_account_member(account_id));

DROP POLICY IF EXISTS "Agents add quick replies to their workspace" ON public.quick_replies;
CREATE POLICY "Agents add quick replies to their workspace"
  ON public.quick_replies FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS "Agents update their workspace quick replies" ON public.quick_replies;
CREATE POLICY "Agents update their workspace quick replies"
  ON public.quick_replies FOR UPDATE
  USING (public.is_account_member(account_id, 'agent'))
  -- WITH CHECK restates the predicate so an UPDATE cannot move a row into
  -- a workspace the caller is not an agent in by rewriting account_id.
  WITH CHECK (public.is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS "Agents delete their workspace quick replies" ON public.quick_replies;
CREATE POLICY "Agents delete their workspace quick replies"
  ON public.quick_replies FOR DELETE
  USING (public.is_account_member(account_id, 'agent'));

-- Keep updated_at honest without trusting the client to send it.
CREATE OR REPLACE FUNCTION public.quick_replies_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quick_replies_touch ON public.quick_replies;
CREATE TRIGGER trg_quick_replies_touch
  BEFORE UPDATE ON public.quick_replies
  FOR EACH ROW EXECUTE FUNCTION public.quick_replies_touch_updated_at();
