import { describe, it, expect, beforeEach } from 'vitest';
import { applyEvent, resetEventCache } from './state-engine';
import { ConversationState } from './types';

function baseState(): ConversationState {
  return {
    id: 'c1',
    agents: [],
    threads: [],
    settings: {
      topic: '',
      maxSentences: 1,
      bulletCount: 3,
      maxExchanges: 10,
      maxTokens: null,
      orchestratorEnabled: true,
      repetitionGuardEnabled: true,
      moods: [],
      responseStyle: 'sentences',
      interactionStyle: 'dialogue',
      ttsRate: 1,
      ttsLang: 'en-US',
      ttsProvider: 'browser',
      googleTtsModel: '',
      whatsappNumber: '',
      wikiEnabled: true,
      wikiKeeperConnectionId: null,
      wikiRefreshInterval: 10,
      wikiDigest: '',
      wikiUpdatedAt: 0,
      wikiMessageCountAtLastUpdate: 0,
      wikiHistory: [],
      pauseOnTabSwitch: true,
      textSize: 'sm',
    },
    status: 'idle',
    updatedAt: 0,
    nextAgentNumber: 1,
  };
}

describe('state engine', () => {
  beforeEach(() => resetEventCache());

  it('USER_MESSAGE_RECEIVED resumes from awaiting_user', () => {
    const s = { ...baseState(), status: 'awaiting_user' as const };
    const { state, applied } = applyEvent(s, { type: 'USER_MESSAGE_RECEIVED', messageId: 'm1' });
    expect(applied).toBe(true);
    expect(state.status).toBe('running');
  });

  it('is idempotent — duplicate event is skipped', () => {
    const s = baseState();
    const e = { type: 'USER_MESSAGE_RECEIVED', messageId: 'm1' };
    const r1 = applyEvent(s, e);
    const r2 = applyEvent(r1.state, e);
    expect(r2.applied).toBe(false);
    expect(r2.rejectionReason).toBe('duplicate_event');
  });

  it('bumps the revision on each applied event', () => {
    const s = baseState();
    const r1 = applyEvent(s, { type: 'OBJECTIVE_CONFIRMED', objectiveId: 'o1' });
    const r2 = applyEvent(r1.state, { type: 'TASK_CREATED', taskId: 't1' });
    const rev1 = r1.state.settings.sharedState?.revision ?? 0;
    const rev2 = r2.state.settings.sharedState?.revision ?? 0;
    expect(rev2).toBeGreaterThan(rev1);
  });

  it('USER_INPUT_REQUIRED sets awaiting_user', () => {
    const s = { ...baseState(), status: 'running' as const };
    const { state } = applyEvent(s, { type: 'USER_INPUT_REQUIRED', requestId: 'r1' });
    expect(state.status).toBe('awaiting_user');
  });

  it('CONVERSATION_COMPLETED sets idle', () => {
    const s = { ...baseState(), status: 'running' as const };
    const { state } = applyEvent(s, { type: 'CONVERSATION_COMPLETED' });
    expect(state.status).toBe('idle');
  });
});
