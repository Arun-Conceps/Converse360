-- ============================================================
-- 101_admin_roles.sql — roles the Control Center's Super Admin can create.
--
-- Until now a staff role was one of six values hard-coded in
-- apps/admin-panel/lib/staff/roles.ts, pinned by a CHECK on admin_staff.role.
-- A Super Admin can now build a role by choosing which modules it may use, and
-- give that role to a new staff member.
--
-- ⚠️ THE SIX BUILT-IN ROLES STAY DEFINED IN CODE, and are the authority for
--   what they may do. They are inserted here as `is_system` rows ONLY so that
--   admin_staff.role can be a real foreign key — one list of valid role keys,
--   and a database that refuses to delete a role somebody still holds. Their
--   `capabilities` column is empty and ignored; editing it would change
--   nothing, and the panel does not offer to.
--
-- ⚠️ CUSTOM ROLES STORE CAPABILITY NAMES, NOT MENU ITEMS. The nav hides what a
--   role cannot use, but every page and every Server Action asks
--   `can(staff, capability)` again, so what is stored here is what actually
--   gates reads and writes. The panel drops any name it does not recognise
--   when it loads a role, so a stale or hand-edited value can never grant
--   something the code has no capability for.
--
-- ⚠️ SAME LOCK-DOWN AS admin_audit_log AND migration 098's tables: RLS on, ZERO
--   policies, rights revoked from anon/authenticated. Written only by
--   apps/admin-panel over its own connection. A policy added here would let a
--   customer's browser read — or write — who may do what in the operator panel.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_roles (
  key          TEXT PRIMARY KEY
    CHECK (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  name         TEXT NOT NULL
    CHECK (char_length(btrim(name)) BETWEEN 2 AND 60),
  description  TEXT NOT NULL DEFAULT ''
    CHECK (char_length(description) <= 300),
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  is_system    BOOLEAN NOT NULL DEFAULT FALSE,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.admin_roles (key, name, is_system) VALUES
  ('super_admin',     'Super Admin',     TRUE),
  ('account_manager', 'Account Manager', TRUE),
  ('billing',         'Billing',         TRUE),
  ('support_l1',      'Support L1',      TRUE),
  ('support_l2',      'Support L2',      TRUE),
  ('support_l3',      'Support L3',      TRUE)
ON CONFLICT (key) DO NOTHING;

-- Replace the six-value CHECK with a foreign key to the table above.
ALTER TABLE public.admin_staff DROP CONSTRAINT IF EXISTS admin_staff_role_check;
ALTER TABLE public.admin_staff DROP CONSTRAINT IF EXISTS admin_staff_role_fk;
ALTER TABLE public.admin_staff
  ADD CONSTRAINT admin_staff_role_fk
  FOREIGN KEY (role) REFERENCES public.admin_roles (key) ON UPDATE CASCADE;

ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_roles FROM anon, authenticated;

COMMENT ON TABLE public.admin_roles IS
  'Control Center staff roles. The six is_system rows are defined in code (their capabilities column is ignored); custom rows carry the capability names a Super Admin chose. RLS on, no policies (migration 101).';
