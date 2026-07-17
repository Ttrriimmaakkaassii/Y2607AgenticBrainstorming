import { describe, it, expect } from 'vitest';
import { validateChartAgainstClaims } from './chart-validate';
import { ChartSpec, ClaimRecord } from './types';

const spec: ChartSpec = { type: 'bar', categories: ['A', 'B'], series: [{ name: 'S1', data: [10, 20] }] };

describe('chart validation', () => {
  it('rejects a chart when no verified claims exist', () => {
    const r = validateChartAgainstClaims(spec, []);
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes('no verified claims'))).toBe(true);
  });

  it('accepts a chart when at least one verified claim exists', () => {
    const claims: ClaimRecord[] = [
      { claimId: 'c1', conversationId: 'c', text: 'x', status: 'verified', evidenceIds: ['e1'], createdByAgentId: 'a', materiality: 'medium', allowedInRecommendation: true, allowedInFinalAnswer: true, createdAt: '', updatedAt: '' },
    ];
    const r = validateChartAgainstClaims(spec, claims);
    expect(r.ok).toBe(true);
  });

  it('rejects a series with empty data', () => {
    const badSpec: ChartSpec = { type: 'line', categories: ['A'], series: [{ name: 'S', data: [] }] };
    const r = validateChartAgainstClaims(badSpec, []);
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes('no data points'))).toBe(true);
  });
});
