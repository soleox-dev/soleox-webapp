/** Places names that have a client order first, and keeps every other name in its current order. */
export function orderPostSplitNames(live: string[], preferred: string[]): string[] {
  const rank = new Map<string, number>();
  preferred.forEach((name, index) => {
    const key = name.trim();
    if (key && !rank.has(key)) rank.set(key, index);
  });
  const placed: { name: string; rank: number; index: number }[] = [];
  const rest: string[] = [];
  live.forEach((name, index) => {
    const order = rank.get(name);
    if (order == null) rest.push(name);
    else placed.push({ name, rank: order, index });
  });
  placed.sort((left, right) => left.rank - right.rank || left.index - right.index);
  return [...placed.map((row) => row.name), ...rest];
}
