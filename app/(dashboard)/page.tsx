'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';

export default function MainMenu() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch by waiting until mounted
  useEffect(() => {
    setMounted(true);
  }, []);

  const modules = [
    {
      id: 'commission-tracker',
      title: 'Commission Tracker',
      icon: '💸',
      status: 'Active Rollout',
      statusColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      description:
        'Manage real estate transactions, execute multi-agent waterfall commission calculations, track YTD broker caps, and process final disbursement payables.',
      active: true,
      links: [
        { label: '📋 Transactions List', href: '/commission-tracker/transactions', isPrimary: false },
        { label: '⚡ Waterfall Engine', href: '/commission-tracker/transactions/TR000505', isPrimary: true },
      ],
    },
    {
      id: 'goals',
      title: 'Goals & Targets',
      icon: '🎯',
      status: 'Phase 2',
      statusColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
      description:
        'Set annual GCI benchmarks, closed volume targets, and track agent cap milestones with real-time performance forecasting.',
      active: false,
      links: [],
    },
    {
      id: 'operating-expenses',
      title: 'Operating Expenses',
      icon: '🏢',
      status: 'Phase 3',
      statusColor: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
      description:
        'Track brokerage overhead, marketing expenditures, recurring SaaS subscriptions, and generate net profitability & cash flow reports.',
      active: false,
      links: [],
    },
    {
      id: 'leads',
      title: 'Leads & Marketing ROI',
      icon: '📈',
      status: 'Phase 4',
      statusColor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
      description:
        'Analyze lead source acquisition costs, track conversion rates across channels (Sphere, Zillow, Referrals), and measure ROI per agent.',
      active: false,
      links: [],
    },
  ];

  return (
    <main className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Executive Welcome Banner */}
      <div className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-6 shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-colors">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            <span>Soleox ERP Suite</span>
            <span>•</span>
            <span className="text-slate-500 dark:text-slate-400">Main Menu</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Executive Operations Launchpad</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            Select a module below to launch your management workflows.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* LIGHT / DARK THEME TOGGLE BUTTON */}
          {mounted && (
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex items-center gap-2 bg-slate-200 dark:bg-slate-900 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 px-3.5 py-1.5 rounded-lg text-xs font-bold transition"
            >
              <span>{theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}</span>
            </button>
          )}

          <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Operational
          </div>
        </div>
      </div>

      {/* Modules Directory Grid */}
      <div className="space-y-4">
        <div className="flex justify-between items-center border-b border-slate-300 dark:border-slate-800 pb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Platform Product Modules (4)
          </h2>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
            1 Active / 3 Scheduled
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {modules.map((mod) => (
            <div
              key={mod.id}
              className={`bg-slate-100 dark:bg-slate-800 border rounded-xl p-6 shadow-xl flex flex-col justify-between space-y-5 transition ${
                mod.active
                  ? 'border-emerald-500/50 dark:border-emerald-500/40 hover:border-emerald-500 hover:shadow-2xl'
                  : 'border-slate-300 dark:border-slate-700/60 opacity-80 hover:opacity-100'
              }`}
            >
              {/* Header: Icon & Status Badge */}
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl border ${
                      mod.active
                        ? 'bg-emerald-500/10 dark:bg-emerald-500/20 border-emerald-500/30'
                        : 'bg-slate-200 dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {mod.icon}
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${mod.statusColor}`}>
                    {mod.status}
                  </span>
                </div>

                {/* Title & Description */}
                <div>
                  <h3 className={`text-lg font-bold ${mod.active ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                    {mod.title}
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 text-xs mt-1.5 leading-relaxed">
                    {mod.description}
                  </p>
                </div>
              </div>

              {/* Action Buttons Footer */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-700/80">
                {mod.active ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {mod.links.map((link) => (
                      <Link
                        key={link.label}
                        href={link.href}
                        className={`px-3 py-2 rounded-lg text-xs font-bold transition text-center flex items-center justify-center ${
                          link.isPrimary
                            ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40'
                            : 'bg-slate-200 dark:bg-slate-900 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <button
                    disabled
                    className="w-full bg-slate-200/60 dark:bg-slate-900/60 text-slate-400 dark:text-slate-500 border border-slate-300 dark:border-slate-800/80 px-3 py-2 rounded-lg text-xs font-semibold cursor-not-allowed text-center"
                  >
                    Module Planned for Upcoming Release
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}