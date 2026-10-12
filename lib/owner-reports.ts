/** Aggregations for the Owner Reports dashboards, computed from transaction rows. */

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
  { id: 'this-week', label: 'This week' },
  { id: 'last-week', label: 'Last week' },
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'this-quarter', label: 'This quarter' },
  { id: 'last-quarter', label: 'Last quarter' },
  { id: 'this-year', label: 'This year' },
  { id: 'last-year', label: 'Last year' },
  { id: 'last-7', label: 'Last 7 days' },
  { id: 'last-28', label: 'Last 28 days' },
  { id: 'last-30', label: 'Last 30 days' },
  { id: 'ytd', label: 'Year to date' },
  { id: 'custom', label: 'Custom' },
];

export const METRICS = [
  { id: 'units', label: 'Units' },
  { id: 'volume', label: 'Volume' },
  { id: 'gci', label: 'GCI' },
  { id: 'commission', label: 'Total commission' },
  { id: 'net', label: 'Net commission income' },
  { id: 'agentPaid', label: 'Agent paid' },
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
    clientName: String(row.client_name || ''),
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

/** Every calendar month touched by the range, including months with no transactions. */
export function ownerMonthTable(
  deals: ReportDeal[],
  payments: ReportPayment[],
  teamLeadIds: Set<string>,
  range: DateRange,
): OwnerMonthRow[] {
  const start = parseKey(range.start);
  const end = parseKey(range.end);
  const spanYears = start.getFullYear() !== end.getFullYear();
  const rows: OwnerMonthRow[] = [];
  const index = new Map<string, OwnerMonthRow>();
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= last) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    const label = spanYears ? `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}` : MONTHS[cursor.getMonth()];
    const row = blankOwnerMonth(key, label);
    rows.push(row);
    index.set(key, row);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  const netByTransaction = new Map<string, number>();
  payments.forEach((payment) => {
    if (!teamLeadIds.has(payment.agentId)) return;
    netByTransaction.set(payment.transactionId, (netByTransaction.get(payment.transactionId) || 0) + payment.amount);
  });

  const place = (date: Date | null, apply: (row: OwnerMonthRow) => void) => {
    if (!inRange(date, range) || !date) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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
      place(deal.closingDate, (row) => { row.listingsClosed += 1; });
    }
    if (side === 'buyer') {
      place(deal.acceptanceDate, (row) => { row.buyersPended += 1; });
      place(deal.closingDate, (row) => { row.buyersClosed += 1; });
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
};

export const OWNER_REPORTS: ReportDefinition[] = [
  { id: 'owner-summary', name: 'Owner Summary', group: 'Your Business', ready: true },
  { id: 'operating-expenses', name: 'Operating Expenses', group: 'Your Business', ready: false, note: 'Operating expenses are not recorded in Soleox yet, so net income and expense ROI stay out of this report.' },
  { id: 'lead-source-roi', name: 'Lead Source ROI Analysis', group: 'Your Business', ready: false, note: 'Lead spend is not recorded yet. The lead source leaderboard shows production by source.' },
  { id: 'lead-source-leaderboard', name: 'Leaderboard by Date', group: 'Your Business', ready: true },
  { id: 'team-performance', name: 'Team Performance', group: 'Your Agents', ready: true },
  { id: 'net-commission-income', name: 'Agent Earnings', group: 'Your Agents', ready: true },
  { id: 'net-commission-analysis', name: 'Net Commission Income Analysis', group: 'Your Agents', ready: true },
  { id: 'agent-post-splits', name: 'Agent Post-splits', group: 'Your Agents', ready: true },
  { id: 'transaction-list', name: 'Transaction List', group: 'Transactions', ready: true },
  { id: 'transaction-map', name: 'Transaction Map', group: 'Transactions', ready: false, note: 'Transactions do not have map coordinates yet.' },
  { id: 'transaction-detail', name: 'Transaction Detail', group: 'Transactions', ready: true },
  { id: 'goal-assessment', name: 'Goal Assessment', group: 'Add-ons', ready: false, note: 'Goals are not recorded yet, so there is no target to compare with production.' },
  { id: 'lead-conversion', name: 'Lead Conversion Funnel', group: 'Add-ons', ready: false, note: 'Lead counts are not recorded yet, so conversion from lead to closing cannot be calculated.' },
  { id: 'team-productivity', name: 'Team Productivity', group: 'Add-ons', ready: true },
  { id: 'daily-management', name: 'Daily Management Report', group: 'My Custom Reports', ready: true },
  { id: 'net-agent-leaderboard', name: 'NET Agent Leaderboard', group: 'My Custom Reports', ready: true },
  { id: 'listings-by-list-date', name: 'Listings by List Date', group: 'My Custom Reports', ready: true },
  { id: 'price-change', name: 'Price Change Analysis', group: 'My Custom Reports', ready: true },
];
