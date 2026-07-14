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
import { callBrowseUrlTool } from './web-browse';

/** One successful browse_url call's worth of evidence — mirrors `Message.webBrowses` (see lib/types.ts), attached to whichever agent reply triggered it. */
export interface BrowseEvidence {
  url: string;
  contentLength: number;
  browsedAt: string;
}

const MAX_TOOL_CALLS_PER_AGENT_TURN = 4;

// Cloudflare Browser Rendering (the backend behind this tool — see
// functions/api/research/browse.ts) has no search-by-query endpoint, only
// fetch/render a URL you already have. So this is "open this specific
// page", not "search the web for X" — the model has to know or guess the
// right URL itself.
const BROWSE_URL_DESCRIPTION =
  "Open a specific web page and return its readable content (rendered by a real headless browser, so it works on JS-heavy sites too). This is NOT a search engine — you must supply an exact URL you already believe is correct (e.g. a company's official domain, a GitHub repo URL). Use this before making claims about a specific external site's current content, and cite the URL you actually browsed.";

const OPENAI_BROWSE_URL_TOOL = {
  type: 'function',
  function: {
    name: 'browse_url',
    description: BROWSE_URL_DESCRIPTION,
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The exact, fully-formed URL to open (including https://).' },
      },
      required: ['url'],
    },
  },
};

const ANTHROPIC_BROWSE_URL_TOOL = {
  name: 'browse_url',
  description: BROWSE_URL_DESCRIPTION,
  input_schema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The exact, fully-formed URL to open (including https://).' },
    },
    required: ['url'],
  },
};

const GOOGLE_BROWSE_URL_TOOL = {
  name: 'browse_url',
  description: BROWSE_URL_DESCRIPTION,
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The exact, fully-formed URL to open (including https://).' },
    },
    required: ['url'],
  },
};

/** Executes one model-requested browse_url call and records its evidence — shared by all three providers, each of which hands over the tool call's arguments already parsed into a plain object (OpenAI's are a JSON string and get parsed by the caller first). */
async function executeBrowseUrlToolCall(
  args: { url?: string } | undefined,
  accessToken: string | null,
  evidence: BrowseEvidence[]
): Promise<string> {
  const url = typeof args?.url === 'string' ? args.url : '';
  const result = await callBrowseUrlTool({ url }, accessToken);
  if (result.ok) {
    evidence.push({
      url: result.url,
      contentLength: result.content.length,
      browsedAt: result.browsedAt,
    });
  }
  return JSON.stringify(result);
}

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

function styleInstruction(style: ResponseStyle, maxSentences: number, bulletCount: number): string {
  if (style === 'bullets') return `Reply as a concise bulleted list of exactly ${bulletCount} bullet point${bulletCount === 1 ? '' : 's'}, each starting with "- ".`;
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
  // A numbered block, read BEFORE anything else in the prompt (not just
  // another clause folded into a run-on paragraph with mood/traits/style),
  // so it's the first thing the model sees and reads as your actual rules
  // rather than one more sentence to skim past.
  const numbered = guidelines.map((g, i) => `${i + 1}. ${g}`).join('\n');
  return `\n\nBefore anything else, read and follow these guidelines — every participant in this discussion must obey all of them:\n${numbered}\n`;
}

function traitsInstruction(traits: { name: string; value: number }[]): string {
  if (traits.length === 0) return '';
  return ` Your character traits (0-100 scale, purely descriptive, no direction is inherently better) are: ${traits.map((t) => `${t.name} ${t.value}/100`).join(', ')} — let these visibly shape your personality and word choice.`;
}

const USER_PRIORITY_INSTRUCTION =
  " If the user (not another agent) has posted a message — including a direction change, a correction, or a request to move to a new subject — treat it as the top priority: address it directly and steer your reply accordingly, even if it interrupts or redirects the discussion agents were just having.";

// Agents here have no tools: no web fetch, no code execution, no file
// access — only their training knowledge and this conversation's
// transcript. Without an explicit rule against it, a model asked to
// "check the website" or "read the repo" will readily hallucinate having
// done so (fabricated HTML, fake fetch logs, invented feature lists)
// instead of admitting it can't. This is the single biggest failure mode
// reported from real usage — an agent claimed to have fetched an external
// site, produced fabricated details from it, and another agent had to
// call it out as unverified several turns later instead of it never
// happening at all.
const NO_FABRICATION_INSTRUCTION =
  ' You have no ability to browse the web, fetch URLs, run code, or call any external tool — you only have your own training knowledge and this conversation\'s transcript. Never claim or imply you performed an action you cannot actually do (e.g. "fetching the site now", "here is the raw HTML I retrieved", "I checked the repo"). If a task genuinely requires live or external information you don\'t have, say so plainly in your reply and answer only from general training knowledge, explicitly labeled as unverified/approximate — never presented as a retrieved fact.';

// For agents with webSearchEnabled, the above is no longer true — they DO
// have a real tool now (see the tool-calling loop spread across the three
// callXDirect functions) — so they get this instead. Note this is a
// browse_url tool (open one specific page), not a search engine — there's
// no way to discover a URL from a text query, only fetch one already known.
const BROWSE_CAPABILITY_INSTRUCTION =
  " You have access to a real browse_url tool that opens a specific web page and returns its content — it is NOT a search engine, so you must supply an exact URL you believe is correct (e.g. a company's own domain, a GitHub repo URL) rather than a search query. Call it immediately when the assignment needs external or current information from a known site — do not announce that you're about to browse, do not ask another agent to do it, do not simulate results. Cite the exact URL you actually opened for every material claim. If the browse fails or is unavailable, say so exactly rather than guessing.";

function capabilityInstruction(webSearchEnabled: boolean): string {
  return webSearchEnabled ? BROWSE_CAPABILITY_INSTRUCTION : NO_FABRICATION_INSTRUCTION;
}

// The second-biggest reported failure mode: multiple agents spending many
// turns debating process/methodology (should we fetch first or classify
// first? who should do what?) instead of producing any substantive
// answer — a discussion that visibly went in circles for a dozen-plus
// messages without new information. This directly tells every agent to
// stop doing that.
const STAY_ON_TASK_INSTRUCTION =
  " Do not spend your reply debating process, methodology, or who should do what — decide your own approach silently and use this reply to make actual progress on the user's question (real content, findings, or a direct answer), not meta-commentary about how the discussion should be run. If a previous agent's reply was itself just process debate with no new substance, break the loop by answering directly instead of continuing the debate.";

function buildSystemPrompt(
  agent: Agent,
  moods: Mood[],
  style: ResponseStyle,
  maxSentences: number,
  bulletCount: number,
  interactionStyle: InteractionStyle,
  guidelines: string[],
  traits: { name: string; value: number }[]
): string {
  return `You are ${agent.name}, acting as a ${agent.role} in a multi-agent discussion.${guidelinesInstruction(guidelines)}\nInstructions: ${agent.instructions}${moodInstruction(moods)}${traitsInstruction(traits)} ${interactionInstruction(interactionStyle)}${USER_PRIORITY_INSTRUCTION}${capabilityInstruction(agent.webSearchEnabled)}${STAY_ON_TASK_INSTRUCTION} ${styleInstruction(style, maxSentences, bulletCount)} Stay in character, without restating your name.`;
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

/** Normalized token usage, read from whichever `usage`/`usageMetadata` shape the provider's response actually returns. */
export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
}

interface DirectCallResult {
  content: string;
  usage: UsageInfo;
  webBrowses: BrowseEvidence[];
}

/**
 * Shared caller for every provider whose chat API mirrors OpenAI's
 * /v1/chat/completions shape (OpenAI, DeepSeek, Z.ai, Moonshot, xAI, Mistral).
 * When `toolsEnabled`, loops on tool_calls (up to
 * MAX_TOOL_CALLS_PER_AGENT_TURN) instead of treating a tool-call response as
 * the final answer.
 */
async function callOpenAICompatibleDirect(
  connection: LLMConnection,
  systemPrompt: string,
  userPrompt: string,
  toolsEnabled: boolean,
  accessToken: string | null
): Promise<DirectCallResult | null> {
  const provider = getProvider(connection.provider);
  if (!provider) return null;
  const modelInfo = getModel(connection.provider, connection.model);

  const messages: Record<string, unknown>[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
  const webBrowses: BrowseEvidence[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (let round = 0; round <= MAX_TOOL_CALLS_PER_AGENT_TURN; round++) {
    const body: Record<string, unknown> = {
      model: connection.model,
      messages,
      max_tokens: 500,
    };
    if (modelInfo?.supportsEffort) body.reasoning_effort = connection.effort;
    if (toolsEnabled) {
      body.tools = [OPENAI_BROWSE_URL_TOOL];
      body.tool_choice = 'auto';
    }

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
    inputTokens += data.usage?.prompt_tokens ?? 0;
    outputTokens += data.usage?.completion_tokens ?? 0;

    const message = data.choices?.[0]?.message;
    const toolCalls = message?.tool_calls;
    if (toolsEnabled && Array.isArray(toolCalls) && toolCalls.length > 0 && round < MAX_TOOL_CALLS_PER_AGENT_TURN) {
      messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: toolCalls });
      for (const toolCall of toolCalls) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = toolCall.function?.arguments ? JSON.parse(toolCall.function.arguments) : {};
        } catch {
          // Malformed arguments — executeBrowseUrlToolCall below just gets an
          // empty query, which the search endpoint rejects with a structured
          // INVALID_REQUEST the model can see and react to.
        }
        const evidenceJson = await executeBrowseUrlToolCall(parsedArgs, accessToken, webBrowses);
        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: evidenceJson });
      }
      continue;
    }

    const content = message?.content?.trim();
    if (!content) return null;
    return { content, usage: { inputTokens, outputTokens }, webBrowses };
  }
  return null;
}

async function callAnthropicDirect(
  connection: LLMConnection,
  systemPrompt: string,
  userPrompt: string,
  toolsEnabled: boolean,
  accessToken: string | null
): Promise<DirectCallResult | null> {
  const modelInfo = getModel('anthropic', connection.model);
  const messages: Record<string, unknown>[] = [{ role: 'user', content: userPrompt }];
  const webBrowses: BrowseEvidence[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (let round = 0; round <= MAX_TOOL_CALLS_PER_AGENT_TURN; round++) {
    const body: Record<string, unknown> = {
      model: connection.model,
      max_tokens: 500,
      system: systemPrompt,
      messages,
    };
    if (modelInfo?.supportsEffort) {
      body.thinking = { type: 'enabled', budget_tokens: effortToBudgetTokens(connection.effort) };
    }
    if (toolsEnabled) body.tools = [ANTHROPIC_BROWSE_URL_TOOL];

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
    inputTokens += data.usage?.input_tokens ?? 0;
    outputTokens += data.usage?.output_tokens ?? 0;

    const toolUseBlocks = (data.content ?? []).filter((b: any) => b.type === 'tool_use');
    if (toolsEnabled && toolUseBlocks.length > 0 && round < MAX_TOOL_CALLS_PER_AGENT_TURN) {
      messages.push({ role: 'assistant', content: data.content });
      const resultBlocks: Record<string, unknown>[] = [];
      for (const block of toolUseBlocks) {
        const evidenceJson = await executeBrowseUrlToolCall(block.input, accessToken, webBrowses);
        resultBlocks.push({ type: 'tool_result', tool_use_id: block.id, content: evidenceJson });
      }
      messages.push({ role: 'user', content: resultBlocks });
      continue;
    }

    const textBlock = (data.content ?? []).find((block: any) => block.type === 'text');
    const content = textBlock?.text?.trim();
    if (!content) return null;
    return { content, usage: { inputTokens, outputTokens }, webBrowses };
  }
  return null;
}

async function callGoogleDirect(
  connection: LLMConnection,
  systemPrompt: string,
  userPrompt: string,
  toolsEnabled: boolean,
  accessToken: string | null
): Promise<DirectCallResult | null> {
  const modelInfo = getModel('google', connection.model);
  const contents: Record<string, unknown>[] = [
    { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
  ];
  const webBrowses: BrowseEvidence[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (let round = 0; round <= MAX_TOOL_CALLS_PER_AGENT_TURN; round++) {
    const body: Record<string, unknown> = { contents };
    if (modelInfo?.supportsEffort) {
      body.generationConfig = {
        thinkingConfig: { thinkingBudget: effortToBudgetTokens(connection.effort) },
      };
    }
    if (toolsEnabled) body.tools = [{ functionDeclarations: [GOOGLE_BROWSE_URL_TOOL] }];

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
    inputTokens += data.usageMetadata?.promptTokenCount ?? 0;
    outputTokens += data.usageMetadata?.candidatesTokenCount ?? 0;

    const candidateParts: any[] = data.candidates?.[0]?.content?.parts ?? [];
    const functionCallPart = candidateParts.find((p) => p.functionCall);
    if (toolsEnabled && functionCallPart && round < MAX_TOOL_CALLS_PER_AGENT_TURN) {
      contents.push({ role: 'model', parts: candidateParts });
      const evidenceJson = await executeBrowseUrlToolCall(functionCallPart.functionCall.args, accessToken, webBrowses);
      contents.push({
        role: 'function',
        parts: [{ functionResponse: { name: 'web_search', response: JSON.parse(evidenceJson) } }],
      });
      continue;
    }

    const content = candidateParts.find((p) => p.text)?.text?.trim();
    if (!content) return null;
    return { content, usage: { inputTokens, outputTokens }, webBrowses };
  }
  return null;
}

async function callDirect(
  connection: LLMConnection,
  systemPrompt: string,
  userPrompt: string,
  toolsEnabled = false,
  accessToken: string | null = null
): Promise<DirectCallResult | null> {
  try {
    if (OPENAI_COMPATIBLE_PROVIDERS.includes(connection.provider)) {
      return await callOpenAICompatibleDirect(connection, systemPrompt, userPrompt, toolsEnabled, accessToken);
    }
    switch (connection.provider) {
      case 'anthropic':
        return await callAnthropicDirect(connection, systemPrompt, userPrompt, toolsEnabled, accessToken);
      case 'google':
        return await callGoogleDirect(connection, systemPrompt, userPrompt, toolsEnabled, accessToken);
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
export interface AgentReplyResult {
  content: string;
  usage: UsageInfo;
  provider: LLMProvider;
  model: string;
  webBrowses?: BrowseEvidence[];
}

export async function fetchAgentReply(
  agent: Agent,
  connections: LLMConnection[],
  moods: Mood[],
  topic: string,
  history: Message[],
  agents: Agent[],
  responseStyle: ResponseStyle,
  maxSentences: number,
  bulletCount: number,
  interactionStyle: InteractionStyle,
  guidelines: string[],
  traits: { name: string; value: number }[],
  extraInstruction?: string,
  wikiDigest?: string,
  /** Current Supabase session access token, or null if not signed in — required for agent.webSearchEnabled to actually work (see functions/api/research/browse.ts's auth check); a signed-out session just gets TOOL_UNAVAILABLE from the browse call instead of erroring. */
  accessToken?: string | null
): Promise<AgentReplyResult | null> {
  const connection = agent.connectionId
    ? connections.find((c) => c.id === agent.connectionId)
    : undefined;
  if (!connection) return null;

  const systemPrompt = buildSystemPrompt(
    agent,
    moods,
    responseStyle,
    maxSentences,
    bulletCount,
    interactionStyle,
    guidelines,
    traits
  );
  const userPrompt = buildUserPrompt(topic, history, agents, extraInstruction, wikiDigest);
  const result = await callDirect(connection, systemPrompt, userPrompt, agent.webSearchEnabled, accessToken ?? null);
  if (!result) return null;
  // Snapshot provider/model at send time — connections are user-editable/
  // deletable independently of message history, so resolving them later
  // from agent.connectionId would let an edit or deletion silently corrupt
  // historical token-usage breakdowns.
  return {
    content: result.content,
    usage: result.usage,
    provider: connection.provider,
    model: connection.model,
    webBrowses: result.webBrowses.length > 0 ? result.webBrowses : undefined,
  };
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

/** Extension of `callDirect` for callers that only need the text — see `fetchAgentReply` for the one path that also needs `usage`. */
async function callDirectText(
  connection: LLMConnection,
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  const result = await callDirect(connection, systemPrompt, userPrompt);
  return result?.content ?? null;
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
  return callDirectText(connection, systemPrompt, transcript || 'No conversation yet.');
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
  return callDirectText(connection, systemPrompt, userPrompt);
}
