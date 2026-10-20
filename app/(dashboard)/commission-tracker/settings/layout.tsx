'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, ChartColumn, ChevronRight, Gauge, Link2, ListFilter, PanelLeftClose, PanelLeftOpen, Scale, ScrollText, Settings2, Zap, type LucideIcon } from 'lucide-react';
import { pageFrame } from '@/lib/page-frame';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [menuClosed, setMenuClosed] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const hoverTimer = useRef<number | null>(null);
  const hoverOpenRef = useRef(false);
  const menuClosedRef = useRef(false);
  const pinnedOpenRef = useRef(false);

  useEffect(() => {
    setPinnedOpen(window.localStorage.getItem('soleox-settings-sidebar-collapsed') === '0');
  }, []);

  useEffect(() => {
    hoverOpenRef.current = hoverOpen;
  }, [hoverOpen]);

  useEffect(() => {
    menuClosedRef.current = menuClosed;
  }, [menuClosed]);

  useEffect(() => {
    pinnedOpenRef.current = pinnedOpen;
  }, [pinnedOpen]);

  const clearHoverTimer = () => {
    if (hoverTimer.current != null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  useEffect(() => clearHoverTimer, []);

  const armHoverTimer = () => {
    if (pinnedOpenRef.current || hoverOpenRef.current || menuClosedRef.current) return;
    clearHoverTimer();
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      hoverOpenRef.current = true;
      setHoverOpen(true);
    }, 3000);
  };

  const pinOpen = () => {
    clearHoverTimer();
    setPinnedOpen(true);
    setMenuClosed(false);
    setHoverOpen(false);
    window.localStorage.setItem('soleox-settings-sidebar-collapsed', '0');
  };

  const pinClosed = () => {
    clearHoverTimer();
    hoverOpenRef.current = false;
    menuClosedRef.current = true;
    setPinnedOpen(false);
    setHoverOpen(false);
    setMenuClosed(true);
    window.localStorage.setItem('soleox-settings-sidebar-collapsed', '1');
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };

  const hideMenu = () => {
    if (pinnedOpenRef.current) return;
    clearHoverTimer();
    hoverOpenRef.current = false;
    menuClosedRef.current = true;
    setHoverOpen(false);
    setMenuClosed(true);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };

  const onSidebarEnter = () => {
    armHoverTimer();
  };

  const onSidebarMove = () => {
    if (hoverOpenRef.current) return;
    armHoverTimer();
  };

  const onSidebarLeave = () => {
    clearHoverTimer();
    hoverOpenRef.current = false;
    menuClosedRef.current = false;
    setHoverOpen(false);
    setMenuClosed(false);
  };

  type NavLink = { label: string; href: string; icon: LucideIcon };
  type NavEntry =
    | { kind: 'link'; item: NavLink }
    | { kind: 'section'; label: string; items: NavLink[] };

  const nav: NavEntry[] = [
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
    { kind: 'link', item: { label: 'Commission Entities', href: '/commission-tracker/settings/commission-entities', icon: Building2 } },
    { kind: 'link', item: { label: 'Commission Templates', href: '/commission-tracker/settings/commission-templates', icon: Zap } },
    { kind: 'link', item: { label: 'Caps', href: '/commission-tracker/settings/caps', icon: Gauge } },
    { kind: 'link', item: { label: 'Agent Allocations', href: '/commission-tracker/settings/agent-allocations', icon: Scale } },
    { kind: 'link', item: { label: 'Activity', href: '/commission-tracker/settings/activity', icon: ScrollText } },
  ];

  const navLinks = nav.flatMap((entry) => (entry.kind === 'link' ? [entry.item] : entry.items));

  const linkClass = (href: string, nested = false) => {
    const isActive = pathname.startsWith(href);
    return `flex items-center justify-between rounded-lg text-xs font-semibold transition ${
      nested ? 'px-3 py-2' : 'px-3.5 py-2.5'
    } ${
      isActive
        ? 'bg-brand-500/10 dark:bg-brand-950/80 text-brand-700 dark:text-brand-400 border border-brand-500/30 font-bold'
        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 border border-transparent'
    }`;
  };

  return (
    <main className={`${pageFrame} space-y-6 py-6 md:py-8`}>
      {/* Settings Master Banner */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-md transition-colors">
        <div className="flex items-center gap-2 text-xs font-bold text-brand-600 dark:text-brand-400 mb-1">
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
        <aside
          className={`relative h-fit w-full lg:sticky lg:top-16 ${pinnedOpen ? 'lg:z-30 lg:w-80' : 'z-30 lg:z-50 lg:w-14'}`}
          onMouseEnter={onSidebarEnter}
          onMouseMove={onSidebarMove}
          onMouseLeave={onSidebarLeave}
        >
          {!pinnedOpen && (
          <div className="hidden lg:flex flex-col items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 shadow-md">
            <button
              type="button"
              onClick={pinOpen}
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
                  onClick={hideMenu}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center transition ${
                    isActive
                      ? 'bg-brand-500/10 dark:bg-brand-950/80 text-brand-700 dark:text-brand-400 border border-brand-500/30'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 border border-transparent'
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </Link>
              );
            })}
          </div>
          )}

          <div className={pinnedOpen ? '' : `lg:absolute lg:left-0 lg:top-0 lg:z-50 lg:w-80 ${hoverOpen && !menuClosed ? '' : 'lg:hidden'}`}>
            <div className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-1 transition-colors ${pinnedOpen ? 'shadow-md' : 'shadow-xs'}`}>
              <div className="flex items-center justify-between px-3 py-1.5">
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                  Configurations
                </span>
                <button
                  type="button"
                  onClick={pinnedOpen ? pinClosed : pinOpen}
                  className="hidden lg:inline-flex w-6 h-6 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-700/50 cursor-pointer transition"
                  aria-label={pinnedOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                  title={pinnedOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                >
                  {pinnedOpen ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeftOpen className="w-3.5 h-3.5" />}
                </button>
              </div>
              {nav.map((entry) => {
                if (entry.kind === 'section') {
                  return (
                    <div key={entry.label} className="pt-2">
                      <div className="px-3.5 pb-1 text-[11px] font-bold text-slate-400 dark:text-slate-500">
                        {entry.label}
                      </div>
                      <div className="space-y-1 border-l border-slate-200 ml-5 pl-2 dark:border-slate-700">
                        {entry.items.map((item) => {
                          const Icon = item.icon;
                          return (
                            <Link key={item.href} href={item.href} onClick={hideMenu} className={linkClass(item.href, true)}>
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
                  <Link key={item.href} href={item.href} onClick={hideMenu} className={linkClass(item.href)}>
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