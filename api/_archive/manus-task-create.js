// api/manus-task-create.js — Manus API v2: 태스크 생성 (Vercel Serverless Function)
// 자비스가 Manus에게 복잡한 미션을 위임할 때 사용

export default async function handler(req, res) {
  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.MANUS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ 
      success: false, 
      error: 'MANUS_API_KEY가 설정되지 않았습니다. Vercel 환경변수에 추가해주세요.' 
    });
  }

  try {
    const { prompt, connectors, enable_skills, force_skills } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ success: false, error: '미션 내용(prompt)이 필요합니다.' });
    }

    // Manus API v2 - task.create
    const body = {
      message: {
        content: prompt,
      },
    };

    // 선택적 파라미터 추가
    if (connectors && Array.isArray(connectors)) {
      body.message.connectors = connectors;
    }
    if (enable_skills && Array.isArray(enable_skills)) {
      body.message.enable_skills = enable_skills;
    }
    if (force_skills && Array.isArray(force_skills)) {
      body.message.force_skills = force_skills;
    }

    const response = await fetch('https://api.manus.ai/v2/task.create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manus-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error('[Manus task.create] 오류:', data);
      return res.status(response.status || 500).json({
        success: false,
        error: data.error?.message || 'Manus 태스크 생성 실패',
        details: data,
      });
    }

    return res.status(200).json({
      success: true,
      task_id: data.task?.task_id || data.task_id,
      task_url: data.task?.task_url,
      status: 'created',
      data,
    });

  } catch (error) {
    console.error('[Manus task.create] 서버 오류:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || '서버 내부 오류' 
    });
  }
}
