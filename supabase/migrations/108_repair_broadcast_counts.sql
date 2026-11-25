-- ============================================================
-- Repair drifted broadcast counters (QA BUG-004).
--
-- The incremental trigger from 005 adjusts counters by the OLD -> NEW status
-- delta, so it stays correct only if every row change goes through it from a
-- clean start. Rows seeded or bulk-edited alongside the trigger left the
-- parent counters above the recipient total (sent 67 for 34 recipients ->
-- delivery rate 194%). broadcast_recipients is the truth; re-derive from it
-- with the safety-net function 005 kept for exactly this.
--
-- Idempotent: recomputing from the rows is a no-op on healthy broadcasts.
-- ============================================================

DO $$
DECLARE
  b RECORD;
BEGIN
  FOR b IN SELECT DISTINCT broadcast_id AS id FROM public.broadcast_recipients LOOP
    PERFORM public.recompute_broadcast_counts(b.id);
  END LOOP;
END $$;
