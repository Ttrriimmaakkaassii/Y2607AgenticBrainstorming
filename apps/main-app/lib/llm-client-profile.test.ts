import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSystemPrompt, autoPopulateAll } from './llm-client';
import { Agent, LLMConnection } from './types';

const baseAgent: Agent = {
  id: 'a1',
  refNumber: 'Agt1',
  name: 'Maya',
  role: 'Strategist',
  instructions: 'Challenge assumptions with data.',
  identity: 'A skeptical strategist.',
  skills: 'market analysis, risk modeling',
  loopGuidance: 'Build on the last point; never restate.',
  description: 'A skeptical strategy advisor.',
  color: '#3b99fc',
  llmProvider: 'openai',
  connectionId: 'c1',
  active: true, participant: true,
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

describe('buildSystemPrompt ranked blocks', () => {
  it('renders the explicit resolution ladder', () => {
    const p = buildSystemPrompt(baseAgent, ['debate'], 'sentences', 3, 5, 'dialogue', [], []);
    expect(p).toMatch(/resolve them in this order/i);
    // Mood is ranked ABOVE instructions (the user wants mood to be able to win).
    expect(p).toMatch(/\(2\) the mood, \(3\) the general guidelines, \(4\) your instructions/i);
  });

  it('renders labeled Identity / Skills / Instructions / Loop blocks when filled', () => {
    const p = buildSystemPrompt(baseAgent, [], 'sentences', 3, 5, 'dialogue', [], []);
    expect(p).toContain('## Identity');
    expect(p).toContain('A skeptical strategist.');
    expect(p).toContain('## Skills');
    expect(p).toContain('market analysis, risk modeling');
    expect(p).toContain('## Instructions');
    expect(p).toContain('Challenge assumptions with data.');
    expect(p).toContain('## Loop participation');
  });

  it('OMITS empty headings (legacy agent with only instructions)', () => {
    const minimal: Agent = { ...baseAgent, identity: '', skills: '', loopGuidance: '' };
    const p = buildSystemPrompt(minimal, [], 'sentences', 3, 5, 'dialogue', [], []);
    expect(p).not.toContain('## Identity');
    expect(p).not.toContain('## Skills');
    // Loop guidance empty → falls back to the default anti-repeat nudge, so
    // the block is still present but carries the fallback text.
    expect(p).toContain('## Loop participation');
    expect(p).toContain('Challenge assumptions with data.');
  });

  it('uses forceful mood wording so mood can override instructions', () => {
    const p = buildSystemPrompt(baseAgent, ['debate'], 'sentences', 3, 5, 'dialogue', [], []);
    expect(p).toMatch(/must clearly reflect that mood throughout your reply/);
  });
});

describe('autoPopulateAll JSON parsing', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('parses a well-formed JSON profile from the model', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                '```json\n{"identity":"You are a careful analyst.","instructions":"Verify every claim.","skills":"research, verification","loopGuidance":"Ask one clarifying question before answering."}\n```',
            },
          },
        ],
      }),
    } as unknown as Response);
    const profile = await autoPopulateAll(baseAgent, connection);
    expect(profile).not.toBeNull();
    expect(profile!.identity).toBe('You are a careful analyst.');
    expect(profile!.skills).toBe('research, verification');
    expect(profile!.loopGuidance).toContain('clarifying question');
  });

  it('returns null (no blanking) on an unparseable reply', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Sorry, I cannot help with that.' } }] }),
    } as unknown as Response);
    const profile = await autoPopulateAll(baseAgent, connection);
    expect(profile).toBeNull();
  });

  it('returns null when no description is provided', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const profile = await autoPopulateAll({ ...baseAgent, description: '' }, connection);
    expect(profile).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
