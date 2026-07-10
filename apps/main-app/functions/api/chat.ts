type PagesFunction<Env = unknown> = (context: {
  request: Request;
  env: Env;
}) => Response | Promise<Response>;

interface Env {
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_API_KEY?: string;
}

interface ChatRequestBody {
  provider: 'openai' | 'anthropic' | 'google';
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

async function callOpenAI(env: Env, body: ChatRequestBody): Promise<Response> {
  if (!env.OPENAI_API_KEY) return json({ error: 'not_configured' });

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: body.model || 'gpt-4o-mini',
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

  switch (body.provider) {
    case 'openai':
      return callOpenAI(context.env, body);
    case 'anthropic':
      return callAnthropic(context.env, body);
    case 'google':
      return callGoogle(context.env, body);
    default:
      return json({ error: 'unknown_provider' }, 400);
  }
};
