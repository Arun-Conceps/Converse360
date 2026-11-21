-- ============================================================
-- 103: broadcasts can be 'cancelled'
--
-- A scheduled broadcast can be called off before it goes out. 070's
-- CHECK already allowed 'scheduled' (nothing ever wrote it); this adds
-- the terminal state for a broadcast that was withdrawn, or whose whole
-- audience opted out between scheduling and sending.
-- Idempotent.
-- ============================================================
ALTER TABLE public.broadcasts DROP CONSTRAINT IF EXISTS broadcasts_status_check;
ALTER TABLE public.broadcasts
  ADD CONSTRAINT broadcasts_status_check
  CHECK (status = ANY (ARRAY[
    'draft'::text, 'queued'::text, 'scheduled'::text, 'sending'::text,
    'sent'::text, 'failed'::text, 'cancelled'::text
  ]));
CREATE INDEX IF NOT EXISTS idx_broadcasts_scheduled_due
  ON public.broadcasts (scheduled_at) WHERE status = 'scheduled';
