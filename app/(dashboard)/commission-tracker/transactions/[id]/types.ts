import React from 'react';

// The engine's shapes and helpers live in lib/commission-engine; the transaction screens import them from here too.
export {
  readTransactionField,
  roundCurrency,
  evaluateFormula,
  type AgentConfig,
  type CommissionEntityOption,
  type DynamicRule,
  type KnownAgentInfo,
} from '@/lib/commission-engine/model';

export interface VisibilityCondition {
  id?: string;
  field_key: string;
  operator: 'IN' | 'EQUALS' | 'NOT_EQUALS' | 'IS_IN_LIST' | 'NOT_IN';
  value: string | string[];
}

export interface VisibilityRulesConfig {
  operator?: 'AND' | 'OR';
  conditions?: VisibilityCondition[];
}

export interface SchemaField {
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

/** A required field counts only while its visibility rules leave it on the form. */
export function isOverviewFieldVisible(
  field: { visibility_rules?: VisibilityRulesConfig },
  rawValue: unknown,
  readControlling: (fieldKey: string) => unknown,
): boolean {
  const cleanStr = String(rawValue ?? '').trim();
  const hasData =
    rawValue !== undefined &&
    rawValue !== null &&
    cleanStr !== '' &&
    cleanStr !== '—';

  const conditions = field.visibility_rules?.conditions || [];
  if (conditions.length === 0) return true;

  const groupOperator = field.visibility_rules?.operator || 'OR';
  const evaluateCondition = (cond: VisibilityCondition): boolean => {
    const controllingVal = readControlling(cond.field_key);
    if (controllingVal === undefined || controllingVal === null || String(controllingVal).trim() === '') {
      return false;
    }
    const strControllingVal = String(controllingVal).trim().toLowerCase();
    const targetArray = Array.isArray(cond.value)
      ? cond.value.map((value) => String(value || '').trim().toLowerCase())
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
}

export interface FieldSetting {
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
  /** Place in Key Terms at the top of the Overview; null when the field shows in its own section. */
  key_terms_position?: number | null;
}

export interface ToastNotification {
  message: string;
  type: 'success' | 'error' | 'info';
}

export const CORE_REQUIRED_FIELDS = new Set([
  'id',
  'property_address',
  'agent_id',
  'sales_price',
  'closing_date',
  'transaction_status',
  'transaction_side',
]);

import { formatPercentPoints } from '@/lib/percent';

export {
  fromPercentPoints,
  toPercentPoints,
  roundPercentRate,
  formatPercentPoints,
  formatPercentRate as formatPercent,
} from '@/lib/percent';

/** Formats percent points the user is typing. 1.5 → "1.5", 80 → "80". */
export const formatPercentageClean = (points: number): string => {
  if (points === null || points === undefined || Number.isNaN(points)) return '';
  return formatPercentPoints(points);
};
