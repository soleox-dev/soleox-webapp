'use client';

import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Info, Menu, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { widePageFrame } from '@/lib/page-frame';
import { DESKTOP_QUERY, useFitsScreen, useIsDesktop, useIsTouch } from '@/lib/use-media-query';
import { swallowNextClick } from '@/lib/swallow-click';
import { FieldChevron, underlineControl, underlineShell } from '@/components/ui/underline-field';
import { SoleoxLogo } from '@/components/ui/logo';
import { LoadingDataPage, type LoadingProgressInfo } from './loading-data-page';
import { areaUnder, linePeaks, smoothLine, smoothRuns, svgUserX } from './chart-paths';
import {
  DATE_PRESETS,
  METRICS,
  OWNER_REPORTS,
  OWNER_REPORT_GROUPS,
  addTotals,
  agentPaidRows,
  byAgent,
  closedInRange,
  closedOrPendingOnDate,
  compactMoney,
  dateKey,
  formatMetric,
  formatRange,
  fullMoney,
  inRange,
  isListingSide,
  listingsTaken,
  metricValue,
  money,
  normalizeDeal,
  pendingInRange,
  percent,
  previousYearRange,
  rangeForPreset,
  periodColumns,
  periodKey,
  seriesBuckets,
  sumRows,
  teamGciByTransaction,
  teamLeadNet,
  ownerMonthTable,
  ownerProductionTransactions,
  formatProductionKey,
  priorProductionKey,
  productionKeyMatches,
  resolveProductionGrain,
  weekGrainAllowed,
  unitsLabel,
  type AgentRow,
  type DateRange,
  type LeaderboardDate,
  type MetricId,
  type MonthRow,
  type OwnerMonthRow,
  type ProductionDrilldownItem,
  type ProductionGrain,
  type RangePreset,
  type ReportDeal,
  type ReportPayment,
  type Totals,
} from '@/lib/owner-reports';
import { TeamCapsReport } from '@/app/(dashboard)/owner-reports/team-caps-report';
import { TransactionMapReport } from '@/app/(dashboard)/owner-reports/transaction-map-report';
import { ListingsReport, PriceChangeReport, TransactionListReport, priceChangeDeals } from '@/app/(dashboard)/owner-reports/deal-list-reports';
import {
  formatLong,
  formatUs,
  shiftAsOf,
  teamCapStandings,
  todayIso,
  type AgentProfile,
  type CapContribution,
  type CapStanding,
  type TeamCapDefinition,
} from '@/lib/team-cap-report';

const GROUPS = OWNER_REPORT_GROUPS;

/** Reports whose table fills the rest of the screen and scrolls on its own (on screens tall and wide enough). */
function screenFitReport(reportId: string | null): boolean {
  return reportId === 'net-commission-income' || reportId === 'team-caps' || reportId === 'transaction-list' || reportId === 'listings-by-list-date' || reportId === 'price-change';
}

type BoardField = { id: string; label: string; type: string };

/** Dropdowns that never make sense as a closing-date leaderboard metric. */
const BOARD_METRIC_EXCLUDED = new Set(['gci_type', 'transaction_status', 'finance_status']);

/** Payment rankings sit above the schema fields. They join payments to the transactions in view. */
const PAYMENT_METRICS: BoardField[] = [
  { id: 'payment:agent', label: 'Agent Earnings', type: 'PAYMENT' },
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
  const [earningEntities, setEarningEntities] = useState<Array<{ id: string; name: string }>>([]);
  const [postSplits, setPostSplits] = useState<PostSplitCredit[]>([]);
  const [earningsPicked, setEarningsPicked] = useState<string[] | null>(null);
  const [boardMetric, setBoardMetric] = useState('lead_source');
  const [boardDate, setBoardDate] = useState<LeaderboardDate>('closing');
  const [dateBases, setDateBases] = useState<BoardField[]>(DEFAULT_DATE_BASES);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [teamCaps, setTeamCaps] = useState<TeamCapDefinition[]>([]);
  const [capContributions, setCapContributions] = useState<CapContribution[]>([]);
  const [agentFieldLabels, setAgentFieldLabels] = useState<Map<string, string>>(new Map());
  const [capPicked, setCapPicked] = useState<string[] | null>(null);
  const [capYearOffset, setCapYearOffset] = useState(0);
  const [capOpen, setCapOpen] = useState<{ capId: string; agentId: string } | null>(null);
  const [capShowPaid, setCapShowPaid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadProgress, setLoadProgress] = useState<LoadingProgressInfo>({
    percent: 8,
    stage: 'Initializing workspace…',
    detail: 'Connecting to database and verifying session',
    checks: {},
    recordsCount: {},
  });
  const [reloadKey, setReloadKey] = useState(0);

  const handleRetry = () => {
    setError('');
    setLoading(true);
    setLoadProgress({
      percent: 8,
      stage: 'Initializing workspace…',
      detail: 'Connecting to database and verifying session',
      checks: {},
      recordsCount: {},
    });
    setReloadKey((k) => k + 1);
  };

  useEffect(() => {
    const controller = new AbortController();
    const fetchOptions = { signal: controller.signal };

    let timer: ReturnType<typeof setInterval> | null = null;
    let streamActive = false;

    // Smooth progress tick while waiting for database queries to run
    timer = setInterval(() => {
      setLoadProgress((prev) => {
        if (streamActive || prev.percent >= 55) return prev;
        const inc = prev.percent < 25 ? 2.2 : 0.9;
        return {
          ...prev,
          percent: Math.min(55, prev.percent + inc),
        };
      });
    }, 120);

    const pAgentSchema = fetch('/api/schema/agents', fetchOptions).then(async (res) => {
      if (!res.ok) return null;
      const data = await res.json();
      setLoadProgress((prev) => ({
        ...prev,
        checks: { ...prev.checks, schemas: true },
        percent: Math.max(prev.percent, 22),
        detail: 'Agent fields verified',
      }));
      return data;
    }).catch(() => null);

    const pTxnSchema = fetch('/api/schema/transactions', fetchOptions).then(async (res) => {
      if (!res.ok) return null;
      const data = await res.json();
      setLoadProgress((prev) => ({
        ...prev,
        checks: { ...prev.checks, schemas: true },
        percent: Math.max(prev.percent, 32),
        detail: 'Transaction schema verified',
      }));
      return data;
    }).catch(() => null);

    const pCaps = fetch('/api/agent-allocations', fetchOptions).then(async (res) => {
      if (!res.ok) return null;
      const data = await res.json();
      const count = (Array.isArray(data.teamCaps) ? data.teamCaps.length : 0) + (Array.isArray(data.agentCaps) ? data.agentCaps.length : 0);
      setLoadProgress((prev) => ({
        ...prev,
        checks: { ...prev.checks, caps: true },
        percent: Math.max(prev.percent, 42),
        detail: 'Cap rules & allocations loaded',
        recordsCount: { ...prev.recordsCount, caps: count },
      }));
      return data;
    }).catch(() => null);

    const pAgents = fetch('/api/agents?include_archived=true', fetchOptions).then(async (res) => {
      if (!res.ok) return null;
      const data = await res.json();
      const agents = Array.isArray(data.agents) ? data.agents : [];
      setLoadProgress((prev) => ({
        ...prev,
        checks: { ...prev.checks, agents: true },
        percent: Math.max(prev.percent, 50),
        detail: `Loaded ${agents.length} agent profiles`,
        recordsCount: { ...prev.recordsCount, agents: agents.length },
      }));
      return data;
    }).catch(() => null);

    const pSnapshot = (async () => {
      const res = await fetch('/api/owner-reports/snapshot', fetchOptions);
      if (!res.ok) throw new Error('Could not load transactions.');

      const lengthHeader = res.headers.get('content-length');
      const totalBytes = lengthHeader ? parseInt(lengthHeader, 10) : null;
      streamActive = true;

      setLoadProgress((prev) => ({
        ...prev,
        bytesTotal: totalBytes || undefined,
        stage: 'Downloading dataset…',
        detail: 'Receiving transaction and payment history',
        percent: Math.max(prev.percent, 55),
      }));

      if (!res.body || typeof res.body.getReader !== 'function') {
        return await res.json();
      }

      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let loadedBytes = 0;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loadedBytes += value.length;

          setLoadProgress((prev) => {
            let nextPercent = prev.percent;
            if (totalBytes && totalBytes > 0) {
              const ratio = Math.min(1, loadedBytes / totalBytes);
              nextPercent = Math.max(prev.percent, 55 + Math.round(ratio * 37));
            } else {
              const ratio = Math.min(1, loadedBytes / (4 * 1024 * 1024));
              nextPercent = Math.max(prev.percent, 55 + Math.round(ratio * 37));
            }
            return {
              ...prev,
              bytesLoaded: loadedBytes,
              bytesTotal: totalBytes || prev.bytesTotal,
              percent: nextPercent,
              stage: 'Downloading dataset…',
              detail: `Streaming records: ${(loadedBytes / (1024 * 1024)).toFixed(1)} MB${totalBytes ? ` / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB` : ''}`,
            };
          });
        }
      }

      const allChunks = new Uint8Array(loadedBytes);
      let offset = 0;
      for (const chunk of chunks) {
        allChunks.set(chunk, offset);
        offset += chunk.length;
      }
      const text = new TextDecoder('utf-8').decode(allChunks);
      return JSON.parse(text);
    })();

    Promise.all([pSnapshot, pAgents, pTxnSchema, pCaps, pAgentSchema])
      .then(async ([snapshot, agentData, schemaData, capData, agentSchema]) => {
        if (!snapshot) throw new Error('Could not load snapshot data.');
        if (timer) clearInterval(timer);

        const rows = Array.isArray(snapshot.transactions) ? snapshot.transactions : [];
        const items = Array.isArray(snapshot.items) ? snapshot.items : [];
        const paymentList = Array.isArray(snapshot.payments) ? snapshot.payments : [];
        const contributionRows = Array.isArray(snapshot.contributions) ? snapshot.contributions : [];
        const clientName = String(snapshot.clientName || snapshot.clientId || '');

        setLoadProgress((prev) => ({
          ...prev,
          clientName: clientName || prev.clientName,
          percent: 96,
          stage: 'Processing records…',
          detail: `Normalizing ${rows.length.toLocaleString()} transactions & waterfall splits`,
          checks: { ...prev.checks, snapshot: true },
          recordsCount: {
            ...prev.recordsCount,
            transactions: rows.length,
            payments: paymentList.length,
            items: items.length,
          },
        }));

        const teamGci = teamGciByTransaction(items);
        setPostSplits(items.flatMap((item: Record<string, unknown>) => {
          if (!isPostSplitSection(item.section)) return [];
          const agentId = String(item.agent_id || '');
          const entityId = String(item.payee_entity_id || '');
          const amount = Number(item.final_amount) || 0;
          const transactionId = String(item.transaction_id || '');
          if (!agentId || !entityId || !transactionId || !amount) return [];
          return [{ transactionId, agentId, entityId, amount }];
        }));
        setDeals(rows
          .filter((row: Record<string, unknown>) => row.archived !== true && row.permanently_deleted !== true)
          .map((row: Record<string, unknown>) => {
            const deal = normalizeDeal(row);
            deal.teamGci = teamGci.get(deal.id) || 0;
            return deal;
          }));
        if (agentData) {
          const next = new Map<string, string>();
          const leads = new Set<string>();
          const groups = new Map<string, string>();
          const profiles: AgentProfile[] = [];
          for (const agent of Array.isArray(agentData.agents) ? agentData.agents : []) {
            const id = String(agent.id || '');
            const name = String(agent.agent_name || agent.name || 'Agent');
            next.set(id, name);
            if (agent.is_team_lead === true) leads.add(id);
            const group = String(agent.agent_group ?? agent.group_id ?? agent.group ?? '').trim();
            if (id) groups.set(id, group);
            const fields: Record<string, string> = {};
            Object.entries(agent as Record<string, unknown>).forEach(([key, value]) => {
              if (value == null || typeof value === 'object') return;
              fields[key] = String(value);
            });
            if (id) profiles.push({ id, name, archived: agent.archived === true, fields });
          }
          setNames(next);
          setTeamLeadIds(leads);
          setAgentGroupById(groups);
          setAgentProfiles(profiles);
        }
        if (capData) {
          const teamCaps = Array.isArray(capData.teamCaps) ? capData.teamCaps : [];
          const agentCaps = Array.isArray(capData.agentCaps) ? capData.agentCaps : [];
          const asCap = (cap: Record<string, unknown>, kind: 'team' | 'agent'): TeamCapDefinition => ({
            id: String(cap.id || ''),
            name: String(cap.name || (kind === 'agent' ? 'Agent Cap' : 'Team Cap')),
            enabled: cap.enabled !== false,
            kind,
            splitPercentFieldKey: kind === 'team' && cap.split_percent_field_key ? String(cap.split_percent_field_key) : null,
            capAmountFieldKey: cap.cap_amount_field_key ? String(cap.cap_amount_field_key) : null,
            resetDateFieldKey: cap.reset_date_field_key ? String(cap.reset_date_field_key) : null,
            recipientAgentId: kind === 'team' && cap.recipient_agent_id ? String(cap.recipient_agent_id) : null,
            entityId: kind === 'agent' && cap.commission_entity_id ? String(cap.commission_entity_id) : null,
            hideOverAllocations: kind === 'agent' && cap.hide_over_allocations === true,
          });
          setTeamCaps([
            ...teamCaps.map((cap: Record<string, unknown>) => asCap(cap, 'team')),
            ...agentCaps.map((cap: Record<string, unknown>) => asCap(cap, 'agent')),
          ].filter((cap) => cap.id));
        }
        setCapContributions(contributionRows.map((row: Record<string, unknown>) => ({
          agentId: String(row.agentId || ''),
          teamCapId: String(row.teamCapId || ''),
          amount: Number(row.amount) || 0,
          periodStart: row.periodStart ? String(row.periodStart) : null,
          transactionId: String(row.transactionId || ''),
        })).filter((row: CapContribution) => row.agentId && row.teamCapId && row.transactionId));
        if (agentSchema) {
          const catalog = Array.isArray(agentSchema.catalog) ? agentSchema.catalog : [];
          const labels = new Map<string, string>();
          catalog.forEach((field: { field_key?: string; field_label?: string }) => {
            const key = String(field.field_key || '');
            if (key) labels.set(key, String(field.field_label || key));
          });
          setAgentFieldLabels(labels);
        }
        setPayments(paymentList.map((payment: Record<string, unknown>) => ({
          transactionId: String(payment.transaction_id || ''),
          agentId: String(payment.agent_id || ''),
          entityId: String(payment.payee_entity_id || ''),
          payeeType: String(payment.payee_type || ''),
          amount: Number(payment.amount_paid) || 0,
        })));
        const entityList = Array.isArray(snapshot.entities) ? snapshot.entities : [];
        const nextEntities = new Map<string, string>();
        const earning: Array<{ id: string; name: string }> = [];
        for (const entity of entityList) {
          const id = String(entity.id || '');
          const name = String(entity.entity_name || entity.name || 'Entity');
          if (!id) continue;
          nextEntities.set(id, name);
          if (EARNING_ENTITY_TYPES.has(String(entity.entity_type || '').trim().toUpperCase())) earning.push({ id, name });
        }
        setEntityNames(nextEntities);
        setEarningEntities(earning);
        if (schemaData) {
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

        setLoadProgress((prev) => ({
          ...prev,
          percent: 100,
          stage: 'Reports ready!',
          detail: 'All calculations compiled',
          checks: { ...prev.checks, processing: true },
        }));

        await new Promise((resolve) => setTimeout(resolve, 320));
        if (!controller.signal.aborted) {
          setLoading(false);
          if (!reportId) {
            router.replace('/owner-reports/owner-summary', { scroll: false });
          }
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (timer) clearInterval(timer);
        const msg = err instanceof Error ? err.message : 'Could not load reports.';
        setError(msg);
        setLoadProgress((prev) => ({
          ...prev,
          stage: 'Failed to load data',
          detail: msg,
        }));
      });

    return () => {
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!boardMetrics.some((field) => field.id === boardMetric)) {
      const fallback = boardMetrics.find((field) => field.id === 'lead_source') || boardMetrics[0];
      if (fallback) setBoardMetric(fallback.id);
    }
  }, [boardMetric, boardMetrics]);

  const closingBoard = reportId === 'lead-source-leaderboard' || reportId === 'team-performance' || reportId === 'net-commission-income';
  const closedPendingOnly = closingBoard || reportId === 'team-caps';
  // The Transaction List starts on Closed and Pending; Cancelled can still be picked.
  const statusFallback = closedPendingOnly || reportId === 'transaction-list' ? ['Closed', 'Pending'] : null;
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
    if (closedPendingOnly && !isClosedOrPendingStatus(deal.status)) return false;
    if (excludeLeadDeals && teamLeadIds.has(deal.agentId)) return false;
    return passesReportFilters(deal, filterPicks, null);
  }), [agentGroupById, agentPicked, closedPendingOnly, deals, excludeLeadDeals, filterPicks.applyDimensions, groupPicked, reportId, sidePicked, sourcePicked, statusFallback, statusPicked, teamLeadIds]);

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
    if (!closedPendingOnly) return values;
    return ['Closed', 'Pending'].filter((label) => values.some((value) => value.toLowerCase() === label.toLowerCase()));
  }, [agentGroupById, agentPicked, applyDimensions, closedPendingOnly, groupPicked, periodDeals, reportId, sidePicked, sourcePicked, statusFallback]);
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
    : (reportId === 'lead-source-leaderboard' && boardMetric === 'payment:agent') || reportId === 'net-commission-income'
      ? 'agent'
      : null;
  const payeeBasis = reportId === 'net-commission-income' ? 'closing' : boardDate;
  const payeePicked = paymentKind === 'entity' ? entityPayeePicked : agentPayeePicked;
  const setPayeePicked = paymentKind === 'entity' ? setEntityPayeePicked : setAgentPayeePicked;
  const shownPayments = useMemo(
    () => (reportId === 'net-commission-income' ? earningPayments(payments, postSplits, earningsPicked) : payments),
    [earningsPicked, payments, postSplits, reportId],
  );
  const payeeChoices = useMemo(() => {
    if (!paymentKind) return [];
    const lines = withoutTeamLeads(
      paymentLines(shownPayments, closedOrPendingOnDate(filtered, range, payeeBasis), paymentKind, names, entityNames),
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
  }, [entityNames, excludeTeamLeads, filtered, names, payeeBasis, paymentKind, range, shownPayments, teamLeadIds]);
  const earningsChoices = useMemo(() => {
    if (reportId !== 'net-commission-income') return [];
    const dealIds = new Set(closedOrPendingOnDate(filtered, range, 'closing').map((deal) => deal.id));
    const allowed = (agentId: string) => {
      if (excludeTeamLeads && teamLeadIds.has(agentId)) return false;
      return payeeKept(agentId, agentPayeePicked);
    };
    const netIds = new Set<string>();
    payments.forEach((payment) => {
      if (payeeKind(payment) !== 'agent' || !dealIds.has(payment.transactionId)) return;
      if (!allowed(payment.agentId || 'unspecified')) return;
      netIds.add(payment.transactionId);
    });
    const byEntity = new Map<string, Set<string>>();
    postSplits.forEach((credit) => {
      if (!dealIds.has(credit.transactionId) || !allowed(credit.agentId)) return;
      const ids = byEntity.get(credit.entityId) || new Set<string>();
      ids.add(credit.transactionId);
      byEntity.set(credit.entityId, ids);
    });
    const entities = earningEntities
      .filter((entity) => (byEntity.get(entity.id)?.size || 0) > 0)
      .map((entity) => ({ value: entity.id, label: entity.name, count: byEntity.get(entity.id)?.size || 0 }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: NET_EARNING, label: 'Net Commission Income', count: netIds.size }, ...entities];
  }, [agentPayeePicked, earningEntities, excludeTeamLeads, filtered, payments, postSplits, range, reportId, teamLeadIds]);

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
    if (earningsPicked != null) {
      const options = new Set(earningsChoices.map((choice) => choice.value));
      const next = earningsPicked.filter((value) => options.has(value));
      if (next.length !== earningsPicked.length) setEarningsPicked(next.length === 0 || (next.length === 1 && next[0] === NET_EARNING) ? null : next);
    }
  }, [agentPicked, agents, applyDimensions, earningsChoices, earningsPicked, groupOptions, groupPicked, loading, payeeChoices, payeePicked, paymentKind, setPayeePicked, sidePicked, sides, sourcePicked, sources, statusPicked, statuses]);
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
  const capAsOf = useMemo(() => shiftAsOf(todayIso(), capYearOffset), [capYearOffset]);
  const capSections = useMemo(() => {
    if (reportId !== 'team-caps') return [];
    const dealMap = new Map(filtered.map((deal) => [deal.id, deal]));
    const agentContributions = teamCaps.flatMap((cap) => {
      if (cap.kind !== 'agent' || !cap.entityId) return [];
      return postSplits.flatMap((credit) => {
        if (credit.entityId !== cap.entityId || !credit.agentId || !credit.transactionId || !credit.amount) return [];
        return [{
          agentId: credit.agentId,
          teamCapId: cap.id,
          amount: credit.amount,
          periodStart: null,
          transactionId: credit.transactionId,
        }];
      });
    });
    const contributions = [...capContributions, ...agentContributions];
    const paid = new Map<string, Set<string>>();
    payments.forEach((payment) => {
      if (!payment.agentId || !payment.transactionId || payeeKind(payment) !== 'agent' || Math.abs(payment.amount) < 0.01) return;
      const ids = paid.get(payment.agentId) || new Set<string>();
      ids.add(payment.transactionId);
      paid.set(payment.agentId, ids);
    });
    const activeCaps = teamCaps.filter((cap) => cap.enabled || contributions.some((row) => row.teamCapId === cap.id));
    return activeCaps.flatMap((cap) => {
      const rows = teamCapStandings({
        cap,
        agents: agentProfiles,
        contributions,
        deals: dealMap,
        names,
        asOf: capAsOf,
        paid,
      });
      if (rows.length === 0) return [];
      return [{ cap, rows, count: rows.reduce((sum, row) => sum + row.lines.length, 0) }];
    });
  }, [agentProfiles, capAsOf, capContributions, filtered, names, payments, postSplits, reportId, teamCaps]);
  const capChoices = capSections.map((section) => ({ value: section.cap.id, label: section.cap.name, count: section.count, group: section.cap.kind }));
  const capFallback = capSections[0] ? [capSections[0].cap.id] : null;
  const visibleCapSections = capSections.filter((section) => pickMatches(capPicked, capFallback, section.cap.id, false));
  useEffect(() => {
    if (capPicked == null) return;
    const options = new Set(capSections.map((section) => section.cap.id));
    const next = capPicked.filter((value) => options.has(value));
    if (next.length === 0) setCapPicked(null);
    else if (next.length !== 1 || next[0] !== capPicked[0]) setCapPicked([next[0]]);
  }, [capPicked, capSections]);
  const [launching, setLaunching] = useState(false);
  const [reveal, setReveal] = useState(false);
  const launchLock = useRef(false);
  const keptScroll = useRef<number | null>(null);
  const swipeRef = useRef<HTMLElement>(null);
  const arrivalRef = useRef<SwipeDirection | null>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  // Hides the double-tap hint. Kept apart from the paging timers, which the report change clears.
  const hintHideTimer = useRef<number | null>(null);
  const selectReport = (id: string | null) => {
    const href = id ? `/owner-reports/${id}` : '/owner-reports';
    if (href === pathname) return;
    keptScroll.current = window.scrollY;
    router.push(href, { scroll: false });
  };
  const launch = () => {
    if (launchLock.current || reportId) return;
    launchLock.current = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      selectReport('owner-summary');
      return;
    }
    setLaunching(true);
    window.setTimeout(() => {
      setReveal(true);
      selectReport('owner-summary');
    }, 420);
  };
  useEffect(() => {
    if (reportId) return;
    launchLock.current = false;
    setLaunching(false);
  }, [reportId]);
  useEffect(() => {
    if (!reveal) return;
    const timer = window.setTimeout(() => setReveal(false), 520);
    return () => window.clearTimeout(timer);
  }, [reveal]);

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
      arrivalRef.current = forward ? 'next' : 'prev';
      selectReport(OWNER_REPORTS[next].id);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pathname, reportId, router]);

  // Paging between reports in menu order. On a touch screen, a double tap near the right edge goes to the
  // next report and near the left edge to the previous one; the edge arrow names where it goes. With a
  // mouse, a floating button shows on an edge while the pointer is near it (EdgeReportButton below).
  // Taps in a form field or while a menu, dropdown or dialog is open are left alone.
  const pageToRef = useRef<(dir: SwipeDirection) => void>(() => {});
  useEffect(() => {
    const el = swipeRef.current;
    const index = OWNER_REPORTS.findIndex((item) => item.id === reportId);
    if (!reportId || !el || index < 0) {
      pageToRef.current = () => {};
      return;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const EDGE = 56;
    const neighbor = (dir: SwipeDirection) => OWNER_REPORTS[index + (dir === 'next' ? 1 : -1)] ?? null;
    const blocked = (target: EventTarget | null) => {
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], [role="listbox"], [role="dialog"], .app-modal')) return true;
      return Boolean(document.querySelector('[role="listbox"], [role="dialog"][aria-modal="true"], .app-modal'));
    };
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => {
      timers.push(window.setTimeout(fn, ms));
    };
    // The round edge arrow, driven straight through the DOM: it slides in on the side the report comes
    // from, turns emerald and names the report, then slides away.
    const hint = hintRef.current;
    const circle = hint?.querySelector<HTMLElement>('[data-hint-circle]') ?? null;
    const label = hint?.querySelector<HTMLElement>('[data-hint-label]') ?? null;
    const paintHint = (dir: SwipeDirection | null, name = '') => {
      if (!hint || !circle || !label) return;
      if (!dir) {
        // It fades where it is; it does not slide away.
        hint.style.transition = 'opacity 700ms ease-in-out';
        hint.style.opacity = '0';
        return;
      }
      hint.dataset.dir = dir;
      hint.style.transition = 'transform 160ms ease-out, opacity 160ms ease-out';
      hint.style.left = dir === 'prev' ? '0' : '';
      hint.style.right = dir === 'next' ? '0' : '';
      hint.style.flexDirection = dir === 'next' ? 'row-reverse' : 'row';
      hint.style.opacity = '1';
      hint.style.transform = `translate(${dir === 'next' ? -12 : 12}px, -50%)`;
      circle.dataset.ready = 'true';
      circle.querySelectorAll<SVGElement>('[data-arrow]').forEach((arrow) => {
        arrow.style.display = arrow.dataset.arrow === dir ? '' : 'none';
      });
      label.textContent = name;
      label.style.opacity = '1';
      label.style.transform = 'translateX(0)';
    };
    const commit = (dir: SwipeDirection) => {
      const target = neighbor(dir);
      if (!target) return;
      arrivalRef.current = dir;
      if (reduce) {
        selectReport(target.id);
        return;
      }
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: 'ease-in', fill: 'forwards' });
      later(() => selectReport(target.id), 100);
      // If the new report never arrives, bring this one back.
      later(() => {
        arrivalRef.current = null;
        el.getAnimations().forEach((animation) => animation.cancel());
      }, 2000);
    };
    pageToRef.current = commit;

    // Two taps on the same edge within 350 ms, close together, page that way.
    let lastTap: { dir: SwipeDirection; x: number; y: number; time: number } | null = null;
    let moved = false;
    let start: { x: number; y: number } | null = null;
    const onTouchStart = (event: TouchEvent) => {
      moved = false;
      start = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    };
    const onTouchMove = (event: TouchEvent) => {
      const point = event.touches[0];
      if (start && point && Math.hypot(point.clientX - start.x, point.clientY - start.y) > 10) moved = true;
    };
    const onTouchEnd = (event: TouchEvent) => {
      const point = event.changedTouches[0];
      if (!point || moved || event.touches.length > 0 || blocked(event.target)) {
        lastTap = null;
        return;
      }
      const dir: SwipeDirection | null = point.clientX >= window.innerWidth - EDGE ? 'next' : point.clientX <= EDGE ? 'prev' : null;
      if (!dir || !neighbor(dir)) {
        lastTap = null;
        return;
      }
      const now = event.timeStamp;
      if (lastTap && lastTap.dir === dir && now - lastTap.time < 350 && Math.hypot(point.clientX - lastTap.x, point.clientY - lastTap.y) < 40) {
        lastTap = null;
        // The second tap only pages; it does not also tap what is under it.
        event.preventDefault();
        swallowNextClick();
        const target = neighbor(dir);
        if (target) {
          const choice = reportChoice(target.id);
          paintHint(dir, `${choice.number} ${choice.name}`);
          // Shown for half a second, then it fades away, even though the report changes underneath it.
          if (hintHideTimer.current != null) window.clearTimeout(hintHideTimer.current);
          hintHideTimer.current = window.setTimeout(() => {
            hintHideTimer.current = null;
            paintHint(null);
          }, 500);
        }
        commit(dir);
        return;
      }
      lastTap = { dir, x: point.clientX, y: point.clientY, time: now };
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: false });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [pathname, reportId, router]);

  // The report that a double tap or an edge button paged to slides in from the side it came from.
  useLayoutEffect(() => {
    const dir = arrivalRef.current;
    const el = swipeRef.current;
    arrivalRef.current = null;
    if (!dir || !el) return;
    el.getAnimations().forEach((animation) => animation.cancel());
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.animate(
      [
        { transform: `translateX(${dir === 'next' ? '' : '-'}16px)`, opacity: 0 },
        { transform: 'translateX(0)', opacity: 1 },
      ],
      { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
  }, [reportId]);

  useLayoutEffect(() => {
    const y = keptScroll.current;
    if (y == null) return;
    keptScroll.current = null;
    const hold = () => {
      const root = (document.scrollingElement || document.documentElement) as HTMLElement;
      const header = document.querySelector('header');
      const navbar = header && getComputedStyle(header).position !== 'fixed' ? header.offsetHeight : 0;
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
    <main onClick={!report && !loading ? launch : undefined} className={`[overflow-anchor:none] [touch-action:manipulation] text-slate-900 dark:text-slate-100 ${reportCanvas} ${!report && !loading ? 'cursor-pointer' : ''} ${screenFitReport(reportId) ? 'min-h-screen screenfit:min-h-0 screenfit:h-dvh screenfit:overflow-hidden' : 'min-h-screen'}`}>
      <SwipeHint ref={hintRef} />
      {reportId ? <EdgeReportButtons reportId={reportId} onPage={(dir) => pageToRef.current(dir)} /> : null}
      <div className={`${widePageFrame} ${screenFitReport(reportId) ? 'pb-3 screenfit:flex screenfit:h-full screenfit:min-h-0 screenfit:flex-col screenfit:overflow-hidden' : 'pb-4'}`}>
        <section ref={swipeRef} className={`min-w-0 ${screenFitReport(reportId) ? 'screenfit:flex screenfit:min-h-0 screenfit:flex-1 screenfit:flex-col' : `space-y-4 ${reveal ? 'report-arrive' : ''}`}`}>
          {loading ? (
            <LoadingDataPage
              progress={loadProgress}
              error={error}
              onRetry={handleRetry}
            />
          ) : report ? (
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
              earningsChoices={reportId === 'net-commission-income' ? earningsChoices : undefined}
              earningsPicked={earningsPicked}
              onEarnings={setEarningsPicked}
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
              payments={shownPayments}
              entityNames={entityNames}
              teamLeadIds={teamLeadIds}
              capChoices={capChoices}
              capPicked={capPicked}
              onCaps={setCapPicked}
              capYearOffset={capYearOffset}
              onCapYearOffset={setCapYearOffset}
              capSections={visibleCapSections}
              agentFieldLabels={agentFieldLabels}
              capAsOf={capAsOf}
              capOpen={capOpen}
              onCapOpen={setCapOpen}
              capShowPaid={capShowPaid}
              onCapShowPaid={setCapShowPaid}
              filtersDirty={preset !== 'ytd' || statusPicked != null || sidePicked != null || agentPicked != null || sourcePicked != null || groupPicked != null || agentPayeePicked != null || entityPayeePicked != null || earningsPicked != null || excludeTeamLeads || capPicked != null || capYearOffset !== 0 || capShowPaid}
              onResetFilters={() => {
                setPreset('ytd');
                setRange(rangeForPreset('ytd'));
                setStatusPicked(null);
                setSidePicked(null);
                setAgentPicked(null);
                setSourcePicked(null);
                setGroupPicked(null);
                setAgentPayeePicked(null);
                setEntityPayeePicked(null);
                setEarningsPicked(null);
                setExcludeTeamLeads(false);
                setCapPicked(null);
                setCapYearOffset(0);
                setCapShowPaid(false);
              }}
              capEmpty={teamCaps.length === 0
                ? 'No caps are set up yet.'
                : capPicked?.length === 0
                  ? 'Select a cap to see each agent’s cap year.'
                  : 'No agents on this cap match the current filters.'}
            />
          ) : (
            <Cover launching={launching} onEnter={launch} />
          )}
        </section>
      </div>
    </main>
  );
}

type SwipeDirection = 'next' | 'prev';

/** Edge arrow shown when a double tap pages between reports. The paging effect positions and fills it directly. */
function SwipeHint({ ref }: { ref: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed top-1/2 z-[55] flex items-center gap-2 px-2"
      style={{ opacity: 0, transform: 'translate(-56px, -50%)' }}
    >
      <span
        data-hint-circle
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-lg transition-colors duration-150 data-[ready=true]:border-emerald-500 data-[ready=true]:bg-emerald-500 data-[ready=true]:text-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
      >
        <ChevronLeft data-arrow="prev" className="h-5 w-5" strokeWidth={2.5} />
        <ChevronRight data-arrow="next" className="h-5 w-5" strokeWidth={2.5} />
      </span>
      <span
        data-hint-label
        className="max-w-[60vw] truncate rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg transition-[opacity,transform] duration-150"
        style={{ opacity: 0 }}
      />
    </div>
  );
}

/**
 * Desktop paging: while the mouse is near the left or right edge, a round button shows on that edge.
 * Hovering it names the report it goes to; clicking goes there. Only where there is a report that way.
 */
function EdgeReportButtons({ reportId, onPage }: { reportId: string; onPage: (dir: SwipeDirection) => void }) {
  const [edge, setEdge] = useState<SwipeDirection | null>(null);
  const index = OWNER_REPORTS.findIndex((item) => item.id === reportId);
  const neighbors = {
    prev: index > 0 ? OWNER_REPORTS[index - 1] : null,
    next: index >= 0 && index < OWNER_REPORTS.length - 1 ? OWNER_REPORTS[index + 1] : null,
  };
  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const ZONE = 64;
    const onMove = (event: MouseEvent) => {
      const next: SwipeDirection | null = event.clientX <= ZONE ? 'prev' : event.clientX >= window.innerWidth - ZONE ? 'next' : null;
      setEdge((current) => (current === next ? current : next));
    };
    const onLeave = () => setEdge(null);
    window.addEventListener('mousemove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, []);
  return (
    <>
      {(['prev', 'next'] as const).map((dir) => {
        const target = neighbors[dir];
        if (!target) return null;
        const choice = reportChoice(target.id);
        const visible = edge === dir;
        return (
          <button
            key={dir}
            type="button"
            tabIndex={visible ? 0 : -1}
            aria-hidden={!visible}
            aria-label={`${dir === 'next' ? 'Next' : 'Previous'} Report: ${choice.name}`}
            onClick={() => {
              setEdge(null);
              onPage(dir);
            }}
            className={`group fixed top-1/2 z-[55] flex -translate-y-1/2 cursor-pointer items-center gap-2 transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none ${
              dir === 'prev' ? 'left-3 flex-row' : 'right-3 flex-row-reverse'
            } ${visible ? 'opacity-100' : `pointer-events-none opacity-0 ${dir === 'prev' ? '-translate-x-4' : 'translate-x-4'}`}`}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-lg transition-colors group-hover:border-emerald-500 group-hover:bg-emerald-500 group-hover:text-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {dir === 'prev'
                ? <ChevronLeft className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                : <ChevronRight className="h-5 w-5" strokeWidth={2.5} aria-hidden />}
            </span>
            <span className="max-w-[40vw] truncate rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
              {choice.number} {choice.name}
            </span>
          </button>
        );
      })}
    </>
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

/**
 * The report switcher: a button in the top-left corner of the report header that opens a drawer from the
 * left edge of the screen. It opens on click only. Esc, the close button, or a click outside closes it
 * without doing anything else; arrow keys move through the reports and Enter opens one.
 */
function OwnerReportNav({ reportId, onSelect }: { reportId: string | null; onSelect: (id: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const choice = reportChoice(reportId);
  const label = choice.number ? `${choice.number} · ${choice.name}` : choice.name;

  // Mounted first, then slid in a moment later, so the drawer animates from the left edge.
  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const timer = window.setTimeout(() => setShown(true), 16);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const items = () => [...(drawerRef.current?.querySelectorAll<HTMLButtonElement>('[data-report-item]') ?? [])];
    const focusTimer = window.setTimeout(() => {
      const list = items();
      (list.find((item) => item.getAttribute('aria-current') === 'page') ?? list[0])?.focus();
    }, 60);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const list = items();
      if (list.length === 0) return;
      event.preventDefault();
      const at = list.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'ArrowDown'
        ? list[(at + 1 + list.length) % list.length]
        : list[(at - 1 + list.length) % list.length];
      next.focus();
    };
    const html = document.documentElement;
    const previousOverflow = html.style.overflow;
    html.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKey);
      html.style.overflow = previousOverflow;
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  const choose = (id: string | null) => {
    setOpen(false);
    onSelect(id);
  };

  // A swipe toward the left edge closes the drawer on touch screens.
  const swipeStart = useRef<number | null>(null);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="All Owner Reports"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 max-w-full cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-brand-400"
      >
        <Menu className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" strokeWidth={2} aria-hidden />
        <span className="truncate tabular-nums">{label}</span>
      </button>
      {open ? createPortal(
        <div className="fixed inset-0 z-[95]" role="presentation">
          <div
            className={`absolute inset-0 bg-slate-950/40 transition-opacity duration-200 motion-reduce:transition-none ${shown ? 'opacity-100' : 'opacity-0'}`}
            onClick={close}
            aria-hidden
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onTouchStart={(event) => { swipeStart.current = event.touches[0]?.clientX ?? null; }}
            onTouchEnd={(event) => {
              const start = swipeStart.current;
              swipeStart.current = null;
              const end = event.changedTouches[0]?.clientX;
              if (start != null && end != null && start - end > 60) close();
            }}
            className={`absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-out motion-reduce:transition-none dark:border-slate-700 dark:bg-slate-900 ${shown ? 'translate-x-0' : '-translate-x-full'}`}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <button type="button" onClick={() => choose(null)} className="min-w-0 cursor-pointer text-left">
                <SoleoxLogo
                  className="h-6 w-auto"
                  word={<span id={titleId}>Owner Reports</span>}
                  wordSize="text-base font-extrabold tracking-tight"
                />
              </button>
              <button
                type="button"
                onClick={close}
                aria-label="Close Reports"
                title="Close"
                className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>
            <nav aria-label="Owner Reports" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3">
              {GROUPS.map((group) => (
                <div key={group} className="mb-3">
                  <p className="px-2 pb-1 text-2xs font-semibold text-slate-400 dark:text-slate-500">{group}</p>
                  {OWNER_REPORTS.filter((item) => item.group === group).map((item) => {
                    const number = String(OWNER_REPORTS.findIndex((entry) => entry.id === item.id) + 1).padStart(2, '0');
                    const active = item.id === reportId;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-report-item
                        aria-current={active ? 'page' : undefined}
                        onClick={() => choose(item.id)}
                        className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
                          active
                            ? 'bg-brand-500/10 font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                            : item.ready
                              ? 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                              : 'text-slate-400 hover:bg-slate-50 dark:text-slate-500 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <span className="w-6 shrink-0 text-xs tabular-nums text-slate-400 dark:text-slate-500">{number}</span>
                        <span className="min-w-0 flex-1 truncate">{item.name}</span>
                        {!item.ready ? (
                          <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-2xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">Soon</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function ReportMenu({ reportId, onSelect }: { reportId: string | null; onSelect: (id: string | null) => void }) {
  return (
    <>
      <button type="button" onClick={() => onSelect(null)} className="w-full cursor-pointer text-left px-2 py-2">
        <h1>
          <SoleoxLogo
            className="h-6 w-auto"
            word="Owner Reports"
            wordSize="text-base font-extrabold tracking-tight"
          />
        </h1>
      </button>
      {GROUPS.map((group) => (
        <div key={group} className="mt-3">
          <p className="px-2 text-xs font-medium text-slate-400">{group}</p>
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

function Cover({ launching, onEnter }: { launching: boolean; onEnter: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
      event.preventDefault();
      onEnter();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEnter]);
  const marks = [
    { label: 'Sales Volume', className: 'report-pill-slate' },
    { label: 'Gross Commission', className: 'report-pill-emerald' },
    { label: 'Units', className: 'report-pill-slate' },
    { label: 'Team Commission', className: 'report-pill-slate' },
  ];
  return (
    <div className={`report-cover relative min-h-[calc(100vh-1rem)] overflow-hidden px-6 text-center ${launching ? 'report-cover-launch' : ''}`}>
      <div aria-hidden="true" className="report-cover-glow pointer-events-none absolute inset-x-0 top-1/2 h-72 -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,rgb(16_185_129/0.22),transparent_68%)]" />
      <div className="report-cover-copy absolute inset-x-0 top-1/2 -translate-y-[calc(50%+2rem)] px-6">
        <p className="absolute inset-x-0 bottom-full px-6 pb-4 text-lg font-light uppercase tracking-[0.32em] text-slate-500 dark:text-slate-400">
          Real Estate Business Intelligence
        </p>
        <h2 className="text-6xl font-extrabold tracking-tight text-slate-900 sm:text-7xl dark:text-white">
          Owner <span className="text-emerald-600 dark:text-emerald-400">Reports</span>
        </h2>
        <div className="absolute inset-x-0 top-full px-6 pt-5">
          <p className="mx-auto max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
            Production, pipeline, and agent results for the year, calculated from your transactions.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            {marks.map((mark) => (
              <span key={mark.label} className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide ${mark.className}`}>
                {mark.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const reportTableWrap = 'report-table rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';
const pairedReport = 'grid items-stretch gap-4 lg:grid-cols-2';
const pairedSection = 'flex h-full min-w-0 flex-col gap-3';
const pairedScores = 'grid grid-cols-3 gap-2 md:gap-3';

type ColumnSort = { key: string; direction: 'asc' | 'desc' };

function useColumnSort(initial: ColumnSort | null = null) {
  const [sort, setSort] = useState<ColumnSort | null>(initial);
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
          {active ? <span aria-hidden="true" className="shrink-0 text-2xs leading-none">{sort.direction === 'asc' ? '↑' : '↓'}</span> : null}
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
  earningsChoices?: FilterChoice[];
  earningsPicked?: string[] | null;
  onEarnings?: (value: string[] | null) => void;
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
  capChoices: CapMenuChoice[];
  capPicked: string[] | null;
  onCaps: (value: string[] | null) => void;
  capYearOffset: number;
  onCapYearOffset: (value: number) => void;
  capSections: Array<{ cap: TeamCapDefinition; rows: CapStanding[]; count: number }>;
  agentFieldLabels: Map<string, string>;
  capAsOf: string;
  capOpen: { capId: string; agentId: string } | null;
  onCapOpen: (value: { capId: string; agentId: string } | null) => void;
  capShowPaid: boolean;
  onCapShowPaid: (value: boolean) => void;
  /** Some filter differs from its default. */
  filtersDirty: boolean;
  /** Puts every filter of the report back to its default. */
  onResetFilters: () => void;
  capEmpty: string;
}) {
  const { reportId, closed, pending, taken, closedPrior, pendingPrior, names, range, priorRange, metric, netCommission, priorNetCommission, allDeals, deals, payments, teamLeadIds } = props;
  const [cumulative, setCumulative] = useState(false);
  const capSection = props.reportId === 'team-caps' && props.capSections.length === 1 ? props.capSections[0] : null;
  // Agent Earnings and Team Caps fill the screen and scroll inside their tables on desktop.
  // Below md, or on a short screen, the page scrolls natively instead.
  // A phone in landscape is wide but short, so the full-screen layout also needs a tall screen.
  const locked = screenFitReport(props.reportId);
  const reportAbout = OWNER_REPORTS.find((item) => item.id === props.reportId)?.about;
  const [filterSlot, setFilterSlot] = useState<HTMLDivElement | null>(null);
  const fitsScreen = useFitsScreen();
  const chromeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!locked || !fitsScreen) return;
    const previousHtml = document.documentElement.style.overflow;
    const previousBody = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const scroller = document.querySelector<HTMLElement>('.report-table-fit');
      if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 1) return;
      if (event.target instanceof Node && scroller.contains(event.target)) return;
      let node = event.target instanceof Element ? event.target : null;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) return;
        node = node.parentElement;
      }
      scroller.scrollTop += event.deltaY;
      event.preventDefault();
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      document.documentElement.style.overflow = previousHtml;
      document.body.style.overflow = previousBody;
      window.removeEventListener('wheel', onWheel);
    };
  }, [locked, fitsScreen]);
  useLayoutEffect(() => {
    const chrome = chromeRef.current;
    const root = chrome?.closest('main');
    if (!chrome || !root) return;
    let frame = 0;
    const apply = () => {
      const bottom = Math.max(0, chrome.getBoundingClientRect().bottom);
      root.style.setProperty('--report-chrome-bottom', `${bottom}px`);
      // Phones do not pin table headers: a header moved by script trails iOS momentum scrolling,
      // so rows peek out and show through. Each header stays at the top of its own table instead.
      if (!window.matchMedia(DESKTOP_QUERY).matches) {
        root.querySelectorAll<HTMLElement>('.report-table thead, [data-production-heading]').forEach((element) => {
          element.style.transform = '';
        });
        return;
      }
      root.querySelectorAll<HTMLElement>('.report-table').forEach((wrap) => {
        if (wrap.closest('[data-production-block]')) return;
        const head = wrap.querySelector('thead');
        if (!head) return;
        const wrapRect = wrap.getBoundingClientRect();
        const hold = !wrap.classList.contains('report-table-fit') && wrapRect.top < bottom && wrapRect.bottom > bottom + head.offsetHeight;
        head.style.transform = hold ? `translateY(${bottom - wrapRect.top}px)` : '';
      });
      root.querySelectorAll<HTMLElement>('[data-production-block]').forEach((block) => {
        const heading = block.querySelector<HTMLElement>('[data-production-heading]');
        const wrap = block.querySelector<HTMLElement>('.report-table');
        const head = wrap?.querySelector<HTMLElement>('thead');
        if (!heading || !wrap || !head) return;
        if (wrap.classList.contains('report-table-fit')) {
          heading.style.transform = '';
          head.style.transform = '';
          return;
        }
        const blockRect = block.getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
        const headingHeight = heading.offsetHeight;
        const shift = bottom - blockRect.top;
        const hold = shift > 0 && blockRect.bottom > bottom + headingHeight + head.offsetHeight;
        heading.style.transform = hold ? `translateY(${shift}px)` : '';
        const theadShift = bottom + headingHeight - wrapRect.top;
        head.style.transform = hold ? `translateY(${theadShift}px)` : '';
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
    <div className={locked ? 'screenfit:flex screenfit:min-h-0 screenfit:flex-1 screenfit:flex-col' : undefined}>
      <div ref={chromeRef} className={`z-40 shrink-0 border-b border-slate-200/80 px-0 dark:border-slate-700/80 ${reportCanvas} ${locked ? '' : 'sticky top-0'} ${capSection ? 'pb-3' : 'pb-4'}`}>
        {/* Below md the report menu moves into the header's menu sheet, so the title gets the full row. */}
        {/* Extra-wide screens: menu, title, and the date and Filters controls share one row. Narrower: the menu and
            the controls share the top row and the title is centered under them. Phones: the title alone. */}
        <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 py-5 [grid-template-areas:'nav_filters'_'title_title'] xl:grid-cols-[1fr_auto_1fr] xl:py-6 xl:[grid-template-areas:'nav_title_filters'] max-md:grid-cols-1 max-md:gap-2 max-md:py-3 max-md:[grid-template-areas:'title']">
          <div className="z-50 min-w-0 justify-self-start [grid-area:nav] max-md:hidden">
            <OwnerReportNav reportId={props.reportId} onSelect={props.onSelectReport} />
          </div>
          <div className="relative z-40 min-w-0 px-2 text-center [grid-area:title]">
            {/* The info icon sits outside the heading so its note keeps the body type size. */}
            <div className="flex items-center justify-center gap-2">
            <h2 className="text-balance text-2xl font-extrabold leading-tight tracking-tight">
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
              ) : props.reportId === 'team-caps' ? (
                <TitleCaps options={props.capChoices} picked={props.capPicked} onChange={props.onCaps} />
              ) : props.reportName}
            </h2>
            {reportAbout ? (
              <ScoreNote label={props.reportName} text={reportAbout} className="relative inline-flex shrink-0" align="right" wide iconClass="text-slate-400 transition hover:text-brand-600 dark:hover:text-brand-300" />
            ) : null}
            </div>
            <p className="mt-1.5 text-sm text-slate-500 max-md:mt-1 max-md:text-xs">{props.reportId === 'team-caps' ? 'Each agent’s cap year comes from that cap’s reset date.' : `${formatRange(range)} compared with ${formatRange(priorRange)}`}</p>
          </div>
          {/* The date and Filters controls render here from FilterBar on wider screens. */}
          <div ref={setFilterSlot} className="relative z-50 min-w-0 justify-self-end [grid-area:filters] max-md:hidden" />
        </div>
        <FilterBar
          {...props}
          headerSlot={filterSlot}
          dateOnly={props.reportId === 'owner-summary'}
          hideMetric={props.reportId === 'lead-source-leaderboard' || props.reportId === 'team-performance' || props.reportId === 'net-commission-income' || props.reportId === 'team-caps' || props.reportId === 'transaction-map' || props.reportId === 'transaction-list' || props.reportId === 'listings-by-list-date' || props.reportId === 'price-change'}
          hideDate={props.reportId === 'team-caps'}
          capYearOffset={props.capYearOffset}
          onCapYearOffset={props.onCapYearOffset}
          capShowPaid={props.reportId === 'team-caps' ? props.capShowPaid : undefined}
          boardMetrics={undefined}
          payeeChoices={(props.reportId === 'net-commission-income' || (props.reportId === 'lead-source-leaderboard' && (props.boardMetric === 'payment:agent' || props.boardMetric === 'payment:entity'))) ? props.payeeChoices : undefined}
          cumulative={props.reportId === 'team-performance' ? cumulative : undefined}
          onCumulative={setCumulative}
          resultCount={props.reportId === 'team-caps' ? undefined : props.deals.filter((deal) => !deal.archived && dealInReport(deal, props.range, props.reportId, props.boardDate)).length}
          canReset={props.filtersDirty || cumulative}
          onReset={() => {
            props.onResetFilters();
            setCumulative(false);
          }}
          excludeTeamLeads={(props.reportId === 'team-performance' || props.reportId === 'net-commission-income' || (props.reportId === 'lead-source-leaderboard' && props.boardMetric !== 'payment:entity')) ? props.excludeTeamLeads : undefined}
          dateRangeLabel={props.reportId === 'lead-source-leaderboard' || props.reportId === 'team-performance'
            ? `${props.dateBases.find((field) => field.id === props.boardDate)?.label || 'Closing Date'} Range`
            : props.reportId === 'net-commission-income'
              ? `${props.dateBases.find((field) => field.id === 'closing')?.label || 'Closing Date'} Range`
              : props.reportId === 'listings-by-list-date'
                ? 'List Date Range'
                : props.reportId === 'transaction-list' || props.reportId === 'transaction-map' || props.reportId === 'price-change'
                  ? 'Closing Date Range'
                  : undefined}
        />
        {capSection ? (
          <CapStickyHeading
            section={capSection}
            labels={props.agentFieldLabels}
            asOf={props.capAsOf}
            previous={props.capYearOffset > 0}
            openAgentId={props.capOpen?.capId === capSection.cap.id ? props.capOpen.agentId : null}
            onClose={() => props.onCapOpen(null)}
          />
        ) : null}
      </div>
      <div className={locked ? `screenfit:flex screenfit:min-h-0 screenfit:flex-1 screenfit:flex-col screenfit:overflow-hidden ${capSection ? 'pt-0' : 'pt-4'}` : `space-y-4 ${capSection ? 'pt-0' : 'pt-4'}`}>
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
            statusPicked={props.statusPicked}
            cumulative={props.reportId === 'team-performance' && cumulative}
            preset={props.preset}
            capSections={props.capSections}
            agentFieldLabels={props.agentFieldLabels}
            capAsOf={props.capAsOf}
            capYearOffset={props.capYearOffset}
            capOpen={props.capOpen}
            onCapOpen={props.onCapOpen}
            capShowPaid={props.capShowPaid}
            onCapShowPaid={props.onCapShowPaid}
            capEmpty={props.capEmpty}
          />
        ) : null}
      </div>
    </div>
  );
}

type FilterChoice = { value: string; label: string; count: number };
type CapMenuChoice = FilterChoice & { group: 'team' | 'agent' };

/**
 * A tap outside an open dropdown only closes it, except on another control in the filters card:
 * there it also opens that filter or ticks that checkbox.
 */
function swallowOutsideFilters(target: EventTarget | null) {
  if (target instanceof Element && target.closest('[data-report-filters]')) return;
  swallowNextClick();
}

/** Inside the filter panel or sheet, dropdowns open in place below their field instead of floating over the page. */
const FiltersInPanel = React.createContext(false);

/** The date and Cap Year pills and the Filters button in the report title row. */
const headerPill = 'inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs transition hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-brand-700 dark:hover:text-brand-300';

const panelList = 'relative mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 text-sm font-medium normal-case tracking-normal text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

/** Date presets offered as chips on the phone sheet; the rest stay in the Date Range dropdown. */
const SHEET_PRESETS: RangePreset[] = ['this-week', 'this-month', 'last-month', 'this-quarter', 'last-quarter', 'ytd', 'this-year', 'last-year', 'custom'];

type FilterChip = { key: string; label: string; text: string; clear: () => void };

/** What a multi-select filter shows on its chip: up to two names, else a count. */
function pickSummary(label: string, options: FilterChoice[], picked: string[], fold: boolean): string {
  const names = options
    .filter((option) => picked.some((item) => (fold ? item.toLowerCase() === option.value.toLowerCase() : item === option.value)))
    .map((option) => option.label);
  if (names.length === 0) return 'None';
  return names.length <= 2 ? names.join(', ') : `${names.length} ${filterPlural(label)}`;
}

/**
 * Report filters. A slim bar always shows the date range and a chip for each filter in use (× clears it); the
 * Filters button opens every filter in a panel from the right on a computer, or a sheet from the bottom on a phone.
 * Changes apply as they are made; on a phone the sheet's main button shows how many transactions match.
 */
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
  earningsChoices?: FilterChoice[];
  earningsPicked?: string[] | null;
  onEarnings?: (value: string[] | null) => void;
  excludeTeamLeads?: boolean;
  onExcludeTeamLeads?: (value: boolean) => void;
  /** The client's team leads; the exclude checkbox is singular when there is exactly one. */
  teamLeadIds?: Set<string>;
  cumulative?: boolean;
  onCumulative?: (value: boolean) => void;
  dateRangeLabel?: string;
  dateOnly?: boolean;
  hideMetric?: boolean;
  hideDate?: boolean;
  capYearOffset?: number;
  onCapYearOffset?: (value: number) => void;
  capShowPaid?: boolean;
  onCapShowPaid?: (value: boolean) => void;
  canReset?: boolean;
  onReset?: () => void;
  /** Transactions the report shows with the current filters, for the phone sheet's button. */
  resultCount?: number;
  /** The right side of the report title row: on wider screens the date and Filters controls render there. */
  headerSlot?: HTMLElement | null;
}) {
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragFrom = useRef<number | null>(null);

  // Escape closes the panel, unless a dropdown inside it is open (that Escape closes the dropdown).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[data-report-filters-panel] [aria-expanded="true"]')) return;
      setOpen(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const chips: FilterChip[] = [];
  const addPick = (key: string, label: string, options: FilterChoice[] | undefined, picked: string[] | null | undefined, fold: boolean, onChange: ((value: string[] | null) => void) | undefined) => {
    if (picked == null || !options || !onChange) return;
    chips.push({ key, label, text: pickSummary(label, options, picked, fold), clear: () => onChange(null) });
  };
  addPick('group', 'Group', props.groupChoices, props.groupPicked, false, props.onGroups);
  addPick('earnings', 'Earnings Type', props.earningsChoices, props.earningsPicked, false, props.onEarnings);
  if (!props.dateOnly) {
    addPick('status', 'Status', props.statusChoices, props.statusPicked, true, props.onStatus);
    addPick('side', 'Side', props.sideChoices, props.sidePicked, true, props.onSide);
    addPick('agent', 'Primary Agent', props.agentChoices, props.agentPicked, false, props.onAgent);
    addPick('source', 'Lead Source', props.sourceChoices, props.sourcePicked, false, props.onSource);
    addPick('payee', props.boardMetric === 'payment:entity' ? 'Entity' : 'Agent', props.payeeChoices, props.payeePicked, false, props.onPayees);
    if (props.excludeTeamLeads && props.onExcludeTeamLeads) chips.push({ key: 'leads', label: props.teamLeadIds?.size === 1 ? 'Exclude Team Lead' : 'Exclude Team Leads', text: '', clear: () => props.onExcludeTeamLeads?.(false) });
    if (props.cumulative && props.onCumulative) chips.push({ key: 'cumulative', label: 'Cumulative', text: '', clear: () => props.onCumulative?.(false) });
    if (props.capShowPaid && props.onCapShowPaid) chips.push({ key: 'paid', label: 'Show All Paid Transactions', text: '', clear: () => props.onCapShowPaid?.(false) });
  }

  const resetButton = props.onReset ? (
    <button
      type="button"
      onClick={() => props.onReset?.()}
      disabled={!props.canReset}
      title="Put every filter on this report back to its default"
      className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-50 disabled:cursor-default disabled:text-slate-400 disabled:hover:bg-transparent dark:text-brand-300 dark:hover:bg-brand-950 dark:disabled:text-slate-500"
    >
      <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
      Reset Filters
    </button>
  ) : null;

  const capYear = props.onCapYearOffset ? (
    <ChoiceFilter
      label="Cap Year"
      note="Current uses today. Previous uses the same day one year ago. Every selected cap applies that day to its own reset date."
      value={String(props.capYearOffset || 0)}
      options={[
        { value: '0', label: 'Current Cap Year' },
        { value: '1', label: 'Previous Cap Year' },
      ]}
      onChange={(next) => props.onCapYearOffset?.(next === '1' ? 1 : 0)}
    />
  ) : null;
  const customDates = props.preset === 'custom' && !props.hideDate ? (
    <div className="flex flex-wrap gap-3">
      <CustomDateField label="From" value={props.range.start} onChange={(start) => props.onRange({ ...props.range, start })} />
      <CustomDateField label="To" value={props.range.end} onChange={(end) => props.onRange({ ...props.range, end })} />
    </div>
  ) : null;
  const checkbox = (checked: boolean, onChange: (value: boolean) => void, label: string, title?: string) => (
    <label title={title} className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 cursor-pointer accent-emerald-600" />
      {label}
    </label>
  );

  // Every filter, stacked, for the panel and the sheet.
  const controls = (
    <>
      <MultiFilter label="Group" note="Limits every metric to transactions whose primary agent belongs to the selected groups. All includes every agent." options={props.groupChoices} picked={props.groupPicked} fallback={null} onChange={props.onGroups} />
      {props.earningsChoices && props.onEarnings ? (
        <MultiFilter label="Earnings Type" note="Net commission income is each agent’s payment amount. Checking an entity adds the post-split dollars that agent allocated to it." options={props.earningsChoices} picked={props.earningsPicked ?? null} fallback={[NET_EARNING]} onChange={props.onEarnings} />
      ) : null}
      {props.dateOnly ? null : (
        <>
          <MultiFilter label="Status" options={props.statusChoices} picked={props.statusPicked} fallback={props.statusFallback} onChange={props.onStatus} fold />
          <MultiFilter label="Side" options={props.sideChoices} picked={props.sidePicked} fallback={null} onChange={props.onSide} fold />
          <MultiFilter label="Primary Agent" options={props.agentChoices} picked={props.agentPicked} fallback={null} onChange={props.onAgent} />
          <MultiFilter label="Lead Source" options={props.sourceChoices} picked={props.sourcePicked} fallback={null} onChange={props.onSource} />
          {props.payeeChoices && props.onPayees ? (
            <MultiFilter label={props.boardMetric === 'payment:entity' ? 'Entity' : 'Agent'} options={props.payeeChoices} picked={props.payeePicked ?? null} fallback={null} onChange={props.onPayees} />
          ) : null}
          {props.hideMetric ? null : (
            <ChoiceFilter
              label="Metric"
              value={props.boardMetrics ? props.boardMetric ?? '' : props.metric}
              options={(props.boardMetrics ?? METRICS.map((item) => ({ id: item.id, label: item.label }))).map((item) => ({ value: item.id, label: item.label }))}
              onChange={(next) => {
                if (props.boardMetrics && props.onBoardMetric) props.onBoardMetric(next);
                else props.onMetric(next as MetricId);
              }}
            />
          )}
          {props.excludeTeamLeads !== undefined && props.onExcludeTeamLeads
            ? checkbox(Boolean(props.excludeTeamLeads), props.onExcludeTeamLeads, props.teamLeadIds?.size === 1 ? 'Exclude Team Lead' : 'Exclude Team Leads')
            : null}
          {props.cumulative !== undefined && props.onCumulative ? checkbox(props.cumulative, props.onCumulative, 'Cumulative') : null}
          {props.capShowPaid !== undefined && props.onCapShowPaid
            ? checkbox(props.capShowPaid, props.onCapShowPaid, 'Show All Paid Transactions', 'Lists every transaction in the agent’s cap year where the agent was paid. Rows that add nothing to this cap are grey.')
            : null}
        </>
      )}
    </>
  );

  const countBadge = chips.length > 0 ? (
    <span className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-brand-600 px-1 text-2xs font-semibold tabular-nums text-white">{chips.length}</span>
  ) : null;
  const span = props.hideDate ? (props.capYearOffset ? 'Previous Cap Year' : 'Current Cap Year') : formatFilterSpan(props.range);
  const resultLabel = props.resultCount == null
    ? 'Show Results'
    : `Show ${props.resultCount.toLocaleString()} ${props.resultCount === 1 ? 'Transaction' : 'Transactions'}`;

  const filtersButton = (
    <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={headerPill}>
      <SlidersHorizontal className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      Filters
      {countBadge}
    </button>
  );
  // Wider screens: the date (or Cap Year) and Filters sit in the title row; a row of chips appears under the title
  // only while a filter is set or Custom dates are being typed.
  const headerControls = (
    <div data-report-filters className="flex flex-wrap items-center justify-end gap-2">
      {props.hideDate
        ? (props.onCapYearOffset ? (
          <ChoiceFilter
            compact
            label="Cap Year"
            value={String(props.capYearOffset || 0)}
            options={[
              { value: '0', label: 'Current Cap Year' },
              { value: '1', label: 'Previous Cap Year' },
            ]}
            onChange={(next) => props.onCapYearOffset?.(next === '1' ? 1 : 0)}
          />
        ) : null)
        : <DateRangeFilter compact preset={props.preset} range={props.range} onPreset={props.onPreset} onRange={props.onRange} label={props.dateRangeLabel} />}
      {filtersButton}
    </div>
  );
  const chipRow = chips.length > 0 || customDates ? (
    <div data-report-filters className="relative z-30 flex flex-wrap items-end gap-x-4 gap-y-2">
      {customDates}
      {chips.length > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <span key={chip.key} className="inline-flex max-w-[18rem] items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-2.5 pr-1 text-xs text-brand-800 ring-1 ring-brand-200 dark:bg-brand-950/60 dark:text-brand-200 dark:ring-brand-800">
              <span className="truncate">
                <span className="font-semibold">{chip.label}</span>{chip.text ? `: ${chip.text}` : ''}
              </span>
              <button
                type="button"
                onClick={chip.clear}
                aria-label={`Clear ${chip.label}`}
                title={`Clear ${chip.label}`}
                className="inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-brand-500 transition hover:bg-brand-100 hover:text-brand-800 dark:hover:bg-brand-900 dark:hover:text-brand-100"
              >
                <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              </button>
            </span>
          ))}
          {resetButton}
        </div>
      ) : null}
    </div>
  ) : null;

  const bar = isDesktop ? (
    <>
      {props.headerSlot ? createPortal(headerControls, props.headerSlot) : headerControls}
      {chipRow}
    </>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-haspopup="dialog"
      className="relative z-30 flex w-full cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left dark:border-slate-800 dark:bg-slate-900"
    >
      <SlidersHorizontal className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2.25} aria-hidden />
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Filters</span>
      <span className="min-w-0 flex-1 truncate text-xs tabular-nums text-slate-500 dark:text-slate-400">{span}</span>
      {countBadge}
      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2.25} aria-hidden />
    </button>
  );

  const close = () => setOpen(false);
  const header = (
    <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-4">
      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">Filters</p>
      <button
        type="button"
        onClick={close}
        aria-label="Close Filters"
        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      </button>
    </div>
  );

  const panel = !open || typeof document === 'undefined' ? null : createPortal(
    <FiltersInPanel.Provider value>
      <div className="fixed inset-0 z-[80] bg-slate-950/30 report-filters-fade" onClick={close} aria-hidden />
      {isDesktop ? (
        <aside
          role="dialog"
          aria-label="Filters"
          data-report-filters
          data-report-filters-panel
          className="report-filters-panel fixed inset-y-0 right-0 z-[81] flex w-[22rem] max-w-[92vw] flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        >
          {header}
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-5 pb-5 pt-1">
            {props.hideDate ? capYear : <DateRangeFilter preset={props.preset} range={props.range} onPreset={props.onPreset} onRange={props.onRange} label={props.dateRangeLabel} />}
            {customDates}
            {controls}
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
            {resetButton ?? <span />}
            <button type="button" onClick={close} className="h-9 cursor-pointer rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white transition hover:bg-brand-700">Done</button>
          </div>
        </aside>
      ) : (
        <div
          ref={sheetRef}
          role="dialog"
          aria-label="Filters"
          data-report-filters
          data-report-filters-panel
          className="report-filters-sheet fixed inset-x-0 bottom-0 z-[81] flex max-h-[85dvh] flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900"
        >
          {/* Drag the top of the sheet down to close it. */}
          <div
            className="shrink-0 touch-none"
            onTouchStart={(event) => { dragFrom.current = event.touches[0].clientY; }}
            onTouchMove={(event) => {
              if (dragFrom.current == null || !sheetRef.current) return;
              const drop = Math.max(0, event.touches[0].clientY - dragFrom.current);
              sheetRef.current.style.transform = `translateY(${drop}px)`;
            }}
            onTouchEnd={(event) => {
              const drop = dragFrom.current == null ? 0 : event.changedTouches[0].clientY - dragFrom.current;
              dragFrom.current = null;
              if (sheetRef.current) sheetRef.current.style.transform = '';
              if (drop > 80) close();
            }}
          >
            <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden />
            {header}
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-5 pb-5">
            {props.hideDate ? capYear : (
              <div>
                <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">{props.dateRangeLabel ?? 'Date Range'}</p>
                <div className="flex flex-wrap gap-2">
                  {SHEET_PRESETS.map((id) => {
                    const item = DATE_PRESETS.find((preset) => preset.id === id);
                    if (!item) return null;
                    const active = props.preset === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => (id === 'custom' ? props.onRange(props.range) : props.onPreset(id))}
                        className={`h-9 cursor-pointer rounded-full px-3.5 text-sm font-medium transition ${active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
                {props.preset !== 'custom' ? <p className="mt-2 text-xs tabular-nums text-slate-500 dark:text-slate-400">{formatFilterSpan(props.range)}</p> : null}
              </div>
            )}
            {customDates}
            {controls}
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 dark:border-slate-800">
            {resetButton ?? <span />}
            <button type="button" onClick={close} className="h-10 cursor-pointer rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white transition hover:bg-brand-700">{resultLabel}</button>
          </div>
        </div>
      )}
    </FiltersInPanel.Provider>,
    document.body,
  );

  return (
    <>
      {bar}
      {panel}
    </>
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
    case 'net-commission-income':
      return (status === 'closed' || status === 'pending') && inRange(deal.closingDate, range);
    case 'team-caps':
      return status === 'closed' || status === 'pending';
    // Every listing-side deal listed in the range, cancelled ones too.
    case 'listings-by-list-date':
      return isListingSide(deal.side) && inRange(deal.listDate, range);
    case 'price-change':
      return isListingSide(deal.side) && (status === 'closed' || status === 'pending') && inRange(deal.closingDate, range);
    // Every status, cancelled too, by closing date; pending deals also by acceptance date.
    case 'transaction-list':
    case 'transaction-map':
      return inRange(deal.closingDate, range) || pending;
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

function earningPeriodLabel(periodKey: string | null, preset: RangePreset, range: DateRange): string {
  if (!periodKey) {
    const name = DATE_PRESETS.find((item) => item.id === preset)?.label || 'Custom';
    return `${name} (${formatFilterSpan(range)})`;
  }
  const [year, month, day] = periodKey.split('-').map(Number);
  const date = new Date(year || 1970, (month || 1) - 1, day || 1);
  if (day) return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
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
  const listRef = useRef<HTMLDivElement>(null);
  useDropdownScrollLock(listRef, open);
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
      if (ref.current?.contains(event.target as Node)) return;
      swallowOutsideFilters(event.target);
      setOpen(false);
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
        className="cursor-pointer appearance-none whitespace-nowrap border-0 bg-transparent p-0 text-3xl max-md:text-xl font-extrabold leading-tight tracking-tight text-emerald-600 shadow-none [-webkit-tap-highlight-color:transparent] [outline:none] hover:text-emerald-700 focus:[outline:none] focus-visible:[outline:none] dark:text-emerald-400 dark:hover:text-emerald-300"
      >
        {selected.label}
      </button>
      {open ? (
        <div ref={listRef} role="listbox" aria-label="Metric" className="absolute left-0 top-full z-50 mt-2 max-h-[min(36rem,calc(100dvh-14rem))] w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 text-sm font-medium normal-case tracking-normal text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {options.length > 8 ? (
            <div className="sticky -top-1 z-10 bg-white px-1 py-1 dark:bg-slate-900">
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

function TitleCaps({ options, picked, onChange }: {
  options: CapMenuChoice[];
  picked: string[] | null;
  onChange: (value: string[] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useDropdownScrollLock(listRef, open);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLSpanElement>(null);
  const selected = options.find((option) => option.value === picked?.[0]) || options[0];
  const needle = query.trim().toLowerCase();
  const visible = options.filter((option) => option.label.toLowerCase().includes(needle));
  const groups = [
    { id: 'team' as const, label: 'Team Caps', options: visible.filter((option) => option.group === 'team') },
    { id: 'agent' as const, label: 'Agent Caps', options: visible.filter((option) => option.group === 'agent') },
  ].filter((group) => group.options.length > 0);
  const choose = (id: string) => {
    onChange(options[0]?.value === id ? null : [id]);
    setOpen(false);
    setQuery('');
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      swallowOutsideFilters(event.target);
      setOpen(false);
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
    <span ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Cap ${selected?.label || 'Caps'}`}
        onClick={() => setOpen((current) => !current)}
        className="cursor-pointer appearance-none border-0 bg-transparent p-0 text-3xl max-md:text-xl font-extrabold leading-tight tracking-tight text-emerald-600 shadow-none [-webkit-tap-highlight-color:transparent] [outline:none] hover:text-emerald-700 focus:[outline:none] focus-visible:[outline:none] dark:text-emerald-400 dark:hover:text-emerald-300"
      >
        {selected?.label || 'Caps'}
      </button>
      {open ? (
        <div ref={listRef} role="listbox" aria-label="Cap" className="absolute left-1/2 top-full z-50 mt-2 max-h-[min(36rem,calc(100dvh-14rem))] w-72 -translate-x-1/2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 text-sm font-medium normal-case tracking-normal text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          <div className="sticky -top-1 z-10 bg-white px-1 py-1 dark:bg-slate-900">
            <div className="flex justify-end">
              <button type="button" onClick={() => { if (options[0]) choose(options[0].value); }} className="cursor-pointer rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Reset</button>
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
          {groups.length === 0 ? <p className="px-2 py-2 text-xs text-slate-400">No matches</p> : groups.map((group, index) => (
            <div key={group.id} className={index > 0 ? 'mt-1 border-t border-slate-200 pt-1 dark:border-slate-700' : undefined}>
              <div className="px-2 py-1 text-xs font-medium text-slate-400">{group.label}</div>
              {group.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === selected?.value}
                  onClick={() => choose(option.value)}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${option.value === selected?.value ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200' : ''}`}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-400">{option.count.toLocaleString()}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </span>
  );
}

function maskDate(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  const month = digits.slice(0, 2);
  const day = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  if (digits.length > 4) return `${month}/${day}/${year}`;
  if (digits.length > 2) return `${month}/${day}`;
  return month;
}

function displayToIso(display: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${match[3]}-${match[1]}-${match[2]}`;
}

function isoToDisplay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : '';
}

function CustomDateField({ label, value, onChange }: { label: string; value: string; onChange: (iso: string) => void }) {
  const [text, setText] = useState(() => isoToDisplay(value));
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setText(isoToDisplay(value));
  }, [value]);
  return (
    <Field label={label}>
      <span className={`${underlineShell} inline-flex w-[9.5rem] items-center gap-1 pr-1`}>
        <input
          value={text}
          inputMode="numeric"
          placeholder="MM/DD/YYYY"
          aria-label={label}
          maxLength={10}
          onChange={(event) => {
            const next = maskDate(event.target.value);
            setText(next);
            const iso = displayToIso(next);
            if (iso) onChange(iso);
          }}
          onBlur={() => {
            if (!displayToIso(text)) setText(isoToDisplay(value));
          }}
          className={`${underlineControl} min-w-0 flex-1 cursor-text normal-case tracking-normal`}
        />
        <button
          type="button"
          aria-label={`${label} calendar`}
          onClick={() => {
            const node = picker.current;
            if (!node) return;
            try {
              node.showPicker();
            } catch {
              node.click();
            }
          }}
          className="cursor-pointer text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <Calendar className="h-4 w-4" aria-hidden="true" />
        </button>
        <input
          ref={picker}
          type="date"
          tabIndex={-1}
          value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''}
          min="1000-01-01"
          max="9999-12-31"
          onChange={(event) => {
            if (event.target.value) onChange(event.target.value);
          }}
          className="sr-only"
        />
      </span>
    </Field>
  );
}

/** Below md, shifts an open dropdown left and caps its width so it stays on screen. Desktop is untouched. */
function useViewportClamp(ref: React.RefObject<HTMLDivElement | null>, open: boolean) {
  const isDesktop = useIsDesktop();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || isDesktop || !el) return;
    // clientWidth, not innerWidth: on phones an overflowing menu widens innerWidth.
    const gutter = 8;
    const viewport = document.documentElement.clientWidth;
    el.style.maxWidth = `${viewport - gutter * 2}px`;
    const rect = el.getBoundingClientRect();
    const over = rect.right - (viewport - gutter);
    if (over > 0) el.style.left = `${-Math.min(over, Math.max(0, rect.left - gutter))}px`;
    return () => {
      el.style.left = '';
      el.style.maxWidth = '';
    };
  }, [ref, open, isDesktop]);
  useDropdownScrollLock(ref, open);
}

/**
 * While a dropdown is open, wheel and touch scrolling move only that dropdown, never the report behind it.
 * A list too short to scroll swallows the gesture as well.
 */
function useDropdownScrollLock(ref: React.RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    if (!open) return;
    const list = ref.current;
    const previous = list?.style.overscrollBehavior ?? '';
    if (list) list.style.overscrollBehavior = 'contain';
    const onScrollGesture = (event: Event) => {
      const el = ref.current;
      if (el && event.target instanceof Node && el.contains(event.target) && el.scrollHeight > el.clientHeight + 1) return;
      if (event instanceof WheelEvent && event.ctrlKey) return;
      event.preventDefault();
      // Keeps the locked report layouts from forwarding this wheel to their tables.
      event.stopPropagation();
    };
    document.addEventListener('wheel', onScrollGesture, { passive: false });
    document.addEventListener('touchmove', onScrollGesture, { passive: false });
    return () => {
      document.removeEventListener('wheel', onScrollGesture);
      document.removeEventListener('touchmove', onScrollGesture);
      if (list) list.style.overscrollBehavior = previous;
    };
  }, [ref, open]);
}

function ChoiceFilter({ label, note, value, options, onChange, compact = false }: {
  label: string;
  note?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  /** A one-line pill for the report title row, its list opening to the left. */
  compact?: boolean;
}) {
  const inPanel = React.useContext(FiltersInPanel);
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useViewportClamp(listRef, open && !inPanel);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  const visible = options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()));
  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery('');
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      swallowOutsideFilters(event.target);
      setOpen(false);
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
    <div ref={ref} className={compact ? 'relative' : `relative ${filterLabel} max-md:min-w-0`}>
      {compact ? (
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="listbox"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((current) => !current)}
          className={headerPill}
        >
          <span className="text-slate-400">{label}</span>
          <span>{selected?.label || ''}</span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" strokeWidth={2.25} aria-hidden />
        </button>
      ) : (
        <>
      <span className="inline-flex items-center gap-1">
        {label}
        {note ? <ScoreNote label={label} text={note} className="relative inline-flex" align="left" /> : null}
      </span>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
        className={`${underlineShell} w-max max-w-full min-w-[9rem] cursor-pointer !pr-7 text-left max-md:w-full max-md:min-w-0 ${inPanel ? '!w-full' : ''}`}
      >
        <span className={`${underlineControl} !inline-flex !w-auto items-center normal-case tracking-normal max-md:text-sm`}>{selected?.label || ''}</span>
        <FieldChevron />
      </button>
        </>
      )}
      {open ? (
        <div ref={listRef} role="listbox" aria-label={label} className={inPanel ? panelList : `${compact ? 'right-0' : 'left-0'} absolute top-full z-40 mt-1 max-h-[min(36rem,calc(100dvh-14rem))] w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 text-sm font-medium normal-case tracking-normal text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100`}>
          {options.length > 8 ? (
            <div className="sticky -top-1 z-10 bg-white px-1 py-1 dark:bg-slate-900">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          ) : null}
          {visible.length === 0 ? <p className="px-2 py-2 text-xs text-slate-400">No matches</p> : visible.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => choose(option.value)}
              className={`flex w-full cursor-pointer items-center rounded-md px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${option.value === value ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200' : ''}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DateRangeFilter({ preset, range, onPreset, onRange, label = 'Date Range', compact = false }: {
  preset: RangePreset;
  range: DateRange;
  onPreset: (preset: RangePreset) => void;
  onRange: (range: DateRange) => void;
  label?: string;
  /** A one-line pill for the report title row (the subtitle already shows the dates), its list opening to the left. */
  compact?: boolean;
}) {
  const inPanel = React.useContext(FiltersInPanel);
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useViewportClamp(listRef, open && !inPanel);
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
      if (ref.current?.contains(event.target as Node)) return;
      swallowOutsideFilters(event.target);
      setOpen(false);
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
    <div ref={ref} className={compact ? 'relative' : `relative ${filterLabel} max-md:col-span-2 max-md:min-w-0`}>
      {compact ? (
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="listbox"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((value) => !value)}
          title={`${label}: ${formatFilterSpan(range)}`}
          className={headerPill}
        >
          <Calendar className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden />
          <span className="hidden text-slate-400 xl:inline">{label.replace(/ Range$/, '')}</span>
          <span>{selected.label}</span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" strokeWidth={2.25} aria-hidden />
        </button>
      ) : (
        <>
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
        className={`${underlineShell} w-max max-w-full cursor-pointer !pr-7 text-left max-md:w-full ${inPanel ? '!w-full' : ''}`}
      >
        <span className={`${underlineControl} !inline-flex !w-auto items-center gap-2 normal-case tracking-normal max-md:!w-full max-md:whitespace-nowrap max-md:text-sm`}>
          <span className="max-md:shrink-0">{selected.label}</span>
          {preset !== 'custom' ? <span className="tabular-nums text-slate-400 dark:text-slate-500 max-md:min-w-0 max-md:truncate max-md:text-sm">{formatFilterSpan(range)}</span> : null}
        </span>
        <FieldChevron />
      </button>
        </>
      )}
      {open ? (
        <div ref={listRef} role="listbox" aria-label="Date Range" className={inPanel ? panelList : `${compact ? 'right-0' : 'left-0'} absolute top-full z-40 mt-1 max-h-[min(36rem,calc(100dvh-14rem))] w-80 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 text-sm font-medium normal-case tracking-normal text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100`}>
          {DATE_PRESETS.length > 8 ? (
            <div className="sticky -top-1 z-10 bg-white px-1 py-1 dark:bg-slate-900">
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
    'Primary Agent': 'primary agents',
    'Lead Source': 'lead sources',
    'Earnings Type': 'earnings types',
    Entity: 'entities',
    'Team Cap': 'team caps',
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
  const inPanel = React.useContext(FiltersInPanel);
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useViewportClamp(listRef, open && !inPanel);
  const [query, setQuery] = useState('');
  // Touch has no hover, so tapping the right side of an option reveals its ONLY button.
  const touch = useIsTouch();
  const [onlyArmed, setOnlyArmed] = useState<string | null>(null);
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
    if (!open) setOnlyArmed(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      swallowOutsideFilters(event.target);
      setOpen(false);
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
    <div ref={ref} className={`relative ${filterLabel} max-md:min-w-0`}>
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
        className={`${underlineShell} min-w-[9rem] max-w-[24rem] cursor-pointer !pr-7 text-left max-md:min-w-0 max-md:max-w-full ${inPanel ? '!w-full !max-w-none' : ''} ${options.length > 0 && selectedLabels.length === 0 ? '!border-b-amber-500 !bg-amber-50 dark:!border-b-amber-400 dark:!bg-amber-950' : ''}`}
        title={summary}
      >
        <span className={`${underlineControl} block truncate normal-case tracking-normal max-md:text-sm ${options.length > 0 && selectedLabels.length === 0 ? '!text-amber-900 dark:!text-amber-100' : ''}`}>{summary}</span>
        <FieldChevron />
      </button>
      {open ? (
        <div ref={listRef} role="listbox" aria-label={label} aria-multiselectable="true" className={inPanel ? panelList : 'absolute left-0 top-full z-40 mt-1 max-h-[min(36rem,calc(100dvh-14rem))] w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 text-sm font-medium normal-case tracking-normal text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'}>
          <div className="sticky -top-1 z-10 bg-white px-1 py-1 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => commit(values)} className="cursor-pointer rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950">Select All</button>
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
          {visible.length === 0 ? <p className="px-2 py-2 text-xs text-slate-400">No matches</p> : visible.map((option) => {
            const armed = touch && onlyArmed === option.value;
            // On touch the checkbox and the name toggle the value; the rest of the row arms ONLY.
            const toggleOnTouch = (event: React.MouseEvent) => {
              event.stopPropagation();
              setOnlyArmed(null);
              toggle(option.value);
            };
            return (
            <div
              key={option.value}
              className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 ${armed ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
              onClick={() => (touch ? setOnlyArmed(armed ? null : option.value) : toggle(option.value))}
            >
              {touch ? (
                <>
                  <input type="checkbox" readOnly checked={chosen(option.value)} className="cursor-pointer" onClick={toggleOnTouch} />
                  <span className="min-w-0 truncate" onClick={toggleOnTouch}>{option.label}</span>
                  <span className="flex-1 self-stretch" aria-hidden />
                </>
              ) : (
                <>
                  <input type="checkbox" readOnly checked={chosen(option.value)} className="pointer-events-none cursor-pointer" />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                </>
              )}
              <span className="relative shrink-0">
                <span className={`block min-w-[4.5rem] text-right text-xs tabular-nums text-slate-400 group-hover:opacity-0 ${armed ? 'opacity-0' : ''}`}>{option.count.toLocaleString()}</span>
                <button
                  type="button"
                  className={`absolute inset-0 cursor-pointer items-center justify-end group-hover:flex ${armed ? 'flex' : 'hidden'}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setOnlyArmed(null);
                    onChange([option.value]);
                  }}
                >
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-2xs font-bold leading-none tracking-wide text-brand-800 ring-1 ring-brand-200 hover:bg-brand-200 dark:bg-brand-900 dark:text-brand-100 dark:ring-brand-700 dark:hover:bg-brand-800">ONLY</span>
                </button>
              </span>
            </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const filterLabel = 'flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400';

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <label className={`cursor-pointer ${filterLabel}`}>
      <span className="inline-flex items-center gap-1">
        {label}
        {note ? <ScoreNote label={label} text={note} className="relative inline-flex" align="left" /> : null}
      </span>
      {children}
    </label>
  );
}

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
  statusPicked: string[] | null;
  cumulative: boolean;
  preset: RangePreset;
  capSections: Array<{ cap: TeamCapDefinition; rows: CapStanding[]; count: number }>;
  agentFieldLabels: Map<string, string>;
  capAsOf: string;
  capYearOffset: number;
  capOpen: { capId: string; agentId: string } | null;
  onCapOpen: (value: { capId: string; agentId: string } | null) => void;
  capShowPaid: boolean;
  onCapShowPaid: (value: boolean) => void;
  capEmpty: string;
}) {
  const { id, closed, pending, taken, closedPrior, pendingPrior, names, range, priorRange, metric, netCommission, priorNetCommission, allDeals, deals, payments, entityNames, teamLeadIds, boardField, payeePicked, excludeTeamLeads, dateBasis, sidePicked, cumulative, preset } = props;
  const closing = seriesBuckets(closed, (deal) => deal.closingDate, range);
  const closingPrior = seriesBuckets(closedPrior, (deal) => deal.closingDate, priorRange);
  if (id === 'team-caps') {
    return (
      <TeamCapsReport
        sections={props.capSections}
        open={props.capOpen}
        onOpen={props.onCapOpen}
        showPaid={props.capShowPaid}
        empty={props.capEmpty}
      />
    );
  }
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
        preset={preset}
        names={names}
      />
    );
  }
  if (id === 'team-performance') return <TeamPerformance deals={deals} range={range} priorRange={priorRange} dateBasis={dateBasis} sidePicked={sidePicked} statusPicked={props.statusPicked} cumulative={cumulative} />;
  if (id === 'net-commission-income') return <AgentEarnings deals={deals} payments={payments} names={names} range={range} priorRange={priorRange} excludeTeamLeads={excludeTeamLeads} teamLeadIds={teamLeadIds} payeePicked={payeePicked} preset={preset} />;
  if (id === 'team-productivity') {
    return (
      <div className="space-y-3">
        <LineChart title={METRICS.find((item) => item.id === metric)?.label || 'Metric'} metric={metric} current={closing} previous={closingPrior} />
        <AgentTable rows={byAgent(closed, names)} caption="Closed transactions" />
      </div>
    );
  }
  if (id === 'net-agent-leaderboard') return <AgentTable rows={agentPaidRows(closed)} caption="Closed transactions, split across the agents on each deal" paid />;
  if (id === 'lead-source-leaderboard') return <ProductionLeaderboard deals={deals} range={range} priorRange={priorRange} field={boardField} names={names} payments={payments} entityNames={entityNames} payeePicked={payeePicked} excludeTeamLeads={excludeTeamLeads} teamLeadIds={teamLeadIds} dateBasis={dateBasis} />;
  if (id === 'listings-by-list-date') return <ListingsReport deals={deals.filter((deal) => dealInReport(deal, range, id))} names={names} />;
  if (id === 'transaction-list') return <TransactionListReport deals={deals.filter((deal) => dealInReport(deal, range, id))} names={names} />;
  if (id === 'transaction-map') return <TransactionMapReport deals={deals.filter((deal) => dealInReport(deal, range, 'transaction-map'))} names={names} />;
  if (id === 'price-change') {
    return (
      <PriceChangeReport
        deals={priceChangeDeals(deals, range, isListingSide)}
        priorDeals={priceChangeDeals(deals, priorRange, isListingSide)}
        names={names}
        range={range}
      />
    );
  }
  if (id === 'daily-management') return <DailyManagement range={range} closed={closed} pending={pending} taken={taken} />;
  return null;
}

const PRODUCTION_GRAINS: Array<{ id: ProductionGrain; label: string }> = [
  { id: 'day', label: 'Day-by-Day Production' },
  { id: 'week', label: 'Week-by-Week Production' },
  { id: 'month', label: 'Month-over-Month Production' },
];

function ProductionGrainTitle({ grain, enabled, onChange }: { grain: ProductionGrain; enabled: boolean; onChange: (grain: ProductionGrain) => void }) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useDropdownScrollLock(menuRef, open);
  const selected = PRODUCTION_GRAINS.find((option) => option.id === grain) || PRODUCTION_GRAINS[0];

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) setBox({ top: rect.bottom + 8, left: rect.left + rect.width / 2 });
    };
    place();
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      swallowOutsideFilters(event.target);
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!enabled) return selected.label;

  const choose = (id: ProductionGrain) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Production ${selected.label}`}
        onClick={() => setOpen((current) => !current)}
        className="cursor-pointer border-0 bg-transparent p-0 font-inherit text-inherit [-webkit-tap-highlight-color:transparent] [outline:none] hover:opacity-80 focus:[outline:none] focus-visible:[outline:none]"
      >
        {selected.label}
      </button>
      {open && box ? createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Production"
          className="w-max rounded-lg border border-slate-200 bg-white p-1 text-left text-sm font-medium normal-case tracking-normal text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          style={{ position: 'fixed', top: box.top, left: box.left, transform: 'translateX(-50%)', zIndex: 80 }}
        >
          {PRODUCTION_GRAINS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.id === grain}
              onClick={() => choose(option.id)}
              className={`block w-full cursor-pointer whitespace-nowrap rounded-md px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${option.id === grain ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200' : ''}`}
            >
              {option.label}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </>
  );
}

const DRILLDOWN_METRIC_LABELS: Partial<Record<keyof OwnerMonthRow, string>> = {
  closedUnits: 'Closed Units',
  closedVolume: 'Closed Volume',
  closedCommission: 'Closed Total Commission',
  closedNet: 'Closed Net Commission',
  listingsTaken: 'Listings Taken',
  listingsPended: 'Listings Pended',
  listingsClosed: 'Listings Closed',
  buyersPended: 'Buyers Pended',
  buyersClosed: 'Buyers Closed',
  pendingUnits: 'Pending Units',
  pendingVolume: 'Pending Volume',
  pendingCommission: 'Pending Total Commission',
  pendingNet: 'Pending Net Commission',
};

function OwnerSummary({ closed, closedPrior, net, priorNet, deals, payments, teamLeadIds, range, preset, names }: {
  closed: ReportDeal[];
  closedPrior: ReportDeal[];
  net: number;
  priorNet: number;
  deals: ReportDeal[];
  payments: ReportPayment[];
  teamLeadIds: Set<string>;
  range: DateRange;
  preset: RangePreset;
  names: Map<string, string>;
}) {
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [drilldown, setDrilldown] = useState<{ rowKey: string; column: keyof OwnerMonthRow } | null>(null);
  const [grainChoice, setGrainChoice] = useState<ProductionGrain | null>(null);
  const [scoresOpen, setScoresOpen] = useState(true);
  const fitsScreen = useFitsScreen();
  const [pulse, setPulse] = useState(0);
  const skipPulse = useRef(true);
  const grain = resolveProductionGrain(grainChoice, preset, range);
  const weekChoice = weekGrainAllowed(preset, range);

  useEffect(() => {
    setMonthKey(null);
    setDrilldown(null);
  }, [range.start, range.end, grain]);

  useEffect(() => {
    if (!scoresOpen) return;
    const chromeLimit = () => {
      const main = document.querySelector('main');
      const raw = main ? Number.parseFloat(getComputedStyle(main).getPropertyValue('--report-chrome-bottom')) : Number.NaN;
      if (Number.isFinite(raw) && raw > 0) return raw;
      const chrome = document.querySelector('main .sticky');
      return chrome ? chrome.getBoundingClientRect().bottom : 0;
    };
    let locking = false;
    const clamp = () => {
      if (locking) return;
      const block = document.querySelector<HTMLElement>('[data-production-block]');
      const page = document.scrollingElement;
      if (!block || !page) return;
      const limit = chromeLimit();
      const top = block.getBoundingClientRect().top;
      if (top >= limit - 0.5) return;
      locking = true;
      page.scrollTop -= limit - top;
      locking = false;
    };
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const block = document.querySelector<HTMLElement>('[data-production-block]');
      const scroller = block?.querySelector<HTMLElement>('[data-production-fit]');
      const page = document.scrollingElement;
      if (!block || !scroller || !page) return;
      const limit = chromeLimit();
      const top = block.getBoundingClientRect().top;
      const pixelDelta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * window.innerHeight : event.deltaY;
      if (pixelDelta > 0 && top > limit + 0.5) {
        const room = top - limit;
        if (pixelDelta <= room + 0.5) return;
        locking = true;
        page.scrollTop += room;
        locking = false;
        scroller.scrollTop += pixelDelta - room;
        event.preventDefault();
        return;
      }
      if (top > limit + 1) return;
      const atTop = scroller.scrollTop <= 0;
      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
      if (pixelDelta < 0 && atTop) return;
      if (event.target instanceof Node && scroller.contains(event.target)) {
        if (pixelDelta > 0 && atBottom) event.preventDefault();
        return;
      }
      let node = event.target instanceof Element ? event.target : null;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) return;
        node = node.parentElement;
      }
      scroller.scrollTop += pixelDelta;
      event.preventDefault();
    };
    window.addEventListener('scroll', clamp, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('scroll', clamp);
      window.removeEventListener('wheel', onWheel);
    };
  }, [scoresOpen]);

  // Below md, or on a short screen, the page keeps native scrolling; the wheel-only lock needs a tall desktop screen.
  useEffect(() => {
    if (scoresOpen || !fitsScreen) return;
    const previousHtml = document.documentElement.style.overflow;
    const previousBody = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.scrollingElement?.scrollTo(0, 0);
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const scroller = document.querySelector<HTMLElement>('[data-production-fit]');
      if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 1) return;
      if (event.target instanceof Node && scroller.contains(event.target)) return;
      let node = event.target instanceof Element ? event.target : null;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) return;
        node = node.parentElement;
      }
      scroller.scrollTop += event.deltaY;
      event.preventDefault();
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      document.documentElement.style.overflow = previousHtml;
      document.body.style.overflow = previousBody;
      window.removeEventListener('wheel', onWheel);
    };
  }, [scoresOpen, fitsScreen]);

  useEffect(() => {
    if (skipPulse.current) {
      skipPulse.current = false;
      return;
    }
    setPulse((value) => value + 1);
  }, [monthKey]);

  const selectMonth = (key: string) => {
    if (drilldown) {
      setDrilldown(null);
      setScoresOpen(true);
      setMonthKey(key === 'total' ? null : key);
      return;
    }
    setScoresOpen(true);
    setMonthKey((current) => (key === 'total' || current === key ? null : key));
  };

  const shownClosed = monthKey ? closed.filter((deal) => deal.closingDate && productionKeyMatches(deal.closingDate, monthKey)) : closed;
  const shownPrior = monthKey ? closedPrior.filter((deal) => deal.closingDate && productionKeyMatches(deal.closingDate, priorProductionKey(monthKey))) : closedPrior;
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
  const months = ownerMonthTable(deals, payments, teamLeadIds, range, grain);
  const periodWord = grain === 'day' ? 'day' : grain === 'week' ? 'week' : 'month';
  const periodLabel = grain === 'day' ? 'Day' : grain === 'week' ? 'Week' : 'Month';
  const monthLabel = monthKey ? formatProductionKey(monthKey) : '';
  const priorLabel = monthKey ? formatProductionKey(priorProductionKey(monthKey)) : '';
  const handleDrilldown = (rowKey: string, column: keyof OwnerMonthRow) => {
    if (drilldown?.rowKey === rowKey && drilldown?.column === column) {
      setDrilldown(null);
      return;
    }
    setDrilldown({ rowKey, column });
    setScoresOpen(false);
  };

  const drilldownItems = drilldown
    ? ownerProductionTransactions(deals, payments, teamLeadIds, range, grain, drilldown.rowKey, drilldown.column)
    : [];

  const drilldownRowLabel = drilldown
    ? (drilldown.rowKey === 'total' ? 'Total' : months.find((m) => m.key === drilldown.rowKey)?.label || drilldown.rowKey)
    : '';

  return (
    <div
      className={scoresOpen ? 'space-y-10' : `space-y-4 ${reportCanvas}`}
      style={scoresOpen ? undefined : { marginTop: '-1rem' }}
    >
      {monthKey ? (
        <p className="!mb-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
          Showing {monthLabel}, compared with {priorLabel}. Click the {periodWord} again to restore the full range.
        </p>
      ) : null}
      {scoresOpen ? (
      <>
      <div className="flex flex-wrap items-stretch gap-6">
        <div className="min-w-[min(100%,18rem)] flex-1 basis-[24rem] space-y-3">
          <SectionHeading>Closed Net Commission Income to Owner(s)</SectionHeading>
          <div className="grid w-full items-stretch gap-2 [&>span]:self-center grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
            <Score pulse={pulse} label="Total Commission" amount={totalCommission} changeAmount={totalCommission - priorCommission} />
            <span className="text-lg font-semibold text-emerald-600/70 dark:text-emerald-400/80">−</span>
            <Score pulse={pulse} label="Cost of Sales" amount={costOfSales} changeAmount={costOfSales - priorCost} />
            <span className="text-lg font-semibold text-emerald-600/70 dark:text-emerald-400/80">=</span>
            <Score pulse={pulse} label="Net Commission Income" amount={shownNet} changeAmount={shownNet - shownPriorNet} tone="result" />
          </div>
        </div>
        <div className="min-w-[min(100%,18rem)] flex-1 basis-[24rem] space-y-3">
          <SectionHeading>Closed Net Income to Owner(s)</SectionHeading>
          <div className="grid w-full items-stretch gap-2 [&>span]:self-center grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
            <Score pulse={pulse} label="Net Commission Income" amount={shownNet} changeAmount={shownNet - shownPriorNet} />
            <span className="text-lg font-semibold text-emerald-600/70 dark:text-emerald-400/80">−</span>
            <Score pulse={pulse} label="Operating Expenses" amount={operatingExpenses} change="—" />
            <span className="text-lg font-semibold text-emerald-600/70 dark:text-emerald-400/80">=</span>
            <Score pulse={pulse} label="Net Income" amount={netIncome} changeAmount={netIncome - priorIncome} tone="result" />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-stretch gap-6">
        <div className="min-w-[min(100%,18rem)] flex-1 basis-[24rem] space-y-3">
          <SectionHeading tone="slate">Return on Investment (ROI)</SectionHeading>
          <div className="grid w-full items-stretch gap-2 [&>span]:self-center grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
            <Score pulse={pulse} label="Net Income" amount={netIncome} changeAmount={netIncome - priorIncome} />
            <span className="text-lg font-semibold text-emerald-600/70 dark:text-emerald-400/80">/</span>
            <Score pulse={pulse} label="Operating Expenses" amount={operatingExpenses} change="—" />
            <span className="text-lg font-semibold text-emerald-600/70 dark:text-emerald-400/80">=</span>
            <Score pulse={pulse} label="ROI" value={percent(netIncome, operatingExpenses)} change="—" tone="result" />
          </div>
        </div>
        <div className="min-w-[min(100%,18rem)] flex-1 basis-[24rem] space-y-3">
          <SectionHeading tone="slate">Net Income to Total Commission Ratio (NI/TC)</SectionHeading>
          <div className="grid w-full items-stretch gap-2 [&>span]:self-center grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
            <Score pulse={pulse} label="Net Income" amount={netIncome} changeAmount={netIncome - priorIncome} />
            <span className="text-lg font-semibold text-emerald-600/70 dark:text-emerald-400/80">/</span>
            <Score pulse={pulse} label="Total Commission" amount={totalCommission} changeAmount={totalCommission - priorCommission} />
            <span className="text-lg font-semibold text-emerald-600/70 dark:text-emerald-400/80">=</span>
            <Score pulse={pulse} label="NI/TC" value={percent(netIncome, totalCommission)} change={signedRatioChange(netIncome, priorIncome, totalCommission, priorCommission)} tone="result" />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-stretch gap-6">
        <div className="min-w-[min(100%,18rem)] flex-1 basis-[24rem] space-y-3">
          <SectionHeading tone="listing">Average Listing Metrics</SectionHeading>
          <div className="grid w-full items-stretch gap-2 [&>span]:self-center grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
            <Score pulse={pulse} label="Avg. Sales Price" tone="listing" {...averageFigures(sellerTotals.volume, sellerTotals.units, priorSellerTotals.volume, priorSellerTotals.units)} />
            <span className="invisible text-lg font-semibold" aria-hidden="true">−</span>
            <Score pulse={pulse} label="Avg. GCI" tone="listing" {...averageFigures(sellerTotals.gci, sellerTotals.units, priorSellerTotals.gci, priorSellerTotals.units)} />
            <span className="invisible text-lg font-semibold" aria-hidden="true">=</span>
            <Score pulse={pulse} label="Avg. GCI %" tone="listing" value={percent(sellerTotals.gci, sellerTotals.volume)} change={signedRatioChange(sellerTotals.gci, priorSellerTotals.gci, sellerTotals.volume, priorSellerTotals.volume)} />
          </div>
        </div>
        <div className="min-w-[min(100%,18rem)] flex-1 basis-[24rem] space-y-3">
          <SectionHeading tone="buyer">Average Buyer Metrics</SectionHeading>
          <div className="grid w-full items-stretch gap-2 [&>span]:self-center grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
            <Score pulse={pulse} label="Avg. Sales Price" tone="buyer" {...averageFigures(buyerTotals.volume, buyerTotals.units, priorBuyerTotals.volume, priorBuyerTotals.units)} />
            <span className="invisible text-lg font-semibold" aria-hidden="true">−</span>
            <Score pulse={pulse} label="Avg. GCI" tone="buyer" {...averageFigures(buyerTotals.gci, buyerTotals.units, priorBuyerTotals.gci, priorBuyerTotals.units)} />
            <span className="invisible text-lg font-semibold" aria-hidden="true">=</span>
            <Score pulse={pulse} label="Avg. GCI %" tone="buyer" value={percent(buyerTotals.gci, buyerTotals.volume)} change={signedRatioChange(buyerTotals.gci, priorBuyerTotals.gci, buyerTotals.volume, priorBuyerTotals.volume)} />
          </div>
        </div>
      </div>
      </>
      ) : null}
      <div
        data-production-block=""
        className={`flex min-h-0 flex-col overflow-hidden ${reportCanvas} ${drilldown ? 'flex-1' : ''}`}
        style={drilldown ? { height: 'calc(100dvh - var(--report-chrome-bottom, 0px) - 0.75rem)' } : { maxHeight: 'calc(100dvh - var(--report-chrome-bottom, 0px) - 0.75rem)' }}
      >
        <div data-production-heading="" className="relative z-30 shrink-0 bg-slate-100 pb-3 dark:bg-slate-950">
        <SectionHeading
          tone="slate"
          action={drilldown ? (
            <button
              type="button"
              onClick={() => {
                setDrilldown(null);
                setScoresOpen(true);
              }}
              className="all-agents-enter inline-flex h-full cursor-pointer items-center gap-1.5 rounded-l-full bg-black/5 dark:bg-white/10 px-4 text-xs font-semibold normal-case tracking-normal text-inherit transition-colors duration-150 hover:bg-slate-300/70 hover:text-slate-900 dark:hover:bg-slate-700 dark:hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              {periodLabel === 'Day' ? 'All Days' : periodLabel === 'Week' ? 'All Weeks' : 'All Months'}
            </button>
          ) : undefined}
          end={(
            <button
              type="button"
              aria-expanded={scoresOpen}
              aria-label={scoresOpen ? 'Hide Scorecards' : 'Show Scorecards'}
              title={scoresOpen ? 'Hide Scorecards' : 'Show Scorecards'}
              onClick={() => setScoresOpen((open) => !open)}
              className="all-agents-enter-right inline-flex h-full cursor-pointer items-center justify-center rounded-r-full bg-black/5 dark:bg-white/10 px-4 text-inherit transition-colors duration-150 hover:bg-slate-300/70 hover:text-slate-900 dark:hover:bg-slate-700 dark:hover:text-white"
            >
              {scoresOpen ? <ChevronUp className="h-4 w-4" strokeWidth={2.5} aria-hidden /> : <ChevronDown className="h-4 w-4" strokeWidth={2.5} aria-hidden />}
            </button>
          )}
        >
          <ProductionGrainTitle
            grain={grain}
            enabled={weekChoice}
            onChange={(next) => setGrainChoice(next)}
          />
        </SectionHeading>
        </div>
        <div className={drilldown ? 'shrink-0' : 'flex min-h-0 flex-col overflow-hidden'}>
          <MonthTable
            rows={months}
            selectedMonth={monthKey}
            onSelectMonth={selectMonth}
            periodLabel={periodLabel}
            pinTotal={!drilldown}
            drilldown={drilldown}
            onDrilldown={handleDrilldown}
          />
        </div>
        {drilldown ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2 pt-2 overflow-hidden">
            <p className="shrink-0 text-sm font-medium text-slate-700 dark:text-slate-300">
              {drilldownRowLabel} · {DRILLDOWN_METRIC_LABELS[drilldown.column] || drilldown.column} ({drilldownItems.length} {drilldownItems.length === 1 ? 'transaction' : 'transactions'})
            </p>
            <ProductionDrilldownTable
              items={drilldownItems}
              metric={drilldown.column}
              names={names}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

type TrendMetric = 'volume' | 'gci' | 'units' | 'rate' | 'price' | 'team';



function roundedTopBar(x: number, y: number, barWidth: number, barHeight: number, radius: number): string {
  if (barHeight <= 0.5 || barWidth <= 0) return '';
  const curve = Math.min(radius, barWidth / 2, barHeight);
  const bottom = y + barHeight;
  return `M ${x} ${bottom} L ${x} ${y + curve} Q ${x} ${y} ${x + curve} ${y} L ${x + barWidth - curve} ${y} Q ${x + barWidth} ${y} ${x + barWidth} ${y + curve} L ${x + barWidth} ${bottom} Z`;
}


/**
 * The shiny peak effect from the Team Performance charts: a thin white copy of a line that only shows in
 * a soft glow around each local peak. Draw it right after the line it highlights.
 */
function PeakShine({ d, points, values, width, height }: { d: string; points: Array<{ x: number; y: number }>; values: number[]; width: number; height: number }) {
  const id = useId().replace(/:/g, '');
  const peaks = linePeaks(points, values.map(() => true), values);
  if (!peaks.length || !d) return null;
  return (
    <>
      <defs>
        <radialGradient id={`peak-fade-${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="white" />
          <stop offset="40%" stopColor="white" />
          <stop offset="100%" stopColor="black" />
        </radialGradient>
        <mask id={`peak-shine-${id}`}>
          <rect width={width} height={height} fill="black" />
          {peaks.map((peak, index) => (
            <circle key={`peak-mask-${index}`} cx={peak.x} cy={peak.y} r="26" fill={`url(#peak-fade-${id})`} />
          ))}
        </mask>
      </defs>
      <path d={d} fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.8" mask={`url(#peak-shine-${id})`} />
    </>
  );
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

function monthTitle(row: { key: string; label: string } | undefined): string {
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

function signedTrendCompact(value: number, metric: TrendMetric): string {
  return metric === 'units' || metric === 'rate' ? signedTrend(value, metric) : signedCompact(value);
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

/** Report color roles (report-requirements.mdc, Colors): emerald current period and Closed, amber Pending, grey prior year. */
const TREND_CURRENT = 'text-emerald-600 dark:text-emerald-400';
const TREND_PRIOR = 'text-[#b3bbc5] dark:text-slate-400';
const TREND_CLOSED = 'text-emerald-700 dark:text-emerald-300';
const TREND_PENDING = 'text-amber-600 dark:text-amber-400';

function TeamPerformance({ deals, range, priorRange, dateBasis, sidePicked, statusPicked, cumulative }: { deals: ReportDeal[]; range: DateRange; priorRange: DateRange; dateBasis: LeaderboardDate; sidePicked: string[] | null; statusPicked: string[] | null; cumulative: boolean }) {
  const [chosenStatus, setStatusFilter] = useState<'all' | 'closed' | 'pending'>('all');
  // A Status filter that keeps only Closed or only Pending selects that scorecard, and the charts follow it
  // (amber for Pending), the same as clicking the scorecard.
  const filterOnly = statusPicked?.length === 1 ? statusPicked[0].trim().toLowerCase() : null;
  const statusFilter = filterOnly === 'closed' || filterOnly === 'pending' ? filterOnly : chosenStatus;
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
      <TrendPanel metric="volume" title="Sales Volume" tone="emerald" currentClass={TREND_CURRENT} previousClass={TREND_PRIOR} accentClass={TREND_CLOSED} pendingClass={TREND_PENDING} cumulative={cumulative} {...panel} />
      <TrendPanel metric="gci" title="Gross Commission Income" tone="emerald" currentClass={TREND_CURRENT} previousClass={TREND_PRIOR} accentClass={TREND_CLOSED} pendingClass={TREND_PENDING} cumulative={cumulative} {...panel} />
      <TrendPanel metric="units" title="Units" tone="emerald" currentClass={TREND_CURRENT} previousClass={TREND_PRIOR} accentClass={TREND_CLOSED} pendingClass={TREND_PENDING} cumulative={cumulative} {...panel} />
      <TrendPanel metric="team" title="Team Commission" tone="emerald" currentClass={TREND_CURRENT} previousClass={TREND_PRIOR} accentClass={TREND_CLOSED} pendingClass={TREND_PENDING} cumulative={cumulative} {...panel} />
      <TrendPanel metric="price" title="Sales Price" tone="emerald" currentClass={TREND_CURRENT} previousClass={TREND_PRIOR} accentClass={TREND_CLOSED} pendingClass={TREND_PENDING} chart="bars" {...salePanel} />
      <TrendPanel metric="rate" title="Gross Commission Percentage" tone="emerald" currentClass={TREND_CURRENT} previousClass={TREND_PRIOR} accentClass={TREND_CLOSED} pendingClass={TREND_PENDING} chart="bars" {...salePanel} />
    </div>
  );
}

function TrendPanel({ metric, title, tone, currentClass, previousClass, accentClass, pendingClass, chart = 'line', cumulative = false, months, priorMonths, currentDeals, priorDeals, statusFilter, onSelectStatus, notice }: {
  metric: TrendMetric;
  title: string;
  tone: 'volume' | 'blue' | 'emerald' | 'units' | 'rate' | 'price' | 'team';
  currentClass: string;
  previousClass: string;
  accentClass: string;
  pendingClass: string;
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
  // While Pending is selected (by its scorecard or by a Pending-only Status filter) the current period draws in amber, the Pending status color; otherwise emerald.
  const chartProps = { metric, title, months, priorMonths, currentClass: statusFilter === 'pending' ? 'text-amber-500 dark:text-amber-400' : currentClass, previousClass };
  return (
    <section className={pairedSection}>
      <SectionHeading tone="slate" note={metric === 'team' ? 'Team commission is the commission left after off-the-top deductions and pre-splits are subtracted from total commission.' : undefined}>{title}</SectionHeading>
      {notice ? (
        <div className="flex min-h-[28rem] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-8 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          {notice}
        </div>
      ) : (
        <>
      <div className={pairedScores}>
        <TrendScore tone={tone} label="Total" amount={formatTrend(total, metric)} compactAmount={formatTrend(total, metric, true)} toneClass="" dollar={signedTrend(total - priorTotal, metric)} compactDollar={signedTrendCompact(total - priorTotal, metric)} percent={signedChangePercent(total, priorTotal)} current={total} prior={priorTotal} selected={statusFilter === 'all'} onSelect={() => onSelectStatus('all')} />
        <TrendScore tone={tone} label="Closed" amount={formatTrend(closed, metric)} compactAmount={formatTrend(closed, metric, true)} toneClass={accentClass} dollar={signedTrend(closed - priorClosed, metric)} compactDollar={signedTrendCompact(closed - priorClosed, metric)} percent={signedChangePercent(closed, priorClosed)} current={closed} prior={priorClosed} selected={statusFilter === 'closed'} onSelect={() => onSelectStatus('closed')} />
        <TrendScore tone={tone} label="Pending" amount={formatTrend(pending, metric)} compactAmount={formatTrend(pending, metric, true)} toneClass={pendingClass} selected={statusFilter === 'pending'} onSelect={() => onSelectStatus('pending')} />
      </div>
      {chart === 'bars' ? <PriceBars {...chartProps} /> : <TrendChart {...chartProps} cumulative={cumulative} />}
        </>
      )}
    </section>
  );
}

function metricEdge(label: string, tone: 'volume' | 'blue' | 'emerald' | 'units' | 'rate' | 'price' | 'team'): string {
  if (label === 'Total') return 'border-slate-900 ring-slate-900 dark:border-white dark:ring-white';
  if (label === 'Pending' && tone === 'emerald') return 'border-amber-500 ring-amber-500 dark:border-amber-400 dark:ring-amber-400';
  const closed = label !== 'Pending';
  if (tone === 'blue') return closed ? 'border-blue-800 ring-blue-800 dark:border-blue-200 dark:ring-blue-200' : 'border-blue-600 ring-blue-600 dark:border-blue-400 dark:ring-blue-400';
  if (tone === 'volume') return closed ? 'border-teal-700 ring-teal-700 dark:border-teal-200 dark:ring-teal-200' : 'border-teal-500 ring-teal-500 dark:border-teal-400 dark:ring-teal-400';
  if (tone === 'units') return closed ? 'border-purple-700 ring-purple-700 dark:border-purple-200 dark:ring-purple-200' : 'border-purple-500 ring-purple-500 dark:border-purple-400 dark:ring-purple-400';
  if (tone === 'rate') return closed ? 'border-sky-700 ring-sky-700 dark:border-sky-200 dark:ring-sky-200' : 'border-sky-500 ring-sky-500 dark:border-sky-400 dark:ring-sky-400';
  if (tone === 'price') return closed ? 'border-amber-700 ring-amber-700 dark:border-amber-200 dark:ring-amber-200' : 'border-amber-500 ring-amber-500 dark:border-amber-400 dark:ring-amber-400';
  if (tone === 'team') return closed ? 'border-rose-700 ring-rose-700 dark:border-rose-200 dark:ring-rose-200' : 'border-rose-500 ring-rose-500 dark:border-rose-400 dark:ring-rose-400';
  return closed ? 'border-emerald-700 ring-emerald-700 dark:border-emerald-200 dark:ring-emerald-200' : 'border-emerald-500 ring-emerald-500 dark:border-emerald-400 dark:ring-emerald-400';
}

function TrendScore({ tone, label, amount, compactAmount, toneClass, dollar, compactDollar, percent, current = 0, prior = 0, selected, onSelect }: {
  tone: 'volume' | 'blue' | 'emerald' | 'units' | 'rate' | 'price' | 'team';
  label: string;
  amount: string;
  /** Shorter amount for phones, used when the full one does not fit. */
  compactAmount?: string;
  toneClass: string;
  dollar?: string;
  /** Shorter change for phones. */
  compactDollar?: string;
  percent?: string;
  current?: number;
  prior?: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const selectedFill = tone === 'blue'
    ? 'bg-blue-50 dark:bg-blue-950/80'
    : tone === 'volume'
    ? 'bg-[#d7f6fa] dark:bg-teal-950/80'
    : tone === 'units'
      ? 'bg-[#f3e8ff] dark:bg-purple-950/80'
      : tone === 'rate'
        ? 'bg-sky-50 dark:bg-sky-950/80'
        : tone === 'price'
          ? 'bg-amber-50 dark:bg-amber-950/80'
          : tone === 'team'
            ? 'bg-rose-50 dark:bg-rose-950/80'
            : label === 'Pending'
              ? 'bg-amber-50 dark:bg-amber-950/60'
              : label === 'Total'
                ? 'bg-slate-50 dark:bg-slate-800/80'
                : 'bg-emerald-50 dark:bg-emerald-950/80';
  const focusClass = tone === 'blue' ? 'focus-visible:ring-blue-400' : tone === 'volume' ? 'focus-visible:ring-teal-400' : tone === 'units' ? 'focus-visible:ring-purple-400' : tone === 'rate' ? 'focus-visible:ring-sky-400' : tone === 'price' ? 'focus-visible:ring-amber-400' : tone === 'team' ? 'focus-visible:ring-rose-400' : 'focus-visible:ring-emerald-400';
  const isDesktop = useIsDesktop();
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      data-score-card
      className={`w-full min-w-0 cursor-pointer appearance-none rounded-xl border px-1.5 py-2 text-center md:px-3 shadow-sm [outline:none] focus-visible:ring-2 ${focusClass} ${selected ? `ring-2 ring-inset ${metricEdge(label, tone)} ${selectedFill}` : 'border-slate-200/90 bg-white/80 dark:border-slate-700 dark:bg-slate-900/80'}`}
    >
      <p className={`text-2xs font-medium md:text-sm ${toneClass || 'text-slate-500 dark:text-white'}`}>{label}</p>
      <FitText full={amount} compact={isDesktop ? undefined : compactAmount} className={`mt-0.5 whitespace-nowrap text-base font-extrabold tabular-nums md:whitespace-normal md:text-xl ${toneClass}`} />
      {dollar && percent ? (
          <div className={`mt-1 flex flex-col items-center justify-center text-2xs font-semibold tabular-nums md:flex-row md:items-baseline md:gap-8 md:text-xs ${changeClass(current, prior)}`}>
          <span>{percent}</span>
          <span>{isDesktop ? dollar : compactDollar ?? dollar}</span>
        </div>
      ) : <div className="mt-1 h-8 md:h-4" />}
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


let axisCanvas: HTMLCanvasElement | null = null;

/** Room the y-axis labels need on a phone chart: the widest label plus a 3-unit gap to the axis, so the widest label starts at the chart's left edge. */
function axisLabelSpace(labels: string[], fontSize: number): number {
  let widest = 0;
  const context = typeof document === 'undefined' ? null : (axisCanvas ??= document.createElement('canvas')).getContext('2d');
  if (context) {
    context.font = `${fontSize}px ${getComputedStyle(document.body).fontFamily}`;
    widest = Math.max(0, ...labels.map((label) => context.measureText(label).width));
  } else {
    widest = Math.max(0, ...labels.map((label) => label.length * fontSize * 0.6));
  }
  return widest + 3;
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
  // Phones draw on a narrower canvas so axis labels keep a readable size after the chart scales to fit.
  const isDesktop = useIsDesktop();
  const width = isDesktop ? 640 : 340;
  const height = 250;
  const currentValues = months.map((row) => trendValue(row, metric));
  const previousValues = months.map((_, index) => trendValue(priorMonths[index] || emptyTotals(), metric));
  const plottedCurrent = cumulative ? runningTotal(currentValues) : currentValues;
  const plottedPrevious = cumulative ? runningTotal(previousValues) : previousValues;
  const currentPresent = months.map((row) => trendPresent(row, metric));
  const previousPresent = months.map((_, index) => trendPresent(priorMonths[index] || emptyTotals(), metric));
  const max = Math.max(metric === 'rate' ? 0.01 : 1, ...plottedCurrent, ...plottedPrevious);
  const ticks = trendTicks(max);
  const axisMax = ticks[ticks.length - 1] || 1;
  const tickLabel = (tick: number) => (metric === 'rate' ? `${(tick * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%` : metric === 'units' ? Math.round(tick).toLocaleString() : compactMoney(tick));
  // Phones keep only the margin the y-axis labels need (left of the axis) so the plot runs nearly edge to edge.
  const pad = isDesktop ? { left: 52, right: 16, top: 16, bottom: 32 } : { left: axisLabelSpace(ticks.map(tickLabel), 12), right: 6, top: 16, bottom: 28 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
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
  const peaks = linePeaks(currentPoints, currentPresent, plottedCurrent);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 max-md:pl-0 max-md:pr-1.5 dark:border-slate-800 dark:bg-slate-900">
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-64 w-full overflow-hidden"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            if (!months.length) return;
            const x = svgUserX(event.currentTarget, event.clientX, event.clientY);
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
              <text x={pad.left - (isDesktop ? 8 : 3)} y={yAt(tick) + 3} textAnchor="end" className="fill-slate-400" fontSize={isDesktop ? 11 : 12}>
                {tickLabel(tick)}
              </text>
            </g>
          ))}
          {smoothRuns(currentPoints, currentPresent).map((run, index) => (
            <path key={`current-fill-${index}`} d={areaUnder(run, yAt(0))} fill={`url(#area-fade-${metric})`} stroke="none" />
          ))}
          {smoothRuns(previousPoints, previousPresent).map((run, index) => (
            <path key={`prior-${index}`} d={smoothLine(run)} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={previousClass} />
          ))}
          {smoothRuns(currentPoints, currentPresent).map((run, index) => (
            <path key={`current-${index}`} d={smoothLine(run)} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={currentClass} />
          ))}
          <defs>
            <linearGradient id={`area-fade-${metric}`} x1="0" y1="0" x2="0" y2="1" className={currentClass}>
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.4" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
            {peaks.map((_, index) => (
              <radialGradient key={`peak-fade-${index}`} id={`peak-fade-${metric}-${index}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="white" />
                <stop offset="40%" stopColor="white" />
                <stop offset="100%" stopColor="black" />
              </radialGradient>
            ))}
            <mask id={`peak-shine-${metric}`}>
              <rect width={width} height={height} fill="black" />
              {peaks.map((peak, index) => (
                <circle key={`peak-mask-${index}`} cx={peak.x} cy={peak.y} r="26" fill={`url(#peak-fade-${metric}-${index})`} />
              ))}
            </mask>
          </defs>
          {smoothRuns(currentPoints, currentPresent).map((run, index) => (
            <path key={`current-shine-${index}`} d={smoothLine(run)} fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.8" mask={`url(#peak-shine-${metric})`} />
          ))}
          {average > 0 ? <line x1={pad.left} x2={width - pad.right} y1={yAt(average)} y2={yAt(average)} stroke="currentColor" strokeWidth="1.25" strokeDasharray="14 8" className={currentClass} /> : null}
          {priorAverage > 0 ? <line x1={pad.left} x2={width - pad.right} y1={yAt(priorAverage)} y2={yAt(priorAverage)} stroke="currentColor" strokeWidth="1.25" strokeDasharray="14 8" className={previousClass} /> : null}
          {hover !== null ? (
            <g>
              <line x1={xAt(hover)} x2={xAt(hover)} y1={pad.top} y2={height - pad.bottom} stroke="currentColor" strokeOpacity="0.35" className={currentClass} />
              <circle cx={xAt(hover)} cy={yAt(prior)} r="5.5" fill="currentColor" stroke="white" strokeWidth="2" className={previousClass} />
              <circle cx={xAt(hover)} cy={yAt(value)} r="6" fill="currentColor" stroke="white" strokeWidth="2" className={currentClass} />
            </g>
          ) : null}
          {months.map((row, index) => (
            <text key={row.key} x={xAt(index)} y={height - 8} textAnchor={isDesktop ? 'middle' : index === 0 ? 'start' : index === months.length - 1 ? 'end' : 'middle'} className="fill-slate-400" fontSize={isDesktop ? 11 : 12}>
              {months.length > (isDesktop ? 14 : 7) && index % 2 ? '' : row.label}
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
              <span className={previousClass}>{monthTitle(priorPoint) || 'Prior Year'}:</span>
              <span className={`text-right font-semibold tabular-nums ${previousClass}`}>{formatTrend(prior, metric)}</span>
              <span className={`font-semibold ${changeClass(value, prior)}`}>Diff:</span>
              <span className={`text-right font-semibold tabular-nums ${changeClass(value, prior)}`}>{signedTrend(value - prior, metric)} ({signedChangePercent(value, prior)})</span>
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline justify-center gap-x-5 gap-y-1 text-2xs text-slate-500">
        <span className="inline-flex items-baseline gap-1.5">
          <span className={`h-0.5 w-4 self-center rounded-full bg-current ${currentClass}`} />
          Current period. Average:
          <span className={`text-sm font-bold tabular-nums ${currentClass}`}>{formatTrend(average, metric, true)}</span>
        </span>
        <span className="inline-flex items-baseline gap-1.5">
          <span className={`h-0.5 w-4 self-center rounded-full bg-current ${previousClass}`} />
          Previous year. Average:
          <span className={`text-sm font-bold tabular-nums ${previousClass}`}>{formatTrend(priorAverage, metric, true)}</span>
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
  // Phones draw on a narrower canvas so axis labels keep a readable size after the chart scales to fit.
  const isDesktop = useIsDesktop();
  const width = isDesktop ? 640 : 340;
  const height = 250;
  const currentValues = months.map((row) => trendValue(row, metric));
  const previousValues = months.map((_, index) => trendValue(priorMonths[index] || emptyTotals(), metric));
  const max = Math.max(metric === 'rate' ? 0.01 : 1, ...currentValues, ...previousValues);
  const ticks = trendTicks(max);
  const axisMax = ticks[ticks.length - 1] || 1;
  const tickLabel = (tick: number) => (metric === 'rate' ? `${(tick * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%` : compactMoney(tick));
  // Phones keep only the margin the y-axis labels need (left of the axis) so the plot runs nearly edge to edge.
  const pad = isDesktop ? { left: 52, right: 16, top: 16, bottom: 32 } : { left: axisLabelSpace(ticks.map(tickLabel), 12), right: 6, top: 16, bottom: 28 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const slot = months.length ? innerW / months.length : innerW;
  // The prior year is a wide, soft bar behind; this period is a narrower solid bar in front.
  const ghostWidth = Math.max(8, Math.min(44, slot * 0.72));
  const barWidth = Math.max(5, Math.min(26, ghostWidth * 0.55));
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
    <div className="rounded-xl border border-slate-200 bg-white p-3 max-md:pl-0 max-md:pr-1.5 dark:border-slate-800 dark:bg-slate-900">
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-64 w-full overflow-hidden"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            if (!months.length) return;
            const x = svgUserX(event.currentTarget, event.clientX, event.clientY);
            setHover(Math.min(months.length - 1, Math.max(0, Math.floor((x - pad.left) / slot))));
          }}
        >
          <defs>
            <linearGradient id={`bar-fill-${metric}`} x1="0" y1="0" x2="0" y2="1" className={currentClass}>
              <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.6" />
            </linearGradient>
          </defs>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={yAt(tick)} y2={yAt(tick)} className="stroke-slate-200/70 dark:stroke-slate-800" strokeWidth="1" strokeDasharray={tick === 0 ? undefined : '3 5'} />
              <text x={pad.left - (isDesktop ? 8 : 3)} y={yAt(tick) + 3} textAnchor="end" className="fill-slate-400" fontSize={isDesktop ? 11 : 12}>
                {tickLabel(tick)}
              </text>
            </g>
          ))}
          {hover !== null ? (
            <rect x={pad.left + slot * hover + 2} y={pad.top - 6} width={Math.max(0, slot - 4)} height={baseline - pad.top + 6} rx={8} className="fill-slate-100 dark:fill-slate-800/70" />
          ) : null}
          {months.map((row, index) => {
            const currentValue = currentValues[index] || 0;
            const previousValue = previousValues[index] || 0;
            const priorHeight = Math.max(0, baseline - yAt(previousValue));
            const currentHeight = Math.max(0, baseline - yAt(currentValue));
            const priorBar = roundedTopBar(center(index) - ghostWidth / 2, baseline - priorHeight, ghostWidth, priorHeight, 4);
            const currentBar = roundedTopBar(center(index) - barWidth / 2, baseline - currentHeight, barWidth, currentHeight, 4);
            const dimmed = hover !== null && hover !== index;
            return (
              <g key={`bars-${row.key}`} className="bar-grow transition-opacity duration-150" style={{ opacity: dimmed ? 0.45 : 1, animationDelay: `${index * 30}ms` }}>
                <path d={priorBar} fill="currentColor" fillOpacity="0.55" className={previousClass} />
                <path d={currentBar} fill={`url(#bar-fill-${metric})`} />
              </g>
            );
          })}
          {average > 0 ? <line x1={pad.left} x2={width - pad.right} y1={yAt(average)} y2={yAt(average)} stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.25" strokeDasharray="4 4" strokeLinecap="round" className={currentClass} /> : null}
          {priorAverage > 0 ? <line x1={pad.left} x2={width - pad.right} y1={yAt(priorAverage)} y2={yAt(priorAverage)} stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.25" strokeDasharray="4 4" strokeLinecap="round" className={previousClass} /> : null}
          {months.map((row, index) => (
            <text key={`label-${row.key}`} x={center(index)} y={height - 8} textAnchor="middle" className="fill-slate-400" fontSize={isDesktop ? 11 : 12}>
              {months.length > (isDesktop ? 14 : 7) && index % 2 ? '' : row.label}
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
              <span className={previousClass}>{monthTitle(priorPoint) || 'Prior Year'}:</span>
              <span className={`text-right font-semibold tabular-nums ${previousClass}`}>{formatTrend(prior, metric)}</span>
              <span className={`font-semibold ${changeClass(value, prior)}`}>Diff:</span>
              <span className={`text-right font-semibold tabular-nums ${changeClass(value, prior)}`}>{signedTrend(value - prior, metric)} ({signedChangePercent(value, prior)})</span>
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline justify-center gap-x-5 gap-y-1 text-2xs text-slate-500">
        <span className="inline-flex items-baseline gap-1.5">
          <span className={`h-3 w-1.5 self-center rounded-t-[2px] bg-current ${currentClass}`} />
          Current period. Average:
          <span className={`text-sm font-bold tabular-nums ${currentClass}`}>{formatTrend(average, metric, true)}</span>
        </span>
        <span className="inline-flex items-baseline gap-1.5">
          <span className={`h-3 w-3 self-center rounded-[3px] bg-current opacity-55 ${previousClass}`} />
          Previous year. Average:
          <span className={`text-sm font-bold tabular-nums ${previousClass}`}>{formatTrend(priorAverage, metric, true)}</span>
        </span>
      </div>
    </div>
  );
}

function LineChart({ title, metric, current, previous }: { title: string; metric: MetricId; current: MonthRow[]; previous: MonthRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // Phones draw on a narrower canvas so axis labels keep a readable size after the chart scales to fit.
  const isDesktop = useIsDesktop();
  const width = isDesktop ? 640 : 340;
  const height = 220;
  const pad = isDesktop ? { left: 12, right: 12, top: 16, bottom: 28 } : { left: 6, right: 6, top: 16, bottom: 28 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const currentValues = current.map((row) => metricValue(row, metric));
  const previousValues = current.map((_, index) => metricValue(previous[index] || emptyTotals(), metric));
  const max = Math.max(1, ...currentValues, ...previousValues);
  const xAt = (index: number) => pad.left + (current.length <= 1 ? innerW / 2 : (index / (current.length - 1)) * innerW);
  const yAt = (value: number) => pad.top + innerH - (value / max) * innerH;
  const pathFor = (values: number[]) => values.map((value, index) => `${index === 0 ? 'M' : 'L'} ${xAt(index)} ${yAt(value)}`).join(' ');
  const average = currentValues.length ? currentValues.reduce((total, value) => total + value, 0) / currentValues.length : 0;
  const priorAverage = previous.length ? previousValues.reduce((total, value) => total + value, 0) / previousValues.length : 0;
  const point = hover === null ? null : current[hover];
  const prior = hover === null ? 0 : previousValues[hover] || 0;
  const value = hover === null ? 0 : currentValues[hover] || 0;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-base font-bold">{title}</h3>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-56"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            const x = svgUserX(event.currentTarget, event.clientX, event.clientY);
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
          {average > 0 ? <line x1={pad.left} x2={width - pad.right} y1={yAt(average)} y2={yAt(average)} stroke="currentColor" strokeDasharray="14 8" className={TREND_CURRENT} /> : null}
          {priorAverage > 0 ? <line x1={pad.left} x2={width - pad.right} y1={yAt(priorAverage)} y2={yAt(priorAverage)} stroke="currentColor" strokeDasharray="14 8" className={TREND_PRIOR} /> : null}
          {previous.length > 0 ? <path d={pathFor(previousValues)} fill="none" stroke="currentColor" strokeWidth="2" className={TREND_PRIOR} /> : null}
          <path d={pathFor(currentValues)} fill="none" stroke="currentColor" strokeWidth="2.5" className={TREND_CURRENT} />
          <PeakShine d={pathFor(currentValues)} points={currentValues.map((value, index) => ({ x: xAt(index), y: yAt(value) }))} values={currentValues} width={width} height={height} />
          {current.map((row, index) => (
            <circle key={row.key} cx={xAt(index)} cy={yAt(currentValues[index])} r={hover === index ? 4.5 : 2.5} fill="currentColor" className={TREND_CURRENT} />
          ))}
          {hover !== null ? <line x1={xAt(hover)} x2={xAt(hover)} y1={pad.top} y2={height - pad.bottom} stroke="currentColor" strokeOpacity="0.35" className={TREND_CURRENT} /> : null}
          {current.map((row, index) => (
            <text key={`${row.key}-label`} x={xAt(index)} y={height - 8} textAnchor={isDesktop ? 'middle' : index === 0 ? 'start' : index === current.length - 1 ? 'end' : 'middle'} className="fill-slate-400" fontSize={isDesktop ? 10 : 12}>
              {current.length > (isDesktop ? 16 : 7) && index % 2 ? '' : row.label}
            </text>
          ))}
        </svg>
        {point && hover !== null ? (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-950/95 px-3 py-2 text-xs shadow-lg"
            style={{ left: `${Math.min(78, Math.max(2, (xAt(hover) / width) * 100))}%` }}
          >
            <p className="font-bold">{point.label}</p>
            <p className="mt-1 text-emerald-400 dark:text-emerald-600">{formatMetric(value, metric)}</p>
            <p className="text-slate-500">Previous Year {formatMetric(prior, metric)}</p>
            <p className="text-slate-500">{prior ? percent(value - prior, prior) : '—'}</p>
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline justify-center gap-x-5 gap-y-1 text-2xs text-slate-500">
        <span className="inline-flex items-baseline gap-1.5"><span className="h-0.5 w-4 self-center rounded-full bg-emerald-400 dark:bg-emerald-600" /> Current Period. Average:<span className="text-sm font-bold tabular-nums text-emerald-400 dark:text-emerald-600">{formatMetric(average, metric)}</span></span>
        {previous.length > 0 ? <span className="inline-flex items-baseline gap-1.5"><span className="h-0.5 w-4 self-center rounded-full bg-[#d9dde2] dark:bg-slate-400" /> Previous Year. Average:<span className="text-sm font-bold tabular-nums text-[#d9dde2] dark:text-slate-400">{formatMetric(priorAverage, metric)}</span></span> : null}
      </div>
    </div>
  );
}

function emptyTotals(): Totals {
  return { units: 0, volume: 0, gci: 0, commission: 0, agentPaid: 0, net: 0, teamGci: 0 };
}

function MonthlyTable({ title, rows, mode }: { title: string; rows: MonthRow[]; mode: 'production' | 'net' | 'units' }) {
  const total = sumRows(rows);
  const { sort, toggle } = useColumnSort();
  const ordered = sortBy(rows, sort, (row, key) => (key === 'label' ? row.key : row[key as keyof MonthRow]) as string | number);
  return (
    <div className={reportTableWrap}>
      <table className="pin-col-1 w-full text-sm">
        <thead className="report-head text-sm text-slate-500">
          <tr>
            <SortHead column="label" label={title} sort={sort} onSort={toggle} className="px-3 py-2" />
            {mode === 'units' ? <SortHead column="units" label="Units" sort={sort} onSort={toggle} align="right" className="px-3 py-2" /> : null}
            {mode === 'net' ? <SortHead column="net" label="Net Commission Income" sort={sort} onSort={toggle} align="right" className="px-3 py-2" /> : null}
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

function AgentTable({ rows, caption, paid = false }: { rows: AgentRow[]; caption: string; paid?: boolean }) {
  const total = sumRows(rows);
  const { sort, toggle } = useColumnSort();
  const ordered = sortBy(rows, sort, (row, key) => (key === 'paid' ? (paid ? row.agentPaid : row.net) : row[key as keyof typeof row]) as string | number);
  return (
    <div className={reportTableWrap}>
      <p className="px-4 pt-3 text-xs text-slate-500">{caption}</p>
      <table className="pin-col-1 w-full text-sm">
        <thead className="report-head text-sm text-slate-500">
          <tr>
            <SortHead column="name" label="Agent" sort={sort} onSort={toggle} className="px-4 py-2" />
            <SortHead column="units" label="Units" sort={sort} onSort={toggle} align="right" className="px-3 py-2" />
            <SortHead column="volume" label="Volume" sort={sort} onSort={toggle} align="right" className="px-3 py-2" />
            <SortHead column="gci" label="GCI" sort={sort} onSort={toggle} align="right" className="px-3 py-2" />
            <SortHead column="paid" label={paid ? 'Agent Paid' : 'Net to Company'} sort={sort} onSort={toggle} align="right" className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {ordered.length === 0 ? <tr><td className="px-4 py-6 text-slate-500" colSpan={5}>No transactions in this date range.</td></tr> : null}
          {ordered.map((row) => (
            <tr key={row.agentId} className="border-t border-slate-100 dark:border-slate-800">
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

const NET_EARNING = 'net';
const EARNING_ENTITY_TYPES = new Set(['EQUITY', 'INCOME']);

type PostSplitCredit = {
  transactionId: string;
  agentId: string;
  entityId: string;
  amount: number;
};

function isPostSplitSection(section: unknown): boolean {
  const key = String(section || '').toUpperCase().replace(/[\s_-]+/g, '');
  return key === 'POSTSPLIT' || key === 'POSTSPLITL2';
}

function earningPayments(payments: ReportPayment[], credits: PostSplitCredit[], picked: string[] | null): ReportPayment[] {
  const active = picked ?? [NET_EARNING];
  const entities = new Set(active.filter((value) => value !== NET_EARNING));
  const extra: ReportPayment[] = [];
  credits.forEach((credit) => {
    if (!entities.has(credit.entityId) || !credit.agentId || !credit.amount) return;
    extra.push({
      transactionId: credit.transactionId,
      agentId: credit.agentId,
      entityId: credit.entityId,
      payeeType: 'AGENT',
      amount: credit.amount,
    });
  });
  if (active.includes(NET_EARNING) && extra.length === 0) return payments;
  const base = active.includes(NET_EARNING) ? payments.filter((payment) => payeeKind(payment) === 'agent') : [];
  return [...base, ...extra];
}

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
  const leftTitle = paymentMode ? 'Payment Amount' : 'Sales Volume';
  const rightTitle = paymentMode ? 'Payment Records' : 'Units';

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
  const formatDelta = (value: number, compact = false) => (metric === 'volume' ? (compact ? signedCompact(value) : signedFull(value)) : signedCount(value));
  const max = rows.reduce((highest, row) => Math.max(highest, row.value), 0);
  const total = scores ? scores.total : statusTotal(current, 'all', metric);
  const priorTotal = scores ? scores.priorTotal : statusTotal(prior, 'all', metric);
  const closedValue = scores ? scores.closed : statusTotal(current, 'closed', metric);
  const priorClosed = scores ? scores.priorClosed : statusTotal(prior, 'closed', metric);
  const pendingValue = scores ? scores.pending : statusTotal(current, 'pending', metric);
  const accent = TREND_CLOSED;
  const pendingTone = TREND_PENDING;
  const bar = 'bg-emerald-500/70 dark:bg-emerald-400/50';
  const tableTotal = rows.reduce((sum, row) => sum + row.value, 0);
  const tablePrior = rows.reduce((sum, row) => sum + row.prior, 0);
  const share = (value: number) => (tableTotal ? `${((value / tableTotal) * 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : '—');
  const emptyLabel = statusFilter === 'closed' ? 'closed' : statusFilter === 'pending' ? 'pending' : 'closed or pending';
  const amountLabel = valueLabel || (metric === 'volume' ? 'Sales Volume' : 'Units');
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
        <BoardScore tone={tone} label="Total" amount={formatValue(total)} compactAmount={formatValue(total, true)} dollar={formatDelta(total - priorTotal)} compactDollar={formatDelta(total - priorTotal, true)} percent={signedChangePercent(total, priorTotal)} toneClass="" current={total} prior={priorTotal} selected={statusFilter === 'all'} onSelect={() => onSelectStatus('all')} />
        <BoardScore tone={tone} label="Closed" amount={formatValue(closedValue)} compactAmount={formatValue(closedValue, true)} dollar={formatDelta(closedValue - priorClosed)} compactDollar={formatDelta(closedValue - priorClosed, true)} percent={signedChangePercent(closedValue, priorClosed)} toneClass={accent} current={closedValue} prior={priorClosed} selected={statusFilter === 'closed'} onSelect={() => onSelectStatus('closed')} />
        <BoardScore tone={tone} label="Pending" amount={formatValue(pendingValue)} compactAmount={formatValue(pendingValue, true)} toneClass={pendingTone} selected={statusFilter === 'pending'} onSelect={() => onSelectStatus('pending')} />
      </div>
      <div className="report-table rounded-xl">
      <table className="pin-col-2 w-full text-sm">
        <thead className={`${tone === 'volume' ? 'leader-head-volume' : 'leader-head-units'} text-sm font-medium normal-case [&_th]:text-sm [&_th]:font-medium`}>
          <tr className="text-left">
            <SortHead column="rank" label="#" sort={sort} onSort={toggle} align="right" className="w-10 px-3 py-2" />
            <SortHead column="label" label={rowLabel} sort={sort} onSort={toggle} className="px-2 py-2" />
            <SortHead column="value" label={amountLabel} sort={sort} onSort={toggle} className="px-2 py-2" />
            <SortHead column="delta" label="% Δ" sort={sort} onSort={toggle} align="right" className="px-2 py-2" note={`How much each ${rowLabel} is up or down compared with the same dates in the prior year. +10% means it is 10% higher than the prior year. A dash means the prior year was zero, so there is no percent to show.`} />
            <SortHead column="share" label="% of Total" sort={sort} onSort={toggle} align="right" className="px-3 py-2" />
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
            <td className="px-2 py-3">Grand Total</td>
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

function BoardScore({ tone, label, amount, compactAmount, dollar, compactDollar, percent, toneClass, current = 0, prior = 0, selected, onSelect }: {
  tone: 'volume' | 'units';
  label: string;
  amount: string;
  /** Shorter amount for phones, used when the full one does not fit. */
  compactAmount?: string;
  dollar?: string;
  /** Shorter change for phones. */
  compactDollar?: string;
  percent?: string;
  toneClass: string;
  current?: number;
  prior?: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const deltaClass = dollar ? changeClass(current, prior) : '';
  // Selected: Total neutral, Closed emerald, Pending amber (report color roles). Both boards look alike.
  const selectedClass = label === 'Pending'
    ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-400 dark:border-amber-400 dark:bg-amber-950/60 dark:ring-amber-400'
    : label === 'Closed'
      ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500 dark:border-emerald-300 dark:bg-emerald-950/70 dark:ring-emerald-400'
      : 'border-slate-900 bg-slate-50 ring-2 ring-slate-900 dark:border-white dark:bg-slate-800/80 dark:ring-white';
  const focusClass = tone === 'volume' || tone === 'units' ? 'focus-visible:ring-emerald-400' : '';
  const isDesktop = useIsDesktop();
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      data-score-card
      className={`flex h-full w-full min-w-0 flex-col justify-start cursor-pointer appearance-none rounded-xl border px-1.5 py-2 text-center md:px-3 shadow-sm [outline:none] focus-visible:ring-2 ${focusClass} ${selected ? `ring-inset ${selectedClass}` : 'border-slate-200/90 bg-white/80 dark:border-slate-700 dark:bg-slate-900/80'}`}
    >
        <p className={`text-2xs font-medium md:text-sm ${toneClass || 'text-slate-500 dark:text-white'}`}>{label}</p>
        <FitText full={amount} compact={isDesktop ? undefined : compactAmount} className={`mt-0.5 whitespace-nowrap text-base font-extrabold tabular-nums md:whitespace-normal md:text-xl ${toneClass}`} />
        {dollar && percent ? (
          <div className={`mt-1 flex flex-col items-center justify-center text-2xs font-semibold tabular-nums md:flex-row md:items-baseline md:gap-8 md:text-xs ${deltaClass}`}>
            <span>{percent}</span>
            <span>{isDesktop ? dollar : compactDollar ?? dollar}</span>
          </div>
        ) : <div className="mt-1 h-8 md:h-4" aria-hidden="true" />}
      </button>
  );
}

function SourceTable({ rows }: { rows: Array<Totals & { source: string }> }) {
  const total = sumRows(rows);
  const { sort, toggle } = useColumnSort();
  const ordered = sortBy(rows, sort, (row, key) => (key === 'share' ? row.gci : row[key as keyof typeof row]) as string | number);
  return (
    <div className={reportTableWrap}>
      <table className="pin-col-1 w-full text-sm">
        <thead className="report-head text-sm text-slate-500">
          <tr>
            <SortHead column="source" label="Lead Source" sort={sort} onSort={toggle} className="px-4 py-2" />
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

function payeeKept(agentId: string, picked: string[] | null): boolean {
  return picked == null || picked.includes(agentId);
}

function earningSums(deals: ReportDeal[], payments: ReportPayment[], range: DateRange, excludeTeamLeads: boolean, teamLeadIds: Set<string>, payeePicked: string[] | null, agentId: string | null = null) {
  const dealsById = new Map(deals.map((deal) => [deal.id, deal]));
  let total = 0;
  let closed = 0;
  let pending = 0;
  payments.forEach((payment) => {
    const deal = dealsById.get(payment.transactionId);
    if (!deal || payeeKind(payment) !== 'agent' || !inRange(deal.closingDate, range)) return;
    const payeeId = payment.agentId || 'unspecified';
    if (excludeTeamLeads && teamLeadIds.has(payeeId)) return;
    if (!payeeKept(payeeId, payeePicked)) return;
    if (agentId && payeeId !== agentId) return;
    const status = deal.status.trim().toLowerCase();
    if (status !== 'closed' && status !== 'pending') return;
    total += payment.amount;
    if (status === 'closed') closed += payment.amount;
    else pending += payment.amount;
  });
  return { total, closed, pending };
}

function earningPeriodSums(deals: ReportDeal[], payments: ReportPayment[], range: DateRange, period: string, excludeTeamLeads: boolean, teamLeadIds: Set<string>, payeePicked: string[] | null, agentId: string | null) {
  const dealsById = new Map(deals.map((deal) => [deal.id, deal]));
  let total = 0;
  let closed = 0;
  let pending = 0;
  payments.forEach((payment) => {
    const deal = dealsById.get(payment.transactionId);
    if (!deal?.closingDate || payeeKind(payment) !== 'agent' || !inRange(deal.closingDate, range)) return;
    if (periodKey(deal.closingDate, range) !== period) return;
    const payeeId = payment.agentId || 'unspecified';
    if (excludeTeamLeads && teamLeadIds.has(payeeId)) return;
    if (!payeeKept(payeeId, payeePicked)) return;
    if (agentId && payeeId !== agentId) return;
    const status = deal.status.trim().toLowerCase();
    if (status !== 'closed' && status !== 'pending') return;
    total += payment.amount;
    if (status === 'closed') closed += payment.amount;
    else pending += payment.amount;
  });
  return { total, closed, pending };
}

function earningPeriodTotals(deals: ReportDeal[], payments: ReportPayment[], range: DateRange, excludeTeamLeads: boolean, teamLeadIds: Set<string>, payeePicked: string[] | null, agentId: string | null, statusFilter: 'all' | 'closed' | 'pending') {
  const columns = periodColumns(range);
  const totals = columns.map(() => 0);
  const index = new Map(columns.map((column, slot) => [column.key, slot]));
  const dealsById = new Map(deals.map((deal) => [deal.id, deal]));
  payments.forEach((payment) => {
    const deal = dealsById.get(payment.transactionId);
    if (!deal || payeeKind(payment) !== 'agent' || !inRange(deal.closingDate, range)) return;
    const payeeId = payment.agentId || 'unspecified';
    if (excludeTeamLeads && teamLeadIds.has(payeeId)) return;
    if (!payeeKept(payeeId, payeePicked)) return;
    if (agentId && payeeId !== agentId) return;
    const status = deal.status.trim().toLowerCase();
    if (status !== 'closed' && status !== 'pending') return;
    if (statusFilter !== 'all' && status !== statusFilter) return;
    const slot = index.get(periodKey(deal.closingDate, range));
    if (slot == null) return;
    totals[slot] += payment.amount;
  });
  return totals;
}

function EarningsTimeline({ columns, values, priorColumns, priorValues, selectedKey, onSelect, onClear }: {
  columns: { key: string; label: string }[];
  values: number[];
  priorColumns: { key: string; label: string }[];
  priorValues: number[];
  selectedKey: string | null;
  onSelect: (periodKey: string) => void;
  onClear: () => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // Phones draw on a narrower canvas so axis labels keep a readable size after the chart scales to fit.
  const isDesktop = useIsDesktop();
  const width = isDesktop ? 640 : 340;
  const height = 250;
  const previous = columns.map((_, index) => priorValues[index] || 0);
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const priorAverage = previous.length ? previous.reduce((sum, value) => sum + value, 0) / previous.length : 0;
  const max = Math.max(1, ...values, ...previous, average, priorAverage);
  const ticks = trendTicks(max);
  const axisMax = ticks[ticks.length - 1] || 1;
  const tickLabel = (tick: number) => compactMoney(tick);
  // Phones keep only the margin the y-axis labels need (left of the axis) so the plot runs nearly edge to edge.
  const pad = isDesktop ? { left: 56, right: 16, top: 16, bottom: 32 } : { left: axisLabelSpace(ticks.map(tickLabel), 12), right: 6, top: 16, bottom: 28 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const xAt = (index: number) => pad.left + (columns.length <= 1 ? innerW / 2 : (index / (columns.length - 1)) * innerW);
  const yAt = (value: number) => pad.top + innerH - (value / axisMax) * innerH;
  const points = values.map((value, index) => ({ x: xAt(index), y: yAt(value) }));
  const priorPoints = previous.map((value, index) => ({ x: xAt(index), y: yAt(value) }));
  const svgRef = useRef<SVGSVGElement>(null);
  const [frame, setFrame] = useState({ scale: 1, offsetX: 0, boxWidth: width });
  const [reveal, setReveal] = useState<{ index: number; shown: boolean } | null>(null);
  const selectedIndex = selectedKey ? columns.findIndex((column) => column.key === selectedKey) : -1;
  const focus = hover !== null ? hover : reveal?.index ?? -1;
  const popupShown = hover !== null || Boolean(reveal?.shown);
  const lineClass = 'text-emerald-600 dark:text-emerald-400';
  const previousClass = 'text-[#b3bbc5] dark:text-slate-400';
  const focusValue = focus < 0 ? 0 : values[focus] || 0;
  const focusPrior = focus < 0 ? 0 : previous[focus] || 0;
  const focusX = focus < 0 || !frame.boxWidth ? 0 : ((frame.offsetX + xAt(focus) * frame.scale) / frame.boxWidth) * 100;
  useEffect(() => {
    const index = selectedKey ? columns.findIndex((column) => column.key === selectedKey) : -1;
    if (index < 0) {
      setReveal(null);
      return;
    }
    setReveal({ index, shown: false });
    let hideTimer = 0;
    let clearTimer = 0;
    const frameId = requestAnimationFrame(() => {
      setReveal({ index, shown: true });
      hideTimer = window.setTimeout(() => {
        setReveal({ index, shown: false });
        clearTimer = window.setTimeout(() => setReveal(null), 300);
      }, 3000);
    });
    return () => {
      cancelAnimationFrame(frameId);
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [columns, selectedKey]);
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const rect = svg.getBoundingClientRect();
      const scale = Math.min(rect.width / width, rect.height / height) || 1;
      setFrame({ scale, offsetX: (rect.width - width * scale) / 2, boxWidth: rect.width || width });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [height, width]);
  const choosePeriod = (index: number) => {
    const key = columns[index]?.key;
    if (!key) return;
    if (key === selectedKey) onClear();
    else onSelect(key);
  };
  return (
    <div className="h-full rounded-xl border border-slate-200 bg-white p-3 max-md:pl-0 max-md:pr-1.5 dark:border-slate-800 dark:bg-slate-900">
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="h-64 w-full cursor-pointer overflow-hidden"
          onMouseLeave={() => setHover(null)}
          onClick={() => { if (hover !== null) choosePeriod(hover); }}
          onMouseMove={(event) => {
            if (!columns.length) return;
            const svg = event.currentTarget;
            const matrix = svg.getScreenCTM();
            if (!matrix) return;
            const point = svg.createSVGPoint();
            point.x = event.clientX;
            point.y = event.clientY;
            const x = point.matrixTransform(matrix.inverse()).x;
            let nearest = 0;
            let best = Infinity;
            columns.forEach((_, index) => {
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
              <text x={pad.left - (isDesktop ? 8 : 3)} y={yAt(tick) + 3} textAnchor="end" className="fill-slate-400" fontSize={isDesktop ? 11 : 12}>{tickLabel(tick)}</text>
            </g>
          ))}
          <path d={areaUnder(points, yAt(0))} fill="url(#area-fade-earnings)" stroke="none" />
          <path d={smoothLine(priorPoints)} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={previousClass} />
          <path d={smoothLine(points)} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={lineClass} />
          <PeakShine d={smoothLine(points)} points={points} values={values} width={width} height={height} />
          <defs>
            <linearGradient id="area-fade-earnings" x1="0" y1="0" x2="0" y2="1" className={lineClass}>
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.4" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {average > 0 ? <line x1={pad.left} x2={width - pad.right} y1={yAt(average)} y2={yAt(average)} stroke="currentColor" strokeWidth="1.25" strokeDasharray="14 8" className={lineClass} /> : null}
          {priorAverage > 0 ? <line x1={pad.left} x2={width - pad.right} y1={yAt(priorAverage)} y2={yAt(priorAverage)} stroke="currentColor" strokeWidth="1.25" strokeDasharray="14 8" className={previousClass} /> : null}
          {hover !== null ? (
            <g>
              <line x1={xAt(hover)} x2={xAt(hover)} y1={pad.top} y2={height - pad.bottom} stroke="currentColor" strokeOpacity="0.35" className={lineClass} />
              <circle cx={xAt(hover)} cy={yAt(previous[hover] || 0)} r="5.5" fill="currentColor" stroke="white" strokeWidth="2" className={previousClass} />
              {hover !== selectedIndex ? <circle cx={xAt(hover)} cy={yAt(values[hover] || 0)} r="6" fill="currentColor" stroke="white" strokeWidth="2" className={lineClass} /> : null}
            </g>
          ) : null}
          {selectedIndex >= 0 ? (
            <g>
              <circle cx={xAt(selectedIndex)} cy={yAt(values[selectedIndex] || 0)} r="14" fill="transparent" />
              <circle cx={xAt(selectedIndex)} cy={yAt(values[selectedIndex] || 0)} r="6.5" fill="currentColor" stroke="white" strokeWidth="2" className={lineClass} />
            </g>
          ) : null}
          {columns.map((column, index) => (
            <text key={column.key} x={xAt(index)} y={height - 8} textAnchor={isDesktop ? 'middle' : index === 0 ? 'start' : index === columns.length - 1 ? 'end' : 'middle'} className="fill-slate-400" fontSize={isDesktop ? 11 : 12}>
              {columns.length > (isDesktop ? 14 : 7) && index % 2 ? '' : column.label}
            </text>
          ))}
        </svg>
        {focus >= 0 ? (
          <div
            className={`pointer-events-none absolute top-3 z-10 w-max whitespace-nowrap rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg transition-opacity dark:border-slate-700 dark:bg-slate-950/95 ${hover !== null ? 'duration-0' : 'duration-300'} ${popupShown ? 'opacity-100' : 'opacity-0'}`}
            style={{ left: `${focusX}%`, transform: focusX > 50 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }}
          >
            <p className="font-bold">Agent Earnings</p>
            <div className="mt-1.5 grid grid-cols-[auto_auto] items-baseline gap-x-6 gap-y-0.5">
              <span className={lineClass}>{monthTitle(columns[focus])}:</span>
              <span className={`text-right font-semibold tabular-nums ${lineClass}`}>{fullMoney(focusValue)}</span>
              <span className={previousClass}>{monthTitle(priorColumns[focus]) || 'Prior Year'}:</span>
              <span className={`text-right font-semibold tabular-nums ${previousClass}`}>{fullMoney(focusPrior)}</span>
              <span className={`font-semibold ${changeClass(focusValue, focusPrior)}`}>Diff:</span>
              <span className={`text-right font-semibold tabular-nums ${changeClass(focusValue, focusPrior)}`}>{signedFull(focusValue - focusPrior)} ({signedChangePercent(focusValue, focusPrior)})</span>
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline justify-center gap-x-5 gap-y-1 text-2xs text-slate-500">
        <span className="inline-flex items-baseline gap-1.5">
          <span className={`h-0.5 w-4 self-center rounded-full bg-current ${lineClass}`} />
          Current period. Average:
          <span className={`text-sm font-bold tabular-nums ${lineClass}`}>{compactMoney(average)}</span>
        </span>
        <span className="inline-flex items-baseline gap-1.5">
          <span className={`h-0.5 w-4 self-center rounded-full bg-current ${previousClass}`} />
          Previous year. Average:
          <span className={`text-sm font-bold tabular-nums ${previousClass}`}>{compactMoney(priorAverage)}</span>
        </span>
      </div>
    </div>
  );
}

function EarningScoreRow({ sums, prior, statusFilter, onSelect }: {
  sums: { total: number; closed: number; pending: number };
  prior: { total: number; closed: number; pending: number };
  statusFilter: 'all' | 'closed' | 'pending';
  onSelect: (status: 'all' | 'closed' | 'pending') => void;
}) {
  const closedClass = 'text-emerald-700 dark:text-emerald-200';
  return (
    <div className={pairedScores}>
      <TrendScore tone="emerald" label="Total" amount={fullMoney(sums.total)} compactAmount={compactMoney(sums.total)} toneClass="" dollar={signedFull(sums.total - prior.total)} compactDollar={signedCompact(sums.total - prior.total)} percent={signedChangePercent(sums.total, prior.total)} current={sums.total} prior={prior.total} selected={statusFilter === 'all'} onSelect={() => onSelect('all')} />
      <TrendScore tone="emerald" label="Closed" amount={fullMoney(sums.closed)} compactAmount={compactMoney(sums.closed)} toneClass={closedClass} dollar={signedFull(sums.closed - prior.closed)} compactDollar={signedCompact(sums.closed - prior.closed)} percent={signedChangePercent(sums.closed, prior.closed)} current={sums.closed} prior={prior.closed} selected={statusFilter === 'closed'} onSelect={() => onSelect('closed')} />
      <TrendScore tone="emerald" label="Pending" amount={fullMoney(sums.pending)} compactAmount={compactMoney(sums.pending)} toneClass={TREND_PENDING} selected={statusFilter === 'pending'} onSelect={() => onSelect('pending')} />
    </div>
  );
}

function AgentEarnings({ deals, payments, names, range, priorRange, excludeTeamLeads, teamLeadIds, payeePicked, preset }: { deals: ReportDeal[]; payments: ReportPayment[]; names: Map<string, string>; range: DateRange; priorRange: DateRange; excludeTeamLeads: boolean; teamLeadIds: Set<string>; payeePicked: string[] | null; preset: RangePreset }) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'closed' | 'pending'>('all');
  useEffect(() => {
    setStatusFilter('all');
  }, [range, excludeTeamLeads]);
  const selectStatus = (status: 'all' | 'closed' | 'pending') => {
    setStatusFilter((value) => (value === status ? 'all' : status));
  };
  const columns = useMemo(() => periodColumns(range), [range]);
  const lines = useMemo(() => {
    const dealsById = new Map(deals.map((deal) => [deal.id, deal]));
    const columnKeys = new Set(columns.map((column) => column.key));
    const grouped = new Map<string, { key: string; agentId: string; agentName: string; deal: ReportDeal; amount: number; periodKey: string }>();
    payments.forEach((payment) => {
      const deal = dealsById.get(payment.transactionId);
      if (!deal || payeeKind(payment) !== 'agent' || !inRange(deal.closingDate, range)) return;
      const bucket = periodKey(deal.closingDate, range);
      if (!columnKeys.has(bucket)) return;
      const agentId = payment.agentId || 'unspecified';
      if (excludeTeamLeads && teamLeadIds.has(agentId)) return;
      if (!payeeKept(agentId, payeePicked)) return;
      const key = `${agentId}:${deal.id}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.amount += payment.amount;
        return;
      }
      grouped.set(key, {
        key,
        agentId,
        agentName: names.get(payment.agentId) || payment.agentId || 'Unspecified',
        deal,
        amount: payment.amount,
        periodKey: bucket,
      });
    });
    return [...grouped.values()];
  }, [columns, deals, excludeTeamLeads, names, payments, payeePicked, range, teamLeadIds]);
  const priorSums = useMemo(
    () => earningSums(deals, payments, priorRange, excludeTeamLeads, teamLeadIds, payeePicked),
    [deals, excludeTeamLeads, payments, payeePicked, priorRange, teamLeadIds],
  );
  const sums = useMemo(() => {
    let total = 0;
    let closed = 0;
    let pending = 0;
    lines.forEach((line) => {
      total += line.amount;
      const status = line.deal.status.trim().toLowerCase();
      if (status === 'closed') closed += line.amount;
      else if (status === 'pending') pending += line.amount;
    });
    return { total, closed, pending };
  }, [lines]);
  const tableLines = useMemo(
    () => (statusFilter === 'all' ? lines : lines.filter((line) => line.deal.status.trim().toLowerCase() === statusFilter)),
    [lines, statusFilter],
  );
  const rows = useMemo(() => {
    const byAgentId = new Map<string, { agentId: string; name: string; amounts: Record<string, number>; total: number }>();
    tableLines.forEach((line) => {
      const row = byAgentId.get(line.agentId) || { agentId: line.agentId, name: line.agentName, amounts: {}, total: 0 };
      row.amounts[line.periodKey] = (row.amounts[line.periodKey] || 0) + line.amount;
      row.total += line.amount;
      byAgentId.set(line.agentId, row);
    });
    return [...byAgentId.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [tableLines]);
  const columnTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    columns.forEach((column) => {
      totals[column.key] = tableLines.reduce((sum, line) => (line.periodKey === column.key ? sum + line.amount : sum), 0);
    });
    return totals;
  }, [columns, tableLines]);
  const grand = tableLines.reduce((sum, line) => sum + line.amount, 0);
  const cellPeak = rows.reduce((max, row) => columns.reduce((peak, column) => Math.max(peak, row.amounts[column.key] || 0), max), 0);
  const rowPeak = rows.reduce((max, row) => Math.max(max, row.total), 0);
  const monthPeak = columns.reduce((max, column) => Math.max(max, columnTotals[column.key] || 0), 0);
  const [pick, setPick] = useState<{ agentId: string | null; periodKey: string | null } | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const blockRef = useRef<HTMLDivElement>(null);
  const pivotWrapRef = useRef<HTMLDivElement>(null);
  const pivotBodyRef = useRef<HTMLTableElement>(null);
  const pivotFootRef = useRef<HTMLTableElement>(null);
  const pivotFootScrollRef = useRef<HTMLDivElement>(null);
  const detailWrapRef = useRef<HTMLDivElement>(null);
  const syncPivotFoot = () => {
    const body = pivotBodyRef.current;
    const foot = pivotFootRef.current;
    if (!body || !foot) return;
    const widths = [...body.querySelectorAll('thead th')].map((cell) => cell.getBoundingClientRect().width);
    foot.style.width = `${body.scrollWidth}px`;
    [...foot.querySelectorAll('td')].forEach((cell, index) => {
      const width = `${widths[index] || 0}px`;
      cell.style.width = width;
      cell.style.minWidth = width;
      cell.style.maxWidth = width;
    });
  };
  useEffect(() => {
    setPick(null);
  }, [deals, payments, range, excludeTeamLeads, payeePicked]);
  const choose = (agentId: string | null, bucket: string | null) => {
    const same = Boolean(pick && pick.agentId === agentId && pick.periodKey === bucket);
    setPick(same ? null : { agentId, periodKey: bucket });
  };
  const selected = (agentId: string | null, bucket: string | null) => Boolean(pick && pick.agentId === agentId && pick.periodKey === bucket);
  const shown = tableLines.filter((line) => {
    if (!pick) return false;
    if (pick.agentId && line.agentId !== pick.agentId) return false;
    if (pick.periodKey && line.periodKey !== pick.periodKey) return false;
    return true;
  });
  const { sort, toggle } = useColumnSort({ key: 'total', direction: 'desc' });
  const ordered = sortBy(rows.map((row, index) => ({ ...row, rank: index + 1 })), sort, (row, key) => {
    if (key === 'rank') return row.rank;
    if (key === 'agent') return row.name;
    if (key === 'total') return row.total;
    return row.amounts[key] || 0;
  });
  const visible = pick?.agentId ? ordered.filter((row) => row.agentId === pick.agentId) : pick ? [] : ordered;
  const showTotal = ordered.length > 0 && !pick?.agentId;
  const agentName = pick?.agentId ? rows.find((row) => row.agentId === pick.agentId)?.name || 'Agent' : '';
  const subject = agentName ? `${agentName}'s earnings` : "All agents' earnings";
  const periodLabel = earningPeriodLabel(pick?.periodKey || null, preset, range);
  const chartAgentId = pick?.agentId ?? null;
  const chartValues = columns.map((column) => {
    if (!chartAgentId) return columnTotals[column.key] || 0;
    return rows.find((row) => row.agentId === chartAgentId)?.amounts[column.key] || 0;
  });
  const priorColumns = useMemo(() => periodColumns(priorRange), [priorRange]);
  const priorChartValues = useMemo(
    () => earningPeriodTotals(deals, payments, priorRange, excludeTeamLeads, teamLeadIds, payeePicked, chartAgentId, statusFilter),
    [chartAgentId, deals, excludeTeamLeads, payments, payeePicked, priorRange, statusFilter, teamLeadIds],
  );
  const scoreSums = useMemo(() => {
    if (!chartAgentId) return sums;
    let total = 0;
    let closed = 0;
    let pending = 0;
    lines.forEach((line) => {
      if (line.agentId !== chartAgentId) return;
      total += line.amount;
      const status = line.deal.status.trim().toLowerCase();
      if (status === 'closed') closed += line.amount;
      else if (status === 'pending') pending += line.amount;
    });
    return { total, closed, pending };
  }, [chartAgentId, lines, sums]);
  const scorePrior = useMemo(
    () => (chartAgentId ? earningSums(deals, payments, priorRange, excludeTeamLeads, teamLeadIds, payeePicked, chartAgentId) : priorSums),
    [chartAgentId, deals, excludeTeamLeads, payments, payeePicked, priorRange, priorSums, teamLeadIds],
  );
  const periodSums = useMemo(() => {
    const key = pick?.periodKey;
    if (!key) return { total: 0, closed: 0, pending: 0 };
    let total = 0;
    let closed = 0;
    let pending = 0;
    lines.forEach((line) => {
      if (line.periodKey !== key) return;
      if (chartAgentId && line.agentId !== chartAgentId) return;
      total += line.amount;
      const status = line.deal.status.trim().toLowerCase();
      if (status === 'closed') closed += line.amount;
      else if (status === 'pending') pending += line.amount;
    });
    return { total, closed, pending };
  }, [chartAgentId, lines, pick?.periodKey]);
  const periodPrior = useMemo(() => {
    const key = pick?.periodKey;
    if (!key) return { total: 0, closed: 0, pending: 0 };
    const index = columns.findIndex((column) => column.key === key);
    const priorKey = priorColumns[index]?.key || '';
    if (!priorKey) return { total: 0, closed: 0, pending: 0 };
    return earningPeriodSums(deals, payments, priorRange, priorKey, excludeTeamLeads, teamLeadIds, payeePicked, chartAgentId);
  }, [chartAgentId, columns, deals, excludeTeamLeads, payeePicked, payments, pick?.periodKey, priorColumns, priorRange, teamLeadIds]);
  const entirePeriodName = DATE_PRESETS.find((item) => item.id === preset)?.label || formatFilterSpan(range);
  const selectPeriod = (periodKey: string) => {
    setPick((current) => (current ? { agentId: current.agentId, periodKey } : { agentId: null, periodKey }));
  };
  useLayoutEffect(() => {
    const fit = (scroll: boolean) => {
      const pivot = pivotWrapRef.current;
      const detail = detailWrapRef.current;
      if (pivot) {
        pivot.style.maxHeight = '';
        pivot.style.height = '';
      }
      if (detail) {
        detail.style.maxHeight = '';
        detail.style.height = '';
      }
      if (!pick) clearReportDetailPad(pivot);
      if (pick && scroll) scrollUnderChrome(blockRef.current);
    };
    fit(true);
    syncPivotFoot();
    const onResize = () => {
      fit(false);
      syncPivotFoot();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, { passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize);
    };
  }, [pick, ordered.length, columns.length]);
  return (
    <div ref={blockRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="shrink-0 space-y-4">
      <SectionHeading
        action={pick ? (
          <button type="button" onClick={() => setPick(null)} className="all-agents-enter inline-flex h-full cursor-pointer items-center gap-1.5 rounded-l-full bg-black/5 dark:bg-white/10 px-4 text-xs font-semibold normal-case tracking-normal text-inherit transition-colors duration-150 hover:bg-emerald-200 hover:text-emerald-950">
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            All Agents
          </button>
        ) : undefined}
        end={(
          <button
            key={pick ? 'open' : 'all'}
            type="button"
            aria-expanded={summaryOpen}
            aria-label={summaryOpen ? 'Hide Scorecards and Chart' : 'Show Scorecards and Chart'}
            title={summaryOpen ? 'Hide Scorecards and Chart' : 'Show Scorecards and Chart'}
            onClick={() => setSummaryOpen((open) => !open)}
            className="all-agents-enter-right inline-flex h-full cursor-pointer items-center justify-center rounded-r-full bg-black/5 dark:bg-white/10 px-4 text-inherit transition-colors duration-150 hover:bg-emerald-200 hover:text-emerald-950"
          >
            {summaryOpen ? <ChevronUp className="h-4 w-4" strokeWidth={2.5} aria-hidden /> : <ChevronDown className="h-4 w-4" strokeWidth={2.5} aria-hidden />}
          </button>
        )}
      >{agentName || 'Agent Earnings'}</SectionHeading>
      {summaryOpen ? (
      <div className={`grid transition-[grid-template-columns,gap] duration-500 ease-out motion-reduce:transition-none ${pick ? 'items-stretch gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.2fr)]' : 'items-start gap-0 lg:grid-cols-1'}`}>
        <div className={`min-w-0 transition-all duration-500 ease-out motion-reduce:transition-none ${pick ? 'flex w-full flex-col justify-between gap-4' : 'lg:mx-auto lg:w-[calc(50%-0.5rem)]'}`}>
          <div className={pick ? 'rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900' : undefined}>
            {pick ? <p className="mb-3 truncate rounded-full px-4 py-1.5 text-center text-xs font-semibold report-pill-emerald" title={`Entire Period (${entirePeriodName})`}>{`Entire Period (${entirePeriodName})`}</p> : null}
            <EarningScoreRow sums={scoreSums} prior={scorePrior} statusFilter={statusFilter} onSelect={selectStatus} />
          </div>
          {pick?.periodKey ? (
            <div className="earnings-period-enter rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <p className="mb-3 truncate rounded-full px-4 py-1.5 text-center text-xs font-semibold report-pill-emerald" title={periodLabel}>{periodLabel}</p>
              <EarningScoreRow sums={periodSums} prior={periodPrior} statusFilter={statusFilter} onSelect={selectStatus} />
            </div>
          ) : null}
        </div>
        {pick ? (
          <div className="earnings-chart-enter min-w-0 self-stretch">
            <EarningsTimeline columns={columns} values={chartValues} priorColumns={priorColumns} priorValues={priorChartValues} selectedKey={pick.periodKey} onSelect={selectPeriod} onClear={() => setPick((current) => (current ? { agentId: current.agentId, periodKey: null } : null))} />
          </div>
        ) : null}
      </div>
      ) : null}
      </div>
      {pick ? null : (
      <div ref={pivotWrapRef} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div
          className="report-table report-table-fit min-h-0 flex-1 rounded-none border-0"
          onScroll={(event) => {
            if (pivotFootScrollRef.current) pivotFootScrollRef.current.scrollLeft = event.currentTarget.scrollLeft;
          }}
        >
          <table ref={pivotBodyRef} className="pin-col-2 w-full text-xs">
            <thead className={earningHead}>
              <tr>
                <SortHead column="rank" label="#" sort={sort} onSort={toggle} align="right" className={earningHeadCell} />
                <SortHead column="agent" label="Agent" sort={sort} onSort={toggle} className={earningHeadCell} />
                {columns.map((column) => (
                  <SortHead key={column.key} column={column.key} label={column.label} sort={sort} onSort={toggle} align="right" className={earningHeadCell} />
                ))}
                <SortHead column="total" label="Total" sort={sort} onSort={toggle} align="right" className={`${earningHeadCell} pivot-total`} />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && !showTotal ? (
                <tr><td className="px-3 py-6 text-slate-500" colSpan={columns.length + 3}>No agent earnings in this date range.</td></tr>
              ) : visible.map((row, index) => (
                <tr key={row.agentId} className={earningRowClass(index, Boolean(pick && pick.agentId === row.agentId))}>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{row.rank}</td>
                  <td className="px-3 py-1.5 font-medium whitespace-nowrap">{row.name}</td>
                  {columns.map((column) => (
                    <EarningCell
                      key={column.key}
                      amount={row.amounts[column.key] || 0}
                      scale={cellPeak}
                      selected={selected(row.agentId, column.key)}
                      onSelect={() => choose(row.agentId, column.key)}
                      className="px-2 py-1.5 text-right"
                    />
                  ))}
                  <EarningCell
                    amount={row.total}
                    scale={rowPeak}
                    selected={selected(row.agentId, null)}
                    onSelect={() => choose(row.agentId, null)}
                    className="pivot-total px-3 py-1.5 text-right"
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {showTotal ? (
          <div ref={pivotFootScrollRef} data-pivot-foot="" className={`shrink-0 overflow-x-hidden border-t border-slate-200 font-bold dark:border-slate-700 ${pick && !pick.agentId ? 'bg-emerald-50 dark:bg-emerald-950/45' : 'bg-slate-200 dark:bg-slate-700'}`}>
            <table ref={pivotFootRef} className="text-xs font-bold">
              <tbody>
                <tr>
                  <td className="px-2 py-2" />
                  <td className="px-3 py-2">Total</td>
                  {columns.map((column) => (
                    <EarningCell
                      key={column.key}
                      amount={columnTotals[column.key] || 0}
                      scale={monthPeak}
                      selected={selected(null, column.key)}
                      onSelect={() => choose(null, column.key)}
                      className="px-2 py-2 text-right whitespace-nowrap"
                    />
                  ))}
                  <EarningCell
                    amount={grand}
                    scale={grand}
                    selected={selected(null, null)}
                    onSelect={() => choose(null, null)}
                    className="pivot-total px-3 py-2 text-right whitespace-nowrap"
                  />
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
      )}
      {pick ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
          <p className="shrink-0 text-sm text-slate-500">{subject}: {periodLabel}.</p>
          <EarningTransactions lines={shown} names={names} wrapRef={detailWrapRef} />
        </div>
      ) : null}
    </div>
  );
}

const earningHead = 'report-head-dark text-xs font-medium normal-case';
const earningHeadCell = 'px-2 py-2 text-xs font-medium';

function earningRowClass(index: number, selected: boolean, total = false): string {
  if (selected) return 'bg-emerald-50 dark:bg-emerald-950/45';
  if (total) return 'bg-slate-200 font-bold dark:bg-slate-700';
  if (index % 2 === 1) return 'bg-slate-100 dark:bg-slate-800';
  return 'bg-white dark:bg-slate-900';
}

function scrollUnderChrome(node: HTMLElement | null) {
  if (!node) return;
  clearReportDetailPad(node);
  const chrome = node.closest('main')?.querySelector<HTMLElement>('.sticky.top-0');
  const offset = (chrome?.getBoundingClientRect().height ?? 0) + 12;
  const top = node.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function clearReportDetailPad(node: HTMLElement | null) {
  const main = node?.closest('main');
  if (main instanceof HTMLElement) main.style.paddingBottom = '';
}

function EarningCell({
  amount,
  scale,
  selected,
  onSelect,
  className,
}: {
  amount: number;
  scale: number;
  selected: boolean;
  onSelect: () => void;
  className: string;
}) {
  const share = amount > 0 && scale > 0 ? Math.min(1, amount / scale) : 0;
  return (
    <td className={className}>
      <span className="inline-flex flex-col items-end">
        <EarningAmount amount={amount} selected={selected} onSelect={onSelect} />
        <span className="relative mt-0.5 mr-1 h-1 w-[calc(100%-0.5rem)]" aria-hidden>
          {share > 0 ? <span className="absolute inset-y-0 right-0 rounded-full bg-emerald-400 dark:bg-emerald-500/70" style={{ width: share >= 1 ? '100%' : `max(${share * 100}%, 2px)` }} /> : null}
        </span>
      </span>
    </td>
  );
}

function EarningAmount({ amount, selected, onSelect }: { amount: number; selected: boolean; onSelect: () => void }) {
  if (!amount) return <span className="text-slate-400">—</span>;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`cursor-pointer rounded px-1 py-0.5 font-medium tabular-nums whitespace-nowrap [outline:none] hover:underline focus-visible:shadow-[0_0_0_2px_rgb(16_185_129/0.45)] ${selected ? 'bg-emerald-500/15 font-bold text-emerald-700 dark:text-emerald-300' : 'bg-transparent text-inherit'}`}
    >
      {fullMoney(amount)}
    </button>
  );
}

function EarningTransactions({ lines, names, wrapRef }: { lines: Array<{ key: string; agentName: string; deal: ReportDeal; amount: number }>; names: Map<string, string>; wrapRef?: React.Ref<HTMLDivElement> }) {
  const { sort, toggle } = useColumnSort({ key: 'closing', direction: 'asc' });
  const ranked = [...lines]
    .sort((a, b) => (a.deal.closingDate?.getTime() || 0) - (b.deal.closingDate?.getTime() || 0))
    .map((line, index) => ({ ...line, rank: index + 1 }));
  const ordered = sortBy(ranked, sort, (line, key) => {
    if (key === 'rank') return line.rank;
    if (key === 'agent') return line.agentName;
    if (key === 'primary') return names.get(line.deal.agentId) || '';
    if (key === 'address') return line.deal.address;
    if (key === 'side') return line.deal.side;
    if (key === 'client') return line.deal.clientName;
    if (key === 'status') return line.deal.status;
    if (key === 'closing') return line.deal.closingDate?.getTime() || 0;
    if (key === 'price') return line.deal.salesPrice;
    if (key === 'gci') return line.deal.gciAmount;
    return line.amount;
  });
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const bodyRef = useRef<HTMLTableElement>(null);
  const footRef = useRef<HTMLTableElement>(null);
  const footScrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const foot = footRef.current;
    if (!body || !foot) return;
    const headerCells = [...body.querySelectorAll('thead th')] as HTMLElement[];
    const footCells = [...foot.querySelectorAll('td')] as HTMLElement[];
    const sync = () => {
      headerCells.forEach((cell) => { cell.style.minWidth = ''; });
      footCells.forEach((cell) => {
        cell.style.width = '';
        cell.style.minWidth = '';
        cell.style.maxWidth = '';
      });
      foot.style.width = 'max-content';
      const headerWidths = headerCells.map((cell) => cell.getBoundingClientRect().width);
      const contentWidths = footCells.map((cell) => cell.getBoundingClientRect().width);
      headerCells.forEach((cell, index) => {
        const needed = contentWidths[index] || 0;
        if (needed > headerWidths[index] + 1) cell.style.minWidth = `${Math.ceil(needed)}px`;
      });
      const fitted = headerCells.map((cell) => cell.getBoundingClientRect().width);
      foot.style.width = `${body.scrollWidth}px`;
      footCells.forEach((cell, index) => {
        const width = `${fitted[index] || 0}px`;
        cell.style.width = width;
        cell.style.minWidth = width;
        cell.style.maxWidth = width;
      });
    };
    sync();
    const scroller = body.parentElement;
    if (!scroller) return;
    const observer = new ResizeObserver(sync);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [ordered, total]);
  const totalCells = (
    <>
      <td className="px-2 py-2" />
      <td className="px-3 py-2">Total</td>
      <td className="px-3 py-2" />
      <td className="px-3 py-2" />
      <td className="px-3 py-2" />
      <td className="px-3 py-2" />
      <td className="px-3 py-2" />
      <td className="px-3 py-2" />
      <td className="px-3 py-2" />
      <td className="px-3 py-2" />
      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{ordered.length > 0 ? fullMoney(total) : ''}</td>
    </>
  );
  return (
    <div ref={wrapRef} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div
        className="report-table report-table-fit min-h-0 flex-1 rounded-none border-0"
        onScroll={(event) => {
          if (footScrollRef.current) footScrollRef.current.scrollLeft = event.currentTarget.scrollLeft;
        }}
      >
        <table ref={bodyRef} className="pin-col-2 w-full text-xs">
          <thead className={earningHead}>
            <tr>
              <SortHead column="rank" label="#" sort={sort} onSort={toggle} align="right" className={earningHeadCell} />
              <SortHead column="agent" label="Agent" sort={sort} onSort={toggle} className={earningHeadCell} />
              <SortHead column="primary" label="Primary Agent" sort={sort} onSort={toggle} className={earningHeadCell} />
              <SortHead column="address" label="Address" sort={sort} onSort={toggle} className={earningHeadCell} />
              <SortHead column="side" label="Side" sort={sort} onSort={toggle} className={earningHeadCell} />
              <SortHead column="client" label="Client" sort={sort} onSort={toggle} className={earningHeadCell} />
              <SortHead column="status" label="Status" sort={sort} onSort={toggle} className={earningHeadCell} />
              <SortHead column="closing" label="Closing Date" sort={sort} onSort={toggle} className={earningHeadCell} />
              <SortHead column="price" label="Sales Price" sort={sort} onSort={toggle} align="right" className={earningHeadCell} />
              <SortHead column="gci" label="GCI" sort={sort} onSort={toggle} align="right" className={earningHeadCell} />
              <SortHead column="earnings" label="Earnings" sort={sort} onSort={toggle} align="right" className={earningHeadCell} />
            </tr>
          </thead>
          <tbody>
            {ordered.length === 0 ? (
              <tr><td className="px-3 py-6 text-slate-500" colSpan={11}>No transactions for this amount.</td></tr>
            ) : ordered.map((line, index) => (
              <tr key={line.key ? `${line.key}-${index}` : `${line.deal.id}-${index}`} className={earningRowClass(index, false)}>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{line.rank}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{line.agentName}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{names.get(line.deal.agentId) || '—'}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{line.deal.address || '—'}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{line.deal.side || '—'}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{line.deal.clientName || '—'}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{line.deal.status || '—'}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{line.deal.closingDate ? line.deal.closingDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{fullMoney(line.deal.salesPrice)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{fullMoney(line.deal.gciAmount)}</td>
                <td className="px-3 py-1.5 text-right font-medium tabular-nums whitespace-nowrap">{fullMoney(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ordered.length > 0 ? (
        <div ref={footScrollRef} data-earning-foot="" className="shrink-0 overflow-x-hidden border-t border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-700">
          <table ref={footRef} className="text-xs font-bold">
            <tbody>
              <tr>{totalCells}</tr>
            </tbody>
          </table>
        </div>
      ) : null}
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
        <Stat label="Listings Taken" value={unitsLabel(props.taken.length)} />
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
  'Total Commission': `Sum of Total Commission on Closed transactions whose closing date is in this date range.${VERSUS_LAST_YEAR}`,
  'Cost of Sales': `Total commission minus net commission income.${VERSUS_LAST_YEAR}`,
  'Net Commission Income': `Sum of payments on those Closed transactions to agents marked as team leads. Archived payments are excluded.${VERSUS_LAST_YEAR}`,
  'Operating Expenses': 'Shown as $0 until the Operating Expenses module is added.',
  'Net Income': `Net commission income minus operating expenses. This is the bottom line.${VERSUS_LAST_YEAR}`,
  'ROI': 'Net income divided by operating expenses. A dash is shown when operating expenses are $0.',
  'NI/TC': `Net Income divided by Total Commission.${VERSUS_LAST_YEAR}`,
  'listing:Avg. Sales Price': `Average sales price of Closed Seller transactions whose closing date is in this date range.${VERSUS_LAST_YEAR}`,
  'listing:Avg. GCI': `Average GCI of Closed Seller transactions whose closing date is in this date range.${VERSUS_LAST_YEAR}`,
  'listing:Avg. GCI %': `Total GCI divided by total sales price for Closed Seller transactions whose closing date is in this date range.${VERSUS_LAST_YEAR}`,
  'buyer:Avg. Sales Price': `Average sales price of Closed Buyer transactions whose closing date is in this date range.${VERSUS_LAST_YEAR}`,
  'buyer:Avg. GCI': `Average GCI of Closed Buyer transactions whose closing date is in this date range.${VERSUS_LAST_YEAR}`,
  'buyer:Avg. GCI %': `Total GCI divided by total sales price for Closed Buyer transactions whose closing date is in this date range.${VERSUS_LAST_YEAR}`,
};

function ScoreNote({ label, text, onOpenChange, className = 'absolute right-1.5 top-1.5 z-20', align = 'right', iconClass = 'text-slate-400 transition hover:text-emerald-600 dark:hover:text-emerald-300', wide = false }: {
  label: string;
  text: string;
  /** A larger icon and a wider note in body text, for a report's description beside its title. */
  wide?: boolean;
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
        swallowOutsideFilters(event.target);
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
        <Info className={wide ? 'h-4.5 w-4.5' : 'h-3.5 w-3.5'} aria-hidden="true" />
      </button>
      {open ? (
        <p role="tooltip" className={`absolute top-full z-30 mt-1 ${wide ? 'w-80 max-w-[calc(100vw-2rem)] p-3 text-xs' : 'w-56 p-2.5 text-2xs'} rounded-lg border border-slate-200 bg-white text-left font-medium normal-case leading-snug tracking-normal text-slate-600 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${align === 'left' ? 'left-0' : 'right-0'}`}>
          {text}
        </p>
      ) : null}
    </div>
  );
}

function CapStickyHeading({ section, labels, asOf, previous, openAgentId, onClose }: {
  section: { cap: TeamCapDefinition; rows: CapStanding[] };
  labels: Map<string, string>;
  asOf: string;
  previous: boolean;
  openAgentId: string | null;
  onClose: () => void;
}) {
  const open = section.rows.find((row) => row.agentId === openAgentId) || null;
  const resetLabel = section.cap.resetDateFieldKey ? (labels.get(section.cap.resetDateFieldKey) || 'the reset date') : 'the reset date';
  const measured = previous ? `Previous cap year, measured from ${formatLong(asOf)}.` : `Data as of ${formatLong(asOf)}.`;
  return (
    <div className="mt-4">
      <SectionHeading
        tone="slate"
        note={`${measured} Closed and pending contributions in that year. Click an agent for the transactions.`}
        action={open ? (
          <button type="button" onClick={onClose} className="all-agents-enter inline-flex h-full cursor-pointer items-center gap-1.5 rounded-l-full bg-black/5 dark:bg-white/10 px-4 text-xs font-semibold normal-case tracking-normal text-inherit transition-colors duration-150 hover:bg-slate-300/70 hover:text-slate-900 dark:hover:bg-slate-700 dark:hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            All Agents
          </button>
        ) : undefined}
      >
        {open ? open.agentName : section.cap.name}
      </SectionHeading>
      <p className="mt-3 text-center text-sm text-slate-500">
        {open
          ? `${open.agentName} · ${formatUs(open.start)} – ${formatUs(open.end)}`
          : `Cap year from ${resetLabel}. Each row is that agent’s own anniversary.`}
      </p>
    </div>
  );
}

function SectionHeading({ children, note, action, end }: { children: React.ReactNode; tone?: 'emerald' | 'listing' | 'buyer' | 'volume' | 'blue' | 'units' | 'slate' | 'rate' | 'price' | 'team'; note?: string; action?: React.ReactNode; end?: React.ReactNode }) {
  // Every section pill is neutral grey (report-requirements.mdc, Colors); `tone` is kept so callers need not change.
  const fill = 'report-pill-slate';
  return (
    <h3 className="relative w-full">
      <div className={`rounded-full text-center text-sm font-semibold ${fill} ${action || end ? 'grid grid-cols-[1fr_auto_1fr] items-stretch overflow-hidden' : 'px-4 py-2 max-md:px-3 max-md:py-1'}`}>
        {action || end ? <div className="justify-self-start">{action}</div> : null}
        {action || end ? <span className="flex items-center justify-center px-4 py-2 max-md:px-2 max-md:py-1">{children}</span> : children}
        {end ? <div className="justify-self-end self-stretch">{end}</div> : null}
      </div>
      {note ? (
        <ScoreNote
          label={typeof children === 'string' ? children : 'section'}
          text={note}
          className="absolute right-3 top-1/2 z-20 -translate-y-1/2"
          align="right"
          iconClass="opacity-70 transition hover:opacity-100"
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
    : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';
  const amountClass = tone === 'result' ? 'text-emerald-800 dark:text-emerald-200' : '';
  return (
    <div key={pulse} data-score-card className={`relative flex h-full min-w-0 w-full flex-col justify-center rounded-xl border px-1.5 py-3 text-center md:px-3 ${noteOpen ? 'z-30' : ''} ${shell} ${pulse > 0 ? 'scorecard-pulse' : ''}`}>
      {note ? <ScoreNote label={label} text={note} onOpenChange={setNoteOpen} /> : null}
      <p className="px-3 text-2xs font-medium text-slate-500 md:px-4 md:text-sm dark:text-slate-400">{label}</p>
      <FitText full={full} compact={compact} className={`mt-1 text-base font-extrabold tabular-nums whitespace-nowrap md:text-xl ${amountClass}`} />
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
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-extrabold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function Figure({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${emphasis ? 'bg-emerald-500/10' : 'bg-slate-100 dark:bg-slate-800'}`}>
      <p className="text-2xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="font-bold tabular-nums">{value}</p>
    </div>
  );
}

function CellNumber({
  rowKey,
  column,
  display,
  drilldown,
  onDrilldown,
  className = '',
}: {
  rowKey: string;
  column: keyof OwnerMonthRow;
  display: string;
  drilldown?: { rowKey: string; column: keyof OwnerMonthRow } | null;
  onDrilldown?: (rowKey: string, column: keyof OwnerMonthRow) => void;
  className?: string;
}) {
  const isSelected = drilldown?.rowKey === rowKey && drilldown?.column === column;
  if (!onDrilldown) {
    return <span className={`tabular-nums ${className}`}>{display}</span>;
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onDrilldown(rowKey, column);
      }}
      aria-pressed={isSelected}
      className={`cursor-pointer rounded px-1.5 py-0.5 tabular-nums transition-colors hover:underline hover:text-emerald-700 dark:hover:text-emerald-300 ${
        isSelected
          ? 'bg-emerald-500/20 font-bold text-emerald-800 dark:text-emerald-200 ring-1 ring-emerald-500/50'
          : 'text-inherit'
      } ${className}`}
    >
      {display}
    </button>
  );
}

function MonthTable({
  rows,
  selectedMonth,
  onSelectMonth,
  periodLabel,
  pinTotal = false,
  drilldown = null,
  onDrilldown,
}: {
  rows: OwnerMonthRow[];
  selectedMonth: string | null;
  onSelectMonth: (key: string) => void;
  periodLabel: string;
  pinTotal?: boolean;
  drilldown?: { rowKey: string; column: keyof OwnerMonthRow } | null;
  onDrilldown?: (rowKey: string, column: keyof OwnerMonthRow) => void;
}) {
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

  const isTotalDrilldown = drilldown?.rowKey === 'total';
  const body = drilldown
    ? (isTotalDrilldown ? [total] : ordered.filter((r) => r.key === drilldown.rowKey))
    : (pinTotal ? ordered : [...ordered, total]);

  const count = (value: number) => value.toLocaleString();
  const bodyRef = useRef<HTMLTableElement>(null);
  const footRef = useRef<HTMLTableElement>(null);
  const footScrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!pinTotal || drilldown) return;
    const sync = () => {
      const table = bodyRef.current;
      const foot = footRef.current;
      if (!table || !foot) return;
      const widths = [...table.querySelectorAll('thead th')].map((cell) => cell.getBoundingClientRect().width);
      foot.style.width = `${table.scrollWidth}px`;
      [...foot.querySelectorAll('td')].forEach((cell, index) => {
        const width = `${widths[index] || 0}px`;
        cell.style.width = width;
        cell.style.minWidth = width;
        cell.style.maxWidth = width;
      });
    };
    sync();
    const observer = new ResizeObserver(sync);
    if (bodyRef.current) observer.observe(bodyRef.current);
    window.addEventListener('resize', sync);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [pinTotal, ordered, periodLabel, drilldown]);
  const table = (
    <div className={pinTotal && !drilldown ? 'flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900' : 'overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}>
      <div
        data-production-fit={pinTotal && !drilldown ? '' : undefined}
        className={pinTotal && !drilldown ? 'report-table report-table-fit min-h-0 rounded-none border-0' : 'report-table rounded-none border-0'}
        onScroll={pinTotal && !drilldown ? (event) => {
          if (footScrollRef.current) footScrollRef.current.scrollLeft = event.currentTarget.scrollLeft;
        } : undefined}
      >
      <table ref={bodyRef} className="pin-col-1 w-full text-xs">
        <thead className="report-head-dark text-xs font-medium normal-case">
          <tr>
            <SortHead column="month" label={periodLabel} sort={sort} onSort={toggle} className="sticky left-0 z-10 px-2 py-2 text-xs font-medium" />
            <SortHead column="closedUnits" label="Closed Units" sort={sort} onSort={toggle} align="right" width="wide" className="px-1.5 py-2 text-xs font-medium" />
            <SortHead column="closedVolume" label="Closed Volume" sort={sort} onSort={toggle} align="right" width="wide" className="px-1.5 py-2 text-xs font-medium" />
            <SortHead column="closedCommission" label="Closed Total Comm." title="Closed total commission" sort={sort} onSort={toggle} align="right" width="wide" className="px-1.5 py-2 text-xs font-medium" />
            <SortHead column="closedNet" label="Closed Net Comm." title="Closed net commission income" sort={sort} onSort={toggle} align="right" width="wide" className="px-1.5 py-2 text-xs font-medium" />
            <SortHead column="expenses" label={'Operating\nExpenses'} sort={sort} onSort={toggle} align="right" width="wide" className="px-1.5 py-2 text-xs font-medium" />
            <SortHead column="closedNetIncome" label="Closed Net Income" sort={sort} onSort={toggle} align="right" width="wide" className="px-1.5 py-2 text-xs font-medium" />
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
                  ? 'bg-slate-100 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-emerald-950/60'
                  : 'bg-white hover:bg-emerald-50 dark:bg-slate-900 dark:hover:bg-emerald-950/60';
            const stickyClass = isSelected
              ? 'bg-emerald-100 dark:bg-emerald-950'
              : isTotal
                ? 'bg-slate-200 group-hover/month:bg-emerald-100 dark:bg-slate-700 dark:group-hover/month:bg-emerald-950'
                : striped
                  ? 'bg-slate-100 group-hover/month:bg-emerald-50 dark:bg-slate-800 dark:group-hover/month:bg-emerald-950'
                  : 'bg-white group-hover/month:bg-emerald-50 dark:bg-slate-900 dark:group-hover/month:bg-emerald-950';
            return (
            <tr
              key={row.key}
              aria-selected={isSelected}
              className={`group/month ${rowClass}`}
            >
              <td
                onClick={() => onSelectMonth(row.key)}
                className={`sticky left-0 z-10 cursor-pointer px-3 py-2 whitespace-nowrap hover:underline hover:text-emerald-700 dark:hover:text-emerald-300 ${stickyClass}`}
              >
                {row.label}
              </td>
              <td className="px-3 py-2 text-right">
                <CellNumber rowKey={row.key} column="closedUnits" display={count(row.closedUnits)} drilldown={drilldown} onDrilldown={onDrilldown} />
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <CellNumber rowKey={row.key} column="closedVolume" display={fullMoney(row.closedVolume)} drilldown={drilldown} onDrilldown={onDrilldown} />
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <CellNumber rowKey={row.key} column="closedCommission" display={fullMoney(row.closedCommission)} drilldown={drilldown} onDrilldown={onDrilldown} />
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <CellNumber rowKey={row.key} column="closedNet" display={fullMoney(row.closedNet)} drilldown={drilldown} onDrilldown={onDrilldown} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums">—</td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fullMoney(row.closedNet)}</td>
              <td className="px-3 py-2 text-right">
                <CellNumber rowKey={row.key} column="listingsTaken" display={count(row.listingsTaken)} drilldown={drilldown} onDrilldown={onDrilldown} />
              </td>
              <td className="px-3 py-2 text-right">
                <CellNumber rowKey={row.key} column="listingsPended" display={count(row.listingsPended)} drilldown={drilldown} onDrilldown={onDrilldown} />
              </td>
              <td className="px-3 py-2 text-right">
                <CellNumber rowKey={row.key} column="listingsClosed" display={count(row.listingsClosed)} drilldown={drilldown} onDrilldown={onDrilldown} />
              </td>
              <td className="px-3 py-2 text-right">
                <CellNumber rowKey={row.key} column="buyersPended" display={count(row.buyersPended)} drilldown={drilldown} onDrilldown={onDrilldown} />
              </td>
              <td className="px-3 py-2 text-right">
                <CellNumber rowKey={row.key} column="buyersClosed" display={count(row.buyersClosed)} drilldown={drilldown} onDrilldown={onDrilldown} />
              </td>
              <td className="px-3 py-2 text-right">
                <CellNumber rowKey={row.key} column="pendingUnits" display={count(row.pendingUnits)} drilldown={drilldown} onDrilldown={onDrilldown} />
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <CellNumber rowKey={row.key} column="pendingVolume" display={fullMoney(row.pendingVolume)} drilldown={drilldown} onDrilldown={onDrilldown} />
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <CellNumber rowKey={row.key} column="pendingCommission" display={fullMoney(row.pendingCommission)} drilldown={drilldown} onDrilldown={onDrilldown} />
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <CellNumber rowKey={row.key} column="pendingNet" display={fullMoney(row.pendingNet)} drilldown={drilldown} onDrilldown={onDrilldown} />
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      {pinTotal && !drilldown ? (
        <div
          ref={footScrollRef}
          data-production-foot=""
          className="shrink-0 overflow-x-auto border-t border-slate-200 bg-slate-200 font-bold dark:border-slate-700 dark:bg-slate-700 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={(event) => {
            const scroller = event.currentTarget.previousElementSibling;
            if (scroller instanceof HTMLElement) scroller.scrollLeft = event.currentTarget.scrollLeft;
          }}
        >
          <table ref={footRef} className="text-xs font-bold">
            <tbody>
              <tr>
                <td
                  onClick={() => onSelectMonth(total.key)}
                  className="sticky left-0 z-10 cursor-pointer bg-slate-200 px-3 py-2 whitespace-nowrap hover:underline hover:text-emerald-700 dark:bg-slate-700 dark:hover:text-emerald-300"
                >
                  {total.label}
                </td>
                <td className="px-3 py-2 text-right">
                  <CellNumber rowKey={total.key} column="closedUnits" display={count(total.closedUnits)} drilldown={drilldown} onDrilldown={onDrilldown} />
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <CellNumber rowKey={total.key} column="closedVolume" display={fullMoney(total.closedVolume)} drilldown={drilldown} onDrilldown={onDrilldown} />
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <CellNumber rowKey={total.key} column="closedCommission" display={fullMoney(total.closedCommission)} drilldown={drilldown} onDrilldown={onDrilldown} />
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <CellNumber rowKey={total.key} column="closedNet" display={fullMoney(total.closedNet)} drilldown={drilldown} onDrilldown={onDrilldown} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">—</td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fullMoney(total.closedNet)}</td>
                <td className="px-3 py-2 text-right">
                  <CellNumber rowKey={total.key} column="listingsTaken" display={count(total.listingsTaken)} drilldown={drilldown} onDrilldown={onDrilldown} />
                </td>
                <td className="px-3 py-2 text-right">
                  <CellNumber rowKey={total.key} column="listingsPended" display={count(total.listingsPended)} drilldown={drilldown} onDrilldown={onDrilldown} />
                </td>
                <td className="px-3 py-2 text-right">
                  <CellNumber rowKey={total.key} column="listingsClosed" display={count(total.listingsClosed)} drilldown={drilldown} onDrilldown={onDrilldown} />
                </td>
                <td className="px-3 py-2 text-right">
                  <CellNumber rowKey={total.key} column="buyersPended" display={count(total.buyersPended)} drilldown={drilldown} onDrilldown={onDrilldown} />
                </td>
                <td className="px-3 py-2 text-right">
                  <CellNumber rowKey={total.key} column="buyersClosed" display={count(total.buyersClosed)} drilldown={drilldown} onDrilldown={onDrilldown} />
                </td>
                <td className="px-3 py-2 text-right">
                  <CellNumber rowKey={total.key} column="pendingUnits" display={count(total.pendingUnits)} drilldown={drilldown} onDrilldown={onDrilldown} />
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <CellNumber rowKey={total.key} column="pendingVolume" display={fullMoney(total.pendingVolume)} drilldown={drilldown} onDrilldown={onDrilldown} />
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <CellNumber rowKey={total.key} column="pendingCommission" display={fullMoney(total.pendingCommission)} drilldown={drilldown} onDrilldown={onDrilldown} />
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <CellNumber rowKey={total.key} column="pendingNet" display={fullMoney(total.pendingNet)} drilldown={drilldown} onDrilldown={onDrilldown} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
  return table;
}

function ProductionDrilldownTable({
  items,
  metric,
  names,
}: {
  items: ProductionDrilldownItem[];
  metric: keyof OwnerMonthRow;
  names: Map<string, string>;
}) {
  const dateColLabel = metric === 'listingsTaken'
    ? 'List Date'
    : metric === 'listingsPended' || metric === 'buyersPended'
      ? 'Pending Date'
      : 'Closing Date';

  const showNet = metric === 'closedNet' || metric === 'pendingNet';
  const { sort, toggle } = useColumnSort({ key: 'date', direction: 'asc' });

  const ranked = [...items]
    .sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0))
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const ordered = sortBy(ranked, sort, (item, key) => {
    if (key === 'rank') return item.rank;
    if (key === 'status') return item.deal.status;
    if (key === 'agent') return names.get(item.deal.agentId) || '';
    if (key === 'side') return item.deal.side;
    if (key === 'address') return item.deal.address;
    if (key === 'date') return item.date?.getTime() || 0;
    if (key === 'price') return item.deal.salesPrice || item.deal.listPrice || 0;
    if (key === 'commission') return item.deal.totalCommission;
    if (key === 'net') return item.net;
    if (key === 'source') return item.deal.leadSource;
    return 0;
  });

  const totalSalesPrice = items.reduce((sum, item) => sum + (item.deal.salesPrice || item.deal.listPrice || 0), 0);
  const totalCommission = items.reduce((sum, item) => sum + (item.deal.totalCommission || 0), 0);
  const totalNet = items.reduce((sum, item) => sum + item.net, 0);

  const bodyRef = useRef<HTMLTableElement>(null);
  const footRef = useRef<HTMLTableElement>(null);
  const footScrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const foot = footRef.current;
    if (!body || !foot) return;
    const headerCells = [...body.querySelectorAll('thead th')] as HTMLElement[];
    const footCells = [...foot.querySelectorAll('td')] as HTMLElement[];
    const sync = () => {
      headerCells.forEach((cell) => { cell.style.minWidth = ''; });
      footCells.forEach((cell) => {
        cell.style.width = '';
        cell.style.minWidth = '';
        cell.style.maxWidth = '';
      });
      foot.style.width = 'max-content';
      const headerWidths = headerCells.map((cell) => cell.getBoundingClientRect().width);
      const contentWidths = footCells.map((cell) => cell.getBoundingClientRect().width);
      headerCells.forEach((cell, index) => {
        const needed = contentWidths[index] || 0;
        if (needed > headerWidths[index] + 1) cell.style.minWidth = `${Math.ceil(needed)}px`;
      });
      const fitted = headerCells.map((cell) => cell.getBoundingClientRect().width);
      foot.style.width = `${body.scrollWidth}px`;
      footCells.forEach((cell, index) => {
        const width = `${fitted[index] || 0}px`;
        cell.style.width = width;
        cell.style.minWidth = width;
        cell.style.maxWidth = width;
      });
    };
    sync();
    const scroller = body.parentElement;
    if (!scroller) return;
    const observer = new ResizeObserver(sync);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [ordered, totalSalesPrice, totalCommission, totalNet]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div
        className="report-table report-table-fit min-h-0 flex-1 rounded-none border-0"
        onScroll={(event) => {
          if (footScrollRef.current) footScrollRef.current.scrollLeft = event.currentTarget.scrollLeft;
        }}
      >
        <table ref={bodyRef} className="pin-col-5 w-full text-xs">
          <thead className="report-head-dark text-xs font-medium normal-case">
            <tr>
              <SortHead column="rank" label="#" sort={sort} onSort={toggle} align="right" className="px-2 py-2 text-xs font-medium" />
              <SortHead column="status" label="Status" sort={sort} onSort={toggle} className="px-3 py-2 text-xs font-medium" />
              <SortHead column="agent" label="Primary Agent" sort={sort} onSort={toggle} className="px-3 py-2 text-xs font-medium" />
              <SortHead column="side" label="Side" sort={sort} onSort={toggle} className="px-3 py-2 text-xs font-medium" />
              <SortHead column="address" label="Property" sort={sort} onSort={toggle} className="px-3 py-2 text-xs font-medium" />
              <SortHead column="date" label={dateColLabel} sort={sort} onSort={toggle} className="px-3 py-2 text-xs font-medium" />
              <SortHead column="price" label="Sales Price" sort={sort} onSort={toggle} align="right" className="px-3 py-2 text-xs font-medium" />
              <SortHead column="commission" label="Total Comm." title="Total commission" sort={sort} onSort={toggle} align="right" className="px-3 py-2 text-xs font-medium" />
              {showNet ? (
                <SortHead column="net" label="Net Comm." title="Net commission to owner(s)" sort={sort} onSort={toggle} align="right" className="px-3 py-2 text-xs font-medium" />
              ) : null}
              <SortHead column="source" label="Lead Source" sort={sort} onSort={toggle} className="px-3 py-2 text-xs font-medium" />
            </tr>
          </thead>
          <tbody>
            {ordered.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={showNet ? 10 : 9}>
                  No transactions for this selection.
                </td>
              </tr>
            ) : (
              ordered.map((item, index) => {
                const statusLower = item.deal.status.trim().toLowerCase();
                const isPending = statusLower === 'pending';
                const isClosed = statusLower === 'closed';
                const statusBadge = isClosed
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                  : isPending
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                    : 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200';
                const striped = index % 2 === 1;
                const rowClass = striped ? 'bg-slate-100 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-emerald-950/60' : 'bg-white hover:bg-emerald-50 dark:bg-slate-900 dark:hover:bg-emerald-950/60';
                return (
                  <tr key={item.deal.id + '-' + index} className={rowClass}>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{item.rank}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-semibold ${statusBadge}`}>
                        {item.deal.status || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{names.get(item.deal.agentId) || '—'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{item.deal.side || '—'}</td>
                    <td className="px-3 py-1.5 min-w-[12rem] whitespace-nowrap">{item.deal.address || '—'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">
                      {item.date ? item.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{fullMoney(item.deal.salesPrice || item.deal.listPrice || 0)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{fullMoney(item.deal.totalCommission || 0)}</td>
                    {showNet ? (
                      <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap font-medium">{fullMoney(item.net)}</td>
                    ) : null}
                    <td className="px-3 py-1.5 whitespace-nowrap">{item.deal.leadSource || '—'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {ordered.length > 0 ? (
        <div
          ref={footScrollRef}
          className="shrink-0 overflow-x-hidden border-t border-slate-200 bg-slate-200 font-bold dark:border-slate-700 dark:bg-slate-700"
        >
          <table ref={footRef} className="text-xs font-bold">
            <tbody>
              <tr>
                <td className="px-2 py-2 text-right" />
                <td className="px-3 py-2">Total ({ordered.length})</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fullMoney(totalSalesPrice)}</td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fullMoney(totalCommission)}</td>
                {showNet ? (
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-bold">{fullMoney(totalNet)}</td>
                ) : null}
                <td className="px-3 py-2" />
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function sumOf(deals: ReportDeal[]): Totals {
  const total: Totals = { units: 0, volume: 0, gci: 0, commission: 0, agentPaid: 0, net: 0, teamGci: 0 };
  deals.forEach((deal) => addTotals(total, deal));
  return total;
}
