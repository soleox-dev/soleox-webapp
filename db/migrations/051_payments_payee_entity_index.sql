-- Commission Entities checks whether each entity has any payment before allowing delete.
-- This index keeps that one-row lookup fast for clients with many payments.

CREATE INDEX IF NOT EXISTS idx_payments_client_payee_entity
  ON public.payments (client_id, payee_entity_id);
