/**
 * J.A.R.V.I.S. v5.0 — Cloud Engine Client
 * 
 * Persistent VM 백엔드와의 WebSocket/REST 통신 레이어
 * 프론트엔드 HUD에 실시간 서버 상태, 작업 진행률, 스크린샷을 전달
 */

// 환경변수에서 서버 주소 가져오기
const CLOUD_SERVER = import.meta.env.VITE_CLOUD_SERVER_URL || 'http://35.243.215.119:3001';
const WS_URL = CLOUD_SERVER.replace('http', 'ws') + '/ws';

export interface CloudStatus {
  service: string;
  status: 'operational' | 'degraded' | 'offline';
  browserReady: boolean;
  uptime: number;
  currentTask: any | null;
  tasksCompleted: number;
  clientsConnected: number;
  serverTime: string;
}

export interface TaskLog {
  step: number;
  message: string;
  progress: number;
}

export interface TaskResult {
  taskId: string;
  taskType: string;
  result: any;
  duration: number;
}

export interface ScreenshotEvent {
  label: string;
  image: string; // base64 data URL
  filename: string;
}

type CloudEventHandler = {
  onStatusUpdate?: (status: CloudStatus) => void;
  onTaskStart?: (taskId: string, taskType: string, message: string) => void;
  onTaskLog?: (log: TaskLog) => void;
  onTaskComplete?: (result: TaskResult) => void;
  onTaskError?: (taskId: string, error: string) => void;
  onScreenshot?: (screenshot: ScreenshotEvent) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
};

class JarvisCloudEngine {
  private ws: WebSocket | null = null;
  private handlers: CloudEventHandler = {};
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  constructor() {
    // 자동 연결 시작
    this.connect();
  }

  /**
   * WebSocket 연결
   */
  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log('[CloudEngine] ✓ Connected to J.A.R.V.I.S. v5.0 Cloud');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.handlers.onConnected?.();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (e) {
          console.warn('[CloudEngine] 메시지 파싱 실패:', e);
        }
      };

      this.ws.onclose = () => {
        console.log('[CloudEngine] 연결 해제');
        this.isConnected = false;
        this.handlers.onDisconnected?.();
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.warn('[CloudEngine] WebSocket 에러:', error);
      };
    } catch (e) {
      console.warn('[CloudEngine] 연결 실패:', e);
      this.scheduleReconnect();
    }
  }

  /**
   * 재연결 스케줄링
   */
  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[CloudEngine] 최대 재연결 시도 초과');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      console.log(`[CloudEngine] 재연결 시도 ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);
      this.connect();
    }, delay);
  }

  /**
   * 메시지 핸들러
   */
  private handleMessage(data: any) {
    switch (data.type) {
      case 'welcome':
        this.handlers.onStatusUpdate?.({
          service: 'J.A.R.V.I.S. v5.0',
          status: 'operational',
          browserReady: data.status?.browserReady || false,
          uptime: data.status?.uptime || 0,
          currentTask: null,
          tasksCompleted: data.status?.tasksCompleted || 0,
          clientsConnected: data.status?.clientsConnected || 0,
          serverTime: data.timestamp
        });
        break;

      case 'task_start':
        this.handlers.onTaskStart?.(data.taskId, data.taskType, data.message);
        break;

      case 'task_log':
        this.handlers.onTaskLog?.({
          step: data.step,
          message: data.message,
          progress: data.progress
        });
        break;

      case 'task_complete':
        this.handlers.onTaskComplete?.({
          taskId: data.taskId,
          taskType: data.taskType,
          result: data.result,
          duration: data.duration
        });
        break;

      case 'task_error':
        this.handlers.onTaskError?.(data.taskId, data.error);
        break;

      case 'screenshot':
        this.handlers.onScreenshot?.({
          label: data.label,
          image: data.image,
          filename: data.filename
        });
        break;

      case 'status':
        this.handlers.onStatusUpdate?.(data as CloudStatus);
        break;

      case 'pong':
        // heartbeat 응답
        break;
    }
  }

  /**
   * 이벤트 핸들러 등록
   */
  setHandlers(handlers: CloudEventHandler) {
    this.handlers = { ...this.handlers, ...handlers };
  }

  /**
   * 작업 실행 요청 (WebSocket)
   */
  executeTask(taskType: string, params: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[CloudEngine] WebSocket 미연결 - REST fallback');
      return this.executeTaskREST(taskType, params);
    }

    this.ws.send(JSON.stringify({
      action: 'execute_web_task',
      taskType,
      params
    }));
  }

  /**
   * 작업 실행 (REST fallback)
   */
  async executeTaskREST(taskType: string, params: any) {
    try {
      const response = await fetch(`${CLOUD_SERVER}/api/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskType, params })
      });
      return await response.json();
    } catch (e) {
      console.error('[CloudEngine] REST 요청 실패:', e);
      throw e;
    }
  }

  /**
   * 서버 상태 조회 (REST)
   */
  async getStatus(): Promise<CloudStatus | null> {
    try {
      const response = await fetch(`${CLOUD_SERVER}/api/status`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (e) {
      console.warn('[CloudEngine] 상태 조회 실패:', e);
      return null;
    }
  }

  /**
   * 작업 히스토리 조회
   */
  async getHistory() {
    try {
      const response = await fetch(`${CLOUD_SERVER}/api/history`);
      return await response.json();
    } catch (e) {
      console.warn('[CloudEngine] 히스토리 조회 실패:', e);
      return { tasks: [] };
    }
  }

  /**
   * 연결 상태
   */
  get connected() {
    return this.isConnected;
  }

  /**
   * 연결 해제
   */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.ws) {
      this.ws.close();
    }
  }
}

// 싱글톤 인스턴스
export const cloudEngine = new JarvisCloudEngine();
export default cloudEngine;
