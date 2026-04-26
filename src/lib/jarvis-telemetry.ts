/**
 * JARVIS Telemetry System v4.0
 * BroadcastChannel 기반 실시간 이벤트 시스템
 * 채팅 탭 → 시스템 맵 탭 간 실시간 동기화
 */

// ─── 타입 정의 ───
export type NodeState = 'idle' | 'active' | 'success' | 'error';

export interface TelemetryEvent {
  type: 'node_state' | 'pulse_line' | 'mission_log' | 'node_data' | 'briefing_sequence' | 'system_status';
  timestamp: number;
  payload: any;
}

export interface NodeStatePayload {
  nodeId: string;
  state: NodeState;
  detail?: string;
  data?: Record<string, any>;
}

export interface PulseLinePayload {
  from: string;       // 'core' or node id
  to: string;         // node id
  speed: 'slow' | 'normal' | 'fast' | 'intense';
  color?: string;
}

export interface MissionLogPayload {
  icon: string;
  source: string;     // 'Gemini' | 'Manus' | 'System' | 'API'
  message: string;
  logType: 'info' | 'success' | 'error' | 'warn' | 'thinking';
}

export interface NodeDataPayload {
  nodeId: string;
  lastSync: string;
  summary: Record<string, string | number>;
}

export interface BriefingSequencePayload {
  phase: 'start' | 'scanning' | 'node_focus' | 'complete';
  focusNode?: string;
  message?: string;
}

// ─── 함수-노드 매핑 ───
export const FUNCTION_NODE_MAP: Record<string, { nodes: string[]; speed: PulseLinePayload['speed']; icon: string }> = {
  'smartstore_action':        { nodes: ['smartstore'],                speed: 'normal',  icon: '🛒' },
  'morning_briefing':         { nodes: ['smartstore', 'email', 'sheets', 'youtube'], speed: 'normal', icon: '☀️' },
  'search_youtube':           { nodes: ['youtube'],                   speed: 'normal',  icon: '🔍' },
  'search_naver':             { nodes: ['naver'],                     speed: 'normal',  icon: '🔍' },
  'search_instagram':         { nodes: ['instagram'],                 speed: 'normal',  icon: '📸' },
  'analyze_influencers_smart':{ nodes: ['manus_agent', 'youtube'],    speed: 'intense', icon: '🧠' },
  'execute_web_task':         { nodes: ['manus_agent'],               speed: 'intense', icon: '🤖' },
  'send_email_campaign':      { nodes: ['email'],                     speed: 'normal',  icon: '✉️' },
  'generate_report':          { nodes: ['jarvis_brain'],              speed: 'slow',    icon: '📊' },
  'read_google_sheet':        { nodes: ['sheets'],                    speed: 'slow',    icon: '📋' },
  'save_to_google_sheet':     { nodes: ['sheets'],                    speed: 'normal',  icon: '💾' },
  'generate_banner':          { nodes: ['jarvis_brain'],              speed: 'normal',  icon: '🎨' },
};

// ─── 채널 이름 ───
const CHANNEL_NAME = 'jarvis-telemetry-v4';

// ─── 싱글톤 채널 ───
let _channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel {
  if (!_channel) {
    _channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return _channel;
}

// ─── 이벤트 발송 함수들 ───

/** 노드 상태 변경 */
export function emitNodeState(nodeId: string, state: NodeState, detail?: string, data?: Record<string, any>) {
  const event: TelemetryEvent = {
    type: 'node_state',
    timestamp: Date.now(),
    payload: { nodeId, state, detail, data } as NodeStatePayload,
  };
  getChannel().postMessage(event);
  // 로컬 스토리지에도 최신 상태 저장 (인스펙터용)
  try {
    const stored = JSON.parse(localStorage.getItem('jarvis-node-data') || '{}');
    stored[nodeId] = { state, detail, data, lastSync: new Date().toISOString() };
    localStorage.setItem('jarvis-node-data', JSON.stringify(stored));
  } catch {}
}

/** 펄스 라인 (데이터 전송 애니메이션) */
export function emitPulseLine(from: string, to: string, speed: PulseLinePayload['speed'] = 'normal', color?: string) {
  const event: TelemetryEvent = {
    type: 'pulse_line',
    timestamp: Date.now(),
    payload: { from, to, speed, color } as PulseLinePayload,
  };
  getChannel().postMessage(event);
}

/** 미션 로그 */
export function emitMissionLog(icon: string, source: string, message: string, logType: MissionLogPayload['logType'] = 'info') {
  const event: TelemetryEvent = {
    type: 'mission_log',
    timestamp: Date.now(),
    payload: { icon, source, message, logType } as MissionLogPayload,
  };
  getChannel().postMessage(event);
}

/** 노드 데이터 업데이트 (인스펙터용) */
export function emitNodeData(nodeId: string, summary: Record<string, string | number>) {
  const lastSync = new Date().toISOString();
  const event: TelemetryEvent = {
    type: 'node_data',
    timestamp: Date.now(),
    payload: { nodeId, lastSync, summary } as NodeDataPayload,
  };
  getChannel().postMessage(event);
  // 로컬 스토리지에도 저장
  try {
    const stored = JSON.parse(localStorage.getItem('jarvis-node-data') || '{}');
    stored[nodeId] = { ...(stored[nodeId] || {}), summary, lastSync };
    localStorage.setItem('jarvis-node-data', JSON.stringify(stored));
  } catch {}
}

/** 모닝 브리핑 시퀀스 */
export function emitBriefingSequence(phase: BriefingSequencePayload['phase'], focusNode?: string, message?: string) {
  const event: TelemetryEvent = {
    type: 'briefing_sequence',
    timestamp: Date.now(),
    payload: { phase, focusNode, message } as BriefingSequencePayload,
  };
  getChannel().postMessage(event);
}

// ─── 복합 헬퍼: 함수 실행 시 자동 텔레메트리 ───

/** 함수 실행 시작 시 호출 */
export function telemetryFunctionStart(functionName: string, detail?: string) {
  const mapping = FUNCTION_NODE_MAP[functionName];
  if (!mapping) return;

  // 관련 노드 활성화
  mapping.nodes.forEach(nodeId => {
    emitNodeState(nodeId, 'active', detail || `${functionName} 실행 중...`);
    emitPulseLine('jarvis_brain', nodeId, mapping.speed);
  });

  // 미션 로그
  emitMissionLog(mapping.icon, 'System', detail || `${functionName} 시작`, 'info');
}

/** 함수 실행 성공 시 호출 */
export function telemetryFunctionSuccess(functionName: string, detail?: string, data?: Record<string, any>) {
  const mapping = FUNCTION_NODE_MAP[functionName];
  if (!mapping) return;

  mapping.nodes.forEach(nodeId => {
    emitNodeState(nodeId, 'success', detail || `${functionName} 완료`, data);
    if (data) {
      emitNodeData(nodeId, data);
    }
  });

  emitMissionLog('✅', 'System', detail || `${functionName} 완료`, 'success');

  // 3초 후 idle로 복귀
  setTimeout(() => {
    mapping.nodes.forEach(nodeId => {
      emitNodeState(nodeId, 'idle');
    });
  }, 3000);
}

/** 함수 실행 에러 시 호출 */
export function telemetryFunctionError(functionName: string, errorMsg: string) {
  const mapping = FUNCTION_NODE_MAP[functionName];
  if (!mapping) return;

  mapping.nodes.forEach(nodeId => {
    emitNodeState(nodeId, 'error', errorMsg);
  });

  emitMissionLog('⚠️', 'System', `${functionName} 오류: ${errorMsg}`, 'error');

  // 5초 후 idle로 복귀
  setTimeout(() => {
    mapping.nodes.forEach(nodeId => {
      emitNodeState(nodeId, 'idle');
    });
  }, 5000);
}

// ─── 수신 리스너 등록 ───
export function onTelemetryEvent(callback: (event: TelemetryEvent) => void): () => void {
  const channel = getChannel();
  const handler = (e: MessageEvent<TelemetryEvent>) => {
    callback(e.data);
  };
  channel.addEventListener('message', handler);
  return () => channel.removeEventListener('message', handler);
}

/** 채널 정리 */
export function closeTelemetry() {
  if (_channel) {
    _channel.close();
    _channel = null;
  }
}
