'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, ChartColumn, Gauge, Link2, ListFilter, PanelLeftClose, PanelLeftOpen, Scale, ScrollText, Settings2, Zap, type LucideIcon } from 'lucide-react';
import { pageFrame, phoneSheet, phoneTitle } from '@/lib/page-frame';

const COLLAPSED_KEY = 'soleox-settings-sidebar-collapsed';

type NavLink = { label: string; href: string; icon: LucideIcon };
type NavEntry =
  | { kind: 'link'; item: NavLink }
  | { kind: 'section'; label: string; items: NavLink[] };

const NAV: NavEntry[] = [
  { kind: 'link', item: { label: 'Fields', href: '/commission-tracker/settings/fields', icon: Settings2 } },
  {
    kind: 'section',
    label: 'Transactions',
    items: [
      { label: 'Views', href: '/commission-tracker/settings/transaction-view', icon: ListFilter },
      { label: 'Scorecards', href: '/commission-tracker/settings/scorecards', icon: ChartColumn },
      { label: 'TMS Integrations', href: '/commission-tracker/settings/integrations', icon: Link2 },
    ],
  },
  {
    kind: 'section',
    label: 'Commission',
    items: [
      { label: 'Entities', href: '/commission-tracker/settings/commission-entities', icon: Building2 },
      { label: 'Templates', href: '/commission-tracker/settings/commission-templates', icon: Zap },
      { label: 'Caps', href: '/commission-tracker/settings/caps', icon: Gauge },
      { label: 'Agent Allocations', href: '/commission-tracker/settings/agent-allocations', icon: Scale },
    ],
  },
  {
    kind: 'section',
    label: 'Audit',
    items: [{ label: 'Activity', href: '/commission-tracker/settings/activity', icon: ScrollText }],
  },
];

const NAV_LINKS = NAV.flatMap((entry) => (entry.kind === 'link' ? [entry.item] : entry.items));

/**
 * Settings pages share one sidebar. It starts open; collapsing it leaves an icon rail whose names show on
 * hover, and the choice is remembered for this browser. Phones and narrow screens get one row of page
 * pills above the page instead, scrolled so the current page shows.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {
      // Storage can be blocked; the sidebar then simply starts open.
    }
  }, []);

  const setAndRemember = (next: boolean) => {
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      // Not remembered this time; the choice still applies on this page.
    }
  };

  const isActive = (href: string) => pathname.startsWith(href);
  const activePillRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    activePillRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [pathname]);
  const linkClass = (href: string) => `flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
    isActive(href)
      ? 'bg-brand-500/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-white'
  }`;

  return (
    <main className={`${pageFrame} space-y-6 py-6 md:py-8`}>
      <div className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-4 sm:px-6 sm:py-5 shadow-xs transition-colors ${phoneTitle}`}>
        <div className="text-xs font-bold text-brand-600 dark:text-brand-400 mb-1">Commission Tracker</div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm">
          Fields, views, commission entities and templates, caps, and integrations.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)] gap-6 items-start">
        <aside aria-label="Settings pages" className={`h-fit w-full lg:sticky lg:top-[calc(var(--app-nav-offset,4rem)+1rem)] ${collapsed ? 'lg:w-14' : 'lg:w-60'}`}>
          {/* Collapsed rail (wide screens only). */}
          {collapsed && (
            <nav className="hidden lg:flex flex-col items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 shadow-xs">
              <button
                type="button"
                onClick={() => setAndRemember(false)}
                className="mb-1 inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-white cursor-pointer transition"
                aria-label="Expand Sidebar"
                title="Expand Sidebar"
              >
                <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
              </button>
              {NAV_LINKS.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-label={item.label}
                    aria-current={isActive(item.href) ? 'page' : undefined}
                    className={`group relative inline-flex h-10 w-10 items-center justify-center rounded-lg transition ${
                      isActive(item.href)
                        ? 'bg-brand-500/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    {/* The page name shows as soon as the pointer or focus lands on the icon. */}
                    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:bg-slate-950">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </nav>
          )}

          {/* Phones and narrow screens: one row of page pills that scrolls sideways. */}
          <nav aria-label="Settings pages" className={`flex gap-1.5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xs [scrollbar-width:none] lg:hidden dark:border-slate-700 dark:bg-slate-800 ${phoneSheet}`}>
            {NAV_LINKS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  ref={active ? activePillRef : undefined}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    active
                      ? 'bg-brand-500/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Full list on wide screens while open. */}
          <nav className={`hidden bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 shadow-xs transition-colors ${collapsed ? '' : 'lg:block'}`}>
            <div className="flex items-center justify-between px-3 pb-1 pt-1.5">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">Settings</span>
              <button
                type="button"
                onClick={() => setAndRemember(true)}
                className="hidden lg:inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700/50 dark:hover:text-slate-200 cursor-pointer transition"
                aria-label="Collapse Sidebar"
                title="Collapse Sidebar"
              >
                <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
            <div className="space-y-0.5">
              {NAV.map((entry) => {
                if (entry.kind === 'section') {
                  return (
                    <div key={entry.label} className="pt-2">
                      <div className="px-3 pb-1 text-[11px] font-bold text-slate-400 dark:text-slate-500">{entry.label}</div>
                      <div className="space-y-0.5">
                        {entry.items.map((item) => {
                          const Icon = item.icon;
                          return (
                            <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined} className={linkClass(item.href)}>
                              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                              <span className="truncate">{item.label}</span>
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
                  <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined} className={linkClass(item.href)}>
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
