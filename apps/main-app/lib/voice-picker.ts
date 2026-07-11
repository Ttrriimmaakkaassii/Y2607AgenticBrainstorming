/**
 * Assigns each agent a distinct, reasonably natural-sounding
 * SpeechSynthesisVoice for read-aloud mode. The Web Speech API only exposes
 * whatever voices the OS/browser ships — this can't add new voices, but it
 * can (a) prefer better-sounding ones by name heuristics and (b) make sure
 * different agents don't all sound identical when multiple voices exist.
 */

const QUALITY_HINTS = [
  'neural',
  'natural',
  'enhanced',
  'premium',
  'online',
  'wavenet',
  'studio',
  'google',
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function voiceQualityScore(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase();
  let score = 0;
  if (QUALITY_HINTS.some((hint) => n.includes(hint))) score += 10;
  if (!v.localService) score += 2;
  return score;
}

export interface VoiceAssignment {
  voice: SpeechSynthesisVoice | undefined;
  pitch: number;
  rate: number;
}

/**
 * Picks a voice for `agentId` speaking in `lang`, honoring an explicit
 * per-agent override (`preferredVoiceURI`) if it's still available. When no
 * override is set, deterministically hashes the agent id into a pool of the
 * best-scoring voices for that language so the same agent always gets the
 * same voice, and different agents tend to get different ones.
 */
export function pickVoiceForAgent(
  agentId: string,
  preferredVoiceURI: string | null | undefined,
  lang: string,
  baseRate: number
): VoiceAssignment {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return { voice: undefined, pitch: 1, rate: baseRate };
  }
  const voices = window.speechSynthesis.getVoices();
  if (preferredVoiceURI) {
    const explicit = voices.find((v) => v.voiceURI === preferredVoiceURI);
    if (explicit) return { voice: explicit, pitch: 1, rate: baseRate };
  }

  const langPrefix = lang.split('-')[0];
  let candidates = voices.filter((v) => v.lang === lang);
  if (candidates.length === 0) candidates = voices.filter((v) => v.lang.startsWith(langPrefix));
  if (candidates.length === 0) candidates = voices;
  if (candidates.length === 0) return { voice: undefined, pitch: 1, rate: baseRate };

  candidates = [...candidates].sort((a, b) => voiceQualityScore(b) - voiceQualityScore(a));
  const hash = hashString(agentId);

  // Bias toward the top-scoring half so a bad hash doesn't land an agent on
  // a low-quality voice when better ones exist for that language.
  const pool = candidates.slice(0, Math.max(1, Math.ceil(candidates.length / 2)));
  const voice = pool[hash % pool.length];

  // With only one usable voice for the language, agents would otherwise be
  // indistinguishable — vary pitch/rate slightly per agent as a fallback.
  const single = candidates.length === 1;
  const pitch = single ? 0.85 + (hash % 5) * 0.08 : 1;
  const rate = single ? baseRate * (0.92 + ((hash >> 3) % 5) * 0.04) : baseRate;

  return { voice, pitch, rate };
}
