'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { BarChart3, ChevronRight, CircleDollarSign, List, Search, Settings, Users, type LucideIcon } from 'lucide-react';
import { useAccess } from '@/components/access-provider';
import { pageFrame } from '@/lib/page-frame';
import { OWNER_REPORTS } from '@/lib/owner-reports';

type PageLink = { href: string; label: string; hint: string; icon?: LucideIcon };

/** The reports people open most, in the order of the Owner Reports menu. */
const FEATURED_REPORT_IDS = ['owner-summary', 'lead-source-leaderboard', 'team-performance', 'net-commission-income', 'team-caps'];
const REPORT_HINTS: Record<string, string> = {
  'owner-summary': 'Production and pipeline by month',
  'lead-source-leaderboard': 'Who closed what, ranked',
  'team-performance': 'Each team side by side',
  'net-commission-income': 'What agents took home',
  'team-caps': 'Progress toward each cap',
};

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Opens the ⌘K search that the top bar owns. */
function openSearch() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
}

function ModulePanel({ icon: Icon, title, description, links, footer }: {
  icon: LucideIcon;
  title: string;
  description: string;
  links: PageLink[];
  footer?: PageLink;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs transition-colors dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start gap-3 px-5 pb-3 pt-5">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400">
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>
      <ul className="px-2 pb-2">
        {links.map((link) => {
          const LinkIcon = link.icon;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-700/40"
              >
                {LinkIcon && <LinkIcon className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-brand-600 dark:group-hover:text-brand-400" strokeWidth={1.75} aria-hidden />}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800 group-hover:text-brand-700 dark:text-slate-100 dark:group-hover:text-brand-400">{link.label}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{link.hint}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600 dark:text-slate-600 dark:group-hover:text-brand-400" strokeWidth={1.75} aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
      {footer && (
        <div className="border-t border-slate-100 px-5 py-3 dark:border-slate-700/60">
          <Link href={footer.href} className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-400">
            {footer.label}
          </Link>
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const { access, loading } = useAccess();
  const { data: session } = useSession();
  const [greeting, setGreeting] = useState('Welcome');

  // Set after mount, so the server render and the first client render agree.
  useEffect(() => {
    setGreeting(greetingFor(new Date().getHours()));
  }, []);

  const permissions = access?.permissions;
  const showTransactions = Boolean(permissions?.commissionTrackerRead || permissions?.commissionTrackerWrite || permissions?.superAdmin);
  const showSettings = Boolean(permissions?.commissionTrackerSettings || permissions?.superAdmin);
  const showTracker = showTransactions || showSettings;
  const showOwnerReports = Boolean(permissions?.ownerReports || permissions?.superAdmin);
  const showPlanned = Boolean(permissions?.superAdmin);
  const firstName = String(session?.user?.name || '').trim().split(/\s+/)[0];
  const canSwitchClient = (access?.clients?.length ?? 0) > 1;

  const trackerLinks: PageLink[] = [
    ...(showTransactions ? [
      { href: '/commission-tracker/transactions', label: 'Transactions', hint: 'Deals, commission waterfalls, and payments', icon: List },
      { href: '/commission-tracker/agents', label: 'Agents', hint: 'The roster, groups, and teams', icon: Users },
    ] : []),
    ...(showSettings ? [
      { href: '/commission-tracker/settings', label: 'Settings', hint: 'Fields, views, templates, caps, and integrations', icon: Settings },
    ] : []),
  ];
  const reportLinks: PageLink[] = FEATURED_REPORT_IDS
    .map((id) => OWNER_REPORTS.find((report) => report.id === id && report.ready))
    .filter((report): report is NonNullable<typeof report> => Boolean(report))
    .map((report) => ({ href: `/owner-reports/${report.id}`, label: report.name, hint: REPORT_HINTS[report.id] || '' }));

  return (
    <main className={`${pageFrame} space-y-8 py-8 md:py-10`}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-brand-600 dark:text-brand-400">Soleox REBI</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            {greeting}{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {loading ? ' ' : access?.clientName ? <>Working in <span className="font-semibold text-slate-700 dark:text-slate-200">{access.clientName}</span></> : 'Choose where to start.'}
            {canSwitchClient && (
              <>
                {' · '}
                <Link href="/select-client" className="font-semibold text-brand-700 hover:underline dark:text-brand-400">Switch client</Link>
              </>
            )}
          </p>
        </div>
        {showTracker && (
          <button
            type="button"
            onClick={openSearch}
            className="flex h-11 w-full max-w-md items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-400 shadow-xs transition hover:border-slate-300 hover:text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500 dark:hover:border-slate-600 dark:hover:text-slate-300 cursor-pointer"
          >
            <Search className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            <span className="flex-1 text-left">Find a deal, agent, or page</span>
            <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-400 dark:border-slate-600">⌘K</kbd>
          </button>
        )}
      </header>

      {!loading && !showTracker && !showOwnerReports ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          Your account doesn&apos;t have access to a module for this client yet. Ask an admin to grant it.
        </p>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          {showTracker && (
            <ModulePanel
              icon={CircleDollarSign}
              title="Commission Tracker"
              description="Every deal from contract to payout, with the waterfall that splits it."
              links={trackerLinks}
            />
          )}
          {showOwnerReports && (
            <ModulePanel
              icon={BarChart3}
              title="Owner Reports"
              description="Production, pipeline, and agent results, calculated from your transactions."
              links={reportLinks}
              footer={{ href: '/owner-reports', label: 'All reports', hint: '' }}
            />
          )}
        </div>
      )}

      {showPlanned && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Planned: Goals &amp; Targets, Operating Expenses, and Leads &amp; Marketing ROI.
        </p>
      )}
    </main>
  );
}
