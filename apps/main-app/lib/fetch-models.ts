import { LLMProvider } from './types';
import { getProvider } from './llm-catalog';

/**
 * Fetches the list of model IDs a given API key can actually access, from
 * the provider's own /models endpoint. This is the authoritative source —
 * the hardcoded catalog in llm-catalog.ts is only a best-effort starting
 * point, and model IDs change over time. Returns [] on any failure (no key,
 * bad key, network, CORS, unexpected shape) so callers can silently fall
 * back to the catalog without crashing.
 *
 * All of these are direct browser→provider fetches (same as the chat calls
 * in lib/llm-client.ts), so they're subject to each provider's CORS policy.
 * Most allow it for /models; if one doesn't, the empty fallback kicks in.
 */
export async function fetchProviderModels(
  providerId: LLMProvider,
  apiKey: string
): Promise<string[]> {
  const provider = getProvider(providerId);
  const trimmedKey = apiKey.trim();
  if (!provider || !trimmedKey) return [];
  try {
    let res: Response;
    if (providerId === 'google') {
      res = await fetch(`${provider.modelsEndpoint}?key=${encodeURIComponent(trimmedKey)}`, {
        headers: { 'Content-Type': 'application/json' },
      });
    } else if (providerId === 'anthropic') {
      res = await fetch(provider.modelsEndpoint, {
        headers: {
          'x-api-key': trimmedKey,
          'anthropic-version': '2023-06-01',
        },
      });
    } else {
      // OpenAI-compatible shape: Bearer auth, { data: [{ id }] }.
      res = await fetch(provider.modelsEndpoint, {
        headers: { Authorization: `Bearer ${trimmedKey}` },
      });
    }
    if (!res.ok) return [];
    const data = await res.json();

    if (providerId === 'google') {
      // Google: { models: [{ name: "models/gemini-...", supportedGenerationMethods: [...] }] }
      const models = Array.isArray(data?.models) ? data.models : [];
      return models
        .filter(
          (m: any) =>
            Array.isArray(m?.supportedGenerationMethods) &&
            m.supportedGenerationMethods.includes('generateContent')
        )
        .map((m: any) => (typeof m?.name === 'string' ? m.name.replace(/^models\//, '') : ''))
        .filter((id: string) => id.length > 0);
    }

    // OpenAI-compatible + Anthropic both return { data: [{ id }] }.
    const list = Array.isArray(data?.data) ? data.data : [];
    return list
      .map((m: any) => (typeof m?.id === 'string' ? m.id : ''))
      .filter((id: string) => id.length > 0);
  } catch {
    return [];
  }
}
