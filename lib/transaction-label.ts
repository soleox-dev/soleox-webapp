type DealLabelSource = {
  id?: unknown;
  client_id?: unknown;
  property_address?: unknown;
  transaction_side?: unknown;
  transaction_status?: unknown;
  status?: unknown;
};

function text(value: unknown): string {
  return String(value ?? '').trim();
}

/** Address, side, and status. Skips any of the three that are blank. */
export function transactionDealLabel(deal: DealLabelSource | null | undefined): string {
  const status = text(deal?.transaction_status) || text(deal?.status);
  return [text(deal?.property_address), text(deal?.transaction_side), status].filter(Boolean).join(' · ');
}

/** Search-box text: [client] id — address · side · status. */
export function transactionSearchLabel(deal: DealLabelSource | null | undefined): string {
  const client = text(deal?.client_id);
  const id = text(deal?.id);
  const label = transactionDealLabel(deal);
  const head = `${client ? `[${client}] ` : ''}${id}`.trim();
  return label ? `${head} — ${label}` : head;
}
