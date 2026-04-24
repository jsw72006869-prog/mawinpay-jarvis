// src/lib/manus-client.ts — Manus API 클라이언트 모듈
// 자비스 프론트엔드에서 Manus API를 호출하기 위한 통합 인터페이스
// 모든 API 호출은 Vercel 서버리스 함수를 통해 안전하게 처리됩니다.

// ── 타입 정의 ──

export interface ManusTask {
  task_id: string;
  task_url?: string;
  status: 'created' | 'running' | 'waiting' | 'stopped' | 'error' | 'unknown';
  messages: ManusMessage[];
  progress: ManusProgress[];
  waiting_detail?: ManusWaitingDetail | null;
}

export interface ManusMessage {
  content: string;
  attachments: ManusAttachment[];
  timestamp?: string;
}

export interface ManusAttachment {
  file_name: string;
  url: string;
  size_bytes: number;
}

export interface ManusProgress {
  type: string;
  content: string;
  timestamp?: string;
}

export interface ManusWaitingDetail {
  waiting_for_event_id: string;
  waiting_for_event_type: string;
  waiting_description: string;
  confirm_input_schema?: Record<string, unknown>;
}

export type ManusStatusCallback = (task: ManusTask) => void;
export type ManusErrorCallback = (error: string) => void;

// ── API 베이스 URL ──
const API_BASE = typeof window !== 'undefined' ? window.location.origin : '';

// ── 핵심 함수들 ──

/**
 * Manus에게 새로운 미션을 생성합니다.
 * 예: "뷰티 인플루언서 20명을 유튜브와 인스타에서 찾아서 이메일 주소까지 수집해줘"
 */
export async function createManusTask(
  prompt: string,
  options?: {
    connectors?: string[];
    enable_skills?: string[];
    force_skills?: string[];
  }
): Promise<{ success: boolean; task_id?: string; task_url?: string; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}/api/manus-task-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        connectors: options?.connectors,
        enable_skills: options?.enable_skills,
        force_skills: options?.force_skills,
      }),
    });

    const data = await response.json();
    return {
      success: data.success,
      task_id: data.task_id,
      task_url: data.task_url,
      error: data.error,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Manus 연결 실패',
    };
  }
}

/**
 * Manus 태스크의 현재 상태를 조회합니다.
 */
export async function getManusTaskStatus(
  taskId: string
): Promise<ManusTask> {
  try {
    const response = await fetch(
      `${API_BASE}/api/manus-task-status?task_id=${encodeURIComponent(taskId)}&order=desc&limit=20`
    );
    const data = await response.json();

    if (!data.success) {
      return {
        task_id: taskId,
        status: 'error',
        messages: [{ content: data.error || '상태 조회 실패', attachments: [] }],
        progress: [],
      };
    }

    return {
      task_id: taskId,
      status: data.agent_status || 'unknown',
      messages: data.messages || [],
      progress: data.progress || [],
      waiting_detail: data.waiting_detail,
    };
  } catch (error) {
    return {
      task_id: taskId,
      status: 'error',
      messages: [{ content: error instanceof Error ? error.message : '연결 실패', attachments: [] }],
      progress: [],
    };
  }
}

/**
 * Manus 태스크에 추가 메시지를 전송합니다.
 */
export async function sendManusMessage(
  taskId: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}/api/manus-task-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, message }),
    });
    const data = await response.json();
    return { success: data.success, error: data.error };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '전송 실패' };
  }
}

/**
 * Manus 태스크의 액션을 승인/거부합니다.
 */
export async function confirmManusAction(
  taskId: string,
  eventId: string,
  input?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}/api/manus-task-confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, event_id: eventId, input }),
    });
    const data = await response.json();
    return { success: data.success, error: data.error };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '확인 실패' };
  }
}

// ── 실시간 폴링 매니저 ──

/**
 * Manus 태스크를 실시간으로 추적하는 폴링 매니저
 * 태스크가 완료되거나 에러가 발생할 때까지 주기적으로 상태를 확인합니다.
 */
export class ManusTaskPoller {
  private taskId: string;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private pollInterval: number;
  private onStatusChange: ManusStatusCallback;
  private onError: ManusErrorCallback;
  private lastStatus: string = '';

  constructor(
    taskId: string,
    onStatusChange: ManusStatusCallback,
    onError: ManusErrorCallback,
    pollInterval: number = 3000 // 3초 간격
  ) {
    this.taskId = taskId;
    this.onStatusChange = onStatusChange;
    this.onError = onError;
    this.pollInterval = pollInterval;
  }

  /** 폴링 시작 */
  start(): void {
    this.poll(); // 즉시 한 번 실행
    this.intervalId = setInterval(() => this.poll(), this.pollInterval);
  }

  /** 폴링 중지 */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** 단일 폴링 실행 */
  private async poll(): Promise<void> {
    try {
      const task = await getManusTaskStatus(this.taskId);
      
      // 상태 변경 시에만 콜백 호출
      if (task.status !== this.lastStatus || task.messages.length > 0) {
        this.lastStatus = task.status;
        this.onStatusChange(task);
      }

      // 완료 또는 에러 시 자동 중지
      if (task.status === 'stopped' || task.status === 'error') {
        this.stop();
      }
    } catch (error) {
      this.onError(error instanceof Error ? error.message : '폴링 오류');
    }
  }
}

// ── 미션 빌더 (자비스 음성 명령 → Manus 프롬프트 변환) ──

/**
 * 자비스의 음성 명령을 Manus가 이해할 수 있는 상세한 프롬프트로 변환합니다.
 * 이것이 자비스의 '단순 명령'을 Manus의 '지능적 실행'으로 바꾸는 핵심 엔진입니다.
 */
export function buildManusPrompt(
  userCommand: string,
  context?: {
    businessType?: string;  // 예: '농산물 판매'
    targetPlatforms?: string[];  // 예: ['유튜브', '인스타그램']
    previousResults?: string;  // 이전 작업 결과 참조
  }
): string {
  const businessContext = context?.businessType 
    ? `\n[사업 배경] 사용자는 ${context.businessType} 사업을 운영하고 있으며, 바이럴 마케팅과 공동구매 전략을 통해 제품을 판매합니다.`
    : '';
  
  const platformContext = context?.targetPlatforms?.length
    ? `\n[타겟 플랫폼] ${context.targetPlatforms.join(', ')}`
    : '';

  const previousContext = context?.previousResults
    ? `\n[이전 작업 참조] ${context.previousResults}`
    : '';

  return `당신은 MAWINPAY JARVIS 시스템의 실행 엔진입니다. 아래 미션을 완벽하게 수행해주세요.
${businessContext}${platformContext}${previousContext}

[미션] ${userCommand}

[실행 원칙]
1. 단순 나열이 아닌, 분석과 판단을 포함한 결과를 제공하세요.
2. 데이터 수집 시 가능한 이메일, 연락처 등 실행 가능한 정보를 포함하세요.
3. 작업 완료 후 다음 단계 제안(예: 메일 발송, 콘텐츠 제작)을 포함하세요.
4. 모든 결과는 한국어로 작성하세요.
5. 결과물은 구조화된 형태(표, 리스트)로 정리하세요.`;
}

// ── Manus 연결 상태 확인 ──

/**
 * Manus API 연결 상태를 확인합니다.
 */
export async function checkManusConnection(): Promise<{
  connected: boolean;
  message: string;
}> {
  try {
    // 간단한 테스트 태스크 생성으로 연결 확인
    const response = await fetch(`${API_BASE}/api/manus-task-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '연결 테스트: "JARVIS 연결 성공"이라고만 답해주세요.' }),
    });
    const data = await response.json();
    
    if (data.success) {
      return { connected: true, message: 'Manus API 연결 성공. 자비스의 지능이 확장되었습니다.' };
    }
    return { connected: false, message: data.error || 'Manus API 연결 실패' };
  } catch {
    return { connected: false, message: 'Manus 서버에 접근할 수 없습니다.' };
  }
}
