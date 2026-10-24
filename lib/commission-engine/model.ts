/** The shapes the commission engine works on. Plain data, no React, safe on the server. */

import type { AgentStage } from './stages';

export { roundPercentRate } from '@/lib/percent';

export const roundCurrency = (num: number): number => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

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
  waterfallSortOrder?: number | null;
}

export interface AgentConfig {
  id: string;
  name: string;
  isTeamLead: boolean;
  splitType: 'PERCENT' | 'AMOUNT';
  splitVal: number;
  /**
   * The split was typed by hand in the waterfall: it wins over the submitted template's formula for this agent
   * (shown as EDITED) until the template is submitted again. Saved as custom_attributes.manual_split.
   */
  manualSplit?: boolean;
  /**
   * Dollars bonus lines moved to this agent on the deal (negative when the agent paid them). Commission Plans share
   * per-deal fees by the split without them. Saved as custom_attributes.bonus_net on the agent's split line.
   */
  bonusNet?: number;
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
  /** This rule's formula reads a team cap amount, so the waterfall recalculates it after the cap. */
  fromTeamCapBaseline?: boolean;
  /** A Commission Plan line: its key, saved as plan_line_key. */
  planLineKey?: string;
  /** The plan version it was calculated with, saved as commission_plan_version_id. */
  planVersionId?: string;
  /** The plan line's amount was typed by hand: it wins over the plan and counts as paid. */
  planTyped?: boolean;
  /** The deal waives this plan line. */
  planWaived?: boolean;
  /** A credit paid by this agent: it comes off the side before the plan's lines. */
  beforePlan?: boolean;
  /**
   * The level within its stage (stages.ts): every percent in a level takes the same base. Absent: the map it sits in
   * decides (postSplitRulesByAgent is Level 1, postSplit2RulesByAgent Level 2; Off the Top 1, pre-splits 2).
   */
  level?: number;
  /** The agent stage it runs in. Absent: worked out by agentLineStage in waterfall.ts. */
  stage?: AgentStage;
}

/** A transaction field as the engine reads it: Total Commission may have a formula. */
export interface EngineField {
  key: string;
  type?: string;
  calculation_formula?: string;
}

/** The editable waterfall: who splits the pool and what comes off before and after. */
export interface WaterfallState {
  agents: AgentConfig[];
  offTheTopRules: DynamicRule[];
  preSplitRules: DynamicRule[];
  postSplitRulesByAgent: Record<string, DynamicRule[]>;
  postSplit2RulesByAgent: Record<string, DynamicRule[]>;
}

/** A commission line as stored in transaction_commission_items. */
export interface StoredCommissionItem {
  id: string;
  step_number?: number | string | null;
  rule_name?: string | null;
  section?: string | null;
  split_type?: string | null;
  split_value?: number | string | null;
  note?: string | null;
  payee_type?: string | null;
  payee_entity_id?: string | null;
  agent_id?: string | null;
  calculated_amount?: number | string | null;
  final_amount?: number | string | null;
  custom_attributes?: Record<string, unknown> | null;
  plan_line_key?: string | null;
  commission_plan_version_id?: string | null;
}

/** Total Commission's formula from Settings, evaluated against the deal's fields. */
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
