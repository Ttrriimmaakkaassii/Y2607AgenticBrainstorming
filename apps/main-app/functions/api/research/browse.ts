// Cloudflare Pages Function — server-side "browse a URL" gateway for agents
// with webSearchEnabled, backed by Cloudflare Browser Rendering's /markdown
// Quick Action (renders the page with a real headless browser and returns
// clean markdown) instead of a third-party search API. There is no search-
// by-query endpoint in Browser Rendering — only fetch/render a URL you
// already have — so this is "browse this specific page", not "search the
// web for X". The browser never talks to Cloudflare's API directly and
// never sees CLOUDFLARE_API_TOKEN. Self-contained (like functions/api/
// chat.ts) — this directory is deliberately excluded from the Next.js/
// tsconfig build, so it doesn't share type imports with lib/ (see
// lib/web-browse.ts for the client-side copy of these shapes).

type PagesFunction<Env = unknown> = (context: {
  request: Request;
  env: Env;
}) => Response | Promise<Response>;

interface Env {
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
}

export interface BrowseRequestBody {
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
  /** Markdown extracted from the rendered page, truncated to a bounded length so one browse can't blow out an agent's context window. */
  content: string;
  error?: {
    code: BrowseErrorCode;
    message: string;
    retryable: boolean;
  };
}

const MAX_URL_LENGTH = 2000;
// Generous but bounded — a full page's markdown can be huge; this keeps a
// single tool result from dominating the conversation's token budget.
const MAX_CONTENT_LENGTH = 8000;

/** Pure validator, exported for unit tests. Only ever accepts a URL — never raw HTML to render, which the /markdown endpoint also supports but that's for rendering arbitrary content, not fetching a page. */
export function validateBrowseRequest(body: unknown): BrowseRequestBody | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Request body must be an object.' };
  const b = body as Record<string, unknown>;

  if (typeof b.url !== 'string' || !b.url.trim()) return { error: 'url is required.' };
  const trimmed = b.url.trim();
  if (trimmed.length > MAX_URL_LENGTH) return { error: `url must be at most ${MAX_URL_LENGTH} characters.` };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: 'url must be a valid, fully-formed URL (including https://).' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: 'url must use http or https.' };
  }

  return { url: parsed.toString() };
}

/** Truncates and never forwards Cloudflare's raw API response shape as-is — exported for unit tests. */
export function normalizeBrowseResponse(url: string, data: any): BrowseToolResult {
  const raw = typeof data?.result === 'string' ? data.result : '';
  const content = raw.length > MAX_CONTENT_LENGTH ? `${raw.slice(0, MAX_CONTENT_LENGTH)}\n\n[...truncated]` : raw;
  return {
    ok: true,
    url,
    provider: 'cloudflare-browser-rendering',
    browsedAt: new Date().toISOString(),
    content,
  };
}

function errorResult(url: string, code: BrowseErrorCode, message: string, retryable: boolean): BrowseToolResult {
  return {
    ok: false,
    url,
    provider: 'cloudflare-browser-rendering',
    browsedAt: new Date().toISOString(),
    content: '',
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
  if (contentLength > 5_000) {
    return json(errorResult('', 'INVALID_REQUEST', 'Request body too large.', false), 413);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json(errorResult('', 'INVALID_REQUEST', 'Invalid JSON body.', false), 400);
  }

  const validated = validateBrowseRequest(rawBody);
  if ('error' in validated) {
    return json(errorResult('', 'INVALID_REQUEST', validated.error, false), 400);
  }

  const userId = await verifySupabaseSession(env, request);
  if (!userId) {
    return json(errorResult(validated.url, 'UNAUTHORIZED', 'Sign in is required to use browse.', false), 401);
  }

  if (isRateLimited(userId)) {
    return json(errorResult(validated.url, 'RATE_LIMITED', 'Too many browse requests — try again shortly.', true), 429);
  }

  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
    // Honest "not configured yet" — never a fake empty success.
    return json(errorResult(validated.url, 'TOOL_UNAVAILABLE', 'Browsing is not configured on this deployment.', false));
  }

  let providerStatus = 0;
  let contentLengthResult = 0;
  let errorCode: string | null = null;
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/browser-rendering/markdown`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: validated.url }),
        signal: AbortSignal.timeout(20_000),
      }
    );
    providerStatus = res.status;

    if (!res.ok) {
      const message = await res.text();
      const code: BrowseErrorCode =
        res.status === 401 || res.status === 403
          ? 'UNAUTHORIZED'
          : res.status === 429
          ? 'RATE_LIMITED'
          : 'BROWSE_PROVIDER_ERROR';
      errorCode = code;
      return json(errorResult(validated.url, code, message, res.status >= 500 || res.status === 429), res.status);
    }

    const data = await res.json();
    if (!data?.success) {
      const message = Array.isArray(data?.errors) ? data.errors.map((e: any) => e.message).join('; ') : 'Browser Rendering reported failure.';
      errorCode = 'BROWSE_PROVIDER_ERROR';
      return json(errorResult(validated.url, 'BROWSE_PROVIDER_ERROR', message, true), 502);
    }

    const normalized = normalizeBrowseResponse(validated.url, data);
    contentLengthResult = normalized.content.length;
    return json(normalized);
  } catch (err) {
    errorCode = 'NETWORK_ERROR';
    const message = err instanceof Error ? err.message : 'Network error calling Browser Rendering.';
    return json(errorResult(validated.url, 'NETWORK_ERROR', message, true), 502);
  } finally {
    // Structured log only — never the bearer token, the Cloudflare API
    // token, or full bodies.
    console.log(
      JSON.stringify({
        requestId,
        userId,
        url: validated.url,
        provider: 'cloudflare-browser-rendering',
        providerStatus,
        durationMs: Date.now() - startedAt,
        contentLength: contentLengthResult,
        errorCode,
        timestamp: new Date().toISOString(),
      })
    );
  }
};
