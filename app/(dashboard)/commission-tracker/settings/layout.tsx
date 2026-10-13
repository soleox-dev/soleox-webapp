'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, ChartColumn, ChevronRight, FileSpreadsheet, ListFilter, PanelLeftClose, PanelLeftOpen, Settings2, Zap, type LucideIcon } from 'lucide-react';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem('soleox-settings-sidebar-collapsed') === '1') setCollapsed(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem('soleox-settings-sidebar-collapsed', next ? '1' : '0');
      return next;
    });
  };

  type NavLink = { label: string; href: string; icon: LucideIcon };
  type NavEntry =
    | { kind: 'link'; item: NavLink }
    | { kind: 'section'; label: string; items: NavLink[] };

  const nav: NavEntry[] = [
    { kind: 'link', item: { label: 'Field Customizations', href: '/commission-tracker/settings/fields', icon: Settings2 } },
    {
      kind: 'section',
      label: 'Transactions',
      items: [
        { label: 'Default View', href: '/commission-tracker/settings/transaction-view', icon: ListFilter },
        { label: 'Scorecards', href: '/commission-tracker/settings/scorecards', icon: ChartColumn },
        { label: 'Integrations', href: '/commission-tracker/settings/integrations', icon: FileSpreadsheet },
      ],
    },
    { kind: 'link', item: { label: 'Commission Entities', href: '/commission-tracker/settings/commission-entities', icon: Building2 } },
    { kind: 'link', item: { label: 'Commission Templates', href: '/commission-tracker/settings/commission-templates', icon: Zap } },
  ];

  const navLinks = nav.flatMap((entry) => (entry.kind === 'link' ? [entry.item] : entry.items));

  const linkClass = (href: string, nested = false) => {
    const isActive = pathname.startsWith(href);
    return `flex items-center justify-between rounded-lg text-xs font-semibold transition ${
      nested ? 'px-3 py-2' : 'px-3.5 py-2.5'
    } ${
      isActive
        ? 'bg-emerald-500/10 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 font-bold'
        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 border border-transparent'
    }`;
  };

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
          Manage database field options, commission entities, and waterfall templates.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)] gap-6 items-start">
        <aside className={`h-fit lg:sticky lg:top-6 ${collapsed ? 'lg:w-14' : 'w-full lg:w-80'}`}>
          {collapsed && (
            <div className="hidden lg:flex flex-col items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 shadow-md">
              <button
                type="button"
                onClick={toggleCollapsed}
                className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700/50 cursor-pointer transition"
                aria-label="Expand sidebar"
                title="Expand sidebar"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
              {navLinks.map((item) => {
                const isActive = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-label={item.label}
                    title={item.label}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center transition ${
                      isActive
                        ? 'bg-emerald-500/10 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 border border-transparent'
                    }`}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </Link>
                );
              })}
            </div>
          )}

          <div className={collapsed ? 'lg:hidden' : ''}>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-md space-y-1 transition-colors">
              <div className="flex items-center justify-between px-3 py-1.5">
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                  Configurations
                </span>
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  className="hidden lg:inline-flex w-6 h-6 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-700/50 cursor-pointer transition"
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose className="w-3.5 h-3.5" />
                </button>
              </div>
              {nav.map((entry) => {
                if (entry.kind === 'section') {
                  return (
                    <div key={entry.label} className="pt-2">
                      <div className="px-3.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {entry.label}
                      </div>
                      <div className="space-y-1 border-l border-slate-200 ml-5 pl-2 dark:border-slate-700">
                        {entry.items.map((item) => {
                          const Icon = item.icon;
                          return (
                            <Link key={item.href} href={item.href} className={linkClass(item.href, true)}>
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                                <span>{item.label}</span>
                              </div>
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={1.75} aria-hidden />
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                const item = entry.item;
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className={linkClass(item.href)}>
                    <div className="flex items-center gap-2.5">
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                      <span>{item.label}</span>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={1.75} aria-hidden />
                  </Link>
                );
              })}
            </div>
          </div>
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}