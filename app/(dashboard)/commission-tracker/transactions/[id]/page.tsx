// app/commission-tracker/transactions/[id]/page.tsx
'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AgentConfig, DynamicRule, ToastNotification, roundCurrency, KnownAgentInfo } from './types';

// Custom Hooks
import { useTransactionData } from './hooks/useTransactionData';
import { useTransactionWaterfall } from './hooks/useTransactionWaterfall';
import { useOverviewForm } from './hooks/useOverviewForm';

// Sub-Components & Modals
import { HeaderCard } from './components/HeaderCard';
import { SearchableTransactionPicker } from './components/SearchableTransactionPicker';
import { LeftSidebar } from './components/LeftSidebar';
import { TransactionOverview } from './components/TransactionOverview';
import { CommissionWaterfall } from './components/CommissionWaterfall';
import { FinalDisbursements } from './components/FinalDisbursements';
import { RequiredFieldsModal } from './components/RequiredFieldsModal';
import { AgentPickerModal } from './components/AgentPickerModal';
import { TransferPrimaryAgentModal } from './components/TransferPrimaryAgentModal';
import { RevertPrimaryAgentModal } from './components/RevertPrimaryAgentModal';
import { UnsavedChangesModal } from './components/UnsavedChangesModal';
import { generatePrefixedId } from '@/lib/id';

export default function Dashboard() {
  const router = useRouter();
  const routeId = (useParams()?.id as string) || '';
  const isNewTransaction = routeId === 'new';

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

  const { savedDeals, overviewFields, knownAgents, knownEntities, isLoadingDeals, isSaving, saveTransaction } = useTransactionData(routeId, isNewTransaction);

  const [activeTab, setActiveTab] = useState<'overview' | 'commission' | 'disbursements'>('overview');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ overview: false, commission: false, disbursements: false });
  const isProgrammaticScrollRef = useRef(false);
  const toggleSection = (key: string) => setCollapsed((p) => ({ ...p, [key]: !p[key] }));

  const scrollToSection = (sectionId: 'overview' | 'commission' | 'disbursements') => {
    setActiveTab(sectionId);
    isProgrammaticScrollRef.current = true;

    const wasCollapsed = Boolean(collapsed[sectionId]);
    if (wasCollapsed) {
      setCollapsed((prev) => ({ ...prev, [sectionId]: false }));
    }

    // Wait for expand paint when needed, then smooth-scroll to the section
    const delayMs = wasCollapsed ? 80 : 0;
    window.setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      window.setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 700);
    }, delayMs);
  };

  // Highlight Workflow Steps based on which section is in view while scrolling
  useEffect(() => {
    const sectionIds = ['overview', 'commission', 'disbursements'] as const;

    const updateActiveFromScroll = () => {
      if (isProgrammaticScrollRef.current) return;

      const activationOffset = 120; // sticky sidebar / header breathing room
      let current: (typeof sectionIds)[number] = 'overview';

      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top - activationOffset <= 0) {
          current = id;
        }
      }

      setActiveTab((prev) => (prev === current ? prev : current));
    };

    window.addEventListener('scroll', updateActiveFromScroll, { passive: true });
    window.addEventListener('resize', updateActiveFromScroll);
    updateActiveFromScroll();

    return () => {
      window.removeEventListener('scroll', updateActiveFromScroll);
      window.removeEventListener('resize', updateActiveFromScroll);
    };
  }, [collapsed.overview, collapsed.commission, collapsed.disbursements]);

  const [dealId, setDealId] = useState('');
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [selectedDealId, setSelectedDealId] = useState('');
  const [dealNotFound, setDealNotFound] = useState(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        if (selectedDeal) {
          const clientLabel = selectedDeal.client_id ? `[${selectedDeal.client_id}] ` : '';
          setSearchQuery(`${clientLabel}${selectedDeal.id} — ${selectedDeal.property_address || ''}`);
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedDeal]);

  // Dynamic search filtering & relevance ranking for transactions combobox
  const filteredDeals = useMemo(() => {
    if (!savedDeals || savedDeals.length === 0) return [];

    const currentDealLabel = selectedDeal
      ? `${selectedDeal.client_id ? `[${selectedDeal.client_id}] ` : ''}${selectedDeal.id} — ${selectedDeal.property_address || ''}`
      : '';

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
      const priceStr = deal.sales_price != null ? `$${Number(deal.sales_price).toLocaleString()} ${deal.sales_price}`.toLowerCase() : '';

      const combined = `${tenantStr} ${idStr} ${addrStr} ${clientStr} ${agentStr} ${leadStr} ${statusStr} ${priceStr}`;

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
  } | null>(null);
  const [hasUnsavedLocalChanges, setHasUnsavedLocalChanges] = useState(false);
  const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);
  const pendingNavigationRef = useRef<(() => void) | null>(null);

  const cloneWaterfallRules = (rules: DynamicRule[]) => rules.map((r) => ({ ...r }));
  const cloneWaterfallRulesByAgent = (map: Record<string, DynamicRule[]>) =>
    Object.fromEntries(Object.entries(map).map(([k, rules]) => [k, cloneWaterfallRules(rules)]));

  const handleStartWaterfallEdit = () => {
    setWaterfallEditSnapshot({
      agents: agents.map((a) => ({ ...a })),
      offTheTopRules: cloneWaterfallRules(offTheTopRules),
      preSplitRules: cloneWaterfallRules(preSplitRules),
      postSplitRulesByAgent: cloneWaterfallRulesByAgent(postSplitRulesByAgent),
      postSplit2RulesByAgent: cloneWaterfallRulesByAgent(postSplit2RulesByAgent),
    });
    setIsEditingWaterfall(true);
  };

  const handleCancelWaterfallEdit = () => {
    if (waterfallEditSnapshot) {
      setAgents(waterfallEditSnapshot.agents.map((a) => ({ ...a })));
      setOffTheTopRules(cloneWaterfallRules(waterfallEditSnapshot.offTheTopRules));
      setPreSplitRules(cloneWaterfallRules(waterfallEditSnapshot.preSplitRules));
      setPostSplitRulesByAgent(cloneWaterfallRulesByAgent(waterfallEditSnapshot.postSplitRulesByAgent));
      setPostSplit2RulesByAgent(cloneWaterfallRulesByAgent(waterfallEditSnapshot.postSplit2RulesByAgent));
    }
    setWaterfallEditSnapshot(null);
    setIsEditingWaterfall(false);
    setIsAddAgentModalOpen(false);
  };

  const handleApplyWaterfallEdit = () => {
    // Local apply only — DB persistence happens via Save Transaction
    setWaterfallEditSnapshot(null);
    setIsEditingWaterfall(false);
    setIsAddAgentModalOpen(false);
    setHasUnsavedLocalChanges(true);
    showToast('Waterfall changes applied locally. Click Save Transaction to persist.', 'info');
  };

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isRevertModalOpen, setIsRevertModalOpen] = useState(false);
  const [transferInfo, setTransferInfo] = useState<{
    formerAgent: string;
    newAgent: KnownAgentInfo;
    proceedApply: () => void;
  } | null>(null);

  const handleRequestOverviewApply = (proceedWithApply: () => void, currentFormValues?: Record<string, any>) => {
    const proceedAndMarkDirty = () => {
      proceedWithApply();
      setHasUnsavedLocalChanges(true);
    };

    // 1. Identify former primary agent
    const formerAgentName = agents[0]?.name || primaryAgent || '';

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
        brokerCapLimit: 8000,
        brokerCapPaidYTD: 0,
        riskCapLimit: 750,
        riskPaidYTD: 0,
      };

      setTransferInfo({
        formerAgent: formerAgentName,
        newAgent: resolvedNewAgentInfo,
        proceedApply: proceedAndMarkDirty,
      });
      setIsTransferModalOpen(true);
    } else {
      // If no former agent existed (e.g. brand new transaction), but now new agent is selected:
      if (!hasFormer && hasNew) {
        const resolvedNewAgentInfo: KnownAgentInfo = matchedNewAgent || {
          id: `AGT_${newAgentName}`,
          name: newAgentName,
          isTeamLead: false,
          brokerCapLimit: 8000,
          brokerCapPaidYTD: 0,
          riskCapLimit: 750,
          riskPaidYTD: 0,
        };
        setAgents([
          {
            id: resolvedNewAgentInfo.id,
            name: resolvedNewAgentInfo.name,
            isTeamLead: resolvedNewAgentInfo.isTeamLead,
            splitType: 'PERCENT',
            splitVal: 1.0,
            brokerCapLimit: resolvedNewAgentInfo.brokerCapLimit,
            brokerCapPaidYTD: resolvedNewAgentInfo.brokerCapPaidYTD,
            riskCapLimit: resolvedNewAgentInfo.riskCapLimit,
            riskPaidYTD: resolvedNewAgentInfo.riskPaidYTD,
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
    const { formerAgent, newAgent, proceedApply } = transferInfo;

    // 1. Update primary agent in agents[0] (or create if empty)
    setAgents((prev) => {
      if (prev.length === 0) {
        return [
          {
            id: newAgent.id,
            name: newAgent.name,
            isTeamLead: newAgent.isTeamLead,
            splitType: 'PERCENT',
            splitVal: 1.0,
            brokerCapLimit: newAgent.brokerCapLimit,
            brokerCapPaidYTD: newAgent.brokerCapPaidYTD,
            riskCapLimit: newAgent.riskCapLimit,
            riskPaidYTD: newAgent.riskPaidYTD,
          },
        ];
      }

      const primary = prev[0];
      const updatedPrimary: AgentConfig = {
        ...primary,
        id: newAgent.id,
        name: newAgent.name,
        isTeamLead: newAgent.isTeamLead,
        brokerCapLimit: newAgent.brokerCapLimit,
        brokerCapPaidYTD: newAgent.brokerCapPaidYTD,
        riskCapLimit: newAgent.riskCapLimit,
        riskPaidYTD: newAgent.riskPaidYTD,
      };

      // Filter out if newAgent was listed as a secondary agent
      const remainingSecondary = prev.slice(1).filter((a) => a.name.toLowerCase() !== newAgent.name.toLowerCase());
      return [updatedPrimary, ...remainingSecondary];
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

  const dealResult = useTransactionWaterfall({
    salesPrice: overviewForm.isEditingOverview ? (Number(overviewForm.overviewFormValues.sales_price) || salesPrice) : salesPrice,
    gciPerc: overviewForm.isEditingOverview ? (Number(overviewForm.overviewFormValues.gci_perc) || gciPerc) : gciPerc,
    offTheTopRules,
    preSplitRules,
    postSplitRulesByAgent,
    postSplit2RulesByAgent,
    agents,
    overviewFields,
    selectedDeal,
    overviewFormValues: overviewForm.overviewFormValues,
    clientType,
  });

  const activeClientId = selectedDeal?.client_id || 'DEMO';

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
      setHasUnsavedLocalChanges(false);
      setSearchQuery(`[NEW] ${freshId} — Draft Transaction`);
    } else if (routeId && savedDeals.length > 0) {
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
      setGciPerc(matched.gci_perc ? (Math.abs(Number(matched.gci_perc)) > 1 ? Number(matched.gci_perc) / 100 : Number(matched.gci_perc)) : 0);
      
      // Load agents and rules from deal custom_attributes or fallbacks
      const dealCustomAttrs = matched.custom_attributes || {};
      const dealAgents = dealCustomAttrs.agents || matched.agents;
      if (Array.isArray(dealAgents) && dealAgents.length > 0) {
        setAgents(dealAgents);
      } else if (rawAgent) {
        setAgents([
          {
            id: foundAgent?.id || `A_${Date.now()}`,
            name: agentDisplayName,
            isTeamLead: foundAgent?.isTeamLead || false,
            splitType: 'PERCENT',
            splitVal: 1.0,
            brokerCapLimit: foundAgent?.brokerCapLimit || 8000,
            brokerCapPaidYTD: foundAgent?.brokerCapPaidYTD || 0,
            riskCapLimit: foundAgent?.riskCapLimit || 750,
            riskPaidYTD: foundAgent?.riskPaidYTD || 0,
          },
        ]);
      } else {
        setAgents([]);
      }

      const dealOffTop = dealCustomAttrs.offTheTopRules || matched.offTheTopRules;
      if (Array.isArray(dealOffTop)) {
        setOffTheTopRules(dealOffTop);
      } else {
        setOffTheTopRules([]);
      }

      const dealPreSplits = dealCustomAttrs.preSplitRules || matched.preSplitRules;
      if (Array.isArray(dealPreSplits)) {
        setPreSplitRules(dealPreSplits);
      } else {
        setPreSplitRules([]);
      }

      const dealPostSplits = dealCustomAttrs.postSplitRulesByAgent || matched.postSplitRulesByAgent;
      if (dealPostSplits && typeof dealPostSplits === 'object') {
        setPostSplitRulesByAgent(dealPostSplits);
      } else {
        setPostSplitRulesByAgent({});
      }

      const dealPostSplits2 = dealCustomAttrs.postSplit2RulesByAgent || matched.postSplit2RulesByAgent;
      if (dealPostSplits2 && typeof dealPostSplits2 === 'object') {
        setPostSplit2RulesByAgent(dealPostSplits2);
      } else {
        setPostSplit2RulesByAgent({});
      }

      const clientLabel = matched.client_id ? `[${matched.client_id}] ` : '';
      setSearchQuery(`${clientLabel}${matched.id} — ${matched.property_address || ''}`);
    }
  }, [routeId, isNewTransaction, savedDeals, knownAgents]);

  const KNOWN_DB_COLUMNS = new Set([
    'id', 'client_id', 'tms_id', 'transaction_status', 'finance_status',
    'transaction_side', 'property_address', 'client_name', 'lead_source',
    'lead_owner', 'list_price', 'sales_price', 'gci_type', 'gci_perc',
    'gci_amount', 'total_commission', 'transaction_fee', 'list_date',
    'acceptance_date', 'closing_date', 'agent_id', 'isa',
    'transaction_coordinator', 'co_broker', 'settlement_vendors',
    'address_details', 'notes', 'archived', 'created_at', 'created_by',
    'updated_at', 'updated_by'
  ]);

  const handleSave = (afterSaveSuccess?: () => void) => {
    if (!activeClientId && !isNewTransaction) {
      showToast('Cannot save transaction: Missing active Client ID.', 'error');
      return;
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
          (agents[0]?.id && knownAgents.find((a) => a.id === agents[0].id)) ||
          null;
        return resolved?.id || formAgent || agents[0]?.id || selectedDeal?.agent_id || null;
      })(),
      isa: form.isa ? (Array.isArray(form.isa) ? form.isa : [form.isa]) : (selectedDeal?.isa ?? null),
      transaction_coordinator: form.transaction_coordinator ? (Array.isArray(form.transaction_coordinator) ? form.transaction_coordinator : [form.transaction_coordinator]) : (selectedDeal?.transaction_coordinator ?? null),
      co_broker: form.co_broker ?? selectedDeal?.co_broker ?? null,
      settlement_vendors: form.settlement_vendors ?? selectedDeal?.settlement_vendors ?? null,
      address_details: form.address_details ?? selectedDeal?.address_details ?? null,
      notes: form.notes ?? selectedDeal?.notes ?? null,
      archived: form.archived ?? selectedDeal?.archived ?? false,
    };

    const customAttrs: Record<string, any> = {
      ...(selectedDeal?.custom_attributes || {}),
      agents,
      offTheTopRules,
      preSplitRules,
      postSplitRulesByAgent,
      postSplit2RulesByAgent,
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
              ? Number((item.value > 1 ? item.value / 100 : item.value).toFixed(4))
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
          entity_name: matchedEntity?.name || item.entity,
          agent_id: null,
          agent_name: null,
          is_primary: false,
          calculated_amount: item.amount,
          final_amount: item.amount,
        };
      }),
      ...(dealResult.preSplitItems || []).map((item: any, idx: number) => {
        const matchedEntity = knownEntities.find((e) => e.name === item.entity || e.id === item.entity);
        const splitType = item.type || 'PERCENT';
        const cleanVal = item.value !== undefined && item.value !== null
          ? (splitType === 'PERCENT'
              ? Number((item.value > 1 ? item.value / 100 : item.value).toFixed(4))
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
          entity_name: matchedEntity?.name || item.entity,
          agent_id: null,
          agent_name: null,
          is_primary: false,
          calculated_amount: item.amount,
          final_amount: item.amount,
        };
      }),
      ...dealResult.agentSplitItems.map((item: any, idx: number) => {
        const matchedAgent = knownAgents.find((a) => a.id === item.agentId || a.name === item.agentName);
        const isPrimary = idx === 0 || item.isPrimary;
        const splitType = item.splitType || 'PERCENT';
        let cleanSplitVal: number | null = null;

        if (splitType === 'PERCENT') {
          const raw = item.percent !== undefined && item.percent !== null
            ? item.percent
            : (item.splitVal !== undefined && item.splitVal !== null
                ? (item.splitVal > 1 ? item.splitVal / 100 : item.splitVal)
                : null);
          cleanSplitVal = raw !== null ? Number(Number(raw).toFixed(4)) : null;
        } else {
          cleanSplitVal = item.splitVal !== undefined && item.splitVal !== null
            ? roundCurrency(Number(item.splitVal))
            : (item.amount !== undefined ? roundCurrency(Number(item.amount)) : null);
        }

        return {
          step_number: 20 + idx + 1,
          rule_name: `${item.agentName} Split`,
          section: 'AGENT_SPLIT',
          split_type: splitType,
          split_value: cleanSplitVal,
          note: null,
          payee_type: 'AGENT',
          payee_entity_id: null,
          entity_name: null,
          agent_id: matchedAgent?.id || item.agentId || null,
          agent_name: matchedAgent?.name || item.agentName,
          is_primary: isPrimary,
          calculated_amount: item.amount,
          final_amount: item.amount,
        };
      }),
      ...dealResult.postSplitItems.map((item: any, idx: number) => {
        const matchedEntity = knownEntities.find((e) => e.name === item.entity || e.id === item.entity);
        const matchedAgent = knownAgents.find((a) => a.id === item.agentId || a.name === item.agentName);
        const splitType = item.type || 'PERCENT';
        const cleanVal = item.value !== undefined && item.value !== null
          ? (splitType === 'PERCENT'
              ? Number((item.value > 1 ? item.value / 100 : item.value).toFixed(4))
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
          entity_name: matchedEntity?.name || item.entity,
          agent_id: matchedAgent?.id || item.agentId || null,
          agent_name: matchedAgent?.name || item.agentName,
          is_primary: false,
          calculated_amount: item.amount,
          final_amount: item.amount,
        };
      }),
      ...(dealResult.postSplit2Items || []).map((item: any, idx: number) => {
        const matchedEntity = knownEntities.find((e) => e.name === item.entity || e.id === item.entity);
        const matchedAgent = knownAgents.find((a) => a.id === item.agentId || a.name === item.agentName);
        const splitType = item.type || 'PERCENT';
        const cleanVal = item.value !== undefined && item.value !== null
          ? (splitType === 'PERCENT'
              ? Number((item.value > 1 ? item.value / 100 : item.value).toFixed(4))
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
          entity_name: matchedEntity?.name || item.entity,
          agent_id: matchedAgent?.id || item.agentId || null,
          agent_name: matchedAgent?.name || item.agentName,
          is_primary: false,
          calculated_amount: item.amount,
          final_amount: item.amount,
        };
      }),
    ];

    // Build Final Disbursements & Payment Authorizations
    const currentAgentDisbursements = Object.entries(dealResult.netPayouts).filter(([e]) => agents.some((a) => a.name === e)) as [string, number][];
    const currentEntityDisbursements = Object.entries(dealResult.netPayouts).filter(([e]) => !agents.some((a) => a.name === e)) as [string, number][];
    const primaryAgentName = agents[0]?.name || (typeof primaryAgent === 'string' ? primaryAgent : '') || 'Primary Agent';

    const paymentItems = [
      ...currentAgentDisbursements.map(([agentName, amount]) => {
        const matchedAgent = knownAgents.find((a) => a.name === agentName || a.id === agentName);
        return {
          payee_type: 'AGENT',
          payee_name: matchedAgent?.name || agentName,
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
          payee_name: matchedEntity?.name || entityName,
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

    const payload = {
      ...coreDbFields,
      commission_items: commissionItems,
      payments: paymentItems,
      custom_attributes: customAttrs,
    };

    saveTransaction(payload, activeClientId, showToast, (savedTxn) => {
      // 🔍 LOG 3: Check what the backend returned
      console.log('--- SAVE STEP 3: API RESPONSE ---', {
        returned_list_date: savedTxn?.list_date,
        returned_acceptance_date: savedTxn?.acceptance_date,
        returned_list_price: savedTxn?.list_price,
      });

      if (!savedTxn) return;

      setHasUnsavedLocalChanges(false);
      setSelectedDeal(savedTxn);

      if (savedTxn.list_date) setListDate(String(savedTxn.list_date).substring(0, 10));
      if (savedTxn.acceptance_date) setAcceptanceDate(String(savedTxn.acceptance_date).substring(0, 10));
      if (savedTxn.closing_date) setClosingDate(String(savedTxn.closing_date).substring(0, 10));
      if (savedTxn.property_address) setPropertyAddress(savedTxn.property_address);
      if (savedTxn.client_name) setClientName(savedTxn.client_name);
      if (savedTxn.lead_source) setLeadSource(savedTxn.lead_source);

      afterSaveSuccess?.();
    });
  };

  const agentDisbursements = Object.entries(dealResult.netPayouts).filter(([e]) => agents.some((a) => a.name === e)) as [string, number][];
  const entityDisbursements = Object.entries(dealResult.netPayouts).filter(([e]) => !agents.some((a) => a.name === e)) as [string, number][];

  // Identify fee / admin fee field from transaction schema if present
  const feeFieldSetting = useMemo(() => {
    return overviewFields.find(
      (f) =>
        f.key === 'transaction_fee' ||
        f.key === 'admin_fee' ||
        f.key.toLowerCase().includes('fee') ||
        (f.label && (f.label.toLowerCase().includes('transaction fee') || f.label.toLowerCase().includes('admin fee')))
    );
  }, [overviewFields]);

  const feeField = useMemo(() => {
    if (!feeFieldSetting) return null;
    const rawVal = overviewForm.isEditingOverview
      ? overviewForm.overviewFormValues[feeFieldSetting.key]
      : selectedDeal?.[feeFieldSetting.key];
    const amount = Number(rawVal) || 0;
    return {
      label: feeFieldSetting.label || 'Transaction Fee',
      amount,
    };
  }, [feeFieldSetting, overviewForm.isEditingOverview, overviewForm.overviewFormValues, selectedDeal]);

  // Filter available agents for picker modal so already added agents are excluded
  const availableAgentsToPick = useMemo(() => {
    const assignedNames = new Set(agents.map((a) => (a?.name || '').trim().toLowerCase()));
    return knownAgents.filter(
      (a) => !assignedNames.has((a?.name || '').trim().toLowerCase())
    );
  }, [knownAgents, agents]);

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
    const navigate = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    setHasUnsavedLocalChanges(false);
    setIsEditingWaterfall(false);
    setWaterfallEditSnapshot(null);
    overviewForm.setIsEditingOverview(false);
    setIsUnsavedModalOpen(false);
    navigate?.();
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

  if (dealNotFound) {
    return (
      <div className="p-12 text-center space-y-4 max-w-md mx-auto">
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl text-3xl inline-block">⚠️</div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Transaction Not Found</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">The requested record ({routeId}) does not exist or you lack permission to view it.</p>
        <button
          onClick={() => requestNavigation(() => window.history.back())}
          className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 transition"
        >
          Return to Previous Page
        </button>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 relative">
      {toast && <div className="fixed top-5 right-5 z-50 px-4 py-3 bg-slate-900 text-white rounded-xl shadow-xl">{toast.message}</div>}

      <HeaderCard
        isNewTransaction={isNewTransaction}
        isSaving={isSaving}
        onSave={() => handleSave()}
        hasUnsavedChanges={hasUnsavedLocalChanges}
      />

      <SearchableTransactionPicker
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isDropdownOpen={isDropdownOpen}
        setIsDropdownOpen={setIsDropdownOpen}
        filteredDeals={filteredDeals}
        savedDealsCount={savedDeals.length}
        isLoadingDeals={isLoadingDeals}
        selectedDealId={selectedDealId}
        onSelectDeal={(deal) => {
          const switchToDeal = () => {
            setIsDropdownOpen(false);
            setSelectedDeal(deal);
            setSelectedDealId(deal.id);
            setDealId(deal.id);
            setDealNotFound(false);
            const clientLabel = deal.client_id ? `[${deal.client_id}] ` : '';
            setSearchQuery(`${clientLabel}${deal.id} — ${deal.property_address || ''}`);
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <LeftSidebar
          activeTab={activeTab}
          scrollToSection={scrollToSection}
          overviewFieldsCount={overviewFields.length}
          agentsCount={agents.length}
          entitiesCount={agentDisbursements.length + entityDisbursements.length}
          salesPrice={overviewForm.isEditingOverview ? (Number(overviewForm.overviewFormValues.sales_price) || salesPrice) : salesPrice}
          gciPerc={overviewForm.isEditingOverview ? (Number(overviewForm.overviewFormValues.gci_perc) || gciPerc) : gciPerc}
          gciAmount={overviewForm.isEditingOverview ? (Number(overviewForm.overviewFormValues.gci_amount) || dealResult.grossCommission) : dealResult.grossCommission}
          feeField={feeField}
          totalCommission={dealResult.totalCommission || dealResult.grossCommission}
        />

        <div className="lg:col-span-9 space-y-8">
          <TransactionOverview
            isCollapsed={collapsed.overview}
            onToggleSection={() => toggleSection('overview')}
            isEditing={overviewForm.isEditingOverview}
            onStartEdit={overviewForm.handleStartOverviewEdit}
            onCancelEdit={() => overviewForm.setIsEditingOverview(false)}
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
            isCollapsed={collapsed.commission}
            onToggleSection={() => toggleSection('commission')}
            isEditing={isEditingWaterfall}
            onStartEdit={handleStartWaterfallEdit}
            onCancelEdit={handleCancelWaterfallEdit}
            onApplyEdit={handleApplyWaterfallEdit}
            agents={agents}
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
                if (toRemove.splitType === 'PERCENT') {
                  restoredVal = Math.min(1.0, primary.splitVal + toRemove.splitVal);
                } else if (baselinePool > 0) {
                  restoredVal = Math.min(1.0, primary.splitVal + (toRemove.splitVal / baselinePool));
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
                  brokerCapLimit: newAgentInfo.brokerCapLimit,
                  brokerCapPaidYTD: newAgentInfo.brokerCapPaidYTD,
                  riskCapLimit: newAgentInfo.riskCapLimit,
                  riskPaidYTD: newAgentInfo.riskPaidYTD,
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
              const normalizedVal = (a.splitType === 'PERCENT' && a.splitVal <= 1 && a.splitVal > 0)
                ? Number((a.splitVal * 100).toFixed(4))
                : a.splitVal;
              return { ...a, splitType: newType, splitVal: normalizedVal };
            }))}
            onSplitValueChange={(id, val) => setAgents((p) => p.map((a) => a.id === id ? { ...a, splitVal: val } : a))}
            dealResult={dealResult}
            offTheTopRules={offTheTopRules}
            onAddOffTopRule={(rule) => setOffTheTopRules((p) => [...p, rule])}
            onDeleteOffTopRule={(id) => setOffTheTopRules((p) => p.filter((r) => r.id !== id))}
            onToggleOffTopRuleType={(id) => setOffTheTopRules((p) => p.map((r) => {
              if (r.id !== id) return r;
              const newType = r.type === 'PERCENT' ? 'AMOUNT' : 'PERCENT';
              const normalizedVal = (r.type === 'PERCENT' && r.value <= 1 && r.value > 0)
                ? Number((r.value * 100).toFixed(4))
                : r.value;
              return { ...r, type: newType, value: normalizedVal };
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
              const normalizedVal = (r.type === 'PERCENT' && r.value <= 1 && r.value > 0)
                ? Number((r.value * 100).toFixed(4))
                : r.value;
              return { ...r, type: newType, value: normalizedVal };
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
            onToggleAgentPostSplitType={(name, id) => setPostSplitRulesByAgent((p) => ({
              ...p,
              [name]: (p[name] || []).map((r) => {
                if (r.id !== id) return r;
                const newType = r.type === 'PERCENT' ? 'AMOUNT' : 'PERCENT';
                const normalizedVal = (r.type === 'PERCENT' && r.value <= 1 && r.value > 0)
                  ? Number((r.value * 100).toFixed(4))
                  : r.value;
                return { ...r, type: newType, value: normalizedVal };
              })
            }))}
            onUpdateAgentPostSplitValue={(name, id, val) => setPostSplitRulesByAgent((p) => ({ ...p, [name]: (p[name] || []).map((r) => r.id === id ? { ...r, value: val } : r) }))}
            onUpdateAgentPostSplitEntity={(name, id, ent) => setPostSplitRulesByAgent((p) => ({ ...p, [name]: (p[name] || []).map((r) => r.id === id ? { ...r, entity: ent, name: ent } : r) }))}
            onUpdateAgentPostSplitNote={(name, id, note) => setPostSplitRulesByAgent((p) => ({ ...p, [name]: (p[name] || []).map((r) => r.id === id ? { ...r, note } : r) }))}
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
            postSplit2RulesByAgent={postSplit2RulesByAgent}
            onAddAgentPostSplit2Rule={(name, rule) => setPostSplit2RulesByAgent((p) => ({ ...p, [name]: [...(p[name] || []), rule] }))}
            onDeleteAgentPostSplit2Rule={(name, id) => setPostSplit2RulesByAgent((p) => ({ ...p, [name]: (p[name] || []).filter((r) => r.id !== id) }))}
            onToggleAgentPostSplit2Type={(name, id) => setPostSplit2RulesByAgent((p) => ({
              ...p,
              [name]: (p[name] || []).map((r) => {
                if (r.id !== id) return r;
                const newType = r.type === 'PERCENT' ? 'AMOUNT' : 'PERCENT';
                const normalizedVal = (r.type === 'PERCENT' && r.value <= 1 && r.value > 0)
                  ? Number((r.value * 100).toFixed(4))
                  : r.value;
                return { ...r, type: newType, value: normalizedVal };
              })
            }))}
            onUpdateAgentPostSplit2Value={(name, id, val) => setPostSplit2RulesByAgent((p) => ({ ...p, [name]: (p[name] || []).map((r) => r.id === id ? { ...r, value: val } : r) }))}
            onUpdateAgentPostSplit2Entity={(name, id, ent) => setPostSplit2RulesByAgent((p) => ({ ...p, [name]: (p[name] || []).map((r) => r.id === id ? { ...r, entity: ent, name: ent } : r) }))}
            onUpdateAgentPostSplit2Note={(name, id, note) => setPostSplit2RulesByAgent((p) => ({ ...p, [name]: (p[name] || []).map((r) => r.id === id ? { ...r, note } : r) }))}
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
            knownEntities={knownEntities}
            knownAgents={knownAgents}
            preventMinus={(e) => { if (e.key === '-') e.preventDefault(); }}
            formatNumberWithCommas={(v) => String(v)}
          />

          <FinalDisbursements
            isCollapsed={collapsed.disbursements}
            onToggleSection={() => toggleSection('disbursements')}
            agentDisbursements={agentDisbursements}
            entityDisbursements={entityDisbursements}
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
        primarySplitPercent={
          agents[0]?.splitType === 'PERCENT'
            ? agents[0].splitVal * 100
            : (dealResult.agentSplitItems?.[0]?.percent || 1) * 100
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

      <UnsavedChangesModal
        isOpen={isUnsavedModalOpen}
        isSaving={isSaving}
        onStay={handleStayOnPage}
        onDiscard={handleDiscardAndLeave}
        onSave={handleSaveAndLeave}
      />

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
            splitVal: isFirstAgent ? 100 : splitVal,
            brokerCapLimit: selected.brokerCapLimit,
            brokerCapPaidYTD: selected.brokerCapPaidYTD,
            riskCapLimit: selected.riskCapLimit,
            riskPaidYTD: selected.riskPaidYTD,
          };

          setAgents((prev) => {
            if (prev.length === 0) return [newAgent];
            const primary = prev[0];
            const baselinePool = dealResult.commissionAfterPreSplit ?? dealResult.commissionAfterOffTop;
            const rate = splitType === 'PERCENT' ? (splitVal > 1 ? splitVal / 100 : splitVal) : (baselinePool > 0 ? splitVal / baselinePool : 0);
            const primaryRate = (primary.splitVal > 1 ? primary.splitVal / 100 : primary.splitVal);
            const remainingRate = Math.max(0, primaryRate - rate);
            const newPrimaryVal = primary.splitVal > 1 ? Number((remainingRate * 100).toFixed(4)) : Number(remainingRate.toFixed(4));
            return [{ ...primary, splitVal: newPrimaryVal }, ...prev.slice(1), newAgent];
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