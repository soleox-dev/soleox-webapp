'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface VisibilityCondition {
  id?: string;
  field_key: string;
  operator: 'IN' | 'EQUALS' | 'NOT_EQUALS' | 'IS_IN_LIST' | 'NOT_IN';
  value: string | string[];
}

interface VisibilityRulesConfig {
  operator?: 'AND' | 'OR';
  conditions?: VisibilityCondition[];
}

interface SchemaField {
  id?: string;
  field_key: string;
  field_label: string;
  field_type: string;
  section_name?: string;
  is_enabled?: boolean;
  is_required?: boolean;
  dropdown_options?: string[];
  visibility_rules?: VisibilityRulesConfig | VisibilityCondition[] | string;
  calculation_formula?: string;
}

interface AgentConfig {
  id: string;
  name: string;
  isTeamLead: boolean;
  splitType: 'PERCENT' | 'AMOUNT';
  splitVal: number;
  brokerCapLimit: number;
  brokerCapPaidYTD: number;
  riskCapLimit: number;
  riskPaidYTD: number;
}

interface DynamicRule {
  id: string;
  name: string;
  entity: string;
  type: 'PERCENT' | 'AMOUNT';
  value: number;
}

interface FieldSetting {
  id: string;
  label: string;
  key: string;
  type: string;
  section: string;
  storage_type?: 'CORE_COLUMN' | 'CUSTOM_JSON';
  is_required?: boolean;
  options?: string[];
  visibility_rules?: VisibilityRulesConfig;
  calculation_formula?: string;
}

interface ToastNotification {
  message: string;
  type: 'success' | 'error' | 'info';
}

// System required fields fallback set
const CORE_REQUIRED_FIELDS = new Set([
  'id',
  'property_address',
  'agent_id',
  'sales_price',
  'closing_date',
  'transaction_status',
  'transaction_side',
]);

// Helper utility to safely round currency values to 2 decimal places
const roundCurrency = (num: number): number => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

// Helper to format percentage values cleanly without trailing zero padding
const formatPercentageClean = (num: number): string => {
  if (num === null || num === undefined || isNaN(num)) return '';
  const target = num > 1 ? num : num * 100;
  // Clean floating point precision artifacts while preserving arbitrary user decimals
  const cleanNum = Number(Math.round(Number(target + 'e8')) + 'e-8');
  return cleanNum.toString();
};

// Helper utility to safely evaluate arithmetic & JS ternary formula expressions using current field context
const evaluateFormula = (formulaStr: string, contextValues: Record<string, any>): number => {
  if (!formulaStr || !formulaStr.trim()) return 0;

  try {
    let sanitizedFormula = formulaStr.trim();
    const sortedKeys = Object.keys(contextValues).sort((a, b) => b.length - a.length);

    for (const key of sortedKeys) {
      const val = contextValues[key];
      const regex = new RegExp(`\\b${key}\\b`, 'g');

      if (typeof val === 'number') {
        sanitizedFormula = sanitizedFormula.replace(regex, String(val));
      } else if (typeof val === 'string') {
        sanitizedFormula = sanitizedFormula.replace(regex, `'${val.replace(/'/g, "\\'")}'`);
      } else if (typeof val === 'boolean') {
        sanitizedFormula = sanitizedFormula.replace(regex, String(val));
      } else {
        sanitizedFormula = sanitizedFormula.replace(regex, '0');
      }
    }

    const result = new Function(`"use strict"; return (${sanitizedFormula})`)();
    const numResult = Number(result);

    return isNaN(numResult) ? 0 : roundCurrency(numResult);
  } catch (err) {
    console.warn(`Formula evaluation failed for "${formulaStr}":`, err);
    return 0;
  }
};

// --- ARBITRARY DECIMALS DECIMAL INPUT COMPONENT ---
interface DecimalInputProps {
  value: number;
  onChange: (val: number) => void;
  isPercent?: boolean;
  useCommas?: boolean;
  className?: string;
  placeholder?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}

function DecimalInput({
  value,
  onChange,
  isPercent = false,
  useCommas = false,
  className = '',
  placeholder = '0.00',
  onKeyDown,
  disabled = false,
}: DecimalInputProps) {
  const formatVal = (num: number) => {
    if (num === null || num === undefined || isNaN(num)) return '';

    if (isPercent) {
      return formatPercentageClean(num);
    }

    const formatted = num.toFixed(2);
    if (!useCommas) return formatted;

    const parts = formatted.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  };

  const [localStr, setLocalStr] = useState<string>(formatVal(value));
  const [isFocused, setIsFocused] = useState<boolean>(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalStr(formatVal(value));
    }
  }, [value, isPercent, useCommas, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    let raw = e.target.value.replace(/,/g, '');

    // For non-percentage currency fields, restrict input strictly to 2 decimal places
    if (!isPercent && raw.includes('.')) {
      const [integer, decimals] = raw.split('.');
      if (decimals && decimals.length > 2) {
        raw = `${integer}.${decimals.slice(0, 2)}`;
      }
    }

    if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
      setLocalStr(raw);
      let parsed = parseFloat(raw);

      if (!isNaN(parsed)) {
        if (isPercent) {
          // Convert percentage rate cleanly to decimal fraction while preserving all user digits
          const cleanRate = parsed > 100 ? 1.0 : parsed > 1 ? parsed / 100 : parsed;
          onChange(cleanRate);
        } else {
          onChange(roundCurrency(parsed));
        }
      } else {
        onChange(0);
      }
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    setLocalStr(formatVal(value));
  };

  return (
    <input
      type="text"
      value={localStr}
      onChange={handleChange}
      onFocus={() => setIsFocused(true)}
      onBlur={handleBlur}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
    />
  );
}

export default function Dashboard() {
  const params = useParams();
  const router = useRouter();
  const routeId = params?.id as string;
  const isNewTransaction = routeId === 'new';

  const [toast, setToast] = useState<ToastNotification | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const [activeTab, setActiveTab] = useState<'overview' | 'commission' | 'disbursements'>('overview');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    overview: false,
    commission: false,
    disbursements: false,
  });

  const [isEditingOverview, setIsEditingOverview] = useState<boolean>(false);
  const [overviewFormValues, setOverviewFormValues] = useState<Record<string, any>>({});

  // WARNING MODAL STATE FOR MISSING REQUIRED FIELDS
  const [showRequiredFieldsWarningModal, setShowRequiredFieldsWarningModal] = useState<boolean>(false);
  const [missingRequiredLabels, setMissingRequiredLabels] = useState<string[]>([]);

  const [dealId, setDealId] = useState<string>('');
  const [propertyAddress, setPropertyAddress] = useState<string>('');
  const [clientName, setClientName] = useState<string>('');
  const [primaryAgent, setPrimaryAgent] = useState<string>('');
  const [clientType, setClientType] = useState<string>('');
  const [closingDate, setClosingDate] = useState<string>('');
  const [listDate, setListDate] = useState<string>('');
  const [acceptanceDate, setAcceptanceDate] = useState<string>('');
  const [leadSource, setLeadSource] = useState<string>('');
  const [gciType, setGciType] = useState<string>('PERCENTAGE');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const [overviewFields, setOverviewFields] = useState<FieldSetting[]>([]);
  const [savedDeals, setSavedDeals] = useState<any[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [selectedDealId, setSelectedDealId] = useState<string>('');
  const [isLoadingDeals, setIsLoadingDeals] = useState<boolean>(true);
  const [knownAgents, setKnownAgents] = useState<{ name: string; isTeamLead: boolean }[]>([]);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isAddAgentModalOpen, setIsAddAgentModalOpen] = useState<boolean>(false);
  const [agentPickerSearch, setAgentPickerSearch] = useState<string>('');

  const [salesPrice, setSalesPrice] = useState<number>(0);
  const [gciPerc, setGciPerc] = useState<number>(0);

  const [offTheTopRules, setOffTheTopRules] = useState<DynamicRule[]>([
    { id: 'ref', name: 'Outside Referral', entity: 'Referral', type: 'PERCENT', value: 0.20 },
    { id: 'tc', name: 'TC Fee', entity: 'TC Fee', type: 'AMOUNT', value: 280 },
  ]);

  const [postSplitRulesByAgent, setPostSplitRulesByAgent] = useState<Record<string, DynamicRule[]>>({});
  const [agents, setAgents] = useState<AgentConfig[]>([]);

  const formatNumberWithCommas = (val: number | string): string => {
    if (val === '' || val === null || val === undefined || isNaN(Number(val))) return '';
    const num = Number(val);
    const parts = num.toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  };

  const preventMinus = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === '-' || e.key === 'Minus' || e.code === 'NumpadMinus') {
      e.preventDefault();
    }
  };

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const scrollToSection = (sectionId: 'overview' | 'commission' | 'disbursements') => {
    setActiveTab(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    async function loadSchema() {
      try {
        const res = await fetch('/api/schema/transactions');
        if (!res.ok) throw new Error(`Schema API returned ${res.status}`);

        const data = await res.json();
        const rawCatalog: SchemaField[] = data.catalog || data.fields || data.data || [];

        if (!Array.isArray(rawCatalog) || rawCatalog.length === 0) {
          setOverviewFields([]);
          return;
        }

        const mappedFields: FieldSetting[] = rawCatalog
          .filter((f) => f.is_enabled !== false)
          .map((f: any, idx) => {
            let rawRules = f.visibility_rules || null;

            if (typeof rawRules === 'string') {
              try {
                rawRules = JSON.parse(rawRules);
              } catch (e) {
                rawRules = null;
              }
            }

            let normalizedConfig: VisibilityRulesConfig = { operator: 'OR', conditions: [] };

            if (rawRules && typeof rawRules === 'object') {
              if (Array.isArray(rawRules)) {
                normalizedConfig.conditions = rawRules;
              } else if (Array.isArray(rawRules.conditions)) {
                normalizedConfig = {
                  operator: rawRules.operator || 'OR',
                  conditions: rawRules.conditions,
                };
              }
            }

            const isReq = Boolean(f.is_required) || CORE_REQUIRED_FIELDS.has(f.field_key);

            return {
              id: f.id || `schema_${idx}`,
              label: f.field_label || f.field_key,
              key: f.field_key,
              type: f.field_type || 'TEXT',
              section: f.section_name || 'General Info',
              storage_type: f.storage_type || 'CUSTOM_JSON',
              is_required: isReq,
              options: f.dropdown_options || f.options || [],
              visibility_rules: normalizedConfig,
              calculation_formula: f.calculation_formula && f.calculation_formula.trim().length > 0
                ? f.calculation_formula.trim()
                : undefined,
            };
          });

        setOverviewFields(mappedFields);
      } catch (err) {
        console.error('Error loading dynamic schema from database:', err);
        setOverviewFields([]);
      }
    }

    loadSchema();
  }, []);

  useEffect(() => {
    async function loadDealsAndAgents() {
      try {
        setIsLoadingDeals(true);
        let loadedDeals: any[] = [];

        const dealsRes = await fetch('/api/transactions');
        if (dealsRes.ok && dealsRes.headers.get('content-type')?.includes('application/json')) {
          const dealsData = await dealsRes.json();
          const list = dealsData.transactions || dealsData.deals || [];
          if (list.length > 0) {
            loadedDeals = list;
            setSavedDeals(loadedDeals);
          }
        }

        const agentsRes = await fetch('/api/agents');
        if (agentsRes.ok && agentsRes.headers.get('content-type')?.includes('application/json')) {
          const agentsData = await agentsRes.json();
          if (agentsData.success && agentsData.agents) {
            const safeAgents = agentsData.agents.map((ag: any) => ({
              name: ag?.name || ag?.agent_name || ag?.full_name || 'Unnamed Agent',
              isTeamLead: Boolean(ag?.is_team_lead || ag?.isTeamLead),
            }));
            setKnownAgents(safeAgents);
          }
        }

        if (isNewTransaction) {
          const freshId = `TXN_${Date.now()}`;
          setDealId(freshId);
          setSelectedDealId(freshId);
          setPropertyAddress('');
          setClientName('');
          setSalesPrice(1000000);
          setGciPerc(0.03);
          setSearchQuery(`[NEW] ${freshId} — Draft Transaction`);

          setAgents([
            {
              id: 'A1',
              name: 'Estocolmo, Marta',
              isTeamLead: false,
              splitType: 'PERCENT',
              splitVal: 0.70,
              brokerCapLimit: 8000,
              brokerCapPaidYTD: 5478.36,
              riskCapLimit: 750,
              riskPaidYTD: 140.86,
            },
            {
              id: 'A2',
              name: 'Ito, Robert',
              isTeamLead: true,
              splitType: 'PERCENT',
              splitVal: 0.30,
              brokerCapLimit: 16000,
              brokerCapPaidYTD: 11048.31,
              riskCapLimit: 750,
              riskPaidYTD: 122.68,
            },
          ]);

          setPostSplitRulesByAgent({
            'Estocolmo, Marta': createDefaultPostSplitRules(),
            'Ito, Robert': createDefaultPostSplitRules(),
          });
        } else if (routeId && loadedDeals.length > 0) {
          const matched = loadedDeals.find((d) => d.id === routeId) || loadedDeals[0];
          handleSelectDeal(matched, matched.id);
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setIsLoadingDeals(false);
      }
    }
    loadDealsAndAgents();
  }, [routeId, isNewTransaction]);

  const filteredDeals = useMemo(() => {
    if (!searchQuery.trim()) return savedDeals;
    const query = searchQuery.toLowerCase();
    return savedDeals.filter(
      (deal) =>
        deal?.id?.toLowerCase().includes(query) ||
        deal?.property_address?.toLowerCase().includes(query) ||
        (deal?.client_id && deal.client_id.toLowerCase().includes(query))
    );
  }, [savedDeals, searchQuery]);

  const availableAgentsToPick = useMemo(() => {
    const existingNames = new Set(
      agents.map((a) => (a?.name ? a.name.trim().toLowerCase() : ''))
    );
    return knownAgents.filter((ag) => {
      if (!ag || !ag.name) return false;
      const cleanName = ag.name.trim().toLowerCase();
      return (
        !existingNames.has(cleanName) &&
        cleanName.includes(agentPickerSearch.toLowerCase().trim())
      );
    });
  }, [agents, knownAgents, agentPickerSearch]);

  const createDefaultPostSplitRules = (): DynamicRule[] => [
    { id: `risk_${Date.now()}_${Math.random()}`, name: 'Risk Mgmt', entity: 'Risk Mgmt', type: 'AMOUNT', value: 60 },
    { id: `review_${Date.now()}_${Math.random()}`, name: 'Broker Review', entity: 'Broker Review', type: 'AMOUNT', value: 25 },
  ];

  const groupedOverviewSections = useMemo(() => {
    const groups: Record<string, FieldSetting[]> = {};

    overviewFields.forEach((field) => {
      const section = field.section || 'General Info';
      if (!groups[section]) {
        groups[section] = [];
      }
      groups[section].push(field);
    });

    return groups;
  }, [overviewFields]);

  const handleSelectDeal = (deal: any, targetDealId: string) => {
    setSelectedDeal(deal);
    setSelectedDealId(targetDealId);
    setDealId(deal?.id || targetDealId);
    setIsDropdownOpen(false);
    setIsEditingOverview(false);
    if (!deal) return;

    setPropertyAddress(deal.property_address || '');
    setClientName(deal.client_name || '');
    setPrimaryAgent(deal.primary_agent || deal.agent_id || '');
    setClientType(deal.client_type || deal.deal_type || deal.transaction_side || '');
    setClosingDate(deal.closing_date ? deal.closing_date.substring(0, 10) : '');
    setAcceptanceDate(deal.acceptance_date ? deal.acceptance_date.substring(0, 10) : '');
    setListDate(deal.list_date ? deal.list_date.substring(0, 10) : '');
    setLeadSource(deal.lead_source || '');

    setSearchQuery(`[${deal.client_id || 'DEMO'}] ${deal.id} — ${deal.property_address || ''}`);

    if (deal.sales_price) setSalesPrice(Math.abs(Number(deal.sales_price)));
    if (deal.gci_perc) {
      const gci = Math.abs(Number(deal.gci_perc));
      const clampedGci = gci > 1 ? gci / 100 : gci;
      setGciPerc(clampedGci);
    }

    const lineItems: any[] = deal.commission_line_items || [];

    const refItem = lineItems.find((i) => i.section === 'Referrals' || i.entity === 'Referral');
    const refVal = refItem && refItem.percent ? Math.abs(Number(refItem.percent)) : 0.20;

    const tcItem = lineItems.find((i) => i.commission_rule === 'TC Fee' || i.entity === 'TC Fee');
    const tcVal = tcItem && tcItem.amount ? Math.abs(Number(tcItem.amount)) : 280;

    setOffTheTopRules([
      { id: 'ref', name: 'Outside Referral', entity: 'Referral', type: 'PERCENT', value: Math.min(1.0, refVal > 1 ? refVal / 100 : refVal) },
      { id: 'tc', name: 'TC Fee', entity: 'TC Fee', type: 'AMOUNT', value: tcVal },
    ]);

    const agentSplitItems = lineItems.filter((i) => i.section === 'Agent Splits');
    const parsedAgents: AgentConfig[] = [];

    let primaryAgentName = deal.primary_agent || deal.agent_id || '';
    let rawAttrs: any = {};
    try {
      rawAttrs = typeof deal.custom_attributes === 'string' ? JSON.parse(deal.custom_attributes) : (deal.custom_attributes || {});
      if (rawAttrs.agent_1) primaryAgentName = rawAttrs.agent_1;
    } catch (e) {}

    if (agentSplitItems.length > 0) {
      agentSplitItems.forEach((item) => {
        if (item.agent) {
          const isAmt = Boolean(item.amount && Math.abs(Number(item.amount)) > 0 && (!item.percent || Number(item.percent) === 0));
          const val = isAmt 
            ? Math.abs(Number(item.amount)) 
            : Math.abs(Number(item.percent || 0));

          const isLead = Boolean(item.is_team_lead) || item.agent.toLowerCase().includes('ito');
          const finalVal = isAmt ? val : Math.min(1.0, val > 1 ? val / 100 : val);

          parsedAgents.push({
            id: `A_${Math.random()}`,
            name: item.agent,
            isTeamLead: isLead,
            splitType: isAmt ? 'AMOUNT' : 'PERCENT',
            splitVal: finalVal,
            brokerCapLimit: 16000,
            brokerCapPaidYTD: 11048.31,
            riskCapLimit: 750,
            riskPaidYTD: 122.68,
          });
        }
      });

      parsedAgents.unshift({
        id: 'A1',
        name: primaryAgentName,
        isTeamLead: false,
        splitType: 'PERCENT',
        splitVal: 0.70,
        brokerCapLimit: 8000,
        brokerCapPaidYTD: 5478.36,
        riskCapLimit: 750,
        riskPaidYTD: 140.86,
      });
    } else {
      parsedAgents.push(
        {
          id: 'A1',
          name: primaryAgentName || 'Unassigned Agent',
          isTeamLead: false,
          splitType: 'PERCENT',
          splitVal: 0.70,
          brokerCapLimit: 8000,
          brokerCapPaidYTD: 5478.36,
          riskCapLimit: 750,
          riskPaidYTD: 140.86,
        }
      );
    }

    setAgents(parsedAgents);

    const dynamicPostSplits: Record<string, DynamicRule[]> = {};

    parsedAgents.forEach((ag) => {
      const agentDBItems = lineItems.filter(
        (i) => i.agent && ag.name && i.agent.trim().toLowerCase() === ag.name.trim().toLowerCase()
      );

      const riskItem = agentDBItems.find(
        (i) => (i.commission_rule && i.commission_rule.includes('Risk')) || 
               (i.entity && i.entity.includes('Risk'))
      );
      
      const reviewItem = agentDBItems.find(
        (i) => (i.commission_rule && i.commission_rule.includes('Review')) || 
               (i.entity && i.entity.includes('Review'))
      );

      const riskVal = riskItem 
        ? Math.abs(Number(riskItem.amount || riskItem.percent || 0)) 
        : (ag.isTeamLead ? 0 : 60);

      const reviewVal = reviewItem 
        ? Math.abs(Number(reviewItem.amount || reviewItem.percent || 0)) 
        : (ag.isTeamLead ? 0 : 25);

      const isRiskPercent = Boolean(riskItem?.percent && Math.abs(Number(riskItem.percent)) > 0);
      const isReviewPercent = Boolean(reviewItem?.percent && Math.abs(Number(reviewItem.percent)) > 0);

      dynamicPostSplits[ag.name] = [
        {
          id: `risk_${ag.name}_${Math.random()}`,
          name: 'Risk Mgmt',
          entity: 'Risk Mgmt',
          type: isRiskPercent ? 'PERCENT' : 'AMOUNT',
          value: isRiskPercent ? Math.min(1.0, riskVal > 1 ? riskVal / 100 : riskVal) : riskVal,
        },
        {
          id: `review_${ag.name}_${Math.random()}`,
          name: 'Broker Review',
          entity: 'Broker Review',
          type: isReviewPercent ? 'PERCENT' : 'AMOUNT',
          value: isReviewPercent ? Math.min(1.0, reviewVal > 1 ? reviewVal / 100 : reviewVal) : reviewVal,
        },
      ];
    });

    setPostSplitRulesByAgent(dynamicPostSplits);
  };

  const handleStartOverviewEdit = () => {
    const initialForm: Record<string, any> = {};
    overviewFields.forEach((field) => {
      let rawVal = selectedDeal ? selectedDeal[field.key] : undefined;
      
      if (rawVal === undefined || rawVal === null || rawVal === '') {
        if (field.key === 'id') rawVal = dealId;
        else if (field.key === 'gci_type') rawVal = gciType;
        else if (field.key === 'gci_perc') rawVal = gciPerc;
        else if (field.key === 'gci_amount') rawVal = dealResult.grossCommission;
        else if (field.key === 'total_commission') rawVal = dealResult.totalCommission;
      }

      if (field.key === 'sales_price') rawVal = salesPrice;
      if (field.key === 'gci_perc') rawVal = gciPerc;
      if (field.key === 'gci_amount') rawVal = dealResult.grossCommission;
      if (field.key === 'total_commission') rawVal = dealResult.totalCommission;

      initialForm[field.key] = rawVal ?? '';
    });

    setOverviewFormValues(initialForm);
    setIsEditingOverview(true);
  };

  const handleOverviewInputChange = (key: string, val: any) => {
    setOverviewFormValues((prev) => {
      const next = { ...prev, [key]: val };

      const currentSalesPrice = Number(key === 'sales_price' ? val : next.sales_price) || 0;
      const rawGciType = key === 'gci_type' ? val : (next.gci_type || gciType);
      const cleanGciType = String(rawGciType || '').toUpperCase().replace(/[\s_]+/g, '');

      if (key === 'gci_type') {
        setGciType(val);
      }

      if (cleanGciType.includes('PERCENT')) {
        if (key === 'sales_price' || key === 'gci_perc' || key === 'gci_type') {
          const rawPerc = Number(next.gci_perc) || 0;
          const rate = rawPerc > 1 ? rawPerc / 100 : rawPerc;
          next.gci_perc = rate;
          next.gci_amount = roundCurrency(currentSalesPrice * rate);
        }
      } else if (cleanGciType.includes('FLAT') || cleanGciType.includes('AMOUNT') || cleanGciType.includes('FEE')) {
        if (key === 'sales_price' || key === 'gci_amount' || key === 'gci_type') {
          const amountVal = Number(next.gci_amount) || 0;
          // Store calcRate as decimal fraction (0.03599) rather than whole percent (3.599) to avoid 100x multiplication jumps
          const calcRate = currentSalesPrice > 0 ? (amountVal / currentSalesPrice) : 0;
          next.gci_perc = calcRate;
        }
      }

      const totCommSetting = overviewFields.find((f) => f.key === 'total_commission');

      if (totCommSetting?.calculation_formula) {
        next.total_commission = evaluateFormula(totCommSetting.calculation_formula, {
          ...selectedDeal,
          ...next,
          sales_price: currentSalesPrice,
          gci_amount: Number(next.gci_amount) || 0,
        });
      } else if (key === 'gci_amount' || key === 'sales_price' || key === 'gci_perc') {
        next.total_commission = Number(next.gci_amount) || 0;
      }

      return next;
    });
  };

  // EXECUTES FINAL OVERVIEW STATE UPDATES
  const executeOverviewApply = () => {
    if (overviewFormValues.property_address !== undefined) setPropertyAddress(overviewFormValues.property_address);
    if (overviewFormValues.client_name !== undefined) setClientName(overviewFormValues.client_name);
    if (overviewFormValues.primary_agent !== undefined) setPrimaryAgent(overviewFormValues.primary_agent);
    if (overviewFormValues.transaction_side !== undefined) setClientType(overviewFormValues.transaction_side);
    if (overviewFormValues.client_type !== undefined) setClientType(overviewFormValues.client_type);
    if (overviewFormValues.closing_date !== undefined) setClosingDate(String(overviewFormValues.closing_date).substring(0, 10));
    if (overviewFormValues.acceptance_date !== undefined) setAcceptanceDate(String(overviewFormValues.acceptance_date).substring(0, 10));
    if (overviewFormValues.list_date !== undefined) setListDate(String(overviewFormValues.list_date).substring(0, 10));
    if (overviewFormValues.lead_source !== undefined) setLeadSource(overviewFormValues.lead_source);
    if (overviewFormValues.sales_price !== undefined) setSalesPrice(Number(overviewFormValues.sales_price) || 0);
    if (overviewFormValues.gci_type !== undefined) setGciType(overviewFormValues.gci_type);
    
    if (overviewFormValues.gci_perc !== undefined) {
      const p = Number(overviewFormValues.gci_perc) || 0;
      setGciPerc(p > 1 ? p / 100 : p);
    }

    setSelectedDeal((prevDeal: any) => ({
      ...(prevDeal || {}),
      ...overviewFormValues,
      transaction_side: overviewFormValues.transaction_side || overviewFormValues.client_type || prevDeal?.transaction_side,
      status: overviewFormValues.transaction_status || overviewFormValues.status || prevDeal?.status,
      transaction_status: overviewFormValues.transaction_status || overviewFormValues.status || prevDeal?.transaction_status,
    }));

    setIsEditingOverview(false);
    setShowRequiredFieldsWarningModal(false);
  };

  // CHECK REQUIRED FIELDS BEFORE APPLYING CHANGES
  const handleApplyOverviewEdit = () => {
    const missing: string[] = [];

    overviewFields.forEach((field) => {
      const rawDbVal = selectedDeal ? selectedDeal[field.key] : undefined;
      const val = overviewFormValues[field.key] ?? rawDbVal;

      if (isFieldVisible(field, val)) {
        const validation = validateFieldValue(field, val);
        if (field.is_required && validation.isRequiredMissing) {
          missing.push(field.label);
        }
      }
    });

    if (missing.length > 0) {
      setMissingRequiredLabels(missing);
      setShowRequiredFieldsWarningModal(true);
    } else {
      executeOverviewApply();
    }
  };

  const handleSaveTransaction = async () => {
    if (isSaving) return;

    try {
      setIsSaving(true);

      const resolvedClientId = selectedDeal?.client_id || 'DEMO';
      const gciAmt = roundCurrency(salesPrice * gciPerc);

      const currentValues = {
        ...selectedDeal,
        ...overviewFormValues,
        sales_price: salesPrice,
        gci_amount: gciAmt,
        transaction_side: clientType || 'Seller',
      };

      const totCommSetting = overviewFields.find((f) => f.key === 'total_commission');
      const computedTotalCommission = totCommSetting?.calculation_formula
        ? evaluateFormula(totCommSetting.calculation_formula, currentValues)
        : gciAmt;

      const resolvedAgentId = 
        String(overviewFormValues.agent_id || primaryAgent || agents[0]?.name || 'UNKNOWN_AGENT').trim();

      const KNOWN_CORE_COLUMNS = new Set([
        'id',
        'client_id',
        'tms_id',
        'transaction_status',
        'finance_status',
        'transaction_side',
        'property_address',
        'client_name',
        'lead_source',
        'lead_owner',
        'list_price',
        'sales_price',
        'gci_type',
        'gci_perc',
        'gci_amount',
        'total_commission',
        'transaction_fee',
        'list_date',
        'acceptance_date',
        'closing_date',
        'agent_id',
      ]);

      const coreFields: Record<string, any> = {};
      const customAttributes: Record<string, any> = {
        ...(selectedDeal?.custom_attributes || {}),
        agents,
        offTheTopRules,
        postSplitRulesByAgent,
      };

      Object.entries(overviewFormValues).forEach(([key, value]) => {
        const fieldConfig = overviewFields.find((f) => f.key === key);
        const isCore = (fieldConfig && fieldConfig.storage_type === 'CORE_COLUMN') || KNOWN_CORE_COLUMNS.has(key);

        if (isCore) {
          coreFields[key] = value;
        } else {
          customAttributes[key] = value;
        }
      });

      const payload = {
        id: dealId,
        client_id: resolvedClientId,
        total_commission: computedTotalCommission,
        ...coreFields,
        agent_id: resolvedAgentId.length > 0 ? resolvedAgentId : 'UNKNOWN_AGENT',
        custom_attributes: customAttributes,
      };

      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': resolvedClientId,
        },
        body: JSON.stringify(payload),
      });

      const responseData = await res.json().catch(() => ({}));

      if (res.ok && responseData.success !== false) {
        showToast(`Transaction ${dealId} saved successfully!`, 'success');
        
        if (responseData.transaction) {
          setSelectedDeal(responseData.transaction);
          setSelectedDealId(responseData.transaction.id);
          setDealId(responseData.transaction.id);
        }

        if (isNewTransaction && responseData.transaction?.id) {
          router.push(`/commission-tracker/transactions/${responseData.transaction.id}`);
        }
      } else {
        const errorDetails = responseData.error || responseData.message || JSON.stringify(responseData);
        showToast(`Failed to save transaction: ${errorDetails}`, 'error');
      }
    } catch (err: any) {
      console.error('Save error:', err);
      showToast(`Error saving record: ${err?.message || err}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSplitValueChange = (agentId: string, val: number) => {
    const positiveVal = Math.abs(val);
    setAgents((prevAgents) =>
      prevAgents.map((ag) =>
        ag.id === agentId
          ? {
              ...ag,
              splitVal: ag.splitType === 'PERCENT' ? Math.min(1.0, positiveVal) : positiveVal,
            }
          : ag
      )
    );
  };

  const toggleAgentSplitType = (agentId: string) => {
    setAgents((prevAgents) =>
      prevAgents.map((ag) => {
        if (ag.id !== agentId) return ag;
        const nextType: 'PERCENT' | 'AMOUNT' = ag.splitType === 'PERCENT' ? 'AMOUNT' : 'PERCENT';
        const nextVal = nextType === 'PERCENT' ? 0.10 : 1000;
        return { ...ag, splitType: nextType, splitVal: nextVal };
      })
    );
  };

  const handleConfirmAddAgent = (selectedAgentObj: { name: string; isTeamLead: boolean }) => {
    const newId = `A${Date.now()}`;

    const newAgent: AgentConfig = {
      id: newId,
      name: selectedAgentObj.name,
      isTeamLead: selectedAgentObj.isTeamLead,
      splitType: 'PERCENT',
      splitVal: 0.10,
      brokerCapLimit: 10000,
      brokerCapPaidYTD: 0.0,
      riskCapLimit: 750,
      riskPaidYTD: 0.0,
    };

    setAgents((prev) => {
      const nextAgents = [...prev];
      const leadIndex = nextAgents.findIndex((ag) => ag.isTeamLead);

      if (leadIndex !== -1 && !selectedAgentObj.isTeamLead) {
        nextAgents.splice(leadIndex, 0, newAgent);
      } else {
        nextAgents.push(newAgent);
      }

      return nextAgents;
    });

    setPostSplitRulesByAgent((prev) => ({
      ...prev,
      [selectedAgentObj.name]: createDefaultPostSplitRules(),
    }));

    setIsAddAgentModalOpen(false);
    setAgentPickerSearch('');
  };

  const removeAgentByName = (agentName: string) => {
    if (agents.length > 0 && agents[0].name === agentName) {
      showToast('Primary Agent (Agent 1) cannot be deleted.', 'error');
      return;
    }

    setAgents((prev) => prev.filter((ag) => ag.name !== agentName));

    setPostSplitRulesByAgent((prev) => {
      const next = { ...prev };
      delete next[agentName];
      return next;
    });
  };

  const toggleRuleType = (id: string) => {
    setOffTheTopRules((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const nextType: 'PERCENT' | 'AMOUNT' = r.type === 'PERCENT' ? 'AMOUNT' : 'PERCENT';
        const nextVal = nextType === 'PERCENT' ? 0.05 : 100;
        return { ...r, type: nextType, value: nextVal };
      })
    );
  };

  const updateRuleValue = (id: string, val: number) => {
    const positiveVal = Math.abs(val);
    setOffTheTopRules((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, value: r.type === 'PERCENT' ? Math.min(1.0, positiveVal) : positiveVal }
          : r
      )
    );
  };

  const deleteRule = (id: string) => {
    setOffTheTopRules((prev) => prev.filter((r) => r.id !== id));
  };

  const toggleAgentPostSplitType = (agentName: string, ruleId: string) => {
    setPostSplitRulesByAgent((prev) => {
      const agentRules = prev[agentName] || [];
      const updatedRules: DynamicRule[] = agentRules.map((r) => {
        if (r.id !== ruleId) return r;
        const nextType: 'PERCENT' | 'AMOUNT' = r.type === 'PERCENT' ? 'AMOUNT' : 'PERCENT';
        const nextVal = nextType === 'PERCENT' ? 0.05 : 100;
        return { ...r, type: nextType, value: nextVal };
      });
      return { ...prev, [agentName]: updatedRules };
    });
  };

  const updateAgentPostSplitValue = (agentName: string, ruleId: string, val: number) => {
    const positiveVal = Math.abs(val);
    setPostSplitRulesByAgent((prev) => {
      const agentRules = prev[agentName] || [];
      const updatedRules: DynamicRule[] = agentRules.map((r) =>
        r.id === ruleId
          ? { ...r, value: r.type === 'PERCENT' ? Math.min(1.0, positiveVal) : positiveVal }
          : r
      );
      return { ...prev, [agentName]: updatedRules };
    });
  };

  const deleteAgentPostSplitRule = (agentName: string, ruleId: string) => {
    setPostSplitRulesByAgent((prev) => {
      const agentRules = prev[agentName] || [];
      return { ...prev, [agentName]: agentRules.filter((r) => r.id !== ruleId) };
    });
  };

  const validateFieldValue = (field: FieldSetting, val: any): { isValid: boolean; isLegacyUnmatched: boolean; isRequiredMissing?: boolean; message?: string } => {
    const isEmpty = val === undefined || val === null || String(val).trim() === '' || String(val).trim() === '—';

    if (field.is_required && isEmpty) {
      return {
        isValid: false,
        isLegacyUnmatched: false,
        isRequiredMissing: true,
        message: 'This field is required.',
      };
    }

    if (isEmpty) {
      return { isValid: true, isLegacyUnmatched: false };
    }

    if (field.type === 'SELECT' && Array.isArray(field.options) && field.options.length > 0) {
      const strVal = String(val).trim();
      const matchesOption = field.options.some(
        (opt) => opt.trim().toLowerCase() === strVal.toLowerCase()
      );

      if (!matchesOption) {
        return {
          isValid: false,
          isLegacyUnmatched: true,
          message: 'Saved value is no longer listed in active field configurations.',
        };
      }
    }

    if (field.type === 'CURRENCY' || field.type === 'NUMBER') {
      const numVal = Number(val);
      if (isNaN(numVal) || numVal < 0) {
        return { isValid: false, isLegacyUnmatched: false, message: 'Must be a valid positive number.' };
      }
    }

    return { isValid: true, isLegacyUnmatched: false };
  };

  const getControllingFieldValue = (fieldKey: string): any => {
    if (isEditingOverview && overviewFormValues[fieldKey] !== undefined) {
      return overviewFormValues[fieldKey];
    }

    if (selectedDeal) {
      if (selectedDeal[fieldKey] !== undefined && selectedDeal[fieldKey] !== null) {
        return selectedDeal[fieldKey];
      }

      let customAttrs: any = {};
      try {
        customAttrs = typeof selectedDeal.custom_attributes === 'string'
          ? JSON.parse(selectedDeal.custom_attributes)
          : (selectedDeal.custom_attributes || {});
      } catch (e) {}

      if (customAttrs[fieldKey] !== undefined && customAttrs[fieldKey] !== null) {
        return customAttrs[fieldKey];
      }

      if (fieldKey === 'transaction_status' || fieldKey === 'status') {
        return selectedDeal.transaction_status || selectedDeal.status;
      }
    }

    return undefined;
  };

  const isFieldVisible = (field: FieldSetting, rawDbVal: any): boolean => {
    const cleanStr = String(rawDbVal || '').trim();
    const hasData =
      rawDbVal !== undefined &&
      rawDbVal !== null &&
      cleanStr !== '' &&
      cleanStr !== '—';

    const config = field.visibility_rules;
    const conditions = config?.conditions || [];

    if (!conditions || conditions.length === 0) {
      return true;
    }

    const groupOperator = config?.operator || 'OR';

    const evaluateCondition = (cond: VisibilityCondition): boolean => {
      const controllingVal = getControllingFieldValue(cond.field_key);
      if (controllingVal === undefined || controllingVal === null || String(controllingVal).trim() === '') {
        return false;
      }

      const strControllingVal = String(controllingVal).trim().toLowerCase();

      const targetArray = Array.isArray(cond.value)
        ? cond.value.map((v) => String(v || '').trim().toLowerCase())
        : [String(cond.value || '').trim().toLowerCase()];

      const op = String(cond.operator || '').toUpperCase();

      if (op === 'IN' || op === 'IS_IN_LIST' || op === 'EQUALS') {
        return targetArray.includes(strControllingVal);
      }
      if (op === 'NOT_EQUALS' || op === 'NOT_IN') {
        return !targetArray.includes(strControllingVal);
      }

      return true;
    };

    const rulesSatisfied = groupOperator === 'AND'
      ? conditions.every(evaluateCondition)
      : conditions.some(evaluateCondition);

    return rulesSatisfied || hasData;
  };

  const dealResult = useMemo(() => {
    const grossComm = roundCurrency(salesPrice * gciPerc);

    const currentContext = {
      ...selectedDeal,
      ...overviewFormValues,
      sales_price: salesPrice,
      gci_amount: grossComm,
      transaction_side: clientType || 'Seller',
    };

    const totCommSetting = overviewFields.find((f) => f.key === 'total_commission');
    const computedTotalComm = totCommSetting?.calculation_formula
      ? evaluateFormula(totCommSetting.calculation_formula, currentContext)
      : grossComm;

    const offTopCalculated = offTheTopRules.map((r) => {
      const amt = r.type === 'PERCENT' ? roundCurrency(grossComm * r.value) : r.value;
      return { ...r, amount: amt };
    });

    const totalOffTop = offTopCalculated.reduce((sum, r) => sum + r.amount, 0);
    const netOffTopComm = roundCurrency(grossComm - totalOffTop);

    let totalSecondarySplitDollars = 0;
    const splitCalculated: any[] = [];

    agents.forEach((ag, idx) => {
      if (idx === 0) return;

      let dollarAmt = 0;
      let effectivePerc = 0;

      if (ag.splitType === 'PERCENT') {
        dollarAmt = roundCurrency(netOffTopComm * ag.splitVal);
        effectivePerc = ag.splitVal;
      } else {
        dollarAmt = ag.splitVal;
        effectivePerc = netOffTopComm > 0 ? dollarAmt / netOffTopComm : 0;
      }

      totalSecondarySplitDollars += dollarAmt;

      splitCalculated.push({
        agentId: ag.id,
        agentName: ag.name,
        splitType: ag.splitType,
        splitVal: ag.splitVal,
        percent: effectivePerc,
        amount: dollarAmt,
        isPrimary: false,
      });
    });

    const primaryDollarAmt = roundCurrency(Math.max(0, netOffTopComm - totalSecondarySplitDollars));
    const primaryEffectivePerc = netOffTopComm > 0 ? primaryDollarAmt / netOffTopComm : 0;

    if (agents.length > 0) {
      splitCalculated.unshift({
        agentId: agents[0].id,
        agentName: agents[0].name,
        splitType: 'PERCENT',
        splitVal: primaryEffectivePerc,
        percent: primaryEffectivePerc,
        amount: primaryDollarAmt,
        isPrimary: true,
      });
    }

    const postSplitCalculated: any[] = [];
    const netPayouts: Record<string, number> = {};

    agents.forEach((ag) => {
      const agSplitItem = splitCalculated.find((s) => s.agentId === ag.id);
      const agSplitAmt = agSplitItem ? agSplitItem.amount : 0;
      let agDeductions = 0;

      const agentRules = postSplitRulesByAgent[ag.name] || [];
      agentRules.forEach((r) => {
        const amt = r.type === 'PERCENT' ? roundCurrency(agSplitAmt * r.value) : r.value;
        agDeductions += amt;

        postSplitCalculated.push({
          id: r.id,
          agentName: ag.name,
          entity: r.entity,
          ruleName: r.name,
          type: r.type,
          value: r.value,
          amount: amt,
        });
      });

      netPayouts[ag.name] = roundCurrency(Math.max(0, agSplitAmt - agDeductions));
    });

    offTopCalculated.forEach((r) => {
      netPayouts[r.entity] = roundCurrency((netPayouts[r.entity] || 0) + r.amount);
    });

    postSplitCalculated.forEach((r) => {
      netPayouts[r.entity] = roundCurrency((netPayouts[r.entity] || 0) + r.amount);
    });

    return {
      status: 'CALCULATED_OK',
      grossCommission: grossComm,
      totalCommission: computedTotalComm,
      offTheTopItems: offTopCalculated,
      agentSplitItems: splitCalculated,
      postSplitItems: postSplitCalculated,
      netPayouts,
    };
  }, [salesPrice, gciPerc, offTheTopRules, postSplitRulesByAgent, agents, overviewFields, selectedDeal, overviewFormValues, clientType]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const totalOffTheTop = dealResult.offTheTopItems.reduce((acc, i) => acc + i.amount, 0);
  const commissionAfterOffTop = dealResult.grossCommission - totalOffTheTop;

  const agentNames = agents.map((a) => a.name);

  const agentDisbursements = Object.entries(dealResult.netPayouts).filter(([entity]) =>
    agentNames.includes(entity)
  );
  const entityDisbursements = Object.entries(dealResult.netPayouts).filter(
    ([entity]) => !agentNames.includes(entity)
  );

  const getFieldValue = (fieldKey: string, fieldType: string): { text: string } => {
    let rawVal = selectedDeal ? selectedDeal[fieldKey] : undefined;

    if (rawVal === undefined || rawVal === null || rawVal === '') {
      if (fieldKey === 'id') rawVal = dealId;
      else if (fieldKey === 'transaction_status' || fieldKey === 'status') rawVal = selectedDeal?.transaction_status || selectedDeal?.status;
      else if (fieldKey === 'gci_type') rawVal = gciType;
      else if (fieldKey === 'gci_perc') rawVal = gciPerc;
      else if (fieldKey === 'gci_amount') rawVal = dealResult.grossCommission;
      else if (fieldKey === 'total_commission') rawVal = dealResult.totalCommission;
    }

    if (rawVal === undefined || rawVal === null || rawVal === '') {
      return { text: '—' };
    }

    if (fieldType === 'CURRENCY') {
      return { text: formatCurrency(Number(rawVal) || 0) };
    }

    if (fieldType === 'NUMBER' && fieldKey === 'gci_perc') {
      const rate = Number(rawVal);
      return { text: `${formatPercentageClean(rate)}%` };
    }

    if (fieldType === 'DATE') {
      return { text: String(rawVal).substring(0, 10) };
    }

    return { text: String(rawVal) };
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 relative">
      {/* FLOATING TOP-RIGHT TOAST NOTIFICATION */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-4 duration-300 ${
            toast.type === 'success'
              ? 'bg-emerald-900/90 border-emerald-700 text-emerald-100'
              : toast.type === 'error'
              ? 'bg-rose-900/90 border-rose-700 text-rose-100'
              : 'bg-slate-900/90 border-slate-700 text-slate-100'
          }`}
        >
          <span className="text-sm font-bold">
            {toast.type === 'success' && '✅'}
            {toast.type === 'error' && '🚨'}
            {toast.type === 'info' && 'ℹ️'}
          </span>
          <span className="text-xs font-semibold">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-white font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Card */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-xl flex justify-between items-center transition-colors">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">Soleox Commission Hub</h1>
            {isNewTransaction && (
              <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 text-xs font-bold rounded">
                NEW TRANSACTION
              </span>
            )}
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Transaction Overview, Waterfall Engine & Disbursement Processing</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveTransaction}
            disabled={isSaving}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <span>{isSaving ? '⏳' : '💾'}</span>
            <span>{isSaving ? 'Saving Transaction...' : 'Save Transaction'}</span>
          </button>
          <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 rounded-full text-xs font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            STATUS: {dealResult.status}
          </div>
        </div>
      </div>

      {/* SEARCHABLE TRANSACTION PICKER */}
      <section className="bg-white dark:bg-slate-800 border border-emerald-500/40 dark:border-emerald-500/30 p-4 rounded-xl shadow-xl space-y-2 relative transition-colors" ref={dropdownRef}>
        <label className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block flex items-center justify-between">
          <span>🔍 Search Transactions ({savedDeals.length} Loaded)</span>
          {isLoadingDeals && <span className="text-slate-500 dark:text-slate-400 font-normal">Loading records...</span>}
        </label>
        
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onFocus={() => setIsDropdownOpen(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsDropdownOpen(true);
            }}
            placeholder="Type address or ID (e.g. TR000505, 123 Main St)..."
            className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium placeholder-slate-400 dark:placeholder-slate-500"
          />

          {isDropdownOpen && (
            <div className="absolute z-50 mt-1.5 w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl max-h-64 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
              {filteredDeals.length === 0 ? (
                <div className="p-3 text-xs text-slate-500 dark:text-slate-400 text-center">No matching transactions found</div>
              ) : (
                filteredDeals.map((deal) => (
                  <div
                    key={deal.id}
                    onClick={() => handleSelectDeal(deal, deal.id)}
                    className={`p-3 text-xs cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition flex justify-between items-center ${
                      selectedDealId === deal.id ? 'bg-emerald-500/10 border-l-4 border-emerald-500' : ''
                    }`}
                  >
                    <div>
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">[{deal.client_id || 'DEMO'}] {deal.id}</span>
                      <span className="text-slate-800 dark:text-slate-200 ml-2 font-medium">{deal.property_address}</span>
                    </div>
                    <span className="text-slate-500 dark:text-slate-400 font-semibold">
                      ${Number(deal.sales_price || 0).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </section>

      {/* STICKY TAB NAVIGATION & PAGE LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT SIDEBAR NAVIGATION */}
        <aside className="lg:col-span-3 space-y-3 lg:sticky lg:top-8 h-fit">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-xl space-y-1 transition-colors">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase px-3 py-1 block">
              Workflow Steps
            </span>

            <button
              onClick={() => scrollToSection('overview')}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold transition flex items-center justify-between ${
                activeTab === 'overview'
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 font-bold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span>📋</span>
                <span>1. Transaction Overview</span>
              </div>
              <span className="text-[10px] bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-400 font-bold">
                {overviewFields.length} Fields
              </span>
            </button>

            <button
              onClick={() => scrollToSection('commission')}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold transition flex items-center justify-between ${
                activeTab === 'commission'
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 font-bold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span>⚙️</span>
                <span>2. Commission Engine</span>
              </div>
              <span className="text-[10px] bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded text-emerald-700 dark:text-emerald-400 font-bold">
                {agents.length} Agents
              </span>
            </button>

            <button
              onClick={() => scrollToSection('disbursements')}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold transition flex items-center justify-between ${
                activeTab === 'disbursements'
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 font-bold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span>💸</span>
                <span>3. Final Disbursements</span>
              </div>
              <span className="text-[10px] bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded text-emerald-700 dark:text-emerald-400 font-bold">
                {agentDisbursements.length + entityDisbursements.length} Entities
              </span>
            </button>
          </div>

          {/* Quick Summary Widget */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-xl space-y-2 text-xs transition-colors">
            <span className="font-bold text-slate-800 dark:text-slate-300 block border-b border-slate-200 dark:border-slate-700 pb-2">
              Deal Quick Metrics
            </span>
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Sales Price:</span>
              <span className="text-slate-900 dark:text-white font-semibold">{formatCurrency(salesPrice)}</span>
            </div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Gross Comm ({formatPercentageClean(gciPerc)}%):</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{formatCurrency(dealResult.grossCommission)}</span>
            </div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Net Off-The-Top:</span>
              <span className="text-slate-800 dark:text-slate-300 font-semibold">{formatCurrency(commissionAfterOffTop)}</span>
            </div>
          </div>
        </aside>

        {/* RIGHT MAIN CONTENT AREA */}
        <div className="lg:col-span-9 space-y-8">
          
          {/* SECTION 1: DENSE HIGH-DENSITY TRANSACTION OVERVIEW */}
          <section id="overview" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden scroll-mt-8 transition-colors">
            <div className="bg-slate-50 dark:bg-slate-800 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="text-lg">📋</span>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">1. Transaction Overview</h2>
              </div>
              
              <div className="flex items-center gap-3">
                {!isEditingOverview ? (
                  <button
                    onClick={handleStartOverviewEdit}
                    className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5"
                  >
                    <span>✏️</span> Edit Transaction Overview
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsEditingOverview(false)}
                      className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg font-bold transition hover:bg-slate-300 dark:hover:bg-slate-600"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleApplyOverviewEdit}
                      className="text-xs bg-emerald-500 text-slate-950 px-3 py-1.5 rounded-lg font-bold transition hover:bg-emerald-400 shadow-md"
                    >
                      Apply Changes
                    </button>
                  </div>
                )}

                <button
                  onClick={() => toggleSection('overview')}
                  className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-bold transition text-base leading-none"
                  title={collapsedSections.overview ? 'Expand Section' : 'Collapse Section'}
                >
                  {collapsedSections.overview ? '+' : '−'}
                </button>
              </div>
            </div>

            {!collapsedSections.overview && (
              <div className="p-6 space-y-6">

                {Object.keys(groupedOverviewSections).length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 italic">
                    Loading Overview fields...
                  </div>
                ) : (
                  Object.entries(groupedOverviewSections).map(([sectionName, fields]) => {
                    const visibleFields = fields.filter((field) => {
                      const rawDbVal = selectedDeal ? selectedDeal[field.key] : undefined;
                      const activeValue = isEditingOverview
                        ? (overviewFormValues[field.key] ?? rawDbVal ?? '')
                        : (rawDbVal ?? '');

                      return isFieldVisible(field, activeValue);
                    });

                    if (visibleFields.length === 0) return null;

                    return (
                      <div key={sectionName} className="space-y-1">
                        <div className="border-b border-slate-300 dark:border-slate-700 pb-1.5 mb-2 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                            SECTION: {sectionName}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold ml-auto">
                            {visibleFields.length} {visibleFields.length === 1 ? 'Field' : 'Fields'}
                          </span>
                        </div>

                        <div className="divide-y divide-slate-200 dark:divide-slate-800/80 border-b border-slate-200 dark:border-slate-800">
                          {visibleFields.map((field) => {
                            const fieldData = getFieldValue(field.key, field.type);
                            const isSystemLocked = field.key === 'id' || field.key === 'total_commission';

                            const rawGciType = overviewFormValues.gci_type !== undefined ? overviewFormValues.gci_type : gciType;
                            const cleanGciType = String(rawGciType || '').toUpperCase().replace(/[\s_]+/g, '');

                            const isGciPercLocked =
                              field.key === 'gci_perc' && !cleanGciType.includes('PERCENT');

                            const isGciAmountLocked =
                              field.key === 'gci_amount' && (cleanGciType.includes('PERCENT') || !cleanGciType);

                            const isInputDisabled = isSystemLocked || isGciPercLocked || isGciAmountLocked;

                            let currentValueToValidate = selectedDeal ? selectedDeal[field.key] : undefined;
                            
                            const activeValue = isEditingOverview
                              ? (overviewFormValues[field.key] ?? currentValueToValidate ?? '')
                              : (currentValueToValidate ?? fieldData.text);

                            const validationResult = validateFieldValue(field, activeValue);

                            const formVal = overviewFormValues[field.key] ?? activeValue;
                            const dynamicOptions = field.options ? [...field.options] : [];
                            if (formVal && String(formVal).trim() !== '' && String(formVal) !== '—' && !dynamicOptions.some((opt) => opt.trim().toLowerCase() === String(formVal).trim().toLowerCase())) {
                              dynamicOptions.unshift(String(formVal));
                            }

                            return (
                              <div
                                key={field.id}
                                className={`py-1.5 px-2 flex items-center transition relative group ${
                                  validationResult.isLegacyUnmatched
                                    ? 'bg-amber-500/10 dark:bg-amber-500/10'
                                    : validationResult.isRequiredMissing && isEditingOverview
                                    ? 'bg-rose-500/10 dark:bg-rose-500/10'
                                    : 'hover:bg-slate-100/50 dark:hover:bg-slate-800/40'
                                }`}
                              >
                                <div className="w-1/3 md:w-2/5 pr-4 text-right flex justify-end items-center gap-1.5">
                                  {isSystemLocked && isEditingOverview && (
                                    <span className="text-[9px] bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1 py-0.5 rounded font-mono">
                                      LOCKED
                                    </span>
                                  )}

                                  {field.is_required && (
                                    <span className="text-rose-500 font-bold text-xs" title="Required Field">
                                      *
                                    </span>
                                  )}

                                  {validationResult.isLegacyUnmatched && (
                                    <span className="cursor-help text-xs" title={validationResult.message}>
                                      ⚠️
                                    </span>
                                  )}

                                  <span
                                    className={`text-xs font-semibold uppercase tracking-wide truncate ${
                                      validationResult.isLegacyUnmatched
                                        ? 'text-amber-600 dark:text-amber-400 font-bold'
                                        : validationResult.isRequiredMissing && isEditingOverview
                                        ? 'text-rose-600 dark:text-rose-400 font-bold'
                                        : field.is_required
                                        ? 'text-slate-800 dark:text-slate-200 font-bold'
                                        : 'text-slate-500 dark:text-slate-400'
                                    }`}
                                  >
                                    {field.label}
                                  </span>
                                </div>

                                <div className="w-2/3 md:w-3/5 pl-2 text-left relative flex items-center">
                                  {isEditingOverview ? (
                                    <div className="max-w-md w-full">
                                      {field.type === 'SELECT' && dynamicOptions.length > 0 ? (
                                        <select
                                          disabled={isInputDisabled}
                                          value={formVal}
                                          onChange={(e) => handleOverviewInputChange(field.key, e.target.value)}
                                          className={`w-full bg-white dark:bg-slate-900 border rounded px-2.5 py-1 text-xs focus:outline-none font-medium disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-800 h-7 ${
                                            validationResult.isLegacyUnmatched
                                              ? 'border-amber-500 text-amber-600 dark:text-amber-400 font-bold'
                                              : validationResult.isRequiredMissing
                                              ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold'
                                              : 'border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:border-emerald-500'
                                          }`}
                                        >
                                          <option value="">— Select Option —</option>
                                          {dynamicOptions.map((opt) => (
                                            <option key={opt} value={opt}>
                                              {opt}
                                            </option>
                                          ))}
                                        </select>
                                      ) : field.type === 'DATE' ? (
                                        <input
                                          type="date"
                                          disabled={isInputDisabled}
                                          value={
                                            overviewFormValues[field.key]
                                              ? String(overviewFormValues[field.key]).substring(0, 10)
                                              : ''
                                          }
                                          onChange={(e) => handleOverviewInputChange(field.key, e.target.value)}
                                          className={`w-full bg-white dark:bg-slate-900 border rounded px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none font-medium disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-800 h-7 ${
                                            validationResult.isRequiredMissing
                                              ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold'
                                              : 'border-slate-300 dark:border-slate-700 focus:border-emerald-500'
                                          }`}
                                        />
                                      ) : field.type === 'CURRENCY' || field.type === 'NUMBER' ? (
                                        <DecimalInput
                                          disabled={isInputDisabled}
                                          value={Number(overviewFormValues[field.key]) || 0}
                                          onChange={(val) => handleOverviewInputChange(field.key, val)}
                                          isPercent={field.key === 'gci_perc'}
                                          useCommas={field.type === 'CURRENCY'}
                                          onKeyDown={preventMinus}
                                          className={`w-full bg-white dark:bg-slate-900 border rounded px-2.5 py-1 text-xs text-slate-900 dark:text-white text-left focus:outline-none font-medium disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-800 h-7 ${
                                            validationResult.isRequiredMissing
                                              ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold'
                                              : 'border-slate-300 dark:border-slate-700 focus:border-emerald-500'
                                          }`}
                                        />
                                      ) : (
                                        <input
                                          type="text"
                                          disabled={isInputDisabled}
                                          value={overviewFormValues[field.key] ?? ''}
                                          onChange={(e) => handleOverviewInputChange(field.key, e.target.value)}
                                          className={`w-full bg-white dark:bg-slate-900 border rounded px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none font-medium disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-800 h-7 ${
                                            validationResult.isRequiredMissing
                                              ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-bold'
                                              : 'border-slate-300 dark:border-slate-700 focus:border-emerald-500'
                                          }`}
                                        />
                                      )}
                                    </div>
                                  ) : (
                                    <span
                                      className={`text-xs ${
                                        validationResult.isLegacyUnmatched
                                          ? 'text-amber-600 dark:text-amber-400 font-bold'
                                          : field.type === 'SELECT' || field.key === 'transaction_status'
                                          ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                          : 'text-slate-900 dark:text-white font-medium'
                                      }`}
                                    >
                                      {fieldData.text}
                                    </span>
                                  )}

                                  {validationResult.isLegacyUnmatched && (
                                    <div className="absolute left-2 bottom-full mb-1 hidden group-hover:flex z-30 bg-slate-900 text-amber-300 border border-amber-500/50 text-[10px] px-2 py-1 rounded shadow-xl whitespace-nowrap pointer-events-none">
                                      Saved value is no longer listed in active field configurations.
                                    </div>
                                  )}
                                  {validationResult.isRequiredMissing && isEditingOverview && (
                                    <div className="absolute left-2 bottom-full mb-1 hidden group-hover:flex z-30 bg-rose-950 text-rose-200 border border-rose-500/50 text-[10px] px-2 py-1 rounded shadow-xl whitespace-nowrap pointer-events-none">
                                      This field is required.
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </section>

          {/* SECTION 2: COMMISSION ENGINE */}
          <section id="commission" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden scroll-mt-8 transition-colors">
            <div className="bg-slate-50 dark:bg-slate-800 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="text-lg">⚙️</span>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">2. Commission Waterfall Engine</h2>
              </div>

              <button
                onClick={() => toggleSection('commission')}
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-bold transition text-base leading-none"
                title={collapsedSections.commission ? 'Expand Section' : 'Collapse Section'}
              >
                {collapsedSections.commission ? '+' : '−'}
              </button>
            </div>

            {!collapsedSections.commission && (
              <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                <div className="lg:col-span-5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-6">
                  <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">🎛️ Input Parameters</h3>
                    <button
                      onClick={() => setIsAddAgentModalOpen(true)}
                      className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 px-2.5 py-1 rounded-lg font-semibold transition"
                    >
                      + Add Agent
                    </button>
                  </div>

                  <div className="space-y-3">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      Deal Essentials
                    </span>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                          Sales Price ($) <span className="text-rose-500 font-bold">*</span>
                        </label>
                        <DecimalInput
                          value={salesPrice}
                          onChange={setSalesPrice}
                          useCommas={true}
                          onKeyDown={preventMinus}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                          GCI Rate (%) <span className="text-rose-500 font-bold">*</span>
                        </label>
                        <DecimalInput
                          value={gciPerc}
                          onChange={setGciPerc}
                          isPercent={true}
                          onKeyDown={preventMinus}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
                      Agents & Split Breakdown
                    </span>

                    {agents.map((agent, index) => {
                      const computedSplitItem = dealResult.agentSplitItems.find((s) => s.agentId === agent.id);

                      return (
                        <div
                          key={agent.id}
                          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3.5 space-y-3 relative shadow-sm"
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              {index !== 0 && (
                                <button
                                  onClick={() => removeAgentByName(agent.name)}
                                  className="text-xs text-rose-500 dark:text-rose-400 hover:text-rose-600 font-bold p-0.5 rounded hover:bg-rose-500/10"
                                  title={`Delete ${agent.name}`}
                                >
                                  🗑️
                                </button>
                              )}
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-300">{agent.name}</span>
                              {index === 0 && (
                                <span className="text-[10px] bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded font-semibold">
                                  PRIMARY
                                </span>
                              )}
                              {agent.isTeamLead && index !== 0 && (
                                <span className="text-[10px] bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-semibold">
                                  LEAD
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 items-end">
                            <div>
                              <div className="h-5 flex items-center justify-between mb-1">
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  {index === 0 ? 'Split %' : 'Agent Split'}
                                </span>
                                {index !== 0 && (
                                  <button
                                    onClick={() => toggleAgentSplitType(agent.id)}
                                    className="text-[10px] bg-slate-100 dark:bg-slate-800 border border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 px-1.5 py-0.5 rounded font-bold"
                                  >
                                    {agent.splitType === 'PERCENT' ? '%' : '$'}
                                  </button>
                                )}
                              </div>

                              {index === 0 ? (
                                <div className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400 h-[38px] flex items-center">
                                  {((computedSplitItem?.percent || 0) * 100).toFixed(1)}%
                                </div>
                              ) : (
                                <div className="relative">
                                  <DecimalInput
                                    value={agent.splitVal}
                                    onChange={(val) => handleSplitValueChange(agent.id, val)}
                                    isPercent={agent.splitType === 'PERCENT'}
                                    useCommas={agent.splitType === 'AMOUNT'}
                                    onKeyDown={preventMinus}
                                    className="w-full border rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none font-medium bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:border-emerald-500 pr-10 h-[38px]"
                                  />
                                  <span className="absolute right-2.5 top-2.5 text-xs text-slate-400 dark:text-slate-500 pointer-events-none">
                                    {agent.splitType === 'PERCENT' ? '%' : 'USD'}
                                  </span>
                                </div>
                              )}
                            </div>

                            <div>
                              <div className="h-5 flex items-center justify-between mb-1">
                                <span className="text-xs text-slate-500 dark:text-slate-400">Cap YTD</span>
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">🗄️ DB</span>
                              </div>
                              <div className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 h-[38px] flex items-center truncate">
                                {formatCurrency(agent.brokerCapPaidYTD)} / ${formatNumberWithCommas(agent.brokerCapLimit)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="lg:col-span-7 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-6">
                  <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">📊 Waterfall Execution Results</h3>
                    <div className="text-right">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">Gross Commission</span>
                      <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(dealResult.grossCommission)}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 p-3 space-y-2 shadow-sm">
                      <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-2">
                        <span className="text-xs font-bold uppercase text-slate-800 dark:text-slate-300">1. Off-The-Top Deductions</span>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Net: {formatCurrency(commissionAfterOffTop)}</span>
                      </div>
                      {offTheTopRules.map((rule) => {
                        const calculatedItem = dealResult.offTheTopItems.find((i) => i.id === rule.id);
                        return (
                          <div key={rule.id} className="flex justify-between items-center text-xs text-slate-700 dark:text-slate-300">
                            <div className="flex items-center gap-2">
                              <button onClick={() => deleteRule(rule.id)} className="text-rose-500 font-bold">🗑️</button>
                              <button onClick={() => toggleRuleType(rule.id)} className="bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-bold text-[10px]">
                                {rule.type === 'PERCENT' ? '%' : '$'}
                              </button>
                              <span>{rule.name}:</span>
                              <DecimalInput
                                value={rule.value}
                                onChange={(val) => updateRuleValue(rule.id, val)}
                                isPercent={rule.type === 'PERCENT'}
                                useCommas={rule.type === 'AMOUNT'}
                                onKeyDown={preventMinus}
                                className="w-16 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-900 dark:text-white text-right focus:outline-none focus:border-emerald-500 font-medium"
                              />
                            </div>
                            <span>-{formatCurrency(calculatedItem?.amount || 0)}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 p-3 space-y-2 shadow-sm">
                      <div className="border-b border-slate-200 dark:border-slate-700 pb-2">
                        <span className="text-xs font-bold uppercase text-slate-800 dark:text-slate-300">2. Agent Splits Breakdown</span>
                      </div>
                      {dealResult.agentSplitItems.map((item) => (
                        <div key={item.agentId} className="flex justify-between items-center text-xs text-slate-700 dark:text-slate-300">
                          <span className="font-medium text-slate-900 dark:text-white">{item.agentName} ({(item.percent * 100).toFixed(1)}% Split)</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 p-3 space-y-3 shadow-sm">
                      <div className="border-b border-slate-200 dark:border-slate-700 pb-2">
                        <span className="text-xs font-bold uppercase text-slate-800 dark:text-slate-300">3. Post-Split Deductions Per Agent</span>
                      </div>
                      {agentNames.map((agentName) => {
                        const agentRules = postSplitRulesByAgent[agentName] || [];
                        const itemsForAgent = dealResult.postSplitItems.filter((i) => i.agentName === agentName);
                        return (
                          <div key={agentName} className="bg-slate-100 dark:bg-slate-800 p-2.5 rounded border border-slate-200 dark:border-slate-700 space-y-1.5">
                            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 block">{agentName}</span>
                            {agentRules.map((rule) => {
                              const calculatedItem = itemsForAgent.find((i) => i.id === rule.id);
                              return (
                                <div key={rule.id} className="flex justify-between items-center text-[11px] text-slate-700 dark:text-slate-300">
                                  <div className="flex items-center gap-1.5">
                                    <button onClick={() => deleteAgentPostSplitRule(agentName, rule.id)} className="text-rose-500">🗑️</button>
                                    <button onClick={() => toggleAgentPostSplitType(agentName, rule.id)} className="bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 text-[9px] px-1 rounded border border-slate-200 dark:border-slate-700">
                                      {rule.type === 'PERCENT' ? '%' : '$'}
                                    </button>
                                    <span>{rule.name}:</span>
                                    <DecimalInput
                                      value={rule.value}
                                      onChange={(val) => updateAgentPostSplitValue(agentName, rule.id, val)}
                                      isPercent={rule.type === 'PERCENT'}
                                      useCommas={rule.type === 'AMOUNT'}
                                      onKeyDown={preventMinus}
                                      className="w-14 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-1 py-0.5 text-[11px] text-slate-900 dark:text-white text-right font-medium"
                                    />
                                  </div>
                                  <span>-{formatCurrency(calculatedItem?.amount || 0)}</span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

              </div>
            )}
          </section>

          {/* SECTION 3: FINAL DISBURSEMENTS & PAYMENTS */}
          <section id="disbursements" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden scroll-mt-8 transition-colors">
            <div className="bg-slate-50 dark:bg-slate-800 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="text-lg">💸</span>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">3. Final Disbursements & Payment Authorizations</h2>
              </div>

              <button
                onClick={() => toggleSection('disbursements')}
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-bold transition text-base leading-none"
                title={collapsedSections.disbursements ? 'Expand Section' : 'Collapse Section'}
              >
                {collapsedSections.disbursements ? '+' : '−'}
              </button>
            </div>

            {!collapsedSections.disbursements && (
              <div className="p-6 space-y-6">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
                      👤 Agent Net Disbursements (Direct Deposit / ACH)
                    </span>
                    <button className="text-xs bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 px-3 py-1 rounded-lg font-semibold hover:bg-emerald-500/30">
                      📄 Export PDF Disbursement Instructions
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {agentDisbursements.map(([agentName, amount]) => (
                      <div key={agentName} className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-emerald-500/30 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">{agentName}</span>
                          <span className="text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-semibold">
                            READY TO PAY
                          </span>
                        </div>
                        <div className="flex justify-between items-baseline pt-1">
                          <span className="text-xs text-slate-500 dark:text-slate-400">Net Payable Amount:</span>
                          <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(amount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    🏢 Brokerage & 3rd Party Disbursements
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {entityDisbursements.map(([entity, amount]) => (
                      <div key={entity} className="bg-slate-50 dark:bg-slate-900 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400 block truncate font-medium">{entity}</span>
                        <div className="flex justify-between items-center pt-1">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-200">{formatCurrency(amount)}</span>
                          <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 px-1.5 py-0.5 rounded">
                            Pending Escrow Wire
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}
          </section>

        </div>

      </div>

      {/* MODAL: REQUIRED FIELDS WARNING MODAL */}
      {showRequiredFieldsWarningModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex justify-center items-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-rose-500/30 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-5 relative">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl text-xl">
                ⚠️
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Missing Required Fields
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  The following required field(s) have been left blank in the Transaction Overview form:
                </p>
              </div>
            </div>

            <div className="max-h-36 overflow-y-auto bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 divide-y divide-slate-200 dark:divide-slate-800">
              {missingRequiredLabels.map((lbl, i) => (
                <div key={i} className="py-1.5 first:pt-0 last:pb-0 flex items-center justify-between text-xs font-semibold text-rose-600 dark:text-rose-400">
                  <span>{lbl}</span>
                  <span className="text-[10px] bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded uppercase font-bold">
                    Blank
                  </span>
                </div>
              ))}
            </div>

            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Are you sure you want to proceed and apply changes with these fields incomplete?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setShowRequiredFieldsWarningModal(false)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Back to Edit
              </button>
              <button
                onClick={executeOverviewApply}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-600/20 transition cursor-pointer"
              >
                Apply Changes Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: AGENT PICKER MODAL */}
      {isAddAgentModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-md rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
              <h3 className="text-lg font-bold text-emerald-600 dark:text-emerald-400">👤 Select Agent to Add</h3>
              <button onClick={() => setIsAddAgentModalOpen(false)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold">✕</button>
            </div>

            <input
              type="text"
              value={agentPickerSearch}
              onChange={(e) => setAgentPickerSearch(e.target.value)}
              placeholder="Search agent name (e.g. Haslem, Alfred)..."
              className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium"
            />

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900">
              {availableAgentsToPick.length === 0 ? (
                <div className="p-3 text-xs text-slate-500 dark:text-slate-400 text-center">No available agents found</div>
              ) : (
                availableAgentsToPick.map((agentObj) => (
                  <button
                    key={agentObj.name}
                    onClick={() => handleConfirmAddAgent(agentObj)}
                    className="w-full text-left p-3 text-xs text-slate-800 dark:text-slate-200 hover:bg-emerald-500/20 hover:text-emerald-700 dark:hover:text-emerald-300 font-semibold transition flex justify-between items-center"
                  >
                    <div className="flex items-center gap-2">
                      <span>{agentObj.name}</span>
                      {agentObj.isTeamLead && (
                        <span className="text-[10px] bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-semibold">
                          TEAM LEAD
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-semibold">+ Select</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}