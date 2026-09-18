// If schema.ts is in src/types/ or root types/ folder:
import { 
  Transaction, 
  TransactionCommissionItem, 
  WaterfallSection, 
  PayeeType 
} from '../../types/schema';

export interface TemplateLogicStep {
  id: string;
  step_number: number;
  rule_name: string;
  section: WaterfallSection;
  payee_type: PayeeType;
  payee_entity_id?: string;
  calculation_formula: string; // e.g., "gci_amount * 0.06" or "(gci_amount - off_the_top) * agent_split_rate"
}

export interface CalculationContext {
  gci_amount: number;
  agent_split_rate: number;
  off_the_top: number;
  [key: string]: number;
}

/**
 * Safely evaluates a math formula string using transaction context variables.
 */
function evaluateFormula(formula: string, context: CalculationContext): number {
  // Replace formula variable keys with actual numeric values from context
  let expr = formula;
  Object.keys(context).forEach((key) => {
    const regex = new RegExp(`\\b${key}\\b`, 'g');
    expr = expr.replace(regex, context[key].toString());
  });

  // Strict sanitization: ensure expression contains only numbers, math operators, spaces, and parentheses
  if (!/^[0-9+*/.() -]+$/.test(expr)) {
    throw new Error(`Invalid or unsafe formula expression: ${formula}`);
  }

  // Safe evaluation
  // eslint-disable-next-line no-new-func
  const result = new Function(`return (${expr})`)();
  return Math.round((Number(result) || 0) * 100) / 100; // Round to 2 decimal places
}

/**
 * Executes the Waterfall Commission Calculation Pipeline.
 */
export function calculateWaterfall(
  transaction: Pick<Transaction, 'id' | 'client_id' | 'gci_amount' | 'agent_id'>,
  submissionId: string,
  logicSteps: TemplateLogicStep[],
  parameters: Record<string, number> = {}
): Omit<TransactionCommissionItem, 'id' | 'created_at' | 'updated_at'>[] {
  
  // 1. Initialize Calculation Context
  const context: CalculationContext = {
    gci_amount: transaction.gci_amount,
    agent_split_rate: parameters.agent_split_rate ?? 0.70, // Default 70% if unprovided
    off_the_top: 0,
    pre_split: 0,
    post_split: 0,
    ...parameters
  };

  const calculatedItems: Omit<TransactionCommissionItem, 'id' | 'created_at' | 'updated_at'>[] = [];

  // Sort logic steps strictly by step_number
  const sortedSteps = [...logicSteps].sort((a, b) => a.step_number - b.step_number);

  // 2. Iterate through ordered waterfall steps
  for (const step of sortedSteps) {
    const calculatedAmount = evaluateFormula(step.calculation_formula, context);

    // Track running totals per waterfall stage for downstream formula references
    if (step.section === 'OFF_THE_TOP') {
      context.off_the_top += calculatedAmount;
    } else if (step.section === 'PRE_SPLIT') {
      context.pre_split += calculatedAmount;
    } else if (step.section === 'POST_SPLIT') {
      context.post_split += calculatedAmount;
    }

    // Map payee targets
    const payeeEntityId = step.payee_type === 'ENTITY' ? step.payee_entity_id : undefined;
    const agentId = step.payee_type === 'AGENT' ? transaction.agent_id : undefined;

    calculatedItems.push({
      client_id: transaction.client_id,
      transaction_id: transaction.id,
      submission_id: submissionId,
      step_number: step.step_number,
      rule_name: step.rule_name,
      section: step.section,
      payee_type: step.payee_type,
      payee_entity_id: payeeEntityId,
      agent_id: agentId,
      calculated_amount: calculatedAmount,
      final_amount: calculatedAmount, // Initially matches calculated amount until manual override
      is_manual_override: false,
      archived: false,
    });
  }

  return calculatedItems;
}