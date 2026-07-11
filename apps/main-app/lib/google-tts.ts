/**
 * Direct browser -> Gemini API text-to-speech calls, BYOK. Uses the same
 * Gemini Developer API key type (and host) as callGoogleDirect in
 * lib/llm-client.ts for the Gemini LLM connection — NOT the separate
 * Google Cloud Text-to-Speech REST API, which requires a different kind of
 * key (GCP Console + billing) and was the source of 401s when users pasted
 * their Gemini/AI Studio key into it.
 */

export interface GeminiTtsModel {
  id: string;
  label: string;
}

/** Ordered cheapest-first; UI defaults to the first entry. */
export const GEMINI_TTS_MODELS: GeminiTtsModel[] = [
  { id: 'gemini-2.5-flash-preview-tts', label: 'Gemini 2.5 Flash TTS (cheapest)' },
  { id: 'gemini-2.5-pro-preview-tts', label: 'Gemini 2.5 Pro TTS (higher quality)' },
  { id: 'gemini-3.1-flash-tts-preview', label: 'Gemini 3.1 Flash TTS (preview, streaming-capable)' },
];

export interface GoogleVoice {
  name: string;
  desc: string;
}

/** Fixed catalog of prebuilt voices — Gemini TTS doesn't expose a "list voices" endpoint. */
export const GEMINI_TTS_VOICES: GoogleVoice[] = [
  { name: 'Zephyr', desc: 'Bright' },
  { name: 'Puck', desc: 'Upbeat' },
  { name: 'Charon', desc: 'Informative' },
  { name: 'Kore', desc: 'Firm' },
  { name: 'Fenrir', desc: 'Excitable' },
  { name: 'Leda', desc: 'Youthful' },
  { name: 'Orus', desc: 'Firm' },
  { name: 'Aoede', desc: 'Breezy' },
  { name: 'Callirrhoe', desc: 'Easy-going' },
  { name: 'Autonoe', desc: 'Bright' },
  { name: 'Enceladus', desc: 'Breathy' },
  { name: 'Iapetus', desc: 'Clear' },
  { name: 'Umbriel', desc: 'Easy-going' },
  { name: 'Algieba', desc: 'Smooth' },
  { name: 'Despina', desc: 'Smooth' },
  { name: 'Erinome', desc: 'Clear' },
  { name: 'Algenib', desc: 'Gravelly' },
  { name: 'Rasalgethi', desc: 'Informative' },
  { name: 'Laomedeia', desc: 'Upbeat' },
  { name: 'Achernar', desc: 'Soft' },
  { name: 'Alnilam', desc: 'Firm' },
  { name: 'Schedar', desc: 'Even' },
  { name: 'Gacrux', desc: 'Mature' },
  { name: 'Pulcherrima', desc: 'Forward' },
  { name: 'Achird', desc: 'Friendly' },
  { name: 'Zubenelgenubi', desc: 'Casual' },
  { name: 'Vindemiatrix', desc: 'Gentle' },
  { name: 'Sadachbia', desc: 'Lively' },
  { name: 'Sadaltager', desc: 'Knowledgeable' },
  { name: 'Sulafat', desc: 'Warm' },
];

/** Cheap metadata call (no generation cost) used to verify a key actually works. */
export async function validateGeminiKey(apiKey: string): Promise<{ ok: boolean; errorStatus: number | null }> {
  if (!apiKey) return { ok: false, errorStatus: null };
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    return { ok: res.ok, errorStatus: res.ok ? null : res.status };
  } catch {
    return { ok: false, errorStatus: null };
  }
}

/** Human-readable explanation for a Gemini API error status, for toasts. */
export function describeGoogleTtsError(status: number): string {
  if (status === 401 || status === 403) {
    return 'Gemini rejected this key (401/403). Double-check it was copied correctly from Google AI Studio, and that it has not been revoked.';
  }
  if (status === 429) return 'Gemini API quota exceeded for this key — try again later.';
  return `Gemini TTS request failed (HTTP ${status}).`;
}

/** Wraps raw 16-bit PCM (as Gemini returns it) in a minimal WAV container so it can play via <audio>/new Audio(). */
function pcmToWavDataUrl(base64Pcm: string, sampleRate: number): string {
  const pcmBytes = atob(base64Pcm);
  const pcmLength = pcmBytes.length;
  const buffer = new ArrayBuffer(44 + pcmLength);
  const view = new DataView(buffer);

  function writeString(offset: number, s: string) {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate (16-bit mono)
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, pcmLength, true);
  for (let i = 0; i < pcmLength; i++) view.setUint8(44 + i, pcmBytes.charCodeAt(i));

  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/**
 * Turns the app's 0.5-2 numeric speed slider into a natural-language pace
 * tag, since Gemini TTS controls pace via prompt instructions rather than a
 * numeric parameter. Gemini strips bracket tags from the spoken output.
 */
function paceTag(rate: number): string {
  if (rate <= 0.75) return '[very slow] ';
  if (rate <= 0.9) return '[slowly] ';
  if (rate >= 1.35) return '[very fast] ';
  if (rate >= 1.1) return '[quickly] ';
  return '';
}

async function synthesizeGoogleAudioOnce(
  apiKey: string,
  text: string,
  voiceName: string,
  model: string,
  rate: number
): Promise<{ audioUrl: string | null; status: number | null }> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${paceTag(rate)}${text}` }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
          },
        }),
      }
    );
    if (!res.ok) return { audioUrl: null, status: res.status };
    const data = await res.json();
    const part = data.candidates?.[0]?.content?.parts?.[0];
    const audioData: string | undefined = part?.inlineData?.data;
    if (!audioData) return { audioUrl: null, status: null };
    // Gemini returns raw 16-bit PCM at 24kHz (audio/L16;rate=24000), not a
    // ready-made container format, so it must be wrapped before <audio> can play it.
    const mimeType: string = part?.inlineData?.mimeType ?? 'audio/L16;rate=24000';
    const rateMatch = /rate=(\d+)/.exec(mimeType);
    const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
    return { audioUrl: pcmToWavDataUrl(audioData, sampleRate), status: null };
  } catch {
    return { audioUrl: null, status: null };
  }
}

/**
 * Synthesizes `text` and returns a data: URL playable via `new Audio(url)`,
 * or null on any failure (bad key, quota exceeded, network error) — callers
 * must treat null as "fall back to the free browser voice for this line."
 *
 * Retries on HTTP 500: Google's own docs note the preview TTS models
 * "occasionally return text tokens instead of audio tokens, causing the
 * server to fail the request with a 500 error... in a very small
 * percentage of requests" and explicitly recommend automated retries.
 */
export async function synthesizeGoogleAudio(
  apiKey: string,
  text: string,
  voiceName: string,
  model: string,
  rate: number,
  maxRetries = 2
): Promise<string | null> {
  if (!apiKey) return null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { audioUrl, status } = await synthesizeGoogleAudioOnce(apiKey, text, voiceName, model, rate);
    if (audioUrl) return audioUrl;
    if (status !== 500 || attempt === maxRetries) return null;
    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
  }
  return null;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Deterministically assigns a Gemini TTS voice per agent, mirroring
 * pickVoiceForAgent in lib/voice-picker.ts — same agent always gets the
 * same voice, different agents tend to get different ones. Honors an
 * explicit per-agent override if set.
 */
export function pickGoogleVoiceForAgent(agentId: string, preferredVoiceName: string | null | undefined): string {
  if (preferredVoiceName && GEMINI_TTS_VOICES.some((v) => v.name === preferredVoiceName)) {
    return preferredVoiceName;
  }
  const hash = hashString(agentId);
  return GEMINI_TTS_VOICES[hash % GEMINI_TTS_VOICES.length].name;
}
