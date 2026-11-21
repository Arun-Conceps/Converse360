-- ============================================================
-- 104_media_folders.sql — folders for the media library.
--
-- ⚠️ FOLDERS ARE AN INDEX CONCEPT, NOT A STORAGE ONE.
--   The object's `path` in the bucket does not change when a file is
--   filed into a folder, moved between folders, or its folder is
--   deleted. Every URL already handed to Meta, a flow node or a template
--   keeps working, and "move" is one UPDATE rather than a copy+delete
--   that could half-fail (see 087). The bucket stays flat under
--   `account-<id>/`, which is also the only shape its RLS accepts.
--
-- ⚠️ FLAT ON PURPOSE (one level). Nesting needs cycle checks, a path
--   column and a tree UI for a library that rarely holds more than a few
--   hundred files; a single level answers "put the Diwali creatives
--   somewhere".
--
-- ⚠️ DELETING A FOLDER DOES NOT DELETE ITS FILES. folder_id is
--   ON DELETE SET NULL, so they fall back to "All files". Flows and
--   templates may still be using them.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.media_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive: "Offers" and "offers" are the same folder to a person.
CREATE UNIQUE INDEX IF NOT EXISTS uq_media_folders_account_name
  ON public.media_folders (account_id, lower(btrim(name)));

ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS folder_id UUID
  REFERENCES public.media_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_media_assets_account_folder
  ON public.media_assets (account_id, folder_id);

-- ⚠️ A FILE MAY ONLY BE FILED IN ITS OWN WORKSPACE'S FOLDER. RLS on
--   media_assets checks the row's account_id, not what folder_id points
--   at, and ids are guessable by anyone who has seen one. A trigger
--   keeps that check in one place for every writer (browser included).
CREATE OR REPLACE FUNCTION public.media_asset_folder_same_account()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.folder_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.media_folders f
    WHERE f.id = NEW.folder_id AND f.account_id = NEW.account_id
  ) THEN
    RAISE EXCEPTION 'Folder does not belong to this workspace'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_media_asset_folder_same_account ON public.media_assets;
CREATE TRIGGER trg_media_asset_folder_same_account
  BEFORE INSERT OR UPDATE OF folder_id, account_id ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION public.media_asset_folder_same_account();

-- RLS: browser-written like media_assets; membership-based (095).
ALTER TABLE public.media_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read their folders" ON public.media_folders;
CREATE POLICY "Members read their folders"
  ON public.media_folders FOR SELECT
  USING (public.is_account_member(account_id));

DROP POLICY IF EXISTS "Agents create folders" ON public.media_folders;
CREATE POLICY "Agents create folders"
  ON public.media_folders FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS "Agents rename folders" ON public.media_folders;
CREATE POLICY "Agents rename folders"
  ON public.media_folders FOR UPDATE
  USING (public.is_account_member(account_id, 'agent'))
  WITH CHECK (public.is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS "Agents delete folders" ON public.media_folders;
CREATE POLICY "Agents delete folders"
  ON public.media_folders FOR DELETE
  USING (public.is_account_member(account_id, 'agent'));
