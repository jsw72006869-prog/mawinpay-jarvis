// jarvis-memory.ts — 영구 대화 기억 시스템
// 앱을 껐다 켜도 모든 대화를 기억하고, 과거 대화를 학습 데이터로 활용

export interface ConversationEntry {
  id: string;
  timestamp: string;
  role: 'user' | 'assistant';
  content: string;
  sessionId: string;
}

export interface LearnedKnowledge {
  id: string;
  title: string;
  content: string;
  addedAt: string;
  source: 'auto' | 'manual'; // auto=대화에서 자동 추출, manual=사용자가 직접 추가
}

const STORAGE_KEYS = {
  CONVERSATION_LOG: 'jarvis_conversation_log',
  LEARNED_KNOWLEDGE: 'jarvis_learned_knowledge',
  SESSION_ID: 'jarvis_session_id',
  TOTAL_TURNS: 'jarvis_total_turns',
};

// ── 세션 ID 관리 ──
export function getCurrentSessionId(): string {
  let sid = sessionStorage.getItem(STORAGE_KEYS.SESSION_ID);
  if (!sid) {
    sid = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    sessionStorage.setItem(STORAGE_KEYS.SESSION_ID, sid);
  }
  return sid;
}

// ── 전체 대화 로그 저장 ──
export function saveConversationEntry(role: 'user' | 'assistant', content: string): void {
  try {
    const log = getConversationLog();
    const entry: ConversationEntry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      timestamp: new Date().toISOString(),
      role,
      content,
      sessionId: getCurrentSessionId(),
    };
    log.push(entry);

    // 최대 2000개 유지 (오래된 것부터 삭제)
    if (log.length > 2000) log.splice(0, log.length - 2000);

    localStorage.setItem(STORAGE_KEYS.CONVERSATION_LOG, JSON.stringify(log));

    // 총 대화 수 업데이트
    const total = parseInt(localStorage.getItem(STORAGE_KEYS.TOTAL_TURNS) || '0') + 1;
    localStorage.setItem(STORAGE_KEYS.TOTAL_TURNS, total.toString());
  } catch (e) {
    console.warn('[JARVIS Memory] 저장 실패:', e);
  }
}

// ── 전체 대화 로그 불러오기 ──
export function getConversationLog(): ConversationEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.CONVERSATION_LOG) || '[]');
  } catch {
    return [];
  }
}

// ── 최근 N개 대화를 GPT 형식으로 변환 ──
export function getRecentConversationsForGPT(maxTurns = 30): { role: 'user' | 'assistant'; content: string }[] {
  const log = getConversationLog();
  // 최근 maxTurns * 2개 항목 (user + assistant 쌍)
  const recent = log.slice(-maxTurns * 2);
  return recent.map(e => ({ role: e.role, content: e.content }));
}

// ── 이전 세션 대화 요약 컨텍스트 생성 ──
export function getPreviousSessionSummary(): string {
  const log = getConversationLog();
  const currentSid = getCurrentSessionId();
  const prevEntries = log.filter(e => e.sessionId !== currentSid);

  if (prevEntries.length === 0) return '';

  // 이전 세션 중 최근 20개 항목만 요약
  const recent = prevEntries.slice(-20);
  const lines = recent.map(e => {
    const time = new Date(e.timestamp).toLocaleDateString('ko-KR', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
    const speaker = e.role === 'user' ? '선생님' : 'JARVIS';
    return `[${time}] ${speaker}: ${e.content.substring(0, 100)}${e.content.length > 100 ? '...' : ''}`;
  }).join('\n');

  const totalTurns = parseInt(localStorage.getItem(STORAGE_KEYS.TOTAL_TURNS) || '0');

  return `\n\n[이전 대화 기록 — 총 ${totalTurns}번의 대화 중 최근 기록]\n${lines}`;
}

// ── 학습 지식 저장 ──
export function saveLearnedKnowledge(title: string, content: string, source: 'auto' | 'manual' = 'manual'): LearnedKnowledge {
  const knowledge = getLearnedKnowledge();
  const entry: LearnedKnowledge = {
    id: `know_${Date.now()}`,
    title,
    content,
    addedAt: new Date().toISOString(),
    source,
  };

  // 같은 제목이 있으면 업데이트
  const existingIdx = knowledge.findIndex(k => k.title.toLowerCase() === title.toLowerCase());
  if (existingIdx >= 0) {
    knowledge[existingIdx] = entry;
  } else {
    knowledge.push(entry);
  }

  // 최대 100개 유지
  if (knowledge.length > 100) knowledge.splice(0, knowledge.length - 100);

  localStorage.setItem(STORAGE_KEYS.LEARNED_KNOWLEDGE, JSON.stringify(knowledge));
  return entry;
}

// ── 학습 지식 불러오기 ──
export function getLearnedKnowledge(): LearnedKnowledge[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.LEARNED_KNOWLEDGE) || '[]');
  } catch {
    return [];
  }
}

// ── 학습 지식을 시스템 프롬프트 형식으로 변환 ──
export function getLearnedKnowledgeContext(): string {
  const knowledge = getLearnedKnowledge();
  if (knowledge.length === 0) return '';

  const lines = knowledge.map(k => `• [${k.title}] ${k.content}`).join('\n');
  return `\n\n[JARVIS 학습된 지식 — 선생님이 가르쳐주신 내용]\n${lines}`;
}

// ── 대화에서 핵심 정보 자동 추출 및 저장 ──
export function autoExtractAndSave(userMessage: string, assistantResponse: string): void {
  // 이름 패턴
  const nameMatch = userMessage.match(/내\s*이름은?\s*([가-힣a-zA-Z]{2,10})/);
  if (nameMatch) {
    saveLearnedKnowledge('선생님 이름', nameMatch[1], 'auto');
  }

  // 회사/브랜드 패턴
  const companyMatch = userMessage.match(/(?:우리|저희|내)\s*(?:회사|브랜드|사업)(?:은|는|이)?\s*([가-힣a-zA-Z0-9\s]{2,20})/);
  if (companyMatch) {
    saveLearnedKnowledge('선생님 회사/브랜드', companyMatch[1].trim(), 'auto');
  }

  // 제품 패턴
  const productMatch = userMessage.match(/(?:우리|저희|내)\s*제품(?:은|는|이)?\s*([가-힣a-zA-Z0-9\s]{2,30})/);
  if (productMatch) {
    saveLearnedKnowledge('주요 제품', productMatch[1].trim(), 'auto');
  }

  // 목표 패턴
  const goalMatch = userMessage.match(/(?:목표|목적|계획)(?:은|는|이)?\s*([가-힣a-zA-Z0-9\s,]{5,50})/);
  if (goalMatch) {
    saveLearnedKnowledge('선생님 목표', goalMatch[1].trim(), 'auto');
  }

  void assistantResponse; // 미래 확장용
}

// ── 대화 통계 ──
export function getMemoryStats(): {
  totalTurns: number;
  totalSessions: number;
  knowledgeCount: number;
  oldestEntry: string | null;
} {
  const log = getConversationLog();
  const knowledge = getLearnedKnowledge();
  const sessions = new Set(log.map(e => e.sessionId)).size;
  const oldest = log.length > 0 ? new Date(log[0].timestamp).toLocaleDateString('ko-KR') : null;

  return {
    totalTurns: parseInt(localStorage.getItem(STORAGE_KEYS.TOTAL_TURNS) || '0'),
    totalSessions: sessions,
    knowledgeCount: knowledge.length,
    oldestEntry: oldest,
  };
}

// ── 메모리 초기화 ──
export function clearAllMemory(): void {
  localStorage.removeItem(STORAGE_KEYS.CONVERSATION_LOG);
  localStorage.removeItem(STORAGE_KEYS.LEARNED_KNOWLEDGE);
  localStorage.removeItem(STORAGE_KEYS.TOTAL_TURNS);
  localStorage.removeItem('jarvis_memory'); // 기존 장기 메모리도 초기화
  console.log('[JARVIS Memory] 전체 메모리 초기화됨');
}

// ── API 키 관리 (Settings UI용) ──
const API_KEY_STORAGE = 'jarvis_api_keys';

export interface ApiKeys {
  openaiKey: string;
  elevenLabsKey: string;
  elevenLabsVoiceId: string;
}

export function getApiKeys(): ApiKeys {
  try {
    const stored = JSON.parse(localStorage.getItem(API_KEY_STORAGE) || '{}');
    return {
      openaiKey: stored.openaiKey || import.meta.env.VITE_OPENAI_API_KEY || '',
      elevenLabsKey: stored.elevenLabsKey || import.meta.env.VITE_ELEVENLABS_API_KEY || '',
      elevenLabsVoiceId: stored.elevenLabsVoiceId || localStorage.getItem('jarvis_voice_id') || 'pNInz6obpgDQGcFmaJgB',
    };
  } catch {
    return { openaiKey: '', elevenLabsKey: '', elevenLabsVoiceId: 'pNInz6obpgDQGcFmaJgB' };
  }
}

export function saveApiKeys(keys: Partial<ApiKeys>): void {
  const current = getApiKeys();
  const updated = { ...current, ...keys };
  localStorage.setItem(API_KEY_STORAGE, JSON.stringify(updated));
  // 목소리 ID는 기존 저장소에도 동기화
  if (keys.elevenLabsVoiceId) {
    localStorage.setItem('jarvis_voice_id', keys.elevenLabsVoiceId);
  }
  console.log('[JARVIS Settings] API 키 저장됨');
}

// ═══════════════════════════════════════════════════════
// 서버 동기화 — localStorage + 서버 이중 저장
// ═══════════════════════════════════════════════════════

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let pendingEntries: ConversationEntry[] = [];

/**
 * 서버에 대화 항목 하나 추가 (비동기, 실패해도 무시)
 */
async function appendToServer(entry: ConversationEntry): Promise<void> {
  try {
    await fetch('/api/memory-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'append', entry }),
    });
  } catch {
    // 서버 저장 실패 시 pending에 추가
    pendingEntries.push(entry);
  }
}

/**
 * 서버에 학습 지식 저장
 */
async function learnToServer(knowledgeItem: LearnedKnowledge): Promise<void> {
  try {
    await fetch('/api/memory-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'learn', knowledgeItem }),
    });
  } catch {
    // 무시
  }
}

/**
 * 전체 메모리를 서버에 동기화 (배치)
 */
export async function syncMemoryToServer(): Promise<{ success: boolean; totalTurns?: number }> {
  try {
    const conversations = getConversationLog();
    const knowledge = getLearnedKnowledge();
    const res = await fetch('/api/memory-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync', conversations, knowledge }),
    });
    const data = await res.json();
    if (data.success) {
      pendingEntries = []; // pending 클리어
      console.log(`[JARVIS Memory] 서버 동기화 완료: ${data.totalTurns}턴`);
    }
    return data;
  } catch (e) {
    console.warn('[JARVIS Memory] 서버 동기화 실패:', e);
    return { success: false };
  }
}

/**
 * 서버에서 메모리 복원 (앱 시작 시 호출)
 */
export async function restoreMemoryFromServer(): Promise<boolean> {
  try {
    const res = await fetch('/api/memory-sync?action=load');
    const data = await res.json();
    if (data.success && data.data) {
      const serverConvos = data.data.conversations || [];
      const serverKnowledge = data.data.knowledge || [];
      const localConvos = getConversationLog();
      const localKnowledge = getLearnedKnowledge();

      // 서버 데이터가 로컬보다 많으면 서버 데이터로 복원
      if (serverConvos.length > localConvos.length) {
        localStorage.setItem(STORAGE_KEYS.CONVERSATION_LOG, JSON.stringify(serverConvos));
        console.log(`[JARVIS Memory] 서버에서 대화 복원: ${serverConvos.length}건`);
      }
      if (serverKnowledge.length > localKnowledge.length) {
        localStorage.setItem(STORAGE_KEYS.LEARNED_KNOWLEDGE, JSON.stringify(serverKnowledge));
        console.log(`[JARVIS Memory] 서버에서 학습 지식 복원: ${serverKnowledge.length}건`);
      }
      return true;
    }
    return false;
  } catch {
    console.warn('[JARVIS Memory] 서버 복원 실패 — 로컬 데이터 사용');
    return false;
  }
}

/**
 * 대화 저장 + 서버 동기화 (기존 saveConversationEntry 확장)
 */
export function saveConversationWithSync(role: 'user' | 'assistant', content: string): void {
  // 1. 로컬 저장 (기존 로직)
  saveConversationEntry(role, content);

  // 2. 서버에 비동기 전송
  const entry: ConversationEntry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    timestamp: new Date().toISOString(),
    role,
    content,
    sessionId: getCurrentSessionId(),
  };
  appendToServer(entry);

  // 3. 디바운스 전체 동기화 (30초마다)
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncMemoryToServer();
  }, 30000);
}

/**
 * 학습 지식 저장 + 서버 동기화
 */
export function saveLearnedKnowledgeWithSync(title: string, content: string, source: 'auto' | 'manual' = 'manual'): LearnedKnowledge {
  const entry = saveLearnedKnowledge(title, content, source);
  learnToServer(entry);
  return entry;
}

/**
 * 현재 UI 데이터를 GPT 컨텍스트로 변환
 */
export function buildUIContextForGPT(activePanel: string | null, panelData: any): string {
  if (!activePanel || !panelData) return '';

  let context = '\n\n[현재 화면에 표시된 데이터]\n';

  if (activePanel === 'orders' && panelData.orders) {
    const orders = panelData.orders;
    const newOrders = orders.filter((o: any) => o.status === 'new').length;
    const shipping = orders.filter((o: any) => o.status === 'shipping').length;
    const totalRevenue = orders.reduce((s: number, o: any) => s + (o.price * o.quantity), 0);
    context += `주문 대시보드가 열려있습니다.\n`;
    context += `- 총 주문: ${orders.length}건\n`;
    context += `- 신규주문: ${newOrders}건\n`;
    context += `- 배송중: ${shipping}건\n`;
    context += `- 총 매출: ${totalRevenue.toLocaleString()}원\n`;
    // 최근 5건 상세
    const recent = orders.slice(0, 5);
    context += `최근 주문:\n`;
    recent.forEach((o: any) => {
      context += `  ${o.productName} ${o.quantity}개 ${o.price.toLocaleString()}원 (${o.buyerName}, ${o.status})\n`;
    });
  }

  if (activePanel === 'influencers' && panelData.influencers) {
    const inf = panelData.influencers;
    context += `인플루언서 카드가 열려있습니다.\n`;
    context += `- 총 수집: ${inf.length || 0}명\n`;
    if (Array.isArray(inf)) {
      inf.slice(0, 5).forEach((i: any) => {
        context += `  ${i.name || i.channelName} (${i.platform}, 팔로워: ${i.followers?.toLocaleString() || '?'})\n`;
      });
    }
  }

  if (activePanel === 'booking' && panelData.booking) {
    context += `예약 패널이 열려있습니다.\n`;
    context += `- 날짜: ${panelData.booking.date || '미선택'}\n`;
    context += `- 시간: ${panelData.booking.time || '미선택'}\n`;
  }

  return context;
}
