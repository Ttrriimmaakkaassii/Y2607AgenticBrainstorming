// Cloudflare Pages Function — server-side web SEARCH gateway (discovery: a
// query in, a ranked list of candidate URLs/snippets out), via Tavily.
// Pairs with functions/api/research/browse.ts (Cloudflare Browser Rendering)
// which does the opposite job — full content of one already-known URL. The
// browser never talks to Tavily directly and never sees TAVILY_API_KEY.
// Self-contained (like functions/api/chat.ts) — this directory is
// deliberately excluded from the Next.js/tsconfig build, so it doesn't
// share type imports with lib/ (see lib/web-search.ts for the client-side
// copy of these shapes).

type PagesFunction<Env = unknown> = (context: {
  request: Request;
  env: Env;
}) => Response | Promise<Response>;

interface Env {
  TAVILY_API_KEY?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
}

export interface WebSearchRequestBody {
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

const MAX_QUERY_LENGTH = 500;
const MAX_RESULTS_CAP = 10;
const MAX_LIST_ITEMS = 10;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isStringArray(v: unknown, max: number): v is string[] {
  return Array.isArray(v) && v.length <= max && v.every((x) => typeof x === 'string');
}

function isValidDate(v: unknown): v is string | null {
  return v === null || v === undefined || (typeof v === 'string' && DATE_RE.test(v));
}

/** Pure validator, exported for unit tests — never trusts the client for anything beyond shape/bounds; the actual Tavily request is always constructed fresh server-side from these validated fields, never passed through. */
export function validateSearchRequest(body: unknown): WebSearchRequestBody | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Request body must be an object.' };
  const b = body as Record<string, unknown>;

  if (typeof b.query !== 'string' || !b.query.trim()) return { error: 'query is required.' };
  if (b.query.length > MAX_QUERY_LENGTH) return { error: `query must be at most ${MAX_QUERY_LENGTH} characters.` };

  if (b.maxResults !== undefined) {
    if (typeof b.maxResults !== 'number' || !Number.isInteger(b.maxResults) || b.maxResults < 1 || b.maxResults > MAX_RESULTS_CAP) {
      return { error: `maxResults must be an integer between 1 and ${MAX_RESULTS_CAP}.` };
    }
  }
  if (b.searchDepth !== undefined && b.searchDepth !== 'basic' && b.searchDepth !== 'advanced') {
    return { error: 'searchDepth must be "basic" or "advanced".' };
  }
  if (b.topic !== undefined && b.topic !== 'general' && b.topic !== 'news') {
    return { error: 'topic must be "general" or "news".' };
  }
  if (b.includeDomains !== undefined && !isStringArray(b.includeDomains, MAX_LIST_ITEMS)) {
    return { error: `includeDomains must be an array of at most ${MAX_LIST_ITEMS} strings.` };
  }
  if (b.excludeDomains !== undefined && !isStringArray(b.excludeDomains, MAX_LIST_ITEMS)) {
    return { error: `excludeDomains must be an array of at most ${MAX_LIST_ITEMS} strings.` };
  }
  if (!isValidDate(b.startDate)) return { error: 'startDate must be YYYY-MM-DD or null.' };
  if (!isValidDate(b.endDate)) return { error: 'endDate must be YYYY-MM-DD or null.' };

  return {
    query: b.query.trim(),
    maxResults: (b.maxResults as number | undefined) ?? 6,
    searchDepth: (b.searchDepth as 'basic' | 'advanced' | undefined) ?? 'advanced',
    topic: (b.topic as 'general' | 'news' | undefined) ?? 'general',
    includeDomains: (b.includeDomains as string[] | undefined) ?? [],
    excludeDomains: (b.excludeDomains as string[] | undefined) ?? [],
    startDate: (b.startDate as string | null | undefined) ?? null,
    endDate: (b.endDate as string | null | undefined) ?? null,
  };
}

/** Maps Tavily's own response shape into the shape we actually return to the model — never forwards Tavily's raw response as-is, exported for unit tests. */
export function normalizeTavilyResponse(query: string, data: any): WebSearchToolResult {
  const results: WebSearchResultItem[] = Array.isArray(data?.results)
    ? data.results.map((r: any) => ({
        title: typeof r?.title === 'string' ? r.title : '',
        url: typeof r?.url === 'string' ? r.url : '',
        snippet: typeof r?.content === 'string' ? r.content : '',
        rawContent: typeof r?.raw_content === 'string' ? r.raw_content : null,
        score: typeof r?.score === 'number' ? r.score : null,
        publishedDate: typeof r?.published_date === 'string' ? r.published_date : null,
      }))
    : [];
  return {
    ok: true,
    query,
    provider: 'tavily',
    searchedAt: new Date().toISOString(),
    results,
  };
}

function errorResult(query: string, code: WebSearchErrorCode, message: string, retryable: boolean): WebSearchToolResult {
  return {
    ok: false,
    query,
    provider: 'tavily',
    searchedAt: new Date().toISOString(),
    results: [],
    error: { code, message, retryable },
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Best-effort only — resets per isolate, not a real distributed rate limit (this project has no KV/Durable Objects provisioned). A soft speed bump, not a security boundary. */
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_PER_MINUTE = 20;

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_PER_MINUTE;
}

async function verifySupabaseSession(env: Env, request: Request): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ') || !env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }
  const token = authHeader.slice('Bearer '.length);
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: string };
    return user.id ?? null;
  } catch {
    return null;
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > 10_000) {
    return json(errorResult('', 'INVALID_REQUEST', 'Request body too large.', false), 413);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json(errorResult('', 'INVALID_REQUEST', 'Invalid JSON body.', false), 400);
  }

  const validated = validateSearchRequest(rawBody);
  if ('error' in validated) {
    return json(errorResult('', 'INVALID_REQUEST', validated.error, false), 400);
  }

  const userId = await verifySupabaseSession(env, request);
  if (!userId) {
    return json(errorResult(validated.query, 'UNAUTHORIZED', 'Sign in is required to use web search.', false), 401);
  }

  if (isRateLimited(userId)) {
    return json(errorResult(validated.query, 'RATE_LIMITED', 'Too many search requests — try again shortly.', true), 429);
  }

  if (!env.TAVILY_API_KEY) {
    // Honest "not configured yet" — never a fake empty success.
    return json(errorResult(validated.query, 'TOOL_UNAVAILABLE', 'Web search is not configured on this deployment.', false));
  }

  let providerStatus = 0;
  let resultCount = 0;
  let errorCode: string | null = null;
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.TAVILY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: validated.query,
        search_depth: validated.searchDepth,
        max_results: validated.maxResults,
        topic: validated.topic,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        include_domains: validated.includeDomains,
        exclude_domains: validated.excludeDomains,
        start_date: validated.startDate,
        end_date: validated.endDate,
        safe_search: true,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    providerStatus = res.status;

    if (!res.ok) {
      const message = await res.text();
      const code: WebSearchErrorCode =
        res.status === 401 ? 'UNAUTHORIZED' : res.status === 429 ? 'RATE_LIMITED' : 'SEARCH_PROVIDER_ERROR';
      errorCode = code;
      return json(errorResult(validated.query, code, message, res.status >= 500 || res.status === 429), res.status);
    }

    const data = await res.json();
    const normalized = normalizeTavilyResponse(validated.query, data);
    resultCount = normalized.results.length;
    return json(normalized);
  } catch (err) {
    errorCode = 'NETWORK_ERROR';
    const message = err instanceof Error ? err.message : 'Network error calling the search provider.';
    return json(errorResult(validated.query, 'NETWORK_ERROR', message, true), 502);
  } finally {
    // Structured log only — never the bearer token, the Tavily key, or full bodies.
    console.log(
      JSON.stringify({
        requestId,
        userId,
        queryTruncated: validated.query.slice(0, 80),
        provider: 'tavily',
        providerStatus,
        durationMs: Date.now() - startedAt,
        resultCount,
        errorCode,
        timestamp: new Date().toISOString(),
      })
    );
  }
};
