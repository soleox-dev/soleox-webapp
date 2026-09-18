import React from 'react';

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
  brokerCapLimit: number;
  brokerCapPaidYTD: number;
  riskCapLimit: number;
  riskPaidYTD: number;
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
  name: string;
  entity: string;
  type: 'PERCENT' | 'AMOUNT';
  value: number;
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

export const formatPercent = (val: any, decimals: number = 3): string => {
  if (val === undefined || val === null || val === '') return '—';
  const num = Number(val);
  if (isNaN(num)) return String(val);
  const target = Math.abs(num) <= 1 && num !== 0 ? num * 100 : num;
  return `${target.toFixed(decimals)}%`;
};

export const formatPercentageClean = (num: number): string => {
  if (num === null || num === undefined || isNaN(num)) return '';
  const target = num > 1 ? num : num * 100;
  const cleanNum = Number(Math.round(Number(target + 'e8')) + 'e-8');
  return cleanNum.toString();
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