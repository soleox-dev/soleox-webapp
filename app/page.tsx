'use client';

import React from 'react';
import Link from 'next/link';
import { BarChart3, CircleDollarSign, List, Settings, Target, TrendingUp, Users, Wallet } from 'lucide-react';
import { useAccess } from '@/components/access-provider';

export default function Home() {
  const { access, loading } = useAccess();
  const permissions = access?.permissions;
  const showTransactions = Boolean(permissions?.commissionTrackerRead || permissions?.commissionTrackerWrite || permissions?.superAdmin);
  const showSettings = Boolean(permissions?.commissionTrackerSettings || permissions?.superAdmin);
  const showTracker = showTransactions || showSettings;
  const showOwnerReports = Boolean(permissions?.ownerReports || permissions?.superAdmin);
  const showDeferred = Boolean(permissions?.superAdmin);
  const visibleCount = [showTracker, showOwnerReports, showDeferred, showDeferred, showDeferred].filter(Boolean).length;

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-6 md:p-8 max-w-7xl mx-auto space-y-6 transition-colors duration-200">
      
      {/* Title Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 bg-white dark:bg-slate-900 rounded-xl shadow-md border border-slate-200 dark:border-slate-800 transition-colors">
        <div>
          <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            Soleox • Main Menu
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-0.5">
            Real Estate Business Intelligence
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Select a module below to launch your real estate management workflows.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 border text-xs font-bold rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-400 mt-4 sm:mt-0">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
          Operational
        </span>
      </div>

      {/* Module Counter Label */}
      <div className="flex justify-between items-center px-1 text-xs font-medium text-slate-500 dark:text-slate-400">
        <span className="uppercase tracking-wider font-bold">Platform Product Modules ({loading ? '…' : visibleCount})</span>
        <span>{loading ? '' : `${[showTracker, showOwnerReports].filter(Boolean).length} Active`}</span>
      </div>

      {/* 4-Module Dashboard Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {showTracker && <div className="p-6 rounded-xl shadow-md border bg-white dark:bg-slate-900 border-emerald-300/80 dark:border-emerald-800/80 hover:border-emerald-500 dark:hover:border-emerald-700 transition flex flex-col justify-between space-y-4">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-lg border flex items-center justify-center bg-emerald-50 dark:bg-slate-950 border-emerald-200/80 dark:border-slate-800 text-emerald-700 dark:text-emerald-400">
              <CircleDollarSign className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </div>
            <span className="px-2.5 py-1 font-bold text-[10px] tracking-wide uppercase rounded-md border bg-emerald-100/80 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border-emerald-300/60 dark:border-emerald-800">
              Active Rollout
            </span>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Commission Tracker</h2>
            <p className="text-xs leading-relaxed mt-1 text-slate-600 dark:text-slate-400">
              Manage real estate transactions, execute multi-agent waterfall commission calculations, track YTD broker caps, and process final disbursement payables.
            </p>
          </div>
          <div className={`pt-2 grid gap-2.5 ${[showTransactions, showTransactions, showSettings].filter(Boolean).length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
            {showTransactions && <Link 
              href="/commission-tracker/transactions" 
              className="flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg border bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border-slate-300/80 dark:border-slate-700 transition"
            >
              <List className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
              Open Transaction List
            </Link>}
            {showTransactions && <Link
              href="/commission-tracker/agents"
              className="flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg border bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border-slate-300/80 dark:border-slate-700 transition"
            >
              <Users className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
              Agents
            </Link>}
            {showSettings && <Link
              href="/commission-tracker/settings"
              className="flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg border bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border-slate-300/80 dark:border-slate-700 transition"
            >
              <Settings className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
              Settings
            </Link>}
          </div>
        </div>}

        {showOwnerReports && <div className="p-6 rounded-xl shadow-md border bg-white dark:bg-slate-900 border-emerald-300/80 dark:border-emerald-800/80 hover:border-emerald-500 dark:hover:border-emerald-700 transition flex flex-col justify-between space-y-4">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-lg border flex items-center justify-center bg-emerald-50 dark:bg-slate-950 border-emerald-200/80 dark:border-slate-800 text-emerald-700 dark:text-emerald-400">
              <BarChart3 className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </div>
            <span className="px-2.5 py-1 font-bold text-[10px] tracking-wide uppercase rounded-md border bg-emerald-100/80 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border-emerald-300/60 dark:border-emerald-800">
              Active Rollout
            </span>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Owner Reports</h2>
            <p className="text-xs leading-relaxed mt-1 text-slate-600 dark:text-slate-400">
              See production, pipeline, agent leaderboards, and lead sources for the year, calculated from your transactions.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/owner-reports"
              className="flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg border bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border-slate-300/80 dark:border-slate-700 transition"
            >
              <BarChart3 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
              Open Owner Reports
            </Link>
          </div>
        </div>}

        {showDeferred && <div className="p-6 rounded-xl border opacity-75 bg-white/80 dark:bg-slate-900/50 border-slate-200/80 dark:border-slate-800 flex flex-col justify-between space-y-4">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-lg border flex items-center justify-center bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
              <Target className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </div>
            <span className="px-2.5 py-1 font-bold text-[10px] tracking-wide uppercase rounded-md border bg-amber-100/80 dark:bg-amber-950/50 text-amber-800 dark:text-amber-400 border-amber-300/60 dark:border-amber-900/60">
              Phase 2
            </span>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-300">Goals & Targets</h2>
            <p className="text-xs leading-relaxed mt-1 text-slate-500 dark:text-slate-400">
              Set annual GCI benchmarks, closed volume targets, and track agent cap milestones with real-time performance forecasting.
            </p>
          </div>
          <div className="pt-2">
            <div className="w-full py-2 text-center text-xs font-medium rounded-lg border cursor-not-allowed bg-slate-100/60 dark:bg-slate-950/50 text-slate-400 dark:text-slate-600 border-slate-200/60 dark:border-slate-800/60">
              Module Planned for Upcoming Release
            </div>
          </div>
        </div>}

        {showDeferred && <div className="p-6 rounded-xl border opacity-75 bg-white/80 dark:bg-slate-900/50 border-slate-200/80 dark:border-slate-800 flex flex-col justify-between space-y-4">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-lg border flex items-center justify-center bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
              <Wallet className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </div>
            <span className="px-2.5 py-1 font-bold text-[10px] tracking-wide uppercase rounded-md border bg-blue-100/80 dark:bg-blue-950/50 text-blue-800 dark:text-blue-400 border-blue-300/60 dark:border-blue-900/60">
              Phase 3
            </span>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-300">Operating Expenses</h2>
            <p className="text-xs leading-relaxed mt-1 text-slate-500 dark:text-slate-400">
              Track brokerage overhead, marketing expenditures, recurring SaaS subscriptions, and generate net profitability & cash flow reports.
            </p>
          </div>
          <div className="pt-2">
            <div className="w-full py-2 text-center text-xs font-medium rounded-lg border cursor-not-allowed bg-slate-100/60 dark:bg-slate-950/50 text-slate-400 dark:text-slate-600 border-slate-200/60 dark:border-slate-800/60">
              Module Planned for Upcoming Release
            </div>
          </div>
        </div>}

        {showDeferred && <div className="p-6 rounded-xl border opacity-75 bg-white/80 dark:bg-slate-900/50 border-slate-200/80 dark:border-slate-800 flex flex-col justify-between space-y-4">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-lg border flex items-center justify-center bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
              <TrendingUp className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </div>
            <span className="px-2.5 py-1 font-bold text-[10px] tracking-wide uppercase rounded-md border bg-purple-100/80 dark:bg-purple-950/50 text-purple-800 dark:text-purple-400 border-purple-300/60 dark:border-purple-900/60">
              Phase 4
            </span>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-300">Leads & Marketing ROI</h2>
            <p className="text-xs leading-relaxed mt-1 text-slate-500 dark:text-slate-400">
              Analyze lead source acquisition costs, track conversion rates across channels (Sphere, Zillow, Referrals), and measure ROI per agent.
            </p>
          </div>
          <div className="pt-2">
            <div className="w-full py-2 text-center text-xs font-medium rounded-lg border cursor-not-allowed bg-slate-100/60 dark:bg-slate-950/50 text-slate-400 dark:text-slate-600 border-slate-200/60 dark:border-slate-800/60">
              Module Planned for Upcoming Release
            </div>
          </div>
        </div>}

      </div>
    </main>
  );
}