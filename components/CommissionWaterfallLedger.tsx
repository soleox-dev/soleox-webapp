'use client';

import React, { useEffect, useState } from 'react';

interface CommissionItem {
  id: string;
  step_number: number;
  rule_name: string;
  section: 'OFF_THE_TOP' | 'PRE_SPLIT' | 'POST_SPLIT' | 'AGENT_NET';
  payee_type: string;
  calculated_amount: number;
  final_amount: number;
}

export default function CommissionWaterfallLedger({ transactionId }: { transactionId: string }) {
  const [items, setItems] = useState<CommissionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLedger() {
      try {
        const res = await fetch(`/api/transactions/${transactionId}/items`);
        const data = await res.json();
        if (data.success) setItems(data.items);
      } catch (err) {
        console.error('Failed to load waterfall items:', err);
      } finally {
        setLoading(false);
      }
    }

    if (transactionId) fetchLedger();
  }, [transactionId]);

  if (loading) return <div className="p-6 text-slate-400 font-mono text-sm">Loading waterfall calculation...</div>;

  const offTheTop = items.filter((i) => i.section === 'OFF_THE_TOP');
  const preSplits = items.filter((i) => i.section === 'PRE_SPLIT');
  const postSplits = items.filter((i) => i.section === 'POST_SPLIT');
  const agentNet = items.find((i) => i.section === 'AGENT_NET');

  return (
    <div className="max-w-4xl mx-auto space-y-6 bg-slate-950 p-6 rounded-xl border border-slate-800 text-slate-100 font-sans">
      {/* Header Banner */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-emerald-400 tracking-tight">Soleox Commission Hub</h1>
          <p className="text-xs text-slate-400">Waterfall Commission Breakdown</p>
        </div>
        <span className="px-3 py-1 bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono text-xs font-bold rounded-full">
          STATUS: PASS
        </span>
      </div>

      {/* Deal Baseline Metrics */}
      <div className="flex items-center justify-between bg-slate-900/60 p-4 rounded-lg border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white">123 Ocean Blvd Deal</h2>
          <p className="text-xs text-slate-400 font-mono">Sales Price: $1,200,000.00 (3.0% GCI)</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Gross Commission</p>
          <p className="text-2xl font-mono font-bold text-emerald-400">$36,000.00</p>
        </div>
      </div>

      {/* 1. OFF-THE-TOP DEDUCTIONS */}
      <div className="bg-slate-900/40 rounded-lg border border-slate-800 p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">1. Off-The-Top Deductions</h3>
        {offTheTop.map((item) => (
          <div key={item.id} className="flex justify-between text-sm">
            <span className="text-slate-300">{item.rule_name}</span>
            <span className="font-mono text-slate-300">-${Number(item.final_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>
        ))}
      </div>

      {/* 2. PRE-SPLITS STAGE */}
      <div className="bg-slate-900/40 rounded-lg border border-slate-800 p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">2. Pre-Splits Stage</h3>
        {preSplits.map((item) => (
          <div key={item.id} className="flex justify-between text-sm">
            <span className="text-slate-300">{item.rule_name}</span>
            <span className="font-mono text-slate-300">-${Number(item.final_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>
        ))}
      </div>

      {/* 3. POST-SPLIT DEDUCTIONS */}
      <div className="bg-slate-900/40 rounded-lg border border-slate-800 p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">3. Post-Split Deductions</h3>
        {postSplits.map((item) => (
          <div key={item.id} className="flex justify-between text-sm">
            <span className="text-slate-300">{item.rule_name}</span>
            <span className="font-mono text-slate-300">-${Number(item.final_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>
        ))}

        {/* Final Agent Net Row */}
        <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
          <span className="font-bold text-white">Agent Net Payout</span>
          <span className="text-2xl font-mono font-bold text-emerald-400">
            ${Number(agentNet?.final_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </div>
  );
}