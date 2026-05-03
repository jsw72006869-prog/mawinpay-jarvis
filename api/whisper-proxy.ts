import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  api: {
    bodyParser: false, // multipart/form-data를 직접 처리
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 서버 측 환경변수에서 API 키 가져오기 (VITE_ 프론트엔드 키에 의존하지 않음)
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[whisper-proxy] OPENAI_API_KEY 환경변수 없음');
    return res.status(500).json({ error: 'Server configuration error: OPENAI_API_KEY not set' });
  }

  try {
    // raw body 수집
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const body = Buffer.concat(chunks);

    // Content-Type 헤더 그대로 전달 (boundary 포함)
    const contentType = req.headers['content-type'] || '';

    // OpenAI Whisper API로 프록시 (서버 측 API 키만 사용)
    const openaiRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': contentType,
      },
      body: body,
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      console.error('[whisper-proxy] OpenAI error:', openaiRes.status, JSON.stringify(data));
      return res.status(openaiRes.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error: any) {
    console.error('[whisper-proxy] Error:', error.message);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
