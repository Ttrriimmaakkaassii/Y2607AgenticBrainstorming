// Client-side caller for the /api/research/search Cloudflare Pages Function
// (functions/api/research/search.ts). This file keeps its own copy of the
// shared shapes rather than importing from functions/ — that directory is
// deliberately excluded from the Next.js/tsconfig build (see
// functions/api/chat.ts, which does the same thing), so the two are kept in
// sync by hand, same as every other client/Function boundary in this repo.

export interface WebSearchArgs {
  query: string;
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  topic?: 'general' | 'news';
  includeDomains?: string[];
  excludeDomains?: string[];
  startDate?: string | null;
  endDate?: string | null;
}

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
  rawContent: string | null;
  score: number | null;
  publishedDate: string | null;
}

export type WebSearchErrorCode =
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'SEARCH_PROVIDER_ERROR'
  | 'NETWORK_ERROR'
  | 'TOOL_UNAVAILABLE';

export interface WebSearchToolResult {
  ok: boolean;
  query: string;
  provider: 'tavily';
  searchedAt: string;
  results: WebSearchResultItem[];
  error?: {
    code: WebSearchErrorCode;
    message: string;
    retryable: boolean;
  };
}

function unavailable(query: string, message: string): WebSearchToolResult {
  return {
    ok: false,
    query,
    provider: 'tavily',
    searchedAt: new Date().toISOString(),
    results: [],
    error: { code: 'TOOL_UNAVAILABLE', message, retryable: false },
  };
}

/**
 * Calls the server-side search gateway — the browser never talks to Tavily
 * directly and never sees the Tavily API key. `accessToken` is the current
 * Supabase session's access token (null if no auth is configured for this
 * deployment, in which case the endpoint 401s and this degrades gracefully
 * to TOOL_UNAVAILABLE rather than throwing).
 */
export async function callWebSearchTool(
  args: WebSearchArgs,
  accessToken: string | null
): Promise<WebSearchToolResult> {
  if (!accessToken) {
    return unavailable(args.query, 'Web search requires sign-in, which is not active for this session.');
  }
  try {
    const res = await fetch('/api/research/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(args),
    });
    const data = (await res.json()) as WebSearchToolResult;
    return data;
  } catch (err) {
    return {
      ok: false,
      query: args.query,
      provider: 'tavily',
      searchedAt: new Date().toISOString(),
      results: [],
      error: {
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Network error calling web search.',
        retryable: true,
      },
    };
  }
}
