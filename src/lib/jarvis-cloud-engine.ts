/**
 * J.A.R.V.I.S. v5.0 — Cloud Engine Client
 * 
 * Persistent VM 백엔드와의 REST 통신 레이어
 * HTTPS 프론트엔드에서 안전하게 HTTP 백엔드와 통신
 * 프론트엔드 HUD에 실시간 서버 상태, 작업 진행률을 전달
 */

// Vercel API 프록시를 통해 클라우드 서버에 접근 (HTTPS→HTTP 프록시)
const CLOUD_SERVER = import.meta.env.VITE_CLOUD_SERVER_URL || 'http://35.243.215.119:3001';

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
  image: string;
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
  private handlers: CloudEventHandler = {};
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isConnected = false;
  private pollInterval = 10000; // 10초마다 상태 확인

  constructor() {
    // 자동 상태 폴링 시작
    this.startPolling();
  }

  /**
   * REST 기반 상태 폴링 시작
   */
  private startPolling() {
    // 즉시 1회 확인
    this.checkStatus();
    
    // 주기적 폴링
    this.pollTimer = setInterval(() => {
      this.checkStatus();
    }, this.pollInterval);
  }

  /**
   * 서버 상태 확인
   */
  private async checkStatus() {
    try {
      // Vercel API 프록시를 통해 접근 (CORS/HTTPS 문제 우회)
      const proxyUrl = `/api/cloud-proxy?endpoint=status`;
      const response = await fetch(proxyUrl, { 
        signal: AbortSignal.timeout(5000) 
      });
      
      if (!response.ok) {
        // 프록시 실패 시 직접 접근 시도 (개발 환경)
        const directResponse = await fetch(`${CLOUD_SERVER}/api/status`, {
          signal: AbortSignal.timeout(5000)
        });
        if (!directResponse.ok) throw new Error(`HTTP ${directResponse.status}`);
        const data = await directResponse.json();
        this.handleStatusResponse(data);
        return;
      }
      
      const data = await response.json();
      this.handleStatusResponse(data);
    } catch (e) {
      if (this.isConnected) {
        this.isConnected = false;
        this.handlers.onDisconnected?.();
      }
    }
  }

  /**
   * 상태 응답 처리
   */
  private handleStatusResponse(data: any) {
    if (!this.isConnected) {
      this.isConnected = true;
      this.handlers.onConnected?.();
    }

    this.handlers.onStatusUpdate?.({
      service: data.service || 'J.A.R.V.I.S. v5.0',
      status: data.status === 'operational' ? 'operational' : 'degraded',
      browserReady: data.browserReady || false,
      uptime: data.uptime || 0,
      currentTask: data.currentTask || null,
      tasksCompleted: data.tasksCompleted || 0,
      clientsConnected: data.clientsConnected || 0,
      serverTime: data.serverTime || new Date().toISOString()
    });
  }

  /**
   * 이벤트 핸들러 등록
   */
  setHandlers(handlers: CloudEventHandler) {
    this.handlers = { ...this.handlers, ...handlers };
  }

  /**
   * 작업 실행 요청 (REST via Vercel proxy)
   */
  async executeTask(taskType: string, params: any): Promise<any> {
    try {
      // Vercel API 프록시를 통해 작업 실행
      const response = await fetch(`/api/cloud-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: 'task', taskType, params })
      });
      
      if (!response.ok) {
        // 프록시 실패 시 직접 접근
        const directResponse = await fetch(`${CLOUD_SERVER}/api/task`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskType, params })
        });
        return await directResponse.json();
      }
      
      const result = await response.json();
      
      if (result.taskId) {
        this.handlers.onTaskStart?.(result.taskId, taskType, result.message || '작업 시작');
      }
      
      return result;
    } catch (e) {
      console.error('[CloudEngine] 작업 실행 실패:', e);
      this.handlers.onTaskError?.('', String(e));
      throw e;
    }
  }

  /**
   * 서버 상태 조회 (REST)
   */
  async getStatus(): Promise<CloudStatus | null> {
    try {
      const response = await fetch(`/api/cloud-proxy?endpoint=status`, {
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) {
        const directResponse = await fetch(`${CLOUD_SERVER}/api/status`, {
          signal: AbortSignal.timeout(5000)
        });
        if (!directResponse.ok) throw new Error(`HTTP ${directResponse.status}`);
        return await directResponse.json();
      }
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
      const response = await fetch(`/api/cloud-proxy?endpoint=history`);
      if (!response.ok) {
        const directResponse = await fetch(`${CLOUD_SERVER}/api/history`);
        return await directResponse.json();
      }
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
   * 폴링 중지
   */
  disconnect() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isConnected = false;
  }
}

// 싱글톤 인스턴스
export const cloudEngine = new JarvisCloudEngine();
export default cloudEngine;
