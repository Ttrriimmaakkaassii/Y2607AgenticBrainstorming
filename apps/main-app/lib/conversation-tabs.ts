const STORAGE_KEY = 'multi-agent-conversation-tabs';

export interface ConversationTabMeta {
  id: string;
  title: string;
}

/** The open tab list itself — like Archives, this is localStorage-only (not synced), consistent with archives already being local-only. */
export function loadTabs(): ConversationTabMeta[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ConversationTabMeta[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTabs(tabs: ConversationTabMeta[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
}
