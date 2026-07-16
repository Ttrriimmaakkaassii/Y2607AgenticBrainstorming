/**
 * GLOBAL Wiki Keeper connection id — stored in localStorage independently of
 * any conversation, so the chosen keeper PERSISTS across page refreshes and
 * applies to new conversations without the user having to re-pick it each
 * time. The per-conversation ConversationSettings.wikiKeeperConnectionId is
 * still respected (and takes precedence); this is the fallback / default that
 * "once set, stays until changed".
 */
const STORAGE_KEY = 'multi-agent-wiki-keeper';

export function loadGlobalWikiKeeper(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function saveGlobalWikiKeeper(connectionId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (connectionId && connectionId.trim()) {
      window.localStorage.setItem(STORAGE_KEY, connectionId.trim());
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}
