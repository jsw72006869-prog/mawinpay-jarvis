// api/manus-task-status.js — Manus API v2: 태스크 상태 조회 및 메시지 폴링
// 자비스가 Manus의 작업 진행 상황을 실시간으로 추적할 때 사용

export default async function handler(req, res) {
  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.MANUS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ 
      success: false, 
      error: 'MANUS_API_KEY가 설정되지 않았습니다.' 
    });
  }

  try {
    const { task_id, order = 'desc', limit = '20' } = req.query;

    if (!task_id) {
      return res.status(400).json({ success: false, error: 'task_id가 필요합니다.' });
    }

    // Manus API v2 - task.listMessages (폴링)
    const url = `https://api.manus.ai/v2/task.listMessages?task_id=${encodeURIComponent(task_id)}&order=${order}&limit=${limit}`;

    const response = await fetch(url, {
      headers: {
        'x-manus-api-key': apiKey,
      },
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error('[Manus task.listMessages] 오류:', data);
      return res.status(response.status || 500).json({
        success: false,
        error: data.error?.message || 'Manus 상태 조회 실패',
        details: data,
      });
    }

    // 이벤트에서 상태 정보 추출
    const events = data.events || [];
    
    // 최신 status_update 이벤트 찾기
    const statusEvent = events.find(e => e.type === 'status_update');
    const agentStatus = statusEvent?.status_update?.agent_status || 'unknown';
    
    // assistant_message 이벤트들 수집 (Manus의 응답)
    const assistantMessages = events
      .filter(e => e.type === 'assistant_message')
      .map(e => ({
        content: e.assistant_message?.content || '',
        attachments: e.assistant_message?.attachments || [],
        timestamp: e.created_at,
      }));

    // 진행 상황 이벤트 수집 (plan_update 등)
    const progressEvents = events
      .filter(e => e.type === 'plan_update' || e.type === 'tool_use')
      .map(e => ({
        type: e.type,
        content: e.plan_update?.phases || e.tool_use?.tool_name || '',
        timestamp: e.created_at,
      }));

    // waiting 상태 상세 정보
    let waitingDetail = null;
    if (agentStatus === 'waiting' && statusEvent?.status_update?.status_detail) {
      waitingDetail = statusEvent.status_update.status_detail;
    }

    return res.status(200).json({
      success: true,
      task_id,
      agent_status: agentStatus,
      messages: assistantMessages,
      progress: progressEvents,
      waiting_detail: waitingDetail,
      raw_events: events,
    });

  } catch (error) {
    console.error('[Manus task.status] 서버 오류:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || '서버 내부 오류' 
    });
  }
}
