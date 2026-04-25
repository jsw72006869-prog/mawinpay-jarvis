import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * 마누스 AI 기반 네이버 예약 자동화 엔드포인트
 * 
 * 이 엔드포인트는 마누스 에이전트에게 네이버 예약 자동화 미션을 위임합니다.
 * 마누스는 브라우저를 직접 제어하여:
 * 1. 네이버 로그인
 * 2. 예약 페이지 접속
 * 3. 시간 조회
 * 4. 예약 폼 입력
 * 5. 최종 확인
 * 
 * 실시간 진행 상황을 프론트엔드에 보고하고, 캡차/OTP 같은 사용자 입력이 필요한 경우
 * 대기 상태로 전환하여 사용자 입력을 받습니다.
 */

interface BookingRequest {
  businessName: string;
  businessUrl?: string;
  date: string;
  time: string;
  userName: string;
  userPhone: string;
  naverUsername?: string;
  naverPassword?: string;
  sessionId?: string;
}

interface BookingResponse {
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
  res: NextApiResponse<BookingResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const {
    businessName,
    businessUrl,
    date,
    time,
    userName,
    userPhone,
    naverUsername,
    naverPassword,
    sessionId,
  } = req.body as BookingRequest;

  try {
    // ── 입력 검증 ──
    if (!businessName || !date || !time || !userName || !userPhone) {
      return res.status(400).json({
        success: false,
        error: '필수 정보가 누락되었습니다: businessName, date, time, userName, userPhone',
      });
    }

    // ── 마누스 API 호출 ──
    const manusApiKey = process.env.MANUS_API_KEY;
    if (!manusApiKey) {
      console.error('MANUS_API_KEY 환경 변수가 설정되지 않았습니다.');
      // 개발 환경: 마누스 없이 목 응답 반환
      if (process.env.NODE_ENV !== 'production') {
        return res.status(200).json({
          success: true,
          taskId: `mock-${Date.now()}`,
          message: `[DEV MODE] ${businessName} ${date} ${time} 예약 자동화 시뮬레이션 시작됨`,
          bookingConfirmation: {
            businessName,
            date,
            time,
            confirmationNumber: `MOCK-${Date.now()}`,
            userName,
            userPhone,
          },
        });
      }
      return res.status(500).json({
        success: false,
        error: 'Manus API 설정 오류',
      });
    }

    // ── 마누스 미션 프롬프트 구성 ──
    const manusPrompt = buildManusBookingPrompt({
      businessName,
      businessUrl,
      date,
      time,
      userName,
      userPhone,
      naverUsername,
      naverPassword,
      sessionId,
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

    // ── 성공 응답: 태스크 ID 반환 ──
    // 프론트엔드는 이 task_id를 사용하여 실시간 진행 상황을 폴링합니다.
    return res.status(200).json({
      success: true,
      taskId: manusData.task_id,
      message: `네이버 예약 자동화 시작됨 (Task: ${manusData.task_id})`,
    });
  } catch (error) {
    console.error('예약 자동화 오류:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류 발생',
    });
  }
}

/**
 * 마누스가 이해할 수 있는 상세한 네이버 예약 자동화 프롬프트 구성
 */
function buildManusBookingPrompt(params: {
  businessName: string;
  businessUrl?: string;
  date: string;
  time: string;
  userName: string;
  userPhone: string;
  naverUsername?: string;
  naverPassword?: string;
  sessionId?: string;
}): string {
  const {
    businessName,
    businessUrl,
    date,
    time,
    userName,
    userPhone,
    naverUsername,
    naverPassword,
    sessionId,
  } = params;

  return `당신은 MAWINPAY JARVIS의 자율 예약 자동화 에이전트입니다.

[미션] 네이버 예약을 자동으로 진행하세요.

[예약 정보]
- 업체명: ${businessName}
${businessUrl ? `- 업체 URL: ${businessUrl}` : '- 업체 URL: 네이버에서 "${businessName}" 검색'}
- 예약 날짜: ${date}
- 예약 시간: ${time}
- 예약자명: ${userName}
- 예약자 전화: ${userPhone}

[로그인 정보]
${
  sessionId
    ? `- 기존 세션 ID: ${sessionId} (이 세션을 먼저 시도)`
    : ''
}
${
  naverUsername && naverPassword
    ? `- 네이버 아이디: ${naverUsername}
- 네이버 비밀번호: ${naverPassword}`
    : '- 로그인 정보 없음: 기존 세션이 있으면 사용, 없으면 사용자에게 요청'
}

[실행 단계]
1. **네이버 로그인** (필요시)
   - 세션이 있으면 세션 사용
   - 세션 없으면 아이디/비밀번호로 로그인
   - 캡차/OTP 필요시: 진행 상황 보고 후 대기 (사용자 입력 필요)

2. **업체 검색 및 예약 페이지 접속**
   - 네이버에서 "${businessName}" 검색
   - 예약 페이지 접속

3. **시간 조회**
   - 예약 날짜: ${date}
   - 예약 시간: ${time}
   - 해당 시간 가능 여부 확인
   - 불가능하면: 가능한 시간 목록 수집 후 사용자에게 보고

4. **예약 폼 입력**
   - 예약자명: ${userName}
   - 전화번호: ${userPhone}
   - 기타 필수 정보 입력

5. **최종 확인 및 예약 완료**
   - 예약 확인 페이지에서 정보 검증
   - 예약 완료 버튼 클릭
   - 확인번호 수집

[진행 상황 보고]
각 단계마다 다음 형식으로 진행 상황을 보고하세요:
- "로그인 중..." → "시간 조회 중..." → "예약 폼 입력 중..." → "예약 완료"

[에러 처리]
- 로그인 실패: 원인 보고 후 대기 (사용자 재입력 필요)
- 시간 마감: 가능한 시간 목록 제시 후 사용자 선택 대기
- 네트워크 오류: 3회 자동 재시도 후 실패 보고
- 캡차/OTP: 진행 상황 보고 후 사용자 입력 대기

[최종 결과]
성공 시:
\`\`\`
✅ 예약 완료
- 업체: ${businessName}
- 날짜: ${date}
- 시간: ${time}
- 예약자: ${userName}
- 확인번호: [수집한 번호]
\`\`\`

실패 시:
\`\`\`
❌ 예약 실패
- 원인: [상세 원인]
- 대안: [제안할 대안]
\`\`\``;
}
