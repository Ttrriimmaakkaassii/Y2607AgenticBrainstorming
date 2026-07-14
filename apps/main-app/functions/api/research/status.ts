// Cloudflare Pages Function — reports which web-access backends are
// configured on this deployment (secrets present?), WITHOUT exposing any
// values. Intentionally public (no auth): a status check is most useful
// when diagnosing "why isn't it working," which is often before/without a
// signed-in session. Only booleans ever leave this endpoint — never a key,
// token, or account id, whole or partial.
//
// Self-contained like the other functions/api/research/*.ts files — this
// directory is excluded from the Next.js/tsconfig build.

type PagesFunction<Env = unknown> = (context: {
  request: Request;
  env: Env;
}) => Response | Promise<Response>;

interface Env {
  TAVILY_API_KEY?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
}

export interface WebAccessStatus {
  // Tavily (the web_search discovery tool) — needs just the one key.
  searchConfigured: boolean;
  // Cloudflare Browser Rendering (the browse_url scrape tool) — needs BOTH
  // the API token and the account id, since the REST URL embeds the account
  // id and the token authorizes it.
  browseConfigured: boolean;
  // Whether Supabase auth is set up at all on this deployment. Even with
  // both backends configured, web access is unusable without it — the
  // endpoints 401 (and the tool degrades to TOOL_UNAVAILABLE) without a
  // valid signed-in session.
  authConfigured: boolean;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const status: WebAccessStatus = {
    searchConfigured: !!env.TAVILY_API_KEY,
    browseConfigured: !!(env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID),
    authConfigured: !!(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };
  return new Response(JSON.stringify(status), {
    headers: {
      'Content-Type': 'application/json',
      // Status is deployment config that only changes on redeploy — cache
      // it briefly so repeated Settings-modal opens don't each hit the
      // Function.
      'Cache-Control': 'public, max-age=30',
    },
  });
};
