// app/(dashboard)/commission-tracker/transactions/page.tsx

'use client';

import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { normalizeAgentName } from '@/lib/id';
import { formatPercent, isHiddenRecordId } from '@/lib/fields';
import { formatPercentRate, formatTablePercent } from '@/lib/percent';
import { ClearableSelect } from '@/components/ui/ClearableSelect';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Check, Highlighter, Link2, ListChecks, ListFilter, Loader2, Plus, RefreshCw, RotateCcw, Rows3, Unlink, X, Zap, type LucideIcon } from 'lucide-react';
import { HoverNote } from '@/app/(dashboard)/commission-tracker/transactions/[id]/components/HoverNote';
import { TrashIcon } from '@/components/ui/trash-icon';
import {
  compareBySortRules,
  dealMatchesDefaultView,
  templateBoltTone,
  transactionQualifiesForTemplate,
  type TemplateBoltTone,
  type TransactionDefaultView,
  type TransactionSortRule,
} from '@/lib/transaction-default-view';
import { payoutSignature, replayedPaymentSignature, savedPayouts } from '@/lib/template-payment-drift';
import { formulaDataNeeds, loadCommissionLedger, loadFormulaLookups, templateFormulaSources, type TemplateLogicStep } from '@/app/(dashboard)/commission-tracker/transactions/[id]/components/applyTemplateLogic';
import type { StoredCommissionItem } from '@/app/(dashboard)/commission-tracker/transactions/[id]/commissionItemState';
import type { CommissionEntityOption, FieldSetting, KnownAgentInfo, VisibilityRulesConfig } from '@/app/(dashboard)/commission-tracker/transactions/[id]/types';
import { transactionDealLabel } from '@/lib/transaction-label';
import { BulkUpdateDialog } from '@/app/(dashboard)/commission-tracker/transactions/components/BulkUpdateDialog';
import { SyncErrorsDialog, SyncResultDialog, SyncSummaryLine, type SyncRunDetail } from '@/app/(dashboard)/commission-tracker/transactions/components/SyncResultDialog';
import { lastSyncResultsNote, syncFinishedSummary } from '@/lib/sync-finished-summary';
import {
  DEMO_TRANSACTION_SCORECARDS,
  SCORECARD_COLOR_STYLES,
  colorForStatus,
  qualifyingDeals,
  scorecardMetricValue,
  type TransactionScorecard,
} from '@/lib/transaction-scorecards';

interface SchemaField {
  id?: string;
  field_key: string;
  field_label: string;
  field_type: string;
  section_name?: string;
  is_enabled?: boolean;
  dropdown_options?: string[];
  calculation_formula?: string;
  storage_type?: string | null;
  is_required?: boolean | null;
  visibility_rules?: VisibilityRulesConfig | null;
}

interface SubmittedTemplate {
  templateId: string;
  parameters: Record<string, string>;
}

type BoltTone = TemplateBoltTone;

function tmsLinkMark(
  deal: Record<string, any>,
  sourceTmsIds: Set<string> | null,
  inDefaultView: boolean,
): { label: string; disconnected: boolean } | null {
  const tmsId = String(deal.tms_id || '').trim();
  if (!tmsId || !sourceTmsIds) return null;
  if (sourceTmsIds.has(tmsId.toLowerCase())) {
    return { disconnected: false, label: 'Connected to TMS' };
  }
  if (!inDefaultView) return null;
  return { disconnected: true, label: 'Disconnected from TMS' };
}

type TmsLinkFilter = 'connected' | 'disconnected';

const TMS_FILTERS: { value: TmsLinkFilter; label: string; iconClass: string; activeClass: string; buttonClass: string }[] = [
  { value: 'connected', label: 'Connected to TMS', iconClass: 'text-emerald-500', activeClass: 'bg-emerald-500/20 border-emerald-500/40', buttonClass: 'bg-emerald-500 text-white hover:bg-emerald-600 dark:bg-emerald-500 dark:hover:bg-emerald-400' },
  { value: 'disconnected', label: 'Disconnected from TMS', iconClass: 'text-rose-500', activeClass: 'bg-rose-500/20 border-rose-500/40', buttonClass: 'bg-rose-500 text-white hover:bg-rose-600 dark:bg-rose-500 dark:hover:bg-rose-400' },
];

const BOLT_FILTERS: { tone: BoltTone; label: string; icon: LucideIcon; iconClass: string; activeClass: string; buttonClass: string }[] = [
  { tone: 'submitted', label: 'Submitted', icon: Check, iconClass: 'text-emerald-500', activeClass: 'bg-emerald-500/20 border-emerald-500/40', buttonClass: 'bg-emerald-500 text-white hover:bg-emerald-600 dark:bg-emerald-500 dark:hover:bg-emerald-400' },
  { tone: 'ready', label: 'Ready to submit', icon: Plus, iconClass: 'text-blue-500', activeClass: 'bg-blue-500/20 border-blue-500/40', buttonClass: 'bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-500 dark:hover:bg-blue-400' },
  { tone: 'ineligible', label: 'No longer eligible', icon: X, iconClass: 'text-rose-500', activeClass: 'bg-rose-500/20 border-rose-500/40', buttonClass: 'bg-rose-500 text-white hover:bg-rose-600 dark:bg-rose-500 dark:hover:bg-rose-400' },
  { tone: 'drift', label: 'Payments would change', icon: RefreshCw, iconClass: 'text-violet-400', activeClass: 'bg-violet-500/20 border-violet-500/40', buttonClass: 'bg-violet-500 text-white hover:bg-violet-600 dark:bg-violet-500 dark:hover:bg-violet-400' },
];

function BoltStatusIcon({ tone, className }: { tone: BoltTone; className: string }) {
  const filter = BOLT_FILTERS.find((item) => item.tone === tone)!;
  const Icon = filter.icon;
  return <Icon className={`${className} ${filter.iconClass}`} strokeWidth={2.25} aria-hidden />;
}

function FilterClearButton({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      title={`Clear ${label}`}
      aria-label={`Clear ${label}`}
      onClick={(event) => {
        event.stopPropagation();
        onClear();
      }}
      className="absolute -right-1 -top-1 z-10 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-white text-slate-700 opacity-0 shadow-sm ring-1 ring-slate-300 pointer-events-none hover:bg-slate-100 group-hover/filter:pointer-events-auto group-hover/filter:opacity-100 group-focus-within/filter:pointer-events-auto group-focus-within/filter:opacity-100 dark:bg-slate-950 dark:text-white dark:ring-slate-500"
    >
      <X className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />
    </button>
  );
}

const AGENT_FORMULA_SKIP = new Set([
  'id', 'agent_id', 'client_id', 'user_id', 'tms_id', 'agent_name', 'name', 'full_name',
  'agent_email', 'email', 'agent_phone', 'phone', 'group_id', 'agent_status', 'is_team_lead',
  'isTeamLead', 'agent_onboard_date', 'agent_offboard_date', 'custom_attributes',
  'commission_attributes', 'archived', 'created_at', 'created_by', 'updated_at', 'updated_by',
]);

interface StatusLookup {
  optionValue: string;
  optionLabel: string;
}

function normalizeStatus(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function dealMatchesStatus(deal: Record<string, any>, lookup: StatusLookup) {
  const statusVal = normalizeStatus(String(deal.transaction_status || deal.status || ''));
  const selectedValues = [normalizeStatus(lookup.optionValue), normalizeStatus(lookup.optionLabel)].filter(Boolean);
  return selectedValues.includes(statusVal);
}

const ALL_TAB = 'ALL';
const DEFAULT_TAB = 'DEFAULT';
const DELETED_TAB = 'DELETED';
const SYNCED_TAB = 'SYNCED';
type LedgerView = typeof ALL_TAB | typeof DEFAULT_TAB | typeof DELETED_TAB | typeof SYNCED_TAB;

function parseSyncHighlights(raw: unknown): Map<string, Set<string>> {
  const highlights = new Map<string, Set<string>>();
  if (!Array.isArray(raw)) return highlights;
  raw.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const record = item as { transactionId?: unknown; fieldKeys?: unknown };
    const id = String(record.transactionId || '').trim();
    if (!id) return;
    const fieldKeys = Array.isArray(record.fieldKeys) ? record.fieldKeys.map((key) => String(key)) : [];
    highlights.set(id, new Set(fieldKeys));
  });
  return highlights;
}

function formatTableCurrency(val: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}

function isNumericColumn(field: { field_type: string; field_key: string }) {
  return field.field_type === 'CURRENCY' || field.field_type === 'PERCENT' || field.field_key === 'gci_perc';
}

function isDateColumn(field: { field_type: string }) {
  return field.field_type === 'DATE';
}

function isStatusColumn(field: { field_key: string }) {
  return field.field_key === 'transaction_status' || field.field_key === 'status';
}

function scorecardCurrency(value: number, fractionDigits: number, compact: boolean) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: compact ? 'compact' : 'standard',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Whole dollars while the full amount fits. Compact notation then keeps 2 decimals, then 1, then 0, whichever still fits. */
const SCORECARD_CURRENCY_OPTIONS: { fractionDigits: number; compact: boolean }[] = [
  { fractionDigits: 0, compact: false },
  { fractionDigits: 2, compact: true },
  { fractionDigits: 1, compact: true },
  { fractionDigits: 0, compact: true },
];

function FitVolume({ value, className }: { value: number; className: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const options = useMemo(
    () => SCORECARD_CURRENCY_OPTIONS.map((option) => scorecardCurrency(value, option.fractionDigits, option.compact)),
    [value],
  );
  const precise = options[0];
  const [label, setLabel] = useState(precise);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const probe = probeRef.current;
    if (!box || !probe) return;

    const measure = () => {
      const width = box.clientWidth;
      if (width <= 0) return;
      let chosen = options[options.length - 1];
      for (const option of options) {
        probe.textContent = option;
        if (probe.scrollWidth <= width + 0.5) {
          chosen = option;
          break;
        }
      }
      setLabel((current) => (current === chosen ? current : chosen));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    let active = true;
    document.fonts?.ready.then(() => {
      if (active) measure();
    });

    return () => {
      active = false;
      observer.disconnect();
    };
  }, [options]);

  return (
    <div ref={boxRef} className="relative min-w-0">
      <span
        ref={probeRef}
        className={`pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap ${className}`}
        aria-hidden
      >
        {precise}
      </span>
      <p className={`${className} whitespace-nowrap text-right`} title={precise}>
        {label}
      </p>
    </div>
  );
}

const filterShell =
  'group/field relative block w-full underline-field rounded-t-md border-b border-b-slate-300 px-2 pt-1 pb-0.5 transition-colors focus-within:border-b-emerald-500 focus-within:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] dark:border-b-slate-600';
const filterControl =
  'w-full border-0 bg-transparent p-0 h-5 text-[11px] leading-4 font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 dark:text-white dark:placeholder:text-slate-500';

export default function TransactionsListPage() {
  const router = useRouter();
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>([]);
  const [deals, setDeals] = useState<Record<string, any>[]>([]);
  const [deletedDeals, setDeletedDeals] = useState<Record<string, any>[]>([]);
  const [agentsList, setAgentsList] = useState<{ id: string; agent_name?: string; name?: string; [key: string]: any }[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [compactRows, setCompactRows] = useState(false);

  // Search, ledger view, and the status-header filter. The view stays put when a status is chosen.
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [ledgerView, setLedgerView] = useState<LedgerView>(DEFAULT_TAB);
  const [statusSelection, setStatusSelection] = useState<string | null>(null);
  const [activeScorecardId, setActiveScorecardId] = useState<string | null>(null);
  const [boltTone, setBoltTone] = useState<BoltTone | null>(null);
  const [boltMenuOpen, setBoltMenuOpen] = useState(false);
  const boltMenuButtonRef = useRef<HTMLButtonElement>(null);
  const boltMenuPanelRef = useRef<HTMLDivElement>(null);
  const [boltMenuBox, setBoltMenuBox] = useState({ top: 0, left: 0 });
  const [tmsFilter, setTmsFilter] = useState<TmsLinkFilter | null>(null);
  const [tmsMenuOpen, setTmsMenuOpen] = useState(false);
  const tmsMenuButtonRef = useRef<HTMLButtonElement>(null);
  const tmsMenuPanelRef = useRef<HTMLDivElement>(null);
  const [tmsMenuBox, setTmsMenuBox] = useState({ top: 0, left: 0 });
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusMenuButtonRef = useRef<HTMLButtonElement>(null);
  const statusMenuPanelRef = useRef<HTMLDivElement>(null);
  const [statusMenuBox, setStatusMenuBox] = useState({ top: 0, left: 0 });
  const [sourceTmsIds, setSourceTmsIds] = useState<Set<string> | null>(null);
  const [tmsConnectorActive, setTmsConnectorActive] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{
    tone: 'ok' | 'error';
    text: string;
    finishedAt?: string;
    createdCount?: number;
    updatedCount?: number;
    errorCount?: number;
  } | null>(null);
  const [syncResult, setSyncResult] = useState<{ summary: string; note: string | null; details: SyncRunDetail[] } | null>(null);
  const [syncResultOpen, setSyncResultOpen] = useState(false);
  const [syncChangesOn, setSyncChangesOn] = useState(false);
  const [syncHighlights, setSyncHighlights] = useState<Map<string, Set<string>>>(() => new Map());
  const [syncErrorsOpen, setSyncErrorsOpen] = useState(false);
  const [statusLookups, setStatusLookups] = useState<StatusLookup[]>([]);
  const [defaultView, setDefaultView] = useState<TransactionDefaultView>({ filterFormula: '', sortRules: [] });
  const [scorecards, setScorecards] = useState<TransactionScorecard[]>(DEMO_TRANSACTION_SCORECARDS);
  const [defaultSortRules, setDefaultSortRules] = useState<TransactionSortRule[] | null>(null);
  const [commissionTemplates, setCommissionTemplates] = useState<{ id: string; template_name: string; eligibility_formula?: string | null; is_active?: boolean | null }[]>([]);
  const [submittedTemplates, setSubmittedTemplates] = useState<Map<string, SubmittedTemplate[]>>(new Map());
  const [overviewFields, setOverviewFields] = useState<FieldSetting[]>([]);
  const [paymentDriftIds, setPaymentDriftIds] = useState<Set<string>>(new Set());
  const [paymentDriftReady, setPaymentDriftReady] = useState(false);
  
  // Sorting
  const [sortField, setSortField] = useState<string>('closing_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Dynamic Column Filter Map { [field_key]: search_value }
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string; clientId: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingPermanent, setPendingPermanent] = useState<{ id: string; label: string; clientId: string } | null>(null);
  const [isPermanentDeleting, setIsPermanentDeleting] = useState(false);
  const [permanentError, setPermanentError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    setCompactRows(window.localStorage.getItem('soleox-transactions-row-density') === 'compact');
  }, []);

  const toggleCompactRows = () => {
    setCompactRows((current) => {
      const next = !current;
      window.localStorage.setItem('soleox-transactions-row-density', next ? 'compact' : 'comfortable');
      return next;
    });
  };

  // 1. Fetch Schema Fields & Transactions Data in Parallel
  useEffect(() => {
    async function initData() {
      try {
        setIsLoading(true);

        // NOTE: Replace 'DEMO' here with your frontend auth state variable 
        // (e.g., currentUser.client_id or activeOrganization.id) once you wire up a SessionProvider
        const activeClientId = 'DEMO'; 

        const fetchOptions = {
          headers: {
            'x-client-id': activeClientId
          }
        };

        const [schemaRes, dealsRes, deletedRes, agentsRes, statusRes, viewRes, scoreRes, templateRes, submissionRes, tmsIdsRes, sheetsRes] = await Promise.all([
          fetch('/api/schema/transactions', fetchOptions),
          fetch('/api/transactions', fetchOptions),
          fetch('/api/transactions?view=deleted', fetchOptions),
          fetch('/api/agents?include_archived=true', fetchOptions),
          fetch('/api/client-lookup-values?category=TRANSACTION_STATUS', fetchOptions),
          fetch('/api/transaction-default-view', fetchOptions),
          fetch('/api/transaction-scorecards', fetchOptions),
          fetch('/api/commission-templates', fetchOptions),
          fetch(`/api/commission-template-submissions?client_id=${encodeURIComponent(activeClientId)}`, fetchOptions),
          fetch('/api/integrations/tms-ids', fetchOptions),
          fetch('/api/integrations/google-sheets', fetchOptions),
        ]);

        // Process Schema Catalog
        if (schemaRes.ok) {
          const schemaData = await schemaRes.json();
          const rawCatalog: SchemaField[] = schemaData.catalog || schemaData.fields || schemaData.data || [];
          
          const uniqueFieldsMap = new Map<string, SchemaField>();
          rawCatalog.forEach((field) => {
            if (field.is_enabled !== false && !isHiddenRecordId('transactions', field.field_key) && !uniqueFieldsMap.has(field.field_key)) {
              uniqueFieldsMap.set(field.field_key, field);
            }
          });

          setSchemaFields(Array.from(uniqueFieldsMap.values()));
          setOverviewFields(rawCatalog.map((field, index) => ({
            id: field.id || `schema_${index}`,
            label: field.field_label || field.field_key,
            key: field.field_key,
            type: field.field_type || 'TEXT',
            section: field.section_name || 'General',
            calculation_formula: field.calculation_formula?.trim() || undefined,
          })));
        } else {
          setSchemaFields([]); // Clean empty state on failure
          setOverviewFields([]);
        }

        // Process Agents for resolving agent_id -> agent_name
        if (agentsRes.ok) {
          const agentsData = await agentsRes.json();
          const list = agentsData.agents || [];
          setAgentsList(Array.isArray(list) ? list : []);
        } else {
          setAgentsList([]);
        }

        // Process Transactions Ledger
        if (dealsRes.ok) {
          const dealsData = await dealsRes.json();
          const list = dealsData.transactions || dealsData.deals || dealsData.catalog || [];
          setDeals(Array.isArray(list) ? list : []);
        } else {
          setDeals([]); // Clean empty state on failure
        }

        if (deletedRes.ok) {
          const deletedData = await deletedRes.json();
          const list = deletedData.transactions || deletedData.deals || [];
          setDeletedDeals(Array.isArray(list) ? list : []);
        } else {
          setDeletedDeals([]);
        }

        if (statusRes.ok) {
          const statusData = await statusRes.json();
          const rows = Array.isArray(statusData.lookup_values) ? statusData.lookup_values : [];
          const seen = new Set<string>();
          const lookups: StatusLookup[] = [];
          rows.forEach((row: { optionValue?: string; optionLabel?: string; sortOrder?: number }) => {
            const optionValue = String(row.optionValue || '').trim();
            const optionLabel = String(row.optionLabel || optionValue).trim();
            if (!optionLabel || seen.has(optionLabel)) return;
            seen.add(optionLabel);
            lookups.push({
              optionValue: optionValue || optionLabel,
              optionLabel,
            });
          });
          setStatusLookups(lookups);
        } else {
          setStatusLookups([]);
        }

        if (viewRes.ok) {
          const viewData = await viewRes.json();
          const view: TransactionDefaultView = {
            filterFormula: String(viewData.filterFormula || ''),
            sortRules: Array.isArray(viewData.sortRules) ? viewData.sortRules : [],
          };
          setDefaultView(view);
          setDefaultSortRules(view.sortRules.length > 0 ? view.sortRules : null);
          if (view.sortRules[0]) {
            setSortField(view.sortRules[0].fieldKey);
            setSortOrder(view.sortRules[0].direction);
          }
        }

        if (scoreRes.ok) {
          const scoreData = await scoreRes.json();
          if (Array.isArray(scoreData.scorecards)) setScorecards(scoreData.scorecards);
        }

        if (templateRes.ok) {
          const templateData = await templateRes.json();
          setCommissionTemplates(Array.isArray(templateData.templates) ? templateData.templates : []);
        } else {
          setCommissionTemplates([]);
        }

        if (submissionRes.ok) {
          const submissionData = await submissionRes.json();
          const byTransaction = new Map<string, SubmittedTemplate[]>();
          for (const row of Array.isArray(submissionData.submissions) ? submissionData.submissions : []) {
            const transactionId = String(row.transaction_id || '').trim();
            const templateId = String(row.template_id || '').trim();
            if (!transactionId || !templateId) continue;
            const current = byTransaction.get(transactionId) || [];
            if (current.some((item) => item.templateId === templateId)) continue;
            const parameters: Record<string, string> = {};
            const rawParameters = row.submitted_parameters;
            if (rawParameters && typeof rawParameters === 'object' && !Array.isArray(rawParameters)) {
              for (const [key, value] of Object.entries(rawParameters as Record<string, unknown>)) {
                parameters[key] = value === undefined || value === null ? '' : String(value);
              }
            }
            current.push({ templateId, parameters });
            byTransaction.set(transactionId, current);
          }
          setSubmittedTemplates(byTransaction);
        } else {
          setSubmittedTemplates(new Map());
        }

        if (sheetsRes.ok) {
          const sheetsData = await sheetsRes.json();
          const connection = sheetsData.connection as { spreadsheetId?: string } | null;
          setTmsConnectorActive(Boolean(connection && String(connection.spreadsheetId || '').trim()));
          const run = sheetsData.lastRun;
          const errorCount = Number(run?.error_count ?? 0);
          const details = Array.isArray(run?.details) ? run.details as SyncRunDetail[] : [];
          setSyncHighlights(parseSyncHighlights(run?.highlights));
          const finishedAt = run?.finished_at || run?.started_at;
          if (run && run.status === 'succeeded' && finishedAt) {
            setSyncNotice({
              tone: 'ok',
              finishedAt: String(finishedAt),
              createdCount: Number(run.created_count ?? 0),
              updatedCount: Number(run.updated_count ?? 0),
              errorCount,
              text: '',
            });
          }
          if (run && errorCount > 0 && details.some((detail) => detail.outcome === 'error')) {
            const summary = syncFinishedSummary({
              createdCount: Number(run.created_count ?? 0),
              updatedCount: Number(run.updated_count ?? 0),
              skippedCount: Number(run.skipped_count ?? 0),
              errorCount,
              connectedCount: Number(run.connected_count ?? 0),
              disconnectedCount: Number(run.disconnected_count ?? 0),
              details,
            });
            setSyncResult({
              summary,
              note: run.message ? String(run.message) : null,
              details,
            });
          }
        }

        if (tmsIdsRes.ok) {
          const tmsIdsData = await tmsIdsRes.json();
          setSourceTmsIds(tmsIdsData.available ? new Set((tmsIdsData.tmsIds || []).map((id: unknown) => String(id).toLowerCase())) : null);
        } else {
          setSourceTmsIds(null);
        }
      } catch (err) {
        console.error('Data initialization failed:', err);
        setSchemaFields([]);
        setDeals([]);
        setAgentsList([]);
        setStatusLookups([]);
      } finally {
        setIsLoading(false);
      }
    }

    initData();
  }, []);

  // Quick lookup map: agent ID/name -> agent_name
  const agentMap = useMemo(() => {
    const map = new Map<string, string>();
    agentsList.forEach((ag) => {
      const name = normalizeAgentName(ag.agent_name || ag.name || '');
      if (ag.id && name) map.set(String(ag.id), name);
      if (ag.agent_id && name) map.set(String(ag.agent_id), name);
      if (name) map.set(name.toLowerCase(), name);
    });
    return map;
  }, [agentsList]);

  const getAgentName = (rawVal: any, deal?: Record<string, any>): string => {
    if (!rawVal) return normalizeAgentName(deal?.primary_agent || deal?.agent_name) || '—';
    const str = String(rawVal).trim();
    const mapped = agentMap.get(str) || agentMap.get(str.toLowerCase()) || agentMap.get(normalizeAgentName(str).toLowerCase());
    return mapped || normalizeAgentName(deal?.primary_agent || deal?.agent_name) || normalizeAgentName(str) || str;
  };

  // Group contiguous fields by section_name for top header spans
  const sectionHeaderGroups = useMemo(() => {
    if (schemaFields.length === 0) return [];

    const groups: { name: string; span: number }[] = [];
    let currentSection = schemaFields[0].section_name || 'General';
    let currentSpan = 0;

    schemaFields.forEach((field) => {
      const secName = field.section_name || 'General';
      if (secName === currentSection) {
        currentSpan++;
      } else {
        groups.push({ name: currentSection, span: currentSpan });
        currentSection = secName;
        currentSpan = 1;
      }
    });

    if (currentSpan > 0) {
      groups.push({ name: currentSection, span: currentSpan });
    }

    return groups;
  }, [schemaFields]);

  const requestDelete = (deal: Record<string, any>, dealId: string) => {
    setDeleteError(null);
    setPendingDelete({
      id: dealId,
      label: transactionDealLabel(deal) || dealId,
      clientId: String(deal.client_id || 'DEMO'),
    });
  };

  const confirmDelete = async () => {
    if (!pendingDelete || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(
        `/api/transactions?id=${encodeURIComponent(pendingDelete.id)}&client_id=${encodeURIComponent(pendingDelete.clientId)}`,
        {
          method: 'DELETE',
          headers: { 'x-client-id': pendingDelete.clientId },
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Failed to delete the transaction.');
      }
      setDeals((current) => current.filter((deal) => String(deal.id) !== pendingDelete.id));
      setDeletedDeals((current) => {
        const alreadyListed = current.some((deal) => String(deal.id) === pendingDelete.id);
        if (alreadyListed) return current;
        const removed = deals.find((deal) => String(deal.id) === pendingDelete.id);
        return removed ? [{ ...removed, archived: true }, ...current] : current;
      });
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete the transaction.');
    } finally {
      setIsDeleting(false);
    }
  };

  const restoreDeal = async (deal: Record<string, any>, dealId: string) => {
    if (restoringId) return;
    setRestoringId(dealId);
    setRestoreError(null);
    const clientId = String(deal.client_id || 'DEMO');
    try {
      const res = await fetch('/api/transactions/lifecycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-id': clientId },
        body: JSON.stringify({ id: dealId, clientId, action: 'restore' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Failed to restore the transaction.');
      }
      setDeletedDeals((current) => current.filter((item) => String(item.id) !== dealId));
      setDeals((current) => {
        if (current.some((item) => String(item.id) === dealId)) return current;
        return [{ ...deal, archived: false, permanently_deleted: false }, ...current];
      });
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Failed to restore the transaction.');
    } finally {
      setRestoringId(null);
    }
  };

  const confirmPermanentDelete = async () => {
    if (!pendingPermanent || isPermanentDeleting) return;
    setIsPermanentDeleting(true);
    setPermanentError(null);
    try {
      const res = await fetch('/api/transactions/lifecycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-id': pendingPermanent.clientId },
        body: JSON.stringify({ id: pendingPermanent.id, clientId: pendingPermanent.clientId, action: 'permanent' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Failed to permanently delete the transaction.');
      }
      setDeletedDeals((current) => current.filter((deal) => String(deal.id) !== pendingPermanent.id));
      setDeals((current) => current.filter((deal) => String(deal.id) !== pendingPermanent.id));
      setPendingPermanent(null);
    } catch (err) {
      setPermanentError(err instanceof Error ? err.message : 'Failed to permanently delete the transaction.');
    } finally {
      setIsPermanentDeleting(false);
    }
  };

  const handleSort = (fieldKey: string) => {
    setDefaultSortRules(null);
    if (sortField === fieldKey) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(fieldKey);
      setSortOrder('asc');
    }
  };

  const handleFilterChange = (fieldKey: string, value: string) => {
    setColFilters((prev) => ({ ...prev, [fieldKey]: value }));
  };

  const syncWithTms = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncNotice(null);
    const clientId = 'DEMO';
    const fetchOptions = { headers: { 'x-client-id': clientId } };
    try {
      const response = await fetch('/api/integrations/google-sheets/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-id': clientId },
        body: JSON.stringify({
          clientId,
          ...(bulkMode && selectedIds.size > 0 ? { transactionIds: [...selectedIds] } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        throw new Error(data.error || data.run?.message || 'Sync failed.');
      }
      const [dealsRes, deletedRes, tmsIdsRes] = await Promise.all([
        fetch('/api/transactions', fetchOptions),
        fetch('/api/transactions?view=deleted', fetchOptions),
        fetch('/api/integrations/tms-ids', fetchOptions),
      ]);
      if (dealsRes.ok) {
        const dealsData = await dealsRes.json();
        const list = dealsData.transactions || dealsData.deals || dealsData.catalog || [];
        setDeals(Array.isArray(list) ? list : []);
      }
      if (deletedRes.ok) {
        const deletedData = await deletedRes.json();
        const list = deletedData.transactions || deletedData.deals || [];
        setDeletedDeals(Array.isArray(list) ? list : []);
      }
      if (tmsIdsRes.ok) {
        const tmsIdsData = await tmsIdsRes.json();
        setSourceTmsIds(tmsIdsData.available ? new Set((tmsIdsData.tmsIds || []).map((id: unknown) => String(id).toLowerCase())) : null);
      }
      const run = data.run || {};
      const details = Array.isArray(run.details) ? run.details as SyncRunDetail[] : [];
      const summary = syncFinishedSummary({
        createdCount: run.createdCount ?? 0,
        updatedCount: run.updatedCount ?? 0,
        skippedCount: run.skippedCount ?? 0,
        errorCount: run.errorCount ?? 0,
        connectedCount: run.connectedCount ?? 0,
        disconnectedCount: run.disconnectedCount ?? 0,
        details,
      });
      setSyncNotice({
        tone: 'ok',
        finishedAt: run.finishedAt || new Date().toISOString(),
        createdCount: run.createdCount ?? 0,
        updatedCount: run.updatedCount ?? 0,
        errorCount: run.errorCount ?? 0,
        text: '',
      });
      setSyncResult({
        summary,
        note: run.message ? String(run.message) : null,
        details,
      });
      setSyncResultOpen(true);
      setSyncHighlights(parseSyncHighlights(run.highlights));
      setSyncChangesOn(true);
    } catch (err) {
      setSyncNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Sync failed.' });
    } finally {
      setIsSyncing(false);
    }
  };

  const fieldTypes = useMemo(
    () => Object.fromEntries(schemaFields.map((field) => [field.field_key, field.field_type])),
    [schemaFields],
  );
  const fieldLabels = useMemo(
    () => Object.fromEntries(schemaFields.map((field) => [field.field_key, field.field_label || field.field_key])),
    [schemaFields],
  );
  const syncErrorCount = syncResult?.details.filter((detail) => detail.outcome === 'error').length ?? 0;

  const markTmsLink = useCallback((deal: Record<string, any>) => {
    return tmsLinkMark(
      deal,
      sourceTmsIds,
      dealMatchesDefaultView(deal, defaultView.filterFormula, fieldTypes),
    );
  }, [sourceTmsIds, defaultView.filterFormula, fieldTypes]);

  const tmsLinkTotals = useMemo(() => {
    const counts = { connected: 0, disconnected: 0 };
    deals.forEach((deal) => {
      if (!dealMatchesDefaultView(deal, defaultView.filterFormula, fieldTypes)) return;
      const mark = markTmsLink(deal);
      if (!mark) return;
      counts[mark.disconnected ? 'disconnected' : 'connected'] += 1;
    });
    return counts;
  }, [deals, markTmsLink, defaultView.filterFormula, fieldTypes]);

  const showTmsConnection = (filter: TmsLinkFilter) => {
    setLedgerView(DEFAULT_TAB);
    setActiveScorecardId(null);
    setStatusSelection(null);
    setTmsFilter(filter);
  };

  useEffect(() => {
    if (isLoading) return;
    if (deals.length === 0 || submittedTemplates.size === 0) {
      setPaymentDriftIds(new Set());
      setPaymentDriftReady(true);
      return;
    }

    const candidates = deals.filter((deal) => {
      const submitted = submittedTemplates.get(String(deal.id || '')) || [];
      if (submitted.length === 0) return false;
      return submitted.every((row) => {
        const template = commissionTemplates.find((item) => item.id === row.templateId);
        return Boolean(template) && transactionQualifiesForTemplate(deal, template?.eligibility_formula || '', fieldTypes);
      });
    });
    if (candidates.length === 0) {
      setPaymentDriftIds(new Set());
      setPaymentDriftReady(true);
      return;
    }

    setPaymentDriftReady(false);

    let cancelled = false;
    const clientId = 'DEMO';
    const fetchOptions = { headers: { 'x-client-id': clientId } };

    const checkDrift = async () => {
      const templateIds = [...new Set(candidates.flatMap((deal) => (submittedTemplates.get(String(deal.id || '')) || []).map((row) => row.templateId)))];
      const bundles = await Promise.all(templateIds.map(async (templateId) => {
        const [logicResponse, parameterResponse] = await Promise.all([
          fetch(`/api/commission-template-logic?template_id=${encodeURIComponent(templateId)}`, fetchOptions),
          fetch(`/api/commission-template-parameters?template_id=${encodeURIComponent(templateId)}`, fetchOptions),
        ]);
        const logicData = await logicResponse.json();
        const parameterData = await parameterResponse.json();
        if (!logicResponse.ok || logicData.success === false) throw new Error(logicData.error || 'Failed to load rules.');
        if (!parameterResponse.ok || parameterData.success === false) throw new Error(parameterData.error || 'Failed to load parameters.');
        const steps = (logicData.logic_steps || []) as TemplateLogicStep[];
        const parameterTypes = Object.fromEntries(
          (Array.isArray(parameterData.parameters) ? parameterData.parameters : []).map((parameter: { parameter_key?: string; data_type?: string | null }) => [
            String(parameter.parameter_key || ''),
            parameter.data_type || '',
          ]),
        );
        return { templateId, steps, parameterTypes };
      }));
      if (cancelled) return;

      const bundleById = new Map(bundles.map((bundle) => [bundle.templateId, bundle]));
      const needs = formulaDataNeeds(bundles.flatMap((bundle) => templateFormulaSources(bundle.steps, [])));
      const entitiesResponse = await fetch('/api/commission-entities', fetchOptions);
      const entitiesData = await entitiesResponse.json();
      if (!entitiesResponse.ok || entitiesData.success === false) throw new Error(entitiesData.error || 'Failed to load entities.');
      const entities: CommissionEntityOption[] = (Array.isArray(entitiesData.entities) ? entitiesData.entities : []).map((entity: { id?: string; entity_name?: string; name?: string; entity_type?: string }) => ({
        id: String(entity.id || ''),
        name: entity.entity_name || entity.name || 'Unnamed Entity',
        type: entity.entity_type,
      }));
      const agents: KnownAgentInfo[] = agentsList.map((agent) => ({
        id: String(agent.id || ''),
        name: normalizeAgentName(agent.agent_name || agent.name || ''),
        isTeamLead: Boolean(agent.is_team_lead || agent.isTeamLead),
        clientId: agent.client_id ? String(agent.client_id) : undefined,
        fields: Object.fromEntries(
          Object.entries(agent).flatMap(([key, value]) => {
            if (AGENT_FORMULA_SKIP.has(key) || value === null || value === undefined || value === '' || typeof value === 'object') return [];
            return [[key, String(value)]];
          }),
        ),
      })).filter((agent) => agent.id && agent.name);

      const [ledger, lookups, itemGroups] = await Promise.all([
        needs.needsLedger ? loadCommissionLedger(clientId, entities) : Promise.resolve([]),
        needs.lookupTables.length > 0 ? loadFormulaLookups(clientId, needs.lookupTables) : Promise.resolve({ clientId, tables: {} }),
        Promise.all(candidates.map(async (deal) => {
          const transactionId = String(deal.id || '');
          const response = await fetch(`/api/transaction-commission-items?client_id=${encodeURIComponent(clientId)}&transaction_id=${encodeURIComponent(transactionId)}`, fetchOptions);
          const data = await response.json();
          if (!response.ok || data.success === false) throw new Error(data.error || 'Failed to load commission lines.');
          return { transactionId, items: (Array.isArray(data.items) ? data.items : []) as StoredCommissionItem[] };
        })),
      ]);
      if (cancelled) return;

      const drifted = new Set<string>();
      for (const deal of candidates) {
        const transactionId = String(deal.id || '');
        const items = itemGroups.find((group) => group.transactionId === transactionId)?.items || [];
        const saved = payoutSignature(savedPayouts(items, agents, entities));
        const submitted = submittedTemplates.get(transactionId) || [];
        let changed = false;
        for (const row of submitted) {
          const bundle = bundleById.get(row.templateId);
          if (!bundle) continue;
          try {
            const replayed = replayedPaymentSignature({
              deal,
              steps: bundle.steps,
              parameters: row.parameters,
              parameterTypes: bundle.parameterTypes,
              items,
              agents,
              entities,
              overviewFields,
              ledger,
              lookups,
            });
            if (replayed !== saved) changed = true;
          } catch {
            // A replay that cannot be calculated stays green.
          }
        }
        if (changed) drifted.add(transactionId);
      }
      if (!cancelled) {
        setPaymentDriftIds(drifted);
        setPaymentDriftReady(true);
      }
    };

    void checkDrift().catch((error) => {
      console.error('template payment check failed', error);
      if (!cancelled) {
        setPaymentDriftIds(new Set());
        setPaymentDriftReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isLoading, deals, submittedTemplates, commissionTemplates, fieldTypes, agentsList, overviewFields]);

  const templateBolt = useCallback((deal: Record<string, any>): { tone: BoltTone; label: string } | null => {
    const dealId = String(deal.id || '');
    const submittedIds = (submittedTemplates.get(dealId) || []).map((item) => item.templateId);
    const bolt = templateBoltTone(deal, commissionTemplates, submittedIds, fieldTypes, paymentDriftIds.has(dealId));
    if (bolt?.tone === 'submitted' && !paymentDriftReady) return null;
    return bolt;
  }, [submittedTemplates, commissionTemplates, fieldTypes, paymentDriftIds, paymentDriftReady]);

  const templateBoltChecking = useCallback((deal: Record<string, any>): boolean => {
    if (paymentDriftReady) return false;
    const dealId = String(deal.id || '');
    const submittedIds = (submittedTemplates.get(dealId) || []).map((item) => item.templateId);
    return templateBoltTone(deal, commissionTemplates, submittedIds, fieldTypes, false)?.tone === 'submitted';
  }, [submittedTemplates, commissionTemplates, fieldTypes, paymentDriftReady]);

  // 2. Process Filters & Sorting
  const showingDeleted = ledgerView === DELETED_TAB && !activeScorecardId;

  const matchesLedgerFilters = (deal: Record<string, any>, ignoreStatus: boolean) => {
    if (activeScorecardId) {
      const card = scorecards.find((item) => item.id === activeScorecardId);
      if (card && !dealMatchesDefaultView(deal, card.filterFormula, fieldTypes)) return false;
    } else if (ledgerView === SYNCED_TAB) {
      if (!syncHighlights.has(String(deal.id))) return false;
    } else if (ledgerView === DEFAULT_TAB && defaultView.filterFormula.trim()) {
      if (!dealMatchesDefaultView(deal, defaultView.filterFormula, fieldTypes)) return false;
    }

    if (!ignoreStatus && statusSelection) {
      const statusVal = normalizeStatus(String(deal.transaction_status || deal.status || ''));
      const selected = statusLookups.find((lookup) => lookup.optionLabel === statusSelection);
      const selectedValues = [
        selected ? normalizeStatus(selected.optionValue) : '',
        normalizeStatus(selected?.optionLabel || statusSelection),
      ].filter(Boolean);
      if (!selectedValues.includes(statusVal)) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const resolvedAgent = getAgentName(deal.agent_id, deal).toLowerCase();
      const matchesGlobal = Object.values(deal).some((val) =>
        String(val || '').toLowerCase().includes(q)
      ) || resolvedAgent.includes(q);
      if (!matchesGlobal) return false;
    }

    for (const [key, filterVal] of Object.entries(colFilters)) {
      if (!filterVal || filterVal === 'All') continue;
      if (key === 'agent_id' || key === 'primary_agent') {
        const agentName = getAgentName(deal.agent_id, deal).toLowerCase();
        const rawAgentId = String(deal.agent_id || '').toLowerCase();
        const target = filterVal.toLowerCase();
        if (!agentName.includes(target) && !rawAgentId.includes(target)) return false;
      } else {
        const fieldDef = schemaFields.find((f) => f.field_key === key);
        const isPercent = fieldDef?.field_type === 'PERCENT' || key === 'gci_perc';
        const cellVal = String(deal[key] ?? '').toLowerCase();
        const target = filterVal.toLowerCase();
        if (isPercent) {
          const pctVal = `${formatPercent(deal[key])} ${formatTablePercent(deal[key])}`.toLowerCase();
          if (!cellVal.includes(target) && !pctVal.includes(target)) return false;
        } else if (!cellVal.includes(target)) {
          return false;
        }
      }
    }

    return true;
  };

  const viewedDeals = useMemo(() => {
    const source = showingDeleted ? deletedDeals : deals;
    return source.filter((deal) => matchesLedgerFilters(deal, false));
  }, [deals, deletedDeals, searchQuery, ledgerView, statusSelection, activeScorecardId, showingDeleted, statusLookups, colFilters, schemaFields, defaultView, fieldTypes, scorecards, syncHighlights]);

  const boltCounts = useMemo(() => {
    const counts: Record<BoltTone, number> = { submitted: 0, ready: 0, ineligible: 0, drift: 0 };
    for (const deal of viewedDeals) {
      if (tmsFilter === 'connected' && markTmsLink(deal)?.disconnected !== false) continue;
      if (tmsFilter === 'disconnected' && markTmsLink(deal)?.disconnected !== true) continue;
      const tone = templateBolt(deal)?.tone;
      if (tone) counts[tone] += 1;
    }
    return counts;
  }, [viewedDeals, tmsFilter, templateBolt, markTmsLink]);

  const tmsCounts = useMemo(() => {
    const counts: Record<TmsLinkFilter, number> = { connected: 0, disconnected: 0 };
    for (const deal of viewedDeals) {
      if (boltTone && templateBolt(deal)?.tone !== boltTone) continue;
      const mark = markTmsLink(deal);
      if (!mark) continue;
      counts[mark.disconnected ? 'disconnected' : 'connected'] += 1;
    }
    return counts;
  }, [viewedDeals, boltTone, templateBolt, markTmsLink]);

  useLayoutEffect(() => {
    if (!boltMenuOpen) return;
    const place = () => {
      const anchor = boltMenuButtonRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = 256;
      const left = Math.min(anchor.left, window.innerWidth - width - 8);
      setBoltMenuBox({ top: anchor.bottom + 4, left: Math.max(8, left) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [boltMenuOpen]);

  useEffect(() => {
    if (!boltMenuOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (boltMenuButtonRef.current?.contains(target) || boltMenuPanelRef.current?.contains(target)) return;
      setBoltMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBoltMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [boltMenuOpen]);

  useLayoutEffect(() => {
    if (!tmsMenuOpen) return;
    const place = () => {
      const anchor = tmsMenuButtonRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = 256;
      const left = Math.min(anchor.left, window.innerWidth - width - 8);
      setTmsMenuBox({ top: anchor.bottom + 4, left: Math.max(8, left) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [tmsMenuOpen]);

  useEffect(() => {
    if (!tmsMenuOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (tmsMenuButtonRef.current?.contains(target) || tmsMenuPanelRef.current?.contains(target)) return;
      setTmsMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTmsMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [tmsMenuOpen]);

  useLayoutEffect(() => {
    if (!statusMenuOpen) return;
    const place = () => {
      const anchor = statusMenuButtonRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = 256;
      const left = Math.min(anchor.left, window.innerWidth - width - 8);
      setStatusMenuBox({ top: anchor.bottom + 4, left: Math.max(8, left) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [statusMenuOpen]);

  useEffect(() => {
    if (!statusMenuOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (statusMenuButtonRef.current?.contains(target) || statusMenuPanelRef.current?.contains(target)) return;
      setStatusMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setStatusMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [statusMenuOpen]);

  const processedDeals = useMemo(() => {
    const rows = viewedDeals.filter((deal) => {
      if (boltTone && templateBolt(deal)?.tone !== boltTone) return false;
      if (tmsFilter === 'connected') return markTmsLink(deal)?.disconnected === false;
      if (tmsFilter === 'disconnected') return markTmsLink(deal)?.disconnected === true;
      return true;
    });
    return [...rows].sort((a, b) => {
        if (ledgerView === DEFAULT_TAB && !activeScorecardId && defaultSortRules && defaultSortRules.length > 0) {
          return compareBySortRules(a, b, defaultSortRules, (deal, fieldKey) => {
            if (fieldKey === 'agent_id' || fieldKey === 'primary_agent') return getAgentName(deal.agent_id, deal);
            const raw = deal[fieldKey];
            if (raw === undefined || raw === null || raw === '') return '';
            if (typeof raw === 'number') return raw;
            const text = String(raw);
            return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
          });
        }

        let aVal = a[sortField];
        let bVal = b[sortField];

        if (sortField === 'agent_id' || sortField === 'primary_agent') {
          aVal = getAgentName(a.agent_id, a);
          bVal = getAgentName(b.agent_id, b);
        }

        if (aVal === undefined || aVal === null) aVal = '';
        if (bVal === undefined || bVal === null) bVal = '';

        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
        }

        return sortOrder === 'asc'
          ? String(aVal).localeCompare(String(bVal))
          : String(bVal).localeCompare(String(aVal));
    });
  }, [viewedDeals, boltTone, tmsFilter, templateBolt, markTmsLink, ledgerView, activeScorecardId, defaultSortRules, sortField, sortOrder]);

  const visibleIds = useMemo(
    () => processedDeals.map((deal) => String(deal.id || '')).filter(Boolean),
    [processedDeals],
  );
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  useEffect(() => {
    if (!showingDeleted) return;
    setBulkMode(false);
    setSelectedIds(new Set());
    setBulkDialogOpen(false);
    setBulkError(null);
  }, [showingDeleted]);

  useEffect(() => {
    if (!bulkMode) return;
    const visible = new Set(visibleIds);
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => visible.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [bulkMode, visibleIds]);

  useEffect(() => {
    const box = selectAllRef.current;
    if (!box) return;
    const count = visibleIds.filter((id) => selectedIds.has(id)).length;
    box.indeterminate = count > 0 && count < visibleIds.length;
  }, [visibleIds, selectedIds, bulkMode]);

  const toggleVisibleSelection = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (visibleIds.every((id) => next.has(id))) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleRowSelection = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const tableScrollRef = useRef<HTMLDivElement>(null);
  const visibleIdsRef = useRef(visibleIds);
  visibleIdsRef.current = visibleIds;
  const dragSelectRef = useRef<{
    startId: string;
    originX: number;
    originY: number;
    clientX: number;
    clientY: number;
    dragging: boolean;
    base: Set<string>;
  } | null>(null);
  const suppressRowClickRef = useRef(false);

  const applyDragSelection = useCallback((startId: string, currentId: string, base: Set<string>) => {
    const ids = visibleIdsRef.current;
    const start = ids.indexOf(startId);
    const current = ids.indexOf(currentId);
    if (start < 0 || current < 0) return;
    const from = Math.min(start, current);
    const to = Math.max(start, current);
    const next = new Set(base);
    for (let index = from; index <= to; index += 1) next.add(ids[index]);
    setSelectedIds((existing) => {
      if (existing.size === next.size && [...next].every((id) => existing.has(id))) return existing;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!bulkMode) {
      dragSelectRef.current = null;
      return;
    }
    let frame = 0;
    const rowIdAt = (x: number, y: number) => {
      const scroller = tableScrollRef.current;
      let pointY = y;
      const head = scroller?.querySelector('thead');
      const headBottom = head?.getBoundingClientRect().bottom;
      if (headBottom !== undefined && pointY <= headBottom) pointY = headBottom + 8;
      const target = document.elementFromPoint(x, pointY);
      const row = target instanceof Element ? target.closest('tr[data-bulk-id]') : null;
      return row?.getAttribute('data-bulk-id') || '';
    };
    const extendSelection = () => {
      const drag = dragSelectRef.current;
      if (!drag?.dragging) return;
      const scroller = tableScrollRef.current;
      if (scroller) {
        const bounds = scroller.getBoundingClientRect();
        if (drag.clientY < bounds.top + 36) scroller.scrollTop -= 18;
        else if (drag.clientY > bounds.bottom - 36) scroller.scrollTop += 18;
      }
      const id = rowIdAt(drag.clientX, drag.clientY);
      if (id) applyDragSelection(drag.startId, id, drag.base);
    };
    const onMove = (event: PointerEvent) => {
      const drag = dragSelectRef.current;
      if (!drag) return;
      drag.clientX = event.clientX;
      drag.clientY = event.clientY;
      const distance = Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY);
      if (!drag.dragging && distance < 4) return;
      if (!drag.dragging) {
        drag.dragging = true;
        document.body.classList.add('select-none');
      }
      const id = rowIdAt(event.clientX, event.clientY);
      if (id) applyDragSelection(drag.startId, id, drag.base);
      if (!frame) frame = requestAnimationFrame(function loop() {
        extendSelection();
        frame = dragSelectRef.current?.dragging ? requestAnimationFrame(loop) : 0;
      });
    };
    const stop = () => {
      if (dragSelectRef.current?.dragging) suppressRowClickRef.current = true;
      dragSelectRef.current = null;
      document.body.classList.remove('select-none');
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      document.body.classList.remove('select-none');
      if (frame) cancelAnimationFrame(frame);
    };
  }, [applyDragSelection, bulkMode]);

  const confirmBulkUpdate = async (fieldKey: string, value: string) => {
    setIsBulkUpdating(true);
    setBulkError(null);
    try {
      const response = await fetch('/api/transactions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-id': 'DEMO' },
        body: JSON.stringify({ clientId: 'DEMO', ids: [...selectedIds], fieldKey, value }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Could not update those transactions.');
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      if (rows.length > 0) {
        const byId = new Map(rows.map((row: Record<string, any>) => [String(row.id), row]));
        setDeals((current) => current.map((deal) => byId.get(String(deal.id)) || deal));
      }
      const updated = Number(payload.updated) || 0;
      const unchanged = Number(payload.unchanged) || 0;
      const skipped = Number(payload.skipped) || 0;
      const failed = Array.isArray(payload.errors) ? payload.errors.length : 0;
      const parts = [`Updated ${updated} ${updated === 1 ? 'transaction' : 'transactions'}.`];
      if (unchanged) parts.push(`${unchanged} already had that value.`);
      if (skipped) parts.push(`${skipped} were skipped.`);
      if (failed) parts.push(`${failed} could not be updated.`);
      setBulkNotice(parts.join(' '));
      setSelectedIds(new Set());
      setBulkDialogOpen(false);
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : 'Could not update those transactions.');
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const confirmBulkDelete = async () => {
    if (isBulkDeleting || selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    setBulkDeleteError(null);
    const ids = [...selectedIds];
    try {
      const response = await fetch('/api/transactions/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-client-id': 'DEMO' },
        body: JSON.stringify({ clientId: 'DEMO', ids }),
      });
      const payload = await response.json().catch(() => ({}));
      const deletedIds = new Set<string>(Array.isArray(payload.deleted) ? payload.deleted.map((id: unknown) => String(id)) : []);
      if (deletedIds.size > 0) {
        const removed = deals.filter((deal) => deletedIds.has(String(deal.id)));
        setDeals((current) => current.filter((deal) => !deletedIds.has(String(deal.id))));
        setDeletedDeals((current) => {
          const listed = new Set(current.map((deal) => String(deal.id)));
          const additions = removed
            .filter((deal) => !listed.has(String(deal.id)))
            .map((deal) => ({ ...deal, archived: true }));
          return additions.length > 0 ? [...additions, ...current] : current;
        });
        setSelectedIds((current) => {
          const next = new Set(current);
          deletedIds.forEach((id) => next.delete(id));
          return next;
        });
      }
      const failed = Array.isArray(payload.errors) ? payload.errors.length : 0;
      if (!response.ok && deletedIds.size === 0) {
        throw new Error(payload.error || payload.errors?.[0]?.message || 'Could not delete those transactions.');
      }
      const noun = deletedIds.size === 1 ? 'transaction' : 'transactions';
      if (failed === 0) {
        setBulkNotice(`Deleted ${deletedIds.size} ${noun}.`);
        setPendingBulkDelete(false);
      } else {
        setBulkDeleteError(`${failed} ${failed === 1 ? 'transaction' : 'transactions'} could not be deleted.`);
        if (deletedIds.size > 0) setBulkNotice(`Deleted ${deletedIds.size} ${noun}.`);
      }
    } catch (error) {
      setBulkDeleteError(error instanceof Error ? error.message : 'Could not delete those transactions.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const defaultMatchCount = useMemo(() => {
    return deals.filter((deal) => dealMatchesDefaultView(deal, defaultView.filterFormula, fieldTypes)).length;
  }, [deals, defaultView, fieldTypes]);

  const syncedMatchCount = useMemo(() => {
    return deals.filter((deal) => syncHighlights.has(String(deal.id))).length;
  }, [deals, syncHighlights]);

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    statusLookups.forEach((lookup) => {
      counts.set(lookup.optionLabel, deals.filter((deal) => dealMatchesStatus(deal, lookup)).length);
    });
    deals.forEach((deal) => {
      const raw = String(deal.transaction_status || deal.status || '').trim();
      if (!raw || statusLookups.some((lookup) => dealMatchesStatus(deal, lookup))) return;
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    });
    return counts;
  }, [deals, statusLookups]);

  const visibleStatusLookups = useMemo(() => {
    const matched = statusLookups.filter((lookup) => (statusCounts.get(lookup.optionLabel) ?? 0) > 0);
    const known = new Set<string>();
    statusLookups.forEach((lookup) => {
      known.add(normalizeStatus(lookup.optionLabel));
      known.add(normalizeStatus(lookup.optionValue));
    });

    const extras: StatusLookup[] = [];
    deals.forEach((deal) => {
      const raw = String(deal.transaction_status || deal.status || '').trim();
      if (!raw) return;
      const norm = normalizeStatus(raw);
      if (!norm || known.has(norm) || statusLookups.some((lookup) => dealMatchesStatus(deal, lookup))) return;
      known.add(norm);
      extras.push({ optionValue: raw, optionLabel: raw });
    });

    return [...matched, ...extras];
  }, [deals, statusLookups, statusCounts]);

  const syncErrorIdentity = useMemo(() => {
    const byTmsId = new Map<string, { propertyAddress: string; transactionSide: string }>();
    [...deals, ...deletedDeals].forEach((deal) => {
      const tmsId = String(deal.tms_id || '').trim().toLowerCase();
      if (!tmsId || byTmsId.has(tmsId)) return;
      byTmsId.set(tmsId, {
        propertyAddress: String(deal.property_address || '').trim(),
        transactionSide: String(deal.transaction_side || '').trim(),
      });
    });
    return byTmsId;
  }, [deals, deletedDeals]);

  const statusMenuCounts = useMemo(() => {
    const source = showingDeleted ? deletedDeals : deals;
    const rows = source.filter((deal) => {
      if (!matchesLedgerFilters(deal, true)) return false;
      if (boltTone && templateBolt(deal)?.tone !== boltTone) return false;
      if (tmsFilter === 'connected') return markTmsLink(deal)?.disconnected === false;
      if (tmsFilter === 'disconnected') return markTmsLink(deal)?.disconnected === true;
      return true;
    });
    const counts = new Map<string, number>();
    visibleStatusLookups.forEach((lookup) => {
      counts.set(lookup.optionLabel, rows.filter((deal) => dealMatchesStatus(deal, lookup)).length);
    });
    return counts;
  }, [deals, deletedDeals, showingDeleted, ledgerView, statusSelection, activeScorecardId, visibleStatusLookups, boltTone, tmsFilter, templateBolt, markTmsLink, searchQuery, colFilters, schemaFields, defaultView, fieldTypes, scorecards, statusLookups, syncHighlights]);

  useEffect(() => {
    if (!statusSelection) return;
    const stillVisible = visibleStatusLookups.some((lookup) => lookup.optionLabel === statusSelection);
    if (!stillVisible) setStatusSelection(null);
  }, [statusSelection, visibleStatusLookups]);

  const scorecardRows = useMemo(() => {
    return scorecards.map((card) => ({
      card,
      rows: qualifyingDeals(deals, card, fieldTypes),
    }));
  }, [scorecards, deals, fieldTypes]);

  const selectDefaultView = () => {
    setLedgerView(DEFAULT_TAB);
    setActiveScorecardId(null);
    setDefaultSortRules(defaultView.sortRules.length > 0 ? defaultView.sortRules : null);
    if (defaultView.sortRules[0]) {
      setSortField(defaultView.sortRules[0].fieldKey);
      setSortOrder(defaultView.sortRules[0].direction);
    }
  };

  useEffect(() => {
    if (isLoading || ledgerView !== DELETED_TAB || deletedDeals.length > 0) return;
    selectDefaultView();
  }, [isLoading, ledgerView, deletedDeals.length, defaultView]);

  useEffect(() => {
    if (syncChangesOn || ledgerView !== SYNCED_TAB) return;
    selectDefaultView();
  }, [syncChangesOn, ledgerView, defaultView]);

  const resetAllFilters = () => {
    setSearchQuery('');
    setLedgerView(ALL_TAB);
    setActiveScorecardId(null);
    setColFilters({});
  };

  const selectScorecard = (card: TransactionScorecard, count: number) => {
    if (count === 0) return;
    if (activeScorecardId === card.id) {
      resetAllFilters();
      setStatusSelection(null);
      return;
    }
    setActiveScorecardId(card.id);
    setStatusSelection(null);
  };

  const formatScorecardMetric = (value: number | null, kind: string, fieldType?: string) => {
    if (value === null) return '—';
    if (kind === 'count') return value.toLocaleString('en-US');
    if (fieldType === 'PERCENT') return formatPercentRate(value);
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  };

  // Helper cell formatter based on schema field definition
  const renderCellContent = (deal: Record<string, any>, field: SchemaField) => {
    const rawVal = deal[field.field_key];

    if (rawVal === undefined || rawVal === null) {
      return <span className="text-slate-400 italic">-</span>;
    }

    if (field.field_type === 'CURRENCY') {
      return <span className="font-bold text-slate-900 dark:text-white">{formatTableCurrency(Number(rawVal))}</span>;
    }

    if (field.field_type === 'PERCENT' || field.field_key === 'gci_perc') {
      return <span>{formatTablePercent(rawVal)}</span>;
    }

    if (field.field_type === 'DATE') {
      return <span className="text-slate-700 dark:text-slate-300">{String(rawVal).substring(0, 10)}</span>;
    }

    if (field.field_key === 'agent_id' || field.field_type === 'AGENT_PICKER' || field.field_key === 'primary_agent') {
      const agentDisplayName = getAgentName(rawVal, deal);
      return <span className="font-semibold text-slate-900 dark:text-white">{agentDisplayName}</span>;
    }

    if (field.field_key === 'transaction_status' || field.field_key === 'status') {
      const st = String(rawVal);
      const color = colorForStatus(scorecards, st, st);
      const badgeStyle = color
        ? SCORECARD_COLOR_STYLES[color].tabActive
        : 'bg-slate-500/15 text-slate-700 dark:text-slate-200 border border-slate-400/40';

      return (
        <span
          className={`inline-flex items-center rounded border text-[10px] font-bold uppercase tracking-wider ${compactRows ? 'h-4 px-1.5 leading-none' : 'px-2 py-0.5'} ${badgeStyle}`}
        >
          {st}
        </span>
      );
    }

    return <span>{String(rawVal)}</span>;
  };

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-6 md:p-8 max-w-[1600px] mx-auto space-y-6 transition-colors duration-200">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-xl flex flex-wrap justify-between items-start sm:items-center gap-4 transition-colors">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">
            <span>Commission Tracker</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Transactions</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            Search, filter, and open transactions
          </p>
        </div>

        <Link
          href="/commission-tracker/transactions/new"
          className="border border-slate-300 bg-white px-4 py-2.5 rounded-lg text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700 flex items-center gap-2 whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5 text-emerald-500" strokeWidth={1.75} aria-hidden />
          <span>New Transaction</span>
        </Link>
        {syncResult && syncErrorsOpen && (
          <SyncErrorsDialog
            details={syncResult.details}
            fieldLabels={fieldLabels}
            identityByTmsId={syncErrorIdentity}
            onClose={() => setSyncErrorsOpen(false)}
          />
        )}
        {syncResult && syncResultOpen && (
          <SyncResultDialog
            summary={syncResult.summary}
            note={syncResult.note}
            details={syncResult.details}
            fieldLabels={fieldLabels}
            identityByTmsId={syncErrorIdentity}
            onClose={() => setSyncResultOpen(false)}
          />
        )}
      </div>

      {scorecardRows.length > 0 && (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {scorecardRows.map(({ card, rows }) => {
          const styles = SCORECARD_COLOR_STYLES[card.color] || SCORECARD_COLOR_STYLES.blue;
          const selected = activeScorecardId === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => selectScorecard(card, rows.length)}
              className={`text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-y-slate-700 dark:border-r-slate-700 border-l-4 ${styles.border} rounded-xl px-5 py-4 shadow-xl transition-colors cursor-pointer ${styles.hover} ${selected ? styles.ring : ''}`}
            >
              <p className={`text-[11px] ${styles.title} font-bold uppercase tracking-wider mb-3`}>{card.name}</p>
              <div className={card.metrics.length > 1 ? 'grid grid-cols-[35fr_65fr] gap-4' : ''}>
                {card.metrics.map((metric, index) => {
                  const value = scorecardMetricValue(rows, metric);
                  const fieldType = metric.fieldKey ? fieldTypes[metric.fieldKey] : undefined;
                  const currency = metric.kind !== 'count' && fieldType === 'CURRENCY' && value !== null;
                  const alignRight = card.metrics.length > 1 && index === 1;
                  const numberClass = `text-3xl font-bold leading-none tracking-tight ${metric.kind === 'count' ? 'text-slate-900 dark:text-white' : styles.value}`;
                  return (
                    <div key={`${card.id}-${index}`} className={`min-w-0 ${alignRight ? 'text-right' : ''}`}>
                      {currency ? (
                        <FitVolume value={value} className={numberClass} />
                      ) : (
                        <p className={numberClass}>{formatScorecardMetric(value, metric.kind, fieldType)}</p>
                      )}
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">{metric.name}</p>
                    </div>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
      )}

      {/* Ledger Table Container */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden p-5 space-y-4 transition-colors">
        {restoreError && (
          <p className="text-xs text-rose-600 dark:text-rose-400">{restoreError}</p>
        )}
        {bulkNotice && (
          <p className="text-xs text-slate-600 dark:text-slate-300">{bulkNotice}</p>
        )}
        
        {/* Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-4">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
              {[
                { key: DEFAULT_TAB, label: 'Unfinished' },
                { key: ALL_TAB, label: 'All' },
                ...(syncChangesOn ? [{ key: SYNCED_TAB, label: 'Just Synced' }] : []),
                ...(deletedDeals.length > 0 ? [{ key: DELETED_TAB, label: 'Deleted' }] : []),
              ].map((tab) => {
                const selected = !activeScorecardId && ledgerView === tab.key;
                const tabClass = tab.key === SYNCED_TAB
                  ? selected
                    ? 'bg-amber-400 text-amber-950 border border-amber-400 uppercase tracking-wider'
                    : 'bg-amber-100 text-amber-950 border border-amber-300 uppercase tracking-wider dark:bg-amber-400/20 dark:text-amber-100 dark:border-amber-400/40'
                  : tab.key === DELETED_TAB
                    ? selected
                      ? 'bg-rose-600 text-white border border-rose-600 uppercase tracking-wider dark:bg-rose-500 dark:border-rose-500'
                      : 'bg-rose-50 text-rose-700 border border-rose-300 uppercase tracking-wider dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/40'
                    : selected
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border border-transparent uppercase tracking-wider'
                      : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-600 uppercase tracking-wider';
                const countClass = tab.key === SYNCED_TAB
                  ? selected
                    ? 'text-amber-950/70'
                    : 'text-amber-800/80 dark:text-amber-100/80'
                  : tab.key === DELETED_TAB
                    ? selected
                      ? 'text-white/80'
                      : 'text-rose-600/80 dark:text-rose-300/80'
                    : selected
                      ? 'text-white/80 dark:text-slate-900/70'
                      : 'text-slate-500 dark:text-slate-400';
                const count = tab.key === DEFAULT_TAB
                  ? defaultMatchCount
                  : tab.key === SYNCED_TAB
                    ? syncedMatchCount
                    : tab.key === ALL_TAB
                      ? deals.length
                      : deletedDeals.length;

                return (
                  <button
                    key={tab.key}
                    onClick={() => {
                      if (tab.key === ALL_TAB) resetAllFilters();
                      else if (tab.key === DEFAULT_TAB) selectDefaultView();
                      else if (tab.key === SYNCED_TAB) {
                        setLedgerView(SYNCED_TAB);
                        setActiveScorecardId(null);
                      } else {
                        setLedgerView(DELETED_TAB);
                        setActiveScorecardId(null);
                      }
                    }}
                    className={`inline-flex items-center px-3.5 py-1.5 rounded-md text-xs font-bold transition whitespace-nowrap cursor-pointer ${tabClass}`}
                  >
                    {tab.label}
                    <span className={`ml-1.5 tabular-nums ${countClass}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0 w-full md:w-auto md:justify-end">
            {tmsConnectorActive && (
            <div className="relative flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={syncWithTms}
                disabled={isSyncing || isLoading}
                className="h-9 border border-slate-300 bg-white px-3 rounded-lg text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700 inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
              >
                {isSyncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" strokeWidth={1.75} aria-hidden />
                ) : (
                  <Link2 className="h-3.5 w-3.5 text-emerald-500" strokeWidth={1.75} aria-hidden />
                )}
                <span>{isSyncing ? 'Syncing…' : bulkMode && selectedIds.size > 0 ? `Sync with TMS ${selectedIds.size}` : 'Sync with TMS'}</span>
              </button>
              <HoverNote label="Highlight changes from the last sync">
                <button
                  type="button"
                  onClick={() => {
                    if (syncChangesOn && ledgerView === SYNCED_TAB) selectDefaultView();
                    setSyncChangesOn((on) => !on);
                  }}
                  aria-label="Highlight changes from the last sync"
                  aria-pressed={syncChangesOn}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition cursor-pointer ${
                    syncChangesOn
                      ? 'bg-amber-100 text-amber-950 border-amber-300 dark:bg-amber-400/20 dark:text-amber-100 dark:border-amber-400/40'
                      : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Highlighter className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                </button>
              </HoverNote>
            </div>
            )}
            {!showingDeleted && (
              <>
                {tmsConnectorActive && <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-slate-300 dark:bg-slate-500" />}
                <div className="flex flex-wrap items-center gap-2">
                  <HoverNote label="Select transactions to update or delete at once">
                    <button
                      type="button"
                      onClick={() => {
                        if (bulkMode) {
                          setBulkMode(false);
                          setSelectedIds(new Set());
                          setBulkDialogOpen(false);
                          setBulkError(null);
                          setPendingBulkDelete(false);
                          setBulkDeleteError(null);
                          return;
                        }
                        setBulkNotice(null);
                        setBulkMode(true);
                      }}
                      aria-label="Select transactions to update or delete at once"
                      aria-pressed={bulkMode}
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition cursor-pointer ${
                        bulkMode
                          ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/40'
                          : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      <ListChecks className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                    </button>
                  </HoverNote>
                  {bulkMode && selectedIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setBulkError(null);
                        setBulkDialogOpen(true);
                      }}
                      className="h-9 px-3 rounded-lg text-xs font-bold border border-emerald-500/40 bg-emerald-500 text-white hover:bg-emerald-600 transition inline-flex items-center whitespace-nowrap cursor-pointer"
                    >
                      Update {selectedIds.size}
                    </button>
                  )}
                  {bulkMode && selectedIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setBulkDeleteError(null);
                        setPendingBulkDelete(true);
                      }}
                      className="h-9 px-3 rounded-lg text-xs font-bold border border-rose-500/40 bg-rose-600 text-white hover:bg-rose-500 transition inline-flex items-center whitespace-nowrap cursor-pointer"
                    >
                      Delete {selectedIds.size}
                    </button>
                  )}
                </div>
              </>
            )}
            {(tmsConnectorActive || !showingDeleted) && <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-slate-300 dark:bg-slate-500" />}
            <HoverNote label="Compact Table View">
              <button
                type="button"
                onClick={toggleCompactRows}
                aria-label="Compact Table View"
                aria-pressed={compactRows}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition cursor-pointer ${
                  compactRows
                    ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/40'
                    : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Rows3 className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              </button>
            </HoverNote>
            <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-slate-300 dark:bg-slate-500" />
            <div className="flex items-center gap-2">
            <HoverNote label="Advanced Filters">
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                aria-label="Advanced Filters"
                aria-pressed={showFilters}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition cursor-pointer ${
                  showFilters
                    ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/40'
                    : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <ListFilter className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              </button>
            </HoverNote>

            {/* Quick Search */}
            <div className="relative w-[20rem] max-w-full">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search all fields..."
                className="h-9 w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>
            </div>
          </div>
        </div>

        {syncNotice && (syncNotice.tone === 'error' || syncChangesOn) && (
          <p className={`text-left text-xs ${syncNotice.tone === 'error' ? 'text-rose-600 dark:text-rose-300' : 'text-slate-600 dark:text-slate-300'}`}>
            <SyncSummaryLine
              text={syncNotice.tone === 'ok' && syncNotice.finishedAt
                ? lastSyncResultsNote({
                  finishedAt: syncNotice.finishedAt,
                  createdCount: syncNotice.createdCount ?? 0,
                  updatedCount: syncNotice.updatedCount ?? 0,
                  connectedCount: tmsLinkTotals.connected,
                  disconnectedCount: tmsLinkTotals.disconnected,
                  errorCount: syncNotice.errorCount ?? 0,
                })
                : syncNotice.text}
              errorCount={syncNotice.tone === 'ok' ? syncNotice.errorCount ?? 0 : syncErrorCount}
              connectedCount={syncNotice.tone === 'ok' ? tmsLinkTotals.connected : undefined}
              disconnectedCount={syncNotice.tone === 'ok' ? tmsLinkTotals.disconnected : undefined}
              onShowErrors={() => setSyncErrorsOpen(true)}
              onShowConnected={() => showTmsConnection('connected')}
              onShowDisconnected={() => showTmsConnection('disconnected')}
            />
          </p>
        )}

        {/* Scrollable Table */}
        <div
          ref={tableScrollRef}
          onClickCapture={(event) => {
            if (!suppressRowClickRef.current) return;
            suppressRowClickRef.current = false;
            event.preventDefault();
            event.stopPropagation();
          }}
          className={`overflow-x-auto overflow-y-auto border border-slate-200 dark:border-slate-700/80 rounded-lg scrollbar-thin ${compactRows ? 'max-h-[calc(100dvh-11rem)]' : 'max-h-[640px]'}`}
        >
          <table className="w-full text-left text-xs min-w-[1200px] border-separate border-spacing-0">
            
            {/* Dynamic Table Header */}
            <thead className="sticky top-0 z-20 shadow-md select-none bg-slate-100 dark:bg-slate-900">
              
              {/* Section Group Header Row */}
              <tr className="bg-slate-200 dark:bg-slate-950 text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                {bulkMode && <th className="w-8 bg-slate-200 dark:bg-slate-950 border-b border-slate-300 dark:border-slate-800" />}
                <th className="w-8 bg-slate-200 dark:bg-slate-950 border-b border-slate-300 dark:border-slate-800" />
                <th className="w-8 bg-slate-200 dark:bg-slate-950 border-b border-slate-300 dark:border-slate-800" />
                {sectionHeaderGroups.map((group, idx) => (
                  <th
                    key={`${group.name}_${idx}`}
                    colSpan={group.span}
                    className="py-1.5 px-4 bg-slate-200 dark:bg-slate-950 border-b border-slate-300 dark:border-slate-800 border-r border-slate-300/60 dark:border-slate-800/80"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      <span>{group.name}</span>
                    </div>
                  </th>
                ))}
                <th className="py-1.5 px-4 bg-slate-200 dark:bg-slate-950 border-b border-slate-300 dark:border-slate-800" />
              </tr>

              {/* Field Label Header Row */}
              <tr className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-semibold">
                {bulkMode && (
                  <th className={`${compactRows ? 'px-1 py-1.5' : 'px-1 py-3'} w-8 align-middle bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-center`}>
                    <span className="inline-flex items-center justify-center">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleVisibleSelection}
                        aria-label="Select all transactions in this view"
                        className="block h-3.5 w-3.5 accent-emerald-500 cursor-pointer"
                      />
                    </span>
                  </th>
                )}
                <th className={`group/filter ${compactRows ? 'px-1 py-1.5' : 'px-1 py-3'} w-8 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-center`}>
                  <span className="relative inline-flex">
                    <button
                      ref={tmsMenuButtonRef}
                      type="button"
                      aria-expanded={tmsMenuOpen}
                      aria-haspopup="menu"
                      aria-pressed={tmsFilter !== null}
                      title={tmsFilter ? `Filtering: ${TMS_FILTERS.find((filter) => filter.value === tmsFilter)?.label}` : 'Filter by TMS connection'}
                      onClick={() => {
                        setBoltMenuOpen(false);
                        setStatusMenuOpen(false);
                        setTmsMenuOpen((open) => !open);
                      }}
                      className={`inline-flex h-6 w-6 items-center justify-center rounded cursor-pointer ${
                        tmsFilter
                          ? TMS_FILTERS.find((filter) => filter.value === tmsFilter)?.buttonClass
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      {tmsFilter === 'disconnected' ? (
                        <Unlink className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                      ) : (
                        <Link2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                      )}
                    </button>
                    {tmsFilter ? (
                      <FilterClearButton
                        label={TMS_FILTERS.find((filter) => filter.value === tmsFilter)?.label || 'TMS filter'}
                        onClear={() => {
                          setTmsFilter(null);
                          setTmsMenuOpen(false);
                        }}
                      />
                    ) : null}
                  </span>
                </th>
                <th className={`group/filter ${compactRows ? 'px-1 py-1.5' : 'px-1 py-3'} w-8 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-center`}>
                  <span className="relative inline-flex">
                    <button
                      ref={boltMenuButtonRef}
                      type="button"
                      aria-expanded={boltMenuOpen}
                      aria-haspopup="menu"
                      aria-pressed={boltTone !== null}
                      title={boltTone ? `Filtering: ${BOLT_FILTERS.find((filter) => filter.tone === boltTone)?.label}` : 'Filter by lightning color'}
                      onClick={() => {
                        setTmsMenuOpen(false);
                        setStatusMenuOpen(false);
                        setBoltMenuOpen((open) => !open);
                      }}
                      className={`inline-flex h-6 w-6 items-center justify-center rounded cursor-pointer ${
                        boltTone
                          ? BOLT_FILTERS.find((filter) => filter.tone === boltTone)?.buttonClass
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Zap className="h-3.5 w-3.5" fill={boltTone ? 'currentColor' : 'none'} strokeWidth={1.75} aria-hidden />
                    </button>
                    {boltTone ? (
                      <FilterClearButton
                        label={BOLT_FILTERS.find((filter) => filter.tone === boltTone)?.label || 'template filter'}
                        onClear={() => {
                          setBoltTone(null);
                          setBoltMenuOpen(false);
                        }}
                      />
                    ) : null}
                  </span>
                </th>
                {schemaFields.map((field) => {
                  const statusColumn = isStatusColumn(field);
                  const statusLookup = statusColumn && statusSelection
                    ? visibleStatusLookups.find((lookup) => lookup.optionLabel === statusSelection) ?? null
                    : null;
                  const statusColor = statusLookup ? colorForStatus(scorecards, statusLookup.optionLabel, statusLookup.optionValue) : null;
                  const statusPill = statusColor
                    ? SCORECARD_COLOR_STYLES[statusColor].tabActive
                    : 'bg-slate-500/15 text-slate-700 dark:text-slate-200 border border-slate-400/40';
                  if (statusColumn) {
                    return (
                      <th
                        key={field.field_key}
                        className={`group/filter ${compactRows ? 'px-3 py-1.5' : 'px-4 py-3'} bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap border-r border-slate-200/50 dark:border-slate-800/50 last:border-r-0`}
                      >
                        <div className="flex items-center gap-1">
                          <span className="relative inline-flex">
                            <button
                              ref={field.field_key === 'transaction_status' || !schemaFields.some((item) => item.field_key === 'transaction_status') ? statusMenuButtonRef : undefined}
                              type="button"
                              aria-expanded={statusMenuOpen}
                              aria-haspopup="menu"
                              aria-pressed={Boolean(statusLookup)}
                              title={statusLookup ? `Filtering: ${statusLookup.optionLabel}` : 'Filter by status'}
                              onClick={() => {
                                setBoltMenuOpen(false);
                                setTmsMenuOpen(false);
                                setStatusMenuOpen((open) => !open);
                              }}
                              className="inline-flex cursor-pointer items-center rounded font-semibold uppercase tracking-wider hover:bg-slate-200 dark:hover:bg-slate-800"
                            >
                              {statusLookup ? (
                                <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusPill}`}>
                                  {statusLookup.optionLabel}
                                </span>
                              ) : (
                                <span className="px-0.5">{field.field_label}</span>
                              )}
                            </button>
                            {statusLookup ? (
                              <FilterClearButton
                                label={statusLookup.optionLabel}
                                onClear={() => {
                                  setStatusSelection(null);
                                  setStatusMenuOpen(false);
                                }}
                              />
                            ) : null}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSort(field.field_key)}
                            className="cursor-pointer text-slate-400 hover:text-slate-900 dark:text-slate-600 dark:hover:text-white"
                            aria-label={`Sort ${field.field_label}`}
                          >
                            {sortField === field.field_key ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
                          </button>
                        </div>
                      </th>
                    );
                  }
                  return (
                  <th
                    key={field.field_key}
                    onClick={() => handleSort(field.field_key)}
                    className={`${compactRows ? 'px-3 py-1.5' : 'px-4 py-3'} bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 cursor-pointer hover:text-slate-900 dark:hover:text-white transition group whitespace-nowrap border-r border-slate-200/50 dark:border-slate-800/50 last:border-r-0 ${isNumericColumn(field) ? 'text-right' : ''} ${isDateColumn(field) ? 'text-center' : ''}`}
                  >
                    <div className={`flex items-center gap-1 ${isNumericColumn(field) ? 'justify-end' : ''} ${isDateColumn(field) ? 'justify-center' : ''}`}>
                      <span>{field.field_label}</span>
                      <span className="text-slate-400 dark:text-slate-600 group-hover:opacity-100 transition">
                        {sortField === field.field_key ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  );
                })}
                <th className={`${compactRows ? 'px-3 py-1.5' : 'px-4 py-3'} bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap text-center`}>
                  Actions
                </th>
              </tr>

              {/* Dynamic Filter Inputs */}
              {showFilters && (
                <tr className="bg-slate-100 dark:bg-slate-900">
                  {bulkMode && <th className="w-8 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700" />}
                  <th className="w-8 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700" />
                  <th className="w-8 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700" />
                  {schemaFields.map((field) => (
                    <th key={`filter_${field.field_key}`} className="px-2 py-1.5 min-w-[120px] bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 border-r border-slate-200/50 dark:border-slate-800/50 last:border-r-0">
                      {field.field_key === 'agent_id' || field.field_type === 'AGENT_PICKER' ? (
                        <label className={filterShell}>
                          <ClearableSelect
                            allowBlank={false}
                            clearValue="All"
                            value={colFilters[field.field_key] || 'All'}
                            onChange={(e) => handleFilterChange(field.field_key, e.target.value)}
                            className={`${filterControl} cursor-pointer pr-5`}
                          >
                            <option value="All">All {field.field_label}</option>
                            {agentsList.map((ag) => {
                              const name = ag.agent_name || ag.name || '';
                              return (
                                <option key={ag.id || name} value={name}>
                                  {name}
                                </option>
                              );
                            })}
                          </ClearableSelect>
                        </label>
                      ) : field.field_type === 'SELECT' && Array.isArray(field.dropdown_options) ? (
                        <label className={filterShell}>
                          <ClearableSelect
                            allowBlank={false}
                            clearValue="All"
                            value={colFilters[field.field_key] || 'All'}
                            onChange={(e) => handleFilterChange(field.field_key, e.target.value)}
                            className={`${filterControl} cursor-pointer pr-5`}
                          >
                            <option value="All">All {field.field_label}</option>
                            {field.dropdown_options.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </ClearableSelect>
                        </label>
                      ) : (
                        <label className={filterShell}>
                          <input
                            type={field.field_type === 'DATE' ? 'date' : 'text'}
                            placeholder={`Filter ${field.field_label}...`}
                            value={colFilters[field.field_key] || ''}
                            onChange={(e) => handleFilterChange(field.field_key, e.target.value)}
                            className={`${filterControl} ${field.field_type === 'DATE' ? 'dark:[color-scheme:dark]' : ''}`}
                          />
                        </label>
                      )}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700" />
                </tr>
              )}
            </thead>

            {/* Dynamic Table Body */}
            <tbody className="text-slate-800 dark:text-slate-200 font-medium bg-white dark:bg-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={schemaFields.length + 3 + (bulkMode ? 1 : 0)} className="text-center py-10 text-slate-400 italic border-b border-slate-200 dark:border-slate-700/60">
                    Loading synchronized schema & transaction ledger...
                  </td>
                </tr>
              ) : processedDeals.length === 0 ? (
                <tr>
                  <td colSpan={schemaFields.length + 3 + (bulkMode ? 1 : 0)} className="text-center py-10 text-slate-400 italic border-b border-slate-200 dark:border-slate-700/60">
                    {showingDeleted && deletedDeals.length === 0
                      ? 'No deleted transactions.'
                      : ledgerView === SYNCED_TAB && syncedMatchCount === 0
                        ? 'No transactions were added or updated in the last TMS sync.'
                        : 'No matching transaction records found for active filters.'}
                  </td>
                </tr>
              ) : (
                processedDeals.map((deal, idx) => {
                  const dealId = deal.id || `TXN_${idx + 1}`;
                  const rowNavigates = !showingDeleted && !bulkMode;

                  const bolt = templateBolt(deal);
                  const tmsLink = markTmsLink(deal);
                  const markClass = compactRows ? 'h-3.5 w-3.5' : 'h-4 w-4';
                  return (
                    <tr
                      key={dealId}
                      data-bulk-id={bulkMode ? String(deal.id || dealId) : undefined}
                      onPointerDown={(event) => {
                        if (!bulkMode || event.button !== 0) return;
                        const target = event.target as HTMLElement | null;
                        if (target?.closest('a, button')) return;
                        if (!target?.closest('input')) event.preventDefault();
                        dragSelectRef.current = {
                          startId: String(deal.id || dealId),
                          originX: event.clientX,
                          originY: event.clientY,
                          clientX: event.clientX,
                          clientY: event.clientY,
                          dragging: false,
                          base: new Set(selectedIds),
                        };
                      }}
                      onClick={(event) => {
                        if (suppressRowClickRef.current) {
                          suppressRowClickRef.current = false;
                          return;
                        }
                        const target = event.target as HTMLElement | null;
                        if (target?.closest('a, button, input, select, textarea, label')) return;
                        if (bulkMode) {
                          toggleRowSelection(String(deal.id || dealId));
                          return;
                        }
                        if (showingDeleted) return;
                        router.push(`/commission-tracker/transactions/${dealId}`);
                      }}
                      className={`hover:bg-slate-100 dark:hover:bg-slate-700/50 transition group ${rowNavigates || bulkMode ? 'cursor-pointer' : ''}`}
                    >
                      {bulkMode && (
                        <td className={`${compactRows ? 'px-1 py-0.5' : 'px-1 py-3'} w-8 align-middle border-b border-slate-200 dark:border-slate-700/60 text-center`}>
                          <span className="inline-flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(String(deal.id || dealId))}
                              onChange={() => toggleRowSelection(String(deal.id || dealId))}
                              aria-label={`Select ${transactionDealLabel(deal) || String(deal.id || dealId)}`}
                              className="block h-3.5 w-3.5 accent-emerald-500 cursor-pointer"
                            />
                          </span>
                        </td>
                      )}
                      <td className={`${compactRows ? 'px-1 py-0.5' : 'px-1 py-3'} w-8 border-b border-slate-200 dark:border-slate-700/60 text-center`}>
                        {tmsLink ? (
                          <span title={tmsLink.label} aria-label={tmsLink.label} className="inline-flex items-center justify-center">
                            {tmsLink.disconnected ? (
                              <Unlink className={`${markClass} text-rose-500`} strokeWidth={1.75} aria-hidden />
                            ) : (
                              <Link2 className={`${markClass} text-emerald-500`} strokeWidth={1.75} aria-hidden />
                            )}
                          </span>
                        ) : null}
                      </td>
                      <td className={`${compactRows ? 'px-1 py-0.5' : 'px-1 py-3'} w-8 border-b border-slate-200 dark:border-slate-700/60 text-center`}>
                        {bolt ? (
                          !rowNavigates ? (
                            <span title={bolt.label} aria-label={bolt.label} className="inline-flex rounded p-0.5">
                              <BoltStatusIcon tone={bolt.tone} className={markClass} />
                            </span>
                          ) : (
                          <Link
                            href={`/commission-tracker/transactions/${dealId}#commission`}
                            title={bolt.label}
                            aria-label={bolt.label}
                            className="inline-flex rounded p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700"
                            onClick={(event) => {
                              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                              // Client navigation appends this hash onto a URL that already has it.
                              event.preventDefault();
                              window.sessionStorage.setItem('soleox-transaction-section', 'commission');
                              router.push(`/commission-tracker/transactions/${dealId}`);
                            }}
                          >
                            <BoltStatusIcon tone={bolt.tone} className={markClass} />
                          </Link>
                          )
                        ) : templateBoltChecking(deal) ? (
                          <span
                            className="inline-flex rounded p-0.5"
                            title="Checking template status"
                            role="status"
                            aria-label="Checking template status"
                          >
                            <Loader2
                              className={`${markClass} animate-spin text-slate-400 dark:text-slate-500`}
                              strokeWidth={1.75}
                              aria-hidden
                            />
                          </span>
                        ) : null}
                      </td>
                      {schemaFields.map((field) => {
                        const changedBySync = syncChangesOn && syncHighlights.get(String(deal.id))?.has(field.field_key);
                        return (
                        <td
                          key={field.field_key}
                          title={changedBySync ? 'Changed in the last TMS sync' : undefined}
                          className={`${compactRows ? 'px-3 py-0.5 leading-4' : 'px-4 py-3'} whitespace-nowrap border-b border-slate-200 dark:border-slate-700/60 ${isNumericColumn(field) ? 'text-right tabular-nums' : ''} ${isDateColumn(field) ? 'text-center tabular-nums' : ''} ${changedBySync ? 'bg-amber-100 text-amber-950 dark:bg-amber-400/20 dark:text-amber-100' : ''}`}
                        >
                          {field.field_key === 'id' ? (
                            !rowNavigates ? (
                              <span className="font-bold text-slate-800 dark:text-slate-100">{String(deal[field.field_key] || dealId)}</span>
                            ) : (
                            <Link
                              href={`/commission-tracker/transactions/${dealId}`}
                              className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                            >
                              {String(deal[field.field_key] || dealId)}
                            </Link>
                            )
                          ) : field.field_key === 'property_address' ? (
                            !rowNavigates ? (
                              deal.property_address
                                ? <span className="font-semibold text-slate-800 dark:text-slate-100">{String(deal.property_address)}</span>
                                : <span className="text-slate-400 italic font-normal">-</span>
                            ) : (
                            <Link
                              href={`/commission-tracker/transactions/${dealId}`}
                              className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                            >
                              {deal.property_address
                                ? String(deal.property_address)
                                : <span className="text-slate-400 italic font-normal">-</span>}
                            </Link>
                            )
                          ) : (
                            renderCellContent(deal, field)
                          )}
                        </td>
                        );
                      })}
                      <td className={`${compactRows ? 'px-3 py-0.5' : 'px-4 py-3'} whitespace-nowrap border-b border-slate-200 dark:border-slate-700/60 text-center`}>
                        {showingDeleted ? (
                          <div className="inline-flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => void restoreDeal(deal, String(deal.id || dealId))}
                              disabled={restoringId === String(deal.id || dealId)}
                              className={`inline-flex items-center justify-center rounded text-emerald-600 hover:text-emerald-500 hover:bg-emerald-500/10 cursor-pointer disabled:opacity-50 dark:text-emerald-400 ${compactRows ? 'h-4 w-4' : 'h-7 w-7'}`}
                              title="Restore transaction"
                              aria-label={`Restore ${transactionDealLabel(deal) || String(deal.id || dealId)}`}
                            >
                              <RotateCcw className={compactRows ? 'h-3.5 w-3.5' : 'h-4 w-4'} strokeWidth={1.75} aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPermanentError(null);
                                setPendingPermanent({
                                  id: String(deal.id || dealId),
                                  label: transactionDealLabel(deal) || String(deal.id || dealId),
                                  clientId: String(deal.client_id || 'DEMO'),
                                });
                              }}
                              className={`inline-flex items-center justify-center rounded text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer ${compactRows ? 'h-4 w-4' : 'h-7 w-7'}`}
                              title="Permanently delete"
                              aria-label={`Permanently delete ${transactionDealLabel(deal) || String(deal.id || dealId)}`}
                            >
                              <TrashIcon className={compactRows ? 'h-3.5 w-3.5' : undefined} />
                            </button>
                          </div>
                        ) : (
                        <button
                          type="button"
                          onClick={() => requestDelete(deal, String(deal.id || dealId))}
                          className={`inline-flex items-center justify-center rounded text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer ${compactRows ? 'h-4 w-4' : 'h-7 w-7'}`}
                          title="Delete transaction"
                          aria-label={`Delete ${transactionDealLabel(deal) || String(deal.id || dealId)}`}
                        >
                          <TrashIcon className={compactRows ? 'h-3.5 w-3.5' : undefined} />
                        </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 pt-2">
          <span>Displaying {processedDeals.length} of {showingDeleted ? deletedDeals.length : deals.length} records</span>
          <span className="text-[11px] italic">Columns synchronized dynamically with client schema configuration</span>
        </div>
      </div>

      {tmsMenuOpen && createPortal(
        <div
          ref={tmsMenuPanelRef}
          role="menu"
          style={{ top: tmsMenuBox.top, left: tmsMenuBox.left }}
          className="fixed z-[80] w-64 rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-800"
        >
          {TMS_FILTERS.map((filter) => {
            const selected = tmsFilter === filter.value;
            const Icon = filter.value === 'disconnected' ? Unlink : Link2;
            return (
              <button
                key={filter.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  setTmsFilter(selected ? null : filter.value);
                  setTmsMenuOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-bold cursor-pointer ${
                  selected ? filter.activeClass : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 shrink-0 ${filter.iconClass}`} strokeWidth={1.75} aria-hidden />
                <span className="flex-1 text-left">{filter.label}</span>
                <span className={`tabular-nums ${selected ? 'opacity-80' : 'text-slate-500 dark:text-slate-400'}`}>{tmsCounts[filter.value]}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}

      {boltMenuOpen && createPortal(
        <div
          ref={boltMenuPanelRef}
          role="menu"
          style={{ top: boltMenuBox.top, left: boltMenuBox.left }}
          className="fixed z-[80] w-64 rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-800"
        >
          {BOLT_FILTERS.map((filter) => {
            const selected = boltTone === filter.tone;
            const Icon = filter.icon;
            return (
              <button
                key={filter.tone}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  setBoltTone(selected ? null : filter.tone);
                  setBoltMenuOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-bold cursor-pointer ${
                  selected ? filter.activeClass : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 shrink-0 ${filter.iconClass}`} strokeWidth={2.25} aria-hidden />
                <span className="flex-1 text-left">{filter.label}</span>
                <span className={`tabular-nums ${selected ? 'opacity-80' : 'text-slate-500 dark:text-slate-400'}`}>{boltCounts[filter.tone]}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}

      {statusMenuOpen && createPortal(
        <div
          ref={statusMenuPanelRef}
          role="menu"
          style={{ top: statusMenuBox.top, left: statusMenuBox.left }}
          className="fixed z-[80] w-64 rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-800"
        >
          {visibleStatusLookups.map((lookup) => {
            const selected = statusSelection === lookup.optionLabel;
            const color = colorForStatus(scorecards, lookup.optionLabel, lookup.optionValue);
            const pill = color
              ? SCORECARD_COLOR_STYLES[color].tabActive
              : 'bg-slate-500/15 text-slate-700 dark:text-slate-200 border border-slate-400/40';
            return (
              <button
                key={lookup.optionLabel}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  setStatusSelection(selected ? null : lookup.optionLabel);
                  setStatusMenuOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-bold cursor-pointer ${
                  selected ? 'bg-slate-100 dark:bg-slate-700' : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${pill}`}>
                  {lookup.optionLabel}
                </span>
                <span className={`ml-auto tabular-nums ${selected ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
                  {statusMenuCounts.get(lookup.optionLabel) ?? 0}
                </span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}

      {pendingBulkDelete && (
        <ConfirmDialog
          title={`Delete ${selectedIds.size} ${selectedIds.size === 1 ? 'transaction' : 'transactions'}?`}
          message={selectedIds.size === 1
            ? 'This removes the transaction, including its commission and payment records. You can restore it from Deleted.'
            : `This removes these ${selectedIds.size} transactions, including their commission and payment records. You can restore them from Deleted.`}
          error={bulkDeleteError}
          isPending={isBulkDeleting}
          onCancel={() => {
            if (!isBulkDeleting) setPendingBulkDelete(false);
          }}
          onConfirm={() => void confirmBulkDelete()}
        />
      )}
      {pendingDelete && (
        <ConfirmDialog
          title={`Delete transaction "${pendingDelete.label}"?`}
          message="This removes the transaction, including its commission and payment records. You can restore it from Deleted Transactions."
          error={deleteError}
          isPending={isDeleting}
          onCancel={() => {
            if (!isDeleting) setPendingDelete(null);
          }}
          onConfirm={() => void confirmDelete()}
        />
      )}
      {pendingPermanent && (
        <ConfirmDialog
          title={`Permanently delete "${pendingPermanent.label}"?`}
          message="This transaction will leave Deleted Transactions and cannot be restored. A later sync will not add it again."
          error={permanentError}
          confirmLabel="Delete permanently"
          pendingLabel="Deleting..."
          isPending={isPermanentDeleting}
          onCancel={() => {
            if (!isPermanentDeleting) setPendingPermanent(null);
          }}
          onConfirm={() => void confirmPermanentDelete()}
        />
      )}
      {bulkDialogOpen && (
        <BulkUpdateDialog
          fields={schemaFields}
          agents={agentsList}
          selectedDeals={deals.filter((deal) => selectedIds.has(String(deal.id)))}
          selectedCount={selectedIds.size}
          isPending={isBulkUpdating}
          error={bulkError}
          onCancel={() => {
            if (!isBulkUpdating) setBulkDialogOpen(false);
          }}
          onConfirm={(fieldKey, value) => void confirmBulkUpdate(fieldKey, value)}
        />
      )}
    </main>
  );
}