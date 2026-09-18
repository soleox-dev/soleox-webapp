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
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">3. Final Disbursements & Payment Authorizations</h2>
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
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
                👤 Agent Net Disbursements (Direct Deposit / ACH)
              </span>
              <button className="text-xs bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 px-3 py-1 rounded-lg font-semibold hover:bg-emerald-500/30 cursor-pointer">
                📄 Export PDF Disbursement Instructions
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {agentDisbursements.map(([agentName, amount]) => (
                <div key={agentName} className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-emerald-500/30 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{agentName}</span>
                    <span className="text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-semibold">
                      READY TO PAY
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline pt-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Net Payable Amount:</span>
                    <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              🏢 Brokerage & 3rd Party Disbursements
            </span>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {entityDisbursements.map(([entity, amount]) => (
                <div key={entity} className="bg-slate-50 dark:bg-slate-900 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400 block truncate font-medium">{entity}</span>
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-200">{formatCurrency(amount)}</span>
                    <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 px-1.5 py-0.5 rounded">
                      Pending Escrow Wire
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}