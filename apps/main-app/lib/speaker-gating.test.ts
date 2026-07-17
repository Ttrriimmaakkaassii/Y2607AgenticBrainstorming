import { describe, it, expect } from 'vitest';
import { evaluateSpeakerPermission } from './speaker-gating';
import { Agent, SharedAgentState } from './types';

const baseAgent: Agent = {
  id: 'a1', refNumber: 'Agt1', name: 'A', role: '', instructions: '', identity: '', skills: '',
  loopGuidance: '', description: '', color: '#000', llmProvider: 'openai', connectionId: 'c',
  active: true, participant: true, pinnedToAllConversations: false, webSearchEnabled: false,
  chartEnabled: false, voiceURI: null, googleVoiceName: null, traits: {},
};

function state(phase?: SharedAgentState['activePhase']): SharedAgentState | undefined {
  if (!phase) return undefined;
  return { revision: 0, conversationId: 'c', verifiedFacts: {}, pendingClaims: {}, rejectedClaims: {}, decisions: [], openQuestions: [], completedTasks: [], updatedAt: 'x', activePhase: phase };
}

describe('evaluateSpeakerPermission', () => {
  it('allows everyone when there is no assignment (round-robin default)', () => {
    expect(evaluateSpeakerPermission(baseAgent, {}).allowed).toBe(true);
  });

  it('allows the assigned speaker', () => {
    const p = evaluateSpeakerPermission(baseAgent, { assignedSpeaker: 'a1' });
    expect(p.isAssignedSpeaker).toBe(true);
    expect(p.allowed).toBe(true);
  });

  it('denies a non-assigned agent when an assignment exists', () => {
    const p = evaluateSpeakerPermission(baseAgent, { assignedSpeaker: 'someone-else' });
    expect(p.allowed).toBe(false);
    expect(p.reason).toMatch(/assigned|addressee/i);
  });

  it('allows a directly-addressed agent', () => {
    const p = evaluateSpeakerPermission(baseAgent, { addressedIds: ['a1'] });
    expect(p.isDirectlyAddressed).toBe(true);
    expect(p.allowed).toBe(true);
  });

  it('denies everyone in the error phase', () => {
    const p = evaluateSpeakerPermission(baseAgent, { phase: 'error' });
    expect(p.allowed).toBe(false);
  });

  it('denies everyone when shared state is complete', () => {
    const p = evaluateSpeakerPermission(baseAgent, { sharedState: state('complete') });
    expect(p.allowed).toBe(false);
  });
});
