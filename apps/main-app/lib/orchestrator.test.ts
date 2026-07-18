import { describe, it, expect, vi, beforeEach } from 'vitest';
import { localRepetitionScore, shouldEscalateToLLM, judgeRepetition } from './orchestrator';
import { Agent, LLMConnection, Message } from './types';

const baseAgent: Agent = {
  id: 'a1',
  refNumber: 'Agt1',
  name: 'Researcher',
  role: 'Researcher',
  instructions: '',
  identity: '',
  skills: '',
  loopGuidance: '',
  description: '',
  color: '#3b99fc',
  llmProvider: 'openai',
  connectionId: 'c1',
  active: true, participant: true, importance: null,
  pinnedToAllConversations: false,
  webSearchEnabled: false,
  voiceURI: null,
  googleVoiceName: null,
  traits: {},
};

const connection: LLMConnection = {
  id: 'c1',
  provider: 'openai',
  model: 'gpt-test',
  effort: 'medium',
  apiKey: 'k',
  label: 'Test',
};

function msg(content: string): Message {
  return {
    id: Math.random().toString(36),
    threadId: 't1',
    agentId: 'a1',
    content,
    timestamp: 0,
    feedback: null,
    replyToId: null,
    starred: false,
    category: null,
  };
}

describe('localRepetitionScore', () => {
  it('returns 0 for an empty draft or no history', () => {
    expect(localRepetitionScore('', [msg('anything')])).toBe(0);
    expect(localRepetitionScore('a novel point', [])).toBe(0);
  });

  it('scores low for a clearly novel reply', () => {
    const recent = [msg('Quantum entanglement links particles at a distance.')];
    const draft = 'The stock market closed higher on strong earnings reports today.';
    expect(localRepetitionScore(draft, recent)).toBeLessThan(0.2);
  });

  it('scores high for a near-duplicate', () => {
    const text = 'Renewable energy adoption is accelerating across the developing world.';
    expect(localRepetitionScore(text, [msg(text)])).toBeGreaterThan(0.8);
  });
});

describe('shouldEscalateToLLM', () => {
  it('does not escalate a novel reply', () => {
    expect(shouldEscalateToLLM(0.05)).toBe(false);
  });
  it('escalates a high-overlap draft', () => {
    expect(shouldEscalateToLLM(0.6)).toBe(true);
  });
});

describe('judgeRepetition', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does NOT call the LLM for a clearly novel draft (zero token cost)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const recent = [msg('Photosynthesis converts sunlight into chemical energy in plants.')];
    const draft = 'Monetary policy interest rates influence inflation expectations.';
    const verdict = await judgeRepetition(draft, recent, baseAgent, connection);
    expect(verdict.isRepetitive).toBe(false);
    expect(verdict.guidance).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('flags a near-duplicate when the judge LLM says repetitive', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"isRepetitive": true, "guidance": "Add a concrete cost example instead of restating."}',
            },
          },
        ],
      }),
    } as unknown as Response);
    const text = 'Renewable energy adoption is accelerating across the developing world.';
    const verdict = await judgeRepetition(text, [msg(text)], baseAgent, connection);
    expect(verdict.isRepetitive).toBe(true);
    expect(verdict.guidance).toContain('cost example');
  });

  it('survives a judge failure without throwing (keeps the draft)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const text = 'Renewable energy adoption is accelerating across the developing world.';
    const verdict = await judgeRepetition(text, [msg(text)], baseAgent, connection);
    expect(verdict.isRepetitive).toBe(false);
    expect(verdict.guidance).toBeNull();
  });
});
