import { getModel, getProvider } from './llm-catalog';
import {
  Agent,
  Effort,
  InteractionStyle,
  LLMConnection,
  LLMProvider,
  Message,
  Mood,
  ReactionType,
  ResponseStyle,
} from './types';

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

function interactionInstruction(style: InteractionStyle): string {
  if (style === 'monologue') {
    return 'Deliver your own standalone statement on the topic. Do not address other agents by name, ask them questions, or react to what they specifically said — treat this as an independent contribution, even though you may build on the general discussion so far.';
  }
  return "Actively engage with the other participants: address them by name where natural, ask them questions, and directly react to, challenge, or build on the specific points they made earlier in the conversation.";
}

function moodInstruction(moods: Mood[]): string {
  if (moods.length === 0) return '';
  if (moods.length === 1) {
    return ` The discussion mood is "${moods[0]}" — your tone, word choice, and energy must clearly reflect that mood throughout your reply.`;
  }
  return ` The discussion moods are ${moods.map((m) => `"${m}"`).join(' and ')} — blend all of them in tone throughout your reply.`;
}

function guidelinesInstruction(guidelines: string[]): string {
  if (guidelines.length === 0) return '';
  return ` Every participant in this discussion must follow these guidelines: ${guidelines.map((g) => `"${g}"`).join('; ')}.`;
}

function traitsInstruction(traits: { name: string; value: number }[]): string {
  if (traits.length === 0) return '';
  return ` Your character traits (0-100 scale, purely descriptive, no direction is inherently better) are: ${traits.map((t) => `${t.name} ${t.value}/100`).join(', ')} — let these visibly shape your personality and word choice.`;
}

function buildSystemPrompt(
  agent: Agent,
  moods: Mood[],
  style: ResponseStyle,
  maxSentences: number,
  interactionStyle: InteractionStyle,
  guidelines: string[],
  traits: { name: string; value: number }[]
): string {
  return `You are ${agent.name}, acting as a ${agent.role} in a multi-agent discussion. Instructions: ${agent.instructions}${guidelinesInstruction(guidelines)}${moodInstruction(moods)}${traitsInstruction(traits)} ${interactionInstruction(interactionStyle)} ${styleInstruction(style, maxSentences)} Stay in character, without restating your name.`;
}

function buildUserPrompt(
  topic: string,
  history: Message[],
  agents: Agent[],
  extraInstruction?: string,
  wikiDigest?: string
): string {
  const transcript = history
    // Full conversation context, bounded generously rather than unbounded —
    // truly unlimited history risks blowing past provider context windows
    // on very long conversations.
    .slice(-40)
    .map((m) => {
      const author =
        m.agentId === 'user' ? 'User' : agents.find((a) => a.id === m.agentId)?.name ?? 'Agent';
      return `${author}: ${m.content}`;
    })
    .join('\n');

  const wikiSection = wikiDigest
    ? `\n\nShared wiki (cross-thread knowledge established so far):\n${wikiDigest}`
    : '';

  const base = transcript
    ? `Topic: ${topic || '(unspecified)'}${wikiSection}\n\nConversation so far:\n${transcript}`
    : `Start a discussion on: ${topic || 'a topic of your choosing'}${wikiSection}`;

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
  moods: Mood[],
  topic: string,
  history: Message[],
  agents: Agent[],
  responseStyle: ResponseStyle,
  maxSentences: number,
  interactionStyle: InteractionStyle,
  guidelines: string[],
  traits: { name: string; value: number }[],
  extraInstruction?: string,
  wikiDigest?: string
): Promise<string | null> {
  const connection = agent.connectionId
    ? connections.find((c) => c.id === agent.connectionId)
    : undefined;
  if (!connection) return null;

  const systemPrompt = buildSystemPrompt(
    agent,
    moods,
    responseStyle,
    maxSentences,
    interactionStyle,
    guidelines,
    traits
  );
  const userPrompt = buildUserPrompt(topic, history, agents, extraInstruction, wikiDigest);
  return callDirect(connection, systemPrompt, userPrompt);
}

export function reactionInstruction(type: ReactionType): string {
  return REACTION_INSTRUCTIONS[type];
}

/**
 * Minimal connectivity check for a saved LLM connection — used by the
 * "Test" button next to each connection in Settings, not by the actual
 * discussion flow. Returns true only if the provider returned real content.
 */
export async function testConnection(connection: LLMConnection): Promise<boolean> {
  const reply = await callDirect(connection, 'You are a connectivity test. Reply with exactly: OK', 'Test');
  return reply !== null;
}

/**
 * Asks the given connection to extract a strict, skeptical breakdown of
 * every distinct subject discussed in `transcript` — used by the Analytics
 * "Subjects Discussed" checklist. Returns the raw model output (expected to
 * be a JSON array); callers must parse and validate it themselves, since a
 * model can still return malformed output despite instructions.
 */
export async function fetchSubjectAnalysis(
  connection: LLMConnection,
  transcript: string
): Promise<string | null> {
  const systemPrompt =
    'You are a strict, skeptical analyst reviewing a multi-agent discussion transcript. ' +
    'Extract every distinct subject/topic discussed. For each subject, output a short subject ' +
    'name (2-6 words, no details or explanation), a short category (one or two words), and a ' +
    'confidence score from 0 to 100 for how CONCLUSIVELY that subject was resolved or answered ' +
    '(0 = totally unresolved or left open, 100 = fully conclusive with a clear, well-supported ' +
    'answer or consensus). Be strict: do not award a high score unless the conversation clearly ' +
    'reached a firm, well-justified conclusion — disagreement, hedging, or an unanswered question ' +
    'should score low. Order the subjects from most recently discussed to earliest. Respond with ' +
    'ONLY a JSON array, no prose, no markdown code fences, in exactly this shape: ' +
    '[{"subject": "...", "category": "...", "confidence": 0}]';
  return callDirect(connection, systemPrompt, transcript || 'No conversation yet.');
}

/**
 * Asks the given connection to fold `newTranscript` into `previousDigest`,
 * producing an updated compact "wiki" — the only cross-thread memory every
 * agent gets injected into its prompt (see buildUserPrompt's `wikiDigest`
 * param). Returns the raw model output (plain text, meant to be stored
 * verbatim as the new digest) or null on failure; callers should keep the
 * previous digest rather than clobber it with null.
 */
export async function fetchWikiDigest(
  connection: LLMConnection,
  previousDigest: string,
  newTranscript: string
): Promise<string | null> {
  const systemPrompt =
    'You maintain a compact shared "wiki" for a multi-agent discussion made of several ' +
    'independent threads. The wiki is the ONLY cross-thread memory every agent gets — keep it ' +
    'dense and factual. Format it as real markdown: "##" section headings (e.g. "## Established ' +
    'facts", "## Decisions", "## Open questions", "## Per-thread notes") each followed by "-" ' +
    'bullet items — not prose paragraphs. This structure matters: the same text is later rendered ' +
    'both as plain bullets and as a mind map, so headings and bullets must be real markdown, not ' +
    'just implied by wording. Merge the new messages into the existing wiki: add new facts, update ' +
    'anything superseded, remove stale/resolved items, and preserve everything still relevant. Keep ' +
    'the WHOLE wiki under roughly 600 words — prioritize the most important and most recent material ' +
    'over exhaustive detail. Respond with ONLY the updated wiki markdown, no preamble, no code fences.';
  const userPrompt = previousDigest
    ? `Current wiki:\n${previousDigest}\n\nNew messages since last update:\n${newTranscript}`
    : `New messages:\n${newTranscript}\n\nWrite the initial wiki.`;
  return callDirect(connection, systemPrompt, userPrompt);
}
