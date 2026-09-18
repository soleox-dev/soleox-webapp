import { getAuthenticatedSupabase } from '@/lib/supabase';
import { SupabaseClient } from '@supabase/supabase-js';

export interface FieldConfiguration {
  id: string;
  clientId: string;
  targetTable: string;
  fieldKey: string;
  storageType: 'CORE_COLUMN' | 'CUSTOM_JSON';
  sectionName: string;
  sectionSortOrder: number;
  sortOrder: number;
  fieldLabel: string;
  fieldType: 'TEXT' | 'NUMBER' | 'CURRENCY' | 'PERCENT' | 'DATE' | 'SELECT' | 'AGENT_PICKER' | 'BOOLEAN';
  isRequired: boolean;
  dropdownOptions?: string[];
  isSystem: boolean;
  isEnabled: boolean;
}

export interface DynamicFormSection {
  sectionName: string;
  sectionSortOrder: number;
  fields: FieldConfiguration[];
}

export interface LookupValue {
  id: string;
  clientId: string;
  category: string;
  optionLabel: string;
  optionValue: string;
  sortOrder: number;
  isDefault: boolean;
}

/**
 * Retrieves configured fields for a target table and groups them by section for UI rendering.
 */
export async function getClientFieldConfigurations(
  clientId: string,
  targetTable: 'transactions' | 'agents' | 'contacts' = 'transactions',
  client?: SupabaseClient
): Promise<DynamicFormSection[]> {
  const sb = client || (await getAuthenticatedSupabase());
  const { data, error } = await sb
    .from('client_field_configurations')
    .select('*')
    .eq('client_id', clientId)
    .eq('target_table', targetTable)
    .eq('is_enabled', true)
    .or('archived.is.null,archived.eq.false')
    .order('section_sort_order', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error fetching field configurations:', error);
    throw error;
  }

  // Map database snake_case to TypeScript camelCase
  const fields: FieldConfiguration[] = (data || []).map((row: any) => ({
    id: row.id,
    clientId: row.client_id,
    targetTable: row.target_table,
    fieldKey: row.field_key,
    storageType: row.storage_type,
    sectionName: row.section_name || 'General',
    sectionSortOrder: Number(row.section_sort_order || 0),
    sortOrder: Number(row.sort_order || 0),
    fieldLabel: row.field_label,
    fieldType: row.field_type,
    isRequired: Boolean(row.is_required),
    dropdownOptions: row.dropdown_options || [],
    isSystem: Boolean(row.is_system),
    isEnabled: Boolean(row.is_enabled),
  }));

  // Group fields into UI sections based on sectionName
  const sectionsMap = new Map<string, DynamicFormSection>();

  for (const field of fields) {
    if (!sectionsMap.has(field.sectionName)) {
      sectionsMap.set(field.sectionName, {
        sectionName: field.sectionName,
        sectionSortOrder: field.sectionSortOrder,
        fields: [],
      });
    }
    sectionsMap.get(field.sectionName)!.fields.push(field);
  }

  return Array.from(sectionsMap.values()).sort(
    (a, b) => a.sectionSortOrder - b.sectionSortOrder
  );
}

/**
 * Retrieves lookup values (dropdown choices) for a specific category or tenant.
 */
export async function getClientLookupValues(
  clientId: string,
  category?: string,
  client?: SupabaseClient
): Promise<LookupValue[]> {
  const sb = client || (await getAuthenticatedSupabase());
  let query = sb
    .from('client_lookup_values')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .or('archived.is.null,archived.eq.false')
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true });

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching lookup values:', error);
    throw error;
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    clientId: row.client_id,
    category: row.category,
    optionLabel: row.option_label,
    optionValue: row.option_value,
    sortOrder: Number(row.sort_order || 0),
    isDefault: Boolean(row.is_default),
  }));
}

/**
 * System container keys and internal relational fields excluded from dynamic user configurations.
 */
export const HIDDEN_CONTAINER_KEYS = new Set([
  'client_id',
  'archived',
  'custom_attributes',
  'commission_attributes',
  'address_details',
  'co_broker',
  'settlement_vendors',
]);

export interface DatabaseColumnDefinition {
  field_key: string;
  field_label: string;
  field_type: 'TEXT' | 'NUMBER' | 'CURRENCY' | 'PERCENT' | 'DATE' | 'SELECT' | 'AGENT_PICKER' | 'BOOLEAN';
  section_name: string;
  storage_type: 'CORE_COLUMN';
  is_system: boolean;
  is_required: boolean;
  is_enabled: boolean;
  dropdown_options?: string[];
}

/**
 * Formats a numeric rate/percentage value into a standard percentage string with 3 decimal places (e.g. 2.500%, 2.000%, 2.750%, 3.000%).
 * Supports both decimal rate inputs (e.g. 0.025 -> 2.500%) and whole percent inputs (e.g. 2.5 -> 2.500%).
 */
export function formatPercent(val: any, decimals: number = 3): string {
  if (val === undefined || val === null || val === '') return '—';
  const num = Number(val);
  if (isNaN(num)) return String(val);
  const target = Math.abs(num) <= 1 && num !== 0 ? num * 100 : num;
  return `${target.toFixed(decimals)}%`;
}

/**
 * Canonical physical database columns for the `transactions` table in Supabase.
 */
export const DB_TRANSACTION_COLUMNS: DatabaseColumnDefinition[] = [
  { field_key: 'id', field_label: 'Transaction ID', field_type: 'TEXT', section_name: 'Deal Essentials', storage_type: 'CORE_COLUMN', is_system: true, is_required: true, is_enabled: true },
  { field_key: 'tms_id', field_label: 'TMS ID', field_type: 'TEXT', section_name: 'Deal Essentials', storage_type: 'CORE_COLUMN', is_system: true, is_required: false, is_enabled: true },
  { field_key: 'transaction_status', field_label: 'Status', field_type: 'SELECT', section_name: 'Deal Essentials', storage_type: 'CORE_COLUMN', is_system: true, is_required: true, is_enabled: true },
  { field_key: 'finance_status', field_label: 'Finance Status', field_type: 'SELECT', section_name: 'Deal Essentials', storage_type: 'CORE_COLUMN', is_system: false, is_required: false, is_enabled: true },
  { field_key: 'transaction_side', field_label: 'Side', field_type: 'SELECT', section_name: 'Deal Essentials', storage_type: 'CORE_COLUMN', is_system: true, is_required: true, is_enabled: true },
  { field_key: 'property_address', field_label: 'Property Address', field_type: 'TEXT', section_name: 'Deal Essentials', storage_type: 'CORE_COLUMN', is_system: true, is_required: true, is_enabled: true },
  { field_key: 'client_name', field_label: 'Client Name', field_type: 'TEXT', section_name: 'Deal Essentials', storage_type: 'CORE_COLUMN', is_system: false, is_required: false, is_enabled: true },
  { field_key: 'lead_source', field_label: 'Lead Source', field_type: 'SELECT', section_name: 'Deal Essentials', storage_type: 'CORE_COLUMN', is_system: false, is_required: false, is_enabled: true },
  { field_key: 'lead_owner', field_label: 'Lead Owner', field_type: 'TEXT', section_name: 'Deal Essentials', storage_type: 'CORE_COLUMN', is_system: false, is_required: false, is_enabled: true },
  { field_key: 'list_date', field_label: 'List Date', field_type: 'DATE', section_name: 'Deal Essentials', storage_type: 'CORE_COLUMN', is_system: false, is_required: false, is_enabled: true },
  { field_key: 'list_price', field_label: 'List Price', field_type: 'CURRENCY', section_name: 'System', storage_type: 'CORE_COLUMN', is_system: false, is_required: false, is_enabled: true },
  { field_key: 'acceptance_date', field_label: 'Acceptance Date', field_type: 'DATE', section_name: 'Deal Essentials', storage_type: 'CORE_COLUMN', is_system: false, is_required: false, is_enabled: true },
  { field_key: 'closing_date', field_label: 'Closing Date', field_type: 'DATE', section_name: 'Deal Essentials', storage_type: 'CORE_COLUMN', is_system: false, is_required: false, is_enabled: true },
  { field_key: 'sales_price', field_label: 'Sales Price', field_type: 'CURRENCY', section_name: 'System', storage_type: 'CORE_COLUMN', is_system: true, is_required: true, is_enabled: true },
  { field_key: 'gci_type', field_label: 'GCI Type', field_type: 'SELECT', section_name: 'System', storage_type: 'CORE_COLUMN', is_system: true, is_required: true, is_enabled: true },
  { field_key: 'gci_perc', field_label: 'GCI %', field_type: 'PERCENT', section_name: 'System', storage_type: 'CORE_COLUMN', is_system: true, is_required: true, is_enabled: true },
  { field_key: 'gci_amount', field_label: 'GCI Amount', field_type: 'CURRENCY', section_name: 'System', storage_type: 'CORE_COLUMN', is_system: true, is_required: true, is_enabled: true },
  { field_key: 'transaction_fee', field_label: 'Transaction Fee', field_type: 'CURRENCY', section_name: 'System', storage_type: 'CORE_COLUMN', is_system: false, is_required: false, is_enabled: true },
  { field_key: 'total_commission', field_label: 'Total Commission', field_type: 'CURRENCY', section_name: 'System', storage_type: 'CORE_COLUMN', is_system: true, is_required: true, is_enabled: true },
  { field_key: 'agent_id', field_label: 'Primary Agent', field_type: 'AGENT_PICKER', section_name: 'Deal Essentials', storage_type: 'CORE_COLUMN', is_system: true, is_required: true, is_enabled: true },
  { field_key: 'isa', field_label: 'ISA', field_type: 'SELECT', section_name: 'Deal Essentials', storage_type: 'CORE_COLUMN', is_system: false, is_required: false, is_enabled: true },
  { field_key: 'transaction_coordinator', field_label: 'Transaction Coordinator', field_type: 'SELECT', section_name: 'Deal Essentials', storage_type: 'CORE_COLUMN', is_system: false, is_required: false, is_enabled: true },
  { field_key: 'notes', field_label: 'Notes', field_type: 'TEXT', section_name: 'Deal Essentials', storage_type: 'CORE_COLUMN', is_system: false, is_required: false, is_enabled: true },
  { field_key: 'created_at', field_label: 'Created At', field_type: 'DATE', section_name: 'System', storage_type: 'CORE_COLUMN', is_system: true, is_required: false, is_enabled: false },
  { field_key: 'created_by', field_label: 'Created By', field_type: 'TEXT', section_name: 'System', storage_type: 'CORE_COLUMN', is_system: true, is_required: false, is_enabled: false },
  { field_key: 'updated_at', field_label: 'Updated At', field_type: 'DATE', section_name: 'System', storage_type: 'CORE_COLUMN', is_system: true, is_required: false, is_enabled: false },
  { field_key: 'updated_by', field_label: 'Updated By', field_type: 'TEXT', section_name: 'System', storage_type: 'CORE_COLUMN', is_system: true, is_required: false, is_enabled: false },
];

/**
 * Canonical physical database columns for the `agents` table in Supabase.
 */
export const DB_AGENT_COLUMNS: DatabaseColumnDefinition[] = [
  { field_key: 'id', field_label: 'Agent ID', field_type: 'TEXT', section_name: 'Identity & Status', storage_type: 'CORE_COLUMN', is_system: true, is_required: true, is_enabled: true },
  { field_key: 'user_id', field_label: 'User ID', field_type: 'TEXT', section_name: 'Identity & Status', storage_type: 'CORE_COLUMN', is_system: true, is_required: false, is_enabled: true },
  { field_key: 'tms_id', field_label: 'TMS ID', field_type: 'TEXT', section_name: 'Identity & Status', storage_type: 'CORE_COLUMN', is_system: true, is_required: false, is_enabled: true },
  { field_key: 'agent_name', field_label: 'Full Name', field_type: 'TEXT', section_name: 'Identity & Status', storage_type: 'CORE_COLUMN', is_system: true, is_required: true, is_enabled: true },
  { field_key: 'agent_email', field_label: 'Email Address', field_type: 'TEXT', section_name: 'Identity & Status', storage_type: 'CORE_COLUMN', is_system: true, is_required: true, is_enabled: true },
  { field_key: 'agent_phone', field_label: 'Phone Number', field_type: 'TEXT', section_name: 'Identity & Status', storage_type: 'CORE_COLUMN', is_system: false, is_required: false, is_enabled: true },
  { field_key: 'group_id', field_label: 'Group / Team', field_type: 'SELECT', section_name: 'Identity & Status', storage_type: 'CORE_COLUMN', is_system: true, is_required: true, is_enabled: true },
  { field_key: 'agent_status', field_label: 'Agent Status', field_type: 'SELECT', section_name: 'Identity & Status', storage_type: 'CORE_COLUMN', is_system: true, is_required: true, is_enabled: true, dropdown_options: ['Active', 'Released'] },
  { field_key: 'is_team_lead', field_label: 'Team Lead', field_type: 'BOOLEAN', section_name: 'Identity & Status', storage_type: 'CORE_COLUMN', is_system: false, is_required: false, is_enabled: true },
  { field_key: 'agent_onboard_date', field_label: 'Onboard Date', field_type: 'DATE', section_name: 'Identity & Status', storage_type: 'CORE_COLUMN', is_system: false, is_required: false, is_enabled: true },
  { field_key: 'agent_offboard_date', field_label: 'Offboard Date', field_type: 'DATE', section_name: 'Identity & Status', storage_type: 'CORE_COLUMN', is_system: false, is_required: false, is_enabled: true },
  { field_key: 'created_at', field_label: 'Created At', field_type: 'DATE', section_name: 'System', storage_type: 'CORE_COLUMN', is_system: true, is_required: false, is_enabled: false },
  { field_key: 'created_by', field_label: 'Created By', field_type: 'TEXT', section_name: 'System', storage_type: 'CORE_COLUMN', is_system: true, is_required: false, is_enabled: false },
  { field_key: 'updated_at', field_label: 'Updated At', field_type: 'DATE', section_name: 'System', storage_type: 'CORE_COLUMN', is_system: true, is_required: false, is_enabled: false },
  { field_key: 'updated_by', field_label: 'Updated By', field_type: 'TEXT', section_name: 'System', storage_type: 'CORE_COLUMN', is_system: true, is_required: false, is_enabled: false },
];

export function getDbTableColumns(table: 'transactions' | 'agents'): DatabaseColumnDefinition[] {
  return table === 'transactions' ? [...DB_TRANSACTION_COLUMNS] : [...DB_AGENT_COLUMNS];
}

export const schemaCache = new Map<string, { catalog: any[]; db_columns: any[]; timestamp: number }>();

export function clearSchemaCache(clientId?: string, table?: string) {
  if (clientId && table) {
    schemaCache.delete(`${clientId}_${table}`);
  } else if (clientId) {
    for (const key of schemaCache.keys()) {
      if (key.startsWith(`${clientId}_`)) schemaCache.delete(key);
    }
  } else {
    schemaCache.clear();
  }
}