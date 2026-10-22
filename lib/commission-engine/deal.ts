/**
 * computeDealCommission: one deal's commission, from the waterfall on screen (or read from saved lines) to what
 * saving writes. Every caller (Transaction Detail, the template popup, the template button's and the Transactions
 * list's out-of-date payments checks) goes through it. Pure: no React, no fetch.
 */
import type { DealAllocationContext } from '@/lib/agent-allocations';
import { computeTransactionWaterfall, type WaterfallInput, type WaterfallResult } from './waterfall';
import {
  allocationRowsForSave,
  capRecipientShortfalls,
  commissionLinesForSave,
  paymentsForSave,
  saveBlockers,
  type AllocationSaveRow,
  type SaveBlockers,
} from './save';
import type { CommissionEntityOption, EngineField, KnownAgentInfo, StoredCommissionItem, WaterfallState } from './model';

export type TemplateReplay = NonNullable<WaterfallInput['templateReplay']>;

export type DealCommissionInput = {
  /** The deal row. */
  deal: Record<string, any> | null;
  /** Fields being edited on the Overview; they win over the deal row. */
  form?: Record<string, any>;
  salesPrice: number;
  gciPerc: number;
  clientType: string;
  /** Transaction fields: Total Commission may have a formula. */
  fields: EngineField[];
  /** Agents, deductions and post-splits: the saved lines (waterfallFromCommissionItems), an edit, or a template just applied. */
  waterfall: WaterfallState;
  primaryAgentId?: string | null;
  /** Team caps and sales volume, with the submission's checked caps in selectedTeamCapIds. Null while loading. */
  allocation?: DealAllocationContext | null;
  /** The submitted template, replayed once a team cap moves money. Null while it loads or when there is none. */
  template?: TemplateReplay | null;
  /** Saved splits after team caps, shown until the replay loads. Only for the saved, unedited waterfall. */
  storedAgentSplits?: { agentId: string; amount: number }[] | null;
};

export type DealSaveInput = {
  knownAgents: KnownAgentInfo[];
  knownEntities: CommissionEntityOption[];
  /** The Primary Agent field, named in payment notes when that agent is not on the waterfall. */
  primaryAgentFallback: string;
  paymentDate: string;
  /** False when no active commission template applies; then the commission need not be fully paid out. */
  templateQualifies: boolean | null;
};

export type DealCommission = WaterfallResult & {
  save?: {
    commissionItems: ReturnType<typeof commissionLinesForSave>;
    payments: ReturnType<typeof paymentsForSave>;
    allocationRows: AllocationSaveRow[];
    blockers: SaveBlockers;
  };
};

export function computeDealCommission(input: DealCommissionInput): WaterfallResult;
export function computeDealCommission(input: DealCommissionInput, save: DealSaveInput): Required<DealCommission>;
export function computeDealCommission(input: DealCommissionInput, save?: DealSaveInput): DealCommission {
  const result = computeTransactionWaterfall({
    salesPrice: input.salesPrice,
    gciPerc: input.gciPerc,
    offTheTopRules: input.waterfall.offTheTopRules,
    preSplitRules: input.waterfall.preSplitRules,
    postSplitRulesByAgent: input.waterfall.postSplitRulesByAgent,
    postSplit2RulesByAgent: input.waterfall.postSplit2RulesByAgent,
    agents: input.waterfall.agents,
    primaryAgentId: input.primaryAgentId,
    overviewFields: input.fields,
    selectedDeal: input.deal,
    overviewFormValues: input.form ?? {},
    clientType: input.clientType,
    allocation: input.allocation ?? null,
    templateReplay: input.template ?? null,
    storedAgentSplits: input.storedAgentSplits ?? null,
  });
  if (!save) return result;
  const shortfalls = capRecipientShortfalls(result, input.allocation?.teamCaps ?? [], save.knownAgents);
  return {
    ...result,
    save: {
      commissionItems: commissionLinesForSave(result, save),
      payments: paymentsForSave(result, {
        ...save,
        agents: input.waterfall.agents,
        primaryAgentId: input.primaryAgentId ?? null,
      }),
      allocationRows: allocationRowsForSave(result.allocationLines),
      blockers: saveBlockers(result, save.templateQualifies, shortfalls),
    },
  };
}

/** Saved AGENT_SPLIT dollars per agent: what each agent got after team caps when the deal was saved. */
export function storedAgentSplitsFrom(items: StoredCommissionItem[]): { agentId: string; amount: number }[] {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.section === 'AGENT_SPLIT' && item.agent_id && item.final_amount != null)
    .map((item) => ({ agentId: String(item.agent_id), amount: Number(item.final_amount) || 0 }));
}
