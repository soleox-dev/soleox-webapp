'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navItems = [
    { label: 'Field Customizations', href: '/commission-tracker/settings/fields', icon: '⚙️' },
    { label: 'Agents', href: '/commission-tracker/settings/agents', icon: '👤' },
    { label: 'Commission Entities', href: '/commission-tracker/settings/commission-entities', icon: '🏢' },
    { label: 'Commission Templates', href: '/commission-tracker/settings/commission-templates', icon: '⚡' },
  ];

  return (
    <main className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Settings Master Banner */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-md transition-colors">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">
          <span>Commission Tracker</span>
          <span>•</span>
          <span className="text-slate-500 dark:text-slate-400">Settings & Rules Hub</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">System Configurations</h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm">
          Manage database field options, agent rosters, group hierarchies, and waterfall templates.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Persistent Settings Sidebar */}
        <aside className="lg:col-span-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-md space-y-1 transition-colors sticky top-6">
          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase px-3 py-1.5 block">
            Configurations
          </span>
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold transition ${
                  isActive
                    ? 'bg-emerald-500/10 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 font-bold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
                <span className="text-[10px] text-slate-400">➔</span>
              </Link>
            );
          })}
        </aside>

        {/* Dynamic View Panel */}
        <div className="lg:col-span-9">{children}</div>
      </div>
    </main>
  );
}