import { describe, it, expect } from 'vitest';
import { evaluateSpeakerPermission, shouldInvokeAgent } from './speaker-gating';
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

describe('shouldInvokeAgent (deterministic contract)', () => {
  it('never invokes while awaiting_user', () => {
    const d = shouldInvokeAgent(baseAgent, { status: 'awaiting_user' });
    expect(d.invoke).toBe(false);
    expect(d.reason).toBe('awaiting_user');
  });

  it('blocks an agent not in allowedAgentIds', () => {
    const d = shouldInvokeAgent(baseAgent, { allowedAgentIds: ['someone-else'] });
    expect(d.invoke).toBe(false);
    expect(d.reason).toBe('not_in_allowed_agents');
  });

  it('blocks a non-assigned, non-addressed agent when an assignment exists', () => {
    const d = shouldInvokeAgent(baseAgent, { assignedAgentId: 'other' });
    expect(d.invoke).toBe(false);
    expect(d.reason).toBe('not_assigned_or_addressed');
  });

  it('allows the assigned agent', () => {
    expect(shouldInvokeAgent(baseAgent, { assignedAgentId: 'a1' }).invoke).toBe(true);
  });

  it('allows a directly-mentioned agent even when someone else is assigned', () => {
    const d = shouldInvokeAgent(baseAgent, { assignedAgentId: 'other', directMentions: ['a1'] });
    expect(d.invoke).toBe(true);
    expect(d.isDirectlyAddressed).toBe(true);
  });

  it('blocks in the error phase', () => {
    expect(shouldInvokeAgent(baseAgent, { phase: 'error' }).invoke).toBe(false);
  });

  it('blocks when prerequisites are incomplete', () => {
    expect(shouldInvokeAgent(baseAgent, { prerequisitesComplete: false }).invoke).toBe(false);
  });

  it('allows everyone in normal round-robin (no assignment, no allowed list)', () => {
    expect(shouldInvokeAgent(baseAgent, {}).invoke).toBe(true);
  });
});
