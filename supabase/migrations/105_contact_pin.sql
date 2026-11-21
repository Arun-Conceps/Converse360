-- ============================================================
-- 105_contact_pin.sql — pin contacts to the top of the list.
--
-- `contacts.pinned_at` is NULL when not pinned, else WHEN it was pinned.
-- A timestamp rather than a boolean so the most recently pinned contact
-- sorts first and "unpin" is simply setting it back to NULL.
--
-- ⚠️ A PIN IS SHARED BY THE WORKSPACE, not personal: it lives on the
--   contact row, so every teammate sees the same pinned contacts first.
--   A per-user pin would need a join table and is not what was asked for.
--
-- ⚠️ filter_contacts MUST ORDER BY IT TOO. The Contacts page reads through
--   two paths — a plain query, and this RPC whenever a tag/segment filter is
--   active. Pinning only one would put pinned contacts on top until someone
--   filtered, then silently scatter them. Same signature as 097, so
--   CREATE OR REPLACE keeps its grants.
-- ============================================================

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

-- Partial: pinned contacts are a handful per workspace.
CREATE INDEX IF NOT EXISTS idx_contacts_account_pinned
  ON public.contacts (account_id, pinned_at DESC)
  WHERE pinned_at IS NOT NULL;

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
    LIMIT p_limit OFFSET p_offset
  )
  SELECT c AS contact, page.total_count
  FROM page
  JOIN contacts c ON c.id = page.id
  ORDER BY c.pinned_at DESC NULLS LAST, c.created_at DESC, c.id;
$$;
