// Client-side caller for the /api/research/browse Cloudflare Pages Function
// (functions/api/research/browse.ts). This file keeps its own copy of the
// shared shapes rather than importing from functions/ — that directory is
// deliberately excluded from the Next.js/tsconfig build (see
// functions/api/chat.ts, which does the same thing), so the two are kept in
// sync by hand, same as every other client/Function boundary in this repo.

export interface BrowseArgs {
  url: string;
}

export type BrowseErrorCode =
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'BROWSE_PROVIDER_ERROR'
  | 'NETWORK_ERROR'
  | 'TOOL_UNAVAILABLE';

export interface BrowseToolResult {
  ok: boolean;
  url: string;
  provider: 'cloudflare-browser-rendering';
  browsedAt: string;
  content: string;
  error?: {
    code: BrowseErrorCode;
    message: string;
    retryable: boolean;
  };
}

function unavailable(url: string, message: string): BrowseToolResult {
  return {
    ok: false,
    url,
    provider: 'cloudflare-browser-rendering',
    browsedAt: new Date().toISOString(),
    content: '',
    error: { code: 'TOOL_UNAVAILABLE', message, retryable: false },
  };
}

/**
 * Calls the server-side browse gateway — the browser never talks to
 * Cloudflare's API directly and never sees CLOUDFLARE_API_TOKEN.
 * `accessToken` is the current Supabase session's access token (null if no
 * auth is configured for this deployment, in which case the endpoint 401s
 * and this degrades gracefully to TOOL_UNAVAILABLE rather than throwing).
 */
export async function callBrowseUrlTool(
  args: BrowseArgs,
  accessToken: string | null
): Promise<BrowseToolResult> {
  if (!accessToken) {
    return unavailable(args.url, 'Browsing requires sign-in, which is not active for this session.');
  }
  try {
    const res = await fetch('/api/research/browse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(args),
    });
    const data = (await res.json()) as BrowseToolResult;
    return data;
  } catch (err) {
    return {
      ok: false,
      url: args.url,
      provider: 'cloudflare-browser-rendering',
      browsedAt: new Date().toISOString(),
      content: '',
      error: {
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Network error calling browse.',
        retryable: true,
      },
    };
  }
}
