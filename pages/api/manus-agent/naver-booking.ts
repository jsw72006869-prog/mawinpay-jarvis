import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * 마누스 AI 기반 범용 웹 작업 자동화 엔드포인트
 * 
 * 이 엔드포인트는 자비스의 execute_web_task 액션에서 호출됩니다.
 * 마누스 API v2 (https://api.manus.ai/v2/task.create)를 직접 호출하여
 * 브라우저 자동화 태스크를 생성합니다.
 */

interface WebTaskRequest {
  taskType?: string;
  targetSite?: string;
  businessName: string;
  taskDescription?: string;
  date?: string;
  time?: string;
  userName?: string;
  userPhone?: string;
  additionalInfo?: string;
  naverUsername?: string;
  naverPassword?: string;
  sessionId?: string;
  businessUrl?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const body = req.body as WebTaskRequest;
  const {
    taskType = 'booking',
    targetSite = '',
    businessName = '',
    taskDescription = '',
    date = '',
    time = '',
    userName = '',
    userPhone = '',
    additionalInfo = '',
    naverUsername,
    naverPassword,
    businessUrl,
  } = body;

  // 입력 검증
  if (!businessName && !taskDescription) {
    return res.status(400).json({
      success: false,
      error: '작업 대상(businessName) 또는 작업 설명(taskDescription)이 필요합니다.',
    });
  }

  // 마누스 API 키 확인
  const apiKey = process.env.MANUS_API_KEY;
  if (!apiKey) {
    console.warn('[naver-booking] MANUS_API_KEY 미설정');
    return res.status(500).json({
      success: false,
      error: 'MANUS_API_KEY가 설정되지 않았습니다.',
    });
  }

  try {
    // 마누스 프롬프트 구성
    const prompt = buildManusWebTaskPrompt({
      taskType, targetSite, businessName, taskDescription,
      date, time, userName, userPhone, additionalInfo,
      naverUsername, naverPassword, businessUrl,
    });

    // ── 마누스 API v2 직접 호출 (올바른 URL + 헤더) ──
    const manusResponse = await fetch('https://api.manus.ai/v2/task.create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manus-api-key': apiKey,
      },
      body: JSON.stringify({
        message: {
          content: prompt,
        },
      }),
    });

    // 응답을 안전하게 파싱
    let data: any;
    const responseText = await manusResponse.text();
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('[naver-booking] 마누스 응답 파싱 실패:', responseText.substring(0, 200));
      return res.status(500).json({
        success: false,
        error: `마누스 API 응답 파싱 실패: ${responseText.substring(0, 100)}`,
      });
    }

    // 마누스 API v2 에러 처리
    if (!manusResponse.ok || !data.ok) {
      console.error('[naver-booking] 마누스 API 오류:', data);
      return res.status(manusResponse.status || 500).json({
        success: false,
        error: data.error?.message || `마누스 API 오류 (${manusResponse.status})`,
        details: data,
      });
    }

    // 성공 응답
    const taskId = data.task?.task_id || data.task_id;
    const taskUrl = data.task?.task_url;

    if (!taskId) {
      return res.status(500).json({
        success: false,
        error: '마누스 태스크 ID를 받지 못했습니다.',
        details: data,
      });
    }

    const taskLabel = taskType === 'booking' ? '예약'
      : taskType === 'purchase' ? '구매'
      : taskType === 'inquiry' ? '조회'
      : '웹 작업';

    return res.status(200).json({
      success: true,
      taskId,
      taskUrl,
      message: `${businessName} ${taskLabel} 자동화 시작됨 (Task: ${taskId})`,
    });

  } catch (error) {
    console.error('[naver-booking] 서버 오류:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류 발생',
    });
  }
}

/**
 * 마누스가 이해할 수 있는 범용 웹 작업 자동화 프롬프트 구성
 */
function buildManusWebTaskPrompt(params: {
  taskType: string;
  targetSite: string;
  businessName: string;
  taskDescription: string;
  date: string;
  time: string;
  userName: string;
  userPhone: string;
  additionalInfo: string;
  naverUsername?: string;
  naverPassword?: string;
  businessUrl?: string;
}): string {
  const {
    taskType, targetSite, businessName, taskDescription,
    date, time, userName, userPhone, additionalInfo,
    naverUsername, naverPassword, businessUrl,
  } = params;

  const taskLabel = taskType === 'booking' ? '예약'
    : taskType === 'purchase' ? '구매'
    : taskType === 'inquiry' ? '조회'
    : taskType === 'registration' ? '가입/신청'
    : '웹 작업';

  // 작업 유형별 기본 실행 단계
  const defaultSteps: Record<string, string> = {
    booking: `1. ${targetSite || '네이버'}에 접속
2. "${businessName}" 검색
3. 예약 페이지 접속
4. 예약 가능한 날짜/시간 확인${date ? ` (요청: ${date})` : ''}${time ? ` ${time}` : ''}
5. 가능하면 예약 폼 입력${userName ? ` (이름: ${userName})` : ''}${userPhone ? ` (전화: ${userPhone})` : ''}
6. 예약 확인 및 완료
7. 불가능하면 가능한 시간 목록을 사용자에게 보고`,
    inquiry: `1. ${targetSite || '네이버'}에 접속
2. "${businessName}" 검색
3. 관련 정보 수집 (가격, 시간, 리뷰 등)
4. 수집한 정보를 정리하여 보고`,
    purchase: `1. ${targetSite || '해당 쇼핑몰'}에 접속
2. "${businessName}" 상품 검색
3. 가격, 재고, 옵션 확인
4. 결과 보고`,
    general: `1. ${targetSite || '웹 브라우저'}에서 작업 시작
2. ${taskDescription || businessName + ' 관련 작업 수행'}
3. 결과를 사용자에게 보고`,
  };

  const steps = taskDescription || defaultSteps[taskType] || defaultSteps.general;

  return `당신은 MAWINPAY JARVIS의 자율 웹 작업 자동화 에이전트입니다.

[미션] ${businessName} ${taskLabel}

[작업 정보]
- 작업 유형: ${taskLabel}
- 대상 사이트: ${targetSite || '자동 판단'}
- 대상: ${businessName}
${date ? `- 날짜: ${date}` : ''}
${time ? `- 시간: ${time}` : ''}
${userName ? `- 사용자 이름: ${userName}` : ''}
${userPhone ? `- 사용자 전화: ${userPhone}` : ''}
${additionalInfo ? `- 추가 정보: ${additionalInfo}` : ''}
${businessUrl ? `- 직접 URL: ${businessUrl}` : ''}

[로그인 정보]
${naverUsername && naverPassword
    ? `- 아이디: ${naverUsername}\n- 비밀번호: ${naverPassword}`
    : '- 로그인 정보 없음: 로그인이 필요하면 사용자에게 요청'}

[실행 단계]
${steps}

[보고 규칙]
각 단계마다 한국어로 진행 상황을 보고하세요.

[에러 처리]
- 로그인 필요: 사용자에게 보고 후 대기
- 캡차/OTP: 사용자 입력 대기
- 시간 마감: 가능한 시간 목록 제시
- 네트워크 오류: 3회 재시도 후 실패 보고`;
}
