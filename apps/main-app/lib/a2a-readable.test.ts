import { describe, it, expect } from 'vitest';
import { coerceA2AFromReply } from './a2a';
import { Agent, Message } from './types';

const agent: Agent = {
  id: 'a1', refNumber: 'Agt1', name: 'Maya', role: '', instructions: '', identity: '', skills: '',
  loopGuidance: '', description: '', color: '#000', llmProvider: 'openai', connectionId: 'c',
  active: true, participant: true, pinnedToAllConversations: false, webSearchEnabled: false,
  chartEnabled: false, voiceURI: null, googleVoiceName: null, traits: {},
};

function msg(content: string): Message {
  return {
    id: 'm1', threadId: 't1', agentId: 'a1', content, timestamp: Date.now(),
    feedback: null, replyToId: null, starred: false, category: null,
  };
}

const timing = {
  executionId: 'e1', startedAt: '2026-07-17T10:00:00.000Z', firstTokenAt: '2026-07-17T10:00:01.000Z',
  completedAt: '2026-07-17T10:00:02.000Z', timeToFirstTokenMs: 1000, generationDurationMs: 2000, totalDurationMs: 2000,
};

describe('coerceA2AFromReply (deterministic readable fields)', () => {
  it('uses the reply content as the natural-language summary', () => {
    const env = coerceA2AFromReply(agent, msg('Here are the numbers.'), 'c1', 'a2', 'execution', timing)!;
    expect(env.naturalLanguageSummary).toBe('Here are the numbers.');
    expect(env.fromAgent).toBe('a1');
    expect(env.toAgent).toBe('a2');
    expect(env.status).toBe('complete');
    expect(env.phase).toBe('execution');
    expect(env.durationMs).toBe(2000);
  });

  it('infers intent heuristically from the text', () => {
    const evidence = coerceA2AFromReply(agent, msg('The source confirms it.'), 'c1', 'a2', 'execution', timing)!;
    expect(evidence.intent).toBe('submit_evidence');
    const handoff = coerceA2AFromReply(agent, msg('I will hand off to you now.'), 'c1', 'a2', 'execution', timing)!;
    expect(handoff.intent).toBe('handoff');
  });

  it('parses a fenced JSON claims block when the agent emits one', () => {
    const content = `Conclusion.\n\`\`\`json\n{"claims":[{"claimId":"c1","text":"x=5","classification":"verified","evidenceRefs":["e1"],"allowedInFinalAnswer":true}]}\n\`\`\``;
    const env = coerceA2AFromReply(agent, msg(content), 'c1', 'a2', 'execution', timing)!;
    expect(env.claims).toHaveLength(1);
    expect(env.claims![0].classification).toBe('verified');
  });

  it('marks the envelope failed when timing has a failedAt', () => {
    const env = coerceA2AFromReply(agent, msg('partial'), 'c1', 'a2', 'execution', { ...timing, completedAt: undefined, failedAt: '2026-07-17T10:00:02.000Z' })!;
    expect(env.status).toBe('failed');
  });
});
