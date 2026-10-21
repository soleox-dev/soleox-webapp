// app/commission-tracker/transactions/[id]/page.tsx
'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AgentConfig, DynamicRule, ToastNotification, roundCurrency, roundPercentRate, KnownAgentInfo } from './types';

// Custom Hooks
import { useTransactionData } from './hooks/useTransactionData';
import { useTransactionWaterfall } from './hooks/useTransactionWaterfall';
import { sameAllocationOverrides, useAgentAllocationInput } from './hooks/useAgentAllocationInput';
import { useSubmittedTemplateReplay } from './hooks/useSubmittedTemplateReplay';
import { useOverviewForm } from './hooks/useOverviewForm';

// Sub-Components & Modals
import { HeaderCard } from './components/HeaderCard';
import { SearchableTransactionPicker } from './components/SearchableTransactionPicker';
import { TransactionOverview } from './components/TransactionOverview';
import { CommissionWaterfall } from './components/CommissionWaterfall';
import { orderRulesByEntities } from './components/CommissionWaterfallTable';
import { pageFrame } from '@/lib/page-frame';
import { FinalDisbursements } from './components/FinalDisbursements';
import { RequiredFieldsModal } from './components/RequiredFieldsModal';
import { AgentPickerModal } from './components/AgentPickerModal';
import { TransferPrimaryAgentModal } from './components/TransferPrimaryAgentModal';
import { RevertPrimaryAgentModal } from './components/RevertPrimaryAgentModal';
import { UnsavedChangesModal } from './components/UnsavedChangesModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ToastBanner } from '@/components/ui/ToastBanner';
import { AllocateCommissionModal } from './components/AllocateCommissionModal';
import { toPercentPoints } from '@/lib/percent';
import { clearCommissionModuleCache, type AppliedTemplateRules } from './components/applyTemplateLogic';
import type { TemplateSubmissionDraft } from './components/CommissionTemplatePanel';
import { qualifyingTeamCaps, readTeamCapSelection, writeTeamCapSelection } from '@/lib/agent-allocations';
import { isPrimaryAgent, resolvePrimaryAgentId, waterfallFromCommissionItems } from './commissionItemState';
import { generatePrefixedId } from '@/lib/id';
import { transactionDealLabel, transactionSearchLabel } from '@/lib/transaction-label';
import { useAccess } from '@/components/access-provider';
import { useTemplateQualification } from './hooks/useTemplateQualification';
import { swallowNextClick } from '@/lib/swallow-click';

export default function Dashboard() {
  const router = useRouter();
  const { access, loading: accessLoading } = useAccess();
  const canWriteTracker = Boolean(access?.permissions.commissionTrackerWrite);
  const routeId = (useParams()?.id as string) || '';
  const isNewTransaction = routeId === 'new';

  useEffect(() => {
    if (accessLoading || !isNewTransaction || canWriteTracker) return;
    router.replace('/commission-tracker/transactions');
  }, [accessLoading, isNewTransaction, canWriteTracker, router]);

  const [toast, setToast] = useState<ToastNotification | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => setToast({ message, type });

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    savedDeals,
    setSavedDeals,
    overviewFields,
    knownAgents,
    knownEntities,
    entitiesLoaded,
    commissionItems,
    setCommissionItems,
    commissionItemsDealId,
    setCommissionItemsDealId,
    isLoadingDeals,
    isSaving,
    saveTransaction,
    reloadAgents,
  } = useTransactionData(routeId, isNewTransaction);

  const [activeTab, setActiveTab] = useState<'overview' | 'commission' | 'disbursements'>('overview');
  const [headerStick, setHeaderStick] = useState(144);

  const isProgrammaticScrollRef = useRef(false);

  const scrolledSectionRef = useRef<string | null>(null);

  const sectionFromLocation = (): 'overview' | 'commission' | 'disbursements' | null => {
    const stored = window.sessionStorage.getItem('soleox-transaction-section');
    if (stored === 'overview' || stored === 'commission' || stored === 'disbursements') {
      window.sessionStorage.removeItem('soleox-transaction-section');
      return stored;
    }
    const section = window.location.hash.replace(/^#/, '').split('#')[0];
    if (section === 'overview' || section === 'commission' || section === 'disbursements') return section;
    return null;
  };

  const writeSectionHash = (section: 'overview' | 'commission' | 'disbursements') => {
    if (window.location.hash === `#${section}`) return;
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#${section}`);
  };

  // While a popup is open the page is pinned in place, and closing it puts the old scroll position back.
  // So wait until every popup is gone and the page is free again, then jump.
  const scrollToSectionAfterModal = (sectionId: 'overview' | 'commission' | 'disbursements') => {
    const startedAt = performance.now();
    const attempt = () => {
      const pinned = document.querySelector('.app-modal') || document.body.style.position === 'fixed';
      if (pinned && performance.now() - startedAt < 2000) {
        requestAnimationFrame(attempt);
        return;
      }
      requestAnimationFrame(() => scrollToSection(sectionId));
    };
    requestAnimationFrame(attempt);
  };

  const scrollToSection = (sectionId: 'overview' | 'commission' | 'disbursements') => {
    setActiveTab(sectionId);
    isProgrammaticScrollRef.current = true;

    const el = document.getElementById(sectionId);
    if (el) {
      // Land right at the bottom of the pinned strip in its scrolled, compact form, so the gap under
      // the section links matches the gap above them. On desktop the top bar hides while scrolling
      // down and shows while scrolling up, so leave room for it only when going up.
      const strip = document.getElementById('transaction-detail-header');
      // At the top of the page the strip is taller, but it shrinks by the same amount as it scrolls and
      // the sections move up with it, so its current height still gives the right landing spot.
      const stripHeight = strip?.offsetHeight ?? 0;
      const sectionTop = el.getBoundingClientRect().top + window.scrollY;
      const root = document.documentElement;
      const goingDown = sectionTop - stripHeight > window.scrollY;
      const barHidden = root.style.getPropertyValue('--app-nav-offset').trim() === '0px';
      const barHides = (goingDown || barHidden) && window.matchMedia('(min-width: 768px)').matches;
      const barHeight = barHides ? 0 : (document.querySelector('header')?.offsetHeight ?? 64);
      // A jump from the section links is not the user scrolling up, so the top bar stays as it is.
      // The hold lasts until the smooth scroll ends. A long jump can take well over a second.
      root.dataset.navScrollHold = '1';
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        window.removeEventListener('scrollend', release);
        window.setTimeout(() => {
          delete root.dataset.navScrollHold;
          isProgrammaticScrollRef.current = false;
        }, 100);
      };
      window.addEventListener('scrollend', release);
      window.setTimeout(release, 3000);
      window.scrollTo({ top: Math.max(0, sectionTop - stripHeight - barHeight), behavior: 'smooth' });
    } else {
      isProgrammaticScrollRef.current = false;
    }
  };

  // Highlight Workflow Steps based on which section is in view while scrolling
  useEffect(() => {
    const sectionIds = ['overview', 'commission', 'disbursements'] as const;

    const updateActiveFromScroll = () => {
      if (isProgrammaticScrollRef.current) return;

      // A section counts as in view once its top passes the pinned search strip.
      const strip = document.getElementById('transaction-detail-header');
      const activationOffset = (strip ? strip.getBoundingClientRect().bottom : 120) + 16;
      let current: (typeof sectionIds)[number] = 'overview';

      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top - activationOffset <= 0) {
          current = id;
        }
      }
      // Payments is short, so its top can never reach the strip. The bottom of the page selects it.
      const atBottom = window.scrollY > 0
        && Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 2;
      if (atBottom && document.getElementById('disbursements')) current = 'disbursements';

      setActiveTab((prev) => (prev === current ? prev : current));
    };

    window.addEventListener('scroll', updateActiveFromScroll, { passive: true });
    window.addEventListener('resize', updateActiveFromScroll);
    updateActiveFromScroll();

    return () => {
      window.removeEventListener('scroll', updateActiveFromScroll);
      window.removeEventListener('resize', updateActiveFromScroll);
    };
  }, []);

  const [dealId, setDealId] = useState('');
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [selectedDealId, setSelectedDealId] = useState('');
  const [dealNotFound, setDealNotFound] = useState(false);


  useEffect(() => {
    scrolledSectionRef.current = null;
    const section = sectionFromLocation();
    if (section) {
      writeSectionHash(section);
      return;
    }
    window.scrollTo(0, 0);
  }, [routeId]);

  useEffect(() => {
    if (isNewTransaction || dealNotFound || selectedDealId !== routeId) return;
    const hash = sectionFromLocation();
    if (!hash) return;
    writeSectionHash(hash);
    const token = `${routeId}#${hash}`;
    if (scrolledSectionRef.current === token) return;
    setActiveTab(hash);
    isProgrammaticScrollRef.current = true;

    let settled = false;
    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      const el = document.getElementById(hash);
      el?.scrollIntoView({ behavior: 'auto', block: 'start' });
      const top = el?.getBoundingClientRect().top ?? 999;
      if ((top >= -4 && top < 80) || attempts > 20) {
        window.clearInterval(interval);
        settled = true;
        scrolledSectionRef.current = token;
        window.setTimeout(() => {
          isProgrammaticScrollRef.current = false;
        }, 200);
      }
    }, 100);

    return () => {
      window.clearInterval(interval);
      if (!settled) isProgrammaticScrollRef.current = false;
    };
  }, [routeId, isNewTransaction, dealNotFound, selectedDealId]);

  useEffect(() => {
    if (!isDropdownOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        swallowNextClick();
        setIsDropdownOpen(false);
        if (selectedDeal) {
          setSearchQuery(transactionSearchLabel(selectedDeal));
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedDeal, isDropdownOpen]);

  // Dynamic search filtering & relevance ranking for transactions combobox
  const filteredDeals = useMemo(() => {
    if (!savedDeals || savedDeals.length === 0) return [];

    const currentDealLabel = selectedDeal ? transactionSearchLabel(selectedDeal) : '';

    const trimmed = searchQuery.trim();

    // If query is blank or exact active deal label, show all saved deals
    if (!trimmed || trimmed.toLowerCase() === currentDealLabel.trim().toLowerCase()) {
      return savedDeals;
    }

    const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);

    // Filter deals where every token matches at least one field in the deal
    const matched = savedDeals.filter((deal) => {
      if (!deal) return false;

      const idStr = String(deal.id || '').toLowerCase();
      const addrStr = String(deal.property_address || '').toLowerCase();
      const clientStr = String(deal.client_name || '').toLowerCase();
      const agentStr = String(deal.primary_agent || deal.agent_name || deal.agent_id || '').toLowerCase();
      const tenantStr = String(deal.client_id || '').toLowerCase();
      const leadStr = String(deal.lead_source || '').toLowerCase();
      const statusStr = String(deal.transaction_status || deal.status || '').toLowerCase();
      const sideStr = String(deal.transaction_side || '').toLowerCase();
      const priceStr = deal.sales_price != null ? `$${Number(deal.sales_price).toLocaleString()} ${deal.sales_price}`.toLowerCase() : '';

      const combined = `${tenantStr} ${idStr} ${addrStr} ${sideStr} ${clientStr} ${agentStr} ${leadStr} ${statusStr} ${priceStr}`;

      return tokens.every((token) => combined.includes(token));
    });

    // Rank matched deals by address / ID relevance
    const queryLower = trimmed.toLowerCase();
    return matched.sort((a, b) => {
      const addrA = String(a.property_address || '').toLowerCase();
      const addrB = String(b.property_address || '').toLowerCase();
      const idA = String(a.id || '').toLowerCase();
      const idB = String(b.id || '').toLowerCase();

      // 1. Exact match on address
      const aExactAddr = addrA === queryLower;
      const bExactAddr = addrB === queryLower;
      if (aExactAddr && !bExactAddr) return -1;
      if (!aExactAddr && bExactAddr) return 1;

      // 2. Full query in property address
      const aHasFullAddr = addrA.includes(queryLower);
      const bHasFullAddr = addrB.includes(queryLower);
      if (aHasFullAddr && !bHasFullAddr) return -1;
      if (!aHasFullAddr && bHasFullAddr) return 1;

      // 3. Address starts with query
      const aStartsAddr = addrA.startsWith(queryLower);
      const bStartsAddr = addrB.startsWith(queryLower);
      if (aStartsAddr && !bStartsAddr) return -1;
      if (!aStartsAddr && bStartsAddr) return 1;

      // 4. ID starts with query
      const aStartsId = idA.startsWith(queryLower);
      const bStartsId = idB.startsWith(queryLower);
      if (aStartsId && !bStartsId) return -1;
      if (!aStartsId && bStartsId) return 1;

      return 0;
    });
  }, [savedDeals, searchQuery, selectedDeal]);
  
  // Real Overview State Variables
  const [propertyAddress, setPropertyAddress] = useState('');
  const [clientName, setClientName] = useState('');
  const [primaryAgent, setPrimaryAgent] = useState('');
  const [clientType, setClientType] = useState('');
  const [closingDate, setClosingDate] = useState('');
  const [listDate, setListDate] = useState('');
  const [acceptanceDate, setAcceptanceDate] = useState('');
  const [leadSource, setLeadSource] = useState('');
  
  // Dynamic Initial State Defaults (No hardcoded 1M / 0.03)
  const [salesPrice, setSalesPrice] = useState(0);
  const [gciPerc, setGciPerc] = useState(0);
  const [gciType, setGciType] = useState('PERCENTAGE');

  const [isAddAgentModalOpen, setIsAddAgentModalOpen] = useState(false);
  const [agentPickerSearch, setAgentPickerSearch] = useState('');

  const [offTheTopRules, setOffTheTopRules] = useState<DynamicRule[]>([]);
  const [preSplitRules, setPreSplitRules] = useState<DynamicRule[]>([]);
  const [postSplitRulesByAgent, setPostSplitRulesByAgent] = useState<Record<string, DynamicRule[]>>({});
  const [postSplit2RulesByAgent, setPostSplit2RulesByAgent] = useState<Record<string, DynamicRule[]>>({});
  const [agents, setAgents] = useState<AgentConfig[]>([]);

  const [isEditingWaterfall, setIsEditingWaterfall] = useState(false);
  const [waterfallEditSnapshot, setWaterfallEditSnapshot] = useState<{
    agents: AgentConfig[];
    offTheTopRules: DynamicRule[];
    preSplitRules: DynamicRule[];
    postSplitRulesByAgent: Record<string, DynamicRule[]>;
    postSplit2RulesByAgent: Record<string, DynamicRule[]>;
    teamCapIds: string[] | null;
  } | null>(null);
  const [hasUnsavedLocalChanges, setHasUnsavedLocalChanges] = useState(false);
  const [waterfallResetPending, setWaterfallResetPending] = useState(false);
  const [allocatePromptOpen, setAllocatePromptOpen] = useState(false);
  const allocateAfterSaveRef = useRef<(() => void) | undefined>(undefined);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingTemplateSubmission, setPendingTemplateSubmission] = useState<TemplateSubmissionDraft | null>(null);
  const [selectedTeamCapIds, setSelectedTeamCapIds] = useState<string[] | null>(null);
  const [suspendCapAutoSave, setSuspendCapAutoSave] = useState(false);
  const [templateSubmissionRevision, setTemplateSubmissionRevision] = useState(0);
  const [templateReplayReset, setTemplateReplayReset] = useState(0);
  const pendingTemplateSubmissionRef = useRef<TemplateSubmissionDraft | null>(null);
  const storedTemplateSubmissionRef = useRef<TemplateSubmissionDraft | null>(null);
  const savedTeamCapIdsRef = useRef<string[] | null>(null);
  const teamCapsClearedRef = useRef(false);
  const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  type CapOverrideRow = { agentId: string; kind: 'team_cap' | 'sales_volume'; amount: number; teamCapId: string | null };
  const capOverrideActions = useRef({
    baseline: null as CapOverrideRow[] | null,
    current: [] as CapOverrideRow[],
    replace: (_rows: CapOverrideRow[]) => {},
    setBaseline: (_rows: CapOverrideRow[] | null) => {},
  });

  const cloneWaterfallRules = (rules: DynamicRule[]) => rules.map((r) => ({ ...r }));
  const rulesNamed = (map: Record<string, DynamicRule[]> | undefined, name: string) => {
    if (!map) return [];
    if (map[name]) return map[name];
    const key = name.trim().toLowerCase();
    return Object.entries(map).find(([agent]) => agent.trim().toLowerCase() === key)?.[1] || [];
  };
  const withRuleChange = (
    current: Record<string, DynamicRule[]>,
    display: Record<string, DynamicRule[]> | undefined,
    name: string,
    id: string,
    change: (rule: DynamicRule) => DynamicRule,
  ) => {
    const rules = current[name] || [];
    if (rules.some((rule) => rule.id === id)) {
      return { ...current, [name]: rules.map((rule) => rule.id === id ? change(rule) : rule) };
    }
    const source = rulesNamed(display, name).find((rule) => rule.id === id);
    if (!source) return current;
    return { ...current, [name]: [...rules, change({ ...source })] };
  };
  const cloneWaterfallRulesByAgent = (map: Record<string, DynamicRule[]>) =>
    Object.fromEntries(Object.entries(map).map(([k, rules]) => [k, cloneWaterfallRules(rules)]));

  const sameTeamCapSelection = (left: string[] | null | undefined, right: string[] | null | undefined) => {
    if (left == null || right == null) return left == null && right == null;
    if (left.length !== right.length) return false;
    const rightIds = new Set(right);
    return left.every((id) => rightIds.has(id));
  };

  const holdCapAutoSave = (ids: string[] | null) => {
    setSuspendCapAutoSave(teamCapsClearedRef.current || !sameTeamCapSelection(ids, savedTeamCapIdsRef.current));
  };

  const handleStartWaterfallEdit = () => {
    clearCommissionModuleCache();
    void reloadAgents();
    setWaterfallEditSnapshot({
      agents: agents.map((a) => ({ ...a })),
      offTheTopRules: cloneWaterfallRules(offTheTopRules),
      preSplitRules: cloneWaterfallRules(preSplitRules),
      postSplitRulesByAgent: cloneWaterfallRulesByAgent(postSplitRulesByAgent),
      postSplit2RulesByAgent: cloneWaterfallRulesByAgent(postSplit2RulesByAgent),
      teamCapIds: selectedTeamCapIds ? [...selectedTeamCapIds] : null,
    });
    capOverrideActions.current.setBaseline(capOverrideActions.current.current.map((row) => ({ ...row })));
    setIsEditingWaterfall(true);
  };

  const handleCancelWaterfallEdit = () => {
    clearCommissionModuleCache();
    const restoredCaps = waterfallEditSnapshot ? waterfallEditSnapshot.teamCapIds : selectedTeamCapIds;
    if (waterfallEditSnapshot) {
      setAgents(waterfallEditSnapshot.agents.map((a) => ({ ...a })));
      setOffTheTopRules(cloneWaterfallRules(waterfallEditSnapshot.offTheTopRules));
      setPreSplitRules(cloneWaterfallRules(waterfallEditSnapshot.preSplitRules));
      setPostSplitRulesByAgent(cloneWaterfallRulesByAgent(waterfallEditSnapshot.postSplitRulesByAgent));
      setPostSplit2RulesByAgent(cloneWaterfallRulesByAgent(waterfallEditSnapshot.postSplit2RulesByAgent));
      setSelectedTeamCapIds(waterfallEditSnapshot.teamCapIds);
    }
    if (capOverrideActions.current.baseline) capOverrideActions.current.replace(capOverrideActions.current.baseline);
    capOverrideActions.current.setBaseline(null);
    holdCapAutoSave(restoredCaps);
    setWaterfallEditSnapshot(null);
    setIsEditingWaterfall(false);
    setIsAddAgentModalOpen(false);
  };

  const waterfallHasEdits = () => {
    if (!waterfallEditSnapshot) return false;
    const currentWaterfall = {
      agents,
      offTheTopRules,
      preSplitRules,
      postSplitRulesByAgent,
      postSplit2RulesByAgent,
    };
    return JSON.stringify(waterfallEditSnapshot) !== JSON.stringify(currentWaterfall);
  };

  const handleApplyWaterfallEdit = () => {
    clearCommissionModuleCache();
    const unchanged = !waterfallHasEdits();
    const baseline = capOverrideActions.current.baseline;
    const capChanged = baseline != null && !sameAllocationOverrides(capOverrideActions.current.current, baseline);
    const selectionChanged = waterfallEditSnapshot != null && !sameTeamCapSelection(waterfallEditSnapshot.teamCapIds, selectedTeamCapIds);

    setWaterfallEditSnapshot(null);
    capOverrideActions.current.setBaseline(null);
    setIsEditingWaterfall(false);
    setIsAddAgentModalOpen(false);
    if (selectionChanged && selectedTeamCapIds) stageTeamCapSelection(selectedTeamCapIds);
    holdCapAutoSave(selectedTeamCapIds);
    if (unchanged && !capChanged && !selectionChanged) return;

    // Local apply only — DB persistence happens via Save Transaction
    setHasUnsavedLocalChanges(true);
  };

  const releaseTeamCapClear = () => {
    teamCapsClearedRef.current = false;
    setSuspendCapAutoSave(false);
  };

  const rememberStoredSubmission = (submission: TemplateSubmissionDraft | null) => {
    storedTemplateSubmissionRef.current = submission;
    savedTeamCapIdsRef.current = submission ? readTeamCapSelection(submission.submitted_parameters) : null;
    if (teamCapsClearedRef.current) stageClearedTeamCaps();
  };

  const handleTeamCapSelection = (ids: string[] | null) => {
    if (teamCapsClearedRef.current) return;
    setSelectedTeamCapIds(ids);
  };

  function stageTeamCapSelection(ids: string[]) {
    const pending = pendingTemplateSubmissionRef.current;
    const source = pending ?? storedTemplateSubmissionRef.current;
    if (!source?.template_id) return;
    const recorded = readTeamCapSelection(source.submitted_parameters);
    if (sameTeamCapSelection(recorded, ids)) return;
    const next: TemplateSubmissionDraft = {
      ...source,
      submitted_parameters: writeTeamCapSelection({ ...source.submitted_parameters }, ids),
      team_cap_ids: ids,
      ...(ids.length === 0 ? { team_cap_recipients: [] } : {}),
    };
    pendingTemplateSubmissionRef.current = next;
    setPendingTemplateSubmission(next);
  }

  function stageClearedTeamCaps() {
    stageTeamCapSelection([]);
  }

  const handleApplyTemplateRules = (applied: AppliedTemplateRules, submission?: TemplateSubmissionDraft) => {
    releaseTeamCapClear();
    const nextOff = applied.offTheTopRules ?? [];
    const nextPre = applied.preSplitRules ?? [];
    const nextPost = applied.postSplitRulesByAgent ?? {};
    const nextPost2 = applied.postSplit2RulesByAgent ?? {};
    const templateSplits = applied.agentSplits ?? [];
    const namesMatch = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();
    const orderedSplits = templateSplits;
    const primary = agents[0]?.name?.trim() ? agents[0] : null;
    const seen = new Set<string>();
    const agentNames = (orderedSplits.length > 0
      ? [...orderedSplits.map((split) => split.name), ...Object.keys(nextPost), ...Object.keys(nextPost2)]
      : [
          ...(primary ? [primary.name] : []),
          ...Object.keys(nextPost),
          ...Object.keys(nextPost2),
        ]
    ).filter((name) => {
      const key = name.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const templateAgents: AgentConfig[] = agentNames.map((name) => {
      const known = knownAgents.find((agent) => namesMatch(agent.name, name));
      const previous = agents.find((agent) => namesMatch(agent.name, name));
      const split = orderedSplits.find((item) => namesMatch(item.name, name));
      const keptPrimary = orderedSplits.length === 0 && primary && namesMatch(primary.name, name) ? primary : null;
      return {
        id: known?.id || previous?.id || `AGT_${name.trim()}`,
        name: known?.name || previous?.name || name.trim(),
        isTeamLead: known?.isTeamLead ?? previous?.isTeamLead ?? false,
        splitType: split?.splitType ?? keptPrimary?.splitType ?? 'PERCENT',
        splitVal: split?.splitVal ?? keptPrimary?.splitVal ?? 0,
        brokerCapLimit: 0,
        brokerCapPaidYTD: 0,
        riskCapLimit: 0,
        riskPaidYTD: 0,
      };
    });
    const primaryIndex = templateAgents.findIndex((agent) => isPrimaryAgent(agent, primaryAgentId));
    const orderedAgents = primaryIndex > 0
      ? [templateAgents[primaryIndex], ...templateAgents.filter((_, index) => index !== primaryIndex)]
      : templateAgents;
    const chosenCapIds = submission?.team_cap_ids ?? null;
    const nextAgents = chosenCapIds == null ? orderedAgents : [
      ...orderedAgents,
      ...(submission?.team_cap_recipients ?? []).flatMap((recipient) => {
        if (orderedAgents.some((agent) => agent.id === recipient.id)) return [];
        return [{
          id: recipient.id,
          name: recipient.name,
          isTeamLead: Boolean(recipient.isTeamLead),
          splitType: 'PERCENT' as const,
          splitVal: 0,
          brokerCapLimit: 0,
          brokerCapPaidYTD: 0,
          riskCapLimit: 0,
          riskPaidYTD: 0,
        }];
      }),
    ];

    const changed =
      JSON.stringify(nextOff) !== JSON.stringify(offTheTopRules) ||
      JSON.stringify(nextPre) !== JSON.stringify(preSplitRules) ||
      JSON.stringify(nextPost) !== JSON.stringify(postSplitRulesByAgent) ||
      JSON.stringify(nextPost2) !== JSON.stringify(postSplit2RulesByAgent) ||
      JSON.stringify(nextAgents) !== JSON.stringify(agents);

    setOffTheTopRules(nextOff);
    setPreSplitRules(nextPre);
    setPostSplitRulesByAgent(nextPost);
    setPostSplit2RulesByAgent(nextPost2);
    setAgents(nextAgents);
    setWaterfallEditSnapshot(null);
    setIsEditingWaterfall(false);
    setIsAddAgentModalOpen(false);
    if (submission) {
      pendingTemplateSubmissionRef.current = submission;
      setPendingTemplateSubmission(submission);
      if (submission.team_cap_ids) setSelectedTeamCapIds(submission.team_cap_ids);
      setHasUnsavedLocalChanges(true);
    } else if (changed) {
      setHasUnsavedLocalChanges(true);
    }
    scrollToSectionAfterModal('commission');
  };

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isRevertModalOpen, setIsRevertModalOpen] = useState(false);
  const [transferInfo, setTransferInfo] = useState<{
    formerAgent: string;
    newAgent: KnownAgentInfo;
    proceedApply: () => void;
    splitType: 'PERCENT' | 'AMOUNT';
    splitVal: number;
  } | null>(null);

  const handleRequestOverviewApply = (proceedWithApply: () => void, currentFormValues?: Record<string, any>) => {
    const proceedAndMarkDirty = () => {
      proceedWithApply();
      setHasUnsavedLocalChanges(true);
    };

    // 1. Identify former primary agent
    const formerAgentName = agents.find((agent) => isPrimaryAgent(agent, primaryAgentId))?.name || primaryAgent || '';

    // 2. Identify new primary agent from form values
    const formVals = currentFormValues || overviewForm.overviewFormValues;
    const newAgentRaw = formVals.agent_id ?? formVals.primary_agent;
    const matchedNewAgent = knownAgents.find(
      (a) => a.id === newAgentRaw || a.name.toLowerCase() === String(newAgentRaw || '').trim().toLowerCase()
    );
    const newAgentName = matchedNewAgent ? matchedNewAgent.name : String(newAgentRaw || '').trim();

    const hasFormer = Boolean(formerAgentName && formerAgentName.trim() !== '');
    const hasNew = Boolean(newAgentName && newAgentName.trim() !== '');
    const isChanged = hasFormer && hasNew && (formerAgentName.trim().toLowerCase() !== newAgentName.trim().toLowerCase());

    if (isChanged) {
      const resolvedNewAgentInfo: KnownAgentInfo = matchedNewAgent || {
        id: `AGT_${newAgentName}`,
        name: newAgentName,
        isTeamLead: false,
      };

      const formerAgent = agents.find((agent) => agent.name.trim().toLowerCase() === formerAgentName.trim().toLowerCase());
      const formerSplit = (dealResult.agentSplitItems || []).find((item: { agentId?: string; agentName?: string; amount?: number }) =>
        item.agentId === formerAgent?.id || item.agentName === formerAgentName
      );
      const splitType = formerAgent?.splitType === 'AMOUNT' ? 'AMOUNT' : 'PERCENT';
      const splitVal = splitType === 'AMOUNT'
        ? roundCurrency(Number(formerSplit?.amount ?? formerAgent?.splitVal ?? 0))
        : Number(formerAgent?.splitVal ?? 0);
      setTransferInfo({
        formerAgent: formerAgentName,
        newAgent: resolvedNewAgentInfo,
        proceedApply: proceedAndMarkDirty,
        splitType,
        splitVal,
      });
      setIsTransferModalOpen(true);
    } else {
      // If no former agent existed (e.g. brand new transaction), but now new agent is selected:
      if (!hasFormer && hasNew) {
        const resolvedNewAgentInfo: KnownAgentInfo = matchedNewAgent || {
          id: `AGT_${newAgentName}`,
          name: newAgentName,
          isTeamLead: false,
        };
        setAgents([
          {
            id: resolvedNewAgentInfo.id,
            name: resolvedNewAgentInfo.name,
            isTeamLead: resolvedNewAgentInfo.isTeamLead,
            splitType: 'PERCENT',
            splitVal: 1.0,
            brokerCapLimit: 0,
            brokerCapPaidYTD: 0,
            riskCapLimit: 0,
            riskPaidYTD: 0,
          },
        ]);
        setPrimaryAgent(resolvedNewAgentInfo.name);
      }
      proceedAndMarkDirty();
    }
  };

  const overviewForm = useOverviewForm({
    overviewFields,
    selectedDeal,
    dealId,
    gciType,
    setGciType,
    gciPerc,
    setGciPerc,
    salesPrice,
    setSalesPrice,
    setPropertyAddress,
    setClientName,
    setPrimaryAgent,
    setClientType,
    setClosingDate,
    setAcceptanceDate,
    setListDate,
    setLeadSource,
    setSelectedDeal,
    grossCommission: roundCurrency(salesPrice * gciPerc),
    totalCommission: Number(selectedDeal?.total_commission) || roundCurrency(salesPrice * gciPerc),
    onRequestApply: handleRequestOverviewApply,
  });

  const handleConfirmTransfer = () => {
    if (!transferInfo) return;
    const { formerAgent, newAgent, proceedApply, splitType, splitVal } = transferInfo;

    // Replace the former primary wherever they sit. The form's agent is already the new
    // person, so the lookup has to use the name captured when the dialog opened.
    // An amount split moves across as that same dollar amount.
    setAgents((prev) => {
      const replacement: AgentConfig = {
        id: newAgent.id,
        name: newAgent.name,
        isTeamLead: newAgent.isTeamLead,
        splitType,
        splitVal,
        brokerCapLimit: 0,
        brokerCapPaidYTD: 0,
        riskCapLimit: 0,
        riskPaidYTD: 0,
      };
      const formerKey = formerAgent.trim().toLowerCase();
      const primaryIndex = prev.findIndex((agent) => agent.name.trim().toLowerCase() === formerKey);
      if (prev.length === 0 || primaryIndex < 0) return [replacement];
      return prev
        .map((agent, index) => index === primaryIndex ? { ...replacement, brokerCapLimit: agent.brokerCapLimit, brokerCapPaidYTD: agent.brokerCapPaidYTD, riskCapLimit: agent.riskCapLimit, riskPaidYTD: agent.riskPaidYTD } : agent)
        .filter((agent, index) => index === primaryIndex || agent.name.toLowerCase() !== newAgent.name.toLowerCase());
    });

    // 2. Transfer Level 1 post-splits from formerAgent to newAgent
    setPostSplitRulesByAgent((prev) => {
      const next = { ...prev };
      if (next[formerAgent]) {
        next[newAgent.name] = next[formerAgent];
        delete next[formerAgent];
      }
      return next;
    });

    // 3. Transfer Level 2 post-splits from formerAgent to newAgent
    setPostSplit2RulesByAgent((prev) => {
      const next = { ...prev };
      if (next[formerAgent]) {
        next[newAgent.name] = next[formerAgent];
        delete next[formerAgent];
      }
      return next;
    });

    // 4. Update primaryAgent in page state
    setPrimaryAgent(newAgent.name);

    // 5. Apply the overview changes and exit edit mode
    proceedApply();

    // 6. Close transfer modal & clear transferInfo
    setIsTransferModalOpen(false);
    showToast(`Primary Agent updated to ${newAgent.name}. Splits & deductions transferred successfully.`, 'success');
  };

  const handleCancelTransfer = () => {
    // "If the user doesn't confirm the popup, they should be asked if they want to revert the Primary Agent to the previous one (in case they changed it by accident)."
    setIsTransferModalOpen(false);
    setIsRevertModalOpen(true);
  };

  const handleRevertYes = () => {
    // "If they answer Yes, they will be back in Edit Mode for the Transaction Overview and the Primary Agent will be set again to the Primary Agent that was there before the user started editing the Transaction Overview."
    overviewForm.revertPrimaryAgentToInitial();
    setIsRevertModalOpen(false);
    showToast(`Primary Agent reverted back to ${transferInfo?.formerAgent || 'previous agent'}.`, 'info');
  };

  const handleRevertNo = () => {
    // "If they answer No to this popup, they will be back in Edit mode for the Transaction Overview."
    setIsRevertModalOpen(false);
  };

  const primaryAgentId = resolvePrimaryAgentId(
    overviewForm.overviewFormValues?.agent_id || selectedDeal?.agent_id || primaryAgent,
    commissionItems,
    knownAgents,
  );

  // The session's client is known before the deal list loads. Requests wait for it rather than
  // going out for another client first.
  const activeClientId = String(selectedDeal?.client_id || access?.clientId || '');
  const allocationFieldTypes = useMemo(
    () => Object.fromEntries(overviewFields.map((field) => [field.key, field.type])),
    [overviewFields],
  );
  const allocationDeal = { ...(selectedDeal || {}), ...(overviewForm.overviewFormValues || {}) };
  const allocationDate = String(overviewForm.overviewFormValues?.closing_date || closingDate || '').substring(0, 10) || null;
  const {
    ready: allocationReady,
    settled: allocationSettled,
    input: allocationInput,
    hasStoredRows: hasStoredAllocations,
    overrides: capOverrides,
    agentCapCells,
    setTeamCapOverride,
    replaceOverrides,
    restoreLoadedOverrides,
    commitOverrides,
  } = useAgentAllocationInput({
    clientId: activeClientId,
    transactionId: selectedDeal?.id || (!isNewTransaction ? routeId : ''),
    agents,
    knownAgents,
    deal: allocationDeal,
    dealDate: allocationDate,
    salesPrice: overviewForm.isEditingOverview ? (Number(overviewForm.overviewFormValues.sales_price) || salesPrice) : salesPrice,
    fieldTypes: allocationFieldTypes,
  });
  const [capOverrideBaseline, setCapOverrideBaseline] = useState<typeof capOverrides | null>(null);
  capOverrideActions.current = {
    baseline: capOverrideBaseline,
    current: capOverrides,
    replace: replaceOverrides,
    setBaseline: setCapOverrideBaseline,
  };

  const allocationForWaterfall = useMemo(() => {
    if (!allocationInput) return null;
    return { ...allocationInput, selectedTeamCapIds };
  }, [allocationInput, selectedTeamCapIds]);

  const handleRemoveTeamCap = (teamCapId: string) => {
    const removedId = teamCapId.trim();
    if (!removedId) return;
    const qualifyingIds = qualifyingTeamCaps(
      allocationInput?.teamCaps ?? [],
      allocationDeal,
      allocationFieldTypes,
    ).map((cap) => cap.id);
    const current = selectedTeamCapIds == null ? qualifyingIds : selectedTeamCapIds;
    if (!current.includes(removedId) && selectedTeamCapIds != null) return;
    setSelectedTeamCapIds(current.filter((id) => id !== removedId));
    capOverrideActions.current.replace(
      capOverrideActions.current.current.filter((row) => !(row.kind === 'team_cap' && (row.teamCapId || '') === removedId)),
    );
    setSuspendCapAutoSave(true);
  };

  const { replay: templateReplay, settling: templateReplaySettling } = useSubmittedTemplateReplay({
    clientId: activeClientId,
    transactionId: selectedDeal?.id || (!isNewTransaction ? routeId : ''),
    entities: knownEntities,
    entitiesReady: entitiesLoaded,
    rosterAgents: knownAgents,
    pendingSubmission: pendingTemplateSubmission,
    revision: templateSubmissionRevision,
    reset: templateReplayReset,
  });

  const dealResult = useTransactionWaterfall({
    salesPrice: overviewForm.isEditingOverview ? (Number(overviewForm.overviewFormValues.sales_price) || salesPrice) : salesPrice,
    gciPerc: overviewForm.isEditingOverview ? (Number(overviewForm.overviewFormValues.gci_perc) || gciPerc) : gciPerc,
    offTheTopRules,
    preSplitRules,
    postSplitRulesByAgent,
    postSplit2RulesByAgent,
    agents,
    primaryAgentId,
    overviewFields,
    selectedDeal,
    overviewFormValues: overviewForm.overviewFormValues,
    clientType,
    allocation: allocationForWaterfall,
    templateReplay,
  });
  // Agents with a $0 split and no post-split to pay, such as a team cap recipient the cap does not pay on this deal.
  // They stay in the list while the waterfall is being edited, so a split can still be given to them.
  const idleAgentIds = new Set<string>(dealResult.idleAgentIds || []);
  const isIdleAgentItem = (item: { agentId?: string | null }) => Boolean(item.agentId && idleAgentIds.has(item.agentId));
  const waterfallAgents = isEditingWaterfall ? agents : agents.filter((agent) => !idleAgentIds.has(agent.id));
  // True until the deal, its submitted template, and its caps and allocations have loaded. The
  // waterfall computed before then is not final, so allocation auto-save waits for it.
  const commissionSettling = !isNewTransaction && (!selectedDeal || templateReplaySettling || !allocationSettled);
  // What the screen waits for is less: the replay of the submitted template (which needs the whole
  // commission ledger) only changes the amounts shown when a team cap moved money on this deal.
  // Otherwise the stored waterfall shows as soon as the deal and its caps and allocations load, and
  // the replay only updates the template button.
  const displaySettling = !isNewTransaction && (!selectedDeal || !allocationSettled || (templateReplaySettling && Boolean(dealResult.capMovedMoney)));
  const showCommissionCalculating = displaySettling && !isEditingWaterfall && !overviewForm.isEditingOverview;

  type AllocationSaveRow = {
    agentId: string;
    kind: string;
    amount: number;
    calculatedAmount: number;
    isOverride: boolean;
    periodStart: string | null;
    teamCapId: string | null;
  };

  const allocationSaveKey = JSON.stringify((dealResult.allocationLines || [])
    .filter((line: { tracked?: boolean }) => line.tracked !== false)
    .map((line: { agent_id: string; kind: string; amount: number; calculated_amount: number; is_override: boolean; period_start: string | null; team_cap_id?: string | null }) => ({
      agentId: line.agent_id,
      kind: line.kind,
      amount: line.amount,
      calculatedAmount: line.calculated_amount,
      isOverride: line.is_override,
      periodStart: line.period_start,
      teamCapId: line.team_cap_id || null,
    })));
  const savedAllocationKey = useRef('');
  const allocationSaveKeyRef = useRef(allocationSaveKey);
  const allocationSaveTransactionRef = useRef('');
  const allocationWriteQueue = useRef(Promise.resolve());
  allocationSaveKeyRef.current = allocationSaveKey;

  const enqueueAllocationWrite = (task: () => Promise<boolean>) => {
    const run = allocationWriteQueue.current.then(task, task);
    allocationWriteQueue.current = run.then(() => undefined, () => undefined);
    return run;
  };

  const sendAllocationWrite = async (transactionId: string, clientId: string) => {
    const key = allocationSaveKeyRef.current;
    if (!transactionId || key === savedAllocationKey.current) return true;
    const rows = JSON.parse(key) as AllocationSaveRow[];
    const headers = { 'Content-Type': 'application/json', 'x-client-id': clientId };
    const [capsResponse, allocationsResponse] = await Promise.all([
      fetch('/api/transaction-team-caps', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          clientId,
          transactionId,
          teamCaps: rows.filter((row) => row.kind === 'team_cap'),
        }),
      }),
      fetch('/api/transaction-agent-allocations', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          clientId,
          transactionId,
          allocations: rows.filter((row) => row.kind === 'sales_volume'),
        }),
      }),
    ]);
    const ok = capsResponse.ok && allocationsResponse.ok;
    if (ok && allocationSaveKeyRef.current === key) savedAllocationKey.current = key;
    return ok;
  };

  useEffect(() => {
    const transactionId = selectedDeal?.id ? String(selectedDeal.id) : '';
    if (allocationSaveTransactionRef.current !== transactionId) {
      allocationSaveTransactionRef.current = transactionId;
      savedAllocationKey.current = '';
    }
    const featuresOn = Boolean(allocationInput?.teamCaps.some((cap) => cap.enabled) || allocationInput?.salesVolume?.enabled);
    if (!allocationReady || !canWriteTracker || !transactionId || suspendCapAutoSave || commissionSettling) return;
    if (!featuresOn && !hasStoredAllocations) return;
    if (allocationSaveKey === savedAllocationKey.current) return;
    const timer = window.setTimeout(() => {
      const requestTransactionId = allocationSaveTransactionRef.current;
      if (!requestTransactionId) return;
      void enqueueAllocationWrite(() => sendAllocationWrite(requestTransactionId, activeClientId));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [allocationReady, allocationSaveKey, canWriteTracker, selectedDeal?.id, activeClientId, suspendCapAutoSave, hasStoredAllocations, commissionSettling]);

  useEffect(() => {
    if (isNewTransaction) {
      const freshId = generatePrefixedId('TXN');
      setDealId(freshId);
      setSelectedDealId(freshId);
      setDealNotFound(false);
      setSalesPrice(0);
      setGciPerc(0);
      setPropertyAddress('');
      setClientName('');
      setPrimaryAgent('');
      setClientType('');
      setClosingDate('');
      setListDate('');
      setAcceptanceDate('');
      setLeadSource('');
      setAgents([]);
      setOffTheTopRules([]);
      setPreSplitRules([]);
      setPostSplitRulesByAgent({});
      setPostSplit2RulesByAgent({});
      setIsEditingWaterfall(false);
      setWaterfallEditSnapshot(null);
      if (pendingTemplateSubmissionRef.current) {
        pendingTemplateSubmissionRef.current = null;
        setPendingTemplateSubmission(null);
        setTemplateSubmissionRevision((current) => current + 1);
        setTemplateReplayReset((current) => current + 1);
      }
      setHasUnsavedLocalChanges(false);
      setSearchQuery(`[NEW] ${freshId} — Draft Transaction`);
    } else if (routeId && savedDeals.length > 0 && commissionItemsDealId === routeId) {
      const matched = savedDeals.find((d) => d.id === routeId);

      if (!matched) {
        setDealNotFound(true);
        setSelectedDeal(null);
        return;
      }

      setDealNotFound(false);
      setSelectedDeal(matched);
      setSelectedDealId(matched.id);
      setDealId(matched.id);
      setIsEditingWaterfall(false);
      setWaterfallEditSnapshot(null);
      if (pendingTemplateSubmissionRef.current) {
        pendingTemplateSubmissionRef.current = null;
        setPendingTemplateSubmission(null);
        setTemplateSubmissionRevision((current) => current + 1);
        setTemplateReplayReset((current) => current + 1);
      }
      setHasUnsavedLocalChanges(false);
      
      setPropertyAddress(matched.property_address || '');
      setClientName(matched.client_name || '');
      const rawAgent = matched.agent_id || matched.primary_agent || '';
      const foundAgent = knownAgents.find(
        (a) => a.id === rawAgent || a.name.toLowerCase() === rawAgent.toLowerCase()
      );
      const agentDisplayName = foundAgent ? foundAgent.name : (matched.primary_agent || rawAgent);
      setPrimaryAgent(agentDisplayName);
      setClientType(matched.client_type || matched.deal_type || matched.transaction_side || '');
      setClosingDate(matched.closing_date ? matched.closing_date.substring(0, 10) : '');
      setAcceptanceDate(matched.acceptance_date ? matched.acceptance_date.substring(0, 10) : '');
      setListDate(matched.list_date ? matched.list_date.substring(0, 10) : '');
      setLeadSource(matched.lead_source || '');

      setSalesPrice(matched.sales_price ? Math.abs(Number(matched.sales_price)) : 0);
      setGciPerc(Number(matched.gci_perc) || 0);

      const waterfall = waterfallFromCommissionItems(
        commissionItems,
        knownAgents,
        knownEntities,
        foundAgent?.id || matched.agent_id || null,
      );
      setAgents(waterfall.agents);
      setOffTheTopRules(waterfall.offTheTopRules);
      setPreSplitRules(waterfall.preSplitRules);
      setPostSplitRulesByAgent(waterfall.postSplitRulesByAgent);
      setPostSplit2RulesByAgent(waterfall.postSplit2RulesByAgent);

      setSearchQuery(transactionSearchLabel(matched));
    }
  }, [routeId, isNewTransaction, savedDeals, knownAgents, knownEntities, commissionItems, commissionItemsDealId]);

  const KNOWN_DB_COLUMNS = new Set([
    'id', 'client_id', 'tms_id', 'transaction_status', 'finance_status',
    'transaction_side', 'property_address', 'client_name', 'lead_source',
    'lead_owner', 'list_price', 'sales_price', 'gci_type', 'gci_perc',
    'gci_amount', 'total_commission', 'transaction_fee', 'list_date',
    'acceptance_date', 'closing_date', 'agent_id', 'isa',
    'transaction_coordinator', 'co_broker',
    'address_details', 'notes', 'archived', 'created_at', 'created_by',
    'updated_at', 'updated_by'
  ]);

  const agentSplitExcess = Number(dealResult.agentSplitExcess) || 0;
  const agentSplitsExceedCommission = agentSplitExcess > 0.009;
  const commissionTotal = roundCurrency(Number(dealResult.totalCommission) || 0);
  const totalPayments = roundCurrency(
    Object.values(dealResult.netPayouts || {}).reduce((sum: number, amount) => sum + (Number(amount) || 0), 0),
  );
  // The whole commission has to be allocated only when a commission template applies. A deal
  // that qualifies for none, such as a cancelled one, is not expected to have payments.
  // The template button can judge the deal as soon as it is in the cached list, before this
  // transaction's commission lines finish loading and selectedDeal is set.
  const templateDeal = useMemo(
    () => selectedDeal ?? (routeId && !isNewTransaction ? savedDeals.find((deal) => deal.id === routeId) ?? null : null),
    [selectedDeal, routeId, isNewTransaction, savedDeals],
  );
  const qualificationDeal = useMemo(
    () => (selectedDeal ? { ...selectedDeal, ...(overviewForm.isEditingOverview ? overviewForm.overviewFormValues : {}) } : null),
    [selectedDeal, overviewForm.isEditingOverview, overviewForm.overviewFormValues],
  );
  const templateQualifies = useTemplateQualification(selectedDeal?.client_id, qualificationDeal);
  const paymentsShortOfCommission = templateQualifies !== false
    && commissionTotal > 0.009 && roundCurrency(commissionTotal - totalPayments) > 0.009;
  const saveBlocked = agentSplitsExceedCommission || paymentsShortOfCommission;
  const saveBlockedReason = [
    agentSplitsExceedCommission ? 'Agent splits are more than the remaining commission.' : '',
    paymentsShortOfCommission ? 'The entire commission has to be allocated among agents and entities.' : '',
  ].filter(Boolean).join(' ');

  const persistDealAllocations = (transactionId: string): Promise<boolean> => {
    const featuresOn = Boolean(allocationInput?.teamCaps.some((cap) => cap.enabled) || allocationInput?.salesVolume?.enabled);
    if (!allocationReady || !canWriteTracker || !transactionId) return Promise.resolve(true);
    if (!featuresOn && !hasStoredAllocations) return Promise.resolve(true);
    return enqueueAllocationWrite(() => sendAllocationWrite(transactionId, activeClientId));
  };

  const handleSave = (afterSaveSuccess?: () => void, options?: { decided?: boolean; omitPayments?: boolean }) => {
    if (agentSplitsExceedCommission) {
      showToast('Agent splits are more than the remaining commission, so this transaction cannot be saved.', 'error');
      return;
    }
    if (paymentsShortOfCommission) {
      showToast('This transaction cannot be saved until the entire commission is allocated among agents and entities.', 'error');
      return;
    }
    if (!activeClientId && !isNewTransaction) {
      showToast('Cannot save transaction: missing active client ID.', 'error');
      return;
    }

    const rulesEmpty = offTheTopRules.length === 0
      && preSplitRules.length === 0
      && Object.values(postSplitRulesByAgent).every((rules) => rules.length === 0)
      && Object.values(postSplit2RulesByAgent).every((rules) => rules.length === 0);
    const clearedWaterfall = rulesEmpty && (
      agents.length === 0
      || (agents.length === 1 && agents[0].splitType === 'PERCENT' && Number(agents[0].splitVal) === 1)
    );
    let omitPayments = Boolean(options?.omitPayments);
    if (!options?.decided && waterfallResetPending) {
      // A deal that qualifies for no template keeps no payments, so there is nothing to ask.
      if (clearedWaterfall && templateQualifies === false) {
        omitPayments = true;
      } else if (clearedWaterfall) {
        allocateAfterSaveRef.current = afterSaveSuccess;
        setAllocatePromptOpen(true);
        return;
      }
      setWaterfallResetPending(false);
    }

    const form = overviewForm.overviewFormValues;

    // 🔍 LOG 1: Check what the form hook contains
    console.log('--- SAVE STEP 1: FORM VALUES ---', {
        form_list_date: form.list_date,
        form_acceptance_date: form.acceptance_date,
        form_list_price: form.list_price,
    });

    const coreDbFields: Record<string, any> = {
      id: dealId,
      client_id: activeClientId || null,
      tms_id: form.tms_id ?? selectedDeal?.tms_id ?? null,
      transaction_status: form.transaction_status ?? selectedDeal?.transaction_status ?? null,
      finance_status: form.finance_status ?? selectedDeal?.finance_status ?? null,
      transaction_side: form.transaction_side ?? form.client_type ?? clientType ?? null,
      property_address: form.property_address ?? propertyAddress ?? null,
      client_name: form.client_name ?? clientName ?? null,
      lead_source: form.lead_source ?? leadSource ?? null,
      lead_owner: form.lead_owner ?? selectedDeal?.lead_owner ?? null,
      list_price: form.list_price !== undefined && form.list_price !== '' ? Number(form.list_price) : (selectedDeal?.list_price ?? null),
      sales_price: salesPrice,
      gci_type: gciType,
      gci_perc: gciPerc,
      gci_amount: dealResult.grossCommission,
      total_commission: dealResult.totalCommission,
      transaction_fee: form.transaction_fee !== undefined && form.transaction_fee !== '' ? Number(form.transaction_fee) : (selectedDeal?.transaction_fee ?? null),
      list_date: form.list_date ?? listDate ?? null,
      acceptance_date: form.acceptance_date ?? acceptanceDate ?? null,
      closing_date: form.closing_date ?? closingDate ?? null,
      agent_id: (() => {
        const formAgent = form.agent_id;
        const resolved =
          knownAgents.find(
            (a) =>
              a.id === formAgent ||
              a.name.toLowerCase() === String(formAgent || '').toLowerCase() ||
              a.name.toLowerCase() === String(primaryAgent || '').toLowerCase() ||
              a.id === primaryAgent
          ) ||
          null;
        return resolved?.id || formAgent || selectedDeal?.agent_id || primaryAgentId || null;
      })(),
      isa: form.isa ? (Array.isArray(form.isa) ? form.isa : [form.isa]) : (selectedDeal?.isa ?? null),
      transaction_coordinator: form.transaction_coordinator ? (Array.isArray(form.transaction_coordinator) ? form.transaction_coordinator : [form.transaction_coordinator]) : (selectedDeal?.transaction_coordinator ?? null),
      co_broker: form.co_broker ?? selectedDeal?.co_broker ?? null,
      address_details: form.address_details ?? selectedDeal?.address_details ?? null,
      notes: form.notes ?? selectedDeal?.notes ?? null,
      archived: form.archived ?? selectedDeal?.archived ?? false,
    };

    const customAttrs: Record<string, any> = {
      ...(selectedDeal?.custom_attributes || {}),
    };

    // 🔍 LOG 2: Check payload sent to API
    console.log('--- SAVE STEP 2: OUTGOING PAYLOAD ---', {
        payload_list_date: coreDbFields.list_date,
        payload_acceptance_date: coreDbFields.acceptance_date,
        payload_list_price: coreDbFields.list_price,
    });

    Object.entries(form).forEach(([key, val]) => {
      if (!KNOWN_DB_COLUMNS.has(key)) {
        customAttrs[key] = val;
      }
    });

    // Build granular commission items from waterfall result
    const commissionItems = [
      ...dealResult.offTheTopItems.map((item: any, idx: number) => {
        const matchedEntity = knownEntities.find((e) => e.name === item.entity || e.id === item.entity);
        const splitType = item.type || 'PERCENT';
        const cleanVal = item.value !== undefined && item.value !== null
          ? (splitType === 'PERCENT'
              ? roundPercentRate(Number(item.value))
              : roundCurrency(Number(item.value)))
          : null;
        return {
          step_number: idx + 1,
          rule_name: item.entity || item.ruleName || 'Off-the-Top Deduction',
          section: 'OFF_THE_TOP',
          split_type: splitType,
          split_value: cleanVal,
          note: item.note || null,
          payee_type: 'ENTITY',
          payee_entity_id: matchedEntity?.id || null,
          agent_id: null,
          final_amount: item.amount,
        };
      }),
      ...(dealResult.preSplitItems || []).map((item: any, idx: number) => {
        const matchedEntity = knownEntities.find((e) => e.name === item.entity || e.id === item.entity);
        const splitType = item.type || 'PERCENT';
        const cleanVal = item.value !== undefined && item.value !== null
          ? (splitType === 'PERCENT'
              ? roundPercentRate(Number(item.value))
              : roundCurrency(Number(item.value)))
          : null;
        return {
          step_number: 10 + idx + 1,
          rule_name: item.entity || item.ruleName || 'Pre-Split Deduction',
          section: 'PRE_SPLIT',
          split_type: splitType,
          split_value: cleanVal,
          note: item.note || null,
          payee_type: 'ENTITY',
          payee_entity_id: matchedEntity?.id || null,
          agent_id: null,
          final_amount: item.amount,
        };
      }),
      ...dealResult.agentSplitItems.filter((item: any) => !isIdleAgentItem(item)).map((item: any, idx: number) => {
        const matchedAgent = knownAgents.find((a) => a.id === item.agentId || a.name === item.agentName);
        const splitType = item.splitType || 'PERCENT';
        let cleanSplitVal: number | null = null;

        if (splitType === 'PERCENT') {
          const raw = item.percent !== undefined && item.percent !== null
            ? item.percent
            : (item.splitVal !== undefined && item.splitVal !== null ? item.splitVal : null);
          cleanSplitVal = raw !== null ? roundPercentRate(Number(raw)) : null;
        } else {
          cleanSplitVal = item.splitVal !== undefined && item.splitVal !== null
            ? roundCurrency(Number(item.splitVal))
            : (item.amount !== undefined ? roundCurrency(Number(item.amount)) : null);
        }

        return {
          step_number: idx + 1,
          rule_name: `${item.agentName} Split`,
          section: 'AGENT_SPLIT',
          split_type: splitType,
          split_value: cleanSplitVal,
          note: null,
          payee_type: 'AGENT',
          payee_entity_id: null,
          agent_id: matchedAgent?.id || item.agentId || null,
          final_amount: item.amount,
        };
      }),
      ...dealResult.postSplitItems.filter((item: any) => !isIdleAgentItem(item)).map((item: any, idx: number) => {
        const matchedEntity = knownEntities.find((e) => e.name === item.entity || e.id === item.entity);
        const matchedAgent = knownAgents.find((a) => a.id === item.agentId || a.name === item.agentName);
        const splitType = item.type || 'PERCENT';
        const cleanVal = item.value !== undefined && item.value !== null
          ? (splitType === 'PERCENT'
              ? roundPercentRate(Number(item.value))
              : roundCurrency(Number(item.value)))
          : null;
        return {
          step_number: 30 + idx + 1,
          rule_name: item.entity || item.ruleName || 'Post-Split Deduction',
          section: 'POST_SPLIT',
          split_type: splitType,
          split_value: cleanVal,
          note: item.note || null,
          payee_type: item.entity === 'Broker' || item.entity === 'Brokerage' ? 'BROKERAGE' : 'ENTITY',
          payee_entity_id: matchedEntity?.id || null,
          agent_id: matchedAgent?.id || item.agentId || null,
          final_amount: item.amount,
        };
      }),
      ...(dealResult.postSplit2Items || []).filter((item: any) => !isIdleAgentItem(item)).map((item: any, idx: number) => {
        const matchedEntity = knownEntities.find((e) => e.name === item.entity || e.id === item.entity);
        const matchedAgent = knownAgents.find((a) => a.id === item.agentId || a.name === item.agentName);
        const splitType = item.type || 'PERCENT';
        const cleanVal = item.value !== undefined && item.value !== null
          ? (splitType === 'PERCENT'
              ? roundPercentRate(Number(item.value))
              : roundCurrency(Number(item.value)))
          : null;
        return {
          step_number: 50 + idx + 1,
          rule_name: item.entity || item.ruleName || 'Post-Split L2 Deduction',
          section: 'POST_SPLIT_L2',
          split_type: splitType,
          split_value: cleanVal,
          note: item.note || null,
          payee_type: 'ENTITY',
          payee_entity_id: matchedEntity?.id || null,
          agent_id: matchedAgent?.id || item.agentId || null,
          final_amount: item.amount,
        };
      }),
    ];

    // Build Final Disbursements & Payment Authorizations
    const currentAgentDisbursements = Object.entries(dealResult.netPayouts).filter(([e]) => agents.some((a) => a.name === e && !idleAgentIds.has(a.id))) as [string, number][];
    const currentEntityDisbursements = Object.entries(dealResult.netPayouts).filter(([e]) => !agents.some((a) => a.name === e)) as [string, number][];
    const primaryAgentName = agents.find((agent) => isPrimaryAgent(agent, primaryAgentId))?.name || (typeof primaryAgent === 'string' ? primaryAgent : '') || 'Primary Agent';

    const paymentItems = [
      ...currentAgentDisbursements.map(([agentName, amount]) => {
        const matchedAgent = knownAgents.find((a) => a.name === agentName || a.id === agentName);
        return {
          payee_type: 'AGENT',
          agent_id: matchedAgent?.id || null,
          payee_entity_id: null,
          amount_paid: amount,
          payment_method: 'ACH',
          payment_status: 'Ready to Pay',
          disbursement_type: 'AGENT_NET',
          notes: `${matchedAgent?.name || agentName} (Agent) - Primary: ${primaryAgentName}`,
          payment_date: coreDbFields.closing_date ? String(coreDbFields.closing_date).substring(0, 10) : new Date().toISOString().substring(0, 10),
        };
      }),
      ...currentEntityDisbursements.map(([entityName, amount]) => {
        const matchedEntity = knownEntities.find((e) => e.name === entityName || e.id === entityName);
        return {
          payee_type: entityName.toLowerCase().includes('broker') ? 'BROKERAGE' : 'ENTITY',
          agent_id: null,
          payee_entity_id: matchedEntity?.id || null,
          amount_paid: amount,
          payment_method: 'Escrow Wire',
          payment_status: 'Pending Escrow Wire',
          disbursement_type: 'THIRD_PARTY_DISBURSEMENT',
          notes: `${matchedEntity?.name || entityName} (Entity) - Primary: ${primaryAgentName}`,
          payment_date: coreDbFields.closing_date ? String(coreDbFields.closing_date).substring(0, 10) : new Date().toISOString().substring(0, 10),
        };
      }),
    ];

    if (teamCapsClearedRef.current) stageClearedTeamCaps();
    else if (selectedTeamCapIds && !sameTeamCapSelection(selectedTeamCapIds, savedTeamCapIdsRef.current)) stageTeamCapSelection(selectedTeamCapIds);
    const templateSubmission = pendingTemplateSubmissionRef.current;
    const payload = {
      ...coreDbFields,
      commission_items: omitPayments ? [] : commissionItems,
      payments: omitPayments ? [] : paymentItems,
      custom_attributes: customAttrs,
      ...(templateSubmission ? { template_submission: templateSubmission } : {}),
    };

    saveTransaction(payload, activeClientId, showToast, async (savedTxn, savedItems) => {
      // 🔍 LOG 3: Check what the backend returned
      console.log('--- SAVE STEP 3: API RESPONSE ---', {
        returned_list_date: savedTxn?.list_date,
        returned_acceptance_date: savedTxn?.acceptance_date,
        returned_list_price: savedTxn?.list_price,
      });

      if (!savedTxn) return;

      const capsSaved = await persistDealAllocations(String(savedTxn.id || (payload as any).id));
      if (!capsSaved) {
        showToast('The transaction was saved, but the team cap amounts were not. Save again to store them.', 'error');
        return false;
      }

      setWaterfallResetPending(false);
      setAllocatePromptOpen(false);
      releaseTeamCapClear();

      if (Array.isArray(savedItems)) {
        setCommissionItems(savedItems);
        setCommissionItemsDealId(savedTxn.id);
      }
      commitOverrides();

      setHasUnsavedLocalChanges(false);
      discardPendingTemplateSubmission('save');
      setSelectedDeal(savedTxn);
      setSavedDeals((current) => {
        const exists = current.some((deal) => deal.id === savedTxn.id);
        return exists ? current.map((deal) => (deal.id === savedTxn.id ? savedTxn : deal)) : [savedTxn, ...current];
      });

      if (savedTxn.list_date) setListDate(String(savedTxn.list_date).substring(0, 10));
      if (savedTxn.acceptance_date) setAcceptanceDate(String(savedTxn.acceptance_date).substring(0, 10));
      if (savedTxn.closing_date) setClosingDate(String(savedTxn.closing_date).substring(0, 10));
      if (savedTxn.property_address) setPropertyAddress(savedTxn.property_address);
      if (savedTxn.client_name) setClientName(savedTxn.client_name);
      if (savedTxn.lead_source) setLeadSource(savedTxn.lead_source);

      afterSaveSuccess?.();
    });
  };

  const agentDisbursements = Object.entries(dealResult.netPayouts)
    .filter(([name]) => agents.some((agent) => agent.name === name && !idleAgentIds.has(agent.id)))
    .map(([name, amount]) => {
      const agent = agents.find((item) => item.name === name);
      const isPrimary = agent
        ? (primaryAgentId ? isPrimaryAgent(agent, primaryAgentId) : agents[0]?.id === agent.id)
        : false;
      return {
        name,
        amount,
        isPrimary,
        isTeamLead: Boolean(agent?.isTeamLead),
      };
    });
  const entityDisbursements = Object.entries(dealResult.netPayouts).filter(([e]) => !agents.some((a) => a.name === e)) as [string, number][];

  // Filter available agents for picker modal so already added agents are excluded
  const availableAgentsToPick = useMemo(() => {
    const assignedNames = new Set(agents.map((a) => (a?.name || '').trim().toLowerCase()));
    return knownAgents.filter(
      (a) => !assignedNames.has((a?.name || '').trim().toLowerCase())
    );
  }, [knownAgents, agents]);

  const templateAgentRoster = useMemo(
    () => knownAgents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      isTeamLead: agent.isTeamLead,
      clientId: agent.clientId,
      fields: agent.fields,
    })),
    [knownAgents],
  );

  const handleResetWaterfall = () => {
    clearCommissionModuleCache();
    const named = String(primaryAgent || '').trim();
    const known = knownAgents.find((agent) =>
      (primaryAgentId && (agent.id === primaryAgentId || agent.name.toLowerCase() === String(primaryAgentId).toLowerCase()))
      || (named && agent.name.toLowerCase() === named.toLowerCase())
    );
    const current = agents.find((agent) =>
      isPrimaryAgent(agent, primaryAgentId) || (named && agent.name.toLowerCase() === named.toLowerCase())
    );
    const name = known?.name || current?.name || named;
    // Without a qualifying template the reset leaves no agent splits, so the deal keeps no payments.
    const nextAgents: AgentConfig[] = name && templateQualifies !== false
      ? [{
          id: known?.id || current?.id || (primaryAgentId ? String(primaryAgentId) : `AGT_${name}`),
          name,
          isTeamLead: known?.isTeamLead ?? current?.isTeamLead ?? false,
          splitType: 'PERCENT',
          splitVal: 1,
          brokerCapLimit: 0,
          brokerCapPaidYTD: 0,
          riskCapLimit: 0,
          riskPaidYTD: 0,
        }]
      : [];
    const rulesEmpty = offTheTopRules.length === 0
      && preSplitRules.length === 0
      && Object.values(postSplitRulesByAgent).every((rules) => rules.length === 0)
      && Object.values(postSplit2RulesByAgent).every((rules) => rules.length === 0);
    const agentsAlreadyReset = agents.length === nextAgents.length
      && agents.every((agent, index) => agent.id === nextAgents[index]?.id && agent.splitType === 'PERCENT' && agent.splitVal === 1);
    const capsAlreadyCleared = Array.isArray(selectedTeamCapIds) && selectedTeamCapIds.length === 0;

    setWaterfallEditSnapshot(null);
    setIsEditingWaterfall(false);
    setIsAddAgentModalOpen(false);
    setOffTheTopRules([]);
    setPreSplitRules([]);
    setPostSplitRulesByAgent({});
    setPostSplit2RulesByAgent({});
    setAgents(nextAgents);
    if (!capsAlreadyCleared) {
      teamCapsClearedRef.current = true;
      setSuspendCapAutoSave(true);
      setSelectedTeamCapIds([]);
      stageClearedTeamCaps();
    }
    if (!rulesEmpty || !agentsAlreadyReset || !capsAlreadyCleared) {
      setHasUnsavedLocalChanges(true);
      setWaterfallResetPending(true);
    }
  };

  const handleTemplateSubmissionDeleted = () => {
    pendingTemplateSubmissionRef.current = null;
    setPendingTemplateSubmission(null);
    storedTemplateSubmissionRef.current = null;
    savedTeamCapIdsRef.current = null;
    releaseTeamCapClear();
    setSelectedTeamCapIds(null);
    setTemplateSubmissionRevision((current) => current + 1);
    setTemplateReplayReset((current) => current + 1);
  };

  const discardPendingTemplateSubmission = (mode: 'save' | 'drop' = 'drop') => {
    if (!pendingTemplateSubmissionRef.current) return;
    pendingTemplateSubmissionRef.current = null;
    setPendingTemplateSubmission(null);
    setTemplateSubmissionRevision((current) => current + 1);
    if (mode === 'drop') setTemplateReplayReset((current) => current + 1);
  };

  const handleDiscardChanges = () => {
    releaseTeamCapClear();
    setSelectedTeamCapIds(savedTeamCapIdsRef.current);
    setWaterfallResetPending(false);
    setAllocatePromptOpen(false);
    overviewForm.setIsEditingOverview(false);
    setIsEditingWaterfall(false);
    setWaterfallEditSnapshot(null);
    setIsAddAgentModalOpen(false);
    setIsUnsavedModalOpen(false);
    pendingNavigationRef.current = null;
    setHasUnsavedLocalChanges(false);
    setCapOverrideBaseline(null);
    restoreLoadedOverrides();
    discardPendingTemplateSubmission();

    if (isNewTransaction) {
      setSalesPrice(0);
      setGciPerc(0);
      setGciType('PERCENTAGE');
      setPropertyAddress('');
      setClientName('');
      setPrimaryAgent('');
      setClientType('');
      setClosingDate('');
      setListDate('');
      setAcceptanceDate('');
      setLeadSource('');
      setAgents([]);
      setOffTheTopRules([]);
      setPreSplitRules([]);
      setPostSplitRulesByAgent({});
      setPostSplit2RulesByAgent({});
      return;
    }

    const matched = savedDeals.find((deal) => deal.id === routeId);
    if (!matched) return;
    const saved = JSON.parse(JSON.stringify(matched));

    setSelectedDeal(saved);
    setSelectedDealId(saved.id);
    setDealId(saved.id);
    setPropertyAddress(saved.property_address || '');
    setClientName(saved.client_name || '');
    const rawAgent = saved.agent_id || saved.primary_agent || '';
    const foundAgent = knownAgents.find(
      (agent) => agent.id === rawAgent || agent.name.toLowerCase() === String(rawAgent).toLowerCase()
    );
    const agentDisplayName = foundAgent ? foundAgent.name : (saved.primary_agent || rawAgent);
    setPrimaryAgent(agentDisplayName);
    setClientType(saved.client_type || saved.deal_type || saved.transaction_side || '');
    setClosingDate(saved.closing_date ? String(saved.closing_date).substring(0, 10) : '');
    setAcceptanceDate(saved.acceptance_date ? String(saved.acceptance_date).substring(0, 10) : '');
    setListDate(saved.list_date ? String(saved.list_date).substring(0, 10) : '');
    setLeadSource(saved.lead_source || '');
    setSalesPrice(saved.sales_price ? Math.abs(Number(saved.sales_price)) : 0);
    setGciPerc(Number(saved.gci_perc) || 0);
    setGciType(saved.gci_type || 'PERCENTAGE');

    const waterfall = waterfallFromCommissionItems(
      commissionItems,
      knownAgents,
      knownEntities,
      foundAgent?.id || saved.agent_id || null,
    );
    setAgents(waterfall.agents);
    setOffTheTopRules(waterfall.offTheTopRules);
    setPreSplitRules(waterfall.preSplitRules);
    setPostSplitRulesByAgent(waterfall.postSplitRulesByAgent);
    setPostSplit2RulesByAgent(waterfall.postSplit2RulesByAgent);
  };

  const requestNavigation = (navigate: () => void) => {
    if (!hasUnsavedLocalChanges) {
      navigate();
      return;
    }
    pendingNavigationRef.current = navigate;
    setIsUnsavedModalOpen(true);
  };

  const handleStayOnPage = () => {
    pendingNavigationRef.current = null;
    setIsUnsavedModalOpen(false);
  };

  const handleDiscardAndLeave = () => {
    releaseTeamCapClear();
    setSelectedTeamCapIds(savedTeamCapIdsRef.current);
    setWaterfallResetPending(false);
    setAllocatePromptOpen(false);
    const navigate = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    setHasUnsavedLocalChanges(false);
    setCapOverrideBaseline(null);
    restoreLoadedOverrides();
    discardPendingTemplateSubmission();
    setIsEditingWaterfall(false);
    setWaterfallEditSnapshot(null);
    overviewForm.setIsEditingOverview(false);
    setIsUnsavedModalOpen(false);
    navigate?.();
  };

  const deleteLabel =
    transactionDealLabel({
      property_address: selectedDeal?.property_address || propertyAddress,
      transaction_side: selectedDeal?.transaction_side,
      transaction_status: selectedDeal?.transaction_status || selectedDeal?.status,
    }) || String(selectedDeal?.id || routeId);

  const handleConfirmDelete = async () => {
    const transactionId = String(selectedDeal?.id || routeId);
    if (!transactionId || transactionId === 'new' || isDeleting) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const clientId = activeClientId;
      const res = await fetch(
        `/api/transactions?id=${encodeURIComponent(transactionId)}&client_id=${encodeURIComponent(clientId)}`,
        {
          method: 'DELETE',
          headers: { 'x-client-id': clientId },
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Failed to delete the transaction.');
      }
      setHasUnsavedLocalChanges(false);
      setConfirmDeleteOpen(false);
      router.push('/commission-tracker/transactions');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete the transaction.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveAndLeave = () => {
    handleSave(() => {
      const navigate = pendingNavigationRef.current;
      pendingNavigationRef.current = null;
      setIsUnsavedModalOpen(false);
      navigate?.();
    });
  };

  // Browser tab close / refresh
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedLocalChanges) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedLocalChanges]);

  // In-app link navigation (Navbar, etc.)
  useEffect(() => {
    const onDocumentClick = (e: MouseEvent) => {
      if (!hasUnsavedLocalChanges) return;
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      let url: URL;
      try {
        url = new URL(href, window.location.origin);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;

      const currentPath = window.location.pathname;
      if (url.pathname === currentPath && url.search === window.location.search) return;

      e.preventDefault();
      e.stopPropagation();
      requestNavigation(() => {
        router.push(`${url.pathname}${url.search}${url.hash}`);
      });
    };

    document.addEventListener('click', onDocumentClick, true);
    return () => document.removeEventListener('click', onDocumentClick, true);
  }, [hasUnsavedLocalChanges, router]);

  const requestNavigationRef = useRef(requestNavigation);
  requestNavigationRef.current = requestNavigation;

  useEffect(() => {
    if (!hasUnsavedLocalChanges) return;
    let released = false;
    const pushGuard = () => {
      window.history.pushState({ soleoxSaveGuard: true }, '');
    };
    pushGuard();
    const onPopState = () => {
      if (released) return;
      pushGuard();
      requestNavigationRef.current(() => {
        released = true;
        window.history.go(-2);
      });
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      released = true;
      window.removeEventListener('popstate', onPopState);
    };
  }, [hasUnsavedLocalChanges]);

  if (dealNotFound) {
    return (
      <div className="p-12 text-center space-y-4 max-w-md mx-auto">
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl text-3xl inline-block">⚠️</div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Transaction Not Found</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">The requested record ({routeId}) does not exist or you lack permission to view it.</p>
        <button
          onClick={() => requestNavigation(() => router.push('/commission-tracker/transactions'))}
          className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 transition"
        >
          Back to Transactions
        </button>
      </div>
    );
  }

  return (
    <div className={`${pageFrame} relative space-y-6 py-8`} style={{ '--txn-header-height': `${headerStick}px` } as React.CSSProperties}>
      {toast && <ToastBanner message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      <HeaderCard
        isNewTransaction={isNewTransaction}
        isSaving={isSaving}
        onSave={() => handleSave()}
        onDiscard={handleDiscardChanges}
        onDelete={canWriteTracker && selectedDeal?.id ? () => { setDeleteError(null); setConfirmDeleteOpen(true); } : undefined}
        hasUnsavedChanges={hasUnsavedLocalChanges}
        saveBlocked={saveBlocked}
        saveBlockedReason={saveBlockedReason}
        onHeightChange={setHeaderStick}
        deal={templateDeal ? {
          address: String(templateDeal.property_address || '').trim() || undefined,
          status: String(templateDeal.transaction_status || '').trim() || undefined,
          side: String(templateDeal.transaction_side || '').trim() || undefined,
          closingDate: templateDeal.closing_date
            ? new Date(`${String(templateDeal.closing_date).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : undefined,
          id: String(templateDeal.id || '') || undefined,
        } : null}
        onBack={() => requestNavigation(() => router.push('/commission-tracker/transactions'))}
        sections={[
          { id: 'overview', label: 'Overview', count: overviewFields.length, countNoun: overviewFields.length === 1 ? 'field' : 'fields' },
          { id: 'commission', label: 'Waterfall', count: agents.length, countNoun: agents.length === 1 ? 'agent' : 'agents' },
          { id: 'disbursements', label: 'Payments', count: agentDisbursements.length + entityDisbursements.length, countNoun: agentDisbursements.length + entityDisbursements.length === 1 ? 'payee' : 'payees' },
        ]}
        activeSection={activeTab}
        onSelectSection={scrollToSection}
      >
      <SearchableTransactionPicker
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isDropdownOpen={isDropdownOpen}
        setIsDropdownOpen={setIsDropdownOpen}
        filteredDeals={filteredDeals}
        isLoadingDeals={isLoadingDeals}
        selectedDealId={selectedDealId}
        onSelectDeal={(deal) => {
          const switchToDeal = () => {
            setIsDropdownOpen(false);
            setSelectedDeal(deal);
            setSelectedDealId(deal.id);
            setDealId(deal.id);
            setDealNotFound(false);
            setSearchQuery(transactionSearchLabel(deal));
            if (deal.id !== routeId) {
              router.push(`/commission-tracker/transactions/${deal.id}`);
            }
          };

          if (deal.id === routeId || deal.id === selectedDealId) {
            switchToDeal();
            return;
          }

          requestNavigation(switchToDeal);
        }}
        dropdownRef={dropdownRef}
      />
      </HeaderCard>

      <div>
        <div className="min-w-0 space-y-8">
          <TransactionOverview
            isEditing={overviewForm.isEditingOverview}
            hasChanges={!overviewForm.overviewValuesUnchanged()}
            onStartEdit={() => {
              clearCommissionModuleCache();
              void reloadAgents();
              overviewForm.handleStartOverviewEdit();
            }}
            onCancelEdit={() => {
              clearCommissionModuleCache();
              overviewForm.setIsEditingOverview(false);
            }}
            onApplyEdit={overviewForm.handleApplyOverviewEdit}
            groupedSections={overviewForm.groupedOverviewSections}
            overviewFormValues={overviewForm.overviewFormValues}
            selectedDeal={selectedDeal}
            knownAgents={knownAgents}
            gciType={gciType}
            dealId={dealId}
            gciPerc={gciPerc}
            grossCommission={dealResult.grossCommission}
            totalCommission={dealResult.totalCommission}
            handleOverviewInputChange={overviewForm.handleOverviewInputChange}
            preventMinus={(e) => { if (e.key === '-') e.preventDefault(); }}
            validateFieldValue={overviewForm.validateFieldValue}
          />

          <CommissionWaterfall
            isEditing={isEditingWaterfall}
            calculating={showCommissionCalculating}
            hasChanges={waterfallHasEdits() || (waterfallEditSnapshot != null && !sameTeamCapSelection(waterfallEditSnapshot.teamCapIds, selectedTeamCapIds)) || (capOverrideBaseline != null && !sameAllocationOverrides(capOverrides, capOverrideBaseline))}
            onTeamCapAmountChange={setTeamCapOverride}
            onRemoveTeamCap={handleRemoveTeamCap}
            agentCapCells={agentCapCells}
            onStartEdit={handleStartWaterfallEdit}
            onCancelEdit={handleCancelWaterfallEdit}
            onApplyEdit={handleApplyWaterfallEdit}
            agents={waterfallAgents}
            onOpenAddAgentModal={() => {
              if (!isEditingWaterfall) return;
              setIsAddAgentModalOpen(true);
            }}
            onRemoveAgent={(name) => {
              setAgents((prev) => {
                const toRemove = prev.find((a) => a.name === name);
                const remaining = prev.filter((a) => a.name !== name);
                if (!toRemove || remaining.length === 0) return remaining;

                const primary = remaining[0];
                let restoredVal = primary.splitVal;
                const baselinePool = dealResult.commissionAfterPreSplit ?? dealResult.commissionAfterOffTop;
                if (toRemove.splitType === 'PERCENT' && primary.splitType === 'PERCENT') {
                  restoredVal = roundPercentRate(primary.splitVal + toRemove.splitVal);
                } else if (baselinePool > 0 && primary.splitType === 'PERCENT') {
                  restoredVal = roundPercentRate(primary.splitVal + (toRemove.splitVal / baselinePool));
                }
                remaining[0] = { ...primary, splitVal: restoredVal };
                return [...remaining];
              });
            }}
            onSwitchAgent={(agentId, newAgentName) => {
              const newAgentInfo = knownAgents.find((a) => a.name === newAgentName);
              if (!newAgentInfo) return;

              setAgents((prev) => {
                const targetIndex = prev.findIndex((a) => a.id === agentId);
                if (targetIndex === -1) return prev;
                const oldAgent = prev[targetIndex];

                const updated: AgentConfig = {
                  ...oldAgent,
                  id: newAgentInfo.id || `A_${Date.now()}`,
                  name: newAgentInfo.name,
                  isTeamLead: newAgentInfo.isTeamLead,
                  brokerCapLimit: 0,
                  brokerCapPaidYTD: 0,
                  riskCapLimit: 0,
                  riskPaidYTD: 0,
                };

                if (targetIndex === 0) {
                  setPrimaryAgent(newAgentInfo.name);
                }

                // Migrate post-split rules if registered under old name
                if (postSplitRulesByAgent[oldAgent.name] && !postSplitRulesByAgent[newAgentInfo.name]) {
                  setPostSplitRulesByAgent((p) => {
                    const next = { ...p };
                    next[newAgentInfo.name] = next[oldAgent.name];
                    delete next[oldAgent.name];
                    return next;
                  });
                }

                if (postSplit2RulesByAgent[oldAgent.name] && !postSplit2RulesByAgent[newAgentInfo.name]) {
                  setPostSplit2RulesByAgent((p) => {
                    const next = { ...p };
                    next[newAgentInfo.name] = next[oldAgent.name];
                    delete next[oldAgent.name];
                    return next;
                  });
                }

                const nextList = [...prev];
                nextList[targetIndex] = updated;
                return nextList;
              });
            }}
            onToggleAgentSplitType={(id) => setAgents((p) => p.map((a) => {
              if (a.id !== id) return a;
              const newType = a.splitType === 'PERCENT' ? 'AMOUNT' : 'PERCENT';
              return { ...a, splitType: newType };
            }))}
            onSplitValueChange={(id, val) => setAgents((p) => p.map((a) => a.id === id ? { ...a, splitVal: val } : a))}
            dealResult={dealResult}
            offTheTopRules={offTheTopRules}
            onAddOffTopRule={(rule) => setOffTheTopRules((p) => [...p, rule])}
            onDeleteOffTopRule={(id) => setOffTheTopRules((p) => p.filter((r) => r.id !== id))}
            onToggleOffTopRuleType={(id) => setOffTheTopRules((p) => p.map((r) => {
              if (r.id !== id) return r;
              const newType = r.type === 'PERCENT' ? 'AMOUNT' : 'PERCENT';
              return { ...r, type: newType };
            }))}
            onUpdateOffTopRuleValue={(id, val) => setOffTheTopRules((p) => p.map((r) => r.id === id ? { ...r, value: val } : r))}
            onUpdateOffTopRuleEntity={(id, ent) => setOffTheTopRules((p) => p.map((r) => r.id === id ? { ...r, entity: ent, name: ent } : r))}
            onUpdateOffTopRuleNote={(id, note) => setOffTheTopRules((p) => p.map((r) => r.id === id ? { ...r, note } : r))}
            onReorderOffTopRules={(fromIndex, toIndex) => {
              setOffTheTopRules((prev) => {
                if (fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) return prev;
                const next = [...prev];
                const [moved] = next.splice(fromIndex, 1);
                next.splice(toIndex, 0, moved);
                return next;
              });
            }}
            preSplitRules={preSplitRules}
            onAddPreSplitRule={(rule) => setPreSplitRules((p) => [...p, rule])}
            onDeletePreSplitRule={(id) => setPreSplitRules((p) => p.filter((r) => r.id !== id))}
            onTogglePreSplitRuleType={(id) => setPreSplitRules((p) => p.map((r) => {
              if (r.id !== id) return r;
              const newType = r.type === 'PERCENT' ? 'AMOUNT' : 'PERCENT';
              return { ...r, type: newType };
            }))}
            onUpdatePreSplitRuleValue={(id, val) => setPreSplitRules((p) => p.map((r) => r.id === id ? { ...r, value: val } : r))}
            onUpdatePreSplitRuleEntity={(id, ent) => setPreSplitRules((p) => p.map((r) => r.id === id ? { ...r, entity: ent, name: ent } : r))}
            onUpdatePreSplitRuleNote={(id, note) => setPreSplitRules((p) => p.map((r) => r.id === id ? { ...r, note } : r))}
            onReorderPreSplitRules={(fromIndex, toIndex) => {
              setPreSplitRules((prev) => {
                if (fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) return prev;
                const next = [...prev];
                const [moved] = next.splice(fromIndex, 1);
                next.splice(toIndex, 0, moved);
                return next;
              });
            }}
            onReorderAgents={(fromIndex, toIndex) => {
              setAgents((prev) => {
                if (fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) return prev;
                const next = [...prev];
                const [moved] = next.splice(fromIndex, 1);
                next.splice(toIndex, 0, moved);
                return next;
              });
            }}
            postSplitRulesByAgent={postSplitRulesByAgent}
            onAddAgentPostSplitRule={(name, rule) => setPostSplitRulesByAgent((p) => ({ ...p, [name]: [...(p[name] || []), rule] }))}
            onDeleteAgentPostSplitRule={(name, id) => setPostSplitRulesByAgent((p) => ({ ...p, [name]: (p[name] || []).filter((r) => r.id !== id) }))}
            onToggleAgentPostSplitType={(name, id) => setPostSplitRulesByAgent((p) => withRuleChange(p, dealResult.displayPostSplitRulesByAgent, name, id, (rule) => ({ ...rule, type: rule.type === 'PERCENT' ? 'AMOUNT' : 'PERCENT' })))}
            onUpdateAgentPostSplitValue={(name, id, val) => setPostSplitRulesByAgent((p) => withRuleChange(p, dealResult.displayPostSplitRulesByAgent, name, id, (rule) => ({ ...rule, value: val })))}
            onUpdateAgentPostSplitEntity={(name, id, ent) => setPostSplitRulesByAgent((p) => withRuleChange(p, dealResult.displayPostSplitRulesByAgent, name, id, (rule) => ({ ...rule, entity: ent, name: ent })))}
            onUpdateAgentPostSplitNote={(name, id, note) => setPostSplitRulesByAgent((p) => withRuleChange(p, dealResult.displayPostSplitRulesByAgent, name, id, (rule) => ({ ...rule, note })))}
            onReorderAgentPostSplitRules={(agentName, fromIndex, toIndex) => {
              setPostSplitRulesByAgent((prev) => {
                const current = prev[agentName] || [];
                if (fromIndex < 0 || toIndex < 0 || fromIndex >= current.length || toIndex >= current.length) return prev;
                const next = [...current];
                const [moved] = next.splice(fromIndex, 1);
                next.splice(toIndex, 0, moved);
                return { ...prev, [agentName]: next };
              });
            }}
            onReorderPostSplitEntities={(entityOrder) => {
              setPostSplitRulesByAgent((prev) => orderRulesByEntities(prev, entityOrder));
            }}
            postSplit2RulesByAgent={postSplit2RulesByAgent}
            onAddAgentPostSplit2Rule={(name, rule) => setPostSplit2RulesByAgent((p) => ({ ...p, [name]: [...(p[name] || []), rule] }))}
            onDeleteAgentPostSplit2Rule={(name, id) => setPostSplit2RulesByAgent((p) => ({ ...p, [name]: (p[name] || []).filter((r) => r.id !== id) }))}
            onToggleAgentPostSplit2Type={(name, id) => setPostSplit2RulesByAgent((p) => withRuleChange(p, dealResult.displayPostSplit2RulesByAgent, name, id, (rule) => ({ ...rule, type: rule.type === 'PERCENT' ? 'AMOUNT' : 'PERCENT' })))}
            onUpdateAgentPostSplit2Value={(name, id, val) => setPostSplit2RulesByAgent((p) => withRuleChange(p, dealResult.displayPostSplit2RulesByAgent, name, id, (rule) => ({ ...rule, value: val })))}
            onUpdateAgentPostSplit2Entity={(name, id, ent) => setPostSplit2RulesByAgent((p) => withRuleChange(p, dealResult.displayPostSplit2RulesByAgent, name, id, (rule) => ({ ...rule, entity: ent, name: ent })))}
            onUpdateAgentPostSplit2Note={(name, id, note) => setPostSplit2RulesByAgent((p) => withRuleChange(p, dealResult.displayPostSplit2RulesByAgent, name, id, (rule) => ({ ...rule, note })))}
            onReorderAgentPostSplit2Rules={(agentName, fromIndex, toIndex) => {
              setPostSplit2RulesByAgent((prev) => {
                const current = prev[agentName] || [];
                if (fromIndex < 0 || toIndex < 0 || fromIndex >= current.length || toIndex >= current.length) return prev;
                const next = [...current];
                const [moved] = next.splice(fromIndex, 1);
                next.splice(toIndex, 0, moved);
                return { ...prev, [agentName]: next };
              });
            }}
            onReorderPostSplit2Entities={(entityOrder) => {
              setPostSplit2RulesByAgent((prev) => orderRulesByEntities(prev, entityOrder));
            }}
            knownEntities={knownEntities}
            knownAgents={knownAgents}
            preventMinus={(e) => { if (e.key === '-') e.preventDefault(); }}
            formatNumberWithCommas={(v) => String(v)}
            clientId={String(templateDeal?.client_id || access?.clientId || '')}
            transactionId={templateDeal?.id || dealId || ''}
            allocations={dealResult.allocationLines || []}
            deal={templateDeal}
            templateAgents={templateAgentRoster}
            primaryAgentId={primaryAgentId}
            onApplyTemplate={handleApplyTemplateRules}
            onSubmissionDeleted={handleTemplateSubmissionDeleted}
            onTeamCapSelection={handleTeamCapSelection}
            onStoredSubmission={rememberStoredSubmission}
            pendingTemplateSubmission={pendingTemplateSubmission}
            onResetWaterfall={handleResetWaterfall}
            resetClearsPayments={templateQualifies === false}
            submissionRevision={templateSubmissionRevision}
          />

          <FinalDisbursements
            agentDisbursements={agentDisbursements}
            entityDisbursements={entityDisbursements}
            totalCommission={dealResult.totalCommission}
            agentSplitTotal={Number(dealResult.agentSplitTotal) || 0}
            agentSplitExcess={agentSplitExcess}
            remainingCommission={Number(dealResult.commissionAfterPreSplit) || 0}
            requiresFullAllocation={templateQualifies === true}
            calculating={showCommissionCalculating}
          />
        </div>
      </div>

      <RequiredFieldsModal
        isOpen={overviewForm.showRequiredFieldsWarningModal}
        missingLabels={overviewForm.missingRequiredLabels}
        onCancel={() => overviewForm.setShowRequiredFieldsWarningModal(false)}
        onConfirm={() => {
          overviewForm.setShowRequiredFieldsWarningModal(false);
          handleRequestOverviewApply(overviewForm.executeOverviewApply, overviewForm.overviewFormValues);
        }}
      />

      <TransferPrimaryAgentModal
        isOpen={isTransferModalOpen}
        formerAgentName={transferInfo?.formerAgent || ''}
        newAgentName={transferInfo?.newAgent.name || ''}
        primarySplitType={transferInfo?.splitType || 'PERCENT'}
        primarySplitValue={
          transferInfo?.splitType === 'AMOUNT'
            ? (transferInfo.splitVal || 0)
            : toPercentPoints(transferInfo?.splitVal || 0)
        }
        level1RulesCount={(transferInfo && postSplitRulesByAgent[transferInfo.formerAgent]?.length) || 0}
        level2RulesCount={(transferInfo && postSplit2RulesByAgent[transferInfo.formerAgent]?.length) || 0}
        onConfirm={handleConfirmTransfer}
        onCancel={handleCancelTransfer}
      />

      <RevertPrimaryAgentModal
        isOpen={isRevertModalOpen}
        formerAgentName={transferInfo?.formerAgent || ''}
        newAgentName={transferInfo?.newAgent.name || ''}
        onRevertYes={handleRevertYes}
        onRevertNo={handleRevertNo}
      />

      <AllocateCommissionModal
        isOpen={allocatePromptOpen}
        agentName={agents.length === 1 ? agents[0].name : ''}
        isSaving={isSaving}
        onCancel={() => {
          if (!isSaving) setAllocatePromptOpen(false);
        }}
        onNo={() => handleSave(allocateAfterSaveRef.current, { decided: true, omitPayments: true })}
        onYes={() => handleSave(allocateAfterSaveRef.current, { decided: true })}
      />

      <UnsavedChangesModal
        isOpen={isUnsavedModalOpen}
        isSaving={isSaving}
        onStay={handleStayOnPage}
        onDiscard={handleDiscardAndLeave}
        onSave={handleSaveAndLeave}
        saveDisabled={saveBlocked}
        saveDisabledReason={saveBlockedReason}
      />

      {confirmDeleteOpen && (
        <ConfirmDialog
          title={`Delete Transaction "${deleteLabel}"?`}
          message="This removes the transaction, including its commission and payment records."
          error={deleteError}
          isPending={isDeleting}
          onCancel={() => {
            if (!isDeleting) setConfirmDeleteOpen(false);
          }}
          onConfirm={() => void handleConfirmDelete()}
        />
      )}

      <AgentPickerModal
        isOpen={isAddAgentModalOpen}
        onClose={() => setIsAddAgentModalOpen(false)}
        searchQuery={agentPickerSearch}
        setSearchQuery={setAgentPickerSearch}
        availableAgents={availableAgentsToPick}
        primaryAgentName={agents[0]?.name || 'Primary Agent'}
        commissionAfterOffTop={dealResult.commissionAfterPreSplit ?? dealResult.commissionAfterOffTop}
        onConfirmAddAgent={(selected, splitType, splitVal) => {
          const isFirstAgent = agents.length === 0;

          const newAgent: AgentConfig = {
            id: selected.id || `A_${Date.now()}`,
            name: selected.name,
            isTeamLead: selected.isTeamLead,
            splitType: isFirstAgent ? 'PERCENT' : splitType,
            splitVal: isFirstAgent ? 1 : splitVal,
            brokerCapLimit: 0,
            brokerCapPaidYTD: 0,
            riskCapLimit: 0,
            riskPaidYTD: 0,
          };

          setAgents((prev) => {
            if (prev.length === 0) return [newAgent];
            const primary = prev[0];
            const baselinePool = dealResult.commissionAfterPreSplit ?? dealResult.commissionAfterOffTop;
            if (primary.splitType !== 'PERCENT') {
              return [...prev, newAgent];
            }
            const incomingRate = splitType === 'PERCENT'
              ? splitVal
              : (baselinePool > 0 ? splitVal / baselinePool : 0);
            const remainingRate = Math.max(0, primary.splitVal - incomingRate);
            return [{ ...primary, splitVal: roundPercentRate(remainingRate) }, ...prev.slice(1), newAgent];
          });

          if (isFirstAgent) {
            setPrimaryAgent(selected.name);
          }

          setIsAddAgentModalOpen(false);
        }}
      />
    </div>
  );
}