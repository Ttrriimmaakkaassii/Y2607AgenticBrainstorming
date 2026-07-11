/**
 * Direct browser -> Google Cloud Text-to-Speech calls, BYOK (same shape as
 * callGoogleDirect in lib/llm-client.ts for Gemini). No server component —
 * the user's own API key never leaves the browser except to Google's API.
 */

export interface GoogleVoice {
  name: string;
  ssmlGender: string;
}

// Cache key includes the API key itself — keying by languageCode alone
// would keep serving voices fetched under a previous key after the user
// changes it, since the same languageCode would hit as "cached".
const voicesCache = new Map<string, GoogleVoice[]>();

export interface GoogleVoicesResult {
  voices: GoogleVoice[];
  /** HTTP status if the request reached Google but was rejected (e.g. 401/403 = bad key or API not enabled). Null on success or network failure. */
  errorStatus: number | null;
}

export async function fetchGoogleVoicesDetailed(
  apiKey: string,
  languageCode: string
): Promise<GoogleVoicesResult> {
  if (!apiKey) return { voices: [], errorStatus: null };
  const cacheKey = `${apiKey}:${languageCode}`;
  const cached = voicesCache.get(cacheKey);
  if (cached) return { voices: cached, errorStatus: null };
  try {
    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/voices?languageCode=${encodeURIComponent(languageCode)}&key=${apiKey}`
    );
    if (!res.ok) return { voices: [], errorStatus: res.status };
    const data = await res.json();
    const voices: GoogleVoice[] = (data.voices ?? []).map((v: any) => ({
      name: v.name,
      ssmlGender: v.ssmlGender,
    }));
    voicesCache.set(cacheKey, voices);
    return { voices, errorStatus: null };
  } catch {
    return { voices: [], errorStatus: null };
  }
}

export async function fetchGoogleVoices(apiKey: string, languageCode: string): Promise<GoogleVoice[]> {
  return (await fetchGoogleVoicesDetailed(apiKey, languageCode)).voices;
}

/** Human-readable explanation for a Google TTS HTTP error status, for toasts. */
export function describeGoogleTtsError(status: number): string {
  if (status === 401 || status === 403) {
    return 'Google rejected this key (401/403). Make sure it\'s a Google Cloud Console API key (not an AI Studio/Gemini key) with the "Cloud Text-to-Speech API" enabled and billing active on that project.';
  }
  if (status === 429) return 'Google TTS quota exceeded for this key — try again later.';
  return `Google TTS request failed (HTTP ${status}).`;
}

/**
 * Synthesizes `text` and returns a data: URL playable via `new Audio(url)`,
 * or null on any failure (bad key, quota exceeded, network error) — callers
 * must treat null as "fall back to the free browser voice for this line."
 */
export async function synthesizeGoogleAudio(
  apiKey: string,
  text: string,
  languageCode: string,
  voiceName: string,
  rate: number
): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode, name: voiceName },
        audioConfig: { audioEncoding: 'MP3', speakingRate: rate },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.audioContent) return null;
    return `data:audio/mp3;base64,${data.audioContent}`;
  } catch {
    return null;
  }
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Deterministically assigns a Google voice per agent, mirroring
 * pickVoiceForAgent in lib/voice-picker.ts — same agent always gets the
 * same voice, different agents tend to get different ones. Honors an
 * explicit per-agent override if it's still present in the fetched list.
 */
export function pickGoogleVoiceForAgent(
  agentId: string,
  preferredVoiceName: string | null | undefined,
  voices: GoogleVoice[]
): string | null {
  if (preferredVoiceName && voices.some((v) => v.name === preferredVoiceName)) {
    return preferredVoiceName;
  }
  if (voices.length === 0) return null;
  const hash = hashString(agentId);
  return voices[hash % voices.length].name;
}
