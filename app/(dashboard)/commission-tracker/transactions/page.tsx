// app/(dashboard)/commission-tracker/transactions/page.tsx

'use client';

import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { normalizeAgentName } from '@/lib/id';
import { formatPercent } from '@/lib/fields';

interface SchemaField {
  id?: string;
  field_key: string;
  field_label: string;
  field_type: string;
  section_name?: string;
  is_enabled?: boolean;
  dropdown_options?: string[];
}

interface StatusLookup {
  optionValue: string;
  optionLabel: string;
}

function normalizeStatus(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function dealMatchesStatus(deal: Record<string, any>, lookup: StatusLookup) {
  const statusVal = normalizeStatus(String(deal.transaction_status || deal.status || ''));
  const selectedValues = [normalizeStatus(lookup.optionValue), normalizeStatus(lookup.optionLabel)].filter(Boolean);
  return selectedValues.includes(statusVal);
}

const ALL_TAB = 'ALL';

type ScorecardTone = 'active' | 'pending' | 'closed' | 'cancelled';

const SCORECARD_TAB_STYLES: Record<ScorecardTone, { idle: string; active: string; countIdle: string; countActive: string; card: string }> = {
  active: {
    idle: 'text-blue-700 dark:text-blue-300 border border-transparent hover:bg-blue-500/10',
    active: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/40',
    countIdle: 'text-blue-600/70 dark:text-blue-300/70',
    countActive: 'text-blue-700 dark:text-blue-200',
    card: 'ring-2 ring-blue-500/70',
  },
  pending: {
    idle: 'text-amber-700 dark:text-amber-300 border border-transparent hover:bg-amber-500/10',
    active: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40',
    countIdle: 'text-amber-600/70 dark:text-amber-300/70',
    countActive: 'text-amber-700 dark:text-amber-200',
    card: 'ring-2 ring-amber-500/70',
  },
  closed: {
    idle: 'text-emerald-700 dark:text-emerald-300 border border-transparent hover:bg-emerald-500/10',
    active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40',
    countIdle: 'text-emerald-600/70 dark:text-emerald-300/70',
    countActive: 'text-emerald-700 dark:text-emerald-200',
    card: 'ring-2 ring-emerald-500/70',
  },
  cancelled: {
    idle: 'text-rose-700 dark:text-rose-300 border border-transparent hover:bg-rose-500/10',
    active: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/40',
    countIdle: 'text-rose-600/70 dark:text-rose-300/70',
    countActive: 'text-rose-700 dark:text-rose-200',
    card: 'ring-2 ring-rose-500/70',
  },
};

function scorecardTone(lookup: StatusLookup): ScorecardTone | null {
  const keys = [normalizeStatus(lookup.optionLabel), normalizeStatus(lookup.optionValue)];
  if (keys.includes('active')) return 'active';
  if (keys.includes('pending')) return 'pending';
  if (keys.includes('closed')) return 'closed';
  if (keys.includes('cancelled') || keys.includes('canceled')) return 'cancelled';
  return null;
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

function formatCompactCurrency(val: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(val);
}

function FitVolume({ value, className }: { value: number; className: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const [compact, setCompact] = useState(false);
  const full = formatCurrency(value);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const probe = probeRef.current;
    if (!box || !probe) return;

    const measure = () => {
      setCompact(probe.scrollWidth > box.clientWidth + 0.5);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    const fontsReady = document.fonts?.ready;
    fontsReady?.then(measure);

    return () => observer.disconnect();
  }, [full]);

  return (
    <div ref={boxRef} className="relative min-w-0">
      <span
        ref={probeRef}
        className={`pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap ${className}`}
        aria-hidden
      >
        {full}
      </span>
      <p className={`${className} whitespace-nowrap text-right`} title={full}>
        {compact ? formatCompactCurrency(value) : full}
      </p>
    </div>
  );
}

export default function TransactionsListPage() {
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>([]);
  const [deals, setDeals] = useState<Record<string, any>[]>([]);
  const [agentsList, setAgentsList] = useState<{ id: string; agent_name?: string; name?: string; [key: string]: any }[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showFilters, setShowFilters] = useState<boolean>(false);

  // Search & Global Tabs
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>(ALL_TAB);
  const [statusLookups, setStatusLookups] = useState<StatusLookup[]>([]);
  
  // Sorting
  const [sortField, setSortField] = useState<string>('closing_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Dynamic Column Filter Map { [field_key]: search_value }
  const [colFilters, setColFilters] = useState<Record<string, string>>({});

  // 1. Fetch Schema Fields & Transactions Data in Parallel
  useEffect(() => {
    async function initData() {
      try {
        setIsLoading(true);

        // NOTE: Replace 'DEMO' here with your frontend auth state variable 
        // (e.g., currentUser.client_id or activeOrganization.id) once you wire up a SessionProvider
        const activeClientId = 'DEMO'; 

        const fetchOptions = {
          headers: {
            'x-client-id': activeClientId
          }
        };

        const [schemaRes, dealsRes, agentsRes, statusRes] = await Promise.all([
          fetch('/api/schema/transactions', fetchOptions),
          fetch('/api/transactions', fetchOptions),
          fetch('/api/agents?include_archived=true', fetchOptions),
          fetch('/api/client-lookup-values?category=TRANSACTION_STATUS', fetchOptions),
        ]);

        // Process Schema Catalog
        if (schemaRes.ok) {
          const schemaData = await schemaRes.json();
          const rawCatalog: SchemaField[] = schemaData.catalog || schemaData.fields || schemaData.data || [];
          
          const uniqueFieldsMap = new Map<string, SchemaField>();
          rawCatalog.forEach((field) => {
            if (field.is_enabled !== false && !uniqueFieldsMap.has(field.field_key)) {
              uniqueFieldsMap.set(field.field_key, field);
            }
          });

          setSchemaFields(Array.from(uniqueFieldsMap.values()));
        } else {
          setSchemaFields([]); // Clean empty state on failure
        }

        // Process Agents for resolving agent_id -> agent_name
        if (agentsRes.ok) {
          const agentsData = await agentsRes.json();
          const list = agentsData.agents || [];
          setAgentsList(Array.isArray(list) ? list : []);
        } else {
          setAgentsList([]);
        }

        // Process Transactions Ledger
        if (dealsRes.ok) {
          const dealsData = await dealsRes.json();
          const list = dealsData.transactions || dealsData.deals || dealsData.catalog || [];
          setDeals(Array.isArray(list) ? list : []);
        } else {
          setDeals([]); // Clean empty state on failure
        }

        if (statusRes.ok) {
          const statusData = await statusRes.json();
          const rows = Array.isArray(statusData.lookup_values) ? statusData.lookup_values : [];
          const seen = new Set<string>();
          const lookups: StatusLookup[] = [];
          rows.forEach((row: { optionValue?: string; optionLabel?: string; sortOrder?: number }) => {
            const optionValue = String(row.optionValue || '').trim();
            const optionLabel = String(row.optionLabel || optionValue).trim();
            if (!optionLabel || seen.has(optionLabel)) return;
            seen.add(optionLabel);
            lookups.push({
              optionValue: optionValue || optionLabel,
              optionLabel,
            });
          });
          setStatusLookups(lookups);
        } else {
          setStatusLookups([]);
        }
      } catch (err) {
        console.error('Data initialization failed:', err);
        setSchemaFields([]);
        setDeals([]);
        setAgentsList([]);
        setStatusLookups([]);
      } finally {
        setIsLoading(false);
      }
    }

    initData();
  }, []);

  // Quick lookup map: agent ID/name -> agent_name
  const agentMap = useMemo(() => {
    const map = new Map<string, string>();
    agentsList.forEach((ag) => {
      const name = normalizeAgentName(ag.agent_name || ag.name || '');
      if (ag.id && name) map.set(String(ag.id), name);
      if (ag.agent_id && name) map.set(String(ag.agent_id), name);
      if (name) map.set(name.toLowerCase(), name);
    });
    return map;
  }, [agentsList]);

  const getAgentName = (rawVal: any, deal?: Record<string, any>): string => {
    if (!rawVal) return normalizeAgentName(deal?.primary_agent || deal?.agent_name) || '—';
    const str = String(rawVal).trim();
    const mapped = agentMap.get(str) || agentMap.get(str.toLowerCase()) || agentMap.get(normalizeAgentName(str).toLowerCase());
    return mapped || normalizeAgentName(deal?.primary_agent || deal?.agent_name) || normalizeAgentName(str) || str;
  };

  // Group contiguous fields by section_name for top header spans
  const sectionHeaderGroups = useMemo(() => {
    if (schemaFields.length === 0) return [];

    const groups: { name: string; span: number }[] = [];
    let currentSection = schemaFields[0].section_name || 'General';
    let currentSpan = 0;

    schemaFields.forEach((field) => {
      const secName = field.section_name || 'General';
      if (secName === currentSection) {
        currentSpan++;
      } else {
        groups.push({ name: currentSection, span: currentSpan });
        currentSection = secName;
        currentSpan = 1;
      }
    });

    if (currentSpan > 0) {
      groups.push({ name: currentSection, span: currentSpan });
    }

    return groups;
  }, [schemaFields]);

  const handleSort = (fieldKey: string) => {
    if (sortField === fieldKey) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(fieldKey);
      setSortOrder('asc');
    }
  };

  const handleFilterChange = (fieldKey: string, value: string) => {
    setColFilters((prev) => ({ ...prev, [fieldKey]: value }));
  };

  // 2. Process Filters & Sorting
  const processedDeals = useMemo(() => {
    return deals
      .filter((deal) => {
        // Quick Tab Status Filter
        const statusVal = normalizeStatus(String(deal.transaction_status || deal.status || ''));
        if (statusFilter !== ALL_TAB) {
          const selected = statusLookups.find((lookup) => lookup.optionLabel === statusFilter);
          const selectedValues = [
            selected ? normalizeStatus(selected.optionValue) : '',
            normalizeStatus(selected?.optionLabel || statusFilter),
          ].filter(Boolean);
          if (!selectedValues.includes(statusVal)) return false;
        }

        // Global Quick Search
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const resolvedAgent = getAgentName(deal.agent_id, deal).toLowerCase();
          const matchesGlobal = Object.values(deal).some((val) =>
            String(val || '').toLowerCase().includes(q)
          ) || resolvedAgent.includes(q);
          if (!matchesGlobal) return false;
        }

        // Dynamic Column Filters
        for (const [key, filterVal] of Object.entries(colFilters)) {
          if (!filterVal || filterVal === 'All') continue;
          if (key === 'agent_id' || key === 'primary_agent') {
            const agentName = getAgentName(deal.agent_id, deal).toLowerCase();
            const rawAgentId = String(deal.agent_id || '').toLowerCase();
            const target = filterVal.toLowerCase();
            if (!agentName.includes(target) && !rawAgentId.includes(target)) {
              return false;
            }
          } else {
            const fieldDef = schemaFields.find((f) => f.field_key === key);
            const isPercent = fieldDef?.field_type === 'PERCENT' || key === 'gci_perc';
            const cellVal = String(deal[key] ?? '').toLowerCase();
            const target = filterVal.toLowerCase();
            if (isPercent) {
              const pctVal = formatPercent(deal[key]).toLowerCase();
              if (!cellVal.includes(target) && !pctVal.includes(target)) {
                return false;
              }
            } else if (!cellVal.includes(target)) {
              return false;
            }
          }
        }

        return true;
      })
      .sort((a, b) => {
        let aVal = a[sortField];
        let bVal = b[sortField];

        if (sortField === 'agent_id' || sortField === 'primary_agent') {
          aVal = getAgentName(a.agent_id, a);
          bVal = getAgentName(b.agent_id, b);
        }

        if (aVal === undefined || aVal === null) aVal = '';
        if (bVal === undefined || bVal === null) bVal = '';

        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
        }

        return sortOrder === 'asc'
          ? String(aVal).localeCompare(String(bVal))
          : String(bVal).localeCompare(String(aVal));
      });
  }, [deals, searchQuery, statusFilter, statusLookups, colFilters, sortField, sortOrder]);

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    statusLookups.forEach((lookup) => {
      counts.set(lookup.optionLabel, deals.filter((deal) => dealMatchesStatus(deal, lookup)).length);
    });
    deals.forEach((deal) => {
      const raw = String(deal.transaction_status || deal.status || '').trim();
      if (!raw || statusLookups.some((lookup) => dealMatchesStatus(deal, lookup))) return;
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    });
    return counts;
  }, [deals, statusLookups]);

  const visibleStatusLookups = useMemo(() => {
    const matched = statusLookups.filter((lookup) => (statusCounts.get(lookup.optionLabel) ?? 0) > 0);
    const known = new Set<string>();
    statusLookups.forEach((lookup) => {
      known.add(normalizeStatus(lookup.optionLabel));
      known.add(normalizeStatus(lookup.optionValue));
    });

    const extras: StatusLookup[] = [];
    deals.forEach((deal) => {
      const raw = String(deal.transaction_status || deal.status || '').trim();
      if (!raw) return;
      const norm = normalizeStatus(raw);
      if (!norm || known.has(norm) || statusLookups.some((lookup) => dealMatchesStatus(deal, lookup))) return;
      known.add(norm);
      extras.push({ optionValue: raw, optionLabel: raw });
    });

    return [...matched, ...extras];
  }, [deals, statusLookups, statusCounts]);

  useEffect(() => {
    if (statusFilter === ALL_TAB) return;
    const stillVisible = visibleStatusLookups.some((lookup) => lookup.optionLabel === statusFilter);
    if (!stillVisible) setStatusFilter(ALL_TAB);
  }, [statusFilter, visibleStatusLookups]);

  const scorecardFilters = useMemo(() => {
    const labelFor = (tone: ScorecardTone) =>
      statusLookups.find((lookup) => scorecardTone(lookup) === tone)?.optionLabel ?? null;
    return {
      active: labelFor('active'),
      pending: labelFor('pending'),
      closed: labelFor('closed'),
      cancelled: labelFor('cancelled'),
    };
  }, [statusLookups]);

  const resetAllFilters = () => {
    setSearchQuery('');
    setStatusFilter(ALL_TAB);
    setColFilters({});
  };

  const selectScorecard = (label: string | null) => {
    if (!label || (statusCounts.get(label) ?? 0) === 0) return;
    if (statusFilter === label) {
      resetAllFilters();
      return;
    }
    setStatusFilter(label);
  };

  // Summary Metrics by transaction status
  const metrics = useMemo(() => {
    const getStatus = (d: Record<string, any>) =>
      String(d.transaction_status || d.status || '').trim().toLowerCase();

    const activeDeals = deals.filter((d) => getStatus(d) === 'active');
    const pendingDeals = deals.filter((d) => getStatus(d) === 'pending');
    const closedDeals = deals.filter((d) => getStatus(d) === 'closed');
    const cancelledDeals = deals.filter((d) => getStatus(d) === 'cancelled');

    return {
      activeListings: activeDeals.length,
      activeListVolume: activeDeals.reduce((acc, d) => acc + (Number(d.list_price) || 0), 0),
      pendingUnits: pendingDeals.length,
      pendingVolume: pendingDeals.reduce((acc, d) => acc + (Number(d.sales_price) || 0), 0),
      closedUnits: closedDeals.length,
      closedVolume: closedDeals.reduce((acc, d) => acc + (Number(d.sales_price) || 0), 0),
      cancelledUnits: cancelledDeals.length,
      cancelledVolume: cancelledDeals.reduce((acc, d) => acc + (Number(d.sales_price) || Number(d.list_price) || 0), 0),
    };
  }, [deals]);

  // Helper cell formatter based on schema field definition
  const renderCellContent = (deal: Record<string, any>, field: SchemaField) => {
    const rawVal = deal[field.field_key];

    if (rawVal === undefined || rawVal === null) {
      return <span className="text-slate-400 italic">-</span>;
    }

    if (field.field_type === 'CURRENCY') {
      return <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(Number(rawVal))}</span>;
    }

    if (field.field_type === 'PERCENT' || field.field_key === 'gci_perc') {
      return <span>{formatPercent(rawVal)}</span>;
    }

    if (field.field_type === 'DATE') {
      return <span className="text-slate-700 dark:text-slate-300">{String(rawVal).substring(0, 10)}</span>;
    }

    if (field.field_key === 'agent_id' || field.field_type === 'AGENT_PICKER' || field.field_key === 'primary_agent') {
      const agentDisplayName = getAgentName(rawVal, deal);
      return <span className="font-semibold text-slate-900 dark:text-white">{agentDisplayName}</span>;
    }

    if (field.field_key === 'transaction_status' || field.field_key === 'status') {
      const st = String(rawVal);
      const stLower = st.toLowerCase();
      let badgeStyle = 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30';
      if (stLower === 'closed') {
        badgeStyle = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
      } else if (stLower === 'cancelled' || stLower === 'expired' || stLower === 'withdrawn') {
        badgeStyle = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30';
      } else if (stLower === 'in escrow' || stLower === 'active' || stLower === 'pending') {
        badgeStyle = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
      }

      return (
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${badgeStyle}`}
        >
          {st}
        </span>
      );
    }

    return <span>{String(rawVal)}</span>;
  };

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-6 md:p-8 max-w-[1600px] mx-auto space-y-6 transition-colors duration-200">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-colors">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">
            <span>Commission Tracker</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Transactions</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            Search, filter, and open transactions
          </p>
        </div>

        <Link
          href="/commission-tracker/transactions/new"
          className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 whitespace-nowrap"
        >
          <span>+ Create Transaction</span>
        </Link>
      </div>

      {/* Metrics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => selectScorecard(scorecardFilters.active)}
          className={`text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-y-slate-700 dark:border-r-slate-700 border-l-4 border-l-blue-500 dark:border-l-blue-500 rounded-xl px-5 py-4 shadow-xl transition-colors cursor-pointer hover:bg-blue-50/60 dark:hover:bg-blue-500/5 ${statusFilter === scorecardFilters.active ? SCORECARD_TAB_STYLES.active.card : ''}`}
        >
          <p className="text-[11px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider mb-3">Active</p>
          <div className="grid grid-cols-[35fr_65fr] gap-4">
            <div className="min-w-0">
              <p className="text-3xl font-bold text-slate-900 dark:text-white leading-none tracking-tight">{metrics.activeListings}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">Active Listings</p>
            </div>
            <div className="min-w-0 text-right">
              <FitVolume
                value={metrics.activeListVolume}
                className="text-3xl font-bold text-blue-600 dark:text-blue-400 leading-none tracking-tight"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">Active List Volume</p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => selectScorecard(scorecardFilters.pending)}
          className={`text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-y-slate-700 dark:border-r-slate-700 border-l-4 border-l-amber-500 dark:border-l-amber-500 rounded-xl px-5 py-4 shadow-xl transition-colors cursor-pointer hover:bg-amber-50/60 dark:hover:bg-amber-500/5 ${statusFilter === scorecardFilters.pending ? SCORECARD_TAB_STYLES.pending.card : ''}`}
        >
          <p className="text-[11px] text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider mb-3">Pending</p>
          <div className="grid grid-cols-[35fr_65fr] gap-4">
            <div className="min-w-0">
              <p className="text-3xl font-bold text-slate-900 dark:text-white leading-none tracking-tight">{metrics.pendingUnits}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">Pending Units</p>
            </div>
            <div className="min-w-0 text-right">
              <FitVolume
                value={metrics.pendingVolume}
                className="text-3xl font-bold text-amber-600 dark:text-amber-400 leading-none tracking-tight"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">Pending Volume</p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => selectScorecard(scorecardFilters.closed)}
          className={`text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-y-slate-700 dark:border-r-slate-700 border-l-4 border-l-emerald-500 dark:border-l-emerald-500 rounded-xl px-5 py-4 shadow-xl transition-colors cursor-pointer hover:bg-emerald-50/60 dark:hover:bg-emerald-500/5 ${statusFilter === scorecardFilters.closed ? SCORECARD_TAB_STYLES.closed.card : ''}`}
        >
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider mb-3">Closed</p>
          <div className="grid grid-cols-[35fr_65fr] gap-4">
            <div className="min-w-0">
              <p className="text-3xl font-bold text-slate-900 dark:text-white leading-none tracking-tight">{metrics.closedUnits}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">Closed Units</p>
            </div>
            <div className="min-w-0 text-right">
              <FitVolume
                value={metrics.closedVolume}
                className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 leading-none tracking-tight"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">Closed Volume</p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => selectScorecard(scorecardFilters.cancelled)}
          className={`text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-y-slate-700 dark:border-r-slate-700 border-l-4 border-l-rose-500 dark:border-l-rose-500 rounded-xl px-5 py-4 shadow-xl transition-colors cursor-pointer hover:bg-rose-50/60 dark:hover:bg-rose-500/5 ${statusFilter === scorecardFilters.cancelled ? SCORECARD_TAB_STYLES.cancelled.card : ''}`}
        >
          <p className="text-[11px] text-rose-600 dark:text-rose-400 font-bold uppercase tracking-wider mb-3">Cancelled</p>
          <div className="grid grid-cols-[35fr_65fr] gap-4">
            <div className="min-w-0">
              <p className="text-3xl font-bold text-slate-900 dark:text-white leading-none tracking-tight">{metrics.cancelledUnits}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">Cancelled Units</p>
            </div>
            <div className="min-w-0 text-right">
              <FitVolume
                value={metrics.cancelledVolume}
                className="text-3xl font-bold text-rose-600 dark:text-rose-400 leading-none tracking-tight"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">Cancelled Volume</p>
            </div>
          </div>
        </button>
      </div>

      {/* Ledger Table Container */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden p-5 space-y-4 transition-colors">
        
        {/* Controls Bar */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-slate-200 dark:border-slate-700 pb-4">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Quick Status Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto min-w-0">
              {[ALL_TAB, ...visibleStatusLookups.map((lookup) => lookup.optionLabel)].map((tab) => {
                const isAll = tab === ALL_TAB;
                const selected = statusFilter === tab;
                const tone = isAll ? null : scorecardTone(visibleStatusLookups.find((lookup) => lookup.optionLabel === tab) || { optionValue: '', optionLabel: tab });
                const toneStyle = tone ? SCORECARD_TAB_STYLES[tone] : null;
                const tabClass = isAll
                  ? selected
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border border-transparent uppercase tracking-wider'
                    : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-600 uppercase tracking-wider'
                  : toneStyle
                    ? selected
                      ? toneStyle.active
                      : toneStyle.idle
                    : selected
                      ? 'bg-slate-500/15 text-slate-800 dark:text-slate-200 border border-slate-400/40'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent';
                const countClass = isAll
                  ? selected
                    ? 'text-white/80 dark:text-slate-900/70'
                    : 'text-slate-500 dark:text-slate-400'
                  : toneStyle
                    ? selected
                      ? toneStyle.countActive
                      : toneStyle.countIdle
                    : selected
                      ? 'text-slate-700 dark:text-slate-200'
                      : 'text-slate-400 dark:text-slate-500';

                return (
                  <button
                    key={tab}
                    onClick={() => {
                      if (tab === ALL_TAB) resetAllFilters();
                      else setStatusFilter(tab);
                    }}
                    className={`inline-flex items-center px-3.5 py-1.5 rounded-md text-xs font-bold transition whitespace-nowrap cursor-pointer ${tabClass} ${isAll ? 'mr-1' : ''}`}
                  >
                    {tab}
                    <span className={`ml-1.5 tabular-nums ${countClass}`}>
                      {isAll ? deals.length : statusCounts.get(tab) ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
            {/* Toggle Filters Button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-2 rounded-lg text-xs font-bold border transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                showFilters
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/40'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <span>🔍</span>
              <span>{showFilters ? 'Hide Filters' : 'Show Filters'}</span>
            </button>

            {/* Quick Search */}
            <div className="relative w-[20rem] max-w-full">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search all fields..."
                className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Table */}
        <div className="overflow-x-auto max-h-[640px] overflow-y-auto border border-slate-200 dark:border-slate-700/80 rounded-lg scrollbar-thin">
          <table className="w-full text-left text-xs min-w-[1200px] border-separate border-spacing-0">
            
            {/* Dynamic Table Header */}
            <thead className="sticky top-0 z-20 shadow-md select-none bg-slate-100 dark:bg-slate-900">
              
              {/* Section Group Header Row */}
              <tr className="bg-slate-200 dark:bg-slate-950 text-[10px] font-bold tracking-widest text-emerald-600 dark:text-emerald-400">
                {sectionHeaderGroups.map((group, idx) => (
                  <th
                    key={`${group.name}_${idx}`}
                    colSpan={group.span}
                    className="py-1.5 px-4 bg-slate-200 dark:bg-slate-950 border-b border-slate-300 dark:border-slate-800 border-r border-slate-300/60 dark:border-slate-800/80 last:border-r-0"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      <span>SECTION: {group.name}</span>
                    </div>
                  </th>
                ))}
              </tr>

              {/* Field Label Header Row */}
              <tr className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-semibold">
                {schemaFields.map((field) => (
                  <th
                    key={field.field_key}
                    onClick={() => handleSort(field.field_key)}
                    className="py-3 px-4 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 cursor-pointer hover:text-slate-900 dark:hover:text-white transition group whitespace-nowrap border-r border-slate-200/50 dark:border-slate-800/50 last:border-r-0"
                  >
                    <div className="flex items-center gap-1">
                      <span>{field.field_label}</span>
                      <span className="text-slate-400 dark:text-slate-600 group-hover:opacity-100 transition">
                        {sortField === field.field_key ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>

              {/* Dynamic Filter Inputs */}
              {showFilters && (
                <tr className="bg-slate-200 dark:bg-slate-950">
                  {schemaFields.map((field) => (
                    <th key={`filter_${field.field_key}`} className="p-2 min-w-[120px] bg-slate-200 dark:bg-slate-950 border-b border-slate-300 dark:border-slate-800 border-r border-slate-300/40 dark:border-slate-800/40 last:border-r-0">
                      {field.field_key === 'agent_id' || field.field_type === 'AGENT_PICKER' ? (
                        <select
                          value={colFilters[field.field_key] || 'All'}
                          onChange={(e) => handleFilterChange(field.field_key, e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-1 text-[11px] text-slate-900 dark:text-white focus:outline-none font-normal"
                        >
                          <option value="All">All {field.field_label}</option>
                          {agentsList.map((ag) => {
                            const name = ag.agent_name || ag.name || '';
                            return (
                              <option key={ag.id || name} value={name}>
                                {name}
                              </option>
                            );
                          })}
                        </select>
                      ) : field.field_type === 'SELECT' && Array.isArray(field.dropdown_options) ? (
                        <select
                          value={colFilters[field.field_key] || 'All'}
                          onChange={(e) => handleFilterChange(field.field_key, e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-1 text-[11px] text-slate-900 dark:text-white focus:outline-none font-normal"
                        >
                          <option value="All">All {field.field_label}</option>
                          {field.dropdown_options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={field.field_type === 'DATE' ? 'date' : 'text'}
                          placeholder={`Filter ${field.field_label}...`}
                          value={colFilters[field.field_key] || ''}
                          onChange={(e) => handleFilterChange(field.field_key, e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-[11px] text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-normal"
                        />
                      )}
                    </th>
                  ))}
                </tr>
              )}
            </thead>

            {/* Dynamic Table Body */}
            <tbody className="text-slate-800 dark:text-slate-200 font-medium bg-white dark:bg-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={schemaFields.length} className="text-center py-10 text-slate-400 italic border-b border-slate-200 dark:border-slate-700/60">
                    Loading synchronized schema & transaction ledger...
                  </td>
                </tr>
              ) : processedDeals.length === 0 ? (
                <tr>
                  <td colSpan={schemaFields.length} className="text-center py-10 text-slate-400 italic border-b border-slate-200 dark:border-slate-700/60">
                    No matching transaction records found for active filters.
                  </td>
                </tr>
              ) : (
                processedDeals.map((deal, idx) => {
                  const dealId = deal.id || `TXN_${idx + 1}`;

                  return (
                    <tr
                      key={dealId}
                      className="hover:bg-slate-100 dark:hover:bg-slate-700/50 transition cursor-pointer group"
                    >
                      {schemaFields.map((field) => (
                        <td key={field.field_key} className="py-3 px-4 whitespace-nowrap border-b border-slate-200 dark:border-slate-700/60">
                          {field.field_key === 'id' ? (
                            <Link
                              href={`/commission-tracker/transactions/${dealId}`}
                              className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                            >
                              {String(deal[field.field_key] || dealId)}
                            </Link>
                          ) : field.field_key === 'property_address' ? (
                            <Link
                              href={`/commission-tracker/transactions/${dealId}`}
                              className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                            >
                              {deal.property_address
                                ? String(deal.property_address)
                                : <span className="text-slate-400 italic font-normal">-</span>}
                            </Link>
                          ) : (
                            renderCellContent(deal, field)
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 pt-2">
          <span>Displaying {processedDeals.length} of {deals.length} records</span>
          <span className="text-[11px] italic">Columns synchronized dynamically with client schema configuration</span>
        </div>
      </div>
    </main>
  );
}