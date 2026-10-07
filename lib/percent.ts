/** Percentages are stored as rates. 1.5% is 0.015. 110.24% is 1.1024. */

export const PERCENT_POINT_DECIMALS = 3;

export function toPercentPoints(rate: number): number {
  if (!Number.isFinite(rate)) return 0;
  return rate * 100;
}

export function fromPercentPoints(points: number): number {
  if (!Number.isFinite(points)) return 0;
  return points / 100;
}

export function roundPercentPoints(points: number): number {
  if (!Number.isFinite(points)) return 0;
  const factor = 10 ** PERCENT_POINT_DECIMALS;
  return Math.round((points + Number.EPSILON) * factor) / factor;
}

/** Enough precision to round-trip three decimal percent points. */
export function roundPercentRate(rate: number): number {
  if (!Number.isFinite(rate)) return 0;
  return Number(rate.toFixed(7));
}

/** 1.5, 80, 20.25, 3.275. Trailing zeros are omitted. */
export function formatPercentPoints(points: number): string {
  if (!Number.isFinite(points)) return '';
  const text = roundPercentPoints(points).toFixed(PERCENT_POINT_DECIMALS);
  return text.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

/** Table cells: 0.025 → "2.50%". Always two decimal places. */
export function formatTablePercent(rate: unknown): string {
  if (rate === undefined || rate === null || rate === '') return '—';
  const num = typeof rate === 'number' ? rate : Number(String(rate).replace(/[%,$\s,]/g, ''));
  if (!Number.isFinite(num)) return String(rate);
  return `${toPercentPoints(num).toFixed(2)}%`;
}

/** 0.015 → "1.5%". 1.1024 → "110.24%". */
export function formatPercentRate(rate: unknown): string {
  if (rate === undefined || rate === null || rate === '') return '—';
  const num = typeof rate === 'number' ? rate : Number(String(rate).replace(/[%,$\s,]/g, ''));
  if (!Number.isFinite(num)) return String(rate);
  const points = formatPercentPoints(toPercentPoints(num));
  return points === '' ? '—' : `${points}%`;
}
