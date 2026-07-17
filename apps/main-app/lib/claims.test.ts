import { describe, it, expect } from 'vitest';
import { createClaim, mayUseClaimInFinalAnswer, promoteClaim, disputeClaim, filterForFinalAnswer } from './claims';

const baseClaim = () => createClaim({ conversationId: 'c1', text: 'Price is $199', createdByAgentId: 'a1' });

describe('claims', () => {
  it('creates an unverified claim by default', () => {
    const c = baseClaim();
    expect(c.status).toBe('unverified');
    expect(mayUseClaimInFinalAnswer(c)).toBe(false);
  });

  it('promotes a claim with evidence to verified', () => {
    const c = promoteClaim({ ...baseClaim(), evidenceIds: ['e1'] });
    expect(c.status).toBe('verified');
    expect(mayUseClaimInFinalAnswer(c)).toBe(true);
  });

  it('cannot promote without evidence', () => {
    expect(() => promoteClaim(baseClaim())).toThrow(/without evidence/i);
  });

  it('dispute removes from final answer + creates correction', () => {
    const { claim, correction } = disputeClaim({ ...baseClaim(), status: 'verified', evidenceIds: ['e1'], allowedInFinalAnswer: true }, 'user says price is wrong');
    expect(claim.status).toBe('rejected');
    expect(mayUseClaimInFinalAnswer(claim)).toBe(false);
    expect(correction.originalClaimId).toBe(claim.claimId);
  });

  it('allows inference with evidence + flag in final answer', () => {
    const c = { ...baseClaim(), status: 'inference' as const, evidenceIds: ['e1'], allowedInFinalAnswer: true };
    expect(mayUseClaimInFinalAnswer(c)).toBe(true);
  });

  it('blocks inference without evidence', () => {
    const c = { ...baseClaim(), status: 'inference' as const, evidenceIds: [], allowedInFinalAnswer: true };
    expect(mayUseClaimInFinalAnswer(c)).toBe(false);
  });

  it('filterForFinalAnswer keeps only verified + vetted inference', () => {
    const claims = [
      { ...baseClaim(), status: 'verified' as const, evidenceIds: ['e1'], allowedInFinalAnswer: true },
      baseClaim(), // unverified
      { ...baseClaim(), status: 'inference' as const, evidenceIds: ['e2'], allowedInFinalAnswer: true },
      { ...baseClaim(), status: 'rejected' as const },
    ];
    const ok = filterForFinalAnswer(claims);
    expect(ok).toHaveLength(2);
  });
});
