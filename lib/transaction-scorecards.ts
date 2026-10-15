import { dealMatchesDefaultView } from '@/lib/transaction-default-view';

export const SCORECARD_COLORS = ['blue', 'sky', 'indigo', 'violet', 'teal', 'green', 'yellow', 'orange', 'red', 'pink', 'grey'] as const;
export type ScorecardColor = (typeof SCORECARD_COLORS)[number];
export type ScorecardMetricKind = 'count' | 'sum' | 'average';

export const SCORECARD_COLOR_LABEL: Record<ScorecardColor, string> = {
  blue: 'Blue',
  sky: 'Sky',
  indigo: 'Indigo',
  violet: 'Violet',
  teal: 'Teal',
  green: 'Green',
  yellow: 'Yellow',
  orange: 'Orange',
  red: 'Red',
  pink: 'Pink',
  grey: 'Grey',
};

export const SCORECARD_COLOR_STYLES: Record<ScorecardColor, {
  title: string;
  value: string;
  border: string;
  hover: string;
  ring: string;
  selectedBorder: string;
  tabIdle: string;
  tabActive: string;
  countIdle: string;
  countActive: string;
  swatch: string;
}> = {
  blue: {
    title: 'text-blue-600 dark:text-blue-400',
    value: 'text-blue-600 dark:text-blue-400',
    border: 'border-l-blue-500',
    hover: 'hover:bg-blue-50/60 dark:hover:bg-blue-500/5',
    ring: 'ring-2 ring-blue-500/70',
    selectedBorder: 'border-blue-500/70',
    tabIdle: 'text-blue-700 dark:text-blue-300 border border-transparent hover:bg-blue-500/10',
    tabActive: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/40',
    countIdle: 'text-blue-600/70 dark:text-blue-300/70',
    countActive: 'text-blue-700 dark:text-blue-200',
    swatch: 'bg-blue-500',
  },
  sky: {
    title: 'text-sky-600 dark:text-sky-400',
    value: 'text-sky-600 dark:text-sky-400',
    border: 'border-l-sky-500',
    hover: 'hover:bg-sky-50/60 dark:hover:bg-sky-500/5',
    ring: 'ring-2 ring-sky-500/70',
    selectedBorder: 'border-sky-500/70',
    tabIdle: 'text-sky-700 dark:text-sky-300 border border-transparent hover:bg-sky-500/10',
    tabActive: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/40',
    countIdle: 'text-sky-600/70 dark:text-sky-300/70',
    countActive: 'text-sky-700 dark:text-sky-200',
    swatch: 'bg-sky-500',
  },
  indigo: {
    title: 'text-indigo-600 dark:text-indigo-400',
    value: 'text-indigo-600 dark:text-indigo-400',
    border: 'border-l-indigo-500',
    hover: 'hover:bg-indigo-50/60 dark:hover:bg-indigo-500/5',
    ring: 'ring-2 ring-indigo-500/70',
    selectedBorder: 'border-indigo-500/70',
    tabIdle: 'text-indigo-700 dark:text-indigo-300 border border-transparent hover:bg-indigo-500/10',
    tabActive: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/40',
    countIdle: 'text-indigo-600/70 dark:text-indigo-300/70',
    countActive: 'text-indigo-700 dark:text-indigo-200',
    swatch: 'bg-indigo-500',
  },
  violet: {
    title: 'text-violet-600 dark:text-violet-400',
    value: 'text-violet-600 dark:text-violet-400',
    border: 'border-l-violet-500',
    hover: 'hover:bg-violet-50/60 dark:hover:bg-violet-500/5',
    ring: 'ring-2 ring-violet-500/70',
    selectedBorder: 'border-violet-500/70',
    tabIdle: 'text-violet-700 dark:text-violet-300 border border-transparent hover:bg-violet-500/10',
    tabActive: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/40',
    countIdle: 'text-violet-600/70 dark:text-violet-300/70',
    countActive: 'text-violet-700 dark:text-violet-200',
    swatch: 'bg-violet-500',
  },
  teal: {
    title: 'text-teal-600 dark:text-teal-400',
    value: 'text-teal-600 dark:text-teal-400',
    border: 'border-l-teal-500',
    hover: 'hover:bg-teal-50/60 dark:hover:bg-teal-500/5',
    ring: 'ring-2 ring-teal-500/70',
    selectedBorder: 'border-teal-500/70',
    tabIdle: 'text-teal-700 dark:text-teal-300 border border-transparent hover:bg-teal-500/10',
    tabActive: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/40',
    countIdle: 'text-teal-600/70 dark:text-teal-300/70',
    countActive: 'text-teal-700 dark:text-teal-200',
    swatch: 'bg-teal-500',
  },
  green: {
    title: 'text-emerald-600 dark:text-emerald-400',
    value: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-l-emerald-500',
    hover: 'hover:bg-emerald-50/60 dark:hover:bg-emerald-500/5',
    ring: 'ring-2 ring-emerald-500/70',
    selectedBorder: 'border-emerald-500/70',
    tabIdle: 'text-emerald-700 dark:text-emerald-300 border border-transparent hover:bg-emerald-500/10',
    tabActive: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40',
    countIdle: 'text-emerald-600/70 dark:text-emerald-300/70',
    countActive: 'text-emerald-700 dark:text-emerald-200',
    swatch: 'bg-emerald-500',
  },
  yellow: {
    title: 'text-amber-600 dark:text-amber-400',
    value: 'text-amber-600 dark:text-amber-400',
    border: 'border-l-amber-500',
    hover: 'hover:bg-amber-50/60 dark:hover:bg-amber-500/5',
    ring: 'ring-2 ring-amber-500/70',
    selectedBorder: 'border-amber-500/70',
    tabIdle: 'text-amber-700 dark:text-amber-300 border border-transparent hover:bg-amber-500/10',
    tabActive: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40',
    countIdle: 'text-amber-600/70 dark:text-amber-300/70',
    countActive: 'text-amber-700 dark:text-amber-200',
    swatch: 'bg-amber-500',
  },
  orange: {
    title: 'text-orange-600 dark:text-orange-400',
    value: 'text-orange-600 dark:text-orange-400',
    border: 'border-l-orange-500',
    hover: 'hover:bg-orange-50/60 dark:hover:bg-orange-500/5',
    ring: 'ring-2 ring-orange-500/70',
    selectedBorder: 'border-orange-500/70',
    tabIdle: 'text-orange-700 dark:text-orange-300 border border-transparent hover:bg-orange-500/10',
    tabActive: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/40',
    countIdle: 'text-orange-600/70 dark:text-orange-300/70',
    countActive: 'text-orange-700 dark:text-orange-200',
    swatch: 'bg-orange-500',
  },
  red: {
    title: 'text-rose-600 dark:text-rose-400',
    value: 'text-rose-600 dark:text-rose-400',
    border: 'border-l-rose-500',
    hover: 'hover:bg-rose-50/60 dark:hover:bg-rose-500/5',
    ring: 'ring-2 ring-rose-500/70',
    selectedBorder: 'border-rose-500/70',
    tabIdle: 'text-rose-700 dark:text-rose-300 border border-transparent hover:bg-rose-500/10',
    tabActive: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/40',
    countIdle: 'text-rose-600/70 dark:text-rose-300/70',
    countActive: 'text-rose-700 dark:text-rose-200',
    swatch: 'bg-rose-500',
  },
  pink: {
    title: 'text-pink-600 dark:text-pink-400',
    value: 'text-pink-600 dark:text-pink-400',
    border: 'border-l-pink-500',
    hover: 'hover:bg-pink-50/60 dark:hover:bg-pink-500/5',
    ring: 'ring-2 ring-pink-500/70',
    selectedBorder: 'border-pink-500/70',
    tabIdle: 'text-pink-700 dark:text-pink-300 border border-transparent hover:bg-pink-500/10',
    tabActive: 'bg-pink-500/15 text-pink-700 dark:text-pink-300 border border-pink-500/40',
    countIdle: 'text-pink-600/70 dark:text-pink-300/70',
    countActive: 'text-pink-700 dark:text-pink-200',
    swatch: 'bg-pink-500',
  },
  grey: {
    title: 'text-slate-500 dark:text-slate-400',
    value: 'text-slate-600 dark:text-slate-300',
    border: 'border-l-slate-400',
    hover: 'hover:bg-slate-50 dark:hover:bg-slate-700/40',
    ring: 'ring-2 ring-slate-400/70',
    selectedBorder: 'border-slate-400/70',
    tabIdle: 'text-slate-600 dark:text-slate-300 border border-transparent hover:bg-slate-500/10',
    tabActive: 'bg-slate-500/15 text-slate-700 dark:text-slate-200 border border-slate-400/40',
    countIdle: 'text-slate-500/70 dark:text-slate-300/70',
    countActive: 'text-slate-700 dark:text-slate-200',
    swatch: 'bg-slate-400',
  },
};

export interface ScorecardMetric {
  name: string;
  kind: ScorecardMetricKind;
  fieldKey?: string;
}

export interface TransactionScorecard {
  id: string;
  name: string;
  color: ScorecardColor;
  filterFormula: string;
  metrics: ScorecardMetric[];
}

export const DEMO_TRANSACTION_SCORECARDS: TransactionScorecard[] = [
  {
    id: 'sc_active',
    name: 'Active',
    color: 'blue',
    filterFormula: 'transaction_status="Active"',
    metrics: [
      { name: 'Units', kind: 'count' },
      { name: 'Active List Volume', kind: 'sum', fieldKey: 'list_price' },
    ],
  },
  {
    id: 'sc_pending',
    name: 'Pending',
    color: 'yellow',
    filterFormula: 'transaction_status="Pending"',
    metrics: [
      { name: 'Units', kind: 'count' },
      { name: 'Pending Volume', kind: 'sum', fieldKey: 'sales_price' },
    ],
  },
  {
    id: 'sc_closed',
    name: 'Closed',
    color: 'green',
    filterFormula: 'transaction_status="Closed"',
    metrics: [
      { name: 'Units', kind: 'count' },
      { name: 'Closed Volume', kind: 'sum', fieldKey: 'sales_price' },
    ],
  },
  {
    id: 'sc_cancelled',
    name: 'Cancelled',
    color: 'red',
    filterFormula: 'transaction_status="Cancelled"',
    metrics: [
      { name: 'Units', kind: 'count' },
      { name: 'Cancelled Volume', kind: 'sum', fieldKey: 'sales_price' },
    ],
  },
];

export function emptyScorecard(id: string): TransactionScorecard {
  return {
    id,
    name: '',
    color: 'blue',
    filterFormula: '',
    metrics: [{ name: 'Units', kind: 'count' }],
  };
}

function isColor(value: string): value is ScorecardColor {
  return (SCORECARD_COLORS as readonly string[]).includes(value);
}

function parseMetric(value: unknown): ScorecardMetric | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const name = String(record.name || '').trim();
  const kind = record.kind === 'sum' || record.kind === 'average' || record.kind === 'count' ? record.kind : null;
  if (!name || !kind) return null;
  const fieldKey = String(record.field_key || record.fieldKey || '').trim();
  if (kind === 'count') return { name, kind };
  if (!fieldKey) return null;
  return { name, kind, fieldKey };
}

function parseScorecard(value: unknown): TransactionScorecard | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = String(record.id || '').trim();
  const name = String(record.name || '').trim();
  const color = String(record.color || '').trim();
  const filterFormula = typeof record.filter_formula === 'string'
    ? record.filter_formula
    : typeof record.filterFormula === 'string'
      ? record.filterFormula
      : null;
  const rawMetrics = Array.isArray(record.metrics) ? record.metrics : null;
  if (!id || !name || !isColor(color) || filterFormula === null || !rawMetrics) return null;
  const metrics = rawMetrics.map(parseMetric).filter((metric): metric is ScorecardMetric => metric !== null).slice(0, 2);
  if (metrics.length === 0) return null;
  return { id, name, color, filterFormula, metrics };
}

export function parseTransactionScorecards(value: unknown): TransactionScorecard[] | null {
  if (!Array.isArray(value)) return null;
  return value.map(parseScorecard).filter((card): card is TransactionScorecard => card !== null);
}

export function transactionScorecardsFromSettings(settings: unknown, clientId: string): { scorecards: TransactionScorecard[]; stored: boolean } {
  const record = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? settings as Record<string, unknown>
    : {};
  if (!Object.prototype.hasOwnProperty.call(record, 'transaction_scorecards')) {
    return {
      scorecards: clientId === 'DEMO' ? DEMO_TRANSACTION_SCORECARDS : [],
      stored: false,
    };
  }
  const parsed = parseTransactionScorecards(record.transaction_scorecards);
  if (!parsed) {
    return {
      scorecards: clientId === 'DEMO' ? DEMO_TRANSACTION_SCORECARDS : [],
      stored: false,
    };
  }
  return { scorecards: parsed, stored: true };
}

export function normalizeStatusLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

/** A formula that is only `transaction_status="Active"` or `status="Active"`. */
export function statusNamedByFormula(formula: string): string | null {
  const match = formula.trim().match(/^(?:transaction_status|status)\s*=\s*"([^"]*)"\s*$/i);
  return match ? match[1] : null;
}

function statusKey(value: string): string {
  const norm = normalizeStatusLabel(value);
  return norm === 'canceled' ? 'cancelled' : norm;
}

export function scorecardMatchesStatus(card: TransactionScorecard, label: string, value = label): boolean {
  const name = statusKey(card.name);
  if (!name) return false;
  return name === statusKey(label) || name === statusKey(value);
}

export function builtinStatusColor(label: string, value = ''): ScorecardColor | null {
  const keys = [normalizeStatusLabel(label), normalizeStatusLabel(value)];
  if (keys.includes('active')) return 'blue';
  if (keys.includes('pending')) return 'yellow';
  if (keys.includes('closed')) return 'green';
  if (keys.includes('cancelled') || keys.includes('canceled')) return 'red';
  return null;
}

export function colorForStatus(cards: TransactionScorecard[], label: string, value = label): ScorecardColor | null {
  const match = cards.find((card) => scorecardMatchesStatus(card, label, value));
  return match?.color ?? builtinStatusColor(label, value);
}

function readTransactionField(deal: Record<string, unknown>, name: string): unknown {
  const key = name.toLowerCase() === 'status' ? 'transaction_status' : name;
  const direct = deal[key];
  if (direct !== undefined && direct !== null && direct !== '') return direct;
  const custom = deal.custom_attributes;
  if (custom && typeof custom === 'object' && !Array.isArray(custom)) {
    const nested = (custom as Record<string, unknown>)[key];
    if (nested !== undefined && nested !== null && nested !== '') return nested;
  }
  return direct;
}

function coerceAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const amount = Number(cleaned.endsWith('%') ? cleaned.slice(0, -1) : cleaned);
  return Number.isFinite(amount) ? amount : null;
}

export function qualifyingDeals(
  deals: Record<string, unknown>[],
  card: TransactionScorecard,
  fieldTypes: Record<string, string> = {},
): Record<string, unknown>[] {
  return deals.filter((deal) => dealMatchesDefaultView(deal, card.filterFormula, fieldTypes));
}

export function scorecardMetricValue(deals: Record<string, unknown>[], metric: ScorecardMetric): number | null {
  if (metric.kind === 'count') return deals.length;
  const key = metric.fieldKey?.trim();
  if (!key) return null;
  const numbers: number[] = [];
  for (const deal of deals) {
    const amount = coerceAmount(readTransactionField(deal, key));
    if (amount !== null) numbers.push(amount);
  }
  if (metric.kind === 'sum') return numbers.reduce((total, amount) => total + amount, 0);
  if (numbers.length === 0) return null;
  return numbers.reduce((total, amount) => total + amount, 0) / numbers.length;
}
