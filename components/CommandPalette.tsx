'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { BarChart3, CornerDownLeft, FileText, List, Search, Settings, User, Users, type LucideIcon } from 'lucide-react';
import { transactionDealLabel } from '@/lib/transaction-label';

type DealRow = Record<string, unknown> & { id?: string };
type AgentRow = { id?: string; agent_name?: string; name?: string; agent_email?: string; email?: string; archived?: boolean };

/** Loaded on the first open and kept for the session, so later searches are instant. */
let cachedDeals: DealRow[] | null = null;
let cachedAgents: AgentRow[] | null = null;
let loading: Promise<void> | null = null;

function loadSearchData(): Promise<void> {
  if (cachedDeals && cachedAgents) return Promise.resolve();
  if (!loading) {
    const readJson = <T,>(url: string): Promise<T> => fetch(url)
      .then((response) => (response.ok ? response.json() : {}))
      .catch(() => ({})) as Promise<T>;
    loading = Promise.all([
      readJson<{ transactions?: DealRow[]; deals?: DealRow[] }>('/api/transactions'),
      readJson<{ agents?: AgentRow[] }>('/api/agents?include_archived=true'),
    ]).then(([dealsData, agentsData]) => {
      const deals = dealsData.transactions || dealsData.deals || [];
      cachedDeals = Array.isArray(deals) ? deals : [];
      cachedAgents = Array.isArray(agentsData.agents) ? agentsData.agents : [];
    }).finally(() => {
      loading = null;
    });
  }
  return loading;
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).toLowerCase();
}

/** Every word must appear somewhere. A match at the start of the label ranks first. */
function score(haystack: string, label: string, words: string[]): number {
  if (!words.every((word) => haystack.includes(word))) return -1;
  return label.startsWith(words[0]) ? 2 : 1;
}

type Result = {
  key: string;
  group: 'Pages' | 'Transactions' | 'Agents';
  icon: LucideIcon;
  title: string;
  detail?: string;
  href: string;
};

const MAX_TRANSACTIONS = 8;
const MAX_AGENTS = 5;

export function CommandPalette({
  open,
  onClose,
  canSearchTracker,
  canSettings,
  canReports,
}: {
  open: boolean;
  onClose: () => void;
  canSearchTracker: boolean;
  canSettings: boolean;
  canReports: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [ready, setReady] = useState(Boolean(cachedDeals && cachedAgents));
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
    if (!canSearchTracker) return;
    let cancelled = false;
    void loadSearchData().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, canSearchTracker]);

  const results = useMemo<Result[]>(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const pages: Result[] = [
      ...(canSearchTracker ? [
        { key: 'page-transactions', group: 'Pages' as const, icon: List, title: 'Transactions', href: '/commission-tracker/transactions' },
        { key: 'page-agents', group: 'Pages' as const, icon: Users, title: 'Agents', href: '/commission-tracker/agents' },
      ] : []),
      ...(canSettings ? [{ key: 'page-settings', group: 'Pages' as const, icon: Settings, title: 'Commission Tracker Settings', href: '/commission-tracker/settings' }] : []),
      ...(canReports ? [{ key: 'page-reports', group: 'Pages' as const, icon: BarChart3, title: 'Owner Reports', href: '/owner-reports' }] : []),
    ];
    if (words.length === 0) return pages;

    const pageMatches = pages.filter((page) => score(page.title.toLowerCase(), page.title.toLowerCase(), words) >= 0);
    if (!canSearchTracker || !ready) return pageMatches;

    const agentNames = new Map((cachedAgents || []).map((agent) => [String(agent.id || ''), String(agent.agent_name || agent.name || '')]));
    const transactions = (cachedDeals || [])
      .map((deal) => {
        const label = transactionDealLabel(deal) || String(deal.id || '');
        const agentName = agentNames.get(String(deal.agent_id || '')) || '';
        const haystack = [deal.id, deal.tms_id, deal.property_address, deal.client_name, deal.transaction_status, deal.transaction_side, agentName].map(text).join(' ');
        return { deal, label, agentName, rank: score(haystack, text(deal.property_address), words) };
      })
      .filter((row) => row.rank >= 0)
      .sort((left, right) => right.rank - left.rank)
      .slice(0, MAX_TRANSACTIONS)
      .map((row): Result => ({
        key: `txn-${row.deal.id}`,
        group: 'Transactions',
        icon: FileText,
        title: row.label,
        detail: [row.agentName, String(row.deal.id || '')].filter(Boolean).join(' · '),
        href: `/commission-tracker/transactions/${encodeURIComponent(String(row.deal.id))}`,
      }));
    const agents = (cachedAgents || [])
      .filter((agent) => !agent.archived)
      .map((agent) => {
        const name = String(agent.agent_name || agent.name || '');
        const email = String(agent.agent_email || agent.email || '');
        return { name, email, rank: score(`${name} ${email}`.toLowerCase(), name.toLowerCase(), words) };
      })
      .filter((row) => row.name && row.rank >= 0)
      .sort((left, right) => right.rank - left.rank)
      .slice(0, MAX_AGENTS)
      .map((row): Result => ({
        key: `agent-${row.name}`,
        group: 'Agents',
        icon: User,
        title: row.name,
        detail: row.email || undefined,
        href: `/commission-tracker/agents?q=${encodeURIComponent(row.name)}`,
      }));
    const searchAll: Result = {
      key: 'search-all',
      group: 'Transactions',
      icon: Search,
      title: `Search all transactions for "${query.trim()}"`,
      href: `/commission-tracker/transactions?q=${encodeURIComponent(query.trim())}`,
    };
    return [...transactions, searchAll, ...agents, ...pageMatches];
  }, [query, ready, canSearchTracker, canSettings, canReports]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  const choose = (result: Result | undefined) => {
    if (!result) return;
    onClose();
    router.push(result.href);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(results[activeIndex]);
    }
  };

  const groups = (['Transactions', 'Agents', 'Pages'] as const).filter((group) => results.some((result) => result.group === group));
  const searching = query.trim().length > 0 && canSearchTracker && !ready;

  return createPortal(
    <div className="app-modal fixed inset-0 z-[120] flex items-start justify-center bg-slate-950/50 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 dark:border-slate-800">
          <Search className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={canSearchTracker ? 'Search transactions, agents, and pages…' : 'Search pages…'}
            aria-label="Search"
            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-white"
          />
          <kbd className="shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-2xs font-semibold text-slate-400 dark:border-slate-700">Esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
          {searching && <p className="px-3 py-6 text-center text-xs text-slate-400">Loading transactions…</p>}
          {!searching && results.length === 0 && <p className="px-3 py-6 text-center text-xs text-slate-400">No matches.</p>}
          {groups.map((group) => (
            <div key={group} className="pb-1">
              <p className="px-3 pb-1 pt-2 text-2xs font-bold text-slate-400">{group}</p>
              {results.map((result, index) => {
                if (result.group !== group) return null;
                const Icon = result.icon;
                const active = index === activeIndex;
                return (
                  <button
                    key={result.key}
                    type="button"
                    data-index={index}
                    onMouseMove={() => setActiveIndex(index)}
                    onClick={() => choose(result)}
                    className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${active ? 'bg-brand-500/10 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300' : 'text-slate-700 dark:text-slate-200'}`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} strokeWidth={1.75} aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{result.title}</span>
                    {result.detail && <span className="shrink-0 truncate text-xs text-slate-400 max-w-[40%]">{result.detail}</span>}
                    {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={2} aria-hidden />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
