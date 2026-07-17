import { describe, it, expect } from 'vitest';
import { applyDelta, emptySharedState, makeDelta, fact, summarizeForPrompt } from './shared-state';

describe('applyDelta', () => {
  it('applies a delta and bumps the revision', () => {
    const s0 = emptySharedState('c1');
    const { state: s1, applied } = applyDelta(s0, makeDelta(s0.revision, { addDecisions: ['decide A'], setPhase: 'decision' }));
    expect(applied).toBe(true);
    expect(s1.revision).toBe(1);
    expect(s1.decisions).toContain('decide A');
    expect(s1.activePhase).toBe('decision');
  });

  it('promotes a verified fact and drops the matching pending claim', () => {
    const s0 = emptySharedState('c1');
    const s1 = applyDelta(s0, makeDelta(s0.revision, { updateClaims: [{ id: 'cl1', text: 't', classification: 'inference', evidenceRefs: [], updatedAt: 'x' }] })).state;
    expect(Object.keys(s1.pendingClaims)).toContain('cl1');
    const s2 = applyDelta(s1, makeDelta(s1.revision, { addFacts: [fact('cl1', 'verified text')] })).state;
    expect(s2.verifiedFacts['cl1']).toBeDefined();
    expect(s2.pendingClaims['cl1']).toBeUndefined();
  });

  it('rejects a delta whose baseRevision does not match (optimistic-concurrency guard)', () => {
    const s0 = emptySharedState('c1');
    const { applied, state } = applyDelta(s0, { baseRevision: 999, nextRevision: 1000, addDecisions: ['x'] });
    expect(applied).toBe(false);
    expect(state).toBe(s0);
  });

  it('closes an open question', () => {
    const s0 = emptySharedState('c1');
    const s1 = applyDelta(s0, makeDelta(s0.revision, { addDecisions: ['d'], closeQuestions: [] })).state;
    // reopen path: add via patch not available; test closeQuestions on a state with a question
    const s2 = applyDelta({ ...s1, openQuestions: ['q1', 'q2'] }, makeDelta(s1.revision, { closeQuestions: ['q1'] })).state;
    expect(s2.openQuestions).not.toContain('q1');
  });
});

describe('summarizeForPrompt', () => {
  it('returns null for an empty state', () => {
    expect(summarizeForPrompt(emptySharedState('c1'))).toBeNull();
  });
  it('includes phase, facts, and decisions when present', () => {
    const s = emptySharedState('c1');
    s.activePhase = 'analysis';
    s.verifiedFacts['f1'] = fact('f1', 'sky is blue');
    s.decisions = ['go'];
    const out = summarizeForPrompt(s)!;
    expect(out).toContain('Phase: analysis');
    expect(out).toContain('sky is blue');
    expect(out).toContain('go');
  });
});
