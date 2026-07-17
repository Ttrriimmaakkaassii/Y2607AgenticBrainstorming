import {
  A2AClaim,
  A2AClaimClassification,
  A2AConfidence,
  A2AIntent,
  A2AMessage,
  A2APhase,
  A2AStatus,
  Agent,
  AgentTiming,
  Message,
} from './types';

/**
 * Structured A2A message validation + envelope construction. House style: pure
 * `validateA2A(): A2AMessage | { error }` (no schema lib). Adapted to project
 * conventions — NOT a verified implementation of Google A2A or any standard.
 */

const PHASES: A2APhase[] = ['objective', 'planning', 'evidence_collection', 'analysis', 'decision', 'execution', 'review', 'complete', 'error'];
const INTENTS: A2AIntent[] = ['delegate', 'request', 'respond', 'submit_evidence', 'challenge', 'approve', 'reject', 'handoff', 'status', 'final'];
const CONFIDENCES: A2AConfidence[] = ['high', 'medium', 'low', 'insufficient_evidence'];
const CLASSIFICATIONS: A2AClaimClassification[] = ['verified', 'unverified', 'inference', 'hypothesis', 'assumption'];
const STATUSES: A2AStatus[] = ['queued', 'thinking', 'streaming', 'complete', 'failed'];

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const REF_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_ENVELOPE_BYTES = 64 * 1024;

function isStr(v: unknown): v is string {
  return typeof v === 'string';
}
function isStrArr(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/** Validate a raw A2A envelope. Returns the typed envelope or `{ error }`. */
export function validateA2A(env: unknown): A2AMessage | { error: string } {
  // Payload cap first — rejects oversized payloads (and accidental prompt/secret
  // dumps) without echoing their content.
  try {
    const size = JSON.stringify(env).length;
    if (size > MAX_ENVELOPE_BYTES) {
      return { error: `A2A envelope too large (${size} bytes > ${MAX_ENVELOPE_BYTES}).` };
    }
  } catch {
    return { error: 'A2A envelope is not JSON-serializable.' };
  }
  if (!env || typeof env !== 'object') return { error: 'A2A envelope must be an object.' };
  const e = env as Record<string, unknown>;
  if (e.version !== 1) return { error: 'A2A envelope version must be 1.' };
  if (!isStr(e.messageId) || !e.messageId) return { error: 'messageId is required.' };
  if (!isStr(e.conversationId) || !e.conversationId) return { error: 'conversationId is required.' };
  if (!isStr(e.fromAgent) || !e.fromAgent) return { error: 'fromAgent is required.' };
  const toAgent = e.toAgent;
  if (!(isStr(toAgent) || (Array.isArray(toAgent) && toAgent.every(isStr) && toAgent.length > 0))) {
    return { error: 'toAgent must be a non-empty string or string array.' };
  }
  if (!PHASES.includes(e.phase as A2APhase)) return { error: `phase must be one of: ${PHASES.join(', ')}.` };
  if (!INTENTS.includes(e.intent as A2AIntent)) return { error: `intent must be one of: ${INTENTS.join(', ')}.` };
  if (!isStr(e.naturalLanguageSummary)) return { error: 'naturalLanguageSummary is required.' };
  if (!STATUSES.includes(e.status as A2AStatus)) return { error: `status must be one of: ${STATUSES.join(', ')}.` };
  if (e.confidence !== undefined && !CONFIDENCES.includes(e.confidence as A2AConfidence)) {
    return { error: `confidence must be one of: ${CONFIDENCES.join(', ')}.` };
  }
  if (!ISO_RE.test(isStr(e.createdAt) ? e.createdAt : '')) return { error: 'createdAt must be an ISO timestamp.' };
  for (const k of ['startedAt', 'firstTokenAt', 'completedAt'] as const) {
    if (e[k] !== undefined && !(isStr(e[k]) && ISO_RE.test(e[k] as string))) return { error: `${k} must be an ISO timestamp.` };
  }
  if (e.durationMs !== undefined && (typeof e.durationMs !== 'number' || e.durationMs < 0 || !Number.isFinite(e.durationMs))) {
    return { error: 'durationMs must be a non-negative finite number.' };
  }
  // claims
  if (e.claims !== undefined) {
    if (!Array.isArray(e.claims)) return { error: 'claims must be an array.' };
    for (const c of e.claims) {
      if (!c || typeof c !== 'object') return { error: 'each claim must be an object.' };
      const cl = c as Record<string, unknown>;
      if (!isStr(cl.claimId) || !cl.claimId) return { error: 'claim.claimId is required.' };
      if (!isStr(cl.text)) return { error: 'claim.text is required.' };
      if (!CLASSIFICATIONS.includes(cl.classification as A2AClaimClassification)) {
        return { error: `claim.classification must be one of: ${CLASSIFICATIONS.join(', ')}.` };
      }
      if (!isStrArr(cl.evidenceRefs)) return { error: 'claim.evidenceRefs must be a string array.' };
      if (typeof cl.allowedInFinalAnswer !== 'boolean') return { error: 'claim.allowedInFinalAnswer must be boolean.' };
    }
  }
  // evidenceRefs (top-level)
  if (e.evidenceRefs !== undefined && !isStrArr(e.evidenceRefs)) {
    return { error: 'evidenceRefs must be a string array.' };
  }
  for (const r of (e.evidenceRefs as string[] | undefined) ?? []) {
    if (!REF_RE.test(r)) return { error: `evidenceRef "${r.slice(0, 16)}" is not a valid reference id.` };
  }
  return e as unknown as A2AMessage;
}

/** Heuristic intent inference from reply text (no LLM call). */
function inferIntent(text: string, addressed: boolean): A2AIntent {
  const t = text.toLowerCase();
  if (/\b(hand off|over to|your turn|pass to)\b/.test(t)) return 'handoff';
  if (/\b(i (dis)?agree|challenge|wrong because|but actually)\b/.test(t)) return 'challenge';
  if (/\b(approve|agreed|concur|accepted)\b/.test(t)) return 'approve';
  if (/\b(reject|decline|cannot accept)\b/.test(t)) return 'reject';
  if (/\b(evidence|source|citation|according to|data shows)\b/.test(t)) return 'submit_evidence';
  if (/\b(could you|please|can you|i need|i request)\b/.test(t)) return addressed ? 'respond' : 'request';
  if (/\b(final|in conclusion|to summarize|bottom line)\b/.test(t)) return 'final';
  return 'respond';
}

/** Build a valid A2A envelope from an agent's reply + captured timing. The NL
 * content is always the naturalLanguageSummary; claims are parsed from an
 * optional fenced JSON claims block the agent may emit, else []. Returns a
 * validated envelope or null (caller sets a2aError). */
export function coerceA2AFromReply(
  agent: Agent,
  message: Message,
  conversationId: string,
  toAgent: string | string[],
  phase: A2APhase,
  timing: AgentTiming | undefined
): A2AMessage | null {
  let claims: A2AClaim[] | undefined;
  // Tolerant extraction of an optional ```json ... {"claims":[...]} ``` block.
  const m = message.content.match(/```json\s*([\s\S]*?)```/);
  if (m) {
    try {
      const parsed = JSON.parse(m[1]);
      if (parsed && Array.isArray(parsed.claims)) claims = parsed.claims;
    } catch {
      /* ignore — claims stay undefined */
    }
  }
  const env: A2AMessage = {
    version: 1,
    messageId: message.id,
    conversationId,
    parentMessageId: message.replyToId ?? undefined,
    fromAgent: agent.id,
    toAgent,
    phase,
    intent: inferIntent(message.content, Array.isArray(toAgent) ? toAgent.length > 0 : !!toAgent),
    claims,
    naturalLanguageSummary: message.content,
    status: timing?.failedAt ? 'failed' : 'complete',
    createdAt: timing?.startedAt ?? new Date().toISOString(),
    startedAt: timing?.startedAt,
    firstTokenAt: timing?.firstTokenAt,
    completedAt: timing?.completedAt,
    durationMs: timing?.totalDurationMs,
  };
  const validated = validateA2A(env);
  return 'error' in validated ? null : validated;
}
