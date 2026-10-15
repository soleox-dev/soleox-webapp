const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function AgentSplitExcessNotice({
  total,
  remaining,
  excess,
}: {
  total: number;
  remaining: number;
  excess: number;
}) {
  if (!(excess > 0.009)) return null;

  return (
    <p
      role="alert"
      className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2.5 text-sm font-semibold leading-relaxed text-rose-700 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-300"
    >
      Agent splits total {money.format(total)}. That is {money.format(excess)} more than the {money.format(remaining)} remaining commission. That extra money does not exist, so this transaction cannot be saved.
    </p>
  );
}
