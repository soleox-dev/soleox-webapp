import { anniversaryStart } from '@/lib/agent-allocations';
import { dateKey, type ReportDeal } from '@/lib/owner-reports';

export type TeamCapDefinition = {
  id: string;
  name: string;
  enabled: boolean;
  /** Team and Agent Caps come from Settings > Caps; Plan caps from Commission Plans (lib/plan-cap-report.ts). */
  kind: 'team' | 'agent' | 'plan';
  splitPercentFieldKey: string | null;
  capAmountFieldKey: string | null;
  resetDateFieldKey: string | null;
  recipientAgentId: string | null;
  entityId: string | null;
  hideOverAllocations: boolean;
};

export type CapContribution = {
  agentId: string;
  teamCapId: string;
  amount: number;
  periodStart: string | null;
  transactionId: string;
};

export type AgentProfile = {
  id: string;
  name: string;
  archived: boolean;
  fields: Record<string, string>;
};

export type CapDealLine = {
  transactionId: string;
  status: string;
  primaryAgent: string;
  side: string;
  address: string;
  closingDate: string | null;
  salesPrice: number;
  leadSource: string;
  amount: number;
  cumulative: number;
  pending: boolean;
  /** The agent was paid on this transaction but it added nothing to this cap. */
  paidOnly?: boolean;
};

export type CapStanding = {
  agentId: string;
  agentName: string;
  rank: number;
  resetDate: string | null;
  start: string | null;
  end: string | null;
  closed: number;
  pending: number;
  total: number;
  goal: number | null;
  left: number | null;
  percent: number | null;
  lines: CapDealLine[];
  /** Transactions in the cap year where the agent was paid and nothing went to this cap. */
  paidLines: CapDealLine[];
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calendarDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (us) return `${us[3]}-${pad(Number(us[1]))}-${pad(Number(us[2]))}`;
  return null;
}

export function moneyField(value: string | null | undefined): number | null {
  if (value == null || value.trim() === '') return null;
  const cleaned = value.replace(/[$,\s]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '—') return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

function addYears(iso: string, years: number): string | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!parts) return null;
  const year = Number(parts[1]) + years;
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(Math.min(day, last))}`;
}

function dayBefore(iso: string): string | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!parts) return null;
  const date = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function shiftAsOf(asOf: string, yearsBack: number): string {
  return addYears(asOf, -yearsBack) || asOf;
}

/** The cap year that contains asOf, from the agent's reset date. The end is the day before the next anniversary. */
export function capYearWindow(resetDate: string | null, asOf: string): { start: string; end: string } | null {
  const start = anniversaryStart(resetDate, asOf);
  if (!start) return null;
  const next = addYears(start, 1);
  const end = next ? dayBefore(next) : null;
  if (!end) return null;
  return { start, end };
}

export function formatUs(iso: string | null): string {
  if (!iso) return '—';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return '—';
  return `${month}/${day}/${year}`;
}

export function formatAnniversary(iso: string | null): string {
  if (!iso) return '—';
  const parts = iso.split('-');
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!month || !day) return '—';
  return `${MONTHS_SHORT[month - 1]} ${day}`;
}

export function formatLong(iso: string): string {
  const [year, month, day] = iso.split('-');
  const name = MONTHS[Number(month) - 1];
  if (!name || !day || !year) return iso;
  return `${name} ${Number(day)}, ${year}`;
}

export function capMoney(value: number): string {
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function inWindow(iso: string | null, window: { start: string; end: string }): boolean {
  if (!iso) return false;
  return iso >= window.start && iso <= window.end;
}

function dealIso(deal: ReportDeal): string | null {
  if (deal.closingDate) return dateKey(deal.closingDate);
  if (deal.acceptanceDate) return dateKey(deal.acceptanceDate);
  return null;
}

function windowFromPeriods(periods: string[], asOf: string): { start: string; end: string } | null {
  const containing = periods.find((start) => {
    const next = addYears(start, 1);
    return next ? asOf >= start && asOf < next : false;
  });
  if (!containing) return null;
  const next = addYears(containing, 1);
  const end = next ? dayBefore(next) : null;
  if (!end) return null;
  return { start: containing, end };
}

export function teamCapStandings(args: {
  cap: TeamCapDefinition;
  agents: AgentProfile[];
  contributions: CapContribution[];
  deals: Map<string, ReportDeal>;
  names: Map<string, string>;
  asOf: string;
  /** Transaction ids where each agent received a payment. */
  paid?: Map<string, Set<string>>;
}): CapStanding[] {
  const { cap, agents, contributions, deals, names, asOf, paid } = args;
  const byAgent = new Map<string, CapContribution[]>();
  contributions.forEach((row) => {
    if (row.teamCapId !== cap.id || !row.agentId) return;
    const list = byAgent.get(row.agentId) || [];
    list.push(row);
    byAgent.set(row.agentId, list);
  });

  const profiles = new Map(agents.map((agent) => [agent.id, agent]));
  const ids = new Set<string>([...profiles.keys(), ...byAgent.keys()]);
  const standings: CapStanding[] = [];

  ids.forEach((agentId) => {
    const profile = profiles.get(agentId);
    const rows = byAgent.get(agentId) || [];
    const isRecipient = cap.recipientAgentId === agentId;
    const goalText = profile && cap.capAmountFieldKey ? profile.fields[cap.capAmountFieldKey] : undefined;
    if (goalText == null || goalText.trim() === '') return;
    const goal = moneyField(goalText);
    if (cap.kind === 'agent' && goal != null && Math.abs(goal) < 0.005) return;
    const percentText = profile && cap.splitPercentFieldKey ? profile.fields[cap.splitPercentFieldKey] : undefined;
    const hasPercent = percentText != null && percentText.trim() !== '';
    const hasGoal = goal != null && goal > 0;
    const contributed = rows.some((row) => Math.abs(row.amount) > 0.009 && deals.has(row.transactionId));
    if (profile?.archived && !contributed) return;
    if (isRecipient && !contributed) return;
    if (!hasGoal && !hasPercent && !contributed) return;

    const resetDate = calendarDate(profile && cap.resetDateFieldKey ? profile.fields[cap.resetDateFieldKey] : null);
    const periods = rows.map((row) => calendarDate(row.periodStart)).filter((value): value is string => Boolean(value));
    const window = capYearWindow(resetDate, asOf) || windowFromPeriods(periods, asOf);

    const merged = new Map<string, CapDealLine>();
    rows.forEach((row) => {
      const deal = deals.get(row.transactionId);
      if (!deal || Math.abs(row.amount) < 0.0001) return;
      const period = calendarDate(row.periodStart);
      const when = dealIso(deal);
      const counts = window ? (period ? period === window.start : inWindow(when, window)) : false;
      if (!counts) return;
      const existing = merged.get(deal.id);
      if (existing) {
        existing.amount = roundCurrency(existing.amount + row.amount);
        return;
      }
      merged.set(deal.id, {
        transactionId: deal.id,
        status: deal.status,
        primaryAgent: names.get(deal.agentId) || deal.agentId || '—',
        side: deal.side,
        address: deal.address,
        closingDate: deal.closingDate ? dateKey(deal.closingDate) : null,
        salesPrice: deal.salesPrice,
        leadSource: deal.leadSource,
        amount: row.amount,
        cumulative: 0,
        pending: deal.status.trim().toLowerCase() === 'pending',
      });
    });

    const lines = [...merged.values()].sort((a, b) => {
      const date = (a.closingDate || '').localeCompare(b.closingDate || '');
      if (date) return date;
      return a.transactionId.localeCompare(b.transactionId);
    });
    const paidLines: CapDealLine[] = [];
    if (window) {
      paid?.get(agentId)?.forEach((transactionId) => {
        const deal = deals.get(transactionId);
        if (!deal || merged.has(deal.id) || !inWindow(dealIso(deal), window)) return;
        paidLines.push({
          transactionId: deal.id,
          status: deal.status,
          primaryAgent: names.get(deal.agentId) || deal.agentId || '—',
          side: deal.side,
          address: deal.address,
          closingDate: deal.closingDate ? dateKey(deal.closingDate) : null,
          salesPrice: deal.salesPrice,
          leadSource: deal.leadSource,
          amount: 0,
          cumulative: 0,
          pending: deal.status.trim().toLowerCase() === 'pending',
          paidOnly: true,
        });
      });
    }

    let running = 0;
    lines.forEach((line) => {
      running = roundCurrency(running + line.amount);
      line.cumulative = running;
    });

    let closed = roundCurrency(lines.filter((line) => !line.pending).reduce((sum, line) => sum + line.amount, 0));
    let pending = roundCurrency(lines.filter((line) => line.pending).reduce((sum, line) => sum + line.amount, 0));
    if (cap.hideOverAllocations && hasGoal && goal != null && goal > 0) {
      let room = goal;
      closed = 0;
      pending = 0;
      lines.forEach((line) => {
        const counted = roundCurrency(Math.min(Math.max(0, line.amount), Math.max(0, room)));
        room = roundCurrency(Math.max(0, room - counted));
        line.cumulative = roundCurrency(goal - room);
        if (line.pending) pending = roundCurrency(pending + counted);
        else closed = roundCurrency(closed + counted);
      });
    }
    const total = roundCurrency(closed + pending);
    if (!window && lines.length === 0 && !hasGoal && !hasPercent) return;

    standings.push({
      agentId,
      agentName: profile?.name || names.get(agentId) || agentId,
      rank: 0,
      resetDate,
      start: window?.start || null,
      end: window?.end || null,
      closed,
      pending,
      total,
      goal: hasGoal ? goal : null,
      left: hasGoal && goal != null ? roundCurrency(goal - total) : null,
      percent: hasGoal && goal ? total / goal : null,
      lines,
      paidLines,
    });
  });

  standings.sort((a, b) => b.total - a.total || a.agentName.localeCompare(b.agentName));
  standings.forEach((row, index) => {
    row.rank = index + 1;
  });
  return standings;
}
