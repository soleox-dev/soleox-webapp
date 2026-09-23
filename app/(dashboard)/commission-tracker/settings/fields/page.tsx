// app/(dashboard)/commission-tracker/settings/fields/page.tsx

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ReorderControls } from '@/components/ui/reorder-controls';
import { DB_TRANSACTION_COLUMNS, DB_AGENT_COLUMNS } from '@/lib/fields';

type FieldType = 'TEXT' | 'NUMBER' | 'CURRENCY' | 'PERCENT' | 'DATE' | 'SELECT' | 'AGENT_PICKER' | 'BOOLEAN';

type SingleOperator = 'EQUALS' | 'NOT_EQUALS' | 'IN' | 'NOT_EMPTY' | 'IS_EMPTY';
type GroupOperator = 'AND' | 'OR';

type RegexMode = 'MATCHES' | 'EQUALS';

export interface ConditionRule {
  id: string;
  field_key: string;
  operator: SingleOperator;
  value?: string | string[];
}

export interface VisibilityRuleGroup {
  operator: GroupOperator;
  conditions: ConditionRule[];
}

interface FieldConfig {
  id: string;
  client_id: string;
  target_table: 'transactions' | 'agents' | 'contacts';
  field_key: string;
  storage_type: 'CORE_COLUMN' | 'CUSTOM_JSON';
  section_name: string;
  section_sort_order: number;
  sort_order: number;
  field_label: string;
  field_type: FieldType;
  is_required: boolean;
  is_system: boolean;
  is_enabled: boolean;
  dropdown_options?: string[];
  visibility_rules?: VisibilityRuleGroup;
  calculation_formula?: string;
  min_value?: number;
  max_value?: number;
  min_date?: string;
  max_length?: number;
  regex_pattern?: string;
  regex_mode?: RegexMode;
}

interface ExistingCatalogField {
  field_key: string;
  field_label: string;
  field_type: FieldType;
  section_name: string;
  storage_type?: 'CORE_COLUMN' | 'CUSTOM_JSON';
  is_system: boolean;
  is_required?: boolean;
  is_enabled?: boolean;
  default_min_value?: number;
  default_max_length?: number;
  dropdown_options?: string[];
  visibility_rules?: VisibilityRuleGroup;
  calculation_formula?: string;
  regex_pattern?: string;
  regex_mode?: RegexMode;
}

interface ToastNotification {
  message: string;
  type: 'success' | 'error' | 'info';
}

const DEFAULT_AGENT_STATUS_OPTIONS = ['Active', 'Released'];

const HIDDEN_SYSTEM_KEYS = new Set([
  'client_id',
  'archived',
  'custom_attributes',
  'commission_attributes',
  'address_details',
  'co_broker',
  'settlement_vendors',
]);

const READ_ONLY_AUDIT_KEYS = new Set(['created_at', 'created_by', 'updated_at', 'updated_by']);
const INDIVIDUAL_ADDRESS_KEYS = new Set(['street', 'city', 'state', 'postal_code', 'zip_code']);
const MANDATORY_SYSTEM_KEYS = new Set([
  'id',
  'agent_id',
  'agent_name',
  'agent_email',
  'agent_status',
  'primary_agent',
  'full_name',
  'email',
  'transaction_status',
  'transaction_side',
  'total_commission',
  'gci_type',
  'gci_perc',
  'gci_amount',
]);

export default function FieldCustomizationsPage() {
  const [activeTab, setActiveTab] = useState<'transactions' | 'agents'>('transactions');
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [isSavingField, setIsSavingField] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [toast, setToast] = useState<ToastNotification | null>(null);

  const fieldLabelInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const [txFields, setTxFields] = useState<FieldConfig[]>([]);
  const [agentFields, setAgentFields] = useState<FieldConfig[]>([]);

  const [txCatalog, setTxCatalog] = useState<ExistingCatalogField[]>([]);
  const [agentCatalog, setAgentCatalog] = useState<ExistingCatalogField[]>([]);

  const [hasFormula, setHasFormula] = useState(false);

  const formatFieldLabel = (key: string, rawLabel?: string) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'tms_id') return 'TMS ID';
    if (lowerKey === 'agent_id' || lowerKey === 'primary_agent') return 'Primary Agent';
    if (lowerKey === 'id' && activeTab === 'agents') return 'Agent ID';
    if (lowerKey === 'id' && activeTab === 'transactions') return 'Transaction ID';
    if (lowerKey === 'agent_name' || lowerKey === 'full_name') return 'Full Name';
    if (lowerKey === 'agent_email' || lowerKey === 'email') return 'Email Address';
    if (lowerKey === 'agent_phone') return 'Phone Number';
    if (lowerKey === 'group_id') return 'Group / Team';
    if (lowerKey === 'agent_status') return 'Agent Status';
    if (lowerKey === 'is_team_lead') return 'Team Lead';
    if (lowerKey === 'user_id') return 'User ID';
    if (lowerKey === 'agent_onboard_date') return 'Onboard Date';
    if (lowerKey === 'agent_offboard_date') return 'Offboard Date';
    if (lowerKey === 'transaction_status') return 'Status';
    if (lowerKey === 'finance_status') return 'Finance Status';
    if (lowerKey === 'transaction_side') return 'Side';
    if (lowerKey === 'property_address') return 'Property Address';
    if (lowerKey === 'client_name') return 'Client Name';
    if (lowerKey === 'lead_source') return 'Lead Source';
    if (lowerKey === 'lead_owner') return 'Lead Owner';
    if (lowerKey === 'list_date') return 'List Date';
    if (lowerKey === 'list_price') return 'List Price';
    if (lowerKey === 'acceptance_date') return 'Acceptance Date';
    if (lowerKey === 'closing_date') return 'Closing Date';
    if (lowerKey === 'sales_price') return 'Sales Price';
    if (lowerKey === 'gci_type') return 'GCI Type';
    if (lowerKey === 'gci_perc') return 'GCI %';
    if (lowerKey === 'gci_amount') return 'GCI Amount';
    if (lowerKey === 'transaction_fee') return 'Transaction Fee';
    if (lowerKey === 'total_commission') return 'Total Commission';
    if (lowerKey === 'isa') return 'ISA';
    if (lowerKey === 'transaction_coordinator') return 'Transaction Coordinator';
    if (lowerKey === 'notes') return 'Notes';
    if (lowerKey === 'created_at') return 'Created At';
    if (lowerKey === 'created_by') return 'Created By';
    if (lowerKey === 'updated_at') return 'Updated At';
    if (lowerKey === 'updated_by') return 'Updated By';

    if (rawLabel && rawLabel.trim().length > 0 && rawLabel !== key) {
      return rawLabel;
    }

    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  // Helper to retrieve request headers with tenant context
  const getAuthHeaders = async (includeJson = false) => {
    const headers: Record<string, string> = {
      'x-client-id': 'DEMO', // Replace with dynamic state when ready
    };
    if (includeJson) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  };

  const fetchLiveCatalog = async () => {
    setIsCatalogLoading(true);
    setCatalogError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/schema/${activeTab}`, { headers });
      const data = await res.json();
      if (data.error) setCatalogError(data.error);

      // 1. Process configured fields for the Schema & Rules list
      if (data.catalog && Array.isArray(data.catalog)) {
        const processedCatalog = data.catalog
          .filter((col: any) => !HIDDEN_SYSTEM_KEYS.has(col.field_key) && col.field_key !== 'client_type')
          .map((col: any) => {
            const isAudit = READ_ONLY_AUDIT_KEYS.has(col.field_key);
            const isSystemMandatory = MANDATORY_SYSTEM_KEYS.has(col.field_key);
            const isAgentStatus = col.field_key === 'agent_status';
            
            const cleanFormula = col.calculation_formula && String(col.calculation_formula).trim().length > 0
              ? String(col.calculation_formula).trim()
              : undefined;

            const resolvedFieldType = col.field_key === 'gci_perc' ? 'PERCENT' : isAgentStatus ? 'SELECT' : col.field_type;

            return {
              ...col,
              field_label: formatFieldLabel(col.field_key, col.field_label),
              field_type: resolvedFieldType,
              dropdown_options: isAgentStatus
                ? (col.dropdown_options && col.dropdown_options.length > 0 ? col.dropdown_options : DEFAULT_AGENT_STATUS_OPTIONS)
                : col.dropdown_options,
              is_enabled: isAudit ? false : isSystemMandatory ? true : col.is_enabled,
              is_system: isSystemMandatory ? true : col.is_system,
              calculation_formula: cleanFormula,
            };
          });

        if (activeTab === 'transactions') {
          setTxFields(processedCatalog);
        } else {
          setAgentFields(processedCatalog);
        }
      } else {
        if (activeTab === 'transactions') setTxFields([]);
        else setAgentFields([]);
      }

      // 2. Process physical DB columns for the "Select Existing DB Column" catalog
      const rawDbColumns = data.db_columns && Array.isArray(data.db_columns)
        ? data.db_columns
        : (activeTab === 'transactions' ? DB_TRANSACTION_COLUMNS : DB_AGENT_COLUMNS);

      const processedDbColumns = rawDbColumns
        .filter((col: any) => !HIDDEN_SYSTEM_KEYS.has(col.field_key) && col.field_key !== 'client_type')
        .map((col: any) => {
          const isAudit = READ_ONLY_AUDIT_KEYS.has(col.field_key);
          const isSystemMandatory = MANDATORY_SYSTEM_KEYS.has(col.field_key);
          const isAgentStatus = col.field_key === 'agent_status';

          return {
            ...col,
            field_label: formatFieldLabel(col.field_key, col.field_label),
            field_type: isAgentStatus ? 'SELECT' : col.field_type,
            dropdown_options: isAgentStatus
              ? (col.dropdown_options && col.dropdown_options.length > 0 ? col.dropdown_options : DEFAULT_AGENT_STATUS_OPTIONS)
              : col.dropdown_options,
            is_enabled: isAudit ? false : isSystemMandatory ? true : (col.is_enabled !== false),
            is_system: isSystemMandatory ? true : Boolean(col.is_system),
            storage_type: 'CORE_COLUMN' as const,
          };
        });

      if (activeTab === 'transactions') {
        setTxCatalog(processedDbColumns);
      } else {
        setAgentCatalog(processedDbColumns);
      }
    } catch (err: any) {
      console.error('Failed to fetch schema catalog:', err);
      setCatalogError(err.message);
      if (activeTab === 'transactions') setTxFields([]);
      else setAgentFields([]);
    } finally {
      setIsCatalogLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveCatalog();
  }, [activeTab]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<FieldConfig | null>(null);
  const [selectionMode, setSelectionMode] = useState<'EXISTING' | 'CUSTOM'>('EXISTING');
  const [selectedCatalogKey, setSelectedCatalogKey] = useState<string>('');
  const [newDropdownOption, setNewDropdownOption] = useState<string>('');

  // States for renaming dropdown option with database update confirmation & impact message
  const [renameModal, setRenameModal] = useState<{
    isOpen: boolean;
    oldValue: string;
    newValue: string;
    hasConfirmedUnderstanding: boolean;
    isSubmitting: boolean;
    error?: string;
  }>({
    isOpen: false,
    oldValue: '',
    newValue: '',
    hasConfirmedUnderstanding: false,
    isSubmitting: false,
  });

  const [renameResultModal, setRenameResultModal] = useState<{
    isOpen: boolean;
    oldValue: string;
    newValue: string;
    updatedCount: number;
    fieldKey: string;
    fieldLabel: string;
  }>({
    isOpen: false,
    oldValue: '',
    newValue: '',
    updatedCount: 0,
    fieldKey: '',
    fieldLabel: '',
  });

  useEffect(() => {
    if (isModalOpen) {
      const timer = setTimeout(() => {
        fieldLabelInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isModalOpen]);

  const [ruleGroup, setRuleGroup] = useState<VisibilityRuleGroup>({
    operator: 'OR',
    conditions: [],
  });

  const [formData, setFormData] = useState<Partial<FieldConfig>>({
    field_label: '',
    field_key: '',
    section_name: 'Deal Essentials',
    field_type: 'TEXT',
    storage_type: 'CORE_COLUMN',
    is_enabled: true,
    is_required: false,
    min_value: 0,
    min_date: '2010-01-01',
    max_length: 100,
    dropdown_options: [],
    regex_pattern: '',
    regex_mode: 'MATCHES',
    calculation_formula: '',
  });

  const currentFields = activeTab === 'transactions' ? txFields : agentFields;
  const currentCatalog = activeTab === 'transactions' ? txCatalog : agentCatalog;

  const configuredKeys = new Set(currentFields.map((f) => f.field_key));

  const hasFullPropertyAddress = configuredKeys.has('property_address');
  const hasAnyIndividualAddressField = Array.from(configuredKeys).some((k) => INDIVIDUAL_ADDRESS_KEYS.has(k));

  const availableCatalogOptions = currentCatalog
    .filter((cat) => {
      if (configuredKeys.has(cat.field_key)) return false;
      if (HIDDEN_SYSTEM_KEYS.has(cat.field_key) || cat.field_key === 'client_type') return false;

      if (hasFullPropertyAddress && INDIVIDUAL_ADDRESS_KEYS.has(cat.field_key)) return false;
      if (hasAnyIndividualAddressField && cat.field_key === 'property_address') return false;

      return true;
    })
    .sort((a, b) => a.field_label.localeCompare(b.field_label, undefined, { sensitivity: 'base' }));

  const orderedSectionNames = Array.from(
    new Set(
      [...currentFields]
        .sort((a, b) => a.section_sort_order - b.section_sort_order)
        .map((f) => f.section_name || 'General')
    )
  );

  const orderedCurrentFields = [...currentFields].sort((a, b) => {
    if (a.section_sort_order !== b.section_sort_order) {
      return a.section_sort_order - b.section_sort_order;
    }
    return a.sort_order - b.sort_order;
  });

  const handleResetDefaults = () => {
    fetchLiveCatalog();
    showToast('Refreshed schema directly from database.', 'info');
  };

  const persistFieldsList = async (fieldsToPersist: FieldConfig[]) => {
    try {
      const headers = await getAuthHeaders(true);
      const res = await fetch('/api/schema/save', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clientId: 'DEMO',
          targetTable: activeTab,
          fields: fieldsToPersist,
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to persist order');
      }
    } catch (err: any) {
      console.error('Failed to save field order:', err);
      showToast(`Warning: Failed to persist order: ${err.message}`, 'error');
    }
  };

  const handleMoveSection = async (sectionName: string, direction: 'UP' | 'DOWN') => {
    const currentIndex = orderedSectionNames.indexOf(sectionName);
    const targetIndex = direction === 'UP' ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= orderedSectionNames.length) return;

    const newSectionOrder = [...orderedSectionNames];
    const [moved] = newSectionOrder.splice(currentIndex, 1);
    newSectionOrder.splice(targetIndex, 0, moved);

    const list = activeTab === 'transactions' ? txFields : agentFields;
    const newFields = list.map((field) => {
      const secIndex = newSectionOrder.indexOf(field.section_name || 'General');
      return secIndex !== -1 ? { ...field, section_sort_order: secIndex + 1 } : field;
    });

    if (activeTab === 'transactions') setTxFields(newFields);
    else setAgentFields(newFields);

    await persistFieldsList(newFields);
  };

  const handleMoveField = async (sectionName: string, fieldId: string, direction: 'UP' | 'DOWN') => {
    const list = activeTab === 'transactions' ? txFields : agentFields;
    const sectionFields = list
      .filter((f) => (f.section_name || 'General') === sectionName)
      .sort((a, b) => a.sort_order - b.sort_order);

    const currentIndex = sectionFields.findIndex((f) => f.id === fieldId);
    const targetIndex = direction === 'UP' ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= sectionFields.length) return;

    const updatedSectionFields = [...sectionFields];
    const [movedField] = updatedSectionFields.splice(currentIndex, 1);
    updatedSectionFields.splice(targetIndex, 0, movedField);

    const newFields = list.map((field) => {
      if ((field.section_name || 'General') === sectionName) {
        const newIdx = updatedSectionFields.findIndex((sf) => sf.id === field.id);
        return newIdx !== -1 ? { ...field, sort_order: newIdx + 1 } : field;
      }
      return field;
    });

    if (activeTab === 'transactions') setTxFields(newFields);
    else setAgentFields(newFields);

    await persistFieldsList(newFields);
  };

  const handleInlineToggle = async (
    field: FieldConfig,
    keyToToggle: 'is_enabled' | 'is_required',
    newValue: boolean
  ) => {
    const updatedField = { ...field, [keyToToggle]: newValue };

    const updateFn = (prev: FieldConfig[]) =>
      prev.map((f) => (f.id === field.id ? updatedField : f));

    if (activeTab === 'transactions') setTxFields(updateFn);
    else setAgentFields(updateFn);

    try {
      const headers = await getAuthHeaders(true);
      const res = await fetch('/api/schema/field', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clientId: 'DEMO', // Optional since backend resolves via header now
          targetTable: activeTab,
          fields: [updatedField], // Using fields array to match backend API
        }),
      });

      if (!res.ok) throw new Error('Failed to update toggle setting');
      showToast(`Updated "${field.field_label}"`, 'success');
    } catch (err: any) {
      showToast(`Failed to update setting: ${err.message}`, 'error');
      fetchLiveCatalog();
    }
  };

  const handleOpenAdd = () => {
    setEditingField(null);
    const hasAvailable = availableCatalogOptions.length > 0;
    setSelectionMode(hasAvailable ? 'EXISTING' : 'CUSTOM');
    setRuleGroup({ operator: 'OR', conditions: [] });
    setHasFormula(false);

    if (hasAvailable) {
      const firstCat = availableCatalogOptions[0];
      setSelectedCatalogKey(firstCat.field_key);
      const isAudit = READ_ONLY_AUDIT_KEYS.has(firstCat.field_key);
      const isSystemMandatory = MANDATORY_SYSTEM_KEYS.has(firstCat.field_key);

      const initialFormula = firstCat.calculation_formula || '';
      setHasFormula(Boolean(initialFormula && initialFormula.trim().length > 0));

      setFormData({
        field_label: formatFieldLabel(firstCat.field_key, firstCat.field_label),
        field_key: firstCat.field_key,
        section_name: firstCat.section_name,
        field_type: firstCat.field_key === 'agent_status' ? 'SELECT' : firstCat.field_type,
        storage_type: 'CORE_COLUMN',
        is_enabled: isAudit ? false : true,
        is_required: isSystemMandatory ? true : Boolean(firstCat.is_required),
        is_system: isSystemMandatory || Boolean(firstCat.is_system),
        min_value: firstCat.default_min_value,
        max_length: firstCat.default_max_length,
        dropdown_options: firstCat.field_key === 'agent_status' ? DEFAULT_AGENT_STATUS_OPTIONS : (firstCat.dropdown_options || []),
        regex_pattern: firstCat.regex_pattern || '',
        regex_mode: firstCat.regex_mode || 'MATCHES',
        visibility_rules: undefined,
        calculation_formula: initialFormula,
      });
    } else {
      setSelectedCatalogKey('');
      setFormData({
        field_label: '',
        field_key: '',
        section_name: activeTab === 'transactions' ? 'Deal Essentials' : 'Identity & Status',
        field_type: 'TEXT',
        storage_type: 'CUSTOM_JSON',
        is_enabled: true,
        is_required: false,
        is_system: false,
        max_length: 100,
        dropdown_options: [],
        regex_pattern: '',
        regex_mode: 'MATCHES',
        visibility_rules: undefined,
        calculation_formula: '',
      });
    }

    setIsModalOpen(true);
  };

  const handleCatalogSelectChange = (key: string) => {
    setSelectedCatalogKey(key);
    const catItem = currentCatalog.find((c) => c.field_key === key);
    if (catItem) {
      const isAudit = READ_ONLY_AUDIT_KEYS.has(catItem.field_key);
      const isSystemMandatory = MANDATORY_SYSTEM_KEYS.has(catItem.field_key);

      const initialFormula = catItem.calculation_formula || '';
      setHasFormula(Boolean(initialFormula && initialFormula.trim().length > 0));

      setFormData({
        field_label: formatFieldLabel(catItem.field_key, catItem.field_label),
        field_key: catItem.field_key,
        section_name: catItem.section_name,
        field_type: catItem.field_key === 'agent_status' ? 'SELECT' : catItem.field_type,
        storage_type: 'CORE_COLUMN',
        is_enabled: isAudit ? false : true,
        is_required: isSystemMandatory ? true : Boolean(catItem.is_required),
        is_system: isSystemMandatory || Boolean(catItem.is_system),
        min_value: catItem.default_min_value,
        max_length: catItem.default_max_length,
        dropdown_options: catItem.field_key === 'agent_status' ? DEFAULT_AGENT_STATUS_OPTIONS : (catItem.dropdown_options || []),
        regex_pattern: catItem.regex_pattern || '',
        regex_mode: catItem.regex_mode || 'MATCHES',
        visibility_rules: catItem.visibility_rules || undefined,
        calculation_formula: initialFormula,
      });
    }
  };

  const handleOpenEdit = (field: FieldConfig) => {
    setEditingField(field);
    setSelectionMode(field.storage_type === 'CUSTOM_JSON' ? 'CUSTOM' : 'EXISTING');

    const cleanFormula = field.calculation_formula || '';
    setHasFormula(Boolean(cleanFormula && cleanFormula.trim().length > 0));

    setFormData({
      ...field,
      field_label: formatFieldLabel(field.field_key, field.field_label),
      dropdown_options: field.field_key === 'agent_status' && (!field.dropdown_options || field.dropdown_options.length === 0)
        ? DEFAULT_AGENT_STATUS_OPTIONS
        : (field.dropdown_options || []),
      regex_pattern: field.regex_pattern || '',
      regex_mode: field.regex_mode || 'MATCHES',
      calculation_formula: cleanFormula,
    });

    if (field.visibility_rules && Array.isArray(field.visibility_rules.conditions)) {
      setRuleGroup({
        operator: field.visibility_rules.operator || 'OR',
        conditions: field.visibility_rules.conditions,
      });
    } else {
      setRuleGroup({ operator: 'OR', conditions: [] });
    }

    setIsModalOpen(true);
  };

  const handleAddCondition = () => {
    const availableTargets = orderedCurrentFields.filter((f) => f.field_key !== formData.field_key);
    const defaultTargetKey = availableTargets[0]?.field_key || 'transaction_status';

    const newCondition: ConditionRule = {
      id: `cond_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      field_key: defaultTargetKey,
      operator: 'EQUALS',
      value: '',
    };
    const currentConditions = Array.isArray(ruleGroup?.conditions) ? ruleGroup.conditions : [];
    setRuleGroup({ ...ruleGroup, conditions: [...currentConditions, newCondition] });
  };

  const handleUpdateCondition = (condId: string, updates: Partial<ConditionRule>) => {
    const currentConditions = Array.isArray(ruleGroup?.conditions) ? ruleGroup.conditions : [];
    setRuleGroup({
      ...ruleGroup,
      conditions: currentConditions.map((c) => (c.id === condId ? { ...c, ...updates } : c)),
    });
  };

  const handleRemoveCondition = (condId: string) => {
    const currentConditions = Array.isArray(ruleGroup?.conditions) ? ruleGroup.conditions : [];
    setRuleGroup({
      ...ruleGroup,
      conditions: currentConditions.filter((c) => c.id !== condId),
    });
  };

  const handleAddDropdownOption = () => {
    if (!newDropdownOption.trim()) return;

    const existing = formData.dropdown_options || [];
    
    const parsedEntries = newDropdownOption
      .split(/:::|\r?\n/)
      .map((opt) => opt.trim())
      .filter((opt) => opt.length > 0);

    const updatedOptions = [...existing];
    parsedEntries.forEach((opt) => {
      if (!updatedOptions.includes(opt)) {
        updatedOptions.push(opt);
      }
    });

    setFormData({
      ...formData,
      dropdown_options: updatedOptions,
    });
    setNewDropdownOption('');
  };

  const handlePasteDropdownOptions = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text');
    
    if (pastedText.includes('\n') || pastedText.includes('\r') || pastedText.includes(':::')) {
      e.preventDefault();

      const existing = formData.dropdown_options || [];
      const parsedEntries = pastedText
        .split(/:::|\r?\n/)
        .map((opt) => opt.trim())
        .filter((opt) => opt.length > 0);

      const updatedOptions = [...existing];
      parsedEntries.forEach((opt) => {
        if (!updatedOptions.includes(opt)) {
          updatedOptions.push(opt);
        }
      });

      setFormData({
        ...formData,
        dropdown_options: updatedOptions,
      });
      setNewDropdownOption('');
    }
  };

  const handleRemoveDropdownOption = (optToRemove: string) => {
    setFormData({
      ...formData,
      dropdown_options: (formData.dropdown_options || []).filter((opt) => opt !== optToRemove),
    });
  };

  const handleMoveOption = (index: number, direction: 'UP' | 'DOWN') => {
    const list = [...(formData.dropdown_options || [])];
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const [temp] = list.splice(index, 1);
    list.splice(targetIndex, 0, temp);

    setFormData({ ...formData, dropdown_options: list });
  };

  const handleSortAlphabetically = () => {
    const list = [...(formData.dropdown_options || [])].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
    setFormData({ ...formData, dropdown_options: list });
  };

  const handleStartRenameOption = (opt: string) => {
    setRenameModal({
      isOpen: true,
      oldValue: opt,
      newValue: opt,
      hasConfirmedUnderstanding: false,
      isSubmitting: false,
      error: undefined,
    });
  };

  const handleConfirmRename = async () => {
    const trimmedNew = renameModal.newValue.trim();
    const oldVal = renameModal.oldValue;

    if (!trimmedNew) {
      setRenameModal((prev) => ({ ...prev, error: 'Option value cannot be empty.' }));
      return;
    }

    if (trimmedNew === oldVal) {
      setRenameModal((prev) => ({
        ...prev,
        error: 'The new value must be different from the current value.',
      }));
      return;
    }

    const existingOptions = formData.dropdown_options || [];
    const isDuplicate = existingOptions.some(
      (opt) => opt !== oldVal && opt.toLowerCase() === trimmedNew.toLowerCase()
    );
    if (isDuplicate) {
      setRenameModal((prev) => ({
        ...prev,
        error: `An option named "${trimmedNew}" already exists in this dropdown.`,
      }));
      return;
    }

    if (!renameModal.hasConfirmedUnderstanding) {
      setRenameModal((prev) => ({
        ...prev,
        error: 'Please confirm that you understand this operation will update all existing records in the database.',
      }));
      return;
    }

    const effectiveFieldKey =
      formData.field_key ||
      editingField?.field_key ||
      `custom_${(formData.field_label || '').toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

    if (!effectiveFieldKey) {
      setRenameModal((prev) => ({
        ...prev,
        error: 'Database field key could not be determined. Please save the field first.',
      }));
      return;
    }

    try {
      setRenameModal((prev) => ({ ...prev, isSubmitting: true, error: undefined }));

      const headers = await getAuthHeaders(true);
      const res = await fetch('/api/schema/rename-option', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clientId: 'DEMO',
          targetTable: activeTab,
          fieldKey: effectiveFieldKey,
          oldValue: oldVal,
          newValue: trimmedNew,
          storageType: formData.storage_type || editingField?.storage_type || 'CORE_COLUMN',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to rename option in database');
      }

      // Update dropdown_options in the active modal form data
      const updatedOptions = (formData.dropdown_options || []).map((opt) =>
        opt === oldVal ? trimmedNew : opt
      );
      setFormData((prev) => ({
        ...prev,
        dropdown_options: updatedOptions,
      }));

      // Update catalog list in background state
      const updateCatalog = (prevList: FieldConfig[]) =>
        prevList.map((f) => {
          if (f.field_key === effectiveFieldKey) {
            return {
              ...f,
              dropdown_options: (f.dropdown_options || []).map((opt) =>
                opt === oldVal ? trimmedNew : opt
              ),
            };
          }
          return f;
        });

      if (activeTab === 'transactions') setTxFields(updateCatalog);
      else setAgentFields(updateCatalog);

      // Close the confirmation modal
      setRenameModal((prev) => ({ ...prev, isOpen: false, isSubmitting: false }));

      // Open the result popup modal
      setRenameResultModal({
        isOpen: true,
        oldValue: oldVal,
        newValue: trimmedNew,
        updatedCount: data.updatedCount ?? 0,
        fieldKey: effectiveFieldKey,
        fieldLabel: formData.field_label || effectiveFieldKey,
      });

      showToast(
        `Successfully renamed "${oldVal}" to "${trimmedNew}" (${data.updatedCount ?? 0} record${data.updatedCount === 1 ? '' : 's'} updated).`,
        'success'
      );
    } catch (err: any) {
      setRenameModal((prev) => ({
        ...prev,
        isSubmitting: false,
        error: err.message || 'Error executing rename operation',
      }));
    }
  };

  const handleSaveField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.field_label) return;

    try {
      setIsSavingField(true);

      const formattedKey =
        formData.field_key ||
        `custom_${formData.field_label.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

      const isAudit = READ_ONLY_AUDIT_KEYS.has(formattedKey);
      const isSystemMandatory = MANDATORY_SYSTEM_KEYS.has(formattedKey);

      const finalIsEnabled = isAudit ? false : isSystemMandatory ? true : Boolean(formData.is_enabled);
      const activeConditions = Array.isArray(ruleGroup?.conditions) ? ruleGroup.conditions : [];
      const finalRuleGroup = activeConditions.length > 0 ? ruleGroup : undefined;
      const finalLabel = formatFieldLabel(formattedKey, formData.field_label);

      let targetSecFields = currentFields.filter(
        (f) => (f.section_name || 'General') === (formData.section_name || 'General')
      );
      const existingSecIndex = orderedSectionNames.indexOf(formData.section_name || 'General');
      const assignedSecSortOrder =
        existingSecIndex !== -1 ? existingSecIndex + 1 : orderedSectionNames.length + 1;

      const finalFormula = hasFormula && formData.calculation_formula && formData.calculation_formula.trim().length > 0
        ? formData.calculation_formula.trim()
        : undefined;

      const fieldPayload: FieldConfig = {
        id: editingField ? editingField.id : `CFG_${formattedKey}_${Date.now()}`,
        client_id: 'DEMO',
        target_table: activeTab,
        field_key: formattedKey,
        storage_type: selectionMode === 'CUSTOM' ? 'CUSTOM_JSON' : 'CORE_COLUMN',
        section_name: formData.section_name || 'General',
        section_sort_order: assignedSecSortOrder,
        sort_order: editingField ? editingField.sort_order : targetSecFields.length + 1,
        field_label: finalLabel,
        field_type: formData.field_type || 'TEXT',
        is_required: Boolean(formData.is_required),
        is_system: isSystemMandatory || (selectionMode === 'EXISTING' && Boolean(formData.is_system)),
        is_enabled: finalIsEnabled,
        min_value: formData.min_value,
        max_value: formData.max_value,
        min_date: formData.min_date,
        max_length: formData.max_length,
        regex_pattern: formData.regex_pattern || undefined,
        regex_mode: formData.regex_mode || 'MATCHES',
        dropdown_options: formData.dropdown_options || [],
        visibility_rules: finalRuleGroup,
        calculation_formula: finalFormula,
      };

      const headers = await getAuthHeaders(true);
      const res = await fetch('/api/schema/save', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clientId: 'DEMO', // API route will also resolve dynamically via header
          targetTable: activeTab,
          fields: [fieldPayload],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save field settings');

      const savedField = data.field ? { ...fieldPayload, ...data.field } : fieldPayload;

      const updateState = (prev: FieldConfig[]) => {
        const exists = prev.some((f) => f.id === savedField.id || f.field_key === savedField.field_key);
        if (exists) {
          return prev.map((f) => (f.id === savedField.id || f.field_key === savedField.field_key ? savedField : f));
        }
        return [...prev, savedField];
      };

      if (activeTab === 'transactions') setTxFields(updateState);
      else setAgentFields(updateState);

      setIsModalOpen(false);
      showToast(`Field "${savedField.field_label}" saved successfully!`, 'success');
    } catch (err: any) {
      showToast(`Save error: ${err.message}`, 'error');
    } finally {
      setIsSavingField(false);
    }
  };

  const handleDeleteField = async (id: string) => {
    const target = currentFields.find((f) => f.id === id);
    const isSystemMandatory = MANDATORY_SYSTEM_KEYS.has(target?.field_key || '');

    if (target?.is_system || isSystemMandatory) {
      showToast('Mandatory system fields cannot be deleted.', 'error');
      return;
    }

    if (!confirm(`Are you sure you want to delete field "${target?.field_label}"?`)) return;

    try {
      const params = new URLSearchParams({
        clientId: 'DEMO',
        targetTable: activeTab,
        fieldKey: target?.field_key || '',
        ...(target?.id ? { id: target.id } : {}),
      });

      const headers = await getAuthHeaders();
      const res = await fetch(`/api/schema/field?${params.toString()}`, {
        method: 'DELETE',
        headers
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete field');
      }

      if (activeTab === 'transactions') setTxFields((prev) => prev.filter((f) => f.id !== id));
      else setAgentFields((prev) => prev.filter((f) => f.id !== id));

      showToast(`Removed field "${target?.field_label}".`, 'info');
    } catch (err: any) {
      showToast(`Delete error: ${err.message}`, 'error');
    }
  };

  const renderValidationBadge = (field: FieldConfig) => {
    const rules: string[] = [];
    if (field.min_value !== undefined) rules.push(`Min: ${field.min_value}`);
    if (field.max_value !== undefined) rules.push(`Max: ${field.max_value}`);
    if (field.min_date) rules.push(`Min Date: ${field.min_date}`);
    if (field.max_length) rules.push(`Max Len: ${field.max_length}ch`);
    if (field.regex_pattern) rules.push(`RegEx ${field.regex_mode === 'EQUALS' ? 'Equals' : 'Matches'}`);
    if (field.dropdown_options && field.dropdown_options.length > 0) {
      rules.push(`${field.dropdown_options.length} Options`);
    }

    if (rules.length === 0) return <span className="text-slate-400 font-normal">None</span>;

    return (
      <span className="text-[10px] bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/30 px-1.5 py-0.5 rounded font-mono font-bold">
        {rules.join(' | ')}
      </span>
    );
  };

  const renderRuleSummary = (ruleGroup?: VisibilityRuleGroup) => {
    if (!ruleGroup || !Array.isArray(ruleGroup.conditions) || ruleGroup.conditions.length === 0) {
      return <span className="text-slate-400 font-normal">Always Visible</span>;
    }

    const count = ruleGroup.conditions.length;
    return (
      <span className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded font-bold">
        👁️ Rules: {count} Condition{count > 1 ? 's' : ''} ({ruleGroup.operator})
      </span>
    );
  };

  const isCurrentAuditField = READ_ONLY_AUDIT_KEYS.has(formData.field_key || '');
  const isSystemMandatoryField = MANDATORY_SYSTEM_KEYS.has(formData.field_key || '') || Boolean(formData.is_system);
  const activeConditions = Array.isArray(ruleGroup?.conditions) ? ruleGroup.conditions : [];

  return (
    <div className="space-y-6 relative">
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

      {/* Top Controller Bar */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-md flex justify-between items-center transition-colors">
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('transactions')}
            className={`px-4 py-2 rounded-md text-xs font-bold transition ${
              activeTab === 'transactions'
                ? 'bg-emerald-500/10 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            📋 Transactions Schema
          </button>

          <button
            onClick={() => setActiveTab('agents')}
            className={`px-4 py-2 rounded-md text-xs font-bold transition ${
              activeTab === 'agents'
                ? 'bg-emerald-500/10 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            👤 Agents Schema
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchLiveCatalog}
            disabled={isCatalogLoading || isSavingField}
            className="px-3 py-2 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 font-bold text-xs rounded-lg transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
          >
            <span>{isCatalogLoading ? ' Syncing...' : '⚡ Sync DB Schema'}</span>
          </button>
          
          <button
            onClick={handleResetDefaults}
            disabled={isSavingField}
            className="px-3 py-2 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 font-bold text-xs rounded-lg transition cursor-pointer disabled:opacity-50"
          >
            ↺ Refresh Catalog
          </button>

          <button
            onClick={handleOpenAdd}
            disabled={isSavingField}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <span>+ Add Field Config</span>
          </button>
        </div>
      </div>

      {catalogError && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-700 dark:text-amber-400 text-xs flex justify-between items-center">
          <span>⚠️ Schema Catalog Warning: {catalogError}</span>
          <button onClick={fetchLiveCatalog} className="underline font-bold cursor-pointer">Retry</button>
        </div>
      )}

      {/* Configurations Table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-md overflow-hidden transition-colors">
        <div className="p-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <div>
            <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              {activeTab === 'transactions' ? 'Transactions' : 'Agents'} Schema & Rules
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Table: <code className="font-mono text-emerald-600 dark:text-emerald-400">client_field_configurations</code>
            </p>
          </div>
          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold px-2 py-1 rounded border border-slate-200 dark:border-slate-700">
            {currentFields.length} Configurations Active
          </span>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-700/60 max-h-[700px] overflow-y-auto">
          {orderedSectionNames.map((secName, secIdx) => {
            const fields = currentFields
              .filter((f) => (f.section_name || 'General') === secName)
              .sort((a, b) => a.sort_order - b.sort_order);

            return (
              <div key={secName} className="p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                      📁 Section:
                    </span>
                    <span className="bg-emerald-500/10 px-2.5 py-0.5 rounded border border-emerald-500/20 text-xs font-bold text-slate-900 dark:text-white">
                      {secName}
                    </span>

                    <ReorderControls
                      onMoveUp={() => handleMoveSection(secName, 'UP')}
                      onMoveDown={() => handleMoveSection(secName, 'DOWN')}
                      isFirst={secIdx === 0}
                      isLast={secIdx === orderedSectionNames.length - 1}
                    />
                  </div>

                  <span className="text-[10px] text-slate-400 font-mono">{fields.length} Fields</span>
                </div>

                <div className="space-y-2">
                  {fields.map((f, fieldIdx) => {
                    const isSystemMandatory = MANDATORY_SYSTEM_KEYS.has(f.field_key) || f.is_system;
                    const isAudit = READ_ONLY_AUDIT_KEYS.has(f.field_key);
                    
                    // Strict formula badge check: Field type must be CURRENCY, NUMBER, or PERCENT and formula string must not be empty
                    const isNumericType = f.field_type === 'CURRENCY' || f.field_type === 'NUMBER' || f.field_type === 'PERCENT';
                    const hasFormula = Boolean(isNumericType && f.calculation_formula && f.calculation_formula.trim().length > 0);

                    return (
                      <div
                        key={f.id}
                        className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700 text-xs hover:border-slate-300 dark:hover:border-slate-600 transition"
                      >
                        <div className="flex items-center gap-3">
                          <ReorderControls
                            size="sm"
                            orientation="vertical"
                            onMoveUp={() => handleMoveField(secName, f.id, 'UP')}
                            onMoveDown={() => handleMoveField(secName, f.id, 'DOWN')}
                            isFirst={fieldIdx === 0}
                            isLast={fieldIdx === fields.length - 1}
                          />

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 dark:text-white">{f.field_label}</span>
                              {isSystemMandatory && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 font-mono">
                                  SYSTEM
                                </span>
                              )}
                              {f.storage_type === 'CUSTOM_JSON' && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                                  CUSTOM ATTRIBUTE
                                </span>
                              )}
                              {hasFormula && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 font-mono">
                                  FORMULA
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[10px] font-mono text-slate-400">Key: {f.field_key}</span>
                              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 rounded border border-emerald-500/20">
                                {f.field_type}
                              </span>

                              <div className="flex items-center gap-1 text-[10px]">
                                <span className="text-slate-400">Visibility:</span>
                                {renderRuleSummary(f.visibility_rules)}
                              </div>

                              <div className="flex items-center gap-1 text-[10px]">
                                <span className="text-slate-400">Validations:</span>
                                {renderValidationBadge(f)}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Inline Controls & Action Buttons */}
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-3 border-r border-slate-200 dark:border-slate-700 pr-3 text-[11px]">
                            <label
                              className={`flex items-center gap-1.5 ${
                                isAudit ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                              }`}
                              title={isAudit ? 'Audit field state cannot be modified' : 'Toggle field visibility in forms'}
                            >
                              <input
                                type="checkbox"
                                disabled={isAudit}
                                checked={isAudit ? false : f.is_enabled}
                                onChange={(e) => handleInlineToggle(f, 'is_enabled', e.target.checked)}
                                className="rounded text-emerald-500 focus:ring-emerald-500 disabled:cursor-not-allowed cursor-pointer"
                              />
                              <span className="text-slate-600 dark:text-slate-400 font-medium">Enabled</span>
                            </label>

                            <label
                              className={`flex items-center gap-1.5 ${
                                isSystemMandatory ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                              }`}
                              title={isSystemMandatory ? 'System fields are required by default' : 'Toggle required validation'}
                            >
                              <input
                                type="checkbox"
                                disabled={isSystemMandatory}
                                checked={f.is_required}
                                onChange={(e) => handleInlineToggle(f, 'is_required', e.target.checked)}
                                className="rounded text-emerald-500 focus:ring-emerald-500 disabled:cursor-not-allowed cursor-pointer"
                              />
                              <span className="text-slate-600 dark:text-slate-400 font-medium">Required</span>
                            </label>
                          </div>

                          <button
                            onClick={() => handleOpenEdit(f)}
                            className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded text-[10px] font-bold transition cursor-pointer"
                          >
                            Configure
                          </button>

                          <button
                            disabled={isSystemMandatory}
                            onClick={() => handleDeleteField(f.id)}
                            className={`text-rose-500 hover:text-rose-600 font-bold p-1 rounded hover:bg-rose-500/10 cursor-pointer ${
                              isSystemMandatory ? 'opacity-20 cursor-not-allowed' : ''
                            }`}
                            title={isSystemMandatory ? 'Mandatory system fields cannot be deleted' : 'Delete field configuration'}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL: CONFIGURATION WITH DYNAMIC VISIBILITY & FORMULA BUILDER */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-xl rounded-xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingField ? `Configure ${editingField.field_label}` : 'Add Field Configuration'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                tabIndex={-1}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {!editingField && (
              <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold">
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => {
                    setSelectionMode('EXISTING');
                    const targetKey = availableCatalogOptions.some((c) => c.field_key === selectedCatalogKey)
                      ? selectedCatalogKey
                      : availableCatalogOptions[0]?.field_key;
                    if (targetKey) {
                      handleCatalogSelectChange(targetKey);
                    }
                  }}
                  disabled={availableCatalogOptions.length === 0}
                  className={`flex-1 py-1.5 rounded-md transition cursor-pointer ${
                    selectionMode === 'EXISTING'
                      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-40'
                  }`}
                >
                  Select Existing DB Column ({availableCatalogOptions.length})
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => {
                    setSelectionMode('CUSTOM');
                    setFormData({
                      field_label: '',
                      field_key: '',
                      section_name: activeTab === 'transactions' ? 'Deal Essentials' : 'Identity & Status',
                      field_type: 'TEXT',
                      storage_type: 'CUSTOM_JSON',
                      is_enabled: true,
                      is_required: false,
                      dropdown_options: [],
                      calculation_formula: '',
                    });
                    setHasFormula(false);
                  }}
                  className={`flex-1 py-1.5 rounded-md transition cursor-pointer ${
                    selectionMode === 'CUSTOM'
                      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  + Create Custom JSON Field
                </button>
              </div>
            )}

            <form onSubmit={handleSaveField} className="space-y-4 text-xs">
              {!editingField && selectionMode === 'EXISTING' && (
                <div>
                  <label className="block text-slate-500 font-bold mb-1">
                    Select Existing Database Column *
                  </label>
                  <select
                    value={selectedCatalogKey}
                    onChange={(e) => handleCatalogSelectChange(e.target.value)}
                    className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-white font-medium"
                  >
                    {availableCatalogOptions.map((item) => (
                      <option key={item.field_key} value={item.field_key}>
                        {item.field_label} ({item.field_key} • {item.field_type})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Field Label & Section Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Field Label *</label>
                  <input
                    ref={fieldLabelInputRef}
                    type="text"
                    required
                    tabIndex={1}
                    value={formData.field_label || ''}
                    onChange={(e) => setFormData({ ...formData, field_label: e.target.value })}
                    placeholder="e.g. Escrow Officer Name"
                    className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 font-bold mb-1">Section Group *</label>
                  <input
                    type="text"
                    required
                    tabIndex={2}
                    value={formData.section_name || ''}
                    onChange={(e) => setFormData({ ...formData, section_name: e.target.value })}
                    placeholder="e.g. Key Dates, Financials"
                    className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Control Type & Field Key */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Control Type *</label>
                  <select
                    tabIndex={3}
                    disabled={isSystemMandatoryField}
                    value={formData.field_type || 'TEXT'}
                    onChange={(e) => {
                      const newType = e.target.value as FieldType;
                      setFormData({ ...formData, field_type: newType });
                      if (newType !== 'CURRENCY' && newType !== 'NUMBER' && newType !== 'PERCENT') {
                        setHasFormula(false);
                        setFormData((prev) => ({ ...prev, calculation_formula: '' }));
                      }
                    }}
                    className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="TEXT">Text Input</option>
                    <option value="CURRENCY">Currency ($)</option>
                    <option value="PERCENT">Percent</option>
                    <option value="NUMBER">Number</option>
                    <option value="DATE">Date Picker</option>
                    <option value="SELECT">Select Dropdown</option>
                    <option value="AGENT_PICKER">Agent Picker</option>
                    <option value="BOOLEAN">Boolean Toggle</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-500 font-bold mb-1">Database Field Key</label>
                  <input
                    type="text"
                    tabIndex={-1}
                    disabled={formData.storage_type === 'CORE_COLUMN'}
                    value={formData.field_key || ''}
                    onChange={(e) => setFormData({ ...formData, field_key: e.target.value })}
                    placeholder="Auto-generated..."
                    className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-white font-mono disabled:opacity-50"
                  />
                </div>
              </div>

              {/* VISUAL CONDITIONAL VISIBILITY RULE BUILDER */}
              <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
                    👁️ Custom Visibility Logic Builder
                  </span>

                  {activeConditions.length > 1 && (
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-0.5 rounded border border-slate-300 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => setRuleGroup({ ...ruleGroup, operator: 'OR' })}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                          ruleGroup.operator === 'OR'
                            ? 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border border-blue-500/30'
                            : 'text-slate-500'
                        }`}
                      >
                        Match ANY (OR)
                      </button>
                      <button
                        type="button"
                        onClick={() => setRuleGroup({ ...ruleGroup, operator: 'AND' })}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                          ruleGroup.operator === 'AND'
                            ? 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border border-blue-500/30'
                            : 'text-slate-500'
                        }`}
                      >
                        Match ALL (AND)
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                  {activeConditions.length === 0 ? (
                    <p className="text-slate-400 italic text-center py-2">
                      No visibility rules configured. Field will be visible across all forms.
                    </p>
                  ) : (
                    activeConditions.map((cond, idx) => {
                      const targetFieldConfig = currentFields.find((f) => f.field_key === cond.field_key);

                      return (
                        <div key={cond.id} className="space-y-2">
                          {idx > 0 && (
                            <div className="text-center font-bold text-[10px] text-blue-500 uppercase tracking-wider">
                              — {ruleGroup.operator} —
                            </div>
                          )}

                          <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
                            <div className="grid grid-cols-12 gap-2 items-center">
                              <div className="col-span-5">
                                <label className="text-[10px] font-bold text-slate-400 block mb-0.5">If Field</label>
                                <select
                                  value={cond.field_key}
                                  onChange={(e) => handleUpdateCondition(cond.id, { field_key: e.target.value })}
                                  className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded p-1 text-slate-900 dark:text-white font-medium"
                                >
                                  {orderedCurrentFields
                                    .filter((f) => f.field_key !== formData.field_key)
                                    .map((f) => (
                                      <option key={f.field_key} value={f.field_key}>
                                        {f.field_label} ({f.section_name})
                                      </option>
                                    ))}
                                </select>
                              </div>

                              <div className="col-span-4">
                                <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Condition</label>
                                <select
                                  value={cond.operator}
                                  onChange={(e) => handleUpdateCondition(cond.id, { operator: e.target.value as SingleOperator })}
                                  className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded p-1 text-slate-900 dark:text-white"
                                >
                                  <option value="EQUALS">Equals (=)</option>
                                  <option value="NOT_EQUALS">Not Equals (≠)</option>
                                  <option value="IN">Is In List</option>
                                  <option value="NOT_EMPTY">Is Not Empty</option>
                                  <option value="IS_EMPTY">Is Empty</option>
                                </select>
                              </div>

                              <div className="col-span-3 text-right pt-3">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCondition(cond.id)}
                                  className="px-2 py-1 text-rose-500 hover:text-rose-600 font-bold rounded hover:bg-rose-500/10 cursor-pointer"
                                >
                                  Remove ✕
                                </button>
                              </div>
                            </div>

                            {(cond.operator === 'EQUALS' || cond.operator === 'NOT_EQUALS' || cond.operator === 'IN') && (
                              <div className="pt-1 border-t border-slate-100 dark:border-slate-700">
                                {cond.operator === 'IN' && targetFieldConfig?.dropdown_options ? (
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 block">Select Target Values:</label>
                                    <div className="flex flex-wrap gap-1.5">
                                      {targetFieldConfig.dropdown_options.map((opt) => {
                                        const selectedValues = Array.isArray(cond.value) ? cond.value : [];
                                        const isSelected = selectedValues.includes(opt);

                                        return (
                                          <button
                                            key={opt}
                                            type="button"
                                            onClick={() => {
                                              const next = isSelected
                                                ? selectedValues.filter((v) => v !== opt)
                                                : [...selectedValues, opt];
                                              handleUpdateCondition(cond.id, { value: next });
                                            }}
                                            className={`px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
                                              isSelected
                                                ? 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/40'
                                                : 'bg-slate-100 dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                                            }`}
                                          >
                                            {opt}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Value to Compare:</label>
                                    <input
                                      type="text"
                                      value={String(cond.value || '')}
                                      onChange={(e) => handleUpdateCondition(cond.id, { value: e.target.value })}
                                      placeholder="e.g. Seller or Pending..."
                                      className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded p-1 text-slate-900 dark:text-white font-medium"
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}

                  <button
                    type="button"
                    onClick={handleAddCondition}
                    className="w-full py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-400 border border-blue-500/30 rounded-lg font-bold transition cursor-pointer"
                  >
                    + Add Condition Rule
                  </button>
                </div>
              </div>

              {/* Data Validation Enforcements Section */}
              <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider block">
                  🚨 Data Validation Enforcements
                </span>

                {(formData.field_type === 'CURRENCY' || formData.field_type === 'NUMBER' || formData.field_type === 'PERCENT') && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-500 font-bold mb-1">Minimum Value</label>
                      <input
                        type="number"
                        value={formData.min_value ?? ''}
                        onChange={(e) => setFormData({ ...formData, min_value: e.target.value !== '' ? Number(e.target.value) : undefined })}
                        placeholder="e.g. 0 ($ or %)"
                        className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-mono text-slate-900 dark:text-white font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-bold mb-1">Maximum Value</label>
                      <input
                        type="number"
                        value={formData.max_value ?? ''}
                        onChange={(e) => setFormData({ ...formData, max_value: e.target.value !== '' ? Number(e.target.value) : undefined })}
                        placeholder="e.g. 100 (%)"
                        className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-mono text-slate-900 dark:text-white font-medium"
                      />
                    </div>
                  </div>
                )}

                {formData.field_type === 'DATE' && (
                  <div>
                    <label className="block text-slate-500 font-bold mb-1">Earliest Allowed Date</label>
                    <input
                      type="date"
                      value={formData.min_date || ''}
                      onChange={(e) => setFormData({ ...formData, min_date: e.target.value })}
                      className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-mono text-slate-900 dark:text-white font-medium"
                    />
                  </div>
                )}

                {formData.field_type === 'TEXT' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-slate-500 font-bold mb-1">Max Character Length</label>
                      <input
                        type="number"
                        value={formData.max_length ?? 100}
                        onChange={(e) => setFormData({ ...formData, max_length: Number(e.target.value) })}
                        placeholder="e.g. 100"
                        className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-mono text-slate-900 dark:text-white font-medium"
                      />
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="block text-slate-700 dark:text-slate-300 font-bold">
                          🔣 RegEx Custom Pattern Validation
                        </label>
                        <select
                          value={formData.regex_mode || 'MATCHES'}
                          onChange={(e) => setFormData({ ...formData, regex_mode: e.target.value as RegexMode })}
                          className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-0.5 text-[10px] font-bold text-slate-800 dark:text-slate-200"
                        >
                          <option value="MATCHES">RegEx Matches Pattern</option>
                          <option value="EQUALS">RegEx Strictly Equals</option>
                        </select>
                      </div>

                      <div>
                        <input
                          type="text"
                          value={formData.regex_pattern || ''}
                          onChange={(e) => setFormData({ ...formData, regex_pattern: e.target.value })}
                          placeholder="e.g. ^\d{3}-\d{2}-\d{4}$ or ^[A-Z]{3}-\d{4}$"
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-mono text-slate-900 dark:text-white text-xs"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">
                          Enforces input formatting on forms. Non-matching values will highlight red with validation errors.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Dropdown Options Manager */}
                {formData.field_type === 'SELECT' && (
                  <div className="space-y-3 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="flex justify-between items-center">
                      <label className="block text-slate-700 dark:text-slate-300 font-bold">
                        Dropdown Select Options ({formData.dropdown_options?.length || 0})
                      </label>
                      {(formData.dropdown_options?.length || 0) > 1 && (
                        <button
                          type="button"
                          onClick={handleSortAlphabetically}
                          className="px-2 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded font-bold text-[10px] border border-slate-300 dark:border-slate-600 transition cursor-pointer"
                        >
                          Sort A to Z
                        </button>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newDropdownOption}
                        onChange={(e) => setNewDropdownOption(e.target.value)}
                        onPaste={handlePasteDropdownOptions}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddDropdownOption();
                          }
                        }}
                        placeholder="Add option, paste copied Sheet column, or use 'Option A ::: Option B'..."
                        className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={handleAddDropdownOption}
                        className="px-3 py-2 bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 rounded-lg font-bold hover:bg-emerald-500/30 transition cursor-pointer"
                      >
                        + Add Option
                      </button>
                    </div>

                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {(formData.dropdown_options || []).map((opt, idx) => {
                        const isFirst = idx === 0;
                        const isLast = idx === (formData.dropdown_options?.length || 0) - 1;

                        return (
                          <div
                            key={opt}
                            className="flex justify-between items-center px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 group hover:border-slate-300 dark:hover:border-slate-600 transition"
                          >
                            <span className="font-medium truncate mr-2" title={opt}>{opt}</span>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleStartRenameOption(opt)}
                                className="text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                                title={`Rename "${opt}" across all records`}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                              <ReorderControls
                                size="sm"
                                onMoveUp={() => handleMoveOption(idx, 'UP')}
                                onMoveDown={() => handleMoveOption(idx, 'DOWN')}
                                isFirst={isFirst}
                                isLast={isLast}
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveDropdownOption(opt)}
                                className="text-rose-500 hover:text-rose-600 font-bold px-1.5 py-0.5 rounded hover:bg-rose-500/10 cursor-pointer"
                                title="Remove Option"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* DYNAMIC FORMULA BUILDER CHECKBOX SECTION */}
              {(formData.field_type === 'CURRENCY' || formData.field_type === 'NUMBER' || formData.field_type === 'PERCENT') && (
                <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasFormula}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        setHasFormula(isChecked);
                        if (!isChecked) {
                          setFormData({ ...formData, calculation_formula: '' });
                        }
                      }}
                      className="rounded text-purple-500 focus:ring-purple-500 cursor-pointer"
                    />
                    <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                      🧮 Enable Calculation Formula
                    </span>
                  </label>

                  {hasFormula && (
                    <div className="space-y-1 bg-purple-500/5 p-3 rounded-lg border border-purple-500/20">
                      <label className="block text-slate-500 font-bold mb-1">
                        Formula Expression *
                      </label>
                      <input
                        type="text"
                        value={formData.calculation_formula || ''}
                        onChange={(e) => setFormData({ ...formData, calculation_formula: e.target.value })}
                        placeholder="e.g. gci_amount + (transaction_side === 'Buyer' ? transaction_fee : 0)"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-mono text-xs text-slate-900 dark:text-white"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Use database field keys with math operators (`+`, `-`, `*`, `/`) or JS ternaries (`cond ? valA : valB`).
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Toggles & Footer */}
              <div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-slate-700">
                <div className="flex gap-4">
                  <label
                    className={`flex items-center gap-1.5 ${
                      isCurrentAuditField ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    }`}
                    title={
                      isCurrentAuditField
                        ? 'Audit fields cannot be modified.'
                        : 'Uncheck to hide field in forms'
                    }
                  >
                    <input
                      type="checkbox"
                      disabled={isCurrentAuditField}
                      checked={isCurrentAuditField ? false : Boolean(formData.is_enabled)}
                      onChange={(e) => setFormData({ ...formData, is_enabled: e.target.checked })}
                      className="rounded text-emerald-500 focus:ring-emerald-500 disabled:cursor-not-allowed"
                    />
                    <span className="font-bold text-slate-700 dark:text-slate-300">Enabled (Active in Forms)</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={Boolean(formData.is_system) || isSystemMandatoryField}
                      checked={Boolean(formData.is_required)}
                      onChange={(e) => setFormData({ ...formData, is_required: e.target.checked })}
                      className="rounded text-emerald-500 focus:ring-emerald-500"
                    />
                    <span className="font-bold text-slate-700 dark:text-slate-300">Required</span>
                  </label>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 rounded-lg font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingField}
                    className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isSavingField ? (
                      <>
                        <span className="animate-spin">⏳</span>
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Field Settings</span>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POPUP MODAL: CONFIRM DROPDOWN OPTION RENAME & DATABASE UPDATE */}
      {renameModal.isOpen && (
        <div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm flex justify-center items-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-5">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-200 dark:border-slate-700 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="text-amber-500">✏️</span> Rename Dropdown Value
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Field: <strong className="text-slate-800 dark:text-slate-200">{formData.field_label || 'Select Field'}</strong>
                  {' '}&bull;{' '}
                  Target Table: <span className="font-semibold text-slate-700 dark:text-slate-300 capitalize">{activeTab}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => !renameModal.isSubmitting && setRenameModal((prev) => ({ ...prev, isOpen: false }))}
                disabled={renameModal.isSubmitting}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-bold p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Inputs & Values */}
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                  Current Value
                </label>
                <div className="px-3 py-2 bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {renameModal.oldValue}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-1">
                  New Value *
                </label>
                <input
                  type="text"
                  autoFocus
                  value={renameModal.newValue}
                  onChange={(e) =>
                    setRenameModal((prev) => ({ ...prev, newValue: e.target.value, error: undefined }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (
                        renameModal.hasConfirmedUnderstanding &&
                        renameModal.newValue.trim() &&
                        renameModal.newValue.trim() !== renameModal.oldValue
                      ) {
                        handleConfirmRename();
                      }
                    }
                  }}
                  placeholder="Enter new value..."
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                {renameModal.error && (
                  <p className="text-xs font-semibold text-rose-500 mt-1.5 flex items-center gap-1">
                    <span>⚠️</span> {renameModal.error}
                  </p>
                )}
              </div>

              {/* Confirmation / Understanding Callout */}
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/60 rounded-xl space-y-3">
                <div className="flex items-start gap-2.5">
                  <span className="text-amber-600 dark:text-amber-400 text-lg leading-none mt-0.5">⚠️</span>
                  <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1">
                    <p className="font-bold text-amber-950 dark:text-amber-100 text-sm">
                      Database Records Update Confirmation
                    </p>
                    <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
                      Renaming this option will update <strong>all existing records</strong> in the database where{' '}
                      <code className="font-mono bg-amber-100 dark:bg-amber-900/50 px-1 py-0.5 rounded text-amber-950 dark:text-amber-100 font-bold">
                        {formData.field_key || editingField?.field_key || 'field_key'}
                      </code>{' '}
                      is currently set to &ldquo;<strong>{renameModal.oldValue}</strong>&rdquo; for your organization.
                    </p>
                  </div>
                </div>

                <label className="flex items-start gap-2.5 pt-2.5 border-t border-amber-200 dark:border-amber-800/40 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={renameModal.hasConfirmedUnderstanding}
                    onChange={(e) =>
                      setRenameModal((prev) => ({
                        ...prev,
                        hasConfirmedUnderstanding: e.target.checked,
                        error: undefined,
                      }))
                    }
                    className="mt-0.5 w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-amber-950 dark:text-amber-100 select-none group-hover:text-amber-800 dark:group-hover:text-amber-200 transition">
                    I understand that this renaming operation will update all records to the new value in the Database Field Key (
                    <span className="font-mono font-bold text-amber-900 dark:text-amber-200">
                      {formData.field_key || editingField?.field_key || 'field_key'}
                    </span>
                    ) for this client.
                  </span>
                </label>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex justify-end items-center gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                disabled={renameModal.isSubmitting}
                onClick={() => setRenameModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold border border-slate-300 dark:border-slate-700 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  renameModal.isSubmitting ||
                  !renameModal.newValue.trim() ||
                  renameModal.newValue.trim() === renameModal.oldValue ||
                  !renameModal.hasConfirmedUnderstanding
                }
                onClick={handleConfirmRename}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg text-xs shadow-md transition flex items-center gap-2 cursor-pointer"
              >
                {renameModal.isSubmitting ? (
                  <>
                    <span className="animate-spin text-sm">⏳</span>
                    <span>Updating Database Records...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm & Update Records</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP MODAL: RENAME OPERATION RESULT MESSAGE */}
      {renameResultModal.isOpen && (
        <div className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm flex justify-center items-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 text-center">
            {/* Success Icon */}
            <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400 text-2xl font-bold">
              ✓
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Rename Operation Completed
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Database records and field options have been updated successfully.
              </p>
            </div>

            {/* Impact Metric Box */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
              <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {renameResultModal.updatedCount}
              </div>
              <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {renameResultModal.updatedCount === 1 ? 'Record has' : 'Records have'} been updated with the new value
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700/60">
                Field: <span className="font-semibold text-slate-700 dark:text-slate-300">{renameResultModal.fieldLabel}</span>{' '}
                (<code className="font-mono text-emerald-600 dark:text-emerald-400">{renameResultModal.fieldKey}</code>)
                <div className="mt-1">
                  &ldquo;<span className="line-through opacity-70">{renameResultModal.oldValue}</span>&rdquo; &rarr;{' '}
                  <strong className="text-slate-800 dark:text-slate-200">&ldquo;{renameResultModal.newValue}&rdquo;</strong>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                autoFocus
                onClick={() => setRenameResultModal((prev) => ({ ...prev, isOpen: false }))}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-md transition cursor-pointer"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}