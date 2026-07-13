const BASE_URL_KEY = 'multi-agent-custom-tts-base-url';
export const CUSTOM_TTS_API_KEY_STORAGE_KEY = 'multi-agent-custom-tts-api-key';
const API_KEY_KEY = CUSTOM_TTS_API_KEY_STORAGE_KEY;
const VOICE_KEY = 'multi-agent-custom-tts-voice';
const PODCAST_BASE_URL_KEY = 'multi-agent-custom-tts-podcast-base-url';
const PODCAST_SLUG_HISTORY_KEY = 'multi-agent-custom-tts-podcast-slugs';
const MAX_SLUG_HISTORY = 10;

export const CUSTOM_TTS_DEFAULT_VOICE = 'Kore';

/**
 * Strips a trailing slash and, if present, an already-included
 * `/api/v1/audiotize` or `/api/v1/podcastize` suffix — pasting the full
 * endpoint URL (instead of just the origin) as the "base URL" is an easy
 * mistake, and previously caused requests to double up into
 * `/api/v1/audiotize/api/v1/audiotize`.
 */
function normalizeBaseUrl(url: string): string {
  return url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api\/v1\/(audiotize|podcastize)$/i, '');
}

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
  window.localStorage.setItem(BASE_URL_KEY, normalizeBaseUrl(url));
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

/**
 * The podcast (multi-speaker episode) endpoint can live on a different
 * base URL than the single-clip audiotize endpoint — kept as a separate
 * field, sharing the same API key.
 */
export function loadCustomPodcastBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(PODCAST_BASE_URL_KEY) ?? '';
}

export function saveCustomPodcastBaseUrl(url: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PODCAST_BASE_URL_KEY, normalizeBaseUrl(url));
}

/** Most-recently-used feed slugs, newest first, for the Feed Slug autocomplete dropdown. */
export function loadPodcastSlugHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PODCAST_SLUG_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export function addPodcastSlugToHistory(slug: string): string[] {
  const trimmed = slug.trim();
  if (typeof window === 'undefined' || !trimmed) return loadPodcastSlugHistory();
  const next = [trimmed, ...loadPodcastSlugHistory().filter((s) => s !== trimmed)].slice(0, MAX_SLUG_HISTORY);
  window.localStorage.setItem(PODCAST_SLUG_HISTORY_KEY, JSON.stringify(next));
  return next;
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
    const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/audiotize`, {
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
    const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/audiotize`, {
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

export interface PodcastSegment {
  speaker: string;
  text: string;
  voice?: string;
}

export interface PodcastResult {
  episodeId: string;
  audioUrl: string;
  feedUrl: string;
  bytes: number;
}

/**
 * POSTs to `${baseUrl}/api/v1/podcastize` to stitch a multi-speaker
 * conversation into one episode. Unlike /audiotize, this returns JSON
 * (episode + RSS feed URLs), not raw audio bytes. `feedSlug` must already
 * exist as a feed on the service.
 */
export async function podcastizeConversation(
  baseUrl: string,
  apiKey: string,
  feedSlug: string,
  title: string,
  description: string,
  segments: PodcastSegment[]
): Promise<{ ok: boolean; result?: PodcastResult; error?: string }> {
  if (!baseUrl.trim()) return { ok: false, error: 'Enter the podcast base URL first.' };
  if (!apiKey.trim()) return { ok: false, error: 'Enter the API key first.' };
  if (!feedSlug.trim()) return { ok: false, error: 'Enter the feed slug first.' };
  if (segments.length === 0) return { ok: false, error: 'No messages to turn into a podcast episode.' };
  try {
    const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/podcastize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        feedSlug: feedSlug.trim(),
        title: title.trim() || 'Untitled Episode',
        description: description.trim() || undefined,
        segments,
      }),
    });
    if (!res.ok) return { ok: false, error: await readErrorMessage(res) };
    const result = (await res.json()) as PodcastResult;
    return { ok: true, result };
  } catch {
    return { ok: false, error: 'Network error — check the base URL and your connection.' };
  }
}
