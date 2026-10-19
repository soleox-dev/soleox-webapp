// components/Navbar.tsx

'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useSoleoxTheme } from '@/app/providers';
import { SoleoxLogo } from '@/components/ui/logo';
import { useAccess } from '@/components/access-provider';
import { pageFrame } from '@/lib/page-frame';
import { useIsDesktop } from '@/lib/use-media-query';
import { OWNER_REPORTS, OWNER_REPORT_GROUPS } from '@/lib/owner-reports';
import { ArrowLeft, Briefcase, Building2, ChevronLeft, ChevronRight, House, List, Menu, Monitor, Moon, Settings, Sun, Users, X, type LucideIcon } from 'lucide-react';
import type { ThemePreference } from '@/app/providers';

export default function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { access, chooseClient } = useAccess();
  const { theme, setTheme } = useSoleoxTheme();
  const isDesktop = useIsDesktop();

  const themeOptions: { id: ThemePreference; label: string; icon: LucideIcon }[] = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Monitor },
  ];

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [phoneNavOpen, setPhoneNavOpen] = useState(false);
  // The sheet's second level lists a report section's reports. It opens there while inside that section.
  const [phoneNavLevel, setPhoneNavLevel] = useState<'main' | 'owner-reports'>('main');
  const [reportsNavOpen, setReportsNavOpen] = useState(false);
  const [closedMenu, setClosedMenu] = useState<'tracker' | 'reports' | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  const isMainMenu = pathname === '/';
  const isOwnerReports = pathname.startsWith('/owner-reports');
  const isAgentReports = pathname.startsWith('/agent-reports');
  const isOfficeReports = pathname.startsWith('/office-reports');
  const isReports = isOwnerReports || isAgentReports || isOfficeReports;
  const isCommissionTracker = pathname.startsWith('/commission-tracker');
  const isSettingsActive = pathname.startsWith('/commission-tracker/settings');
  const isTransactionsActive = pathname.startsWith('/commission-tracker/transactions');
  const isTransactionDetail = /^\/commission-tracker\/transactions\/[^/]+/.test(pathname);
  const isAgentsActive = pathname.startsWith('/commission-tracker/agents');
  const permissions = access?.permissions;
  const showTransactions = Boolean(permissions?.commissionTrackerRead || permissions?.commissionTrackerWrite || permissions?.superAdmin);
  const showSettings = Boolean(permissions?.commissionTrackerSettings || permissions?.superAdmin);
  const showTracker = showTransactions || showSettings;
  const showOwnerReports = Boolean(permissions?.ownerReports || permissions?.superAdmin);
  const showDeferred = Boolean(permissions?.superAdmin);
  const showReports = showOwnerReports || showDeferred;
  const trackerHref = showTransactions ? '/commission-tracker/transactions' : '/commission-tracker/settings';
  const reportsHref = showOwnerReports ? '/owner-reports' : '/agent-reports';

  // Calculate user initials dynamically from NextAuth session
  const getUserInitials = () => {
    if (session?.user?.name) {
      const parts = session.user.name.split(' ');
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return parts[0].substring(0, 2).toUpperCase();
    }
    if (session?.user?.email) {
      return session.user.email.substring(0, 2).toUpperCase();
    }
    return 'CB'; // Default fallback
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOwnerReports) return;
    setReportsNavOpen(headerRef.current?.matches(':hover') ?? false);
    setIsUserMenuOpen(false);
  }, [pathname, isOwnerReports]);

  // The phone sheet closes on navigation and when the window widens to desktop.
  useEffect(() => {
    setPhoneNavOpen(false);
  }, [pathname, isDesktop]);

  useEffect(() => {
    if (!phoneNavOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPhoneNavOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [phoneNavOpen]);

  // Below md the report header is static, so only desktop listens for the pointer near the top.
  useEffect(() => {
    if (!isOwnerReports || !isDesktop) return;
    const conceal = () => {
      setReportsNavOpen(false);
      setIsUserMenuOpen(false);
    };
    const onMove = (event: MouseEvent) => {
      const overBar = headerRef.current?.contains(event.target as Node) ?? false;
      if (event.clientY <= 16 || overBar) setReportsNavOpen(true);
      else conceal();
    };
    document.documentElement.addEventListener('mousemove', onMove);
    document.documentElement.addEventListener('mouseleave', conceal);
    return () => {
      document.documentElement.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', conceal);
    };
  }, [isOwnerReports, isDesktop]);

  const hideMenu = (menu: 'tracker' | 'reports') => {
    setClosedMenu(menu);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };
  const releaseMenu = (menu: 'tracker' | 'reports') => {
    setClosedMenu((current) => (current === menu ? null : current));
  };
  const menuClass = (menu: 'tracker' | 'reports', openClass: string) => (
    `absolute left-0 top-full z-50 pt-2 ${closedMenu === menu ? 'hidden' : `hidden ${openClass}`}`
  );

  const concealReportsNav = (next: EventTarget | null) => {
    if (next instanceof Node && headerRef.current?.contains(next)) return;
    setReportsNavOpen(false);
    setIsUserMenuOpen(false);
  };

  // Do not render the top navbar on the login page
  if (pathname === '/login') {
    return null;
  }

  const barClass = 'w-full bg-white text-slate-900 border-b border-slate-200 dark:bg-[#0b1329] dark:text-white dark:border-slate-800/80';
  // Below md the report header stays in place; the hover-reveal bar is desktop only.
  const reportsBarClass = `relative z-50 md:fixed md:inset-x-0 md:top-0 md:transition-transform md:duration-200 md:ease-out md:motion-reduce:transition-none ${reportsNavOpen ? 'md:translate-y-0 md:shadow-lg' : 'md:-translate-y-full md:pointer-events-none'}`;
  const sheetLinkClass = (active: boolean) => `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold ${
    active
      ? 'bg-emerald-500/10 font-bold text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400'
      : 'text-slate-700 dark:text-slate-200'
  }`;
  const sheetHeadingClass = 'px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-slate-400';

  return (
    <header
      ref={headerRef}
      onFocusCapture={isOwnerReports ? () => setReportsNavOpen(true) : undefined}
      onBlur={isOwnerReports ? (event) => concealReportsNav(event.relatedTarget) : undefined}
      className={isOwnerReports ? `${reportsBarClass} ${barClass}` : `sticky top-0 z-50 ${barClass}`}
    >
      <div className={`${pageFrame} flex h-16 items-center justify-between`}>
        
        {/* Brand Logo Component with REBI Badge */}
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center space-x-2">
            <SoleoxLogo className="h-7 w-auto" />
            <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-800/80">
              REBI
            </span>
          </Link>
          {isTransactionDetail && (
            <Link
              href="/commission-tracker/transactions"
              aria-label="Back to Transactions"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 transition hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300 md:hidden"
            >
              <ArrowLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
              Transactions
            </Link>
          )}
        </div>

        {/* Central Nav Container with Pill Outline */}
        <nav className="hidden md:flex items-center space-x-2 bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-1 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400">
          {showTracker && <div className="group/tracker relative" onMouseLeave={() => releaseMenu('tracker')}>
            <Link
              href={isTransactionDetail ? '/commission-tracker/transactions' : trackerHref}
              aria-label={isTransactionDetail ? 'Back to Transactions' : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                isCommissionTracker
                  ? 'bg-emerald-500/10 dark:bg-emerald-950/80 border border-emerald-500/80 text-emerald-700 dark:text-emerald-400 font-bold'
                  : 'hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {isTransactionDetail ? (
                <>
                  <ArrowLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
                  Transactions
                </>
              ) : (
                'Commission Tracker'
              )}
            </Link>
            <div className={menuClass('tracker', 'group-hover/tracker:block group-focus-within/tracker:block')} onClick={() => hideMenu('tracker')}>
              <div className="w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                {showTransactions && <Link
                  href="/commission-tracker/transactions"
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                    isTransactionsActive
                      ? 'bg-emerald-500/10 font-bold text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400'
                      : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <List className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden /> Transactions
                </Link>}
                {showTransactions && <Link
                  href="/commission-tracker/agents"
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                    isAgentsActive
                      ? 'bg-emerald-500/10 font-bold text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400'
                      : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <Users className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden /> Agents
                </Link>}
                {showSettings && <Link
                  href="/commission-tracker/settings"
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                    isSettingsActive
                      ? 'bg-emerald-500/10 font-bold text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400'
                      : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <Settings className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden /> Settings
                </Link>}
              </div>
            </div>
          </div>}
          {showReports && <div className="group/reports relative" onMouseLeave={() => releaseMenu('reports')}>
            <Link
              href={reportsHref}
              className={`block px-3 py-1.5 rounded-lg transition ${
                isReports
                  ? 'bg-emerald-500/10 dark:bg-emerald-950/80 border border-emerald-500/80 text-emerald-700 dark:text-emerald-400 font-bold'
                  : 'hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Reports
            </Link>
            <div className={menuClass('reports', 'group-hover/reports:block group-focus-within/reports:block')} onClick={() => hideMenu('reports')}>
              <div className="w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                {showOwnerReports && <Link href="/owner-reports" className={`flex items-center gap-2 rounded-lg px-3 py-2 ${isOwnerReports ? 'bg-emerald-500/10 font-bold text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
                  <Briefcase className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden /> Owner Reports
                </Link>}
                {showDeferred && <Link href="/agent-reports" className={`flex items-center gap-2 rounded-lg px-3 py-2 ${isAgentReports ? 'bg-emerald-500/10 font-bold text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
                  <Users className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden /> Agent Reports
                </Link>}
                {showDeferred && <Link href="/office-reports" className={`flex items-center gap-2 rounded-lg px-3 py-2 ${isOfficeReports ? 'bg-emerald-500/10 font-bold text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
                  <Building2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden /> Office Reports
                </Link>}
              </div>
            </div>
          </div>}
          {showDeferred && <span className="px-3 py-1.5 opacity-50 cursor-not-allowed">Goals</span>}
          {showDeferred && <span className="px-3 py-1.5 opacity-50 cursor-not-allowed">Leads</span>}
          {showDeferred && <span className="px-3 py-1.5 opacity-50 cursor-not-allowed">Operating Expenses</span>}
        </nav>

        {/* Right Nav Actions */}
        <div className="flex items-center space-x-3 text-xs font-medium text-slate-700 dark:text-slate-300">
          {/* Phone menu button. Desktop keeps the pill nav and the avatar menu. */}
          <button
            type="button"
            onClick={() => {
              setPhoneNavLevel(isOwnerReports && showOwnerReports ? 'owner-reports' : 'main');
              setPhoneNavOpen(true);
            }}
            aria-label="Open menu"
            aria-expanded={phoneNavOpen}
            className="me-0 inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 dark:text-slate-200 md:hidden cursor-pointer"
          >
            <Menu className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>

          {!isMainMenu && (
            <Link
              href="/"
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:text-slate-900 dark:hover:text-white transition"
            >
              <House className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden /> Main Menu
            </Link>
          )}

          {/* Vertical Divider */}
          {!isMainMenu && (
            <div className="hidden md:block h-4 w-px bg-slate-200 dark:bg-slate-800 my-auto" />
          )}

          {/* User Badge & Sign Out Dropdown */}
          <div className="relative hidden md:block" ref={dropdownRef}>
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="w-8 h-8 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 font-bold rounded-full flex items-center justify-center text-xs hover:ring-2 hover:ring-emerald-500/40 transition cursor-pointer"
              aria-label="User menu"
            >
              {getUserInitials()}
            </button>

            {isUserMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                {/* Active Session Info */}
                <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    {session?.user?.name || 'Authenticated User'}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {session?.user?.email || 'user@soleox.com'}
                  </p>
                  {access?.clientName && (
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400 truncate mt-1">{access.clientName}</p>
                  )}
                </div>
                {access && access.clients.length > 1 && (
                  <div className="py-1 border-b border-slate-100 dark:border-slate-800">
                    <p className="px-4 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Client</p>
                    {access.clients.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          void chooseClient(client.id);
                        }}
                        className={`w-full text-left px-4 py-2 text-xs font-semibold truncate cursor-pointer ${
                          client.id === access.clientId
                            ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {client.name}
                      </button>
                    ))}
                  </div>
                )}

                <div className="py-1 border-b border-slate-100 dark:border-slate-800">
                  <p className="px-4 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Theme</p>
                  {themeOptions.map((option) => {
                    const Icon = option.icon;
                    const selected = theme === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setTheme(option.id);
                          setIsUserMenuOpen(false);
                        }}
                        aria-pressed={selected}
                        className={`w-full text-left px-4 py-2 text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                          selected
                            ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                {/* Sign Out Trigger */}
                <button
                  onClick={() => {
                    window.sessionStorage.removeItem('soleox-transactions-list');
                    void signOut({ callbackUrl: '/login' });
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2 transition cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1m0-10V5" />
                  </svg>
                  Sign Out
                </button>
              </div>
            )}
          </div>

        </div>

      </div>
      {/* Phone navigation sheet. Same permission checks as the pill nav and avatar menu. */}
      {phoneNavOpen && (
        <div className="app-modal fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setPhoneNavOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/50"
          />
          <div className="absolute inset-y-0 right-0 flex w-[min(20rem,calc(100%-3rem))] flex-col overflow-y-auto overscroll-contain bg-white pb-[env(safe-area-inset-bottom)] text-slate-900 shadow-2xl dark:bg-[#0b1329] dark:text-white">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{session?.user?.name || 'Authenticated User'}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{session?.user?.email || 'user@soleox.com'}</p>
                {access?.clientName && <p className="truncate text-xs text-emerald-700 dark:text-emerald-400">{access.clientName}</p>}
              </div>
              <button
                type="button"
                onClick={() => setPhoneNavOpen(false)}
                aria-label="Close menu"
                className="-mr-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 cursor-pointer"
              >
                <X className="h-5 w-5" strokeWidth={2} aria-hidden />
              </button>
            </div>

            {phoneNavLevel === 'owner-reports' ? (
              <nav className="px-2 py-2" aria-label="Owner Reports">
                <button
                  type="button"
                  onClick={() => setPhoneNavLevel('main')}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-emerald-700 dark:text-emerald-400 cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden /> Back to Main Menu
                </button>
                <Link href="/owner-reports" className={sheetLinkClass(pathname === '/owner-reports')}>
                  <Briefcase className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden /> Owner Reports
                </Link>
                {OWNER_REPORT_GROUPS.map((group) => {
                  const reports = OWNER_REPORTS.filter((item) => item.group === group);
                  if (reports.length === 0) return null;
                  return (
                    <div key={group}>
                      <p className={sheetHeadingClass}>{group}</p>
                      {reports.map((item) => {
                        const number = String(OWNER_REPORTS.findIndex((entry) => entry.id === item.id) + 1).padStart(2, '0');
                        const href = `/owner-reports/${item.id}`;
                        return (
                          <Link key={item.id} href={href} className={sheetLinkClass(pathname === href)}>
                            <span className="w-5 shrink-0 text-xs font-medium tabular-nums text-slate-400">{number}</span>
                            <span className="min-w-0 truncate">{item.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  );
                })}
              </nav>
            ) : (
            <>
            <nav className="px-2 py-2" aria-label="Main">
              <Link href="/" className={sheetLinkClass(isMainMenu)}>
                <House className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden /> Main Menu
              </Link>
              {showTracker && <p className={sheetHeadingClass}>Commission Tracker</p>}
              {showTransactions && (
                <Link href="/commission-tracker/transactions" className={sheetLinkClass(isTransactionsActive)}>
                  <List className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden /> Transactions
                </Link>
              )}
              {showTransactions && (
                <Link href="/commission-tracker/agents" className={sheetLinkClass(isAgentsActive)}>
                  <Users className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden /> Agents
                </Link>
              )}
              {showSettings && (
                <Link href="/commission-tracker/settings" className={sheetLinkClass(isSettingsActive)}>
                  <Settings className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden /> Settings
                </Link>
              )}
              {showReports && <p className={sheetHeadingClass}>Reports</p>}
              {showOwnerReports && (
                <button
                  type="button"
                  onClick={() => setPhoneNavLevel('owner-reports')}
                  className={`${sheetLinkClass(isOwnerReports)} w-full text-left cursor-pointer`}
                >
                  <Briefcase className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden /> Owner Reports
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
                </button>
              )}
              {showDeferred && (
                <Link href="/agent-reports" className={sheetLinkClass(isAgentReports)}>
                  <Users className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden /> Agent Reports
                </Link>
              )}
              {showDeferred && (
                <Link href="/office-reports" className={sheetLinkClass(isOfficeReports)}>
                  <Building2 className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden /> Office Reports
                </Link>
              )}
            </nav>

            {access && access.clients.length > 1 && (
              <div className="border-t border-slate-200 px-2 py-2 dark:border-slate-800">
                <p className={sheetHeadingClass}>Client</p>
                {access.clients.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => {
                      setPhoneNavOpen(false);
                      void chooseClient(client.id);
                    }}
                    aria-pressed={client.id === access.clientId}
                    className={`${sheetLinkClass(client.id === access.clientId)} w-full text-left cursor-pointer`}
                  >
                    <span className="truncate">{client.name}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="border-t border-slate-200 px-2 py-2 dark:border-slate-800">
              <p className={sheetHeadingClass}>Theme</p>
              <div className="grid grid-cols-3 gap-1 px-1">
                {themeOptions.map((option) => {
                  const Icon = option.icon;
                  const selected = theme === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setTheme(option.id)}
                      aria-pressed={selected}
                      className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg border text-xs font-semibold cursor-pointer ${
                        selected
                          ? 'border-emerald-500/80 bg-emerald-500/10 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400'
                          : 'border-slate-200 text-slate-700 dark:border-slate-800 dark:text-slate-300'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-auto border-t border-slate-200 px-2 py-2 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  window.sessionStorage.removeItem('soleox-transactions-list');
                  void signOut({ callbackUrl: '/login' });
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-red-600 dark:text-red-400 cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1m0-10V5" />
                </svg>
                Sign Out
              </button>
            </div>
            </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}