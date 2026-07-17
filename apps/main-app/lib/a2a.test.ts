import { describe, it, expect } from 'vitest';
import { validateA2A } from './a2a';
import { A2AMessage } from './types';

function validEnvelope(): A2AMessage {
  return {
    version: 1,
    messageId: 'm1',
    conversationId: 'c1',
    fromAgent: 'a1',
    toAgent: 'a2',
    phase: 'execution',
    intent: 'respond',
    naturalLanguageSummary: 'Here is the answer.',
    status: 'complete',
    createdAt: '2026-07-17T10:00:00.000Z',
  };
}

describe('validateA2A', () => {
  it('accepts a minimal valid envelope', () => {
    const r = validateA2A(validEnvelope());
    expect('error' in r).toBe(false);
  });

  it('accepts a full envelope with classified claims + evidence refs', () => {
    const env = {
      ...validEnvelope(),
      confidence: 'medium',
      claims: [
        { claimId: 'cl1', text: 'x is 5', classification: 'verified', evidenceRefs: ['e1'], allowedInFinalAnswer: true },
        { claimId: 'cl2', text: 'maybe y', classification: 'hypothesis', evidenceRefs: [], allowedInFinalAnswer: false },
      ],
      evidenceRefs: ['e1'],
      durationMs: 1200,
    };
    const r = validateA2A(env);
    expect('error' in r).toBe(false);
  });

  it('rejects an unsupported phase', () => {
    const r = validateA2A({ ...validEnvelope(), phase: 'brainstorming' as any });
    expect('error' in r).toBe(true);
  });

  it('rejects an unsupported intent', () => {
    const r = validateA2A({ ...validEnvelope(), intent: 'yell' as any });
    expect('error' in r).toBe(true);
  });

  it('rejects a bad claim classification', () => {
    const r = validateA2A({
      ...validEnvelope(),
      claims: [{ claimId: 'c', text: 't', classification: 'certainly_true', evidenceRefs: [], allowedInFinalAnswer: true }],
    });
    expect('error' in r).toBe(true);
  });

  it('rejects an invalid confidence', () => {
    const r = validateA2A({ ...validEnvelope(), confidence: 'pretty_sure' as any });
    expect('error' in r).toBe(true);
  });

  it('rejects a non-ISO createdAt', () => {
    const r = validateA2A({ ...validEnvelope(), createdAt: 'yesterday' });
    expect('error' in r).toBe(true);
  });

  it('rejects a negative durationMs', () => {
    const r = validateA2A({ ...validEnvelope(), durationMs: -5 });
    expect('error' in r).toBe(true);
  });

  it('rejects an oversized payload (payload cap)', () => {
    const env = { ...validEnvelope(), naturalLanguageSummary: 'x'.repeat(100_000) };
    const r = validateA2A(env);
    expect('error' in r).toBe(true);
    if ('error' in r) expect(r.error).toMatch(/too large/i);
  });

  it('rejects an empty toAgent', () => {
    const r = validateA2A({ ...validEnvelope(), toAgent: [] });
    expect('error' in r).toBe(true);
  });
});
