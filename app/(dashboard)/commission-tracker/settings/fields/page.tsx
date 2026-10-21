// app/(dashboard)/commission-tracker/settings/fields/page.tsx

'use client';

import { phoneSheet, phoneSheetFlush } from '@/lib/page-frame';
import React, { useState, useEffect, useRef } from 'react';
import { DragHandle, moveItem, useDragReorder } from '@/components/ui/reorder-controls';
import { ClearableSelect } from '@/components/ui/ClearableSelect';
import { OptionMenu } from '@/components/ui/option-menu';
import { NativeDateInput } from '@/components/ui/NativeDateInput';
import { EditPencil } from '@/components/ui/edit-pencil';
import { GripVertical, List, User } from 'lucide-react';
import { TrashIcon } from '@/components/ui/trash-icon';
import { ToastBanner } from '@/components/ui/ToastBanner';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DB_TRANSACTION_COLUMNS, DB_AGENT_COLUMNS } from '@/lib/fields';
import { useRegisterSave } from '@/components/save-leave-guard';
import { underlineControl } from '@/components/ui/underline-field';
import { KeyTermsCard } from './KeyTermsCard';

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
  /** Place in Key Terms on Transaction Detail; null when the field is not in Key Terms. */
  key_terms_position?: number | null;
}

/** Field types as people say them. */
const FIELD_TYPE_LABELS: Record<string, string> = {
  TEXT: 'Text',
  NUMBER: 'Number',
  CURRENCY: 'Currency',
  PERCENT: 'Percent',
  DATE: 'Date',
  SELECT: 'Dropdown',
  AGENT_PICKER: 'Agent',
  BOOLEAN: 'Checkbox',
};
/** A quiet chip for facts about a field: its type, options, and limits. */
const META_CHIP = 'whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-2xs font-medium text-slate-600 dark:bg-slate-700/60 dark:text-slate-300';

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

const HIDDEN_SYSTEM_KEYS = new Set([
  'client_id',
  'archived',
  'permanently_deleted',
  'custom_attributes',
  'address_details',
  'co_broker',
  'settlement_vendors',
  'tms_connection',
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

const underlineShell =
  'group/field relative block w-full underline-field rounded-t-md border-b border-b-slate-300 pl-2.5 pr-2.5 pt-1 pb-0.5 transition-colors focus-within:border-b-brand-500 focus-within:shadow-[0_1px_0_rgb(2_132_199/0.45),0_6px_12px_-6px_rgb(2_132_199/0.8)] dark:border-b-slate-600';
const underlineLabel =
  'block truncate text-2xs leading-3 font-medium text-slate-500 dark:text-slate-400 group-focus-within/field:text-brand-600 dark:group-focus-within/field:text-brand-400';

function FieldChevron() {
  return (
    <svg
      viewBox="0 0 10 6"
      aria-hidden
      className="pointer-events-none absolute right-2.5 top-1/2 h-1.5 w-2.5 -translate-y-1/2 text-slate-600 dark:text-slate-300"
    >
      <path d="M1 1L5 5L9 1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SectionCombobox({
  value,
  sections,
  onChange,
}: {
  value: string;
  sections: string[];
  onChange: (value: string) => void;
}) {
  return (
    <OptionMenu
      allowCustom
      required
      tabIndex={2}
      value={value}
      options={sections.map((name) => ({ value: name, label: name }))}
      onChange={onChange}
      placeholder="Select or type a section"
      className={`${underlineControl} overview-field-select pr-4`}
    />
  );
}

function FieldCalendar({ label }: { label: string }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={`Choose ${label}`}
      onClick={(event) => {
        const input = event.currentTarget.parentElement?.querySelector('input[type="date"]');
        if (!(input instanceof HTMLInputElement)) return;
        input.focus();
        if (typeof input.showPicker === 'function') input.showPicker();
      }}
      className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 cursor-pointer text-slate-600 dark:text-slate-300"
    >
      <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="1.25" />
        <path d="M2.25 6.75h11.5M5.25 2v2.5M10.75 2v2.5" />
      </svg>
    </button>
  );
}

export default function FieldCustomizationsPage() {
  const [activeTab, setActiveTab] = useState<'transactions' | 'agents'>('transactions');
  const { confirm: confirmAction, dialog: confirmDialog } = useConfirmDialog();
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
    const autoLabel = key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());

    // A label the tenant saved wins; the defaults below only replace blank or auto-generated labels.
    const trimmedLabel = rawLabel?.trim() ?? '';
    if (trimmedLabel && trimmedLabel !== key && trimmedLabel !== autoLabel) {
      return trimmedLabel;
    }

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

    return autoLabel;
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
              dropdown_options: col.dropdown_options,
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
            dropdown_options: col.dropdown_options,
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

  // Drag and drop: a section moves to the place of the section it is dropped on; a field lands before the
  // field it is dropped on, or at the end of a section, and can change section that way. Saves right away.
  type DragItem = { kind: 'section'; name: string } | { kind: 'field'; id: string; section: string };
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  // fieldId: a field to drop before, null for the end of the section, undefined for a section drop.
  const [dropTarget, setDropTarget] = useState<{ section: string; fieldId?: string | null } | null>(null);
  const clearDrag = () => {
    setDragItem(null);
    setDropTarget(null);
  };

  const handleDrop = async () => {
    const item = dragItem;
    const target = dropTarget;
    clearDrag();
    if (!item || !target) return;
    const list = activeTab === 'transactions' ? txFields : agentFields;

    if (item.kind === 'section') {
      const from = orderedSectionNames.indexOf(item.name);
      const to = orderedSectionNames.indexOf(target.section);
      if (from === -1 || to === -1 || from === to) return;
      const order = [...orderedSectionNames];
      order.splice(from, 1);
      order.splice(to, 0, item.name);
      const newFields = list.map((field) => {
        const index = order.indexOf(field.section_name || 'General');
        return index === -1 ? field : { ...field, section_sort_order: index + 1 };
      });
      if (activeTab === 'transactions') setTxFields(newFields);
      else setAgentFields(newFields);
      await persistFieldsList(newFields);
      return;
    }

    if (target.fieldId === item.id) return;
    const moving = list.find((field) => field.id === item.id);
    if (!moving) return;
    const targetSection = target.section;
    const sectionOrder = orderedSectionNames.indexOf(targetSection) + 1;
    const destination = list
      .filter((field) => (field.section_name || 'General') === targetSection && field.id !== item.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const insertAt = target.fieldId ? destination.findIndex((field) => field.id === target.fieldId) : destination.length;
    destination.splice(insertAt === -1 ? destination.length : insertAt, 0, moving);
    const source = item.section === targetSection
      ? []
      : list
        .filter((field) => (field.section_name || 'General') === item.section && field.id !== item.id)
        .sort((a, b) => a.sort_order - b.sort_order);

    const newFields = list.map((field) => {
      const destIndex = destination.findIndex((other) => other.id === field.id);
      if (destIndex !== -1) {
        return { ...field, section_name: targetSection, section_sort_order: sectionOrder || field.section_sort_order, sort_order: destIndex + 1 };
      }
      const sourceIndex = source.findIndex((other) => other.id === field.id);
      return sourceIndex === -1 ? field : { ...field, sort_order: sourceIndex + 1 };
    });
    const unchanged = newFields.every((field, index) => field === list[index]
      || (field.sort_order === list[index].sort_order && field.section_name === list[index].section_name));
    if (unchanged) return;
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
          clientId: 'DEMO',
          targetTable: activeTab,
          field: updatedField,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update toggle setting');
      }
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
        dropdown_options: firstCat.dropdown_options || [],
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
        dropdown_options: catItem.dropdown_options || [],
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
      dropdown_options: field.dropdown_options || [],
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

  const optionDrag = useDragReorder((from, to) =>
    setFormData((current) => ({ ...current, dropdown_options: moveItem(current.dropdown_options || [], from, to) })),
  );

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

  const handleSaveField = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!formData.field_label) return false;

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
        : null;

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
      return true;
    } catch (err: any) {
      showToast(`Save error: ${err.message}`, 'error');
      return false;
    } finally {
      setIsSavingField(false);
    }
  };

  const fieldWasOpen = useRef(false);
  const fieldBaseline = useRef('');
  const fieldDraft = JSON.stringify({ formData, ruleGroup, hasFormula });
  if (isModalOpen !== fieldWasOpen.current) {
    fieldWasOpen.current = isModalOpen;
    if (isModalOpen) fieldBaseline.current = fieldDraft;
  }
  const fieldDirty = isModalOpen && fieldDraft !== fieldBaseline.current;

  useRegisterSave({
    id: 'field-settings',
    active: fieldDirty,
    saving: isSavingField,
    onSave: () => handleSaveField(),
    onDiscard: () => setIsModalOpen(false),
  });

  const handleDeleteField = async (id: string) => {
    const target = currentFields.find((f) => f.id === id);
    const isSystemMandatory = MANDATORY_SYSTEM_KEYS.has(target?.field_key || '');

    if (target?.is_system || isSystemMandatory) {
      showToast('Mandatory system fields cannot be deleted.', 'error');
      return;
    }

    const confirmed = await confirmAction({
      title: `Delete field "${target?.field_label}"?`,
      message: 'Are you sure you want to delete this field?',
    });
    if (!confirmed) return;

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
    // Only rules that are actually set; an empty min or max is not a rule.
    const rules: string[] = [];
    if (field.min_value != null) rules.push(`Min ${field.min_value}`);
    if (field.max_value != null) rules.push(`Max ${field.max_value}`);
    if (field.min_date) rules.push(`From ${field.min_date}`);
    if (field.max_length) rules.push(`Up to ${field.max_length} Characters`);
    if (field.regex_pattern) rules.push(field.regex_mode === 'EQUALS' ? 'Must Equal a Pattern' : 'Must Match a Pattern');
    if (field.dropdown_options && field.dropdown_options.length > 0) {
      rules.push(`${field.dropdown_options.length} ${field.dropdown_options.length === 1 ? 'option' : 'options'}`);
    }

    return rules.map((rule) => (
      <span key={rule} className={META_CHIP}>{rule}</span>
    ));
  };

  const renderRuleSummary = (ruleGroup?: VisibilityRuleGroup) => {
    // A field with no rules is always shown, so it gets no chip.
    if (!ruleGroup || !Array.isArray(ruleGroup.conditions) || ruleGroup.conditions.length === 0) return null;

    const count = ruleGroup.conditions.length;
    const joiner = count > 1 ? (ruleGroup.operator === 'AND' ? ', all must match' : ', any can match') : '';
    return (
      <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-2xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-400">
        Shown when {count} {count === 1 ? 'condition matches' : `conditions${joiner}`}
      </span>
    );
  };

  const isCurrentAuditField = READ_ONLY_AUDIT_KEYS.has(formData.field_key || '');
  const isSystemMandatoryField = MANDATORY_SYSTEM_KEYS.has(formData.field_key || '') || Boolean(formData.is_system);
  const activeConditions = Array.isArray(ruleGroup?.conditions) ? ruleGroup.conditions : [];

  return (
    <div className="space-y-6 relative">
      {toast && <ToastBanner message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      {confirmDialog}

      {/* Top Controller Bar */}
      <div className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-xs flex flex-wrap justify-between items-center gap-3 transition-colors ${phoneSheet}`}>
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('transactions')}
            className={`px-4 py-2 rounded-md text-xs font-bold transition inline-flex items-center gap-1.5 ${
              activeTab === 'transactions'
                ? 'bg-brand-500/10 dark:bg-brand-950/80 text-brand-700 dark:text-brand-400 border border-brand-500/30'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <List className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            Transactions
          </button>

          <button
            onClick={() => setActiveTab('agents')}
            className={`px-4 py-2 rounded-md text-xs font-bold transition inline-flex items-center gap-1.5 ${
              activeTab === 'agents'
                ? 'bg-brand-500/10 dark:bg-brand-950/80 text-brand-700 dark:text-brand-400 border border-brand-500/30'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <User className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            Agents
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenAdd}
            disabled={isSavingField}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <span>+ Add Field</span>
          </button>
        </div>
      </div>

      {catalogError && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-700 dark:text-amber-400 text-xs flex justify-between items-center">
          <span>⚠️ Schema Catalog Warning: {catalogError}</span>
          <button onClick={fetchLiveCatalog} className="underline font-bold cursor-pointer">Retry</button>
        </div>
      )}

      {activeTab === 'transactions' && txFields.length > 0 && (
        <KeyTermsCard
          fields={txFields}
          onSaved={(fieldKeys) => {
            setTxFields((prev) => prev.map((field) => {
              const index = fieldKeys.indexOf(field.field_key);
              return { ...field, key_terms_position: index === -1 ? null : index + 1 };
            }));
            showToast('Key Terms saved.', 'success');
          }}
          onError={(message) => showToast(message, 'error')}
        />
      )}

      {/* Configurations Table */}
      <div className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xs overflow-hidden transition-colors ${phoneSheetFlush}`}>
        <div className="p-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex flex-wrap justify-between items-center gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {activeTab === 'transactions' ? 'Transaction' : 'Agent'} Fields
            </h2>
            <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
              Sections and their order set the order of {activeTab === 'transactions' ? 'the Transactions table and the Transaction Detail' : 'the Agents table and the agent form'}.
            </p>
          </div>
          <span className="text-2xs font-semibold text-slate-500 dark:text-slate-400">
            {currentFields.length} {currentFields.length === 1 ? 'field' : 'fields'}
          </span>
        </div>

        {/* Sections and fields reorder by dragging the grip, or with the arrows from the keyboard. Each move saves right away. */}
        <div className="divide-y divide-slate-200 dark:divide-slate-700/60">
          {orderedSectionNames.map((secName, secIdx) => {
            const fields = currentFields
              .filter((f) => (f.section_name || 'General') === secName)
              .sort((a, b) => a.sort_order - b.sort_order);
            const sectionDropHere = dragItem?.kind === 'section' && dragItem.name !== secName && dropTarget?.section === secName && !dropTarget.fieldId;
            const fieldDropAtEnd = dragItem?.kind === 'field' && dropTarget?.section === secName && dropTarget.fieldId === null;

            return (
              <div
                key={secName}
                className={`p-4 space-y-2 transition-colors ${dragItem?.kind === 'section' && dragItem.name === secName ? 'opacity-50' : ''}`}
                onDragOver={(event) => {
                  if (!dragItem) return;
                  event.preventDefault();
                  if (dragItem.kind === 'section') setDropTarget({ section: secName, fieldId: undefined });
                  else if (event.target === event.currentTarget) setDropTarget({ section: secName, fieldId: null });
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  void handleDrop();
                }}
              >
                <div
                  className={`flex items-center gap-2 rounded-full bg-brand-500/10 py-1 pl-1.5 pr-3 dark:bg-brand-500/15 ${sectionDropHere ? 'ring-2 ring-brand-500' : ''}`}
                >
                  <span
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', secName);
                      setDragItem({ kind: 'section', name: secName });
                    }}
                    onDragEnd={clearDrag}
                    title="Drag to reorder sections"
                    aria-hidden
                    className="inline-flex h-6 w-5 shrink-0 cursor-grab items-center justify-center rounded-full text-brand-700/60 hover:text-brand-700 active:cursor-grabbing dark:text-brand-400/60 dark:hover:text-brand-400"
                  >
                    <GripVertical className="h-3.5 w-3.5" strokeWidth={2} />
                  </span>
                  <span className="min-w-0 truncate text-xs font-bold text-brand-700 dark:text-brand-400">{secName}</span>
                  <span className="ml-auto shrink-0 text-2xs font-medium text-slate-500 dark:text-slate-400">
                    {fields.length} {fields.length === 1 ? 'field' : 'fields'}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {fields.map((f, fieldIdx) => {
                    const isSystemMandatory = MANDATORY_SYSTEM_KEYS.has(f.field_key) || f.is_system;
                    const isAudit = READ_ONLY_AUDIT_KEYS.has(f.field_key);

                    // Strict formula badge check: Field type must be CURRENCY, NUMBER, or PERCENT and formula string must not be empty
                    const isNumericType = f.field_type === 'CURRENCY' || f.field_type === 'NUMBER' || f.field_type === 'PERCENT';
                    const hasFormula = Boolean(isNumericType && f.calculation_formula && f.calculation_formula.trim().length > 0);
                    const isDragging = dragItem?.kind === 'field' && dragItem.id === f.id;
                    const dropBefore = dragItem?.kind === 'field' && !isDragging && dropTarget?.fieldId === f.id;

                    return (
                      <div
                        key={f.id}
                        onDragOver={(event) => {
                          if (dragItem?.kind !== 'field') return;
                          event.preventDefault();
                          event.stopPropagation();
                          setDropTarget({ section: secName, fieldId: f.id });
                        }}
                        className={`relative flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-white px-2 py-2 text-xs transition dark:bg-slate-900/40 ${
                          isDragging ? 'opacity-40' : ''
                        } ${f.is_enabled || isAudit ? '' : 'opacity-60'} border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600`}
                      >
                        {dropBefore && <span aria-hidden className="pointer-events-none absolute inset-x-1 -top-1 h-0.5 rounded-full bg-brand-500" />}
                        <div className="flex min-w-0 flex-1 items-center gap-2 max-sm:basis-full">
                          <span
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = 'move';
                              event.dataTransfer.setData('text/plain', f.id);
                              const row = event.currentTarget.closest('[class*="rounded-lg"]');
                              if (row instanceof HTMLElement) event.dataTransfer.setDragImage(row, 16, 16);
                              setDragItem({ kind: 'field', id: f.id, section: secName });
                            }}
                            onDragEnd={clearDrag}
                            title="Drag to reorder, or into another section"
                            aria-hidden
                            className="inline-flex h-8 w-5 shrink-0 cursor-grab items-center justify-center rounded text-slate-300 hover:text-slate-500 active:cursor-grabbing dark:text-slate-600 dark:hover:text-slate-400"
                          >
                            <GripVertical className="h-4 w-4" strokeWidth={2} />
                          </span>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="font-semibold text-slate-900 dark:text-white">{f.field_label}</span>
                              <span className="font-mono text-2xs text-slate-400 dark:text-slate-500">{f.field_key}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className={META_CHIP}>{FIELD_TYPE_LABELS[f.field_type] || f.field_type}</span>
                              {isSystemMandatory && <span className={META_CHIP}>System</span>}
                              {f.storage_type === 'CUSTOM_JSON' && (
                                <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-2xs font-semibold text-violet-700 dark:text-violet-300">Custom</span>
                              )}
                              {hasFormula && (
                                <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-2xs font-semibold text-violet-700 dark:text-violet-300">Formula</span>
                              )}
                              {renderRuleSummary(f.visibility_rules)}
                              {renderValidationBadge(f)}
                            </div>
                          </div>
                        </div>

                        {/* Inline Controls & Action Buttons */}
                        {/* On a phone the toggles and actions take their own line under the field's name. */}
                        <div className="ml-auto flex shrink-0 items-center gap-3 max-sm:w-full max-sm:border-t max-sm:border-slate-100 max-sm:pt-2 max-sm:dark:border-slate-700/60">
                          <div className="flex items-center gap-4 border-r max-sm:mr-auto max-sm:border-r-0 border-slate-200 pr-3 text-2xs dark:border-slate-700">
                            <label
                              className={`flex items-center gap-1.5 ${
                                isAudit ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                              }`}
                              title={isAudit ? 'Audit field state cannot be modified' : 'Turn the field on or off in forms'}
                            >
                              <input
                                type="checkbox"
                                disabled={isAudit}
                                checked={isAudit ? false : f.is_enabled}
                                onChange={(e) => handleInlineToggle(f, 'is_enabled', e.target.checked)}
                                className="rounded text-emerald-500 focus:ring-brand-500 disabled:cursor-not-allowed cursor-pointer"
                              />
                              <span className="text-slate-600 dark:text-slate-300 font-medium">Enabled</span>
                            </label>

                            <label
                              className={`flex items-center gap-1.5 ${
                                isSystemMandatory ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                              }`}
                              title={isSystemMandatory ? 'System fields are always required' : 'Make the field required'}
                            >
                              <input
                                type="checkbox"
                                disabled={isSystemMandatory}
                                checked={f.is_required}
                                onChange={(e) => handleInlineToggle(f, 'is_required', e.target.checked)}
                                className="rounded text-emerald-500 focus:ring-brand-500 disabled:cursor-not-allowed cursor-pointer"
                              />
                              <span className="text-slate-600 dark:text-slate-300 font-medium">Required</span>
                            </label>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleOpenEdit(f)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:text-brand-700 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                            title="Edit Field"
                            aria-label={`Edit ${f.field_label}`}
                          >
                            <EditPencil className="h-[18px] w-[18px]" />
                          </button>

                          <button
                            type="button"
                            disabled={isSystemMandatory}
                            onClick={() => handleDeleteField(f.id)}
                            aria-label={`Delete ${f.field_label}`}
                            className={`inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 transition ${
                              isSystemMandatory ? 'invisible' : 'hover:bg-rose-500/10 hover:text-rose-600 cursor-pointer'
                            }`}
                            title={isSystemMandatory ? 'System fields cannot be deleted' : 'Delete Field'}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {fieldDropAtEnd && <div aria-hidden className="h-0.5 rounded-full bg-brand-500" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL: CONFIGURATION WITH DYNAMIC VISIBILITY & FORMULA BUILDER */}
      {isModalOpen && (
        <div className="app-modal fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-xl rounded-xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingField ? `Edit ${editingField.field_label}` : 'Add Field'}
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
                      ? 'bg-brand-500/10 text-brand-700 dark:text-brand-400 border border-brand-500/30'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-40'
                  }`}
                >
                  Built-In Field ({availableCatalogOptions.length})
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
                      ? 'bg-brand-500/10 text-brand-700 dark:text-brand-400 border border-brand-500/30'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  + Custom Field
                </button>
              </div>
            )}

            <form onSubmit={handleSaveField} className="space-y-4 text-xs">
              {!editingField && selectionMode === 'EXISTING' && (
                <label className={underlineShell}>
                  <span className={underlineLabel}>
                    Select Existing Database Column <span className="text-rose-500">*</span>
                  </span>
                  <ClearableSelect
                    value={selectedCatalogKey}
                    onChange={(e) => handleCatalogSelectChange(e.target.value)}
                    className={`${underlineControl} overview-field-select cursor-pointer`}
                  >
                    {availableCatalogOptions.map((item) => (
                      <option key={item.field_key} value={item.field_key}>
                        {item.field_label} ({item.field_key} • {item.field_type})
                      </option>
                    ))}
                  </ClearableSelect>
                  <FieldChevron />
                </label>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className={underlineShell}>
                  <span className={underlineLabel}>
                    Field Label <span className="text-rose-500">*</span>
                  </span>
                  <input
                    ref={fieldLabelInputRef}
                    type="text"
                    required
                    tabIndex={1}
                    value={formData.field_label || ''}
                    onChange={(e) => setFormData({ ...formData, field_label: e.target.value })}
                    placeholder="e.g. Escrow Officer Name"
                    className={underlineControl}
                  />
                </label>

                <label className={underlineShell}>
                  <span className={underlineLabel}>
                    Section <span className="text-rose-500">*</span>
                  </span>
                  <SectionCombobox
                    value={formData.section_name || ''}
                    sections={orderedSectionNames}
                    onChange={(sectionName) => setFormData({ ...formData, section_name: sectionName })}
                  />
                  <FieldChevron />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className={underlineShell}>
                  <span className={underlineLabel}>
                    Control Type <span className="text-rose-500">*</span>
                  </span>
                  <ClearableSelect
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
                    className={`${underlineControl} overview-field-select cursor-pointer`}
                  >
                    <option value="TEXT">Text Input</option>
                    <option value="CURRENCY">Currency ($)</option>
                    <option value="PERCENT">Percent</option>
                    <option value="NUMBER">Number</option>
                    <option value="DATE">Date Picker</option>
                    <option value="SELECT">Select Dropdown</option>
                    <option value="AGENT_PICKER">Agent Picker</option>
                    <option value="BOOLEAN">Boolean Toggle</option>
                  </ClearableSelect>
                  <FieldChevron />
                </label>

                <label className={underlineShell}>
                  <span className={underlineLabel}>Database Field Key</span>
                  <input
                    type="text"
                    tabIndex={-1}
                    disabled={formData.storage_type === 'CORE_COLUMN'}
                    value={formData.field_key || ''}
                    onChange={(e) => setFormData({ ...formData, field_key: e.target.value })}
                    placeholder="Auto-generated"
                    className={`${underlineControl} font-mono`}
                  />
                </label>
              </div>

              {/* VISUAL CONDITIONAL VISIBILITY RULE BUILDER */}
              <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <div className="flex justify-between items-center">
                  <span className="text-2xs font-bold text-blue-600 dark:text-blue-400 block">
                    👁️ Custom Visibility Logic Builder
                  </span>

                  {activeConditions.length > 1 && (
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-0.5 rounded border border-slate-300 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => setRuleGroup({ ...ruleGroup, operator: 'OR' })}
                        className={`px-2 py-0.5 rounded text-2xs font-bold cursor-pointer ${
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
                        className={`px-2 py-0.5 rounded text-2xs font-bold cursor-pointer ${
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
                            <div className="text-center font-bold text-2xs text-blue-500">
                              — {ruleGroup.operator} —
                            </div>
                          )}

                          <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
                            <div className="grid grid-cols-12 gap-2 items-end">
                              <label className={`${underlineShell} col-span-5`}>
                                <span className={underlineLabel}>If Field</span>
                                <ClearableSelect
                                  value={cond.field_key}
                                  onChange={(e) => handleUpdateCondition(cond.id, { field_key: e.target.value })}
                                  className={`${underlineControl} overview-field-select cursor-pointer`}
                                >
                                  {orderedCurrentFields
                                    .filter((f) => f.field_key !== formData.field_key)
                                    .map((f) => (
                                      <option key={f.field_key} value={f.field_key}>
                                        {f.field_label} ({f.section_name})
                                      </option>
                                    ))}
                                </ClearableSelect>
                                <FieldChevron />
                              </label>

                              <label className={`${underlineShell} col-span-4`}>
                                <span className={underlineLabel}>Condition</span>
                                <ClearableSelect
                                  value={cond.operator}
                                  onChange={(e) => handleUpdateCondition(cond.id, { operator: e.target.value as SingleOperator })}
                                  className={`${underlineControl} overview-field-select cursor-pointer`}
                                >
                                  <option value="EQUALS">Equals (=)</option>
                                  <option value="NOT_EQUALS">Not Equals (≠)</option>
                                  <option value="IN">Is in List</option>
                                  <option value="NOT_EMPTY">Is Not Empty</option>
                                  <option value="IS_EMPTY">Is Empty</option>
                                </ClearableSelect>
                                <FieldChevron />
                              </label>

                              <div className="col-span-3 text-right">
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
                                    <label className="text-2xs font-bold text-slate-400 block">Select Target Values:</label>
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
                                            className={`px-2 py-0.5 rounded text-2xs font-bold border transition cursor-pointer ${
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
                                  <label className={underlineShell}>
                                    <span className={underlineLabel}>Value to Compare</span>
                                    <input
                                      type="text"
                                      value={String(cond.value || '')}
                                      onChange={(e) => handleUpdateCondition(cond.id, { value: e.target.value })}
                                      placeholder="e.g. Seller or Pending"
                                      className={underlineControl}
                                    />
                                  </label>
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
                <span className="text-2xs font-bold text-rose-600 dark:text-rose-400 block">
                  🚨 Data Validation Enforcements
                </span>

                {(formData.field_type === 'CURRENCY' || formData.field_type === 'NUMBER' || formData.field_type === 'PERCENT') && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className={underlineShell}>
                      <span className={underlineLabel}>Minimum Value</span>
                      <input
                        type="number"
                        value={formData.min_value ?? ''}
                        onChange={(e) => setFormData({ ...formData, min_value: e.target.value !== '' ? Number(e.target.value) : undefined })}
                        placeholder="e.g. 0"
                        className={underlineControl}
                      />
                    </label>
                    <label className={underlineShell}>
                      <span className={underlineLabel}>Maximum Value</span>
                      <input
                        type="number"
                        value={formData.max_value ?? ''}
                        onChange={(e) => setFormData({ ...formData, max_value: e.target.value !== '' ? Number(e.target.value) : undefined })}
                        placeholder="e.g. 100"
                        className={underlineControl}
                      />
                    </label>
                  </div>
                )}

                {formData.field_type === 'DATE' && (
                  <label className={underlineShell}>
                    <span className={underlineLabel}>Earliest Allowed Date</span>
                    <NativeDateInput
                      value={formData.min_date || ''}
                      onChange={(e) => setFormData({ ...formData, min_date: e.target.value })}
                      className={`${underlineControl} overview-date dark:[color-scheme:dark]`}
                    />
                    <FieldCalendar label="Earliest Allowed Date" />
                  </label>
                )}

                {formData.field_type === 'TEXT' && (
                  <div className="space-y-3">
                    <label className={underlineShell}>
                      <span className={underlineLabel}>Max Character Length</span>
                      <input
                        type="number"
                        value={formData.max_length ?? 100}
                        onChange={(e) => setFormData({ ...formData, max_length: Number(e.target.value) })}
                        placeholder="e.g. 100"
                        className={underlineControl}
                      />
                    </label>

                    <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
                      <label className="block text-slate-700 dark:text-slate-300 font-bold">
                        🔣 RegEx Custom Pattern Validation
                      </label>
                      <label className={underlineShell}>
                        <span className={underlineLabel}>Mode</span>
                        <ClearableSelect
                          value={formData.regex_mode || 'MATCHES'}
                          onChange={(e) => setFormData({ ...formData, regex_mode: e.target.value as RegexMode })}
                          className={`${underlineControl} overview-field-select cursor-pointer`}
                        >
                          <option value="MATCHES">RegEx Matches Pattern</option>
                          <option value="EQUALS">RegEx Strictly Equals</option>
                        </ClearableSelect>
                        <FieldChevron />
                      </label>
                      <label className={underlineShell}>
                        <span className={underlineLabel}>Pattern</span>
                        <input
                          type="text"
                          value={formData.regex_pattern || ''}
                          onChange={(e) => setFormData({ ...formData, regex_pattern: e.target.value })}
                          placeholder="e.g. ^\d{3}-\d{2}-\d{4}$"
                          className={`${underlineControl} font-mono`}
                        />
                      </label>
                      <p className="text-2xs text-slate-400">
                        Enforces input formatting on forms. Non-matching values will highlight red with validation errors.
                      </p>
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
                          className="px-2 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded font-bold text-2xs border border-slate-300 dark:border-slate-600 transition cursor-pointer"
                        >
                          Sort A to Z
                        </button>
                      )}
                    </div>

                    <div className="flex items-end gap-2">
                      <label className={`${underlineShell} min-w-0 flex-1`}>
                        <span className={underlineLabel}>Option</span>
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
                        placeholder="Paste a column, or use Option A ::: Option B"
                        className={underlineControl}
                      />
                      </label>
                      <button
                        type="button"
                        onClick={handleAddDropdownOption}
                        className="px-3 py-2 bg-brand-500/10 text-brand-700 dark:text-brand-400 border border-brand-500/30 rounded-lg font-bold hover:bg-brand-500/30 transition cursor-pointer"
                      >
                        + Add Option
                      </button>
                    </div>

                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {(formData.dropdown_options || []).map((opt, idx) => {

                        return (
                          <div
                            key={opt}
                            {...optionDrag.rowProps(idx)}
                            className={`flex items-center gap-1 pl-1 pr-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg border text-xs font-semibold text-slate-800 dark:text-slate-200 group transition ${
                              optionDrag.overIndex === idx ? 'border-brand-500' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                            } ${optionDrag.dragIndex === idx ? 'opacity-40' : ''}`}
                          >
                            <DragHandle {...optionDrag.handleProps(idx)} />
                            <span className="mr-auto min-w-0 font-medium truncate pr-2" title={opt}>{opt}</span>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleStartRenameOption(opt)}
                                className="text-slate-400 hover:text-brand-700 dark:hover:text-brand-400 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                                title={`Rename "${opt}" across all records`}
                              >
                                <EditPencil />
                              </button>
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
                    <span className="text-2xs font-bold text-purple-600 dark:text-purple-400">
                      🧮 Enable Calculation Formula
                    </span>
                  </label>

                  {hasFormula && (
                    <div className="space-y-1 bg-purple-500/5 p-3 rounded-lg border border-purple-500/20">
                      <label className={underlineShell}>
                        <span className={underlineLabel}>
                          Formula Expression <span className="text-rose-500">*</span>
                        </span>
                      <input
                        type="text"
                        value={formData.calculation_formula || ''}
                        onChange={(e) => setFormData({ ...formData, calculation_formula: e.target.value })}
                        placeholder="e.g. gci_amount + transaction_fee"
                        className={`${underlineControl} font-mono`}
                      />
                      </label>
                      <p className="text-2xs text-slate-400 mt-1">
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
                      className="rounded text-emerald-500 focus:ring-brand-500 disabled:cursor-not-allowed"
                    />
                    <span className="font-bold text-slate-700 dark:text-slate-300">Enabled (Active in Forms)</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={Boolean(formData.is_system) || isSystemMandatoryField}
                      checked={Boolean(formData.is_required)}
                      onChange={(e) => setFormData({ ...formData, is_required: e.target.checked })}
                      className="rounded text-emerald-500 focus:ring-brand-500"
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
                    disabled={isSavingField || !fieldDirty}
                    className="px-4 py-1.5 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-lg shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
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
        <div className="app-modal fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm flex justify-center items-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-5">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-200 dark:border-slate-700 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <EditPencil className="w-3.5 h-3.5 text-slate-400" /> Rename Dropdown Value
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Field: <strong className="text-slate-800 dark:text-slate-200">{formData.field_label || 'Select field'}</strong>
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
                <label className="text-2xs font-bold text-slate-500 dark:text-slate-400 block mb-1">
                  Current Value
                </label>
                <div className="px-3 py-2 bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {renameModal.oldValue}
                </div>
              </div>

              <div>
                <label className="text-2xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  New Value *
                </label>
                <div className={underlineShell}>
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
                    className={underlineControl}
                  />
                </div>
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
                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg text-xs transition flex items-center gap-2 cursor-pointer"
              >
                {renameModal.isSubmitting ? (
                  <>
                    <span className="animate-spin text-sm">⏳</span>
                    <span>Updating database records...</span>
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
        <div className="app-modal fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm flex justify-center items-center p-4 animate-in fade-in duration-150">
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
              <div className="text-2xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700/60">
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
                className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-xl text-xs transition cursor-pointer"
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