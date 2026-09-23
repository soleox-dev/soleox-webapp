// app/commission-tracker/transactions/[id]/components/FinalDisbursements.tsx
import React from 'react';

interface FinalDisbursementsProps {
  isCollapsed: boolean;
  onToggleSection: () => void;
  agentDisbursements: [string, number][];
  entityDisbursements: [string, number][];
}

export function FinalDisbursements({
  isCollapsed,
  onToggleSection,
  agentDisbursements,
  entityDisbursements,
}: FinalDisbursementsProps) {
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  return (
    <section id="disbursements" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden scroll-mt-8 transition-colors">
      <div className="bg-slate-50 dark:bg-slate-800 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="text-lg">💸</span>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">3. Payments Breakdown</h2>
        </div>

        <button
          onClick={onToggleSection}
          className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-bold transition text-base leading-none cursor-pointer"
          title={isCollapsed ? 'Expand Section' : 'Collapse Section'}
        >
          {isCollapsed ? '+' : '−'}
        </button>
      </div>

      {!isCollapsed && (
        <div className="p-6 space-y-6">
          {/* Payments to Agents */}
          <div className="space-y-3">
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
              Payments to Agents
            </span>

            {agentDisbursements.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">No agent payments.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {agentDisbursements.map(([agentName, amount]) => (
                  <div
                    key={agentName}
                    className="bg-slate-50 dark:bg-slate-900 px-4 py-3 rounded-xl border border-emerald-500/30 flex justify-between items-center gap-3"
                  >
                    <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{agentName}</span>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      {formatCurrency(amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payments to Entities */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-700">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Payments to Entities
            </span>

            {entityDisbursements.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">No entity payments.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {entityDisbursements.map(([entity, amount]) => (
                  <div
                    key={entity}
                    className="bg-slate-50 dark:bg-slate-900 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 flex justify-between items-center gap-3"
                  >
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{entity}</span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      {formatCurrency(amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
