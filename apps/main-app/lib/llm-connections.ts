import { LLMConnection } from './types';

const STORAGE_KEY = 'multi-agent-llm-connections';

/**
 * Intentionally localStorage-only. These records hold raw API keys, so they
 * must never be merged into ConversationState or passed to lib/storage.ts —
 * that data is synced to Supabase under a public-read RLS policy.
 */
export function loadConnections(): LLMConnection[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LLMConnection[]) : [];
  } catch {
    return [];
  }
}

export function saveConnections(connections: LLMConnection[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
}
