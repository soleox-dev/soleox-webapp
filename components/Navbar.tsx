// components/Navbar.tsx

'use client';

import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { clearReportCache } from '@/lib/report-cache';
import { useSoleoxTheme } from '@/app/providers';
import { SoleoxLogo } from '@/components/ui/logo';
import { useAccess } from '@/components/access-provider';
import { isWidePagePath, pageFrame, widePageFrame } from '@/lib/page-frame';
import { DESKTOP_NAV_QUERY, useIsDesktop, useIsDesktopNav } from '@/lib/use-media-query';
import { OWNER_REPORTS, OWNER_REPORT_GROUPS } from '@/lib/owner-reports';
import { BarChart3, Briefcase, Building2, ChevronDown, ChevronLeft, ChevronRight, House, Laptop, LayoutGrid, List, Menu, Monitor, Moon, PieChart, Receipt, Search, Settings, Smartphone, Sun, Target, UserPlus, Users, X, type LucideIcon } from 'lucide-react';
import type { ThemePreference } from '@/app/providers';
import { CommandPalette } from '@/components/CommandPalette';
import { swallowNextClick } from '@/lib/swallow-click';
import { useViewMode, type ViewMode } from '@/lib/view-mode';

/**
 * A client's short code for the phone pill: its ID when that is already a short code (DEMO), else a leading all-caps
 * word of its name (TATH Realty → TATH), else the initials of its first words (Pacific Coast Homes → PCH).
 */
function clientCode(clientId: string | null, clientName: string | null): string {
  const id = (clientId || '').trim();
  if (/^[A-Z0-9]{2,8}$/.test(id)) return id;
  const words = (clientName || id).trim().split(/\s+/).filter(Boolean);
  if (words[0] && /^[A-Z0-9&]{2,6}$/.test(words[0])) return words[0];
  return words.slice(0, 4).map((word) => word[0]?.toUpperCase() || '').join('') || id;
}

export default function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { access, chooseClient } = useAccess();
  // Users with more than one client see the active one in the bar.
  const multiClient = Boolean(access && access.clients.length > 1 && access.clientName);
  const { theme, setTheme } = useSoleoxTheme();
  // Phones can switch between the mobile and desktop layouts (see lib/view-mode.ts).
  const viewMode = useViewMode();
  const viewOptions: { id: ViewMode; label: string; icon: LucideIcon }[] = [
    { id: 'mobile', label: 'Mobile', icon: Smartphone },
    { id: 'desktop', label: 'Desktop', icon: Laptop },
  ];
  const isDesktop = useIsDesktop();
  // Phones in landscape are md wide but keep the phone menu; see DESKTOP_NAV_QUERY.
  const isDesktopWidth = useIsDesktopNav();
  // The full bar folds into the menu button whenever it does not fit, even at desktop widths: html.nav-collapsed
  // turns the desktop-nav variant off. It unfolds once the window is back to the width the bar needed.
  const navRowRef = useRef<HTMLDivElement>(null);
  const neededNavWidth = useRef(0);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const isDesktopNav = isDesktopWidth && !navCollapsed;

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
  const [moduleMenuOpen, setModuleMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchShortcut, setSearchShortcut] = useState('⌘K');
  useEffect(() => {
    if (!/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)) setSearchShortcut('Ctrl K');
  }, []);
  const moduleMenuRef = useRef<HTMLDivElement>(null);
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

  // Close dropdown when clicking outside; that click does nothing else.
  useEffect(() => {
    if (!isUserMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        swallowNextClick();
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isUserMenuOpen]);

  useEffect(() => {
    if (!isOwnerReports) return;
    setReportsNavOpen(headerRef.current?.matches(':hover') ?? false);
    setIsUserMenuOpen(false);
  }, [pathname, isOwnerReports]);

  // The phone sheet closes on navigation and when the window switches to the desktop nav.
  useEffect(() => {
    setPhoneNavOpen(false);
  }, [pathname, isDesktopNav]);

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

  // Desktop only. The Transactions list hides the bar at the bottom of the page so the tabs and
  // buttons above the table show; scrolling up or pointing at the top edge brings it back.
  // Transaction Detail keeps the bar in place while it scrolls.
  const scrollHideMode: 'bottom' | null = !isDesktop || !isTransactionsActive || isTransactionDetail
    ? null
    : 'bottom';
  const [scrollHidden, setScrollHidden] = useState(false);
  const [navPeek, setNavPeek] = useState(false);
  useEffect(() => {
    if (!scrollHideMode) {
      setScrollHidden(false);
      setNavPeek(false);
      return;
    }
    const measure = () => {
      const y = window.scrollY;
      setScrollHidden(y > 0 && Math.ceil(y + window.innerHeight) >= document.documentElement.scrollHeight - 2);
    };
    const onMove = (event: MouseEvent) => {
      const overBar = headerRef.current?.contains(event.target as Node) ?? false;
      setNavPeek(event.clientY <= 16 || overBar);
    };
    const onLeave = () => setNavPeek(false);
    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    document.documentElement.addEventListener('mousemove', onMove);
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      document.documentElement.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, [scrollHideMode]);
  const navHidden = Boolean(scrollHideMode) && scrollHidden && !navPeek && !isUserMenuOpen;

  // Sticky parts below the bar read --app-nav-offset so they move up with it.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--app-nav-offset', navHidden ? '0px' : '4rem');
    return () => {
      root.style.removeProperty('--app-nav-offset');
    };
  }, [navHidden]);

  // ⌘K (Ctrl+K on Windows) opens search from anywhere in the app.
  useEffect(() => {
    if (pathname === '/login') return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pathname]);
  useEffect(() => {
    setSearchOpen(false);
  }, [pathname]);

  // The module switcher closes on navigation, on a click outside it, and on Escape.
  useEffect(() => {
    setModuleMenuOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!moduleMenuOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (moduleMenuRef.current?.contains(event.target as Node)) return;
      swallowNextClick();
      setModuleMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModuleMenuOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [moduleMenuOpen]);

  const concealReportsNav = (next: EventTarget | null) => {
    if (next instanceof Node && headerRef.current?.contains(next)) return;
    setReportsNavOpen(false);
    setIsUserMenuOpen(false);
    setModuleMenuOpen(false);
  };

  // Do not render the top navbar on the login page
  if (pathname === '/login') {
    return null;
  }

  const barClass = 'w-full bg-white text-slate-900 border-b border-slate-200 dark:bg-[#0e131c] dark:text-white dark:border-slate-800/80';
  // Below md the report header stays in place; the hover-reveal bar is desktop only.
  const reportsBarClass = `relative z-50 md:fixed md:inset-x-0 md:top-0 md:transition-transform md:duration-200 md:ease-out md:motion-reduce:transition-none ${reportsNavOpen ? 'md:translate-y-0 md:shadow-lg' : 'md:-translate-y-full md:pointer-events-none'}`;
  const sheetLinkClass = (active: boolean) => `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold ${
    active
      ? 'bg-brand-500/10 font-bold text-brand-700 dark:bg-brand-950/80 dark:text-brand-400'
      : 'text-slate-700 dark:text-slate-200'
  }`;
  const sheetHeadingClass = 'px-3 pb-1 pt-3 text-2xs font-bold text-slate-400';

  // Desktop bar: a module switcher, then the current module's pages as links. Same permission checks
  // as the phone sheet. Modules that are not built yet show in the switcher as Soon.
  const modules: { id: string; label: string; icon: LucideIcon; href?: string; active: boolean; soon?: boolean }[] = [
    ...(showTracker ? [{ id: 'tracker', label: 'Commission Tracker', icon: PieChart, href: trackerHref, active: isCommissionTracker }] : []),
    ...(showReports ? [{ id: 'reports', label: 'Reports', icon: BarChart3, href: reportsHref, active: isReports }] : []),
    ...(showDeferred ? [
      { id: 'goals', label: 'Goals', icon: Target, active: false, soon: true },
      { id: 'leads', label: 'Leads', icon: UserPlus, active: false, soon: true },
      { id: 'expenses', label: 'Operating Expenses', icon: Receipt, active: false, soon: true },
    ] : []),
  ];
  const currentModule = modules.find((item) => item.active);
  // Each page link carries the same icon as that page in ⌘K search.
  const modulePages: { href: string; label: string; active: boolean; icon: LucideIcon }[] = isCommissionTracker
    ? [
      ...(showTransactions ? [{ href: '/commission-tracker/transactions', label: 'Transactions', active: isTransactionsActive, icon: List }] : []),
      ...(showTransactions ? [{ href: '/commission-tracker/agents', label: 'Agents', active: isAgentsActive, icon: Users }] : []),
      ...(showSettings ? [{ href: '/commission-tracker/settings', label: 'Settings', active: isSettingsActive, icon: Settings }] : []),
    ]
    : isReports
      ? [
        ...(showOwnerReports ? [{ href: '/owner-reports', label: 'Owner Reports', active: isOwnerReports, icon: BarChart3 }] : []),
        ...(showDeferred ? [{ href: '/agent-reports', label: 'Agent Reports', active: isAgentReports, icon: Users }] : []),
        ...(showDeferred ? [{ href: '/office-reports', label: 'Office Reports', active: isOfficeReports, icon: Building2 }] : []),
      ]
      : [];
  const CurrentModuleIcon = currentModule?.icon ?? LayoutGrid;

  // Folds the bar when its parts leave less than 24px free, and unfolds it once the window is back to the width the
  // bar needed. Checked on resize and whenever the bar's contents may change.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const check = () => {
      const row = navRowRef.current;
      if (!row) return;
      if (root.classList.contains('nav-collapsed')) {
        if (window.innerWidth < neededNavWidth.current) return;
        root.classList.remove('nav-collapsed');
        setNavCollapsed(false);
      }
      if (!window.matchMedia(DESKTOP_NAV_QUERY).matches) return;
      const style = getComputedStyle(row);
      const inner = row.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const used = [...row.children].reduce((sum, child) => sum + (child as HTMLElement).offsetWidth, 0);
      const free = inner - used;
      if (free >= 24) return;
      neededNavWidth.current = window.innerWidth + (24 - free);
      root.classList.add('nav-collapsed');
      setNavCollapsed(true);
    };
    check();
    // The page's width, not only window resizes: zoom, a scrollbar appearing, or a resized pane change it too.
    const observer = new ResizeObserver(check);
    observer.observe(root);
    window.addEventListener('resize', check);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', check);
    };
  }, [pathname, access?.clientId, modules.length, modulePages.length]);

  return (
    <header
      ref={headerRef}
      onFocusCapture={isOwnerReports ? () => setReportsNavOpen(true) : undefined}
      onBlur={isOwnerReports ? (event) => concealReportsNav(event.relatedTarget) : undefined}
      className={isOwnerReports
        ? `${reportsBarClass} ${barClass}`
        : `sticky top-0 z-50 transition-transform duration-200 ease-out motion-reduce:transition-none ${navHidden ? '-translate-y-full pointer-events-none' : navPeek && scrollHidden ? 'shadow-lg' : ''} ${barClass}`}
    >
      <div ref={navRowRef} className={`${isWidePagePath(pathname) ? widePageFrame : pageFrame} flex h-16 items-center justify-between`}>
        
        {/* Brand Logo Component with REBI Badge. Its parts never shrink or wrap, so a bar too wide for the window
            overflows and folds into the menu button instead. */}
        <div className="flex shrink-0 items-center gap-4">
          <Link href="/" className="flex items-center">
            {/* REBI reads as the product name beside the logo, after a thin divider. It shares the
                word's baseline, and the divider centers on the row, which is the middle of the capitals. */}
            <SoleoxLogo
              className="h-7 w-auto"
              suffix={(
                <>
                  <span aria-hidden className="mx-3 h-[18px] w-px self-center bg-slate-300 dark:bg-slate-700" />
                  <span className="text-base font-medium tracking-[0.02em] text-slate-500 dark:text-slate-400">REBI</span>
                </>
              )}
            />
          </Link>

          {/* Module switcher and the current module's pages. Desktop only; phones use the menu sheet. */}
          {modules.length > 0 && <span aria-hidden className="hidden desktop-nav:block h-6 w-px bg-slate-200 dark:bg-slate-800" />}
          {modules.length > 0 && (
            <div ref={moduleMenuRef} className="relative hidden desktop-nav:block">
              <button
                type="button"
                onClick={() => setModuleMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={moduleMenuOpen}
                className={`inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition cursor-pointer ${moduleMenuOpen ? 'bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-white' : 'bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800'}`}
              >
                <CurrentModuleIcon className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" strokeWidth={1.75} aria-hidden />
                {currentModule?.label ?? 'Modules'}
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${moduleMenuOpen ? 'rotate-180' : ''}`} strokeWidth={2} aria-hidden />
              </button>
              {moduleMenuOpen && (
                <div role="menu" className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  {modules.map((item) => {
                    const Icon = item.icon;
                    if (item.soon || !item.href) {
                      return (
                        <div key={item.id} role="menuitem" aria-disabled="true" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 dark:text-slate-500">
                          <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                          {item.label}
                          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-2xs font-semibold text-slate-400 dark:bg-slate-800 dark:text-slate-500">Soon</span>
                        </div>
                      );
                    }
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        role="menuitem"
                        onClick={() => setModuleMenuOpen(false)}
                        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${item.active ? 'bg-brand-500/10 text-brand-700 dark:bg-brand-950/80 dark:text-brand-400' : 'text-slate-800 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                      >
                        <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                        {item.label}
                      </Link>
                    );
                  })}
                  <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                  <Link
                    href="/"
                    role="menuitem"
                    onClick={() => setModuleMenuOpen(false)}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${isMainMenu ? 'bg-brand-500/10 text-brand-700 dark:bg-brand-950/80 dark:text-brand-400' : 'text-slate-800 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                  >
                    <LayoutGrid className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                    All Modules
                  </Link>
                </div>
              )}
            </div>
          )}
          {modulePages.length > 0 && (
            <nav aria-label={currentModule?.label ?? 'Pages'} className="hidden desktop-nav:flex h-16 items-stretch gap-5 pl-1">
              {modulePages.map((page) => (
                <Link
                  key={page.href}
                  href={page.href}
                  aria-current={page.active ? 'page' : undefined}
                  className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 pt-0.5 text-sm font-semibold transition ${page.active ? 'border-brand-500 text-brand-700 dark:text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
                >
                  <page.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                  {page.label}
                </Link>
              ))}
            </nav>
          )}
        </div>

        {/* Right Nav Actions */}
        <div className="flex shrink-0 items-center space-x-3 text-xs font-medium text-slate-700 dark:text-slate-300">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="hidden desktop-nav:flex h-9 w-56 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-400 transition hover:border-slate-300 hover:text-slate-600 cursor-pointer dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-500 dark:hover:border-slate-700 dark:hover:text-slate-300 xl:w-64"
          >
            <Search className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
            <span className="truncate">{showTransactions ? 'Search transactions, agents…' : 'Search…'}</span>
            <kbd className="ml-auto shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-2xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{searchShortcut}</kbd>
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 dark:text-slate-200 desktop-nav:hidden cursor-pointer"
          >
            <Search className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
          {/* Users with more than one client see which one they are in. Switching stays in the profile menu. On phones it sits left of search and shows the client's short code. */}
          {multiClient && access?.clientName ? (
            <span
              title={`Client: ${access.clientName}`}
              className="order-first inline-flex h-7 max-w-[8.5rem] shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-2.5 text-xs font-medium text-slate-600 desktop-nav:order-none desktop-nav:max-w-[14rem] dark:bg-slate-800 dark:text-slate-300"
            >
              <Building2 className="hidden h-3.5 w-3.5 shrink-0 text-slate-400 sm:block" strokeWidth={2} aria-hidden />
              <span className="sm:hidden">{clientCode(access.clientId, access.clientName)}</span>
              <span className="hidden truncate sm:inline">{access.clientName}</span>
            </span>
          ) : null}
          {/* Phone menu button. Desktop keeps the pill nav and the avatar menu. */}
          <button
            type="button"
            onClick={() => {
              setPhoneNavLevel(isOwnerReports && showOwnerReports ? 'owner-reports' : 'main');
              setPhoneNavOpen(true);
            }}
            aria-label="Open Menu"
            aria-expanded={phoneNavOpen}
            className="me-0 inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 dark:text-slate-200 desktop-nav:hidden cursor-pointer"
          >
            <Menu className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>


          {/* User Badge & Sign Out Dropdown */}
          <div className="relative hidden desktop-nav:block" ref={dropdownRef}>
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="w-8 h-8 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 font-bold rounded-full flex items-center justify-center text-xs hover:ring-2 hover:ring-emerald-500/40 transition cursor-pointer"
              aria-label="User Menu"
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
                  <p className="text-2xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {session?.user?.email || 'user@soleox.com'}
                  </p>
                  {access?.clientName && (
                    <p className="text-2xs text-brand-700 dark:text-brand-400 truncate mt-1">{access.clientName}</p>
                  )}
                </div>
                {access && access.clients.length > 1 && (
                  <div className="py-1 border-b border-slate-100 dark:border-slate-800">
                    <p className="px-4 pt-1.5 pb-1 text-2xs font-bold text-slate-400">Client</p>
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
                            ? 'text-brand-700 dark:text-brand-400 bg-brand-500/10'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {client.name}
                      </button>
                    ))}
                  </div>
                )}

                <div className="py-1 border-b border-slate-100 dark:border-slate-800">
                  <p className="px-4 pt-1.5 pb-1 text-2xs font-bold text-slate-400">Theme</p>
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
                            ? 'text-brand-700 dark:text-brand-400 bg-brand-500/10'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                {viewMode.available && (
                  <div className="py-1 border-b border-slate-100 dark:border-slate-800">
                    <p className="px-4 pt-1.5 pb-1 text-2xs font-bold text-slate-400">View</p>
                    {viewOptions.map((option) => {
                      const Icon = option.icon;
                      const selected = viewMode.mode === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            if (!selected) viewMode.setMode(option.id);
                          }}
                          aria-pressed={selected}
                          className={`w-full text-left px-4 py-2 text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                            selected
                              ? 'text-brand-700 dark:text-brand-400 bg-brand-500/10'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Sign Out Trigger */}
                <button
                  onClick={() => {
                    window.sessionStorage.removeItem('soleox-transactions-list');
                    void clearReportCache().finally(() => signOut({ callbackUrl: '/login' }));
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
      <CommandPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        canSearchTracker={showTransactions}
        canSettings={showSettings}
        canReports={showOwnerReports}
      />
      {/* Phone navigation sheet. Same permission checks as the pill nav and avatar menu.
          Portaled to <body>: on a landscape phone the Owner Reports bar is transformed, which would trap a fixed sheet inside it. */}
      {phoneNavOpen && createPortal(
        <div className="app-modal fixed inset-0 z-[60] desktop-nav:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Close Menu"
            onClick={() => setPhoneNavOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/50"
          />
          <div className="absolute inset-y-0 right-0 flex w-[min(20rem,calc(100%-3rem))] flex-col overflow-y-auto overscroll-contain bg-white pb-[env(safe-area-inset-bottom)] text-slate-900 shadow-2xl dark:bg-[#0e131c] dark:text-white">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{session?.user?.name || 'Authenticated User'}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{session?.user?.email || 'user@soleox.com'}</p>
                {access?.clientName && <p className="truncate text-xs text-brand-700 dark:text-brand-400">{access.clientName}</p>}
              </div>
              <button
                type="button"
                onClick={() => setPhoneNavOpen(false)}
                aria-label="Close Menu"
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
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-brand-700 dark:text-brand-400 cursor-pointer"
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
                          ? 'border-brand-500/80 bg-brand-500/10 text-brand-700 dark:bg-brand-950/80 dark:text-brand-400'
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

            {viewMode.available && (
              <div className="border-t border-slate-200 px-2 py-2 dark:border-slate-800">
                <p className={sheetHeadingClass}>View</p>
                <div className="grid grid-cols-2 gap-1 px-1">
                  {viewOptions.map((option) => {
                    const Icon = option.icon;
                    const selected = viewMode.mode === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          if (!selected) viewMode.setMode(option.id);
                        }}
                        aria-pressed={selected}
                        className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg border text-xs font-semibold cursor-pointer ${
                          selected
                            ? 'border-brand-500/80 bg-brand-500/10 text-brand-700 dark:bg-brand-950/80 dark:text-brand-400'
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
            )}

            <div className="mt-auto border-t border-slate-200 px-2 py-2 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  window.sessionStorage.removeItem('soleox-transactions-list');
                  void clearReportCache().finally(() => signOut({ callbackUrl: '/login' }));
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
        </div>,
        document.body,
      )}
    </header>
  );
}