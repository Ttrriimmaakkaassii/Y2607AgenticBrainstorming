import { describe, it, expect } from 'vitest';
import { validateDeliverable } from './deliverable';

describe('validateDeliverable', () => {
  it('accepts a general deliverable with sufficient length', () => {
    const r = validateDeliverable('general', 'This is a sufficiently long general response that meets the minimum length requirement for acceptance.');
    expect(r.accepted).toBe(true);
  });

  it('rejects a short deliverable', () => {
    expect(validateDeliverable('general', 'ok').accepted).toBe(false);
  });

  it('rejects research without a source URL', () => {
    const r = validateDeliverable('research_evidence', 'Based on my research I found that prices are reasonable in this area overall.');
    expect(r.accepted).toBe(false);
    expect(r.reasons.some((x) => x.includes('source URL'))).toBe(true);
  });

  it('accepts research with a source URL', () => {
    const r = validateDeliverable('research_evidence', 'Confirmed pricing at https://example.com/specs — the 165W model retails at $199. Retrieved 2026-07-17.');
    expect(r.accepted).toBe(true);
  });

  it('rejects comparison without enough data points', () => {
    const r = validateDeliverable('comparison', 'Both options are fine and have similar features overall based on the research conducted here.');
    expect(r.accepted).toBe(false);
  });

  it('rejects recommendation without a risk/limitation', () => {
    const r = validateDeliverable('recommendation', 'I recommend option A because it has the best features and performance for your use case overall.');
    expect(r.accepted).toBe(false);
  });

  it('accepts recommendation with a stated risk', () => {
    const r = validateDeliverable('recommendation', 'I recommend option A. Risk: prices may change. Limitation: data is from 2026.');
    expect(r.accepted).toBe(true);
  });
});
