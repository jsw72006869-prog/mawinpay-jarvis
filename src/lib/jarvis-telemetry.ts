/**
 * JARVIS Telemetry System v4.1
 * 하이브리드 통신: CustomEvent(같은 탭) + BroadcastChannel(다른 탭)
 * 
 * 핵심 수정: BroadcastChannel은 같은 탭에서 자기 자신에게 메시지를 보내지 않는다.
 * 따라서 같은 탭 내 통신은 window.dispatchEvent(CustomEvent)를 사용하고,
 * 별도 탭(/mission-map)용으로 BroadcastChannel을 병행한다.
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
  from: string;
  to: string;
  speed: 'slow' | 'normal' | 'fast' | 'intense';
  color?: string;
}

export interface MissionLogPayload {
  icon: string;
  source: string;
  message: string;
  logType: 'info' | 'success' | 'error' | 'warn' | 'thinking';
  screenshot?: string; // base64 이미지 또는 URL (AgentConsolePanel에서 표시)
  extra?: Record<string, any>;
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
  // ─── 신규 모듈 노드 매핑 (v4.2) ───
  'market_intelligence':      { nodes: ['market_intel'],              speed: 'normal',  icon: '📈' },
  'influencer_agent':         { nodes: ['influencer', 'youtube', 'email'], speed: 'intense', icon: '🎯' },
  'rank_tracker':             { nodes: ['rank_tracker', 'smartstore'], speed: 'normal', icon: '🏆' },
  'naver_booking':            { nodes: ['booking'],                   speed: 'intense', icon: '📅' },
  'real_action_agent':        { nodes: ['booking', 'manus_agent'],    speed: 'intense', icon: '⚡' },
};

// ─── 채널 이름 ───
const CHANNEL_NAME = 'jarvis-telemetry-v4';
const CUSTOM_EVENT_NAME = 'jarvis-telemetry';

// ─── 싱글톤 채널 ───
let _channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  try {
    if (!_channel) {
      _channel = new BroadcastChannel(CHANNEL_NAME);
    }
    return _channel;
  } catch {
    return null;
  }
}

// ─── 하이브리드 발송: CustomEvent(같은 탭) + BroadcastChannel(다른 탭) ───
function emit(event: TelemetryEvent) {
  // 1) 같은 탭 내 통신 (CustomEvent) - 이것이 핵심!
  try {
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENT_NAME, { detail: event }));
  } catch {}

  // 2) 다른 탭 통신 (BroadcastChannel)
  try {
    const ch = getChannel();
    if (ch) ch.postMessage(event);
  } catch {}
}

// ─── 이벤트 발송 함수들 ───

/** 노드 상태 변경 */
export function emitNodeState(nodeId: string, state: NodeState, detail?: string, data?: Record<string, any>) {
  const event: TelemetryEvent = {
    type: 'node_state',
    timestamp: Date.now(),
    payload: { nodeId, state, detail, data } as NodeStatePayload,
  };
  emit(event);
  // 로컬 스토리지에도 최신 상태 저장
  try {
    const stored = JSON.parse(localStorage.getItem('jarvis-node-data') || '{}');
    stored[nodeId] = { state, detail, data, lastSync: new Date().toISOString() };
    localStorage.setItem('jarvis-node-data', JSON.stringify(stored));
  } catch {}
}

/** 펄스 라인 */
export function emitPulseLine(from: string, to: string, speed: PulseLinePayload['speed'] = 'normal', color?: string) {
  emit({
    type: 'pulse_line',
    timestamp: Date.now(),
    payload: { from, to, speed, color } as PulseLinePayload,
  });
}

/** 미션 로그 */
export function emitMissionLog(icon: string, source: string, message: string, logType: MissionLogPayload['logType'] = 'info', extra?: { screenshot?: string; [key: string]: any }) {
  emit({
    type: 'mission_log',
    timestamp: Date.now(),
    payload: { icon, source, message, logType, screenshot: extra?.screenshot, extra } as MissionLogPayload,
  });
}

/** 노드 데이터 업데이트 */
export function emitNodeData(nodeId: string, summary: Record<string, string | number>) {
  const lastSync = new Date().toISOString();
  emit({
    type: 'node_data',
    timestamp: Date.now(),
    payload: { nodeId, lastSync, summary } as NodeDataPayload,
  });
  try {
    const stored = JSON.parse(localStorage.getItem('jarvis-node-data') || '{}');
    stored[nodeId] = { ...(stored[nodeId] || {}), summary, lastSync };
    localStorage.setItem('jarvis-node-data', JSON.stringify(stored));
  } catch {}
}

/** 모닝 브리핑 시퀀스 */
export function emitBriefingSequence(phase: BriefingSequencePayload['phase'], focusNode?: string, message?: string) {
  emit({
    type: 'briefing_sequence',
    timestamp: Date.now(),
    payload: { phase, focusNode, message } as BriefingSequencePayload,
  });
}

// ─── 복합 헬퍼 ───

/** 함수 실행 시작 */
export function telemetryFunctionStart(functionName: string, detail?: string) {
  const mapping = FUNCTION_NODE_MAP[functionName];
  if (!mapping) return;

  mapping.nodes.forEach(nodeId => {
    emitNodeState(nodeId, 'active', detail || `${functionName} 실행 중...`);
    emitPulseLine('jarvis_brain', nodeId, mapping.speed);
  });

  emitMissionLog(mapping.icon, 'System', detail || `${functionName} 시작`, 'info');
}

/** 함수 실행 성공 */
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

  setTimeout(() => {
    mapping.nodes.forEach(nodeId => {
      emitNodeState(nodeId, 'idle');
    });
  }, 3000);
}

/** 함수 실행 에러 */
export function telemetryFunctionError(functionName: string, errorMsg: string) {
  const mapping = FUNCTION_NODE_MAP[functionName];
  if (!mapping) return;

  mapping.nodes.forEach(nodeId => {
    emitNodeState(nodeId, 'error', errorMsg);
  });

  emitMissionLog('⚠️', 'System', `${functionName} 오류: ${errorMsg}`, 'error');

  setTimeout(() => {
    mapping.nodes.forEach(nodeId => {
      emitNodeState(nodeId, 'idle');
    });
  }, 5000);
}

// ─── 수신 리스너 등록 (하이브리드: CustomEvent + BroadcastChannel 모두 수신) ───
export function onTelemetryEvent(callback: (event: TelemetryEvent) => void): () => void {
  // 1) CustomEvent 수신 (같은 탭)
  const customHandler = (e: Event) => {
    const ce = e as CustomEvent<TelemetryEvent>;
    if (ce.detail) callback(ce.detail);
  };
  window.addEventListener(CUSTOM_EVENT_NAME, customHandler);

  // 2) BroadcastChannel 수신 (다른 탭)
  let bcHandler: ((e: MessageEvent<TelemetryEvent>) => void) | null = null;
  const ch = getChannel();
  if (ch) {
    bcHandler = (e: MessageEvent<TelemetryEvent>) => {
      callback(e.data);
    };
    ch.addEventListener('message', bcHandler);
  }

  // cleanup
  return () => {
    window.removeEventListener(CUSTOM_EVENT_NAME, customHandler);
    if (ch && bcHandler) {
      ch.removeEventListener('message', bcHandler);
    }
  };
}

/** 채널 정리 */
export function closeTelemetry() {
  if (_channel) {
    _channel.close();
    _channel = null;
  }
}
