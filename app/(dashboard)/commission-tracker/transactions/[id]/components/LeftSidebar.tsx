import React from 'react';
import { formatPercentageClean } from '../types';

interface LeftSidebarProps {
  activeTab: 'overview' | 'commission' | 'disbursements';
  scrollToSection: (sectionId: 'overview' | 'commission' | 'disbursements') => void;
  overviewFieldsCount: number;
  agentsCount: number;
  entitiesCount: number;
  salesPrice: number;
  gciPerc: number;
  grossCommission: number;
  commissionAfterOffTop: number;
}

export function LeftSidebar({
  activeTab,
  scrollToSection,
  overviewFieldsCount,
  agentsCount,
  entitiesCount,
  salesPrice,
  gciPerc,
  grossCommission,
  commissionAfterOffTop,
}: LeftSidebarProps) {
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  return (
    <aside className="lg:col-span-3 space-y-3 lg:sticky lg:top-8 h-fit">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-xl space-y-1 transition-colors">
        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase px-3 py-1 block">
          Workflow Steps
        </span>

        <button
          onClick={() => scrollToSection('overview')}
          className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold transition flex items-center justify-between cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 font-bold'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
          }`}
        >
          <div className="flex items-center gap-2">
            <span>📋</span>
            <span>1. Transaction Overview</span>
          </div>
          <span className="text-[10px] bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-400 font-bold">
            {overviewFieldsCount} Fields
          </span>
        </button>

        <button
          onClick={() => scrollToSection('commission')}
          className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold transition flex items-center justify-between cursor-pointer ${
            activeTab === 'commission'
              ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 font-bold'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
          }`}
        >
          <div className="flex items-center gap-2">
            <span>⚙️</span>
            <span>2. Commission Engine</span>
          </div>
          <span className="text-[10px] bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded text-emerald-700 dark:text-emerald-400 font-bold">
            {agentsCount} Agents
          </span>
        </button>

        <button
          onClick={() => scrollToSection('disbursements')}
          className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold transition flex items-center justify-between cursor-pointer ${
            activeTab === 'disbursements'
              ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 font-bold'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
          }`}
        >
          <div className="flex items-center gap-2">
            <span>💸</span>
            <span>3. Final Disbursements</span>
          </div>
          <span className="text-[10px] bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded text-emerald-700 dark:text-emerald-400 font-bold">
            {entitiesCount} Entities
          </span>
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-xl space-y-2 text-xs transition-colors">
        <span className="font-bold text-slate-800 dark:text-slate-300 block border-b border-slate-200 dark:border-slate-700 pb-2">
          Deal Quick Metrics
        </span>
        <div className="flex justify-between text-slate-500 dark:text-slate-400">
          <span>Sales Price:</span>
          <span className="text-slate-900 dark:text-white font-semibold">{formatCurrency(salesPrice)}</span>
        </div>
        <div className="flex justify-between text-slate-500 dark:text-slate-400">
          <span>Gross Comm ({formatPercentageClean(gciPerc)}%):</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{formatCurrency(grossCommission)}</span>
        </div>
        <div className="flex justify-between text-slate-500 dark:text-slate-400">
          <span>Net Off-The-Top:</span>
          <span className="text-slate-800 dark:text-slate-300 font-semibold">{formatCurrency(commissionAfterOffTop)}</span>
        </div>
      </div>
    </aside>
  );
}