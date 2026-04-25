/**
 * 마누스 예약 자동화 태스크의 실시간 진행 상황을 추적하는 커스텀 훅
 * 
 * 사용법:
 * const { progress, status, isWaiting, waitingFor, error } = useManusBookingProgress(taskId);
 * 
 * - progress: 진행 상황 배열 (각 단계별 메시지)
 * - status: 현재 상태 ('running', 'waiting', 'stopped', 'error')
 * - isWaiting: 사용자 입력 대기 중인지 여부
 * - waitingFor: 대기 중인 입력 유형 ('captcha', 'otp', 'confirmation' 등)
 * - error: 에러 메시지
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { getManusTaskStatus, ManusTask, ManusWaitingDetail } from '../lib/manus-client';
import {
  analyzeManusTaskAndMakeDecision,
  canManusAutoResolve,
  getAutoRetryStrategy,
  type AutonomousContext,
} from '../lib/jarvis-brain-autonomous';

export interface BookingProgressState {
  taskId: string;
  status: 'idle' | 'running' | 'waiting' | 'stopped' | 'error';
  progress: Array<{
    step: number;
    message: string;
    timestamp: number;
    type: 'info' | 'success' | 'warning' | 'error';
  }>;
  currentStep: number;
  isWaiting: boolean;
  waitingFor?: 'captcha' | 'otp' | 'confirmation' | 'user_input' | null;
  waitingDescription?: string;
  error?: string;
  lastMessage?: string;
  autoResolveAttempt?: number;
}

export function useManusBookingProgress(
  taskId: string | null,
  onStatusChange?: (state: BookingProgressState) => void,
  autonomousContext?: AutonomousContext
) {
  const [state, setState] = useState<BookingProgressState>({
    taskId: taskId || '',
    status: 'idle',
    progress: [],
    currentStep: 0,
    isWaiting: false,
    autoResolveAttempt: 0,
  });

  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTaskStatusRef = useRef<ManusTask | null>(null);
  const autoRetryCountRef = useRef<number>(0);

  // ── 폴링 함수 ──
  const pollTaskStatus = useCallback(async () => {
    if (!taskId) return;

    try {
      const task = await getManusTaskStatus(taskId);
      lastTaskStatusRef.current = task;

      // 진행 상황 업데이트
      const newProgress = (task.progress || []).map((p, idx) => ({
        step: idx,
        message: p.content || '',
        timestamp: Date.parse(p.timestamp || new Date().toISOString()),
        type: p.type === 'error' ? 'error' : 'info' as const,
      }));

      // 상태 분석 및 자율 판단
      const decision = analyzeManusTaskAndMakeDecision(task, autonomousContext || {});

      // 대기 상태 분석
      let isWaiting = false;
      let waitingFor: BookingProgressState['waitingFor'] = null;
      let waitingDescription = '';

      if (task.status === 'waiting' && task.waiting_detail) {
        isWaiting = true;
        const eventType = task.waiting_detail.waiting_for_event_type?.toLowerCase() || '';
        if (eventType.includes('captcha')) waitingFor = 'captcha';
        else if (eventType.includes('otp')) waitingFor = 'otp';
        else if (eventType.includes('confirmation')) waitingFor = 'confirmation';
        else waitingFor = 'user_input';
        waitingDescription = task.waiting_detail.waiting_description;
      }

      const newState: BookingProgressState = {
        taskId,
        status: task.status as any,
        progress: newProgress,
        currentStep: newProgress.length,
        isWaiting,
        waitingFor,
        waitingDescription,
        error: task.status === 'error' ? decision.message : undefined,
        lastMessage: task.messages[task.messages.length - 1]?.content,
        autoResolveAttempt: autoRetryCountRef.current,
      };

      setState(newState);
      onStatusChange?.(newState);

      // 완료 또는 에러 시 폴링 중지
      if (task.status === 'stopped' || task.status === 'error') {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }

      // 에러 시 자동 재시도 로직
      if (task.status === 'error' && decision.action === 'retry') {
        const retryStrategy = getAutoRetryStrategy(
          task.messages[task.messages.length - 1]?.content || '',
          autoRetryCountRef.current
        );

        if (retryStrategy.shouldRetry) {
          autoRetryCountRef.current++;
          console.log(
            `[JARVIS] 자동 재시도 ${autoRetryCountRef.current}회차 (${retryStrategy.delayMs}ms 후)`
          );

          // 재시도 지연
          if (retryStrategy.delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, retryStrategy.delayMs));
          }

          // 재시도 트리거 (프론트엔드에서 처리)
          onStatusChange?.({
            ...newState,
            status: 'running',
            autoResolveAttempt: autoRetryCountRef.current,
          });
        }
      }
    } catch (error) {
      console.error('[JARVIS] 폴링 오류:', error);
      setState(prev => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : '폴링 오류',
      }));
    }
  }, [taskId, onStatusChange, autonomousContext]);

  // ── 폴링 시작/중지 ──
  useEffect(() => {
    if (!taskId) return;

    // 즉시 한 번 폴링
    pollTaskStatus();

    // 3초마다 폴링
    pollingIntervalRef.current = setInterval(pollTaskStatus, 3000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [taskId, pollTaskStatus]);

  // ── 진행 상황 초기화 ──
  const reset = useCallback(() => {
    setState({
      taskId: '',
      status: 'idle',
      progress: [],
      currentStep: 0,
      isWaiting: false,
      autoResolveAttempt: 0,
    });
    autoRetryCountRef.current = 0;
  }, []);

  return {
    ...state,
    reset,
    pollNow: pollTaskStatus,
  };
}

/**
 * 진행 상황을 사람이 읽기 좋은 형식으로 변환
 */
export function formatBookingProgress(progress: BookingProgressState['progress']): string {
  if (progress.length === 0) return '준비 중...';

  return progress
    .map((p, idx) => {
      const icon =
        p.type === 'success' ? '✅' : p.type === 'error' ? '❌' : p.type === 'warning' ? '⚠️' : '⏳';
      return `${icon} ${p.message}`;
    })
    .join('\n');
}

/**
 * 대기 상태를 사람이 읽기 좋은 메시지로 변환
 */
export function formatWaitingMessage(
  waitingFor: BookingProgressState['waitingFor'],
  description?: string
): string {
  switch (waitingFor) {
    case 'captcha':
      return '🔐 캡차 인증이 필요합니다. 화면에 표시된 캡차 코드를 말씀해 주세요.';
    case 'otp':
      return '📱 인증번호가 전송되었습니다. 받으신 인증번호를 말씀해 주세요.';
    case 'confirmation':
      return '✅ 예약 정보를 확인해 주세요. 맞으면 "확인" 또는 "네"라고 말씀해 주세요.';
    case 'user_input':
      return `⏸️ 입력이 필요합니다: ${description || '계속하려면 말씀해 주세요.'}`;
    default:
      return '대기 중...';
  }
}
