'use client';

import React, { useLayoutEffect } from 'react';
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Database,
  DollarSign,
  FileText,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

export interface LoadingProgressInfo {
  percent: number;
  stage: string;
  detail: string;
  clientName?: string;
  bytesLoaded?: number;
  bytesTotal?: number;
  recordsCount?: {
    transactions?: number;
    payments?: number;
    items?: number;
    agents?: number;
    caps?: number;
  };
  checks?: {
    agents?: boolean;
    schemas?: boolean;
    caps?: boolean;
    snapshot?: boolean;
    processing?: boolean;
  };
}

export interface LoadingDataPageProps {
  progress: LoadingProgressInfo;
  error?: string;
  onRetry?: () => void;
}

export function LoadingDataPage({ progress, error, onRetry }: LoadingDataPageProps) {
  // It opens at the top of the page, so on a phone the card is in view instead of wherever the last page was
  // scrolled to.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, []);
  const percentRounded = Math.min(100, Math.max(0, Math.round(progress.percent)));
  const isDone = percentRounded >= 100;

  const cards = [
    {
      id: 'transactions',
      label: 'Transactions',
      icon: FileText,
      count: progress.recordsCount?.transactions,
      active: !progress.checks?.snapshot && progress.percent > 20,
      done: Boolean(progress.checks?.snapshot),
      subtext: progress.checks?.snapshot
        ? `${(progress.recordsCount?.transactions || 0).toLocaleString()} deals`
        : progress.percent > 20
          ? 'Downloading…'
          : 'Connecting…',
    },
    {
      id: 'waterfalls',
      label: 'Waterfall Splits',
      icon: Layers,
      count: progress.recordsCount?.items,
      active: !progress.checks?.snapshot && progress.percent > 30,
      done: Boolean(progress.checks?.snapshot),
      subtext: progress.checks?.snapshot
        ? `${(progress.recordsCount?.items || 0).toLocaleString()} items`
        : progress.percent > 30
          ? 'Processing…'
          : 'Queued',
    },
    {
      id: 'payments',
      label: 'Payments Ledger',
      icon: DollarSign,
      count: progress.recordsCount?.payments,
      active: !progress.checks?.snapshot && progress.percent > 25,
      done: Boolean(progress.checks?.snapshot),
      subtext: progress.checks?.snapshot
        ? `${(progress.recordsCount?.payments || 0).toLocaleString()} records`
        : progress.percent > 25
          ? 'Querying…'
          : 'Queued',
    },
    {
      id: 'caps',
      label: 'Cap Allocations',
      icon: Award,
      count: progress.recordsCount?.caps,
      active: !progress.checks?.caps && progress.percent > 10,
      done: Boolean(progress.checks?.caps),
      subtext: progress.checks?.caps ? 'Rules & allocations' : 'Loading…',
    },
  ];

  return (
    <div className="relative flex min-h-[calc(100vh-6rem)] w-full flex-col items-center justify-center overflow-hidden px-4 py-10">
      {/* Ambient glowing radial bloom */}
      <div
        aria-hidden="true"
        className="report-pulse-glow pointer-events-none absolute inset-x-0 top-1/2 h-96 -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,rgb(16_185_129/0.20),transparent_65%)]"
      />

      {/* Main glass card */}
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-200/90 bg-white/85 p-6 shadow-2xl backdrop-blur-xl sm:p-8 dark:border-slate-800/90 dark:bg-slate-900/85">
        {/* Glowing top line accent */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-0.5 rounded-t-2xl bg-gradient-to-r from-transparent via-brand-500 to-transparent opacity-80"
        />

        {/* Top Badges Row */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-700 dark:text-brand-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
            </span>
            Real Estate Business Intelligence
          </div>

          {progress.clientName ? (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100/80 px-2.5 py-0.5 text-xs font-mono text-slate-600 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300">
              <Database className="h-3 w-3 text-brand-500" />
              <span>
                Tenant: <strong className="text-slate-900 dark:text-white">{progress.clientName}</strong>
              </span>
            </div>
          ) : null}
        </div>

        {/* Title and Description */}
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Loading{' '}
            <span className="bg-gradient-to-r from-brand-700 to-brand-500 bg-clip-text text-transparent dark:from-brand-400 dark:to-brand-300">
              Owner Reports
            </span>
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Downloading transaction history, waterfall splits, payments, and cap standings.
          </p>
        </div>

        {error ? (
          /* Error card */
          <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-50/80 p-5 backdrop-blur-md dark:border-rose-900/50 dark:bg-rose-950/40">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                  Data load was interrupted
                </h3>
                <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">{error}</p>
                {onRetry ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 active:scale-95"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry Download
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          /* Progress Section */
          <div className="space-y-3">
            {/* Stage and Percentage readout */}
            <div className="flex items-baseline justify-between gap-4">
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                {isDone ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-500" />
                )}
                <span className="truncate">{progress.stage}</span>
              </div>
              <span className="text-xl font-black tabular-nums text-brand-600 sm:text-2xl dark:text-brand-400">
                {percentRounded}%
              </span>
            </div>

            {/* The Cool Progress Bar */}
            <div
              role="progressbar"
              aria-valuenow={percentRounded}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Owner reports data download progress"
              className="relative h-4 w-full overflow-hidden rounded-full border border-slate-300/80 bg-slate-100 p-0.5 shadow-inner sm:h-5 dark:border-slate-700/80 dark:bg-slate-950/80"
            >
              <div
                className="relative h-full rounded-full bg-gradient-to-r from-brand-700 via-brand-500 to-brand-400 transition-all duration-300 ease-out dark:from-brand-600 dark:via-brand-500 dark:to-brand-300"
                style={{ width: `${Math.min(100, Math.max(3, percentRounded))}%` }}
              >
                {/* Animated shimmer light effect */}
                <div
                  aria-hidden="true"
                  className="report-progress-shimmer absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/45 to-transparent"
                />
                {/* Glowing leading tip */}
                <div
                  aria-hidden="true"
                  className="absolute right-0 top-0 bottom-0 w-2.5 rounded-full bg-white/90 shadow-[0_0_8px_rgb(52_211_153)]"
                />
              </div>
            </div>

            {/* Sub-detail line */}
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">{progress.detail}</span>
              {progress.bytesLoaded ? (
                <span className="ml-2 shrink-0 font-mono tabular-nums">
                  {(progress.bytesLoaded / (1024 * 1024)).toFixed(1)} MB
                  {progress.bytesTotal
                    ? ` / ${(progress.bytesTotal / (1024 * 1024)).toFixed(1)} MB`
                    : ''}
                </span>
              ) : null}
            </div>
          </div>
        )}

        {/* Live Data Activity Cards Grid */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.id}
                className={`relative flex flex-col justify-between rounded-xl border p-3.5 transition-all duration-200 ${
                  card.done
                    ? 'border-emerald-500/40 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-950/20'
                    : card.active
                      ? 'border-slate-300 bg-slate-50/80 shadow-sm dark:border-slate-700 dark:bg-slate-800/50'
                      : 'border-slate-200/60 bg-slate-50/30 opacity-70 dark:border-slate-800/60 dark:bg-slate-900/30'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                      card.done
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : card.active
                          ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                          : 'bg-slate-100 text-slate-400 dark:bg-slate-800/60 dark:text-slate-500'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  {card.done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  ) : card.active ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-500" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-700" />
                  )}
                </div>

                <div className="mt-3">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {card.label}
                  </div>
                  <div
                    className={`mt-0.5 text-2xs truncate ${
                      card.done
                        ? 'font-medium text-emerald-700 dark:text-emerald-300'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {card.subtext}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer reassurance note */}
        <div className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500 dark:text-slate-400">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-500" />
          <span>
            Optimized for high-volume datasets. Once loaded, all reports and filters compute instantly.
          </span>
        </div>
      </div>
    </div>
  );
}
