// api/manus-task-confirm.js — Manus API v2: 태스크 액션 확인/승인
// Manus가 이메일 발송, 배포 등 민감한 작업 전 승인을 요청할 때 사용

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
      error: 'MANUS_API_KEY가 설정되지 않았습니다.' 
    });
  }

  try {
    const { task_id, event_id, input } = req.body;

    if (!task_id || !event_id) {
      return res.status(400).json({ success: false, error: 'task_id와 event_id가 필요합니다.' });
    }

    // Manus API v2 - task.confirmAction
    const response = await fetch('https://api.manus.ai/v2/task.confirmAction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manus-api-key': apiKey,
      },
      body: JSON.stringify({
        task_id,
        event_id,
        input: input || { accept: true },
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error('[Manus task.confirmAction] 오류:', data);
      return res.status(response.status || 500).json({
        success: false,
        error: data.error?.message || 'Manus 액션 확인 실패',
        details: data,
      });
    }

    return res.status(200).json({
      success: true,
      task_id,
      event_id,
      status: 'confirmed',
      data,
    });

  } catch (error) {
    console.error('[Manus task.confirmAction] 서버 오류:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || '서버 내부 오류' 
    });
  }
}
