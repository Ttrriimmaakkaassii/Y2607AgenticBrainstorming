import { Agent, LLMConnection, Message } from './types';
import { callDirectText } from './llm-client';

/**
 * Orchestrator repetition judge (#4). After an agent drafts a reply, this
 * decides whether that draft substantively REPEATS points already made in the
 * recent discussion. If it does, it returns a one-line `guidance` instruction
 * to elaborate on the SAME subject differently — not a new subject — which the
 * loop feeds back as a single bounded re-prompt (see runAgentRound).
 *
 * Two-stage on purpose:
 *  1. A cheap, local token-overlap pre-filter (no LLM cost) catches the
 *     obvious near-duplicates. The common case — a novel reply — must cost
 *     zero tokens, otherwise every turn doubles its LLM calls.
 *  2. Only when the pre-filter flags potential repetition does it ask the LLM
 *     to judge substantively (topic continuity is NOT repetition — building on
 *     a point is fine, restating it is not) and, if repetitive, supply the
 *     concrete "elaborate differently" nudge.
 *
 * Never throws on LLM failure: returns { isRepetitive: false } so the round
 * keeps the original draft (same graceful-degradation rule as the web tools —
 * the orchestrator must never kill a turn).
 */

export interface RepetitionVerdict {
  isRepetitive: boolean;
  guidance: string | null;
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'to', 'of', 'in', 'on', 'for', 'with', 'as', 'by', 'at', 'from', 'it', 'this', 'that',
  'these', 'those', 'i', 'you', 'we', 'they', 'he', 'she', 'your', 'our', 'their', 'my', 'me',
  'us', 'them', 'so', 'not', 'no', 'do', 'does', 'did', 'has', 'have', 'had', 'will', 'would',
  'can', 'could', 'should', 'about', 'what', 'which', 'who', 'how', 'why', 'when', 'there',
  'also', 'just', 'more', 'than', 'into', 'out', 'up', 'down', 'over', 'very', 'much', 'one',
  'all', 'any', 'some', 'such', 'its', 'it’s', "it's", 're', 've', 'll', 't', 's', 'd',
]);

/** Lowercase alphanumeric tokens, stopwords + single chars removed. */
function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of text.toLowerCase().match(/[a-z0-9']+/g) ?? []) {
    if (raw.length < 2) continue;
    if (STOPWORDS.has(raw)) continue;
    tokens.add(raw);
  }
  return tokens;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return inter / union;
}

/** Pure, exported for tests — no LLM, no network. */
export function localRepetitionScore(draft: string, recentMessages: Message[]): number {
  const draftTokens = tokenize(draft);
  if (draftTokens.size === 0 || recentMessages.length === 0) return 0;
  let max = 0;
  for (const m of recentMessages) {
    const score = jaccard(draftTokens, tokenize(m.content));
    if (score > max) max = score;
  }
  return max;
}

/** Above this Jaccard overlap with any single recent message, bother the LLM judge. */
const LOCAL_THRESHOLD = 0.34;

export function shouldEscalateToLLM(score: number): boolean {
  return score >= LOCAL_THRESHOLD;
}

export async function judgeRepetition(
  draft: string,
  recentMessages: Message[],
  speakingAgent: Agent,
  connection: LLMConnection
): Promise<RepetitionVerdict> {
  const score = localRepetitionScore(draft, recentMessages);
  if (!shouldEscalateToLLM(score)) {
    return { isRepetitive: false, guidance: null };
  }

  const recent = recentMessages
    .map((m) => `${m.agentId === 'user' ? 'User' : 'Participant'}: ${m.content}`)
    .join('\n');

  const systemPrompt =
    'You are a strict discussion moderator judging ONE thing: does the proposed reply substantively ' +
    'REPEAT points already made (restating the same claim, evidence, or conclusion), as opposed to ' +
    'building on them with new depth, examples, or a contrasting angle? Building on a topic is GOOD ' +
    'and is NOT repetition — only flag clear restatement. Respond with ONLY a JSON object, no prose, ' +
    'no code fences: {"isRepetitive": true|false, "guidance": "..."}. When true, guidance is ONE short ' +
    'imperative sentence telling the speaker to ELABORATE ON A DIFFERENT BRANCH OR ASPECT of the ' +
    'subject that has NOT been covered yet (a new sub-topic, a related angle, an unexplored implication, ' +
    'a practical consequence, a risk, a cost factor) — NOT just rephrasing the same point. When false, ' +
    'guidance is the empty string.';

  const userPrompt =
    `Speaker: ${speakingAgent.name} (${speakingAgent.role}).\n\n` +
    `Recent discussion:\n${recent}\n\n` +
    `Proposed reply from ${speakingAgent.name}:\n${draft}\n\n` +
    `Judge whether the proposed reply repeats earlier points.`;

  let out: string | null;
  try {
    out = await callDirectText(connection, systemPrompt, userPrompt);
  } catch {
    return { isRepetitive: false, guidance: null };
  }
  if (!out) return { isRepetitive: false, guidance: null };

  // Tolerant extraction — models often wrap JSON in prose/fences.
  const t = out.trim().replace(/^```(?:json)?/i, '').replace(/```$/g, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return { isRepetitive: false, guidance: null };
  try {
    const parsed = JSON.parse(t.slice(start, end + 1)) as { isRepetitive?: unknown; guidance?: unknown };
    const isRepetitive = parsed.isRepetitive === true;
    const guidance = typeof parsed.guidance === 'string' ? parsed.guidance.trim() : '';
    return { isRepetitive, guidance: isRepetitive && guidance ? guidance : null };
  } catch {
    return { isRepetitive: false, guidance: null };
  }
}
