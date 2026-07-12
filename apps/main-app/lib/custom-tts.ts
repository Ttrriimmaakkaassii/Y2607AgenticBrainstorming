const BASE_URL_KEY = 'multi-agent-custom-tts-base-url';
const API_KEY_KEY = 'multi-agent-custom-tts-api-key';
const VOICE_KEY = 'multi-agent-custom-tts-voice';

export const CUSTOM_TTS_DEFAULT_VOICE = 'Kore';

/**
 * BYO text-to-speech HTTP service (e.g. a self-hosted Gemini-TTS-backed
 * Worker) — same local-only storage pattern as the Gemini TTS key
 * (lib/tts-connection.ts) and LLM connections. Never included in
 * ConversationState, since that syncs to a publicly-readable Supabase table.
 */
export function loadCustomTtsBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(BASE_URL_KEY) ?? '';
}

export function saveCustomTtsBaseUrl(url: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(BASE_URL_KEY, url.trim().replace(/\/+$/, ''));
}

export function loadCustomTtsApiKey(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(API_KEY_KEY) ?? '';
}

export function saveCustomTtsApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(API_KEY_KEY, key.trim());
}

export function loadCustomTtsVoice(): string {
  if (typeof window === 'undefined') return CUSTOM_TTS_DEFAULT_VOICE;
  return window.localStorage.getItem(VOICE_KEY) || CUSTOM_TTS_DEFAULT_VOICE;
}

export function saveCustomTtsVoice(voice: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(VOICE_KEY, voice.trim() || CUSTOM_TTS_DEFAULT_VOICE);
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string') return data.error;
  } catch {
    // response wasn't JSON — fall through to the generic status message
  }
  if (res.status === 401) return 'Unauthorized — check the API key.';
  return `HTTP ${res.status}`;
}

/**
 * POSTs to `${baseUrl}/api/v1/audiotize` and returns a blob: URL for the
 * returned audio (the service returns raw audio bytes, e.g. WAV — not
 * JSON), or null on any failure.
 */
export async function synthesizeCustomTts(
  baseUrl: string,
  apiKey: string,
  text: string,
  voice: string,
  signal?: AbortSignal
): Promise<string | null> {
  if (!baseUrl.trim() || !apiKey.trim() || !text.trim()) return null;
  try {
    const res = await fetch(`${baseUrl.trim().replace(/\/+$/, '')}/api/v1/audiotize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, voice: voice || undefined }),
      signal,
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/** Used by the "Test" button in Settings — synthesizes a short/custom phrase and reports the outcome. */
export async function testCustomTts(
  baseUrl: string,
  apiKey: string,
  voice: string,
  text: string
): Promise<{ ok: boolean; audioUrl: string | null; error?: string }> {
  if (!baseUrl.trim()) return { ok: false, audioUrl: null, error: 'Enter the base URL first.' };
  if (!apiKey.trim()) return { ok: false, audioUrl: null, error: 'Enter the API key first.' };
  try {
    const res = await fetch(`${baseUrl.trim().replace(/\/+$/, '')}/api/v1/audiotize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: text.trim() || 'This is a test.', voice: voice || undefined }),
    });
    if (!res.ok) return { ok: false, audioUrl: null, error: await readErrorMessage(res) };
    const blob = await res.blob();
    return { ok: true, audioUrl: URL.createObjectURL(blob) };
  } catch {
    return { ok: false, audioUrl: null, error: 'Network error — check the base URL and your connection.' };
  }
}
