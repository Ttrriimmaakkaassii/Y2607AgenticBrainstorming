import { AgentCommunicationMode, AgentCommunicationDisplay } from './types';

/**
 * GLOBAL communication-mode + display-mode defaults — stored in localStorage
 * independently of any conversation (mirrors lib/wiki-keeper.ts), so the
 * chosen preferences PERSIST across page refreshes and apply to new
 * conversations. A conversation's own settings (ConversationSettings.
 * communicationMode / a2aDisplayMode) take precedence when set; these are the
 * fallback. NOT synced to Supabase (they're UI prefs, not conversation data).
 */
const MODE_KEY = 'multi-agent-communication-mode';
const DISPLAY_KEY = 'multi-agent-a2a-display-mode';

export const DEFAULT_COMMUNICATION_MODE: AgentCommunicationMode = 'natural_language';
export const DEFAULT_A2A_DISPLAY_MODE: AgentCommunicationDisplay = 'a2a_readable';

function read(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(key);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value && value.trim()) window.localStorage.setItem(key, value.trim());
    else window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

const VALID_MODES: AgentCommunicationMode[] = ['natural_language', 'a2a'];
const VALID_DISPLAYS: AgentCommunicationDisplay[] = ['natural_language', 'a2a_readable', 'a2a_raw'];

export function loadGlobalCommunicationMode(): AgentCommunicationMode {
  const v = read(MODE_KEY);
  return v && (VALID_MODES as string[]).includes(v) ? (v as AgentCommunicationMode) : DEFAULT_COMMUNICATION_MODE;
}
export function saveGlobalCommunicationMode(mode: AgentCommunicationMode): void {
  write(MODE_KEY, mode);
}

export function loadGlobalA2ADisplayMode(): AgentCommunicationDisplay {
  const v = read(DISPLAY_KEY);
  return v && (VALID_DISPLAYS as string[]).includes(v) ? (v as AgentCommunicationDisplay) : DEFAULT_A2A_DISPLAY_MODE;
}
export function saveGlobalA2ADisplayMode(mode: AgentCommunicationDisplay): void {
  write(DISPLAY_KEY, mode);
}

/** Effective mode = conversation's own choice, else the persisted global default. */
export function effectiveCommunicationMode(conv: AgentCommunicationMode | undefined): AgentCommunicationMode {
  return conv ?? loadGlobalCommunicationMode();
}
export function effectiveA2ADisplayMode(conv: AgentCommunicationDisplay | undefined): AgentCommunicationDisplay {
  return conv ?? loadGlobalA2ADisplayMode();
}
