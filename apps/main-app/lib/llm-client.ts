import { getModel } from './llm-catalog';
import { Agent, Effort, LLMConnection, Message, Mood } from './types';

interface ChatApiResponse {
  content?: string;
  error?: string;
}

function buildSystemPrompt(agent: Agent, mood: Mood, maxSentences: number): string {
  return `You are ${agent.name}, acting as a ${agent.role} in a multi-agent discussion. Instructions: ${agent.instructions} The discussion mood is "${mood}". Reply in at most ${maxSentences} sentences, in character, without restating your name.`;
}

function buildUserPrompt(topic: string, history: Message[], agents: Agent[]): string {
  const transcript = history
    .slice(-8)
    .map((m) => {
      const author =
        m.agentId === 'user' ? 'User' : agents.find((a) => a.id === m.agentId)?.name ?? 'Agent';
      return `${author}: ${m.content}`;
    })
    .join('\n');

  if (!transcript) {
    return `Start a discussion on: ${topic || 'a topic of your choosing'}`;
  }
  return `Topic: ${topic || '(unspecified)'}\n\nConversation so far:\n${transcript}\n\nContinue the discussion with your next message.`;
}

function effortToBudgetTokens(effort: Effort): number {
  return effort === 'high' ? 16000 : effort === 'medium' ? 4096 : 1024;
}

async function callOpenAIDirect(
  connection: LLMConnection,
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  const modelInfo = getModel('openai', connection.model);
  const body: Record<string, unknown> = {
    model: connection.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 300,
  };
  if (modelInfo?.supportsEffort) body.reasoning_effort = connection.effort;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${connection.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

async function callAnthropicDirect(
  connection: LLMConnection,
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  const modelInfo = getModel('anthropic', connection.model);
  const body: Record<string, unknown> = {
    model: connection.model,
    max_tokens: 300,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  };
  if (modelInfo?.supportsEffort) {
    body.thinking = { type: 'enabled', budget_tokens: effortToBudgetTokens(connection.effort) };
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': connection.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const textBlock = data.content?.find((block: any) => block.type === 'text');
  return textBlock?.text?.trim() || null;
}

async function callGoogleDirect(
  connection: LLMConnection,
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  const modelInfo = getModel('google', connection.model);
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
  };
  if (modelInfo?.supportsEffort) {
    body.generationConfig = {
      thinkingConfig: { thinkingBudget: effortToBudgetTokens(connection.effort) },
    };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${connection.model}:generateContent?key=${connection.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

async function callDirect(
  connection: LLMConnection,
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  try {
    switch (connection.provider) {
      case 'openai':
        return await callOpenAIDirect(connection, systemPrompt, userPrompt);
      case 'anthropic':
        return await callAnthropicDirect(connection, systemPrompt, userPrompt);
      case 'google':
        return await callGoogleDirect(connection, systemPrompt, userPrompt);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

async function callServerProxy(
  agent: Agent,
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: agent.llmProvider, systemPrompt, userPrompt }),
    });
    if (!res.ok) return null;
    const data: ChatApiResponse = await res.json();
    return data.content?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Resolves a real LLM reply for an agent: tries the agent's connected
 * user-supplied LLM connection (called directly from the browser) first,
 * then falls back to the server-side proxy (Cloudflare secrets), then
 * returns null so the caller can fall back to the simulated generator.
 */
export async function fetchAgentReply(
  agent: Agent,
  connections: LLMConnection[],
  mood: Mood,
  topic: string,
  history: Message[],
  agents: Agent[],
  maxSentences: number
): Promise<string | null> {
  const systemPrompt = buildSystemPrompt(agent, mood, maxSentences);
  const userPrompt = buildUserPrompt(topic, history, agents);

  const connection = agent.connectionId
    ? connections.find((c) => c.id === agent.connectionId)
    : undefined;

  if (connection) {
    const direct = await callDirect(connection, systemPrompt, userPrompt);
    if (direct) return direct;
  }

  return callServerProxy(agent, systemPrompt, userPrompt);
}
