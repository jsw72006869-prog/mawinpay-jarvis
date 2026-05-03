import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * GPT Chat Completions 프록시
 * 프론트엔드에서 직접 OpenAI API를 호출하면 API 키가 노출되므로,
 * 서버 측 환경변수(OPENAI_API_KEY)를 사용하여 안전하게 프록시합니다.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
  }

  try {
    const { model, messages, tools, tool_choice, max_tokens, temperature } = req.body;

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4.1-mini',
        messages,
        tools,
        tool_choice,
        max_tokens: max_tokens || 800,
        temperature: temperature ?? 0.72,
      }),
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      console.error('[chat-proxy] OpenAI error:', openaiRes.status, JSON.stringify(data).substring(0, 200));
      return res.status(openaiRes.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error: any) {
    console.error('[chat-proxy] Error:', error.message);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
