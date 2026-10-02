import React from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { formatPercent } from '../types';
import { CommissionTemplatePanel } from './CommissionTemplatePanel';
import { SectionIcon } from './SectionIcon';

interface LeftSidebarProps {
  activeTab: 'overview' | 'commission' | 'disbursements';
  scrollToSection: (sectionId: 'overview' | 'commission' | 'disbursements') => void;
  overviewFieldsCount: number;
  agentsCount: number;
  entitiesCount: number;
  salesPrice: number;
  gciPerc: number;
  gciAmount: number;
  feeField?: { label: string; amount: number } | null;
  totalCommission: number;
  clientId: string;
  transactionId: string;
  deal: Record<string, unknown> | null;
  templateAgents: { id: string; name: string; isTeamLead?: boolean }[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function LeftSidebar({
  activeTab,
  scrollToSection,
  overviewFieldsCount,
  agentsCount,
  entitiesCount,
  salesPrice,
  gciPerc,
  gciAmount,
  feeField,
  totalCommission,
  clientId,
  transactionId,
  deal,
  templateAgents,
  collapsed,
  onToggleCollapsed,
}: LeftSidebarProps) {
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const steps = [
    { id: 'overview' as const, label: '1. Transaction Overview', count: `${overviewFieldsCount} Fields` },
    { id: 'commission' as const, label: '2. Commission Waterfall', count: `${agentsCount} Agents` },
    { id: 'disbursements' as const, label: '3. Payments Breakdown', count: `${entitiesCount} Entities` },
  ];

  const stepClass = (id: typeof activeTab, rail: boolean) =>
    `cursor-pointer transition ${
      activeTab === id
        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 font-bold'
        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 border border-transparent'
    } ${rail ? 'w-10 h-10 rounded-lg flex items-center justify-center text-base' : 'w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-between'}`;

  return (
    <aside className={`h-fit lg:sticky lg:top-8 ${collapsed ? 'lg:w-14' : 'w-full lg:w-[19rem]'}`}>
      {collapsed && (
        <div className="hidden lg:flex flex-col items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 shadow-xl">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700/50 cursor-pointer transition"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
          {steps.map((step) => (
            <button
              key={step.id}
              type="button"
              onClick={() => scrollToSection(step.id)}
              className={stepClass(step.id, true)}
              aria-label={step.label}
              title={step.label}
            >
              <SectionIcon name={step.id} className="w-4 h-4" />
            </button>
          ))}
        </div>
      )}

      <div className={`space-y-3 ${collapsed ? 'lg:hidden' : ''}`}>
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-xl space-y-1 transition-colors">
        <div className="flex items-center justify-between px-3 py-1">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">
            Workflow Steps
          </span>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="hidden lg:inline-flex w-6 h-6 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-700/50 cursor-pointer transition"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </div>

        {steps.map((step) => (
          <button
            key={step.id}
            type="button"
            onClick={() => scrollToSection(step.id)}
            className={stepClass(step.id, false)}
          >
            <div className="flex items-center gap-2">
              <SectionIcon name={step.id} className="w-4 h-4" />
              <span>{step.label}</span>
            </div>
            <span className={`text-[10px] bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded font-bold ${
              step.id === 'overview' ? 'text-slate-500 dark:text-slate-400' : 'text-emerald-700 dark:text-emerald-400'
            }`}>
              {step.count}
            </span>
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-xl space-y-2 text-xs transition-colors">
        <span className="font-bold text-slate-800 dark:text-slate-300 block border-b border-slate-200 dark:border-slate-700 pb-2">
          Deal Quick Metrics
        </span>
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between text-slate-500 dark:text-slate-400">
            <span>Sales Price:</span>
            <span className="text-slate-900 dark:text-white font-semibold">{formatCurrency(salesPrice)}</span>
          </div>
          <div className="flex justify-between text-slate-500 dark:text-slate-400">
            <span>GCI %:</span>
            <span className="text-slate-900 dark:text-white font-semibold">{formatPercent(gciPerc)}</span>
          </div>
          <div className="flex justify-between text-slate-500 dark:text-slate-400">
            <span>GCI Amount:</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{formatCurrency(gciAmount)}</span>
          </div>
          {feeField && (
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>{feeField.label}:</span>
              <span className="text-slate-900 dark:text-white font-semibold">{formatCurrency(feeField.amount)}</span>
            </div>
          )}
          <div className="flex justify-between text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700/60 pt-1.5">
            <span className="font-bold text-slate-700 dark:text-slate-300">Total Commission:</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{formatCurrency(totalCommission)}</span>
          </div>
        </div>
      </div>

      <CommissionTemplatePanel clientId={clientId} transactionId={transactionId} deal={deal} agents={templateAgents} />
      </div>
    </aside>
  );
}