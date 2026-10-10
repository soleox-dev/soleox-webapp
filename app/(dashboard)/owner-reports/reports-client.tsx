'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Check, ChevronDown, Info, X } from 'lucide-react';
import {
  DATE_PRESETS,
  METRICS,
  OWNER_REPORTS,
  addTotals,
  agentPaidRows,
  byAgent,
  closedInRange,
  closedOrPendingOnDate,
  compactMoney,
  formatMetric,
  formatRange,
  fullMoney,
  inRange,
  isBuyerSide,
  isListingSide,
  listingsTaken,
  metricValue,
  money,
  normalizeDeal,
  pendingInRange,
  percent,
  previousYearRange,
  rangeForPreset,
  seriesBuckets,
  sumRows,
  teamGciByTransaction,
  teamLeadNet,
  ownerMonthTable,
  unitsLabel,
  type DateRange,
  type LeaderboardDate,
  type MetricId,
  type MonthRow,
  type OwnerMonthRow,
  type RangePreset,
  type ReportDeal,
  type ReportPayment,
  type Totals,
} from '@/lib/owner-reports';

const GROUPS = ['Your Business', 'Your Agents', 'Transactions', 'Add-ons', 'My Custom Reports'];

type BoardField = { id: string; label: string; type: string };

/** Dropdowns that never make sense as a closing-date leaderboard metric. */
const BOARD_METRIC_EXCLUDED = new Set(['gci_type', 'transaction_status', 'finance_status']);

/** Payment rankings sit above the schema fields. They join payments to the transactions in view. */
const PAYMENT_METRICS: BoardField[] = [
  { id: 'payment:agent', label: 'Agent Payments', type: 'PAYMENT' },
  { id: 'payment:entity', label: 'Entity Payments', type: 'PAYMENT' },
];

const DEFAULT_DATE_BASES: BoardField[] = [
  { id: 'closing', label: 'Closing Date', type: 'DATE' },
  { id: 'acceptance', label: 'Acceptance Date', type: 'DATE' },
];

function reportIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/owner-reports\/([^/]+)/);
  if (!match) return null;
  const slug = decodeURIComponent(match[1]);
  return OWNER_REPORTS.some((item) => item.id === slug) ? slug : null;
}

export default function OwnerReportsPage() {
  const pathname = usePathname() || '/owner-reports';
  const router = useRouter();
  const reportId = reportIdFromPath(pathname);
  const [deals, setDeals] = useState<ReportDeal[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [teamLeadIds, setTeamLeadIds] = useState<Set<string>>(new Set());
  const [agentGroupById, setAgentGroupById] = useState<Map<string, string>>(new Map());
  const [groupPicked, setGroupPicked] = useState<string[] | null>(null);
  const [payments, setPayments] = useState<ReportPayment[]>([]);
  const [preset, setPreset] = useState<RangePreset>('ytd');
  const [range, setRange] = useState<DateRange>(() => rangeForPreset('ytd'));
  const [statusPicked, setStatusPicked] = useState<string[] | null>(null);
  const [sidePicked, setSidePicked] = useState<string[] | null>(null);
  const [agentPicked, setAgentPicked] = useState<string[] | null>(null);
  const [sourcePicked, setSourcePicked] = useState<string[] | null>(null);
  const [agentPayeePicked, setAgentPayeePicked] = useState<string[] | null>(null);
  const [entityPayeePicked, setEntityPayeePicked] = useState<string[] | null>(null);
  const [excludeTeamLeads, setExcludeTeamLeads] = useState(false);
  const [metric, setMetric] = useState<MetricId>('volume');
  const [boardMetrics, setBoardMetrics] = useState<BoardField[]>([...PAYMENT_METRICS, { id: 'lead_source', label: 'Lead Source', type: 'SELECT' }]);
  const [entityNames, setEntityNames] = useState<Map<string, string>>(new Map());
  const [boardMetric, setBoardMetric] = useState('lead_source');
  const [boardDate, setBoardDate] = useState<LeaderboardDate>('closing');
  const [dateBases, setDateBases] = useState<BoardField[]>(DEFAULT_DATE_BASES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const headers = { 'x-client-id': 'DEMO' };
    Promise.all([
      fetch('/api/transactions', { headers }),
      fetch('/api/agents?include_archived=true', { headers }),
      fetch('/api/payments', { headers }),
      fetch('/api/schema/transactions', { headers }),
      fetch('/api/commission-entities', { headers }),
      fetch('/api/transaction-commission-items?view=ledger', { headers }),
    ]).then(async ([dealRes, agentRes, paymentRes, schemaRes, entityRes, ledgerRes]) => {
      if (!dealRes.ok) throw new Error('Could not load transactions.');
      const dealData = await dealRes.json();
      const rows = Array.isArray(dealData.transactions) ? dealData.transactions : [];
      let teamGci = new Map<string, number>();
      if (ledgerRes.ok) {
        const ledgerData = await ledgerRes.json();
        teamGci = teamGciByTransaction(Array.isArray(ledgerData.items) ? ledgerData.items : []);
      }
      setDeals(rows
        .filter((row: Record<string, unknown>) => row.archived !== true && row.permanently_deleted !== true)
        .map((row: Record<string, unknown>) => {
          const deal = normalizeDeal(row);
          deal.teamGci = teamGci.get(deal.id) || 0;
          return deal;
        }));
      if (agentRes.ok) {
        const agentData = await agentRes.json();
        const next = new Map<string, string>();
        const leads = new Set<string>();
        const groups = new Map<string, string>();
        for (const agent of Array.isArray(agentData.agents) ? agentData.agents : []) {
          const id = String(agent.id || '');
          next.set(id, String(agent.agent_name || agent.name || 'Agent'));
          if (agent.is_team_lead === true) leads.add(id);
          const group = String(agent.agent_group ?? agent.group_id ?? agent.group ?? '').trim();
          if (id) groups.set(id, group);
        }
        setNames(next);
        setTeamLeadIds(leads);
        setAgentGroupById(groups);
      }
      if (paymentRes.ok) {
        const paymentData = await paymentRes.json();
        const list = Array.isArray(paymentData.payments) ? paymentData.payments : [];
        setPayments(list.map((payment: Record<string, unknown>) => ({
          transactionId: String(payment.transaction_id || ''),
          agentId: String(payment.agent_id || ''),
          entityId: String(payment.payee_entity_id || ''),
          payeeType: String(payment.payee_type || ''),
          amount: Number(payment.amount_paid) || 0,
        })));
      }
      if (entityRes.ok) {
        const entityData = await entityRes.json();
        const next = new Map<string, string>();
        for (const entity of Array.isArray(entityData.entities) ? entityData.entities : []) {
          const id = String(entity.id || '');
          if (id) next.set(id, String(entity.entity_name || entity.name || 'Entity'));
        }
        setEntityNames(next);
      }
      if (schemaRes.ok) {
        const schemaData = await schemaRes.json();
        const catalog = Array.isArray(schemaData.catalog) ? schemaData.catalog : [];
        const fields = catalog
          .filter((field: { is_enabled?: boolean; field_type?: string; field_key?: string }) => field.is_enabled !== false && (field.field_type === 'SELECT' || field.field_type === 'AGENT_PICKER') && field.field_key && !BOARD_METRIC_EXCLUDED.has(String(field.field_key)))
          .map((field: { field_key: string; field_label?: string; field_type: string }) => ({
            id: String(field.field_key),
            label: String(field.field_label || field.field_key),
            type: String(field.field_type),
          }))
          .sort((a: BoardField, b: BoardField) => a.label.localeCompare(b.label));
        if (fields.length) setBoardMetrics([...PAYMENT_METRICS, ...fields]);
        const labelOf = (key: string, fallback: string) => {
          const match = catalog.find((field: { field_key?: string; field_label?: string }) => field.field_key === key);
          const label = String(match?.field_label || '').trim();
          return label || fallback;
        };
        setDateBases([
          { id: 'closing', label: labelOf('closing_date', 'Closing Date'), type: 'DATE' },
          { id: 'acceptance', label: labelOf('acceptance_date', 'Acceptance Date'), type: 'DATE' },
        ]);
      }
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not load reports.');
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!boardMetrics.some((field) => field.id === boardMetric)) {
      const fallback = boardMetrics.find((field) => field.id === 'lead_source') || boardMetrics[0];
      if (fallback) setBoardMetric(fallback.id);
    }
  }, [boardMetric, boardMetrics]);

  const closingBoard = reportId === 'lead-source-leaderboard' || reportId === 'agent-leaderboard-closing' || reportId === 'team-performance';
  const statusFallback = closingBoard ? ['Closed', 'Pending'] : null;
  const filterPicks = {
    statusPicked,
    sidePicked,
    agentPicked,
    sourcePicked,
    groupPicked,
    statusFallback,
    agentGroupById,
    applyDimensions: reportId !== null && reportId !== 'owner-summary',
  };
  const excludeLeadDeals = excludeTeamLeads && (
    reportId === 'team-performance'
    || (reportId === 'lead-source-leaderboard' && boardMetric !== 'payment:entity' && boardMetric !== 'payment:agent')
  );
  const filtered = useMemo(() => deals.filter((deal) => {
    if (deal.archived) return false;
    if (closingBoard && !isClosedOrPendingStatus(deal.status)) return false;
    if (excludeLeadDeals && teamLeadIds.has(deal.agentId)) return false;
    return passesReportFilters(deal, filterPicks, null);
  }), [agentGroupById, agentPicked, closingBoard, deals, excludeLeadDeals, filterPicks.applyDimensions, groupPicked, reportId, sidePicked, sourcePicked, statusFallback, statusPicked, teamLeadIds]);

  const applyDimensions = filterPicks.applyDimensions;
  const periodDeals = useMemo(
    () => deals.filter((deal) => {
      if (deal.archived || !dealInReport(deal, range, reportId, boardDate)) return false;
      if (excludeLeadDeals && teamLeadIds.has(deal.agentId)) return false;
      return true;
    }),
    [boardDate, deals, excludeLeadDeals, range, reportId, teamLeadIds],
  );
  const optionDeals = (except: FilterExcept) => periodDeals.filter((deal) => passesReportFilters(deal, filterPicks, except));
  const statuses = useMemo(() => {
    const values = uniqueFolded(optionDeals('status').map((deal) => deal.status));
    if (!closingBoard) return values;
    return ['Closed', 'Pending'].filter((label) => values.some((value) => value.toLowerCase() === label.toLowerCase()));
  }, [agentGroupById, agentPicked, applyDimensions, closingBoard, groupPicked, periodDeals, reportId, sidePicked, sourcePicked, statusFallback]);
  const sides = useMemo(() => uniqueFolded(optionDeals('side').map((deal) => deal.side)), [agentGroupById, agentPicked, applyDimensions, groupPicked, periodDeals, reportId, sourcePicked, statusFallback, statusPicked]);
  const sources = useMemo(() => uniqueValues(optionDeals('source').map((deal) => deal.leadSource)), [agentGroupById, agentPicked, applyDimensions, groupPicked, periodDeals, sidePicked, statusFallback, statusPicked]);
  const agents = useMemo(() => {
    const ids = uniqueValues(optionDeals('agent').map((deal) => deal.agentId));
    return ids
      .map((id) => ({ id, name: names.get(id) || id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [agentGroupById, applyDimensions, groupPicked, names, periodDeals, sidePicked, sourcePicked, statusFallback, statusPicked]);
  const groupOptions = useMemo(
    () => uniqueValues(optionDeals('group').map((deal) => agentGroupById.get(deal.agentId) || '')),
    [agentGroupById, agentPicked, applyDimensions, periodDeals, sidePicked, sourcePicked, statusFallback, statusPicked],
  );
  const choiceCount = (pool: ReportDeal[], value: string, read: (deal: ReportDeal) => string, fold: boolean) => pool.filter((deal) => {
    const current = read(deal).trim();
    return fold ? current.toLowerCase() === value.toLowerCase() : current === value;
  }).length;
  const statusPool = optionDeals('status');
  const sidePool = optionDeals('side');
  const agentPool = optionDeals('agent');
  const sourcePool = optionDeals('source');
  const groupPool = optionDeals('group');
  const statusChoices = statuses.map((value) => ({ value, label: value, count: choiceCount(statusPool, value, (deal) => deal.status, true) }));
  const sideChoices = sides.map((value) => ({ value, label: value, count: choiceCount(sidePool, value, (deal) => deal.side, true) }));
  const agentChoices = agents.map((agent) => ({ value: agent.id, label: agent.name, count: choiceCount(agentPool, agent.id, (deal) => deal.agentId, false) }));
  const sourceChoices = sources.map((value) => ({ value, label: value, count: choiceCount(sourcePool, value, (deal) => deal.leadSource, false) }));
  const groupChoices = groupOptions.map((value) => ({ value, label: value, count: choiceCount(groupPool, value, (deal) => agentGroupById.get(deal.agentId) || '', false) }));
  const paymentKind = reportId === 'lead-source-leaderboard' && boardMetric === 'payment:entity'
    ? 'entity'
    : reportId === 'lead-source-leaderboard' && boardMetric === 'payment:agent'
      ? 'agent'
      : null;
  const payeePicked = paymentKind === 'entity' ? entityPayeePicked : agentPayeePicked;
  const setPayeePicked = paymentKind === 'entity' ? setEntityPayeePicked : setAgentPayeePicked;
  const payeeChoices = useMemo(() => {
    if (!paymentKind) return [];
    const lines = withoutTeamLeads(
      paymentLines(payments, closedOrPendingOnDate(filtered, range, boardDate), paymentKind, names, entityNames),
      paymentKind === 'agent' && excludeTeamLeads,
      teamLeadIds,
    );
    const counts = new Map<string, { label: string; count: number }>();
    lines.forEach((line) => {
      const existing = counts.get(line.key);
      if (existing) existing.count += 1;
      else counts.set(line.key, { label: line.label, count: 1 });
    });
    return [...counts.entries()]
      .map(([value, item]) => ({ value, label: item.label, count: item.count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [boardDate, entityNames, excludeTeamLeads, filtered, names, paymentKind, payments, range, teamLeadIds]);

  useEffect(() => {
    if (loading) return;
    const prune = (picked: string[] | null, options: string[], fold: boolean, set: (value: string[] | null) => void) => {
      if (picked == null) return;
      const next = picked.filter((value) => options.some((option) => fold ? option.toLowerCase() === value.toLowerCase() : option === value));
      if (next.length !== picked.length) set(next);
    };
    if (applyDimensions) {
      prune(statusPicked, statuses, true, setStatusPicked);
      prune(sidePicked, sides, true, setSidePicked);
      prune(agentPicked, agents.map((agent) => agent.id), false, setAgentPicked);
      prune(sourcePicked, sources, false, setSourcePicked);
    }
    prune(groupPicked, groupOptions, false, setGroupPicked);
    if (paymentKind) prune(payeePicked, payeeChoices.map((choice) => choice.value), false, setPayeePicked);
  }, [agentPicked, agents, applyDimensions, groupOptions, groupPicked, loading, payeeChoices, payeePicked, paymentKind, setPayeePicked, sidePicked, sides, sourcePicked, sources, statusPicked, statuses]);
  const summaryDeals = useMemo(
    () => deals.filter((deal) => !deal.archived && pickMatches(groupPicked, null, agentGroupById.get(deal.agentId) || '', false)),
    [agentGroupById, deals, groupPicked],
  );
  const priorRange = useMemo(() => previousYearRange(range), [range]);
  const closed = useMemo(() => closedInRange(filtered, range), [filtered, range]);
  const pending = useMemo(() => pendingInRange(filtered, range), [filtered, range]);
  const taken = useMemo(() => listingsTaken(filtered, range), [filtered, range]);
  const closedPrior = useMemo(() => closedInRange(filtered, priorRange), [filtered, priorRange]);
  const pendingPrior = useMemo(() => pendingInRange(filtered, priorRange), [filtered, priorRange]);
  const summaryClosed = useMemo(() => closedInRange(summaryDeals, range), [summaryDeals, range]);
  const summaryPending = useMemo(() => pendingInRange(summaryDeals, range), [summaryDeals, range]);
  const summaryClosedPrior = useMemo(() => closedInRange(summaryDeals, priorRange), [summaryDeals, priorRange]);
  const summaryPendingPrior = useMemo(() => pendingInRange(summaryDeals, priorRange), [summaryDeals, priorRange]);
  const summaryNet = useMemo(() => teamLeadNet(payments, summaryClosed, teamLeadIds), [payments, summaryClosed, teamLeadIds]);
  const summaryNetPrior = useMemo(() => teamLeadNet(payments, summaryClosedPrior, teamLeadIds), [payments, summaryClosedPrior, teamLeadIds]);
  const ownerSummary = reportId === 'owner-summary';
  const report = OWNER_REPORTS.find((item) => item.id === reportId) || null;
  const keptScroll = useRef<number | null>(null);
  const selectReport = (id: string | null) => {
    const href = id ? `/owner-reports/${id}` : '/owner-reports';
    if (href === pathname) return;
    keptScroll.current = window.scrollY;
    router.push(href, { scroll: false });
  };

  useEffect(() => {
    const match = pathname.match(/^\/owner-reports\/([^/]+)/);
    if (!match) return;
    const slug = decodeURIComponent(match[1]);
    if (!OWNER_REPORTS.some((item) => item.id === slug)) router.replace('/owner-reports');
  }, [pathname, router]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
      const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
      if (!forward && !backward) return;
      const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
      if (!horizontal) {
        const active = document.activeElement;
        const target = event.target instanceof HTMLElement ? event.target : active;
        if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return;
        if (document.querySelector('[data-owner-menu], [role="listbox"]')) return;
      }
      if (!reportId) return;
      const index = OWNER_REPORTS.findIndex((item) => item.id === reportId);
      if (index < 0) return;
      const next = index + (forward ? 1 : -1);
      if (horizontal) event.preventDefault();
      if (next < 0 || next >= OWNER_REPORTS.length) return;
      if (!horizontal) event.preventDefault();
      selectReport(OWNER_REPORTS[next].id);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pathname, reportId, router]);

  useLayoutEffect(() => {
    const y = keptScroll.current;
    if (y == null) return;
    keptScroll.current = null;
    const hold = () => {
      const root = (document.scrollingElement || document.documentElement) as HTMLElement;
      const navbar = document.querySelector('header')?.offsetHeight || 65;
      root.style.minHeight = '';
      let maxScroll = Math.max(0, root.scrollHeight - window.innerHeight);
      let target = Math.min(y, maxScroll);
      if (y >= navbar && target < navbar) {
        root.style.minHeight = `${window.innerHeight + navbar}px`;
        target = navbar;
      }
      root.scrollTop = target;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body) active.focus({ preventScroll: true });
    };
    hold();
    const frame = requestAnimationFrame(hold);
    const timer = window.setTimeout(hold, 0);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      const root = (document.scrollingElement || document.documentElement) as HTMLElement;
      root.style.minHeight = '';
    };
  }, [reportId]);

  return (
    <main className={`min-h-[calc(100vh-4rem)] [overflow-anchor:none] text-slate-900 dark:text-slate-100 ${reportCanvas}`}>
      <div className="max-w-[1600px] mx-auto px-4 pb-4 md:px-6">
        <section className="min-w-0 space-y-4">
          {report ? (
            <ReportView
              onSelectReport={selectReport}
              reportName={report.name}
              ready={report.ready}
              note={report.note}
              preset={preset}
              range={range}
              priorRange={priorRange}
              onPreset={(next) => {
                setPreset(next);
                if (next !== 'custom') setRange(rangeForPreset(next));
              }}
              onRange={(next) => {
                setPreset('custom');
                setRange(next);
              }}
              metric={metric}
              statusChoices={statusChoices}
              sideChoices={sideChoices}
              agentChoices={agentChoices}
              sourceChoices={sourceChoices}
              groupChoices={groupChoices}
              statusPicked={statusPicked}
              sidePicked={sidePicked}
              agentPicked={agentPicked}
              sourcePicked={sourcePicked}
              groupPicked={groupPicked}
              statusFallback={statusFallback}
              onStatus={setStatusPicked}
              onSide={setSidePicked}
              onAgent={setAgentPicked}
              onSource={setSourcePicked}
              onGroups={setGroupPicked}
              onMetric={setMetric}
              boardMetric={boardMetric}
              boardMetrics={boardMetrics}
              onBoardMetric={setBoardMetric}
              boardDate={boardDate}
              onBoardDate={setBoardDate}
              dateBases={dateBases}
              payeeChoices={payeeChoices}
              payeePicked={payeePicked}
              onPayees={setPayeePicked}
              excludeTeamLeads={excludeTeamLeads}
              onExcludeTeamLeads={setExcludeTeamLeads}
              loading={loading}
              error={error}
              closed={ownerSummary ? summaryClosed : closed}
              pending={ownerSummary ? summaryPending : pending}
              taken={taken}
              closedPrior={ownerSummary ? summaryClosedPrior : closedPrior}
              pendingPrior={ownerSummary ? summaryPendingPrior : pendingPrior}
              names={names}
              reportId={report.id}
              netCommission={summaryNet}
              priorNetCommission={summaryNetPrior}
              allDeals={summaryDeals}
              deals={filtered}
              payments={payments}
              entityNames={entityNames}
              teamLeadIds={teamLeadIds}
            />
          ) : (
            <div className="space-y-4 pt-6">
              <OwnerReportNav reportId={reportId} onSelect={selectReport} />
              <Cover onEnter={() => selectReport('owner-summary')} />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function reportChoice(reportId: string | null): { number: string; name: string } {
  const index = OWNER_REPORTS.findIndex((item) => item.id === reportId);
  const report = index >= 0 ? OWNER_REPORTS[index] : null;
  if (!report) return { number: '', name: 'Owner Reports' };
  return { number: String(index + 1).padStart(2, '0'), name: report.name };
}

function MenuWidth({ choice }: { choice: { number: string; name: string } }) {
  return (
    <span className="inline-flex h-10 items-center gap-2 px-3 text-sm font-semibold">
      {choice.number ? <span className="tabular-nums">{choice.number}</span> : null}
      <span>{choice.name}</span>
      <ChevronDown className="h-4 w-4" />
    </span>
  );
}

function OwnerReportNav({ reportId, onSelect }: { reportId: string | null; onSelect: (id: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const choice = reportChoice(reportId);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const choose = (id: string | null) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <div className="relative min-w-0 max-w-full">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={choice.number ? `${choice.number} ${choice.name}` : choice.name}
        title={choice.number ? `${choice.number} ${choice.name}` : choice.name}
        onClick={() => setOpen((value) => !value)}
        className={`relative z-50 inline-flex h-10 w-max max-w-full cursor-pointer appearance-none items-center gap-2 rounded-xl border bg-white px-3 text-sm font-semibold shadow-sm transition [-webkit-tap-highlight-color:transparent] [outline:none] focus:[outline:none] focus-visible:[outline:none] focus-visible:shadow-[0_1px_2px_rgb(0_0_0/0.05),0_0_0_3px_rgb(16_185_129/0.4)] dark:bg-slate-900 ${
          open
            ? 'border-emerald-500 text-slate-900 dark:border-emerald-400 dark:text-white'
            : 'border-slate-200 text-slate-800 hover:border-emerald-400 dark:border-slate-600 dark:text-slate-100 dark:hover:border-emerald-400'
        }`}
      >
        {choice.number ? <span className="shrink-0 tabular-nums text-slate-400 dark:text-slate-500">{choice.number}</span> : null}
        <span className="truncate">{choice.name}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180 text-emerald-600 dark:text-emerald-300' : ''}`} />
      </button>
      {open ? (
        <>
          <button type="button" aria-label="Close reports menu" className="fixed inset-0 z-40 bg-slate-950/30" onClick={() => setOpen(false)} />
          <div data-owner-menu className="absolute left-0 top-full z-50 mt-2 max-h-[calc(100vh-8rem)] w-80 min-w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <ReportMenu reportId={reportId} onSelect={choose} />
          </div>
        </>
      ) : null}
    </div>
  );
}

function ReportMenu({ reportId, onSelect }: { reportId: string | null; onSelect: (id: string | null) => void }) {
  return (
    <>
      <button type="button" onClick={() => onSelect(null)} className="w-full cursor-pointer text-left px-2 py-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Soleox</p>
        <h1 className="text-base font-extrabold tracking-tight">Owner Reports</h1>
      </button>
      {GROUPS.map((group) => (
        <div key={group} className="mt-3">
          <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{group}</p>
          <div className="mt-1 space-y-0.5">
            {OWNER_REPORTS.filter((item) => item.group === group).map((item) => {
              const number = OWNER_REPORTS.findIndex((entry) => entry.id === item.id) + 1;
              const active = item.id === reportId;
              const label = String(number).padStart(2, '0');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={`w-full cursor-pointer text-left px-2 py-1.5 rounded-lg text-xs transition ${
                    active
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="text-slate-400 mr-1.5 tabular-nums">{label}</span>
                  {item.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

const reportCanvas = 'bg-slate-100 dark:bg-slate-950';

function Cover({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="min-h-[520px] flex flex-col items-center justify-center text-center px-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700 dark:text-sky-300">Soleox</p>
      <h2 className="mt-3 text-4xl font-extrabold tracking-tight">
        <span className="text-rose-600">Owner</span> <span className="text-sky-600 dark:text-sky-300">Reports</span>
      </h2>
      <p className="mt-3 max-w-md text-sm text-slate-500 dark:text-slate-400">
        Production, pipeline, and agent results for the year, calculated from your transactions.
      </p>
      <button
        type="button"
        onClick={onEnter}
        className="mt-8 cursor-pointer px-10 py-2.5 rounded-full bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold tracking-[0.25em] [outline:none] focus-visible:[outline:none] focus-visible:shadow-[0_0_0_3px_rgb(14_165_233/0.4)]"
      >
        ENTER
      </button>
    </div>
  );
}

const reportTableWrap = 'report-table rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';
const pairedReport = 'grid items-stretch gap-4 lg:grid-cols-2';
const pairedSection = 'flex h-full min-w-0 flex-col gap-3';
const pairedScores = 'grid grid-cols-3 gap-3';

type ColumnSort = { key: string; direction: 'asc' | 'desc' };

function useColumnSort() {
  const [sort, setSort] = useState<ColumnSort | null>(null);
  const toggle = (key: string) => {
    setSort((current) => {
      if (!current || current.key !== key) return { key, direction: 'asc' };
      return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
    });
  };
  return { sort, toggle };
}

function compareSort(a: string | number | null, b: string | number | null, direction: 'asc' | 'desc'): number {
  const emptyA = a === null || a === '';
  const emptyB = b === null || b === '';
  if (emptyA && emptyB) return 0;
  if (emptyA) return 1;
  if (emptyB) return -1;
  const factor = direction === 'asc' ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * factor;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }) * factor;
}

function sortBy<T>(rows: T[], sort: ColumnSort | null, valueOf: (row: T, key: string) => string | number | null): T[] {
  if (!sort) return rows;
  return [...rows].sort((a, b) => compareSort(valueOf(a, sort.key), valueOf(b, sort.key), sort.direction));
}

function SortHead({ column, label, sort, onSort, align = 'left', title, width, className = '', note }: {
  column: string;
  label: string;
  sort: ColumnSort | null;
  onSort: (column: string) => void;
  align?: 'left' | 'right';
  title?: string;
  width?: 'narrow' | 'wide';
  className?: string;
  note?: string;
}) {
  const active = sort?.key === column;
  const widthClass = width === 'narrow' ? 'w-[3.5rem]' : width === 'wide' ? 'w-[4.75rem]' : '';
  return (
    <th title={title} aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={`align-middle ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      <span className={`flex w-full items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
        <button
          type="button"
          onClick={() => onSort(column)}
          className={`flex cursor-pointer items-center gap-1 bg-transparent p-0 font-[inherit] text-[length:inherit] text-inherit [appearance:none] [letter-spacing:inherit] [outline:none] [text-transform:inherit] focus-visible:underline ${note ? '' : 'w-full'} ${align === 'right' ? 'justify-end' : 'justify-start'}`}
        >
          <span className={width ? `inline-block whitespace-pre-line ${widthClass}` : undefined}>{label}</span>
          {active ? <span aria-hidden="true" className="shrink-0 text-[0.7rem] leading-none">{sort.direction === 'asc' ? '↑' : '↓'}</span> : null}
        </button>
        {note ? <ScoreNote label={label} text={note} className="relative inline-flex shrink-0" align={align === 'right' ? 'right' : 'left'} /> : null}
      </span>
    </th>
  );
}

function ReportView(props: {
  reportName: string;
  reportId: string;
  onSelectReport: (id: string | null) => void;
  ready: boolean;
  note?: string;
  preset: RangePreset;
  range: DateRange;
  priorRange: DateRange;
  onPreset: (preset: RangePreset) => void;
  onRange: (range: DateRange) => void;
  metric: MetricId;
  statusChoices: FilterChoice[];
  sideChoices: FilterChoice[];
  agentChoices: FilterChoice[];
  sourceChoices: FilterChoice[];
  groupChoices: FilterChoice[];
  statusPicked: string[] | null;
  sidePicked: string[] | null;
  agentPicked: string[] | null;
  sourcePicked: string[] | null;
  groupPicked: string[] | null;
  statusFallback: string[] | null;
  onGroups: (groups: string[] | null) => void;
  onStatus: (value: string[] | null) => void;
  onSide: (value: string[] | null) => void;
  onAgent: (value: string[] | null) => void;
  onSource: (value: string[] | null) => void;
  onMetric: (value: MetricId) => void;
  boardMetric: string;
  boardMetrics: BoardField[];
  onBoardMetric: (value: string) => void;
  boardDate: LeaderboardDate;
  onBoardDate: (value: LeaderboardDate) => void;
  dateBases: BoardField[];
  payeeChoices: FilterChoice[];
  payeePicked: string[] | null;
  onPayees: (value: string[] | null) => void;
  excludeTeamLeads: boolean;
  onExcludeTeamLeads: (value: boolean) => void;
  hideMetric?: boolean;
  loading: boolean;
  error: string;
  closed: ReportDeal[];
  pending: ReportDeal[];
  taken: ReportDeal[];
  closedPrior: ReportDeal[];
  pendingPrior: ReportDeal[];
  names: Map<string, string>;
  netCommission: number;
  priorNetCommission: number;
  allDeals: ReportDeal[];
  deals: ReportDeal[];
  payments: ReportPayment[];
  entityNames: Map<string, string>;
  teamLeadIds: Set<string>;
}) {
  const { reportId, closed, pending, taken, closedPrior, pendingPrior, names, range, priorRange, metric, netCommission, priorNetCommission, allDeals, deals, payments, teamLeadIds } = props;
  const [cumulative, setCumulative] = useState(false);
  const chromeRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const chrome = chromeRef.current;
    const root = chrome?.closest('main');
    if (!chrome || !root) return;
    let frame = 0;
    const apply = () => {
      const bottom = Math.max(0, chrome.getBoundingClientRect().bottom);
      root.querySelectorAll<HTMLElement>('.report-table').forEach((wrap) => {
        const head = wrap.querySelector('thead');
        if (!head) return;
        const wrapRect = wrap.getBoundingClientRect();
        const hold = wrapRect.top < bottom && wrapRect.bottom > bottom + head.offsetHeight;
        head.style.transform = hold ? `translateY(${bottom - wrapRect.top}px)` : '';
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };
    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(chrome);
    const mutations = new MutationObserver(schedule);
    mutations.observe(root, { childList: true, subtree: true });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);
  return (
    <div>
      <div ref={chromeRef} className={`sticky top-0 z-40 border-b border-slate-200/80 px-0 pb-4 dark:border-slate-700/80 ${reportCanvas}`}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-6">
          <div className="z-50 min-w-0 justify-self-start">
            <OwnerReportNav reportId={props.reportId} onSelect={props.onSelectReport} />
          </div>
          <div className="min-w-0 px-2 text-center">
            <h2 className="text-balance text-3xl font-extrabold leading-tight tracking-tight">
              {props.reportId === 'lead-source-leaderboard' ? (
                <>
                  <TitleMetric
                    value={props.boardMetric}
                    options={props.boardMetrics}
                    onChange={props.onBoardMetric}
                  />
                  {' '}
                  Leaderboard by{' '}
                  <TitleMetric
                    value={props.boardDate}
                    options={props.dateBases}
                    onChange={(id) => props.onBoardDate(id === 'acceptance' ? 'acceptance' : 'closing')}
                  />
                </>
              ) : props.reportId === 'team-performance' ? (
                <>
                  Team Performance by{' '}
                  <TitleMetric
                    value={props.boardDate}
                    options={props.dateBases}
                    onChange={(id) => props.onBoardDate(id === 'acceptance' ? 'acceptance' : 'closing')}
                  />
                </>
              ) : props.reportName}
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">{formatRange(range)} compared with {formatRange(priorRange)}</p>
          </div>
          <div className="justify-self-end">
            {props.reportId === 'team-performance' ? (
              <button
                type="button"
                aria-pressed={cumulative}
                onClick={() => setCumulative((value) => !value)}
                className={`inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold shadow-sm transition [outline:none] focus-visible:shadow-[0_1px_2px_rgb(0_0_0/0.05),0_0_0_3px_rgb(16_185_129/0.4)] ${
                  cumulative
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300'
                    : 'border-slate-200 bg-white text-slate-800 hover:border-emerald-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-emerald-400'
                }`}
              >
                {cumulative
                  ? <Check aria-hidden="true" strokeWidth={2.5} className="h-4 w-4" />
                  : <X aria-hidden="true" strokeWidth={2.5} className="h-4 w-4 text-slate-400" />}
                Cumulative
              </button>
            ) : null}
          </div>
        </div>
        <FilterBar
          {...props}
          dateOnly={props.reportId === 'owner-summary'}
          hideMetric={props.reportId === 'agent-leaderboard-closing' || props.reportId === 'lead-source-leaderboard' || props.reportId === 'team-performance'}
          boardMetrics={undefined}
          payeeChoices={props.reportId === 'lead-source-leaderboard' && (props.boardMetric === 'payment:agent' || props.boardMetric === 'payment:entity') ? props.payeeChoices : undefined}
          excludeTeamLeads={(props.reportId === 'team-performance' || (props.reportId === 'lead-source-leaderboard' && props.boardMetric !== 'payment:entity')) ? props.excludeTeamLeads : undefined}
          dateRangeLabel={props.reportId === 'lead-source-leaderboard' || props.reportId === 'team-performance'
            ? `${props.dateBases.find((field) => field.id === props.boardDate)?.label || 'Closing Date'} Range`
            : undefined}
        />
      </div>
      <div className="space-y-4 pt-4">
        {props.loading ? <p className="text-sm text-slate-500">Loading transactions…</p> : null}
        {props.error ? <p className="text-sm text-rose-600">{props.error}</p> : null}
        {!props.loading && !props.ready ? <Unavailable note={props.note || 'This report needs data Soleox does not store yet.'} /> : null}
        {!props.loading && props.ready ? (
          <ReportBody
            id={reportId}
            range={range}
            priorRange={priorRange}
            metric={metric}
            closed={closed}
            pending={pending}
            taken={taken}
            closedPrior={closedPrior}
            pendingPrior={pendingPrior}
            names={names}
            netCommission={netCommission}
            priorNetCommission={priorNetCommission}
            allDeals={allDeals}
            deals={deals}
            payments={payments}
            entityNames={props.entityNames}
            teamLeadIds={teamLeadIds}
            boardField={props.boardMetrics.find((field) => field.id === props.boardMetric) || props.boardMetrics[0]}
            payeePicked={props.payeePicked}
            excludeTeamLeads={props.excludeTeamLeads}
            dateBasis={props.boardDate}
            sidePicked={props.sidePicked}
            cumulative={props.reportId === 'team-performance' && cumulative}
          />
        ) : null}
      </div>
    </div>
  );
}

type FilterChoice = { value: string; label: string; count: number };

function FilterBar(props: {
  preset: RangePreset;
  range: DateRange;
  onPreset: (preset: RangePreset) => void;
  onRange: (range: DateRange) => void;
  metric: MetricId;
  statusChoices: FilterChoice[];
  sideChoices: FilterChoice[];
  agentChoices: FilterChoice[];
  sourceChoices: FilterChoice[];
  groupChoices: FilterChoice[];
  statusPicked: string[] | null;
  sidePicked: string[] | null;
  agentPicked: string[] | null;
  sourcePicked: string[] | null;
  groupPicked: string[] | null;
  statusFallback: string[] | null;
  onGroups: (groups: string[] | null) => void;
  onStatus: (value: string[] | null) => void;
  onSide: (value: string[] | null) => void;
  onAgent: (value: string[] | null) => void;
  onSource: (value: string[] | null) => void;
  onMetric: (value: MetricId) => void;
  boardMetric?: string;
  boardMetrics?: BoardField[];
  onBoardMetric?: (value: string) => void;
  payeeChoices?: FilterChoice[];
  payeePicked?: string[] | null;
  onPayees?: (value: string[] | null) => void;
  excludeTeamLeads?: boolean;
  onExcludeTeamLeads?: (value: boolean) => void;
  dateRangeLabel?: string;
  dateOnly?: boolean;
  hideMetric?: boolean;
}) {
  return (
    <div className="relative z-30 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
      <DateRangeFilter preset={props.preset} range={props.range} onPreset={props.onPreset} onRange={props.onRange} label={props.dateRangeLabel} />
      {props.preset === 'custom' ? (
        <>
          <Field label="From">
            <input
              type="date"
              value={props.range.start}
              onChange={(event) => props.onRange({ ...props.range, start: event.target.value })}
              className={selectClass}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={props.range.end}
              onChange={(event) => props.onRange({ ...props.range, end: event.target.value })}
              className={selectClass}
            />
          </Field>
        </>
      ) : null}
      <MultiFilter label="Group" note="Limits every metric to transactions whose primary agent belongs to the selected groups. All includes every agent." options={props.groupChoices} picked={props.groupPicked} fallback={null} onChange={props.onGroups} />
      {props.dateOnly ? null : (
        <>
      <MultiFilter label="Status" options={props.statusChoices} picked={props.statusPicked} fallback={props.statusFallback} onChange={props.onStatus} fold />
      <MultiFilter label="Side" options={props.sideChoices} picked={props.sidePicked} fallback={null} onChange={props.onSide} fold />
      <MultiFilter label="Primary agent" options={props.agentChoices} picked={props.agentPicked} fallback={null} onChange={props.onAgent} />
      <MultiFilter label="Lead source" options={props.sourceChoices} picked={props.sourcePicked} fallback={null} onChange={props.onSource} />
      {props.payeeChoices && props.onPayees ? (
        <MultiFilter label={props.boardMetric === 'payment:entity' ? 'Entity' : 'Agent'} options={props.payeeChoices} picked={props.payeePicked ?? null} fallback={null} onChange={props.onPayees} />
      ) : null}
      {props.excludeTeamLeads !== undefined && props.onExcludeTeamLeads ? (
        <label className="flex h-9 cursor-pointer items-center gap-2 self-end text-sm font-medium text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={Boolean(props.excludeTeamLeads)}
            onChange={(event) => props.onExcludeTeamLeads?.(event.target.checked)}
            className="h-4 w-4 cursor-pointer accent-emerald-600"
          />
          Exclude Team Lead(s)
        </label>
      ) : null}
      {props.hideMetric ? null : (
      <Field label="Metric">
        <select
          value={props.boardMetrics ? props.boardMetric : props.metric}
          onChange={(event) => {
            if (props.boardMetrics && props.onBoardMetric) props.onBoardMetric(event.target.value);
            else props.onMetric(event.target.value as MetricId);
          }}
          className={selectClass}
        >
          {(props.boardMetrics ?? METRICS.map((item) => ({ id: item.id, label: item.label }))).map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </Field>
      )}
        </>
      )}
    </div>
  );
}

function isClosedOrPendingStatus(status: string): boolean {
  const value = status.trim().toLowerCase();
  return value === 'closed' || value === 'pending';
}

function dealInReport(deal: ReportDeal, range: DateRange, reportId: string | null, dateBasis: LeaderboardDate = 'closing'): boolean {
  const status = deal.status.trim().toLowerCase();
  const closed = status === 'closed' && inRange(deal.closingDate, range);
  const pending = status === 'pending' && (inRange(deal.acceptanceDate, range) || inRange(deal.closingDate, range));
  const listed = isListingSide(deal.side) && status !== 'cancelled' && inRange(deal.listDate, range);
  const activity = inRange(deal.closingDate, range) || inRange(deal.acceptanceDate, range) || inRange(deal.listDate, range);
  switch (reportId) {
    case 'lead-source-leaderboard':
    case 'team-performance':
      return (status === 'closed' || status === 'pending') && inRange(dateBasis === 'acceptance' ? deal.acceptanceDate : deal.closingDate, range);
    case 'agent-leaderboard-closing':
      return (status === 'closed' || status === 'pending') && inRange(deal.closingDate, range);
    case 'agent-leaderboard-pended':
      return pending;
    case 'listings-by-list-date':
      return listed;
    case 'transaction-list':
    case 'transaction-detail':
      return closed || pending;
    case 'pended-vs-closing':
    case 'daily-management':
      return closed || pending || listed;
    case 'owner-summary':
      return activity;
    default: {
      const report = OWNER_REPORTS.find((item) => item.id === reportId);
      return report?.ready ? closed : activity;
    }
  }
}

type FilterExcept = 'status' | 'side' | 'agent' | 'source' | 'group';

function pickMatches(picked: string[] | null, fallback: string[] | null, value: string, fold: boolean): boolean {
  const active = picked ?? fallback;
  if (active == null) return true;
  return active.some((item) => fold ? item.toLowerCase() === value.trim().toLowerCase() : item === value);
}

function passesReportFilters(deal: ReportDeal, filters: {
  statusPicked: string[] | null;
  sidePicked: string[] | null;
  agentPicked: string[] | null;
  sourcePicked: string[] | null;
  groupPicked: string[] | null;
  statusFallback: string[] | null;
  agentGroupById: Map<string, string>;
  applyDimensions: boolean;
}, except: FilterExcept | null): boolean {
  if (except !== 'group' && !pickMatches(filters.groupPicked, null, filters.agentGroupById.get(deal.agentId) || '', false)) return false;
  if (!filters.applyDimensions) return true;
  if (except !== 'status' && !pickMatches(filters.statusPicked, filters.statusFallback, deal.status, true)) return false;
  if (except !== 'side' && !pickMatches(filters.sidePicked, null, deal.side, true)) return false;
  if (except !== 'agent' && !pickMatches(filters.agentPicked, null, deal.agentId, false)) return false;
  if (except !== 'source' && !pickMatches(filters.sourcePicked, null, deal.leadSource, false)) return false;
  return true;
}

function uniqueFolded(values: string[]): string[] {
  const byKey = new Map<string, string>();
  values.forEach((value) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    const current = byKey.get(key);
    if (!current || (current === current.toLowerCase() && trimmed !== trimmed.toLowerCase())) byKey.set(key, trimmed);
  });
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

function formatFilterDate(key: string): string {
  const [year, month, day] = key.split('-');
  return `${month}/${day}/${year}`;
}

function formatFilterSpan(range: DateRange): string {
  return `${formatFilterDate(range.start)} - ${formatFilterDate(range.end)}`;
}

function TitleMetric({ value, options, onChange }: { value: string; options: BoardField[]; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLSpanElement>(null);
  const selected = options.find((field) => field.id === value) || options[0];
  const visible = options.filter((field) => field.label.toLowerCase().includes(query.trim().toLowerCase()));
  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!selected) return null;

  return (
    <span ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Metric ${selected.label}`}
        onClick={() => setOpen((current) => !current)}
        className="cursor-pointer appearance-none whitespace-nowrap border-0 bg-transparent p-0 text-3xl font-extrabold leading-tight tracking-tight text-emerald-600 shadow-none [-webkit-tap-highlight-color:transparent] [outline:none] hover:text-emerald-700 focus:[outline:none] focus-visible:[outline:none] dark:text-emerald-400 dark:hover:text-emerald-300"
      >
        {selected.label}
      </button>
      {open ? (
        <div role="listbox" aria-label="Metric" className="absolute left-0 top-full z-50 mt-2 max-h-[min(36rem,calc(100dvh-14rem))] w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 text-sm font-medium normal-case tracking-normal text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {options.length > 8 ? (
            <div className="sticky top-0 z-10 bg-white px-1 py-1 dark:bg-slate-900">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          ) : null}
          {visible.length === 0 ? <p className="px-2 py-2 text-xs text-slate-400">No matches</p> : visible.map((field, index) => {
            const next = visible[index + 1];
            const divider = field.type === 'PAYMENT' && next && next.type !== 'PAYMENT';
            return (
              <button
                key={field.id}
                type="button"
                role="option"
                aria-selected={field.id === selected.id}
                onClick={() => choose(field.id)}
                className={`block w-full cursor-pointer rounded-md px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${divider ? 'mb-1 border-b border-slate-200 pb-2 dark:border-slate-700' : ''} ${field.id === selected.id ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200' : ''}`}
              >
                {field.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </span>
  );
}

function DateRangeFilter({ preset, range, onPreset, onRange, label = 'Date range' }: {
  preset: RangePreset;
  range: DateRange;
  onPreset: (preset: RangePreset) => void;
  onRange: (range: DateRange) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = DATE_PRESETS.find((item) => item.id === preset) || DATE_PRESETS[0];
  const visible = DATE_PRESETS.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()));
  const choose = (next: RangePreset) => {
    if (next === 'custom') onRange(range);
    else onPreset(next);
    setOpen(false);
    setQuery('');
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
      <span className="inline-flex items-center gap-1">
        {label}
        <ScoreNote label={label} text="This date range is shared across Owner Reports and stays in place when you open another report." className="relative inline-flex" align="left" />
      </span>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
        className={`${selectClass} inline-flex w-max max-w-full items-center gap-2 text-left`}
      >
        <span>{selected.label}</span>
        {preset !== 'custom' ? <span className="tabular-nums text-slate-400 dark:text-slate-500">{formatFilterSpan(range)}</span> : null}
      </button>
      {open ? (
        <div role="listbox" aria-label="Date range" className="absolute left-0 top-full z-40 mt-1 max-h-[min(36rem,calc(100dvh-14rem))] w-80 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 text-sm font-medium normal-case tracking-normal text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {DATE_PRESETS.length > 8 ? (
            <div className="sticky top-0 z-10 bg-white px-1 py-1 dark:bg-slate-900">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          ) : null}
          {visible.length === 0 ? <p className="px-2 py-2 text-xs text-slate-400">No matches</p> : visible.map((item) => {
            const span = item.id === 'custom' ? null : formatFilterSpan(rangeForPreset(item.id));
            const active = item.id === preset;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => choose(item.id)}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${active ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200' : ''}`}
              >
                <span className="shrink-0">{item.label}</span>
                {span ? <span className="tabular-nums text-slate-400 dark:text-slate-500">{span}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function filterPlural(label: string): string {
  const nouns: Record<string, string> = {
    Group: 'groups',
    Status: 'statuses',
    Side: 'sides',
    'Primary agent': 'primary agents',
    'Lead source': 'lead sources',
    Entity: 'entities',
  };
  return nouns[label] || `${label.toLowerCase()}s`;
}

function samePick(left: string[], right: string[], fold: boolean): boolean {
  if (left.length !== right.length) return false;
  return left.every((item) => right.some((value) => fold ? value.toLowerCase() === item.toLowerCase() : value === item));
}

function MultiFilter({ label, note, options, picked, fallback, onChange, fold = false }: {
  label: string;
  note?: string;
  options: FilterChoice[];
  picked: string[] | null;
  fallback: string[] | null;
  onChange: (value: string[] | null) => void;
  fold?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const values = options.map((option) => option.value);
  const chosen = (value: string) => {
    const active = picked ?? fallback;
    if (active == null) return true;
    return active.some((item) => fold ? item.toLowerCase() === value.toLowerCase() : item === value);
  };
  const checkedValues = values.filter(chosen);
  const selectedLabels = options.filter((option) => chosen(option.value)).map((option) => option.label);
  const summary = selectedLabels.length === options.length ? 'All' : selectedLabels.length === 0 ? 'None' : selectedLabels.length <= 3 ? selectedLabels.join(', ') : `${selectedLabels.length} ${filterPlural(label)}`;
  const visible = options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()));
  const commit = (next: string[]) => {
    const target = fallback ?? values;
    onChange(samePick(next, target, fold) ? null : next);
  };
  const toggle = (value: string) => {
    const next = chosen(value)
      ? checkedValues.filter((item) => fold ? item.toLowerCase() !== value.toLowerCase() : item !== value)
      : [...checkedValues, value];
    commit(next);
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
      <span className="inline-flex items-center gap-1">
        {label}
        {note ? <ScoreNote label={label} text={note} className="relative inline-flex" align="left" /> : null}
      </span>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
        className={`${selectClass} min-w-[9rem] max-w-[24rem] truncate text-left ${options.length > 0 && selectedLabels.length === 0 ? '!border-amber-500 !bg-amber-50 !text-amber-900 ring-2 ring-amber-400/80 dark:!border-amber-400 dark:!bg-amber-950 dark:!text-amber-100' : ''}`}
        title={summary}
      >
        {summary}
      </button>
      {open ? (
        <div role="listbox" aria-label={label} aria-multiselectable="true" className="absolute left-0 top-full z-40 mt-1 max-h-[min(36rem,calc(100dvh-14rem))] w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 text-sm font-medium normal-case tracking-normal text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          <div className="sticky top-0 z-10 bg-white px-1 py-1 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => commit(values)} className="cursor-pointer rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950">Select all</button>
              <button type="button" onClick={() => onChange(null)} className="cursor-pointer rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Reset</button>
            </div>
            {options.length > 8 ? (
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            ) : null}
          </div>
          {visible.length === 0 ? <p className="px-2 py-2 text-xs text-slate-400">No matches</p> : visible.map((option) => (
            <div key={option.value} className="group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => toggle(option.value)}>
              <input type="checkbox" readOnly checked={chosen(option.value)} className="pointer-events-none cursor-pointer" />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              <span className="relative shrink-0">
                <span className="block min-w-[4.5rem] text-right text-xs tabular-nums text-slate-400 group-hover:opacity-0">{option.count.toLocaleString()}</span>
                <button
                  type="button"
                  className="absolute inset-0 hidden cursor-pointer items-center justify-end text-[10px] font-bold uppercase tracking-wide text-emerald-700 group-hover:flex dark:text-emerald-300"
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange([option.value]);
                  }}
                >
                  Only
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
      <span className="inline-flex items-center gap-1">
        {label}
        {note ? <ScoreNote label={label} text={note} className="relative inline-flex" align="left" /> : null}
      </span>
      {children}
    </label>
  );
}

const selectClass = 'report-field h-9 cursor-pointer rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 text-sm font-medium normal-case tracking-normal text-slate-800 dark:text-slate-100';

function Unavailable({ note }: { note: string }) {
  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-5 text-sm text-amber-900 dark:text-amber-200">
      {note}
    </div>
  );
}

function ReportBody(props: {
  id: string;
  range: DateRange;
  priorRange: DateRange;
  metric: MetricId;
  closed: ReportDeal[];
  pending: ReportDeal[];
  taken: ReportDeal[];
  closedPrior: ReportDeal[];
  pendingPrior: ReportDeal[];
  names: Map<string, string>;
  netCommission: number;
  priorNetCommission: number;
  allDeals: ReportDeal[];
  deals: ReportDeal[];
  payments: ReportPayment[];
  entityNames: Map<string, string>;
  teamLeadIds: Set<string>;
  boardField: BoardField;
  payeePicked: string[] | null;
  excludeTeamLeads: boolean;
  dateBasis: LeaderboardDate;
  sidePicked: string[] | null;
  cumulative: boolean;
}) {
  const { id, closed, pending, taken, closedPrior, pendingPrior, names, range, priorRange, metric, netCommission, priorNetCommission, allDeals, deals, payments, entityNames, teamLeadIds, boardField, payeePicked, excludeTeamLeads, dateBasis, sidePicked, cumulative } = props;
  const closing = seriesBuckets(closed, (deal) => deal.closingDate, range);
  const closingPrior = seriesBuckets(closedPrior, (deal) => deal.closingDate, priorRange);
  const pendingSeries = seriesBuckets(pending, (deal) => deal.acceptanceDate || deal.closingDate, range);
  const pendingPriorSeries = seriesBuckets(pendingPrior, (deal) => deal.acceptanceDate || deal.closingDate, priorRange);
  if (id === 'owner-summary') {
    return (
      <OwnerSummary
        closed={closed}
        closedPrior={closedPrior}
        net={netCommission}
        priorNet={priorNetCommission}
        deals={allDeals}
        payments={payments}
        teamLeadIds={teamLeadIds}
        range={range}
      />
    );
  }
  if (id === 'team-performance') return <TeamPerformance deals={deals} range={range} priorRange={priorRange} dateBasis={dateBasis} sidePicked={sidePicked} cumulative={cumulative} />;
  if (id === 'net-commission-income') {
    return (
      <div className="space-y-3">
        <LineChart title="Net commission income" metric="net" current={closing} previous={closingPrior} />
        <MonthlyTable title="Net commission income by closing month" rows={closing} mode="net" />
      </div>
    );
  }
  if (id === 'net-commission-analysis') return <NetAnalysis range={range} priorRange={priorRange} closed={closed} closedPrior={closedPrior} />;
  if (id === 'pended-vs-closing') return <PendedVsClosing range={range} priorRange={priorRange} metric={metric} closed={closed} pending={pending} taken={taken} closedPrior={closedPrior} pendingPrior={pendingPrior} />;
  if (id === 'agent-leaderboard-closing') {
    return <ProductionLeaderboard deals={deals} range={range} priorRange={priorRange} field={{ id: 'agent_id', label: 'Primary agent', type: 'AGENT_PICKER' }} names={names} />;
  }
  if (id === 'team-productivity') {
    return (
      <div className="space-y-3">
        <LineChart title={METRICS.find((item) => item.id === metric)?.label || 'Metric'} metric={metric} current={closing} previous={closingPrior} />
        <AgentTable rows={byAgent(closed, names)} caption="Closed transactions" />
      </div>
    );
  }
  if (id === 'agent-leaderboard-pended') {
    return (
      <div className="space-y-3">
        <LineChart title={METRICS.find((item) => item.id === metric)?.label || 'Metric'} metric={metric} current={pendingSeries} previous={pendingPriorSeries} />
        <AgentTable rows={byAgent(pending, names)} caption="Pending transactions" />
      </div>
    );
  }
  if (id === 'net-agent-leaderboard' || id === 'agent-post-splits') return <AgentTable rows={agentPaidRows(closed)} caption="Closed transactions, split across the agents on each deal" paid />;
  if (id === 'lead-source-leaderboard') return <ProductionLeaderboard deals={deals} range={range} priorRange={priorRange} field={boardField} names={names} payments={payments} entityNames={entityNames} payeePicked={payeePicked} excludeTeamLeads={excludeTeamLeads} teamLeadIds={teamLeadIds} dateBasis={dateBasis} />;
  if (id === 'listings-by-list-date') {
    const listed = seriesBuckets(taken, (deal) => deal.listDate, range);
    return (
      <div className="space-y-3">
        <LineChart title="Listings taken" metric="units" current={listed} previous={[]} />
        <MonthlyTable title="Listings taken by list month" rows={listed} mode="units" />
      </div>
    );
  }
  if (id === 'transaction-list' || id === 'transaction-detail') return <DealTable deals={[...closed, ...pending]} names={names} detailed={id === 'transaction-detail'} />;
  if (id === 'price-change') return <PriceChange deals={closed} names={names} />;
  if (id === 'daily-management') return <DailyManagement range={range} closed={closed} pending={pending} taken={taken} />;
  return null;
}

function closingMonthKey(date: Date | null): string | null {
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function priorMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  return `${Number(year) - 1}-${month}`;
}

function formatMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function OwnerSummary({ closed, closedPrior, net, priorNet, deals, payments, teamLeadIds, range }: {
  closed: ReportDeal[];
  closedPrior: ReportDeal[];
  net: number;
  priorNet: number;
  deals: ReportDeal[];
  payments: ReportPayment[];
  teamLeadIds: Set<string>;
  range: DateRange;
}) {
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [pulse, setPulse] = useState(0);
  const skipPulse = useRef(true);

  useEffect(() => {
    setMonthKey(null);
  }, [range.start, range.end]);

  useEffect(() => {
    if (skipPulse.current) {
      skipPulse.current = false;
      return;
    }
    setPulse((value) => value + 1);
  }, [monthKey]);

  const selectMonth = (key: string) => {
    setMonthKey((current) => (key === 'total' || current === key ? null : key));
  };

  const shownClosed = monthKey ? closed.filter((deal) => closingMonthKey(deal.closingDate) === monthKey) : closed;
  const shownPrior = monthKey ? closedPrior.filter((deal) => closingMonthKey(deal.closingDate) === priorMonthKey(monthKey)) : closedPrior;
  const shownNet = monthKey ? teamLeadNet(payments, shownClosed, teamLeadIds) : net;
  const shownPriorNet = monthKey ? teamLeadNet(payments, shownPrior, teamLeadIds) : priorNet;
  const closedTotals = sumOf(shownClosed);
  const priorTotals = sumOf(shownPrior);
  const sellers = shownClosed.filter((deal) => deal.side.trim().toLowerCase() === 'seller');
  const buyers = shownClosed.filter((deal) => deal.side.trim().toLowerCase() === 'buyer');
  const priorSellers = shownPrior.filter((deal) => deal.side.trim().toLowerCase() === 'seller');
  const priorBuyers = shownPrior.filter((deal) => deal.side.trim().toLowerCase() === 'buyer');
  const sellerTotals = sumOf(sellers);
  const buyerTotals = sumOf(buyers);
  const priorSellerTotals = sumOf(priorSellers);
  const priorBuyerTotals = sumOf(priorBuyers);
  const totalCommission = closedTotals.commission;
  const priorCommission = priorTotals.commission;
  const costOfSales = totalCommission - shownNet;
  const priorCost = priorCommission - shownPriorNet;
  const operatingExpenses = 0;
  const netIncome = shownNet - operatingExpenses;
  const priorIncome = shownPriorNet - operatingExpenses;
  const months = ownerMonthTable(deals, payments, teamLeadIds, range);
  const monthLabel = monthKey ? formatMonthKey(monthKey) : '';
  const priorLabel = monthKey ? formatMonthKey(priorMonthKey(monthKey)) : '';
  return (
    <div className="space-y-10">
      {monthKey ? (
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
          Showing {monthLabel}, compared with {priorLabel}. Click the month again to restore the full range.
        </p>
      ) : null}
      <div className="flex flex-wrap items-stretch gap-6">
        <div className="min-w-[min(100%,18rem)] flex-1 basis-[24rem] space-y-3">
          <SectionHeading>Closed Net Commission Income to Owner(s)</SectionHeading>
          <div className="grid w-full items-stretch gap-2 [&>span]:self-center grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
            <Score pulse={pulse} label="Total commission" amount={totalCommission} changeAmount={totalCommission - priorCommission} />
            <span className="text-lg font-semibold text-emerald-600/70 dark:text-emerald-400/80">−</span>
            <Score pulse={pulse} label="Cost of sales" amount={costOfSales} changeAmount={costOfSales - priorCost} />
            <span className="text-lg font-semibold text-emerald-600/70 dark:text-emerald-400/80">=</span>
            <Score pulse={pulse} label="Net commission income" amount={shownNet} changeAmount={shownNet - shownPriorNet} tone="result" />
          </div>
        </div>
        <div className="min-w-[min(100%,18rem)] flex-1 basis-[24rem] space-y-3">
          <SectionHeading>Closed Net Income to Owner(s)</SectionHeading>
          <div className="grid w-full items-stretch gap-2 [&>span]:self-center grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
            <Score pulse={pulse} label="Net commission income" amount={shownNet} changeAmount={shownNet - shownPriorNet} />
            <span className="text-lg font-semibold text-emerald-600/70 dark:text-emerald-400/80">−</span>
            <Score pulse={pulse} label="Operating expenses" amount={operatingExpenses} change="—" />
            <span className="text-lg font-semibold text-emerald-600/70 dark:text-emerald-400/80">=</span>
            <Score pulse={pulse} label="Net income" amount={netIncome} changeAmount={netIncome - priorIncome} tone="result" />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-stretch gap-6">
        <div className="min-w-[min(100%,18rem)] flex-1 basis-[24rem] space-y-3">
          <SectionHeading>Return on Investment (ROI)</SectionHeading>
          <div className="grid w-full items-stretch gap-2 [&>span]:self-center grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
            <Score pulse={pulse} label="Net income" amount={netIncome} changeAmount={netIncome - priorIncome} />
            <span className="text-lg font-semibold text-emerald-600/70 dark:text-emerald-400/80">/</span>
            <Score pulse={pulse} label="Operating expenses" amount={operatingExpenses} change="—" />
            <span className="text-lg font-semibold text-emerald-600/70 dark:text-emerald-400/80">=</span>
            <Score pulse={pulse} label="ROI" value={percent(netIncome, operatingExpenses)} change="—" tone="result" />
          </div>
        </div>
        <div className="min-w-[min(100%,18rem)] flex-1 basis-[24rem] space-y-3">
          <SectionHeading>Net Income to Total Commission Ratio (NI/TC)</SectionHeading>
          <div className="grid w-full items-stretch gap-2 [&>span]:self-center grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
            <Score pulse={pulse} label="Net income" amount={netIncome} changeAmount={netIncome - priorIncome} />
            <span className="text-lg font-semibold text-emerald-600/70 dark:text-emerald-400/80">/</span>
            <Score pulse={pulse} label="Total commission" amount={totalCommission} changeAmount={totalCommission - priorCommission} />
            <span className="text-lg font-semibold text-emerald-600/70 dark:text-emerald-400/80">=</span>
            <Score pulse={pulse} label="NI/TC" value={percent(netIncome, totalCommission)} change={signedRatioChange(netIncome, priorIncome, totalCommission, priorCommission)} tone="result" />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-stretch gap-6">
        <div className="min-w-[min(100%,18rem)] flex-1 basis-[24rem] space-y-3">
          <SectionHeading tone="listing">Average Listing Metrics</SectionHeading>
          <div className="grid w-full items-stretch gap-2 [&>span]:self-center grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
            <Score pulse={pulse} label="Avg. sales price" tone="listing" {...averageFigures(sellerTotals.volume, sellerTotals.units, priorSellerTotals.volume, priorSellerTotals.units)} />
            <span className="invisible text-lg font-semibold" aria-hidden="true">−</span>
            <Score pulse={pulse} label="Avg. GCI" tone="listing" {...averageFigures(sellerTotals.gci, sellerTotals.units, priorSellerTotals.gci, priorSellerTotals.units)} />
            <span className="invisible text-lg font-semibold" aria-hidden="true">=</span>
            <Score pulse={pulse} label="Avg. GCI %" tone="listing" value={percent(sellerTotals.gci, sellerTotals.volume)} change={signedRatioChange(sellerTotals.gci, priorSellerTotals.gci, sellerTotals.volume, priorSellerTotals.volume)} />
          </div>
        </div>
        <div className="min-w-[min(100%,18rem)] flex-1 basis-[24rem] space-y-3">
          <SectionHeading tone="buyer">Average Buyer Metrics</SectionHeading>
          <div className="grid w-full items-stretch gap-2 [&>span]:self-center grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
            <Score pulse={pulse} label="Avg. sales price" tone="buyer" {...averageFigures(buyerTotals.volume, buyerTotals.units, priorBuyerTotals.volume, priorBuyerTotals.units)} />
            <span className="invisible text-lg font-semibold" aria-hidden="true">−</span>
            <Score pulse={pulse} label="Avg. GCI" tone="buyer" {...averageFigures(buyerTotals.gci, buyerTotals.units, priorBuyerTotals.gci, priorBuyerTotals.units)} />
            <span className="invisible text-lg font-semibold" aria-hidden="true">=</span>
            <Score pulse={pulse} label="Avg. GCI %" tone="buyer" value={percent(buyerTotals.gci, buyerTotals.volume)} change={signedRatioChange(buyerTotals.gci, priorBuyerTotals.gci, buyerTotals.volume, priorBuyerTotals.volume)} />
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <SectionHeading>Month-over-Month Production</SectionHeading>
        <MonthTable rows={months} selectedMonth={monthKey} onSelectMonth={selectMonth} />
      </div>
    </div>
  );
}

type TrendMetric = 'volume' | 'gci' | 'units' | 'rate' | 'price' | 'team';

function smoothRuns(points: Array<{ x: number; y: number }>, present: boolean[]): Array<Array<{ x: number; y: number }>> {
  const runs: Array<Array<{ x: number; y: number }>> = [];
  let run: Array<{ x: number; y: number }> = [];
  points.forEach((point, index) => {
    if (present[index]) run.push(point);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  });
  if (run.length) runs.push(run);
  return runs;
}

function areaUnder(points: Array<{ x: number; y: number }>, baseline: number): string {
  if (points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${smoothLine(points)} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
}

function roundedTopBar(x: number, y: number, barWidth: number, barHeight: number, radius: number): string {
  if (barHeight <= 0.5 || barWidth <= 0) return '';
  const curve = Math.min(radius, barWidth / 2, barHeight);
  const bottom = y + barHeight;
  return `M ${x} ${bottom} L ${x} ${y + curve} Q ${x} ${y} ${x + curve} ${y} L ${x + barWidth - curve} ${y} Q ${x + barWidth} ${y} ${x + barWidth} ${y + curve} L ${x + barWidth} ${bottom} Z`;
}

function smoothLine(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const before = points[index - 1] || points[index];
    const start = points[index];
    const end = points[index + 1];
    const after = points[index + 2] || end;
    const low = Math.min(start.y, end.y);
    const high = Math.max(start.y, end.y);
    const clamp = (value: number) => Math.min(high, Math.max(low, value));
    const c1x = start.x + (end.x - before.x) / 6;
    const c1y = clamp(start.y + (end.y - before.y) / 6);
    const c2x = end.x - (after.x - start.x) / 6;
    const c2y = clamp(end.y - (after.y - start.y) / 6);
    path += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${end.x} ${end.y}`;
  }
  return path;
}

function trendTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / 3;
  const magnitude = 10 ** Math.floor(Math.log10(max < 1 ? rough : Math.max(rough, 1)));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((value) => value >= rough) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step * 0.001; value += step) ticks.push(value);
  if (ticks[ticks.length - 1] <= max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

function monthTitle(row: MonthRow | undefined): string {
  if (!row) return '';
  const month = /^(\d{4})-(\d{2})$/.exec(row.key);
  if (month) return new Date(Number(month[1]), Number(month[2]) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(row.key);
  if (day) return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return row.label;
}

function signedTrend(value: number, metric: TrendMetric): string {
  if (metric === 'units') return signedCount(value);
  if (metric === 'rate') {
    const formatted = `${Math.abs(value * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
    if (value > 0) return `+${formatted}`;
    if (value < 0) return `−${formatted}`;
    return formatted;
  }
  return signedFull(value);
}

function sumTrend(deals: ReportDeal[], metric: TrendMetric, status?: 'closed' | 'pending'): number {
  return deals.reduce((total, deal) => {
    if (status && deal.status.trim().toLowerCase() !== status) return total;
    if (metric === 'units') return total + 1;
    if (metric === 'gci') return total + deal.gciAmount;
    if (metric === 'team') return total + deal.teamGci;
    return total + deal.salesPrice;
  }, 0);
}

function formatTrend(value: number, metric: TrendMetric, compact = false): string {
  if (metric === 'units') return Math.round(value).toLocaleString();
  if (metric === 'rate') return `${(value * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
  return compact ? compactMoney(value) : fullMoney(value);
}

function trendValue(row: Totals, metric: TrendMetric): number {
  if (metric === 'rate') return row.volume > 0 ? row.gci / row.volume : 0;
  if (metric === 'price') return row.units > 0 ? row.volume / row.units : 0;
  if (metric === 'team') return row.teamGci;
  return metricValue(row, metric);
}

function trendPresent(row: Totals, metric: TrendMetric): boolean {
  if (metric === 'rate') return row.volume > 0;
  if (metric === 'price') return row.units > 0;
  return true;
}

function meanTrend(rows: MonthRow[], metric: TrendMetric): number {
  const present = rows.filter((row) => trendPresent(row, metric));
  const used = present.length ? present : rows;
  if (!used.length) return 0;
  return used.reduce((sum, row) => sum + trendValue(row, metric), 0) / used.length;
}

function ratioTrend(deals: ReportDeal[], metric: TrendMetric, status?: 'closed' | 'pending'): number {
  let sales = 0;
  let gci = 0;
  let units = 0;
  deals.forEach((deal) => {
    if (status && deal.status.trim().toLowerCase() !== status) return;
    sales += deal.salesPrice;
    gci += deal.gciAmount;
    units += 1;
  });
  if (metric === 'rate') return sales > 0 ? gci / sales : 0;
  return units > 0 ? sales / units : 0;
}

function isSaleSide(side: string): boolean {
  const value = side.trim().toLowerCase();
  return value === 'buyer' || value === 'seller';
}

function saleSidesSelected(picked: string[] | null): boolean {
  if (!picked) return true;
  return picked.some((item) => isSaleSide(item));
}

const SALE_SIDE_NOTE = 'These two sections are specific to Buyer and Seller transactions only.';

function TeamPerformance({ deals, range, priorRange, dateBasis, sidePicked, cumulative }: { deals: ReportDeal[]; range: DateRange; priorRange: DateRange; dateBasis: LeaderboardDate; sidePicked: string[] | null; cumulative: boolean }) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'closed' | 'pending'>('all');
  useEffect(() => {
    setStatusFilter('all');
  }, [dateBasis]);
  const selectStatus = (status: 'all' | 'closed' | 'pending') => {
    setStatusFilter((value) => (value === status ? 'all' : status));
  };
  const currentDeals = useMemo(() => closedOrPendingOnDate(deals, range, dateBasis), [dateBasis, deals, range]);
  const priorDeals = useMemo(() => closedOrPendingOnDate(deals, priorRange, dateBasis), [dateBasis, deals, priorRange]);
  const shown = useMemo(() => dealsForStatus(currentDeals, statusFilter), [currentDeals, statusFilter]);
  const shownPrior = useMemo(() => dealsForStatus(priorDeals, statusFilter), [priorDeals, statusFilter]);
  const months = useMemo(() => seriesBuckets(shown, (deal) => (dateBasis === 'acceptance' ? deal.acceptanceDate : deal.closingDate), range), [dateBasis, range, shown]);
  const priorMonths = useMemo(() => seriesBuckets(shownPrior, (deal) => (dateBasis === 'acceptance' ? deal.acceptanceDate : deal.closingDate), priorRange), [dateBasis, priorRange, shownPrior]);
  const saleCurrent = useMemo(() => currentDeals.filter((deal) => isSaleSide(deal.side)), [currentDeals]);
  const salePrior = useMemo(() => priorDeals.filter((deal) => isSaleSide(deal.side)), [priorDeals]);
  const saleShown = useMemo(() => dealsForStatus(saleCurrent, statusFilter), [saleCurrent, statusFilter]);
  const saleShownPrior = useMemo(() => dealsForStatus(salePrior, statusFilter), [salePrior, statusFilter]);
  const saleMonths = useMemo(() => seriesBuckets(saleShown, (deal) => (dateBasis === 'acceptance' ? deal.acceptanceDate : deal.closingDate), range), [dateBasis, range, saleShown]);
  const salePriorMonths = useMemo(() => seriesBuckets(saleShownPrior, (deal) => (dateBasis === 'acceptance' ? deal.acceptanceDate : deal.closingDate), priorRange), [dateBasis, priorRange, saleShownPrior]);
  const saleNotice = saleSidesSelected(sidePicked) ? undefined : SALE_SIDE_NOTE;
  const panel = {
    months,
    priorMonths,
    currentDeals,
    priorDeals,
    statusFilter,
    onSelectStatus: selectStatus,
  };
  const salePanel = {
    months: saleMonths,
    priorMonths: salePriorMonths,
    currentDeals: saleCurrent,
    priorDeals: salePrior,
    statusFilter,
    onSelectStatus: selectStatus,
    notice: saleNotice,
  };
  return (
    <div className={pairedReport}>
      <TrendPanel metric="volume" title="Sales volume" tone="volume" currentClass="text-teal-700 dark:text-teal-300" previousClass="text-teal-300 dark:text-teal-600" accentClass="text-teal-700 dark:text-teal-200" cumulative={cumulative} {...panel} />
      <TrendPanel metric="gci" title="Gross commission income" tone="emerald" currentClass="text-emerald-700 dark:text-emerald-300" previousClass="text-emerald-300 dark:text-emerald-700" accentClass="text-emerald-700 dark:text-emerald-200" cumulative={cumulative} {...panel} />
      <TrendPanel metric="units" title="Units" tone="units" currentClass="text-purple-700 dark:text-purple-300" previousClass="text-purple-300 dark:text-purple-700" accentClass="text-purple-700 dark:text-purple-200" cumulative={cumulative} {...panel} />
      <TrendPanel metric="team" title="Team Commission" tone="team" currentClass="text-rose-700 dark:text-rose-300" previousClass="text-rose-300 dark:text-rose-600" accentClass="text-rose-700 dark:text-rose-200" cumulative={cumulative} {...panel} />
      <TrendPanel metric="price" title="Sales price" tone="price" currentClass="text-amber-600 dark:text-amber-300" previousClass="text-amber-300 dark:text-amber-700" accentClass="text-amber-700 dark:text-amber-200" chart="bars" {...salePanel} />
      <TrendPanel metric="rate" title="Gross commission percentage" tone="rate" currentClass="text-sky-700 dark:text-sky-300" previousClass="text-sky-300 dark:text-sky-600" accentClass="text-sky-700 dark:text-sky-200" chart="bars" {...salePanel} />
    </div>
  );
}

function TrendPanel({ metric, title, tone, currentClass, previousClass, accentClass, chart = 'line', cumulative = false, months, priorMonths, currentDeals, priorDeals, statusFilter, onSelectStatus, notice }: {
  metric: TrendMetric;
  title: string;
  tone: 'volume' | 'emerald' | 'units' | 'rate' | 'price' | 'team';
  currentClass: string;
  previousClass: string;
  accentClass: string;
  chart?: 'line' | 'bars';
  cumulative?: boolean;
  months: MonthRow[];
  priorMonths: MonthRow[];
  currentDeals: ReportDeal[];
  priorDeals: ReportDeal[];
  statusFilter: 'all' | 'closed' | 'pending';
  onSelectStatus: (status: 'all' | 'closed' | 'pending') => void;
  notice?: string;
}) {
  const ratio = metric === 'rate' || metric === 'price';
  const closed = ratio ? ratioTrend(currentDeals, metric, 'closed') : Math.round(sumTrend(currentDeals, metric, 'closed'));
  const pending = ratio ? ratioTrend(currentDeals, metric, 'pending') : Math.round(sumTrend(currentDeals, metric, 'pending'));
  const total = ratio ? ratioTrend(currentDeals, metric) : closed + pending;
  const priorClosed = ratio ? ratioTrend(priorDeals, metric, 'closed') : Math.round(sumTrend(priorDeals, metric, 'closed'));
  const priorTotal = ratio ? ratioTrend(priorDeals, metric) : priorClosed + Math.round(sumTrend(priorDeals, metric, 'pending'));
  const chartProps = { metric, title, months, priorMonths, currentClass, previousClass };
  return (
    <section className={pairedSection}>
      <SectionHeading tone={tone === 'emerald' ? undefined : tone} note={metric === 'team' ? 'Team Commission is the commission left after off-the-top deductions and pre-splits are subtracted from Total Commission.' : undefined}>{title}</SectionHeading>
      {notice ? (
        <div className="flex min-h-[28rem] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-8 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          {notice}
        </div>
      ) : (
        <>
      <div className={pairedScores}>
        <TrendScore tone={tone} label="Total" amount={formatTrend(total, metric)} toneClass="" dollar={signedTrend(total - priorTotal, metric)} percent={signedChangePercent(total, priorTotal)} current={total} prior={priorTotal} selected={statusFilter === 'all'} onSelect={() => onSelectStatus('all')} />
        <TrendScore tone={tone} label="Closed" amount={formatTrend(closed, metric)} toneClass={accentClass} dollar={signedTrend(closed - priorClosed, metric)} percent={signedChangePercent(closed, priorClosed)} current={closed} prior={priorClosed} selected={statusFilter === 'closed'} onSelect={() => onSelectStatus('closed')} />
        <TrendScore tone={tone} label="Pending" amount={formatTrend(pending, metric)} toneClass="text-slate-400" selected={statusFilter === 'pending'} onSelect={() => onSelectStatus('pending')} />
      </div>
      {chart === 'bars' ? <PriceBars {...chartProps} /> : <TrendChart {...chartProps} cumulative={cumulative} />}
        </>
      )}
    </section>
  );
}

function TrendScore({ tone, label, amount, toneClass, dollar, percent, current = 0, prior = 0, selected, onSelect }: {
  tone: 'volume' | 'emerald' | 'units' | 'rate' | 'price' | 'team';
  label: string;
  amount: string;
  toneClass: string;
  dollar?: string;
  percent?: string;
  current?: number;
  prior?: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const selectedClass = tone === 'volume'
    ? 'border-teal-500 bg-[#d7f6fa] ring-2 ring-teal-400 dark:border-teal-300 dark:bg-teal-950/80 dark:ring-teal-400'
    : tone === 'units'
      ? 'border-purple-400 bg-[#f3e8ff] ring-2 ring-purple-300 dark:border-purple-300 dark:bg-purple-950/80 dark:ring-purple-400'
      : tone === 'rate'
        ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-400 dark:border-sky-300 dark:bg-sky-950/80 dark:ring-sky-400'
        : tone === 'price'
          ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-400 dark:border-amber-300 dark:bg-amber-950/80 dark:ring-amber-400'
          : tone === 'team'
            ? 'border-rose-500 bg-rose-50 ring-2 ring-rose-400 dark:border-rose-300 dark:bg-rose-950/80 dark:ring-rose-400'
            : 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-400 dark:border-emerald-300 dark:bg-emerald-950/80 dark:ring-emerald-400';
  const focusClass = tone === 'volume' ? 'focus-visible:ring-teal-400' : tone === 'units' ? 'focus-visible:ring-purple-400' : tone === 'rate' ? 'focus-visible:ring-sky-400' : tone === 'price' ? 'focus-visible:ring-amber-400' : tone === 'team' ? 'focus-visible:ring-rose-400' : 'focus-visible:ring-emerald-400';
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`w-full min-w-0 cursor-pointer appearance-none rounded-xl border px-3 py-2 text-center shadow-sm [outline:none] focus-visible:ring-2 ${focusClass} ${selected ? `ring-inset ${selectedClass}` : 'border-slate-200/90 bg-white/80 dark:border-slate-700 dark:bg-slate-900/80'}`}
    >
      <p className={`text-xs font-medium uppercase ${toneClass || 'text-slate-500'}`}>{label}</p>
      <p className={`mt-0.5 text-xl font-extrabold tabular-nums ${toneClass}`}>{amount}</p>
      {dollar && percent ? (
          <div className={`mt-1 flex items-baseline justify-center gap-8 text-xs font-semibold tabular-nums ${changeClass(current, prior)}`}>
          <span>{percent}</span>
          <span>{dollar}</span>
        </div>
      ) : <div className="mt-1 h-4" />}
    </button>
  );
}

function runningTotal(values: number[]): number[] {
  let total = 0;
  return values.map((value) => {
    total += value;
    return total;
  });
}

function TrendChart({ metric, title, months, priorMonths, currentClass, previousClass, cumulative = false }: {
  metric: TrendMetric;
  title: string;
  months: MonthRow[];
  priorMonths: MonthRow[];
  currentClass: string;
  previousClass: string;
  cumulative?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const height = 250;
  const pad = { left: 52, right: 16, top: 16, bottom: 32 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const currentValues = months.map((row) => trendValue(row, metric));
  const previousValues = months.map((_, index) => trendValue(priorMonths[index] || emptyTotals(), metric));
  const plottedCurrent = cumulative ? runningTotal(currentValues) : currentValues;
  const plottedPrevious = cumulative ? runningTotal(previousValues) : previousValues;
  const currentPresent = months.map((row) => trendPresent(row, metric));
  const previousPresent = months.map((_, index) => trendPresent(priorMonths[index] || emptyTotals(), metric));
  const max = Math.max(metric === 'rate' ? 0.01 : 1, ...plottedCurrent, ...plottedPrevious);
  const ticks = trendTicks(max);
  const axisMax = ticks[ticks.length - 1] || 1;
  const xAt = (index: number) => pad.left + (months.length <= 1 ? innerW / 2 : (index / (months.length - 1)) * innerW);
  const yAt = (value: number) => pad.top + innerH - (value / axisMax) * innerH;
  const currentPoints = plottedCurrent.map((value, index) => ({ x: xAt(index), y: yAt(value) }));
  const previousPoints = plottedPrevious.map((value, index) => ({ x: xAt(index), y: yAt(value) }));
  const average = meanTrend(months, metric);
  const priorAverage = meanTrend(priorMonths, metric);
  const point = hover === null ? null : months[hover];
  const priorPoint = hover === null ? null : priorMonths[hover];
  const value = hover === null ? 0 : plottedCurrent[hover] || 0;
  const prior = hover === null ? 0 : plottedPrevious[hover] || 0;
  const hoverX = hover === null ? 0 : (xAt(hover) / width) * 100;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-64 w-full overflow-hidden"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            if (!months.length) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * width;
            let nearest = 0;
            let best = Infinity;
            months.forEach((_, index) => {
              const distance = Math.abs(xAt(index) - x);
              if (distance < best) {
                best = distance;
                nearest = index;
              }
            });
            setHover(nearest);
          }}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={yAt(tick)} y2={yAt(tick)} className="stroke-slate-100 dark:stroke-slate-800" strokeWidth="1" />
              <text x={pad.left - 8} y={yAt(tick) + 3} textAnchor="end" className="fill-slate-400" fontSize="11">
                {metric === 'rate' ? `${(tick * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%` : metric === 'units' ? Math.round(tick).toLocaleString() : compactMoney(tick)}
              </text>
            </g>
          ))}
          {smoothRuns(currentPoints, currentPresent).map((run, index) => (
            <path key={`current-fill-${index}`} d={areaUnder(run, yAt(0))} fill="currentColor" fillOpacity="0.2" stroke="none" className={currentClass} />
          ))}
          {smoothRuns(previousPoints, previousPresent).map((run, index) => (
            <path key={`prior-${index}`} d={smoothLine(run)} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={previousClass} />
          ))}
          {smoothRuns(currentPoints, currentPresent).map((run, index) => (
            <path key={`current-${index}`} d={smoothLine(run)} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={currentClass} />
          ))}
          {hover !== null ? (
            <g>
              <line x1={xAt(hover)} x2={xAt(hover)} y1={pad.top} y2={height - pad.bottom} stroke="currentColor" strokeOpacity="0.35" className={currentClass} />
              <circle cx={xAt(hover)} cy={yAt(prior)} r="5.5" fill="currentColor" stroke="white" strokeWidth="2" className={previousClass} />
              <circle cx={xAt(hover)} cy={yAt(value)} r="6" fill="currentColor" stroke="white" strokeWidth="2" className={currentClass} />
            </g>
          ) : null}
          {months.map((row, index) => (
            <text key={row.key} x={xAt(index)} y={height - 8} textAnchor="middle" className="fill-slate-400" fontSize="11">
              {months.length > 14 && index % 2 ? '' : row.label}
            </text>
          ))}
        </svg>
        {point && hover !== null ? (
          <div
            className="pointer-events-none absolute top-3 z-10 w-max whitespace-nowrap rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-950/95"
            style={{ left: `${hoverX}%`, transform: hoverX > 50 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }}
          >
            <p className="font-bold">{title.replace(/\b\w/g, (letter) => letter.toUpperCase())}</p>
            <div className="mt-1.5 grid grid-cols-[auto_auto] items-baseline gap-x-6 gap-y-0.5">
              <span className={currentClass}>{monthTitle(point)}:</span>
              <span className={`text-right font-semibold tabular-nums ${currentClass}`}>{formatTrend(value, metric)}</span>
              <span className={previousClass}>{monthTitle(priorPoint) || 'Prior year'}:</span>
              <span className={`text-right font-semibold tabular-nums ${previousClass}`}>{formatTrend(prior, metric)}</span>
              <span className={`font-semibold ${changeClass(value, prior)}`}>Diff:</span>
              <span className={`text-right font-semibold tabular-nums ${changeClass(value, prior)}`}>{signedTrend(value - prior, metric)} ({signedChangePercent(value, prior)})</span>
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[11px] text-slate-500">
        <span className="inline-flex items-baseline gap-1.5">
          <span className={`h-0.5 w-4 self-center rounded-full bg-current ${currentClass}`} />
          This period
          <span className="inline-flex items-baseline">
            <span className="text-[10px] font-normal text-slate-400">(average: </span>
            <span className={`text-sm font-bold tabular-nums ${currentClass}`}>{formatTrend(average, metric, true)}</span>
            <span className="text-[10px] font-normal text-slate-400">)</span>
          </span>
        </span>
        <span className="inline-flex items-baseline gap-1.5">
          <span className={`h-0.5 w-4 self-center rounded-full bg-current ${previousClass}`} />
          Prior year
          <span className="inline-flex items-baseline">
            <span className="text-[10px] font-normal text-slate-400">(average: </span>
            <span className={`text-sm font-bold tabular-nums ${previousClass}`}>{formatTrend(priorAverage, metric, true)}</span>
            <span className="text-[10px] font-normal text-slate-400">)</span>
          </span>
        </span>
      </div>
    </div>
  );
}

function PriceBars({ metric, title, months, priorMonths, currentClass, previousClass }: {
  metric: TrendMetric;
  title: string;
  months: MonthRow[];
  priorMonths: MonthRow[];
  currentClass: string;
  previousClass: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const height = 250;
  const pad = { left: 52, right: 16, top: 16, bottom: 32 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const currentValues = months.map((row) => trendValue(row, metric));
  const previousValues = months.map((_, index) => trendValue(priorMonths[index] || emptyTotals(), metric));
  const max = Math.max(metric === 'rate' ? 0.01 : 1, ...currentValues, ...previousValues);
  const ticks = trendTicks(max);
  const axisMax = ticks[ticks.length - 1] || 1;
  const slot = months.length ? innerW / months.length : innerW;
  const barWidth = Math.max(4, Math.min(18, slot * 0.32));
  const yAt = (value: number) => pad.top + innerH - (value / axisMax) * innerH;
  const baseline = yAt(0);
  const center = (index: number) => pad.left + slot * index + slot / 2;
  const average = meanTrend(months, metric);
  const priorAverage = meanTrend(priorMonths, metric);
  const point = hover === null ? null : months[hover];
  const priorPoint = hover === null ? null : priorMonths[hover];
  const value = hover === null ? 0 : currentValues[hover] || 0;
  const prior = hover === null ? 0 : previousValues[hover] || 0;
  const hoverX = hover === null ? 0 : (center(hover) / width) * 100;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-64 w-full overflow-hidden"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            if (!months.length) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * width;
            setHover(Math.min(months.length - 1, Math.max(0, Math.floor((x - pad.left) / slot))));
          }}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={yAt(tick)} y2={yAt(tick)} className="stroke-slate-100 dark:stroke-slate-800" strokeWidth="1" />
              <text x={pad.left - 8} y={yAt(tick) + 3} textAnchor="end" className="fill-slate-400" fontSize="11">
                {metric === 'rate' ? `${(tick * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%` : compactMoney(tick)}
              </text>
            </g>
          ))}
          {months.map((row, index) => {
            const priorHeight = Math.max(0, baseline - yAt(previousValues[index] || 0));
            const currentHeight = Math.max(0, baseline - yAt(currentValues[index] || 0));
            const priorX = center(index) + 1.5;
            const currentX = center(index) - barWidth - 1.5;
            return (
              <g key={`bars-${row.key}`}>
                <path d={roundedTopBar(priorX, baseline - priorHeight, barWidth, priorHeight, 6)} fill="currentColor" className={previousClass} />
                <path d={roundedTopBar(currentX, baseline - currentHeight, barWidth, currentHeight, 6)} fill="currentColor" className={currentClass} />
              </g>
            );
          })}
          {months.map((row, index) => (
            <text key={`label-${row.key}`} x={center(index)} y={height - 8} textAnchor="middle" className="fill-slate-400" fontSize="11">
              {months.length > 14 && index % 2 ? '' : row.label}
            </text>
          ))}
        </svg>
        {point && hover !== null ? (
          <div
            className="pointer-events-none absolute top-3 z-10 w-max whitespace-nowrap rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-950/95"
            style={{ left: `${hoverX}%`, transform: hoverX > 50 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }}
          >
            <p className="font-bold">{title.replace(/\b\w/g, (letter) => letter.toUpperCase())}</p>
            <div className="mt-1.5 grid grid-cols-[auto_auto] items-baseline gap-x-6 gap-y-0.5">
              <span className={currentClass}>{monthTitle(point)}:</span>
              <span className={`text-right font-semibold tabular-nums ${currentClass}`}>{formatTrend(value, metric)}</span>
              <span className={previousClass}>{monthTitle(priorPoint) || 'Prior year'}:</span>
              <span className={`text-right font-semibold tabular-nums ${previousClass}`}>{formatTrend(prior, metric)}</span>
              <span className={`font-semibold ${changeClass(value, prior)}`}>Diff:</span>
              <span className={`text-right font-semibold tabular-nums ${changeClass(value, prior)}`}>{signedTrend(value - prior, metric)} ({signedChangePercent(value, prior)})</span>
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[11px] text-slate-500">
        <span className="inline-flex items-baseline gap-1.5">
          <span className={`h-2 w-3 self-center rounded-t bg-current ${currentClass}`} />
          This period
          <span className="text-[10px] font-normal text-slate-400">avg.</span>
          <span className={`text-sm font-bold tabular-nums ${currentClass}`}>{formatTrend(average, metric, true)}</span>
        </span>
        <span className="inline-flex items-baseline gap-1.5">
          <span className={`h-2 w-3 self-center rounded-t bg-current ${previousClass}`} />
          Prior year
          <span className="text-[10px] font-normal text-slate-400">avg.</span>
          <span className={`text-sm font-bold tabular-nums ${previousClass}`}>{formatTrend(priorAverage, metric, true)}</span>
        </span>
      </div>
    </div>
  );
}

function LineChart({ title, metric, current, previous }: { title: string; metric: MetricId; current: MonthRow[]; previous: MonthRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const height = 220;
  const pad = { left: 12, right: 12, top: 16, bottom: 28 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const currentValues = current.map((row) => metricValue(row, metric));
  const previousValues = current.map((_, index) => metricValue(previous[index] || emptyTotals(), metric));
  const max = Math.max(1, ...currentValues, ...previousValues);
  const xAt = (index: number) => pad.left + (current.length <= 1 ? innerW / 2 : (index / (current.length - 1)) * innerW);
  const yAt = (value: number) => pad.top + innerH - (value / max) * innerH;
  const pathFor = (values: number[]) => values.map((value, index) => `${index === 0 ? 'M' : 'L'} ${xAt(index)} ${yAt(value)}`).join(' ');
  const average = currentValues.length ? currentValues.reduce((total, value) => total + value, 0) / currentValues.length : 0;
  const point = hover === null ? null : current[hover];
  const prior = hover === null ? 0 : previousValues[hover] || 0;
  const value = hover === null ? 0 : currentValues[hover] || 0;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-sm font-bold">{title}</h3>
        <p className="text-[11px] text-slate-500">Avg. {formatMetric(average, metric)}</p>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-56"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * width;
            let nearest = 0;
            let best = Infinity;
            current.forEach((_, index) => {
              const distance = Math.abs(xAt(index) - x);
              if (distance < best) {
                best = distance;
                nearest = index;
              }
            });
            setHover(nearest);
          }}
        >
          <line x1={pad.left} x2={width - pad.right} y1={yAt(average)} y2={yAt(average)} stroke="currentColor" className="text-slate-300 dark:text-slate-600" strokeDasharray="4 4" />
          {previous.length > 0 ? <path d={pathFor(previousValues)} fill="none" stroke="#94a3b8" strokeWidth="2" /> : null}
          <path d={pathFor(currentValues)} fill="none" stroke="#10b981" strokeWidth="2.5" />
          {current.map((row, index) => (
            <circle key={row.key} cx={xAt(index)} cy={yAt(currentValues[index])} r={hover === index ? 4.5 : 2.5} fill="#10b981" />
          ))}
          {hover !== null ? <line x1={xAt(hover)} x2={xAt(hover)} y1={pad.top} y2={height - pad.bottom} stroke="#10b981" strokeOpacity="0.35" /> : null}
          {current.map((row, index) => (
            <text key={`${row.key}-label`} x={xAt(index)} y={height - 8} textAnchor="middle" className="fill-slate-400" fontSize="10">
              {current.length > 16 && index % 2 ? '' : row.label}
            </text>
          ))}
        </svg>
        {point && hover !== null ? (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-950/95 px-3 py-2 text-xs shadow-lg"
            style={{ left: `${Math.min(78, Math.max(2, (xAt(hover) / width) * 100))}%` }}
          >
            <p className="font-bold">{point.label}</p>
            <p className="mt-1 text-emerald-600 dark:text-emerald-400">{formatMetric(value, metric)}</p>
            <p className="text-slate-500">Previous year {formatMetric(prior, metric)}</p>
            <p className="text-slate-500">{prior ? percent(value - prior, prior) : '—'}</p>
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex gap-4 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-emerald-500" /> This period</span>
        <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-slate-400" /> Previous year</span>
      </div>
    </div>
  );
}

function emptyTotals(): Totals {
  return { units: 0, volume: 0, gci: 0, commission: 0, agentPaid: 0, net: 0, teamGci: 0 };
}

function PendedVsClosing(props: {
  range: DateRange;
  priorRange: DateRange;
  metric: MetricId;
  closed: ReportDeal[];
  pending: ReportDeal[];
  taken: ReportDeal[];
  closedPrior: ReportDeal[];
  pendingPrior: ReportDeal[];
}) {
  const metricLabel = METRICS.find((item) => item.id === props.metric)?.label || 'Metric';
  const charts = [
    { title: `Closing ${metricLabel}`, current: seriesBuckets(props.closed, (deal) => deal.closingDate, props.range), previous: seriesBuckets(props.closedPrior, (deal) => deal.closingDate, props.priorRange) },
    { title: `Pended ${metricLabel}`, current: seriesBuckets(props.pending, (deal) => deal.acceptanceDate || deal.closingDate, props.range), previous: seriesBuckets(props.pendingPrior, (deal) => deal.acceptanceDate || deal.closingDate, props.priorRange) },
  ];
  const tables = [
    { title: 'Buyers closed', rows: seriesBuckets(props.closed.filter((deal) => isBuyerSide(deal.side)), (deal) => deal.closingDate, props.range) },
    { title: 'Buyers pended', rows: seriesBuckets(props.pending.filter((deal) => isBuyerSide(deal.side)), (deal) => deal.acceptanceDate || deal.closingDate, props.range) },
    { title: 'Listings closed', rows: seriesBuckets(props.closed.filter((deal) => isListingSide(deal.side)), (deal) => deal.closingDate, props.range) },
    { title: 'Listings pended', rows: seriesBuckets(props.pending.filter((deal) => isListingSide(deal.side)), (deal) => deal.acceptanceDate || deal.closingDate, props.range) },
    { title: 'Listings taken', rows: seriesBuckets(props.taken, (deal) => deal.listDate, props.range) },
  ];
  return (
    <div className="space-y-3">
      <div className="grid xl:grid-cols-2 gap-3">
        {charts.map((chart) => <LineChart key={chart.title} title={chart.title} metric={props.metric} current={chart.current} previous={chart.previous} />)}
      </div>
      <div className="grid xl:grid-cols-2 gap-3">
        {tables.map((item) => <MonthlyTable key={item.title} title={item.title} rows={item.rows} mode="units" />)}
      </div>
    </div>
  );
}

function MonthlyTable({ title, rows, mode }: { title: string; rows: MonthRow[]; mode: 'production' | 'net' | 'units' }) {
  const total = sumRows(rows);
  const { sort, toggle } = useColumnSort();
  const ordered = sortBy(rows, sort, (row, key) => (key === 'label' ? row.key : row[key as keyof MonthRow]) as string | number);
  return (
    <div className={reportTableWrap}>
      <table className="w-full text-sm">
        <thead className="report-head text-sm uppercase tracking-wider text-slate-500">
          <tr>
            <SortHead column="label" label={title} sort={sort} onSort={toggle} className="px-3 py-2" />
            {mode === 'units' ? <SortHead column="units" label="Units" sort={sort} onSort={toggle} align="right" className="px-3 py-2" /> : null}
            {mode === 'net' ? <SortHead column="net" label="Net commission income" sort={sort} onSort={toggle} align="right" className="px-3 py-2" /> : null}
            {mode === 'production' ? (
              <>
                <SortHead column="units" label="Units" sort={sort} onSort={toggle} align="right" className="px-3 py-2" />
                <SortHead column="volume" label="Volume" sort={sort} onSort={toggle} align="right" className="px-3 py-2" />
                <SortHead column="gci" label="GCI" sort={sort} onSort={toggle} align="right" className="px-3 py-2" />
                <SortHead column="net" label="Net" sort={sort} onSort={toggle} align="right" className="px-3 py-2" />
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {ordered.map((row) => (
            <tr key={row.label} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-3 py-1.5">{row.label}</td>
              {mode !== 'net' ? <td className="px-3 py-1.5 text-right tabular-nums">{unitsLabel(row.units)}</td> : null}
              {mode === 'production' ? (
                <>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(row.volume)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(row.gci)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(row.net)}</td>
                </>
              ) : null}
              {mode === 'net' ? <td className="px-3 py-1.5 text-right tabular-nums">{row.units ? money(row.net) : '—'}</td> : null}
            </tr>
          ))}
          <tr className="border-t border-slate-200 dark:border-slate-700 font-bold">
            <td className="px-3 py-2">Total</td>
            {mode !== 'net' ? <td className="px-3 py-2 text-right tabular-nums">{unitsLabel(total.units)}</td> : null}
            {mode === 'production' ? (
              <>
                <td className="px-3 py-2 text-right tabular-nums">{money(total.volume)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(total.gci)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(total.net)}</td>
              </>
            ) : null}
            {mode === 'net' ? <td className="px-3 py-2 text-right tabular-nums">{money(total.net)}</td> : null}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function NetAnalysis({ range, priorRange, closed, closedPrior }: { range: DateRange; priorRange: DateRange; closed: ReportDeal[]; closedPrior: ReportDeal[] }) {
  const totals = sumOf(closed);
  const current = seriesBuckets(closed, (deal) => deal.closingDate, range);
  const previous = seriesBuckets(closedPrior, (deal) => deal.closingDate, priorRange);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Cost of sales is the agent-paid amount on closed deals. Net commission income is what remains with the company.</p>
      <div className="grid md:grid-cols-3 gap-3">
        <Equation left="Total commission" right="Cost of sales" result="Net commission income" leftValue={money(totals.commission)} rightValue={money(totals.agentPaid)} resultValue={money(totals.net)} />
      </div>
      <LineChart title="Net commission income" metric="net" current={current} previous={previous} />
      <MonthlyTable title="Closed month" rows={current} mode="production" />
    </div>
  );
}

function Equation(props: { left: string; right: string; result: string; leftValue: string; rightValue: string; resultValue: string }) {
  return (
    <div className="md:col-span-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-wrap items-center gap-3 text-sm">
      <Figure label={props.left} value={props.leftValue} />
      <span className="text-slate-400 text-lg">−</span>
      <Figure label={props.right} value={props.rightValue} />
      <span className="text-slate-400 text-lg">=</span>
      <Figure label={props.result} value={props.resultValue} emphasis />
    </div>
  );
}

function AgentTable({ rows, caption, paid = false }: { rows: Array<Totals & { name: string }>; caption: string; paid?: boolean }) {
  const total = sumRows(rows);
  const { sort, toggle } = useColumnSort();
  const ordered = sortBy(rows, sort, (row, key) => (key === 'paid' ? (paid ? row.agentPaid : row.net) : row[key as keyof typeof row]) as string | number);
  return (
    <div className={reportTableWrap}>
      <p className="px-4 pt-3 text-xs text-slate-500">{caption}</p>
      <table className="w-full text-sm">
        <thead className="report-head text-sm uppercase tracking-wider text-slate-500">
          <tr>
            <SortHead column="name" label="Agent" sort={sort} onSort={toggle} className="px-4 py-2" />
            <SortHead column="units" label="Units" sort={sort} onSort={toggle} align="right" className="px-3 py-2" />
            <SortHead column="volume" label="Volume" sort={sort} onSort={toggle} align="right" className="px-3 py-2" />
            <SortHead column="gci" label="GCI" sort={sort} onSort={toggle} align="right" className="px-3 py-2" />
            <SortHead column="paid" label={paid ? 'Agent paid' : 'Net to company'} sort={sort} onSort={toggle} align="right" className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {ordered.length === 0 ? <tr><td className="px-4 py-6 text-slate-500" colSpan={5}>No transactions in this date range.</td></tr> : null}
          {ordered.map((row) => (
            <tr key={row.name + row.units} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-4 py-1.5 font-medium">{row.name}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{unitsLabel(row.units)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{money(row.volume)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{money(row.gci)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{money(paid ? row.agentPaid : row.net)}</td>
            </tr>
          ))}
          {ordered.length > 0 ? (
            <tr className="border-t border-slate-200 dark:border-slate-700 font-bold">
              <td className="px-4 py-2">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{unitsLabel(total.units)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(total.volume)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(total.gci)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(paid ? total.agentPaid : total.net)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

type BoardRow = { key: string; label: string; value: number; prior: number };

function boardIdentity(deal: ReportDeal, field: BoardField, names: Map<string, string>): { key: string; label: string } {
  const raw = String(deal.attributes[field.id] || '').trim();
  if (field.type === 'AGENT_PICKER') {
    const key = raw || 'unspecified';
    return { key, label: names.get(raw) || raw || 'Unspecified' };
  }
  const label = raw || 'Unspecified';
  return { key: label, label };
}

function boardRows(current: ReportDeal[], prior: ReportDeal[], metric: 'volume' | 'units', field: BoardField, names: Map<string, string>): BoardRow[] {
  const amount = (deal: ReportDeal) => (metric === 'volume' ? deal.salesPrice : 1);
  const priorByKey = new Map<string, number>();
  const labels = new Map<string, string>();
  prior.forEach((deal) => {
    const identity = boardIdentity(deal, field, names);
    labels.set(identity.key, identity.label);
    priorByKey.set(identity.key, (priorByKey.get(identity.key) || 0) + amount(deal));
  });
  const currentByKey = new Map<string, number>();
  current.forEach((deal) => {
    const identity = boardIdentity(deal, field, names);
    labels.set(identity.key, identity.label);
    currentByKey.set(identity.key, (currentByKey.get(identity.key) || 0) + amount(deal));
  });
  return [...currentByKey.entries()]
    .map(([key, value]) => ({ key, label: labels.get(key) || key, value, prior: priorByKey.get(key) || 0 }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function statusTotal(deals: ReportDeal[], status: 'all' | 'closed' | 'pending', metric: 'volume' | 'units'): number {
  return deals.reduce((total, deal) => {
    if (status !== 'all' && deal.status.trim().toLowerCase() !== status) return total;
    return total + (metric === 'volume' ? deal.salesPrice : 1);
  }, 0);
}

function signedChangePercent(current: number, prior: number): string {
  if (!prior) return '—';
  const delta = ((current - prior) / prior) * 100;
  const formatted = `${Math.abs(delta).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  if (delta > 0) return `+${formatted}`;
  if (delta < 0) return `−${formatted}`;
  return formatted;
}

function signedCount(value: number): string {
  const formatted = Math.abs(Math.round(value)).toLocaleString();
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

function changeClass(current: number, prior: number): string {
  if (!prior || current === prior) return 'text-slate-400';
  return current > prior ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
}

function dealsForStatus(deals: ReportDeal[], status: 'all' | 'closed' | 'pending'): ReportDeal[] {
  if (status === 'all') return deals;
  return deals.filter((deal) => deal.status.trim().toLowerCase() === status);
}

type PaymentLine = { key: string; label: string; status: string; amount: number };

type BoardScores = { total: number; priorTotal: number; closed: number; priorClosed: number; pending: number };

function payeeKind(payment: ReportPayment): 'agent' | 'entity' {
  const type = payment.payeeType.trim().toUpperCase();
  if (type === 'ENTITY' || type === 'BROKERAGE') return 'entity';
  if (type === 'AGENT') return 'agent';
  if (payment.entityId && !payment.agentId) return 'entity';
  return 'agent';
}

function paymentLines(payments: ReportPayment[], deals: ReportDeal[], kind: 'agent' | 'entity', names: Map<string, string>, entityNames: Map<string, string>): PaymentLine[] {
  const dealsById = new Map(deals.map((deal) => [deal.id, deal]));
  const lines: PaymentLine[] = [];
  payments.forEach((payment) => {
    const deal = dealsById.get(payment.transactionId);
    if (!deal || payeeKind(payment) !== kind) return;
    if (kind === 'agent') {
      const key = payment.agentId || 'unspecified';
      lines.push({ key, label: names.get(payment.agentId) || payment.agentId || 'Unspecified', status: deal.status.trim().toLowerCase(), amount: payment.amount });
      return;
    }
    const key = payment.entityId || 'unspecified';
    lines.push({ key, label: entityNames.get(payment.entityId) || payment.entityId || 'Unspecified', status: deal.status.trim().toLowerCase(), amount: payment.amount });
  });
  return lines;
}

function paymentBoardRows(lines: PaymentLine[], priorLines: PaymentLine[], metric: 'amount' | 'count', status: 'all' | 'closed' | 'pending'): BoardRow[] {
  const collect = (list: PaymentLine[]) => {
    const totals = new Map<string, number>();
    const labels = new Map<string, string>();
    list.forEach((line) => {
      if (status !== 'all' && line.status !== status) return;
      labels.set(line.key, line.label);
      totals.set(line.key, (totals.get(line.key) || 0) + (metric === 'amount' ? line.amount : 1));
    });
    return { totals, labels };
  };
  const current = collect(lines);
  const prior = collect(priorLines);
  return [...current.totals.entries()]
    .map(([key, value]) => ({ key, label: current.labels.get(key) || prior.labels.get(key) || key, value, prior: prior.totals.get(key) || 0 }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function paymentScores(lines: PaymentLine[], priorLines: PaymentLine[], metric: 'amount' | 'count'): BoardScores {
  const sum = (list: PaymentLine[], status: 'all' | 'closed' | 'pending') => list.reduce((total, line) => {
    if (status !== 'all' && line.status !== status) return total;
    return total + (metric === 'amount' ? line.amount : 1);
  }, 0);
  return {
    total: sum(lines, 'all'),
    priorTotal: sum(priorLines, 'all'),
    closed: sum(lines, 'closed'),
    priorClosed: sum(priorLines, 'closed'),
    pending: sum(lines, 'pending'),
  };
}

function withoutTeamLeads(lines: PaymentLine[], exclude: boolean, teamLeadIds: Set<string>): PaymentLine[] {
  if (!exclude) return lines;
  return lines.filter((line) => !teamLeadIds.has(line.key));
}

function keptPayees(lines: PaymentLine[], picked: string[] | null): PaymentLine[] {
  if (picked == null) return lines;
  const allowed = new Set(picked);
  return lines.filter((line) => allowed.has(line.key));
}

function ProductionLeaderboard({ deals, range, priorRange, field, names, payments = [], entityNames = new Map(), payeePicked = null, excludeTeamLeads = false, teamLeadIds = new Set(), dateBasis = 'closing' }: { deals: ReportDeal[]; range: DateRange; priorRange: DateRange; field: BoardField; names: Map<string, string>; payments?: ReportPayment[]; entityNames?: Map<string, string>; payeePicked?: string[] | null; excludeTeamLeads?: boolean; teamLeadIds?: Set<string>; dateBasis?: LeaderboardDate }) {
  const current = useMemo(() => closedOrPendingOnDate(deals, range, dateBasis), [dateBasis, deals, range]);
  const prior = useMemo(() => closedOrPendingOnDate(deals, priorRange, dateBasis), [dateBasis, deals, priorRange]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'closed' | 'pending'>('all');
  useEffect(() => {
    setStatusFilter('all');
  }, [dateBasis, field.id]);
  const selectStatus = (status: 'all' | 'closed' | 'pending') => {
    setStatusFilter((value) => (value === status ? 'all' : status));
  };
  const paymentMode = field.id === 'payment:agent' || field.id === 'payment:entity';
  const payee = field.id === 'payment:entity' ? 'entity' : 'agent';
  const shown = useMemo(() => dealsForStatus(current, statusFilter), [current, statusFilter]);
  const shownPrior = useMemo(() => dealsForStatus(prior, statusFilter), [prior, statusFilter]);
  const currentPayments = useMemo(() => keptPayees(withoutTeamLeads(paymentLines(payments, current, payee, names, entityNames), payee === 'agent' && excludeTeamLeads, teamLeadIds), payeePicked), [current, entityNames, excludeTeamLeads, names, payee, payeePicked, payments, teamLeadIds]);
  const priorPayments = useMemo(() => keptPayees(withoutTeamLeads(paymentLines(payments, prior, payee, names, entityNames), payee === 'agent' && excludeTeamLeads, teamLeadIds), payeePicked), [entityNames, excludeTeamLeads, names, payee, payeePicked, payments, prior, teamLeadIds]);
  const volumeRows = useMemo(
    () => (paymentMode ? paymentBoardRows(currentPayments, priorPayments, 'amount', statusFilter) : boardRows(shown, shownPrior, 'volume', field, names)),
    [currentPayments, field, names, paymentMode, priorPayments, shown, shownPrior, statusFilter],
  );
  const unitRows = useMemo(
    () => (paymentMode ? paymentBoardRows(currentPayments, priorPayments, 'count', statusFilter) : boardRows(shown, shownPrior, 'units', field, names)),
    [currentPayments, field, names, paymentMode, priorPayments, shown, shownPrior, statusFilter],
  );
  const amountScores = useMemo(() => (paymentMode ? paymentScores(currentPayments, priorPayments, 'amount') : null), [currentPayments, paymentMode, priorPayments]);
  const countScores = useMemo(() => (paymentMode ? paymentScores(currentPayments, priorPayments, 'count') : null), [currentPayments, paymentMode, priorPayments]);
  const rowLabel = paymentMode ? (payee === 'entity' ? 'Entity' : 'Agent') : field.label;
  const leftTitle = paymentMode ? 'Payment amount' : 'Sales volume';
  const rightTitle = paymentMode ? 'Payment records' : 'Units';

  return (
    <div className={pairedReport}>
      <SourceBoard tone="volume" title={leftTitle} metric="volume" valueLabel={leftTitle} rowLabel={rowLabel} rows={volumeRows} current={current} prior={prior} scores={amountScores} emptyNoun={paymentMode ? 'payment records' : 'transactions'} statusFilter={statusFilter} onSelectStatus={selectStatus} />
      <SourceBoard tone="units" title={rightTitle} metric="units" valueLabel={rightTitle} rowLabel={rowLabel} rows={unitRows} current={current} prior={prior} scores={countScores} emptyNoun={paymentMode ? 'payment records' : 'transactions'} statusFilter={statusFilter} onSelectStatus={selectStatus} />
    </div>
  );
}

function SourceBoard({ tone, title, metric, valueLabel, rowLabel, rows, current, prior, scores, emptyNoun = 'transactions', statusFilter, onSelectStatus }: {
  tone: 'volume' | 'units';
  title: string;
  metric: 'volume' | 'units';
  valueLabel?: string;
  rowLabel: string;
  rows: BoardRow[];
  current: ReportDeal[];
  prior: ReportDeal[];
  scores: BoardScores | null;
  emptyNoun?: string;
  statusFilter: 'all' | 'closed' | 'pending';
  onSelectStatus: (status: 'all' | 'closed' | 'pending') => void;
}) {
  const formatValue = (value: number, compact = false) => (
    metric === 'volume' ? (compact ? compactMoney(value) : fullMoney(value)) : Math.round(value).toLocaleString()
  );
  const formatDelta = (value: number) => (metric === 'volume' ? signedFull(value) : signedCount(value));
  const max = rows.reduce((highest, row) => Math.max(highest, row.value), 0);
  const total = scores ? scores.total : statusTotal(current, 'all', metric);
  const priorTotal = scores ? scores.priorTotal : statusTotal(prior, 'all', metric);
  const closedValue = scores ? scores.closed : statusTotal(current, 'closed', metric);
  const priorClosed = scores ? scores.priorClosed : statusTotal(prior, 'closed', metric);
  const pendingValue = scores ? scores.pending : statusTotal(current, 'pending', metric);
  const accent = tone === 'volume' ? 'text-teal-700 dark:text-teal-200' : 'text-purple-700 dark:text-purple-200';
  const bar = tone === 'volume' ? 'bg-teal-500/75 dark:bg-teal-400/55' : 'bg-purple-500/75 dark:bg-purple-400/55';
  const tableTotal = rows.reduce((sum, row) => sum + row.value, 0);
  const tablePrior = rows.reduce((sum, row) => sum + row.prior, 0);
  const share = (value: number) => (tableTotal ? `${((value / tableTotal) * 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : '—');
  const emptyLabel = statusFilter === 'closed' ? 'closed' : statusFilter === 'pending' ? 'pending' : 'closed or pending';
  const amountLabel = valueLabel || (metric === 'volume' ? 'Sales volume' : 'Units');
  const { sort, toggle } = useColumnSort();
  const ordered = sortBy(rows.map((row, index) => ({ ...row, rank: index + 1 })), sort, (row, key) => {
    if (key === 'rank') return row.rank;
    if (key === 'label') return row.label;
    if (key === 'value' || key === 'share') return row.value;
    if (key === 'delta') return row.prior ? (row.value - row.prior) / row.prior : null;
    return null;
  });
  return (
    <section className={pairedSection}>
      <SectionHeading tone={tone}>{title}</SectionHeading>
      <div className={pairedScores}>
        <BoardScore tone={tone} label="Total" amount={formatValue(total)} dollar={formatDelta(total - priorTotal)} percent={signedChangePercent(total, priorTotal)} toneClass="" current={total} prior={priorTotal} selected={statusFilter === 'all'} onSelect={() => onSelectStatus('all')} />
        <BoardScore tone={tone} label="Closed" amount={formatValue(closedValue)} dollar={formatDelta(closedValue - priorClosed)} percent={signedChangePercent(closedValue, priorClosed)} toneClass={accent} current={closedValue} prior={priorClosed} selected={statusFilter === 'closed'} onSelect={() => onSelectStatus('closed')} />
        <BoardScore tone={tone} label="Pending" amount={formatValue(pendingValue)} toneClass="text-slate-400" selected={statusFilter === 'pending'} onSelect={() => onSelectStatus('pending')} />
      </div>
      <div className="report-table rounded-xl">
      <table className="w-full text-sm">
        <thead className={`${tone === 'volume' ? 'leader-head-volume' : 'leader-head-units'} text-sm font-medium normal-case [&_th]:text-sm [&_th]:font-medium`}>
          <tr className="text-left">
            <SortHead column="rank" label="#" sort={sort} onSort={toggle} align="right" className="w-10 px-3 py-2" />
            <SortHead column="label" label={rowLabel} sort={sort} onSort={toggle} className="px-2 py-2" />
            <SortHead column="value" label={amountLabel} sort={sort} onSort={toggle} className="px-2 py-2" />
            <SortHead column="delta" label="% Δ" sort={sort} onSort={toggle} align="right" className="px-2 py-2" note={`How much each ${rowLabel} is up or down compared with the same dates in the prior year. +10% means it is 10% higher than the prior year. A dash means the prior year was zero, so there is no percent to show.`} />
            <SortHead column="share" label="% of total" sort={sort} onSort={toggle} align="right" className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {ordered.length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-slate-500" colSpan={5}>No {emptyLabel} {emptyNoun} in this date range.</td>
            </tr>
          ) : ordered.map((row, index) => (
            <tr
              key={row.key}
              className={tone === 'volume' ? 'leader-row-volume' : 'leader-row-units'}
              style={{ ['--rank-fade' as string]: ordered.length <= 1 ? '0%' : `${(index / (ordered.length - 1)) * 100}%` }}
            >
              <td className="px-3 py-2 text-right tabular-nums text-slate-500">{row.rank}</td>
              <td className="px-2 py-2 font-medium">{row.label}</td>
              <td className="relative px-2 py-2">
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute bottom-1.5 left-1.5 top-1.5 rounded-sm ${bar}`}
                  style={{ width: max && row.value ? `calc((100% - 0.75rem) * ${Math.max(row.value / max, 0.04)})` : '0%' }}
                />
                <span className="relative tabular-nums whitespace-nowrap">{formatValue(row.value, true)}</span>
              </td>
              <td className={`px-2 py-2 text-right font-semibold tabular-nums whitespace-nowrap ${changeClass(row.value, row.prior)}`}>{signedChangePercent(row.value, row.prior)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{share(row.value)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 bg-white text-sm font-bold dark:border-slate-700 dark:bg-slate-900">
            <td className="px-3 py-3" />
            <td className="px-2 py-3">Grand total</td>
            <td className="px-2 py-3 tabular-nums">{formatValue(tableTotal, metric === 'volume')}</td>
            <td className={`px-2 py-3 text-right tabular-nums ${changeClass(tableTotal, tablePrior)}`}>{signedChangePercent(tableTotal, tablePrior)}</td>
            <td className="px-3 py-3 text-right tabular-nums">{tableTotal ? '100.00%' : '—'}</td>
          </tr>
        </tfoot>
      </table>
      </div>
    </section>
  );
}

function BoardScore({ tone, label, amount, dollar, percent, toneClass, current = 0, prior = 0, selected, onSelect }: {
  tone: 'volume' | 'units';
  label: string;
  amount: string;
  dollar?: string;
  percent?: string;
  toneClass: string;
  current?: number;
  prior?: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const deltaClass = dollar ? changeClass(current, prior) : '';
  const selectedClass = tone === 'volume'
    ? 'border-teal-500 bg-[#d7f6fa] ring-2 ring-teal-400 dark:border-teal-300 dark:bg-teal-950/80 dark:ring-teal-400'
    : 'border-purple-400 bg-[#f3e8ff] ring-2 ring-purple-300 dark:border-purple-300 dark:bg-purple-950/80 dark:ring-purple-400';
  const focusClass = tone === 'volume' ? 'focus-visible:ring-teal-400' : 'focus-visible:ring-purple-400';
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex h-full w-full min-w-0 flex-col justify-start cursor-pointer appearance-none rounded-xl border px-3 py-2 text-center shadow-sm [outline:none] focus-visible:ring-2 ${focusClass} ${selected ? `ring-inset ${selectedClass}` : 'border-slate-200/90 bg-white/80 dark:border-slate-700 dark:bg-slate-900/80'}`}
    >
        <p className={`text-xs font-medium uppercase ${toneClass || 'text-slate-500'}`}>{label}</p>
        <p className={`mt-0.5 text-xl font-extrabold tabular-nums ${toneClass}`}>{amount}</p>
        {dollar && percent ? (
          <div className={`mt-1 flex items-baseline justify-center gap-8 text-xs font-semibold tabular-nums ${deltaClass}`}>
            <span>{percent}</span>
            <span>{dollar}</span>
          </div>
        ) : <div className="mt-1 h-4" aria-hidden="true" />}
      </button>
  );
}

function SourceTable({ rows }: { rows: Array<Totals & { source: string }> }) {
  const total = sumRows(rows);
  const { sort, toggle } = useColumnSort();
  const ordered = sortBy(rows, sort, (row, key) => (key === 'share' ? row.gci : row[key as keyof typeof row]) as string | number);
  return (
    <div className={reportTableWrap}>
      <table className="w-full text-sm">
        <thead className="report-head text-sm uppercase tracking-wider text-slate-500">
          <tr>
            <SortHead column="source" label="Lead source" sort={sort} onSort={toggle} className="px-4 py-2" />
            <SortHead column="units" label="Units" sort={sort} onSort={toggle} align="right" className="px-3 py-2" />
            <SortHead column="volume" label="Volume" sort={sort} onSort={toggle} align="right" className="px-3 py-2" />
            <SortHead column="gci" label="GCI" sort={sort} onSort={toggle} align="right" className="px-3 py-2" />
            <SortHead column="share" label="Share of GCI" sort={sort} onSort={toggle} align="right" className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {ordered.map((row) => (
            <tr key={row.source} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-4 py-1.5 font-medium">{row.source}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{unitsLabel(row.units)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{money(row.volume)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{money(row.gci)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{percent(row.gci, total.gci)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DealTable({ deals, names, detailed }: { deals: ReportDeal[]; names: Map<string, string>; detailed: boolean }) {
  const { sort, toggle } = useColumnSort();
  const dated = [...deals].sort((a, b) => (b.closingDate?.getTime() || 0) - (a.closingDate?.getTime() || 0));
  const sorted = sortBy(dated, sort, (deal, key) => {
    if (key === 'address') return deal.address;
    if (key === 'side') return deal.side;
    if (key === 'status') return deal.status;
    if (key === 'agent') return names.get(deal.agentId) || '';
    if (key === 'source') return deal.leadSource;
    if (key === 'price') return deal.salesPrice;
    if (key === 'gci') return deal.gciAmount;
    return deal.totalCommission - deal.agentPaid;
  });
  return (
    <div className={reportTableWrap}>
      <table className="w-full text-sm">
        <thead className="report-head text-sm uppercase tracking-wider text-slate-500">
          <tr>
            <SortHead column="address" label="Address" sort={sort} onSort={toggle} className="px-3 py-2" />
            <SortHead column="side" label="Side" sort={sort} onSort={toggle} className="px-3 py-2" />
            <SortHead column="status" label="Status" sort={sort} onSort={toggle} className="px-3 py-2" />
            <SortHead column="agent" label="Agent" sort={sort} onSort={toggle} className="px-3 py-2" />
            {detailed ? <SortHead column="source" label="Source" sort={sort} onSort={toggle} className="px-3 py-2" /> : null}
            <SortHead column="price" label="Sales price" sort={sort} onSort={toggle} align="right" className="px-3 py-2" />
            <SortHead column="gci" label="GCI" sort={sort} onSort={toggle} align="right" className="px-3 py-2" />
            {detailed ? <SortHead column="net" label="Net" sort={sort} onSort={toggle} align="right" className="px-3 py-2" /> : null}
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 200).map((deal) => (
            <tr key={deal.id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-3 py-1.5">{deal.address || '—'}</td>
              <td className="px-3 py-1.5">{deal.side}</td>
              <td className="px-3 py-1.5">{deal.status}</td>
              <td className="px-3 py-1.5">{names.get(deal.agentId) || '—'}</td>
              {detailed ? <td className="px-3 py-1.5">{deal.leadSource}</td> : null}
              <td className="px-3 py-1.5 text-right tabular-nums">{money(deal.salesPrice)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{money(deal.gciAmount)}</td>
              {detailed ? <td className="px-3 py-1.5 text-right tabular-nums">{money(deal.totalCommission - deal.agentPaid)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length > 200 ? <p className="px-3 py-2 text-xs text-slate-500">Showing the first 200 of {sorted.length} transactions.</p> : null}
    </div>
  );
}

function PriceChange({ deals, names }: { deals: ReportDeal[]; names: Map<string, string> }) {
  const rows = deals.filter((deal) => deal.listPrice > 0 && deal.salesPrice > 0);
  const list = rows.reduce((total, deal) => total + deal.listPrice, 0);
  const sale = rows.reduce((total, deal) => total + deal.salesPrice, 0);
  const { sort, toggle } = useColumnSort();
  const ordered = sortBy(rows, sort, (deal, key) => {
    if (key === 'address') return deal.address;
    if (key === 'agent') return names.get(deal.agentId) || '';
    if (key === 'list') return deal.listPrice;
    if (key === 'sale') return deal.salesPrice;
    return deal.salesPrice - deal.listPrice;
  });
  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-3 gap-3">
        <Stat label="Listings compared" value={unitsLabel(rows.length)} />
        <Stat label="Avg. list price" value={money(rows.length ? list / rows.length : 0)} />
        <Stat label="Avg. change" value={money(rows.length ? (sale - list) / rows.length : 0)} hint={percent(sale - list, list)} />
      </div>
      <div className={reportTableWrap}>
        <table className="w-full text-sm">
          <thead className="report-head text-sm uppercase tracking-wider text-slate-500">
            <tr>
              <SortHead column="address" label="Address" sort={sort} onSort={toggle} className="px-3 py-2" />
              <SortHead column="agent" label="Agent" sort={sort} onSort={toggle} className="px-3 py-2" />
              <SortHead column="list" label="List" sort={sort} onSort={toggle} align="right" className="px-3 py-2" />
              <SortHead column="sale" label="Sale" sort={sort} onSort={toggle} align="right" className="px-3 py-2" />
              <SortHead column="change" label="Change" sort={sort} onSort={toggle} align="right" className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {ordered.slice(0, 100).map((deal) => (
              <tr key={deal.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-1.5">{deal.address}</td>
                <td className="px-3 py-1.5">{names.get(deal.agentId) || '—'}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(deal.listPrice)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(deal.salesPrice)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(deal.salesPrice - deal.listPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DailyManagement(props: { range: DateRange; closed: ReportDeal[]; pending: ReportDeal[]; taken: ReportDeal[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Counts inside {formatRange(props.range)}.</p>
      <div className="grid md:grid-cols-3 gap-3">
        <Stat label="Closings" value={unitsLabel(props.closed.length)} hint={compactMoney(sumOf(props.closed).volume)} />
        <Stat label="Pendings" value={unitsLabel(props.pending.length)} hint={compactMoney(sumOf(props.pending).volume)} />
        <Stat label="Listings taken" value={unitsLabel(props.taken.length)} />
      </div>
    </div>
  );
}

function averageFigures(total: number, count: number, priorTotal: number, priorCount: number): { amount?: number; changeAmount?: number; value?: string; change?: string } {
  if (!count) return { value: '—', change: '—' };
  if (!priorCount) return { amount: total / count, change: '—' };
  return { amount: total / count, changeAmount: total / count - priorTotal / priorCount };
}

function signedRatioChange(current: number, prior: number, currentBase: number, priorBase: number): string {
  if (!currentBase || !priorBase) return '—';
  const delta = ((current / currentBase) - (prior / priorBase)) * 100;
  const formatted = `${Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
  if (delta > 0) return `+${formatted}`;
  if (delta < 0) return `−${formatted}`;
  return formatted;
}

function signedFull(value: number): string {
  const formatted = fullMoney(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

function signedCompact(value: number): string {
  const formatted = compactMoney(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

const VERSUS_LAST_YEAR = ' The number underneath is the change from the same dates last year.';

const SCORE_NOTES: Record<string, string> = {
  'Total commission': `Sum of Total Commission on Closed transactions whose closing date is in this date range.${VERSUS_LAST_YEAR}`,
  'Cost of sales': `Total Commission minus Net Commission Income.${VERSUS_LAST_YEAR}`,
  'Net commission income': `Sum of payments on those Closed transactions to agents marked as team leads. Archived payments are excluded.${VERSUS_LAST_YEAR}`,
  'Operating expenses': 'Shown as $0 until the Operating Expenses module is added.',
  'Net income': `Net Commission Income minus Operating Expenses. This is the bottom line.${VERSUS_LAST_YEAR}`,
  'ROI': 'Net Income divided by Operating Expenses. A dash is shown when Operating Expenses are $0.',
  'NI/TC': `Net Income divided by Total Commission.${VERSUS_LAST_YEAR}`,
  'listing:Avg. sales price': `Average sales price of Closed Seller transactions whose closing date is in this date range.${VERSUS_LAST_YEAR}`,
  'listing:Avg. GCI': `Average GCI of Closed Seller transactions whose closing date is in this date range.${VERSUS_LAST_YEAR}`,
  'listing:Avg. GCI %': `Total GCI divided by total sales price for Closed Seller transactions whose closing date is in this date range.${VERSUS_LAST_YEAR}`,
  'buyer:Avg. sales price': `Average sales price of Closed Buyer transactions whose closing date is in this date range.${VERSUS_LAST_YEAR}`,
  'buyer:Avg. GCI': `Average GCI of Closed Buyer transactions whose closing date is in this date range.${VERSUS_LAST_YEAR}`,
  'buyer:Avg. GCI %': `Total GCI divided by total sales price for Closed Buyer transactions whose closing date is in this date range.${VERSUS_LAST_YEAR}`,
};

function ScoreNote({ label, text, onOpenChange, className = 'absolute right-1.5 top-1.5 z-20', align = 'right', iconClass = 'text-slate-400 transition hover:text-emerald-600 dark:hover:text-emerald-300' }: {
  label: string;
  text: string;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  align?: 'left' | 'right';
  iconClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open && !pinned) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setPinned(false);
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPinned(false);
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, pinned]);

  return (
    <div
      ref={ref}
      className={className}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => { if (!pinned) setOpen(false); }}
    >
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setPinned((current) => {
            const next = !current;
            setOpen(next);
            return next;
          });
        }}
        className={`cursor-pointer rounded-full p-0.5 [outline:none] focus-visible:[outline:none] focus-visible:shadow-[0_0_0_2px_rgb(16_185_129/0.45)] ${iconClass}`}
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open ? (
        <p role="tooltip" className={`absolute top-full z-30 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-2.5 text-left text-[11px] font-medium normal-case leading-snug tracking-normal text-slate-600 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${align === 'left' ? 'left-0' : 'right-0'}`}>
          {text}
        </p>
      ) : null}
    </div>
  );
}

function SectionHeading({ children, tone = 'emerald', note }: { children: React.ReactNode; tone?: 'emerald' | 'listing' | 'buyer' | 'volume' | 'units' | 'slate' | 'rate' | 'price' | 'team'; note?: string }) {
  const fill = tone === 'listing'
    ? 'report-pill-listing'
    : tone === 'buyer'
      ? 'report-pill-buyer'
      : tone === 'volume'
        ? 'report-turquoise'
        : tone === 'units'
          ? 'report-purple'
          : tone === 'slate'
            ? 'bg-slate-800 text-white'
            : tone === 'rate'
              ? 'bg-sky-700 text-white'
              : tone === 'price'
                ? 'bg-amber-600 text-white'
                : tone === 'team'
                  ? 'bg-rose-700 text-white'
                  : 'report-pill-emerald';
  return (
    <h3 className={`relative w-full rounded-full px-4 py-2 text-center text-sm font-bold uppercase tracking-wide ${fill}`}>
      {children}
      {note ? (
        <ScoreNote
          label={typeof children === 'string' ? children : 'section'}
          text={note}
          className="absolute right-3 top-1/2 z-20 -translate-y-1/2"
          align="right"
          iconClass="text-white/80 transition hover:text-white"
        />
      ) : null}
    </h3>
  );
}

function Score({ label, amount, changeAmount, value, change, tone = 'plain', pulse = 0 }: {
  label: string;
  amount?: number;
  changeAmount?: number;
  value?: string;
  change?: string;
  tone?: 'plain' | 'result' | 'listing' | 'buyer';
  pulse?: number;
}) {
  const note = SCORE_NOTES[tone === 'listing' || tone === 'buyer' ? `${tone}:${label}` : label];
  const [noteOpen, setNoteOpen] = useState(false);
  const full = amount === undefined ? value ?? '' : fullMoney(amount);
  const compact = amount === undefined ? undefined : compactMoney(amount);
  const changeFull = changeAmount === undefined ? change : signedFull(changeAmount);
  const changeCompact = changeAmount === undefined ? undefined : signedCompact(changeAmount);
  const down = changeAmount !== undefined ? changeAmount < 0 : Boolean(change?.startsWith('−') || change?.startsWith('-'));
  const flat = changeAmount !== undefined ? changeAmount === 0 : !change || change === '—' || change === formattedZero(change);
  const changeClass = `mt-0.5 text-xs font-semibold tabular-nums whitespace-nowrap ${flat ? 'text-slate-400' : down ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`;
  const shell = tone === 'result'
    ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/50'
    : tone === 'listing'
      ? 'border-slate-200 border-t-2 border-t-sky-500 bg-white dark:border-slate-800 dark:border-t-sky-400 dark:bg-slate-900'
      : tone === 'buyer'
        ? 'border-slate-200 border-t-2 border-t-amber-500 bg-white dark:border-slate-800 dark:border-t-amber-400 dark:bg-slate-900'
        : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';
  const amountClass = tone === 'result' ? 'text-emerald-800 dark:text-emerald-200' : tone === 'listing' ? 'text-sky-800 dark:text-sky-200' : tone === 'buyer' ? 'text-amber-800 dark:text-amber-200' : '';
  return (
    <div key={pulse} data-score-card className={`relative flex h-full min-w-0 w-full flex-col justify-center rounded-xl border px-3 py-3 text-center ${noteOpen ? 'z-30' : ''} ${shell} ${pulse > 0 ? 'scorecard-pulse' : ''}`}>
      {note ? <ScoreNote label={label} text={note} onOpenChange={setNoteOpen} /> : null}
      <p className="px-4 text-xs font-medium uppercase text-slate-500">{label}</p>
      <FitText full={full} compact={compact} className={`mt-1 text-xl font-extrabold tabular-nums whitespace-nowrap ${amountClass}`} />
      {changeFull ? <FitText full={changeFull} compact={changeCompact} className={changeClass} /> : null}
    </div>
  );
}

function FitText({ full, compact, className }: { full: string; compact?: string; className: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [text, setText] = useState(full);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !compact || compact === full) {
      setText(full);
      return;
    }
    const measure = () => {
      const card = el.closest('[data-score-card]') as HTMLElement | null;
      if (!card) return;
      const probe = document.createElement('span');
      const style = getComputedStyle(el);
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      probe.style.whiteSpace = 'nowrap';
      probe.style.font = style.font;
      probe.style.letterSpacing = style.letterSpacing;
      probe.style.fontVariantNumeric = style.fontVariantNumeric;
      probe.textContent = full;
      document.body.appendChild(probe);
      const needed = probe.offsetWidth;
      probe.remove();
      const cardStyle = getComputedStyle(card);
      const pad = parseFloat(cardStyle.paddingLeft) + parseFloat(cardStyle.paddingRight);
      const room = card.clientWidth - pad;
      const next = room > 0 && needed > room ? compact : full;
      setText((current) => (current === next ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    const card = el.closest('[data-score-card]');
    if (card) observer.observe(card);
    return () => observer.disconnect();
  }, [compact, full]);

  return <p ref={ref} className={className}>{text}</p>;
}

function formattedZero(change: string | undefined): string {
  return change === compactMoney(0) ? change : '';
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-extrabold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function Figure({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${emphasis ? 'bg-emerald-500/10' : 'bg-slate-100 dark:bg-slate-800'}`}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="font-bold tabular-nums">{value}</p>
    </div>
  );
}

function MonthTable({ rows, selectedMonth, onSelectMonth }: { rows: OwnerMonthRow[]; selectedMonth: string | null; onSelectMonth: (key: string) => void }) {
  const { sort, toggle } = useColumnSort();
  const total = rows.reduce<OwnerMonthRow>((sum, row) => ({
    key: 'total',
    label: 'Total',
    closedUnits: sum.closedUnits + row.closedUnits,
    closedVolume: sum.closedVolume + row.closedVolume,
    closedCommission: sum.closedCommission + row.closedCommission,
    closedNet: sum.closedNet + row.closedNet,
    listingsTaken: sum.listingsTaken + row.listingsTaken,
    listingsPended: sum.listingsPended + row.listingsPended,
    listingsClosed: sum.listingsClosed + row.listingsClosed,
    buyersPended: sum.buyersPended + row.buyersPended,
    buyersClosed: sum.buyersClosed + row.buyersClosed,
    pendingUnits: sum.pendingUnits + row.pendingUnits,
    pendingVolume: sum.pendingVolume + row.pendingVolume,
    pendingCommission: sum.pendingCommission + row.pendingCommission,
    pendingNet: sum.pendingNet + row.pendingNet,
  }), {
    key: 'total',
    label: 'Total',
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
  });
  const ordered = sortBy(rows, sort, (row, key) => {
    if (key === 'month') return row.key;
    if (key === 'expenses') return 0;
    if (key === 'closedNetIncome') return row.closedNet;
    return row[key as keyof OwnerMonthRow] as string | number;
  });
  const body = [...ordered, total];
  const count = (value: number) => value.toLocaleString();
  return (
    <div className={reportTableWrap}>
      <table className="w-full text-xs">
        <thead className="report-head-dark text-xs font-medium normal-case text-white">
          <tr>
            <SortHead column="month" label="Month" sort={sort} onSort={toggle} className="sticky left-0 z-10 bg-slate-800 px-2 py-2 text-xs font-medium text-white" />
            <SortHead column="closedUnits" label="Closed Units" sort={sort} onSort={toggle} align="right" width="wide" className="px-1.5 py-2 text-xs font-medium" />
            <SortHead column="closedVolume" label="Closed Volume" sort={sort} onSort={toggle} align="right" width="wide" className="px-1.5 py-2 text-xs font-medium" />
            <SortHead column="closedCommission" label="Closed Total Comm." title="Closed total commission" sort={sort} onSort={toggle} align="right" width="wide" className="px-1.5 py-2 text-xs font-medium" />
            <SortHead column="closedNet" label="Closed Net Comm." title="Closed net commission income" sort={sort} onSort={toggle} align="right" width="wide" className="px-1.5 py-2 text-xs font-medium" />
            <SortHead column="expenses" label={'Operating\nExpenses'} sort={sort} onSort={toggle} align="right" width="wide" className="px-1.5 py-2 text-xs font-medium" />
            <SortHead column="closedNetIncome" label="Closed Net Inc." title="Closed net income" sort={sort} onSort={toggle} align="right" width="wide" className="px-1.5 py-2 text-xs font-medium" />
            <SortHead column="listingsTaken" label="Listings Taken" sort={sort} onSort={toggle} align="right" width="narrow" className="px-1.5 py-2 text-xs font-medium" />
            <SortHead column="listingsPended" label="Listings Pended" sort={sort} onSort={toggle} align="right" width="narrow" className="px-1.5 py-2 text-xs font-medium" />
            <SortHead column="listingsClosed" label="Listings Closed" sort={sort} onSort={toggle} align="right" width="narrow" className="px-1.5 py-2 text-xs font-medium" />
            <SortHead column="buyersPended" label="Buyers Pended" sort={sort} onSort={toggle} align="right" width="narrow" className="px-1.5 py-2 text-xs font-medium" />
            <SortHead column="buyersClosed" label="Buyers Closed" sort={sort} onSort={toggle} align="right" width="narrow" className="px-1.5 py-2 text-xs font-medium" />
            <SortHead column="pendingUnits" label="Pending Units" sort={sort} onSort={toggle} align="right" width="narrow" className="px-1.5 py-2 text-xs font-medium" />
            <SortHead column="pendingVolume" label="Pending Volume" sort={sort} onSort={toggle} align="right" width="wide" className="px-1.5 py-2 text-xs font-medium" />
            <SortHead column="pendingCommission" label="Pending Total Comm." title="Pending total commission" sort={sort} onSort={toggle} align="right" width="wide" className="px-1.5 py-2 text-xs font-medium" />
            <SortHead column="pendingNet" label="Pending Net Comm." title="Pending net commission income" sort={sort} onSort={toggle} align="right" width="wide" className="px-1.5 py-2 text-xs font-medium" />
          </tr>
        </thead>
        <tbody>
          {body.map((row, index) => {
            const isTotal = row.key === 'total';
            const isSelected = row.key === selectedMonth;
            const striped = !isTotal && index % 2 === 1;
            const rowClass = isSelected
              ? 'bg-emerald-100 dark:bg-emerald-950'
              : isTotal
                ? 'bg-slate-200 font-bold hover:bg-emerald-100 dark:bg-slate-700 dark:hover:bg-emerald-950'
                : striped
                  ? 'bg-slate-50 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-emerald-950/60'
                  : 'bg-white hover:bg-emerald-50 dark:bg-slate-900 dark:hover:bg-emerald-950/60';
            const stickyClass = isSelected
              ? 'bg-emerald-100 dark:bg-emerald-950'
              : isTotal
                ? 'bg-slate-200 group-hover/month:bg-emerald-100 dark:bg-slate-700 dark:group-hover/month:bg-emerald-950'
                : striped
                  ? 'bg-slate-50 group-hover/month:bg-emerald-50 dark:bg-slate-800 dark:group-hover/month:bg-emerald-950'
                  : 'bg-white group-hover/month:bg-emerald-50 dark:bg-slate-900 dark:group-hover/month:bg-emerald-950';
            return (
            <tr
              key={row.key}
              aria-selected={isSelected}
              onClick={() => onSelectMonth(row.key)}
              className={`group/month cursor-pointer border-t border-slate-100 dark:border-slate-800 ${rowClass}`}
            >
              <td className={`sticky left-0 z-10 px-3 py-2 whitespace-nowrap ${stickyClass}`}>{row.label}</td>
              <td className="px-3 py-2 text-right tabular-nums">{count(row.closedUnits)}</td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fullMoney(row.closedVolume)}</td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fullMoney(row.closedCommission)}</td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fullMoney(row.closedNet)}</td>
              <td className="px-3 py-2 text-right tabular-nums">—</td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fullMoney(row.closedNet)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{count(row.listingsTaken)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{count(row.listingsPended)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{count(row.listingsClosed)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{count(row.buyersPended)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{count(row.buyersClosed)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{count(row.pendingUnits)}</td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fullMoney(row.pendingVolume)}</td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fullMoney(row.pendingCommission)}</td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fullMoney(row.pendingNet)}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function sumOf(deals: ReportDeal[]): Totals {
  const total: Totals = { units: 0, volume: 0, gci: 0, commission: 0, agentPaid: 0, net: 0, teamGci: 0 };
  deals.forEach((deal) => addTotals(total, deal));
  return total;
}
