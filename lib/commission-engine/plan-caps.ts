/**
 * Whether an agent's plan agrees with the caps on the agent's own record. The client's agent caps (Settings > Caps)
 * name the entity they track and the agent field holding each agent's amount; a plan line paying that entity has a
 * yearly cap of its own. When both are there and differ, the agent is on a plan their record does not describe.
 * Propose Plans suggests the plan that agrees on every such line; the Plans and deal pages warn when one does not.
 */
import type { CommissionPlan, PlanLine } from './plans';

/** An agent cap from Settings > Caps: the entity it tracks and the agent field with each agent's amount. */
export interface AgentCapSource {
  name: string;
  entityName: string;
  fieldKey: string;
}

export interface PlanCapMismatch {
  lineKey: string;
  lineName: string;
  capName: string;
  fieldKey: string;
  /** The plan line's yearly cap; null when the line has none. */
  planCap: number | null;
  agentCap: number;
}

const same = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();

function readAmount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/[$,\s]/g, '');
  if (!text) return null;
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : null;
}

/**
 * A line's yearly cap: a percentage line's cap; a per-deal fee's last tier (how much is paid before the tiers end)
 * or else its yearly limit. Null when the line has no cap; undefined for lines that never have one.
 */
export function planLineCap(line: PlanLine): number | null | undefined {
  if (line.type === 'capped_percent') return line.capAmount ?? null;
  if (line.type === 'per_deal_fee') {
    if (line.tiers?.length) return line.tiers[line.tiers.length - 1].untilPaid ?? null;
    return line.yearlyLimit ?? null;
  }
  return undefined;
}

/**
 * The plan lines whose cap differs from the agent's cap field, and how many lines could be compared at all. Lines
 * Plan Settings already reads from an agent field (Cap Amounts) take the agent's amount, so they never differ.
 * A blank agent field says nothing; a plan line without a cap matches an agent amount of zero.
 */
export function planCapMismatches(
  plan: CommissionPlan,
  readField: (fieldKey: string) => unknown,
  sources: AgentCapSource[],
  agentFieldLines: Set<string> = new Set(),
): { compared: number; mismatches: PlanCapMismatch[] } {
  let compared = 0;
  const mismatches: PlanCapMismatch[] = [];
  for (const line of plan.lines) {
    if (agentFieldLines.has(line.key)) continue;
    const planCap = planLineCap(line);
    if (planCap === undefined) continue;
    const source = sources.find((item) => same(item.entityName, line.payee));
    if (!source) continue;
    const agentCap = readAmount(readField(source.fieldKey));
    if (agentCap === null) continue;
    compared += 1;
    if (Math.abs((planCap ?? 0) - agentCap) > 0.005) {
      mismatches.push({ lineKey: line.key, lineName: line.name, capName: source.name, fieldKey: source.fieldKey, planCap, agentCap });
    }
  }
  return { compared, mismatches };
}

/**
 * The one candidate plan that agrees with every agent cap it can be compared on, preferring the client's own plans
 * over presets. Empty when nothing can be compared, nothing fits, or more than one fits equally.
 */
export function proposePlanFor(
  candidates: { value: string; plan: CommissionPlan; own: boolean }[],
  readField: (fieldKey: string) => unknown,
  sources: AgentCapSource[],
  agentFieldLines: Set<string> = new Set(),
): string {
  const fits = candidates.filter((candidate) => {
    const check = planCapMismatches(candidate.plan, readField, sources, agentFieldLines);
    return check.compared > 0 && check.mismatches.length === 0;
  });
  const own = fits.filter((candidate) => candidate.own);
  const pool = own.length ? own : fits;
  return pool.length === 1 ? pool[0].value : '';
}

/** "$8,000" or "No Cap". */
export function capText(amount: number | null): string {
  return amount === null ? 'No Cap' : `$${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/** "Broker Cap: the plan's $16,000 is used; the agent's Broker Cap field says $8,000." */
export function capMismatchText(mismatch: PlanCapMismatch): string {
  return `${mismatch.lineName}: the plan's ${capText(mismatch.planCap)} is used; the agent's ${mismatch.capName} field says ${capText(mismatch.agentCap)}.`;
}
