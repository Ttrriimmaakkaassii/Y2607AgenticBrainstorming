import { getModel, getProvider } from './llm-catalog';
import { Agent, Effort, LLMConnection, LLMProvider, Message, Mood, ReactionType, ResponseStyle } from './types';

const OPENAI_COMPATIBLE_PROVIDERS: LLMProvider[] = [
  'openai',
  'deepseek',
  'zhipu',
  'moonshot',
  'xai',
  'mistral',
];

const REACTION_INSTRUCTIONS: Record<ReactionType, string> = {
  elaborate: 'Elaborate on your previous message with more depth.',
  explainFurther: 'Explain your previous point further, in simpler terms if helpful.',
  why: 'Explain why you believe what you just said — justify your reasoning.',
  sources: 'List the sources, evidence, or reasoning basis behind your previous claim.',
  bullets: 'Restate your previous point as a concise bulleted list.',
  mindmap: 'Summarize your previous point as a short hierarchical outline suitable for a mind map.',
  suggest:
    'Suggest one logical follow-up question or response the user could give next. Reply with just that single sentence, no preamble.',
  youtube: '',
  tiktok: '',
};

function styleInstruction(style: ResponseStyle, maxSentences: number): string {
  if (style === 'bullets') return 'Reply as a concise bulleted list (3-6 bullet points), each starting with "- ".';
  if (style === 'detailed') return 'Reply with a thorough, detailed explanation (multiple paragraphs are fine).';
  if (style === 'mindmap') {
    return 'Reply as a short markdown outline suitable for a mind map: a single "# " title line, then 2-5 "- " bullet points, each optionally with one nested "  - " sub-point. No prose outside the outline.';
  }
  return `Reply in at most ${maxSentences} sentence${maxSentences === 1 ? '' : 's'}.`;
}

function buildSystemPrompt(
  agent: Agent,
  mood: Mood,
  style: ResponseStyle,
  maxSentences: number
): string {
  return `You are ${agent.name}, acting as a ${agent.role} in a multi-agent discussion. Instructions: ${agent.instructions} The discussion mood is "${mood}". ${styleInstruction(style, maxSentences)} Stay in character, without restating your name.`;
}

function buildUserPrompt(
  topic: string,
  history: Message[],
  agents: Agent[],
  extraInstruction?: string
): string {
  const transcript = history
    .slice(-8)
    .map((m) => {
      const author =
        m.agentId === 'user' ? 'User' : agents.find((a) => a.id === m.agentId)?.name ?? 'Agent';
      return `${author}: ${m.content}`;
    })
    .join('\n');

  const base = transcript
    ? `Topic: ${topic || '(unspecified)'}\n\nConversation so far:\n${transcript}`
    : `Start a discussion on: ${topic || 'a topic of your choosing'}`;

  return extraInstruction ? `${base}\n\nInstruction: ${extraInstruction}` : `${base}\n\nContinue the discussion with your next message.`;
}

function effortToBudgetTokens(effort: Effort): number {
  return effort === 'high' ? 16000 : effort === 'medium' ? 4096 : 1024;
}

/**
 * Shared caller for every provider whose chat API mirrors OpenAI's
 * /v1/chat/completions shape (OpenAI, DeepSeek, Z.ai, Moonshot, xAI, Mistral).
 */
async function callOpenAICompatibleDirect(
  connection: LLMConnection,
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  const provider = getProvider(connection.provider);
  if (!provider) return null;
  const modelInfo = getModel(connection.provider, connection.model);

  const body: Record<string, unknown> = {
    model: connection.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 500,
  };
  if (modelInfo?.supportsEffort) body.reasoning_effort = connection.effort;

  const res = await fetch(provider.endpoint, {
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
    max_tokens: 500,
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
    if (OPENAI_COMPATIBLE_PROVIDERS.includes(connection.provider)) {
      return await callOpenAICompatibleDirect(connection, systemPrompt, userPrompt);
    }
    switch (connection.provider) {
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

/**
 * Resolves a real LLM reply for an agent using its connected, user-supplied
 * LLM connection. Returns null if the agent has no connection or the call
 * fails — callers must treat null as "this agent cannot respond right now"
 * and must never substitute a simulated/mock message for it.
 */
export async function fetchAgentReply(
  agent: Agent,
  connections: LLMConnection[],
  mood: Mood,
  topic: string,
  history: Message[],
  agents: Agent[],
  responseStyle: ResponseStyle,
  maxSentences: number,
  extraInstruction?: string
): Promise<string | null> {
  const connection = agent.connectionId
    ? connections.find((c) => c.id === agent.connectionId)
    : undefined;
  if (!connection) return null;

  const systemPrompt = buildSystemPrompt(agent, mood, responseStyle, maxSentences);
  const userPrompt = buildUserPrompt(topic, history, agents, extraInstruction);
  return callDirect(connection, systemPrompt, userPrompt);
}

export function reactionInstruction(type: ReactionType): string {
  return REACTION_INSTRUCTIONS[type];
}
