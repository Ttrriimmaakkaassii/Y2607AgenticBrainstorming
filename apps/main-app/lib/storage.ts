import { supabase } from './supabase';
import { ConversationState } from './types';

const STORAGE_KEY_PREFIX = 'multi-agent-conversation-';
// Pre-tabs versions of this app only ever kept ONE conversation locally,
// under this single fixed key — kept as a read-only fallback so upgrading
// users don't lose their current conversation the first time it's loaded
// under the new per-id scheme.
const LEGACY_STORAGE_KEY = 'multi-agent-conversation';
const LEGACY_ACTIVE_ID_KEY = 'multi-agent-conversation-id';

function localKey(id: string): string {
  return `${STORAGE_KEY_PREFIX}${id}`;
}

function saveLocal(state: ConversationState): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(localKey(state.id), JSON.stringify(state));
}

function loadLocal(id: string): ConversationState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(localKey(id));
    if (raw) return JSON.parse(raw) as ConversationState;
    const legacyActiveId = window.localStorage.getItem(LEGACY_ACTIVE_ID_KEY);
    if (legacyActiveId === id) {
      const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyRaw) return JSON.parse(legacyRaw) as ConversationState;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveConversation(state: ConversationState): Promise<void> {
  saveLocal(state);

  if (!supabase) return;

  const allMessages = state.threads.flatMap((t) => t.messages);
  const { error } = await supabase.from('conversations').upsert({
    id: state.id,
    agents: state.agents,
    threads: state.threads,
    messages: allMessages,
    settings: state.settings,
    flow: 'FreeFlowing',
    status: state.status,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('Supabase save failed, using localStorage only:', error.message);
  }
}

export async function loadConversation(id: string): Promise<ConversationState | null> {
  if (supabase) {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!error && data) {
      return {
        id: data.id,
        agents: data.agents,
        threads: data.threads,
        settings: data.settings,
        status: data.status,
        updatedAt: new Date(data.updated_at).getTime(),
        // Not stored in Supabase (no matching column) — recomputed by migrateState
        // from the agents' existing refNumbers after load.
        nextAgentNumber: 0,
      };
    }
    if (error) {
      console.error('Supabase load failed, falling back to localStorage:', error.message);
    }
    // No error but also no row for this id (e.g. a locally-created tab that
    // hasn't synced yet, or Supabase configured with pre-existing local-only
    // conversations) — fall through to the local cache for this exact id
    // rather than silently returning nothing.
  }

  return loadLocal(id);
}

/** Removes a conversation's stored data entirely — used when a closed tab is discarded, or once it's been archived (the live row is no longer needed). */
export async function deleteConversation(id: string): Promise<void> {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(localKey(id));
  }
  if (!supabase) return;
  const { error } = await supabase.from('conversations').delete().eq('id', id);
  if (error) {
    console.error('Supabase delete failed:', error.message);
  }
}
