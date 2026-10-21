-- Agent cap history for Transaction Detail in one query.
-- The page needs every earlier post-split line for a deal's agents and entities, with each line's closing
-- date, to know how far each agent is toward a cap. Read through PostgREST that took three pages of
-- commission lines plus a closing-date lookup per hundred deals, with the row policy checked on every row.
--
-- The function checks once that the caller belongs to the client, then reads that client's lines joined to
-- their transactions. Archived lines and archived transactions are left out. It returns one JSON array, so
-- the API's 1,000-row limit does not cut it short.

CREATE INDEX IF NOT EXISTS idx_tci_post_split_history
  ON public.transaction_commission_items (client_id, agent_id, payee_entity_id)
  WHERE section IN ('POST_SPLIT', 'POST_SPLIT_L2');

CREATE OR REPLACE FUNCTION public.post_split_history(
  p_client_id text,
  p_agent_ids text[],
  p_entity_ids text[],
  p_exclude_transaction_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN
    RETURN '[]'::jsonb;
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'agentId', tci.agent_id,
    'entityId', tci.payee_entity_id,
    'amount', COALESCE(tci.final_amount, 0),
    -- The same text the API sent before: ISO for a timestamp, YYYY-MM-DD for a date.
    'closingDate', to_jsonb(t.closing_date) #>> '{}'
  )), '[]'::jsonb)
  INTO result
  FROM public.transaction_commission_items tci
  JOIN public.transactions t ON t.id = tci.transaction_id AND t.client_id = tci.client_id
  WHERE tci.client_id = p_client_id
    AND tci.agent_id = ANY (p_agent_ids)
    AND tci.payee_entity_id = ANY (p_entity_ids)
    AND tci.section IN ('POST_SPLIT', 'POST_SPLIT_L2')
    AND (tci.archived IS NULL OR tci.archived = false)
    AND (t.archived IS NULL OR t.archived = false)
    AND (p_exclude_transaction_id IS NULL OR tci.transaction_id <> p_exclude_transaction_id);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.post_split_history(text, text[], text[], text) FROM public;
GRANT EXECUTE ON FUNCTION public.post_split_history(text, text[], text[], text) TO authenticated, anon;
