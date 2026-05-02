import type { VercelRequest, VercelResponse } from '@vercel/node';

const CLOUD_SERVER = process.env.CLOUD_SERVER_URL || 'http://35.243.215.119:3001';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      // GET: 상태 조회 또는 히스토리 조회
      const endpoint = req.query.endpoint as string || 'status';
      const url = `${CLOUD_SERVER}/api/${endpoint}`;
      
      const response = await fetch(url, {
        signal: AbortSignal.timeout(8000)
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: `Cloud server returned ${response.status}` });
      }
      
      const data = await response.json();
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      // POST: 작업 실행
      const { endpoint, taskType, params } = req.body;
      const url = `${CLOUD_SERVER}/api/${endpoint || 'task'}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskType, params }),
        signal: AbortSignal.timeout(30000)
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: `Cloud server returned ${response.status}` });
      }
      
      const data = await response.json();
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[cloud-proxy] Error:', error.message);
    return res.status(503).json({ 
      error: 'Cloud server unavailable',
      message: error.message 
    });
  }
}
