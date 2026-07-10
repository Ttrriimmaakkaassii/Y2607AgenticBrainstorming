type PagesFunction<Env = unknown> = (context: {
  request: Request;
  env: Env;
}) => Response | Promise<Response>;

interface Env {
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  ZHIPU_API_KEY?: string;
  MOONSHOT_API_KEY?: string;
  XAI_API_KEY?: string;
  MISTRAL_API_KEY?: string;
}

type Provider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'zhipu'
  | 'moonshot'
  | 'xai'
  | 'mistral';

interface ChatRequestBody {
  provider: Provider;
  model?: string;
  systemPrompt: string;
  userPrompt: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const OPENAI_COMPATIBLE: Record<
  Exclude<Provider, 'anthropic' | 'google'>,
  { endpoint: string; envKey: keyof Env; defaultModel: string }
> = {
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    envKey: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini',
  },
  deepseek: {
    endpoint: 'https://api.deepseek.com/chat/completions',
    envKey: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
  },
  zhipu: {
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    envKey: 'ZHIPU_API_KEY',
    defaultModel: 'glm-4.6',
  },
  moonshot: {
    endpoint: 'https://api.moonshot.cn/v1/chat/completions',
    envKey: 'MOONSHOT_API_KEY',
    defaultModel: 'moonshot-v1-32k',
  },
  xai: {
    endpoint: 'https://api.x.ai/v1/chat/completions',
    envKey: 'XAI_API_KEY',
    defaultModel: 'grok-4',
  },
  mistral: {
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    envKey: 'MISTRAL_API_KEY',
    defaultModel: 'mistral-small-latest',
  },
};

async function callOpenAICompatible(
  env: Env,
  body: ChatRequestBody,
  config: { endpoint: string; envKey: keyof Env; defaultModel: string }
): Promise<Response> {
  const apiKey = env[config.envKey];
  if (!apiKey) return json({ error: 'not_configured' });

  const res = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: body.model || config.defaultModel,
      messages: [
        { role: 'system', content: body.systemPrompt },
        { role: 'user', content: body.userPrompt },
      ],
      max_tokens: 300,
    }),
  });

  if (!res.ok) return json({ error: await res.text() }, 502);
  const data = (await res.json()) as any;
  return json({ content: data.choices?.[0]?.message?.content ?? '' });
}

async function callAnthropic(env: Env, body: ChatRequestBody): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'not_configured' });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: body.model || 'claude-sonnet-5',
      max_tokens: 300,
      system: body.systemPrompt,
      messages: [{ role: 'user', content: body.userPrompt }],
    }),
  });

  if (!res.ok) return json({ error: await res.text() }, 502);
  const data = (await res.json()) as any;
  return json({ content: data.content?.[0]?.text ?? '' });
}

async function callGoogle(env: Env, body: ChatRequestBody): Promise<Response> {
  if (!env.GOOGLE_API_KEY) return json({ error: 'not_configured' });

  const model = body.model || 'gemini-1.5-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: `${body.systemPrompt}\n\n${body.userPrompt}` }] },
        ],
      }),
    }
  );

  if (!res.ok) return json({ error: await res.text() }, 502);
  const data = (await res.json()) as any;
  return json({ content: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '' });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: ChatRequestBody;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  if (body.provider === 'anthropic') return callAnthropic(context.env, body);
  if (body.provider === 'google') return callGoogle(context.env, body);
  if (body.provider in OPENAI_COMPATIBLE) {
    return callOpenAICompatible(
      context.env,
      body,
      OPENAI_COMPATIBLE[body.provider as keyof typeof OPENAI_COMPATIBLE]
    );
  }
  return json({ error: 'unknown_provider' }, 400);
};
