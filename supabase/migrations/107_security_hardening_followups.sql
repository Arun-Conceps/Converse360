-- ============================================================
-- 107 -- Security audit follow-ups (callable-by-anyone RPCs, merge data
--        loss, public storage listing, profile column guard, admin
--        demotion, filter_contacts limit)
--
-- Standalone: nothing in apps/api or apps/web depends on this file, so it
-- can be applied at any time after 106. Idempotent: safe to re-run.
--
--   1. SECURITY DEFINER functions reachable by anon/authenticated.
--   2. merge_contacts_into() lost opt-out, pin and static segment rows.
--   3. Blanket public SELECT policies on storage.objects (listing).
--   4. profiles_update has no column restriction.
--   5. set_member_role() let an admin demote another admin.
--   6. filter_contacts() accepted an unbounded p_limit.
--   7. whatsapp_config.phone_number_id uniqueness (already enforced by
--      013; this only re-asserts it defensively).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Lock down SECURITY DEFINER maintenance functions
--
-- Supabase's default privileges grant EXECUTE on new functions to anon and
-- authenticated EXPLICITLY, so REVOKE ... FROM PUBLIC alone (what 022 and
-- 060 did) leaves them callable through PostgREST /rpc.
--
-- Caller analysis (grep of apps/api/src, apps/web/src, apps/admin-panel):
--   merge_duplicate_contacts()          no caller anywhere (022 one-off)
--   merge_contacts_into(uuid,uuid)      apps/api/scripts/backfill-contact-
--                                       phones.ts via Prisma $executeRaw
--                                       (connects as postgres)
--   increment_usage / decrement_usage   apps/api subscription.service.ts via
--                                       pg/Prisma raw SQL (postgres). Per
--                                       CLAUDE.md these are superseded and
--                                       have no live callers.
--   reset_monthly_usage()               no caller (cron, if any, is postgres)
--   The BROWSER calls none of them via .rpc(), so a plain revoke is safe and
--   no in-function membership check is needed for those. The table owner
--   (postgres) keeps EXECUTE implicitly, so the API keeps working.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.merge_duplicate_contacts()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_contacts() TO service_role;

REVOKE ALL ON FUNCTION public.merge_contacts_into(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_contacts_into(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.increment_usage(UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_usage(UUID, TEXT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.decrement_usage(UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_usage(UUID, TEXT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.reset_monthly_usage()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_monthly_usage() TO service_role;

-- ------------------------------------------------------------
-- 2. merge_contacts_into(): stop losing data on merge
--
-- Body is 060's, verbatim, plus:
--   * defence in depth: a JWT caller (auth.uid() NOT NULL) must be a member
--     of the contacts' account. Server connections (auth.uid() NULL) are
--     unchanged. Normally unreachable now (section 1), kept in case a
--     grant is ever re-added.
--   * opt-out: if the survivor is not opted out and the loser is, the
--     loser's opted_out_at / opt_out_source move over; if both are opted
--     out the EARLIEST opted_out_at (and its source) wins. 102's CHECK
--     requires the two columns to be set together, so they move together.
--     Silently dropping an opt-out would re-subscribe someone who said STOP.
--   * pinned_at (105): filled from the loser only when the survivor has none.
--   * contact_segment_members (076) is ON DELETE CASCADE on contact_id and
--     was never re-pointed: the loser's static segment memberships are
--     moved to the survivor (ON CONFLICT DO NOTHING; leftovers cascade).
-- Signature, SECURITY DEFINER, search_path and ownership are unchanged.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_contacts_into(
  p_survivor UUID,
  p_loser    UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_survivor RECORD;
  v_loser    RECORD;
BEGIN
  IF p_survivor = p_loser THEN
    RAISE EXCEPTION 'merge_contacts_into: survivor and loser are the same contact (%)', p_survivor;
  END IF;

  SELECT * INTO v_survivor FROM contacts WHERE id = p_survivor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_contacts_into: survivor % not found', p_survivor;
  END IF;

  SELECT * INTO v_loser FROM contacts WHERE id = p_loser;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_contacts_into: loser % not found', p_loser;
  END IF;

  IF v_survivor.account_id <> v_loser.account_id THEN
    RAISE EXCEPTION 'merge_contacts_into: refusing to merge across accounts (% vs %)',
      v_survivor.account_id, v_loser.account_id;
  END IF;

  -- Defence in depth (107): a signed-in caller must belong to the account.
  IF auth.uid() IS NOT NULL AND NOT is_account_member(v_survivor.account_id) THEN
    RAISE EXCEPTION 'merge_contacts_into: not a member of this workspace'
      USING ERRCODE = '42501';
  END IF;

  -- 1) Plain re-point
  UPDATE conversations                 SET contact_id = p_survivor WHERE contact_id = p_loser;
  UPDATE contact_notes                 SET contact_id = p_survivor WHERE contact_id = p_loser;
  UPDATE deals                         SET contact_id = p_survivor WHERE contact_id = p_loser;
  UPDATE broadcast_recipients          SET contact_id = p_survivor WHERE contact_id = p_loser;
  UPDATE automation_logs               SET contact_id = p_survivor WHERE contact_id = p_loser;
  UPDATE automation_pending_executions SET contact_id = p_survivor WHERE contact_id = p_loser;
  UPDATE notifications                 SET contact_id = p_survivor WHERE contact_id = p_loser;
  UPDATE ctwa_clicks                   SET contact_id = p_survivor WHERE contact_id = p_loser;
  UPDATE ecommerce_orders              SET contact_id = p_survivor WHERE contact_id = p_loser;
  UPDATE whatsapp_orders               SET contact_id = p_survivor WHERE contact_id = p_loser;
  UPDATE instagram_comments            SET contact_id = p_survivor WHERE contact_id = p_loser;
  UPDATE form_submissions              SET contact_id = p_survivor WHERE contact_id = p_loser;
  UPDATE form_bookings                 SET contact_id = p_survivor WHERE contact_id = p_loser;
  UPDATE web_sessions                  SET contact_id = p_survivor WHERE contact_id = p_loser;

  -- 2) Conflict-guarded re-point
  UPDATE contact_tags ct SET contact_id = p_survivor
    WHERE ct.contact_id = p_loser
      AND NOT EXISTS (
        SELECT 1 FROM contact_tags s
        WHERE s.contact_id = p_survivor AND s.tag_id = ct.tag_id
      );
  DELETE FROM contact_tags WHERE contact_id = p_loser;

  UPDATE contact_custom_values cv SET contact_id = p_survivor
    WHERE cv.contact_id = p_loser
      AND NOT EXISTS (
        SELECT 1 FROM contact_custom_values s
        WHERE s.contact_id = p_survivor AND s.custom_field_id = cv.custom_field_id
      );
  DELETE FROM contact_custom_values WHERE contact_id = p_loser;

  -- 107: static segment memberships (076). Unique on (segment_id, contact_id).
  INSERT INTO contact_segment_members (segment_id, contact_id, source, added_by, added_at)
    SELECT m.segment_id, p_survivor, m.source, m.added_by, m.added_at
    FROM contact_segment_members m
    WHERE m.contact_id = p_loser
  ON CONFLICT DO NOTHING;
  DELETE FROM contact_segment_members WHERE contact_id = p_loser;

  UPDATE flow_runs SET contact_id = p_survivor
    WHERE contact_id = p_loser AND status <> 'active';

  -- 3) Identity and profile columns
  UPDATE contacts SET web_visitor_id = NULL, ig_scoped_id = NULL
    WHERE id = p_loser;

  UPDATE contacts SET
      web_visitor_id = COALESCE(web_visitor_id, v_loser.web_visitor_id),
      ig_scoped_id   = COALESCE(ig_scoped_id,   v_loser.ig_scoped_id),
      ig_username    = COALESCE(ig_username,    v_loser.ig_username),
      name           = COALESCE(NULLIF(name, ''),       NULLIF(v_loser.name, '')),
      email          = COALESCE(NULLIF(email, ''),      NULLIF(v_loser.email, '')),
      company        = COALESCE(NULLIF(company, ''),    NULLIF(v_loser.company, '')),
      avatar_url     = COALESCE(NULLIF(avatar_url, ''), NULLIF(v_loser.avatar_url, '')),
      -- 107: keep the opt-out (earliest wins; columns move as a pair).
      opted_out_at   = CASE
                         WHEN v_loser.opted_out_at IS NOT NULL
                          AND (opted_out_at IS NULL OR v_loser.opted_out_at < opted_out_at)
                           THEN v_loser.opted_out_at
                         ELSE opted_out_at
                       END,
      opt_out_source = CASE
                         WHEN v_loser.opted_out_at IS NOT NULL
                          AND (opted_out_at IS NULL OR v_loser.opted_out_at < opted_out_at)
                           THEN v_loser.opt_out_source
                         ELSE opt_out_source
                       END,
      pinned_at      = COALESCE(pinned_at, v_loser.pinned_at),
      updated_at     = now()
    WHERE id = p_survivor;

  DELETE FROM contacts WHERE id = p_loser;
END;
$$;

ALTER FUNCTION public.merge_contacts_into(UUID, UUID) OWNER TO postgres;
-- CREATE OR REPLACE keeps the grants set in section 1; restated for clarity.
REVOKE ALL ON FUNCTION public.merge_contacts_into(UUID, UUID)
  FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 3. Storage: drop blanket public SELECT policies
--
-- A public bucket serves /object/public/<path> WITHOUT any SELECT policy.
-- A `USING (bucket_id = '...')` policy adds nothing for URL reads but lets
-- anon call the Storage list API and enumerate every tenant's
-- account-<uuid>/ folders and file names.
--
-- Usage check (apps/web): no storage .list( call anywhere; the browser only
-- upload()s, remove()s and getPublicUrl()s. upload(upsert) and remove()
-- need the caller to be able to SELECT the object, so buckets the browser
-- writes get a MEMBER-scoped SELECT instead:
--   chat-media, flow-media, template-media, media-library -> account member
--   workspace-logos                                       -> account member
--   avatars                                               -> own folder (uid)
-- web-media and instagram-media are written only by apps/api with the
-- service role, so they get no SELECT policy at all.
--
-- Safety: each bucket is only touched when it is currently PUBLIC. If a
-- bucket were private, its public-read policy is what serves signed URLs
-- and removing it would break reads, so it is left alone (NOTICE).
-- ------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_public BOOLEAN;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('chat-media',      'Chat media is publicly readable',       'chat-media',      'Members can read chat media',      'member'),
      ('flow-media',      'Flow media is publicly readable',       'flow-media',      'Members can read flow media',      'member'),
      ('template-media',  'Template media is publicly readable',   'template-media',  'Members can read template media',  'member'),
      ('media-library',   'Library media is publicly readable',    'media-library',   'Members can read library media',   'member'),
      ('workspace-logos', 'Workspace logos are publicly readable', 'workspace-logos', 'Members can read workspace logos', 'member'),
      ('avatars',         'Avatars are publicly readable',         'avatars',         'Users can read their own avatar',  'self'),
      ('web-media',       'Web media is publicly readable',        'web-media',       NULL,                               'none'),
      ('instagram-media', 'Instagram media is publicly readable',  'instagram-media', NULL,                               'none')
    ) AS t(bucket, old_policy, b2, new_policy, scope)
  LOOP
    SELECT public INTO v_public FROM storage.buckets WHERE id = r.bucket;
    IF v_public IS NULL THEN
      RAISE NOTICE '107: bucket % does not exist, skipping', r.bucket;
      CONTINUE;
    END IF;
    IF NOT v_public THEN
      RAISE NOTICE '107: bucket % is not public, leaving its SELECT policy alone', r.bucket;
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.old_policy);

    IF r.scope = 'member' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.new_policy);
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated '
        'USING (bucket_id = %L AND public.storage_account_folder_ok(name))',
        r.new_policy, r.bucket);
    ELSIF r.scope = 'self' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.new_policy);
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated '
        'USING (bucket_id = %L AND auth.uid()::text = (storage.foldername(name))[1])',
        r.new_policy, r.bucket);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 4. profiles: email, role and beta_features are not self-editable
--
-- profiles_update (096) is row-level only, so a user could PATCH their own
-- email / role / beta_features through PostgREST. The web app's only
-- profiles write (settings/profile-form.tsx) sends full_name + avatar_url.
-- Same technique as 106's accounts trigger: key off current_user, which is
-- `authenticated`/`anon` for PostgREST and the owner (postgres) or
-- supabase_auth_admin for apps/api, admin-panel, SECURITY DEFINER functions
-- and the auth-sync triggers. SECURITY INVOKER on purpose.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.email IS DISTINCT FROM OLD.email
       OR NEW.role IS DISTINCT FROM OLD.role
       OR NEW.beta_features IS DISTINCT FROM OLD.beta_features
       OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'profiles.email, role, beta_features and user_id cannot be changed directly'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_privileged_columns ON public.profiles;
CREATE TRIGGER profiles_guard_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_privileged_columns();

-- ------------------------------------------------------------
-- 5. set_member_role(): only an owner may touch an admin
--
-- 095's body, plus: an ADMIN actor may neither change an admin's role nor
-- grant the admin role. Owners are unrestricted (apart from the existing
-- owner protections). resolve_rpc_actor and the actor-based membership
-- check are kept as-is. Signature and grants unchanged.
-- ⚠ Behaviour change: admins can no longer promote someone to admin.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_member_role(
  p_account_id    UUID,
  p_user_id       UUID,
  p_new_role      account_role_enum,
  p_actor_user_id UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor       UUID := resolve_rpc_actor(p_actor_user_id);
  v_actor_role  account_role_enum;
  v_target_role account_role_enum;
BEGIN
  SELECT role INTO v_actor_role
  FROM account_members
  WHERE account_id = p_account_id AND user_id = v_actor;

  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace' USING ERRCODE = '42501';
  END IF;

  IF v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'This action requires the admin role or higher'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id = v_actor THEN
    RAISE EXCEPTION 'Cannot change your own role' USING ERRCODE = '22023';
  END IF;

  SELECT role INTO v_target_role
  FROM account_members
  WHERE account_id = p_account_id AND user_id = p_user_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Target user is not a member of this workspace'
      USING ERRCODE = '22023';
  END IF;

  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Use transfer_account_ownership to demote an owner'
      USING ERRCODE = '22023';
  END IF;
  IF p_new_role = 'owner' THEN
    RAISE EXCEPTION 'Use transfer_account_ownership to promote to owner'
      USING ERRCODE = '22023';
  END IF;

  -- 107: admins manage agents and viewers only.
  IF v_actor_role = 'admin' AND (v_target_role = 'admin' OR p_new_role = 'admin') THEN
    RAISE EXCEPTION 'Only the workspace owner can change or grant the admin role'
      USING ERRCODE = '42501';
  END IF;

  UPDATE account_members
  SET role = p_new_role
  WHERE account_id = p_account_id AND user_id = p_user_id;
END;
$$;

ALTER FUNCTION public.set_member_role(UUID, UUID, account_role_enum, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_member_role(UUID, UUID, account_role_enum, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_member_role(UUID, UUID, account_role_enum, UUID) TO authenticated;

-- ------------------------------------------------------------
-- 6. filter_contacts(): cap the page size
--
-- 105's body, with LIMIT clamped to [0, 500]. NULL (which Postgres treats
-- as "no limit") falls back to the default of 25. The web page asks for 25.
-- Signature unchanged, so 097's grants carry over.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.filter_contacts(
  p_account_id  UUID,
  p_tag_ids     UUID[] DEFAULT NULL,
  p_segment_ids UUID[] DEFAULT NULL,
  p_search      TEXT   DEFAULT NULL,
  p_limit       INT    DEFAULT 25,
  p_offset      INT    DEFAULT 0
)
RETURNS TABLE (contact public.contacts, total_count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH seg_matches AS (
    SELECT DISTINCT r.contact_id
    FROM unnest(COALESCE(p_segment_ids, ARRAY[]::uuid[])) AS s(id)
    CROSS JOIN LATERAL resolve_segment_contact_ids(s.id) AS r(contact_id)
  ),
  matched AS (
    SELECT c.id, c.created_at, c.pinned_at
    FROM contacts c
    WHERE c.account_id = p_account_id
      AND (
        p_tag_ids IS NULL OR array_length(p_tag_ids, 1) IS NULL
        OR EXISTS (
          SELECT 1 FROM contact_tags ct
          WHERE ct.contact_id = c.id AND ct.tag_id = ANY(p_tag_ids)
        )
      )
      AND (
        p_segment_ids IS NULL OR array_length(p_segment_ids, 1) IS NULL
        OR c.id IN (SELECT sm.contact_id FROM seg_matches sm)
      )
      AND (
        p_search IS NULL
        OR c.name ILIKE '%' || p_search || '%'
        OR c.phone ILIKE '%' || p_search || '%'
        OR c.email ILIKE '%' || p_search || '%'
        OR c.company ILIKE '%' || p_search || '%'
        OR c.ig_username ILIKE '%' || p_search || '%'
      )
  ),
  page AS (
    SELECT id, count(*) OVER() AS total_count
    FROM matched
    ORDER BY pinned_at DESC NULLS LAST, created_at DESC, id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 0), 500) OFFSET p_offset
  )
  SELECT c AS contact, page.total_count
  FROM page
  JOIN contacts c ON c.id = page.id
  ORDER BY c.pinned_at DESC NULLS LAST, c.created_at DESC, c.id;
$$;

-- ------------------------------------------------------------
-- 7. whatsapp_config.phone_number_id uniqueness
--
-- Migration 013 already added UNIQUE (whatsapp_config_phone_number_id_key)
-- and nothing later drops it, so this finding does not apply to a database
-- that ran 013. This block only re-asserts it where NO unique index covers
-- the column alone, and never fails the migration: on duplicates it logs a
-- NOTICE and skips. No data is deleted.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_attnum   SMALLINT;
  v_has_uniq BOOLEAN;
  v_dupes    INT;
BEGIN
  SELECT attnum INTO v_attnum FROM pg_attribute
   WHERE attrelid = 'public.whatsapp_config'::regclass
     AND attname = 'phone_number_id' AND NOT attisdropped;
  IF v_attnum IS NULL THEN
    RAISE NOTICE '107: whatsapp_config.phone_number_id not found, skipping';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_index i
     WHERE i.indrelid = 'public.whatsapp_config'::regclass
       AND i.indisunique AND i.indpred IS NULL
       AND i.indnkeyatts = 1 AND i.indkey[0] = v_attnum
  ) INTO v_has_uniq;
  IF v_has_uniq THEN
    RAISE NOTICE '107: phone_number_id already unique, nothing to do';
    RETURN;
  END IF;

  SELECT count(*) INTO v_dupes FROM (
    SELECT phone_number_id FROM public.whatsapp_config
     GROUP BY phone_number_id HAVING count(*) > 1
  ) d;
  IF v_dupes > 0 THEN
    RAISE NOTICE '107: % duplicate phone_number_id value(s) in whatsapp_config; unique index NOT created. Resolve them manually and re-run.', v_dupes;
    RETURN;
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_config_phone_number_id
    ON public.whatsapp_config (phone_number_id);
END $$;

-- ------------------------------------------------------------
-- ROLLBACK (manual; kept commented)
--
-- -- 1. restore the old grants (NOT recommended -- re-opens the hole):
-- --   GRANT EXECUTE ON FUNCTION public.merge_contacts_into(UUID,UUID),
-- --     public.increment_usage(UUID,TEXT,INTEGER),
-- --     public.decrement_usage(UUID,TEXT,INTEGER) TO authenticated;
-- -- 2. re-run 060's / 095's / 105's function bodies to restore the old
-- --    merge_contacts_into, set_member_role and filter_contacts.
-- -- 3. recreate the dropped policies, e.g.
-- --   CREATE POLICY "Chat media is publicly readable" ON storage.objects
-- --     FOR SELECT USING (bucket_id = 'chat-media');   (and likewise 008,
-- --     016, 051, 053, 058, 071, 087), then DROP the "Members can read ..."
-- --     policies created here.
-- -- 4. DROP TRIGGER profiles_guard_privileged_columns ON public.profiles;
-- --    DROP FUNCTION public.profiles_guard_privileged_columns();
-- -- 7. DROP INDEX IF EXISTS public.uq_whatsapp_config_phone_number_id;
--
-- VERIFICATION (run manually; kept commented)
--
-- -- 1: no anon/authenticated EXECUTE left
-- --   SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') a,
-- --          has_function_privilege('authenticated', p.oid, 'EXECUTE') u
-- --    FROM pg_proc p WHERE p.proname IN ('merge_duplicate_contacts',
-- --      'merge_contacts_into','increment_usage','decrement_usage',
-- --      'reset_monthly_usage');                       -- all f / f
-- -- 2: merge two contacts where the loser has opted_out_at / pinned_at /
-- --    a static segment row; survivor must carry all three afterwards.
-- -- 3: SELECT policyname FROM pg_policies WHERE schemaname='storage'
-- --      AND tablename='objects' AND policyname ILIKE '%publicly readable%';
-- --      -- no rows for the eight buckets; then as anon:
-- --      --   storage list on chat-media returns [], public URL still 200.
-- -- 4: SET ROLE authenticated; (jwt sub = self)
-- --      UPDATE profiles SET role='x' WHERE user_id=auth.uid();      -- 42501
-- --      UPDATE profiles SET full_name='y' WHERE user_id=auth.uid(); -- ok
-- -- 5: as an admin: set_member_role(ws, <other admin>, 'agent') -> 42501;
-- --      set_member_role(ws, <agent>, 'viewer') -> ok; owner can do both.
-- -- 6: SELECT count(*) FROM filter_contacts('<ws>', p_limit => 100000);
-- --      -- <= 500 rows
-- -- 7: SELECT conname FROM pg_constraint WHERE conrelid='public.whatsapp_config'::regclass
-- --      AND contype='u';                               -- includes ..._phone_number_id_key
-- ------------------------------------------------------------
