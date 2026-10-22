/**
 * The platform's Commission Plan presets. They are data (`presets/*.json`), read through the plan schema; phase 2
 * moves them to a database table edited in Settings, so callers should treat them as rows, not constants.
 */
import expPlans from './presets/exp-plans.json';
import { commissionPlanSchema, type CommissionPlan } from './plans';

export function loadPlanPresets(data: Record<string, unknown> = expPlans): Record<string, CommissionPlan> {
  return Object.fromEntries(Object.entries(data).map(([id, plan]) => [id, commissionPlanSchema.parse(plan)]));
}
