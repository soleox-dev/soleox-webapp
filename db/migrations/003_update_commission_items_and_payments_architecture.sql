-- ====================================================================
-- Migration 003: Update transaction_commission_items and payments architecture
-- Supports granular commission waterfall calculations, user notes, rule types,
-- and Final Disbursements & Payment Authorizations storage.
-- ====================================================================

-- 1. transaction_commission_items enhancements
ALTER TABLE public.transaction_commission_items
  ADD COLUMN IF NOT EXISTS split_type text,
  ADD COLUMN IF NOT EXISTS split_value numeric,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS entity_name text,
  ADD COLUMN IF NOT EXISTS agent_name text,
  ADD COLUMN IF NOT EXISTS is_primary boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_attributes jsonb DEFAULT '{}'::jsonb;

-- 2. payments enhancements
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payee_type text,
  ADD COLUMN IF NOT EXISTS payee_name text,
  ADD COLUMN IF NOT EXISTS agent_id text,
  ADD COLUMN IF NOT EXISTS payee_entity_id text,
  ADD COLUMN IF NOT EXISTS disbursement_type text,
  ADD COLUMN IF NOT EXISTS custom_attributes jsonb DEFAULT '{}'::jsonb;

-- 3. Performance & query indexes
CREATE INDEX IF NOT EXISTS idx_tci_transaction_id ON public.transaction_commission_items (transaction_id);
CREATE INDEX IF NOT EXISTS idx_tci_client_id ON public.transaction_commission_items (client_id);
CREATE INDEX IF NOT EXISTS idx_tci_section ON public.transaction_commission_items (section);
CREATE INDEX IF NOT EXISTS idx_tci_agent_id ON public.transaction_commission_items (agent_id);

CREATE INDEX IF NOT EXISTS idx_payments_transaction_id ON public.payments (transaction_id);
CREATE INDEX IF NOT EXISTS idx_payments_client_id ON public.payments (client_id);
CREATE INDEX IF NOT EXISTS idx_payments_agent_id ON public.payments (agent_id);
CREATE INDEX IF NOT EXISTS idx_payments_payee_type ON public.payments (payee_type);
