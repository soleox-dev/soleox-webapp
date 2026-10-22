import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareTath } from '@/scripts/plans/compare-tath';

/**
 * Runs the TATH template-versus-plans comparison on the 25 golden deals. PLAN_COMPARE_OUT=<file> writes the report.
 * Every difference has been reviewed: the only one left is decided in the plans' favor (below). A new difference
 * fails here until it is reviewed too.
 */
describe('TATH template versus Commission Plans', () => {
  it('calculates every golden deal', () => {
    const report = compareTath();
    expect(report.deals.length + report.skipped.length).toBe(25);
    expect(report.deals.flatMap((deal) => deal.warnings)).toEqual([]);
    // Reviewed 2026-10-22: TXN_FD0470EA6284 is a double end with Fee Share 50%. The template ignored its own
    // broker_units_percent; the plans halve the per-deal fees, which is what eXp charges.
    expect([...new Set(report.diffs.map((diff) => diff.dealId))]).toEqual(['TXN_FD0470EA6284']);
    expect(report.diffs.filter((diff) => diff.line !== 'Stock').every((diff) => diff.planAmount < diff.template)).toBe(true);
    const out = process.env.PLAN_COMPARE_OUT;
    if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2));
  });
});
