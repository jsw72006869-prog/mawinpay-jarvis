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
      // GET: 상태 조회, 히스토리, 또는 범용 API 전달
      const endpoint = req.query.endpoint as string || 'status';
      
      // 쿼리 파라미터를 서버로 그대로 전달 (endpoint 제외)
      const queryParams = new URLSearchParams();
      for (const [key, value] of Object.entries(req.query)) {
        if (key !== 'endpoint' && value) {
          queryParams.set(key, String(value));
        }
      }
      const qs = queryParams.toString();
      const url = `${CLOUD_SERVER}/api/${endpoint}${qs ? `?${qs}` : ''}`;
      
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000)
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: `Cloud server returned ${response.status}` });
      }
      
      const data = await response.json();
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      // POST: 작업 실행 또는 범용 API 전달
      const { endpoint, taskType, params, ...rest } = req.body;
      const url = `${CLOUD_SERVER}/api/${endpoint || 'task'}`;
      
      // taskType이 있으면 task 형식, 없으면 body 그대로 전달
      const body = taskType 
        ? JSON.stringify({ taskType, params })
        : JSON.stringify({ ...params, ...rest });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(55000)
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
