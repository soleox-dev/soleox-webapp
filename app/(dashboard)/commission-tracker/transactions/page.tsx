// app/(dashboard)/commission-tracker/transactions/page.tsx

'use client';

import React, { useState, useEffect, useMemo } from 'react';
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

export default function TransactionsListPage() {
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>([]);
  const [deals, setDeals] = useState<Record<string, any>[]>([]);
  const [agentsList, setAgentsList] = useState<{ id: string; agent_name?: string; name?: string; [key: string]: any }[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showFilters, setShowFilters] = useState<boolean>(false);

  // Search & Global Tabs
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  
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

        const [schemaRes, dealsRes, agentsRes] = await Promise.all([
          fetch('/api/schema/transactions', fetchOptions),
          fetch('/api/transactions', fetchOptions),
          fetch('/api/agents?include_archived=true', fetchOptions),
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
      } catch (err) {
        console.error('Data initialization failed:', err);
        setSchemaFields([]);
        setDeals([]);
        setAgentsList([]);
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
        const statusVal = String(deal.transaction_status || deal.status || '').toLowerCase();
        if (statusFilter !== 'All' && statusVal !== statusFilter.toLowerCase()) return false;

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
  }, [deals, searchQuery, statusFilter, colFilters, sortField, sortOrder]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const totalVolume = deals.reduce((acc, d) => acc + (Number(d.sales_price) || 0), 0);
    const totalGCI = deals.reduce((acc, d) => {
      if (d.gci_amount) return acc + Number(d.gci_amount);
      const price = Number(d.sales_price) || 0;
      const rate = Number(d.gci_perc) || 0;
      const gRate = rate > 1 ? rate / 100 : rate;
      return acc + price * gRate;
    }, 0);
    const pendingCount = deals.filter((d) => {
      const st = String(d.transaction_status || d.status || '').toLowerCase();
      return st === 'pending' || st === 'in escrow';
    }).length;

    return { totalVolume, totalGCI, pendingCount };
  }, [deals]);

  const resetAllFilters = () => {
    setSearchQuery('');
    setStatusFilter('All');
    setColFilters({});
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

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
            <span>•</span>
            <span className="text-slate-500 dark:text-slate-400">Dynamic Schema Ledger</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Transactions Master Ledger</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            Schema columns dynamically synchronized with Client Field Configurations
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-xl transition-colors">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold block uppercase">Total Portfolio Volume</span>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{formatCurrency(metrics.totalVolume)}</p>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 block">Active across {deals.length} loaded deals</span>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-xl transition-colors">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold block uppercase">Total Gross Commission (GCI)</span>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{formatCurrency(metrics.totalGCI)}</p>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">Pre-split gross revenue stream</span>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-xl transition-colors">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold block uppercase">Active / Escrow Deals</span>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{metrics.pendingCount} Deals</p>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">Pending waterfall settlement</span>
        </div>
      </div>

      {/* Ledger Table Container */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden p-5 space-y-4 transition-colors">
        
        {/* Controls Bar */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-slate-200 dark:border-slate-700 pb-4">
          <div className="flex items-center gap-2 w-full md:w-auto">
            {/* Quick Status Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
              {['All', 'Pending', 'In Escrow', 'Closed'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setStatusFilter(tab)}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition whitespace-nowrap ${
                    statusFilter === tab
                      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Toggle Filters Button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-2 rounded-lg text-xs font-bold border transition flex items-center gap-1.5 ${
                showFilters
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/40'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <span>🔍</span>
              <span>{showFilters ? 'Hide Filters' : 'Show Filters'}</span>
            </button>

            {/* Reset Button */}
            <button
              onClick={resetAllFilters}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white underline font-medium px-2 py-1"
            >
              Reset Filters
            </button>
          </div>

          {/* Quick Search */}
          <div className="relative w-full md:w-80">
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
                <th className="py-1.5 px-4 bg-slate-200 dark:bg-slate-950 border-b border-slate-300 dark:border-slate-800"></th>
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
                <th className="py-3 px-4 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-center">Action</th>
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
                  <th className="p-2 bg-slate-200 dark:bg-slate-950 border-b border-slate-300 dark:border-slate-800"></th>
                </tr>
              )}
            </thead>

            {/* Dynamic Table Body */}
            <tbody className="text-slate-800 dark:text-slate-200 font-medium bg-white dark:bg-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={schemaFields.length + 1} className="text-center py-10 text-slate-400 italic border-b border-slate-200 dark:border-slate-700/60">
                    Loading synchronized schema & transaction ledger...
                  </td>
                </tr>
              ) : processedDeals.length === 0 ? (
                <tr>
                  <td colSpan={schemaFields.length + 1} className="text-center py-10 text-slate-400 italic border-b border-slate-200 dark:border-slate-700/60">
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
                          ) : (
                            renderCellContent(deal, field)
                          )}
                        </td>
                      ))}

                      {/* Action Button */}
                      <td className="py-3 px-4 text-center whitespace-nowrap border-b border-slate-200 dark:border-slate-700/60">
                        <Link
                          href={`/commission-tracker/transactions/${dealId}`}
                          className="bg-slate-100 dark:bg-slate-900 group-hover:bg-emerald-500/20 text-slate-700 dark:text-slate-300 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 border border-slate-300 dark:border-slate-700 group-hover:border-emerald-500/40 px-2.5 py-1 rounded text-[11px] font-bold transition"
                        >
                          Open Engine ➔
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 pt-2">
          <span>Displaying {processedDeals.length} of {deals.length} ledger entries</span>
          <span className="text-[11px] italic">Columns synchronized dynamically with client schema configuration</span>
        </div>
      </div>
    </main>
  );
}