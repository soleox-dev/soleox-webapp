import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareTath } from '@/scripts/plans/compare-tath';

/**
 * Runs the TATH template-versus-plans comparison on the 25 golden deals. The differences are for review, not a
 * pass/fail: this only checks every deal and agent could be calculated. PLAN_COMPARE_OUT=<file> writes the report.
 */
describe('TATH template versus Commission Plans', () => {
  it('calculates every golden deal', () => {
    const report = compareTath();
    expect(report.deals.length + report.skipped.length).toBe(25);
    expect(report.deals.flatMap((deal) => deal.warnings)).toEqual([]);
    const out = process.env.PLAN_COMPARE_OUT;
    if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2));
  });
});
