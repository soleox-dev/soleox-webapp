// app/commission-tracker/transactions/[id]/page.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AgentConfig, DynamicRule, ToastNotification } from './types';

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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { savedDeals, overviewFields, knownAgents, knownEntities, isLoadingDeals, isSaving, saveTransaction } = useTransactionData(routeId, isNewTransaction);

  const [activeTab, setActiveTab] = useState<'overview' | 'commission' | 'disbursements'>('overview');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ overview: false, commission: false, disbursements: false });
  const toggleSection = (key: string) => setCollapsed((p) => ({ ...p, [key]: !p[key] }));

  const [dealId, setDealId] = useState('');
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [selectedDealId, setSelectedDealId] = useState('');
  const [dealNotFound, setDealNotFound] = useState(false);
  
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
  const [postSplitRulesByAgent, setPostSplitRulesByAgent] = useState<Record<string, DynamicRule[]>>({});
  const [agents, setAgents] = useState<AgentConfig[]>([]);

  const dealResult = useTransactionWaterfall({ salesPrice, gciPerc, offTheTopRules, postSplitRulesByAgent, agents, overviewFields, selectedDeal, overviewFormValues: {}, clientType });

  const activeClientId = selectedDeal?.client_id || 'DEMO';

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
    grossCommission: dealResult.grossCommission,
    totalCommission: dealResult.totalCommission,
  });

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
      setPostSplitRulesByAgent({});
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

      const dealPostSplits = dealCustomAttrs.postSplitRulesByAgent || matched.postSplitRulesByAgent;
      if (dealPostSplits && typeof dealPostSplits === 'object') {
        setPostSplitRulesByAgent(dealPostSplits);
      } else {
        setPostSplitRulesByAgent({});
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

  const handleSave = () => {
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
      postSplitRulesByAgent,
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
      ...dealResult.offTheTopItems.map((item: any, idx: number) => ({
        step_number: idx + 1,
        rule_name: item.name,
        section: 'OFF_THE_TOP',
        payee_type: 'ENTITY',
        payee_entity_id: item.entity,
        agent_id: null,
        calculated_amount: item.amount,
        final_amount: item.amount,
      })),
      ...dealResult.agentSplitItems.map((item: any, idx: number) => ({
        step_number: 10 + idx + 1,
        rule_name: `${item.agentName} Split`,
        section: 'AGENT_SPLIT',
        payee_type: 'AGENT',
        payee_entity_id: null,
        agent_id: item.agentId || item.agentName,
        calculated_amount: item.amount,
        final_amount: item.amount,
      })),
      ...dealResult.postSplitItems.map((item: any, idx: number) => ({
        step_number: 20 + idx + 1,
        rule_name: item.ruleName,
        section: 'POST_SPLIT',
        payee_type: 'ENTITY',
        payee_entity_id: item.entity,
        agent_id: item.agentName,
        calculated_amount: item.amount,
        final_amount: item.amount,
      })),
    ];

    const payload = {
      ...coreDbFields,
      commission_items: commissionItems,
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

      setSelectedDeal(savedTxn);

      if (savedTxn.list_date) setListDate(String(savedTxn.list_date).substring(0, 10));
      if (savedTxn.acceptance_date) setAcceptanceDate(String(savedTxn.acceptance_date).substring(0, 10));
      if (savedTxn.closing_date) setClosingDate(String(savedTxn.closing_date).substring(0, 10));
      if (savedTxn.property_address) setPropertyAddress(savedTxn.property_address);
      if (savedTxn.client_name) setClientName(savedTxn.client_name);
      if (savedTxn.lead_source) setLeadSource(savedTxn.lead_source);
    });
  };

  const agentDisbursements = Object.entries(dealResult.netPayouts).filter(([e]) => agents.some((a) => a.name === e)) as [string, number][];
  const entityDisbursements = Object.entries(dealResult.netPayouts).filter(([e]) => !agents.some((a) => a.name === e)) as [string, number][];

  if (dealNotFound) {
    return (
      <div className="p-12 text-center space-y-4 max-w-md mx-auto">
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl text-3xl inline-block">⚠️</div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Transaction Not Found</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">The requested record ({routeId}) does not exist or you lack permission to view it.</p>
        <button onClick={() => window.history.back()} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 transition">
          Return to Previous Page
        </button>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 relative">
      {toast && <div className="fixed top-5 right-5 z-50 px-4 py-3 bg-slate-900 text-white rounded-xl shadow-xl">{toast.message}</div>}

      <HeaderCard isNewTransaction={isNewTransaction} isSaving={isSaving} onSave={handleSave} status={dealResult.status} />

      <SearchableTransactionPicker
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isDropdownOpen={isDropdownOpen}
        setIsDropdownOpen={setIsDropdownOpen}
        filteredDeals={savedDeals}
        savedDealsCount={savedDeals.length}
        isLoadingDeals={isLoadingDeals}
        selectedDealId={selectedDealId}
        onSelectDeal={(deal) => {
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
        }}
        dropdownRef={dropdownRef}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <LeftSidebar
          activeTab={activeTab}
          scrollToSection={(s) => setActiveTab(s)}
          overviewFieldsCount={overviewFields.length}
          agentsCount={agents.length}
          entitiesCount={agentDisbursements.length + entityDisbursements.length}
          salesPrice={salesPrice}
          gciPerc={gciPerc}
          grossCommission={dealResult.grossCommission}
          commissionAfterOffTop={dealResult.grossCommission - offTheTopRules.reduce((a, b) => a + b.value, 0)}
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
            salesPrice={salesPrice}
            setSalesPrice={setSalesPrice}
            gciPerc={gciPerc}
            setGciPerc={setGciPerc}
            agents={agents}
            onOpenAddAgentModal={() => setIsAddAgentModalOpen(true)}
            onRemoveAgent={(name) => setAgents((p) => p.filter((a) => a.name !== name))}
            onToggleAgentSplitType={(id) => setAgents((p) => p.map((a) => a.id === id ? { ...a, splitType: a.splitType === 'PERCENT' ? 'AMOUNT' : 'PERCENT' } : a))}
            onSplitValueChange={(id, val) => setAgents((p) => p.map((a) => a.id === id ? { ...a, splitVal: val } : a))}
            dealResult={dealResult}
            offTheTopRules={offTheTopRules}
            onAddOffTopRule={(rule) => setOffTheTopRules((p) => [...p, rule])}
            onDeleteOffTopRule={(id) => setOffTheTopRules((p) => p.filter((r) => r.id !== id))}
            onToggleOffTopRuleType={(id) => setOffTheTopRules((p) => p.map((r) => r.id === id ? { ...r, type: r.type === 'PERCENT' ? 'AMOUNT' : 'PERCENT' } : r))}
            onUpdateOffTopRuleValue={(id, val) => setOffTheTopRules((p) => p.map((r) => r.id === id ? { ...r, value: val } : r))}
            postSplitRulesByAgent={postSplitRulesByAgent}
            onAddAgentPostSplitRule={(name, rule) => setPostSplitRulesByAgent((p) => ({ ...p, [name]: [...(p[name] || []), rule] }))}
            onDeleteAgentPostSplitRule={(name, id) => setPostSplitRulesByAgent((p) => ({ ...p, [name]: (p[name] || []).filter((r) => r.id !== id) }))}
            onToggleAgentPostSplitType={(name, id) => setPostSplitRulesByAgent((p) => ({ ...p, [name]: (p[name] || []).map((r) => r.id === id ? { ...r, type: r.type === 'PERCENT' ? 'AMOUNT' : 'PERCENT' } : r) }))}
            onUpdateAgentPostSplitValue={(name, id, val) => setPostSplitRulesByAgent((p) => ({ ...p, [name]: (p[name] || []).map((r) => r.id === id ? { ...r, value: val } : r) }))}
            knownEntities={knownEntities}
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
        onConfirm={overviewForm.executeOverviewApply}
      />

      <AgentPickerModal
        isOpen={isAddAgentModalOpen}
        onClose={() => setIsAddAgentModalOpen(false)}
        searchQuery={agentPickerSearch}
        setSearchQuery={setAgentPickerSearch}
        availableAgents={knownAgents}
        onConfirmAddAgent={(selected) => {
          const isFirstAgent = agents.length === 0;
          const newAgent: AgentConfig = {
            id: selected.id || `A_${Date.now()}`,
            name: selected.name,
            isTeamLead: selected.isTeamLead,
            splitType: 'PERCENT',
            splitVal: isFirstAgent ? 1.0 : 0.1,
            brokerCapLimit: selected.brokerCapLimit,
            brokerCapPaidYTD: selected.brokerCapPaidYTD,
            riskCapLimit: selected.riskCapLimit,
            riskPaidYTD: selected.riskPaidYTD,
          };
          setAgents((p) => [...p, newAgent]);
          if (isFirstAgent) {
            setPrimaryAgent(selected.name);
          }
          setPostSplitRulesByAgent((prev) => {
            if (prev[selected.name]) return prev;
            return {
              ...prev,
              [selected.name]: [
                { id: `risk_${Date.now()}`, name: 'Risk Mgmt', entity: 'Risk Management Reserve', type: 'AMOUNT', value: selected.isTeamLead ? 0 : 60 },
                { id: `review_${Date.now()}`, name: 'Broker Review', entity: 'Soleox Brokerage', type: 'AMOUNT', value: selected.isTeamLead ? 0 : 25 },
              ],
            };
          });
          setIsAddAgentModalOpen(false);
        }}
      />
    </div>
  );
}