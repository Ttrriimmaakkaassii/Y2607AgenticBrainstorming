import { Agent, LLMConnection, Message } from './types';
import { callDirectText } from './llm-client';

/**
 * Background moderator — the "active but not participant" advisors.
 *
 * Each round, every connected agent that is ACTIVE but NOT a participant
 * (a background advisor) is polled for a brief take on the current transcript;
 * a synthesizer LLM then folds those takes into one concise "advisor note"
 * that gets injected into the visible participants' prompts, so the advisors
 * influence the discussion through the moderator without ever posting
 * themselves. participant ⇒ active, so advisors are exactly active && !participant.
 *
 * Bounded: at most MAX_ADVISORS polled per round, each asked for ~1-2 sentences,
 * to keep latency/cost predictable. Any failure is swallowed (returns null /
 * partial) — the round must never die because the moderator had a bad call.
 */

const MAX_ADVISORS = 4;

function transcriptText(messages: Message[], agents: Agent[]): string {
  const recent = messages.slice(-20);
  return recent
    .map((m) => {
      const author = m.agentId === 'user' ? 'User' : agents.find((a) => a.id === m.agentId)?.name ?? 'Agent';
      return `${author}: ${m.content}`;
    })
    .join('\n');
}

/**
 * Polls advisors and synthesizes their takes into a single note.
 * `synthesizer` is the connection used to fold takes together (typically the
 * global Wiki Keeper connection — the app's designated "background" LLM).
 * If null, the raw takes are concatenated (truncated) instead.
 */
export async function gatherAdvisorNote(
  advisors: Agent[],
  connections: LLMConnection[],
  messages: Message[],
  agents: Agent[],
  synthesizer: LLMConnection | null
): Promise<string | null> {
  const active = advisors.filter((a) => a.connectionId).slice(0, MAX_ADVISORS);
  if (active.length === 0) return null;
  const transcript = transcriptText(messages, agents);
  if (!transcript.trim()) return null;

  const takes: string[] = [];
  for (const advisor of active) {
    const conn = connections.find((c) => c.id === advisor.connectionId);
    if (!conn) continue;
    const system =
      `You are ${advisor.name}, acting as a BACKGROUND ADVISOR to a multi-agent discussion you are not directly speaking in. ` +
      `Given the transcript, give 1-2 sentences of the single most useful guidance, nuance, risk, or question the visible speakers should consider next. ` +
      `Be specific and non-obvious. No preamble, no greeting — just the advice.`;
    try {
      const out = await callDirectText(conn, system, transcript);
      const trimmed = (out ?? '').trim();
      if (trimmed) takes.push(`${advisor.name}: ${trimmed}`);
    } catch {
      /* skip a failing advisor */
    }
  }
  if (takes.length === 0) return null;

  if (!synthesizer) {
    // No synthesizer configured — concatenate the takes, capped.
    return takes.join('\n').slice(0, 600);
  }

  const system =
    'You are the MODERATOR synthesizing several background advisors\' notes into ONE concise, actionable note ' +
    'for the visible discussion participants. Merge redundancies, resolve contradictions, and surface the single ' +
    'most important shared guidance in at most 3 sentences. No preamble, no "the advisors say" — just the synthesized note.';
  const user = `Advisor notes:\n${takes.join('\n')}`;
  try {
    const out = await callDirectText(synthesizer, system, user);
    const trimmed = (out ?? '').trim();
    return trimmed || takes.join('\n').slice(0, 600);
  } catch {
    return takes.join('\n').slice(0, 600);
  }
}
