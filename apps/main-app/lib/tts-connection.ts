export const TTS_API_KEY_STORAGE_KEY = 'multi-agent-tts-api-key';
const STORAGE_KEY = TTS_API_KEY_STORAGE_KEY;

/**
 * Google Cloud Text-to-Speech API key, bring-your-own-key like LLMConnections
 * (lib/llm-connections.ts). Kept local-only, never included in
 * ConversationState — same reasoning as why LLMConnection.apiKey never
 * syncs to Supabase.
 */
export function loadTtsApiKey(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(STORAGE_KEY) ?? '';
}

export function saveTtsApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, key.trim());
}
