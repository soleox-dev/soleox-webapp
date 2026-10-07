import React from 'react';

export function readTransactionField(deal: any, fieldKey: string): any {
  if (!deal) return undefined;
  const direct = deal[fieldKey];
  if (direct !== undefined && direct !== null && direct !== '') return direct;
  let attributes = deal.custom_attributes;
  if (typeof attributes === 'string') {
    try {
      attributes = JSON.parse(attributes);
    } catch {
      attributes = undefined;
    }
  }
  if (attributes && typeof attributes === 'object') {
    const custom = attributes[fieldKey];
    if (custom !== undefined && custom !== null && custom !== '') return custom;
  }
  return direct;
}

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

export interface KnownAgentInfo {
  id: string;
  name: string;
  email?: string;
  isTeamLead: boolean;
  clientId?: string;
  fields?: Record<string, string>;
}

export interface CommissionEntityOption {
  id: string;
  name: string;
  type?: string;
}

export interface AgentConfig {
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

export interface DynamicRule {
  id: string;
  name?: string;
  entity: string;
  note?: string;
  type: 'PERCENT' | 'AMOUNT';
  value: number;
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

export const roundCurrency = (num: number): number => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

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

export const evaluateFormula = (formulaStr: string, contextValues: Record<string, any>): number => {
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

    // Default any remaining unmapped identifiers to 0 to prevent ReferenceErrors
    sanitizedFormula = sanitizedFormula.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match) => {
      if (['true', 'false', 'null', 'undefined', 'Math', 'return', 'Infinity', 'NaN'].includes(match)) return match;
      return '0';
    });

    const result = new Function(`"use strict"; return (${sanitizedFormula})`)();
    const numResult = Number(result);
    return isNaN(numResult) ? 0 : roundCurrency(numResult);
  } catch (err) {
    console.warn(`Formula evaluation failed for "${formulaStr}":`, err);
    return 0;
  }
};