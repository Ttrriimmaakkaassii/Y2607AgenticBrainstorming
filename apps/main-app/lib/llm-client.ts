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
import { callWebSearchTool } from './web-search';

/** One successful browse_url call's worth of evidence — mirrors `Message.webBrowses` (see lib/types.ts), attached to whichever agent reply triggered it. */
export interface BrowseEvidence {
  url: string;
  contentLength: number;
  browsedAt: string;
}

/** One successful web_search call's worth of evidence — mirrors `Message.webSearches` (see lib/types.ts). */
export interface WebSearchEvidence {
  query: string;
  resultCount: number;
  sources: { title: string; url: string }[];
  searchedAt: string;
}

const MAX_TOOL_CALLS_PER_AGENT_TURN = 4;

// Two complementary tools, matching how real research actually works:
// search discovers candidate URLs from a query (Tavily — cheap, fast,
// ranked snippets), browse then reads one of those URLs in full (Cloudflare
// Browser Rendering — a real headless browser, slower, complete content).
// Neither one substitutes for the other: search alone gives only snippets,
// and browse alone requires already knowing the right URL.
const WEB_SEARCH_DESCRIPTION =
  'Search the public internet for current or externally verifiable information. Returns titles, URLs, snippets, and relevance scores for CANDIDATE pages — it does not give you the full page content. Use this first to find the right URL(s), then use browse_url on the most relevant result(s) to read the actual content before making claims.';

const BROWSE_URL_DESCRIPTION =
  "Open ONE specific web page and return its full readable content (rendered by a real headless browser, so it works on JS-heavy sites too). This is NOT a search engine — pass an exact URL, either one you already know (e.g. a company's official domain) or one returned by a prior web_search call. Use this before making claims about a specific external page's actual content, and cite the URL you actually browsed.";

const OPENAI_WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description: WEB_SEARCH_DESCRIPTION,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'A precise, self-contained internet search query.' },
        maxResults: { type: 'integer', minimum: 1, maximum: 10 },
      },
      required: ['query'],
    },
  },
};

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

const ANTHROPIC_WEB_SEARCH_TOOL = {
  name: 'web_search',
  description: WEB_SEARCH_DESCRIPTION,
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'A precise, self-contained internet search query.' },
      maxResults: { type: 'integer', minimum: 1, maximum: 10 },
    },
    required: ['query'],
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

const GOOGLE_WEB_SEARCH_TOOL = {
  name: 'web_search',
  description: WEB_SEARCH_DESCRIPTION,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'A precise, self-contained internet search query.' },
      maxResults: { type: 'integer' },
    },
    required: ['query'],
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

interface ToolEvidence {
  webSearches: WebSearchEvidence[];
  webBrowses: BrowseEvidence[];
  /** True if ANY tool call was attempted this turn but failed — drives the 🌐❌ "tried but fell back to memory" indicator distinct from 🌐 "actually used the web". */
  webAccessFailed: boolean;
}

// Gentle client-side throttle so multiple web-enabled agents firing in the
// same round don't burst-call one backend and trip its rate limit (the
// 429s seen earlier). Enforces a minimum gap between consecutive calls to
// the SAME backend; calls to different backends (search vs browse) are
// independent. Calls are already sequential within a turn (each is awaited),
// so this mainly paces the cross-agent/cross-turn bursts.
const THROTTLE_GAP_MS = 300;
const lastBackendCallAt: Record<string, number> = {};
async function throttleBackend(key: string): Promise<void> {
  const now = Date.now();
  const wait = THROTTLE_GAP_MS - (now - (lastBackendCallAt[key] ?? 0));
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastBackendCallAt[key] = Date.now();
}

/** Dispatches one model-requested tool call (by name) to the right backend and records its evidence — shared by all three providers, each of which hands over the tool call's name + arguments already parsed into a plain object (OpenAI's arguments are a JSON string and get parsed by the caller first). */
async function executeToolCall(
  name: string,
  args: Record<string, unknown> | undefined,
  accessToken: string | null,
  evidence: ToolEvidence
): Promise<string> {
  if (name === 'browse_url') {
    await throttleBackend('browse');
    const url = typeof args?.url === 'string' ? args.url : '';
    const result = await callBrowseUrlTool({ url }, accessToken);
    if (result.ok) {
      evidence.webBrowses.push({ url: result.url, contentLength: result.content.length, browsedAt: result.browsedAt });
    } else {
      evidence.webAccessFailed = true;
    }
    return JSON.stringify(result);
  }
  // Default to web_search for any other/unrecognized name rather than
  // silently no-op'ing — a model that gets the tool name slightly wrong
  // should still get a real (if possibly empty) result to react to.
  await throttleBackend('search');
  const query = typeof args?.query === 'string' ? args.query : '';
  const result = await callWebSearchTool(
    { query, maxResults: typeof args?.maxResults === 'number' ? args.maxResults : undefined },
    accessToken
  );
  if (result.ok) {
    evidence.webSearches.push({
      query: result.query,
      resultCount: result.results.length,
      sources: result.results.map((r) => ({ title: r.title, url: r.url })),
      searchedAt: result.searchedAt,
    });
  } else {
    evidence.webAccessFailed = true;
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
  // DELIBERATELY DEMOTED to "tone only". Previously this clause sat glued onto
  // the personal Instructions with "must clearly reflect that mood throughout
  // your reply" wording, which let the per-conversation mood silently override
  // an agent's personal instructions (the reported #1 priority problem). Mood
  // now colours delivery (energy, word choice) but must never change WHAT the
  // agent argues or override its instructions — and the ranked ladder at the
  // top of the system prompt states this explicitly.
  if (moods.length === 1) {
    return ` The discussion mood is "${moods[0]}" — let it colour your tone only (energy, word choice). It must not change what you actually argue, and it must never override your instructions.`;
  }
  return ` The discussion moods are ${moods.map((m) => `"${m}"`).join(' and ')} — blend them into your tone only (energy, word choice). They must not change what you actually argue, and must never override your instructions.`;
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
// have two real, complementary tools now (see the tool-calling loop spread
// across the three callXDirect functions): web_search finds candidate
// pages from a query, browse_url reads one specific page in full. Neither
// substitutes for the other.
const WEB_ACCESS_CAPABILITY_INSTRUCTION =
  " You have access to two real tools: web_search (find candidate pages from a query — titles/URLs/snippets only, not full content) and browse_url (open one specific page and read its full content). Call web_search immediately when the assignment needs external or current information and you don't already know the right URL; then call browse_url on the most relevant result(s) before making claims about their actual content. If you already know the right URL, you can call browse_url directly without searching first. Do not announce that you're about to search/browse, do not ask another agent to do it, do not simulate results. Cite the exact URL for every material claim. If a tool call fails or is unavailable, say so exactly rather than guessing.";

function capabilityInstruction(webSearchEnabled: boolean): string {
  return webSearchEnabled ? WEB_ACCESS_CAPABILITY_INSTRUCTION : NO_FABRICATION_INSTRUCTION;
}

// The second-biggest reported failure mode: multiple agents spending many
// turns debating process/methodology (should we fetch first or classify
// first? who should do what?) instead of producing any substantive
// answer — a discussion that visibly went in circles for a dozen-plus
// messages without new information. This directly tells every agent to
// stop doing that.
const STAY_ON_TASK_INSTRUCTION =
  " Do not spend your reply debating process, methodology, or who should do what — decide your own approach silently and use this reply to make actual progress on the user's question (real content, findings, or a direct answer), not meta-commentary about how the discussion should be run. If a previous agent's reply was itself just process debate with no new substance, break the loop by answering directly instead of continuing the debate.";

// The prompt-level half of the anti-repeat fix (#4). When an agent hasn't
// been given explicit loop-participation guidance, this default still nudges
// it away from restating earlier points — complemented at runtime by the
// orchestrator repetition judge in lib/orchestrator.ts.
const LOOP_GUIDANCE_FALLBACK =
  'Do not repeat points already made in this discussion by you or others. If your next thought would restate something already covered, elaborate on that same subject from a new angle, depth, or concrete example instead of repeating it.';

// Render only non-empty labeled blocks so an agent with just `instructions`
// (the legacy shape) renders almost identically to before — no ghost headings
// for fields the user left blank.
function optionalBlock(heading: string, body: string): string {
  const trimmed = body.trim();
  return trimmed ? `\n\n## ${heading}\n${trimmed}` : '';
}

export function buildSystemPrompt(
  agent: Agent,
  moods: Mood[],
  style: ResponseStyle,
  maxSentences: number,
  bulletCount: number,
  interactionStyle: InteractionStyle,
  guidelines: string[],
  traits: { name: string; value: number }[]
): string {
  // Explicit resolution ladder — the fix for the reported "mood overrides
  // instructions" problem. Previously the system prompt was a run-on
  // paragraph with guidelines, personal instructions, and mood all sitting
  // side by side and no stated ranking, so the per-conversation mood (with
  // "must ... throughout your reply" wording) could silently win. Now the
  // model is told up front how to resolve conflicts.
  const ladder =
    ' If any of the following ever conflict, resolve them in this order: (1) a direct message from the user, (2) the general guidelines, (3) your instructions, (4) your identity & skills, (5) the mood — the mood only colours your tone and must never override substance or instructions.';

  const identity = `You are ${agent.name}, acting as a ${agent.role} in a multi-agent discussion.`;

  return (
    identity +
    ladder +
    guidelinesInstruction(guidelines) +
    optionalBlock('Identity', agent.identity) +
    optionalBlock('Skills', agent.skills) +
    optionalBlock('Instructions', agent.instructions) +
    optionalBlock('Loop participation', agent.loopGuidance || LOOP_GUIDANCE_FALLBACK) +
    moodInstruction(moods) +
    traitsInstruction(traits) +
    ' ' +
    interactionInstruction(interactionStyle) +
    USER_PRIORITY_INSTRUCTION +
    capabilityInstruction(agent.webSearchEnabled) +
    STAY_ON_TASK_INSTRUCTION +
    ' ' +
    styleInstruction(style, maxSentences, bulletCount) +
    ' Stay in character, without restating your name.'
  );
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
  webSearches: WebSearchEvidence[];
  webBrowses: BrowseEvidence[];
  webAccessFailed: boolean;
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
  // Captured into a local so the `request` closure below can use it — TS
  // doesn't carry the !provider narrowing into nested function bodies, so
  // `provider.endpoint` inside the closure would read as possibly-undefined.
  const endpoint = provider.endpoint;
  const modelInfo = getModel(connection.provider, connection.model);

  const messages: Record<string, unknown>[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
  const evidence: ToolEvidence = { webSearches: [], webBrowses: [], webAccessFailed: false };
  let inputTokens = 0;
  let outputTokens = 0;

  // Builds + sends one request, with or without tools. Returns the parsed
  // body, or null if the provider rejected the call (non-2xx / network).
  async function request(withTools: boolean): Promise<any | null> {
    const body: Record<string, unknown> = {
      model: connection.model,
      messages,
      max_tokens: 500,
    };
    if (modelInfo?.supportsEffort) body.reasoning_effort = connection.effort;
    if (withTools) {
      body.tools = [OPENAI_WEB_SEARCH_TOOL, OPENAI_BROWSE_URL_TOOL];
      body.tool_choice = 'auto';
    }
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${connection.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  for (let round = 0; round <= MAX_TOOL_CALLS_PER_AGENT_TURN; round++) {
    // On the final allowed round, drop tools entirely so the model is forced
    // to produce a text answer — this is what keeps a 🌐 agent from dying as
    // "failed to respond" when its web backend is rejecting every call
    // (e.g. a bad Tavily key returning 403): the model would otherwise keep
    // retrying the tool until the loop exhausts, then return nothing.
    const finalRound = round === MAX_TOOL_CALLS_PER_AGENT_TURN;
    const withTools = toolsEnabled && !finalRound;

    let data = await request(withTools);
    // Some models/providers reject the tools payload outright (400). Fall
    // back to a plain no-tools request so the agent still answers.
    if (data === null && withTools) data = await request(false);
    if (data === null) return null;
    inputTokens += data.usage?.prompt_tokens ?? 0;
    outputTokens += data.usage?.completion_tokens ?? 0;

    const message = data.choices?.[0]?.message;
    const toolCalls = message?.tool_calls;
    if (withTools && Array.isArray(toolCalls) && toolCalls.length > 0) {
      messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: toolCalls });
      for (const toolCall of toolCalls) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = toolCall.function?.arguments ? JSON.parse(toolCall.function.arguments) : {};
        } catch {
          // Malformed arguments — executeToolCall below just gets an empty
          // query/url, which the backend rejects with a structured
          // INVALID_REQUEST the model can see and react to.
        }
        const evidenceJson = await executeToolCall(toolCall.function?.name, parsedArgs, accessToken, evidence);
        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: evidenceJson });
      }
      continue;
    }

    const content = message?.content?.trim();
    if (!content) {
      // No text and no tool call this round — if rounds remain, try again
      // rather than giving up; on the final round this genuinely means the
      // model returned nothing.
      if (!finalRound) continue;
      return null;
    }
    return { content, usage: { inputTokens, outputTokens }, ...evidence };
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
  const evidence: ToolEvidence = { webSearches: [], webBrowses: [], webAccessFailed: false };
  let inputTokens = 0;
  let outputTokens = 0;

  async function request(withTools: boolean): Promise<any | null> {
    const body: Record<string, unknown> = {
      model: connection.model,
      max_tokens: 500,
      system: systemPrompt,
      messages,
    };
    if (modelInfo?.supportsEffort) {
      body.thinking = { type: 'enabled', budget_tokens: effortToBudgetTokens(connection.effort) };
    }
    if (withTools) body.tools = [ANTHROPIC_WEB_SEARCH_TOOL, ANTHROPIC_BROWSE_URL_TOOL];
    try {
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
      return await res.json();
    } catch {
      return null;
    }
  }

  for (let round = 0; round <= MAX_TOOL_CALLS_PER_AGENT_TURN; round++) {
    // Final round forces no-tools so the model must produce a text answer
    // (see callOpenAICompatibleDirect for why this matters when a web
    // backend is rejecting calls).
    const finalRound = round === MAX_TOOL_CALLS_PER_AGENT_TURN;
    const withTools = toolsEnabled && !finalRound;

    let data = await request(withTools);
    if (data === null && withTools) data = await request(false);
    if (data === null) return null;
    inputTokens += data.usage?.input_tokens ?? 0;
    outputTokens += data.usage?.output_tokens ?? 0;

    const toolUseBlocks = (data.content ?? []).filter((b: any) => b.type === 'tool_use');
    if (withTools && toolUseBlocks.length > 0) {
      messages.push({ role: 'assistant', content: data.content });
      const resultBlocks: Record<string, unknown>[] = [];
      for (const block of toolUseBlocks) {
        const evidenceJson = await executeToolCall(block.name, block.input, accessToken, evidence);
        resultBlocks.push({ type: 'tool_result', tool_use_id: block.id, content: evidenceJson });
      }
      messages.push({ role: 'user', content: resultBlocks });
      continue;
    }

    const textBlock = (data.content ?? []).find((block: any) => block.type === 'text');
    const content = textBlock?.text?.trim();
    if (!content) {
      if (!finalRound) continue;
      return null;
    }
    return { content, usage: { inputTokens, outputTokens }, ...evidence };
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
  const evidence: ToolEvidence = { webSearches: [], webBrowses: [], webAccessFailed: false };
  let inputTokens = 0;
  let outputTokens = 0;

  async function request(withTools: boolean): Promise<any | null> {
    const body: Record<string, unknown> = { contents };
    if (modelInfo?.supportsEffort) {
      body.generationConfig = {
        thinkingConfig: { thinkingBudget: effortToBudgetTokens(connection.effort) },
      };
    }
    if (withTools) body.tools = [{ functionDeclarations: [GOOGLE_WEB_SEARCH_TOOL, GOOGLE_BROWSE_URL_TOOL] }];
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${connection.model}:generateContent?key=${connection.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  for (let round = 0; round <= MAX_TOOL_CALLS_PER_AGENT_TURN; round++) {
    // Final round forces no-tools so the model must produce a text answer
    // (see callOpenAICompatibleDirect for why this matters when a web
    // backend is rejecting calls).
    const finalRound = round === MAX_TOOL_CALLS_PER_AGENT_TURN;
    const withTools = toolsEnabled && !finalRound;

    let data = await request(withTools);
    if (data === null && withTools) data = await request(false);
    if (data === null) return null;
    inputTokens += data.usageMetadata?.promptTokenCount ?? 0;
    outputTokens += data.usageMetadata?.candidatesTokenCount ?? 0;

    const candidateParts: any[] = data.candidates?.[0]?.content?.parts ?? [];
    const functionCallPart = candidateParts.find((p) => p.functionCall);
    if (withTools && functionCallPart) {
      contents.push({ role: 'model', parts: candidateParts });
      const toolName = functionCallPart.functionCall.name;
      const evidenceJson = await executeToolCall(toolName, functionCallPart.functionCall.args, accessToken, evidence);
      contents.push({
        role: 'function',
        parts: [{ functionResponse: { name: toolName, response: JSON.parse(evidenceJson) } }],
      });
      continue;
    }

    const content = candidateParts.find((p) => p.text)?.text?.trim();
    if (!content) {
      if (!finalRound) continue;
      return null;
    }
    return { content, usage: { inputTokens, outputTokens }, ...evidence };
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
  webSearches?: WebSearchEvidence[];
  webBrowses?: BrowseEvidence[];
  webAccessFailed?: boolean;
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
    webSearches: result.webSearches.length > 0 ? result.webSearches : undefined,
    webBrowses: result.webBrowses.length > 0 ? result.webBrowses : undefined,
    webAccessFailed: result.webAccessFailed || undefined,
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

/** Extension of `callDirect` for callers that only need the text — see `fetchAgentReply` for the one path that also needs `usage`. Exported so sibling modules (orchestrator, agent-autopopulate) can reuse the same provider dispatch instead of each reinventing HTTP to the three provider families. */
export async function callDirectText(
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

/**
 * ✨ Auto-populate for the Agent profile fields. Driven by `agent.description`
 * (free text the user writes) + the agent's name/role, sent to an LLM
 * connection the user picks on the fly. Operates on the OPENED agent only —
 * callers pass the agent being edited. On any failure returns null/empty so
 * the UI can surface the error rather than silently filling garbage
 * (consistent with the app's anti-fabrication posture: never invent an agent
 * definition and present it as authoritative).
 */
export type AgentAutoField = 'identity' | 'instructions' | 'skills' | 'loopGuidance';

const AUTO_FIELD_BRIEF: Record<AgentAutoField, string> = {
  identity:
    'the agent\'s persona, voice, and background — who they ARE (1-3 sentences, second person "You are...")',
  instructions:
    'what the agent should do in discussions — its approach, focus, and operating principles (2-4 short imperative clauses)',
  skills:
    'the agent\'s areas of expertise and capabilities — a comma-separated list or short bullets (no preamble)',
  loopGuidance:
    'how this agent should participate in and pace the discussion loop, including how to avoid repeating itself or others (2-4 short imperative clauses)',
};

function autoPopulateUserPrompt(agent: Agent): string {
  const ctx = [
    `Agent name: ${agent.name}`,
    `Agent role: ${agent.role}`,
    agent.identity.trim() ? `Existing identity: ${agent.identity.trim()}` : '',
    agent.instructions.trim() ? `Existing instructions: ${agent.instructions.trim()}` : '',
    agent.skills.trim() ? `Existing skills: ${agent.skills.trim()}` : '',
    agent.loopGuidance.trim() ? `Existing loop guidance: ${agent.loopGuidance.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return `Agent description (the source of truth for who this agent is):\n${agent.description.trim()}\n\n${ctx}\n\nWrite content that fits this specific agent. Match the app's terse, imperative style — no filler, no "Sure!", output only the requested text.`;
}

export async function autoPopulateField(
  agent: Agent,
  field: AgentAutoField,
  connection: LLMConnection
): Promise<string> {
  if (!agent.description.trim()) return '';
  const systemPrompt =
    `You draft ONE field of a multi-agent discussion participant's profile from a human-written description. ` +
    `Write ONLY ${AUTO_FIELD_BRIEF[field]}. Respond with just that field's text, no labels, no markdown headings, no quotes, no preamble.`;
  const out = await callDirectText(connection, systemPrompt, autoPopulateUserPrompt(agent));
  return (out ?? '').trim();
}

export interface AutoPopulatedProfile {
  identity: string;
  instructions: string;
  skills: string;
  loopGuidance: string;
}

/** Tolerant JSON object extraction — models wrap output in prose/fences often enough to handle. */
function extractJsonObject(text: string): string | null {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/g, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return t.slice(start, end + 1);
}

export async function autoPopulateAll(
  agent: Agent,
  connection: LLMConnection
): Promise<AutoPopulatedProfile | null> {
  if (!agent.description.trim()) return null;
  const systemPrompt =
    `You draft the full profile of a multi-agent discussion participant from a human-written description. ` +
    `Respond with ONLY a JSON object (no prose, no code fences) with exactly these string keys: ` +
    `"identity" (1-3 sentences, "You are..."), "instructions" (2-4 short imperative clauses on approach/focus), ` +
    `"skills" (comma-separated expertise list), "loopGuidance" (2-4 short imperative clauses on pacing the discussion and avoiding repetition). ` +
    `Match the app's terse, imperative style — no filler.`;
  const out = await callDirectText(connection, systemPrompt, autoPopulateUserPrompt(agent));
  if (!out) return null;
  const jsonText = extractJsonObject(out);
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const profile: AutoPopulatedProfile = {
      identity: str(parsed.identity),
      instructions: str(parsed.instructions),
      skills: str(parsed.skills),
      loopGuidance: str(parsed.loopGuidance),
    };
    // Require at least one non-empty field so a totally-empty/garbage reply
    // is treated as a failure rather than blanking the agent's profile.
    if (!profile.identity && !profile.instructions && !profile.skills && !profile.loopGuidance) {
      return null;
    }
    return profile;
  } catch {
    return null;
  }
}
