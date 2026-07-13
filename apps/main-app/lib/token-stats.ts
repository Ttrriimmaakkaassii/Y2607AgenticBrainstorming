import { Agent, Message } from './types';

export interface TokenTotals {
  input: number;
  output: number;
  total: number;
}

function emptyTotals(): TokenTotals {
  return { input: 0, output: 0, total: 0 };
}

function addUsage(totals: TokenTotals, m: Message): TokenTotals {
  const input = m.inputTokens ?? 0;
  const output = m.outputTokens ?? 0;
  return { input: totals.input + input, output: totals.output + output, total: totals.total + input + output };
}

/** Sums token usage across every message that has it (user messages / untracked pre-feature messages contribute 0). */
export function sumTokens(messages: Message[]): TokenTotals {
  return messages.reduce(addUsage, emptyTotals());
}

export interface AgentModelUsage {
  agentId: string;
  agentName: string;
  provider: string;
  model: string;
  totals: TokenTotals;
}

/** One row per (agent, provider, model) combination actually used — an agent that switched LLM connections over time shows as separate rows, since each message snapshots the provider/model used for it. */
export function groupByAgentAndModel(messages: Message[], agents: Agent[]): AgentModelUsage[] {
  const rows = new Map<string, AgentModelUsage>();
  for (const m of messages) {
    if (m.agentId === 'user' || !m.provider || !m.model) continue;
    const key = `${m.agentId}::${m.provider}::${m.model}`;
    const existing = rows.get(key);
    if (existing) {
      existing.totals = addUsage(existing.totals, m);
      continue;
    }
    const agent = agents.find((a) => a.id === m.agentId);
    rows.set(key, {
      agentId: m.agentId,
      agentName: agent?.name ?? 'Unknown agent',
      provider: m.provider,
      model: m.model,
      totals: addUsage(emptyTotals(), m),
    });
  }
  return Array.from(rows.values()).sort((a, b) => b.totals.total - a.totals.total);
}

export type UsagePeriod = 'week' | 'month' | 'all';

/** Filters messages to those within the given rolling period, ending now. */
export function filterByPeriod(messages: Message[], period: UsagePeriod): Message[] {
  if (period === 'all') return messages;
  const now = Date.now();
  const spanMs = period === 'week' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  return messages.filter((m) => now - m.timestamp <= spanMs);
}
