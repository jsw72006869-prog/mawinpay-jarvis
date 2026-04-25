import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * 마누스 AI 기반 범용 웹 작업 자동화 엔드포인트
 * 
 * 예약, 구매, 조회, 가입 등 모든 웹 작업을 마누스 에이전트에게 위임합니다.
 * 마누스는 브라우저를 직접 제어하여 사람처럼 클릭/입력/탐색합니다.
 * 
 * 실시간 진행 상황을 프론트엔드에 보고하고, 캡차/OTP/로그인 같은
 * 사용자 입력이 필요한 경우 대기 상태로 전환합니다.
 */

interface WebTaskRequest {
  // 범용 필드
  taskType?: string;       // booking | purchase | inquiry | registration | general
  targetSite?: string;     // 네이버, 카카오, 쿠팡 등
  businessName: string;    // 업체/상품명
  taskDescription?: string; // 구체적 작업 지시
  date?: string;
  time?: string;
  userName?: string;
  userPhone?: string;
  additionalInfo?: string;
  // 레거시 호환 필드
  naverUsername?: string;
  naverPassword?: string;
  sessionId?: string;
  businessUrl?: string;
}

interface WebTaskResponse {
  success: boolean;
  taskId?: string;
  message?: string;
  error?: string;
  bookingConfirmation?: {
    businessName: string;
    date: string;
    time: string;
    confirmationNumber: string;
    userName: string;
    userPhone: string;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WebTaskResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const body = req.body as WebTaskRequest;
  const {
    taskType = 'booking',
    targetSite = '',
    businessName,
    taskDescription = '',
    date = '',
    time = '',
    userName = '',
    userPhone = '',
    additionalInfo = '',
    naverUsername,
    naverPassword,
    sessionId,
    businessUrl,
  } = body;

  try {
    // ── 입력 검증 (최소한 businessName 또는 taskDescription 필요) ──
    if (!businessName && !taskDescription) {
      return res.status(400).json({
        success: false,
        error: '작업 대상(businessName) 또는 작업 설명(taskDescription)이 필요합니다.',
      });
    }

    // ── 마누스 API 호출 ──
    const manusApiKey = process.env.MANUS_API_KEY;
    if (!manusApiKey) {
      console.warn('MANUS_API_KEY 미설정 → 개발 모드 시뮬레이션');
      // 개발 환경: 마누스 없이 시뮬레이션 응답
      if (process.env.NODE_ENV !== 'production') {
        const taskLabel = taskType === 'booking' ? '예약' : taskType === 'purchase' ? '구매' : taskType === 'inquiry' ? '조회' : '웹 작업';
        return res.status(200).json({
          success: true,
          taskId: `dev-${Date.now()}`,
          message: `[DEV MODE] ${businessName} ${taskLabel} 자동화 시뮬레이션 시작됨 (${targetSite || '웹'})`,
          bookingConfirmation: taskType === 'booking' ? {
            businessName,
            date,
            time,
            confirmationNumber: `DEV-${Date.now()}`,
            userName,
            userPhone,
          } : undefined,
        });
      }
      return res.status(500).json({
        success: false,
        error: 'Manus API 설정 오류 (MANUS_API_KEY 필요)',
      });
    }

    // ── 범용 마누스 미션 프롬프트 구성 ──
    const manusPrompt = buildManusWebTaskPrompt({
      taskType,
      targetSite,
      businessName,
      taskDescription,
      date,
      time,
      userName,
      userPhone,
      additionalInfo,
      naverUsername,
      naverPassword,
      sessionId,
      businessUrl,
    });

    // ── 마누스 태스크 생성 ──
    const manusResponse = await fetch(
      'https://api.manus.im/v1/tasks/create',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${manusApiKey}`,
        },
        body: JSON.stringify({
          prompt: manusPrompt,
          connectors: ['browser'],
          enable_skills: ['browser_automation', 'form_filling'],
        }),
      }
    );

    if (!manusResponse.ok) {
      const errorData = await manusResponse.json().catch(() => ({}));
      console.error('Manus API 오류:', errorData);
      return res.status(500).json({
        success: false,
        error: `Manus API 오류: ${manusResponse.status}`,
      });
    }

    const manusData = await manusResponse.json();

    if (!manusData.task_id) {
      return res.status(500).json({
        success: false,
        error: 'Manus 태스크 생성 실패: task_id 없음',
      });
    }

    const taskLabel = taskType === 'booking' ? '예약' : taskType === 'purchase' ? '구매' : taskType === 'inquiry' ? '조회' : '웹 작업';
    return res.status(200).json({
      success: true,
      taskId: manusData.task_id,
      message: `${businessName} ${taskLabel} 자동화 시작됨 (Task: ${manusData.task_id})`,
    });
  } catch (error) {
    console.error('웹 작업 자동화 오류:', error);
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
  sessionId?: string;
  businessUrl?: string;
}): string {
  const {
    taskType,
    targetSite,
    businessName,
    taskDescription,
    date,
    time,
    userName,
    userPhone,
    additionalInfo,
    naverUsername,
    naverPassword,
    sessionId,
    businessUrl,
  } = params;

  const taskLabel = taskType === 'booking' ? '예약'
    : taskType === 'purchase' ? '구매'
    : taskType === 'inquiry' ? '조회'
    : taskType === 'registration' ? '가입/신청'
    : '웹 작업';

  // 작업 유형별 기본 실행 단계
  const defaultSteps: Record<string, string> = {
    booking: `1. ${targetSite || '해당 사이트'}에 접속 (로그인 필요시 로그인)
2. "${businessName}" 검색
3. 예약 페이지 접속
4. 예약 가능한 날짜/시간 확인 (요청: ${date} ${time})
5. 가능하면 예약 폼 입력 (이름: ${userName}, 전화: ${userPhone})
6. 예약 확인 및 완료
7. 불가능하면 가능한 시간 목록을 사용자에게 보고`,
    purchase: `1. ${targetSite || '해당 쇼핑몰'}에 접속
2. "${businessName}" 상품 검색
3. 상품 상세 페이지 접속
4. 가격, 재고, 옵션 확인
5. 장바구니 추가 또는 바로 구매
6. 결제 정보 입력 (사용자 확인 필요)
7. 주문 완료 및 확인번호 수집`,
    inquiry: `1. ${targetSite || '해당 사이트'}에 접속
2. "${businessName}" 관련 정보 검색
3. 필요한 데이터 수집 (가격, 시간, 리뷰 등)
4. 수집한 정보를 정리하여 사용자에게 보고`,
    registration: `1. ${targetSite || '해당 사이트'}에 접속
2. "${businessName}" 서비스 가입/신청 페이지 찾기
3. 필요한 정보 입력
4. 가입/신청 완료 확인`,
    general: `1. ${targetSite || '웹 브라우저'}에서 작업 시작
2. ${taskDescription || businessName + ' 관련 작업 수행'}
3. 결과를 사용자에게 보고`,
  };

  const steps = taskDescription || defaultSteps[taskType] || defaultSteps.general;

  return `당신은 MAWINPAY JARVIS의 자율 웹 작업 자동화 에이전트입니다.

[미션] ${businessName} ${taskLabel}을 자동으로 수행하세요.

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
${sessionId ? `- 기존 세션 ID: ${sessionId} (이 세션을 먼저 시도)` : ''}
${naverUsername && naverPassword
    ? `- 아이디: ${naverUsername}\n- 비밀번호: ${naverPassword}`
    : '- 로그인 정보 없음: 기존 세션이 있으면 사용, 없으면 사용자에게 요청'}

[실행 단계]
${steps}

[진행 상황 보고 규칙]
각 단계마다 반드시 한국어로 진행 상황을 보고하세요:
- "사이트 접속 중..." → "검색 중..." → "페이지 탐색 중..." → "데이터 수집 중..." → "작업 완료"
- 각 보고는 구체적이어야 합니다 (예: "네이버에서 '로즈벨 여성의원' 검색 완료, 예약 페이지 접속 중...")

[에러 처리]
- 로그인 필요: "Sir, ${targetSite || '해당 사이트'} 로그인이 필요합니다." 보고 후 대기
- 캡차/OTP: 진행 상황 보고 후 사용자 입력 대기
- 시간 마감 (예약): 가능한 시간 목록 제시 후 사용자 선택 대기
- 네트워크 오류: 3회 자동 재시도 후 실패 보고
- 페이지 로딩 실패: 대체 경로 시도 후 보고

[자율 판단 원칙]
- 예상치 못한 팝업이나 모달이 나타나면 자동으로 닫기
- 쿠키 동의 팝업은 자동 수락
- 페이지 구조가 예상과 다르면 유사한 요소를 찾아 진행
- 작업이 막히면 대안을 먼저 시도하고, 불가능하면 사용자에게 보고

[최종 결과 형식]
성공 시:
✅ ${taskLabel} 완료
- 대상: ${businessName}
${date ? `- 날짜: ${date}` : ''}
${time ? `- 시간: ${time}` : ''}
- 결과: [상세 결과]

실패 시:
❌ ${taskLabel} 실패
- 원인: [상세 원인]
- 대안: [제안할 대안]`;
}
