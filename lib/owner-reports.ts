/** Aggregations for the Owner Reports dashboards, computed from transaction rows. */

import { repairImportedText } from '@/lib/imported-text';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

export type ReportDeal = {
  id: string;
  status: string;
  side: string;
  agentId: string;
  leadSource: string;
  address: string;
  clientName: string;
  salesPrice: number;
  listPrice: number;
  gciAmount: number;
  gciPerc: number;
  totalCommission: number;
  agentPaid: number;
  /** Sum of Agent Split line dollars (`final_amount`) on the transaction. */
  teamGci: number;
  closingDate: Date | null;
  acceptanceDate: Date | null;
  listDate: Date | null;
  agentSplits: Array<{ id: string; name: string; split: number }>;
  /** Deleted transactions are archived. Reports leave them out. */
  archived: boolean;
  /** Scalar transaction fields, including custom attributes, used to group a leaderboard. */
  attributes: Record<string, string>;
};

export type Totals = {
  units: number;
  volume: number;
  gci: number;
  commission: number;
  agentPaid: number;
  net: number;
  teamGci: number;
};

export type MonthRow = Totals & { key: string; label: string };

export type DateRange = { start: string; end: string };

export type RangePreset =
  | 'today'
  | 'yesterday'
  | 'this-week'
  | 'last-week'
  | 'this-month'
  | 'last-month'
  | 'this-quarter'
  | 'last-quarter'
  | 'this-year'
  | 'last-year'
  | 'last-7'
  | 'last-28'
  | 'last-30'
  | 'ytd'
  | 'custom';

export const DATE_PRESETS: Array<{ id: RangePreset; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this-week', label: 'This Week' },
  { id: 'last-week', label: 'Last Week' },
  { id: 'this-month', label: 'This Month' },
  { id: 'last-month', label: 'Last Month' },
  { id: 'this-quarter', label: 'This Quarter' },
  { id: 'last-quarter', label: 'Last Quarter' },
  { id: 'this-year', label: 'This Year' },
  { id: 'last-year', label: 'Last Year' },
  { id: 'last-7', label: 'Last 7 Days' },
  { id: 'last-28', label: 'Last 28 Days' },
  { id: 'last-30', label: 'Last 30 Days' },
  { id: 'ytd', label: 'Year to Date' },
  { id: 'custom', label: 'Custom' },
];

export const METRICS = [
  { id: 'units', label: 'Units' },
  { id: 'volume', label: 'Volume' },
  { id: 'gci', label: 'GCI' },
  { id: 'commission', label: 'Total Commission' },
  { id: 'net', label: 'Net Commission Income' },
  { id: 'agentPaid', label: 'Agent Paid' },
] as const;

export type MetricId = (typeof METRICS)[number]['id'];

export type AgentRow = Totals & { agentId: string; name: string };

export type SourceRow = Totals & { source: string };

const EMPTY: Totals = { units: 0, volume: 0, gci: 0, commission: 0, agentPaid: 0, net: 0, teamGci: 0 };

function num(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOf(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
}

export function inRange(date: Date | null, range: DateRange): boolean {
  if (!date) return false;
  const key = dateKey(date);
  return key >= range.start && key <= range.end;
}

export function rangeForPreset(preset: RangePreset, today = new Date()): DateRange {
  const end = startOfDay(today);
  let start = startOfDay(today);
  if (preset === 'yesterday') {
    start = addDays(end, -1);
    return { start: dateKey(start), end: dateKey(start) };
  }
  if (preset === 'this-week' || preset === 'last-week') {
    start = addDays(end, -end.getDay());
    if (preset === 'last-week') {
      const lastEnd = addDays(start, -1);
      return { start: dateKey(addDays(lastEnd, -6)), end: dateKey(lastEnd) };
    }
    return { start: dateKey(start), end: dateKey(end) };
  }
  if (preset === 'this-month') start = new Date(end.getFullYear(), end.getMonth(), 1);
  if (preset === 'last-month') {
    start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    const lastEnd = new Date(end.getFullYear(), end.getMonth(), 0);
    return { start: dateKey(start), end: dateKey(lastEnd) };
  }
  if (preset === 'this-quarter' || preset === 'last-quarter') {
    const quarter = Math.floor(end.getMonth() / 3) - (preset === 'last-quarter' ? 1 : 0);
    start = new Date(end.getFullYear(), quarter * 3, 1);
    const quarterEnd = preset === 'last-quarter' ? new Date(end.getFullYear(), quarter * 3 + 3, 0) : end;
    return { start: dateKey(start), end: dateKey(quarterEnd) };
  }
  if (preset === 'this-year') {
    return {
      start: dateKey(new Date(end.getFullYear(), 0, 1)),
      end: dateKey(new Date(end.getFullYear(), 11, 31)),
    };
  }
  if (preset === 'ytd') start = new Date(end.getFullYear(), 0, 1);
  if (preset === 'last-year') return { start: dateKey(new Date(end.getFullYear() - 1, 0, 1)), end: dateKey(new Date(end.getFullYear() - 1, 11, 31)) };
  if (preset === 'last-7') start = addDays(end, -6);
  if (preset === 'last-28') start = addDays(end, -27);
  if (preset === 'last-30') start = addDays(end, -29);
  if (preset === 'today' || preset === 'custom') start = end;
  return { start: dateKey(start), end: dateKey(end) };
}

export function previousYearRange(range: DateRange): DateRange {
  const start = parseKey(range.start);
  const end = parseKey(range.end);
  return {
    start: dateKey(new Date(start.getFullYear() - 1, start.getMonth(), start.getDate())),
    end: dateKey(new Date(end.getFullYear() - 1, end.getMonth(), end.getDate())),
  };
}

export function formatRange(range: DateRange): string {
  const start = parseKey(range.start);
  const end = parseKey(range.end);
  const sameYear = start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
  const endLabel = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startLabel} – ${endLabel}`;
}

/** The same range in numbers, for a line too narrow for formatRange: 1/1 – 10/23/26, or 11/1/25 – 2/28/26. */
export function formatRangeCompact(range: DateRange): string {
  const start = parseKey(range.start);
  const end = parseKey(range.end);
  const sameYear = start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: sameYear ? undefined : '2-digit' });
  const endLabel = end.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' });
  return `${startLabel} – ${endLabel}`;
}

export function isBuyerSide(side: string): boolean {
  const value = side.trim().toLowerCase();
  return value === 'buyer' || value === 'tenant';
}

export function isListingSide(side: string): boolean {
  const value = side.trim().toLowerCase();
  return value === 'seller' || value === 'landlord';
}

function attributeText(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).trim();
    return text || null;
  }
  return null;
}

function dealAttributes(row: Record<string, unknown>, custom: Record<string, unknown>): Record<string, string> {
  const attributes: Record<string, string> = {};
  const write = (source: Record<string, unknown>) => {
    Object.entries(source).forEach(([key, value]) => {
      if (key === 'custom_attributes') return;
      const text = attributeText(value);
      if (text) attributes[key] = text;
    });
  };
  write(row);
  write(custom);
  return attributes;
}

export function teamGciByTransaction(items: Array<{ section?: unknown; transaction_id?: unknown; final_amount?: unknown }>): Map<string, number> {
  const totals = new Map<string, number>();
  items.forEach((item) => {
    const section = String(item.section || '').toUpperCase().replace(/[\s_]+/g, '');
    if (section !== 'AGENTSPLIT') return;
    const id = String(item.transaction_id || '');
    if (!id) return;
    const amount = Number(item.final_amount);
    if (!Number.isFinite(amount)) return;
    totals.set(id, (totals.get(id) || 0) + amount);
  });
  return totals;
}

export function normalizeDeal(row: Record<string, unknown>): ReportDeal {
  const custom = row.custom_attributes && typeof row.custom_attributes === 'object' && !Array.isArray(row.custom_attributes)
    ? row.custom_attributes as Record<string, unknown>
    : {};
  const agents = Array.isArray(custom.agents) ? custom.agents : [];
  return {
    id: String(row.id || ''),
    status: String(row.transaction_status || ''),
    side: String(row.transaction_side || ''),
    agentId: String(row.agent_id || ''),
    leadSource: String(row.lead_source || '').trim() || 'Unspecified',
    address: String(row.property_address || ''),
    clientName: repairImportedText(String(row.client_name || '')),
    salesPrice: num(row.sales_price),
    listPrice: num(row.list_price),
    gciAmount: num(row.gci_amount),
    gciPerc: num(row.gci_perc),
    totalCommission: num(row.total_commission),
    agentPaid: num(custom.gross_agent_paid_income),
    teamGci: 0,
    closingDate: dateOf(row.closing_date),
    acceptanceDate: dateOf(row.acceptance_date),
    listDate: dateOf(row.list_date),
    agentSplits: agents.flatMap((agent) => {
      if (!agent || typeof agent !== 'object') return [];
      const record = agent as Record<string, unknown>;
      const name = String(record.name || '').trim();
      if (!name) return [];
      return [{ id: String(record.id || name), name, split: num(record.splitVal) }];
    }),
    archived: row.archived === true || row.permanently_deleted === true,
    attributes: dealAttributes(row, custom),
  };
}

/** Deleted transactions stay out of every report, including ones still waiting to be restored. */
export function reportableDeals(deals: ReportDeal[]): ReportDeal[] {
  return deals.filter((deal) => deal.archived !== true);
}

export type ReportPayment = {
  transactionId: string;
  agentId: string;
  entityId: string;
  payeeType: string;
  amount: number;
};

export type OwnerMonthRow = {
  key: string;
  label: string;
  closedUnits: number;
  closedVolume: number;
  closedCommission: number;
  closedNet: number;
  listingsTaken: number;
  listingsPended: number;
  listingsClosed: number;
  buyersPended: number;
  buyersClosed: number;
  pendingUnits: number;
  pendingVolume: number;
  pendingCommission: number;
  pendingNet: number;
};

function blankOwnerMonth(key: string, label: string): OwnerMonthRow {
  return {
    key,
    label,
    closedUnits: 0,
    closedVolume: 0,
    closedCommission: 0,
    closedNet: 0,
    listingsTaken: 0,
    listingsPended: 0,
    listingsClosed: 0,
    buyersPended: 0,
    buyersClosed: 0,
    pendingUnits: 0,
    pendingVolume: 0,
    pendingCommission: 0,
    pendingNet: 0,
  };
}

export type ProductionGrain = 'day' | 'week' | 'month';

/** Day rows when the range is 62 days or shorter, otherwise month rows. */
export function automaticProductionGrain(range: DateRange): 'day' | 'month' {
  return periodSpan(range).daily ? 'day' : 'month';
}

/** Week rows are offered for a month, a quarter, or a custom range of at most four months. */
export function weekGrainAllowed(preset: RangePreset, range: DateRange): boolean {
  if (preset === 'this-month' || preset === 'last-month' || preset === 'this-quarter' || preset === 'last-quarter') return true;
  if (preset !== 'custom') return false;
  const start = parseKey(range.start);
  const end = parseKey(range.end);
  const limit = new Date(start.getFullYear(), start.getMonth() + 4, start.getDate());
  return dateKey(end) <= dateKey(limit);
}

export function resolveProductionGrain(choice: ProductionGrain | null, preset: RangePreset, range: DateRange): ProductionGrain {
  const automatic = automaticProductionGrain(range);
  if (!choice || !weekGrainAllowed(preset, range)) return automatic;
  return choice;
}

function shiftDateKey(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  return dateKey(new Date((year || 1970) - 1, (month || 1) - 1, day || 1));
}

/** The same calendar span one year earlier. A week keeps both of its dates. */
export function priorProductionKey(key: string): string {
  if (key.includes(':')) {
    const [start, end] = key.split(':');
    return `${shiftDateKey(start)}:${shiftDateKey(end)}`;
  }
  const parts = key.split('-').map(Number);
  if (parts.length >= 3) return shiftDateKey(key);
  return `${parts[0] - 1}-${String(parts[1]).padStart(2, '0')}`;
}

export function productionKeyMatches(date: Date, key: string): boolean {
  const day = dateKey(date);
  if (key.includes(':')) {
    const [start, end] = key.split(':');
    return day >= start && day <= end;
  }
  if (key.split('-').length >= 3) return day === key;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` === key;
}

function weekDate(date: Date, withYear: boolean): string {
  const month = MONTHS[date.getMonth()].slice(0, 3);
  const day = String(date.getDate()).padStart(2, '0');
  return withYear ? `${month} ${day}, ${date.getFullYear()}` : `${month} ${day}`;
}

/** Jul 01 - Jul 04. A week that crosses a year keeps the year on each date. */
function weekLabel(start: Date, end: Date): string {
  const crossYears = start.getFullYear() !== end.getFullYear();
  return `${weekDate(start, crossYears)} - ${weekDate(end, crossYears)}`;
}

/** Banner text for a selected production row, with the year included. */
export function formatProductionKey(key: string): string {
  if (key.includes(':')) {
    const [startKey, endKey] = key.split(':');
    const start = parseKey(startKey);
    const end = parseKey(endKey);
    if (start.getFullYear() !== end.getFullYear()) return weekLabel(start, end);
    return `${weekLabel(start, end)}, ${start.getFullYear()}`;
  }
  const parts = key.split('-').map(Number);
  if (parts.length >= 3) return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  return new Date(parts[0], parts[1] - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function dayColumns(start: Date, end: Date, spanYears: boolean): { key: string; label: string }[] {
  const dayCount = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const columns: { key: string; label: string }[] = [];
  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = addDays(start, offset);
    columns.push({
      key: dateKey(date),
      label: date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: spanYears ? 'numeric' : undefined }),
    });
  }
  return columns;
}

function monthColumns(start: Date, end: Date, spanYears: boolean): { key: string; label: string }[] {
  const columns: { key: string; label: string }[] = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= last) {
    columns.push({
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      label: spanYears ? `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}` : MONTHS[cursor.getMonth()],
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return columns;
}

/** Weeks start on Sunday. A week that crosses the range edge keeps only the days inside the range. */
function weekColumns(start: Date, end: Date): { key: string; label: string }[] {
  const columns: { key: string; label: string }[] = [];
  let cursor = start;
  while (cursor <= end) {
    const saturday = addDays(cursor, 6 - cursor.getDay());
    const bucketEnd = saturday < end ? saturday : end;
    columns.push({
      key: `${dateKey(cursor)}:${dateKey(bucketEnd)}`,
      label: weekLabel(cursor, bucketEnd),
    });
    cursor = addDays(bucketEnd, 1);
  }
  return columns;
}

function productionColumns(range: DateRange, grain: ProductionGrain): { key: string; label: string }[] {
  const start = parseKey(range.start);
  const end = parseKey(range.end);
  const spanYears = start.getFullYear() !== end.getFullYear();
  if (grain === 'week') return weekColumns(start, end);
  if (grain === 'day') return dayColumns(start, end, spanYears);
  return monthColumns(start, end, spanYears);
}

export function productionPeriodKey(date: Date, range: DateRange, grain: ProductionGrain): string {
  if (grain === 'day') return dateKey(date);
  if (grain === 'month') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const day = dateKey(date);
  const match = weekColumns(parseKey(range.start), parseKey(range.end)).find((column) => {
    const [start, end] = column.key.split(':');
    return day >= start && day <= end;
  });
  return match?.key ?? '';
}

/** One row for each production period in the range, including periods with no transactions. */
export function ownerMonthTable(
  deals: ReportDeal[],
  payments: ReportPayment[],
  teamLeadIds: Set<string>,
  range: DateRange,
  grain: ProductionGrain = automaticProductionGrain(range),
): OwnerMonthRow[] {
  const rows: OwnerMonthRow[] = [];
  const index = new Map<string, OwnerMonthRow>();
  productionColumns(range, grain).forEach((column) => {
    const row = blankOwnerMonth(column.key, column.label);
    rows.push(row);
    index.set(column.key, row);
  });

  const netByTransaction = new Map<string, number>();
  payments.forEach((payment) => {
    if (!teamLeadIds.has(payment.agentId)) return;
    netByTransaction.set(payment.transactionId, (netByTransaction.get(payment.transactionId) || 0) + payment.amount);
  });

  const place = (date: Date | null, apply: (row: OwnerMonthRow) => void) => {
    if (!inRange(date, range) || !date) return;
    const key = productionPeriodKey(date, range, grain);
    const row = index.get(key);
    if (row) apply(row);
  };

  reportableDeals(deals).forEach((deal) => {
    const status = deal.status.trim().toLowerCase();
    const side = deal.side.trim().toLowerCase();
    const teamLeadPaid = netByTransaction.get(deal.id) || 0;
    if (status === 'closed') {
      place(deal.closingDate, (row) => {
        row.closedUnits += 1;
        row.closedVolume += deal.salesPrice;
        row.closedCommission += deal.totalCommission;
        row.closedNet += teamLeadPaid;
      });
    }
    if (side === 'seller') {
      place(deal.listDate, (row) => { row.listingsTaken += 1; });
      place(deal.acceptanceDate, (row) => { row.listingsPended += 1; });
      if (status === 'closed') {
        place(deal.closingDate, (row) => { row.listingsClosed += 1; });
      }
    }
    if (side === 'buyer') {
      place(deal.acceptanceDate, (row) => { row.buyersPended += 1; });
      if (status === 'closed') {
        place(deal.closingDate, (row) => { row.buyersClosed += 1; });
      }
    }
    if (status === 'pending') {
      place(deal.closingDate, (row) => {
        row.pendingUnits += 1;
        row.pendingVolume += deal.salesPrice;
        row.pendingCommission += deal.totalCommission;
        row.pendingNet += teamLeadPaid;
      });
    }
  });

  return rows;
}

export type ProductionDrilldownItem = {
  deal: ReportDeal;
  date: Date | null;
  net: number;
};

/** All records/transactions that make up a clicked number on the production table. */
export function ownerProductionTransactions(
  deals: ReportDeal[],
  payments: ReportPayment[],
  teamLeadIds: Set<string>,
  range: DateRange,
  grain: ProductionGrain,
  rowKey: string,
  metric: keyof OwnerMonthRow,
): ProductionDrilldownItem[] {
  const netByTransaction = new Map<string, number>();
  payments.forEach((payment) => {
    if (!teamLeadIds.has(payment.agentId)) return;
    netByTransaction.set(payment.transactionId, (netByTransaction.get(payment.transactionId) || 0) + payment.amount);
  });

  const matchesPeriod = (date: Date | null): boolean => {
    if (!date || !inRange(date, range)) return false;
    if (rowKey === 'total') return true;
    return productionPeriodKey(date, range, grain) === rowKey;
  };

  const results: ProductionDrilldownItem[] = [];

  reportableDeals(deals).forEach((deal) => {
    const status = deal.status.trim().toLowerCase();
    const side = deal.side.trim().toLowerCase();
    const net = netByTransaction.get(deal.id) || 0;

    switch (metric) {
      case 'closedUnits':
      case 'closedVolume':
      case 'closedCommission':
        if (status === 'closed' && matchesPeriod(deal.closingDate)) {
          results.push({ deal, date: deal.closingDate, net });
        }
        break;
      case 'closedNet':
        if (status === 'closed' && matchesPeriod(deal.closingDate)) {
          if (net !== 0) {
            results.push({ deal, date: deal.closingDate, net });
          }
        }
        break;
      case 'listingsTaken':
        if (side === 'seller' && matchesPeriod(deal.listDate)) {
          results.push({ deal, date: deal.listDate, net });
        }
        break;
      case 'listingsPended':
        if (side === 'seller' && matchesPeriod(deal.acceptanceDate)) {
          results.push({ deal, date: deal.acceptanceDate, net });
        }
        break;
      case 'listingsClosed':
        if (side === 'seller' && status === 'closed' && matchesPeriod(deal.closingDate)) {
          results.push({ deal, date: deal.closingDate, net });
        }
        break;
      case 'buyersPended':
        if (side === 'buyer' && matchesPeriod(deal.acceptanceDate)) {
          results.push({ deal, date: deal.acceptanceDate, net });
        }
        break;
      case 'buyersClosed':
        if (side === 'buyer' && status === 'closed' && matchesPeriod(deal.closingDate)) {
          results.push({ deal, date: deal.closingDate, net });
        }
        break;
      case 'pendingUnits':
      case 'pendingVolume':
      case 'pendingCommission':
        if (status === 'pending' && matchesPeriod(deal.closingDate)) {
          results.push({ deal, date: deal.closingDate, net });
        }
        break;
      case 'pendingNet':
        if (status === 'pending' && matchesPeriod(deal.closingDate)) {
          if (net !== 0) {
            results.push({ deal, date: deal.closingDate, net });
          }
        }
        break;
      default:
        break;
    }
  });

  return results;
}

export function teamLeadNet(
  payments: ReportPayment[],
  closed: ReportDeal[],
  teamLeadIds: Set<string>,
): number {
  const closedIds = new Set(closed.map((deal) => deal.id));
  return payments.reduce((total, payment) => {
    if (!closedIds.has(payment.transactionId) || !teamLeadIds.has(payment.agentId)) return total;
    return total + payment.amount;
  }, 0);
}

export function addTotals(target: Totals, deal: ReportDeal) {
  target.units += 1;
  target.volume += deal.salesPrice;
  target.gci += deal.gciAmount;
  target.commission += deal.totalCommission;
  target.agentPaid += deal.agentPaid;
  target.teamGci += deal.teamGci;
  target.net += deal.totalCommission - deal.agentPaid;
}

export function closedInRange(deals: ReportDeal[], range: DateRange): ReportDeal[] {
  return reportableDeals(deals).filter((deal) => deal.status.toLowerCase() === 'closed' && inRange(deal.closingDate, range));
}

export function pendingInRange(deals: ReportDeal[], range: DateRange): ReportDeal[] {
  return reportableDeals(deals).filter((deal) => {
    if (deal.status.toLowerCase() !== 'pending') return false;
    return inRange(deal.acceptanceDate, range) || inRange(deal.closingDate, range);
  });
}

/** Closed and Pending deals whose closing date is inside the range. */
export function closedOrPendingClosing(deals: ReportDeal[], range: DateRange): ReportDeal[] {
  return closedOrPendingOnDate(deals, range, 'closing');
}

export type LeaderboardDate = 'closing' | 'acceptance';

/** Closed and Pending deals whose closing date or acceptance date is inside the range. */
export function closedOrPendingOnDate(deals: ReportDeal[], range: DateRange, basis: LeaderboardDate): ReportDeal[] {
  return reportableDeals(deals).filter((deal) => {
    const status = deal.status.trim().toLowerCase();
    const date = basis === 'acceptance' ? deal.acceptanceDate : deal.closingDate;
    return (status === 'closed' || status === 'pending') && inRange(date, range);
  });
}

export function listingsTaken(deals: ReportDeal[], range: DateRange): ReportDeal[] {
  return reportableDeals(deals).filter((deal) => isListingSide(deal.side) && deal.status.toLowerCase() !== 'cancelled' && inRange(deal.listDate, range));
}

function blankPoint(key: string, label: string): MonthRow {
  return { key, label, units: 0, volume: 0, gci: 0, commission: 0, agentPaid: 0, net: 0, teamGci: 0 };
}

function periodSpan(range: DateRange): { start: Date; end: Date; daily: boolean } {
  const start = parseKey(range.start);
  const end = parseKey(range.end);
  const dayCount = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  return { start, end, daily: dayCount <= 62 };
}

export function periodColumns(range: DateRange): { key: string; label: string }[] {
  const { start, end, daily } = periodSpan(range);
  if (daily) {
    const dayCount = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    const columns: { key: string; label: string }[] = [];
    for (let offset = 0; offset < dayCount; offset += 1) {
      const date = addDays(start, offset);
      columns.push({ key: dateKey(date), label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) });
    }
    return columns;
  }
  const columns: { key: string; label: string }[] = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  const spanYears = start.getFullYear() !== end.getFullYear();
  while (cursor <= last) {
    columns.push({
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      label: cursor.toLocaleDateString(undefined, { month: 'short', year: spanYears ? 'numeric' : undefined }),
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return columns;
}

export function periodKey(date: Date, range: DateRange): string {
  if (periodSpan(range).daily) return dateKey(date);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function seriesBuckets(deals: ReportDeal[], dateOfDeal: (deal: ReportDeal) => Date | null, range: DateRange): MonthRow[] {
  const rows = periodColumns(range).map((column) => blankPoint(column.key, column.label));
  const index = new Map(rows.map((row) => [row.key, row]));
  reportableDeals(deals).forEach((deal) => {
    const date = dateOfDeal(deal);
    if (!date || !inRange(date, range)) return;
    const row = index.get(periodKey(date, range));
    if (row) addTotals(row, deal);
  });
  return rows;
}

export function metricValue(row: Totals, metric: MetricId): number {
  return row[metric];
}

export function formatMetric(value: number, metric: MetricId): string {
  if (metric === 'units') return unitsLabel(value);
  return money(value);
}

export function sumRows(rows: Totals[]): Totals {
  return rows.reduce((total, row) => ({
    units: total.units + row.units,
    volume: total.volume + row.volume,
    gci: total.gci + row.gci,
    commission: total.commission + row.commission,
    agentPaid: total.agentPaid + row.agentPaid,
    net: total.net + row.net,
    teamGci: total.teamGci + row.teamGci,
  }), { ...EMPTY });
}

export function byAgent(deals: ReportDeal[], names: Map<string, string>): AgentRow[] {
  const grouped = new Map<string, AgentRow>();
  reportableDeals(deals).forEach((deal) => {
    const agentId = deal.agentId || 'unassigned';
    const current = grouped.get(agentId) || {
      agentId,
      name: names.get(agentId) || 'Unassigned',
      ...EMPTY,
    };
    addTotals(current, deal);
    grouped.set(agentId, current);
  });
  return [...grouped.values()].sort((a, b) => b.volume - a.volume || b.units - a.units);
}

export function bySource(deals: ReportDeal[]): SourceRow[] {
  const grouped = new Map<string, SourceRow>();
  reportableDeals(deals).forEach((deal) => {
    const current = grouped.get(deal.leadSource) || { source: deal.leadSource, ...EMPTY };
    addTotals(current, deal);
    grouped.set(deal.leadSource, current);
  });
  return [...grouped.values()].sort((a, b) => b.gci - a.gci || b.units - a.units);
}

export function agentPaidRows(deals: ReportDeal[]): AgentRow[] {
  const grouped = new Map<string, AgentRow>();
  reportableDeals(deals).forEach((deal) => {
    const splits = deal.agentSplits.filter((agent) => agent.split > 0);
    const weight = splits.reduce((total, agent) => total + agent.split, 0);
    const recipients = splits.length > 0 ? splits : [{ id: deal.agentId || 'unassigned', name: '', split: 1 }];
    const basis = weight > 0 ? weight : 1;
    recipients.forEach((agent) => {
      const share = agent.split / basis;
      const id = agent.id || agent.name || 'unassigned';
      const current = grouped.get(id) || {
        agentId: id,
        name: agent.name || 'Unassigned',
        ...EMPTY,
      };
      current.units += share;
      current.volume += deal.salesPrice * share;
      current.gci += deal.gciAmount * share;
      current.commission += deal.totalCommission * share;
      current.agentPaid += deal.agentPaid * share;
      current.net += (deal.totalCommission - deal.agentPaid) * share;
      grouped.set(id, current);
    });
  });
  return [...grouped.values()].sort((a, b) => b.agentPaid - a.agentPaid || b.volume - a.volume);
}

export function money(value: number, digits = 0): string {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: digits });
}

/** Scorecard dollars are rounded to the nearest dollar, with no cents. */
export function fullMoney(value: number): string {
  return Math.round(value).toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function compactMoney(value: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }).format(Math.round(value));
}

export function percent(part: number, whole: number): string {
  if (!whole) return '—';
  return `${((part / whole) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

export function unitsLabel(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: value % 1 === 0 ? 0 : 1 });
}

export type ReportDefinition = {
  id: string;
  name: string;
  group: string;
  ready: boolean;
  note?: string;
  /** What the report shows and which transactions it counts, for the info icon beside its title. */
  about: string;
};

/** Section headings of the Owner Reports menu, in display order. */
export const OWNER_REPORT_GROUPS = ['Your Business', 'Your Agents', 'Transactions', 'Add-ons', 'My Custom Reports'];

export const OWNER_REPORTS: ReportDefinition[] = [
  { id: 'owner-summary', name: 'Owner Summary', group: 'Your Business', ready: true, about: 'Your brokerage’s bottom line for the date range. Total commission minus the cost of sales (agent and other payouts) gives net commission income; operating expenses then give net income, ROI, and the net income to total commission ratio. Below are average listing and buyer figures and month-over-month production. Every figure compares with the same dates last year.' },
  { id: 'operating-expenses', name: 'Operating Expenses', group: 'Your Business', ready: false, note: 'Operating expenses are not recorded in Soleox yet, so net income and expense ROI stay out of this report.', about: 'Your operating expenses by month and category, and the return they produce. Available once expenses are recorded in Soleox.' },
  { id: 'lead-source-roi', name: 'Lead Source ROI Analysis', group: 'Your Business', ready: false, note: 'Lead spend is not recorded yet. The lead source leaderboard shows production by source.', about: 'What each lead source costs against the commission it brings in. Available once lead spend is recorded in Soleox.' },
  { id: 'lead-source-leaderboard', name: 'Leaderboard by Date', group: 'Your Business', ready: true, about: 'Ranks closed and pending transactions by any field you pick in the title (lead source by default), side by side by sales volume and by units, with the change from the same dates last year. The date in the title chooses closing date or pending date.' },
  { id: 'team-performance', name: 'Team Performance', group: 'Your Agents', ready: true, about: 'Your team’s closed and pending production by month against the same months last year: sales volume, gross commission income, units, team commission, average sales price, and gross commission percentage. Click Total, Closed, or Pending to focus every chart on that status.' },
  { id: 'net-commission-income', name: 'Agent Earnings', group: 'Your Agents', ready: true, about: 'What each agent earned: their payment amounts on closed and pending transactions, by month, by closing date. Earnings Type can add post-split dollars an agent sends to equity or income entities. Click any amount for a timeline and the transactions behind it.' },
  { id: 'team-caps', name: 'Caps', group: 'Your Agents', ready: true, about: 'Where each agent stands on a cap in their current or previous cap year: closed and pending contributions, the goal, and what is left. Team Caps and Agent Caps come from Settings > Caps; Plan Caps are the capped lines of each agent’s Commission Plan, with the agent’s own plan cap (or Cap Amounts override), cap year (Cap Year Start), and starting balance. Each agent’s cap year starts on their own date. Click an agent to see the transactions that count toward the cap.' },
  { id: 'transaction-list', name: 'Transaction List', group: 'Transactions', ready: true, about: 'Every transaction closing in the date range, plus pending ones that went pending in it, with the main details of each. Click a status in a scorecard to narrow the table to it.' },
  { id: 'transaction-map', name: 'Transaction Map', group: 'Transactions', ready: true, about: 'Each transaction as a bubble at its property address, sized by sales price and colored by status, side, or agent. The map opens on the area with the most deals; Show All frames every bubble. Addresses are placed with the US Census geocoder.' },
  { id: 'goal-assessment', name: 'Goal Assessment', group: 'Add-ons', ready: false, note: 'Goals are not recorded yet, so there is no target to compare with production.', about: 'Production against each agent’s and the team’s goals. Available once goals are recorded in Soleox.' },
  { id: 'lead-conversion', name: 'Lead Conversion Funnel', group: 'Add-ons', ready: false, note: 'Lead counts are not recorded yet, so conversion from lead to closing cannot be calculated.', about: 'How leads move from first contact to closing. Available once lead counts are recorded in Soleox.' },
  { id: 'team-productivity', name: 'Team Productivity', group: 'Add-ons', ready: true, about: 'One metric of your choice for closed transactions by month against last year, with each agent’s totals below.' },
  { id: 'daily-management', name: 'Daily Management Report', group: 'My Custom Reports', ready: true, about: 'A daily snapshot of the date range: transactions closed, transactions that went pending, and listings taken.' },
  { id: 'net-agent-leaderboard', name: 'NET Agent Leaderboard', group: 'My Custom Reports', ready: true, about: 'Agents ranked by what they were paid on closed transactions in the date range, with each deal’s payment split across the agents on it.' },
  { id: 'listings-by-list-date', name: 'Listings by List Date', group: 'My Custom Reports', ready: true, about: 'Every listing-side transaction with a list date in the date range, whatever its status, with list and sales prices, over or under asking, and days on market. Sales volume, average sales price, and sold vs. asking count closed and pending listings; sold vs. asking leaves out listings with no list price recorded. Days on market (DOM) run from the list date to the pending date. Click a status in the Listings tile to narrow the table to it.' },
  { id: 'price-change', name: 'Sold vs. List Price', group: 'My Custom Reports', ready: true, about: 'How closed and pending listings sold against their list price: the price change on each (the sales price minus the list price), how many sold over or under asking, and the average change by month. Only listing-side transactions closing in the date range with both a list price and a sales price count. Every comparison is with the same dates last year. Click a column to sort; the address opens the transaction.' },
];
