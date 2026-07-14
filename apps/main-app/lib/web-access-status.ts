// Client-side fetcher for /api/research/status — see functions/api/research/
// status.ts. Reports which web-access backends are configured (presence
// only, never values).

export interface WebAccessStatus {
  searchConfigured: boolean;
  browseConfigured: boolean;
  authConfigured: boolean;
}

/** Returns null if the status endpoint itself is unreachable (e.g. running in `next dev` with no Functions mounted, or a network error) — callers treat null as "unknown" rather than failing. */
export async function fetchWebAccessStatus(): Promise<WebAccessStatus | null> {
  try {
    const res = await fetch('/api/research/status');
    if (!res.ok) return null;
    return (await res.json()) as WebAccessStatus;
  } catch {
    return null;
  }
}
