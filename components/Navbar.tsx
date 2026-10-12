// components/Navbar.tsx

'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useSoleoxTheme } from '@/app/providers';
import { SoleoxLogo } from '@/components/ui/logo';
import { House, List, Monitor, Moon, Settings, Sun, type LucideIcon } from 'lucide-react';
import type { ThemePreference } from '@/app/providers';

export default function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { theme, setTheme } = useSoleoxTheme();

  const themeOptions: { id: ThemePreference; label: string; icon: LucideIcon }[] = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Monitor },
  ];

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [reportsNavOpen, setReportsNavOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  const isMainMenu = pathname === '/';
  const isOwnerReports = pathname.startsWith('/owner-reports');
  const isCommissionTracker = pathname.startsWith('/commission-tracker');
  const isSettingsActive = pathname.startsWith('/commission-tracker/settings');
  const isTransactionsActive = pathname.startsWith('/commission-tracker/transactions');
  const isModuleActive = isCommissionTracker && !isSettingsActive;

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

  useEffect(() => {
    if (!isOwnerReports) return;
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
  }, [isOwnerReports]);

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
  const reportsBarClass = `fixed inset-x-0 top-0 z-50 transition-transform duration-200 ease-out motion-reduce:transition-none ${reportsNavOpen ? 'translate-y-0 shadow-lg' : '-translate-y-full pointer-events-none'}`;

  return (
    <header
      ref={headerRef}
      onFocusCapture={isOwnerReports ? () => setReportsNavOpen(true) : undefined}
      onBlur={isOwnerReports ? (event) => concealReportsNav(event.relatedTarget) : undefined}
      className={isOwnerReports ? `${reportsBarClass} ${barClass}` : `relative z-50 ${barClass}`}
    >
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 md:px-6">
        
        {/* Brand Logo Component with REBI Badge */}
        <Link href="/" className="flex items-center space-x-2">
          <SoleoxLogo className="h-7 w-auto" />
          <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-800/80">
            REBI
          </span>
        </Link>

        {/* Central Nav Container with Pill Outline */}
        <nav className="hidden md:flex items-center space-x-2 bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-1 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400">
          <Link
            href="/commission-tracker/transactions"
            className={`px-3 py-1.5 rounded-lg transition ${
              isModuleActive
                ? 'bg-emerald-500/10 dark:bg-emerald-950/80 border border-emerald-500/80 text-emerald-700 dark:text-emerald-400 font-bold'
                : 'hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Commission Tracker
          </Link>
          <Link
            href="/owner-reports"
            className={`px-3 py-1.5 rounded-lg transition ${
              isOwnerReports
                ? 'bg-emerald-500/10 dark:bg-emerald-950/80 border border-emerald-500/80 text-emerald-700 dark:text-emerald-400 font-bold'
                : 'hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Owner Reports
          </Link>
          <span className="px-3 py-1.5 opacity-50 cursor-not-allowed">Goals</span>
          <span className="px-3 py-1.5 opacity-50 cursor-not-allowed">Leads</span>
          <span className="px-3 py-1.5 opacity-50 cursor-not-allowed">Operating Expenses</span>
        </nav>

        {/* Right Nav Actions */}
        <div className="flex items-center space-x-3 text-xs font-medium text-slate-700 dark:text-slate-300">
          {!isMainMenu && (
            <Link
              href="/"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:text-slate-900 dark:hover:text-white transition"
            >
              <House className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden /> Main Menu
            </Link>
          )}

          {isCommissionTracker && (
            <>
              <Link
                href="/commission-tracker/transactions"
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-medium transition ${
                  isTransactionsActive
                    ? 'bg-emerald-500/10 dark:bg-emerald-950/80 border-emerald-500/80 text-emerald-700 dark:text-emerald-400 font-bold'
                    : 'bg-slate-100 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <List className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden /> Transactions
              </Link>

              <Link
                href="/commission-tracker/settings"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
                  isSettingsActive
                    ? 'bg-emerald-500/10 dark:bg-emerald-950/80 border-emerald-500/80 text-emerald-700 dark:text-emerald-400 font-bold'
                    : 'border-transparent hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Settings className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden /> Settings
              </Link>
            </>
          )}

          {/* Vertical Divider */}
          {!isMainMenu && (
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 my-auto" />
          )}

          {/* User Badge & Sign Out Dropdown */}
          <div className="relative" ref={dropdownRef}>
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
                </div>

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
                  onClick={() => signOut({ callbackUrl: '/login' })}
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
    </header>
  );
}