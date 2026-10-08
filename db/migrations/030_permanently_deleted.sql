-- Soft-deleted transactions stay restorable. Permanently deleted rows stay in the
-- table so a later sync still matches their TMS ID and does not create them again.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS permanently_deleted boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
