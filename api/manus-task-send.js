// api/manus-task-send.js — Manus API v2: 태스크에 메시지 전송
// 자비스가 Manus에게 추가 지시를 내리거나 질문에 답변할 때 사용

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
    const { task_id, message } = req.body;

    if (!task_id || !message) {
      return res.status(400).json({ success: false, error: 'task_id와 message가 필요합니다.' });
    }

    // Manus API v2 - task.sendMessage
    const response = await fetch('https://api.manus.ai/v2/task.sendMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manus-api-key': apiKey,
      },
      body: JSON.stringify({
        task_id,
        message: {
          content: typeof message === 'string' ? message : message.content,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error('[Manus task.sendMessage] 오류:', data);
      return res.status(response.status || 500).json({
        success: false,
        error: data.error?.message || 'Manus 메시지 전송 실패',
        details: data,
      });
    }

    return res.status(200).json({
      success: true,
      task_id,
      status: 'message_sent',
      data,
    });

  } catch (error) {
    console.error('[Manus task.sendMessage] 서버 오류:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || '서버 내부 오류' 
    });
  }
}
