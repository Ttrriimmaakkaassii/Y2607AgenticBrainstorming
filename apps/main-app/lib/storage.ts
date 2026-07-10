import { supabase } from './supabase';
import { ConversationState } from './types';

const STORAGE_KEY = 'multi-agent-conversation';

function saveLocal(state: ConversationState): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadLocal(): ConversationState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ConversationState) : null;
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
      };
    }
    if (error) {
      console.error('Supabase load failed, falling back to localStorage:', error.message);
    }
  }

  return loadLocal();
}
