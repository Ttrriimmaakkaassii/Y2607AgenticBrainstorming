import { supabase } from './supabase';
import { LLMConnection } from './types';

const STORAGE_KEY = 'multi-agent-llm-connections';

/**
 * localStorage is always the fast local cache. When signed in (see
 * lib/auth.ts), connections also sync to the `llm_connections` Supabase
 * table, which is RLS-locked to `auth.uid() = user_id` — see the SQL in
 * README/DEPLOYMENT docs. Never sync API keys anywhere without that
 * per-user RLS in place.
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

export async function syncConnectionsToSupabase(
  connections: LLMConnection[],
  userId: string
): Promise<void> {
  if (!supabase) return;
  const rows = connections.map((c) => ({
    id: c.id,
    user_id: userId,
    provider: c.provider,
    model: c.model,
    effort: c.effort,
    api_key: c.apiKey,
    label: c.label,
    updated_at: new Date().toISOString(),
  }));

  await supabase.from('llm_connections').delete().eq('user_id', userId);
  if (rows.length > 0) {
    const { error } = await supabase.from('llm_connections').upsert(rows);
    if (error) console.error('Failed to sync LLM connections to Supabase:', error.message);
  }
}

export async function loadConnectionsFromSupabase(userId: string): Promise<LLMConnection[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('llm_connections')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to load LLM connections from Supabase:', error.message);
    return null;
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    provider: row.provider,
    model: row.model,
    effort: row.effort,
    apiKey: row.api_key,
    label: row.label,
  }));
}
