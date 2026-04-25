/**
 * 자비스 자율 판단 엔진 (Autonomous Decision Engine)
 * 
 * 단순한 명령 수행을 넘어서 상황을 분석하고 스스로 판단하는 로직을 제공합니다.
 * - 예약 실패 시 자동으로 대안 제시
 * - 로그인 문제 자동 감지 및 해결 제안
 * - 사용자 히스토리 학습 및 선제적 제안
 * - 문제 상황에서 자체 판단으로 다음 단계 제시
 */

import { ManusTask, ManusWaitingDetail } from './manus-client';

export interface AutonomousContext {
  lastBookingAttempt?: {
    businessName: string;
    date: string;
    time: string;
    failureReason?: string;
    timestamp: number;
  };
  userCredentials?: {
    username: string;
    password: string;
    userName: string;
    userPhone: string;
  };
  recentSearches: string[];
  bookingHistory: Array<{
    businessName: string;
    date: string;
    time: string;
    status: 'success' | 'failed' | 'cancelled';
    timestamp: number;
  }>;
}

/**
 * Manus 태스크 상태를 분석하고 자율적 판단을 내립니다.
 * 
 * 예:
 * - "waiting" 상태 + "CAPTCHA" → "캡차를 풀어야 합니다. 음성으로 코드를 말씀해 주세요."
 * - "error" 상태 + "login failed" → "로그인 실패했습니다. 비밀번호를 다시 확인해 주시겠어요?"
 * - "running" 상태 + progress 있음 → "현재 진행 상황: 로그인 중... → 시간 조회 중..."
 */
export function analyzeManusTaskAndMakeDecision(
  task: ManusTask,
  context: AutonomousContext
): {
  action: 'continue' | 'wait_for_user' | 'suggest_alternative' | 'retry' | 'escalate';
  message: string;
  followUp?: string;
  suggestedAlternatives?: string[];
} {
  // 1. 대기 상태 분석 (CAPTCHA, OTP, 사용자 입력 필요)
  if (task.status === 'waiting' && task.waiting_detail) {
    return analyzeWaitingState(task.waiting_detail, context);
  }

  // 2. 에러 상태 분석
  if (task.status === 'error') {
    return analyzeErrorState(task, context);
  }

  // 3. 실행 중 상태 분석 (진행 상황 브리핑)
  if (task.status === 'running') {
    return analyzeRunningState(task, context);
  }

  // 4. 완료 상태
  if (task.status === 'stopped') {
    return analyzeCompletedState(task, context);
  }

  return {
    action: 'continue',
    message: '작업을 계속 진행 중입니다.',
  };
}

/**
 * 대기 상태 분석: 캡차, OTP, 사용자 입력 필요
 */
function analyzeWaitingState(
  waitingDetail: ManusWaitingDetail,
  context: AutonomousContext
): ReturnType<typeof analyzeManusTaskAndMakeDecision> {
  const eventType = waitingDetail.waiting_for_event_type?.toLowerCase() || '';
  const description = waitingDetail.waiting_description || '';

  // CAPTCHA 감지
  if (eventType.includes('captcha') || description.includes('캡차') || description.includes('CAPTCHA')) {
    return {
      action: 'wait_for_user',
      message: '🔐 캡차 인증이 필요합니다. 화면에 표시된 캡차 코드를 말씀해 주세요.',
      followUp: '예: "1234" 또는 "일이삼사"',
    };
  }

  // OTP/2단계 인증 감지
  if (eventType.includes('otp') || eventType.includes('2fa') || description.includes('인증번호')) {
    return {
      action: 'wait_for_user',
      message: '📱 인증번호가 전송되었습니다. 받으신 인증번호를 말씀해 주세요.',
      followUp: '예: "123456"',
    };
  }

  // 로그인 정보 입력 필요
  if (eventType.includes('login') || description.includes('로그인')) {
    return {
      action: 'wait_for_user',
      message: '🔑 로그인 정보가 필요합니다. 네이버 아이디를 말씀해 주세요.',
      followUp: '이후 비밀번호를 입력해 주시겠어요?',
    };
  }

  // 예약 정보 입력 필요
  if (eventType.includes('booking') || description.includes('예약')) {
    return {
      action: 'wait_for_user',
      message: '📅 예약 정보를 입력해야 합니다. 원하시는 시간을 선택해 주세요.',
      followUp: '시간 슬롯을 보여드릴까요?',
    };
  }

  // 기타 사용자 입력 필요
  return {
    action: 'wait_for_user',
    message: `⏸️ 사용자 입력이 필요합니다: ${description}`,
  };
}

/**
 * 에러 상태 분석: 로그인 실패, 네트워크 오류 등
 */
function analyzeErrorState(
  task: ManusTask,
  context: AutonomousContext
): ReturnType<typeof analyzeManusTaskAndMakeDecision> {
  const lastMessage = task.messages[task.messages.length - 1]?.content || '';
  const errorText = lastMessage.toLowerCase();

  // 로그인 실패
  if (errorText.includes('login') || errorText.includes('로그인') || errorText.includes('인증')) {
    return {
      action: 'suggest_alternative',
      message: '❌ 로그인에 실패했습니다. 다음 중 하나를 시도해 보겠습니다:',
      suggestedAlternatives: [
        '1. 비밀번호 재확인 후 다시 시도',
        '2. 네이버 로그인 페이지에서 직접 로그인',
        '3. 다른 예약 플랫폼 사용 (캐치테이블, 당근마켓)',
      ],
      followUp: '어떤 방법을 시도해 볼까요?',
    };
  }

  // 네트워크 오류
  if (errorText.includes('network') || errorText.includes('timeout') || errorText.includes('연결')) {
    return {
      action: 'retry',
      message: '🌐 네트워크 연결 문제가 발생했습니다. 잠시 후 다시 시도하겠습니다.',
      followUp: '30초 후 자동으로 재시도합니다.',
    };
  }

  // 예약 불가능 (시간 마감, 정원 초과 등)
  if (errorText.includes('unavailable') || errorText.includes('예약 불가') || errorText.includes('마감')) {
    return {
      action: 'suggest_alternative',
      message: '⏰ 선택하신 시간은 예약이 불가능합니다. 다른 시간을 추천해 드리겠습니다.',
      suggestedAlternatives: [
        '• 1시간 뒤: 14:00 - 15:00',
        '• 2시간 뒤: 15:00 - 16:00',
        '• 내일 같은 시간: 13:00 - 14:00',
      ],
      followUp: '위의 시간 중 하나로 예약해 드릴까요?',
    };
  }

  // 일반 에러
  return {
    action: 'escalate',
    message: `❌ 작업 중 오류가 발생했습니다: ${lastMessage}`,
    followUp: '다시 시도해 보거나 다른 방법을 시도해 보겠습니다.',
  };
}

/**
 * 실행 중 상태 분석: 진행 상황 브리핑
 */
function analyzeRunningState(
  task: ManusTask,
  context: AutonomousContext
): ReturnType<typeof analyzeManusTaskAndMakeDecision> {
  const progressItems = task.progress || [];
  
  if (progressItems.length === 0) {
    return {
      action: 'continue',
      message: '⚙️ 작업을 진행 중입니다. 잠시만 기다려 주세요.',
    };
  }

  // 진행 상황을 단계별로 정리
  const steps = progressItems.map(p => {
    const content = p.content?.toLowerCase() || '';
    if (content.includes('login')) return '🔑 로그인 중';
    if (content.includes('search') || content.includes('조회')) return '🔍 시간 조회 중';
    if (content.includes('form') || content.includes('입력')) return '📝 예약 폼 입력 중';
    if (content.includes('confirm') || content.includes('확인')) return '✅ 예약 확인 중';
    if (content.includes('complete') || content.includes('완료')) return '🎉 완료';
    return `📌 ${p.content}`;
  });

  const progressText = steps.join(' → ');

  return {
    action: 'continue',
    message: `⏳ 진행 상황: ${progressText}`,
    followUp: '완료될 때까지 기다려 주세요.',
  };
}

/**
 * 완료 상태 분석: 성공 또는 부분 완료
 */
function analyzeCompletedState(
  task: ManusTask,
  context: AutonomousContext
): ReturnType<typeof analyzeManusTaskAndMakeDecision> {
  const lastMessage = task.messages[task.messages.length - 1]?.content || '';

  // 성공 메시지 감지
  if (lastMessage.toLowerCase().includes('success') || 
      lastMessage.toLowerCase().includes('완료') ||
      lastMessage.toLowerCase().includes('예약 완료')) {
    return {
      action: 'continue',
      message: `✅ 작업이 완료되었습니다!\n\n${lastMessage}`,
      followUp: '다음에 도움이 필요하시면 언제든지 말씀해 주세요.',
    };
  }

  // 부분 완료 또는 경고
  if (lastMessage.toLowerCase().includes('warning') || lastMessage.toLowerCase().includes('주의')) {
    return {
      action: 'suggest_alternative',
      message: `⚠️ 작업이 완료되었지만 주의사항이 있습니다:\n\n${lastMessage}`,
      followUp: '확인하셨나요?',
    };
  }

  return {
    action: 'continue',
    message: `작업이 완료되었습니다: ${lastMessage}`,
  };
}

/**
 * 사용자 히스토리를 기반으로 선제적 제안을 생성합니다.
 */
export function generateProactiveOffer(context: AutonomousContext): string | null {
  // 최근 예약 시도가 있었는지 확인
  if (context.lastBookingAttempt) {
    const timeSinceLastAttempt = Date.now() - context.lastBookingAttempt.timestamp;
    const minutesAgo = Math.floor(timeSinceLastAttempt / 60000);

    // 실패한 예약이 5분 이내라면
    if (minutesAgo < 5 && context.lastBookingAttempt.failureReason) {
      return `지난번 ${context.lastBookingAttempt.businessName} 예약이 실패했는데, 다른 시간이나 다른 업체로 다시 시도해 볼까요?`;
    }
  }

  // 최근 검색 키워드 기반 제안
  if (context.recentSearches.length > 0) {
    const lastSearch = context.recentSearches[context.recentSearches.length - 1];
    return `지난번 "${lastSearch}" 관련 검색 결과를 다시 보여드릴까요?`;
  }

  // 예약 히스토리 기반 제안
  if (context.bookingHistory.length > 0) {
    const lastBooking = context.bookingHistory[context.bookingHistory.length - 1];
    if (lastBooking.status === 'success') {
      return `${lastBooking.businessName}에서 자주 예약하시는데, 다음 예약도 같은 시간으로 해드릴까요?`;
    }
  }

  return null;
}

/**
 * 마누스 에이전트가 자율적으로 문제를 해결할 수 있는지 판단합니다.
 */
export function canManusAutoResolve(waitingDetail: ManusWaitingDetail): boolean {
  const eventType = waitingDetail.waiting_for_event_type?.toLowerCase() || '';
  
  // 마누스가 자동으로 해결할 수 없는 경우
  const userInputRequired = [
    'captcha',      // 캡차는 사용자 입력 필요
    'otp',          // OTP는 사용자 입력 필요
    'phone_call',   // 전화 인증은 불가능
    'email_confirm', // 이메일 확인은 사용자 필요
  ];

  return !userInputRequired.some(req => eventType.includes(req));
}

/**
 * 자율 재시도 전략을 결정합니다.
 */
export function getAutoRetryStrategy(
  errorMessage: string,
  attemptCount: number
): {
  shouldRetry: boolean;
  delayMs: number;
  strategy: 'immediate' | 'exponential_backoff' | 'give_up';
} {
  // 최대 3회까지만 재시도
  if (attemptCount >= 3) {
    return { shouldRetry: false, delayMs: 0, strategy: 'give_up' };
  }

  // 네트워크 오류는 지수 백오프로 재시도
  if (errorMessage.toLowerCase().includes('network') || 
      errorMessage.toLowerCase().includes('timeout') ||
      errorMessage.toLowerCase().includes('연결')) {
    const delayMs = Math.pow(2, attemptCount) * 1000; // 1s, 2s, 4s
    return { shouldRetry: true, delayMs, strategy: 'exponential_backoff' };
  }

  // 로그인 실패는 재시도하지 않음 (사용자 입력 필요)
  if (errorMessage.toLowerCase().includes('login') || 
      errorMessage.toLowerCase().includes('인증')) {
    return { shouldRetry: false, delayMs: 0, strategy: 'give_up' };
  }

  // 기타 오류는 즉시 재시도
  return { shouldRetry: true, delayMs: 0, strategy: 'immediate' };
}
