import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Agent, LLMConnection } from './types';

vi.mock('./web-browse', () => ({
  callBrowseUrlTool: vi.fn(async (args: { url: string }) => ({
    ok: true,
    url: args.url,
    provider: 'cloudflare-browser-rendering' as const,
    browsedAt: new Date().toISOString(),
    content: '# Page content',
  })),
}));

const connection: LLMConnection = {
  id: 'conn-1',
  provider: 'openai',
  model: 'gpt-5.6-luna',
  effort: 'medium',
  apiKey: 'test-key',
  label: 'Test',
};

function baseAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    refNumber: 'Agt1',
    name: 'Researcher',
    role: 'Research Agent',
    instructions: 'Find things out.',
    identity: '',
    skills: '',
    loopGuidance: '',
    description: '',
    color: '#3b99fc',
    llmProvider: 'openai',
    connectionId: connection.id,
    active: true,
    pinnedToAllConversations: false,
    webSearchEnabled: true,
    voiceURI: null,
    googleVoiceName: null,
    traits: {},
    ...overrides,
  };
}

/** A tool_call-shaped OpenAI response — never final text, to exercise the loop's own ceiling instead of a real termination condition. */
function toolCallResponse() {
  return {
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'browse_url', arguments: '{"url":"https://example.com"}' } }],
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
  };
}

describe('tool-calling loop ceiling', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('stops after MAX_TOOL_CALLS_PER_AGENT_TURN rounds instead of looping forever when the model keeps requesting tool calls', async () => {
    const fetchMock = vi.fn(async () => toolCallResponse());
    vi.stubGlobal('fetch', fetchMock);

    const { fetchAgentReply } = await import('./llm-client');
    const agent = baseAgent();

    const result = await fetchAgentReply(
      agent,
      [connection],
      [],
      'Test topic',
      [],
      [agent],
      'sentences',
      3,
      5,
      'dialogue',
      [],
      [],
      undefined,
      undefined,
      'fake-access-token'
    );

    // Never received final text — every round was a tool call — so this
    // must return null (graceful failure) rather than hang or recurse
    // unboundedly. MAX_TOOL_CALLS_PER_AGENT_TURN=4 means at most 5 request
    // rounds (4 tool-call rounds + 1 final attempt).
    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('does not send a tools param at all for an agent without webSearchEnabled', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Final answer.' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { fetchAgentReply } = await import('./llm-client');
    const agent = baseAgent({ webSearchEnabled: false });

    const result = await fetchAgentReply(
      agent,
      [connection],
      [],
      'Test topic',
      [],
      [agent],
      'sentences',
      3,
      5,
      'dialogue',
      [],
      [],
      undefined,
      undefined,
      null
    );

    expect(result?.content).toBe('Final answer.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sentBody.tools).toBeUndefined();
  });
});
