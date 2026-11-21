-- 102: contact opt-out (marketing broadcasts must honour STOP).
--
-- A timestamp rather than a boolean: "when" is what an operator asked about
-- the first time somebody complained, and NULL cleanly means "never opted out".
-- `opt_out_source` records HOW (a STOP reply, an operator, the API) for the
-- same reason `contacts.source` exists: origin cannot be recovered later.
--
-- Broadcasts (dashboard AND POST /v1/broadcasts) exclude opted-out contacts.
-- One-to-one replies in the inbox are unaffected: an opted-out customer who
-- writes in is still answered.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS opted_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS opt_out_source text;

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_opt_out_source_chk;
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_opt_out_source_chk
  CHECK (opt_out_source IS NULL OR opt_out_source IN ('keyword', 'manual', 'api'));

-- An opted-out contact must say how; a contact that is not must not.
ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_opt_out_pair_chk;
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_opt_out_pair_chk
  CHECK ((opted_out_at IS NULL) = (opt_out_source IS NULL));

CREATE INDEX IF NOT EXISTS idx_contacts_opted_out
  ON public.contacts (account_id)
  WHERE opted_out_at IS NOT NULL;
