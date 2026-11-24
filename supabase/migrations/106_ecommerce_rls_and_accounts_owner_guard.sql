-- ============================================================
-- 106 -- Security audit fixes H-3 and H-4
--
--   H-3  RLS was switched OFF on ecommerce_products / ecommerce_orders
--        (040 "temporarily", 042 "permanently") because sync "required
--        it". It never did: the sync runs in apps/api through Prisma as
--        the table owner (postgres), which bypasses RLS anyway. With RLS
--        off and Supabase's default grants, any anon/authenticated
--        PostgREST caller could read and write every tenant's catalogue
--        and orders (incl. order totals and contact_id links).
--
--   H-4  017's accounts_update lets any workspace ADMIN update ANY column
--        of `accounts`, including owner_user_id. Billing resolves the plan
--        through accounts.owner_user_id, so an admin could re-point the
--        workspace's subscription at themselves (or anybody).
--
-- Idempotent: safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- H-3. ecommerce_products / ecommerce_orders
--
-- What the browser does: NOTHING with these two tables (apps/web only
-- ever does .from('ecommerce_integrations')). Every read and write goes
-- through apps/api/src/ecommerce via Prisma. So the policy set is
-- SELECT-only for members; there is deliberately no INSERT/UPDATE/DELETE
-- policy for authenticated, which means RLS denies those outright.
--
-- Ownership is derived through ecommerce_integrations.account_id (these
-- tables carry only integration_id), exactly as 035 did.
--
-- NOT FORCEd: apps/api connects as the table owner (postgres) and relies on
-- the owner bypass. FORCE ROW LEVEL SECURITY would subject it to the
-- policies below (no write policy => sync breaks).
-- ------------------------------------------------------------
ALTER TABLE ecommerce_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecommerce_orders   ENABLE ROW LEVEL SECURITY;

-- Drop every policy 035/041 ever created (041's INSERT WITH CHECK (true)
-- would let any signed-in user insert into any tenant's integration).
DROP POLICY IF EXISTS "Account members can view e-commerce products"   ON ecommerce_products;
DROP POLICY IF EXISTS "Account members can insert e-commerce products" ON ecommerce_products;
DROP POLICY IF EXISTS "Account members can view e-commerce orders"     ON ecommerce_orders;
DROP POLICY IF EXISTS "Account members can insert e-commerce orders"   ON ecommerce_orders;

CREATE POLICY "Account members can view e-commerce products" ON ecommerce_products
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ecommerce_integrations i
      WHERE i.id = ecommerce_products.integration_id
        AND is_account_member(i.account_id)
    )
  );

CREATE POLICY "Account members can view e-commerce orders" ON ecommerce_orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ecommerce_integrations i
      WHERE i.id = ecommerce_orders.integration_id
        AND is_account_member(i.account_id)
    )
  );

-- Defence in depth: privileges, not just policies.
REVOKE ALL ON ecommerce_products FROM anon;
REVOKE ALL ON ecommerce_orders   FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ecommerce_products FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ecommerce_orders   FROM authenticated;
GRANT SELECT ON ecommerce_products TO authenticated;
GRANT SELECT ON ecommerce_orders   TO authenticated;

-- ------------------------------------------------------------
-- H-4. accounts: privileged columns are not member-editable
--
-- The accounts_update policy is row-level only; it cannot restrict
-- columns. A BEFORE UPDATE trigger can.
--
-- WHO IS ALLOWED, and how it was verified from the migration history:
--  * transfer_account_ownership (095) is SECURITY DEFINER, owner postgres.
--    Inside it auth.uid() is STILL the caller's id (auth.uid() reads the
--    request.jwt.claims GUC, which SECURITY DEFINER does not change), so
--    an "auth.uid() IS NULL" rule would NOT let the RPC through. But
--    current_user inside it is `postgres`.
--  * apps/api (Prisma) and apps/admin-panel connect as postgres with
--    auth.uid() NULL; current_user = postgres.
--  * A browser/PostgREST update runs as `authenticated` (or `anon`).
-- So the rule keys off current_user: refuse when the effective role is
-- authenticated/anon, allow everything else. This needs no change to the
-- RPC and no spoofable session setting. The function is SECURITY INVOKER
-- on purpose -- DEFINER would make current_user always the function
-- owner and defeat the check.
--
-- Guarded: id, owner_user_id, created_at. accounts has no plan/billing/
-- status columns (plan lives on user_subscriptions, keyed through
-- owner_user_id). name, logo_url, default_currency, default_country,
-- updated_at stay editable by admins.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounts_guard_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
      RAISE EXCEPTION 'accounts.owner_user_id can only be changed by transferring ownership'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'accounts.id and accounts.created_at are immutable'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_guard_privileged_columns ON accounts;
CREATE TRIGGER accounts_guard_privileged_columns
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION public.accounts_guard_privileged_columns();

-- ------------------------------------------------------------
-- VERIFICATION (run manually; kept commented)
--
-- -- H-3: RLS on, no FORCE, only SELECT policies
-- --   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
-- --    WHERE relname IN ('ecommerce_products','ecommerce_orders');
-- --   -- expect t, f
-- --   SELECT tablename, policyname, cmd FROM pg_policies
-- --    WHERE tablename IN ('ecommerce_products','ecommerce_orders');
-- --   -- expect 2 rows, cmd = SELECT
-- --   SET ROLE anon;  SELECT count(*) FROM ecommerce_orders;       -- permission denied
-- --   SET ROLE authenticated;
-- --   SELECT set_config('request.jwt.claims','{"sub":"<member uid>"}',true);
-- --   SELECT count(*) FROM ecommerce_orders;                        -- own tenant only
-- --   INSERT INTO ecommerce_orders (...) VALUES (...);              -- permission denied
-- --   RESET ROLE;  -- as postgres, the Prisma sync still writes
--
-- -- H-4:
-- --   SET ROLE authenticated; (jwt sub = a workspace admin)
-- --   UPDATE accounts SET owner_user_id = '<self>' WHERE id = '<ws>'; -- 42501
-- --   UPDATE accounts SET name = 'x' WHERE id = '<ws>';               -- ok
-- --   RESET ROLE;
-- --   SELECT transfer_account_ownership('<ws>','<member>','<owner uid>'); -- still works
-- ------------------------------------------------------------

-- ROLLBACK (manual)
-- DROP TRIGGER IF EXISTS accounts_guard_privileged_columns ON accounts;
-- DROP FUNCTION IF EXISTS public.accounts_guard_privileged_columns();
-- DROP POLICY IF EXISTS "Account members can view e-commerce products" ON ecommerce_products;
-- DROP POLICY IF EXISTS "Account members can view e-commerce orders"   ON ecommerce_orders;
-- ALTER TABLE ecommerce_products DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE ecommerce_orders   DISABLE ROW LEVEL SECURITY;
-- GRANT ALL ON ecommerce_products, ecommerce_orders TO anon, authenticated;
