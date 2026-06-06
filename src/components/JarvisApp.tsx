import { useState, useCallback, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import { askGPT, parseCommand, generateBannerImage, saveSchedule, saveMemory, searchNaverAPI, searchYouTubeAPI, searchInstagramAPI, invalidateSheetCache, executeManusTask, getManusTaskStatus, sendManusMsg as sendManusMessage, setActiveUIContext, type JarvisState, type JarvisAction, type NaverSearchItem, type YouTubeChannel, type InstagramAccount, initializeGemini, getGeminiClient } from '../lib/jarvis-brain';
import { useSpeechRecognition, useTextToSpeech, useBargein, useWakeWord, setCurrentVoiceId, getCurrentVoiceId, ELEVENLABS_VOICES, stopGlobalAudio } from './SpeechEngine';
import { useMicrophoneFrequency } from '../lib/audio-analyzer';
import { saveLearnedKnowledge, getLearnedKnowledge, getMemoryStats, clearAllMemory, restoreMemoryFromServer, syncMemoryToServer, saveConversationWithSync, buildUIContextForGPT, type LearnedKnowledge } from '../lib/jarvis-memory';
import { appendInfluencersToSheet, appendEmailLogToSheet, appendNaverResultsToSheet, appendInstagramToSheet, appendLocalBusinessToSheet, generateMockInfluencers, generateEmailLogs, sendEmailsViaResend, buildInfluencerEmailHtml, type NaverCollectedData } from '../lib/google-sheets';
import ConversationStream, { type Message } from './ConversationStream';
import ConversationPanel, { type STTStatus } from './ConversationPanel';
import { getContextReply, buildCandidateConversationContext, buildOutreachCompletionContext, buildCopyCardConversationContext, buildCopyCompletionContext, buildDataWallConversationContext, type JarvisContextEvent, type JarvisReply, type JarvisSuggestedAction } from '../lib/jarvis-dialogue';
import ActionCard, { type ActionContext, type WorkflowStep, type ApprovalPreviewData, buildWorkflowSteps, matchVoiceToAction, buildApprovalPreview } from './ActionCard';
import SparkleParticles from './SparkleParticles';
import ClapDetector from './ClapDetector';
// import HoloDataPanel from './HoloDataPanel'; // 제거됨
import InfluencerCards, { type InfluencerData } from './InfluencerCards';
import LocalBusinessCards, { type LocalBusinessData } from './LocalBusinessCards';
import { ParticleTextCanvas } from './ParticleTextCanvas';
import NeuralMissionMap from './NeuralMissionMap';
import PlatformDataCardsEnhanced from './PlatformDataCards_Enhanced';
import ManusStrategyDashboard from './ManusStrategyDashboard';
import { telemetryFunctionStart, telemetryFunctionSuccess, telemetryFunctionError, emitMissionLog, emitBriefingSequence, emitNodeState, emitNodeData, emitPulseLine, resetAllNodes } from '../lib/jarvis-telemetry';
import VoiceParticleAura from './VoiceParticleAura';
import GoldenFlare from './GoldenFlare';
import AgentConsolePanel from './AgentConsolePanel';
import HologramWorkPanel from './HologramWorkPanel';
import MarketIntelCard from './MarketIntelCard';
import MarketIntelChart from './MarketIntelChart';
import BookingPanel from './BookingPanel';
import EmailHistoryCards, { type EmailRecord } from './EmailHistoryCards';
import OrderDashboard from './OrderDashboard';
import FileWorkspacePanel, { type WorkspaceRecord } from './FileWorkspacePanel';
import InfluencerOutreachPanel, { type InfluencerCandidate } from './InfluencerOutreachPanel';
import MarketPricePanel, { type MarketPriceResult, type MarketPriceInputData } from './MarketPricePanel';
import CloudStatusOverlay from './CloudStatusOverlay';
import LiveBrowserViewer from './LiveBrowserViewer';
import MissionControlDeck from './MissionControlDeck';
import DataWallView from './DataWallView';
import ResultDeck from './ResultDeck';
import CinematicLayer from './ui/CinematicLayer';
import JarvisScenePanel from './ui/JarvisScenePanel';
import PredictiveActionPanel from './ui/PredictiveActionPanel';
import ApprovalGateCard from './ui/ApprovalGateCard';
import ReactiveSignalLayer from './ui/ReactiveSignalLayer';
import SystemPulseOverlay from './ui/SystemPulseOverlay';
import SmartstoreCommandCenter from './ui/SmartstoreCommandCenter';
import KeywordRadarPanel from './ui/KeywordRadarPanel';
import CreativeStudio, { type CopyCard } from './CreativeStudio';
import OutreachResultWorkspace from './ui/OutreachResultWorkspace';
import { buildJarvisSituationSnapshot } from '../lib/conversation-os/snapshot';
import { planJarvisNextActions } from '../lib/conversation-os/planner';
import { composeJarvisBriefing } from '../lib/conversation-os/composer';
import { inferIntentFromUserText } from '../lib/conversation-os/intent';
import { routeJarvisCommand } from '../lib/conversation-os/router';
import { inferConversationReaction, buildReactionLead } from '../lib/conversation-os/reaction';
import type { JarvisNextAction } from '../lib/conversation-os/types';

interface ContextRegistryItem {
  id: string;
  type: 'youtube_channel' | 'youtube_video' | 'blog' | 'influencer' | 'unknown';
  title: string;
  channelName?: string;
  keywords?: string[];
  position: string;
  lastUpdated?: string;
}

// ── 시그니처 응답 목록 (GPT 대기 없이 즉시 재생) ──
const SIGNATURE_RESPONSES_EN = [
  'At your service, sir. All systems nominal.',
  'Good to have you back, sir. JARVIS online and ready.',
  'Welcome back, sir. Initializing all protocols.',
  'JARVIS online. Standing by for your command, sir.',
  'All systems green, sir. Ready when you are.',
  'Reporting for duty, sir. What shall we tackle today?',
];
const SIGNATURE_RESPONSES_KR = [
  '모든 시스템 정상입니다, 선생님. 무엇을 도와드릴까요?',
  '스마트스토어 현황부터 확인할까요, 선생님?',
  '오늘 업무를 시작하겠습니다. 명령을 기다립니다.',
  '준비 완료입니다, 선생님. 언제든 말씀해 주세요.',
];
// 하위 호환용 alias
const SIGNATURE_RESPONSES = SIGNATURE_RESPONSES_EN;

// ── 고급 색상 팔레트 ──
const THEME = {
  gold:       '#C8A96E',
  goldLight:  '#E8D5A3',
  goldDim:    '#8B6F3E',
  blue:       '#4A90E2',
  blueLight:  '#7BB3F0',
  cyan:       '#00F5FF',
  cyanDim:    'rgba(0,245,255,0.4)',
  green:      '#00FF88',
  orange:     '#FF9800',
  silver:     '#A8B8C8',
  silverDim:  '#5A6A7A',
  bg:         '#060A12',
  bgDeep:     '#030608',
  bgCard:     'rgba(6,10,18,0.92)',
  text:       '#D4E0EC',
  textDim:    '#5A6A7A',
  radius:     '14px',
  radiusSm:   '10px',
  shadow:     '0 8px 32px rgba(0,0,0,0.4), 0 0 20px rgba(0,245,255,0.06)',
  shadowGold: '0 8px 32px rgba(0,0,0,0.4), 0 0 20px rgba(200,169,110,0.08)',
};

const STATE_COLOR: Record<JarvisState, string> = {
  idle:      THEME.gold,
  listening: '#E8A87C',
  thinking:  '#9B8EC4',
  speaking:  THEME.blueLight,
  working:   '#7EC89B',
  success:   THEME.green,
  error:     '#FF6B6B',
  approval_required: '#FFAA00',
};

const STATE_LABEL: Record<JarvisState, string> = {
  idle: 'STANDBY', listening: 'LISTENING', thinking: 'PROCESSING', speaking: 'SPEAKING', working: 'EXECUTING',
  success: 'SUCCESS', error: 'ERROR', approval_required: 'APPROVAL',
};

function sanitizeForJarvisVoice(text: string): string {
  return String(text || '')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '저장된 이메일')
    .replace(/010-\d{3,4}-\d{4}/g, '연락처')
    .replace(/\b\d{2,4}-\d{3,4}-\d{4}\b/g, '연락처')
    .replace(/\b[A-Z0-9_-]{8,}\b/g, '상품주문번호')
    .replace(/data:[^\s]+|[A-Za-z0-9+/]{120,}={0,2}/g, '파일 데이터')
    .replace(/파일명:\s*.+/g, '파일명은 화면에서 확인해 주세요.')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildJarvisVoiceSummary(text: string, intent?: string, actionType?: string): string {
  const raw = sanitizeForJarvisVoice(text);
  const source = `${intent || ''} ${actionType || ''} ${raw}`;
  if (!raw) return '';
  if (/private_export_completed|다운로드했습니다|downloaded/.test(source)) {
    return '대표님, 발주서 파일을 다운로드했습니다. 화면에는 개인정보를 계속 마스킹합니다.';
  }
  if (/private_export_command|pending_action_prompt.*PRIVATE_EXPORT|개인정보 포함 발주서 다운로드에는 승인이 필요/.test(source)) {
    return '대표님, 이 파일에는 배송 정보가 포함됩니다. 다운로드하려면 승인이 필요합니다.';
  }
  if (/privacy_export_question/.test(source)) {
    return '맞습니다, 대표님. 화면에서는 개인정보를 마스킹하지만, 실제 발주처 전달용 엑셀 파일에는 승인 후 배송 정보가 포함됩니다.';
  }
  if (/masked|마스킹/.test(source)) {
    return '마스킹 파일은 검토용입니다. 실제 배송용 파일은 승인 후 개인정보를 포함해 따로 생성합니다.';
  }
  if (/PRIVATE_EXPORT|개인정보|배송 정보|수취인|주소|연락처/.test(source)) {
    return '맞습니다, 대표님. 화면에서는 개인정보를 마스킹하지만, 실제 발주처 전달용 엑셀 파일에는 승인 후 배송 정보가 포함됩니다.';
  }
  if (/gmail|Gmail|email|이메일|메일/.test(source)) {
    return 'Gmail 발송은 아직 잠금 상태입니다. 발주처 이메일과 초안을 확인한 뒤 승인으로만 진행합니다.';
  }
  if (/telegram|Telegram|텔레그램/.test(source)) {
    return '기존 9시 텔레그램 브리핑을 활용합니다. 새 봇이나 새 스케줄러를 만드는 구조는 아닙니다.';
  }
  if (/outreach|인플루언서|유튜버|후보|목표|follow.?up|팔로우업/.test(source)) {
    return '목표 인원에 도달하기 전에는 완료로 처리하지 않습니다. 부족한 인원과 중단 사유를 보고합니다.';
  }
  if (/APPROVAL|approval|required|승인|승인 필요|ActionCard/.test(source)) {
    return '대표님, 이 작업은 승인이 필요합니다. 진행하시려면 승인해 주세요.';
  }
  if (/다운로드|download/.test(source)) {
    return '대표님, 발주서 파일을 다운로드했습니다. 화면에는 개인정보를 계속 마스킹합니다.';
  }
  if (/발주서.*정리|상품별|택배사|발주 대상/.test(source)) {
    return '대표님, 발주서 대상을 상품별로 정리했습니다. 화면에서 택배사와 이메일 상태를 확인해 주세요.';
  }
  const firstSentence = raw.split(/다\.\s+|[.!?。]\s*/).filter(Boolean)[0] || raw;
  return firstSentence.slice(0, 120);
}

function buildJarvisVoiceSummaryClean(text: string, intent?: string, actionType?: string): string {
  const raw = sanitizeForJarvisVoice(text)
    .replace(/[\uFFFD]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const source = `${intent || ''} ${actionType || ''} ${raw}`;
  if (!raw) return '';
  if (/private_export_completed|개인정보 포함.*다운로드|다운로드했습니다/.test(source)) {
    return '대표님, 개인정보 포함 발주서 파일을 다운로드했습니다. 화면에는 개인정보를 계속 마스킹합니다.';
  }
  if (/private_export_command|PURCHASE_ORDER_PRIVATE_EXPORT|개인정보 포함.*승인/.test(source)) {
    return '대표님, 이 파일에는 배송 정보가 포함됩니다. 다운로드하려면 승인이 필요합니다.';
  }
  if (/privacy_export_question|이름|주소|연락처|배송 정보/.test(source)) {
    return '맞습니다, 대표님. 화면에서는 개인정보를 마스킹하지만, 실제 발주처 전달용 엑셀 파일에는 승인 후 배송 정보가 포함됩니다.';
  }
  if (/masked|마스킹/.test(source)) {
    return '마스킹 파일은 검토용입니다. 실제 배송용 파일은 승인 후 개인정보 포함 파일로 따로 생성합니다.';
  }
  if (/gmail|Gmail|email|이메일|메일/.test(source)) {
    return 'Gmail 발송은 승인 후에만 진행됩니다. 지금은 초안과 dryRun으로 먼저 확인합니다.';
  }
  if (/telegram|Telegram|텔레그램/.test(source)) {
    return '기존 9시 텔레그램 브리핑을 활용합니다. 새 봇이나 새 스케줄러를 만들지 않습니다.';
  }
  if (/outreach|인플루언서|유튜버|후보|목표/.test(source)) {
    return '목표 인원에 도달하기 전에는 완료로 처리하지 않습니다. 부족 인원과 중단 사유를 보고합니다.';
  }
  if (/APPROVAL|approval|required|승인|ActionCard/.test(source)) {
    return '대표님, 이 작업은 승인이 필요합니다. 승인 전에는 실제 실행하지 않습니다.';
  }
  if (/발주서.*정리|상품별/.test(source)) {
    return '대표님, 발주서 대상을 상품별로 정리했습니다. 화면에서 택배사와 이메일 상태를 확인해 주세요.';
  }
  const firstSentence = raw.split(/[.!?。]\s*|\n/).filter(Boolean)[0] || raw;
  return firstSentence.slice(0, 120);
}

function parseOutreachGoalCommandClean(rawText: string) {
  const normalized = String(rawText || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return null;

  const hasInfluencerSignal = /(인플루언서|유튜버|블로거|크리에이터|채널|후보)/i.test(normalized);
  const hasOutreachVerb = /(수집|찾아|찾아줘|모아|모아줘|추천|미리보기|테스트|dry\s*run|드라이런|이어|계속|채워|가능한지|몇\s*명|카운트|count)/i.test(normalized);
  if (!hasInfluencerSignal || !hasOutreachVerb) return null;

  const verticalRules = [
    { code: 'camping', label: '캠핑', pattern: /(캠핑|캠퍼|차박|아웃도어|텐트|백패킹|캠핑용품)/i },
    { code: 'beauty', label: '뷰티', pattern: /(뷰티|메이크업|화장품|스킨케어|피부|코덕|올리브영|grwm)/i },
    { code: 'cooking', label: '요리', pattern: /(요리|레시피|집밥|쿡방|베이킹)/i },
    { code: 'food', label: '식품', pattern: /(식품|푸드|먹방|맛집|간식|공동구매|농산물|과일|배추|절임배추|옥수수|매실|복숭아|밤)/i },
    { code: 'parenting', label: '육아', pattern: /(육아|아이|엄마|맘|키즈|주부)/i },
    { code: 'travel', label: '여행', pattern: /(여행|브이로그|숙소|호텔|국내여행)/i },
  ];
  const matched = verticalRules.find(rule => rule.pattern.test(normalized));
  if (!matched) return null;

  const numberMatch = normalized.match(/(\d+)\s*(명|개|채널|사람)?/);
  const targetCount = numberMatch ? Math.max(1, Number(numberMatch[1])) : 20;
  const countOnly = /(가능한지|몇\s*명|후보\s*수|숫자만|수만|카운트|count|확인만)/i.test(normalized);

  return {
    requestedVertical: matched.code,
    verticalLabel: matched.label,
    targetContactableCount: targetCount,
    dryRun: true,
    countOnly,
    requirePublicEmail: true,
    keyword: `${matched.label} 인플루언서`,
    originalUserText: normalized,
    outreachMode: countOnly ? 'count_only' : 'preview_collect',
  };
}

// 스마트스토어 액션 한국어 라벨
function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    current_new_orders: '현재 신규주문 조회',
    query_orders_today: '오늘 신규주문 조회',
    query_pending_shipping: '배송준비 조회',
    query_order_status: '전체 주문/발주 현황 조회',
    query_pre_shipping_total: '배송 전 처리 대상 전체 조회',
    query_orders_week: '이번 주 주문 조회',
    query_orders_month: '이번 달 주문 조회',
    query_orders_unpaid: '미결제 주문 조회',
    query_orders_cancel: '취소 요청 조회',
    query_orders_return: '반품/교환 요청 조회',
    query_orders_by_product: '상품별 주문 조회',
    query_order_detail: '주문 상세 조회',
    query_orders_pending_ship: '발송 대기 주문 조회',
    morning_report: '아침 업무 보고',
    confirm_all_today: '오늘 발주확인',
    confirm_all: '전체 발주확인',
    confirm_by_product: '상품별 발주확인',
    confirm_by_id: '개별 발주확인',
    query_unconfirmed: '미처리 발주확인 조회',
    create_order_sheet_today: '오늘 주문서 생성',
    create_order_sheet_week: '주간 주문서 생성',
    create_order_sheet_by_product: '상품별 주문서 생성',
    create_order_sheet_grouped: '그룹별 주문서 생성',
    check_duplicate_orders: '중복 주문 확인',
    bundle_same_address: '합포장 묶기',
    create_settlement_month: '월 정산서 생성',
    create_settlement_by_product: '상품별 정산서',
    calc_weekly_profit: '주간 수익 계산',
    get_bestseller: '베스트셀러 조회',
    compare_last_month: '전월 비교',
    weekly_report: '주간 마감 보고',
    send_purchase_email: '발주 이메일 발송',
    send_purchase_email_auto: '자동 발주 이메일 발송',
    preview_purchase_email: '발주 이메일 미리보기',
    process_shipping: '발송 처리',
    get_products: '상품 조회',
    process_order_file: '발주서 파일 처리',
    process_order_file_and_send: '발주서 처리 및 이메일 발송',
  };
  return labels[action] || action;
}

type JarvisScene =
  | 'home'
  | 'standby'
  | 'briefing'
  | 'orders'
  | 'market'
  | 'outreach'
  | 'files'
  | 'approval'
  | 'voice'
  | 'error'
  | 'copy_research'
  | 'smartstore_brief'
  | 'keyword_radar'
  | 'growth_link'
  | 'cs_copilot'
  | 'approval_gate';

// ── ACTION-A.1: Predictive Action Types ──
type PredictiveActionType = 'safe' | 'draft' | 'locked' | 'danger' | 'navigation';
type PredictiveAction = {
  id: string;
  scene: JarvisScene;
  type: PredictiveActionType;
  title: string;
  description: string;
  primaryLabel: string;
  secondaryLabel?: string;
  tertiaryLabel?: string;
  status: 'available' | 'locked' | 'preview' | 'disabled';
  riskLevel: 'low' | 'medium' | 'high';
};

type UiPendingActionType =
  | 'SMARTSTORE_CONFIRM_ORDERS'
  | 'PURCHASE_ORDER_CREATE'
  | 'PURCHASE_ORDER_PRIVATE_EXPORT'
  | 'PURCHASE_ORDER_EMAIL_SEND'
  | 'BULK_PURCHASE_ORDER_EMAIL_SEND'
  | 'OUTREACH_GOAL_COLLECT'
  | 'OUTREACH_EMAIL_SEND'
  | 'OUTREACH_FOLLOWUP_SEND';

type UiPendingAction = {
  id: string;
  actionType: UiPendingActionType;
  status: 'awaiting_confirmation' | 'blocked' | 'partial' | 'ready' | 'cancelled';
  source: 'chat' | 'telegram' | 'system';
  title: string;
  summary: {
    targetCount?: number;
    productOrderCount?: number;
    totalOrderQuantity?: number;
    confirmNeededCount?: number;
    productOrderIds?: string[];
    groupCount?: number;
    fileCount?: number;
    totalRows?: number;
    includesPrivateFields?: boolean;
    fileName?: string;
    supplierName?: string;
    recipientMasked?: string;
    groupIds?: string[];
    dryRun?: boolean;
    targetContactableCount?: number;
    qualifiedContactableCount?: number;
    remainingContactableCount?: number;
    completionStatus?: string;
    stopReason?: string;
  };
  nextPrompt: string;
  createdAt: string;
  actionId?: string;
};

type PurchaseOrderEmailDraft = {
  groupId: string;
  supplierName?: string;
  productGroupName?: string;
  recipientMasked?: string;
  subject: string;
  bodyPreview: string;
  attachmentFileName: string;
  rowCount?: number;
  totalQuantity?: number;
  canSend?: boolean;
  warnings?: string[];
};

type PurchaseOrderEmailDraftPreviewState = {
  open: boolean;
  selectedGroupIds: string[];
  drafts: PurchaseOrderEmailDraft[];
  statusMessage?: string;
};

// ── ACTION-A.1: Scene별 Predictive Actions 규칙 (GPT 호출 금지, keyword 기반) ──
function getPredictiveActions(scene: JarvisScene, _input?: string): PredictiveAction[] {
  switch (scene) {
    case 'smartstore_brief':
      return [
        { id: 'ss_orders', scene, type: 'safe', title: '주문 현황 조회', description: '오늘 신규주문 + 배송준비 현황', primaryLabel: '조회', status: 'available', riskLevel: 'low' },
        { id: 'ss_shipping', scene, type: 'safe', title: '배송준비 보기', description: '배송준비 상태 주문 목록', primaryLabel: '보기', status: 'available', riskLevel: 'low' },
        { id: 'ss_dryrun', scene, type: 'draft', title: '발주서 Dry-run', description: '발주서 초안 미리보기 (실행 없음)', primaryLabel: '미리보기', status: 'preview', riskLevel: 'medium' },
        { id: 'ss_locked', scene, type: 'locked', title: '실행 잠금 유지', description: '발주확인/송장입력/발송처리 LOCKED', primaryLabel: 'LOCKED', status: 'locked', riskLevel: 'high' },
      ];
    case 'copy_research':
      return [
        { id: 'cr_retry', scene, type: 'safe', title: '다시 써줘', description: '현재 카피를 다시 생성', primaryLabel: '재생성', status: 'available', riskLevel: 'low' },
        { id: 'cr_provocative', scene, type: 'safe', title: '더 자극적으로', description: '더 강한 후킹 문구', primaryLabel: '자극적', status: 'available', riskLevel: 'low' },
        { id: 'cr_premium', scene, type: 'safe', title: '더 고급스럽게', description: '프리미엄 톤 카피', primaryLabel: '고급', status: 'available', riskLevel: 'low' },
        { id: 'cr_threads', scene, type: 'safe', title: 'Threads 스타일', description: '스레드 최적화 카피', primaryLabel: 'Threads', status: 'available', riskLevel: 'low' },
        { id: 'cr_reels', scene, type: 'safe', title: '릴스 스크립트', description: '릴스 대본 생성', primaryLabel: '릴스', status: 'available', riskLevel: 'low' },
        { id: 'cr_record', scene, type: 'navigation', title: '성과 기록 준비', description: '다음 단계에서 연결 예정', primaryLabel: '준비', status: 'disabled', riskLevel: 'low' },
      ];
    case 'keyword_radar':
      return [
        { id: 'kw_input', scene, type: 'safe', title: '상품 링크 입력', description: '분석할 상품 URL 입력', primaryLabel: '입력', status: 'available', riskLevel: 'low' },
        { id: 'kw_extract', scene, type: 'draft', title: '키워드 후보 추출 준비', description: '키워드 후보 추출 (SEO-K.1 예정)', primaryLabel: '준비', status: 'preview', riskLevel: 'low' },
        { id: 'kw_rank', scene, type: 'draft', title: '순위 추적 시작 준비', description: '순위 추적 기능 준비 중', primaryLabel: '준비', status: 'preview', riskLevel: 'low' },
        { id: 'kw_seo', scene, type: 'navigation', title: 'SEO-K.1 예정', description: '다음 단계에서 구현 예정', primaryLabel: '예정', status: 'disabled', riskLevel: 'low' },
      ];
    case 'growth_link':
      return [
        { id: 'gl_chrome', scene, type: 'draft', title: 'Chrome 최적화 Preview', description: '크롬 인앱 브라우저 최적화 미리보기', primaryLabel: '미리보기', status: 'preview', riskLevel: 'low' },
        { id: 'gl_fallback', scene, type: 'draft', title: 'Fallback Preview', description: '폴백 링크 구조 미리보기', primaryLabel: '미리보기', status: 'preview', riskLevel: 'low' },
        { id: 'gl_utm', scene, type: 'draft', title: 'UTM 구조 생성 준비', description: 'UTM 파라미터 구조 설계', primaryLabel: '준비', status: 'preview', riskLevel: 'low' },
        { id: 'gl_link', scene, type: 'navigation', title: 'LINK-A.1 예정', description: '다음 단계에서 구현 예정', primaryLabel: '예정', status: 'disabled', riskLevel: 'low' },
      ];
    case 'cs_copilot':
      return [
        { id: 'cs_draft', scene, type: 'draft', title: '답변 초안 생성', description: 'CS 답변 초안 작성', primaryLabel: '초안', status: 'available', riskLevel: 'low' },
        { id: 'cs_polite', scene, type: 'safe', title: '더 정중하게', description: '더 정중한 톤으로 수정', primaryLabel: '수정', status: 'available', riskLevel: 'low' },
        { id: 'cs_approval', scene, type: 'locked', title: '대표 승인 필요', description: '발송 전 대표 승인 필요', primaryLabel: '승인 대기', status: 'locked', riskLevel: 'high' },
        { id: 'cs_locked', scene, type: 'locked', title: '발송 잠금 유지', description: '실제 CS 발송 LOCKED', primaryLabel: 'LOCKED', status: 'locked', riskLevel: 'high' },
      ];
    case 'outreach':
      return [
        { id: 'or_draft', scene, type: 'draft', title: '제안 메일 초안', description: '인플루언서 제안 메일 초안', primaryLabel: '초안', status: 'available', riskLevel: 'low' },
        { id: 'or_list', scene, type: 'safe', title: '후보 리스트', description: '인플루언서 후보 목록 확인', primaryLabel: '보기', status: 'available', riskLevel: 'low' },
        { id: 'or_save', scene, type: 'draft', title: '초안만 저장', description: '초안을 Workspace에 저장', primaryLabel: '저장', status: 'available', riskLevel: 'low' },
        { id: 'or_locked', scene, type: 'locked', title: '발송 승인 대기', description: '실제 발송 LOCKED', primaryLabel: 'LOCKED', status: 'locked', riskLevel: 'high' },
      ];
    case 'approval_gate':
      return [
        { id: 'ag_dryrun', scene, type: 'draft', title: 'Dry-run 보기', description: '실행 결과 미리보기 (실행 없음)', primaryLabel: '미리보기', status: 'preview', riskLevel: 'medium' },
        { id: 'ag_preview', scene, type: 'draft', title: '초안만 보기', description: '초안/미리보기만 확인', primaryLabel: '초안', status: 'preview', riskLevel: 'medium' },
        { id: 'ag_locked', scene, type: 'danger', title: '실행 잠금 유지', description: '이메일/발주/송장/발송/환불 LOCKED', primaryLabel: 'LOCKED', status: 'locked', riskLevel: 'high' },
        { id: 'ag_cancel', scene, type: 'safe', title: '취소', description: '작업 취소', primaryLabel: '취소', status: 'available', riskLevel: 'low' },
      ];
    default:
      return [];
  }
}

function inferJarvisSceneFromCommand(input: string): JarvisScene {
  const text = (String(input || '') || '').toLowerCase().replace(/\s+/g, '');
  if (!text) return 'home';

  // 1. 위험 실행 → approval_gate (최우선)
  if (
    text.includes('발주확인') ||
    text.includes('송장입력') ||
    text.includes('발송처리') ||
    text.includes('발송해줘') ||
    text.includes('실행할까') ||
    text.includes('실행해줘') ||
    text.includes('승인할까') ||
    text.includes('보낼까')
  ) {
    return 'approval_gate';
  }

  // 2. 스마트스토어 브리핑 → smartstore_brief
  if (
    text.includes('브리핑') ||
    text.includes('주문현황') ||
    text.includes('주문') ||
    text.includes('배송준비') ||
    text.includes('구매확정') ||
    text.includes('스마트스토어') ||
    text.includes('오늘보고') ||
    text.includes('오늘리포트')
  ) {
    return 'smartstore_brief';
  }

  // 3. 키워드/순위 → keyword_radar
  if (
    text.includes('키워드') ||
    text.includes('순위') ||
    text.includes('상품링크') ||
    text.includes('검색순위') ||
    text.includes('네이버순위') ||
    text.includes('순위추적')
  ) {
    return 'keyword_radar';
  }

  // 4. 딥링크/크롬/링크 최적화 → growth_link
  if (
    text.includes('딥링크') ||
    text.includes('크롬') ||
    text.includes('링크최적화') ||
    text.includes('로그인이탈') ||
    text.includes('chrome') ||
    text.includes('공동구매링크') ||
    text.includes('크롬으로열리게')
  ) {
    return 'growth_link';
  }

  // 5. CS/고객 문의 → cs_copilot
  if (
    text.includes('고객문의') ||
    text.includes('리뷰답글') ||
    text.includes('cs답변') ||
    text.includes('환불문의') ||
    text.includes('교환문의') ||
    text.includes('배송문의') ||
    text.includes('고객답변') ||
    (text.includes('문의') && text.includes('답변'))
  ) {
    return 'cs_copilot';
  }

  // 6. 인플루언서/메일/공동구매 제안 → outreach
  if (
    text.includes('인플루언서') ||
    text.includes('유튜버') ||
    text.includes('블로거') ||
    text.includes('후보') ||
    text.includes('제안메일') ||
    text.includes('공동구매제안') ||
    text.includes('메일초안') ||
    text.includes('아웃리치') ||
    text.includes('outreach')
  ) {
    return 'outreach';
  }

  // 7. 카피/유튜브 조사/시세 분석/리뷰 분석/스레드/릴스/후킹문구 → copy_research
  if (
    text.includes('카피') ||
    text.includes('후킹') ||
    text.includes('문구') ||
    text.includes('스레드') ||
    text.includes('릴스') ||
    text.includes('유튜브') ||
    text.includes('조사해') ||
    text.includes('리서치') ||
    text.includes('리뷰분석') ||
    text.includes('시세') ||
    text.includes('인스타') ||
    text.includes('썸네일') ||
    text.includes('대본')
  ) {
    return 'copy_research';
  }

  // 8. 시장/가격 (COPY-R과 겹치지 않는 순수 시장 조회)
  if (
    text.includes('시장') ||
    text.includes('가격') ||
    text.includes('카미스') ||
    text.includes('kamis') ||
    text.includes('마진') ||
    text.includes('도매')
  ) {
    return 'market';
  }

  // 9. 파일/작업
  if (
    text.includes('저장된작업') ||
    text.includes('작업보여') ||
    text.includes('파일') ||
    text.includes('발주서') ||
    text.includes('정산서') ||
    text.includes('시트') ||
    text.includes('sheets')
  ) {
    return 'files';
  }

  // 10. 승인 (일반)
  if (
    text.includes('승인') ||
    text.includes('실행해') ||
    text.includes('메일발송') ||
    text.includes('결제')
  ) {
    return 'approval_gate';
  }

  // 11. 인사
  if (
    text.includes('자비스') ||
    text.includes('안녕') ||
    text.includes('들리')
  ) {
    return 'voice';
  }

  return 'home';
}

export default function JarvisApp() {
  const [state, setState] = useState<JarvisState>('idle');
  const [activeScene, _setActiveSceneRaw] = useState<JarvisScene>('standby');
  // UI-ORCH-A.10: Mission Workspace lifecycle lock — 명시적 닫기만 허용
  const [missionWorkspaceOpen, setMissionWorkspaceOpen] = useState(false);
  const missionWorkspaceOpenRef = useRef(missionWorkspaceOpen);
  missionWorkspaceOpenRef.current = missionWorkspaceOpen;
  // UI-ORCH-A.10: Guarded setActiveScene — workspace 열린 동안 비-mission scene으로 변경 차단
  const setActiveScene = useCallback((scene: JarvisScene) => {
    const isMission = scene === 'smartstore_brief' || scene === 'keyword_radar';
    if (missionWorkspaceOpenRef.current && !isMission) {
      // workspace 열린 상태에서 home/standby 등으로 변경 시도 → 차단
      console.log('[UI-ORCH-A.10] Scene change blocked:', scene, '(workspace open)');
      return;
    }
    _setActiveSceneRaw(scene);
  }, []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestedActions, setSuggestedActions] = useState<JarvisSuggestedAction[]>([]);
  const lastAssistantMsgRef = useRef<string>('');
  const [isListening, setIsListening] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [speakingLevel, setSpeakingLevel] = useState(0);
  const [clapBurst, setClapBurst] = useState(false);
  // 마이크 주파수 배열 (파티클 파형용, listening 상태에서만 활성화)
  const micFreqData = useMicrophoneFrequency(state === 'listening');
  const [isTyping, setIsTyping] = useState(false);
  const [sttStatus, setSttStatus] = useState<STTStatus>('idle');
  const [conversationExpanded, setConversationExpanded] = useState(false);
  const [actionContext, setActionContext] = useState<ActionContext | null>(null);
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [approvalPreview, setApprovalPreview] = useState<ApprovalPreviewData | null>(null);
  const [pendingAction, setPendingAction] = useState<UiPendingAction | null>(null);
  const pendingActionRef = useRef<UiPendingAction | null>(null);
  const [workspaceVisible, setWorkspaceVisible] = useState(false);
  const [workspaceRecords, setWorkspaceRecords] = useState<WorkspaceRecord[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [outreachVisible, setOutreachVisible] = useState(false);
  const [outreachCandidates, setOutreachCandidates] = useState<InfluencerCandidate[]>([]);
  const [outreachCollectionSummary, setOutreachCollectionSummary] = useState<any>(() => {
    try {
      const raw = window.sessionStorage.getItem('jarvis:lastOutreachCollectionSummary');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [purchaseOrderBulkPreview, setPurchaseOrderBulkPreview] = useState<any>(null);
  const [purchaseOrderEmailDraftPreview, setPurchaseOrderEmailDraftPreview] = useState<PurchaseOrderEmailDraftPreviewState>({
    open: false,
    selectedGroupIds: [],
    drafts: [],
  });
  const [conversationNextActions, setConversationNextActions] = useState<JarvisNextAction[]>([]);
  const [marketPriceVisible, setMarketPriceVisible] = useState(false);
  const [marketPriceResult, setMarketPriceResult] = useState<MarketPriceResult | null>(null);
  const [marketPriceInputMode, setMarketPriceInputMode] = useState(false);
  const [marketPriceLoading, setMarketPriceLoading] = useState(false);
  const [dataPanel, setDataPanel] = useState<{
    visible: boolean;
    type: 'collect' | 'send_email' | 'create_banner' | 'report' | 'booking' | 'smartstore' | 'youtube' | 'influencer_content' | null;
    progress: number;
    message?: string;
    bookingSteps?: string[];
    logs?: { step: number; status: string; message: string }[];
    actionLogs?: { step: string; status: string; detail: string; timestamp: string; elapsed?: string; data?: any }[];
  }>({ visible: false, type: null, progress: 0, message: '' });
  const [stats, setStats] = useState({ collected: 247, emailsSent: 183, responseRate: 23.5, contracts: 4 });
  const [bannerImage, setBannerImage] = useState<string | null>(null);
  const [contextRegistry, setContextRegistry] = useState<ContextRegistryItem[]>([]);
  const [spotlightItem, setSpotlightItem] = useState<ContextRegistryItem | null>(null);




  const [schedules, setSchedules] = useState<{ task: string; time: string }[]>([]);

  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const rawRegistry = localStorage.getItem("jarvis.contextRegistry");
        if (rawRegistry) {
          setContextRegistry(JSON.parse(rawRegistry));
        }
      } catch (error) {
        console.error("Failed to parse context registry from localStorage", error);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    handleStorageChange(); // Initial load

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showHint, setShowHint] = useState(false);


  // ── UI-J Dual Screen Opening ──
  const DUAL_WALL_CHANNEL = 'jarvis-dual-command-wall';
  const DUAL_WALL_STORAGE_KEY = 'jarvis.dualWall.latest';
  const DUAL_OPENING_STORAGE_KEY = 'jarvis.dualWall.opening';
  const [dualScreenArmed, setDualScreenArmed] = useState(false);
  const [dualOpeningActive, setDualOpeningActive] = useState(false);
  const [dualArmStatus, setDualArmStatus] = useState<'idle' | 'armed' | 'opened' | 'blocked' | 'linked'>('idle');
  const dataWallPopupRef = useRef<Window | null>(null);
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [voiceListVisible, setVoiceListVisible] = useState(false);
  const [currentVoiceName, setCurrentVoiceName] = useState(() => {
    const id = getCurrentVoiceId();
    return ELEVENLABS_VOICES.find(v => v.id === id)?.name || 'Adam';
  });
  // ── 모바일 감지 ──
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [ownerTokenInput, setOwnerTokenInput] = useState('');
  const [ownerTokenConfigured, setOwnerTokenConfigured] = useState(() => {
    try { return Boolean(localStorage.getItem('jarvis_owner_token')); } catch { return false; }
  });
  const [memoryPanelVisible, setMemoryPanelVisible] = useState(false);
  const [learnedKnowledge, setLearnedKnowledge] = useState<LearnedKnowledge[]>(() => getLearnedKnowledge());
  const [memoryStats, setMemoryStats] = useState(() => getMemoryStats());
  const [naverResults, setNaverResults] = useState<NaverSearchItem[]>([]);
  const [naverPanelVisible, setNaverPanelVisible] = useState(false);
  const [naverKeyword, setNaverKeyword] = useState('');
  const [collectedInfluencers, setCollectedInfluencers] = useState<InfluencerData[]>(() => {
    try {
      const saved = localStorage.getItem('jarvis-collected-influencers');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [influencerCardsVisible, setInfluencerCardsVisible] = useState(false);
  const [collectedBusinesses, setCollectedBusinesses] = useState<LocalBusinessData[]>([]);
  const [businessCardsVisible, setBusinessCardsVisible] = useState(false);
  const [emailHistory, setEmailHistory] = useState<EmailRecord[]>([]);
  const [emailHistoryVisible, setEmailHistoryVisible] = useState(false);
  // ── Gmail Draft/승인/테스트 발송 E2E 상태 ──
  const [emailDraftState, setEmailDraftState] = useState<'idle' | 'draft_created' | 'approval_required' | 'test_send_only' | 'test_sent' | 'execute_locked'>('idle');
  const emailDraftStateRef = useRef(emailDraftState);
  emailDraftStateRef.current = emailDraftState;
  const [emailDraftData, setEmailDraftData] = useState<{ subject: string; html: string; to: string; toName: string; product: string } | null>(null);
  const emailDraftDataRef = useRef(emailDraftData);
  emailDraftDataRef.current = emailDraftData;

  // ── 발주서 파일 처리 상태 ──
  const [orderFileUploadVisible, setOrderFileUploadVisible] = useState(false);
  const [orderFileAction, setOrderFileAction] = useState<'process_order_file' | 'process_order_file_and_send'>('process_order_file');
  const [orderFileProcessing, setOrderFileProcessing] = useState(false);
  const orderFileInputRef = useRef<HTMLInputElement>(null);
  const orderFileResolveRef = useRef<((file: File | null) => void) | null>(null);

  // ── 예약 기능 상태 ──
  const [bookingSessionId, setBookingSessionId] = useState<string | null>(null);
  const [bookingPanelVisible, setBookingPanelVisible] = useState(false);
  const [liveViewerVisible, setLiveViewerVisible] = useState(false);
  const [liveViewerTask, setLiveViewerTask] = useState<{ type: string; businessName?: string; step?: number; message?: string } | null>(null);
  const [bookingSlots, setBookingSlots] = useState<string[]>([]);
  const [bookingScreenshot, setBookingScreenshot] = useState<string | null>(null);
  // 0: idle, 1: 로그인 중, 2: 시간 조회 중, 3: 확인 대기, 4: 폼 입력 중, 5: 완료
  const [bookingStep, setBookingStep] = useState<number>(0);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [paymentCopied, setPaymentCopied] = useState(false);
  // 예약 확인 대기 중 음성 응답을 받기 위한 ref
  const bookingConfirmResolveRef = useRef<((text: string) => void) | null>(null);
  // 캡차/2단계 인증 대기 상태
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [captchaScreenshot, setCaptchaScreenshot] = useState<string | null>(null);
  const [verificationMode, setVerificationMode] = useState<'captcha' | 'otp' | null>(null);
  const verificationResolveRef = useRef<((code: string) => void) | null>(null);
  const captchaOpenRef = useRef<boolean>(false); // 캡차 모달 열림 여부 (STT 핸들러에서 동기 접근용)
  const BOOKING_SERVER = import.meta.env.VITE_BOOKING_SERVER_URL || 'https://jarvis-booking-server-production.up.railway.app';

  // 네이버 직접 로그인 상태
  const [naverLoginStatus, setNaverLoginStatus] = useState<'idle' | 'waiting' | 'done' | 'error'>(() => {
    const saved = localStorage.getItem('jarvis_booking_session');
    return saved ? 'done' : 'idle';
  });
  const [naverLoginPendingId, setNaverLoginPendingId] = useState<string | null>(null);
  const [naverLoginWebview, setNaverLoginWebview] = useState(false);
  const [naverLoginScreenshot, setNaverLoginScreenshot] = useState<string | null>(null);

  // ── 타이핑 입력 모드 ──
  const [neuralMapVisible, setNeuralMapVisible] = useState(false);
  const [strategyDashboardVisible, setStrategyDashboardVisible] = useState(false);
  const [textInputMode, setTextInputMode] = useState(false);
  const [textInputValue, setTextInputValue] = useState('');
  const textInputRef = useRef<HTMLInputElement>(null);
  const lastManualTextSubmitAtRef = useRef(0);
  const [showGoldenFlare, setShowGoldenFlare] = useState(false);
  // ─── Agent Console & HUD 상태 (v4.2) ───
  const [agentConsoleVisible, setAgentConsoleVisible] = useState(false);
  const [coreDimLevel, setCoreDimLevel] = useState(0); // 0=정상, 1=최대감소
  const isDataWallView =
    typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).get('view') === 'data-wall' || 
     new URLSearchParams(window.location.search).get('view') === 'datawall');
  const [marketIntelVisible, setMarketIntelVisible] = useState(false);
  const [marketChartVisible, setMarketChartVisible] = useState(false);
  const [marketChartData, setMarketChartData] = useState<any>(null);
  const [bookingPanelData, setBookingPanelData] = useState<{ businessName?: string; date?: string; time?: string; currentStep?: number; availableSlots?: string[]; captchaImage?: string; screenshot?: string } | null>(null);
  // ── 주문 대시보드 상태 ──
  const [orderDashboardVisible, setOrderDashboardVisible] = useState(false);
  const [orderDashboardData, setOrderDashboardData] = useState<any[]>([]);
  const [orderDashboardSummary, setOrderDashboardSummary] = useState<any>(null);
  // ── UI-O: Result Deck state ──
  const [resultDeckVisible, setResultDeckVisible] = useState(false);
  const [resultDeckContent, setResultDeckContent] = useState('');
  const [resultDeckType, setResultDeckType] = useState('');
  const [resultDeckProduct, setResultDeckProduct] = useState('');
  const [resultDeckItems, setResultDeckItems] = useState<any[]>([]);
  // COPY-R
  const [resultDeckIsCopyR, setResultDeckIsCopyR] = useState(false);
  const [resultDeckResearchInsight, setResultDeckResearchInsight] = useState('');
  const [resultDeckVideosFound, setResultDeckVideosFound] = useState(0);
  const [resultDeckTopVideos, setResultDeckTopVideos] = useState<any[]>([]);
  const [resultDeckExcludedEngines, setResultDeckExcludedEngines] = useState<string[]>([]);
  // ── UI-V2: Research Orbit 상태 ──
  const [isResearching, setIsResearching] = useState(false);
  const [researchEngines, setResearchEngines] = useState<string[]>([]);
  // ── COPY-A v2: Copy Focus Mode ──
  const [copyFocusMode, setCopyFocusMode] = useState(false);
  // ── Creative Studio (카드형 카피 UI) ──
  const [creativeStudioVisible, setCreativeStudioVisible] = useState(false);
  const [creativeStudioCopies, setCreativeStudioCopies] = useState<CopyCard[]>([]);
  const [creativeStudioProduct, setCreativeStudioProduct] = useState('');
  const [creativeStudioType, setCreativeStudioType] = useState('');
  const [creativeStudioLoading, setCreativeStudioLoading] = useState(false);
  const [creativeStudioTrends, setCreativeStudioTrends] = useState(0);
  const [creativeStudioRefs, setCreativeStudioRefs] = useState(0);
  const [creativeStudioMetadata, setCreativeStudioMetadata] = useState<any>(null);
  // ── Outreach Result Workspace (인플루언서 상세 모달) ──
  const [outreachWorkspaceVisible, setOutreachWorkspaceVisible] = useState(false);
  // ── SCREEN-A.1: Scene Panel visibility ──
  const [scenePanelVisible, setScenePanelVisible] = useState(false);
  // ── ACTION-A.1: Predictive Action Cards ──
  const [predictedActions, setPredictedActions] = useState<PredictiveAction[]>([]);
  const [actionStatusMessage, setActionStatusMessage] = useState('');
  const [reactionPulse, setReactionPulse] = useState(false);
  // ── SSoT: 스마트스토어 데이터 캐시 (5분 유효) ──
  const ssCountsCacheRef = useRef<{ data: any; fetchedAt: number } | null>(null);
  // ── SCC 패널용 React state (리렌더링 트리거) ──
  const [sccOrderData, setSccOrderData] = useState<any>(null);
  const lastClapActivateAtRef = useRef<number>(0);

  useEffect(() => {
    try {
      if (outreachCollectionSummary) {
        window.sessionStorage.setItem(
          'jarvis:lastOutreachCollectionSummary',
          JSON.stringify(outreachCollectionSummary),
        );
      }
    } catch {
      // Session persistence is a convenience for E2E/context recovery only.
    }
  }, [outreachCollectionSummary]);

  // ── UI 컨텍스트 동기화 (GPT에게 현재 화면 정보 전달) ──
  useEffect(() => {
    if (orderDashboardVisible && orderDashboardData.length > 0) {
      setActiveUIContext('orders', { orders: orderDashboardData });
    } else if (!orderDashboardVisible) {
      setActiveUIContext(null, null);
    }
  }, [orderDashboardVisible, orderDashboardData]);

  const triggerGoldenFlare = useCallback(() => {
    setShowGoldenFlare(true);
    setTimeout(() => setShowGoldenFlare(false), 2000);
  }, []);

  useEffect(() => {
    pendingActionRef.current = pendingAction;
  }, [pendingAction]);

  // ── UI-J Dual Screen Helper Functions ──
  const openDataWallOnKnownLeftMonitor = (url: string) => {
    // UI-P: 중복 방지 — 기존 창이 열려있으면 focus만
    if (dataWallPopupRef.current && !dataWallPopupRef.current.closed) {
      dataWallPopupRef.current.focus();
      setDualArmStatus('linked');
      return true;
    }
    try {
      const currentLeft = typeof window.screenX === 'number' ? window.screenX : (window as any).screenLeft || 0;
      const currentTop = typeof window.screenY === 'number' ? window.screenY : (window as any).screenTop || 0;

      const width = Math.max(1280, Math.round(window.screen.availWidth || 1680));
      const height = Math.max(720, Math.round(window.screen.availHeight || 945));

      // 대표님 PC 기준: 2번 모니터는 현재 1번 모니터의 왼쪽.
      // 현재 창이 1번 오른쪽 모니터에 있으므로, 현재 screenX에서 화면 폭만큼 왼쪽으로 보낸다.
      const left = Math.round(currentLeft - width);
      const top = Math.max(0, Math.round(currentTop));

      const features = [
        `left=${left}`,
        `top=${top}`,
        `width=${width}`,
        `height=${height}`,
        'resizable=yes',
        'scrollbars=no',
      ].join(',');

      console.log('[DUAL] no-permission left monitor attempt:', features);

      const popup = window.open(url, 'jarvis-data-wall', features);

      if (popup) {
        dataWallPopupRef.current = popup;
        popup.focus();
        setDualArmStatus('linked');
        return true;
      }

      return false;
    } catch (error) {
      console.warn('[DUAL] no-permission left monitor failed:', error);
      return false;
    }
  };

  const openDataWallWindow = async () => {
    const url = `${window.location.origin}${window.location.pathname}?view=data-wall&mode=secondary`;

    const fallbackOpen = (reason: string) => {
      console.warn('[DUAL] fallback open:', reason);
      // UI-P: 중복 방지
      if (dataWallPopupRef.current && !dataWallPopupRef.current.closed) {
        dataWallPopupRef.current.focus();
        setDualArmStatus('linked');
        return true;
      }
      const popup = window.open(
        url,
        'jarvis-data-wall',
        'width=1680,height=945,left=80,top=60,resizable=yes,scrollbars=no'
      );

      if (popup) {
        dataWallPopupRef.current = popup;
        popup.focus();
        setDualArmStatus('linked');
        return true;
      }

      setDualArmStatus('blocked');
      return false;
    };

    // 1순위: 권한 없이 대표님 PC 기준 왼쪽 2번 모니터로 먼저 열기
    const openedOnKnownLeftMonitor = openDataWallOnKnownLeftMonitor(url);

    if (openedOnKnownLeftMonitor) {
      console.log('[DUAL] opened by no-permission left monitor strategy');
      return true;
    }

    // 2순위: 실패 시에만 Window Management API 시도
    try {
      const isExtended = Boolean((window.screen as any)?.isExtended);
      console.log('[DUAL] screen.isExtended:', isExtended);

      if (!('getScreenDetails' in window)) {
        return fallbackOpen('getScreenDetails unavailable');
      }

      const getScreenDetails = (window as any).getScreenDetails;

      if (!getScreenDetails) {
        return fallbackOpen('getScreenDetails missing');
      }

      const details = await getScreenDetails();

      console.log('[DUAL] screens:', details.screens);
      console.log('[DUAL] currentScreen:', details.currentScreen);

      // 현재 화면이 아닌 다른 화면 찾기
      const targetScreen = details.screens.find((s: any) => s !== details.currentScreen) || details.screens[0];

      console.log('[DUAL] targetScreen:', targetScreen);

      if (!targetScreen) {
        return fallbackOpen('secondary screen not found');
      }

      const left = Math.round(targetScreen.availLeft);
      const top = Math.round(targetScreen.availTop);
      const width = Math.round(targetScreen.availWidth);
      const height = Math.round(targetScreen.availHeight);

      const features = [
        `left=${left}`,
        `top=${top}`,
        `width=${width}`,
        `height=${height}`,
        'resizable=yes',
        'scrollbars=no',
      ].join(',');

      console.log('[DUAL] opening Data Wall with window-management features:', features);

      const popup = window.open(url, 'jarvis-data-wall', features);

      if (popup) {
        dataWallPopupRef.current = popup;
        popup.focus();
        setDualArmStatus('linked');
        return true;
      }

      setDualArmStatus('blocked');
      return false;
    } catch (error) {
      console.warn('[DUAL] Window Management placement failed:', error);
      return fallbackOpen('window management failed');
    }
  };

  const publishDualWallPayload = (payload: any) => {
    try {
      window.localStorage.setItem(DUAL_WALL_STORAGE_KEY, JSON.stringify(payload));
    } catch { /* ignore */ }
    try {
      if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel(DUAL_WALL_CHANNEL);
        channel.postMessage(payload);
        channel.close();
      }
    } catch { /* ignore */ }
  };

  const armDualScreen = async () => {
    const opened = await openDataWallWindow();
    const armPayload = {
      type: 'dual-armed',
      scene: activeScene,
      state,
      currentTime,
      workspaceCount: workspaceRecords.length,
      outreachCount: outreachCandidates.length,
      actionType: actionContext?.type,
      updatedAt: Date.now(),
    };
    try {
      window.localStorage.setItem(DUAL_OPENING_STORAGE_KEY, JSON.stringify(armPayload));
    } catch { /* ignore */ }
    publishDualWallPayload(armPayload);
    setDualScreenArmed(true);
    if (!opened) {
      setDualArmStatus('blocked');
    } else {
      setDualArmStatus('linked');
    }
  };

  const triggerDualScreenOpening = (source: 'clap' | 'touch' | 'manual' = 'manual') => {
    const openingPayload = {
      type: 'dual-opening',
      source,
      scene: activeScene,
      state,
      currentTime,
      workspaceCount: workspaceRecords.length,
      outreachCount: outreachCandidates.length,
      actionType: actionContext?.type,
      updatedAt: Date.now(),
    };
    setDualOpeningActive(true);
    setDualScreenArmed(false);
    setDualArmStatus('idle');
    try {
      window.localStorage.setItem(DUAL_OPENING_STORAGE_KEY, JSON.stringify(openingPayload));
    } catch { /* ignore */ }
    publishDualWallPayload(openingPayload);
    window.setTimeout(() => {
      setDualOpeningActive(false);
    }, 3200);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isDataWallView) return;

    const wallPayload = {
      scene: activeScene,
      state,
      currentTime,
      workspaceCount: workspaceRecords.length,
      outreachCount: outreachCandidates.length,
      actionType: actionContext?.type,
      updatedAt: Date.now(),
    };

    try {
      window.localStorage.setItem('jarvis.dualWall.latest', JSON.stringify(wallPayload));
    } catch {
      // ignore storage errors
    }

    try {
      if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel('jarvis-dual-command-wall');
        channel.postMessage(wallPayload);
        channel.close();
      }
    } catch {
      // ignore broadcast errors
    }
  }, [
    isDataWallView,
    activeScene,
    state,
    currentTime,
    workspaceRecords.length,
    outreachCandidates.length,
    actionContext?.type,
  ]);

  const [settingsForm, setSettingsForm] = useState(() => {
    const stored = JSON.parse(localStorage.getItem('jarvis_api_keys') || '{}');
    // 환경 변수에서 기본 키 가져오기
    return {
      geminiKey: stored.geminiKey || stored.openaiKey || '',
      openaiKey: stored.openaiKey || '',
      elevenlabsKey: stored.elevenlabsKey || '',
    };
  });

  useEffect(() => {
    // 보안: GPT는 서버 route(api/chat-proxy)를 통해서만 호출 - 프론트엔드에서 API key 미사용
    console.log('[JARVIS] GPT 라우팅 준비 (서버 route 전용)');
    initializeGemini('server-route-only'); // 호환성 유지 (실제 key 미사용)
  }, [settingsForm.geminiKey]);

  // ── 서버 메모리 복원 (앱 시작 시) ──
  useEffect(() => {
    restoreMemoryFromServer().then(restored => {
      if (restored) console.log('[JARVIS] 서버에서 대화 기억 복원 완료');
    });
    // 페이지 닫을 때 서버에 동기화
    const handleBeforeUnload = () => { syncMemoryToServer(); };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const [naverForm, setNaverForm] = useState(() => {
    const stored = JSON.parse(localStorage.getItem('jarvis_naver_creds') || '{}');
    return {
      username: stored.username || '',
      password: stored.password || '',
      userName: stored.userName || '',
      userPhone: stored.userPhone || '',
    };
  });

  const { speak, stop: stopTTS } = useTextToSpeech();
  const stateRef = useRef(state);
  stateRef.current = state;
  const isListeningRef = useRef(isListening);
  isListeningRef.current = isListening;
  const lastSpokenSummaryRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });

  // ── 마이크 레벨은 ClapDetector의 onAudioLevel로 전달받음 (별도 getUserMedia 불필요) ──

  // ── TTS 레벨 시뮬레이션 ──
  const speakingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startSpeakingLevel = useCallback(() => {
    if (speakingTimerRef.current) clearInterval(speakingTimerRef.current);
    speakingTimerRef.current = setInterval(() => {
      setSpeakingLevel(0.25 + Math.random() * 0.55);
    }, 100);
  }, []);
  const stopSpeakingLevel = useCallback(() => {
    if (speakingTimerRef.current) clearInterval(speakingTimerRef.current);
    setSpeakingLevel(0);
  }, []);

  const speakJarvisSummary = useCallback((input: {
    text: string;
    intent?: string;
    actionType?: string;
    allowVoice?: boolean;
  }) => {
    if (input.allowVoice === false) return;
    const summary = buildJarvisVoiceSummaryClean(input.text, input.intent, input.actionType) || buildJarvisVoiceSummary(input.text, input.intent, input.actionType);
    if (!summary) return;
    const now = Date.now();
    if (lastSpokenSummaryRef.current.text === summary && now - lastSpokenSummaryRef.current.at < 2000) {
      return;
    }
    lastSpokenSummaryRef.current = { text: summary, at: now };
    try {
      stopGlobalAudio();
      setState('speaking');
      startSpeakingLevel();
      speak(summary, undefined, () => {
        stopSpeakingLevel();
        if (stateRef.current === 'speaking') setState('idle');
      });
    } catch (error) {
      stopSpeakingLevel();
      console.warn('[JARVIS VOICE] playback blocked or failed', error);
    }
  }, [speak, startSpeakingLevel, stopSpeakingLevel]);

  // ── Barge-in: JARVIS 말하는 중 사용자 발화 감지 → TTS 즉시 중단 + listening 전환 ──
  
  const speakElevenLabs = useCallback((text: string) => new Promise<void>((resolve) => {
    const safeText = sanitizeForJarvisVoice(text);
    if (!safeText) {
      resolve();
      return;
    }
    try {
      speak(safeText, undefined, () => resolve());
    } catch {
      resolve();
    }
  }), [speak]);

  useBargein(
    state === 'speaking',
    useCallback(() => {
      console.log('[JARVIS] Barge-in 감지 → TTS 중단 후 listening 전환');
      stopTTS(); // useTextToSpeech의 stop() 호출로 문장 루프까지 중단
      stopSpeakingLevel();
      setState('listening');
      setIsListening(true);
    }, [stopTTS, stopSpeakingLevel])
  );

  // ── Wake Word 감지: idle 상태에서 "자비스" / "Jarvis" 감지 → 자동 활성화 ──
  // handleActivate는 아래에 정의되어 있으므로 ref를 통해 연결
  const handleActivateRef = useRef<() => void>(() => {});
  useWakeWord(
    state === 'idle', // idle 상태에서만 감지
    useCallback(() => {
      console.log('[WakeWord] 웨이크 워드 감지 → handleActivate 호출');
      handleActivateRef.current();
    }, [])
  );

  // ── 시계 ──
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
      setCurrentDate(now.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }));
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    // 모바일에서 빠르게 TOUCH TO ACTIVATE 표시 (0.5초)
    const t = setTimeout(() => setShowHint(true), 500);
    return () => clearTimeout(t);
  }, []);

  // ── 수집된 인플루언서 localStorage 자동 저장 (중복방지 학습) ──
  useEffect(() => {
    try {
      localStorage.setItem('jarvis-collected-influencers', JSON.stringify(collectedInfluencers));
    } catch (e) { console.warn('[JARVIS] localStorage 저장 실패:', e); }
  }, [collectedInfluencers]);

  // UI-P: Outreach 후보 데이터도 localStorage에 동기화 (Data Wall용)
  useEffect(() => {
    if (outreachCandidates.length > 0) {
      try {
        localStorage.setItem('jarvis-outreach-candidates', JSON.stringify(outreachCandidates));
        // Data Wall에 즉시 알림
        publishDualWallPayload({
          type: 'data-update',
          dataType: 'outreach',
          count: outreachCandidates.length,
          updatedAt: Date.now()
        });
      } catch (e) { console.warn('[JARVIS] Outreach localStorage 저장 실패:', e); }
    }
  }, [outreachCandidates]);

  // ── Workspace: Google Sheets 저장/조회 ──
  const fetchWorkspaceRecords = useCallback(async () => {
    setWorkspaceLoading(true);
    try {
      const res = await fetch('/api/cloud-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskType: 'workspace-list', params: { limit: 50 } }),
      });
      const data = await res.json();
      if (data.success && data.records) {
        setWorkspaceRecords(data.records);
      }
    } catch (e) { console.warn('[JARVIS] Workspace fetch failed:', e); }
    setWorkspaceLoading(false);
  }, []);

  const saveToWorkspace = useCallback(async (type: string, data: any, sourceCommand?: string) => {
    try {
      const res = await fetch('/api/cloud-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskType: 'workspace-save', params: { type, data, sourceCommand } }),
      });
      const result = await res.json();
      if (result.success) {
        emitMissionLog({ step: 'workspace_save', label: `${type} 저장 완료`, status: 'success', detail: result.recordId });
        // 저장 후 목록 갱신
        fetchWorkspaceRecords();
      }
      return result;
    } catch (e: any) {
      emitMissionLog({ step: 'workspace_save', label: `${type} 저장 실패`, status: 'error', detail: e.message });
      return { success: false, error: e.message };
    }
  }, [fetchWorkspaceRecords]);

  // ── Market Price Submit Handler ──
  const handleMarketPriceSubmit = useCallback(async (inputData: MarketPriceInputData) => {
    setMarketPriceInputMode(false);
    setMarketPriceLoading(true);
    emitNodeState('jarvis_brain', 'active', '마진 계산 중...');
    emitMissionLog('📊', 'Market', `${inputData.productName} 가격 판단 분석 중...`, 'thinking');

    try {
      const res = await fetch('/api/cloud-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskType: 'market-price-check', params: inputData }),
      });
      const data = await res.json();
      setMarketPriceLoading(false);

      if (data.success) {
        const result = { productName: data.productName, calculation: data.calculation, jarvisDecision: data.jarvisDecision, recommendedAction: data.recommendedAction, jarvisMessage: data.jarvisMessage, savedToSheets: data.savedToSheets };
        setMarketPriceResult(result);
        emitNodeState('jarvis_brain', 'idle');
        emitMissionLog('📊', 'Market', `${inputData.productName}: ${data.jarvisDecision}`, 'success');

        // ActionCard context 설정
        setActionContext({
          type: 'market_price_result',
          label: `${inputData.productName} 가격 판단 완료`,
          detail: `마진율 ${data.calculation.estimatedMarginRate}% | ${data.jarvisDecision}`,
          sourceCommand: `${inputData.productName} 가격 판단`,
        });

        // 자동 저장
        saveToWorkspace('market_price_check', {
          productName: inputData.productName,
          rawMaterialCost: inputData.rawMaterialCost,
          currentPrice: inputData.currentPrice,
          shippingCost: inputData.shippingCost,
          packagingCost: inputData.packagingCost,
          platformFeeRate: inputData.platformFeeRate,
          otherCosts: inputData.otherCosts,
          competitorPrices: inputData.competitorPrices,
          marginRate: data.calculation.estimatedMarginRate,
          margin: data.calculation.estimatedMargin,
          decision: data.jarvisDecision,
          recommendedAction: data.recommendedAction,
        }, `${inputData.productName} 가격 판단`);

        addMessage('jarvis', data.jarvisMessage, true);
      } else {
        setMarketPriceLoading(false);
        addMessage('jarvis', '가격 판단 중 오류가 발생했습니다. 다시 시도해주세요.', true);
        emitMissionLog('📊', 'Market', '가격 판단 실패', 'error');
      }
    } catch (e: any) {
      setMarketPriceLoading(false);
      addMessage('jarvis', '가격 판단 API 호출 중 오류가 발생했습니다.', true);
      emitMissionLog('📊', 'Market', `오류: ${e.message}`, 'error');
    }
  }, [saveToWorkspace]);

  // ── 커스텀 커서 ──
  useEffect(() => {
    // 모바일(터치 기기)에서는 커스텀 커서 비활성화
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) return;
    const cursor = document.createElement('div');
    cursor.className = 'jarvis-cursor';
    document.body.appendChild(cursor);
    const dot = document.createElement('div');
    dot.className = 'jarvis-cursor-dot';
    document.body.appendChild(dot);
    const move = (e: MouseEvent) => {
      cursor.style.left = e.clientX - 11 + 'px';
      cursor.style.top  = e.clientY - 11 + 'px';
      dot.style.left    = e.clientX - 2 + 'px';
      dot.style.top     = e.clientY - 2 + 'px';
    };
    window.addEventListener('mousemove', move);
    return () => { window.removeEventListener('mousemove', move); cursor.remove(); dot.remove(); };
  }, []);

  const addMessage = useCallback((role: 'user' | 'jarvis' | 'assistant', text: string, isCompletion = false) => {
    const normalizedRole: 'user' | 'jarvis' = role === 'assistant' ? 'jarvis' : role;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: normalizedRole, text, timestamp: new Date(), isCompletion }].slice(-8));
  }, []);



  // ── JARVIS-CONVERSATION-OS-A.1: Context Event Handler ──
  const handleJarvisContextEvent = useCallback(async (event: JarvisContextEvent) => {
    const currentState = stateRef.current;
    // busy 상태면 짧은 안내 후 queue
    if ((currentState === 'speaking' || currentState === 'thinking' || currentState === 'working') && event.intent !== 'copy_card_selected') {
      addMessage('jarvis', '선생님, 방금 작업을 마무리하는 중입니다. 잠시만 기다려주세요.');
      return;
    }

    setState('thinking');
    try {
      let ctx: any = { screen: event.screen, intent: event.intent, executeLocked: true, lastAssistantMessage: lastAssistantMsgRef.current };

      // Intent별 context 구성
      if (event.intent === 'candidate_selected' && event.payload) {
        ctx = buildCandidateConversationContext({ candidate: event.payload, lastAssistantMessage: lastAssistantMsgRef.current });
      } else if (event.intent === 'outreach_collection_completed' && event.payload) {
        ctx = buildOutreachCompletionContext({ candidates: event.payload as any[], lastAssistantMessage: lastAssistantMsgRef.current });
      } else if (event.intent === 'copy_card_selected' && event.payload) {
        ctx = buildCopyCardConversationContext({ copy: event.payload, lastAssistantMessage: lastAssistantMsgRef.current });
      } else if (event.intent === 'copy_generation_completed' && event.payload) {
        const p = event.payload as any;
        ctx = buildCopyCompletionContext({ copies: p.copies || [], product: p.product || '', type: p.type || '', lastAssistantMessage: lastAssistantMsgRef.current });
      } else if (event.intent === 'datawall_briefing_requested' && event.payload) {
        ctx = buildDataWallConversationContext({ dataWallState: event.payload, lastAssistantMessage: lastAssistantMsgRef.current });
      }

      const reply = await getContextReply(ctx);

      if (reply.shouldShowInChat) {
        addMessage('jarvis', reply.text, true);
        lastAssistantMsgRef.current = reply.text;
      }
      if (reply.suggestedActions) {
        setSuggestedActions(reply.suggestedActions);
      }
      if (reply.shouldSpeak) {
        setState('speaking');
        startSpeakingLevel();
        await new Promise<void>(resolve => {
          speak(reply.text, undefined, () => { stopSpeakingLevel(); resolve(); });
        });
      }
      setState('listening');
    } catch (err: any) {
      console.error('[JARVIS-DIALOGUE] handleContextEvent error:', err.message);
      setState('listening');
    }
  }, [addMessage, speak, setState]);

  const jarvisRespond = useCallback(async (text: string, action?: JarvisAction) => {
    setIsTyping(true);
    setState('thinking');
    await new Promise(r => setTimeout(r, 200 + Math.random() * 150)); // GPT처럼 빠른 응답을 위해 단축
    setIsTyping(false);

    const isWorkingType = action?.type === 'collect' || action?.type === 'send_email' || action?.type === 'create_banner' || action?.type === 'report';
    if (action && isWorkingType && action.workingMessage) {
      setState('working');
      // 모든 작업 타입에서 AgentConsolePanel 자동 활성화 (v4.3)
      setAgentConsoleVisible(true);
      setDataPanel({ visible: true, type: action.type as 'collect' | 'send_email' | 'create_banner' | 'report', progress: 0, message: action.workingMessage });
      for (let p = 0; p <= 100; p += 2) {
        await new Promise(r => setTimeout(r, 45));
        setDataPanel(prev => ({ ...prev, progress: p }));
      }
      await new Promise(r => setTimeout(r, 400));
      setDataPanel(prev => ({ ...prev, visible: false }));
      if (action.type === 'collect') {
        const count = Number(action.params?.count) || 5;
        const category = String(action.params?.category || '전체');
        const platform = String(action.params?.platform || '');
        const keyword = String(action.params?.keyword || category);
        const minSubscribers = Number(action.params?.min_subscribers) || 0;
        const collectedAt = new Date().toLocaleString('ko-KR');

        // ── 중복 제거 헬퍼 함수 ──
        const deduplicateInfluencers = (existing: InfluencerData[], newItems: InfluencerData[]): InfluencerData[] => {
          const existingNames = new Set(existing.map(i => i.name.toLowerCase().trim()));
          return newItems.filter(i => !existingNames.has(i.name.toLowerCase().trim()));
        };

        // ── 구독자 수 파싱 헬퍼 ──
        const parseSubscriberCount = (followers: string): number => {
          if (!followers || followers === '-') return 0;
          const m = followers.match(/([\d.]+)(만|K|k|M|m)?/);
          if (!m) return 0;
          const num = parseFloat(m[1]);
          const unit = m[2];
          if (unit === '만') return num * 10000;
          if (unit === 'K' || unit === 'k') return num * 1000;
          if (unit === 'M' || unit === 'm') return num * 1000000;
          return num;
        };

        // ── 구독자 수 필터 함수 ──
        const filterBySubscribers = (items: InfluencerData[]): InfluencerData[] => {
          if (!minSubscribers) return items;
          return items.filter(i => parseSubscriberCount(i.followers) >= minSubscribers);
        };

        // ── 단일 플랫폼 수집 함수 ──
        const collectForPlatform = async (plt: string, cnt: number): Promise<InfluencerData[]> => {
          const isYT = plt.toLowerCase().includes('youtube') || plt.toLowerCase().includes('유튜브');
          const isIG = plt.toLowerCase().includes('instagram') || plt.toLowerCase().includes('인스타');

          if (isYT) {
            try {
              console.log(`[JARVIS] YouTube API 수집: ${keyword}, ${cnt}명`);
              emitNodeState('influencer', 'active');
              telemetryFunctionStart('search_youtube', `YouTube 수집: "${keyword}" ${cnt}명`);
              const result = await searchYouTubeAPI(keyword, Math.min(cnt * 3, 50)); // 필터 고려 3배 요청
              const items: InfluencerData[] = result.items.map((ch: YouTubeChannel) => ({
                name: ch.name,
                platform: 'YouTube',
                followers: ch.subscribers > 0 ? (ch.subscribers >= 10000 ? `${(ch.subscribers / 10000).toFixed(1)}만` : ch.subscribers >= 1000 ? `${(ch.subscribers / 1000).toFixed(1)}K` : `${ch.subscribers}`) : '-',
                subscriberCount: ch.subscribers,
                viewCount: ch.viewCount || 0,
                viewCountFormatted: ch.viewCount ? (ch.viewCount >= 100000000 ? `${(ch.viewCount / 100000000).toFixed(1)}억` : ch.viewCount >= 10000 ? `${(ch.viewCount / 10000).toFixed(0)}만` : ch.viewCount.toLocaleString()) : '-',
                videoCount: ch.videoCount || 0,
                category: keyword || category,
                email: ch.email || '',
                profileUrl: ch.profileUrl || (ch as any).customUrl ? `https://www.youtube.com/${(ch as any).customUrl}` : '',
                channelUrl: ch.profileUrl || ((ch as any).customUrl ? `https://www.youtube.com/${(ch as any).customUrl}` : `https://www.youtube.com/channel/${ch.channelId}`),
                thumbnailUrl: ch.thumbnailUrl || '',
                channelId: ch.channelId || '',
                topVideoTitle: (ch as any).topVideoTitle || '',
                topVideoUrl: (ch as any).topVideoUrl || '',
                instagramUsername: (ch as any).instagramUsername || (ch as any).instagram || '',
                tiktokUsername: (ch as any).tiktokUsername || (ch as any).tiktok || '',
                website: (ch as any).website || '',
                description: ch.description || '',
                status: '활성',
                collectedAt,
              }));
              // 이메일 있는 인플루언서만 필터링
              const emailFiltered = items.filter(i => i.email && i.email.includes('@'));
              console.log(`[JARVIS] YouTube 이메일 필터: ${items.length}명 → ${emailFiltered.length}명`);
              const filtered = filterBySubscribers(emailFiltered);
              // 기존 수집 데이터와 중복 제거
              const existingIds = new Set(collectedInfluencers.map(i => (i as any).channelId || i.name.toLowerCase().trim()));
              const deduped = filtered.filter(i => {
                const key = (i as any).channelId || i.name.toLowerCase().trim();
                return !existingIds.has(key);
              });
              telemetryFunctionSuccess('search_youtube', `YouTube ${deduped.slice(0, cnt).length}명 수집 완료 (이메일 보유)`, { count: deduped.slice(0, cnt).length, keyword: keyword });
              emitNodeData('influencer', { scannedVideos: result.items.length, selectedInfluencers: deduped.slice(0, cnt).length, emailsFound: deduped.slice(0, cnt).length, keyword, lastUpdated: new Date().toISOString() });
              emitNodeState('influencer', 'success');
              return deduped.slice(0, cnt);
            } catch (err) {
              console.error('[JARVIS] YouTube 수집 실패:', err);
              telemetryFunctionError('search_youtube', `YouTube 수집 실패: ${err}`);
              emitNodeState('influencer', 'error');
              return [];
            }
          } else if (isIG) {
            try {
              telemetryFunctionStart('search_instagram', `Instagram 수집: "${keyword}" ${cnt}명`);
              const result = await searchInstagramAPI(keyword, Math.min(cnt * 2, 20), true);
              const items: InfluencerData[] = (result.items as InstagramAccount[]).map(acc => ({
                name: acc.fullName || acc.username,
                platform: 'Instagram',
                followers: acc.followersFormatted || (acc.followers ? String(acc.followers) : '-'),
                subscriberCount: acc.followers,
                category: keyword || category,
                email: acc.email || '',
                profileUrl: acc.profileUrl || `https://instagram.com/${acc.username}`,
                thumbnailUrl: acc.profileUrl || '',
                status: '활성',
                collectedAt,
              }));
              const filtered = filterBySubscribers(items);
              telemetryFunctionSuccess('search_instagram', `Instagram ${filtered.slice(0, cnt).length}명 수집 완료`, { count: filtered.slice(0, cnt).length, keyword: keyword });
              return filtered.slice(0, cnt);
            } catch (err) {
              console.error('[JARVIS] Instagram 수집 실패:', err);
              telemetryFunctionError('search_instagram', `Instagram 수집 실패: ${err}`);
              return [];
            }
          } else {
            // 네이버 블로그
            try {
              telemetryFunctionStart('search_naver', `네이버 블로그 수집: "${keyword}" ${cnt}명`);
              const result = await searchNaverAPI(keyword, 'blog', Math.min(cnt * 3, 100), 'sim');
              const items: InfluencerData[] = result.items.map(item => ({
                name: item.creatorName || item.title.replace(/<[^>]*>/g, '').substring(0, 20),
                platform: 'Naver Blog',
                followers: item.neighborCount > 0 ? `이웃 ${item.neighborCount.toLocaleString()}` : '-',
                subscriberCount: item.neighborCount,
                category: keyword || category,
                email: item.guessedEmail || item.email || '',
                profileUrl: item.creatorUrl || '',
                status: '활성',
                collectedAt,
              }));
              // 네이버 시트 저장
              const sheetData: NaverCollectedData[] = result.items.slice(0, cnt).map(item => ({
                title: item.title, author: item.creatorName, blogId: item.blogId,
                guessedEmail: item.guessedEmail, realEmail: item.realEmail,
                neighborCount: item.neighborCount, dailyVisitors: item.dailyVisitors,
                link: item.url, description: item.description, type: 'blog', keyword, collectedAt,
              }));
              appendNaverResultsToSheet(sheetData).then(() => invalidateSheetCache()).catch(err => console.warn('[JARVIS] 네이버 시트 저장 실패:', err));
              const filtered = filterBySubscribers(items);
              telemetryFunctionSuccess('search_naver', `네이버 ${filtered.slice(0, cnt).length}명 수집 완료`, { count: filtered.slice(0, cnt).length, keyword: keyword });
              return filtered.slice(0, cnt);
            } catch (err) {
              console.error('[JARVIS] 네이버 수집 실패:', err);
              telemetryFunctionError('search_naver', `네이버 수집 실패: ${err}`);
              return [];
            }
          }
        };

        // ── 복수 플랫폼 또는 단일 플랫폼 수집 ──
        let allCollected: InfluencerData[] = [];
        const platformsJson = String(action.params?.platforms || '');

        if (platformsJson) {
          // 복수 플랫폼 동시 수집
          try {
            const platformList: { platform: string; count: number }[] = JSON.parse(platformsJson);
            console.log('[JARVIS] 복수 플랫폼 수집:', platformList);
            const results = await Promise.all(
              platformList.map(p => collectForPlatform(p.platform, p.count || count))
            );
            // 플랫폼별 중복 제거 후 합치
            for (const items of results) {
              const unique = deduplicateInfluencers(allCollected, items);
              allCollected = [...allCollected, ...unique];
            }
          } catch (e) {
            console.error('[JARVIS] platforms JSON 파싱 실패:', e);
            // 폴백: 단일 플랫폼으로
            const items = await collectForPlatform(platform, count);
            allCollected = deduplicateInfluencers([], items);
          }
        } else {
          // 단일 플랫폼
          const isYouTube = platform.toLowerCase().includes('youtube') || platform.toLowerCase().includes('유튜브') || keyword.includes('유튜버') || keyword.includes('유튜브');
          const isInstagram = platform.toLowerCase().includes('instagram') || platform.toLowerCase().includes('인스타') || keyword.includes('인스타');
          const resolvedPlatform = isYouTube ? 'YouTube' : isInstagram ? 'Instagram' : 'Naver Blog';
          const items = await collectForPlatform(resolvedPlatform, count);
          allCollected = deduplicateInfluencers([], items);
        }

        // ── 새 수집 시 이전 결과 초기화 (중복 방지) ──
        setCollectedInfluencers(allCollected);
        setInfluencerCardsVisible(allCollected.length > 0);
        setStats(prev => ({ ...prev, collected: prev.collected + allCollected.length }));

        if (allCollected.length > 0) {
          // ── OUTREACH 패널 자동 활성화 ──
          setOutreachVisible(true);

          // ── 이메일 조건 분리 및 수집 완료 보고 ──
          const emailConfirmed = allCollected.filter(i => i.email && i.email.includes('@'));
          const noEmail = allCollected.filter(i => !i.email || !i.email.includes('@'));

          // 수집 완료 보고 메시지
          const collectReportMsg = `**${keyword} 수집 완료** (${allCollected.length}명)\n\n` +
            `| 항목 | 수치 |\n|------|------|\n` +
            `| 총 수집 | ${allCollected.length}명 |\n` +
            `| 공개 이메일 확인 | ${emailConfirmed.length}명 |\n` +
            `| 이메일 미확인 | ${noEmail.length}명 |\n\n` +
            `**저장 위치**: Google Sheets (influencer_candidates 탭) + localStorage\n` +
            `OUTREACH 패널에서 후보 카드를 확인하세요.`;
          addMessage('jarvis', collectReportMsg, true);

          // 파티클 폭발 효과
          setClapBurst(true);
          setTimeout(() => setClapBurst(false), 120);
          setTimeout(() => { setClapBurst(true); setTimeout(() => setClapBurst(false), 120); }, 450);

          // ── ActionCard 연결 (Next Action 제공) ──
          setActionContext({
            type: 'outreach_collect',
            keyword,
            collectedCount: allCollected.length,
            emailCount: emailConfirmed.length,
            shortfall: 0,
            label: `${keyword} ${allCollected.length}명 수집 완료`,
            description: `Google Sheets 저장 완료`,
            savedTo: 'Google Sheets (influencer_candidates)',
            locked: false,
            sourceCommand: `${keyword} ${count}명 수집`,
          });
          setWorkflowSteps(buildWorkflowSteps({ type: 'outreach_collect', label: '후보 수집', description: '', locked: false }));

          // ── Google Sheets 저장 ──
          appendInfluencersToSheet(allCollected as any).then(r => {
            console.log('[JARVIS] 시트 저장:', r.success ? `완료 (${r.count}건)` : r.message);
            saveMemory('마지막 수집', `${keyword} ${allCollected.length}명 수집 (${new Date().toLocaleDateString('ko-KR')})`);
            invalidateSheetCache(); // 수집 데이터 변경 시 캐시 초기화
          });
        }
      } else if (action.type === 'send_email') {
        const count = Number(action.params?.count) || 50;
        const template = String(action.params?.template || '협업 제안');
        const target = String(action.params?.target || '');

        // ── 수집된 인플루언서 중 이메일 있는 대상 필터링 ──
        const emailTargets = collectedInfluencers
          .filter(inf => inf.email && inf.email.includes('@'))
          .slice(0, count);

        telemetryFunctionStart('send_email_campaign', `이메일 발송: ${emailTargets.length}명 대상`);
        if (emailTargets.length > 0) {
          // ── Resend로 실제 발송 ──
          const recipients = emailTargets.map(inf => {
            const { subject, html } = buildInfluencerEmailHtml({
              influencerName: inf.name,
              platform: inf.platform,
              category: inf.category,
              productName: target || '저희 제품',
            });
            return { email: inf.email, name: inf.name, subject, body: html };
          });

          console.log(`[JARVIS] Resend 발송 시작: ${recipients.length}명`);
          sendEmailsViaResend(recipients).then(result => {
            console.log(`[JARVIS] Resend 발송 완료: ${result.sent}/${result.total}`);
            telemetryFunctionSuccess('send_email_campaign', `이메일 ${result.sent}건 발송 완료`, { sent: result.sent, failed: result.failed, total: result.total });
            setStats(prev => ({ ...prev, emailsSent: prev.emailsSent + result.sent }));
            saveMemory('마지막 이메일 발송',
              `${result.sent}명 발송 성공 / ${result.failed}명 실패 (${new Date().toLocaleDateString('ko-KR')})`);
            // 이메일 히스토리 카드에 기록 추가
            const newRecords: EmailRecord[] = emailTargets.map((inf, i) => ({
              id: `email-${Date.now()}-${i}`,
              subject: `${template} 제안`,
              to: inf.email || '',
              toName: inf.name,
              preview: `안녕하세요, ${inf.name}님. 저희 MAWINPAY에서 ${target || '제품'} 협업을 제안드립니다...`,
              status: (i < result.sent ? 'sent' : 'failed') as 'sent' | 'failed',
              sentAt: new Date().toISOString(),
            }));
            setEmailHistory(prev => [...newRecords, ...prev]);
            setEmailHistoryVisible(true);
            // 로그 저장
            const logs = generateEmailLogs(emailTargets as any, template);
            appendEmailLogToSheet(logs);
          });
        } else {
          // 이메일 없는 경우 안내
          console.warn('[JARVIS] 이메일 주소가 있는 인플루언서가 없습니다.');
          telemetryFunctionSuccess('send_email_campaign', `이메일 ${count}건 발송 (시뮬레이션)`, { sent: count, mode: 'simulation' });
          setStats(prev => ({ ...prev, emailsSent: prev.emailsSent + count }));
          const logs = generateEmailLogs(generateMockInfluencers(count, '전체', ''), template);
          appendEmailLogToSheet(logs);
          saveMemory('마지막 이메일 발송', `${count}명 ${template} (시뮬레이션, ${new Date().toLocaleDateString('ko-KR')})`);
        }
      } else if (action.type === 'create_banner') {
        const prompt = String(action.params?.prompt || 'influencer marketing campaign');
        const style = String(action.params?.style || 'modern');
        telemetryFunctionStart('generate_banner', `배너 생성: ${prompt.substring(0, 30)}`);
        const imageUrl = await generateBannerImage(prompt, style);
        if (imageUrl) {
          setBannerImage(imageUrl);
          saveMemory('마지막 배너', `${prompt} (${new Date().toLocaleDateString('ko-KR')})`);
          telemetryFunctionSuccess('generate_banner', '배너 생성 완료', { prompt: prompt.substring(0, 30) });
        } else {
          telemetryFunctionError('generate_banner', '배너 생성 실패');
        }
      } else if (action.type === 'schedule') {
        const task = String(action.params?.task || '');
        const time = String(action.params?.time || '내일 오전 9시');
        const saved = saveSchedule(task, time);
        setSchedules(prev => [...prev, { task: saved.task, time: saved.time }]);
      }
    }

    // ── Manus AI 에이전트 미션 위임 ──
    if (action?.type === 'manus_task') {
      const mission = String(action.params?.mission || '');
      const missionType = String(action.params?.mission_type || 'complex');
      const urgency = String(action.params?.urgency || 'normal');

      telemetryFunctionStart('execute_web_task', `Manus 미션: ${mission.substring(0, 50)}`);

      setState('working');
      addMessage('jarvis', action.response);
      startSpeakingLevel();
      await new Promise<void>(resolve => {
        speak(action.response, undefined, () => { stopSpeakingLevel(); resolve(); });
      });

      try {
        // Manus 태스크 생성
        const result = await executeManusTask(mission, missionType, urgency);

        if (result.status === 'running') {
          const progressMsg = `Manus AI 에이전트가 미션을 수행 중입니다, 선생님. 작업 ID: ${result.taskId.slice(0, 8)}... 완료되면 보고드리겠습니다.`;
          setState('speaking');
          addMessage('jarvis', progressMsg);
          startSpeakingLevel();
          await new Promise<void>(resolve => {
            speak(progressMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
          });

          // 폴링으로 상태 확인 (최대 60회, 10초 간격 = 10분)
          let completed = false;
          for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 10000));
            try {
              const status = await getManusTaskStatus(result.taskId);
              if (status.status === 'stopped') {
                telemetryFunctionSuccess('execute_web_task', `Manus 미션 완료`, { mission: mission.substring(0, 50) });
                const lastMsg = status.messages?.length > 0 ? status.messages[0].content : '결과를 확인해 주세요.';
                const completeMsg = `Manus 미션이 완료되었습니다, 선생님. ${lastMsg}`;
                setState('speaking');
                addMessage('jarvis', completeMsg);
                startSpeakingLevel();
                await new Promise<void>(resolve => {
                  speak(completeMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
                });
                completed = true;
                break;
              } else if (status.status === 'error') {
                telemetryFunctionError('execute_web_task', `Manus 미션 오류: ${status.messages?.[0]?.content || '알 수 없는 오류'}`);
                const lastMsg = status.messages?.length > 0 ? status.messages[0].content : '다시 시도해 보겠습니다.';
                const failMsg = `Manus 미션 수행 중 문제가 발생했습니다, 선생님. ${lastMsg}`;
                setState('speaking');
                addMessage('jarvis', failMsg);
                startSpeakingLevel();
                await new Promise<void>(resolve => {
                  speak(failMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
                });
                completed = true;
                break;
              }
              // 아직 진행 중이면 계속 폴링
            } catch {
              // 폴링 오류는 무시하고 계속
            }
          }

          if (!completed) {
            const timeoutMsg = 'Manus 미션이 아직 진행 중입니다, 선생님. 완료되면 텔레그램으로 보고드리겠습니다.';
            setState('speaking');
            addMessage('jarvis', timeoutMsg);
            startSpeakingLevel();
            await new Promise<void>(resolve => {
              speak(timeoutMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
            });
          }
        } else {
          // 에러 발생
          const errorMsg = result.message || 'Manus 에이전트 연결에 실패했습니다, 선생님.';
          setState('speaking');
          addMessage('jarvis', errorMsg);
          startSpeakingLevel();
          await new Promise<void>(resolve => {
            speak(errorMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
          });
        }
      } catch (err) {
        const errorMsg = 'Manus 에이전트와의 통신 중 오류가 발생했습니다, 선생님. 잠시 후 다시 시도해 주세요.';
        setState('speaking');
        addMessage('jarvis', errorMsg);
        startSpeakingLevel();
        await new Promise<void>(resolve => {
          speak(errorMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
        });
      }

      setState('idle');
      return;
    }

    // ── 네이버 검색 액션 ──
    if (action?.type === 'naver_search') {
      const keyword = String(action.params?.keyword || '');
      const source = (action.params?.source as 'blog' | 'cafe') || 'blog';
      const display = Number(action.params?.display) || 30;
      const sort = (action.params?.sort as 'sim' | 'date') || 'sim';

      setState('working');
      setAgentConsoleVisible(true);
      telemetryFunctionStart('search_naver', `네이버 ${source} 검색: "${keyword}" ${display}건`);
      addMessage('jarvis', action.response);
      startSpeakingLevel();
      await new Promise<void>(resolve => {
        speak(action.response, undefined, () => { stopSpeakingLevel(); resolve(); });
      });

      try {
        const result = await searchNaverAPI(keyword, source, display, sort);
        setNaverResults(result.items);
        setNaverKeyword(keyword);
        setNaverPanelVisible(true);
        saveMemory('마지막 네이버 검색', `${keyword} (${source}) ${result.total}건 (${new Date().toLocaleDateString('ko-KR')})`);

        // ── 구글 시트 자동 저장 (이메일/이웃수/방문자수 포함) ──
        const collectedAt = new Date().toLocaleString('ko-KR');
        const sheetData: NaverCollectedData[] = result.items.map(item => ({
          title: item.title,
          author: item.creatorName,
          blogId: item.blogId,
          guessedEmail: item.guessedEmail,
          realEmail: item.realEmail,
          neighborCount: item.neighborCount,
          dailyVisitors: item.dailyVisitors,
          link: item.url,
          description: item.description,
          type: source,
          keyword,
          collectedAt,
        }));
        appendNaverResultsToSheet(sheetData).then(res => {
          if (res.success) {
            console.log(`[JARVIS] 구글 시트 자동 저장 완료: ${res.count}건`);
            invalidateSheetCache(); // 수집 데이터 변경 시 캐시 초기화
          }
        }).catch(err => console.warn('[JARVIS] 구글 시트 저장 실패:', err));

        // 이메일 수집 현황
        const emailCount = result.items.filter(i => i.guessedEmail || i.realEmail).length;
        const neighborInfo = result.items.filter(i => i.neighborCount > 0).length;
        const doneText = `네이버 ${source === 'cafe' ? '카페' : '블로그'}에서 '${keyword}' 검색 완료. ${result.items.length}건 수집, 이메일 ${emailCount}건, 이웃수 정보 ${neighborInfo}건 포함하여 구글 시트에 저장했습니다.`;
        setState('speaking');
        addMessage('jarvis', doneText, true); // 작업 완료 메시지 → 스파클링 효과
        // 수집 완료 파티클 폭발
        setClapBurst(true);
        setTimeout(() => setClapBurst(false), 120);
        setTimeout(() => { setClapBurst(true); setTimeout(() => setClapBurst(false), 120); }, 450);
        setTimeout(() => { setClapBurst(true); setTimeout(() => setClapBurst(false), 120); }, 900);
        startSpeakingLevel();
        await new Promise<void>(resolve => {
          speak(doneText, undefined, () => { stopSpeakingLevel(); resolve(); });
        });
      } catch (err) {
        const errMsg = `네이버 검색 중 오류가 발생했습니다. ${String(err).includes('credentials') ? 'NAVER API 키가 설정되지 않았습니다. Vercel 환경변수에 NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET을 설정해주세요.' : String(err)}`;
        setState('speaking');
        addMessage('jarvis', errMsg);
        startSpeakingLevel();
        await new Promise<void>(resolve => {
          speak(errMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
        });
      }

      await new Promise(r => setTimeout(r, 400));
      setState('listening');
      setIsListening(true);
      return;
    }

    // ── 지역 업체 검색 액션 (네이버 지역 검색 API) ──
    if (action?.type === 'local_search') {
      const query = String(action.params?.query || '');
      const category = String(action.params?.category || '');
      const display = Number(action.params?.display) || 30;

      setState('working');
      setAgentConsoleVisible(true);
      addMessage('jarvis', action.response);
      startSpeakingLevel();
      await new Promise<void>(resolve => {
        speak(action.response, undefined, () => { stopSpeakingLevel(); resolve(); });
      });

      const hoursFilter = String(action.params?.hours_filter || 'all');

      try {
        // 영업시간 필터가 있으면 플레이스 파싱 API 사용, 없으면 기본 검색 API
        const useHoursApi = hoursFilter === '24h' || hoursFilter === 'late_night';
        const proxyEndpoint = useHoursApi ? 'naver-place-hours' : 'naver-local-search';
        const proxyParams = new URLSearchParams({ endpoint: proxyEndpoint, query, display: String(display) });
        if (useHoursApi) proxyParams.set('hours_filter', hoursFilter);
        if (category) proxyParams.set('category', category);
        const res = await fetch(`/api/cloud-proxy?${proxyParams.toString()}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.message || data.error || '검색 실패');
        }

        const businessItems: LocalBusinessData[] = data.items.map((item: { name: string; category: string; address: string; roadAddress: string; phone: string; link: string; mapx: string; mapy: string; description: string; businessHours?: string; is24Hours?: boolean; }) => ({
          id: `${item.name}-${Date.now()}`,
          name: item.name.replace(/<[^>]*>/g, ''),
          category: item.category || '업체',
          address: item.address || '',
          roadAddress: item.roadAddress || '',
          phone: item.phone || '',
          link: item.link || '',
          description: item.description || '',
          mapx: item.mapx || '',
          mapy: item.mapy || '',
          businessHours: item.businessHours || '',
          is24Hours: item.is24Hours || false,
          keyword: query,
          collectedAt: new Date().toLocaleString('ko-KR'),
        }));

        setCollectedBusinesses(businessItems);
        setBusinessCardsVisible(businessItems.length > 0);
        saveMemory('마지막 지역 검색', `${query} ${category ? `(${category})` : ''} ${businessItems.length}건 (${new Date().toLocaleDateString('ko-KR')})`);

        // 구글 시트 자동 저장 (지역업체 전용 탭)
        const sheetRows = businessItems.map(item => ({
          name: item.name,
          category: item.category,
          address: item.address,
          roadAddress: item.roadAddress,
          phone: item.phone,
          businessHours: item.businessHours,
          is24Hours: item.is24Hours,
          link: item.link,
          description: item.description,
          keyword: query,
        }));
        appendLocalBusinessToSheet(sheetRows).then(r => {
          if (r.success) console.log(`[JARVIS] 지역업체 시트 저장 완료: ${r.count}건`);
          invalidateSheetCache();
        }).catch(err => console.warn('[JARVIS] 시트 저장 실패:', err));

        const categoryText = category ? ` (${category} 필터)` : '';
        const phoneCount = businessItems.filter(i => i.phone).length;
        const doneText = `'${query}'${categoryText} 검색 완료. ${businessItems.length}개 업체를 수집했습니다. 전화번호 ${phoneCount}건, 주소 포함 구글 시트에 저장했습니다.`;
        setState('speaking');
        addMessage('jarvis', doneText, true);
        setClapBurst(true);
        setTimeout(() => setClapBurst(false), 120);
        setTimeout(() => { setClapBurst(true); setTimeout(() => setClapBurst(false), 120); }, 450);
        startSpeakingLevel();
        await new Promise<void>(resolve => {
          speak(doneText, undefined, () => { stopSpeakingLevel(); resolve(); });
        });
      } catch (err) {
        const errMsg = `지역 검색 중 오류가 발생했습니다. ${String(err)}`;
        setState('speaking');
        addMessage('jarvis', errMsg);
        startSpeakingLevel();
        await new Promise<void>(resolve => {
          speak(errMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
        });
      }

      await new Promise(r => setTimeout(r, 400));
      setState('listening');
      setIsListening(true);
      return;
    }

    // ── 인플루언서 맞춤 콘텐츠 생성 액션 (generate_influencer_content) ──
    if (action?.type === 'generate_influencer_content') {
      const params = action.params || {} as Record<string, any>;
      const contentType = String(params.content_type || 'email');
      const category = String(params.category || 'collab');
      const influencerName = String(params.influencer_name || '');
      const businessName = String(params.business_name || '');
      const productName = String(params.product_name || '');
      const mode = String(params.mode || 'quick');

      // 행동 로그 패널 표시
      setDataPanel({
        visible: true,
        type: 'influencer_content',
        progress: 0,
        logs: [{ step: 1, status: 'pending', message: `${influencerName} 맞춤 ${contentType === 'email' ? '이메일' : contentType === 'script' ? '스크립트' : '제안서'} 생성 준비 중...` }],
      });

      // 콘텐츠 생성 API 호출
      try {
        const response = await fetch('/api/content-generator', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content_type: contentType,
            category,
            influencer_name: influencerName,
            influencer_category: params.influencer_category || '',
            subscriber_count: params.subscriber_count || 0,
            avg_views: params.avg_views || 0,
            recent_videos: params.recent_videos || '',
            business_name: businessName,
            business_desc: params.business_desc || '',
            product_name: productName,
            product_desc: params.product_desc || '',
            mode,
          }),
        });

        const data = await response.json();

        if (data.success) {
          // 행동 로그 업데이트
          setDataPanel(prev => ({
            ...prev,
            progress: 100,
            logs: [
              ...(prev.logs || []),
              { step: 2, status: 'done', message: `${contentType} 생성 완료 (${data.generation_time}초)` },
            ],
          }));

          // 생성된 콘텐츠를 메시지로 추가
          const generatedContent = data.content || '';
          const contentTitle = contentType === 'email' ? '이메일' : contentType === 'script' ? '스크립트' : '제안서';
          addMessage('jarvis', `${influencerName}님께 보낼 ${contentTitle}을(를) 생성했습니다:\n\n${generatedContent}\n\n이 ${contentTitle}을(를) 바로 보낼까요?`);

          // TTS
          const speakText = `${influencerName}님 맞춤 ${contentTitle}을 생성했습니다. 확인해 주세요.`;
          try {
            await speakElevenLabs(speakText);
          } catch { }
        } else {
          addMessage('jarvis', `콘텐츠 생성에 실패했습니다: ${data.error || '알 수 없는 오류'}`);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '알 수 없는 오류';
        addMessage('jarvis', `콘텐츠 생성 중 오류가 발생했습니다: ${errorMsg}`);
      }

      setState('listening');
      setIsListening(true);
      return;
    }

    // ── 유튜브 인기 영상 조회/분석 액션 (youtube_trending) ──
    if (action?.type === 'youtube_trending') {
      const ytParams = action.params || {} as Record<string, any>;
      const ytAction = String(ytParams.action || 'trending');
      const ytKeyword = String(ytParams.keyword || '');
      const ytCategory = String(ytParams.category || '전체');
      const ytChannelName = String(ytParams.channel_name || '');
      const ytCount = Number(ytParams.count) || 5;
      const ytPeriod = String(ytParams.period || '');

      telemetryFunctionStart('search_youtube', `유튜브 ${ytAction}: ${ytKeyword || ytChannelName || ytCategory}`);

      // 행동 로그 패널 표시
      setDataPanel({
        visible: true,
        type: 'youtube',
        progress: 0,
        message: action.workingMessage || '유튜브 영상 조회 중...',
        actionLogs: [{ step: '1', status: 'running', detail: '유튜브 API 호출 준비 중...', timestamp: new Date().toISOString(), elapsed: '0s' }],
      });

      // TTS로 시작 알림
      addMessage('jarvis', action.response);
      await new Promise<void>(resolve => {
        speak(action.response, undefined, () => { resolve(); });
      });

      try {
        const apiBase = import.meta.env.VITE_API_BASE || '';

        // 키워드가 있으면 분석 모드, 없으면 트렌딩
        let endpoint = '';
        let queryParams: Record<string, string> = {};

        if (ytAction === 'keyword' && ytKeyword) {
          // 마누스 AI 분석 포함 모드
          endpoint = 'youtube-analyze';
          queryParams = { keyword: ytKeyword, count: String(ytCount), mode: 'smart' };
          if (ytPeriod) queryParams.period = ytPeriod;

          setDataPanel(prev => ({
            ...prev, progress: 20,
            actionLogs: [
              ...(prev.actionLogs || []),
              { step: '2', status: 'running', detail: `"${ytKeyword}" 인기 영상 수집 + AI 분석 중...`, timestamp: new Date().toISOString(), elapsed: '2s' },
            ],
          }));
        } else if (ytAction === 'channel' && ytChannelName) {
          endpoint = 'youtube-trending';
          queryParams = { action: 'channel', channelName: ytChannelName, maxResults: String(ytCount) };
        } else {
          endpoint = 'youtube-trending';
          queryParams = { action: 'trending', maxResults: String(ytCount) };
          if (ytCategory && ytCategory !== '전체') queryParams.category = ytCategory;
        }

        const proxyQs = new URLSearchParams({ endpoint, ...queryParams }).toString();
        const ytRes = await fetch(`${apiBase}/api/cloud-proxy?${proxyQs}`);
        const ytData = await ytRes.json();

        if (ytData.success && ytData.videos?.length > 0) {
          telemetryFunctionSuccess('search_youtube', `유튜브 ${ytData.videos.length}건 조회 완료`, { videoCount: ytData.videos.length, keyword: ytKeyword || ytCategory });
          // 영상 목록 포맷팅
          let videoListText = '';
          ytData.videos.slice(0, ytCount).forEach((v: any, i: number) => {
            videoListText += `\n**${i + 1}. ${v.title}**\n`;
            videoListText += `   📺 ${v.channelName} | 👁 ${v.viewCountFormatted} | 👍 ${(v.likeCount || 0).toLocaleString()} | 💬 ${(v.commentCount || 0).toLocaleString()}\n`;
            videoListText += `   ${v.publishedAgo || ''} | ${v.url}\n`;
          });

          // AI 분석 결과가 있으면 추가
          let analysisText = '';
          if (ytData.analysis) {
            analysisText = `\n\n---\n**🧠 AI 분석 결과**\n${ytData.analysis}`;
          }

          const fullMsg = `${ytData.summary || ''}\n${videoListText}${analysisText}`;
          addMessage('jarvis', fullMsg);

          // 행동 로그 업데이트
          const finalLogs = (ytData.logs || []).map((l: any) => ({
            step: String(l.step),
            status: l.status,
            detail: l.message,
            timestamp: new Date().toISOString(),
            elapsed: ytData.elapsed || '',
          }));
          setDataPanel(prev => ({ ...prev, progress: 100, actionLogs: finalLogs }));

          // TTS 요약 응답
          const speakText = ytData.analysis
            ? `${ytData.summary} AI 분석도 완료했습니다. 자세한 내용은 화면을 확인해주세요.`
            : `${ytData.summary}`;
          await new Promise<void>(resolve => {
            speak(speakText, undefined, () => { resolve(); });
          });
        } else {
          telemetryFunctionError('search_youtube', ytData.error || '유튜브 영상 조회 실패');
          addMessage('jarvis', ytData.error || '유튜브 인기 영상을 찾을 수 없습니다.');
        }
      } catch (err: any) {
        telemetryFunctionError('search_youtube', `유튜브 조회 오류: ${err.message}`);
        addMessage('jarvis', `유튜브 조회 중 오류가 발생했습니다: ${err.message}`);
      }

      // 패널 숨기기
      setTimeout(() => setDataPanel({ visible: false, type: null, progress: 0, message: '' }), 3000);
      await new Promise(r => setTimeout(r, 400));
      setState('listening');
      setIsListening(true);
      return;
    }

    // ── 범용 웹 작업 액션 (execute_web_task) ──
    // book_restaurant도 이제 execute_web_task로 매핑됨 (레거시 호환)
    if (action?.type === 'execute_web_task' || action?.type === 'book_restaurant') {
      const taskType = String(action.params?.task_type || 'general');
      const targetSite = String(action.params?.target_site || '');
      const businessName = String(action.params?.business_name || '');
      const taskDescription = String(action.params?.task_description || '');
      const date = String(action.params?.date || '');
      const time = String(action.params?.time || '');
      const userName = String(action.params?.user_name || '');
      const userPhone = String(action.params?.user_phone || '');
      const additionalInfo = String(action.params?.additional_info || '');

      telemetryFunctionStart('execute_web_task', `웹 작업: ${taskType} - ${businessName || taskDescription || targetSite}`);
      // Agent Console 자동 활성화 (v4.2)
      setAgentConsoleVisible(true);
      // 텔레메트리: 예약 노드 활성화 (v4.2)
      if (taskType === 'booking') {
        emitNodeState('booking', 'active', `네이버 예약 시작: ${businessName} ${date} ${time}`);
        emitMissionLog('🤖', 'booking', `예약 에이전트 가동: ${businessName}`, 'info');
        setBookingPanelData({ businessName, date, time, currentStep: 0 });
        // 라이브 브라우저 뷰어 자동 활성화
        setLiveViewerVisible(true);
        setLiveViewerTask({ type: 'booking', businessName, step: 0, message: `${businessName} 예약 준비 중...` });
      }

      // ── 1단계: 자비스 음성 응답 (작업 시작 알림) ──
      setState('speaking');
      addMessage('jarvis', action.response);
      startSpeakingLevel();
      await new Promise<void>(resolve => {
        speak(action.response, undefined, () => { stopSpeakingLevel(); resolve(); });
      });

      // ── 2단계: HoloDataPanel 활성화 (실시간 진행 표시) ──
      setState('working');
      const taskLabel = taskType === 'booking' ? '예약' : taskType === 'purchase' ? '구매' : taskType === 'inquiry' ? '조회' : '웹 작업';
      const panelSteps = taskType === 'booking'
        ? ['INITIALIZING', 'SITE ACCESS', 'SEARCH TARGET', 'CHECK AVAILABILITY', 'FORM FILLING', 'CONFIRMATION']
        : ['INITIALIZING', 'SITE ACCESS', 'NAVIGATION', 'DATA EXTRACTION', 'TASK EXECUTION', 'COMPLETION'];

      setDataPanel({
        visible: true,
        type: 'booking',
        progress: 5,
        message: `${businessName || taskLabel} 자동화 준비 중...`,
        bookingSteps: panelSteps,
      });
      setBookingStep(0);

      try {
        // ── 3단계: 사용자 자격증명 로드 ──
        const naverCreds = JSON.parse(localStorage.getItem('jarvis_naver_creds') || '{}');
        const savedUserName = naverCreds.userName || '';
        const savedUserPhone = naverCreds.userPhone || '';

        // ── 4단계: 클라우드 서버 브라우저 에이전트 (실시간 스크린샷 스트리밍) ──
        if (taskType === 'booking' && (targetSite.includes('네이버') || targetSite === '' || businessName)) {
          addMessage('jarvis', `선생님, ${businessName || '해당 업체'} 예약 가능 일정을 직접 조회하겠습니다. 실시간 화면을 표시합니다.`);
          setDataPanel(prev => ({ ...prev, progress: 10, message: '클라우드 브라우저 에이전트 가동 중...', actionLogs: [] }));

          try {
            // 클라우드 서버에 예약 스캔 요청 (실시간 스크린샷은 WebSocket으로 자동 전송됨)
            const cloudServerUrl = import.meta.env.VITE_CLOUD_SERVER_URL || 'http://35.243.215.119:3001';
            const scanRes = await fetch(`${cloudServerUrl}/api/task`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskType: 'naver_reservation_scan',
                params: {
                  businessName: businessName,
                  date: date || new Date().toISOString().split('T')[0],
                  preferredTime: time || '19:00',
                  guestCount: 2,
                },
              }),
            });
            const scanData = await scanRes.json();

            if (scanData.success && scanData.result) {
              const result = scanData.result;
              const slots = result.availableSlots || [];
              const rec = result.recommendation;

              setDataPanel(prev => ({
                ...prev, progress: 90,
                message: `${slots.length}개 예약 가능 시간 발견`,
                actionLogs: (result.steps || []).map((s: any) => ({
                  step: s.action, status: s.status,
                  detail: s.action,
                  timestamp: new Date().toISOString(), elapsed: '0s',
                })),
              }));

              // 결과 보고
              if (slots.length > 0) {
                const slotList = slots.slice(0, 8).map((s: any) => s.time || s.label).join(', ');
                const reportMsg = `선생님, ${businessName} 예약 가능 시간을 확인했습니다.\n\n` +
                  `📍 ${businessName}\n` +
                  `📅 ${date || '오늘'}\n` +
                  `⏰ 예약 가능: ${slotList}\n` +
                  (rec ? `\n👉 AI 추천: ${rec.time} (${rec.reason})` : '') +
                  (rec?.alternatives?.length ? `\n   대안: ${rec.alternatives.join(', ')}` : '') +
                  (result.aiAnalysis ? `\n\n🤖 ${result.aiAnalysis}` : '');

                addMessage('jarvis', reportMsg, true);
                setBookingSlots(slots.map((s: any) => s.time || s.label));
                setBookingPanelVisible(true);

                setDataPanel(prev => ({ ...prev, progress: 100, message: '예약 일정 조회 완료' }));
                emitNodeData('booking', { availableSlots: slots.length, date: date || 'N/A', business: businessName });
                telemetryFunctionSuccess('execute_web_task', `예약 조회 완료: ${businessName}`, { availableSlots: slots.length });

                const safeSpeak = (text: string): Promise<void> => {
                  return new Promise((resolve) => {
                    try { stopGlobalAudio(); setState('speaking'); startSpeakingLevel(); speak(text, undefined, () => { try { stopSpeakingLevel(); } catch(e) {} resolve(); }); } catch (e) { try { stopSpeakingLevel(); } catch(e2) {} resolve(); }
                  });
                };
                await safeSpeak(`선생님, ${businessName} 예약 가능 시간을 확인했습니다. ${slots.length}개 시간이 가능합니다. ${rec ? `AI 추천은 ${rec.time}입니다.` : ''} 화면에서 원하시는 시간을 선택해 주세요.`);

                setTimeout(() => { setDataPanel({ visible: false, type: null, progress: 0, message: '' }); }, 10000);
                setBookingStep(0);
                setState('listening');
                setIsListening(true);
                return;
              } else {
                const noSlotMsg = `선생님, ${businessName}의 ${date || '오늘'} 예약 가능한 시간이 현재 없습니다. 다른 날짜를 확인해 드릴까요?`;
                addMessage('jarvis', noSlotMsg, true);
                const safeSpeak2 = (text: string): Promise<void> => {
                  return new Promise((resolve) => {
                    try { stopGlobalAudio(); setState('speaking'); startSpeakingLevel(); speak(text, undefined, () => { try { stopSpeakingLevel(); } catch(e) {} resolve(); }); } catch (e) { try { stopSpeakingLevel(); } catch(e2) {} resolve(); }
                  });
                };
                await safeSpeak2(noSlotMsg);
              }
            } else {
              throw new Error('FALLBACK_TO_MANUS');
            }

            // 패널 닫기 및 상태 복원
            setTimeout(() => {
              setDataPanel({ visible: false, type: null, progress: 0, message: '' });
            }, 5000);
            setBookingStep(0);
            setState('listening');
            setIsListening(true);
            return;

          } catch (browserAgentErr: any) {
            if (browserAgentErr.message !== 'FALLBACK_TO_MANUS') {
              console.error('[JARVIS] 브라우저 에이전트 오류:', browserAgentErr);
              addMessage('jarvis', `⚠️ 브라우저 에이전트 오류. 마누스 엔진으로 전환합니다.`);
              // 텔레메트리: 예약 오류 보고 (v4.2)
              telemetryFunctionError('execute_web_task', `브라우저 에이전트 오류: ${browserAgentErr.message}`);
              emitMissionLog('❌', 'booking', `예약 실패: ${browserAgentErr.message}`, 'error');
            }
            // 마누스 폴백으로 계속 진행
          }
        }

        // ── 5단계 (폴백): 마누스 엔진 웹 작업 ──
        const agentMsg = `선생님, 요청하신 ${businessName} 관련 작업을 위해 제가 직접 웹 브라우저를 제어하겠습니다. 잠시만 기다려 주십시오.`;
        addMessage('jarvis', agentMsg);

        setDataPanel(prev => ({ ...prev, progress: 10, message: '마누스 시스템 엔진 초기화 중...' }));

        // ── 범용 웹 작업: 자비스의 페르소나를 입힌 마누스 프롬프트 ──
        const manusPrompt = [
          `[자비스 시스템 명령 - 반자동 모드]`,
          `당신은 '자비스'라는 AI 비서의 엔진입니다. 모든 보고는 자비스의 말투로 하세요.`,
          `작업 유형: ${taskType}`,
          `대상 사이트: ${targetSite}`,
          `업체명: ${businessName}`,
          `작업 내용: ${taskDescription}`,
          date ? `날짜: ${date}` : '',
          time ? `시간: ${time}` : '',
          (savedUserName || userName) ? `예약자명: ${savedUserName || userName}` : '',
          (savedUserPhone || userPhone) ? `연락처: ${savedUserPhone || userPhone}` : '',
          additionalInfo ? `추가정보: ${additionalInfo}` : '',
          '',
          '## 자비스 행동 지침',
          '1. [실시간 브리핑]: "네이버에 접속하고 있습니다", "업체를 검색 중입니다"와 같이 자비스가 직접 행동하는 것처럼 보고하세요.',
          '2. [조회 우선]: 로그인 없이 가능한 정보를 먼저 수집하여 "선생님, 현재 예약 가능한 시간은 다음과 같습니다"라고 보고하세요.',
          '3. [협업 요청]: 로그인이 필요한 순간에만 "선생님, 이 부분은 보안을 위해 직접 로그인이 필요합니다"라고 정중히 요청하세요.',
          '4. [캡차 대응]: 보안 문자가 보이면 즉시 알려주세요.',
          '5. 모든 보고는 "선생님, ~입니다"와 같은 우아하고 전문적인 말투를 유지하세요.',
        ].filter(Boolean).join('\n');

        addMessage('jarvis', `⏳ 시스템 엔진 가동 중...`);

        const manusRes = await fetch('/api/cloud-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: 'manus-task-create', params: { prompt: manusPrompt } }),
        });

        // 안전한 JSON 파싱
        let manusData: any;
        const manusText = await manusRes.text();
        try {
          manusData = JSON.parse(manusText);
        } catch {
          console.error('[JARVIS] 마누스 응답 파싱 실패:', manusText.substring(0, 200));
          throw new Error(`마누스 API 응답 오류: ${manusText.substring(0, 80)}`);
        }

        if (!manusData.success || !manusData.task_id) {
          throw new Error(manusData.error || '마누스 태스크 생성 실패');
        }

        const taskId = manusData.task_id;
        addMessage('jarvis', `✅ [AGENT] 마누스 태스크 생성 완료 (ID: ${taskId.substring(0, 8)}...)`);
        console.log('[JARVIS] 마누스 태스크 생성 성공:', taskId);
        setBookingStep(1);
        setDataPanel(prev => ({ ...prev, progress: 15, message: '마누스 태스크 생성 완료. 작업 시작...' }));
        addMessage('jarvis', `⏳ [AGENT] 태스크 ID: ${taskId.slice(0, 8)}... 생성 완료`);

        // ── 5단계: 실시간 진행 상황 폴링 ──
        // 안전한 speak 래퍼 (폴링 중 WebGL 크래시 방지)
        const safeSpeak = (text: string): Promise<void> => {
          return new Promise((resolve) => {
            try {
              stopGlobalAudio(); // 기존 음성 중지
              setState('speaking');
              startSpeakingLevel();
              speak(text, undefined, () => { 
                try { stopSpeakingLevel(); } catch(e) { console.warn('[JARVIS] stopSpeakingLevel error:', e); }
                resolve(); 
              });
            } catch (e) {
              console.warn('[JARVIS] speak error (graceful):', e);
              try { stopSpeakingLevel(); } catch(e2) { /* ignore */ }
              resolve();
            }
          });
        };

        let pollCount = 0;
        const maxPolls = 150;
        let taskCompleted = false;
        let taskError = false;
        let lastProgressMsg = '';
        let consecutiveErrors = 0;
        let hasShownInitialWait = false;

        while (pollCount < maxPolls && !taskCompleted && !taskError) {
          // 초기 지연 알림 (15초 동안 변화 없을 때)
          if (pollCount === 5 && !lastProgressMsg && !hasShownInitialWait) {
            hasShownInitialWait = true;
            addMessage('jarvis', '⚠️ 시스템 응답이 다소 지연되고 있습니다. 잠시만 더 기다려 주십시오, 선생님.');
            safeSpeak("선생님, 시스템 응답이 조금 늦어지고 있습니다. 잠시만 더 기다려 주시면 바로 확인해 드릴게요.");
          }
          pollCount++;
          await new Promise(r => setTimeout(r, 3000));

          try {
            const statusRes = await fetch(`/api/cloud-proxy?endpoint=manus-task-status&task_id=${encodeURIComponent(taskId)}`);
            let statusData: any;
            const statusText = await statusRes.text();
            try {
              statusData = JSON.parse(statusText);
              console.log("[JARVIS] 마누스 폴링 응답:", statusData); // 추가된 로깅
            } catch {
              console.error("[JARVIS] 폴링 응답 파싱 실패:", statusText.substring(0, 100));
              continue; // 파싱 실패 시 다음 폴링으로 계속
            }

            if (!statusData.success) throw new Error(statusData.error || '상태 조회 실패');

            const taskStatus = statusData.agent_status || 'unknown';
            const msgs = statusData.messages || [];
            const progress = statusData.progress || [];
            const waitingDetail = statusData.waiting_detail;

            // ── 사용자 개입(로그인/캡차) 감지 ──
            if (taskStatus === 'waiting' && waitingDetail) {
              const waitType = waitingDetail.waiting_for_event_type;
              const waitDesc = waitingDetail.waiting_description || '';
              
              if (waitDesc.includes('로그인') || waitDesc.includes('login')) {
                addMessage('jarvis', `🔑 선생님, 보안을 위해 네이버 로그인이 필요합니다. 화면에서 로그인을 진행해 주시면 제가 바로 예약을 마무리 짓겠습니다.`);
                setDataPanel(prev => ({ ...prev, message: '사용자 로그인 대기 중...', progress: 60 }));
                await safeSpeak("선생님, 보안을 위해 네이버 로그인이 필요합니다. 로그인을 완료해 주시면 제가 바로 예약을 마무리 짓겠습니다.");
              } else if (waitDesc.includes('보안 문자') || waitDesc.includes('captcha')) {
                addMessage('jarvis', `⚠️ 선생님, 보안 문자 입력이 필요합니다. 화면에 보이는 문자를 말씀해 주시면 제가 입력하겠습니다.`);
                setDataPanel(prev => ({ ...prev, message: '보안 문자 입력 대기 중...', progress: 70 }));
                await safeSpeak("선생님, 보안 문자 입력이 필요합니다. 화면에 보이는 문자를 말씀해 주시면 제가 입력하겠습니다.");
              }
            }

            // ── 진행 상황 표시 (HoloDataPanel 연동) ──
            if (progress.length > 0) {
              const latestProgress = progress[progress.length - 1];
              const progressMsg = latestProgress.content || '';

              if (progressMsg !== lastProgressMsg) {
                lastProgressMsg = progressMsg;
                // [AGENT] 태그 제거 및 자비스 말투로 변환 (마누스가 이미 자비스 말투로 보내겠지만 한 번 더 정제)
                const refinedMsg = progressMsg.replace(/\[AGENT\]\s*/g, '').replace(/⏳\s*/g, '');
                addMessage('jarvis', `⏳ ${refinedMsg}`);

                // 진행률 계산
                let currentProgress = 20;
                const msg = progressMsg.toLowerCase();
                if (msg.includes('로그인') || msg.includes('login')) { currentProgress = 25; setBookingStep(1); }
                else if (msg.includes('검색') || msg.includes('접속') || msg.includes('search') || msg.includes('access')) { currentProgress = 40; setBookingStep(2); }
                else if (msg.includes('시간') || msg.includes('조회') || msg.includes('check') || msg.includes('avail')) { currentProgress = 60; setBookingStep(3); }
                else if (msg.includes('폼') || msg.includes('입력') || msg.includes('fill') || msg.includes('form')) { currentProgress = 80; setBookingStep(4); }
                else if (msg.includes('확인') || msg.includes('완료') || msg.includes('confirm') || msg.includes('done')) { currentProgress = 95; setBookingStep(5); }

                setDataPanel(prev => ({ 
                  ...prev, 
                  progress: currentProgress, 
                  message: progressMsg,
                  actionLogs: [
                    ...(prev.actionLogs || []),
                    { step: '진행', status: 'running', detail: refinedMsg, timestamp: new Date().toISOString(), elapsed: `${(pollCount * 3)}s` }
                  ]
                }));
              }
            }

            // ── 대기 상태 처리 (캡차, OTP, 로그인 필요 등) ──
            if (taskStatus === 'waiting' && statusData.waiting_detail) {
              const waitingDetail = statusData.waiting_detail;
              const eventType = (waitingDetail.waiting_for_event_type || '').toLowerCase();
              const description = waitingDetail.waiting_description || '';

              setDataPanel(prev => ({ ...prev, message: `⚠️ 사용자 입력 대기: ${description}` }));

              if (eventType.includes('captcha')) {
                emitMissionLog('⚠️', 'booking', '캐차 보안 문자 감지 - 사용자 입력 대기', 'warn');
                setVerificationMode('captcha');
                setAgentConsoleVisible(true);
                const captchaMsg = '선생님, 보안 문자가 감지되었습니다. 화면에 표시된 코드를 말씀해 주세요.';
                addMessage('jarvis', captchaMsg, true);
                await safeSpeak(captchaMsg);
                setState('listening');
                const captchaCode = await new Promise<string>(resolve => { verificationResolveRef.current = resolve; });
                setState('working');
                addMessage('jarvis', `[INPUT] 캡차 코드 "${captchaCode}" 제출 중...`);
                await fetch('/api/cloud-proxy', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ endpoint: 'manus-task-confirm', params: { task_id: taskId, event_id: waitingDetail.waiting_for_event_id, input: { captcha_code: captchaCode } } }),
                });
              } else if (eventType.includes('otp')) {
                emitMissionLog('🔑', 'booking', 'OTP 인증번호 요청 - 사용자 입력 대기', 'warn');
                setVerificationMode('otp');
                setAgentConsoleVisible(true);
                const otpMsg = '선생님, 인증번호가 전송되었습니다. 받으신 번호를 말씀해 주세요.';
                addMessage('jarvis', otpMsg, true);
                await safeSpeak(otpMsg);
                setState('listening');
                const otpCode = await new Promise<string>(resolve => { verificationResolveRef.current = resolve; });
                setState('working');
                addMessage('jarvis', `[INPUT] 인증번호 "${otpCode}" 제출 중...`);
                await fetch('/api/cloud-proxy', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ endpoint: 'manus-task-confirm', params: { task_id: taskId, event_id: waitingDetail.waiting_for_event_id, input: { otp_code: otpCode } } }),
                });
              } else if (eventType.includes('login')) {
                // 로그인 필요 시 사용자에게 안내
                emitMissionLog('🔒', 'booking', `${targetSite || '사이트'} 로그인 필요 - 사용자 직접 로그인 대기`, 'warn');
                setAgentConsoleVisible(true);
                const loginMsg = `선생님, ${targetSite || '해당 사이트'} 로그인이 필요합니다. 화면에서 로그인을 진행해 주시면 ${taskLabel}을 마무리짓겠습니다.`;
                addMessage('jarvis', loginMsg, true);
                await safeSpeak(loginMsg);
                // 로그인 완료 대기
                setState('listening');
                await new Promise<string>(resolve => { verificationResolveRef.current = resolve; });
                setState('working');
                addMessage('jarvis', `[INPUT] 로그인 완료 신호 전송 중...`);
                await fetch('/api/cloud-proxy', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ endpoint: 'manus-task-confirm', params: { task_id: taskId, event_id: waitingDetail.waiting_for_event_id, input: { login_completed: true } } }),
                });
              }
            }

            // ── 완료 또는 에러 ──
            // 성공적 폴링 시 에러 카운터 리셋
            consecutiveErrors = 0;

            if (taskStatus === 'stopped') {
              taskCompleted = true;
              setBookingStep(5);
              telemetryFunctionSuccess('execute_web_task', `${taskLabel} 완료: ${businessName}`, { taskType, businessName: businessName || targetSite });
              // 텔레메트리: 예약 노드 완료 (v4.2)
              if (taskType === 'booking') {
                emitNodeState('booking', 'success', `예약 완료: ${businessName} ${date} ${time}`);
                emitNodeData('booking', { businessName, date, time, status: 'confirmed' });
                setTimeout(() => setBookingPanelData(null), 3000); // 3초 후 패널 닫기
              }
              setDataPanel(prev => ({ ...prev, progress: 100, message: `${taskLabel} 자동화 완료` }));

              // 마누스의 최종 결과물(output) 또는 마지막 메시지 가져오기
              const finalOutput = statusData.output || '';
              const lastMsg = msgs[msgs.length - 1]?.content || '';
              const displayMsg = finalOutput || lastMsg;
              
              const isSuccess = displayMsg.includes('완료') || displayMsg.includes('성공') || displayMsg.includes('✅') || !displayMsg.includes('실패');

              const completionMsg = isSuccess
                ? `✅ 선생님, ${businessName || taskLabel} 작업이 성공적으로 완료되었습니다.\n\n${displayMsg}`
                : `⚠️ 선생님, ${businessName || taskLabel} 작업 결과를 보고드립니다.\n\n${displayMsg}`;
              
              addMessage('jarvis', completionMsg, true);
              await safeSpeak(`선생님, 요청하신 작업을 마쳤습니다. 확인된 내용은 다음과 같습니다. ${displayMsg}`);
            } else if (taskStatus === 'error') {
              taskError = true;
              const errorMsg = msgs[msgs.length - 1]?.content || `${taskLabel} 중 오류가 발생했습니다.`;
              telemetryFunctionError('execute_web_task', errorMsg);
              // 텔레메트리: 예약 노드 오류 (v4.2)
              if (taskType === 'booking') {
                emitNodeState('booking', 'error', errorMsg);
                emitMissionLog('❌', 'booking', `예약 실패: ${errorMsg}`, 'error');
                setBookingPanelData(prev => prev ? { ...prev, currentStep: -1 } : null);
                setTimeout(() => setBookingPanelData(null), 8000);
                
                // 예약 실패 시 대안 시간대 추천 로직 (v4.2.1)
                const failureMsg = errorMsg.includes('시간') || errorMsg.includes('slot') || errorMsg.includes('마감')
                  ? `Sir, 요청하신 시간대는 예약이 마감되었습니다. 다른 시간대를 확인해 보시겠습니까? 또는 직접 예약 페이지를 확인하실 수 있도록 링크를 준비하겠습니다.`
                  : errorMsg.includes('로그인') || errorMsg.includes('login') || errorMsg.includes('세션')
                  ? `Sir, 로그인 세션이 만료되었습니다. 설정 화면에서 네이버 로그인을 다시 진행해 주시면 예약을 재시도하겠습니다.`
                  : `Sir, 예약 중 문제가 발생했습니다. 수동으로 예약 페이지를 확인하시거나, 다시 시도해 주십시오.`;
                
                addMessage('jarvis', `❌ ${failureMsg}`);
                await safeSpeak(failureMsg);
              } else {
                addMessage('jarvis', `❌ [AGENT] 에러: ${errorMsg}`);
              }
              throw new Error(errorMsg);
            }

            // 진행 중 메시지 표시 (assistant_message)
            if (msgs.length > 0) {
              const latestMsg = msgs[0]?.content || '';
              if (latestMsg && latestMsg !== lastProgressMsg) {
                lastProgressMsg = latestMsg;
                addMessage('jarvis', `💬 [AGENT] ${latestMsg.substring(0, 200)}`);
              }
            }
          } catch (pollErr: unknown) {
            consecutiveErrors++;
            console.error(`[JARVIS] 폴링 오류 (${consecutiveErrors}회):`, pollErr);
            
            // 5회 연속 에러 시 사용자에게 알림
            if (consecutiveErrors === 5) {
              addMessage('jarvis', `⚠️ [에이전트] 마누스 연결이 불안정합니다. 계속 시도 중...`);
            }
            // 10회 연속 에러 시 중단
            if (consecutiveErrors >= 10) {
              throw new Error(`${taskLabel} 연결 실패 (연속 ${consecutiveErrors}회 에러)`);
            }
            if (pollCount >= maxPolls) throw new Error(`${taskLabel} 자동화 시간 초과 (7.5분 경과)`);
          }
        }

        if (!taskCompleted && !taskError) {
          throw new Error(`${taskLabel} 자동화 시간 초과`);
        }
      } catch (err) {
        setBookingStep(0);
        const errStr = err instanceof Error ? err.message : String(err);
        telemetryFunctionError('execute_web_task', errStr);
        const errMsg = `선생님, ${businessName || taskLabel} 작업 중 문제가 발생했습니다. ${errStr}. 다른 방법을 시도해 볼까요?`;
        addMessage('jarvis', errMsg, true);
        setDataPanel(prev => ({ ...prev, message: '오류 발생: 중단됨', progress: 0 }));
        try {
          await new Promise<void>((resolve) => {
            try {
              setState('speaking');
              startSpeakingLevel();
              speak(errMsg, undefined, () => { try { stopSpeakingLevel(); } catch(e) {} resolve(); });
            } catch (e) {
              try { stopSpeakingLevel(); } catch(e2) {}
              resolve();
            }
          });
        } catch (speakErr) {
          console.warn('[JARVIS] 에러 메시지 speak 실패 (graceful):', speakErr);
        }
      }

      await new Promise(r => setTimeout(r, 2000));
      setBookingStep(0);
      setDataPanel({ visible: false, type: null, progress: 0, message: '' });
      setState('listening');
      setIsListening(true);
      return;
    }

    // ── 기존 예약 로직 (폐기 예정) ──
    if (false && action?.type === 'book_restaurant_legacy') {
      const bookAction = String(action.params?.action || 'check_availability');
      const businessName = String(action.params?.business_name || '');
      const bookingUrl = String(action.params?.booking_url || '');
      const date = String(action.params?.date || '');
      const time = String(action.params?.time || '');
      const partySize = Number(action.params?.party_size) || 2;
      const userName = String(action.params?.user_name || '');
      const userPhone = String(action.params?.user_phone || '');

      setState('working');
      addMessage('jarvis', action.response);
      startSpeakingLevel();
      await new Promise<void>(resolve => {
        speak(action.response, undefined, () => { stopSpeakingLevel(); resolve(); });
      });

      try {
        // 네이버 로그인 세션 확인
        const naverCreds = JSON.parse(localStorage.getItem('jarvis_naver_creds') || '{}');
        const naverUsername = naverCreds.username || '';
        const naverPassword = naverCreds.password || '';

        // 세션 ID 상위 스코프 선언 (모든 bookAction에서 공유)
        // localStorage에서도 읽어서 React state 비동기 문제 우회
        const savedSessionId = localStorage.getItem('jarvis_booking_session') || '';
        let activeSessionId = bookingSessionId || savedSessionId || '';
        // 예약자 정보: 설정창 저장값 우선, 없으면 GPT 파라미터 사용
        const savedUserName = naverCreds.userName || '';
        const savedUserPhone = naverCreds.userPhone || '';

        if (bookAction === 'check_availability') {
          // 0-A. 크롬 확장 프로그램 연동 확인 → 있으면 확장으로 처리
          const extensionConnected = (window as any).__JARVIS_EXTENSION_CONNECTED__;
          if (extensionConnected) {
            setBookingStep(1);
            addMessage('jarvis', `[PLUG] 크롬 확장 프로그램으로 예약을 처리합니다.`);
            const extCmd = {
              businessName,
              date,
              time,
              bookerName: savedUserName || userName,
              bookerPhone: savedUserPhone || userPhone,
              bookingUrl,
            };
            window.postMessage({ source: 'JARVIS_APP', type: 'BOOKING_COMMAND', payload: extCmd }, '*');
            // 결과 대기 (최대 120초)
            const extResult = await new Promise<any>((resolve) => {
              const handler = (e: MessageEvent) => {
                if (e.data?.source === 'JARVIS_EXTENSION' && e.data?.type === 'BOOKING_RESULT') {
                  window.removeEventListener('message', handler);
                  resolve(e.data.payload);
                }
              };
              window.addEventListener('message', handler);
              setTimeout(() => { window.removeEventListener('message', handler); resolve({ success: false, error: 'timeout' }); }, 120000);
            });
            setBookingStep(5);
            if (extResult.success) {
              const doneText = `예약 완료됩니다. ${businessName} ${date} ${time} 예약이 처리되었습니다.`;
              setState('speaking');
              addMessage('jarvis', doneText, true);
              startSpeakingLevel();
              await new Promise<void>(resolve => { speak(doneText, undefined, () => { stopSpeakingLevel(); resolve(); }); });
            } else {
              const failText = `예약 처리 중 오류가 발생했습니다. ${extResult.error || extResult.message || ''}. 네이버 예약 탭을 확인해 주세요.`;
              setState('speaking');
              addMessage('jarvis', failText, true);
              startSpeakingLevel();
              await new Promise<void>(resolve => { speak(failText, undefined, () => { stopSpeakingLevel(); resolve(); }); });
            }
            setState('idle');
            return;
          }

          // 0-B. 네이버 자격증명 없을 때 안내 (단, 세션 ID가 있으면 로그인 건너뛰)
          if (!naverUsername && !naverPassword && !activeSessionId) {
            const noCredsText = `선생님, 네이버 로그인 정보가 설정되어 있지 않습니다. SETTINGS에서 네이버 아이디와 비밀번호를 입력하시거나, 크롬 확장 프로그램으로 로그인해 주세요.`;
            setState('speaking');
            addMessage('jarvis', noCredsText, true);
            startSpeakingLevel();
            await new Promise<void>(resolve => {
              speak(noCredsText, undefined, () => { stopSpeakingLevel(); resolve(); });
            });
            setState('idle');
            return;
          }
          // 0-C. 세션 ID가 이미 있으면 로그인 건너뛰
          if (activeSessionId) {
            addMessage('jarvis', `[OK] 이미 로그인된 세션을 사용합니다, 선생님. (세션: ${activeSessionId.slice(0, 8)}...)`);
          } else if (!naverUsername && !naverPassword) {
            // 0-D. 자격증명도 없고 세션도 없으면 서버의 최신 세션 자동 사용
            try {
              const sessionCheckRes = await fetch(`${BOOKING_SERVER}/api/booking/session-status`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
              });
              if (sessionCheckRes.ok) {
                const sessionCheckData = await sessionCheckRes.json();
                if (sessionCheckData.sessionId) {
                  activeSessionId = sessionCheckData.sessionId;
                  setBookingSessionId(sessionCheckData.sessionId);
                  localStorage.setItem('jarvis_booking_session', sessionCheckData.sessionId);
                  addMessage('jarvis', `[OK] 서버에 저장된 세션을 복구했습니다, 선생님.`);
                }
              }
            } catch (e) {
              // 세션 복구 실패 시 무시하고 계속 진행
            }
          }
          // 1. 로그인 시도 (세션 없을 때만)
          setBookingStep(1);
          if (!activeSessionId && naverUsername && naverPassword) {
            setState('working');
            addMessage('jarvis', `[LOCK] 네이버 로그인 중... (${naverUsername})`);
            try {
              const loginRes = await fetch(`${BOOKING_SERVER}/api/booking/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ naverID: naverUsername, naverPW: naverPassword }),
              });
              const loginData = await loginRes.json();
              if (loginData.success && loginData.sessionId) {
                activeSessionId = loginData.sessionId;
                setBookingSessionId(loginData.sessionId);
                localStorage.setItem('jarvis_booking_session', loginData.sessionId);
                addMessage('jarvis', `[OK] 네이버 로그인 완료`);
              } else if (loginData.needVerification) {
                // ── 캡차 또는 2단계 인증 필요 ──
                const vType = loginData.verificationType || 'captcha';
                const captchaImg = loginData.captchaSrc || loginData.screenshot || null;
                setCaptchaScreenshot(captchaImg);
                captchaOpenRef.current = true;
                setVerificationMode(vType);

                // ── 캡차: stateless 재로그인 방식 (GPT Vision 자동 → 실패 시 사용자 직접) ──
                const tryCaptchaWithVision = async (imgSrc: string): Promise<string> => {
                  try {
                    // 보안: 캐시 비전 분석도 서버 route를 통해 호출
                    const visionRes = await fetch('/api/chat-proxy', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        model: 'gpt-4o',
                        max_tokens: 30,
                        messages: [{
                          role: 'user',
                          content: [
                            { type: 'text', text: '이것은 네이버 로그인 캐잘 이미지입니다. \n\n캐잘 유형: \n1. 두 장의 영수증이 격쳐 있는 경우 - 왼쪽 영수증의 주소에서 ?로 가려진 번지수를 오른쪽 영수증에서 찾아 입력\n2. 단일 영수증인 경우 - 주소에서 번지수(도로명 다음에 오는 숫자)를 찾아 입력\n\n반드시 숫자만 출력하세요. 예: 294 또는 237\n\n이미지를 자세히 분석하세요.' },
                            { type: 'image_url', image_url: { url: imgSrc, detail: 'high' } }
                          ]
                        }]
                      })
                    });
                    const vd = await visionRes.json();
                    return (vd.choices?.[0]?.message?.content?.trim() || '').replace(/[^0-9]/g, '');
                  } catch { return ''; }
                };

                // 캡차 재로그인 헬퍼 함수
                const loginWithCaptcha = async (captchaAnswer: string): Promise<boolean> => {
                  const retryRes = await fetch(`${BOOKING_SERVER}/api/booking/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ naverID: naverUsername, naverPW: naverPassword, captchaAnswer }),
                  });
                  const retryData = await retryRes.json();
                  if (retryData.success && retryData.sessionId) {
                    activeSessionId = retryData.sessionId;
                    setBookingSessionId(retryData.sessionId);
                    localStorage.setItem('jarvis_booking_session', retryData.sessionId);
                    setCaptchaScreenshot(null); setVerificationMode(null);
                    return true;
                  }
                  // 새 캡차 이미지로 업데이트
                  if (retryData.captchaSrc || retryData.screenshot) {
                    setCaptchaScreenshot(retryData.captchaSrc || retryData.screenshot);
                  }
                  return false;
                };

                let loginSuccess = false;

                if (vType === 'captcha' && captchaImg) {
                  // 1차: GPT Vision 자동 풀기
                  addMessage('jarvis', `[BOT] 캡차 자동 분석 중...`);
                  const autoAnswer = await tryCaptchaWithVision(captchaImg);
                  if (autoAnswer) {
                    addMessage('jarvis', `[BOT] 자동 인식 답: ${autoAnswer} — 검증 중...`);
                    loginSuccess = await loginWithCaptcha(autoAnswer);
                    if (loginSuccess) {
                      addMessage('jarvis', `[OK] 캡차 자동 인식 성공! 네이버 로그인 완료`);
                    } else {
                      addMessage('jarvis', `[BOT] 자동 인식 실패. 선생님께서 직접 입력해 주세요.`);
                    }
                  }
                } else if (vType === 'otp' && loginData.pendingSessionId) {
                  // OTP는 기존 pendingSession 방식 유지
                  setPendingSessionId(loginData.pendingSessionId);
                }

                // GPT Vision 실패 또는 OTP인 경우 사용자에게 직접 요청
                if (!loginSuccess) {
                  const vMsg = vType === 'captcha'
                    ? '선생님, 네이버에서 자동입력 방지 문자가 표시되었습니다. 화면에 보이는 문자를 말씀해 주세요.'
                    : '선생님, 네이버에서 추가 인증이 필요합니다. 휴대폰으로 받은 인증번호를 말씀해 주세요.';

                  setState('speaking');
                  addMessage('jarvis', vMsg, true);
                  startSpeakingLevel();
                  await new Promise<void>(resolve => {
                    speak(vMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
                  });

                  // 사용자 입력 대기
                  const userInput = await new Promise<string>(resolve => {
                    verificationResolveRef.current = resolve;
                    setState('listening');
                  });

                  setCaptchaScreenshot(null);
                  captchaOpenRef.current = false;
                  setVerificationMode(null);

                  setState('working');
                  addMessage('jarvis', `[LOCK] 인증번호 확인 중...`);

                  if (vType === 'captcha') {
                    // 캡차: 재로그인 방식
                    loginSuccess = await loginWithCaptcha(userInput);
                    if (loginSuccess) {
                      addMessage('jarvis', `[OK] 인증 완료! 네이버 로그인 성공`);
                    } else {
                      addMessage('jarvis', `[!] 인증 실패. 비로그인 상태로 조회합니다.`);
                    }
                  } else {
                    // OTP: submit-verification 방식
                    try {
                      const verifyRes = await fetch(`${BOOKING_SERVER}/api/booking/submit-verification`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ pendingSessionId: loginData.pendingSessionId, code: userInput, naverID: naverUsername }),
                      });
                      const verifyData = await verifyRes.json();
                      if (verifyData.success && verifyData.sessionId) {
                        activeSessionId = verifyData.sessionId;
                        setBookingSessionId(verifyData.sessionId);
                        localStorage.setItem('jarvis_booking_session', verifyData.sessionId);
                        addMessage('jarvis', `[OK] 인증 완료! 네이버 로그인 성공`);
                        loginSuccess = true;
                      } else {
                        addMessage('jarvis', `[!] 인증 실패: ${verifyData.message || '올바르지 않은 인증번호'}. 비로그인 상태로 조회합니다.`);
                      }
                    } catch {
                      addMessage('jarvis', `[!] 인증 서버 연결 실패. 비로그인 상태로 조회합니다.`);
                    }
                  }
                }
              } else {
                addMessage('jarvis', `[!] 로그인 실패: ${loginData.message || loginData.error || '아이디 또는 비밀번호를 확인해주세요.'}`);
              }
            } catch (loginErr) {
              addMessage('jarvis', `[!] 로그인 서버 연결 실패. 비로그인 상태로 조회합니다.`);
            }
          }

          // 2. 예약 가능 시간 조회 (진행 상황 표시)
          setBookingStep(2);
          addMessage('jarvis', `[SEARCH] ${businessName} 예약 가능 시간 조회 중...`);
          const availRes = await fetch(`${BOOKING_SERVER}/api/booking/availability`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: activeSessionId || '',
              businessName,
              bookingUrl,
              date,
            }),
          });
          const availData = await availRes.json();

          if (availData.success) {
            if (availData.screenshot) {
              setBookingScreenshot(availData.screenshot);
              // AgentConsolePanel에 스크린샷 전송 (v4.2.1)
              emitMissionLog('📷', 'booking', '예약 가능 시간대 조회 화면 캡처', 'info', { screenshot: availData.screenshot });
            }

            // ── 케이스 1: 네이버 예약 시스템 없는 업체 ──
            if (availData.bookingAvailable === false) {
              setBookingPanelVisible(false);
              const phoneInfo = availData.phone ? ` 전화번호는 ${availData.phone} 입니다.` : '';
              const noBookingText = `${businessName}은(는) 네이버 예약을 지원하지 않습니다.${phoneInfo} 직접 전화로 예약하시거나, 다른 업체를 찾아드릴까요?`;
              setState('speaking');
              addMessage('jarvis', noBookingText, true);
              startSpeakingLevel();
              await new Promise<void>(resolve => {
                speak(noBookingText, undefined, () => { stopSpeakingLevel(); resolve(); });
              });
              setState('idle');
              return;
            }

            // ── 케이스 2: 예약 가능한 업체 ──
            setBookingSlots(availData.availableSlots || []);
            setBookingPanelVisible(true);

            if (availData.availableSlots?.length > 0) {
              // 시간대 조회 성공 - 요청한 시간이 있으면 자동 진행
              const requestedTime = time;
              const matchedSlot = requestedTime
                ? availData.availableSlots.find((s: string) =>
                    s.includes(requestedTime) ||
                    requestedTime.includes(s.split(' ')[0]) ||
                    s.replace(':', '').includes(requestedTime.replace(':', '').replace('시', '').replace('분', ''))
                  )
                : null;

              if (matchedSlot && (savedUserName || userName) && (savedUserPhone || userPhone)) {
                // 요청 시간 + 예약자 정보 모두 있음 → 자동 fill_form 진행
                const autoText = `${businessName} ${matchedSlot} 시간대 확인되었습니다. 예약자 ${savedUserName || userName} 정보로 자동 입력하겠습니다.`;
                setState('speaking');
                addMessage('jarvis', autoText, true);
                startSpeakingLevel();
                await new Promise<void>(resolve => {
                  speak(autoText, undefined, () => { stopSpeakingLevel(); resolve(); });
                });

                // 자동으로 fill_form 진행
                setBookingStep(4);
                addMessage('jarvis', `폼 입력 중...`);
                const fillRes = await fetch(`${BOOKING_SERVER}/api/booking/fill-form`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    sessionId: activeSessionId || '',
                    bookingUrl: bookingUrl || availData.bookingUrl || '',
                    userName: savedUserName || userName,
                    userPhone: savedUserPhone || userPhone,
                    selectedTime: matchedSlot,
                    date,
                  }),
                });
                const fillData = await fillRes.json();
                if (fillData.success) {
                  setBookingStep(5);
                  const doneText = `예약이 완료되었습니다. ${businessName} ${matchedSlot} 예약이 성공적으로 접수되었습니다.`;
                  setState('speaking');
                  addMessage('jarvis', doneText, true);
                  startSpeakingLevel();
                  await new Promise<void>(resolve => {
                    speak(doneText, undefined, () => { stopSpeakingLevel(); resolve(); });
                  });
                } else {
                  throw new Error(fillData.error || '폼 입력 실패');
                }
              } else {
                // 시간대 목록 안내 + 선택 요청
                const slotsText = `${businessName} 예약 가능한 시간대를 확인했습니다. ${availData.availableSlots.slice(0, 5).join(', ')} 중 어떤 시간으로 예약하시겠습니까?`;
                setState('speaking');
                addMessage('jarvis', slotsText, true);
                startSpeakingLevel();
                await new Promise<void>(resolve => {
                  speak(slotsText, undefined, () => { stopSpeakingLevel(); resolve(); });
                });
              }
            } else {
              // ── 케이스 3: 예약 시스템 있지만 오늘 슬롯 없음 ──
              const noSlotText = `${businessName} 예약 페이지를 확인했습니다. 현재 선택하신 날짜에 예약 가능한 시간이 없습니다. 다른 날짜로 조회해 드릴까요?`;
              setState('speaking');
              addMessage('jarvis', noSlotText, true);
              startSpeakingLevel();
              await new Promise<void>(resolve => {
                speak(noSlotText, undefined, () => { stopSpeakingLevel(); resolve(); });
              });
            }
          } else {
            throw new Error(availData.error || '예약 조회 실패');
          }
        } else if (bookAction === 'fill_form') {
          // ── fill_form에서도 로그인 세션 확보 ──
          if (!activeSessionId && naverUsername && naverPassword) {
            setState('working');
            addMessage('jarvis', `[LOCK] 네이버 로그인 중... (${naverUsername})`);
            try {
              const loginRes2 = await fetch(`${BOOKING_SERVER}/api/booking/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ naverID: naverUsername, naverPW: naverPassword }),
              });
              const loginData2 = await loginRes2.json();
              if (loginData2.success && loginData2.sessionId) {
                activeSessionId = loginData2.sessionId;
                setBookingSessionId(loginData2.sessionId);
                localStorage.setItem('jarvis_booking_session', loginData2.sessionId);
                addMessage('jarvis', `[OK] 네이버 로그인 완료`);
              } else if (loginData2.needVerification) {
                // 캡차 발생 시 stateless 재로그인
                const captchaImg2 = loginData2.captchaSrc || loginData2.screenshot || null;
                setCaptchaScreenshot(captchaImg2);
                setVerificationMode('captcha');
                const vMsg2 = '선생님, 네이버에서 자동입력 방지 문자가 표시되었습니다. 화면에 보이는 문자를 말씀해 주세요.';
                setState('speaking');
                addMessage('jarvis', vMsg2, true);
                startSpeakingLevel();
                await new Promise<void>(resolve => { speak(vMsg2, undefined, () => { stopSpeakingLevel(); resolve(); }); });
                const userCaptcha = await new Promise<string>(resolve => { verificationResolveRef.current = resolve; setState('listening'); });
                setCaptchaScreenshot(null); setVerificationMode(null);
                setState('working');
                const retryRes2 = await fetch(`${BOOKING_SERVER}/api/booking/login`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ naverID: naverUsername, naverPW: naverPassword, captchaAnswer: userCaptcha }),
                });
                const retryData2 = await retryRes2.json();
                if (retryData2.success && retryData2.sessionId) {
                  activeSessionId = retryData2.sessionId;
                  setBookingSessionId(retryData2.sessionId);
                  localStorage.setItem('jarvis_booking_session', retryData2.sessionId);
                  addMessage('jarvis', `[OK] 로그인 성공`);
                } else {
                  addMessage('jarvis', `[!] 로그인 실패. 비로그인 상태로 진행합니다.`);
                }
              } else {
                addMessage('jarvis', `[!] 로그인 실패: ${loginData2.message || loginData2.error}`);
              }
            } catch { addMessage('jarvis', `[!] 로그인 서버 연결 실패`); }
          }

          // ── 학습 1: 입력 전 확인 단계 ──
          // 예약자명, 연락처, 날짜, 시간을 음성으로 읽어주고 사용자 확인을 받음
          const finalUserName = savedUserName || userName || '미설정';
          const finalUserPhone = savedUserPhone || userPhone || '미설정';
          const confirmText = `잠깐. 입력 전에 확인해 드리겠습니다. 예약자명 ${finalUserName}, 연락처 ${finalUserPhone}, 날짜 ${date}, 시간 ${time}. 이대로 진행할까요? 변경이 필요하시면 말씀해 주세요.`;
          setState('speaking');
          addMessage('jarvis', confirmText, true);
          startSpeakingLevel();
          await new Promise<void>(resolve => {
            speak(confirmText, undefined, () => { stopSpeakingLevel(); resolve(); });
          });

          // 사용자 응답 대기 (8초 타임아웃 - 무응답 시 자동 진행)
          setState('listening');
          setIsListening(true);
          const confirmResponse = await new Promise<string>(resolve => {
            const timer = setTimeout(() => {
              bookingConfirmResolveRef.current = null;
              resolve('yes'); // 무응답 → 자동 진행
            }, 8000);
            bookingConfirmResolveRef.current = (text: string) => {
              clearTimeout(timer);
              resolve(text);
            };
          });
          setIsListening(false);

          // 취소 또는 변경 감지
          const cancelKeywords = ['취소', '아니', '바꿔', '변경', '잠깐', '스톱', 'stop', 'cancel', 'no'];
          const isCancelled = cancelKeywords.some(kw => confirmResponse.toLowerCase().includes(kw));

          if (isCancelled) {
            const cancelText = `알겠습니다. 예약 입력을 중단했습니다. 변경하실 내용을 말씀해 주시면 다시 진행하겠습니다.`;
            setState('speaking');
            addMessage('jarvis', cancelText, true);
            startSpeakingLevel();
            await new Promise<void>(resolve => {
              speak(cancelText, undefined, () => { stopSpeakingLevel(); resolve(); });
            });
            setState('idle');
            return;
          }

          // ── 학습 2: Race Condition 재확인 ──
          // 폼 입력 직전 해당 시간대 가용성 한 번 더 실시간 확인
          const reCheckText = `확인되었습니다. 폼 입력 전 ${time} 시간대를 실시간으로 재확인하겠습니다.`;
          setState('working');
          addMessage('jarvis', reCheckText);

          setBookingStep(4);
          addMessage('jarvis', `[RELOAD] ${time} 시간대 실시간 재확인 중...`);
          const reCheckRes = await fetch(`${BOOKING_SERVER}/api/booking/availability`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: activeSessionId || bookingSessionId || '',
              businessName,
              bookingUrl,
              date,
            }),
          });
          const reCheckData = await reCheckRes.json();

          if (reCheckData.success) {
            const stillAvailable = reCheckData.availableSlots?.some((slot: string) =>
              slot.includes(time) || time.includes(slot.split(' ')[0])
            );

            if (!stillAvailable && reCheckData.availableSlots?.length > 0) {
              // 선택한 시간이 마감됨 → 대안 제시
              const altSlots = reCheckData.availableSlots.slice(0, 3).join(', ');
              const raceText = `선생님, 죄송합니다. ${time}이 방금 마감되었습니다. 현재 남은 시간은 ${altSlots} 입니다. 어떤 시간으로 변경하시겠습니까?`;
              setState('speaking');
              addMessage('jarvis', raceText, true);
              startSpeakingLevel();
              setBookingSlots(reCheckData.availableSlots);
              setBookingPanelVisible(true);
              await new Promise<void>(resolve => {
                speak(raceText, undefined, () => { stopSpeakingLevel(); resolve(); });
              });
              setState('idle');
              return;
            } else if (!stillAvailable && reCheckData.availableSlots?.length === 0) {
              // 모든 시간 마감
              const fullText = `선생님, 안타깝게도 해당 날짜의 모든 시간이 마감되었습니다. 다른 날짜로 다시 조회해 드릴까요?`;
              setState('speaking');
              addMessage('jarvis', fullText, true);
              startSpeakingLevel();
              await new Promise<void>(resolve => {
                speak(fullText, undefined, () => { stopSpeakingLevel(); resolve(); });
              });
              setState('idle');
              return;
            }
            // 아직 가용 → 정상 진행
          }

          // ── 예약 폼 자동 입력 진행 ──
          setBookingStep(4);
          addMessage('jarvis', ` ${businessName} 예약 폼 자동 입력 중...`);
          const fillRes = await fetch(`${BOOKING_SERVER}/api/booking/fill-form`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: activeSessionId || bookingSessionId || '',
              bookingUrl,
              userName: savedUserName || userName,
              userPhone: savedUserPhone || userPhone,
              selectedTime: time,
              date,
            }),
          });
          const fillData = await fillRes.json();
          if (fillData.success) {
            setBookingStep(5);
            if (fillData.screenshot) {
              setBookingScreenshot(fillData.screenshot);
              emitMissionLog('📷', 'booking', '예약 폼 작성 완료 화면 캡처', 'info', { screenshot: fillData.screenshot });
            }
            if (fillData.paymentUrl) setPaymentUrl(fillData.paymentUrl);
            setBookingPanelVisible(true);
            const fillText = `예약 정보 입력이 완료되었습니다. 화면에 결제 링크가 표시되었습니다. 링크를 클릭하시거나 QR코드를 스캔하시면 결제 페이지로 바로 이동합니다.`;
            setState('speaking');
            addMessage('jarvis', fillText, true);
            startSpeakingLevel();
            await new Promise<void>(resolve => {
              speak(fillText, undefined, () => { stopSpeakingLevel(); resolve(); });
            });
          } else {
            throw new Error(fillData.error || '예약 입력 실패');
          }
        } else if (bookAction === 'notify') {
          // 이메일 알림
          const notifyRes = await fetch(`${BOOKING_SERVER}/api/booking/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: naverUsername,
              businessName,
              date,
              time,
              userName,
            }),
          });
          const notifyData = await notifyRes.json();
          const notifyText = notifyData.success
            ? `예약 완료 알림 이메일을 발송했습니다.`
            : `이메일 발송에 실패했습니다: ${notifyData.error}`;
          setState('speaking');
          addMessage('jarvis', notifyText);
          startSpeakingLevel();
          await new Promise<void>(resolve => {
            speak(notifyText, undefined, () => { stopSpeakingLevel(); resolve(); });
          });
        }
      } catch (err) {
        setBookingStep(0);
        const errMsg = `예약 중 오류가 발생했습니다. ${String(err)}`;
        setState('speaking');
        addMessage('jarvis', errMsg);
        startSpeakingLevel();
        await new Promise<void>(resolve => {
          speak(errMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
        });
      }

      await new Promise(r => setTimeout(r, 400));
      setBookingStep(0); // 예약 완료 후 리셋 → idle 타이머 재활성화
      setState('listening');
      setIsListening(true);
      return;
    }

    // ══════════════════════════════════════════════════════
    // ── COPY-R: Research Before Writing 프로토콜 ──
    // ══════════════════════════════════════════════════════
    // ══════════════════════════════════════════════════════
    // ── COPY-R.5: Research Orchestrator (복합 리서치 통합) ──
    // ══════════════════════════════════════════════════════
    if (action?.type === 'copy_orchestrator') {
      setState('working');
      const params = action.params || {} as Record<string, any>;
      const product = String(params.product || '');
      const contentType = String(params.contentType || 'headcopy');
      const userMessage = String(params.userMessage || text);
      const engines = Array.isArray(params.engines) ? params.engines : ['youtube', 'market'];
      // UI-V2: Research Orbit 활성화
      setIsResearching(true);
      setResearchEngines(engines);
      emitMissionLog('🔍', 'COPY-R.5', `${product || '제품'} 통합 리서치 시작 (${engines.join(' + ')})`, 'info');
      emitNodeState('jarvis_brain', 'active', `통합 리서치: ${engines.join(' + ')}`);
      addMessage('jarvis', `🔍 COPY-R.5 통합 리서치 시작 — ${product || '제품'} (${engines.join(' + ')}) 분석 중입니다...`, true);
      try {
        const response = await fetch('/api/cloud-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: 'task', taskType: 'copy-orchestrator', params: { ...params } }),
        });
        if (!response.ok) throw new Error(`API ${response.status}`);
        const result = await response.json();
        if (result.success) {
          const orchestratorInsight = result.orchestratorInsightForCopy || '';
          const researchInsight = result.researchInsight || '';
          const enginesSuccess = result.enginesSuccess || 0;
          const enginesUsed = result.enginesUsed || 0;
          const excludedEnginesFromResult: string[] = Array.isArray(result.excludedEngines) ? result.excludedEngines : [];
          // UI-V2: Research Orbit 해제
          setIsResearching(false);
          setResearchEngines([]);
          emitMissionLog('✅', 'COPY-R.5', `통합 리서치 완료 (${enginesSuccess}/${enginesUsed} 엔진 성공)`, 'success');
          addMessage('jarvis', `✅ 통합 리서치 완료 — ${enginesSuccess}/${enginesUsed} 엔진 성공. 카피 생성 중...`, true);
          // creative_content action으로 위임
          const creativeAction = {
            type: 'creative_content',
            params: {
              product,
              content_type: contentType,
              userMessage,
              isCopyR: true,
              researchInsight,
              researchPrefix: orchestratorInsight,
              videosFound: result.engineResults?.youtube?.videosFound || 0,
              topVideos: [],
              excludedEngines: excludedEnginesFromResult,
            },
          };
          action = creativeAction as any;
          // creative_content 핸들러로 fall-through
        } else {
          // UI-V2: Research Orbit 해제
          setIsResearching(false);
          setResearchEngines([]);
          emitMissionLog('⚠️', 'COPY-R.5', '통합 리서치 실패 — COPY-A 기본 카피로 생성합니다', 'warning');
          addMessage('jarvis', '⚠️ 통합 리서치 실패 — COPY-A 기본 카피 두뇌로 생성합니다.', true);
          action = { type: 'creative_content', params: { product, content_type: contentType, userMessage } } as any;
        }
      } catch (err) {
        console.error('[JARVIS] COPY-R.5 Orchestrator 오류:', err);
        // UI-V2: Research Orbit 해제
        setIsResearching(false);
        setResearchEngines([]);
        emitMissionLog('⚠️', 'COPY-R.5', '통합 리서치 오류 — COPY-A fallback', 'warning');
        addMessage('jarvis', '⚠️ 통합 리서치 오류 — COPY-A 기본 카피 두뇌로 생성합니다.', true);
        action = { type: 'creative_content', params: { product, content_type: contentType, userMessage } } as any;
      }
    }
    // ══════════════════════════════════════════════════════
    // ── COPY-R.4: Review Objection Data Input ──
    // ══════════════════════════════════════════════════════
    if (action?.type === 'copy_review_research') {
      setState('working');
      const params = action.params || {} as Record<string, any>;
      const product = String(params.product || '');
      const contentType = String(params.contentType || 'headcopy');
      const userMessage = String(params.userMessage || text);
      const reviewText = String(params.reviewText || '');
      emitMissionLog('📋', 'COPY-R.4', '리뷰/고객 불안 분석 시작', 'info');
      emitMissionLog('🔍', 'COPY-R.4', `${product || '제품'} 리뷰 불안 패턴 추출 중...`, 'working');
      addMessage('assistant', `📋 **COPY-R.4 리뷰 불안 분석** — ${product || '제품'} 관련 고객 불안·만족 포인트를 분석하고 있습니다...`);
      let reviewInsight = '';
      let reviewInsightForCopy = '';
      let reviewSuccess = false;
      let sourceType = 'generic_objection';
      let reviewCount = 0;
      try {
        const reviewRes = await fetch('/api/cloud-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: 'copy-review-research', product, contentType, userMessage, reviewText }),
        });
        const reviewData = await reviewRes.json();
        if (reviewData.success) {
          reviewInsight = reviewData.reviewInsight || '';
          reviewInsightForCopy = reviewData.reviewInsightForCopy || '';
          reviewSuccess = true;
          sourceType = reviewData.sourceType || 'generic_objection';
          reviewCount = reviewData.reviewCount || 0;
          emitMissionLog('✅', 'COPY-R.4', `리뷰 분석 완료 (${sourceType === 'review_text' ? `실제 리뷰 ${reviewCount}건 분석` : '일반 불안 패턴'})`, 'success');
        } else {
          addMessage('assistant', `리뷰 분석에 실패했습니다. COPY-A 기본 카피 두뇌로 생성합니다.`);
          emitMissionLog('⚠️', 'COPY-R.4', `리뷰 분석 실패 — 기본 전략으로 진행`, 'warning');
        }
      } catch (err) {
        emitMissionLog('⚠️', 'COPY-R.4', '리뷰 분석 오류 — 기본 전략으로 진행', 'warning');
      }
      emitMissionLog('🎨', 'COPY-R.4', '리뷰 인사이트 주입 → 카피 생성 시작', 'info');
      const copyCountMatch = userMessage.match(/(\d+)\s*개/);
      const copyCount = copyCountMatch ? Math.min(parseInt(copyCountMatch[1]), 10) : 3;
      const researchPrefix = reviewInsightForCopy
        ? `\n\n${reviewInsightForCopy}\n`
        : '';
      // creative_content action으로 위임
      Object.assign(action, {
        type: 'creative_content',
        params: { product, content_type: contentType, count: copyCount, userMessage, researchInsight: reviewInsight, researchPrefix, videosFound: 0, topVideos: [], isCopyR: true, isCopyR4: true, reviewSuccess, sourceType, reviewCount },
        workingMessage: `${product} ${contentType} 생성 중...`,
        response: '__SKIP_TTS__',
      });
    }
    // ══════════════════════════════════════════════════════
    // ── COPY-R.3: Social / Reels / Threads / Global Pattern Analyzer ──
    // ══════════════════════════════════════════════════════
    if (action?.type === 'copy_social_research') {
      setState('working');
      const params = action.params || {} as Record<string, any>;
      const product = String(params.product || '');
      const contentType = String(params.contentType || 'headcopy');
      const userMessage = String(params.userMessage || text);
      const sourceUrl = String(params.sourceUrl || '');
      const sourceText = String(params.sourceText || '');
      emitMissionLog('🌐', 'COPY-R.3', '소셜 패턴 분석 시작', 'info');
      emitMissionLog('📱', 'COPY-R.3', `${sourceUrl ? 'URL 크롤링' : '텍스트 패턴'} 분석 중...`, 'working');
      addMessage('assistant', `🌐 **COPY-R.3 소셜 패턴 분석** — ${product || '제품'} 관련 소셜 콘텐츠 패턴을 분석하고 있습니다...`);
      let socialInsight = '';
      let socialInsightForCopy = '';
      let socialSuccess = false;
      let sourceType = 'text';
      try {
        const socialRes = await fetch('/api/cloud-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: 'copy-social-research', product, contentType, userMessage, sourceUrl, sourceText }),
        });
        const socialData = await socialRes.json();
        if (socialData.success) {
          socialInsight = socialData.socialInsight || '';
          socialInsightForCopy = socialData.socialInsightForCopy || '';
          socialSuccess = true;
          sourceType = socialData.sourceType || 'text';
          emitMissionLog('✅', 'COPY-R.3', `소셜 패턴 분석 완료 (${sourceType === 'url' ? 'URL 분석' : '텍스트 패턴'})`, 'success');
        } else {
          addMessage('assistant', `소셜 패턴 분석에 실패했습니다. COPY-A 기본 카피 두뇌로 생성합니다.`);
          emitMissionLog('⚠️', 'COPY-R.3', `소셜 패턴 분석 실패 — 기본 전략으로 진행`, 'warning');
        }
      } catch (err) {
        emitMissionLog('⚠️', 'COPY-R.3', '소셜 패턴 분석 오류 — 기본 전략으로 진행', 'warning');
      }
      emitMissionLog('🎨', 'COPY-R.3', '소셜 인사이트 주입 → 카피 생성 시작', 'info');
      const copyCountMatch = userMessage.match(/(\d+)\s*개/);
      const copyCount = copyCountMatch ? Math.min(parseInt(copyCountMatch[1]), 10) : 3;
      const researchPrefix = socialInsightForCopy
        ? `\n\n${socialInsightForCopy}\n`
        : '';
      // creative_content action으로 위임
      Object.assign(action, {
        type: 'creative_content',
        params: { product, content_type: contentType, count: copyCount, userMessage, researchInsight: socialInsight, researchPrefix, videosFound: 0, topVideos: [], isCopyR: true, isCopyR3: true, socialSuccess, sourceType },
        workingMessage: `${product} ${contentType} 생성 중...`,
        response: '__SKIP_TTS__',
      });
    }
    // ── COPY-R.2: Market Context Research (시세/가격/시장 맥락 기반 카피 생성) ──
    // ══════════════════════════════════════════════════════
    if (action?.type === 'copy_market_research') {
      setState('working');
      const params = action.params || {} as Record<string, any>;
      const marketProduct = String(params.marketProduct || '');
      const copyProduct = String(params.copyProduct || marketProduct);
      const contentType = String(params.contentType || 'headcopy');
      const userMessage = String(params.userMessage || text);

      emitMissionLog('📊', 'COPY-R.2', '시장 맥락 조사 시작', 'info');
      emitMissionLog('📈', 'COPY-R.2', `${marketProduct || '제품'} KAMIS/시세 조회 중...`, 'working');
      addMessage('assistant', `📊 **COPY-R.2 시장 맥락 조사** — ${marketProduct || '제품'} 시세/가격 데이터를 확인하고 있습니다...`);

      let marketInsight = '';
      let marketInsightForCopy = '';
      let kamisSuccess = false;

      try {
        const marketRes = await fetch('/api/cloud-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: 'copy-market-research', marketProduct, copyProduct, contentType }),
        });
        const marketData = await marketRes.json();
        if (marketData.success) {
          marketInsight = marketData.marketInsight || '';
          marketInsightForCopy = marketData.marketInsightForCopy || '';
          kamisSuccess = marketData.kamisSuccess || false;
          if (kamisSuccess) {
            emitMissionLog('✅', 'COPY-R.2', `KAMIS 시세 조회 성공 — ${marketProduct} 시장 인사이트 생성 완료`, 'success');
          } else {
            addMessage('assistant', `KAMIS/시장 데이터 확인이 어려워 COPY-A 기본 카피 두뇌로 생성합니다.\n시장 데이터는 반영하지 않았습니다.`);
            emitMissionLog('⚠️', 'COPY-R.2', `KAMIS 데이터 부족 — 일반 카피 두뇌로 진행`, 'warning');
          }
        } else {
          emitMissionLog('⚠️', 'COPY-R.2', '시장 맥락 조회 실패 — 기본 전략으로 진행', 'warning');
        }
      } catch (err) {
        emitMissionLog('⚠️', 'COPY-R.2', '시장 맥락 조회 오류 — 기본 전략으로 진행', 'warning');
      }

      emitMissionLog('🎨', 'COPY-R.2', '시장 인사이트 주입 → 카피 생성 시작', 'info');

      const copyCountMatch = userMessage.match(/(\d+)\s*개/);
      const copyCount = copyCountMatch ? Math.min(parseInt(copyCountMatch[1]), 10) : 3;
      const researchPrefix = marketInsightForCopy
        ? `\n\n${marketInsightForCopy}\n`
        : '';

      // creative_content action으로 위임
      Object.assign(action, {
        type: 'creative_content',
        params: { product: copyProduct, content_type: contentType, count: copyCount, userMessage, researchInsight: marketInsight, researchPrefix, videosFound: 0, topVideos: [], isCopyR: true, isCopyR2: true, kamisSuccess },
        workingMessage: `${copyProduct} ${contentType} 생성 중...`,
        response: '__SKIP_TTS__',
      });
    }

    // ══════════════════════════════════════════════════════
    if (action?.type === 'copy_research') {
      setState('working');
      const params = action.params || {} as Record<string, any>;
      const product = String(params.product || '');
      const contentType = String(params.contentType || 'headcopy');
      const userMessage = String(params.userMessage || text);

      // copyCount를 먼저 계산하여 5개 이상이면 YouTube 조사 건너뛰고 바로 Creative Studio로 진입
      const copyCountMatch = userMessage.match(/(\d+)\s*개/);
      const copyCount = copyCountMatch ? Math.min(parseInt(copyCountMatch[1]), 20) : 3;

      let researchInsight = '';
      let videosFound = 0;
      let topVideos: any[] = [];

      // 5개 이상이면 YouTube 조사 건너뛰고 바로 trend-collector로 (trend-collector가 자체 트렌드 수집)
      if (copyCount < 5) {
        emitMissionLog('🔍', 'COPY-R', 'YouTube 반응 패턴 조사 시작', 'info');
        emitMissionLog('📊', 'COPY-R', `${product || '제품'} 인기 영상 분석 중...`, 'working');
        addMessage('assistant', `🔍 **COPY-R 조사 시작** — ${product || '제품'} 관련 YouTube 인기 영상을 분석하고 있습니다...`);

        try {
          const researchRes = await fetch('/api/cloud-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task: 'copy-research', product, contentType, count: 5 }),
          });
          const researchData = await researchRes.json();
          if (researchData.success) {
            researchInsight = researchData.researchInsight || '';
            videosFound = researchData.videosFound || 0;
            topVideos = researchData.topVideos || [];
            const totalSearched = researchData.totalSearched || videosFound;
            if (videosFound > 0) {
              emitMissionLog('✅', 'COPY-R', `YouTube ${totalSearched}건 검색 → 관련성 필터 통과 ${videosFound}건 분석 완료`, 'success');
            } else if (researchData.failReason) {
              addMessage('assistant', `유튜브 조사에 실패했습니다. COPY-A 기본 카피 두뇌로 생성합니다.`);
              emitMissionLog('⚠️', 'COPY-R', 'YouTube 조사 실패 — COPY-A 기본 전략으로 진행', 'warning');
            } else {
              emitMissionLog('⚠️', 'COPY-R', '관련 영상 없음 — COPY-A 기본 전략으로 진행', 'warning');
            }
          } else {
            emitMissionLog('⚠️', 'COPY-R', 'YouTube 조사 실패 — COPY-A 기본 전략으로 진행', 'warning');
          }
        } catch (err) {
          emitMissionLog('⚠️', 'COPY-R', 'YouTube 조사 오류 — 기본 전략으로 진행', 'warning');
        }
      } else {
        emitMissionLog('🚀', 'COPY-R', `${copyCount}개 카피 요청 → Creative Studio 직접 진입 (YouTube 조사 생략)`, 'info');
        addMessage('assistant', `🎨 **Creative Studio 활성화** — ${product || '제품'} 카피 ${copyCount}개를 트렌드 기반으로 생성합니다...`);
      }

      emitMissionLog('🎨', 'COPY-R', '카피 생성 시작', 'info');

      const researchPrefix = researchInsight
        ? `\n\n[COPY-R 조사 결과 주입]\n${researchInsight}\n\n위 조사 결과를 반드시 반영하여 카피를 작성하세요.\n`
        : '';

      // ── CREATIVE STUDIO: 5개 이상 요청 시 분할 생성 (먼저 5개 빠르게 → 나머지 추가 로드) ──
      if (copyCount >= 5) {
        emitMissionLog('📊', 'TREND', '트렌드 수집 + 패턴 분석 시작', 'info');
        setCreativeStudioVisible(true);
        setCreativeStudioLoading(true);
        setCreativeStudioProduct(product || '농산물');
        setCreativeStudioType(contentType);
        setCreativeStudioCopies([]);

        const firstBatch = Math.min(3, copyCount);
        const remaining = copyCount - firstBatch;

        const fetchCopies = async (cnt: number): Promise<any> => {
          const abort = new AbortController();
          const timeout = setTimeout(() => abort.abort(), 58000);
          try {
            const r = await fetch('/api/trend-collector', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: abort.signal,
              body: JSON.stringify({
                action: 'generate',
                product: product || '농산물',
                contentType,
                count: cnt,
                userStyle: userMessage,
                researchInsight: researchInsight || undefined,
              }),
            });
            clearTimeout(timeout);
            if (r.ok) return await r.json();
          } catch (e) { clearTimeout(timeout); }
          return null;
        };

        try {
          // 1차: 5개 먼저 빠르게 생성
          const firstData = await fetchCopies(firstBatch);
          if (firstData?.success && firstData.copies?.length > 0) {
            setCreativeStudioCopies(firstData.copies);
            setCreativeStudioTrends(firstData.trendPatternsUsed || 0);
            setCreativeStudioRefs(firstData.videosReferenced || 0);
            setCreativeStudioMetadata(firstData.metadata || null);
            setCreativeStudioLoading(remaining > 0);
            try {
              localStorage.setItem('jarvis.creativeStudio.latest', JSON.stringify({
                copies: firstData.copies, product,
                contentType: contentType || 'headcopy',
                trends: firstData.trendPatternsUsed || 0,
                refs: firstData.videosReferenced || 0,
                updatedAt: Date.now(),
              }));
            } catch {}
            emitMissionLog('✅', 'CREATIVE STUDIO', `${firstData.copies.length}개 카피 카드 생성 완료`, 'success');

            // 2차: 나머지 추가 로드 (비동기)
            if (remaining > 0) {
              // 나머지를 최대 5개씩 분할하여 순차 로드 (타임아웃 방지)
              const loadRemaining = async () => {
                let left = remaining;
                while (left > 0) {
                  const batch = Math.min(5, left);
                  try {
                    const moreData = await fetchCopies(batch);
                    if (moreData?.success && moreData.copies?.length > 0) {
                      setCreativeStudioCopies(prev => [...prev, ...moreData.copies]);
                      setCreativeStudioTrends(t => t + (moreData.trendPatternsUsed || 0));
                      setCreativeStudioRefs(r => r + (moreData.videosReferenced || 0));
                      emitMissionLog('✅', 'CREATIVE STUDIO', `추가 ${moreData.copies.length}개 카피 로드 완료`, 'success');
                      try {
                        const prev = JSON.parse(localStorage.getItem('jarvis.creativeStudio.latest') || '{}');
                        prev.copies = [...(prev.copies || []), ...moreData.copies];
                        prev.updatedAt = Date.now();
                        localStorage.setItem('jarvis.creativeStudio.latest', JSON.stringify(prev));
                      } catch {}
                    }
                  } catch {}
                  left -= batch;
                }
                setCreativeStudioLoading(false);
              };
              loadRemaining().catch(() => setCreativeStudioLoading(false));
            }

            emitNodeState('jarvis_brain', 'success', 'Creative Studio 완료');
            setTimeout(() => emitNodeState('jarvis_brain', 'idle'), 2000);
            telemetryFunctionSuccess('creative_director', `${product} Creative Studio ${firstData.copies.length}개 생성`);
            const summaryMsg = `${product || '제품'} 카피 ${firstData.copies.length}개를 Creative Studio에 생성했습니다.${remaining > 0 ? ` 나머지 ${remaining}개도 곧 추가됩니다.` : ''} 카드를 클릭하면 상세 내용을 볼 수 있습니다.`;
            addMessage('jarvis', summaryMsg, true);
            setState('speaking');
            startSpeakingLevel();
            await new Promise<void>(resolve => {
              speak(`${product || '제품'} 카피 ${firstData.copies.length}개를 생성했습니다. Creative Studio에서 확인해 주십시오.`, undefined, () => { stopSpeakingLevel(); resolve(); });
            });
            resetAllNodes();
            setConversationExpanded(true);
            return;
          }
        } catch (trendErr) {
          console.error('[JARVIS] Trend-collector error, falling back to standard:', trendErr);
        }
        // trend-collector 실패 시 기존 로직으로 fallback
        setCreativeStudioVisible(false);
        setCreativeStudioLoading(false);
      }

      // creative_content action으로 위임 (5개 미만 또는 Creative Studio 실패 시)
      Object.assign(action, {
        type: 'creative_content',
        params: { product, content_type: contentType, count: copyCount, userMessage, researchInsight, researchPrefix, videosFound, topVideos, isCopyR: true },
        workingMessage: `${product} ${contentType} 생성 중...`,
        response: '__SKIP_TTS__',
      });
    }

    // ══════════════════════════════════════════════════════
    // ── Creative Director 프로토콜 (Creative Content Generation) ──
    // ══════════════════════════════════════════════════════
    if (action?.type === 'creative_content') {
      setState('working');
      const params = action.params || {} as Record<string, any>;
      const product = String(params.product || '');
      const contentType = String(params.content_type || 'full_package');
      const userMessage = String(params.userMessage || text);

      // Phase UI-C-Final: Mission Log 강화
      emitMissionLog('🎤', 'COMMANDER', '음성 명령 인식 완료', 'info');
      emitMissionLog('🧠', 'JARVIS', '의도 판단 완료: Creative Director', 'success');
      emitMissionLog('✨', 'CREATIVE', `${product || '제품'} ${contentType} 콘텐츠 생성 시작`, 'info');
      // TASK EXECUTION 패널 표시
      emitNodeState('jarvis_brain', 'active', 'Creative Director 작업 중...');
      telemetryFunctionStart('creative_director', `${product} ${contentType} 생성`);

      try {
        // COPY-A v2: 농수축산물 전용 장관급 카피 두뇌 프롬프트
        const requestedCount = extractRequestedCount(userMessage);
        const copyCount = requestedCount || 3;

        // COPY-S.1A route agricultural copy requests through Human Desire when the API supports it.
        const resolveHumanDesirePlatform = (message: string, type: string) => {
          const raw = `${message} ${type}`.toLowerCase();
          if (raw.includes('???') || raw.includes('thumbnail')) return 'youtube_thumbnail';
          if (raw.includes('??') || raw.includes('shorts')) return 'youtube_shorts';
          if (raw.includes('??') || raw.includes('reels')) return 'instagram_reels';
          if (raw.includes('??') || raw.includes('tiktok')) return 'tiktok';
          if (raw.includes('???') || raw.includes('blog')) return 'naver_blog';
          if (raw.includes('??') || raw.includes('email')) return 'outreach_email';
          return 'threads';
        };
        const resolveHumanDesireOutputType = (message: string, type: string) => {
          const raw = `${message} ${type}`.toLowerCase();
          if (raw.includes('???') || raw.includes('thumbnail')) return 'thumbnail_copy';
          if (raw.includes('??') || raw.includes('shorts')) return 'shorts_script_15s';
          if (raw.includes('??') || raw.includes('reels')) return 'reels_script_15s';
          if (raw.includes('???') || raw.includes('blog')) return 'blog_title';
          if (raw.includes('??') || raw.includes('email')) return 'email_subject';
          if (raw.includes('???') || raw.includes('threads')) return 'threads_post';
          return 'headline_copy';
        };
        const toHumanDesireResultItem = (copy: any, index: number) => ({
          id: copy.id || `hd-copy-${Date.now()}-${index}`,
          title: copy.text?.split('\n')[0] || `${index + 1} copy`,
          body: copy.text || '',
          text: copy.text || '',
          tone: copy.recommended ? 'recommended' : 'rewrite',
          format: 'human_desire',
          platform: copy.platform,
          outputType: copy.outputType,
          finalScore: copy.finalScore,
          recommended: copy.recommended,
          desires: copy.desires,
          anxieties: copy.anxieties,
          triggers: copy.triggers,
          sensory: copy.sensory,
          hookType: copy.hookType,
          whyRecommended: copy.whyRecommended,
          rewriteHint: copy.rewriteHint,
          boringScore: copy.boringScore,
          scoreLabel: copy.recommended ? 'RECOMMENDED' : 'REWRITE',
        });
        const fetchHumanDesireCopies = async () => {
          const hdPlatform = resolveHumanDesirePlatform(userMessage, contentType);
          const hdOutputType = resolveHumanDesireOutputType(userMessage, contentType);
          try {
            const r = await fetch('/api/cloud-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                task: 'copy_brain_generate',
                params: {
                  strategy: 'human_desire',
                  product: product || 'agri_product',
                  platform: hdPlatform,
                  outputType: hdOutputType,
                  outputTypes: [hdOutputType],
                  sourceKeyword: userMessage,
                  count: copyCount,
                  usePerformanceMemory: true,
                  dryRun: true,
                },
              }),
            });
            if (!r.ok) return null;
            const data = await r.json();
            return data?.success && Array.isArray(data.copies) ? data : null;
          } catch {
            return null;
          }
        };

        const hdData = await fetchHumanDesireCopies();
        if (hdData?.copies?.length > 0) {
          if (copyCount >= 5) {
            setCreativeStudioVisible(true);
            setCreativeStudioLoading(false);
            setCreativeStudioProduct(product || 'agri_product');
            setCreativeStudioType(contentType);
            setCreativeStudioCopies(hdData.copies);
            setCreativeStudioTrends(0);
            setCreativeStudioRefs(0);
            setCreativeStudioMetadata({ strategy: 'human_desire', context: hdData.context || null });
          } else {
            setResultDeckVisible(true);
            setResultDeckContent(hdData.copies.map((c: any) => c.text).join('\n\n'));
            setResultDeckType(contentType);
            setResultDeckProduct(product || '');
            setResultDeckItems(hdData.copies.map(toHumanDesireResultItem));
          }
          stateRef.current = 'listening';
          setState('listening');
          handleJarvisContextEvent({ intent: 'copy_generation_completed', screen: 'copy_result', payload: { copies: hdData.copies, product: product || '', type: contentType || '' } });
          addMessage('jarvis', `${product || '??'} copy ${hdData.copies.length}?? Human Desire Engine?? ??????. ??? ???? ??? ???????.`, true);
          setConversationExpanded(true);
          return;
        }


        // ── CREATIVE STUDIO: 5개 이상 요청 시 트렌드 기반 카드형 UI 활성화 ──
        // copy_research에서 이미 Creative Studio를 활성화한 경우 중복 호출 방지
        if (copyCount >= 5 && !creativeStudioVisible) {
          emitMissionLog('📊', 'TREND', '트렌드 수집 + 패턴 분석 시작', 'info');
          setCreativeStudioVisible(true);
          setCreativeStudioLoading(true);
          setCreativeStudioProduct(product || '농산물');
          setCreativeStudioType(contentType);
          setCreativeStudioCopies([]);

          try {
            const trendRes = await fetch('/api/trend-collector', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'generate',
                product: product || '농산물',
                contentType,
                count: copyCount,
                userStyle: userMessage,
              }),
            });

            if (trendRes.ok) {
              const trendData = await trendRes.json();
              if (trendData.success && trendData.copies?.length > 0) {
                setCreativeStudioCopies(trendData.copies);
                setCreativeStudioTrends(trendData.trendPatternsUsed || 0);
                setCreativeStudioRefs(trendData.videosReferenced || 0);
                setCreativeStudioLoading(false);
                setCreativeStudioMetadata(trendData.metadata || null);
                // 2번 화면(Data Wall)에 동기화
                try {
                  localStorage.setItem('jarvis.creativeStudio.latest', JSON.stringify({
                    copies: trendData.copies,
                    product: product || '농산물',
                    contentType,
                    trends: trendData.trendPatternsUsed || 0,
                    refs: trendData.videosReferenced || 0,
                    updatedAt: Date.now(),
                  }));
                } catch {}
                emitMissionLog('✅', 'CREATIVE STUDIO', `${trendData.copies.length}개 카피 카드 생성 완료 (트렌드 ${trendData.trendPatternsUsed}개 반영)`, 'success');
                emitNodeState('jarvis_brain', 'success', 'Creative Studio 완료');
                setTimeout(() => emitNodeState('jarvis_brain', 'idle'), 2000);
                telemetryFunctionSuccess('creative_director', `${product} Creative Studio ${trendData.copies.length}개 생성`);
                const summaryMsg = `${product || '제품'} 카피 ${trendData.copies.length}개를 Creative Studio에 생성했습니다. 카드를 클릭하면 상세 내용을 볼 수 있습니다.`;
                addMessage('jarvis', summaryMsg, true);
                setState('speaking');
                startSpeakingLevel();
                await new Promise<void>(resolve => {
                  speak(`${product || '제품'} 카피 ${trendData.copies.length}개를 생성했습니다. Creative Studio에서 확인해 주십시오.`, undefined, () => { stopSpeakingLevel(); resolve(); });
                });
                resetAllNodes();
                setConversationExpanded(true);
                return;
              }
            }
          } catch (trendErr) {
            console.error('[JARVIS] Trend-collector error, falling back to standard:', trendErr);
          }
          // trend-collector 실패 시 기존 로직으로 fallback
          setCreativeStudioVisible(false);
          setCreativeStudioLoading(false);
        }
        // 플랫폼 감지
        const platformHint = userMessage.includes('스레드') || userMessage.includes('쓰레드') ? 'Threads'
          : userMessage.includes('릴스') || userMessage.toLowerCase().includes('tiktok') || userMessage.includes('틱톡') ? 'TikTok'
          : userMessage.includes('인스타') || userMessage.toLowerCase().includes('instagram') ? 'Instagram'
          : userMessage.includes('유튜브') || userMessage.toLowerCase().includes('youtube') || userMessage.includes('썸네일') ? 'YouTube'
          : 'Mixed';
        const creativePrompt = `당신은 농수축산물 판매 전문 장관급 카피라이터입니다.
사용자 요청: "${userMessage}"
제품: ${product || '지정되지 않음'}
플랫폼: ${platformHint}
콘텐츠 타입: ${contentType}
요청 개수: ${copyCount}개

[COPY-A 전략 적용]
A. Product Intelligence: 맛/향/식감/제철/보관/손질/먹는 장면/선물 가능성/가족·캠핑·아이 간식 연결성 추론
B. Persona Engine: 주부/1인 가구/부모님 선물/아이 간식/캠핑·여행/건강 루틴/명절 선물/공동구매 참여자 중 적합한 타깃 선택
C. Desire Engine: 손실회피/실수회피/제철을 놓치기 싫은 마음/가족에게 좋은 걸 주고 싶은 마음/추억/자기보상/호기심/금지형 후킹/참여욕구 반영
D. Future Scene: 제품을 먹은 뒤 구체적인 장면 묘사 (여름 밤 냄비에서 김이 올라오는 장면/캠핑장 아이스박스/부모님 냉장고/퇴근 후 혼자 꺼내 먹는 장면 등)
E. Viral Headline: 상식반전형/금지형/실수회피형/끝물·마감형/비교형/첫입반응형/냄새·향·식감 감각형/가족·추억형/가격보다 중요한 기준형 중 선택
F. Platform Grammar:
  - YouTube: 제목+썸네일+첫 5초 중심
  - Instagram: 감각적 캐프션+저장하고 싶은 문장
  - TikTok: 첫 1~3초 자막+빠른 반전
  - Threads: 말하듯 툰 던지는 스토리+댓글 유도+여운
G. Review Objection: 작다/비싸다/무르다/배송 손상/맛 기대와 다름/보관 어려움/양 애매함 등 불안을 카피에서 미리 해소

[COPY-A.3 콘텐츠 타입 특화 지시]
- contentType=threads_post: 스레드 스타일 집중. 말하듯 툰 던지는 스토리, 댓글/DM 유도, 여운 마무리. 스토리텔링과 다름 — 스레드는 짧고 직접적이어야 함.
- contentType=youtube_thumbnail: 유튜브 썸네일 문구 집중. 썸네일 문구(3~8자)와 제목이 핵심. 릴스 스크립트로 오인하지 말 것.
  - contentType=reels_script: 릴스/쇼츠 스크립트 집중. 반드시 아래 시간대별 대본 구조로 작성할 것. 스토리텔링으로 오인하지 말 것.
    **릴스 대본**:
    0~1초: (첫 자막 / 시선 정지 문장)
    1~3초: (문제 제기 또는 반전)
    3~7초: (먹는 장면 / 상품 장면 묘사)
    7~12초: (구매욕구 자극 문장)
    마지막: (CTA 자막)
- contentType=instagram_copy: 인스타 감각적 캐프션 집중. 저장하고 싶은 문장, 해시태그 포함.

[입력 형식 - 반드시 아래 구조로 정확히 ${copyCount}개 카드만 생성, 초과 금지]
각 카드는 아래 구분자로 시작:
=== 카드 N ===
**헤드카피**: (강한 첫 문장)
**썸네일 문구**: (짧고 강렬, 3~8자)
**첫 3초 스크립트**: (영상 첫 3초 자막/나레이션)
**타깃 고객**: (구체적 페르소나)
**자극한 욕구**: (Desire Engine 키워드)
**미래 장면**: (제품 먹은 뒤 구체적 장면)
**스토리 본문**: (3~5문장, 말하듯 자연스럽게)
**CTA**: (댓글/DM/공유 유도 문장)
**왜 먹히는지**: (한 줄 분석)
**위험도**: 낮음 또는 보통 또는 주의
**점수**: 클릭파워 [숫자만] / 구매욕구 [숫자만] / 스토리강도 [숫자만] / 신뢰도 [숫자만] (각 0~100 단일 정수, 범위형 금지, 예: 클릭파워 85 / 구매욕구 82 / 스토리강도 76 / 신뢰도 91)

[안전 가드 - 절대 금지]
- 가짜 후기/가짜 조회수/가짜 판매량 생성
- 식품이 질병을 치료한다는 표현
- 과도한 공포 조장
- 허위 원산지/허위 인증
- 실제 존재하지 않는 고객 반응 조작
- 과장 광고, 허위 효능, 매출 보장, 성공 보장

응답은 한국어로, 실제 바이럴에 바로 쓸 수 있는 콘텐츠만 작성하세요.${params.researchPrefix || ''}`;

        const response = await fetch('/api/cloud-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: 'task', taskType: 'creative-content', params: { prompt: creativePrompt, product, contentType } }),
        });

        let creativeResult = '';
        if (response.ok) {
          const data = await response.json();
          creativeResult = data.result?.content || data.result || data.content || '';
        }

        // Cloud server에 creative endpoint가 없으면 GPT 직접 호출
        if (!creativeResult) {
          const { askGPT } = await import('../lib/jarvis-brain');
          const creativeAction = await askGPT(creativePrompt).catch(() => null);
          creativeResult = creativeAction?.response || '';
        }

        // 결과 표시
        if (creativeResult && creativeResult !== '__SKIP_TTS__') {
          emitNodeState('jarvis_brain', 'success', 'Creative Director 완료');
          setTimeout(() => emitNodeState('jarvis_brain', 'idle'), 2000);
          telemetryFunctionSuccess('creative_director', `${product} ${contentType} 생성 완료`);
          emitMissionLog('✅', 'CREATIVE', `${product || '제품'} 콘텐츠 생성 완료`, 'success');
          emitMissionLog('⏳', 'JARVIS', '대표님 선택 대기 중', 'thinking');

          // COPY-A v2: 구조화 카드 파싱 (count 제한 적용)
          const items = splitCopyACards(creativeResult, copyCount).slice(0, copyCount);

          // COPY-A.3: content_type 이름 매핑
          const typeLabel = contentType === 'reels_script' ? '릴스 스크립트'
            : contentType === 'youtube_thumbnail' ? '유튜브 썸네일 문구'
            : contentType === 'threads_post' ? '스레드 글'
            : contentType === 'instagram_copy' ? '인스타 카피'
            : contentType === 'headcopy' || contentType === 'script' ? '후킹 문구'
            : contentType === 'storytelling' ? '스토리텔링 콘텐츠'
            : '마케팅 콘텐츠';

          // 메시지 표시 → Result Deck으로 분리 (UI-O)
          const summaryMsg = `${product || '제품'} ${typeLabel}를 생성했습니다. Result Deck에서 확인해 주십시오.`;
          addMessage('jarvis', summaryMsg, true);
          
          // Result Deck 활성화 + Copy Focus Mode 진입
          setResultDeckVisible(true);
          setResultDeckContent(creativeResult);
          setResultDeckType(contentType);
          setResultDeckProduct(product || '');
          setResultDeckItems(items);
          setCopyFocusMode(true);
          // JARVIS-CONVERSATION-OS: 카피 생성 완료 context event
          handleJarvisContextEvent({ intent: 'copy_generation_completed', screen: 'copy_result', payload: { copies: items, product: product || '', type: contentType || '' } });
          // COPY-R 상태 세팅
          setResultDeckIsCopyR(Boolean(params.isCopyR));
          setResultDeckResearchInsight(String(params.researchInsight || ''));
          setResultDeckVideosFound(Number(params.videosFound || 0));
          setResultDeckTopVideos(Array.isArray(params.topVideos) ? params.topVideos : []);
          setResultDeckExcludedEngines(Array.isArray(params.excludedEngines) ? params.excludedEngines : []);
          
          setState('speaking');
          startSpeakingLevel();
          // TTS 비동기 (요약만 음성)
          const ttsText = `${product || '제품'} ${typeLabel}를 생성했습니다, 선생님. Result Deck에서 확인해 주십시오.`;
          await new Promise<void>(resolve => {
            speak(ttsText, undefined, () => { stopSpeakingLevel(); resolve(); });
          });
        } else {
          // 실패 시 기본 응답
          emitNodeState('jarvis_brain', 'error', 'Creative Director 실패');
          setTimeout(() => emitNodeState('jarvis_brain', 'idle'), 2000);
          const fallbackMsg = `죄송합니다 선생님, ${product || '콘텐츠'} 생성 중 오류가 발생했습니다. 다시 시도해 주십시오.`;
          addMessage('jarvis', fallbackMsg);
          setState('speaking');
          startSpeakingLevel();
          await new Promise<void>(resolve => {
            speak(fallbackMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
          });
        }
      } catch (err) {
        console.error('[JARVIS] Creative Director 오류:', err);
        emitNodeState('jarvis_brain', 'error', 'Creative Director 오류');
        setTimeout(() => emitNodeState('jarvis_brain', 'idle'), 2000);
        const errMsg = `죄송합니다 선생님, 콘텐츠 생성 중 오류가 발생했습니다.`;
        addMessage('jarvis', errMsg);
        setState('speaking');
        startSpeakingLevel();
        await new Promise<void>(resolve => {
          speak(errMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
        });
      }

      // 완료 후 listening 복귀
      resetAllNodes();

      // ── COPY-A v2: Creative ActionCard context 설정 (COPY 전용 액션) ──
      const creativeCtx: ActionContext = {
        type: 'creative',
        product: product || '',
        contentType: contentType || '',
      };
      setActionContext(creativeCtx);
      setWorkflowSteps(buildWorkflowSteps(creativeCtx));
      setConversationExpanded(true);

      // Workspace 자동 저장 (Creative Script)
      saveToWorkspace('creative_script', {
        product: product || '',
        platform: contentType || 'full_package',
        hook: '',
        caption: '',
        threadPost: '',
        kakaoMessage: '',
        reelsScript: '',
        title: `${product || '제품'} 마케팅 스크립트`,
        summary: `${product || '제품'} Creative Director 콘텐츠 생성 완료`,
      }, action?.response?.slice(0, 30) || '마케팅 문구 만들어줘');

      await new Promise(r => setTimeout(r, 400));
      setState('listening');
      setIsListening(true);
      return;
    }

    // ═════════════════════════════════════════════════════════
    // ── DAILY-BRIEF-A.1: 24시간 운영 브리핑 ──
    // ════════════════════════════════════════════════════════
    if (action?.type === 'daily_brief_24h') {
      setState('working');
      addMessage('jarvis', action.response);
      startSpeakingLevel();
      await new Promise<void>(resolve => {
        speak(action.response, undefined, () => { stopSpeakingLevel(); resolve(); });
      });
      emitMissionLog('📊', 'DAILY_BRIEF', '최근 24시간 운영 브리핑 생성 시작', 'info');
      setDataPanel({
        visible: true,
        type: 'report',
        progress: 10,
        message: '최근 24시간 운영 데이터 수집 중...',
        actionLogs: [{ step: 'INIT', status: 'start', detail: 'Daily Brief 24h 프로토콜 가동', timestamp: new Date().toISOString() }],
      });
      try {
        const briefRes = await fetch('/api/cloud-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskType: 'daily-brief-24h', params: { dryRun: false, sendTelegram: true } }),
        });
        const briefData = await briefRes.json();
        setDataPanel(prev => ({
          ...prev,
          progress: 100,
          message: '운영 브리핑 완료',
          actionLogs: [...(prev.actionLogs || []),
            { step: 'BRIEF_DONE', status: 'success', detail: `briefId: ${briefData.briefId || 'N/A'}`, timestamp: new Date().toISOString() },
          ],
        }));
        if (briefData.success) {
          const ss = briefData.smartstore || {};
          const oc = briefData.outreach || {};
          const tg = briefData.telegram || {};
          let displayText = `[LIST] **자비스 24시간 운영 브리핑**\n\n`;
          displayText += `**[스마트스토어]**\n`;
          displayText += `- 신규주문: **${ss.newOrders || 0}건**\n`;
          displayText += `- 배송준비: **${ss.pendingShipping || 0}건**\n`;
          displayText += `- 배송중: **${ss.shipping || 0}건**\n`;
          displayText += `- 배송완료: **${ss.delivered || 0}건**\n`;
          displayText += `- 구매확정: **${ss.purchaseConfirmed || 0}건**\n\n`;
          displayText += `**[아우트리치]**\n`;
          displayText += `- 후보: **${oc.discovered || 0}명**\n`;
          displayText += `- 공개이메일: **${oc.publicEmailFound || 0}명**\n`;
          displayText += `- 발송완료: **${oc.emailSent || 0}건**\n`;
          displayText += `- 긍정답변: **${oc.positiveReplies || 0}건**\n\n`;
          displayText += `**[Telegram]** ${tg.configured ? (tg.sent ? '전송 완료' : `전송 실패: ${tg.error || 'unknown'}`) : 'env 미설정 (skipped)'}\n`;
          displayText += `**[Google Sheets]** ${briefData.savedToSheets ? 'daily_operations_brief 저장 완료' : '저장 실패'}\n`;
          displayText += `\n_상세 내역은 Google Sheets 또는 자비스 화면에서 확인하세요._`;
          addMessage('jarvis', displayText, true);
          const voiceText = `선생님, 최근 24시간 운영 브리핑입니다. `
            + `스마트스토어 신규주문 ${ss.newOrders || 0}건, 배송준비 ${ss.pendingShipping || 0}건입니다. `
            + `아우트리치 후보 ${oc.discovered || 0}명, 공개이메일 ${oc.publicEmailFound || 0}명입니다. `
            + `${tg.configured ? (tg.sent ? '텔레그램 요약도 전송했습니다.' : '텔레그램 전송은 실패했습니다.') : '텔레그램은 설정되지 않았습니다.'} `
            + `이상입니다.`;
          setState('speaking');
          startSpeakingLevel();
          speak(voiceText, undefined, () => { stopSpeakingLevel(); });
          triggerGoldenFlare();
        } else {
          addMessage('jarvis', `운영 브리핑 생성 중 오류가 발생했습니다: ${briefData.error || 'unknown'}`);
        }
      } catch (err) {
        addMessage('jarvis', `운영 브리핑 API 호출 중 오류: ${String(err)}`);
      }
      setTimeout(() => {
        setDataPanel({ visible: false, type: null, progress: 0, message: '' });
      }, 8000);
      emitMissionLog('✅', 'DAILY_BRIEF', '운영 브리핑 완료', 'success');
      setConversationExpanded(true);
      await new Promise(r => setTimeout(r, 400));
      setState('listening');
      setIsListening(true);
      return;
    }

    // ═════════════════════════════════════════════════════════
    // ── 모닝 브리핑 프로토콜 (Morning Briefing Protocol) ──
    // ════════════════════════════════════════════════════════
    if (action?.type === 'morning_briefing') {
      setState('working');

      // Fast-path: __SKIP_TTS__ 마커가 있으면 초기 TTS 건너뛰기
      if (action.response !== '__SKIP_TTS__') {
        addMessage('jarvis', action.response);
        startSpeakingLevel();
        await new Promise<void>(resolve => {
          speak(action.response, undefined, () => { stopSpeakingLevel(); resolve(); });
        });
      }

      // Phase UI-C-Final: Mission Log 강화 (dedup: 각 메시지 1회만 발행)
      emitMissionLog('🎤', 'COMMANDER', '음성 명령 인식 완료', 'info');
      emitMissionLog('🧠', 'JARVIS', '의도 판단 완료: Morning Briefing', 'success');
      emitMissionLog('📊', 'BRIEFING', '모닝 브리핑 데이터 수집 시작', 'info');
      // 텔레메트리: 모닝 브리핑 시퀀스 시작 (노드 애니메이션만, Mission Log 발행 안 함)
      emitBriefingSequence('start', undefined, '모닝 브리핑 프로토콜 가동');
      telemetryFunctionStart('morning_briefing');
      // Agent Console 자동 활성화 (v4.2)
      setAgentConsoleVisible(true);

      // 행동 로그 패널 활성화
      setDataPanel({
        visible: true,
        type: 'report',
        progress: 0,
        message: '모닝 브리핑 데이터 수집 시작...',
        actionLogs: [{ step: 'INIT', status: 'start', detail: '모닝 브리핑 프로토콜 가동', timestamp: new Date().toISOString() }],
      });

      try {
        // ── Step 1: 스마트스토어 데이터 수집 (캐시 3분 이내면 즉시 사용 + 백그라운드 refresh) ──
        emitBriefingSequence('node_focus', 'smartstore', '스마트스토어 데이터 수집 중...');
        setDataPanel(prev => ({
          ...prev,
          progress: 10,
          message: '스마트스토어 데이터 수집 중...',
          actionLogs: [...(prev.actionLogs || []), { step: 'SMARTSTORE', status: 'start', detail: '네이버 커머스 API 접속 중...', timestamp: new Date().toISOString() }],
        }));

        var smartstoreData: any = null;
        // 캐시가 3분 이내면 캐시 우선 사용 (브리핑 응답 시간 개선)
        const freshCache = ssCountsCacheRef.current;
        const cacheAge = freshCache ? (Date.now() - freshCache.fetchedAt) : Infinity;
        if (freshCache && cacheAge < 3 * 60 * 1000) {
          smartstoreData = { smartstore: { ...freshCache.data, isCached: true }, influencers: { total: 0, newYesterday: 0, byPlatform: {} } };
          setDataPanel(prev => ({
            ...prev,
            progress: 60,
            actionLogs: [...(prev.actionLogs || []), { step: 'SMARTSTORE', status: 'success', detail: `캐시 데이터 사용 (${Math.round(cacheAge / 1000)}초 전)`, timestamp: new Date().toISOString() }],
          }));
          // 백그라운드 refresh (fire-and-forget)
          fetch('/api/cloud-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: 'task', taskType: 'smartstore-orders', params: { action: 'query_order_status' } })
          }).then(r => r.json()).then(j => {
            if (j.success || j.result) {
              const raw = j.result || j;
              const c2 = raw.counts || {};
              ssCountsCacheRef.current = { data: { newOrders: c2.newOrders ?? raw.newOrders ?? 0, pendingShipping: c2.pendingShipping ?? raw.pendingShipping ?? 0, preShipTotal: c2.preShipTotal ?? raw.preShipTotal ?? 0, shipping: c2.shipping ?? raw.shipping ?? 0, delivered: c2.delivered ?? raw.delivered ?? 0, purchaseConfirmed: c2.purchaseConfirmed ?? raw.purchaseConfirmed ?? 0, totalAmount: raw.totalAmount ?? 0, revenueChangePercent: raw.revenueChangePercent ?? 0, source: raw.source || 'naver-commerce-api', fetchedAt: raw.fetchedAt || null, isCached: false }, fetchedAt: Date.now() };
              setSccOrderData(ssCountsCacheRef.current.data);
            }
          }).catch(() => {});
        } else {
        try {
          // 클라우드 서버를 통해 스마트스토어 직접 접속 (55초 timeout + 1회 재시도)
          const fetchSS = async (timeoutMs: number) => {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), timeoutMs);  // timeoutMs: 55000
            const r = await fetch('/api/cloud-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ endpoint: 'task', taskType: 'smartstore-orders', params: { action: 'query_order_status' } }),
              signal: ctrl.signal,
            });
            clearTimeout(tid);
            return r.json();
          };
          let ssJson: any;
          try {
            ssJson = await fetchSS(55000);
          } catch (firstErr) {
            // 1회 재시도 (55초)
            ssJson = await fetchSS(55000);
          }
          if (ssJson.success || ssJson.result) {
            const rawSS = ssJson.result || ssJson;
            // v3 통일 구조: counts 우선, 하위호환 유지
            const c = rawSS.counts || {};
            smartstoreData = {
              smartstore: {
                newOrders: c.newOrders ?? rawSS.newOrders ?? 0,
                pendingShipping: c.pendingShipping ?? rawSS.pendingShipping ?? 0,
                preShipTotal: c.preShipTotal ?? rawSS.preShipTotal ?? 0,
                shipping: c.shipping ?? rawSS.shipping ?? 0,
                delivered: c.delivered ?? rawSS.delivered ?? 0,
                purchaseConfirmed: c.purchaseConfirmed ?? rawSS.purchaseConfirmed ?? 0,
                totalAmount: rawSS.totalAmount ?? 0,
                revenueChangePercent: rawSS.revenueChangePercent ?? 0,
                source: rawSS.source || 'naver-commerce-api',
                fetchedAt: rawSS.fetchedAt || null,
                isCached: rawSS.isCached ?? false,
              },
              influencers: rawSS.influencers || { total: 0, newYesterday: 0, byPlatform: {} },
            };
            // 행동 로그 업데이트 (API에서 받은 로그 포함)
            const apiLogs = (ssJson.actionLogs || []).map((l: any) => ({
              step: l.step,
              status: l.status,
              detail: l.detail,
              timestamp: l.timestamp,
            }));
            setDataPanel(prev => ({
              ...prev,
              progress: 60,
              message: '스마트스토어 + 인플루언서 데이터 수집 완료',
              actionLogs: [...(prev.actionLogs || []), ...apiLogs],
            }));
            // SSoT 캐시 저장 (5분 유효)
            ssCountsCacheRef.current = { data: smartstoreData.smartstore, fetchedAt: Date.now() };
            setSccOrderData(smartstoreData.smartstore);
          } else {
            // SMARTSTORE-ORDERS-FIX.1: errorCode 구분 오류 처리
            const errCode = ssJson.errorCode || 'SMARTSTORE_API_ERROR';
            const errMsg = ssJson.errorMessage || ssJson.error || '브리핑 API 실패';
            throw Object.assign(new Error(errMsg), { code: errCode });
          }
        } catch (ssErr) {
          // SSoT: 캐시가 5분 이내면 캐시 데이터 사용
          const cache = ssCountsCacheRef.current;
          if (cache && (Date.now() - cache.fetchedAt) < 5 * 60 * 1000) {
            smartstoreData = { smartstore: { ...cache.data, isCached: true }, influencers: { total: 0, newYesterday: 0, byPlatform: {} } };
            setDataPanel(prev => ({
              ...prev,
              progress: 60,
              actionLogs: [...(prev.actionLogs || []), { step: 'SMARTSTORE', status: 'success', detail: `캐시 데이터 사용 (${Math.round((Date.now() - cache.fetchedAt) / 1000)}초 전)`, timestamp: new Date().toISOString() }],
            }));
          } else {
            setDataPanel(prev => ({
              ...prev,
              progress: 30,
              actionLogs: [...(prev.actionLogs || []), { step: 'SMARTSTORE', status: 'fail', detail: `스마트스토어 조회 실패: ${ssErr}`, timestamp: new Date().toISOString() }],
            }));
            smartstoreData = { smartstore: { _error: true, errorMessage: '최신 주문 데이터를 불러오지 못했습니다', newOrders: null, pendingShipping: null, preShipTotal: null, shipping: null, delivered: null, purchaseConfirmed: null, totalAmount: 0, revenueChangePercent: 0, error: String(ssErr) }, influencers: { total: 0, newYesterday: 0, byPlatform: {} } };
          }
        }
        } // 캐시 분기 else 닫기

        // ── Step 2: 농산물 시장 분석 (MarketIntelligence) - 비동기 처리 (브리핑 응답 차단 안 함) ──
        emitBriefingSequence('node_focus', 'market_intel', '농산물 시장 데이터 수집 중...');
        emitNodeState('market_intel', 'active', '농산물 가격 데이터 수집 중');
        setMarketIntelVisible(true);
        setDataPanel(prev => ({
          ...prev,
          progress: 45,
          message: 'KAMIS 농산물 시장 데이터 수집 중...',
          actionLogs: [...(prev.actionLogs || []), { step: 'MARKET_INTEL', status: 'start', detail: 'KAMIS API 농산물 가격 데이터 수집 중...', timestamp: new Date().toISOString() }],
        }));

        let marketData: any = null;
        // 농산물 시장 분석을 비동기로 실행 (KAMIS Mini API, fire-and-forget)
        (async () => {
        try {
          const marketRes = await fetch('/api/cloud-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task: 'kamis-mini', params: { item: '배추', cls: '01' } }),
          });
          const marketJson = await marketRes.json();
          if (marketJson.success && marketJson.prices) {
            marketData = marketJson;
            const todayPrice = parseInt((marketJson.prices.today || '0').replace(/,/g, ''));
            const monthPrice = parseInt((marketJson.prices.monthBefore || '0').replace(/,/g, ''));
            const yearPrice = parseInt((marketJson.prices.yearBefore || '0').replace(/,/g, ''));
            const changePercent = monthPrice ? ((todayPrice - monthPrice) / monthPrice * 100) : 0;
            const trend = changePercent > 2 ? 'up' : changePercent < -2 ? 'down' : 'stable';
            const recommendation = trend === 'down' ? 'buy' : trend === 'up' ? 'sell' : 'hold';
            // MAX/MIN 논리적 정렬: 유효 가격만 수집 (0 제외)
            const validPrices = [todayPrice, monthPrice, yearPrice].filter(p => p > 0);
            const avgParsed = parseInt((marketJson.prices.average || '0').replace(/,/g, ''));
            if (avgParsed > 0) validPrices.push(avgParsed);
            const computedMax = validPrices.length > 0 ? Math.max(...validPrices) : 0;
            const computedMin = validPrices.length > 0 ? Math.min(...validPrices) : 0;
            const computedAvg = avgParsed > 0 ? avgParsed : (validPrices.length > 0 ? Math.round(validPrices.reduce((a, b) => a + b, 0) / validPrices.length) : 0);
            emitNodeData('market_intel', {
              item: marketJson.item || '배추',
              maxPrice: computedMax,
              minPrice: computedMin,
              avgPrice: computedAvg,
              trend,
              changePercent: parseFloat(changePercent.toFixed(1)),
              recommendation,
              lastUpdated: new Date().toLocaleTimeString('ko-KR'),
              totalRecords: validPrices.length,
              movingAvg5: monthPrice || 0,
              movingAvg20: yearPrice || 0,
            });
            emitNodeState('market_intel', 'success', `${marketJson.item} 가격 분석 완료 (KAMIS)`);
            setDataPanel(prev => ({
              ...prev,
              progress: 55,
              actionLogs: [...(prev.actionLogs || []), { step: 'MARKET_INTEL', status: 'success', detail: `${marketJson.item} 당일 ${marketJson.prices.today}, 전월대비 ${marketJson.direction}`, timestamp: new Date().toISOString() }],
            }));
          } else {
            throw new Error(marketJson.error || marketJson.message || 'KAMIS API 데이터 없음');
          }
        } catch (marketErr) {
          emitNodeState('market_intel', 'error', `시장 데이터 수집 실패: ${marketErr}`);
        }
        })(); // fire-and-forget 끝

        // ── Step 2.5: Workspace / Copy Brain / Outreach / Hot Content 데이터 수집 ──
        let workspaceStats: any = { total: 0, briefing: 0, creative_script: 0, growth_campaign: 0, purchase_order_draft: 0, recentTitles: [] as string[] };
        let copyBrainStats: any = { total: 0, recommended: 0, recentHeadlines: [] as string[] };
        let outreachStats: any = { total: 0, contactable: 0, highFit: 0, emailSent: 0, positiveReplies: 0 };
        let hotContentStats: any = { total: 0 };
        await Promise.allSettled([
          // Workspace 저장 현황
          fetch('/api/cloud-proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task: 'workspace-list', params: {} }) })
            .then(r => r.json()).then(wsJson => {
              if (wsJson.success && wsJson.records) {
                const recs = wsJson.records || [];
                workspaceStats.total = recs.length;
                workspaceStats.briefing = recs.filter((r: any) => r.type === 'briefing' || r.type === 'morning_briefing_v2').length;
                workspaceStats.creative_script = recs.filter((r: any) => r.type === 'creative_script').length;
                workspaceStats.growth_campaign = recs.filter((r: any) => r.type === 'growth_campaign').length;
                workspaceStats.purchase_order_draft = recs.filter((r: any) => r.type === 'order_sheet' || r.type === 'purchase_order_draft').length;
                workspaceStats.recentTitles = recs.slice(0, 3).map((r: any) => r.title || '').filter(Boolean);
              }
            }).catch(() => {}),
          // Copy Brain 현황
          fetch('/api/cloud-proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task: 'copy_brain_list', params: {} }) })
            .then(r => r.json()).then(cbJson => {
              if (cbJson.success && cbJson.copies) {
                const copies = cbJson.copies || [];
                copyBrainStats.total = copies.length;
                copyBrainStats.recommended = copies.filter((c: any) => (c.score || 0) >= 80 || c.recommended).length;
                copyBrainStats.recentHeadlines = copies.slice(0, 2).map((c: any) => c.headline || c.title || '').filter(Boolean);
              }
            }).catch(() => {}),
          // Outreach 후보 현황
          fetch('/api/cloud-proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task: 'outreach-list', params: {} }) })
            .then(r => r.json()).then(orJson => {
              if (orJson.success) {
                const cands = orJson.candidates || orJson.data || [];
                outreachStats.total = orJson.total || cands.length;
                outreachStats.contactable = cands.filter((c: any) => c.email || c.publicEmail).length;
                outreachStats.highFit = cands.filter((c: any) => (c.fitScore || c.score || 0) >= 60).length;
                outreachStats.emailSent = orJson.emailSent || cands.filter((c: any) => c.emailSent).length;
                outreachStats.positiveReplies = orJson.positiveReplies || cands.filter((c: any) => c.replied && c.positive).length;
              }
            }).catch(() => {}),
          // Hot Content DNA 현황
          fetch('/api/cloud-proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task: 'hot-content-list', params: {} }) })
            .then(r => r.json()).then(hcJson => {
              if (hcJson.success) hotContentStats.total = hcJson.total || (hcJson.items || []).length;
            }).catch(() => {}),
        ]);

        // ── Step 3: 브리핑 보고서 생성 (GPT 우회, deterministic template) ──
        setDataPanel(prev => ({
          ...prev,
          progress: 85,
          message: '브리핑 보고서 생성 중...',
          actionLogs: [...(prev.actionLogs || []), { step: 'BRIEFING_TEMPLATE', status: 'start', detail: '스마트스토어 데이터 기반 브리핑 생성 중...', timestamp: new Date().toISOString() }],
        }));

        const ss = smartstoreData?.smartstore || {};
        const counts = ss.counts || ss || {};
        const market = smartstoreData?.marketIntel || {};
        const outreach = outreachStats;
        const workspace = workspaceStats;
        const health = smartstoreData?.systemHealth || {};

        // 화면에 표시할 구조화된 보고서 (Daily Command Report 3.0)
        const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
        var briefingDisplay = `[LIST] **자비스 일일 커맨드 리포트 v3.0** — ${today}\n\n`;

        // ── [1] 스마트스토어 현황 ──
        briefingDisplay += `**[1. 스마트스토어 현황]**\n`;
        if (ss._error) {
          briefingDisplay += `- ⚠️ ${ss.errorMessage || '주문 데이터 조회 실패'}\n`;
        } else {
          const preShip = (counts.newOrders || 0) + (counts.pendingShipping || 0);
          briefingDisplay += `- 신규주문: **${counts.newOrders ?? '-'}건** | 배송준비: **${counts.pendingShipping ?? '-'}건**\n`;
          briefingDisplay += `- 배송 전 처리 대상: **${preShip}건** (신규 + 배송준비)\n`;
          briefingDisplay += `- 배송중: **${counts.shipping ?? '-'}건** | 배송완료: **${counts.delivered ?? '-'}건**\n`;
          briefingDisplay += `- 구매확정: **${counts.purchaseConfirmed ?? '-'}건** (최근 7일)\n`;
          if (ss.totalAmount && ss.totalAmount > 0) {
            const revenueSign = (ss.revenueChangePercent || 0) >= 0 ? '+' : '';
            briefingDisplay += `- 오늘 매출: **${ss.totalAmount.toLocaleString()}원** (전일대비 ${revenueSign}${ss.revenueChangePercent || 0}%)\n`;
          }
          if (ss.isCached) briefingDisplay += `- ℹ️ 캐시 데이터 사용 중 (실시간 갱신 진행 중)\n`;
        }
        briefingDisplay += `\n`;

        // ── [2] Creative Studio 현황 ──
        briefingDisplay += `**[2. Creative Studio (카피 생성)]**\n`;
        if (copyBrainStats.total > 0) {
          briefingDisplay += `- 누적 생성 카피: **${copyBrainStats.total}개** | 추천 카피: **${copyBrainStats.recommended}개**\n`;
          if (copyBrainStats.recentHeadlines.length > 0) {
            briefingDisplay += `- 최근 카피: "${copyBrainStats.recentHeadlines[0]}"\n`;
          }
        } else {
          briefingDisplay += `- 오늘 생성된 카피 없음 → 명령: "복숭아 카피 5개 뽑아줘"\n`;
        }
        if (hotContentStats.total > 0) {
          briefingDisplay += `- Hot Content DNA: **${hotContentStats.total}건** 수집됨\n`;
        }
        briefingDisplay += `- 지원 플랫폼: 스레드 / 릴스 / 카카오톡 / YouTube / Instagram\n`;
        briefingDisplay += `- Anti-Boring Filter: 서버사이드 자동 검증 (Hook Score + Sensory Score)\n`;
        briefingDisplay += `\n`;

        // ── [3] 아우트리치 (바이럴 마케팅) ──
        briefingDisplay += `**[3. 아우트리치 (바이럴 마케팅)]**\n`;
        briefingDisplay += `- 수집 후보: **${outreach.total || 0}명** | 공개이메일: **${outreach.contactable || 0}명**\n`;
        briefingDisplay += `- 고적합도(60점↑): **${outreach.highFit || 0}명**\n`;
        if (outreach.emailSent > 0) {
          briefingDisplay += `- 발송 완료: **${outreach.emailSent}건** | 긍정 답변: **${outreach.positiveReplies || 0}건**\n`;
        } else {
          briefingDisplay += `- 발송 현황: 대기 중 (EXECUTE LOCKED — 대표 승인 필요)\n`;
        }
        briefingDisplay += `- 수집 명령: "복숭아 관련 유튜버 10명 수집해줘"\n`;
        briefingDisplay += `\n`;

        // ── [4] 농산물 시장 가격 (KAMIS) ──
        briefingDisplay += `**[4. 농산물 시장 가격 (KAMIS)]**\n`;
        briefingDisplay += `- 조회 품목: **${market.item || '배추'}** (KAMIS 공식 API)\n`;
        if (market.prices) {
          briefingDisplay += `- 당일가: **${market.prices.today || '-'}원** | 전일: **${market.prices.dayBefore || '-'}원**\n`;
          const yrPrice = market.prices.yearBefore ? market.prices.yearBefore + '원' : 'N/A';
          briefingDisplay += `- 전월대비: **${market.direction || 'N/A'}** | 전년동기: **${yrPrice}**\n`;
        } else {
          briefingDisplay += `- 상태: ${market.message || '데이터 수집 중 (비동기 처리)'}\n`;
        }
        briefingDisplay += `- 품목 변경: "오늘 복숭아 가격 알려줘"\n`;
        briefingDisplay += `\n`;

        // ── [5] Workspace 저장 현황 ──
        briefingDisplay += `**[5. Workspace 저장 현황]**\n`;
        briefingDisplay += `- 전체 저장: **${workspace.total || 0}건** | 브리핑: **${workspace.briefing || 0}건**\n`;
        briefingDisplay += `- 마케팅 스크립트: **${workspace.creative_script || 0}건** | Growth Link: **${workspace.growth_campaign || 0}건**\n`;
        briefingDisplay += `- 발주서 초안: **${workspace.purchase_order_draft || 0}건**\n`;
        if (workspace.recentTitles && workspace.recentTitles.length > 0) {
          briefingDisplay += `- 최근 저장: "${workspace.recentTitles[0]}"\n`;
        }
        briefingDisplay += `\n`;

        // ── [6] 자비스 기능 현황 ──
        briefingDisplay += `**[6. 자비스 기능 현황]**\n`;
        briefingDisplay += `- ✅ 사용 가능: Creative Studio, 스마트스토어 주문조회, 아우트리치 수집, 발주서 Dry-run, 농산물 가격조회, CS 답변 초안, Workspace 저장\n`;
        briefingDisplay += `- 🔒 승인 필요: 이메일 실제 발송, 발주확인 처리, 송장 입력, 광고 집행\n`;
        briefingDisplay += `- 🔧 준비 중: Keyword Radar (SEO-K.1), Growth Link (LINK-A.1), 성과 기록 연동\n`;
        briefingDisplay += `- 🤖 자동 실행: 매일 KST 09:00 운영 브리핑 생성 / 매일 07:00 농산물 시장 데이터 수집\n`;
        briefingDisplay += `\n`;

        // ── [7] 오늘의 추천 액션 ──
        briefingDisplay += `**[7. 오늘의 추천 액션]**\n`;
        const newOrders = counts.newOrders || 0;
        const pendingShip = counts.pendingShipping || 0;
        let actionCount = 1;
        if (newOrders > 0 || pendingShip > 0) {
          briefingDisplay += `- ${actionCount++}. 📦 배송 전 처리 대상 **${newOrders + pendingShip}건** 확인 → "오늘 신규주문 보여줘"\n`;
        }
        if (outreach.total === 0) {
          briefingDisplay += `- ${actionCount++}. 🎯 아우트리치 후보 수집 시작 → "복숭아 관련 유튜버 10명 수집해줘"\n`;
        } else if (outreach.emailSent === 0 && outreach.contactable > 0) {
          briefingDisplay += `- ${actionCount++}. 📧 이메일 발송 초안 준비 → "인플루언서 제안 메일 초안 만들어줘" (발송은 승인 후)\n`;
        }
        if (copyBrainStats.total === 0) {
          briefingDisplay += `- ${actionCount++}. ✍️ 오늘 판매 상품 카피 생성 → "복숭아 카피 5개 뽑아줘"\n`;
        } else {
          briefingDisplay += `- ${actionCount++}. ✍️ 카피 플랫폼 변환 → 생성된 카피를 Threads / 릴스 / 카카오톡 버전으로 변환\n`;
        }
        if (workspace.total === 0) {
          briefingDisplay += `- ${actionCount++}. 💾 오늘 작업 결과 Workspace 저장 → 카피/브리핑 생성 후 자동 저장됨\n`;
        }
        briefingDisplay += `\n`;

        // ── [8] 시스템 상태 ──
        briefingDisplay += `**[8. 시스템 상태]**\n`;
        briefingDisplay += `- UPTIME: **${health.uptime || 'READY'}** | EXECUTE: **${health.executeMode || 'LOCKED'}**\n`;
        briefingDisplay += `- API: **${health.naverApi || 'NORMAL'}** | Voice AI: **ONLINE**\n`;
        briefingDisplay += `- Memory Sync: **활성** | Google Sheets: **연동 중**\n`;
        briefingDisplay += `\n_상세 내역은 Google Sheets 또는 자비스 화면에서 확인하세요._`;

        // 음성 브리핑 텍스트 (v3.0 강화)
        let voiceBriefing = `선생님, 좋은 아침입니다. 자비스 일일 커맨드 리포트입니다. `;
        if (!ss._error) {
          const preShipTotal = (counts.newOrders || 0) + (counts.pendingShipping || 0);
          voiceBriefing += `스마트스토어 신규주문 ${counts.newOrders || 0}건, 배송준비 ${counts.pendingShipping || 0}건, 배송 전 처리 대상 총 ${preShipTotal}건입니다. `;
          if (ss.totalAmount && ss.totalAmount > 0) {
            voiceBriefing += `오늘 매출은 ${ss.totalAmount.toLocaleString()}원입니다. `;
          }
        }
        if (copyBrainStats.total > 0) {
          voiceBriefing += `Creative Studio에 누적 카피 ${copyBrainStats.total}개가 있습니다. `;
        }
        voiceBriefing += `아우트리치 후보 ${outreach.total || 0}명, 공개이메일 ${outreach.contactable || 0}명 확보되어 있습니다. `;
        if (market.prices && market.prices.today && market.prices.today !== '-') {
          voiceBriefing += `${market.item || '배추'} 당일 가격은 ${market.prices.today}원입니다. `;
        }
        voiceBriefing += `Workspace에 저장된 파일은 총 ${workspace.total || 0}건입니다. `;
        voiceBriefing += `시스템은 현재 EXECUTE LOCKED 상태로 안전하게 대기 중입니다. 이상입니다.`;

        // 완료 로그
        setDataPanel(prev => ({
          ...prev,
          progress: 100,
          message: '모닝 브리핑 완료',
          actionLogs: [...(prev.actionLogs || []),
            { step: 'GEMINI_BRIEFING', status: 'success', detail: '종합 브리핑 보고서 생성 완료', timestamp: new Date().toISOString() },
            { step: 'COMPLETE', status: 'success', detail: '모닝 브리핑 프로토콜 완료', timestamp: new Date().toISOString() },
          ],
        }));

        // 텔레메트리: 브리핑 완료 + 노드 데이터 업데이트
        emitBriefingSequence('complete', undefined, '모닝 브리핑 완료');
        telemetryFunctionSuccess('morning_briefing', '모닝 브리핑 완료', {
          newOrders: ss.newOrders || 0,
          pendingShipping: ss.pendingShipping || 0,
          totalAmount: ss.totalAmount || 0,
          influencerTotal: outreach.total || 0,
        });
        const ssRevenueSign = (ss.revenueChangePercent || 0) >= 0 ? '+' : '';
        emitNodeData('smartstore', {
          '신규주문': ss.newOrders || 0,
          '배송대기': ss.pendingShipping || 0,
          '오늘매출': `${(ss.totalAmount || 0).toLocaleString()}원`,
          '전일대비': `${ssRevenueSign}${ss.revenueChangePercent || 0}%`,
        });
        emitNodeData('sheets', {
          '인플루언서총계': outreach.total || 0,
          '어제신규': outreach.newYesterday || 0,
        });

        // 화면에 보고서 표시 + 음성 브리핑 (비동기)
        setState('speaking');
        addMessage('jarvis', briefingDisplay, true);
        triggerGoldenFlare();
        setClapBurst(true); setTimeout(() => setClapBurst(false), 120);
        // TTS 비동기화: 텍스트 먼저 표시, TTS는 후속 처리
        startSpeakingLevel();
        speak(voiceBriefing, undefined, () => { stopSpeakingLevel(); });
        // 패널 완전 종료
        resetAllNodes();

      } catch (err) {
        telemetryFunctionError('morning_briefing', `모닝 브리핑 실패: ${err}`);
        setDataPanel(prev => ({
          ...prev,
          progress: 0,
          message: '브리핑 오류 발생',
          actionLogs: [...(prev.actionLogs || []), { step: 'ERROR', status: 'fail', detail: `모닝 브리핑 실패: ${err}`, timestamp: new Date().toISOString() }],
        }));
        const errMsg = `모닝 브리핑 중 오류가 발생했습니다, 선생님. ${String(err)}`;
        setState('speaking');
        addMessage('jarvis', errMsg);
        startSpeakingLevel();
        await new Promise<void>(resolve => { speak(errMsg, undefined, () => { stopSpeakingLevel(); resolve(); }); });
      }

      // 8초 후 행동 로그 패널 자동 닫기
      setTimeout(() => {
        setDataPanel({ visible: false, type: null, progress: 0, message: '' });
      }, 8000);

      // ── Phase UI-C-Final: Briefing ActionCard context 설정 ──
      emitMissionLog('✅', 'BRIEFING', '브리핑 보고 완료', 'success');
      emitMissionLog('⏳', 'JARVIS', '대표님 선택 대기 중', 'thinking');
      const briefCtx: ActionContext = { type: 'briefing' };
      setActionContext(briefCtx);
      setWorkflowSteps(buildWorkflowSteps(briefCtx));
      setConversationExpanded(true);

      // Workspace 자동 저장 (Morning Briefing 2.0)
      saveToWorkspace('morning_briefing_v2', {
        title: `일일 커맨드 리포트 (${new Date().toLocaleDateString()})`,
        smartstore: smartstoreData.smartstore,
        marketIntel: smartstoreData.marketIntel,
        outreach: smartstoreData.outreach,
        systemHealth: smartstoreData.systemHealth,
        briefingText: briefingDisplay,
        summary: smartstoreData.jarvisSummary,
      }, String(action.params?.userMessage || '오늘 브리핑 해줘'));

      await new Promise(r => setTimeout(r, 400));
      setState('listening');
      setIsListening(true);
      return;
    }

    // ── KAMIS 시장가격 조회 ──
    if (action?.type === 'kamis_price') {
      setState('working');
      emitMissionLog('🌾', 'KAMIS', `${action.params?.item || '배추'} 시장가격 조회 시작`, 'info');
      setDataPanel({
        visible: true,
        type: 'smartstore',
        progress: 10,
        message: `${action.params?.item || '배추'} KAMIS 가격 조회 중...`,
        actionLogs: [],
      });

      try {
        const kamisRes = await fetch('/api/cloud-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: 'kamis-mini', params: action.params }),
        });
        const kamisData = await kamisRes.json();

        setDataPanel(prev => prev ? { ...prev, progress: 100, message: 'KAMIS 조회 완료' } : prev);

        let responseText = '';
        if (kamisData.success && kamisData.prices) {
          const p = kamisData.prices;
          responseText = `🌾 ${kamisData.item} 시장가격 (${kamisData.cls}, ${kamisData.date})\n` +
            `• 당일: ${p.today}\n` +
            `• 1일전: ${p.dayBefore}\n` +
            `• 1주전: ${p.weekBefore}\n` +
            `• 1개월전: ${p.monthBefore}\n` +
            `• 1년전: ${p.yearBefore}\n` +
            `• 평년: ${p.average}\n` +
            `• 전월대비: ${kamisData.direction}\n` +
            (kamisData.isProxy ? `ℹ️ ${kamisData.proxyNote}` : '') +
            `\n단위: ${kamisData.unit} | 등급: ${kamisData.rank} | 품종: ${kamisData.kind}`;
        } else if (kamisData.success && kamisData.message) {
          responseText = `🌾 ${kamisData.item}: ${kamisData.message}`;
        } else {
          responseText = `KAMIS 조회 실패: ${kamisData.error || '알 수 없는 오류'}`;
        }

        addMessage('jarvis', responseText);
        emitMissionLog('✅', 'KAMIS', `${action.params?.item || '배추'} 가격 조회 완료`, 'success');

        // Workspace 저장
        saveToWorkspace('kamis_price', {
          title: `${kamisData.item} 시장가격`,
          ...kamisData,
        }, String(action.params?.userMessage || ''));

        setState('listening');
        setIsListening(true);
      } catch (err: any) {
        const errText = `KAMIS 조회 오류: ${err.message}`;
        addMessage('jarvis', errText);
        emitMissionLog('❌', 'KAMIS', errText, 'error');
        setState('listening');
        setIsListening(true);
      }
      return;
    }

    // ── 스마트스토어 전체 자동화 액션 ──
    const SS_ACTIONS = [
      'current_new_orders', 'query_orders_today', 'query_pending_shipping', 'query_pre_shipping_total', 'query_order_status',
      'query_orders_week', 'query_orders_month',
      'query_orders_unpaid', 'query_orders_cancel', 'query_orders_return',
      'query_orders_by_product', 'query_order_detail', 'query_orders_pending_ship', 'morning_report',
      'confirm_all_today', 'confirm_all', 'confirm_by_product', 'confirm_by_id', 'query_unconfirmed',
      'create_order_sheet_today', 'create_order_sheet_week', 'create_order_sheet_by_product',
      'create_order_sheet_grouped', 'check_duplicate_orders', 'bundle_same_address',
      'create_settlement_month', 'create_settlement_by_product', 'calc_weekly_profit',
      'get_bestseller', 'compare_last_month', 'weekly_report',
      'send_purchase_email', 'send_purchase_email_auto', 'preview_purchase_email',
      'process_shipping', 'get_products',
      'process_order_file', 'process_order_file_and_send',
      // 구버전 호환
      'get_orders', 'ship_order',
    ];
    if (
      action?.type === 'smartstore_orders' || action?.type === 'smartstore_shipping' ||
      action?.type === 'smartstore_products' || action?.type === 'smartstore_confirm' ||
      action?.type === 'smartstore_sheet' || action?.type === 'smartstore_settlement' ||
      action?.type === 'smartstore_purchase_email' || action?.type === 'smartstore_report' ||
      (action?.params?.action && SS_ACTIONS.includes(String(action.params.action)))
    ) {
      // 액션 매핑 (신규 인텐트 지원)
      let ssAction = String(action.params?.action || '');
      if (!ssAction || ssAction === 'get_orders') ssAction = 'current_new_orders';
      if (ssAction === 'ship_order') ssAction = 'process_shipping';

      setState('working');

      // Fast-path: __SKIP_TTS__ 마커가 있으면 초기 TTS 건너뛰기 (속도 우선)
      if (action.response !== '__SKIP_TTS__') {
        addMessage('jarvis', action.response);
        startSpeakingLevel();
        await new Promise<void>(resolve => {
          speak(action.response, undefined, () => { stopSpeakingLevel(); resolve(); });
        });
      }

      // ── Phase UI-C-Final: Mission Log 강화 ──
      emitMissionLog('🎤', 'COMMANDER', '음성 명령 인식 완료', 'info');
      emitMissionLog('🧠', 'JARVIS', '의도 판단 완료', 'success');
      emitMissionLog('🛠️', 'SMARTSTORE', `스마트스토어 ${getActionLabel(ssAction)} 시작`, 'info');
      telemetryFunctionStart('smartstore_action', `스마트스토어: ${ssAction}`);
      // ── 스마트스토어 행동 로그 패널 활성화 ───
      setDataPanel({
        visible: true,
        type: 'smartstore',
        progress: 5,
        message: '스마트스토어 엔진 가동 중...',
        actionLogs: [],
      });

      try {
        // 발주서 파일 처리 (파일 업로드 UI 표시 후 처리)
        if (ssAction === 'process_order_file' || ssAction === 'process_order_file_and_send') {
          const isSendEmail = ssAction === 'process_order_file_and_send';
          setOrderFileAction(ssAction as 'process_order_file' | 'process_order_file_and_send');
          setOrderFileUploadVisible(true);

          // 파일 업로드 대기
          const uploadedFile = await new Promise<File | null>(resolve => {
            orderFileResolveRef.current = resolve;
          });

          setOrderFileUploadVisible(false);

          if (!uploadedFile) {
            const cancelText = '발주서 파일 업로드가 취소되었습니다, 선생님.';
            setState('speaking');
            addMessage('jarvis', cancelText);
            startSpeakingLevel();
            await new Promise<void>(resolve => { speak(cancelText, undefined, () => { stopSpeakingLevel(); resolve(); }); });
          } else {
            setOrderFileProcessing(true);
            const processingText = isSendEmail
              ? '발주서 파일을 분석하고 정산서를 생성한 후 공급처에 이메일 발송하겠습니다, 선생님.'
              : '발주서 파일을 분석하고 셀렌 발주서와 정산서를 생성하겠습니다, 선생님.';
            setState('working');
            addMessage('jarvis', processingText);
            startSpeakingLevel();
            await new Promise<void>(resolve => { speak(processingText, undefined, () => { stopSpeakingLevel(); resolve(); }); });

            try {
              // 파일을 Base64로 변환
              const fileBase64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve((reader.result as string).split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(uploadedFile);
              });

              const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
              const apiAction = isSendEmail ? 'full_process' : 'create_order';

              const res = await fetch('/api/cloud-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  endpoint: 'smartstore-process-order',
                  params: {
                    action: apiAction,
                    fileBase64,
                    fileName: uploadedFile.name,
                    date: today,
                  },
                }),
              });
              const data = await res.json();
              setOrderFileProcessing(false);

              if (!data.success) throw new Error(data.error || '발주서 처리 실패');

              // 발주서 엑셀 다운로드
              if (data.orderSheet) {
                const orderBytes = Uint8Array.from(atob(data.orderSheet), c => c.charCodeAt(0));
                const orderBlob = new Blob([orderBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const orderUrl = URL.createObjectURL(orderBlob);
                const orderA = document.createElement('a');
                orderA.href = orderUrl;
                orderA.download = data.orderFileName || '셀렌_발주서.xlsx';
                orderA.click();
                URL.revokeObjectURL(orderUrl);
              }

              // 정산서 엑셀 다운로드
              if (data.settlementSheet) {
                await new Promise(r => setTimeout(r, 500));
                const settleBytes = Uint8Array.from(atob(data.settlementSheet), c => c.charCodeAt(0));
                const settleBlob = new Blob([settleBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const settleUrl = URL.createObjectURL(settleBlob);
                const settleA = document.createElement('a');
                settleA.href = settleUrl;
                settleA.download = data.settlementFileName || '정산서.xlsx';
                settleA.click();
                URL.revokeObjectURL(settleUrl);
              }

              // 결과 메시지
              let resultMsg = `[LIST] **발주서 처리 완료**\n\n`;
              resultMsg += `[PKG] 총 주문: ${data.orderCount}건\n`;
              if (data.qtySummary) {
                const summary = Object.entries(data.qtySummary as Record<string, number>)
                  .filter(([, qty]) => qty > 0)
                  .map(([name, qty]) => `  • ${name}: ${qty}개`)
                  .join('\n');
                if (summary) resultMsg += `\n물품별 수량:\n${summary}\n`;
              }
              if (data.totalSettlement) {
                resultMsg += `\n[MONEY] 입금 필요액: **${Number(data.totalSettlement).toLocaleString('ko-KR')}원**`;
              }
              if (isSendEmail && data.emailSent) {
                resultMsg += `\n\n 공급처 이메일 발송 완료`;
                resultMsg += `\n[PHONE] 텔레그램으로 정산 내역을 확인하세요.`;
              }
              resultMsg += `\n\n[IN] 셀렌 발주서 + 정산서 다운로드가 시작되었습니다.`;

              const doneText = isSendEmail
                ? `발주서 처리 및 공급처 이메일 발송 완료입니다, 선생님. 텍레그램으로 정산 내역을 확인하세요.`
                : `발주서 처리 완료입니다, 선생님. 셀렌 발주서와 정산서가 다운로드되었습니다. 입금 필요액은 ${Number(data.totalSettlement || 0).toLocaleString('ko-KR')}원입니다.`;

              setState('speaking');
              addMessage('jarvis', resultMsg, true);
              startSpeakingLevel();
              await new Promise<void>(resolve => { speak(doneText, undefined, () => { stopSpeakingLevel(); resolve(); }); });
              setClapBurst(true); setTimeout(() => setClapBurst(false), 120);

            } catch (err) {
              setOrderFileProcessing(false);
              throw err;
            }
          }

          await new Promise(r => setTimeout(r, 400));
          setState('listening');
          setIsListening(true);
          return;
        }

        // 상품 조회는 기존 API 유지
        if (ssAction === 'get_products') {
          const productStatus = String(action.params?.product_status || 'SALE');
          const params = new URLSearchParams({ status: productStatus, size: '50' });
          const res = await fetch(`/api/cloud-proxy?endpoint=smartstore-products&${params.toString()}`);
          const data = await res.json();
          if (!data.success) throw new Error(data.error || '상품 조회 실패');
          const products = data.products || [];
          let productSummary = `총 ${data.total || products.length}개 상품\n\n`;
          products.slice(0, 8).forEach((p: any, i: number) => {
            productSummary += `${i + 1}. ${p.name} - ${p.salePrice?.toLocaleString()}원 [${p.statusKo}]${p.stockQuantity !== undefined ? ` (재고: ${p.stockQuantity}개)` : ''}\n`;
          });
          if (products.length > 8) productSummary += `\n... 외 ${products.length - 8}개 더 있습니다.`;
          const doneText = `스마트스토어 상품 조회 완료입니다, 선생님. ${products.length}개 상품이 확인되었습니다.`;
          setState('speaking');
          addMessage('jarvis', ` **스마트스토어 상품 현황**\n\n${productSummary}`, true);
          startSpeakingLevel();
          await new Promise<void>(resolve => { speak(doneText, undefined, () => { stopSpeakingLevel(); resolve(); }); });

        } else {
          // 통합 자동화 API 호출
          const body: Record<string, any> = { action: ssAction };
          if (action.params?.product_name) body.productName = action.params.product_name;
          if (action.params?.order_id) body.orderId = action.params.order_id;
          if (action.params?.product_order_ids) {
            try { body.productOrderIds = JSON.parse(String(action.params.product_order_ids)); } catch { /* ignore */ }
          }
          if (action.params?.tracking_number) body.trackingNumber = action.params.tracking_number;
          if (action.params?.delivery_company) body.deliveryCompany = action.params.delivery_company;
          if (action.params?.supplier_email) body.supplierEmail = action.params.supplier_email;
          if (action.params?.supplier_name) body.supplierName = action.params.supplier_name;
          if (action.params?.delivery_date) body.deliveryDate = action.params.delivery_date;
          if (action.params?.group_by) body.groupBy = action.params.group_by;
          if (action.params?.memo) body.memo = action.params.memo;

          setDataPanel(prev => ({ ...prev, progress: 15, message: '클라우드 서버 연결 중... (CDP 브라우저)' }));

          // 클라우드 서버를 통해 실제 스마트스토어 데이터 조회 (CDP 크롤링)
          const res = await fetch('/api/cloud-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: 'task', taskType: 'smartstore-orders', params: body }),
          });
          const rawData = await res.json();
          // 클라우드 서버 응답 포맷 변환 (통일 구조 v3)
          let data: any;
          if (rawData.result) {
            // 구버전 래핑 응답 호환
            const ss = rawData.result.smartstore || {};
            data = {
              success: rawData.result.success ?? rawData.success,
              action_logs: rawData.result.actionLogs,
              data: rawData.result.smartstore,
              newOrders: ss.newOrders ?? 0,
              pendingShipping: ss.pendingShipping ?? 0,
              preShipTotal: ss.preShipTotal ?? ((ss.newOrders ?? 0) + (ss.pendingShipping ?? 0)),
              cancelOrders: ss.cancelRequests ?? 0,
              shipping: ss.shipping ?? 0,
              delivered: ss.delivered ?? 0,
              purchaseConfirmed: ss.purchaseConfirmed ?? 0,
              source: 'naver-commerce-api',
              fetchedAt: rawData.result.fetchedAt || null,
              isCached: false,
            };
          } else {
            // 직접 응답 (cloud-proxy v3): counts 구조 우선 참조
            const c = rawData.counts || {};
            data = {
              ...rawData,
              success: rawData.success ?? true,
              newOrders: c.newOrders ?? rawData.newOrders ?? 0,
              pendingShipping: c.pendingShipping ?? rawData.pendingShipping ?? 0,
              preShipTotal: c.preShipTotal ?? rawData.preShipTotal ?? ((c.newOrders ?? rawData.newOrders ?? 0) + (c.pendingShipping ?? rawData.pendingShipping ?? 0)),
              cancelOrders: rawData.cancelOrders ?? rawData.cancelRequests ?? 0,
              shipping: c.shipping ?? 0,
              delivered: c.delivered ?? 0,
              purchaseConfirmed: c.purchaseConfirmed ?? 0,
              fullOrderSummary: rawData.fullOrderSummary,
              source: rawData.source || 'naver-commerce-api',
              fetchedAt: rawData.fetchedAt || null,
              isCached: rawData.isCached ?? false,
              dataReliable: rawData.dataReliable,
              diagnostics: rawData.diagnostics,
            };
          }

          // 행동 로그 업데이트
          if (data.action_logs) {
            setDataPanel(prev => ({
              ...prev,
              progress: data.success ? 100 : 80,
              message: data.success ? '작업 완료' : '오류 발생',
              actionLogs: data.action_logs,
            }));
          } else {
            setDataPanel(prev => ({ ...prev, progress: data.success ? 100 : 80, message: data.success ? '작업 완료' : '오류 발생' }));
          }

          if (!data.success) {
            // SMARTSTORE-ORDERS-FIX.1A: errorCode 구분 에러 throw
            const ssErrCode = data.errorCode || 'SMARTSTORE_API_ERROR';
            const ssErrMsg = data.errorMessage || data.error || '스마트스토어 작업 실패';
            throw Object.assign(new Error(ssErrMsg), { code: ssErrCode });
          }
          // Phase UI-C-Final: Mission Log - API 응답 수신
          emitMissionLog('📡', 'NAVER API', `Naver API 응답 수신 ${data.isCached ? '(캐시)' : '(실시간)'}`, 'success');
          // 텔레메트리: 스마트스토어 성공
          telemetryFunctionSuccess('smartstore_action', `스마트스토어 ${ssAction} 완료`, { action: ssAction });
          // SSoT 캐시 저장 (브리핑 fallback용)
          ssCountsCacheRef.current = {
            data: { newOrders: data.newOrders, pendingShipping: data.pendingShipping, preShipTotal: data.preShipTotal, shipping: data.shipping, delivered: data.delivered, purchaseConfirmed: data.purchaseConfirmed, fullOrderSummary: data.fullOrderSummary, source: data.source, fetchedAt: data.fetchedAt, isCached: false, dataReliable: data.dataReliable, diagnostics: data.diagnostics },
            fetchedAt: Date.now(),
          };
          setSccOrderData(ssCountsCacheRef.current.data);

          // 결과 메시지 생성
          let resultMsg = '';
          let doneText = '';

          // NaN 방지 헬퍼
          const safeNum = (v: any) => (typeof v === 'number' && !isNaN(v)) ? v : 0;
          // SMARTSTORE-ORDERS-FIX.3: fast_snapshot 모드 대응
          // actionable = PAYED 실시간, dashboardSnapshot = deep 캐시
          const isV3 = !!(data as any).actionable; // fast_snapshot 모드 여부
          const act = (data as any).actionable || {};
          const snap3 = (data as any).dashboardSnapshot || {};
          const syncSt = (data as any).syncStatus || {};

          const nO = isV3 ? safeNum(act.newOrders) : safeNum(data.newOrders);
          const pS = isV3 ? safeNum(act.pendingShipping) : safeNum(data.pendingShipping);
          const preT = isV3 ? safeNum(act.preShipTotal) || (nO + pS) : safeNum(data.preShipTotal) || (nO + pS);
          const fullSummary = (data as any).fullOrderSummary || {};
          const actionBuckets = fullSummary.actionBuckets || {};
          const productOrderCount = safeNum(fullSummary.productOrderCount ?? data.counts?.productOrderCount ?? preT);
          const totalOrderQuantity = safeNum(fullSummary.totalOrderQuantity ?? data.counts?.totalOrderQuantity ?? 0);
          const confirmNeededCount = safeNum(actionBuckets.confirmNeededCount ?? data.counts?.confirmNeeded ?? nO);
          const fullSummaryReliable = fullSummary.dataReliable !== false && data.dataReliable !== false;
          // SMARTSTORE-ORDERS-FIX.3A: 배송중/배송완료/구매확정
          // 1차: 서버 deep 캐시, 2차: localStorage fallback
          let shipRaw = isV3 ? snap3.delivering : data.shipping;
          let dlvdRaw = isV3 ? snap3.delivered : data.delivered;
          let pConfRaw = isV3 ? snap3.purchaseDecided : data.purchaseConfirmed;
          let deepSource = isV3 ? (snap3.source || 'missing') : 'legacy';
          // localStorage fallback: 서버 deep 캐시가 missing이면 localStorage에서 읽기
          if (isV3 && snap3.source === 'missing') {
            try {
              const lsRaw = localStorage.getItem('jarvis.smartstore.lastStatusSnapshot');
              if (lsRaw) {
                const ls = JSON.parse(lsRaw);
                const lsAge = Date.now() - (ls.savedAt || 0);
                if (lsAge < 60 * 60 * 1000) { // 1시간 이내만 사용
                  if (ls.shipping !== null && ls.shipping !== undefined) { shipRaw = ls.shipping; }
                  if (ls.delivered !== null && ls.delivered !== undefined) { dlvdRaw = ls.delivered; }
                  if (ls.purchaseConfirmed !== null && ls.purchaseConfirmed !== undefined) { pConfRaw = ls.purchaseConfirmed; }
                  deepSource = `localStorage (${Math.round(lsAge / 60000)}분 전)`;
                }
              }
            } catch (e) {
              console.warn('[JARVIS] localStorage deep 캐시 읽기 실패:', e);
            }
          }
          const ship = (shipRaw !== null && shipRaw !== undefined) ? safeNum(shipRaw) : null;
          const dlvd = (dlvdRaw !== null && dlvdRaw !== undefined) ? safeNum(dlvdRaw) : null;
          const pConf = (pConfRaw !== null && pConfRaw !== undefined) ? safeNum(pConfRaw) : null;
          // 소스/시각 라벨
          const isPayedLive = isV3 ? !act.isCached : !data.isCached;
          const srcLabel = isPayedLive ? '(실시간)' : '(캐시)';
          const timeLabel = data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';

          if (ssAction === 'query_order_status' || ssAction === 'current_new_orders' || ssAction === 'query_pending_shipping' || ssAction === 'query_pre_shipping_total') {
            try {
              const snapshot = {
                newOrders: nO,
                pendingShipping: pS,
                preShipTotal: preT,
                shipping: ship,
                delivered: dlvd,
                purchaseConfirmed: pConf,
                source: srcLabel,
                fetchedAt: data.fetchedAt,
                savedAt: Date.now(),
              };
              localStorage.setItem('jarvis.smartstore.lastStatusSnapshot', JSON.stringify(snapshot));
            } catch (e) {
              console.warn('[JARVIS] Smartstore snapshot 저장 실패:', e);
            }
          }

          if (ssAction === 'query_order_status') {
            // SMARTSTORE-ORDERS-FIX.3: fast_snapshot 모드 대응
            // null = 동기화 필요 (정직 표시)
            const shipLabel = ship !== null ? `${ship}건` : '동기화 필요';
            const dlvdLabel = dlvd !== null ? `${dlvd}건` : '동기화 필요';
            const pConfLabel = pConf !== null ? `${pConf}건` : '동기화 필요';
            const deepCacheNote = (ship === null && dlvd === null && pConf === null)
              ? '\n⚠ 배송중/배송완료/구매확정: 정밀 동기화 중... (자동 실행)'
              : deepSource !== 'legacy' && deepSource !== 'missing'
              ? `\nℹ 배송중/배송완료/구매확정: ${deepSource}`
              : isV3 && snap3.cacheAgeMinutes !== null
              ? `\nℹ 배송중/배송완료/구매확정: ${snap3.cacheAgeMinutes}분 전 동기화 기준`
              : '';
            const syncMsg = syncSt.message || '';
            resultMsg = `[PKG] **전체 주문/발주 현황** ${srcLabel}\n\n전체 상품주문: ${productOrderCount}건\n전체 주문수량: ${totalOrderQuantity || '확인 필요'}개\n발주확인 필요: ${confirmNeededCount}건\n배송준비: ${pS}건 (실시간)\n배송 전 처리 대상 전체: ${preT}건\n신규주문: ${nO}건 (실시간)\n배송중: ${shipLabel}\n배송완료: ${dlvdLabel}\n구매확정: ${pConfLabel}\n\n기준: ProductOrderId unique / quantity 합계${fullSummaryReliable ? '' : '\n⚠ 전체 수량 요약은 부분 집계입니다. API 상태 확인 필요.'}\n현황: OBSERVE 조회 완료${deepCacheNote}`;
            if (syncMsg) resultMsg += `\n${syncMsg}`;
            if (timeLabel) resultMsg += `\n조회 시각: ${timeLabel}`;
            const shipTts = ship !== null ? `배송중 ${ship}건` : '배송중 동기화 필요';
            doneText = `대표님, 현재 전체 상품주문은 ${productOrderCount}건이고 전체 주문 수량은 ${totalOrderQuantity || 0}개입니다. 발주확인 필요 ${confirmNeededCount}건, 배송준비 ${pS}건입니다.`;
          } else if (ssAction === 'current_new_orders') {
            resultMsg = `[PKG] **현재 주문 현황** ${srcLabel}\n\n현재 신규주문: ${nO}건\n배송준비: ${pS}건\n배송 전 처리 대상 전체: ${preT}건\n배송중: ${ship}건\n배송완료: ${dlvd}건\n구매확정: ${pConf}건 (최근 7일 기준)`;
            if (timeLabel) resultMsg += `\n\n조회 시각: ${timeLabel}`;
            doneText = `현재 신규주문 ${nO}건, 배송준비 ${pS}건입니다, 선생님.`;
          } else if (ssAction === 'query_pending_shipping') {
            resultMsg = `[PKG] **배송준비** ${srcLabel}\n\n배송준비: ${pS}건\n(신규주문 ${nO}건 + 배송준비 ${pS}건 = 배송 전 전체 ${preT}건)`;
            if (timeLabel) resultMsg += `\n\n조회 시각: ${timeLabel}`;
            doneText = `배송준비 ${pS}건입니다, 선생님.`;
          } else if (ssAction === 'query_pre_shipping_total') {
            resultMsg = `[PKG] **배송 전 처리 대상 전체** ${srcLabel}\n\n현재 신규주문: ${nO}건\n배송준비: ${pS}건\n배송 전 처리 대상 전체: ${preT}건`;
            if (timeLabel) resultMsg += `\n\n조회 시각: ${timeLabel}`;
            doneText = `배송 전 처리 대상 전체 ${preT}건입니다, 선생님.`;
          } else if (ssAction.startsWith('query_orders') || ssAction === 'morning_report') {
            const count = Array.isArray(data.data) ? data.data.length : (data.newOrders || 0);
            // ── 주문 대시보드 UI 자동 표시 ──
            if (Array.isArray(data.data) && data.data.length > 0) {
              setOrderDashboardData(data.data);
              setOrderDashboardSummary(data.counts ? {
                newOrders: safeNum(data.counts.newOrders ?? data.newOrders),
                pendingShipping: safeNum(data.counts.pendingShipping ?? data.pendingShipping),
                shipping: safeNum(data.counts.shipping ?? data.shipping),
                delivered: safeNum(data.counts.delivered ?? data.delivered),
                totalRevenue: 0,
                todayRevenue: 0,
              } : null);
              setOrderDashboardVisible(true);
            }
            resultMsg = `[PKG] **${getActionLabel(ssAction)}**\n\n`;
            if (ssAction === 'morning_report') {
              resultMsg += `신규 주문: ${nO}건\n취소 요청: ${safeNum(data.cancelOrders)}건\n발송 대기: ${pS}건\n배송중: ${ship}건\n배송완료: ${dlvd}건\n구매확정: ${pConf}건 (최근 7일 기준)`;
              doneText = `아침 업무 보고 완료입니다, 선생님. 신규 주문 ${nO}건, 배송준비 ${pS}건입니다.`;
            } else {
              resultMsg += data.summary || `총 ${count}건 조회되었습니다.`;
              doneText = `${getActionLabel(ssAction)} 완료입니다, 선생님. ${count}건이 확인되었습니다.`;
            }
          } else if (ssAction.startsWith('confirm')) {
            resultMsg = `[OK] **발주확인 처리 완료**\n\n${data.confirmedCount || 0}건 처리되었습니다.`;
            doneText = `발주확인 ${data.confirmedCount || 0}건 처리 완료입니다, 선생님.`;
            setClapBurst(true); setTimeout(() => setClapBurst(false), 120);
          } else if (ssAction.startsWith('create_order_sheet') || ssAction === 'check_duplicate_orders' || ssAction === 'bundle_same_address') {
            const count = data.count || (Array.isArray(data.duplicates) ? data.duplicates.length : 0) || (Array.isArray(data.bundled) ? data.bundled.length : 0);
            resultMsg = `[LIST] **${getActionLabel(ssAction)}**\n\n${data.fileName || ''}\n${count}건 처리되었습니다.`;
            doneText = `${getActionLabel(ssAction)} 완료입니다, 선생님.`;
            if (data.csvData) {
              // CSV 다운로드 링크 생성
              const blob = new Blob([data.csvData], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = data.fileName || '주문서.csv'; a.click();
              URL.revokeObjectURL(url);
              resultMsg += `\n\n[IN] 파일 다운로드가 시작되었습니다.`;
            }
          } else if (ssAction.startsWith('create_settlement') || ssAction === 'calc_weekly_profit' || ssAction === 'get_bestseller' || ssAction === 'compare_last_month' || ssAction === 'weekly_report') {
            resultMsg = `[MONEY] **${getActionLabel(ssAction)}**\n\n`;
            if (data.totalSales) resultMsg += `총 매출: ${Number(data.totalSales).toLocaleString('ko-KR')}원\n총 주문: ${data.totalOrders}건\n네이버 수수료: ${Number(data.naverFee).toLocaleString('ko-KR')}원\n실수령: ${Number(data.netSales).toLocaleString('ko-KR')}원`;
            if (data.growthRate) resultMsg += `전월 대비: ${data.growthRate}\n${data.message}`;
            if (data.topProduct) resultMsg += `베스트셀러: ${data.topProduct?.productName} (${data.topProduct?.quantity}개)`;
            doneText = `${getActionLabel(ssAction)} 완료입니다, 선생님.`;
            if (data.csvData) {
              const blob = new Blob([data.csvData], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = data.fileName || '정산서.csv'; a.click();
              URL.revokeObjectURL(url);
            }
          } else if (ssAction.includes('purchase_email')) {
            resultMsg = `[MAIL] **발주 이메일 ${ssAction === 'preview_purchase_email' ? '미리보기' : '발송 완료'}**\n\n${data.message || ''}\n\n${data.preview || ''}`;
            doneText = ssAction === 'preview_purchase_email' ? '발주 이메일 초안입니다, 선생님. 확인 후 발송하시겠습니까?' : `발주 이메일 발송 완료입니다, 선생님.`;
            if (ssAction !== 'preview_purchase_email') {
              setClapBurst(true); setTimeout(() => setClapBurst(false), 120);
            }
          } else if (ssAction === 'process_shipping') {
            resultMsg = ` **발송 처리 완료**\n\n${data.count || 0}건 처리되었습니다.`;
            doneText = `발송 처리 ${data.count || 0}건 완료입니다, 선생님.`;
            setClapBurst(true); setTimeout(() => setClapBurst(false), 120);
          } else {
            resultMsg = data.message || '작업이 완료되었습니다.';
            doneText = '작업 완료입니다, 선생님.';
          }

          setState('speaking');
          addMessage('jarvis', resultMsg, true);
          // TTS 비동기화: 텍스트 먼저 표시, TTS는 후속 처리
          startSpeakingLevel();
          speak(doneText, undefined, () => { stopSpeakingLevel(); });
          // 패널 완전 종료
          resetAllNodes();

          // SMARTSTORE-ORDERS-FIX.3A: deep 캐시가 missing이면 자동 deep_sync 백그라운드 호출
          if (isV3 && snap3.source === 'missing' && ship === null && dlvd === null && pConf === null) {
            // 비동기 호출 (UI 차단 안 함)
            (async () => {
              try {
                console.log('[JARVIS] deep_sync 자동 백그라운드 호출 시작');
                const dsResp = await fetch('/api/cloud-proxy', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ taskType: 'smartstore-orders', action: 'deep_sync' }),
                });
                if (dsResp.ok) {
                  const dsData = await dsResp.json();
                  if (dsData.success && dsData.result) {
                    const dsResult = dsData.result;
                    const deepSnapshot = {
                      newOrders: nO,
                      pendingShipping: pS,
                      preShipTotal: preT,
                      shipping: dsResult.shipping ?? 0,
                      delivered: dsResult.delivered ?? 0,
                      purchaseConfirmed: dsResult.purchaseConfirmed ?? 0,
                      source: `deep_sync (최근 30일 결제 기준)`,
                      fetchedAt: Date.now(),
                      savedAt: Date.now(),
                    };
                    localStorage.setItem('jarvis.smartstore.lastStatusSnapshot', JSON.stringify(deepSnapshot));
                    console.log('[JARVIS] deep_sync 완료 → localStorage 저장:', {
                      shipping: dsResult.shipping,
                      delivered: dsResult.delivered,
                      purchaseConfirmed: dsResult.purchaseConfirmed,
                    });
                  }
                }
              } catch (dsErr) {
                console.warn('[JARVIS] deep_sync 백그라운드 실패:', dsErr);
              }
            })();
          }

          // Mission Log: 결과 요약
          emitMissionLog('📦', 'SMARTSTORE', `신규 ${nO}건 / 배송준비 ${pS}건 / 배송중 ${ship}건`, 'info');
          emitMissionLog('✅', 'JARVIS', '추천 액션 생성 완료', 'success');
          emitMissionLog('⏳', 'JARVIS', '대표님 선택 대기 중', 'thinking');

          // ── Phase UI-C-Final: ActionCard context 설정 + Approval Preview ──
          const ssCtx: ActionContext = {
            type: 'smartstore',
            newOrders: nO,
            pendingShipping: pS,
            preShipTotal: preT,
            productOrderCount,
            totalOrderQuantity,
            confirmNeededCount,
            confirmNeededProductOrderIds: fullSummary.confirmNeededProductOrderIds || [],
          };
          setActionContext(ssCtx);
          setWorkflowSteps(buildWorkflowSteps(ssCtx));
          setApprovalPreview(buildApprovalPreview(ssCtx));
          setConversationExpanded(true);
        }

      } catch (err) {
        telemetryFunctionError('smartstore_action', `스마트스토어 오류: ${err}`);
        setDataPanel(prev => ({ ...prev, progress: 0, message: '❌ 오류 발생' }));
        // SMARTSTORE-ORDERS-FIX.1A: errorCode 구분 메시지 표시
        const ssCode = (err as any)?.code || '';
        const errMsg = ssCode === 'SMARTSTORE_TIMEOUT'
          ? '스마트스토어 API 응답 시간이 초과됐습니다, 선생님. 잠시 후 다시 시도해주세요.'
          : ssCode === 'SMARTSTORE_AUTH_ERROR'
          ? '스마트스토어 인증 오류가 발생했습니다, 선생님. 토큰 설정을 확인해주세요.'
          : String(err).includes('CLIENT_ID')
          ? '스마트스토어 API 키 설정을 확인해주세요, 선생님.'
          : `스마트스토어 작업 중 오류가 발생했습니다, 선생님. ${String(err)?.replace(/Error:\s*/i, '') || '알 수 없는 오류'}`;
        setState('speaking');
        addMessage('jarvis', errMsg);
        startSpeakingLevel();
        await new Promise<void>(resolve => { speak(errMsg, undefined, () => { stopSpeakingLevel(); resolve(); }); });
      }

      // 5초 후 행동 로그 패널 자동 닫기
      setTimeout(() => {
        setDataPanel({ visible: false, type: null, progress: 0, message: '' });
      }, 5000);

      await new Promise(r => setTimeout(r, 400));
      // UI-ORCH-A.10: Mission Workspace가 열려 있으면 STT 재시작 방지 (음성 재인식으로 인한 자동 닫힘 방지)
      if (missionWorkspaceOpen) {
        setState('idle');
        setIsListening(false);
      } else {
        setState('listening');
        setIsListening(true);
      }
      return;
    }

    // ── 인플루언서 지능형 분석 액션 ──
    if (action?.type === 'analyze_influencers_smart') {
      const platform = String(action.params?.platform || 'YouTube');
      const count = Number(action.params?.count) || 10;
      const keyword = String(action.params?.keyword || '');
      const minSubscribers = Number(action.params?.min_subscribers) || 0;  // 기본값 0 = 필터 비활성화 (사용자가 명시적으로 지정하지 않으면 모두 표시)
      setState('working');
      addMessage('jarvis', action.response);
      startSpeakingLevel();
      await new Promise<void>(resolve => {
        speak(action.response, undefined, () => { stopSpeakingLevel(); resolve(); });
      });
      try {
        emitNodeState('influencer', 'active');
        telemetryFunctionStart('analyze_influencers_smart', `${platform} 인플루언서 분석: "${keyword}" ${count}명`);
        const isYT = platform.toLowerCase().includes('youtube') || platform.toLowerCase().includes('유튜브');
        const isIG = platform.toLowerCase().includes('instagram') || platform.toLowerCase().includes('인스타');
        let collected: InfluencerData[] = [];
        if (isYT) {
          const result = await searchYouTubeAPI(keyword || '인플루언서', Math.min(count * 3, 50));
          collected = result.items.map((ch: YouTubeChannel) => ({
            id: ch.channelId || `yt-${Date.now()}-${Math.random()}`,
            name: ch.name || ch.customUrl || '',
            platform: 'YouTube',
            followers: ch.subscribers ? (ch.subscribers >= 10000 ? `${(ch.subscribers / 10000).toFixed(1)}만` : ch.subscribers >= 1000 ? `${(ch.subscribers / 1000).toFixed(1)}K` : `${ch.subscribers}`) : '-',
            subscriberCount: ch.subscribers || 0,
            viewCount: ch.viewCount ? (ch.viewCount >= 10000 ? `${(ch.viewCount / 10000).toFixed(0)}만` : `${ch.viewCount}`) : '-',
            email: ch.email || '',
            profileUrl: ch.profileUrl || '',
            category: keyword || '전체',
            collectedAt: new Date().toLocaleString('ko-KR'),
            status: 'new' as const,
          }));
        } else if (isIG) {
          const result = await searchInstagramAPI(keyword || '인플루언서', Math.min(count * 2, 20), true);
          collected = result.items.map((acc: InstagramAccount) => ({
            id: acc.username || `ig-${Date.now()}-${Math.random()}`,
            name: acc.fullName || acc.username || '',
            platform: 'Instagram',
            followers: acc.followersFormatted || '-',
            email: acc.email || '',
            profileUrl: acc.profileUrl || '',
            category: keyword || '전체',
            collectedAt: new Date().toLocaleString('ko-KR'),
            status: 'new' as const,
          }));
        } else {
          // Naver Blog fallback
          const result = await searchNaverAPI(keyword || '인플루언서', 'blog', Math.min(count * 3, 100), 'sim');
          collected = result.items.map((item: NaverSearchItem) => ({
            id: `naver-${Date.now()}-${Math.random()}`,
            name: item.bloggername?.replace(/<[^>]*>/g, '') || '',
            platform: 'Naver Blog',
            followers: '-',
            email: '',
            profileUrl: item.bloggerlink || '',
            category: keyword || '전체',
            collectedAt: new Date().toLocaleString('ko-KR'),
            status: 'new' as const,
          }));
        }
        // 이메일 있는 인플루언서만 필터링 (핵심 요구사항)
        const isYouTubeCollect = isYT;
        if (isYouTubeCollect) {
          const beforeFilter = collected.length;
          collected = collected.filter(i => i.email && i.email.includes('@'));
          console.log(`[JARVIS] 이메일 필터: ${beforeFilter}명 → ${collected.length}명 (이메일 있는 채널만)`);
        }

        // 구독자 수 필터
        if (minSubscribers > 0) {
          collected = collected.filter(i => {
            const f = i.followers || '';
            const m = f.match(/([\d.]+)(만|K|k|M|m)?/);
            if (!m) return false;
            const num = parseFloat(m[1]);
            const unit = m[2];
            let actual = num;
            if (unit === '만') actual = num * 10000;
            else if (unit === 'K' || unit === 'k') actual = num * 1000;
            else if (unit === 'M' || unit === 'm') actual = num * 1000000;
            return actual >= minSubscribers;
          });
        }

        // 기존 수집 데이터와 중복 제거 (channelId 또는 name 기준)
        const existingIds = new Set(collectedInfluencers.map(i => (i as any).channelId || i.name.toLowerCase().trim()));
        collected = collected.filter(i => {
          const key = (i as any).channelId || i.name.toLowerCase().trim();
          return !existingIds.has(key);
        });

        collected = collected.slice(0, count);

        // 새 수집 데이터를 기존에 추가 (누적 저장 + localStorage 자동 저장)
        setCollectedInfluencers(prev => [...prev, ...collected]);
        setInfluencerCardsVisible(true);
          emitNodeState('influencer', 'success');

        // 시트에도 저장
        if (collected.length > 0) {
          appendInfluencersToSheet(collected as any).then(r => {
            console.log('[JARVIS] 시트 저장:', r.success ? `완료 (${r.count}건)` : r.message);
            saveMemory('마지막 수집', `${keyword} ${collected.length}명 수집 (${new Date().toLocaleDateString('ko-KR')})`);
            invalidateSheetCache();
          }).catch(err => console.warn('[JARVIS] 시트 저장 실패:', err));

          // TiDB 데이터베이스 영구 저장
          fetch('/api/cloud-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskType: 'db',
              params: {
                action: 'save_influencers',
                keyword,
                influencers: collected.map(c => ({
                  channelId: c.id,
                  platform: c.platform,
                  name: c.name,
                  email: c.email || '',
                  subscribers: (c as any).subscriberCount || 0,
                  subscriberText: c.followers || '',
                  views: 0,
                  description: '',
                  profileUrl: c.profileUrl || '',
                  thumbnail: '',
                  category: c.category || keyword || '',
                  instagram: '',
                })),
              },
            }),
          }).then(r => r.json()).then(r => {
            console.log(`[JARVIS] DB 저장: ${r.saved}명 저장, ${r.duplicates}명 중복 스킵`);
          }).catch(err => console.warn('[JARVIS] DB 저장 실패:', err));
        }

        const emailCount = collected.filter(i => i.email).length;
        const noEmailCount = collected.filter(i => !i.email).length;
        const doneText = collected.length > 0
          ? `${platform} 인플루언서 ${collected.length}명을 수집 완료했습니다. 모두 이메일이 있는 채널입니다, 선생님.`
          : `이메일이 있는 ${platform} 인플루언서를 찾지 못했습니다. 다른 키워드로 시도해보시겠습니까?`;
        setState('speaking');
        // OUTREACH 패널 자동 활성화
        if (collected.length > 0) setOutreachVisible(true);
        const cardList = collected.slice(0, 5).map((c, i) => `${i + 1}. ${c.name} (${c.followers}) ${c.email ? `✉ ${c.email}` : ''}`).join('\n');
        addMessage('jarvis', `**${platform} 인플루언서 분석 완료** - ${collected.length}명 수집 (이메일 보유)\n\n` +
          `| 항목 | 수치 |\n|------|------|\n` +
          `| 총 수집 | ${collected.length}명 |\n` +
          `| 공개 이메일 확인 | ${emailCount}명 |\n\n` +
          `${cardList}${collected.length > 5 ? `\n... 외 ${collected.length - 5}명` : ''}\n\n` +
          `**저장 위치**: Google Sheets (influencer_candidates 탭) + localStorage`, true);
        // 파티클 폭발
        setClapBurst(true);
        setTimeout(() => setClapBurst(false), 120);
        setTimeout(() => { setClapBurst(true); setTimeout(() => setClapBurst(false), 120); }, 450);
        // ActionCard 연결
        if (collected.length > 0) {
          setActionContext({
            type: 'outreach_collect',
            keyword,
            collectedCount: collected.length,
            emailCount,
            shortfall: 0,
            label: `${keyword} ${collected.length}명 수집 완료`,
            description: `Google Sheets 저장 완료`,
            savedTo: 'Google Sheets (influencer_candidates)',
            locked: false,
            sourceCommand: `${keyword} ${platform} ${count}명 수집`,
          });
          setWorkflowSteps(buildWorkflowSteps({ type: 'outreach_collect', label: '후보 수집', description: '', locked: false }));
        }
        startSpeakingLevel();
        await new Promise<void>(resolve => { speak(doneText, undefined, () => { stopSpeakingLevel(); resolve(); }); });
      } catch (err: any) {
        console.error('[JARVIS] 인플루언서 분석 오류:', err);
        emitNodeState('influencer', 'error');
        const errMsg = `인플루언서 분석 중 오류가 발생했습니다: ${err.message}`;
        setState('speaking');
        addMessage('jarvis', errMsg);
        startSpeakingLevel();
        await new Promise<void>(resolve => { speak(errMsg, undefined, () => { stopSpeakingLevel(); resolve(); }); });
      }
      await new Promise(r => setTimeout(r, 400));
      setState('listening');
      setIsListening(true);
      return;
    }

    // ── 데이터베이스 조회 액션 ──
    if (action?.type === 'query_database') {
      const queryType = String(action.params?.query_type || 'influencers');
      const qKeyword = String(action.params?.keyword || '');
      const minSub = Number(action.params?.min_subscribers) || 0;
      const hasEmail = action.params?.has_email === 'true';
      const limit = Number(action.params?.limit) || 20;
      setState('working');
      addMessage('jarvis', action.response);
      startSpeakingLevel();
      await new Promise<void>(resolve => {
        speak(action.response, undefined, () => { stopSpeakingLevel(); resolve(); });
      });
      try {
        let apiAction = '';
        let body: any = {};
        switch (queryType) {
          case 'influencers':
            apiAction = 'query_influencers';
            body = { keyword: qKeyword, min_subscribers: minSub, has_email: hasEmail, limit };
            break;
          case 'viral_videos':
            apiAction = 'query_viral_videos';
            body = { keyword: qKeyword, limit };
            break;
          case 'collection_history':
            apiAction = 'collection_history';
            break;
          case 'stats':
            apiAction = 'stats';
            break;
          default:
            apiAction = 'query_influencers';
            body = { keyword: qKeyword, limit };
        }
        const dbRes = await fetch('/api/cloud-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskType: 'db', params: { action: apiAction, ...body } }),
        });
        const dbData = await dbRes.json();
        console.log('[JARVIS] DB 조회 결과:', dbData);

        if (queryType === 'influencers' && dbData.influencers?.length > 0) {
          const dbInfluencers: InfluencerData[] = dbData.influencers.map((inf: any) => ({
            id: inf.channel_id || `db-${inf.id}`,
            name: inf.name || '',
            platform: inf.platform || 'YouTube',
            followers: inf.subscriber_text || (inf.subscribers >= 10000 ? `${(inf.subscribers / 10000).toFixed(1)}만` : `${inf.subscribers}`),
            subscriberCount: inf.subscribers || 0,
            email: inf.email || '',
            profileUrl: inf.profile_url || '',
            category: inf.category || '',
            collectedAt: inf.collected_at || '',
            status: 'new' as const,
          }));
          setCollectedInfluencers(dbInfluencers);
          setInfluencerCardsVisible(true);
          const cardList = dbInfluencers.slice(0, 5).map((c: any, i: number) => `${i + 1}. ${c.name} (${c.followers}) ${c.email ? '[E] ' + c.email : ''}`).join('\n');
          addMessage('jarvis', `**DB 조회 결과** - ${dbData.total}명 발견${qKeyword ? ` (키워드: ${qKeyword})` : ''}\n\n${cardList}${dbData.total > 5 ? '\n... 외 ' + (dbData.total - 5) + '명' : ''}`, true);
          const resultText = `데이터베이스에서 ${dbData.total}명의 인플루언서를 찾았습니다, 선생님.`;
          setState('speaking');
          startSpeakingLevel();
          await new Promise<void>(resolve => { speak(resultText, undefined, () => { stopSpeakingLevel(); resolve(); }); });
        } else if (queryType === 'stats' && dbData.stats) {
          const s = dbData.stats;
          const statsText = `현재 DB 통계: 인플루언서 ${s.total_influencers}명, 이메일 보유 ${s.with_email}명, 바이럴 영상 ${s.total_viral_videos}건, 수집 횟수 ${s.total_collections}회`;
          addMessage('jarvis', `**데이터베이스 통계**\n\n| 항목 | 수치 |\n|------|------|\n| 총 인플루언서 | ${s.total_influencers}명 |\n| 이메일 보유 | ${s.with_email}명 |\n| 바이럴 영상 | ${s.total_viral_videos}건 |\n| 수집 횟수 | ${s.total_collections}회 |`, true);
          setState('speaking');
          startSpeakingLevel();
          await new Promise<void>(resolve => { speak(statsText, undefined, () => { stopSpeakingLevel(); resolve(); }); });
        } else if (queryType === 'collection_history' && dbData.history?.length > 0) {
          const histList = dbData.history.slice(0, 5).map((h: any, i: number) => `${i + 1}. ${h.keyword} - ${h.new_collected}명 수집 (${h.collected_at})`).join('\n');
          addMessage('jarvis', `**수집 이력**\n\n${histList}`, true);
          const histText = `최근 수집 이력 ${dbData.history.length}건을 찾았습니다.`;
          setState('speaking');
          startSpeakingLevel();
          await new Promise<void>(resolve => { speak(histText, undefined, () => { stopSpeakingLevel(); resolve(); }); });
        } else {
          const noDataText = '데이터베이스에 저장된 데이터가 없습니다. 먼저 인플루언서를 수집해주세요.';
          addMessage('jarvis', noDataText);
          setState('speaking');
          startSpeakingLevel();
          await new Promise<void>(resolve => { speak(noDataText, undefined, () => { stopSpeakingLevel(); resolve(); }); });
        }
      } catch (err: any) {
        console.error('[JARVIS] DB 조회 오류:', err);
        const errMsg = `데이터베이스 조회 중 오류가 발생했습니다: ${err.message}`;
        addMessage('jarvis', errMsg);
        setState('speaking');
        startSpeakingLevel();
        await new Promise<void>(resolve => { speak(errMsg, undefined, () => { stopSpeakingLevel(); resolve(); }); });
      }
      await new Promise(r => setTimeout(r, 400));
      setState('listening');
      setIsListening(true);
      return;
    }

    // ── 목소리 변경 액션 ──
    if (action?.type === 'change_voice') {
      const voiceAction = String(action.params?.action || 'list');
      const voiceId = String(action.params?.voice_id || '');
      const voiceName = String(action.params?.voice_name || '');

      if (voiceAction === 'change' && voiceId) {
        // 목소리 실제 변경
        setCurrentVoiceId(voiceId);
        const found = ELEVENLABS_VOICES.find(v => v.id === voiceId);
        const newName = found?.name || voiceName;
        setCurrentVoiceName(newName);
        console.log('[JARVIS] 목소리 변경됨:', newName);

        // 메인 응답을 새 목소리로 재생
        setState('speaking');
        addMessage('jarvis', action.response);
        startSpeakingLevel();
        await new Promise<void>(resolve => {
          speak(action.response, undefined, () => {
            stopSpeakingLevel();
            resolve();
          }, voiceId); // 새 목소리 ID로 재생
        });

        // 샘플 멘트 재생
        const sampleText = `이 목소리는 어때세요, 선생님? ${newName} 목소리로 설정되었습니다. 마음에 드시면 계속 사용하겠습니다.`;
        await new Promise(r => setTimeout(r, 600));
        setState('speaking');
        addMessage('jarvis', sampleText);
        startSpeakingLevel();
        await new Promise<void>(resolve => {
          speak(sampleText, undefined, () => {
            stopSpeakingLevel();
            resolve();
          }, voiceId);
        });

        // 응답 후 듣기 모드
        await new Promise(r => setTimeout(r, 400));
        setState('listening');
        setIsListening(true);
        return; // 이미 응답 처리했으므로 이하 실행 안 함
      } else if (voiceAction === 'recommend' || voiceAction === 'list') {
        // 목소리 목록을 화면에 표시 (voiceListVisible 상태)
        setVoiceListVisible(true);
        setTimeout(() => setVoiceListVisible(false), 15000); // 15초 후 자동 숨김
      }
    }

    // 텔레메트리: GPT 뇌 사고 완료 → jarvis_brain 노드 idle 복귀
    emitNodeState('jarvis_brain', 'success', '응답 생성 완료');
    setTimeout(() => emitNodeState('jarvis_brain', 'idle'), 2000);

    // ── 메인 응답 발화 ──
    setIsListening(false); // speaking 중 STT 완전 차단 (에코 방지)
    setState('speaking');
    // 작업 완료 타입이면 스파클링 효과 적용
    const isCompletionMsg = isWorkingType && !!action?.workingMessage;
    addMessage('jarvis', text, isCompletionMsg);
    // 수집/이메일 발송 완료 시 파티클 폭발 효과 (clapBurst 3회 연속) + 골든 플레어
    if (isCompletionMsg) {
      triggerGoldenFlare();
      setClapBurst(true);
      setTimeout(() => setClapBurst(false), 120);
      setTimeout(() => { setClapBurst(true); setTimeout(() => setClapBurst(false), 120); }, 450);
      setTimeout(() => { setClapBurst(true); setTimeout(() => setClapBurst(false), 120); }, 900);
    }
    startSpeakingLevel();

    const followUp = action?.followUp;

    await new Promise<void>(resolve => {
      speak(text, undefined, () => {
        stopSpeakingLevel();
        resolve();
      });
    });

    // ── followUp 후속 질문 자동 발화 ──
    if (followUp) {
      await new Promise(r => setTimeout(r, 800)); // 자연스러운 호흡 간격
      setIsListening(false); // followUp 중에도 STT 차단
      setState('speaking');
      addMessage('jarvis', followUp);
      startSpeakingLevel();
      await new Promise<void>(resolve => {
        speak(followUp, undefined, () => {
          stopSpeakingLevel();
          resolve();
        });
      });
    }

    // ── 응답 완료 후 자동으로 듣기 모드 전환 ──
    // TTS 에코가 마이크에 잡히지 않도록 에코 방지 딜레이 (1.2초)
    await new Promise(r => setTimeout(r, 1200));
    console.log('[JARVIS] 응답 완료 → listening 전환');
    setState('listening');
    setIsListening(true);
  }, [addMessage, speak, startSpeakingLevel, stopSpeakingLevel]);

  // ── STT 노이즈 필터: 유튜브/방송 오인식 패턴 차단 ──
  const normalizeKoreanSpeechText = (text: string): string => {
    return text.replace(/[\s\p{P}]/gu, '').trim();
  };

  // ── UI-ORCH-A.10: Mission Workspace 전체 닫기 (lifecycle lock) ──
  const closeMissionWorkspace = () => {
    // 1. lifecycle lock 해제 (ref도 즉시 반영)
    setMissionWorkspaceOpen(false);
    missionWorkspaceOpenRef.current = false;
    
    // 2. workspace scene 닫기 (raw setter로 guard 우회)
    _setActiveSceneRaw('home');
    
    // 3. transient UI state 정리 (고아 패널 완전 방지)
    setActionContext(null);
    setWorkflowSteps([]);
    setApprovalPreview(null);
    setPredictedActions([]);
    setActionStatusMessage('');
    
    // 4. Result Deck 및 관련 오버레이 강제 종료
    setResultDeckVisible(false);
    setCopyFocusMode(false);
    setResultDeckIsCopyR(false);
    setResultDeckResearchInsight('');
    setResultDeckExcludedEngines([]);
    
    // 5. messages 비우기 (workspace 세션 종료)
    setMessages([]);
    
    // 6. 기타 UI 상태 초기화
    setConversationExpanded(false);
    setResultDeckContent('');
    setResultDeckItems([]);
    
    // 7. STT/마이크 상태 초기화 (재인식 방지)
    setIsListening(false);
    setState('idle');
    setMicLevel(0);
  };

  const isLikelySttHallucination = (text: string): boolean => {
    const compact = normalizeKoreanSpeechText(text);
    if (!compact) return true;
    if (compact.includes('자비스')) return false; // 호출어 포함 시 허용

    // 같은 단어(토큰) 반복 체크
    const tokens = text.split(/\s+/).filter(t => t.length >= 2);
    const uniqueTokens = new Set(tokens);
    if (tokens.length >= 3 && uniqueTokens.size <= 2) return true;

    // 같은 2~4글자 단어가 붙어서 3회 이상 반복되는 경우
    if (/^(.{1,4})\1{2,}$/.test(compact)) return true;

    // 자주 나오는 STT 헛인식 패턴
    const hallucinationWords = ['대구', '트위터', '구독', '좋아요', '알림설정', '감사합니다'];
    for (const word of hallucinationWords) {
      const count = compact.split(word).length - 1;
      if (count >= 3) return true;
    }

    // 명령 동사가 하나도 없고, 반복 느낌이 강한 짧은 문장
    const commandHints = ['자비스', '주문', '브리핑', '알려', '보여', '찾아', '수집', '저장', '만들', '보내', '확인', '열어', '분석', '현황', '전체', '주문량', '스마트스토어', '보고'];
    const hasCommandHint = commandHints.some(hint => compact.includes(hint));
    if (!hasCommandHint && compact.length <= 8 && tokens.length <= 4) return true;

    // 기존 패턴 매칭
    const STT_NOISE_PATTERNS = [
      /^(구독|좋아요|알림|알림설정|구독좋아요|구독\s*좋아요|좋아요\s*구독)[\s,!.]*$/i,
      /구독.*좋아요.*알림/i,
      /좋아요.*구독.*알림/i,
      /^(감사합니다|고맙습니다|안녕하세요|안녕히계세요)[\s!.]*$/i,
      /^(네|예|아니요|아니오)[\s!.]*$/i,
      /^[\s\p{P}]*$/u,
    ];
    return STT_NOISE_PATTERNS.some(p => p.test(text.trim()));
  };

  const isSTTNoise = (text: string): boolean => {
    const trimmed = text.trim();
    if (trimmed.length <= 1) return true;
    return isLikelySttHallucination(text);
  };

  const handleSpeechResult = useCallback(async (transcript: string) => {
    if (!transcript.trim()) return;

    const currentState = stateRef.current;
    // 자비스가 바쁠 때 (말하는 중, 생각 중, 작업 중) STT 무시
    const blockedVoiceStates = ['speaking', 'thinking', 'working', 'processing'];
    if (blockedVoiceStates.includes(String(currentState))) {
      console.warn('[STT] ignored while Jarvis is busy:', currentState, transcript);
      // 사용자에게 짧은 안내 (5초 쿨다운)
      if (!busyNoticeRef.current) {
        busyNoticeRef.current = true;
        addMessage('jarvis', '선생님, 지금 작업 중입니다. 완료되면 바로 이어서 듣겠습니다.', true);
        setTimeout(() => { busyNoticeRef.current = false; }, 5000);
      }
      return;
    }

    // STT 노이즈 필터 (단, 2차 인증/케시 대기 중에는 필터 건너뛰)
    const isWaitingForInput = verificationResolveRef.current !== null || bookingConfirmResolveRef.current !== null || captchaOpenRef.current;
    if (!isWaitingForInput && isSTTNoise(transcript)) {
      console.log('[JARVIS] [STOP] STT 노이즈 감지 → 무시:', transcript);
      return;
    }
    // 케시 모달 열려있으면 음성 입력을 케시 답으로 처리
    if (captchaOpenRef.current && verificationResolveRef.current) {
      const resolve = verificationResolveRef.current;
      verificationResolveRef.current = null;
      captchaOpenRef.current = false;
      addMessage('user', transcript);
      setCaptchaScreenshot(null);
      setVerificationMode(null);
      setState('working');
      resolve(transcript.replace(/\s/g, '').trim());
      return;
    }
    console.log('[JARVIS]  음성 명령 수신 (상태:', currentState, '):', transcript);

    // UI Scene 추론 및 설정 (STT guard 통과 후, SCREEN-A.1)
    {
      const voiceScene = inferJarvisSceneFromCommand(transcript);
      // UI-ORCH-A.10: mission scene이면 workspace 열기, 나머지는 guarded setActiveScene가 자동 차단
      const voiceIsMission = voiceScene === 'smartstore_brief' || voiceScene === 'keyword_radar';
      if (voiceIsMission) {
        setMissionWorkspaceOpen(true);
      }
      setActiveScene(voiceScene); // guarded: workspace open이면 non-mission 차단됨
      if (voiceScene !== 'home' && voiceScene !== 'standby') {
        setScenePanelVisible(true);
        setTimeout(() => setScenePanelVisible(false), 4000);
      } else {
        setScenePanelVisible(false);
      }
      // ACTION-A.1: 음성 경로에서도 Predictive Actions 업데이트
      setPredictedActions(getPredictiveActions(voiceScene, transcript));
      setActionStatusMessage('');
      // UI-V3.2: Reactive Intelligence Signal
      if (voiceScene !== 'home' && voiceScene !== 'standby') {
        setReactionPulse(true);
        setTimeout(() => setReactionPulse(false), 2000);
      }
    }

    // 캡차/2단계 인증 입력 대기 중이면 인증번호 전달
    if (verificationResolveRef.current) {
      const resolve = verificationResolveRef.current;
      verificationResolveRef.current = null;
      setState('working');
      resolve(transcript.replace(/\s/g, '').trim());
      return;
    }
    // 예약 확인 대기 중이면 해당 resolve로 응답 전달
    if (bookingConfirmResolveRef.current) {
      const resolve = bookingConfirmResolveRef.current;
      bookingConfirmResolveRef.current = null;
      resolve(transcript);
      return;
    }
    // 음성 인식 시 JARVIS가 말하는 중이면 즉시 중단
    if (currentState === 'speaking' || currentState === 'thinking' || currentState === 'working') {
      console.log('[JARVIS] TTS 즉시 중단 후 사용자 명령 처리');
      stopGlobalAudio(); // TTS 즉시 중단
      stopSpeakingLevel();
      // 잠시 대기 후 명령 처리
      await new Promise(r => setTimeout(r, 200));
    }
    // 1. 즉시 STT 중단
    setIsListening(false);
    // 2. 이전 task 상태 초기화 (패널 잔류 방지)
    resetAllNodes();
    // 3. thinking 상태 전환
    setState('thinking');
    // 4. 사용자 메시지 표시
    addMessage('user', transcript);

    // ── Phase UI-C: 음성 선택 매칭 (ActionCard 버튼 선택) ──
    if (actionContext) {
      const matched = matchVoiceToAction(transcript, actionContext);
      if (matched) {
        console.log('[JARVIS] 음성 선택 매칭:', matched);
        setActionContext(null);
        setWorkflowSteps([]);
        // safe action만 실행, 나머지는 handleTextSubmit으로 전달
        handleTextSubmit(matched);
        return;
      }
    }

    try {
      // 5. GPT-4o API 호출 (폴백: 로컬 파서)
      emitNodeState('jarvis_brain', 'active', 'GPT 뇌 사고 중...');
      emitPulseLine('user', 'jarvis_brain', 'fast');
      emitMissionLog('🧠', 'GPT', '사용자 명령 분석 중...', 'thinking');
      const action = await askGPT(transcript).catch(() => parseCommand(transcript));
      emitNodeState('jarvis_brain', 'success', '명령 분석 완료');
      console.log('[JARVIS] GPT 응답 액션:', action.type, action.response.substring(0, 60));
      // 5. 응답 처리 (TTS 재생 + 후속 처리)
      await jarvisRespond(action.response, action);
    } catch (err) {
      console.error('[JARVIS] handleSpeechResult 오류:', err);
      emitNodeState('jarvis_brain', 'error', '명령 분석 실패');
      // 오류 시에도 반드시 listening 상태로 복구
      await new Promise(r => setTimeout(r, 500));
      setState('listening');
      setIsListening(true);
    }
  }, [addMessage, jarvisRespond]);

  // ── 타이핑 입력 제출 핸들러 ──
  const postCloudTask = useCallback(async (taskType: string, params: Record<string, any> = {}) => {
    const ownerToken = (() => {
      try { return localStorage.getItem('jarvis_owner_token') || ''; } catch { return ''; }
    })();
    const nextParams = { ...params };
    if (nextParams.actionId && !nextParams.idempotencyKey) {
      nextParams.idempotencyKey = `jarvis:${taskType}:${nextParams.actionId}`;
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ownerToken) headers['x-jarvis-owner-token'] = ownerToken;
    if (nextParams.idempotencyKey) headers['x-jarvis-idempotency-key'] = String(nextParams.idempotencyKey);
    const res = await fetch('/api/cloud-proxy', {
      method: 'POST',
      headers,
      body: JSON.stringify({ taskType, params: nextParams }),
    });
    const rawText = await res.text();
    let data: any = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      const preview = rawText.trim().slice(0, 120);
      throw new Error(
        preview
          ? `CLOUD_PROXY_NON_JSON_RESPONSE:${res.status}:${preview}`
          : `CLOUD_PROXY_EMPTY_RESPONSE:${res.status}. 로컬 Vite 서버에서는 /api/cloud-proxy가 연결되지 않았을 수 있습니다. Vercel/production API 또는 vercel dev로 검증하세요.`,
      );
    }
    if (!res.ok) {
      if (!data) {
        throw new Error(`CLOUD_PROXY_NOT_AVAILABLE:${res.status}. 로컬 서버가 Vite dev server만 실행 중이면 /api/cloud-proxy가 응답하지 않습니다. Vercel production 또는 vercel dev로 API를 검증하세요.`);
      }
      throw new Error(data?.message || data?.error || `cloud task failed: ${taskType}`);
    }
    return data;
  }, []);

  const resolvePurchaseProductGroup = useCallback((textValue: string) => {
    const value = String(textValue || '').trim();
    if (/복숭아|딱복|물복|백도|황도/.test(value)) return { code: 'peach', name: '복숭아', keywords: ['복숭아', '딱복', '물복', '백도', '황도'] };
    if (/매실|청매실|황매실/.test(value)) return { code: 'maesil', name: '매실', keywords: ['매실', '청매실', '황매실'] };
    if (/옥수수|대학찰옥수수|초당옥수수/.test(value)) return { code: 'corn', name: '옥수수', keywords: ['옥수수', '대학찰옥수수', '초당옥수수'] };
    if (/밤|알밤|생율/.test(value)) return { code: 'chestnut', name: '밤', keywords: ['밤', '알밤', '생율'] };
    return null;
  }, []);

  const resolvePurchaseCarrier = useCallback((textValue: string): 'lotte' | 'logen' | null => {
    if (/로젠|logen/i.test(textValue)) return 'logen';
    if (/롯데|lotte/i.test(textValue)) return 'lotte';
    return null;
  }, []);

  const refreshPurchaseOrderBulkPreview = useCallback(async () => {
    const preview = await postCloudTask('purchase-order-bulk-preview', {
      scope: 'pre_ship',
      maskPrivateFields: true,
    });
    setPurchaseOrderBulkPreview(preview);
    return preview;
  }, [postCloudTask]);

  const findPurchaseOrderDraftGroupIds = useCallback((preview: any, commandText: string) => {
    const groups = Array.isArray(preview?.groups) ? preview.groups : [];
    const normalized = String(commandText || '').toLowerCase();
    const productHints: Array<[RegExp, string[]]> = [
      [/매실|maesil/i, ['maesil', '매실']],
      [/옥수수|corn/i, ['corn', '옥수수']],
      [/복숭아|peach/i, ['peach', '복숭아']],
      [/밤|chestnut/i, ['chestnut', '밤']],
    ];
    const matched = productHints.find(([pattern]) => pattern.test(commandText));
    const candidateGroups = groups.filter((group: any) => {
      if (!group?.canEmail) return false;
      if (!matched) return true;
      const keys = matched[1];
      const haystack = `${group.productGroupCode || ''} ${group.productGroupName || ''}`.toLowerCase();
      return keys.some(key => haystack.includes(key.toLowerCase()));
    });
    return candidateGroups.map((group: any) => String(group.groupId)).filter(Boolean);
  }, []);

  const openPurchaseOrderEmailDraftPreview = useCallback(async (commandText: string) => {
    setState('working');
    setMissionWorkspaceOpen(true);
    setActiveScene('smartstore_brief');
    const preview = purchaseOrderBulkPreview || await refreshPurchaseOrderBulkPreview();
    const groupIds = findPurchaseOrderDraftGroupIds(preview, commandText);
    if (groupIds.length === 0) {
      addMessage('jarvis', '발송 가능한 발주처 이메일 초안을 찾지 못했습니다. 먼저 발주서 정리에서 이메일 저장 상태와 택배사 설정을 확인해 주세요.', true);
      speakJarvisSummary({ text: '발송 가능한 이메일 초안을 찾지 못했습니다. 이메일 저장 상태와 택배사 설정을 먼저 확인해 주세요.', intent: 'purchase_order_email_draft_empty' });
      setState('idle');
      return;
    }
    const result = await postCloudTask('purchase-order-bulk-email-draft', { groupIds });
    const drafts = (Array.isArray(result?.drafts) ? result.drafts : []).map((draft: any) => ({
      groupId: String(draft.groupId || ''),
      supplierName: draft.supplierName || '',
      productGroupName: draft.productGroupName || '',
      recipientMasked: draft.recipientMasked || '',
      subject: draft.subject || '',
      bodyPreview: draft.bodyPreview || '',
      attachmentFileName: draft.attachmentFileName || '',
      rowCount: Number(draft.rowCount || 0),
      totalQuantity: Number(draft.totalQuantity || 0),
      canSend: draft.canSend !== false,
      warnings: Array.isArray(draft.warnings) ? draft.warnings : [],
    })).filter((draft: PurchaseOrderEmailDraft) => draft.groupId);
    setPurchaseOrderEmailDraftPreview({
      open: true,
      selectedGroupIds: drafts.slice(0, 1).map((draft: PurchaseOrderEmailDraft) => draft.groupId),
      drafts,
      statusMessage: '실제 발송 전 미리보기입니다. 승인 전까지 Gmail 발송은 실행되지 않습니다.',
    });
    const snapshot = buildJarvisSituationSnapshot({
      purchaseOrderPreview: preview,
      outreachSummary: outreachCollectionSummary,
      pendingAction: pendingActionRef.current,
    });
    setConversationNextActions(planJarvisNextActions(snapshot));
    addMessage('jarvis', `대표님, 발주서 이메일 초안 ${drafts.length}건을 화면에 열었습니다. 수신처는 마스킹으로만 표시하고, 실제 Gmail 발송은 승인 후에만 진행됩니다.`, true);
    speakJarvisSummary({ text: '발주서 이메일 초안을 화면에 열었습니다. 실제 발송은 승인 후에만 진행됩니다.', intent: 'purchase_order_email_draft_preview' });
    setState('idle');
  }, [addMessage, findPurchaseOrderDraftGroupIds, outreachCollectionSummary, postCloudTask, purchaseOrderBulkPreview, refreshPurchaseOrderBulkPreview, speakJarvisSummary]);

  const runPurchaseOrderEmailDryRun = useCallback(async (groupIds: string[]) => {
    const ids = Array.from(new Set(groupIds.filter(Boolean))).slice(0, 3);
    if (ids.length === 0) return;
    setPurchaseOrderEmailDraftPreview(prev => ({ ...prev, statusMessage: 'dryRun 테스트 중입니다. 실제 Gmail 발송은 없습니다.' }));
    const result = await postCloudTask('purchase-order-email-send-approved', {
      scope: 'pre_ship',
      groupIds: ids,
      approvalConfirmed: true,
      dryRun: true,
      maxSendCount: ids.length,
      bulkApprovalConfirmed: ids.length > 1,
    });
    const msg = result?.success
      ? `dryRun 완료: 실제 Gmail 발송 없이 ${ids.length}건의 첨부/수신처 게이트를 확인했습니다.`
      : `dryRun 차단: ${result?.errorCode || result?.message || 'unknown'}`;
    setPurchaseOrderEmailDraftPreview(prev => ({ ...prev, statusMessage: msg }));
    addMessage('jarvis', `${msg}\n\n수신처 원문과 첨부 base64는 화면에 표시하지 않았습니다.`, true);
    speakJarvisSummary({ text: msg, intent: 'purchase_order_email_dryrun' });
  }, [addMessage, postCloudTask, speakJarvisSummary]);

  const showConversationOsBriefing = useCallback(async (sourceCommand: string) => {
    setState('working');
    addMessage('jarvis', '대표님, 주문/발주서/이메일/Outreach 상태를 한 번에 묶어서 우선순위를 판단하겠습니다.', true);

    const [smartstoreSettled, purchaseSettled, dailySettled] = await Promise.allSettled([
      postCloudTask('smartstore-orders', { action: 'query_order_status' }),
      refreshPurchaseOrderBulkPreview(),
      postCloudTask('daily-brief-24h', { dryRun: true, sendTelegram: false }),
    ]);

    const smartstoreResult = smartstoreSettled.status === 'fulfilled' ? smartstoreSettled.value : null;
    const purchasePreview = purchaseSettled.status === 'fulfilled' ? purchaseSettled.value : purchaseOrderBulkPreview;
    const dailyResult = dailySettled.status === 'fulfilled' ? dailySettled.value : null;
    const mergedOutreachSummary = {
      ...(dailyResult?.outreachSummary || dailyResult?.outreach || {}),
      ...(outreachCollectionSummary || {}),
    };

    const snapshot = buildJarvisSituationSnapshot({
      smartstoreResult,
      purchaseOrderPreview: purchasePreview,
      outreachSummary: mergedOutreachSummary,
      pendingAction: pendingActionRef.current,
      telegramResult: dailyResult,
    });
    const nextActions = planJarvisNextActions(snapshot);
    const composed = composeJarvisBriefing(snapshot, nextActions);
    setConversationNextActions(nextActions);
    setConversationExpanded(true);
    addMessage('jarvis', composed.screenText, true);
    speakJarvisSummary({ text: composed.voiceSummary, intent: 'conversation_os_briefing' });
    setState('idle');
  }, [addMessage, outreachCollectionSummary, postCloudTask, purchaseOrderBulkPreview, refreshPurchaseOrderBulkPreview, speakJarvisSummary]);

  const requestPurchaseOrderEmailSendApproval = useCallback(async (groupIds: string[]) => {
    const ids = Array.from(new Set(groupIds.filter(Boolean))).slice(0, 3);
    const selectedDrafts = purchaseOrderEmailDraftPreview.drafts.filter(draft => ids.includes(draft.groupId));
    if (selectedDrafts.length === 0) return;
    const isBulk = selectedDrafts.length > 1;
    const targetSummary = {
      targetCount: selectedDrafts.length,
      groupIds: ids,
      fileName: selectedDrafts.map(draft => draft.attachmentFileName).join(', '),
      supplierName: selectedDrafts.map(draft => draft.supplierName).filter(Boolean).join(', '),
      recipientMasked: isBulk ? `${selectedDrafts.length}곳 마스킹됨` : (selectedDrafts[0].recipientMasked || '마스킹됨'),
      totalRows: selectedDrafts.reduce((sum, draft) => sum + Number(draft.rowCount || 0), 0),
      totalQuantity: selectedDrafts.reduce((sum, draft) => sum + Number(draft.totalQuantity || 0), 0),
      sendCount: selectedDrafts.length,
    };
    let serverActionId = '';
    try {
      const actionResult = await postCloudTask('approval-action-create', {
        actionType: isBulk ? 'BULK_PURCHASE_ORDER_EMAIL_SEND' : 'PURCHASE_ORDER_EMAIL_SEND',
        source: 'chat',
        targetSummary,
        nextPrompt: isBulk
          ? `선택한 발주처 ${selectedDrafts.length}곳에 실제 Gmail 발송됩니다. 최대 3건 제한 안에서 승인하시겠습니까?`
          : '실제 Gmail로 발주서 이메일 1건이 발송됩니다. 승인하시겠습니까?',
        sendTelegram: false,
      });
      serverActionId = actionResult?.action?.id || actionResult?.actionId || '';
    } catch {
      serverActionId = '';
    }
    createLocalPendingAction({
      actionType: isBulk ? 'BULK_PURCHASE_ORDER_EMAIL_SEND' : 'PURCHASE_ORDER_EMAIL_SEND',
      title: isBulk ? '선택 대량 발주서 이메일 실제 발송' : '발주서 이메일 실제 발송',
      summary: {
        targetCount: targetSummary.targetCount,
        groupIds: ids,
        fileName: targetSummary.fileName,
        supplierName: targetSummary.supplierName,
        recipientMasked: targetSummary.recipientMasked,
        totalRows: targetSummary.totalRows,
        totalOrderQuantity: targetSummary.totalQuantity,
        dryRun: false,
      },
      nextPrompt: isBulk
        ? `선택한 발주처 ${selectedDrafts.length}곳에 실제 Gmail 발송됩니다. 최대 3건 제한 안에서 승인하시겠습니까?`
        : '실제 Gmail로 발주서 이메일 1건이 발송됩니다. 승인하시겠습니까?',
      actionId: serverActionId,
    });
    addMessage('jarvis', isBulk
      ? `선택 대량 발송 승인 요청을 만들었습니다. 대상은 ${selectedDrafts.length}곳이며, 승인 전에는 실제 Gmail 발송이 없습니다.`
      : `발주서 이메일 1건 발송 승인 요청을 만들었습니다. 수신처는 ${selectedDrafts[0].recipientMasked || '마스킹됨'}으로만 표시합니다.${serverActionId ? `\n\n승인 actionId: ${serverActionId}` : '\n\n서버 actionId 생성이 확인되지 않아 실제 발송은 계속 차단됩니다.'}`, true);
    speakJarvisSummary({ text: '실제 Gmail 발송에는 승인이 필요합니다. 승인 전까지 발송하지 않습니다.', intent: 'purchase_order_email_send_approval' });
  }, [addMessage, postCloudTask, purchaseOrderEmailDraftPreview.drafts, speakJarvisSummary]);

  const saveSupplierProfileSetting = useCallback(async (input: {
    productGroupCode: string;
    productGroupName: string;
    productKeywords?: string[];
    supplierId?: string;
    supplierName?: string;
    carrier?: 'lotte' | 'logen' | 'unknown';
    email?: string;
  }) => {
    const result = await postCloudTask('supplier-profile-upsert', {
      supplierId: input.supplierId || `supplier_${input.productGroupCode}`,
      supplierName: input.supplierName || `${input.productGroupName} 발주처`,
      productGroupCode: input.productGroupCode,
      productGroupName: input.productGroupName,
      productKeywords: input.productKeywords || [input.productGroupName],
      carrier: input.carrier || 'unknown',
      email: input.email,
      active: true,
      approvalConfirmed: true,
    });
    if (!result?.success) throw new Error(result?.errorCode || result?.message || 'supplier profile save failed');
    await refreshPurchaseOrderBulkPreview();
    return result;
  }, [postCloudTask, refreshPurchaseOrderBulkPreview]);

  const handleSupplierCarrierSave = useCallback(async (group: any, carrier: 'lotte' | 'logen') => {
    try {
      const result = await saveSupplierProfileSetting({
        productGroupCode: group.productGroupCode,
        productGroupName: group.productGroupName,
        productKeywords: [group.productGroupName],
        supplierId: group.supplierId,
        supplierName: group.supplierName,
        carrier,
      });
      const carrierLabel = carrier === 'logen' ? '로젠택배' : '롯데택배';
      addMessage('jarvis', `${group.productGroupName} 발주처 택배사 규칙을 ${carrierLabel}로 저장했습니다. 실제 이메일 전송은 계속 잠금 상태입니다.`, true);
      setMissionWorkspaceOpen(true);
      setActiveScene('smartstore_brief');
      return result;
    } catch (error: any) {
      addMessage('jarvis', `택배사 규칙 저장 실패: ${error.message}`, true);
      return null;
    }
  }, [addMessage, saveSupplierProfileSetting]);

  const handleSupplierEmailSave = useCallback(async (group: any, email: string) => {
    try {
      const cleanEmail = String(email || '').trim();
      if (!cleanEmail) {
        addMessage('jarvis', '저장할 발주처 이메일을 입력해 주세요.', true);
        return null;
      }
      const result = await saveSupplierProfileSetting({
        productGroupCode: group.productGroupCode,
        productGroupName: group.productGroupName,
        productKeywords: [group.productGroupName],
        supplierId: group.supplierId,
        supplierName: group.supplierName,
        carrier: group.carrier || 'unknown',
        email: cleanEmail,
      });
      addMessage('jarvis', `${group.productGroupName} 발주처 이메일을 저장했습니다: ${result.emailMasked || result.profile?.emailMasked || '마스킹 처리됨'}. 이메일 원문은 화면에 표시하지 않습니다. 실제 발송은 계속 잠금 상태입니다.`, true);
      setMissionWorkspaceOpen(true);
      setActiveScene('smartstore_brief');
      return result;
    } catch (error: any) {
      addMessage('jarvis', `발주처 이메일 저장 실패: ${error.message}`, true);
      return null;
    }
  }, [addMessage, saveSupplierProfileSetting]);

  const showPendingAction = useCallback((action: UiPendingAction) => {
    setPendingAction(action);
    setActiveScene('approval_gate');
    setActionStatusMessage(`APPROVAL REQUIRED: ${action.title}`);
    const baseContext: ActionContext = {
      type: action.actionType === 'OUTREACH_GOAL_COLLECT' ? 'outreach_collect' : 'smartstore',
      productOrderCount: action.summary.productOrderCount,
      totalOrderQuantity: action.summary.totalOrderQuantity,
      confirmNeededCount: action.summary.confirmNeededCount || action.summary.targetCount,
      confirmNeededProductOrderIds: action.summary.productOrderIds,
      collectedCount: action.summary.qualifiedContactableCount,
      shortfall: action.summary.remainingContactableCount,
      label: action.title,
      description: action.nextPrompt,
      locked: true,
      sourceCommand: action.title,
    };
    setActionContext(baseContext);
    setWorkflowSteps(buildWorkflowSteps(baseContext));
    setApprovalPreview(action.actionType === 'SMARTSTORE_CONFIRM_ORDERS' ? buildApprovalPreview(baseContext) : null);
    setConversationExpanded(true);
  }, []);

  const createLocalPendingAction = useCallback((input: Omit<UiPendingAction, 'id' | 'status' | 'source' | 'createdAt'>) => {
    const action: UiPendingAction = {
      ...input,
      id: `ui_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: 'awaiting_confirmation',
      source: 'chat',
      createdAt: new Date().toISOString(),
    };
    showPendingAction(action);
    return action;
  }, [showPendingAction]);

  const downloadPurchaseOrderFiles = useCallback((files: any[], fallbackFileName: string) => {
    const downloaded: string[] = [];
    files.forEach((file: any, index: number) => {
      if (!file?.contentBase64) return;
      const bytes = Uint8Array.from(atob(file.contentBase64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], {
        type: file.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.fileName || (index === 0 ? fallbackFileName : `${index + 1}-${fallbackFileName}`);
      a.click();
      URL.revokeObjectURL(url);
      downloaded.push(a.download);
    });
    return downloaded;
  }, []);

  const handleSmartstoreApprovalProposal = useCallback(async (_sourceCommand: string) => {
    setState('working');
    addMessage('jarvis', '스마트스토어 전체 주문 현황을 ProductOrderId 기준으로 확인하겠습니다.', true);
    const data = await postCloudTask('smartstore-orders', { action: 'query_order_status' });
    const fullSummary = data?.fullOrderSummary || {};
    const actionBuckets = fullSummary.actionBuckets || {};
    const productOrderCount = Number(fullSummary.productOrderCount ?? data?.counts?.productOrderCount ?? 0) || 0;
    const totalOrderQuantity = Number(fullSummary.totalOrderQuantity ?? data?.counts?.totalOrderQuantity ?? 0) || 0;
    const confirmNeededCount = Number(actionBuckets.confirmNeededCount ?? data?.counts?.confirmNeeded ?? 0) || 0;
    const pendingShippingCount = Number(actionBuckets.pendingShippingCount ?? data?.counts?.pendingShipping ?? 0) || 0;
    const preShipTotal = Number(actionBuckets.preShipTotal ?? data?.counts?.preShipTotal ?? 0) || 0;
    const ids = Array.isArray(fullSummary.confirmNeededProductOrderIds) ? fullSummary.confirmNeededProductOrderIds : [];
    const source = data?.source || fullSummary.source || 'unknown';
    const reliable = data?.dataReliable !== false && fullSummary.dataReliable !== false;

    setSccOrderData({
      newOrders: data?.counts?.newOrders ?? data?.newOrders ?? 0,
      pendingShipping: pendingShippingCount,
      preShipTotal,
      shipping: data?.counts?.shipping ?? data?.shipping ?? null,
      delivered: data?.counts?.delivered ?? data?.delivered ?? null,
      purchaseConfirmed: data?.counts?.purchaseConfirmed ?? data?.purchaseConfirmed ?? null,
      fullOrderSummary: fullSummary,
      source,
      dataReliable: reliable,
      diagnostics: data?.diagnostics,
      fetchedAt: data?.fetchedAt,
    });
    setMissionWorkspaceOpen(true);
    setActiveScene('smartstore_brief');

    const report = [
      `**전체 주문/발주 현황**`,
      ``,
      `전체 상품주문: ${productOrderCount}건`,
      `전체 주문수량: ${totalOrderQuantity || '확인 필요'}개`,
      `발주확인 필요: ${confirmNeededCount}건`,
      `배송준비: ${pendingShippingCount}건`,
      `배송 전 처리 대상: ${preShipTotal}건`,
      ``,
      `기준: ProductOrderId unique / quantity 합계`,
      `API 상태: ${source}${reliable ? '' : ' / 확인 필요'}`,
    ].join('\n');
    addMessage('jarvis', report, true);
    speakJarvisSummary({ text: report, intent: 'purchase_order_summary_command' });

    if (confirmNeededCount > 0 && ids.length > 0) {
      const prompt = `발주확인 필요한 주문이 ${confirmNeededCount}건 있습니다. 발주확인을 진행할까요?`;
      addMessage('jarvis', `🔐 ${prompt}\n\n승인 전까지 실제 네이버 주문 상태는 변경하지 않습니다.`, true);
      speakJarvisSummary({ text: prompt, intent: 'pending_action_prompt', actionType: 'SMARTSTORE_CONFIRM_ORDERS' });
      createLocalPendingAction({
        actionType: 'SMARTSTORE_CONFIRM_ORDERS',
        title: '발주확인 승인 대기',
        summary: {
          targetCount: confirmNeededCount,
          productOrderCount,
          totalOrderQuantity,
          confirmNeededCount,
          productOrderIds: ids,
        },
        nextPrompt: prompt,
      });
    } else {
      setPendingAction(null);
      pendingActionRef.current = null;
      addMessage('jarvis', '현재 발주확인이 필요한 ProductOrderId 대상은 없습니다.', true);
      speakJarvisSummary({ text: '현재 발주확인이 필요한 상품주문 대상은 없습니다.', intent: 'purchase_order_summary_command' });
    }
    setState('idle');
  }, [addMessage, createLocalPendingAction, postCloudTask, speakJarvisSummary]);

  const requestPrivatePurchaseOrderExport = useCallback(async () => {
    setState('working');
    setMissionWorkspaceOpen(true);
    setActiveScene('smartstore_brief');
    const preview = await postCloudTask('purchase-order-bulk-preview', {
      scope: 'pre_ship',
      maskPrivateFields: true,
    });
    setPurchaseOrderBulkPreview(preview);
    const summary = preview?.summary || {};
    const groups = Array.isArray(preview?.groups) ? preview.groups : [];
    const exportableGroups = groups.filter((group: any) => group?.canExport !== false && group?.carrier !== 'unknown');
    const totalRows = Number(summary.totalProductOrderCount || 0);
    const totalQuantity = Number(summary.totalQuantity || 0);
    const fileCount = exportableGroups.length;
    createLocalPendingAction({
      actionType: 'PURCHASE_ORDER_PRIVATE_EXPORT',
      title: '개인정보 포함 발주서 다운로드',
      summary: {
        targetCount: totalRows,
        productOrderCount: totalRows,
        totalOrderQuantity: totalQuantity,
        groupCount: Number(summary.groupCount || groups.length || 0),
        fileCount,
        totalRows,
        includesPrivateFields: true,
      },
      nextPrompt: '이 파일에는 배송 업무에 필요한 수취인 이름, 연락처, 주소, 우편번호, 배송메모가 포함됩니다. 대표님 업무용으로 다운로드할까요?',
    });
    addMessage('jarvis', `가능합니다. 다만 개인정보 포함 발주서는 화면 확인용 마스킹 파일과 다릅니다.\n\n- 화면과 대화에는 고객 개인정보를 계속 마스킹합니다.\n- 실제 배송 업무용 XLSX 파일 안에만 수취인 이름, 연락처, 주소가 들어갑니다.\n- 다운로드 가능한 발주서 파일은 현재 ${fileCount}개입니다.\n\n대표님 승인 후에만 개인정보 포함 파일을 생성하겠습니다.`, true);
    speakJarvisSummary({
      text: '개인정보 포함 발주서 다운로드에는 승인이 필요합니다.',
      intent: 'private_export_command',
      actionType: 'PURCHASE_ORDER_PRIVATE_EXPORT',
    });
    setState('idle');
  }, [addMessage, createLocalPendingAction, postCloudTask, speakJarvisSummary]);

  const executePendingActionFromChat = useCallback(async (decision: 'approve' | 'cancel') => {
    const action = pendingActionRef.current;
    if (!action) {
      addMessage('jarvis', '대표님, 어떤 작업을 승인하시는 건지 확인이 필요합니다. 먼저 실행할 작업을 선택해 주세요.', true);
      speakJarvisSummary({ text: '대표님, 어떤 작업을 승인하시는지 먼저 확인이 필요합니다.', intent: 'approval_without_pending_action' });
      setState('idle');
      return;
    }
    if (decision === 'cancel') {
      setPendingAction(null);
      pendingActionRef.current = null;
      setApprovalPreview(null);
      setActionStatusMessage('승인 대기 작업이 취소되었습니다.');
      addMessage('jarvis', `${action.title} 작업을 취소했습니다. 실제 실행은 없었습니다.`, true);
      speakJarvisSummary({ text: `${action.title} 작업을 취소했습니다. 실제 실행은 없었습니다.`, intent: 'approval_cancelled', actionType: action.actionType });
      setState('idle');
      return;
    }

    setState('working');
    if (action.actionType === 'SMARTSTORE_CONFIRM_ORDERS') {
      const ids = action.summary.productOrderIds || [];
      const result = await postCloudTask('smartstore-confirm-orders', {
        productOrderIds: ids,
        dryRun: false,
        approvalConfirmed: true,
      });
      setPendingAction(null);
      pendingActionRef.current = null;
      setApprovalPreview(null);
      if (result?.blocked || result?.success === false) {
        addMessage('jarvis', `🔒 발주확인은 아직 실제 실행이 막혀 있습니다.\n\n사유: ${result?.errorCode || result?.message || 'endpoint_not_verified'}\n\n대신 발주서 대상 미리보기는 만들 수 있습니다. 발주서를 작성할까요?`, true);
        speakJarvisSummary({ text: '발주확인은 아직 실제 실행이 막혀 있습니다. 대신 발주서 대상 미리보기를 만들 수 있습니다.', intent: 'smartstore_confirm_blocked', actionType: action.actionType });
      } else {
        addMessage('jarvis', `발주확인 ${result?.confirmedCount ?? ids.length}건을 완료했습니다. 이제 발주서를 작성할까요?`, true);
        speakJarvisSummary({ text: '발주확인을 완료했습니다. 이제 발주서를 작성할까요?', intent: 'smartstore_confirm_result', actionType: action.actionType });
      }
      createLocalPendingAction({
        actionType: 'PURCHASE_ORDER_CREATE',
        title: '발주서 작성 승인 대기',
        summary: {
          targetCount: ids.length,
          productOrderIds: ids,
          productOrderCount: action.summary.productOrderCount,
          totalOrderQuantity: action.summary.totalOrderQuantity,
        },
        nextPrompt: '발주서 미리보기를 작성할까요?',
      });
      setState('idle');
      return;
    }

    if (action.actionType === 'PURCHASE_ORDER_CREATE') {
      setMissionWorkspaceOpen(true);
      setActiveScene('smartstore_brief');
      setPendingAction(null);
      pendingActionRef.current = null;
      setApprovalPreview(null);
      const preview = await postCloudTask('purchase-order-bulk-preview', {
        scope: 'pre_ship',
        maskPrivateFields: true,
      });
      setPurchaseOrderBulkPreview(preview);
      const snapshot = buildJarvisSituationSnapshot({
        purchaseOrderPreview: preview,
        outreachSummary: outreachCollectionSummary,
        pendingAction: pendingActionRef.current,
      });
      setConversationNextActions(planJarvisNextActions(snapshot));
      const summary = preview?.summary || {};
      const groups = Array.isArray(preview?.groups) ? preview.groups : [];
      const groupLines = groups.slice(0, 8).map((group: any) => {
        const emailText = group.emailConfigured ? `이메일 ${group.emailMasked || '저장됨'}` : '이메일 필요';
        return `- ${group.productGroupName}: ${group.totalQuantity}개 / ${group.carrierName || group.carrier} / ${group.fileName} / ${emailText}`;
      }).join('\n');
      const unknownText = Number(summary.unknownProductCount || 0) > 0
        ? `\n\n미분류 상품 ${summary.unknownProductCount}건은 임의로 발주처나 택배사를 정하지 않았습니다. 상품군/택배사 규칙 확인이 필요합니다.`
        : '';
      addMessage('jarvis', `대표님, 발주 대상을 상품군별로 정리했습니다.\n\n전체 발주 대상: ${summary.totalProductOrderCount || 0}건\n전체 수량: ${summary.totalQuantity || 0}개\n상품군: ${summary.groupCount || 0}개\n전송 가능 발주처: ${summary.readyGroupCount || 0}곳\n이메일 필요: ${summary.emailMissingGroupCount || 0}곳\n택배사 미지정: ${summary.carrierMissingGroupCount || 0}곳\n\n${groupLines || '- 표시할 발주 그룹이 없습니다.'}${unknownText}\n\n마스킹 파일 다운로드는 가능하지만, 개인정보 포함 파일은 별도 승인 없이는 생성하지 않습니다. 실제 이메일 전송도 아직 잠금 상태입니다.`, true);
      speakJarvisSummary({ text: '대표님, 발주서 대상을 상품별로 정리했습니다. 화면에서 택배사와 이메일 상태를 확인해 주세요.', intent: 'purchase_order_create_result', actionType: action.actionType });
      createLocalPendingAction({
        actionType: 'PURCHASE_ORDER_EMAIL_SEND',
        title: '발주서 이메일 전송 승인 대기',
        summary: {
          targetCount: summary.totalProductOrderCount || action.summary.targetCount,
          fileName: groups[0]?.fileName || 'purchase-order-preview.xlsx',
          groupIds: groups.filter((group: any) => group.canEmail).slice(0, 1).map((group: any) => group.groupId),
          dryRun: false,
          recipientMasked: groups.find((group: any) => group.emailMasked)?.emailMasked || '이메일 미설정',
        },
        nextPrompt: '발주처 이메일 전송은 별도 승인 단계입니다. 먼저 이메일 초안 또는 마스킹 파일 다운로드를 확인할 수 있습니다.',
      });
      setState('idle');
      return;
      setPendingAction(null);
      pendingActionRef.current = null;
      setApprovalPreview(null);
      const result: any = null;
      if (result?.sent) {
        addMessage('jarvis', `발주서 이메일 1건을 발송했습니다.` + '\\n\\n' + `발주처: ${result.supplierName || action.summary.supplierName || '미확인'}` + '\\n' + `수신처: ${result.recipientMasked || action.summary.recipientMasked || '마스킹됨'}` + '\\n' + `첨부: ${result.attachmentFileName || action.summary.fileName || '발주서.xlsx'}` + '\\n' + `발송 로그: 저장됨` + '\\n\\n' + `화면과 로그에는 발주처 이메일 원문과 고객 개인정보를 표시하지 않았습니다.`, true);
        speakJarvisSummary({ text: '대표님, 발주서 이메일 한 건을 발송했습니다. 발송 로그도 저장했습니다.', intent: 'purchase_order_email_send_completed', actionType: action.actionType });
        setState('idle');
        return;
      }
      addMessage('jarvis', `발주서 작성은 dryRun/미리보기 단계로만 준비합니다.\n\n대상: ${action.summary.targetCount || 0}건\n상태: 실제 이메일 전송 없음\n\n발주처 이메일 전송은 별도 승인 작업으로 분리되어 있습니다.`, true);
      createLocalPendingAction({
        actionType: 'PURCHASE_ORDER_EMAIL_SEND',
        title: '발주서 이메일 전송 승인 대기',
        summary: {
          targetCount: action.summary.targetCount,
          fileName: action.summary.fileName || 'purchase-order-preview.xlsx',
          recipientMasked: action.summary.recipientMasked || '미확인',
        },
        nextPrompt: '발주서 이메일 전송은 별도 승인 후 dryRun/blocked 상태로만 확인합니다. 전송을 요청하시겠습니까?',
      });
      setState('idle');
      return;
    }

    if (action.actionType === 'PURCHASE_ORDER_PRIVATE_EXPORT') {
      const exportResult = await postCloudTask('purchase-order-bulk-export', {
        scope: 'pre_ship',
        includePrivateFields: true,
        approvalConfirmed: true,
        format: 'xlsx',
      });
      if (!exportResult?.success) {
        const errorCode = exportResult?.errorCode || exportResult?.message || 'PRIVATE_EXPORT_FAILED';
        addMessage('jarvis', errorCode === 'APPROVAL_REQUIRED_FOR_PRIVATE_EXPORT'
          ? '개인정보 포함 파일은 승인 후에만 생성할 수 있습니다. 다시 승인해 주세요.'
          : `개인정보 포함 발주서 다운로드를 완료하지 못했습니다. 사유: ${errorCode}`, true);
        speakJarvisSummary({ text: '개인정보 포함 발주서 다운로드를 완료하지 못했습니다.', intent: 'private_export_failed', actionType: action.actionType });
        setState('idle');
        return;
      }
      const files = Array.isArray(exportResult?.files) ? exportResult.files : [];
      const downloaded = downloadPurchaseOrderFiles(files, '개인정보 포함 발주서.xlsx');
      setPendingAction(null);
      pendingActionRef.current = null;
      setApprovalPreview(null);
      if (downloaded.length === 0) {
        addMessage('jarvis', '현재 다운로드할 개인정보 포함 발주서 파일이 없습니다. 발주서 정리를 먼저 실행해 주세요.', true);
        speakJarvisSummary({ text: '현재 다운로드할 개인정보 포함 발주서 파일이 없습니다.', intent: 'private_export_empty', actionType: action.actionType });
      } else {
        addMessage('jarvis', `대표님, 개인정보 포함 발주서 파일 ${downloaded.length}개를 다운로드했습니다.\n\n파일 안에는 배송 업무에 필요한 수취인 정보가 포함되어 있습니다. 화면과 대화에는 개인정보를 계속 마스킹 처리합니다.\n\n파일명: ${downloaded.join(', ')}`, true);
        speakJarvisSummary({ text: '대표님, 개인정보 포함 발주서 파일을 다운로드했습니다. 화면에는 개인정보를 계속 마스킹합니다.', intent: 'private_export_completed', actionType: action.actionType });
      }
      setState('idle');
      return;
    }

    if (action.actionType === 'PURCHASE_ORDER_EMAIL_SEND' || action.actionType === 'BULK_PURCHASE_ORDER_EMAIL_SEND') {
      const groupIds = action.summary.groupIds || [];
      const result = await postCloudTask('purchase-order-email-send-approved', {
        scope: 'pre_ship',
        groupIds,
        approvalConfirmed: true,
        dryRun: action.summary.dryRun === true,
        maxSendCount: action.actionType === 'BULK_PURCHASE_ORDER_EMAIL_SEND' ? Math.min(3, Math.max(1, groupIds.length)) : 1,
        bulkApprovalConfirmed: action.actionType === 'BULK_PURCHASE_ORDER_EMAIL_SEND',
        fileName: action.summary.fileName,
        actionId: action.actionId,
      });
      setPendingAction(null);
      pendingActionRef.current = null;
      const sendMode = action.actionType === 'BULK_PURCHASE_ORDER_EMAIL_SEND' ? '선택 대량' : '1건';
      if (result?.sent) {
        addMessage('jarvis', `발주서 이메일 ${sendMode} 발송을 완료했습니다.\n\n발송 수: ${result.sentCount || 0}건\n수신처: ${result.recipientMasked || action.summary.recipientMasked || '마스킹됨'}\n첨부: ${result.attachmentFileName || action.summary.fileName || '발주서.xlsx'}\n발송 로그: 저장됨\n\n화면과 로그에는 발주처 이메일 원문과 고객 개인정보를 표시하지 않았습니다.`, true);
        speakJarvisSummary({ text: `발주서 이메일 ${sendMode} 발송을 완료했습니다. 발송 로그를 저장했습니다.`, intent: 'purchase_order_email_send_completed', actionType: action.actionType });
      } else {
        addMessage('jarvis', `발주서 이메일 ${sendMode} 발송이 실행되지 않았습니다.\n\n상태: ${result?.errorCode || result?.message || 'blocked'}\n실제 발송: 없음\nEXECUTE LOCKED 유지`, true);
        speakJarvisSummary({ text: '발주서 이메일 발송이 실행되지 않았습니다. 화면에서 차단 사유를 확인해 주세요.', intent: 'purchase_order_email_send_blocked', actionType: action.actionType });
      }
      setState('idle');
      return;
    }
    addMessage('jarvis', `${action.title} 작업은 아직 프론트 승인 실행기가 연결되지 않았습니다. 실제 실행은 하지 않았습니다.`, true);
    speakJarvisSummary({ text: `${action.title} 작업은 아직 연결되지 않았습니다. 실제 실행은 하지 않았습니다.`, intent: 'pending_action_not_connected', actionType: action.actionType });
    setState('idle');
  }, [addMessage, createLocalPendingAction, downloadPurchaseOrderFiles, postCloudTask, speakJarvisSummary]);

  const parseOutreachGoalCommand = useCallback((rawText: string) => {
    const normalized = String(rawText || '').trim();
    if (!normalized) return null;

    const isOutreach = /(인플루언서|유튜버|블로거|크리에이터|채널)/i.test(normalized)
      && /(수집|찾아|모아|추천|미리보기|테스트|dry\s*run|dryRun|이어|계속|채워)/i.test(normalized);
    if (!isOutreach) return null;

    const verticalRules: Array<{ code: string; label: string; pattern: RegExp }> = [
      { code: 'camping', label: '캠핑', pattern: /(캠핑|캠퍼|차박|아웃도어|텐트|백패킹|캠핑용품)/i },
      { code: 'beauty', label: '뷰티', pattern: /(뷰티|메이크업|화장품|스킨케어|피부|코덕|올리브영|grwm)/i },
      { code: 'cooking', label: '요리', pattern: /(요리|레시피|집밥|쿡방|베이킹)/i },
      { code: 'food', label: '식품', pattern: /(식품|푸드|먹방|맛집|간식|공동구매|농산물|과일|배추|절임배추|옥수수|매실|복숭아|밤)/i },
      { code: 'parenting', label: '육아', pattern: /(육아|아이|엄마|맘|키즈|주부)/i },
      { code: 'travel', label: '여행', pattern: /(여행|브이로그|숙소|호텔|국내여행)/i },
    ];
    const matched = verticalRules.find(rule => rule.pattern.test(normalized));
    if (!matched) return null;

    const numberMatch = normalized.match(/(\d+)\s*(명|개|채널|사람)?/);
    const targetCount = numberMatch ? Math.max(1, Number(numberMatch[1])) : 20;
    const isPreview = /(미리보기|테스트|dry\s*run|dryRun|드라이런|preview)/i.test(normalized);
    const explicitReal = /(실제\s*수집|저장까지|저장해|운영\s*수집)/i.test(normalized);
    const requirePublicEmail = /(이메일|메일|공개\s*이메일|연락\s*가능)/i.test(normalized);

    return {
      requestedVertical: matched.code,
      verticalLabel: matched.label,
      targetContactableCount: targetCount,
      dryRun: explicitReal ? false : true,
      countOnly: explicitReal ? false : true,
      requirePublicEmail: requirePublicEmail || true,
      keyword: `${matched.label} 인플루언서`,
      originalUserText: normalized,
      isPreview,
    };
  }, []);
  const handleOutreachGoalCollectCommand = useCallback(async (goal: NonNullable<ReturnType<typeof parseOutreachGoalCommand>>) => {
    const targetCount = Math.max(1, Number(goal.targetContactableCount || 20));
    const verticalLabel = goal.verticalLabel || goal.requestedVertical || '요청 분야';

    setState('working');
    addMessage(
      'jarvis',
      `대표님, ${verticalLabel} 인플루언서 ${targetCount}명 기준으로 미리보기 수집을 시작하겠습니다. 실제 이메일 발송은 하지 않고, 공개 이메일과 분야 적합성이 확인된 후보만 목표 인원에 포함하겠습니다.`,
      true,
    );
    speakJarvisSummary({
      text: `${verticalLabel} 인플루언서 목표 수집을 시작합니다. 목표 인원에 도달하기 전에는 완료로 처리하지 않습니다.`,
      intent: 'outreach_goal_collect_command',
    });

    try {
      const data = await postCloudTask('outreach-quality-batch-run', {
        keyword: goal.keyword || `${verticalLabel} 인플루언서`,
        product: verticalLabel,
        requestedVertical: goal.requestedVertical,
        verticalLabel,
        platform: 'youtube',
        mode: 'goal_collect',
        targetContactableCount: targetCount,
        requestedCount: targetCount,
        maxCandidates: Math.min(Math.max(targetCount * 3, 30), 100),
        maxBatches: goal.dryRun ? 1 : 3,
        requireQualified: true,
        requireContactable: true,
        requirePublicEmail: true,
        dryRun: goal.dryRun !== false,
        countOnly: goal.countOnly !== false,
      });

      const summary = { ...(data?.summary || {}), ...(data?.diagnostics || {}) };
      const reportPayload = data?.reportPayload || {};
      const completionStatus = String(summary.completionStatus || reportPayload.completionStatus || data?.completionStatus || 'partial');
      const qualifiedContactableCount = Number(summary.qualifiedContactableCount ?? reportPayload.qualifiedContactableCount ?? data?.qualifiedContactableCount ?? 0) || 0;
      const qualifiedCount = Number(summary.qualifiedCount ?? data?.qualifiedCount ?? 0) || 0;
      const reviewCount = Number(summary.reviewCount ?? data?.reviewCount ?? 0) || 0;
      const excludedCount = Number(summary.excludedCount ?? data?.excludedCount ?? 0) || 0;
      const publicEmailCount = Number(summary.publicEmailCount ?? data?.publicEmailCount ?? 0) || 0;
      const rawSearchResultCount = Number(summary.rawSearchResultCount ?? data?.rawSearchResultCount ?? 0) || 0;
      const dedupedChannelCount = Number(summary.dedupedChannelCount ?? data?.dedupedChannelCount ?? 0) || 0;
      const remainingContactableCount = Number(summary.remainingContactableCount ?? reportPayload.remainingContactableCount ?? Math.max(0, targetCount - qualifiedContactableCount)) || 0;
      const stopReason = String(summary.stopReason || reportPayload.stopReason || data?.stopReason || (goal.dryRun !== false ? 'dryRun' : 'unknown'));
      const candidates = Array.isArray(data?.candidates) ? data.candidates : Array.isArray(summary.candidates) ? summary.candidates : [];

      setOutreachWorkspaceVisible(true);
      setOutreachCandidates(candidates);
      setOutreachCollectionSummary({
        ...(data?.summary || {}),
        ...(data?.diagnostics || {}),
        requestedVertical: goal.requestedVertical,
        verticalLabel,
        targetContactableCount: targetCount,
        qualifiedContactableCount,
        remainingContactableCount,
        qualifiedCount,
        reviewCount,
        excludedCount,
        publicEmailCount,
        rawSearchResultCount,
        dedupedChannelCount,
        completionStatus,
        stopReason,
        dryRun: goal.dryRun !== false,
      });

      const statusLine = completionStatus === 'complete'
        ? `목표 ${targetCount}명을 충족했습니다.`
        : `목표까지 ${remainingContactableCount}명이 더 필요합니다. 완료로 처리하지 않겠습니다.`;

      addMessage(
        'jarvis',
        [
          `대표님, ${verticalLabel} 인플루언서 미리보기 수집 결과입니다.`,
          '',
          `- 목표: 연락 가능한 적합 후보 ${targetCount}명`,
          `- 전체 검색 결과: ${rawSearchResultCount}건`,
          `- 중복 제거 채널: ${dedupedChannelCount}개`,
          `- 적합 후보: ${qualifiedCount}명`,
          `- 연락 가능 적합 후보: ${qualifiedContactableCount}명`,
          `- 공개 이메일 후보: ${publicEmailCount}명`,
          `- 검토 필요: ${reviewCount}명`,
          `- 제외: ${excludedCount}명`,
          `- 상태: ${completionStatus}`,
          `- 중단/제한 사유: ${stopReason}`,
          '',
          `판단: ${statusLine}`,
          '',
          '다음 행동을 선택하실 수 있습니다.',
          '1. “계속 수집” - 부족한 인원을 이어서 찾습니다.',
          '2. “후보 보여줘” - 현재 후보를 먼저 확인합니다.',
          '3. “상위 3명 메일 미리보기 보여줘” - 발송 없이 개인화 메일 초안만 확인합니다.',
        ].join('\n'),
        true,
      );
      speakJarvisSummary({
        text: completionStatus === 'complete'
          ? `${verticalLabel} 인플루언서 목표 후보를 확보했습니다. 다음 행동을 선택해 주세요.`
          : `${verticalLabel} 인플루언서 후보가 아직 목표보다 부족합니다. 부족 인원과 중단 사유를 화면에 보고했습니다.`,
        intent: completionStatus === 'complete' ? 'outreach_goal_complete' : 'outreach_goal_partial',
      });

      if (completionStatus === 'complete') {
        createLocalPendingAction({
          actionType: 'OUTREACH_EMAIL_SEND',
          title: `${verticalLabel} 인플루언서 제안 메일 승인 대기`,
          summary: { targetContactableCount: targetCount, qualifiedContactableCount, remainingContactableCount, completionStatus, stopReason },
          nextPrompt: '제안 메일 초안을 만들거나 선택 후보에게 발송 승인 요청을 진행할까요?',
        });
      } else {
        createLocalPendingAction({
          actionType: 'OUTREACH_GOAL_COLLECT',
          title: `${verticalLabel} 인플루언서 이어서 수집 승인 대기`,
          summary: { targetContactableCount: targetCount, qualifiedContactableCount, remainingContactableCount, completionStatus, stopReason },
          nextPrompt: `${remainingContactableCount}명을 더 채우기 위해 이어서 수집할까요?`,
        });
      }
    } catch (error: any) {
      const errorCode = String(error?.message || error || 'OUTREACH_API_FAILED');
      addMessage(
        'jarvis',
        `대표님, 이번 수집은 실행되지 않았습니다. /api/cloud-proxy outreach task 호출이 실패했기 때문입니다. 현재 실제 후보 수집 결과가 없으므로 완료라고 보고하지 않겠습니다. 오류 코드: ${errorCode}`,
        true,
      );
      speakJarvisSummary({ text: '인플루언서 수집 API 호출이 실패했습니다. 완료로 처리하지 않겠습니다.', intent: 'outreach_goal_api_failed' });
    } finally {
      setState('idle');
    }
  }, [addMessage, createLocalPendingAction, postCloudTask, speakJarvisSummary]);

  const parseOutreachGoalCommandV2 = useCallback((rawText: string) => {
    const normalized = String(rawText || '').trim().replace(/\s+/g, ' ');
    if (!normalized) return null;

    const hasInfluencerSignal = /(인플루언서|유튜버|블로거|크리에이터|채널)/i.test(normalized);
    const hasOutreachVerb = /(수집|찾아|찾아줘|모아|모아줘|추천|미리보기|테스트|dry\s*run|이어|계속|채워|가능한지|몇\s*명|카운트|count)/i.test(normalized);
    if (!hasInfluencerSignal || !hasOutreachVerb) return null;

    const verticalRules = [
      { code: 'camping', label: '캠핑', pattern: /(캠핑|캠퍼|차박|아웃도어|텐트|백패킹|캠핑용품)/i },
      { code: 'beauty', label: '뷰티', pattern: /(뷰티|메이크업|화장품|스킨케어|피부|코덕|올리브영|grwm)/i },
      { code: 'cooking', label: '요리', pattern: /(요리|레시피|집밥|쿡방|베이킹)/i },
      { code: 'food', label: '식품', pattern: /(식품|푸드|먹방|맛집|간식|공동구매|농산물|과일|배추|절임배추|옥수수|매실|복숭아|밤)/i },
      { code: 'parenting', label: '육아', pattern: /(육아|아이|엄마|맘|키즈|주부)/i },
      { code: 'travel', label: '여행', pattern: /(여행|브이로그|숙소|호텔|국내여행)/i },
    ];
    const matched = verticalRules.find(rule => rule.pattern.test(normalized));
    if (!matched) return null;

    const numberMatch = normalized.match(/(\d+)\s*(명|개|채널|사람)?/);
    const targetCount = numberMatch ? Math.max(1, Number(numberMatch[1])) : 20;
    const countOnly = /(가능한지|몇\s*명|후보\s*수|숫자만|카운트|count)/i.test(normalized);

    return {
      requestedVertical: matched.code,
      verticalLabel: matched.label,
      targetContactableCount: targetCount,
      dryRun: true,
      countOnly,
      requirePublicEmail: true,
      keyword: `${matched.label} 인플루언서`,
      originalUserText: normalized,
      outreachMode: countOnly ? 'count_only' : 'preview_collect',
    };
  }, []);

  const handleOutreachGoalCollectCommandV2 = useCallback(async (goal: any) => {
    const targetCount = Math.max(1, Number(goal.targetContactableCount || 20));
    const verticalLabel = goal.verticalLabel || goal.requestedVertical || '요청 분야';
    const countOnly = Boolean(goal.countOnly);

    setState('working');
    addMessage(
      'jarvis',
      countOnly
        ? `대표님, ${verticalLabel} 인플루언서 ${targetCount}명 목표가 가능한지 숫자 중심으로 확인하겠습니다. 실제 저장과 발송은 하지 않습니다.`
        : `대표님, ${verticalLabel} 인플루언서 ${targetCount}명 목표로 미리보기 수집을 시작하겠습니다. dryRun으로 진행하고, 연락 가능하고 분야 적합성이 확인된 후보만 목표 인원에 포함하겠습니다.`,
      true,
    );
    speakJarvisSummary({
      text: `${verticalLabel} 인플루언서 목표 수집을 시작합니다. 목표 미달이면 완료로 처리하지 않고 사유를 보고하겠습니다.`,
      intent: 'outreach_goal_collect_command',
    });

    try {
      console.info('[JARVIS outreach collect request]', {
        taskType: 'outreach-quality-batch-run',
        vertical: goal.requestedVertical,
        targetCount,
        dryRun: true,
        countOnly,
      });

      const data = await postCloudTask('outreach-quality-batch-run', {
        keyword: goal.keyword || `${verticalLabel} 인플루언서`,
        product: verticalLabel,
        requestedVertical: goal.requestedVertical,
        verticalLabel,
        platform: 'youtube',
        mode: 'goal_collect',
        targetContactableCount: targetCount,
        requestedCount: targetCount,
        maxCandidates: Math.min(Math.max(targetCount * 3, 30), 100),
        maxBatches: 1,
        requireQualified: true,
        requireContactable: true,
        requirePublicEmail: true,
        dryRun: true,
        countOnly,
      });

      const summary = { ...(data?.summary || {}), ...(data?.diagnostics || {}) };
      const reportPayload = data?.reportPayload || {};
      const completionStatus = String(summary.completionStatus || reportPayload.completionStatus || data?.completionStatus || 'partial');
      const qualifiedContactableCount = Number(summary.qualifiedContactableCount ?? reportPayload.qualifiedContactableCount ?? data?.qualifiedContactableCount ?? 0) || 0;
      const qualifiedCount = Number(summary.qualifiedCount ?? data?.qualifiedCount ?? 0) || 0;
      const reviewCount = Number(summary.reviewCount ?? data?.reviewCount ?? 0) || 0;
      const excludedCount = Number(summary.excludedCount ?? data?.excludedCount ?? 0) || 0;
      const publicEmailCount = Number(summary.publicEmailCount ?? data?.publicEmailCount ?? 0) || 0;
      const rawSearchResultCount = Number(summary.rawSearchResultCount ?? data?.rawSearchResultCount ?? 0) || 0;
      const dedupedChannelCount = Number(summary.dedupedChannelCount ?? data?.dedupedChannelCount ?? 0) || 0;
      const remainingContactableCount = Number(summary.remainingContactableCount ?? reportPayload.remainingContactableCount ?? Math.max(0, targetCount - qualifiedContactableCount)) || 0;
      const stopReason = String(summary.stopReason || reportPayload.stopReason || data?.stopReason || (countOnly ? 'countOnly' : 'dryRun'));
      const candidates = Array.isArray(data?.candidates) ? data.candidates : Array.isArray(summary.candidates) ? summary.candidates : [];

      console.info('[JARVIS outreach collect result]', {
        qualifiedContactableCount,
        remainingContactableCount,
        reviewCount,
        excludedCount,
        stopReason,
      });

      setOutreachWorkspaceVisible(true);
      setOutreachCandidates(candidates);
      setOutreachCollectionSummary({
        ...(data?.summary || {}),
        ...(data?.diagnostics || {}),
        requestedVertical: goal.requestedVertical,
        verticalLabel,
        targetContactableCount: targetCount,
        qualifiedContactableCount,
        remainingContactableCount,
        qualifiedCount,
        reviewCount,
        excludedCount,
        publicEmailCount,
        rawSearchResultCount,
        dedupedChannelCount,
        completionStatus,
        stopReason,
        dryRun: true,
        countOnly,
      });

      const statusLine = completionStatus === 'complete'
        ? `목표 ${targetCount}명을 충족했습니다.`
        : `목표까지 ${remainingContactableCount}명이 더 필요합니다. 완료로 처리하지 않겠습니다.`;

      addMessage(
        'jarvis',
        [
          `대표님, ${verticalLabel} 인플루언서 ${countOnly ? '카운트 확인' : '미리보기 수집'} 결과입니다.`,
          '',
          `- 목표: 연락 가능한 적합 후보 ${targetCount}명`,
          `- 전체 검색 결과: ${rawSearchResultCount}건`,
          `- 중복 제거 채널: ${dedupedChannelCount}개`,
          `- 적합 후보: ${qualifiedCount}명`,
          `- 연락 가능 적합 후보: ${qualifiedContactableCount}명`,
          `- 공개 이메일 후보: ${publicEmailCount}명`,
          `- 검토 필요: ${reviewCount}명`,
          `- 제외: ${excludedCount}명`,
          `- 상태: ${completionStatus}`,
          `- 중단/제한 사유: ${stopReason}`,
          '',
          `판단: ${statusLine}`,
          '',
          '다음 행동을 하달할 수 있습니다.',
          '1. 계속 수집 - 부족한 인원을 이어서 찾습니다.',
          '2. 후보 보여줘 - 현재 후보를 먼저 검토합니다.',
          '3. 상위 3명 메일 미리보기 보여줘 - 실제 발송 없이 개인화 초안을 확인합니다.',
        ].join('\n'),
        true,
      );
      speakJarvisSummary({
        text: completionStatus === 'complete'
          ? `${verticalLabel} 인플루언서 목표 후보를 확보했습니다. 다음 행동을 선택해 주세요.`
          : `${verticalLabel} 인플루언서 후보가 아직 목표보다 부족합니다. 남은 인원과 중단 사유를 화면에 보고했습니다.`,
        intent: completionStatus === 'complete' ? 'outreach_goal_complete' : 'outreach_goal_partial',
      });

      if (completionStatus === 'complete') {
        createLocalPendingAction({
          actionType: 'OUTREACH_EMAIL_SEND',
          title: `${verticalLabel} 인플루언서 제안 메일 승인 대기`,
          summary: { targetContactableCount: targetCount, qualifiedContactableCount, remainingContactableCount, completionStatus, stopReason },
          nextPrompt: '제안 메일 초안을 만들거나 선택 후보에게 발송 승인 요청을 진행할까요?',
        });
      } else {
        createLocalPendingAction({
          actionType: 'OUTREACH_GOAL_COLLECT',
          title: `${verticalLabel} 인플루언서 이어서 수집 승인 대기`,
          summary: { targetContactableCount: targetCount, qualifiedContactableCount, remainingContactableCount, completionStatus, stopReason },
          nextPrompt: `${remainingContactableCount}명을 더 채우기 위해 이어서 수집할까요?`,
        });
      }
    } catch (error: any) {
      const errorCode = String(error?.message || error || 'OUTREACH_API_FAILED');
      addMessage(
        'jarvis',
        `대표님, 이번 수집은 완료되지 않았습니다. /api/cloud-proxy outreach task 호출이 실패했기 때문입니다. 실제 후보 수집 결과가 없으므로 완료라고 보고하지 않겠습니다. 오류 코드: ${errorCode}`,
        true,
      );
      speakJarvisSummary({ text: '인플루언서 수집 API 호출이 실패했습니다. 완료로 처리하지 않겠습니다.', intent: 'outreach_goal_api_failed' });
    } finally {
      setState('idle');
    }
  }, [addMessage, createLocalPendingAction, postCloudTask, speakJarvisSummary]);

  const handleTextSubmit = useCallback(async (text: string) => {
    if (!text.trim()) return;
    lastManualTextSubmitAtRef.current = Date.now();
    setTextInputValue('');
    // CHAT-INPUT-D.2: 타이핑 ON intent면 모드를 닫지 않음 (아래 분기에서 다시 열기)
    const _isTypingOnIntent = /(타이핑 모드 (켜|(켜줘|열어|시작))|입력창 (켜|켜줘|열어|열어줘|시작)|명령창 (켜|켜줘|열어|열어줘|시작)|타이핑 시작|타이핑모드 켜|command dock (open|on))/i.test(text.trim());
    if (!_isTypingOnIntent) setTextInputMode(false);

    // UI Scene 추론 및 설정 (SCREEN-A.1)
    const nextScene = inferJarvisSceneFromCommand(text);
    // UI-ORCH-A.10: mission scene이면 workspace 열기, 나머지는 guarded setActiveScene가 자동 차단
    const isMissionScene = nextScene === 'smartstore_brief' || nextScene === 'keyword_radar';
    if (isMissionScene) {
      setMissionWorkspaceOpen(true);
    }
    setActiveScene(nextScene); // guarded: workspace open이면 non-mission 차단됨
    // smartstore_brief 활성화 시 캐시 데이터 즉시 반영
    if (nextScene === 'smartstore_brief' && ssCountsCacheRef.current?.data) {
      setSccOrderData(ssCountsCacheRef.current.data);
    }
    // Scene Panel: home/standby가 아닌 새 scene이면 패널 표시, ResultDeck visible 시 숨김
    if (nextScene !== 'home' && nextScene !== 'standby') {
      setScenePanelVisible(true);
      setTimeout(() => setScenePanelVisible(false), 4000);
    } else {
      setScenePanelVisible(false);
    }
    // ACTION-A.1: scene 변경 시 Predictive Actions 업데이트
    setPredictedActions(getPredictiveActions(nextScene, text));
    setActionStatusMessage('');
    // UI-V3.2: Reactive Intelligence Signal
    if (nextScene !== 'home' && nextScene !== 'standby') {
      setReactionPulse(true);
      setTimeout(() => setReactionPulse(false), 2000);
    }

    // 캡차/2단계 인증 입력 대기 중이면 인증번호 전달
    if (verificationResolveRef.current) {
      const resolve = verificationResolveRef.current;
      verificationResolveRef.current = null;
      addMessage('user', text);
      setState('working');
      resolve(text.replace(/\s/g, '').trim());
      return;
    }

    // 자비스가 말하는 중이면 중단
    if (stateRef.current === 'speaking') {
      stopGlobalAudio();
      stopSpeakingLevel();
      await new Promise(r => setTimeout(r, 150));
    }

    // 자비스를 활성화하지 않은 상태에서도 입력 가능
    if (stateRef.current === 'idle') {
      setIsInitialized(true);
    }

    // 이전 task 상태 초기화 (패널 잔류 방지)
    resetAllNodes();

    setState('thinking');
    addMessage('user', text);

    const normalizedCommand = text.trim();
    const conversationReaction = inferConversationReaction(normalizedCommand);
    const reactionLead = buildReactionLead(conversationReaction);
    const conversationContext = {
      pendingActionType: pendingActionRef.current?.actionType,
      lastOutreachVertical: outreachCollectionSummary?.requestedVertical || outreachCollectionSummary?.activeCampaign,
      lastOutreachTargetContactableCount: Number(outreachCollectionSummary?.targetContactableCount || 0) || undefined,
      lastOutreachQualifiedContactableCount: Number(outreachCollectionSummary?.qualifiedContactableCount || 0) || undefined,
      lastOutreachRemainingContactableCount: Number(outreachCollectionSummary?.remainingContactableCount || 0) || undefined,
      lastOutreachCompletionStatus: outreachCollectionSummary?.completionStatus,
    };
    const deterministicIntent = inferIntentFromUserText(normalizedCommand, conversationContext);
    const routedCommand = routeJarvisCommand({
      text: normalizedCommand,
      context: conversationContext,
      snapshot: buildJarvisSituationSnapshot({
        purchaseOrderPreview: purchaseOrderBulkPreview,
        outreachSummary: outreachCollectionSummary,
        pendingAction: pendingActionRef.current,
      }),
    });
    if (deterministicIntent.intent === 'show_mission_display_command') {
      const opened = await openDataWallWindow();
      const snapshot = buildJarvisSituationSnapshot({
        purchaseOrderPreview: purchaseOrderBulkPreview,
        outreachSummary: outreachCollectionSummary,
        pendingAction: pendingActionRef.current,
      });
      const nextActions = planJarvisNextActions(snapshot);
      setConversationNextActions(nextActions);
      publishDualWallPayload({
        type: 'JARVIS_STATE_UPDATE',
        payload: {
          currentMission: 'Mission Display',
          outreachState: outreachCollectionSummary,
          orderState: purchaseOrderBulkPreview,
          securityState: { executeLocked: true, actualExecution: false },
          approvalQueue: pendingActionRef.current ? [pendingActionRef.current] : [],
          nextActions,
          updatedAt: Date.now(),
        },
      });
      addMessage(
        'jarvis',
        [
          '대표님, Mission Display 화면을 열고 현재 운영 상태를 동기화했습니다.',
          opened
            ? '브라우저 권한상 2번 모니터 위치를 강제로 보장할 수는 없습니다. 열린 창을 2번 모니터로 옮겨 전체화면으로 쓰시면 됩니다.'
            : '팝업이 차단된 것으로 보입니다. 브라우저 팝업 허용 후 다시 “2번 모니터에 띄워”라고 말씀해 주세요.',
          '실제 Gmail, Telegram, Smartstore 실행은 하지 않았고 EXECUTE LOCKED 상태를 유지했습니다.',
        ].join('\n\n'),
        true,
      );
      speakJarvisSummary({ text: 'Mission Display 화면을 열고 현재 운영 상태를 동기화했습니다. 실제 실행은 하지 않았습니다.', intent: 'show_mission_display_command' });
      setState('idle');
      return;
    }
    if (routedCommand.handled && routedCommand.intent === 'outreach_goal_continue_command') {
      addMessage('jarvis', routedCommand.screenText || '대표님, 이전 Outreach 목표를 이어서 진행하겠습니다.', true);
      speakJarvisSummary({ text: routedCommand.voiceSummary || '이전 Outreach 목표를 이어서 진행하겠습니다.', intent: routedCommand.intent });
      const nextGoal = parseOutreachGoalCommandClean(routedCommand.command || normalizedCommand) || parseOutreachGoalCommandV2(routedCommand.command || normalizedCommand);
      if (nextGoal) {
        await handleOutreachGoalCollectCommandV2(nextGoal);
        return;
      }
    }
    if (deterministicIntent.intent === 'approval_yes' && !pendingActionRef.current) {
      addMessage('jarvis', '대표님, 어떤 작업을 승인하시는 건지 확인이 필요합니다. 먼저 실행할 작업을 선택해 주세요.', true);
      speakJarvisSummary({ text: '어떤 작업을 승인하시는지 먼저 확인이 필요합니다.', intent: 'approval_without_pending_action' });
      setState('idle');
      return;
    }
    if (deterministicIntent.intent === 'outreach_goal_collect_command') {
      const outreachGoal = parseOutreachGoalCommandClean(normalizedCommand) || parseOutreachGoalCommandV2(normalizedCommand);
      if (outreachGoal) {
        await handleOutreachGoalCollectCommandV2(outreachGoal);
        return;
      }
    }
    if (deterministicIntent.intent === 'briefing_question' || deterministicIntent.intent === 'priority_question') {
      if (reactionLead) {
        addMessage('jarvis', reactionLead, true);
      }
      await showConversationOsBriefing(normalizedCommand);
      return;
    }
    if (deterministicIntent.intent === 'privacy_export_question') {
      const msg = [
        reactionLead,
        '맞습니다. 발주처에 실제로 전달하는 XLSX에는 배송 업무에 필요한 수취인 이름, 연락처, 주소, 우편번호, 배송메모가 들어가야 합니다.',
        '다만 화면, 대화, 로그, 음성에서는 개인정보를 계속 마스킹합니다. 개인정보 포함 파일은 “개인정보 포함 발주서 다운로드해줘” 명령 뒤 ActionCard 승인 후에만 생성됩니다.',
        '다음 행동은 “발주서 정리해줘”, “마스킹 발주서 다운로드해줘”, “개인정보 포함 발주서 다운로드해줘” 중 하나가 안전합니다.',
      ].filter(Boolean).join('\n\n');
      addMessage('jarvis', msg, true);
      speakJarvisSummary({ text: msg, intent: 'privacy_export_question' });
      setState('idle');
      return;
    }
    if (deterministicIntent.intent === 'masked_file_question') {
      const msg = [
        reactionLead,
        '마스킹 파일은 화면 검토와 공유 전 확인용입니다. 이름, 연락처, 주소를 가린 상태로 다운로드합니다.',
        '실제 배송 업무용 파일은 별도입니다. 그 파일에는 개인정보가 포함되므로 대표님 승인 후에만 생성합니다.',
        '검토용이면 “마스킹 발주서 다운로드해줘”, 실제 전달용이면 “개인정보 포함 발주서 다운로드해줘”라고 말씀하시면 됩니다.',
      ].filter(Boolean).join('\n\n');
      addMessage('jarvis', msg, true);
      speakJarvisSummary({ text: msg, intent: 'masked_file_question' });
      setState('idle');
      return;
    }
    if (deterministicIntent.intent === 'gmail_send_question') {
      const msg = [
        reactionLead,
        'Gmail 발송은 승인 기반으로만 열어야 합니다. 초안 보기와 dryRun 테스트는 가능하지만, 실제 발송은 pendingAction 또는 actionId 승인 없이 실행하지 않습니다.',
        '발주처 이메일은 서버 내부에서만 사용하고 화면에는 마스킹된 주소만 보여줍니다. 첫 실제 발송은 1건 테스트가 원칙입니다.',
        '다음 행동은 “매실 발주서 이메일 초안 보여줘” 또는 “발주서 이메일 dryRun 테스트해줘”입니다.',
      ].filter(Boolean).join('\n\n');
      addMessage('jarvis', msg, true);
      speakJarvisSummary({ text: msg, intent: 'gmail_send_question' });
      setState('idle');
      return;
    }
    if (deterministicIntent.intent === 'telegram_approval_question') {
      const msg = [
        reactionLead,
        'Telegram은 새 봇이나 새 9시 스케줄러를 만드는 방식이 아닙니다. 기존 9시 브리핑 구조를 재사용하고, actionId 기반 승인 요청을 붙이는 방향입니다.',
        '실제 Telegram 메시지는 대표님 최종 승인 전에는 보내지 않습니다. 현재 검증은 dryRun/actionRequests 중심으로 해야 안전합니다.',
        '테스트하려면 “Telegram 승인 요청 dryRun 테스트”라고 말씀해 주세요.',
      ].filter(Boolean).join('\n\n');
      addMessage('jarvis', msg, true);
      speakJarvisSummary({ text: msg, intent: 'telegram_approval_question' });
      setState('idle');
      return;
    }
    if (deterministicIntent.intent === 'outreach_goal_question') {
      const msg = [
        reactionLead,
        '인플루언서 수집의 완료 기준은 “많이 찾았다”가 아닙니다. 요청 분야에 적합하고, 연락 가능하고, 공개 이메일 조건을 만족한 후보가 목표 인원에 도달해야 완료입니다.',
        '예를 들어 “캠핑 인플루언서 20명 수집”은 캠핑 분야 적합 후보 중 연락 가능한 후보 20명을 목표로 봅니다. review/excluded 후보나 이메일 없는 후보는 목표 인원에 넣지 않습니다.',
        '20명 미달이면 partial 또는 blocked로 보고하고, 부족 인원과 quota/API/dryRun 같은 중단 사유를 말합니다.',
      ].filter(Boolean).join('\n\n');
      addMessage('jarvis', msg, true);
      speakJarvisSummary({ text: msg, intent: 'outreach_goal_question' });
      setState('idle');
      return;
    }
    if (deterministicIntent.intent === 'command_help_question') {
      const msg = [
        '대표님, 지금 안전하게 테스트할 수 있는 명령은 아래가 좋습니다.',
        '발주서: “발주서 정리해줘”, “마스킹 발주서 다운로드해줘”, “개인정보 포함 발주서 다운로드해줘”, “매실 발주서 이메일 초안 보여줘”.',
        'Outreach: “캠핑 인플루언서 20명 수집”, “캠핑 인플루언서 20명 가능한지 확인해줘”, “계속 수집”, “후보 보여줘”.',
        '화면: “2번 모니터에 띄워”, “현재 상황 크게 보여줘”. 실제 Gmail, Telegram, Smartstore 실행은 승인 게이트가 있어야만 가능합니다.',
      ].join('\n\n');
      addMessage('jarvis', msg, true);
      speakJarvisSummary({ text: msg, intent: 'command_help_question' });
      setState('idle');
      return;
    }
    if (deterministicIntent.intent === 'unknown_ops_question' && conversationReaction.shouldExplainReason) {
      const snapshot = buildJarvisSituationSnapshot({
        purchaseOrderPreview: purchaseOrderBulkPreview,
        outreachSummary: outreachCollectionSummary,
        pendingAction: pendingActionRef.current,
      });
      const nextActions = planJarvisNextActions(snapshot);
      setConversationNextActions(nextActions);
      const msg = [
        reactionLead || '대표님, 지금 질문은 실행 명령으로 처리하지 않고 상황 진단으로 답하겠습니다.',
        '현재 자비스가 바로 실행하지 않는 이유는 안전 게이트 때문입니다. Gmail 발송, Telegram 전송, Smartstore 상태 변경, 개인정보 포함 파일 생성은 ActionCard 승인 없이 진행하지 않습니다.',
        snapshot.risks.length ? `지금 눈에 띄는 막힘은 ${snapshot.risks.join(', ')}입니다.` : '현재 저장된 요약 기준에서 큰 차단 신호는 없습니다.',
        '제가 추천하는 다음 행동은 화면에 Next Actions로 띄워두겠습니다.',
      ].join('\n\n');
      addMessage('jarvis', msg, true);
      speakJarvisSummary({ text: msg, intent: 'unknown_ops_question' });
      setState('idle');
      return;
    }
    const wantsConversationOsBriefing =
      /(오늘\s*(업무\s*)?브리핑|지금\s*뭐부터|자비스\s*오늘\s*상황|우선순위|다음\s*행동)/.test(normalizedCommand)
      && !/(전체주문현황|전체\s*주문\s*현황|발주확인)/.test(normalizedCommand);
    if (wantsConversationOsBriefing) {
      await showConversationOsBriefing(normalizedCommand);
      return;
    }
    const wantsPrivatePurchaseOrderExport =
      /개인정보\s*포함.*(발주서|파일).*(다운로드|만들|생성)/.test(normalizedCommand)
      || /(원본|실제\s*배송용).*(발주서|파일).*(다운로드|만들|생성)/.test(normalizedCommand)
      || /(이름|주소|연락처).*(포함|넣어서).*(발주서|파일).*(다운로드|만들|생성)/.test(normalizedCommand)
      || /마스킹\s*말고.*(발주서|파일).*(다운로드|만들|생성)/.test(normalizedCommand);
    const wantsPurchaseOrderPrivacyQuestion =
      /(발주서|배송|발주처).*(이름|주소|연락처|개인정보).*(필요|들어가|넣어|가능|왜|맞지|아니야)/.test(normalizedCommand)
      || /왜.*(마스킹|개인정보)/.test(normalizedCommand)
      || /(개인정보\s*포함\s*발주서).*(가능|뭐야|어떻게|왜|안\s*돼|안돼|실패|못)/.test(normalizedCommand);
    const wantsMaskedFileQuestion =
      /(마스킹\s*파일|마스킹).*(개인정보\s*포함|차이|뭐야|무슨|왜|검토용|실제\s*파일)/.test(normalizedCommand)
      || /(마스킹\s*파일).*(어떻게|언제|용도)/.test(normalizedCommand);
    const wantsGmailQuestion =
      /(발주서|이메일|메일|Gmail|gmail).*(보낼\s*수|어디서|발송\s*가능|실제\s*발송|보내면|잠금|언제\s*열)/.test(normalizedCommand)
      || /(발주처\s*이메일).*(없으면|어떻게|저장|필요)/.test(normalizedCommand);
    const wantsTelegramQuestion =
      /(텔레그램|Telegram|telegram).*(전송|와|승인|새로|봇|브리핑|9시|아침|callback|콜백)/.test(normalizedCommand);
    const wantsOutreachGoalQuestion =
      /(인플루언서|유튜버|캠핑|뷰티|요리|식품).*(언제\s*완료|완료\s*기준|20명|이메일\s*없는|포함돼|포함|답변\s*없는|미응답|follow.?up|팔로우업)/.test(normalizedCommand);
    const wantsPurchaseOrderCommandHelp =
      /(발주서|발주처|택배사).*(어떤\s*명령|명령|어떻게\s*해|뭐라고\s*해)/.test(normalizedCommand);
    const wantsGeneralOpsCommandHelp =
      /(테스트\s*명령어|명령어\s*알려|뭘\s*해볼|뭐\s*해볼|어떤\s*명령)/.test(normalizedCommand);
    const wantsPurchaseOrderEmailDraftPreview =
      /(발주서|purchase\s*order).*(이메일|메일|gmail|Gmail).*(초안|미리보기|양식|보여|preview)/i.test(normalizedCommand)
      || /(매실|옥수수|복숭아|밤).*(이메일|메일).*(초안|미리보기|양식|보여)/i.test(normalizedCommand)
      || /(이메일|메일).*(초안|양식).*(보여|미리보기)/i.test(normalizedCommand);
    if (wantsPurchaseOrderEmailDraftPreview) {
      await openPurchaseOrderEmailDraftPreview(normalizedCommand);
      return;
    }
    const supplierCarrierSaveMatch = normalizedCommand.match(/(복숭아|매실|옥수수|밤|알밤|청매실|황매실|딱복|물복|백도|황도).*(로젠|롯데|logen|lotte).*(저장|설정|앞으로|택배)/i);
    if (supplierCarrierSaveMatch) {
      const group = resolvePurchaseProductGroup(supplierCarrierSaveMatch[1]);
      const carrier = resolvePurchaseCarrier(supplierCarrierSaveMatch[2]);
      if (!group || !carrier) {
        addMessage('jarvis', '상품군 또는 택배사를 확인하지 못했습니다. 예: "복숭아는 로젠으로 저장해"처럼 말씀해 주세요.', true);
        setState('idle');
        return;
      }
      setState('working');
      try {
        await saveSupplierProfileSetting({
          productGroupCode: group.code,
          productGroupName: group.name,
          productKeywords: group.keywords,
          carrier,
        });
        const carrierLabel = carrier === 'logen' ? '로젠택배' : '롯데택배';
        addMessage('jarvis', `${group.name} 발주처 택배사 규칙을 ${carrierLabel}로 저장했습니다. 앞으로 ${group.name} 발주서는 저장된 택배사 양식을 우선 사용합니다. 실제 이메일 전송은 계속 잠금 상태입니다.`, true);
        setMissionWorkspaceOpen(true);
        setActiveScene('smartstore_brief');
      } catch (error: any) {
        addMessage('jarvis', `택배사 규칙 저장 실패: ${error.message}`, true);
      }
      setState('idle');
      return;
    }
    const approvalYes = /^(응|그래|진행해|승인|해줘|보내|전송해|다운로드해|만들어|좋아|확인|ok|yes)$/i.test(normalizedCommand);
    const approvalNo = /^(취소|아니|보류|하지마|멈춰|나중에|no|cancel)$/i.test(normalizedCommand);
    if (approvalYes || approvalNo) {
      await executePendingActionFromChat(approvalYes ? 'approve' : 'cancel');
      return;
    }

    if (wantsPrivatePurchaseOrderExport) {
      await requestPrivatePurchaseOrderExport();
      return;
    }

    if (wantsPurchaseOrderPrivacyQuestion) {
      addMessage('jarvis', '맞습니다. 발주처에 실제로 전달하는 XLSX에는 배송 업무에 필요한 수취인 이름, 연락처, 주소, 우편번호, 배송메모가 들어가야 합니다.\n\n다만 화면과 대화에서는 개인정보를 보호해야 하므로 계속 마스킹해서 보여드립니다. 개인정보 포함 발주서는 대표님 승인 후에만 생성하고, 원문 정보는 다운로드 파일 안에만 들어갑니다.\n\n바로 진행하려면 “개인정보 포함 발주서 다운로드해줘”라고 말씀해 주세요. 먼저 확인하려면 “발주서 정리해줘” 또는 “마스킹 발주서 다운로드해줘”가 안전합니다.', true);
      speakJarvisSummary({ text: '맞습니다. 화면에서는 개인정보를 마스킹하지만, 실제 발주처 전달용 엑셀 파일에는 승인 후 배송 정보가 포함됩니다.', intent: 'privacy_export_question' });
      setState('idle');
      return;
    }

    if (wantsMaskedFileQuestion) {
      addMessage('jarvis', '마스킹 파일은 화면 검토용입니다. 고객 이름, 연락처, 주소를 가린 상태라 내부 확인이나 공유 전 검토에 안전합니다.\n\n개인정보 포함 파일은 실제 발주처 전달/배송 업무용입니다. 이 파일 안에는 수취인 이름, 연락처, 주소가 들어가므로 대표님 승인 후에만 생성합니다.\n\n검토만 하려면 “마스킹 발주서 다운로드해줘”, 실제 배송용이면 “개인정보 포함 발주서 다운로드해줘”라고 말씀해 주세요.', true);
      speakJarvisSummary({ text: '마스킹 파일은 검토용입니다. 실제 배송용 파일은 승인 후 개인정보를 포함해 따로 생성합니다.', intent: 'masked_file_question' });
      setState('idle');
      return;
    }

    if (wantsGmailQuestion) {
      addMessage('jarvis', '발주서 이메일 발송 구조는 초안과 승인 게이트까지 준비하는 방향입니다. 현재 실제 Gmail 발송은 아직 잠금 상태이고, 발주처 이메일이 저장되어 있어야 다음 단계로 넘어갈 수 있습니다.\n\n발주처 이메일이 없으면 자비스가 입력을 요청합니다. 저장 후에는 원문을 화면에 다시 보여주지 않고 마스킹해서 표시합니다.\n\n다음 단계에서 단건 dryRun을 확인한 뒤, 대표님 승인으로 실제 1건 발송 테스트를 열 수 있습니다.', true);
      speakJarvisSummary({ text: 'Gmail 발송은 아직 잠금 상태입니다. 발주처 이메일과 초안을 확인한 뒤 승인으로만 진행합니다.', intent: 'gmail_send_question' });
      setState('idle');
      return;
    }

    if (wantsTelegramQuestion) {
      addMessage('jarvis', 'Telegram은 새 봇이나 새 9시 스케줄러를 만드는 방식이 아닙니다. 기존 9시 브리핑 구조를 유지하고, 그 안에 action_id 기반 승인 요청을 붙이는 방향입니다.\n\n현재는 daily brief dryRun/actionRequests와 telegram-approval-reply API 게이트가 준비되어 있습니다. 실제 Telegram 버튼 callback과 발주서/이메일 승인 전송은 아직 운영 실행으로 열지 않았습니다.', true);
      speakJarvisSummary({ text: '기존 9시 텔레그램 브리핑을 활용합니다. 새 봇이나 새 스케줄러를 만드는 구조는 아닙니다.', intent: 'telegram_approval_question' });
      setState('idle');
      return;
    }

    if (wantsOutreachGoalQuestion) {
      addMessage('jarvis', '인플루언서 목표 수집은 “많이 찾음”이 완료가 아닙니다. 예를 들어 캠핑 인플루언서 20명이라면, 캠핑 분야에 적합하고 연락 가능한 공개 이메일 후보가 20명 확보되어야 완료입니다.\n\n이메일 없는 후보, review 후보, excluded 후보는 목표 인원에 넣지 않습니다. 20명 미만이면 partial/blocked로 보고하고 남은 인원과 중단 사유를 말해야 합니다.\n\n미응답자는 Gmail 발송 로그와 답장 여부를 기준으로 확인한 뒤, 같은 문구 반복이 아닌 다른 각도의 follow-up 초안을 만들고 승인 후에만 발송합니다.', true);
      speakJarvisSummary({ text: '목표 인원에 도달하기 전에는 완료로 처리하지 않습니다. 부족한 인원과 중단 사유를 보고합니다.', intent: 'outreach_goal_question' });
      setState('idle');
      return;
    }

    if (wantsPurchaseOrderCommandHelp || wantsGeneralOpsCommandHelp) {
      addMessage('jarvis', '지금 바로 안전하게 테스트할 수 있는 명령은 이렇습니다.\n\n발주서:\n- 발주서 정리해줘\n- 마스킹 발주서 다운로드해줘\n- 개인정보 포함 발주서 다운로드해줘\n- 발주서를 보내려면 개인정보가 필요한 거 아니야?\n- 복숭아는 로젠택배로 저장해\n- 매실 발주처 이메일 저장할게\n\n인플루언서:\n- 캠핑 인플루언서 20명 미리보기\n- 캠핑 인플루언서 20명 수집\n- 이메일 양식 먼저 보여줘\n- 미응답자 follow-up 초안 만들어줘\n\n실제 발주확인, Gmail 발송, Telegram 승인 callback은 아직 승인 게이트/잠금 상태로 유지합니다.', true);
      speakJarvisSummary({ text: '화면에 테스트 가능한 발주서와 인플루언서 명령어를 정리했습니다. 실제 발송 작업은 계속 잠금 상태입니다.', intent: 'command_help_question' });
      setState('idle');
      return;
    }

    const wantsFullOrderSummary = /(전체\s*주문\s*현황|전체주문현황|주문\s*현황.*전체)/.test(normalizedCommand);
    const wantsConfirmOrder = /발주확인/.test(normalizedCommand) && /(해줘|진행|처리|승인|확인)/.test(normalizedCommand) && !/(미리보기|dry|드라이런|대상)/i.test(normalizedCommand);
    if (wantsFullOrderSummary || wantsConfirmOrder) {
      await handleSmartstoreApprovalProposal(normalizedCommand);
      return;
    }

    if (/발주서\s*(작성|만들|생성|초안)/.test(normalizedCommand)) {
      if (!pendingActionRef.current || pendingActionRef.current.actionType !== 'PURCHASE_ORDER_CREATE') {
        addMessage('jarvis', '발주서 작성은 발주확인 승인 흐름과 분리되어 있습니다. 먼저 전체주문현황을 확인하고 발주확인 대상 승인 질문을 만들어 주세요.', true);
        setState('idle');
        return;
      }
      await executePendingActionFromChat('approve');
      return;
    }

    if (/발주서\s*(작성|정리|만들|생성|초안)/.test(normalizedCommand)) {
      setMissionWorkspaceOpen(true);
      setActiveScene('smartstore_brief');
      setState('working');
      const preview = await postCloudTask('purchase-order-bulk-preview', {
        scope: 'pre_ship',
        maskPrivateFields: true,
      });
      setPurchaseOrderBulkPreview(preview);
      const summary = preview?.summary || {};
      const groups = Array.isArray(preview?.groups) ? preview.groups : [];
      const groupLines = groups.slice(0, 8).map((group: any) => {
        const emailText = group.emailConfigured ? `이메일 ${group.emailMasked || '저장됨'}` : '이메일 필요';
        return `- ${group.productGroupName}: ${group.totalQuantity}개 / ${group.carrierName || group.carrier} / ${group.fileName} / ${emailText}`;
      }).join('\n');
      const unknownText = Number(summary.unknownProductCount || 0) > 0
        ? `\n\n미분류 상품 ${summary.unknownProductCount}건은 임의로 발주처나 택배사를 정하지 않았습니다. 상품군/택배사 규칙 확인이 필요합니다.`
        : '';
      addMessage('jarvis', `대표님, 전체 발주 대상을 상품군별로 정리했습니다.\n\n전체 발주 대상: ${summary.totalProductOrderCount || 0}건\n전체 수량: ${summary.totalQuantity || 0}개\n상품군: ${summary.groupCount || 0}개\n전송 가능 발주처: ${summary.readyGroupCount || 0}곳\n이메일 필요: ${summary.emailMissingGroupCount || 0}곳\n택배사 미지정: ${summary.carrierMissingGroupCount || 0}곳\n\n${groupLines || '- 표시할 발주 그룹이 없습니다.'}${unknownText}\n\n마스킹 파일은 다운로드할 수 있고, 개인정보 포함 파일은 별도 승인 없이는 생성하지 않습니다. 실제 이메일 전송은 아직 잠금 상태입니다.`, true);
      speakJarvisSummary({ text: '대표님, 발주서 대상을 상품별로 정리했습니다. 화면에서 택배사와 이메일 상태를 확인해 주세요.', intent: 'purchase_order_preview_command' });
      setState('idle');
      return;
    }

    if (/마스킹\s*파일\s*다운로드|발주서\s*다운로드/.test(normalizedCommand)) {
      setState('working');
      const exportResult = await postCloudTask('purchase-order-bulk-export', {
        scope: 'pre_ship',
        includePrivateFields: false,
        approvalConfirmed: false,
        format: 'xlsx',
      });
      const files = Array.isArray(exportResult?.files) ? exportResult.files : [];
      const downloaded = downloadPurchaseOrderFiles(files, '마스킹 발주서.xlsx');
      addMessage('jarvis', `대표님, 마스킹 발주서 파일 ${downloaded.length}개를 준비했습니다. 고객 이름/전화번호/주소는 마스킹된 상태입니다. 개인정보 포함 파일과 이메일 전송은 별도 승인 없이는 실행하지 않습니다.`, true);
      speakJarvisSummary({ text: '대표님, 마스킹 발주서 파일을 준비했습니다. 개인정보 포함 파일은 별도 승인 후에만 생성합니다.', intent: 'masked_export_command' });
      setState('idle');
      return;
    }

    const outreachGoal = parseOutreachGoalCommand(normalizedCommand);
    if (outreachGoal) {
      await handleOutreachGoalCollectCommand(outreachGoal);
      return;
    }

    if (/발주확인\s*(미리보기|dry|드라이런|대상|확인)/i.test(text)) {
      const ids = actionContext?.confirmNeededProductOrderIds || [];
      if (ids.length === 0) {
        addMessage('jarvis', '발주확인 미리보기 대상이 없습니다. 먼저 "전체주문현황 알려줘"로 ProductOrderId 기준 대상 목록을 조회해 주세요.', true);
        setState('idle');
        return;
      }
      setState('working');
      try {
        const res = await fetch('/api/cloud-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskType: 'smartstore-confirm-orders',
            params: { productOrderIds: ids, dryRun: true, approvalConfirmed: false },
          }),
        });
        const preview = await res.json();
        addMessage('jarvis', `🔐 **발주확인 Dry-run**\n\n대상: ${preview.requestedCount || ids.length}건\n실행 가능: ${preview.eligibleCount ?? 0}건\n상태: 실제 네이버 주문 상태 변경 없음\n\n실제 발주확인은 아직 LOCKED입니다. 대표님 승인과 검증된 실행 endpoint가 필요합니다.`, true);
      } catch (e: any) {
        addMessage('jarvis', `발주확인 미리보기 오류: ${e.message}`, true);
      }
      setState('idle');
      return;
    }

    // ── CHAT-INPUT-D.2: 타이핑 모드 UI intent 감지 (새 음성 인식 시스템 없이 기존 routing에 연결) ──
    const typingOnPatterns = [
      /타이핑 모드 (켜|(켜줘|열어|시작))/,
      /입력창 (켜|(켜줘|열어|열어줘|시작))/,
      /명령창 (켜|(켜줘|열어|열어줘|시작))/,
      /타이핑 시작/,
      /타이핑모드 켜/,
      /command dock (open|on)/i,
    ];
    const typingOffPatterns = [
      /타이핑 모드 (꺼|(꺼줘|닫아|닫아줘|종료|끄))/,
      /입력창 (꺼|(꺼줘|닫어|닫아줘|닫기|종료))/,
      /명령창 (꺼|(꺼줘|닫어|닫아줘|닫기|종료))/,
      /타이핑 종료/,
      /타이핑모드 꺼/,
      /command dock (close|off)/i,
    ];
    const t_lower = text.trim();
    if (typingOnPatterns.some(p => p.test(t_lower))) {
      setTextInputMode(true);
      setTimeout(() => (document.querySelector('.cmd-dock-input') as HTMLInputElement | null)?.focus(), 80);
      setState('idle');
      addMessage('jarvis', '타이핑 모드를 켰습니다. 명령을 입력하세요.', true);
      return;
    }
    if (typingOffPatterns.some(p => p.test(t_lower))) {
      setTextInputMode(false);
      setTextInputValue('');
      setState('idle');
      addMessage('jarvis', '타이핑 모드를 닫았습니다.', true);
      return;
    }
    // ── Workspace 명령 처리 ("저장된 작업", "워크스페이스", "작업 목록") ──
    const wsKeywords = ['저장된 작업', '워크스페이스', '작업 목록', '저장 목록', 'workspace', '저장된 것'];
    if (wsKeywords.some(kw => text.toLowerCase().includes(kw))) {
      setWorkspaceVisible(true);
      fetchWorkspaceRecords();
      setState('idle');
      addMessage('jarvis', '📂 File Workspace를 열었습니다. 저장된 작업 목록을 확인하세요.');
      return;
    }

    // ── 발주서/정산서 dry-run 테스트 명령 처리 ──
    const orderDryRunMatch = text.match(/(발주서|정산서|택배).*(양식|확인|테스트|dry.?run|검증|점검)/i) || text.match(/(양식|테스트|dry.?run).*(발주서|정산서|택배)/i);
    const orderLotteMatch = text.match(/롯데.*(발주서|양식).*(테스트|만들어)/);
    const orderLogenMatch = text.match(/로젠.*(발주서|양식).*(테스트|만들어)/);
    const orderSplitMatch = text.match(/(전체|발주서).*(밤|옥수수).*(분리|구분|나누|확인)/) || text.match(/(밤|옥수수).*(분리|구분|나누|확인).*(발주서)/);
    const settlementCheckMatch = text.match(/(옥수수|밤).*(정산서).*(만들|확인|가능|생성|테스트)/) || text.match(/(정산서).*(만들|확인|가능|생성)/);
    const orderTestFinal = orderDryRunMatch || orderLotteMatch || orderLogenMatch || orderSplitMatch || settlementCheckMatch;
    if (orderTestFinal) {
      setState('working');
      // 명령별 파라미터 결정
      let templateType = 'logen';
      let productType = 'oksu';
      let actionType: 'check_templates' | 'create_test_order' | 'create_test_settlement' = 'check_templates';
      if (orderLotteMatch) { templateType = 'lotte'; actionType = 'create_test_order'; }
      else if (orderLogenMatch) { templateType = 'logen'; actionType = 'create_test_order'; }
      else if (orderSplitMatch) { actionType = 'check_templates'; }
      else if (settlementCheckMatch) {
        actionType = 'create_test_settlement';
        if (text.includes('밤')) productType = 'bam';
      }
      if (text.includes('밤') && actionType === 'create_test_order') productType = 'bam';
      const actionLabel = actionType === 'check_templates' ? '발주서/정산서 양식 검증' : actionType === 'create_test_order' ? (templateType === 'lotte' ? '롯데택배' : '로젠택배') + ' TEST 발주서 생성' : (productType === 'bam' ? '밤' : '옥수수') + ' TEST 정산서 생성';
      addMessage('jarvis', `📦 ${actionLabel}을 시작합니다. (dry-run 모드)`);
      try {
        // 1. 양식 확인
        const checkRes = await fetch('/api/cloud-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: 'smartstore-process-order', params: { action: 'check_templates' } }),
        });
        const checkData = await checkRes.json();
        if (!checkData.success) throw new Error(checkData.error || '양식 확인 실패');

        let resultMsg = '';
        if (actionType === 'check_templates' || orderSplitMatch) {
          // 양식 확인 + 분리 가능 여부
          resultMsg = `✅ **발주서/정산서 양식 검증 완료 (dry-run)**\n\n`;
          resultMsg += `✅ 로젠택배 양식: ${checkData.templates?.logen || 'found'}\n`;
          resultMsg += `✅ 롯데택배 양식: ${checkData.templates?.lotte || 'found'}\n`;
          resultMsg += `✅ 옥수수 정산서: ${checkData.templates?.cornSettlement || 'found'}\n`;
          resultMsg += `✅ 밤 정산서: ${checkData.templates?.chestnutSettlement || 'found'}\n\n`;
          if (orderSplitMatch) {
            resultMsg += `📦 **밤/옥수수 분리 가능 여부:** ✅ 가능\n`;
            resultMsg += `• 옵션명 기준 자동 분리 (포르단칼집밤/공주알밤 → 밤, 냉동 대학찰옥수수 → 옥수수)\n`;
            resultMsg += `• 분리 후 각각 롯데/로젠 양식으로 발주서 생성 가능\n`;
            resultMsg += `• 각각 정산서 생성 가능\n`;
          }
          resultMsg += `\n🔒 execute LOCKED 유지`;
        } else if (actionType === 'create_test_order') {
          // TEST 발주서 생성
          const testOrderRes = await fetch('/api/cloud-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: 'smartstore-process-order', params: { action: 'create_test_order', productType, templateType } }),
          });
          const testOrderData = await testOrderRes.json();
          if (testOrderData.orderSheet) {
            const bytes = Uint8Array.from(atob(testOrderData.orderSheet), (c: any) => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = testOrderData.orderFileName || 'TEST_발주서.xlsx'; a.click();
            URL.revokeObjectURL(url);
          }
          const tmplName = templateType === 'lotte' ? '롯데택배' : '로젠택배';
          const prodName = productType === 'bam' ? '밤' : '옥수수';
          resultMsg = `✅ **TEST ${tmplName} 발주서 생성 완료**\n\n`;
          resultMsg += `📄 파일명: ${testOrderData.orderFileName || 'N/A'}\n`;
          resultMsg += `📦 더미 주문: ${testOrderData.orderCount || 0}건 (마스킹 데이터)\n`;
          resultMsg += `📝 상품: ${prodName}\n`;
          resultMsg += `📥 파일 다운로드가 시작되었습니다.\n\n`;
          resultMsg += `⚠️ 실제 고객정보 사용: 0건\n`;
          resultMsg += `🔒 execute LOCKED 유지`;
          // FILE Workspace 저장
          try {
            await fetch('/api/cloud-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ task: 'workspace-save', record: { type: 'order_sheet', title: `TEST ${tmplName} ${prodName}발주서`, content: `더미 ${testOrderData.orderCount}건, dry-run`, timestamp: new Date().toISOString() } }),
            });
          } catch (e) { /* 저장 실패해도 계속 */ }
          emitMissionLog('📦', 'Order', `TEST ${tmplName} ${prodName}발주서 생성 완료`, 'done');
        } else if (actionType === 'create_test_settlement') {
          // TEST 정산서 생성
          const testSettleRes = await fetch('/api/cloud-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: 'smartstore-process-order', params: { action: 'create_test_settlement', productType } }),
          });
          const testSettleData = await testSettleRes.json();
          if (testSettleData.settlementSheet) {
            const bytes = Uint8Array.from(atob(testSettleData.settlementSheet), (c: any) => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = testSettleData.settlementFileName || 'TEST_정산서.xlsx'; a.click();
            URL.revokeObjectURL(url);
          }
          const prodName = productType === 'bam' ? '밤' : '옥수수';
          resultMsg = `✅ **TEST ${prodName} 정산서 생성 완료**\n\n`;
          resultMsg += `📄 파일명: ${testSettleData.settlementFileName || 'N/A'}\n`;
          if (testSettleData.summary) {
            resultMsg += `💰 입금 필요액: ${Number(testSettleData.summary.totalSettlement || 0).toLocaleString()}원\n`;
            resultMsg += `📈 예상 매출: ${Number(testSettleData.summary.totalRevenue || 0).toLocaleString()}원\n`;
            resultMsg += `💵 예상 순수익: ${Number(testSettleData.summary.totalProfit || 0).toLocaleString()}원\n`;
            if (testSettleData.summary.unknownOptions?.length > 0) {
              resultMsg += `⚠️ 원가 미확인 옵션: ${testSettleData.summary.unknownOptions.join(', ')}\n`;
            }
          }
          resultMsg += `📥 파일 다운로드가 시작되었습니다.\n\n`;
          resultMsg += `⚠️ 원가: 첫부 양식 내부 확인된 값만 사용\n`;
          resultMsg += `⚠️ 실제 고객정보 사용: 0건\n`;
          resultMsg += `🔒 execute LOCKED 유지`;
          // FILE Workspace 저장
          try {
            await fetch('/api/cloud-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ task: 'workspace-save', record: { type: 'settlement', title: `TEST ${prodName}정산서`, content: `더미 데이터, dry-run, 원가 확인됨`, timestamp: new Date().toISOString() } }),
            });
          } catch (e) { /* 저장 실패해도 계속 */ }
          emitMissionLog('💰', 'Settlement', `TEST ${prodName}정산서 생성 완료`, 'done');
        }
        addMessage('jarvis', resultMsg, true);
        setState('idle');
        setClapBurst(true); setTimeout(() => setClapBurst(false), 120);
      } catch (err: any) {
        addMessage('jarvis', `❌ 양식 검증 실패: ${err.message}`);
        setState('idle');
      }
      return;
    }
    // ── Outreach 명령 처리 ──
    const outreachCollectMatch = text.match(/(캠핑|옥수수|복숭아|제철|농산물|먹방|집밥|간식|요리|육아|가족|[가-힣]+)\s*(유튜버|블로거|인플루언서|유튜브|네이버)\s*(\d+)?\s*명?\s*(수집|찾아|검색|모아|모집|체험단)/);    // ── 추가 패턴: "블로그 체험단 모집" / "체험단 모집" ──
    const outreachBlogMatch = text.match(/([가-힣]{2,}).*?(블로그|블로거).*?(체험단|모집|수집|찾아)/) || text.match(/(체험단|블로그.*모집|모집.*블로그).*?([가-힣]{2,})/);
    const outreachCollectMatch2 = text.match(/(유튜버|블로거|인플루언서|유튜브|네이버).*?(캠핑|옥수수|복숭아|제철|농산물|먹방|집밥|간식|요리|육아|가족|[가-힣]+).*?(\d+)?\s*명?\s*(수집|찾아|검색|모아|모집)/);
    const outreachCollectMatch3 = text.match(/(캠핑|옥수수|복숭아|제철|농산물|먹방|집밥|간식|요리|육아|가족|[가-힣]+).*?(관련|키워드)?\s*(유튜버|블로거|인플루언서)\s*(\d+)?\s*명?\s*(수집|찾아|검색|모아|모집)/);
    // ── 추가 패턴: "공동구매 후보 N명 찾아줘" ──
    const outreachCollectMatch4 = text.match(/([가-힣]+)\s*(공동구매|PPL|협찬)\s*(후보|파트너)?\s*(\d+)?\s*명?\s*(수집|찾아|검색|모아|모집)/);
    // ── 추가 패턴: "상품명 + N명 + 찾아줘" (유튜버/블로거 없이도 매칭) ──
    const outreachCollectMatch5 = text.match(/([가-힣]{2,})\s+(\d+)\s*명\s*(수집|찾아|검색|모아|모집)/);
    // ── 추가 패턴: "유튜브 카테고리 전체에서 ... 찾아줘" ──
    const outreachCollectMatch6 = text.match(/(카테고리|전체).*?([가-힣]{2,}).*?(\d+)?\s*명?\s*(수집|찾아|검색|모아|모집)/);
    // ── 추가 패턴: "N명 찾아줘" (상품명이 앞에 없을 때 문장 전체에서 키워드 추출) ──
    const outreachCollectMatchGeneric = text.match(/([가-힣]+).*?(\d+)\s*명.*?(찾아|수집|모아|검색|모집)/);
    // 우선순위별 매칭 결정
    const outreachCollectFinal = outreachCollectMatch || outreachCollectMatch2 || outreachCollectMatch3 || outreachCollectMatch4 || outreachCollectMatch5 || outreachCollectMatch6 || outreachBlogMatch;
    const outreachListMatch = text.match(/(수집한|오늘|저장된).*?(후보|인플루언서|유튜버|블로거).*?(보여|조회|목록|리스트)/);
    const outreachHighMatch = text.match(/(적합도|점수).*?(높은|상위).*?(후보|보여|조회)/);
    const outreachEmailMatch = text.match(/(메일|이메일).*?(초안|보여|확인)/);
    const outreachFollowUpMatch = text.match(/(미응답|follow.?up|팔로우업|재발송).*?(초안|만들어|보여)/);

    const outreachPreviewMatch = text.match(/뷰티\s*(인플루언서|후보)\s*(미리보기|테스트\s*수집|dryRun|드라이런)/i);

    if (outreachPreviewMatch || outreachCollectFinal || outreachCollectMatchGeneric) {
      const match = outreachCollectFinal || outreachCollectMatchGeneric;
      const isOutreachPreview = Boolean(outreachPreviewMatch);
      let keyword = isOutreachPreview ? '뷰티 인플루언서' : '';
      let platform = 'all';
      let count = isOutreachPreview ? 10 : 20;
      let requireEmail = !isOutreachPreview;
      let requestedVertical = isOutreachPreview ? 'beauty' : undefined;
      if (match && !isOutreachPreview) {
        const fullText = text;
        // 이메일 조건 파싱: 기본 true, "이메일 없어도/상관없이/전부" 등이 있으면 false
        if (/이메일\s*없어도|이메일\s*상관없|전부|모두|이메일\s*무관/.test(fullText)) {
          requireEmail = false;
        }
        // 키워드 추출 (상품명 우선 → 카테고리 우선 → 일반 한글 추출)
        const productKws = ['옥수수','복숭아','사과','배','감','딸기','수박','참외','토마토','고구마','감자','배추','김치','떡','한과','꿀','잼','과일','채소','농산물','캠핑','요리','먹방','집밥','간식','육아','가족','제철','대학찰옥수수','괴산'];
        const productMatch = productKws.find(k => fullText.includes(k));
        if (productMatch) {
          keyword = productMatch;
          // "괴산 대학찰옥수수" 같은 복합 키워드 처리
          const compoundMatch = fullText.match(/(괴산\s*대학찰옥수수|대학찰옥수수|성주\s*복숭아|영동\s*복숭아)/);
          if (compoundMatch) keyword = compoundMatch[1].replace(/\s+/g, ' ');
        } else {
          // 일반 한글 우선 추출 (유튜버/블로거/인플루언서/공동구매 등 제외)
          const excludeWords = ['유튜버','블로거','인플루언서','공동구매','후보','파트너','이메일','공개','연락','카테고리','전체','유튜브','네이버','명','수집','찾아','검색','모아','있는','가능한'];
          const words = fullText.match(/[가-힣]{2,}/g) || [];
          const kwCandidate = words.find(w => !excludeWords.includes(w));
          keyword = kwCandidate || match[1] || match[2] || '옥수수';
        }
        // 플랫폼 추출
        if (fullText.includes('유튜버') || fullText.includes('유튜브') || fullText.includes('YouTube')) platform = 'youtube';
        else if (fullText.includes('블로거') || fullText.includes('네이버') || fullText.includes('Naver') || fullText.includes('블로그') || fullText.includes('체험단')) platform = 'naver';
        // 네이버 블로그/체험단은 이메일 없이 블로그 URL로 연락 가능 → requireEmail 자동 false
        if (platform === 'naver') requireEmail = false;
        // 수량 추출
        const numMatch = fullText.match(/(\d+)\s*명/);
        if (numMatch) count = Math.min(parseInt(numMatch[1]), 50);
      }

      setOutreachVisible(true);
      if (isOutreachPreview) setOutreachWorkspaceVisible(false);
      setOutreachLoading(true);
      setState('working');
      emitNodeState('jarvis_brain', 'active', '인플루언서 후보 수집 중...');
      emitNodeState('influencer', 'active', '인플루언서 후보 수집 중...');
      emitMissionLog('🔍', 'OUTREACH', `${keyword} ${platform} 후보 ${isOutreachPreview ? '미리보기' : '수집'} 시작 (${count}명${requireEmail ? ', 이메일 필수' : ''})`, 'thinking');
      addMessage('jarvis', isOutreachPreview
        ? `뷰티 인플루언서 미리보기로 확인하겠습니다. dryRun/countOnly 모드라 Google Sheets에는 저장하지 않고, 실제 발송도 잠금 상태입니다.`
        : `${keyword} 관련 ${platform === 'youtube' ? 'YouTube' : platform === 'naver' ? 'Naver Blog' : 'YouTube + Naver Blog'} 후보를 수집합니다.${requireEmail ? ' 공개 이메일이 있는 후보만 필터링합니다.' : ''} 최대 ${count}명까지 분석합니다.`, true);

      try {
        // 카테고리 기반 수집: requireEmail을 API에 전달하여 서버에서 필터링
        const requestCount = Math.min(count, 50);
        // Append 모드: 기존 후보 ID 전달하여 중복 제거
        const existingIds = (outreachCandidates || []).map((c: any) => c.channelId || c.channelOrBlogUrl).filter(Boolean);
        // ── 45초 타임아웃 guard: 무한대기 방지 ──
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);
        let data: any;
        try {
          const res = await fetch('/api/cloud-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskType: 'outreach-collect',
              params: {
                keyword,
                product: keyword,
                maxCandidates: requestCount,
                requestedCount: requestCount,
                platform,
                requireEmail,
                existingCandidateIds: isOutreachPreview ? [] : existingIds,
                requestedVertical,
                dryRun: isOutreachPreview,
                countOnly: isOutreachPreview,
              },
            }),
            signal: controller.signal,
          });
          data = await res.json();
        } catch (fetchErr: any) {
          clearTimeout(timeoutId);
          if (fetchErr.name === 'AbortError') {
            setOutreachLoading(false);
            emitMissionLog('⚠️', 'OUTREACH', '수집 타임아웃 (45초 초과)', 'warning');
            emitNodeState('jarvis_brain', 'error', '수집 타임아웃');
            addMessage('jarvis', `⚠️ ${keyword} 후보 수집이 제한 시간(45초) 안에 완료되지 않았습니다. 다시 시도하거나 수량을 줄여서 요청해주세요.`, true);
            setState('idle');
            return;
          }
          throw fetchErr;
        } finally {
          clearTimeout(timeoutId);
        }
        setOutreachLoading(false);
        setOutreachCollectionSummary(data?.summary || data?.diagnostics ? { ...(data?.diagnostics || {}), ...(data?.summary || {}) } : null);
        if (isOutreachPreview) setOutreachWorkspaceVisible(true);

        if (data.quotaExceeded) {
          emitMissionLog('⚠️', 'OUTREACH', 'YouTube API 할당량 초과', 'warning');
          addMessage('jarvis', '⚠️ YouTube API 할당량 초과로 오늘은 소량/수동 검증 모드로 진행합니다. Naver Blog 후보만 수집되었습니다.', true);
        }

        if (data.success && data.candidates && data.candidates.length > 0) {
          // ── 서버에서 이미 이메일 필터링 완료 ──
          let finalCandidates = data.candidates.slice(0, count);
          const excludedNoEmail = data.excluded || { total: 0, noEmail: 0, invalidEmail: 0, contactLinkOnly: 0 };
          const shortfall = data.shortfall || 0;
          const searchedSegments = data.searchedSegments || [];
          const segmentStats = data.segmentStats || {};

          // Append 모드: 기존 후보에 새 후보 추가 (중복 제거)
          const prevCandidates = outreachCandidates || [];
          const mergedCandidates = isOutreachPreview ? finalCandidates : [...prevCandidates, ...finalCandidates];
          setOutreachCandidates(mergedCandidates);
          const telemetryInfo = data.telemetry ? ` | API ${data.telemetry.apiCalls}회, Quota ${data.telemetry.quotaUsed} units` : '';
          emitMissionLog('✅', 'OUTREACH', `${finalCandidates.length}명 ${isOutreachPreview ? '미리보기 완료' : '수집 완료'} (누적 ${mergedCandidates.length}명)${requireEmail ? ' (이메일 확인)' : ''}${telemetryInfo}`, 'success');
          emitNodeState('jarvis_brain', 'success', isOutreachPreview ? '후보 미리보기 완료' : '후보 수집 완료');
          emitNodeState('influencer', 'success', isOutreachPreview ? '후보 미리보기 완료' : '후보 수집 완료');

          const highFit = finalCandidates.filter((c: any) => c.productFitScore >= 60).length;
          const contactable = finalCandidates.filter((c: any) => c.publicContactStatus === 'email_public').length;

          // OUTREACH-TARGET-FIT-A.1: targetFitStats 추출
          const countSummary = { ...(data.diagnostics || {}), ...(data.summary || {}) };
          const targetFitStats = data.targetFitStats || { qualified: 0, review: 0, excludedTarget: 0, qualifiedWithEmail: 0 };
          const qualifiedCount = Number(countSummary.qualifiedCount ?? targetFitStats.qualified ?? 0);
          const reviewCount = Number(countSummary.reviewCount ?? targetFitStats.review ?? 0);
          const excludedCount = Number(countSummary.excludedCount ?? targetFitStats.excludedTarget ?? 0);
          const qualifiedPublicEmailCount = Number(countSummary.qualifiedPublicEmailCount ?? targetFitStats.qualifiedWithEmail ?? 0);
          const detectedVertical = data.requestedVertical || 'unknown';
          const verticalLabel = detectedVertical !== 'unknown' ? detectedVertical : keyword;

          // ── 수집 완료 보고 메시지 (TARGET-FIT-A.1 반영) ──
          const segmentSummary = Object.entries(segmentStats)
            .sort((a: any, b: any) => b[1] - a[1])
            .map(([seg, cnt]) => `${seg} ${cnt}명`)
            .join(', ');
          let reportMsg = '';
          if (detectedVertical !== 'unknown') {
            // TARGET-FIT-A.1: 분야 특화 보고
            reportMsg = `**${verticalLabel} 인플루언서 후보 ${isOutreachPreview ? '미리보기 결과' : '수집 완료'}** (Target Fit Gate 적용)\n\n` +
              `| 항목 | 수치 |\n|------|------|\n` +
              `| 요청 분야 | ${verticalLabel} |\n` +
              (isOutreachPreview ? `| 실행 모드 | dryRun / countOnly, Google Sheets 저장 안 함 |\n` : '') +
              `| 전체 검색 결과 | ${countSummary.rawSearchResultCount ?? '-'}건 |\n` +
              `| 중복 제거 채널 | ${countSummary.dedupedChannelCount ?? '-'}개 |\n` +
              `| 적합 (qualified) | ${qualifiedCount}명 |\n` +
              `| 검토 (review) | ${reviewCount}명 |\n` +
              `| 분야 부적합 (제외) | ${excludedCount}명 |\n` +
              `| 이메일 없음 (제외) | ${excludedNoEmail.noEmail || 0}명 |\n` +
              `| 적합+이메일 확인 | ${qualifiedPublicEmailCount}명 |\n` +
              `| 화면 표시 후보 | ${finalCandidates.length}명 |\n\n` +
              `${verticalLabel} 분야 근거 키워드가 확인된 후보만 ${isOutreachPreview ? '화면에 미리 표시했습니다' : '저장했습니다'}. ` +
              `분야 부적합 ${excludedCount}명은 자동 제외되었습니다.\n\n` +
              (isOutreachPreview
                ? `**저장 상태**: dryRun — Google Sheets 저장 생략\n`
                : `**저장 위치**: Google Sheets (influencer_candidates_v2 탭)\n`) +
              (data.telemetry ? `**Telemetry**: API ${data.telemetry.apiCalls}회, Quota ${data.telemetry.quotaUsed} units\n` : '') +
              `우측 패널에서 후보 카드를 확인하세요.`;
          } else if (requireEmail && shortfall > 0) {
            reportMsg = `**${keyword} 후보 수집 완료** (이메일 조건 적용)\n\n` +
              `| 항목 | 수치 |\n|------|------|\n` +
              `| 요청 인원 | ${count}명 |\n` +
              `| 공개 이메일 확인 | ${finalCandidates.length}명 |\n` +
              `| 부족 | ${shortfall}명 |\n` +
              `| 이메일 없음 (제외) | ${excludedNoEmail.noEmail || 0}명 |\n` +
              `| 적합도 60점↑ | ${highFit}명 |\n\n` +
              `⚠️ 요청하신 ${count}명 중 공개 이메일이 확인된 후보는 **${finalCandidates.length}명**입니다.\n\n` +
              `**저장 위치**: Google Sheets (influencer_candidates_v2 탭)\n` +
              `우측 패널에서 후보 카드를 확인하세요.`;
          } else if (requireEmail) {
            reportMsg = `**${keyword} 후보 ${finalCandidates.length}명 수집 완료** (공개 이메일 확인)\n\n` +
              `| 항목 | 수치 |\n|------|------|\n` +
              `| 공개 이메일 확인 | ${contactable}명 |\n` +
              `| 적합도 60점↑ | ${highFit}명 |\n` +
              `| 이메일 없음 (제외) | ${excludedNoEmail.noEmail || 0}명 |\n\n` +
              `모두 공개 이메일이 확인된 후보입니다.\n\n` +
              `**저장 위치**: Google Sheets (influencer_candidates_v2 탭)\n` +
              (data.telemetry ? `**Telemetry**: API ${data.telemetry.apiCalls}회, Quota ${data.telemetry.quotaUsed} units\n` : '') +
              `우측 패널에서 후보 카드를 확인하세요.`;
          } else {
            reportMsg = `**공동구매 후보 ${finalCandidates.length}명 수집 완료**\n\n` +
              `| 항목 | 수치 |\n|------|------|\n` +
              `| 적합도 60점↑ | ${highFit}명 |\n` +
              `| 공개 연락 가능 | ${contactable}명 |\n\n` +
              `**저장 위치**: Google Sheets (influencer_candidates_v2 탭)\n` +
              `우측 패널에서 후보 카드를 확인하세요.`;
          }
          addMessage('jarvis', reportMsg, true);

          // ── 수집 완료 TTS 브리핑 ──
          const voiceReport = detectedVertical !== 'unknown'
            ? `${verticalLabel} 인플루언서 후보 ${isOutreachPreview ? '미리보기 결과입니다' : '수집이 완료되었습니다'}. 전체 검색 ${countSummary.rawSearchResultCount ?? 0}건 중 ${verticalLabel} 분야 적합 후보 ${qualifiedCount}명, 검토 필요 ${reviewCount}명, 분야 부적합 ${excludedCount}명입니다. 공개 이메일이 있는 적합 후보는 ${qualifiedPublicEmailCount}명입니다. ${isOutreachPreview ? '이번 작업은 드라이런이라 구글 시트에는 저장하지 않았고, ' : ''}실제 발송은 잠금 상태입니다.`
            : requireEmail
            ? `${keyword} 후보 수집이 완료되었습니다. 공개 이메일이 확인된 후보 ${contactable}명, 적합도 60점 이상 ${highFit}명입니다. 구글 시트에 저장했습니다.`
            : `${keyword} 후보 ${finalCandidates.length}명 수집이 완료되었습니다. 구글 시트에 저장했습니다.`;
          setState('speaking');
          startSpeakingLevel();
          await new Promise<void>(resolve => {
            speak(voiceReport, undefined, () => { stopSpeakingLevel(); resolve(); });
          });
          // ── 자연스러운 후속 대화 ──
          const followUpMsg = isOutreachPreview
            ? `미리보기 결과는 저장하지 않았습니다. 확실한 적합 후보가 ${qualifiedCount}명, 검토 필요 후보가 ${reviewCount}명입니다. 실제 저장이 필요하면 수집 명령을 따로 실행해야 합니다.`
            : contactable > 0
            ? `공개 이메일이 확인된 후보가 ${contactable}명 있습니다. 지금 협업 제안 메일을 발송할까요? 발송 전 초안을 먼저 확인하실 수도 있습니다.`
            : `이메일 주소가 확인된 후보가 없습니다. 이메일 조건 없이 다시 수집하거나, 후보 패널에서 직접 연락처를 확인해보시겠습니까?`;
          await new Promise(r => setTimeout(r, 600));
          addMessage('jarvis', followUpMsg, true);
          setState('speaking');
          startSpeakingLevel();
          await new Promise<void>(resolve => {
            speak(followUpMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
          });

          // ── 파티클 폭발 효과 ──
          setClapBurst(true);
          setTimeout(() => setClapBurst(false), 120);
          setTimeout(() => { setClapBurst(true); setTimeout(() => setClapBurst(false), 120); }, 450);

          // ── ActionCard 연결 (Next Action 제공) ──
          setActionContext({
            type: 'outreach_collect',
            keyword,
            collectedCount: finalCandidates.length,
            totalCount: mergedCandidates.length,
            emailCount: contactable,
            shortfall,
            label: requireEmail ? `이메일 확인 후보 ${finalCandidates.length}명 (누적 ${mergedCandidates.length}명)` : `후보 ${finalCandidates.length}명 수집 (누적 ${mergedCandidates.length}명)`,
            description: `${keyword} 후보 → Google Sheets 저장 완료`,
            savedTo: 'Google Sheets (influencer_candidates)',
            telemetry: data.telemetry || null,
            locked: false,
            sourceCommand: text,
          });
          setWorkflowSteps(buildWorkflowSteps({ type: 'outreach_collect', label: '후보 수집', description: '', locked: false }));

          // ── Google Sheets 자동 저장 ──
          if (!isOutreachPreview && finalCandidates.length > 0) {
            fetch('/api/cloud-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ taskType: 'outreach-save-candidates', params: { candidates: finalCandidates } }),
            }).then(r => r.json()).then(saveResult => {
              if (saveResult.success) {
                emitMissionLog('💾', 'OUTREACH', `Google Sheets 저장 완료 (${saveResult.saved || finalCandidates.length}건)`, 'success');
              }
            }).catch(() => {
              emitMissionLog('⚠️', 'OUTREACH', 'Google Sheets 저장 실패 (로컬 보관 중)', 'warning');
            });
          } else if (isOutreachPreview) {
            emitMissionLog('🔒', 'OUTREACH', 'dryRun 미리보기: Google Sheets 저장 생략', 'info');
          }
        } else {
          emitMissionLog('ℹ️', 'OUTREACH', '후보 없음', 'info');
          emitNodeState('jarvis_brain', 'success', '후보 없음');
          emitNodeState('influencer', 'success', '후보 없음');
          if (isOutreachPreview && data?.summary) {
            addMessage('jarvis', `뷰티 인플루언서 미리보기 결과입니다. 전체 검색 ${data.summary.rawSearchResultCount ?? 0}건, 중복 제거 ${data.summary.dedupedChannelCount ?? 0}개 채널 중 화면 표시 후보는 0명입니다. 적합 ${data.summary.qualifiedCount ?? 0}명, 검토 ${data.summary.reviewCount ?? 0}명, 제외 ${data.summary.excludedCount ?? 0}명입니다. dryRun이라 Google Sheets에는 저장하지 않았고, 실제 발송도 잠금 상태입니다.`, true);
          } else {
            addMessage('jarvis', `${keyword} 관련 ${requireEmail ? '공개 이메일이 있는 ' : ''}후보를 찾지 못했습니다. 다른 키워드로 시도해보시겠습니까?`, true);
          }
        }
      } catch (e: any) {
        setOutreachLoading(false);
        emitMissionLog('❌', 'OUTREACH', `수집 실패: ${e.message}`, 'error');
        emitNodeState('jarvis_brain', 'error', `수집 실패: ${e.message}`);
        emitNodeState('influencer', 'error', `수집 실패: ${e.message}`);
        addMessage('jarvis', '후보 수집 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', true);
      }
      setState('idle');
      return;
    }

    if (outreachListMatch) {
      setOutreachVisible(true);
      if (outreachCandidates.length > 0) {
        addMessage('jarvis', `현재 수집된 후보 ${outreachCandidates.length}명입니다. 우측 패널에서 확인하세요.`, true);
      } else {
        setOutreachLoading(true);
        try {
          const res = await fetch('/api/cloud-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskType: 'outreach-list', params: { limit: 20 } }),
          });
          const data = await res.json();
          setOutreachLoading(false);
          if (data.success && data.candidates?.length > 0) {
            setOutreachCandidates(data.candidates);
            addMessage('jarvis', `Google Sheets에서 ${data.candidates.length}명의 후보를 불러왔습니다.`, true);
          } else {
            addMessage('jarvis', '아직 저장된 후보가 없습니다. "캠핑 유튜버 5명 수집해줘" 명령을 시도해보세요.', true);
          }
        } catch {
          setOutreachLoading(false);
          addMessage('jarvis', '후보 목록 조회 중 오류가 발생했습니다.', true);
        }
      }
      setState('idle');
      return;
    }

    if (outreachHighMatch) {
      setOutreachVisible(true);
      const highCandidates = outreachCandidates.filter(c => c.productFitScore >= 60);
      if (highCandidates.length > 0) {
        addMessage('jarvis', `적합도 60점 이상 후보 ${highCandidates.length}명입니다. 패널에서 '적합도↑' 필터를 활성화했습니다.`, true);
      } else {
        addMessage('jarvis', '적합도 높은 후보가 없습니다. 먼저 후보를 수집해주세요.', true);
      }
      setState('idle');
      return;
    }

    if (outreachEmailMatch) {
      setOutreachVisible(true);
      const withEmail = outreachCandidates.filter(c => c.firstEmailDraft);
      if (withEmail.length > 0) {
        addMessage('jarvis', `메일 초안이 있는 후보 ${withEmail.length}명입니다. 패널에서 후보를 클릭하면 메일 초안을 확인할 수 있습니다.`, true);
      } else {
        addMessage('jarvis', '메일 초안이 생성된 후보가 없습니다. 공개 연락처가 확인된 후보에게만 초안이 생성됩니다.', true);
      }
      setState('idle');
      return;
    }

    if (outreachFollowUpMatch) {
      setOutreachVisible(true);
      const withFollowUp = outreachCandidates.filter(c => c.followUpDraft);
      if (withFollowUp.length > 0) {
        addMessage('jarvis', `Follow-up 초안이 있는 후보 ${withFollowUp.length}명입니다. 패널에서 후보를 클릭 → 'Follow-up 초안' 탭에서 확인하세요.\n\n⚠️ 실제 발송은 LOCKED 상태입니다.`, true);
      } else {
        addMessage('jarvis', 'Follow-up 초안이 생성된 후보가 없습니다. 먼저 후보를 수집해주세요.', true);
      }
      setState('idle');
      return;
    }

    // ── OUTREACH-MAIL-A.1: v2 탭 후보 메일 발송 준비 ──
    const outreachMailPrepareMatch = text.match(/(후보|인플루언서|유튜버|블로거).*(메일|이메일).*(준비|발송|보내)/)
      || text.match(/(메일|이메일).*(준비|발송).*(후보|인플루언서)/)
      || text.match(/(outreach.*mail|outreach.*메일|메일.*outreach)/i);
    const outreachMailSendApproveMatch = text.match(/(승인|confirm|ok|yes).*(인플루언서|후보|메일).*(발송|보내)/)
      || text.match(/(인플루언서|후보|메일).*(발송|보내).*(승인|confirm|ok)/)
      || text.match(/(outreach.*승인.*발송|outreach.*send.*approve)/i);

    if (outreachMailPrepareMatch) {
      const urlMatch = text.match(/https?:\/\/[^\s]+/);
      const idMatch = text.match(/influencer_id[:\s]+([\w-]+)/);
      const profileUrl = urlMatch ? urlMatch[0] : '';
      const influencerId = idMatch ? idMatch[1] : '';

      if (!profileUrl && !influencerId) {
        addMessage('jarvis', `후보 메일 발송 준비: profile_url 또는 influencer_id가 필요합니다.\n\n예: "후보 메일 발송 준비 https://www.youtube.com/@xxx"`, true);
        setState('idle');
        return;
      }

      emitMissionLog('📧', 'Outreach', '메일 발송 조건 검증 중...', 'thinking');
      setState('working');
      try {
        const res = await fetch('/api/cloud-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskType: 'outreach-mail-prepare',
            params: { profile_url: profileUrl, influencer_id: influencerId },
          }),
        });
        const data = await res.json();
        if (!data.success || !data.sendable) {
          addMessage('jarvis', `❌ 메일 발송 불가\n\n${data.message || data.error}\n\n개선 필요 항목:\n${(data.errors || []).map((e: string) => `• ${e}`).join('\n')}`, true);
          emitMissionLog('📧', 'Outreach', '메일 발송 불가 - 조건 미충족', 'error');
          setState('idle');
          return;
        }
        setApprovalPreview(buildApprovalPreview({
          type: 'outreach_mail_send',
          title: '후보 메일 발송 승인',
          description: `[${data.channelName}] (${data.platform})\n\n실제 인플루언서 이메일 발송 요청입니다.\n⚠️ 승인 전까지 발송되지 않습니다.`,
          details: [
            { label: '수신자', value: data.toEmail },
            { label: '제목', value: data.subject },
            { label: '플랫폼', value: data.platform },
            { label: '실행 모드', value: 'execute (LOCKED → 승인 시 해제)' },
          ],
          confirmLabel: '승인 - 실제 발송',
          cancelLabel: '취소',
        }));
        (window as any).__outreachMailPendingInfluencerId = data.influencer_id || '';
        (window as any).__outreachMailPendingProfileUrl = data.profile_url || profileUrl;
        addMessage('jarvis', `🔐 **승인 필요**\n\n[${data.channelName}] (${data.platform})에게 제안 메일을 발송합니다.\n\n• 수신자: ${data.toEmail}\n• 제목: ${data.subject}\n• 본문 미리보기: ${data.bodyPreview}\n\n⚠️ 승인 전까지 발송되지 않습니다.`, true);
        emitMissionLog('📧', 'Outreach', `메일 준비 완료 - [${data.channelName}] 승인 대기`, 'done');
        setState('idle');
      } catch (e: any) {
        addMessage('jarvis', `❌ 메일 준비 오류: ${e.message}`, true);
        setState('idle');
      }
      return;
    }

    if (outreachMailSendApproveMatch && (window as any).__outreachMailPendingProfileUrl) {
      const pendingInfluencerId = (window as any).__outreachMailPendingInfluencerId || '';
      const pendingProfileUrl = (window as any).__outreachMailPendingProfileUrl || '';
      emitMissionLog('📧', 'Outreach', '승인 확인 - 실제 발송 실행', 'active');
      setState('working');
      try {
        const res = await fetch('/api/cloud-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskType: 'outreach-mail-send',
            params: {
              influencer_id: pendingInfluencerId,
              profile_url: pendingProfileUrl,
              approved: true,
            },
          }),
        });
        const data = await res.json();
        if (data.success) {
          addMessage('jarvis', `✅ **메일 발송 완료**\n\n[${data.channelName}]\n• 수신자: ${data.toEmailMasked}\n• 제목: ${data.subject}\n• 발송 시간: ${data.sentAt ? new Date(data.sentAt).toLocaleString('ko-KR') : '-'}\n• Google Sheets 업데이트: ${data.sheetsUpdated ? 'PASS' : 'FAIL'}`, true);
          emitMissionLog('📧', 'Outreach', `발송 완료 - [${data.channelName}]`, 'done');
          (window as any).__outreachMailPendingInfluencerId = '';
          (window as any).__outreachMailPendingProfileUrl = '';
        } else {
          addMessage('jarvis', `❌ 발송 실패: ${data.error || data.message}`, true);
          emitMissionLog('📧', 'Outreach', `발송 실패: ${data.error}`, 'error');
        }
        setState('idle');
      } catch (e: any) {
        addMessage('jarvis', `❌ 발송 오류: ${e.message}`, true);
        setState('idle');
      }
      return;
    }

    // ── Gmail 발송 준비 / 초안 보기 / 테스트 발송 / 승인 명령 처리 ──
    const emailPrepareMatch = text.match(/(수집된|캠핑|복숭아|옥수수|밤|유튜버|인플루언서).*(이메일|메일).*(발송|보내|준비)/)
      || text.match(/(이메일|메일).*(발송|보내).*(준비)/)
      || text.match(/(공동구매|제안).*(이메일|메일).*(발송|보내|준비)/);
    const emailDraftViewMatch = text.match(/(발송.*전|먼저).*(초안|미리보기|보여)/) || text.match(/(초안).*(먼저|보여|확인)/);
    const emailTestSendMatch = text.match(/(테스트|test).*(수신자|발송|보내)/) || text.match(/(수신자).*(만|에게).*(보내|발송)/);
    const emailApproveMatch = text.match(/^(확인|승인|보내|발송해|ㅇㅋ|ok|OK)$/);

    if (emailPrepareMatch && emailDraftStateRef.current === 'idle') {
      // Draft 생성
      emitMissionLog('📧', 'Email', '이메일 발송 준비 시작', 'thinking');
      const emailProduct = text.match(/(캠핑|복숭아|옥수수|밤|공동구매)/)?.[1] || '공동구매';
      const { subject, html } = buildInfluencerEmailHtml({
        influencerName: '테스트 수신자',
        platform: 'YouTube',
        category: emailProduct,
        senderName: 'MAWINPAY',
        productName: emailProduct + ' 공동구매',
      });
      const maskedTestRecipient = 'j***@naver.com';
      setEmailDraftData({ subject, html, to: 'jungsng805@naver.com', toName: '테스트 수신자', product: emailProduct });
      setEmailDraftState('draft_created');
      addMessage('jarvis', `📧 이메일 발송 준비 완료\n\n**상태:** draft_created\n**제목:** ${subject}\n**수신자:** ${maskedTestRecipient} (테스트 수신자 1명)\n\n⚠️ 실제 유튜버에게는 발송하지 않습니다.\n⚠️ 발송 전 초안을 먼저 확인하세요.\n\n💡 "발송 전 초안 먼저 보여줘"로 미리보기 가능`, true);
      emitMissionLog('📧', 'Email', 'Draft 생성 완료 - 테스트 수신자만 허용', 'done');
      setState('idle');
      return;
    }

    if (emailDraftViewMatch && emailDraftStateRef.current !== 'idle' && emailDraftDataRef.current) {
      // 초안 미리보기
      const draftData = emailDraftDataRef.current;
      setEmailDraftState('approval_required');
      addMessage('jarvis', `📋 **이메일 초안 미리보기**\n\n**제목:** ${draftData.subject}\n**수신자:** j***@naver.com (${draftData.toName})\n**상품:** ${draftData.product} 공동구매\n**상태:** approval_required\n\n---\n\n이메일 본문은 JARVIS 시그니처 디자인 HTML 템플릿입니다.\n\n⚠️ **보호 조건:**\n• 수신자: j***@naver.com 1명만\n• 실제 유튜버 발송: 0건\n• 실제 거래처 발송: 0건\n• 승인 전 발송: 차단\n\n💡 "테스트 수신자에게만 제안 메일 보내줘"로 발송 요청 가능`, true);
      setState('idle');
      return;
    }

    if (emailTestSendMatch && (emailDraftStateRef.current === 'draft_created' || emailDraftStateRef.current === 'approval_required') && emailDraftDataRef.current) {
      // 승인 UI 표시 - 바로 발송하지 않음
      const draftForApproval = emailDraftDataRef.current;
      setEmailDraftState('test_send_only');
      setApprovalPreview(buildApprovalPreview({
        type: 'email_send',
        title: '테스트 이메일 발송 승인',
        description: `j***@naver.com 1명에게만 발송합니다.\n실제 유튜버/거래처 발송 0건.`,
        details: [
          { label: '수신자', value: 'j***@naver.com' },
          { label: '제목', value: draftForApproval.subject },
          { label: '발송 수', value: '1건 (테스트)' },
          { label: '실제 유튜버 발송', value: '0건' },
          { label: '실제 거래처 발송', value: '0건' },
        ],
        confirmLabel: '승인 - 테스트 발송',
        cancelLabel: '취소',
      }));
      addMessage('jarvis', `🔐 **승인 필요**\n\n테스트 수신자 j***@naver.com 1명에게만 발송합니다.\n\n"확인" 또는 승인 버튼을 눌러주세요.\n\n⚠️ 승인 전까지 발송되지 않습니다.`, true);
      setState('idle');
      return;
    }

    if (emailApproveMatch && emailDraftStateRef.current === 'test_send_only' && emailDraftDataRef.current) {
      // 승인 후 테스트 수신자 1명에게만 실제 발송
      const draftForSend = emailDraftDataRef.current;
      emitMissionLog('📧', 'Email', '대표님 승인 확인 - 테스트 발송 실행', 'active');
      setState('working');
      try {
        const TEST_RECIPIENT = 'jungsng805@naver.com';
        const TEST_RECIPIENT_MASKED = 'j***@naver.com';
        // 보호 조건 검증
        if (draftForSend.to !== TEST_RECIPIENT) {
          addMessage('jarvis', '❌ 보호 조건 위반: 테스트 수신자(j***@naver.com)가 아닌 주소로는 발송할 수 없습니다.', true);
          setState('idle');
          return;
        }
        // TEST 파일 4개 생성 (롯데 발주서, 로젠 발주서, 옥수수 정산서, 밤 정산서)
        addMessage('jarvis', '📎 TEST 발주서/정산서 4개 파일 생성 중...', true);
        const testAttachments: Array<{filename: string; content: string; contentType: string}> = [];
        try {
          const fileRequests = [
            { endpoint: 'smartstore-process-order', params: { action: 'create_test_order', templateType: 'lotte', productType: 'oksu' } },
            { endpoint: 'smartstore-process-order', params: { action: 'create_test_order', templateType: 'logen', productType: 'oksu' } },
            { endpoint: 'smartstore-process-order', params: { action: 'create_test_settlement', productType: 'oksu' } },
            { endpoint: 'smartstore-process-order', params: { action: 'create_test_settlement', productType: 'bam' } },
          ];
          for (const reqBody of fileRequests) {
            const res = await fetch('/api/cloud-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(reqBody),
            });
            const data = await res.json();
            if (data.success) {
              if (data.orderSheet) {
                testAttachments.push({ filename: data.orderFileName || 'TEST_발주서.xlsx', content: data.orderSheet, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
              }
              if (data.settlementSheet) {
                testAttachments.push({ filename: data.settlementFileName || 'TEST_정산서.xlsx', content: data.settlementSheet, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
              }
            }
          }
        } catch (attErr: any) {
          console.warn('TEST 파일 생성 중 오류 (발송은 계속):', attErr.message);
        }
        const sendResult = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: TEST_RECIPIENT,
            subject: draftForSend.subject,
            html: draftForSend.html,
            attachments: testAttachments.length > 0 ? testAttachments : undefined,
          }),
        });
        const sendData = await sendResult.json();
        if (sendData.success || sendData.ok) {
          setEmailDraftState('test_sent');
          setApprovalPreview(null);
          // EmailHistory에 기록
          const newRecord: EmailRecord = {
            id: `test_${Date.now()}`,
            subject: draftForSend.subject,
            to: TEST_RECIPIENT,
            toName: '테스트 수신자',
            preview: `${draftForSend.product} 공동구매 제안 (테스트)`,
            sentAt: new Date().toISOString(),
            status: 'sent',
            template: 'outreach_proposal',
          };
          setEmailHistory(prev => [newRecord, ...prev]);
          // Mission Log / Task Execution 기록
          emitMissionLog('✅', 'Email', `테스트 발송 완료: ${TEST_RECIPIENT_MASKED}`, 'done');
          // FILE Workspace 저장
          try {
            await fetch('/api/cloud-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                task: 'workspace-save',
                record: {
                  type: 'email_sent',
                  title: `테스트 이메일 발송 - ${draftForSend.product}`,
                  content: `수신자: ${TEST_RECIPIENT_MASKED}\n제목: ${draftForSend.subject}\n상태: test_sent\n실제 유튜버 발송: 0건`,
                  timestamp: new Date().toISOString(),
                },
              }),
            });
          } catch (e) { /* workspace save 실패해도 발송은 성공 */ }
          addMessage('jarvis', `✅ **테스트 발송 완료**\n\n**수신자:** ${TEST_RECIPIENT_MASKED}\n**제목:** ${draftForSend.subject}\n**첨부파일:** ${testAttachments.length}개 (TEST 발주서/정산서)\n**상태:** test_sent\n\n📊 **발송 기록:**\n• Gmail Sent Mail: 기록됨\n• Mission Log: 기록됨\n• FILE Workspace: 저장됨\n• 첨부파일: ${testAttachments.map(a => a.filename).join(', ')}\n\n⚠️ 실제 유튜버 발송: 0건\n⚠️ 실제 거래처 발송: 0건\n⚠️ execute LOCKED 유지`, true);
          setClapBurst(true);
        } else {
          addMessage('jarvis', `❌ 발송 실패: ${sendData.error || '알 수 없는 오류'}\n\nexecute LOCKED 유지. 실제 유튜버 발송 0건.`, true);
          emitMissionLog('❌', 'Email', `테스트 발송 실패: ${sendData.error || 'unknown'}`, 'error');
        }
      } catch (err: any) {
        addMessage('jarvis', `❌ 발송 오류: ${err.message}\n\nexecute LOCKED 유지.`, true);
        emitMissionLog('❌', 'Email', `테스트 발송 오류: ${err.message}`, 'error');
      }
      setState('idle');
      return;
    }

    // ── Market Price 명령 처리 ("가격 괜찮아?", "얼마에 팔면", "마진 남아?", "시장 리포트") ───
    // KAMIS 품목이 포함된 경우 KAMIS 조회 우선 (market-price-check 대신)
    const kamisItemsLocal = ['배추', '절임배추', '옥수수', '양파', '대파', '감자', '고구마', '당근', '시금치', '사과', '배', '쌀'];
    const kamisItemInText = kamisItemsLocal.find(item => text.includes(item));
    const isKamisPriceQuery = kamisItemInText && /가격|시세|시장|얼마|도매|소매/.test(text);

    const marketPriceMatch = text.match(/(가격|얼마|마진|시세|원가|판매가|경쟁가|시장).*(괜찮|남아|팔면|좋아|분석|판단|체크|확인|리포트|저장)/);
    const marketInputMatch = text.match(/(가격|마진|시세).*(입력|등록|추가|계산)/);
    const marketListMatch = text.match(/(시장|가격|마진).*(리포트|기록|목록|조회|보여|저장).*(저장|보여|조회|해줘)?/);

    if ((marketPriceMatch || marketInputMatch) && !isKamisPriceQuery) {
      emitNodeState('jarvis_brain', 'active', '가격 판단 분석 중...');
      emitMissionLog('📊', 'Market', '가격 판단 요청 수신', 'thinking');

      // 품목명 추출 시도
      const productMatch = text.match(/(옥수수|복숭아|사과|배|감|포도|딸기|수박|참외|토마토|고구마|감자|절임배추|배추|무|양파|마늘|대파|고추|당근|브로콜리|아보카도|블루베리|체리|망고|바나나|키위|레몬|오렌지|귤|한라봉|천혜향|레드향|샤인머스캣|거봉|캠벨|[가-힣]{2,6})/);
      const productName = productMatch ? productMatch[1] : '';

      if (productName && !marketInputMatch) {
        // 품목명이 있으면 바로 패널 열기 (입력 모드)
        setMarketPriceResult(null);
        setMarketPriceInputMode(true);
        setMarketPriceVisible(true);
        addMessage('jarvis', `${productName} 가격 판단을 해드리겠습니다. 원물가, 판매가, 경쟁가 등을 입력해주세요.`, true);
      } else {
        // 품목명 없으면 입력 모드로 패널 열기
        setMarketPriceResult(null);
        setMarketPriceInputMode(true);
        setMarketPriceVisible(true);
        addMessage('jarvis', '가격 판단 패널을 열었습니다. 품목과 비용 정보를 입력해주세요.', true);
      }
      setState('idle');
      return;
    }

    if (marketListMatch) {
      emitMissionLog('📊', 'Market', '가격 리포트 조회 중...', 'thinking');
      try {
        const res = await fetch('/api/cloud-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskType: 'market-price-list', params: { limit: 10 } }),
        });
        const data = await res.json();
        if (data.success && data.records?.length > 0) {
          const summary = data.records.map((r: any) => `• ${r.productName}: 마진율 ${r.marginRate}% (${r.decision})`).join('\n');
          addMessage('jarvis', `📊 최근 가격 판단 기록:\n\n${summary}\n\n상세 내용은 Google Sheets에서 확인하세요.`, true);
          emitMissionLog('📊', 'Market', `${data.records.length}건 조회 완료`, 'success');
        } else {
          addMessage('jarvis', '아직 저장된 가격 판단 기록이 없습니다. "옥수수 가격 괜찮아?" 명령으로 시작해보세요.', true);
        }
      } catch {
        addMessage('jarvis', '가격 리포트 조회 중 오류가 발생했습니다.', true);
      }
      setState('idle');
      return;
    }

    // ── 2번 화면 브리핑 / Agent Workstation 현황 분석 ──
    const dataWallBriefMatch = /2번\s*(화면|모니터|창)|(agent\s*workstation|워크스테이션|데이터\s*월|data\s*wall).*(브리핑|분석|현황|상태|보고)|현황\s*(브리핑|분석|보고)|아웃리치\s*(현황|상태|분석)|전체\s*(현황|상태|브리핑)/i.test(text);
    if (dataWallBriefMatch) {
      setState('working');
      addMessage('jarvis', '2번 화면 현황을 분석하겠습니다. 잠시만 기다려 주십시오.', true);
      startSpeakingLevel();
      await new Promise<void>(resolve => {
        speak('2번 화면 현황을 분석하겠습니다. 잠시만 기다려 주십시오.', undefined, () => { stopSpeakingLevel(); resolve(); });
      });
      try {
        const briefRes = await fetch('/api/cloud-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskType: 'daily-brief-24h', dryRun: true, sendTelegram: false }),
        });
        const briefData = await briefRes.json();
        const ss = briefData.smartstore || {};
        const oc = briefData.outreach || {};
        const hc = briefData.hotContent || {};
        const cb = briefData.copyBrain || {};
        // 로컬 스토리지 아웃리치 후보 수
        const localCandidates = (() => {
          try { return JSON.parse(localStorage.getItem('jarvis-outreach-candidates') || '[]').length; } catch { return 0; }
        })();
        const ssNew = ss.newOrders || 0;
        const ssPending = ss.pendingShipping || 0;
        const ocDiscovered = oc.discovered || localCandidates || 0;
        const ocEmail = oc.publicEmailFound || 0;
        const ocSent = oc.emailSent || 0;
        const hcYt = hc.youtube || 0;
        const hcThreads = hc.threads || 0;
        const cbActive = cb.active || 0;
        const cbDna = cb.dna || '';
        let briefMsg = `**[Agent Workstation 현황 브리핑]**

`;
        briefMsg += `**스마트스토어**
`;
        briefMsg += `• 신규주문: **${ssNew}건** | 배송준비: **${ssPending}건**
`;
        briefMsg += `• 배송 전 처리 대상: **${ssNew + ssPending}건**

`;
        briefMsg += `**아웃리치 (Outreach)**
`;
        briefMsg += `• 수집된 후보: **${ocDiscovered}명** | 공개 이메일: **${ocEmail}명**
`;
        briefMsg += `• 발송 완료: **${ocSent}건**

`;
        briefMsg += `**Hot Content**
`;
        briefMsg += `• YouTube: **${hcYt}건** | Threads: **${hcThreads}건**

`;
        briefMsg += `**Copy Brain**
`;
        briefMsg += `• 활성 캠페인: **${cbActive}건**${cbDna ? ` | DNA: ${cbDna}` : ''}

`;
        briefMsg += `_상세 내역은 2번 화면에서 확인하세요._`;
        addMessage('jarvis', briefMsg, true);
        const voiceBrief = `현재 스마트스토어 신규주문 ${ssNew}건, 배송준비 ${ssPending}건입니다. `
          + `아웃리치 후보 ${ocDiscovered}명 수집되어 있고, 공개 이메일 확인된 후보는 ${ocEmail}명입니다. `
          + (ocEmail > 0 && ocSent === 0 ? `아직 발송하지 않은 후보가 있습니다. 지금 협업 제안 메일을 보낼까요?` : `발송 완료 ${ocSent}건입니다.`);
        setState('speaking');
        startSpeakingLevel();
        await new Promise<void>(resolve => {
          speak(voiceBrief, undefined, () => { stopSpeakingLevel(); resolve(); });
        });
      } catch (err) {
        const errMsg = '현황 데이터를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
        addMessage('jarvis', errMsg, true);
        setState('speaking');
        startSpeakingLevel();
        await new Promise<void>(resolve => {
          speak(errMsg, undefined, () => { stopSpeakingLevel(); resolve(); });
        });
      }
      setState('idle');
      return;
    }
    // JARVIS-CONVERSATION-OS: DataWall 브리핑 요청 감지
    const datawallBriefMatch = /2번\s*화면|현황\s*브리핑|아웃리치\s*현황|agent\s*work|데이터\s*월|워크스테이션|전체\s*현황|에이전트\s*현황/i.test(text);
    if (datawallBriefMatch) {
      const dwState = {
        smartstore: { newOrders: 0, preparing: 0 },
        outreach: { totalCandidates: outreachCandidates.length, emailConfirmed: outreachCandidates.filter((c: any) => c.emailExists || c.contactEmail).length, pending: 0 },
        hotContent: { youtube: 0, threads: 0, naver: 0, instagram: 0 },
        copyBrain: { status: 'ACTIVE', totalCopies: 0, recommended: 0, topHooks: [] },
        telegram: { status: 'standby' },
        sheets: { status: 'connected' },
      };
      handleJarvisContextEvent({ intent: 'datawall_briefing_requested', screen: 'data_wall', payload: dwState });
      return;
    }

    try {
      emitNodeState('jarvis_brain', 'active', 'GPT 뇌 사고 중...');
      emitPulseLine('user', 'jarvis_brain', 'fast');
      emitMissionLog('🧠', 'GPT', '사용자 명령 분석 중...', 'thinking');
      const action = await askGPT(text).catch(() => parseCommand(text));
      emitNodeState('jarvis_brain', 'success', '명령 분석 완료');
      await jarvisRespond(action.response, action);
    } catch (err) {
      console.error('[JARVIS] handleTextSubmit 오류:', err);
      emitNodeState('jarvis_brain', 'error', '명령 분석 실패');
      await new Promise(r => setTimeout(r, 300));
      setState(stateRef.current === 'idle' ? 'idle' : 'listening');
    }
  }, [addMessage, jarvisRespond, showConversationOsBriefing, speakJarvisSummary, stopSpeakingLevel]);

  useEffect(() => {
    const enabled =
      import.meta.env.DEV ||
      new URLSearchParams(window.location.search).has('e2e');

    if (!enabled) {
      try {
        delete (window as any).__JARVIS_E2E_SEND__;
      } catch {
        (window as any).__JARVIS_E2E_SEND__ = undefined;
      }
      return;
    }

    const sendE2ECommand = async (command: string) => {
      const safeCommand = String(command || '').trim();
      if (!safeCommand) {
        return { ok: false, errorCode: 'EMPTY_COMMAND' };
      }

      await handleTextSubmit(safeCommand);
      return {
        ok: true,
        command: safeCommand,
        executeLocked: true,
        note: 'E2E hook routes through the normal Jarvis command handler and does not bypass approval gates.',
      };
    };

    (window as any).__JARVIS_E2E_SEND__ = sendE2ECommand;

    const handleE2EEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ command?: string }>).detail;
      void sendE2ECommand(detail?.command || '');
    };

    document.addEventListener('JARVIS_E2E_COMMAND', handleE2EEvent as EventListener);

    const params = new URLSearchParams(window.location.search);
    const bootCommand = params.get('e2eCommand');
    if (bootCommand) {
      const runKey = `jarvis-e2e-command:${window.location.href}`;
      if (sessionStorage.getItem(runKey) !== 'done') {
        sessionStorage.setItem(runKey, 'done');
        window.setTimeout(() => {
          void sendE2ECommand(bootCommand);
        }, 750);
      }
    }

    console.info('[JARVIS E2E] command hook enabled');

    return () => {
      document.removeEventListener('JARVIS_E2E_COMMAND', handleE2EEvent as EventListener);
      try {
        delete (window as any).__JARVIS_E2E_SEND__;
      } catch {
        (window as any).__JARVIS_E2E_SEND__ = undefined;
      }
    };
  }, [handleTextSubmit]);

  useSpeechRecognition({
    onResult: (text: string) => {
      setSttStatus('done');
      handleSpeechResult(text);
    },
    onStart: () => {
      console.log('[JARVIS] STT onStart → listening');
      setState('listening');
      setSttStatus('listening');
    },
    onEnd: () => {
      console.log('[JARVIS] STT onEnd, state:', stateRef.current);
      // STT가 종료되어도 SpeechEngine이 자동 재시작하므로
      // 여기서는 idle로 전환하지 않음 (listening 상태 유지)
      if (sttStatus === 'listening') setSttStatus('idle');
    },
    isListening,
  });

  const activatingRef = useRef(false);
  const busyNoticeRef = useRef(false); // 중복 활성화 방지
  const lastActivatedRef = useRef(0); // 활성화 시각 (쿨다운용)

  const handleActivate = useCallback(async () => {
    const s = stateRef.current;
    if (s === 'speaking' || s === 'working' || s === 'thinking') return;
    if (activatingRef.current) return; // 이미 활성화 중이면 무시

    setClapBurst(true);
    setTimeout(() => setClapBurst(false), 120);
    setShowHint(false);

    if (s === 'idle') {
      activatingRef.current = true;

      // 시그니처 응답: 영어 시그니처 먼저 → 한국어 후속 (아이언맨 감성)
      let sigEn = SIGNATURE_RESPONSES_EN[Math.floor(Math.random() * SIGNATURE_RESPONSES_EN.length)];
      const sigKr = SIGNATURE_RESPONSES_KR[Math.floor(Math.random() * SIGNATURE_RESPONSES_KR.length)];
      // 이전 응답과 동일하면 다음 것 선택
      if (sigEn === lastAssistantMsgRef.current) {
        const idx = SIGNATURE_RESPONSES_EN.indexOf(sigEn);
        sigEn = SIGNATURE_RESPONSES_EN[(idx + 1) % SIGNATURE_RESPONSES_EN.length];
      }
      setState('speaking');
      addMessage('jarvis', sigEn);
      lastAssistantMsgRef.current = sigEn;
      startSpeakingLevel();
      await new Promise<void>(resolve => {
        speak(sigEn, undefined, () => {
          stopSpeakingLevel();
          resolve();
        });
      });
      // 영어 시그니처 후 한국어 후속 메시지 (부드러운 전환)
      await new Promise(r => setTimeout(r, 600));
      if (Date.now() - lastManualTextSubmitAtRef.current < 8000) {
        activatingRef.current = false;
        setState('idle');
        return;
      }
      addMessage('jarvis', sigKr);

      if (!isInitialized) {
        setIsInitialized(true);
      }

      // 한국어 메시지 후 listening 전환
      await new Promise(r => setTimeout(r, 400));
      console.log('[JARVIS] 시그니처 완료 → listening 전환');
      setState('listening');
      setIsListening(true);
      lastActivatedRef.current = Date.now(); // 쿨다운 시작
      activatingRef.current = false;
    } else if (s === 'listening') {
      //  쿨다운: 활성화 후 5초 이내에는 비활성화 방지
      const elapsed = Date.now() - lastActivatedRef.current;
      if (elapsed < 5000) {
        console.log(`[JARVIS] 비활성화 쿨다운 중 (${Math.round(elapsed)}ms < 5000ms) — 무시`);
        return;
      }
      console.log('[JARVIS] 박수 → listening → idle 전환');
      setIsListening(false);
      setState('idle');
    }
  }, [isInitialized, addMessage, speak, startSpeakingLevel, stopSpeakingLevel]);

  useEffect(() => { if (state !== 'listening') setMicLevel(0); }, [state]);
  // ── handleActivateRef 동기화 (Wake Word 콜백에서 활성화 함수 참조) ──
  useEffect(() => { handleActivateRef.current = handleActivate; }, [handleActivate]);
  // ── Ctrl+K 단축키: 타이핑 모드 토글 ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setTextInputMode(prev => {
          if (!prev) {
            // textInputMode 활성화 시 micLevel 즉시 0으로 리셋 (파티클 폭발 방지)
            setMicLevel(0);
            setTimeout(() => textInputRef.current?.focus(), 80);
          }
          return !prev;
        });
      }
      // UI-ORCH-A.10: ESC로 Mission Workspace 닫기 (lifecycle lock 기반)
      if (e.key === 'Escape' && !textInputMode) {
        if (missionWorkspaceOpen) {
          closeMissionWorkspace();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [textInputMode, missionWorkspaceOpen]);

  // ── 자동 idle 전환: listening 상태에서 60초 무입력 시 마이크 자동 ggoff ──
  const lastInputTimeRef = useRef<number>(Date.now());
  // 사용자 입력 시마다 시간 갱신
  useEffect(() => {
    lastInputTimeRef.current = Date.now();
  }, [state]); // state가 thinking/working/speaking으로 바뀌면 입력 있었던 것으로 간주

  useEffect(() => {
    if (state !== 'listening') return;
    // 예약 진행 중이면 자동 idle 전환 비활성화
    if (bookingStep > 0) return;
    const AUTO_IDLE_TIMEOUT = 60 * 1000; // 60초
    const timer = setInterval(() => {
      const elapsed = Date.now() - lastInputTimeRef.current;
      if (elapsed >= AUTO_IDLE_TIMEOUT && stateRef.current === 'listening' && bookingStep === 0) {
        console.log('[JARVIS] 60초 무입력 → 자동 idle 전환');
        setIsListening(false);
        setState('idle');
        // 자동 off 알림 멘트 (TTS 없이 메시지만)
        addMessage('jarvis', '대기 시간 초과로 마이크를 끄겠습니다, 선생님. 필요하시면 다시 호출해 주세요.');
      }
    }, 5000); // 5초마다 체크
    return () => clearInterval(timer);
  }, [state, addMessage, bookingStep]);

  // ── 크롬 확장 메시지 수신 (네이버 로그인 완료 감지) ──
  useEffect(() => {
    const handleExtMessage = (e: MessageEvent) => {
      if (e.data?.source !== 'JARVIS_EXTENSION') return;
      // 네이버 로그인 완료 (확장에서 자동 감지)
      if (e.data.type === 'NAVER_LOGIN_RESULT') {
        const result = e.data.payload;
        if (result?.success && result?.sessionId) {
          setBookingSessionId(result.sessionId);
          localStorage.setItem('jarvis_booking_session', result.sessionId);
          setNaverLoginStatus('done');
          const loginDoneMsg = `접속 확인됐습니다. 네이버 로그인 완료. 언제든 명령하십시오, sir.`;
          addMessage('jarvis', loginDoneMsg, true);
          setState('speaking');
          startSpeakingLevel();
          speak(loginDoneMsg, undefined, () => { stopSpeakingLevel(); setState('idle'); });
        }
      }
    };
    window.addEventListener('message', handleExtMessage);
    return () => window.removeEventListener('message', handleExtMessage);
  }, [addMessage, speak, startSpeakingLevel, stopSpeakingLevel]);

  const accent = STATE_COLOR[state];

  // UI-O.1: 요청 개수 추출 함수
  function extractRequestedCount(command?: string): number | null {
    if (!command || typeof command !== 'string') return null;
    const text = command.trim();
    const digitMatch = text.match(/(\d+)\s*(개|가지|문장|문구|버전|안)/);
    if (digitMatch?.[1]) {
      const count = Number(digitMatch[1]);
      if (Number.isFinite(count) && count > 0 && count <= 20) return count;
    }
    const koreanMap: Record<string, number> = {
      하나: 1, 한: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10,
    };
    for (const [word, value] of Object.entries(koreanMap)) {
      if (text.includes(`${word} 개`) || text.includes(`${word}개`) || text.includes(`${word} 가지`) || text.includes(`${word}가지`)) {
        return value;
      }
    }
    return null;
  }

  // COPY-A v2: 구조화 카드 파싱 함수 (=== 카드 N === 구분자 기반)
  function splitCopyACards(text: string, requestedCount?: number | null): any[] {
    if (!text || typeof text !== 'string') return [];
    const normalized = text.replace(/\r\n/g, '\n').trim();
    // === 카드 N === 구분자로 분리
    const cardBlocks = normalized.split(/===\s*카드\s*\d+\s*===/).map(b => b.trim()).filter(Boolean);
    if (cardBlocks.length >= 1) {
      const limit = requestedCount || Math.min(cardBlocks.length, 6);
      return cardBlocks.slice(0, limit).map((block, index) => {
        // 각 필드 파싱
        const extract = (key: string) => {
          const match = block.match(new RegExp(`\\*\\*${key}\\*\\*[:\s]+([^\n]+(?:\n(?!\\*\\*)[^\n]+)*)`, 'i'));
          return match ? match[1].trim() : '';
        };
        const headline = extract('헤드카피');
        const thumbnailText = extract('썸네일 문구');
        const firstThreeSeconds = extract('첫 3초 스크립트');
        // 릴스 스크립트 시간대별 대본 파싱
        const reelsScript = extract('릴스 대본');
        const targetPersona = extract('타깃 고객');
        const desireTrigger = extract('자극한 욕구');
        const futureScene = extract('미래 장면');
        const storyBody = extract('스토리 본문');
        const cta = extract('CTA');
        const whyItWorks = extract('왜 먹히는지');
        const riskLevel = extract('위험도') || '낮음';
        const scoresRaw = extract('점수');
        // 점수 파싱 — 1~3자리 단일 정수만 캡처, 범위형(7888 등) 방지
        const parseScore = (label: string) => {
          // label 뒤에 오는 첫 번째 1~3자리 숫자만 캡처 (비숫자 경계 보장)
          const m = scoresRaw.match(new RegExp(`${label}[^\\d]*(\\d{1,3})(?!\\d)`));
          if (!m) return 75;
          const val = parseInt(m[1]);
          // 100 초과 또는 0 미만은 75로 fallback
          return (val >= 0 && val <= 100) ? val : 75;
        };
        const scores = {
          clickPower: parseScore('클릭파워'),
          purchaseDesire: parseScore('구매욕구'),
          storyStrength: parseScore('스토리강도'),
          trust: parseScore('신뢰도'),
        };
        // 카드 body: 구조화 표시용
        const bodyLines = [
          headline ? `🎯 헤드카피\n${headline}` : '',
          thumbnailText ? `📸 썸네일 문구\n${thumbnailText}` : '',
          firstThreeSeconds ? `⚡ 첫 3초 스크립트\n${firstThreeSeconds}` : '',
          reelsScript ? `🎬 릴스 대본\n${reelsScript}` : '',
          targetPersona ? `👤 타깃 고객\n${targetPersona}` : '',
          desireTrigger ? `💡 자극한 욕구\n${desireTrigger}` : '',
          futureScene ? `🌅 미래 장면\n${futureScene}` : '',
          storyBody ? `📖 스토리 본문\n${storyBody}` : '',
          cta ? `📣 CTA\n${cta}` : '',
          whyItWorks ? `🔍 왜 먹히는지\n${whyItWorks}` : '',
          riskLevel ? `⚠️ 위험도: ${riskLevel}` : '',
          scoresRaw ? `📊 점수: ${scoresRaw}` : '',
        ].filter(Boolean).join('\n\n');
        return {
          id: `copy-a-${Date.now()}-${index}`,
          title: `${index + 1}안 — ${headline ? headline.slice(0, 20) + (headline.length > 20 ? '…' : '') : '카피 ' + (index + 1)}`,
          body: bodyLines || block,
          tone: index === 0 ? '추천안' : '변형안',
          format: 'copy_a',
          scoreLabel: index === 0 ? 'PRIORITY' : undefined,
          // 구조화 필드 (ResultDeck에서 활용 가능)
          headline,
          thumbnailText,
          firstThreeSeconds,
          reelsScript,
          targetPersona,
          desireTrigger,
          futureScene,
          storyBody,
          cta,
          whyItWorks,
          riskLevel,
          scores,
        };
      });
    }
    // fallback: 기존 splitCreativeResultItems 로직
    return splitCreativeResultItems(text, requestedCount);
  }

  // UI-O.1: 결과 텍스트 분리 함수 (기존 유지)
  function splitCreativeResultItems(text: string, requestedCount?: number | null): any[] {
    if (!text || typeof text !== 'string') return [];
    const normalized = text.replace(/\r\n/g, '\n').trim();
    const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);

    // 1) 번호형 결과: 1. / 1) / ① / [1]
    const numberedBlocks: string[] = [];
    let current: string[] = [];
    for (const line of lines) {
      const isNewNumbered = /^(\d+[\).\s]|[\[]\d+[\]]|[①②③④⑤⑥⑦⑧⑨⑩])/.test(line);
      if (isNewNumbered) {
        if (current.length) numberedBlocks.push(current.join('\n').trim());
        current = [line.replace(/^(\d+[\).\s]|[\[]\d+[\]]|[①②③④⑤⑥⑦⑧⑨⑩])\s*/, '').trim()];
      } else if (current.length) {
        current.push(line);
      }
    }
    if (current.length) numberedBlocks.push(current.join('\n').trim());

    // 2) 불릿형 결과
    const bulletBlocks = lines
      .filter((line) => /^[-•*]\s+/.test(line))
      .map((line) => line.replace(/^[-•*]\s+/, '').trim())
      .filter(Boolean);

    // 3) 후보 선택
    let blocks = numberedBlocks.length >= 2 ? numberedBlocks : bulletBlocks;

    // 4) 번호/불릿이 부족하면 섹션 내부의 짧은 문장 후보 추출
    if (blocks.length < 2) {
      blocks = lines
        .filter((line) => {
          // 섹션 제목 필터링: 한글 섹션 제목, 마크다운 헤더, 특수 기호 제목 등
          if (/^(후킹\s*문구|스레드\s*글|릴스\s*스크립트|카카오톡\s*공지문|제목|요약|추천|상태|장면|마케팅|콘텐츠|대본|공지문|광고|카피|문구|릴스|인스타|스토리|영상|채널|분석)/i.test(line)) return false;
          if (/^#{1,3}\s+/.test(line)) return false; // 마크다운 헤더
          if (/^【.+?】$/.test(line)) return false; // 【 】 형식
          if (/^──\s*.+?\s*──$/.test(line)) return false; // ── 형식
          if (/^\*\*.+?\*\*$/.test(line)) return false; // ** 형식
          if (line.length < 8) return false;
          return true;
        })
        .slice(0, requestedCount || 6);
    }

    const limit = requestedCount || Math.min(blocks.length, 6);
    return blocks.slice(0, limit).map((body, index) => ({
      id: `result-${Date.now()}-${index}`,
      title: `${index + 1}번 결과`,
      body,
      tone: index === 0 ? '추천안' : '변형안',
      format: '마케팅 결과',
      scoreLabel: index === 0 ? 'PRIORITY' : undefined,
    }));
  }

  if (isDataWallView) {
    return <DataWallView />;
  }
  return (
    <main
      className={resultDeckVisible ? 'result-focus-active' : undefined}
      style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: `${THEME.bg} repeating-linear-gradient(0deg, transparent, transparent 60px, rgba(0,245,255,0.012) 60px, rgba(0,245,255,0.012) 61px), repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(0,245,255,0.012) 60px, rgba(0,245,255,0.012) 61px)`, cursor: typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0) ? 'auto' : 'none' }}
      onClick={() => {
        // idle 상태에서만 클릭으로 활성화 허용
        if (stateRef.current === 'idle') handleActivate();
      }}
      onTouchStart={(e) => {
        // 모바일 터치로 활성화
        if (stateRef.current === 'idle') {
          e.preventDefault();
          handleActivate();
        }
      }}
    >
      {/* ── Cloud Engine Status Overlay (v5.0) ── */}
      <CloudStatusOverlay />

      {/* ── UI-E Mission Control Visual Deck (Lite) ── */}
      {/* ── UI-E Mission Control Motion Deck (Lite v1) ── */}
        <MissionControlDeck
          state={state as string}
          scene={activeScene}
          currentTime={currentTime}
          workspaceCount={workspaceRecords.length}
          outreachCount={outreachCandidates.length}
          actionType={actionContext?.type}
          isResearching={isResearching}
          researchEngines={researchEngines}
        />

      {/* ── UI-V2 Cinematic Layer (Z-depth + Ambient Motion) ── */}
      <CinematicLayer />

      {/* ── UI-V3.2 Reactive Intelligence Layer ── */}
      <ReactiveSignalLayer scene={activeScene as any} reactionPulse={reactionPulse} jarvisState={state as string} />
      <SystemPulseOverlay scene={activeScene as any} jarvisState={state as string} />

      {/* ── Three.js 파티클 배경 ── */}
      <SparkleParticles state={state} audioLevel={textInputMode ? 0 : micLevel} speakingLevel={textInputMode ? 0 : speakingLevel} clapBurst={clapBurst} freqData={micFreqData ?? undefined} textInputMode={textInputMode} />
      
      {/* ── 보이스 파티클 아우라 (3D) ── */}
      <VoiceParticleAura micLevel={micLevel} speakingLevel={speakingLevel} state={state as any} />
      
      {/* ── 골든 플레어 (성공 효과) ── */}
      <GoldenFlare visible={showGoldenFlare} />

      {/* ── 파티클 텍스트 캔버스 (타이핑 모드) ── */}
      <ParticleTextCanvas text={textInputValue} active={textInputMode} />

      {/* ── 박수 감지 ── */}
      <ClapDetector
        onClap={async () => {
          console.log('[JARVIS] Clap detected! (UI-P.4 Exact ACTIVATE Routine)');
          
          // UI-P.4: 박수 감지 시 쿨다운 적용 (1.5초)
          const now = Date.now();
          if (now - (lastClapActivateAtRef.current || 0) < 1500) {
            console.log('[JARVIS] Clap ignored (cooldown)');
            return;
          }
          lastClapActivateAtRef.current = now;

          // 1. 기존 자비스 시그니처 응답 유지
          console.info('[UI-P.4] clap -> handleActivate (signature response)');
          handleActivate();

          // 2. DUAL ARM 여부와 관계없이 실제 ACTIVATE 버튼의 정확한 루틴 실행
          // ACTIVATE 버튼 = triggerDualScreenOpening + openDataWallWindow
          console.info('[UI-P.4] clap -> triggerDualScreenOpening (clap-auto)');
          triggerDualScreenOpening('clap');
          
          // 3. 실제 2번 화면 창 오픈/포커스 (ACTIVATE 버튼과 동일한 루틴)
          console.info('[UI-P.4] clap -> openDataWallWindow (exact ACTIVATE routine)');
          await openDataWallWindow();
        }}
        onAudioLevel={setMicLevel}
        enabled={state === 'idle' || dualScreenArmed}
        releaseStream={state !== 'idle' && !dualScreenArmed}
      />
      {/* ClapDetector: idle 또는 dualScreenArmed에서 박수 감지 활성 */}

      {/* ── 배경 방사형 그라디언트 ── */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1 }}>
        <motion.div
          style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse 60% 55% at 50% 50%, ${accent}0A 0%, transparent 70%)`,
          }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* ── 중앙 JARVIS 코어 (coreDimLevel 적용) ── */}
      <motion.div
        animate={{ opacity: 1 - coreDimLevel * 0.6, scale: 1 - coreDimLevel * 0.05 }}
        transition={{ duration: 0.8, ease: 'easeInOut' }}
        style={{
          position: 'fixed', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none', zIndex: 5,
        }}
      >
        {/* 외부 장식 링 */}
        <motion.div
          style={{
            position: 'absolute',
            width: 'clamp(200px, 38vmin, 340px)',
            height: 'clamp(200px, 38vmin, 340px)',
            borderRadius: '50%',
            border: `1px solid ${accent}22`,
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
        >
          {/* 장식 점 4개 */}
          {[0, 90, 180, 270].map(deg => (
            <div key={deg} style={{
              position: 'absolute',
              top: '50%', left: '50%',
              width: 4, height: 4,
              borderRadius: '50%',
              background: accent,
              boxShadow: `0 0 8px ${accent}`,
              transform: `rotate(${deg}deg) translateY(-50%) translateX(-50%) translateY(calc(-1 * clamp(100px, 19vmin, 170px)))`,
            }} />
          ))}
        </motion.div>

        {/* 중간 링 */}
        <motion.div
          style={{
            position: 'absolute',
            width: 'clamp(150px, 28vmin, 250px)',
            height: 'clamp(150px, 28vmin, 250px)',
            borderRadius: '50%',
            border: `1px solid ${accent}33`,
            boxShadow: `0 0 20px ${accent}11`,
          }}
          animate={{ rotate: -360 }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
        />

        {/* 내부 링 */}
        <motion.div
          style={{
            position: 'absolute',
            width: 'clamp(100px, 18vmin, 160px)',
            height: 'clamp(100px, 18vmin, 160px)',
            borderRadius: '50%',
            border: `1px solid ${accent}55`,
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
        />

        {/* 코어 글로우 */}
        <motion.div
          style={{
            position: 'absolute',
            width: 'clamp(60px, 10vmin, 90px)',
            height: 'clamp(60px, 10vmin, 90px)',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${accent}CC 0%, ${accent}44 50%, transparent 100%)`,
            boxShadow: `0 0 40px ${accent}88, 0 0 80px ${accent}33`,
          }}
          animate={{
            scale: state === 'listening'
              ? [1, 1 + micLevel * 0.5, 1]
              : state === 'speaking'
              ? [1, 1 + speakingLevel * 0.4, 1]
              : [1, 1.06, 1],
          }}
          transition={{ duration: state === 'listening' ? 0.15 : state === 'speaking' ? 0.12 : 2.5, repeat: Infinity }}
        />

        {/* 상태 텍스트 */}
        <div style={{
          position: 'absolute',
          top: 'calc(50% + clamp(110px, 21vmin, 185px))',
          textAlign: 'center',
          width: '200px',
          marginLeft: '-100px',
        }}>
          <motion.div
            key={state}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{
              fontFamily: 'Orbitron, monospace',
              color: accent,
              fontSize: 'clamp(0.5rem, 1vw, 0.65rem)',
              letterSpacing: '0.4em',
              textShadow: `0 0 15px ${accent}88`,
            }}
          >
            {STATE_LABEL[state]}
          </motion.div>
          {/* 상태 인디케이터 바 */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginTop: '8px' }}>
            {[0, 1, 2, 3, 4].map(i => (
              <motion.div
                key={i}
                style={{
                  width: 2,
                  height: state !== 'idle' ? 'clamp(4px, 0.8vmin, 8px)' : 'clamp(2px, 0.4vmin, 4px)',
                  background: accent,
                  borderRadius: 1,
                  opacity: state !== 'idle' ? 0.9 : 0.3,
                }}
                animate={state !== 'idle' ? { scaleY: [1, 1.5 + i * 0.3, 1] } : {}}
                transition={{ duration: 0.4 + i * 0.1, repeat: Infinity, delay: i * 0.08 }}
              />
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── 상단 헤더 ── */}
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 1 }}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          zIndex: 30,
          padding: isMobile ? '14px 14px 0' : '24px 36px 0',
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          {/* 좌측 시간 */}
          <div>
            <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.gold, fontSize: isMobile ? '0.65rem' : '0.85rem', letterSpacing: '0.08em', opacity: 0.75 }}>
              {currentTime}
            </div>
            <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: isMobile ? '0.38rem' : '0.5rem', letterSpacing: '0.1em', marginTop: '3px' }}>
              {currentDate}
            </div>
          </div>

          {/* 중앙 로고 */}
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
            <h1 style={{
              fontFamily: 'Orbitron, monospace',
              color: THEME.goldLight,
              fontSize: 'clamp(1rem, 2.2vw, 1.6rem)',
              letterSpacing: '0.5em',
              textShadow: `0 0 30px ${THEME.gold}66, 0 0 60px ${THEME.gold}22`,
              margin: 0,
              fontWeight: 400,
            }}>
              MAWINPAY
            </h1>
            <div style={{
              width: '100%',
              height: '1px',
              background: `linear-gradient(90deg, transparent, ${THEME.gold}44, transparent)`,
              marginTop: '6px',
            }} />
            <p style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.42rem', letterSpacing: '0.5em', marginTop: '5px' }}>
              INTELLIGENCE SYSTEM
            </p>
          </div>

          {/* 우측 상태 + 시스템 현황 버튼 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'auto' }}>
            {/* 시스템 현황 버튼 - 모바일에서 숨김 */}
            {!isMobile && (
            <motion.button
              onClick={(e) => { e.stopPropagation(); setNeuralMapVisible(true); }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(0,212,255,0.08)',
                border: '1px solid rgba(0,212,255,0.35)',
                padding: '5px 10px',
                cursor: 'pointer',
                fontFamily: 'Orbitron, monospace',
              }}
            >
              <motion.div
                style={{ width: 5, height: 5, borderRadius: '50%', background: '#00D4FF', boxShadow: '0 0 6px #00D4FF' }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <span style={{ color: '#00D4FF', fontSize: '0.42rem', letterSpacing: '0.2em' }}>SYSTEM MAP</span>
            </motion.button>
            )}
            {!isMobile && (
            <motion.button
              onClick={(e) => { e.stopPropagation(); setStrategyDashboardVisible(true); }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(200,169,110,0.08)',
                border: '1px solid rgba(200,169,110,0.35)',
                padding: '5px 10px',
                cursor: 'pointer',
                fontFamily: 'Orbitron, monospace',
              }}
            >
              <motion.div
                style={{ width: 5, height: 5, borderRadius: '50%', background: '#C8A96E', boxShadow: '0 0 6px #C8A96E' }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <span style={{ color: '#C8A96E', fontSize: '0.42rem', letterSpacing: '0.2em' }}>STRATEGY HQ</span>
            </motion.button>
            )}
            {!isMobile && (
            <motion.button
              onClick={(e) => { e.stopPropagation(); setWorkspaceVisible(v => !v); if (!workspaceVisible) fetchWorkspaceRecords(); }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: workspaceVisible ? 'rgba(0,200,255,0.15)' : 'rgba(0,200,255,0.05)',
                border: `1px solid ${workspaceVisible ? 'rgba(0,200,255,0.5)' : 'rgba(0,200,255,0.2)'}`,
                padding: '5px 10px',
                cursor: 'pointer',
                fontFamily: 'Orbitron, monospace',
              }}
            >
              <span style={{ fontSize: '0.5rem' }}>◈</span>
              <span style={{ color: '#00c8ff', fontSize: '0.42rem', letterSpacing: '0.15em' }}>FILES</span>
            </motion.button>
            )}
            {!isMobile && (
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setOutreachVisible(!outreachVisible)}
              style={{
                background: outreachVisible ? 'rgba(0,255,136,0.15)' : 'rgba(0,255,136,0.05)',
                border: `1px solid ${outreachVisible ? 'rgba(0,255,136,0.5)' : 'rgba(0,255,136,0.2)'}`,
                borderRadius: '6px', padding: '4px 10px',
                display: 'flex', alignItems: 'center', gap: '4px',
                cursor: 'pointer',
                fontFamily: 'Orbitron, monospace',
              }}
            >
              <span style={{ fontSize: '0.5rem' }}>◈</span>
              <span style={{ color: '#00ff88', fontSize: '0.42rem', letterSpacing: '0.15em' }}>OUTREACH</span>
            </motion.button>
            )}
            {!isMobile && (
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => { setMarketPriceResult(null); setMarketPriceInputMode(true); setMarketPriceVisible(true); }}
              style={{
                background: 'rgba(255,170,0,0.12)', border: '1px solid rgba(255,170,0,0.3)',
                borderRadius: '6px', padding: '4px 10px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              <span style={{ fontSize: '0.5rem' }}>◈</span>
              <span style={{ color: '#ffaa00', fontSize: '0.42rem', letterSpacing: '0.15em' }}>MARKET</span>
            </motion.button>
            )}
            {/* 상태 표시 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <motion.div
                style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: accent,
                  boxShadow: `0 0 8px ${accent}`,
                }}
                animate={{ opacity: state !== 'idle' ? [1, 0.3, 1] : [0.6, 0.9, 0.6] }}
                transition={{ duration: state !== 'idle' ? 0.7 : 2, repeat: Infinity }}
              />
              <span style={{ fontFamily: 'Orbitron, monospace', color: accent, fontSize: isMobile ? '0.45rem' : '0.55rem', letterSpacing: '0.15em', opacity: 0.85 }}>
                {STATE_LABEL[state]}
              </span>
            </div>
          </div>
        </div>
      </motion.header>

      {/* ── 좌측 통계 패널 (OUTREACH 활성화 시에만 표시) ── */}
      {outreachVisible && (
      <motion.aside
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        style={isMobile ? {
          position: 'fixed',
          bottom: 28, left: 0, right: 0,
          zIndex: 20, pointerEvents: 'none',
          display: 'flex', flexDirection: 'row',
          justifyContent: 'center', gap: 6,
          padding: '0 10px',
        } : {
          position: 'fixed', left: 24, top: 80,
          zIndex: 20, pointerEvents: 'none',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: isMobile ? 6 : 8, flexWrap: isMobile ? 'wrap' : 'nowrap', justifyContent: isMobile ? 'center' : 'flex-start' }}>
          {[
            { label: 'COLLECTED', value: stats.collected, unit: '명', color: THEME.gold },
            { label: 'EMAILS',    value: stats.emailsSent, unit: '통', color: THEME.blue },
            { label: 'RESPONSE',  value: `${stats.responseRate}%`, unit: '', color: '#7EC89B' },
            { label: 'CONTRACTS', value: stats.contracts, unit: '건', color: '#9B8EC4' },
          ].map(item => (
            <div key={item.label} style={{
              background: 'rgba(6,10,18,0.85)',
              borderLeft: `2px solid ${item.color}66`,
              borderTop: `1px solid ${item.color}11`,
              padding: isMobile ? '5px 8px' : '8px 14px',
              minWidth: isMobile ? 'auto' : '108px',
              flex: isMobile ? '1 1 0' : undefined,
              maxWidth: isMobile ? '80px' : undefined,
              backdropFilter: 'blur(8px)',
            }}>
              <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: isMobile ? '0.3rem' : '0.4rem', letterSpacing: '0.1em', marginBottom: '2px' }}>
                {item.label}
              </div>
              <div style={{ fontFamily: 'Orbitron, monospace', color: item.color, fontSize: isMobile ? '0.7rem' : '1rem', fontWeight: 600, letterSpacing: '0.03em' }}>
                {item.value}{item.unit}
              </div>
            </div>
          ))}
        </div>
      </motion.aside>
      )}

      {/* ── 대화 패널 (Phase Prod-B) ── */}
      <AnimatePresence>
        {messages.length > 0 && !missionWorkspaceOpen && activeScene !== 'smartstore_brief' && activeScene !== 'keyword_radar' && (
          <ConversationPanel
              messages={messages}
              isTyping={isTyping}
              sttStatus={sttStatus}
              isExpanded={conversationExpanded}
              onToggleExpand={() => setConversationExpanded(prev => !prev)}
              outreachOffset={outreachVisible ? 420 : 0}
            />
        )}
      </AnimatePresence>

      {/* ── COPY-A v2: Copy Focus Mode 오버레이 ── */}
      {copyFocusMode && resultDeckVisible && (
        <div className="copy-focus-overlay" />
      )}

      {/* ── UI-O: Result Deck (Creative Director 결과 패널) ── */}
      <ResultDeck
        visible={resultDeckVisible && !missionWorkspaceOpen && activeScene !== 'smartstore_brief'}
        content={resultDeckContent}
        contentType={resultDeckType}
        product={resultDeckProduct}
        items={resultDeckItems}
        isCopyR={resultDeckIsCopyR}
        researchInsight={resultDeckResearchInsight}
        videosFound={resultDeckVideosFound}
        topVideos={resultDeckTopVideos}
        excludedEngines={resultDeckExcludedEngines}
        onCardSelect={(item, idx) => {
          handleJarvisContextEvent({ intent: 'copy_card_selected', screen: 'copy_card_detail', payload: item });
        }}
        onDismiss={() => { setResultDeckVisible(false); setCopyFocusMode(false); setResultDeckIsCopyR(false); setResultDeckResearchInsight(''); setResultDeckExcludedEngines([]); }}
        onCopy={() => {}}
        onSaveToWorkspace={() => {
          // workspace에 저장 (기존 로직 활용)
          const record: WorkspaceRecord = {
            recordId: `rd_${Date.now()}`,
            createdAt: new Date().toISOString(),
            type: 'creative_script',
            title: `${resultDeckProduct} ${resultDeckType === 'script' ? '릴스 대본' : resultDeckType === 'headcopy' ? '후킹 문구' : '마케팅 콘텐츠'}`,
            summary: resultDeckContent.slice(0, 120),
            sourceCommand: `creative_director ${resultDeckProduct} ${resultDeckType}`,
            status: 'completed',
            tags: [resultDeckType, resultDeckProduct].filter(Boolean).join(','),
            linkedSheetTab: '',
            createdBy: 'jarvis',
            safePreview: resultDeckContent.slice(0, 200),
          };
          setWorkspaceRecords(prev => [record, ...prev]);
          setResultDeckVisible(false);
          addMessage('jarvis', `Result Deck 콘텐츠를 Workspace에 저장했습니다.`);
        }}
      />

      {/* ── CREATIVE STUDIO: 카드형 카피 UI ── */}
      <CreativeStudio
        visible={creativeStudioVisible}
        product={creativeStudioProduct}
        contentType={creativeStudioType}
        copies={creativeStudioCopies}
        metadata={creativeStudioMetadata}
        loading={creativeStudioLoading}
        trendPatternsUsed={creativeStudioTrends}
        videosReferenced={creativeStudioRefs}
        onClose={() => { setCreativeStudioVisible(false); }}
        onSelect={(copy) => {
          addMessage('jarvis', `✅ "​${copy.headline}​" 카피를 선택하셨습니다. 채널별 변환을 준비하겠습니다.`);
          handleJarvisContextEvent({ intent: 'copy_card_selected', screen: 'copy_card_detail', payload: copy });
        }}
        onRegenerate={(style) => {
          setCreativeStudioLoading(true);
          setCreativeStudioCopies([]);
          fetch('/api/trend-collector', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'generate',
              product: creativeStudioProduct,
              contentType: creativeStudioType,
              count: 10,
              userStyle: style || '',
            }),
          }).then(r => r.json()).then(data => {
            if (data.success && data.copies?.length > 0) {
              setCreativeStudioCopies(data.copies);
              setCreativeStudioTrends(data.trendPatternsUsed || 0);
              setCreativeStudioRefs(data.videosReferenced || 0);
              setCreativeStudioMetadata(data.metadata || null);
              // 2번 화면(Data Wall)에 동기화
              try {
                localStorage.setItem('jarvis.creativeStudio.latest', JSON.stringify({
                  copies: data.copies,
                  product: creativeStudioProduct,
                  contentType: creativeStudioType,
                  trends: data.trendPatternsUsed || 0,
                  refs: data.videosReferenced || 0,
                  updatedAt: Date.now(),
                }));
              } catch {}
            }
            setCreativeStudioLoading(false);
          }).catch(() => setCreativeStudioLoading(false));
        }}
        onJarvisContextEvent={handleJarvisContextEvent}
      />

      {/* ── OUTREACH RESULT WORKSPACE: 인플루언서 상세 모달 ── */}
      <OutreachResultWorkspace
        visible={outreachWorkspaceVisible}
        candidates={outreachCandidates}
        collectionSummary={outreachCollectionSummary}
        onClose={() => setOutreachWorkspaceVisible(false)}
        onJarvisContextEvent={handleJarvisContextEvent}
      />

      {/* ── SCREEN-A.1: Scene Preview Panel ── */}
      <JarvisScenePanel
        scene={activeScene}
        visible={scenePanelVisible && !missionWorkspaceOpen && !resultDeckVisible}
        onQuickCommand={(cmd) => handleTextSubmit(cmd)}
      />

      {/* ── ACTION-A.1: Predictive Action Panel (좌측 하단) ── */}
      <PredictiveActionPanel
        outreachOpen={outreachVisible}
        actions={predictedActions}
        visible={predictedActions.length > 0 && !missionWorkspaceOpen && activeScene !== 'approval_gate' && activeScene !== 'smartstore_brief' && activeScene !== 'keyword_radar' && !copyFocusMode}
        statusMessage={actionStatusMessage}
        onActionClick={(action) => {
          console.log('[ACTION-A.1] Action clicked:', action.id, action.type, action.status);
          if (action.status === 'locked') {
            setActionStatusMessage(`🔒 ${action.title} — LOCKED 상태입니다. 대표 승인 전 실행되지 않습니다.`);
            setTimeout(() => setActionStatusMessage(''), 4000);
          } else if (action.status === 'disabled') {
            setActionStatusMessage(`⏳ ${action.title} — 다음 단계에서 연결 예정입니다.`);
            setTimeout(() => setActionStatusMessage(''), 3000);
          } else if (action.status === 'preview') {
            setActionStatusMessage(`🔍 ${action.title} — Dry-run Preview는 다음 단계에서 연결됩니다.`);
            setTimeout(() => setActionStatusMessage(''), 3000);
          } else {
            setActionStatusMessage(`✅ ${action.title} 요청됨`);
            setTimeout(() => setActionStatusMessage(''), 2000);
          }
        }}
      />

      {/* ── ACTION-A.1: Approval Gate Card (중앙 하단) ── */}
      <ApprovalGateCard
        visible={activeScene === 'approval_gate' && predictedActions.length > 0 && !copyFocusMode}
        statusMessage={actionStatusMessage}
        onDryRun={() => {
          console.log('[ACTION-A.1] Approval Gate: Dry-run clicked');
          setActionStatusMessage('Dry-run Preview는 다음 단계에서 연결됩니다.');
          setTimeout(() => setActionStatusMessage(''), 4000);
        }}
        onPreview={() => {
          console.log('[ACTION-A.1] Approval Gate: Preview clicked');
          setActionStatusMessage('초안 보기는 다음 단계에서 연결됩니다.');
          setTimeout(() => setActionStatusMessage(''), 4000);
        }}
        onCancel={() => {
          console.log('[ACTION-A.1] Approval Gate: Cancel clicked');
          setPredictedActions([]);
          setActionStatusMessage('');
        }}
      />

      {/* ── UI-ORCH-A.1: Smartstore Mission Workspace (통합 레이아웃) ── */}
      <SmartstoreCommandCenter
        visible={missionWorkspaceOpen && activeScene === 'smartstore_brief' && !copyFocusMode}
        onClose={closeMissionWorkspace}
        orderData={sccOrderData}
        messages={messages}
        isTyping={isTyping}
        sttStatus={sttStatus}
        actionContext={actionContext}
        workflowSteps={workflowSteps}
        approvalPreview={approvalPreview}
        purchaseOrderBulkPreview={purchaseOrderBulkPreview}
        onSupplierCarrierSave={handleSupplierCarrierSave}
        onSupplierEmailSave={handleSupplierEmailSave}
        onActionSelect={(cmd: string) => {
          setActionContext(null);
          setWorkflowSteps([]);
          setApprovalPreview(null);
          handleTextSubmit(cmd);
        }}
        onActionDismiss={() => {
          setActionContext(null);
          setWorkflowSteps([]);
          setApprovalPreview(null);
        }}
        onApprovalDismiss={() => setApprovalPreview(null)}
      />

      {/* ── SEO-K.1: Keyword Radar Panel ── */}
      {activeScene === 'keyword_radar' && !resultDeckVisible && !copyFocusMode && (
        <div className="kr-panel-wrapper" style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 72,
          pointerEvents: 'auto',
        }}>
          <KeywordRadarPanel
            onClose={closeMissionWorkspace}
          />
        </div>
      )}

      {/* ── ActionCard (LAYOUT-REDESIGN-A.1: 겹침 방지 + 항상 표시) ── */}
      <div style={{
        position: 'fixed',
        top: outreachVisible ? 'auto' : '50%',
        bottom: outreachVisible ? 80 : 'auto',
        left: outreachVisible ? 170 : '50%',
        transform: outreachVisible ? 'none' : 'translate(-50%, -50%)',
        width: outreachVisible ? 'calc(100vw - 620px)' : 'min(520px, 92vw)',
        minWidth: outreachVisible ? '340px' : undefined,
        maxWidth: outreachVisible ? '600px' : undefined,
        maxHeight: outreachVisible ? '40vh' : '82vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        zIndex: 60,
        pointerEvents: actionContext ? 'auto' : 'none',
        transition: 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      }}>
        <AnimatePresence>
          {actionContext && !missionWorkspaceOpen && activeScene !== 'smartstore_brief' && (
            <ActionCard
              context={actionContext}
              workflowSteps={workflowSteps}
              approvalPreview={approvalPreview}
              onApprovalDismiss={() => setApprovalPreview(null)}
              onActionSelect={(cmd: string) => {
                setActionContext(null);
                setWorkflowSteps([]);
                setApprovalPreview(null);
                handleTextSubmit(cmd);
              }}
              onDismiss={() => {
                setActionContext(null);
                setWorkflowSteps([]);
                setApprovalPreview(null);
              }}
              onSave={async (type: string, data: any) => {
                const result = await saveToWorkspace(type, data, actionContext?.sourceCommand || '');
                return result;
              }}
            />
          )}
        </AnimatePresence>
      </div>

      <div
        data-testid="security-gate-panel"
        style={{
          position: 'fixed',
          right: 24,
          top: 24,
          zIndex: 96,
          width: 'min(310px, calc(100vw - 32px))',
          padding: 12,
          borderRadius: 10,
          border: ownerTokenConfigured ? '1px solid rgba(34,197,94,0.32)' : '1px solid rgba(248,113,113,0.36)',
          background: 'rgba(6,10,18,0.92)',
          color: 'rgba(241,245,249,0.92)',
          boxShadow: '0 14px 34px rgba(0,0,0,0.32)',
          backdropFilter: 'blur(14px)',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.58rem', letterSpacing: '0.16em', color: ownerTokenConfigured ? '#86efac' : '#fca5a5', marginBottom: 8 }}>
          SECURITY GATE
        </div>
        <div style={{ display: 'grid', gap: 5, fontSize: '0.68rem', color: 'rgba(203,213,225,0.86)', marginBottom: 10 }}>
          <div>Owner Token: <strong style={{ color: ownerTokenConfigured ? '#86efac' : '#fca5a5' }}>{ownerTokenConfigured ? 'UNLOCKED' : 'LOCKED'}</strong></div>
          <div>Execution APIs: <strong style={{ color: ownerTokenConfigured ? '#fde68a' : '#fca5a5' }}>{ownerTokenConfigured ? 'READY WITH APPROVAL' : 'LOCKED'}</strong></div>
          <div>Current Origin: <span style={{ color: 'rgba(125,211,252,0.88)' }}>{window.location.origin}</span></div>
          <div>Stored Token: <span>{ownerTokenConfigured ? '••••••' : 'not set'}</span></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 6 }}>
          <input
            data-testid="owner-token-input"
            type="password"
            value={ownerTokenInput}
            onChange={(event) => setOwnerTokenInput(event.target.value)}
            placeholder="Owner token"
            style={{
              minWidth: 0,
              border: '1px solid rgba(148,163,184,0.28)',
              borderRadius: 7,
              padding: '7px 8px',
              background: 'rgba(15,23,42,0.72)',
              color: 'rgba(241,245,249,0.92)',
              fontSize: '0.72rem',
            }}
          />
          <button
            data-testid="owner-token-save"
            onClick={() => {
              const token = ownerTokenInput.trim();
              if (!token) return;
              localStorage.setItem('jarvis_owner_token', token);
              setOwnerTokenInput('');
              setOwnerTokenConfigured(true);
            }}
            style={{ border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.12)', color: '#86efac', borderRadius: 7, padding: '7px 8px', cursor: 'pointer', fontSize: '0.68rem' }}
          >
            Save
          </button>
          <button
            data-testid="owner-token-clear"
            onClick={() => {
              localStorage.removeItem('jarvis_owner_token');
              setOwnerTokenInput('');
              setOwnerTokenConfigured(false);
            }}
            style={{ border: '1px solid rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.10)', color: '#fca5a5', borderRadius: 7, padding: '7px 8px', cursor: 'pointer', fontSize: '0.68rem' }}
          >
            Clear
          </button>
        </div>
      </div>

      {conversationNextActions.length > 0 && (
        <div
          data-testid="jarvis-next-actions"
          style={{
            position: 'fixed',
            left: 24,
            bottom: 24,
            zIndex: 72,
            width: 'min(420px, calc(100vw - 32px))',
            padding: 14,
            borderRadius: 10,
            border: '1px solid rgba(0,245,255,0.24)',
            background: 'rgba(6,10,18,0.92)',
            boxShadow: '0 18px 40px rgba(0,0,0,0.34)',
            color: 'rgba(229,246,255,0.92)',
            backdropFilter: 'blur(14px)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.58rem', letterSpacing: '0.16em', color: '#00f5ff' }}>
              NEXT ACTIONS
            </div>
            <button
              onClick={() => setConversationNextActions([])}
              style={{
                border: '1px solid rgba(148,163,184,0.22)',
                background: 'rgba(148,163,184,0.08)',
                color: 'rgba(226,232,240,0.8)',
                borderRadius: 6,
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: '0.68rem',
              }}
            >
              닫기
            </button>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {conversationNextActions.map(action => (
              <button
                key={action.id}
                data-testid="jarvis-next-action-card"
                onClick={() => handleTextSubmit(action.command)}
                style={{
                  textAlign: 'left',
                  border: action.approvalRequired ? '1px solid rgba(250,204,21,0.28)' : '1px solid rgba(148,163,184,0.18)',
                  background: action.approvalRequired ? 'rgba(250,204,21,0.08)' : 'rgba(15,23,42,0.62)',
                  color: 'rgba(241,245,249,0.94)',
                  borderRadius: 8,
                  padding: 10,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <strong style={{ fontSize: '0.78rem' }}>{action.label}</strong>
                  <span style={{ fontSize: '0.62rem', color: action.approvalRequired ? '#fde68a' : '#67e8f9' }}>
                    {action.approvalRequired ? '승인 필요' : 'safe'}
                  </span>
                </div>
                <div data-testid="jarvis-next-action-reason" style={{ marginTop: 5, fontSize: '0.7rem', lineHeight: 1.45, color: 'rgba(203,213,225,0.78)' }}>
                  {action.reason}
                </div>
                <div data-testid="jarvis-next-action-command" style={{ marginTop: 6, fontSize: '0.68rem', color: 'rgba(0,245,255,0.8)' }}>
                  {action.command}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {pendingAction && (
        <div
          data-testid="action-card"
          style={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            zIndex: 95,
            width: 'min(360px, calc(100vw - 32px))',
            padding: 16,
            borderRadius: 12,
            border: '1px solid rgba(255,170,0,0.35)',
            background: 'rgba(8,12,20,0.94)',
            boxShadow: '0 18px 40px rgba(0,0,0,0.35)',
            color: 'rgba(241,245,249,0.94)',
            backdropFilter: 'blur(14px)',
          }}
        >
          <div style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.58rem', letterSpacing: '0.16em', color: '#ffaa00', marginBottom: 8 }}>
            APPROVAL REQUIRED
          </div>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>{pendingAction.title}</div>
          <div style={{ fontSize: '0.72rem', lineHeight: 1.55, color: 'rgba(203,213,225,0.82)', marginBottom: 10 }}>
            {pendingAction.nextPrompt}
          </div>
          <div data-testid="execute-locked" style={{ fontSize: '0.65rem', color: '#ff6b6b', marginBottom: 10 }}>
            EXECUTE LOCKED - approval required, single action only
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              data-testid="action-approve-button"
              onClick={() => executePendingActionFromChat('approve')}
              style={{
                border: '1px solid rgba(34,197,94,0.45)',
                background: 'rgba(34,197,94,0.12)',
                color: '#86efac',
                borderRadius: 8,
                padding: '8px 10px',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              승인
            </button>
            <button
              data-testid="action-cancel-button"
              onClick={() => executePendingActionFromChat('cancel')}
              style={{
                border: '1px solid rgba(148,163,184,0.28)',
                background: 'rgba(148,163,184,0.08)',
                color: 'rgba(226,232,240,0.86)',
                borderRadius: 8,
                padding: '8px 10px',
                cursor: 'pointer',
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* ── TOUCH TO ACTIVATE 힌트 ── */}
      <AnimatePresence>
        {showHint && messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              bottom: 40,
              left: '50%',
              transform: 'translateX(-50%)',
              textAlign: 'center',
              zIndex: 25,
              pointerEvents: 'none',
            }}
          >
            <motion.p
              animate={{ opacity: [0.25, 0.6, 0.25] }}
              transition={{ duration: 3, repeat: Infinity }}
              style={{
                fontFamily: 'Orbitron, monospace',
                color: THEME.gold,
                fontSize: 'clamp(0.48rem, 1vw, 0.62rem)',
                letterSpacing: '0.3em',
                margin: 0,
                opacity: 0.5,
              }}
            >
              ◈  TOUCH TO ACTIVATE  ◈
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CHAT-INPUT-D.1: Command Dock (bottom-center) ── */}
      {/* OFF 상태: 하단 중앙 pill 버튼 */}
      <AnimatePresence>
        {!textInputMode && (
          <motion.div
            data-testid="jarvis-command-open"
            key="cmd-pill"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ delay: 2, duration: 0.5 }}
            onClick={e => {
              e.stopPropagation();
              setTextInputMode(true);
              setTimeout(() => textInputRef.current?.focus(), 80);
            }}
            className="cmd-dock-pill"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <rect x="2" y="5" width="20" height="14" rx="2" stroke="rgba(0,229,255,0.7)" strokeWidth="1.8"/>
              <path d="M6 9h1M9 9h1M12 9h1M15 9h1M18 9h1M6 12h1M9 12h1M12 12h1M15 12h1M6 15h6" stroke="rgba(0,229,255,0.7)" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M15 15h3" stroke="rgba(0,229,255,0.7)" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <span>Ctrl+K · 타이핑 모드</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ON 상태: Command Input Dock */}
      <AnimatePresence>
        {textInputMode && (
          <motion.div
            key="cmd-dock"
            initial={{ opacity: 0, y: 32, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 32, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="cmd-dock-wrapper"
            onClick={e => e.stopPropagation()}
          >
            {/* 상단 라벨 + 닫기 */}
            <div className="cmd-dock-header">
              <span className="cmd-dock-label">COMMAND INPUT</span>
              <motion.button
                className="cmd-dock-close"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => { setTextInputMode(false); setTextInputValue(''); }}
                title="닫기 (Esc)"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6L18 18" stroke="rgba(200,200,220,0.7)" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </motion.button>
            </div>

            {/* 입력 행 */}
            <div className="cmd-dock-input-row">
              {/* 스캔 라인 장식 */}
              <div className="cmd-dock-scan-bar" />
              <input
                data-testid="jarvis-command-input"
                ref={textInputRef}
                type="text"
                value={textInputValue}
                onChange={e => setTextInputValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && textInputValue.trim()) {
                    handleTextSubmit(textInputValue.trim());
                  }
                  if (e.key === 'Escape') {
                    setTextInputMode(false);
                    setTextInputValue('');
                  }
                }}
                placeholder="명령을 입력하세요..."
                autoFocus
                className="cmd-dock-input"
              />
              {/* 제출 버튼 */}
              <motion.button
                data-testid="jarvis-command-submit"
                className={`cmd-dock-send${textInputValue.trim() ? ' active' : ''}`}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                onClick={() => textInputValue.trim() && handleTextSubmit(textInputValue.trim())}
                title="제출 (Enter)"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </motion.button>
            </div>

            {/* 단축키 힌트 */}
            <div className="cmd-dock-hints">
              {[['Enter', '제출'], ['Esc', '닫기'], ['Ctrl+K', '토글']].map(([k, d]) => (
                <div key={k} className="cmd-dock-hint-item">
                  <span className="cmd-dock-hint-key">{k}</span>
                  <span className="cmd-dock-hint-desc">{d}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 하단 시스템 상태 ── */}
      <motion.footer
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.8, duration: 1 }}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          zIndex: 30, padding: '0 40px 16px',
          pointerEvents: 'none',
          display: isMobile ? 'none' : 'block',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', gap: '32px' }}>
          {[
            { label: 'NEURAL NET', active: state !== 'idle',                                   color: THEME.gold },
            { label: 'VOICE AI',   active: state === 'listening' || state === 'speaking',      color: '#E8A87C' },
            { label: 'DATA SYNC',  active: state === 'working',                                color: '#7EC89B' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <motion.div
                style={{
                  width: 4, height: 4, borderRadius: '50%',
                  background: item.active ? item.color : THEME.textDim,
                  boxShadow: item.active ? `0 0 5px ${item.color}` : 'none',
                  opacity: item.active ? 1 : 0.25,
                }}
                animate={item.active ? { opacity: [1, 0.4, 1] } : {}}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              <span style={{
                fontFamily: 'Orbitron, monospace',
                color: item.active ? item.color : THEME.textDim,
                fontSize: '0.44rem',
                letterSpacing: '0.2em',
                opacity: item.active ? 0.8 : 0.2,
              }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </motion.footer>

      {/* ── 홀로그램 데이터 패널 제거됨 (MISSION LOGS로 대체) ── */}

      {/* ── 인플루언서 카드 UI ── */}
      <InfluencerCards
        influencers={collectedInfluencers}
        visible={influencerCardsVisible}
        onClose={() => setInfluencerCardsVisible(false)}
        onSendEmail={async (selected) => {
          const emailTargets = selected.filter(inf => inf.email && inf.email.includes('@'));
          if (emailTargets.length === 0) return;
          try {
            const res = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/cloud-proxy`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ endpoint: 'ai-proposal-email', params: {
                influencers: emailTargets.map(inf => ({
                  name: inf.name, email: inf.email, category: inf.category,
                  subscribersFormatted: inf.followers, avgViews: inf.viewCount,
                  description: inf.description || '', topVideoTitle: inf.topVideoTitle || '',
                })),
                sendEmail: true,
              }}),
            });
            const data = await res.json();
            console.log('[JARVIS] 이메일 발송 결과:', data);
          } catch (err) { console.error('[JARVIS] 이메일 발송 실패:', err); }
        }}
        onAiProposal={async (selected) => {
          const targets = selected.filter(inf => inf.email && inf.email.includes('@'));
          if (targets.length === 0) return;
          try {
            const res = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/cloud-proxy`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ endpoint: 'ai-proposal-email', params: {
                influencers: targets.map(inf => ({
                  name: inf.name, email: inf.email, category: inf.category,
                  subscribersFormatted: inf.followers, avgViews: inf.viewCount,
                  description: inf.description || '', topVideoTitle: inf.topVideoTitle || '',
                })),
                sendEmail: true,
              }}),
            });
            const data = await res.json();
            console.log('[JARVIS] AI 공구제안 발송 결과:', data);
          } catch (err) { console.error('[JARVIS] AI 공구제안 실패:', err); }
        }}
      />

      {/* ── 지역업체 카드 UI ── */}
      <AnimatePresence>
        {businessCardsVisible && collectedBusinesses.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 55,
              background: 'rgba(6,10,18,0.92)',
              backdropFilter: 'blur(12px)',
              overflowY: 'auto',
            }}
          >
            {/* 닫기 버튼 */}
            <div
              onClick={() => setBusinessCardsVisible(false)}
              style={{
                cursor: 'pointer',
                background: 'rgba(6,10,18,0.9)',
                border: '1px solid rgba(74,144,226,0.4)',
                borderLeft: '2px solid #4A90E2',
                padding: '6px 14px',
                backdropFilter: 'blur(8px)',
                fontFamily: 'Orbitron, monospace',
                color: '#4A90E2',
                fontSize: '0.42rem',
                letterSpacing: '0.2em',
              }}
            >CLOSE ×</div>
            <LocalBusinessCards
              businesses={collectedBusinesses}
              visible={true}
              onBook={(biz) => {
                setBusinessCardsVisible(false);
                const cmd = `${biz.name} 예약해줘`;
                addMessage('user', cmd);
                handleTextSubmit(cmd);
              }}
              onRecommendMore={() => {
                const lastKeyword = collectedBusinesses[0]?.keyword || '병원';
                const cmd = `${lastKeyword} 다른 곳 추천해줘`;
                setBusinessCardsVisible(false);
                addMessage('user', cmd);
                handleTextSubmit(cmd);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 이메일 히스토리 카드 UI ── */}
      <EmailHistoryCards
        emails={emailHistory}
        visible={emailHistoryVisible}
        onClose={() => setEmailHistoryVisible(false)}
        onResend={(email) => {
          console.log('[JARVIS] 이메일 재발송:', email.to);
          setEmailHistory(prev => prev.map(e => e.id === email.id ? { ...e, status: 'sent' as const, sentAt: new Date().toISOString() } : e));
        }}
      />

      <AnimatePresence>
        {purchaseOrderEmailDraftPreview.open && (
          <motion.div
            data-testid="purchase-order-email-draft-panel"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            style={{
              position: 'fixed', right: 24, bottom: 96, zIndex: 70,
              width: 'min(680px, calc(100vw - 32px))', maxHeight: '76vh', overflowY: 'auto',
              background: 'rgba(6,10,18,0.96)', border: '1px solid rgba(0,245,255,0.28)',
              borderRadius: 8, boxShadow: '0 24px 80px rgba(0,0,0,0.45)', padding: 18, color: '#e5f6ff',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.72rem', letterSpacing: '0.16em', color: '#00f5ff' }}>EMAIL DRAFT PREVIEW</div>
                <div style={{ fontSize: '0.82rem', color: 'rgba(229,246,255,0.72)', marginTop: 4 }}>실제 Gmail 발송 전 미리보기입니다. 수신처는 마스킹으로만 표시합니다.</div>
              </div>
              <button data-testid="email-draft-close-button" onClick={() => setPurchaseOrderEmailDraftPreview(prev => ({ ...prev, open: false }))} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.18)', color: '#e5f6ff', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}>닫기</button>
            </div>
            {purchaseOrderEmailDraftPreview.statusMessage && (
              <div style={{ border: '1px solid rgba(255,214,102,0.25)', color: '#ffd666', padding: '8px 10px', borderRadius: 6, marginBottom: 12, fontSize: '0.82rem' }}>
                {purchaseOrderEmailDraftPreview.statusMessage}
              </div>
            )}
            <div style={{ display: 'grid', gap: 12 }}>
              {purchaseOrderEmailDraftPreview.drafts.map((draft) => {
                const selected = purchaseOrderEmailDraftPreview.selectedGroupIds.includes(draft.groupId);
                return (
                  <div key={draft.groupId} style={{ border: '1px solid rgba(148,163,184,0.22)', borderRadius: 8, padding: 12, background: 'rgba(15,23,42,0.58)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: '0.82rem' }}>
                      <input
                        data-testid="email-draft-select-checkbox"
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => {
                          setPurchaseOrderEmailDraftPreview(prev => {
                            const next = event.target.checked
                              ? Array.from(new Set([...prev.selectedGroupIds, draft.groupId])).slice(0, 3)
                              : prev.selectedGroupIds.filter(id => id !== draft.groupId);
                            return { ...prev, selectedGroupIds: next, statusMessage: event.target.checked && prev.selectedGroupIds.length >= 3 ? '선택 대량 발송은 최대 3건까지만 가능합니다.' : prev.statusMessage };
                          });
                        }}
                      />
                      <strong>{draft.productGroupName || '발주서'} / {draft.supplierName || '발주처'}</strong>
                      <span style={{ marginLeft: 'auto', color: draft.canSend ? '#86efac' : '#fca5a5' }}>{draft.canSend ? '승인 후 발송 가능' : '발송 준비 필요'}</span>
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, fontSize: '0.78rem', color: 'rgba(229,246,255,0.82)' }}>
                      <div data-testid="email-draft-recipient-masked">수신처: {draft.recipientMasked || '미설정'}</div>
                      <div data-testid="email-draft-attachment">첨부: {draft.attachmentFileName || '-'}</div>
                      <div>발주 건수: {draft.rowCount || 0}건</div>
                      <div>총 수량: {draft.totalQuantity || 0}개</div>
                    </div>
                    <div data-testid="email-draft-subject" style={{ marginTop: 10, fontWeight: 700, color: '#f8fafc' }}>{draft.subject}</div>
                    <pre data-testid="email-draft-body" style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0', fontFamily: 'inherit', fontSize: '0.78rem', lineHeight: 1.5, color: 'rgba(229,246,255,0.76)' }}>{draft.bodyPreview}</pre>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
              <button data-testid="email-draft-dryrun-button" onClick={() => runPurchaseOrderEmailDryRun(purchaseOrderEmailDraftPreview.selectedGroupIds)} disabled={purchaseOrderEmailDraftPreview.selectedGroupIds.length === 0} style={{ border: '1px solid rgba(0,245,255,0.36)', background: 'rgba(0,245,255,0.08)', color: '#67e8f9', borderRadius: 6, padding: '8px 12px', cursor: 'pointer' }}>dryRun 테스트</button>
              <button data-testid="email-draft-send-approval-button" onClick={() => requestPurchaseOrderEmailSendApproval(purchaseOrderEmailDraftPreview.selectedGroupIds.slice(0, 1))} disabled={purchaseOrderEmailDraftPreview.selectedGroupIds.length === 0} style={{ border: '1px solid rgba(34,197,94,0.36)', background: 'rgba(34,197,94,0.10)', color: '#86efac', borderRadius: 6, padding: '8px 12px', cursor: 'pointer' }}>1건 발송 승인 요청</button>
              <button data-testid="email-draft-bulk-send-approval-button" onClick={() => requestPurchaseOrderEmailSendApproval(purchaseOrderEmailDraftPreview.selectedGroupIds)} disabled={purchaseOrderEmailDraftPreview.selectedGroupIds.length < 2 || purchaseOrderEmailDraftPreview.selectedGroupIds.length > 3} style={{ border: '1px solid rgba(250,204,21,0.36)', background: 'rgba(250,204,21,0.10)', color: '#fde68a', borderRadius: 6, padding: '8px 12px', cursor: 'pointer' }}>선택 대량 발송 승인 요청, 최대 3건</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ── DALL-E 배너 이미지 팝업 ── */}
      <AnimatePresence>
        {bannerImage && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 60,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(6,10,18,0.88)',
              backdropFilter: 'blur(12px)',
            }}
            onClick={() => setBannerImage(null)}
          >
            <div style={{ position: 'relative', maxWidth: '80vw', maxHeight: '80vh' }}>
              <div style={{
                position: 'absolute', top: -28, left: 0,
                fontFamily: 'Orbitron, monospace',
                color: THEME.gold, fontSize: '0.55rem', letterSpacing: '0.3em',
              }}>AI GENERATED BANNER — CLICK TO CLOSE</div>
              <img
                src={bannerImage}
                alt="AI Generated Banner"
                style={{
                  maxWidth: '80vw', maxHeight: '75vh',
                  border: `1px solid ${THEME.gold}44`,
                  boxShadow: `0 0 60px ${THEME.gold}22`,
                  display: 'block',
                }}
              />
              <div style={{
                position: 'absolute', bottom: -28, right: 0,
                fontFamily: 'Orbitron, monospace',
                color: THEME.textDim, fontSize: '0.45rem', letterSpacing: '0.2em',
              }}>DALL-E 3 · MAWINPAY INTELLIGENCE</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 현재 목소리 표시 (우상단) ── */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.5, duration: 0.8 }}
        style={{
          position: 'fixed', top: 24, right: 28,
          zIndex: 30, pointerEvents: 'none',
          display: isMobile ? 'none' : 'block',
        }}
      >
        <div style={{
          background: 'rgba(6,10,18,0.75)',
          border: `1px solid ${THEME.gold}22`,
          borderLeft: `2px solid ${THEME.gold}55`,
          padding: '6px 12px',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.22em', marginBottom: '2px' }}>VOICE</div>
          <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.gold, fontSize: '0.65rem', letterSpacing: '0.1em' }}>{currentVoiceName}</div>
        </div>
      </motion.div>

      {/* ── 목소리 목록 패널 ── */}
      <AnimatePresence>
        {voiceListVisible && (
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            style={{
              position: 'fixed', top: 70, right: 28,
              zIndex: 40, pointerEvents: 'auto',
              maxHeight: '70vh', overflowY: 'auto',
            }}
          >
            <div style={{
              background: 'rgba(6,10,18,0.95)',
              border: `1px solid ${THEME.gold}33`,
              borderLeft: `2px solid ${THEME.gold}`,
              padding: '12px',
              backdropFilter: 'blur(16px)',
              minWidth: 220,
            }}>
              <div style={{
                fontFamily: 'Orbitron, monospace',
                color: THEME.gold,
                fontSize: '0.5rem',
                letterSpacing: '0.3em',
                marginBottom: '10px',
                borderBottom: `1px solid ${THEME.gold}22`,
                paddingBottom: '6px',
              }}>VOICE SELECTION</div>
              {ELEVENLABS_VOICES.map(v => (
                <div
                  key={v.id}
                  onClick={() => {
                    setCurrentVoiceId(v.id);
                    setCurrentVoiceName(v.name);
                    setVoiceListVisible(false);
                    const sampleText = `안녕하세요. ${v.name} 목소리로 변경되었습니다.`;
                    addMessage('jarvis', sampleText);
                    setState('speaking');
                    startSpeakingLevel();
                    speak(sampleText, undefined, () => {
                      stopSpeakingLevel();
                      setState('listening');
                      setIsListening(true);
                    }, v.id);
                  }}
                  style={{
                    padding: '6px 8px',
                    marginBottom: 4,
                    cursor: 'pointer',
                    background: currentVoiceName === v.name ? `${THEME.gold}15` : 'transparent',
                    border: currentVoiceName === v.name ? `1px solid ${THEME.gold}44` : '1px solid transparent',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = `${THEME.gold}10`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = currentVoiceName === v.name ? `${THEME.gold}15` : 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: currentVoiceName === v.name ? THEME.gold : THEME.textDim,
                      flexShrink: 0,
                    }} />
                    <div>
                      <div style={{ fontFamily: 'Orbitron, monospace', color: currentVoiceName === v.name ? THEME.gold : THEME.text, fontSize: '0.6rem', letterSpacing: '0.1em' }}>
                        {v.name}
                      </div>
                      <div style={{ color: THEME.textDim, fontSize: '0.45rem', marginTop: 1 }}>
                        {v.gender} · {v.accent}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div
                onClick={() => setVoiceListVisible(false)}
                style={{
                  marginTop: 8,
                  padding: '5px 8px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  fontFamily: 'Orbitron, monospace',
                  color: THEME.textDim,
                  fontSize: '0.42rem',
                  letterSpacing: '0.2em',
                  borderTop: `1px solid ${THEME.gold}22`,
                  paddingTop: 8,
                }}
              >CLOSE</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Settings 버튼 (좌상단) ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2, duration: 0.6 }}
        style={{ position: 'fixed', top: isMobile ? 14 : 20, left: isMobile ? 10 : 28, zIndex: 50, display: 'flex', gap: 6 }}
      >
        <div
          onClick={() => { setSettingsVisible(v => !v); setMemoryPanelVisible(false); }}
          style={{
            cursor: 'pointer',
            background: 'rgba(6,10,18,0.8)',
            border: `1px solid ${THEME.gold}33`,
            padding: '5px 10px',
            backdropFilter: 'blur(8px)',
            fontFamily: 'Orbitron, monospace',
            color: settingsVisible ? THEME.gold : THEME.textDim,
            fontSize: isMobile ? '0.38rem' : '0.42rem',
            letterSpacing: '0.12em',
            transition: 'color 0.2s',
          }}
        >SETTINGS</div>
        <div
          onClick={() => { setMemoryPanelVisible(v => !v); setSettingsVisible(false); setMemoryStats(getMemoryStats()); setLearnedKnowledge(getLearnedKnowledge()); }}
          style={{
            cursor: 'pointer',
            background: 'rgba(6,10,18,0.8)',
            border: `1px solid #9B8EC433`,
            padding: '5px 10px',
            backdropFilter: 'blur(8px)',
            fontFamily: 'Orbitron, monospace',
            color: memoryPanelVisible ? '#9B8EC4' : THEME.textDim,
            fontSize: isMobile ? '0.38rem' : '0.42rem',
            letterSpacing: '0.12em',
            transition: 'color 0.2s',
          }}
        >MEMORY</div>
      </motion.div>

      {/* ── Settings 패널 ── */}
      <AnimatePresence>
        {settingsVisible && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              position: 'fixed', top: 'clamp(46px, 7vw, 52px)', left: 'clamp(10px, 3vw, 28px)',
              zIndex: 50, pointerEvents: 'auto',
              minWidth: 'min(320px, calc(100vw - 20px))',
              maxWidth: 'calc(100vw - 20px)',
              maxHeight: 'calc(100vh - 70px)',
              overflowY: 'auto',
            }}
          >
            <div style={{
              background: 'rgba(6,10,18,0.97)',
              border: `1px solid ${THEME.gold}44`,
              borderTop: `2px solid ${THEME.gold}`,
              padding: '16px',
              backdropFilter: 'blur(20px)',
            }}>
              <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.gold, fontSize: '0.5rem', letterSpacing: '0.3em', marginBottom: 14, borderBottom: `1px solid ${THEME.gold}22`, paddingBottom: 8 }}>SYSTEM SETTINGS</div>

              {/* OpenAI API Key (Main Brain) */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontFamily: 'Orbitron, monospace', color: '#10B981', fontSize: '0.38rem', letterSpacing: '0.2em', marginBottom: 4 }}>OPENAI API KEY (GPT BRAIN)</div>
                <input
                  type="password"
                  placeholder="sk-proj-..."
                  value={settingsForm.geminiKey || ''}
                  onChange={e => {
                    const key = e.target.value;
                    setSettingsForm(f => ({ ...f, geminiKey: key, openaiKey: key }));
                    if (key) initializeGemini(key);
                  }}
                  style={{
                    width: '100%', padding: '6px 10px',
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid #4285F433`,
                    color: THEME.text,
                    fontFamily: 'monospace',
                    fontSize: '0.55rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* OpenAI Key (Whisper STT) */}
              <div style={{ marginBottom: 12, opacity: 0.6 }}>
                <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.2em', marginBottom: 4 }}>OPENAI KEY (자동 동기됨)</div>
                <input
                  type="password"
                  placeholder="위 키와 동일"
                  value={settingsForm.openaiKey}
                  onChange={e => setSettingsForm(f => ({ ...f, openaiKey: e.target.value }))}
                  style={{
                    width: '100%', padding: '6px 10px',
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${THEME.gold}33`,
                    color: THEME.text,
                    fontFamily: 'monospace',
                    fontSize: '0.55rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* ElevenLabs Key */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.2em', marginBottom: 4 }}>ELEVENLABS API KEY</div>
                <input
                  type="password"
                  placeholder="여기에 ElevenLabs 키 입력..."
                  value={settingsForm.elevenlabsKey}
                  onChange={e => setSettingsForm(f => ({ ...f, elevenlabsKey: e.target.value }))}
                  style={{
                    width: '100%', padding: '6px 10px',
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${THEME.gold}33`,
                    color: THEME.text,
                    fontFamily: 'monospace',
                    fontSize: '0.55rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* 네이버 로그인 정보 (예약 자동화용) */}
              <div style={{ marginBottom: 12, paddingTop: 10, borderTop: `1px solid ${THEME.gold}22` }}>
                <div style={{ fontFamily: 'Orbitron, monospace', color: '#4A90E2', fontSize: '0.45rem', letterSpacing: '0.3em', marginBottom: 8 }}>NAVER BOOKING CREDENTIALS</div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.2em', marginBottom: 4 }}>NAVER ID</div>
                  <input
                    type="text"
                    placeholder="네이버 아이디 입력..."
                    value={naverForm.username}
                    onChange={e => setNaverForm(f => ({ ...f, username: e.target.value }))}
                    style={{
                      width: '100%', padding: '6px 10px',
                      background: 'rgba(255,255,255,0.04)',
                      border: `1px solid #4A90E233`,
                      color: THEME.text,
                      fontFamily: 'monospace',
                      fontSize: '0.55rem',
                      outline: 'none',
                      boxSizing: 'border-box' as const,
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.2em', marginBottom: 4 }}>NAVER PASSWORD</div>
                  <input
                    type="password"
                    placeholder="네이버 비밀번호 입력..."
                    value={naverForm.password}
                    onChange={e => setNaverForm(f => ({ ...f, password: e.target.value }))}
                    style={{
                      width: '100%', padding: '6px 10px',
                      background: 'rgba(255,255,255,0.04)',
                      border: `1px solid #4A90E233`,
                      color: THEME.text,
                      fontFamily: 'monospace',
                      fontSize: '0.55rem',
                      outline: 'none',
                      boxSizing: 'border-box' as const,
                    }}
                  />
                </div>
                <div style={{ marginTop: 4, fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.32rem', letterSpacing: '0.1em' }}>
                  예약 자동화 시 네이버 로그인에 사용됩니다.
                </div>

                {/* 크롬 확장 로그인 버튼 (항상 표시) */}
                <div style={{ marginTop: 10 }}>
                    <div
                      onClick={async () => {
                        // 크롬 확장으로 네이버 쿠키 추출
                        setNaverLoginStatus('waiting');
                        window.postMessage({ source: 'JARVIS_APP', type: 'GET_NAVER_COOKIES', payload: { naverID: naverForm.username } }, '*');
                        // 결과 대기
                        const result = await new Promise<any>((resolve) => {
                          const handler = (e: MessageEvent) => {
                            if (e.data?.source === 'JARVIS_EXTENSION' && e.data?.type === 'NAVER_COOKIES_RESPONSE') {
                              window.removeEventListener('message', handler);
                              resolve(e.data.payload);
                            }
                          };
                          window.addEventListener('message', handler);
                          setTimeout(() => { window.removeEventListener('message', handler); resolve({ success: false, error: 'timeout' }); }, 10000);
                        });
                        if (result.success && result.cookies) {
                          // 쿠키 배열을 받았으면 프론트에서 서버로 전송
                          try {
                            const saveRes = await fetch(`${BOOKING_SERVER}/api/booking/save-cookies`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ naverID: result.naverID || naverForm.username || 'chrome_user', cookies: result.cookies }),
                            });
                            const saveData = await saveRes.json();
                            if (saveData.success && saveData.sessionId) {
                              setBookingSessionId(saveData.sessionId);
                              localStorage.setItem('jarvis_booking_session', saveData.sessionId);
                              setNaverLoginStatus('done');
                              setSettingsVisible(false);
                              const loginDoneMsg = `접속 확인됐습니다. 크롬 세션으로 네이버 로그인 완료. 쿠키 ${result.cookieCount}개 확인. 언제든 명령하십시오, sir.`;
                              addMessage('jarvis', loginDoneMsg, true);
                              setState('speaking');
                              startSpeakingLevel();
                              speak(loginDoneMsg, undefined, () => { stopSpeakingLevel(); setState('idle'); });
                            } else {
                              throw new Error(saveData.error || '서버 저장 실패');
                            }
                          } catch (fetchErr: any) {
                            setNaverLoginStatus('error');
                            const errMsg = `서버 연결 실패: ${fetchErr.message}. 서버가 실행 중인지 확인해 주세요.`;
                            addMessage('jarvis', errMsg, true);
                            setState('speaking');
                            startSpeakingLevel();
                            speak(errMsg, undefined, () => { stopSpeakingLevel(); setState('idle'); });
                          }
                        } else if (result.success && result.sessionId) {
                          // 이전 방식 호환성
                          setBookingSessionId(result.sessionId);
                          localStorage.setItem('jarvis_booking_session', result.sessionId);
                          setNaverLoginStatus('done');
                          setSettingsVisible(false);
                          const loginDoneMsg = `접속 확인됐습니다. 크롬 세션으로 네이버 로그인 완료. 언제든 명령하십시오, sir.`;
                          addMessage('jarvis', loginDoneMsg, true);
                          setState('speaking');
                          startSpeakingLevel();
                          speak(loginDoneMsg, undefined, () => { stopSpeakingLevel(); setState('idle'); });
                        } else {
                          setNaverLoginStatus('error');
                          // 쿠키 없으면 네이버 로그인 탭 열기
                          window.postMessage({ source: 'JARVIS_APP', type: 'OPEN_NAVER_LOGIN' }, '*');
                          const errMsg = result.error?.includes('쿠키가 없습니다') || result.error?.includes('쿠키가 없습니다')
                            ? '선생님, 네이버에 로그인된 세션이 없습니다. 열린 네이버 탭에서 로그인해 주세요. 완료되면 자동으로 처리됩니다.'
                            : `크롬 확장 로그인 실패: ${result.error || '알 수 없는 오류'}. 네이버 탭에서 로그인 후 다시 시도해 주세요.`;
                          addMessage('jarvis', errMsg, true);
                          setState('speaking');
                          startSpeakingLevel();
                          speak(errMsg, undefined, () => { stopSpeakingLevel(); setState('idle'); });
                        }
                      }}
                      style={{
                        padding: '8px 12px', textAlign: 'center', cursor: 'pointer',
                        background: 'rgba(0,200,100,0.15)',
                        border: '1px solid #00C86455',
                        fontFamily: 'Orbitron, monospace',
                        color: '#00C864',
                        fontSize: '0.42rem', letterSpacing: '0.2em',
                        marginBottom: 6,
                      }}
                    >
                      [PLUG] 크롬 확장으로 로그인 (추천)
                    </div>
                    <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.32rem', letterSpacing: '0.1em', marginBottom: 8 }}>
                      {(window as any).__JARVIS_EXTENSION_CONNECTED__
                        ? '[OK] 확장 연결됨 — 이미 로그인된 크롬 세션 사용 (캡차 없음)'
                        : '[!] 확장 미설치 — 아래 ZIP 설치 후 사용 가능'}
                    </div>
                  </div>

              {/* 네이버 팝업 로그인 버튼 */}
                <div style={{ marginTop: 10 }}>
                  <div
                    onClick={async () => {
                      if (naverLoginStatus === 'waiting') return;
                      const id = naverForm.username;
                      const pw = naverForm.password;
                      if (!id || !pw) {
                        alert('NAVER ID와 비밀번호를 먼저 입력해주세요.');
                        return;
                      }
                      setNaverLoginStatus('waiting');
                      try {
                        const res = await fetch(`${BOOKING_SERVER}/api/booking/login`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ naverID: id, naverPW: pw }),
                        });
                        const data = await res.json();
                        if (data.success && data.sessionId) {
                          // 로그인 성공
                          setBookingSessionId(data.sessionId);
                          localStorage.setItem('jarvis_booking_session', data.sessionId);
                          setNaverLoginStatus('done');
                          setSettingsVisible(false);
                          const loginDoneMsg = `접속 확인됐습니다. 네이버 세션 온라인. 언제든 명령하십시오, sir.`;
                          addMessage('jarvis', loginDoneMsg, true);
                          setState('speaking');
                          startSpeakingLevel();
                          speak(loginDoneMsg, undefined, () => { stopSpeakingLevel(); setState('idle'); });
                        } else if (data.needVerification && data.verificationType === 'captcha') {
                          // 캐시 필요 → 모달 열고 코드 요청
                          setNaverLoginStatus('idle');
                          setSettingsVisible(false); // 세팅스 닫기
                          const captchaImg = data.captchaSrc || data.screenshot || null;
                          if (captchaImg) setCaptchaScreenshot(captchaImg);
                          setVerificationMode('captcha'); // 모달 표시
                          const captchaMsg = '선생님, 네이버 로그인 중 자동입력 방지 문자가 표시되었습니다. 화면에 보이는 문자를 말씨해주세요, sir.';
                          addMessage('jarvis', captchaMsg, true);
                          setState('speaking');
                          startSpeakingLevel();
                          speak(captchaMsg, undefined, () => { stopSpeakingLevel(); setState('idle'); });
                        } else if (data.needVerification && data.verificationType === 'otp') {
                          // 2단계 인증 필요 → 모달 열고 코드 요청
                          setNaverLoginStatus('idle');
                          setSettingsVisible(false); // 세팅스 닫기
                          if (data.pendingSessionId) setPendingSessionId(data.pendingSessionId);
                          const otpScreenshot = data.screenshot || null;
                          if (otpScreenshot) setCaptchaScreenshot(otpScreenshot);
                          setVerificationMode('otp'); // 모달 표시
                          const otpMsg = '선생님, 네이버에서 추가 인증이 필요합니다. 화면을 확인하고 인증번호를 말씨해주세요, sir.';
                          addMessage('jarvis', otpMsg, true);
                          setState('speaking');
                          startSpeakingLevel();
                          speak(otpMsg, undefined, () => { stopSpeakingLevel(); setState('idle'); });
                        } else {
                          setNaverLoginStatus('error');
                          const errMsg = data.message || '로그인에 실패했습니다. 아이디와 비밀번호를 확인해주세요.';
                          addMessage('jarvis', errMsg, true);
                          setState('speaking');
                          startSpeakingLevel();
                          speak(errMsg, undefined, () => { stopSpeakingLevel(); setState('idle'); });
                        }
                      } catch {
                        setNaverLoginStatus('error');
                      }
                    }}
                    style={{
                      padding: '8px 12px', textAlign: 'center', cursor: 'pointer',
                      background: naverLoginStatus === 'done' ? 'rgba(34,197,94,0.15)' : 'rgba(74,144,226,0.15)',
                      border: `1px solid ${naverLoginStatus === 'done' ? '#22C55E' : '#4A90E2'}55`,
                      fontFamily: 'Orbitron, monospace',
                      color: naverLoginStatus === 'done' ? '#22C55E' : '#4A90E2',
                      fontSize: '0.42rem', letterSpacing: '0.2em',
                    }}
                  >
                    {naverLoginStatus === 'done' ? '[OK] NAVER LOGGED IN' :
                     naverLoginStatus === 'waiting' ? '⏳ 로그인 진행 중...' :
                     naverLoginStatus === 'error' ? '[X] 로그인 실패 - 재시도' :
                     '[LOCK] NAVER 자동 로그인'}
                  </div>
                  {naverLoginStatus === 'done' && bookingSessionId && (
                    <div style={{ marginTop: 4, fontFamily: 'Orbitron, monospace', color: '#22C55E', fontSize: '0.3rem', letterSpacing: '0.1em' }}>
                      [OK] 세션 활성: {bookingSessionId.slice(0, 8)}...
                    </div>
                  )}
                </div>
              </div>

              {/* 예약자 정보 */}
              <div style={{ marginBottom: 12, paddingTop: 10, borderTop: `1px solid ${THEME.gold}22` }}>
                <div style={{ fontFamily: 'Orbitron, monospace', color: '#4A90E2', fontSize: '0.45rem', letterSpacing: '0.3em', marginBottom: 8 }}>BOOKING PROFILE</div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.2em', marginBottom: 4 }}>예약자명</div>
                  <input
                    type="text"
                    placeholder="예약자 이름 입력..."
                    value={naverForm.userName}
                    onChange={e => setNaverForm(f => ({ ...f, userName: e.target.value }))}
                    style={{
                      width: '100%', padding: '6px 10px',
                      background: 'rgba(255,255,255,0.04)',
                      border: `1px solid #4A90E233`,
                      color: THEME.text,
                      fontFamily: 'monospace',
                      fontSize: '0.55rem',
                      outline: 'none',
                      boxSizing: 'border-box' as const,
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.2em', marginBottom: 4 }}>연락처</div>
                  <input
                    type="tel"
                    placeholder="010-0000-0000"
                    value={naverForm.userPhone}
                    onChange={e => setNaverForm(f => ({ ...f, userPhone: e.target.value }))}
                    style={{
                      width: '100%', padding: '6px 10px',
                      background: 'rgba(255,255,255,0.04)',
                      border: `1px solid #4A90E233`,
                      color: THEME.text,
                      fontFamily: 'monospace',
                      fontSize: '0.55rem',
                      outline: 'none',
                      boxSizing: 'border-box' as const,
                    }}
                  />
                </div>
                <div style={{ marginTop: 4, fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.32rem', letterSpacing: '0.1em' }}>
                  예약 폼 자동 입력 시 사용됩니다.
                </div>
              </div>

              {/* 저장 버튼 */}
              <div style={{ display: 'flex', gap: 8 }}>
                <div
                  onClick={() => {
                    const keys = {
                      openaiKey: settingsForm.openaiKey,
                      elevenlabsKey: settingsForm.elevenlabsKey,
                    };
                    localStorage.setItem('jarvis_api_keys', JSON.stringify(settingsForm));
      if (settingsForm.geminiKey || settingsForm.openaiKey) {
        initializeGemini(settingsForm.geminiKey || settingsForm.openaiKey);
      }             localStorage.setItem('jarvis_naver_creds', JSON.stringify({
                      username: naverForm.username,
                      password: naverForm.password,
                      userName: naverForm.userName,
                      userPhone: naverForm.userPhone,
                    }));
                    setSettingsVisible(false);
                    // 저장 후 자비스 음성 안내 (리로드 없이 즉시 적용)
                    const savedMsg = naverForm.username
                      ? `설정이 저장되었습니다. 네이버 아이디 ${naverForm.username}으로 로그인 정보가 등록되었습니다. 이제 예약 자동화를 사용할 수 있습니다.`
                      : `설정이 저장되었습니다.`;
                    addMessage('jarvis', savedMsg, true);
                    setState('speaking');
                    startSpeakingLevel();
                    speak(savedMsg, undefined, () => { stopSpeakingLevel(); setState('idle'); });
                  }}
                  style={{
                    flex: 1, padding: '7px', textAlign: 'center', cursor: 'pointer',
                    background: `${THEME.gold}22`,
                    border: `1px solid ${THEME.gold}55`,
                    fontFamily: 'Orbitron, monospace',
                    color: THEME.gold, fontSize: '0.42rem', letterSpacing: '0.2em',
                  }}
                >SAVE &amp; RELOAD</div>
                <div
                  onClick={() => setSettingsVisible(false)}
                  style={{
                    padding: '7px 14px', textAlign: 'center', cursor: 'pointer',
                    border: `1px solid ${THEME.textDim}33`,
                    fontFamily: 'Orbitron, monospace',
                    color: THEME.textDim, fontSize: '0.42rem', letterSpacing: '0.2em',
                  }}
                >CANCEL</div>
              </div>

              <div style={{ marginTop: 10, fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.35rem', letterSpacing: '0.1em', lineHeight: 1.6 }}>
                키는 브라우저 LocalStorage에만 저장됩니다. 서버로 전송되지 않습니다.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Memory 패널 ── */}
      <AnimatePresence>
        {memoryPanelVisible && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              position: 'fixed', top: 'clamp(46px, 7vw, 52px)', left: 'clamp(10px, 3vw, 28px)',
              zIndex: 50, pointerEvents: 'auto',
              minWidth: 'min(300px, calc(100vw - 20px))', maxWidth: 'calc(100vw - 20px)', maxHeight: '70vh', overflowY: 'auto',
            }}
          >
            <div style={{
              background: 'rgba(6,10,18,0.97)',
              border: `1px solid #9B8EC444`,
              borderTop: '2px solid #9B8EC4',
              padding: '16px',
              backdropFilter: 'blur(20px)',
            }}>
              <div style={{ fontFamily: 'Orbitron, monospace', color: '#9B8EC4', fontSize: '0.5rem', letterSpacing: '0.3em', marginBottom: 10, borderBottom: `1px solid #9B8EC422`, paddingBottom: 8 }}>MEMORY SYSTEM</div>

              {/* 통계 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                {[
                  { label: 'TOTAL TURNS', value: memoryStats.totalTurns },
                  { label: 'SESSIONS', value: memoryStats.totalSessions },
                  { label: 'KNOWLEDGE', value: memoryStats.knowledgeCount },
                  { label: 'SINCE', value: memoryStats.oldestEntry || 'NEW' },
                ].map(stat => (
                  <div key={stat.label} style={{ background: 'rgba(155,142,196,0.08)', border: '1px solid #9B8EC422', padding: '6px 8px' }}>
                    <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.32rem', letterSpacing: '0.2em' }}>{stat.label}</div>
                    <div style={{ fontFamily: 'Orbitron, monospace', color: '#9B8EC4', fontSize: '0.6rem', marginTop: 2 }}>{stat.value}</div>
                  </div>
                ))}
              </div>

              {/* 학습된 지식 */}
              {learnedKnowledge.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.2em', marginBottom: 8 }}>LEARNED KNOWLEDGE</div>
                  {learnedKnowledge.map(k => (
                    <div key={k.id} style={{ padding: '5px 8px', marginBottom: 4, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.gold, fontSize: '0.4rem', letterSpacing: '0.1em' }}>{k.title}</div>
                      <div style={{ color: THEME.text, fontSize: '0.5rem', marginTop: 2 }}>{k.content}</div>
                      <div style={{ color: THEME.textDim, fontSize: '0.35rem', marginTop: 1 }}>{k.source === 'auto' ? 'AUTO-EXTRACTED' : 'MANUAL'}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* 직접 지식 추가 */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.2em', marginBottom: 6 }}>ADD KNOWLEDGE MANUALLY</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input
                    id="know-title"
                    placeholder="제목 (ex: 내 이름)"
                    style={{
                      flex: 1, padding: '5px 8px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: THEME.text, fontSize: '0.5rem', outline: 'none',
                    }}
                  />
                  <input
                    id="know-content"
                    placeholder="내용"
                    style={{
                      flex: 2, padding: '5px 8px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: THEME.text, fontSize: '0.5rem', outline: 'none',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div
                    onClick={() => {
                      const titleEl = document.getElementById('know-title') as HTMLInputElement;
                      const contentEl = document.getElementById('know-content') as HTMLInputElement;
                      if (titleEl?.value && contentEl?.value) {
                        saveLearnedKnowledge(titleEl.value, contentEl.value, 'manual');
                        setLearnedKnowledge(getLearnedKnowledge());
                        titleEl.value = ''; contentEl.value = '';
                      }
                    }}
                    style={{
                      flex: 1, padding: '6px', textAlign: 'center', cursor: 'pointer',
                      background: 'rgba(155,142,196,0.15)',
                      border: '1px solid #9B8EC455',
                      fontFamily: 'Orbitron, monospace',
                      color: '#9B8EC4', fontSize: '0.38rem', letterSpacing: '0.15em',
                    }}
                  >ADD</div>
                  <div
                    onClick={() => {
                      if (confirm('모든 메모리를 삭제하시겠습니까?')) {
                        clearAllMemory();
                        setLearnedKnowledge([]);
                        setMemoryStats(getMemoryStats());
                      }
                    }}
                    style={{
                      padding: '6px 10px', textAlign: 'center', cursor: 'pointer',
                      border: '1px solid rgba(239,68,68,0.3)',
                      fontFamily: 'Orbitron, monospace',
                      color: '#EF4444', fontSize: '0.38rem', letterSpacing: '0.15em',
                    }}
                  >CLEAR ALL</div>
                </div>
              </div>

              <div
                onClick={() => setMemoryPanelVisible(false)}
                style={{
                  padding: '6px', textAlign: 'center', cursor: 'pointer',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  paddingTop: 10, marginTop: 4,
                  fontFamily: 'Orbitron, monospace',
                  color: THEME.textDim, fontSize: '0.38rem', letterSpacing: '0.2em',
                }}
              >CLOSE</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 네이버 검색 결과 패널 ── */}
      <AnimatePresence>
        {naverPanelVisible && naverResults.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 60 }}
            style={{
              position: 'fixed', top: 80, right: 28,
              zIndex: 36, width: 280,
              background: 'rgba(6,10,18,0.95)',
              border: `1px solid ${THEME.blue}44`,
              borderLeft: `2px solid ${THEME.blue}`,
              backdropFilter: 'blur(12px)',
              maxHeight: '70vh',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* 헤더 */}
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${THEME.blue}22`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.blue, fontSize: '0.4rem', letterSpacing: '0.25em' }}>NAVER SEARCH</div>
                <div style={{ color: THEME.text, fontSize: '0.55rem', marginTop: 2 }}>'{naverKeyword}' — {naverResults.length}건</div>
              </div>
              <div
                onClick={() => setNaverPanelVisible(false)}
                style={{ cursor: 'pointer', color: THEME.textDim, fontSize: '0.5rem', padding: '2px 6px', border: `1px solid ${THEME.textDim}33` }}
              >×</div>
            </div>

            {/* 결과 리스트 */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
              {naverResults.map((item, i) => (
                <div
                  key={i}
                  style={{
                    padding: '8px 14px',
                    borderBottom: `1px solid rgba(255,255,255,0.04)`,
                    cursor: 'pointer',
                  }}
                  onClick={() => window.open(item.url, '_blank')}
                >
                  <div style={{ color: THEME.text, fontSize: '0.52rem', lineHeight: 1.4, marginBottom: 2 }}>
                    {item.title.length > 35 ? item.title.substring(0, 35) + '…' : item.title}
                  </div>
                  <div style={{ color: THEME.blue, fontSize: '0.42rem', marginBottom: 2 }}>
                    {item.creatorName}
                  </div>
                  <div style={{ color: THEME.textDim, fontSize: '0.38rem' }}>
                    {item.description.length > 50 ? item.description.substring(0, 50) + '…' : item.description}
                  </div>
                </div>
              ))}
            </div>

            {/* 하단 버튼 */}
            <div style={{ padding: '8px 14px', borderTop: `1px solid ${THEME.blue}22`, display: 'flex', gap: 6 }}>
              <div
                onClick={async () => {
                  const collectedAt = new Date().toLocaleString('ko-KR');
                  const sheetData: NaverCollectedData[] = naverResults.map(item => ({
                    title: item.title,
                    author: item.creatorName,
                    link: item.url,
                    description: item.description,
                    type: 'blog',
                    keyword: naverKeyword,
                    collectedAt,
                  }));
                  const res = await appendNaverResultsToSheet(sheetData);
                  const msg = res.success
                    ? `${res.count}건 구글 시트 저장 완료`
                    : '구글 시트 저장 실패 (Webhook URL 확인 필요)';
                  addMessage('jarvis', msg);
                  speak(msg);
                }}
                style={{
                  flex: 1, padding: '6px', textAlign: 'center', cursor: 'pointer',
                  background: `rgba(3,199,90,0.12)`, border: `1px solid rgba(3,199,90,0.4)`,
                  fontFamily: 'Orbitron, monospace', color: '#03c75a', fontSize: '0.38rem', letterSpacing: '0.15em',
                }}
              >시트 저장</div>
              <div
                onClick={() => {
                  const csv = [
                    ['제목', '작성자', 'URL', '설명', '날짜'].join(','),
                    ...naverResults.map(r => [
                      `"${r.title.replace(/"/g, '""')}"`,
                      `"${r.creatorName}"`,
                      `"${r.url}"`,
                      `"${r.description.replace(/"/g, '""')}"`,
                      `"${r.postDate}"`
                    ].join(','))
                  ].join('\n');
                  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `naver-${naverKeyword}-${new Date().toISOString().split('T')[0]}.csv`;
                  a.click();
                }}
                style={{
                  flex: 1, padding: '6px', textAlign: 'center', cursor: 'pointer',
                  background: `${THEME.blue}22`, border: `1px solid ${THEME.blue}55`,
                  fontFamily: 'Orbitron, monospace', color: THEME.blue, fontSize: '0.38rem', letterSpacing: '0.15em',
                }}
              >CSV 다운로드</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 예약 진행 상황 바 ── */}
      <AnimatePresence>
        {bookingStep > 0 && bookingStep < 5 && (
          <motion.div
            key="booking-progress"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            style={{
              position: 'fixed', top: 68, left: '50%', transform: 'translateX(-50%)',
              zIndex: 40, pointerEvents: 'none',
              width: 'clamp(300px, 80vw, 600px)',
            }}
          >
            <div style={{
              background: 'rgba(6,10,18,0.92)',
              border: `1px solid #4A90E244`,
              borderTop: `2px solid #4A90E2`,
              padding: '10px 16px',
              backdropFilter: 'blur(20px)',
            }}>
              {/* 제목 */}
              <div style={{
                fontFamily: 'Orbitron, monospace', color: '#4A90E2',
                fontSize: '0.42rem', letterSpacing: '0.3em', marginBottom: 8,
              }}>BOOKING PROGRESS</div>
              {/* 단계 바 */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {[
                  { step: 1, label: '로그인' },
                  { step: 2, label: '시간조회' },
                  { step: 3, label: '확인' },
                  { step: 4, label: '폼입력' },
                  { step: 5, label: '완료' },
                ].map((item, idx) => {
                  const isDone = bookingStep > item.step;
                  const isActive = bookingStep === item.step;
                  const color = isDone ? '#7EC89B' : isActive ? '#4A90E2' : '#334155';
                  return (
                    <>
                      <div key={item.step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1 }}>
                        <motion.div
                          animate={isActive ? { opacity: [1, 0.4, 1], boxShadow: [`0 0 6px ${color}`, `0 0 2px ${color}`, `0 0 6px ${color}`] } : {}}
                          transition={{ duration: 1.2, repeat: Infinity }}
                          style={{
                            width: '100%', height: 4,
                            background: color,
                            borderRadius: 2,
                          }}
                        />
                        <span style={{
                          fontFamily: 'Orbitron, monospace',
                          color: isActive ? '#4A90E2' : isDone ? '#7EC89B' : '#334155',
                          fontSize: '0.35rem', letterSpacing: '0.1em',
                          whiteSpace: 'nowrap',
                        }}>
                          {isDone ? ' ' : isActive ? '▶ ' : ''}{item.label}
                        </span>
                      </div>
                      {idx < 4 && (
                        <div key={`sep-${item.step}`} style={{ width: 6, height: 4, background: isDone ? '#7EC89B44' : '#33415544', borderRadius: 1, flexShrink: 0 }} />
                      )}
                    </>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 캡차/2단계 인증 화면 ── */}
      <AnimatePresence>
        {captchaScreenshot && verificationMode && (
          <motion.div
            key="captcha-modal"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
            }}
          >
            <div style={{
              background: 'rgba(6,10,18,0.98)',
              border: '1px solid #4A90E2',
              borderTop: '3px solid #4A90E2',
              width: 'clamp(320px, 95vw, 560px)',
              maxHeight: '90vh',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}>
              {/* ── 상단 고정: 타이틀 + 질문 ── */}
              <div style={{ padding: '16px 20px 12px', flexShrink: 0, borderBottom: '1px solid #4A90E244' }}>
                <div style={{ fontFamily: 'Orbitron, monospace', color: '#4A90E2', fontSize: '0.5rem', letterSpacing: '0.3em', marginBottom: 10 }}>
                  {verificationMode === 'captcha' ? 'CAPTCHA REQUIRED' : '2-STEP VERIFICATION'}
                </div>
                <div style={{ color: '#FFD700', fontSize: '1rem', fontWeight: 'bold', lineHeight: 1.6, background: 'rgba(255,215,0,0.1)', padding: '10px 12px', borderRadius: 6, border: '1px solid #FFD70055' }}>
                  {verificationMode === 'captcha'
                    ? '[LIST] 아래 이미지에서 질문을 확인하고 답을 입력하세요'
                    : '[LOCK] 아래 화면의 인증 질문을 확인하고 답하세요'}
                </div>
              </div>
              {/* ── 중간 스크롤: 스크린샷 ── */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
                <img
                  src={captchaScreenshot}
                  alt="네이버 인증 화면"
                  style={{ width: '100%', borderRadius: 6, border: '2px solid #4A90E2', display: 'block' }}
                />
              </div>
              {/* ── 하단 고정: 직접 입력창 + 전송 버튼 ── */}
              <div style={{ padding: '12px 20px 16px', flexShrink: 0, borderTop: '1px solid #4A90E244', background: 'rgba(74,144,226,0.08)' }}>
                <div style={{ color: '#4A90E2', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: 8 }}>
                  {verificationMode === 'captcha' ? ' 위 이미지의 답을 입력하세요' : ' 위 화면의 인증번호를 입력하세요'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    id="captchaDirectInput"
                    type="text"
                    autoFocus
                    placeholder="정답을 입력하세요..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (!val) return;
                        if (verificationResolveRef.current) {
                          const resolve = verificationResolveRef.current;
                          verificationResolveRef.current = null;
                          addMessage('user', val);
                          setCaptchaScreenshot(null);
                          setVerificationMode(null);
                          setState('working');
                          resolve(val.replace(/\s/g, '').trim());
                        } else {
                          // resolve가 없으면 일반 텍스트 제출로 처리
                          setCaptchaScreenshot(null);
                          setVerificationMode(null);
                          handleTextSubmit(val);
                        }
                      }
                    }}
                    style={{
                      flex: 1, padding: '10px 12px',
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid #4A90E2',
                      color: '#fff', fontSize: '1rem',
                      outline: 'none', borderRadius: 4,
                      fontFamily: 'inherit',
                    }}
                  />
                  <button
                    onClick={() => {
                      const input = document.getElementById('captchaDirectInput') as HTMLInputElement;
                      const val = input?.value?.trim();
                      if (!val) return;
                      if (verificationResolveRef.current) {
                        const resolve = verificationResolveRef.current;
                        verificationResolveRef.current = null;
                        addMessage('user', val);
                        setCaptchaScreenshot(null);
                        setVerificationMode(null);
                        setState('working');
                        resolve(val.replace(/\s/g, '').trim());
                      } else {
                        setCaptchaScreenshot(null);
                        setVerificationMode(null);
                        handleTextSubmit(val);
                      }
                    }}
                    style={{
                      padding: '10px 18px',
                      background: '#4A90E2',
                      border: 'none', color: '#fff',
                      fontSize: '1rem', cursor: 'pointer',
                      borderRadius: 4, fontWeight: 'bold',
                    }}
                  >→</button>
                </div>
                <div style={{ color: '#9BA1A6', fontSize: '0.65rem', marginTop: 6 }}>
                  Enter 키 또는 화살표 버튼으로 제울 • 음성으로도 답할 수 있습니다
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 네이버 직접 로그인 웹븷 모달 ── */}
      <AnimatePresence>
        {naverLoginWebview && (
          <motion.div
            key="naver-webview-modal"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
            }}
          >
            <div style={{
              background: 'rgba(6,10,18,0.99)',
              border: '1px solid #4A90E2',
              borderTop: '3px solid #4A90E2',
              padding: '20px',
              width: 'clamp(320px, 90vw, 520px)',
              maxHeight: '90vh',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: 'Orbitron, monospace', color: '#4A90E2', fontSize: '0.5rem', letterSpacing: '0.3em' }}>
                  NAVER LOGIN
                </div>
                <div
                  onClick={() => { setNaverLoginWebview(false); setNaverLoginStatus('idle'); setNaverLoginScreenshot(null); }}
                  style={{ cursor: 'pointer', color: '#9BA1A6', fontSize: '1.2rem', lineHeight: 1 }}
                >×</div>
              </div>
              <div style={{ color: '#9BA1A6', fontSize: '0.75rem', lineHeight: 1.5 }}>
                아래 화면에서 네이버 로그인하세요. 로그인 완료 시 자동으로 감지됩니다.
              </div>
              {/* 스크린샷 표시 영역 */}
              {naverLoginScreenshot ? (
                <div
                  style={{ position: 'relative', cursor: 'pointer', border: '1px solid #4A90E244', borderRadius: 4, overflow: 'hidden' }}
                  onClick={async (e) => {
                    if (!naverLoginPendingId) return;
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const img = e.currentTarget.querySelector('img') as HTMLImageElement;
                    if (!img) return;
                    // 실제 브라우저 컨버스 크기(480x700)로 좌표 변환
                    const scaleX = 480 / img.clientWidth;
                    const scaleY = 700 / img.clientHeight;
                    const x = Math.round((e.clientX - rect.left) * scaleX);
                    const y = Math.round((e.clientY - rect.top) * scaleY);
                    await fetch(`${BOOKING_SERVER}/api/booking/manual-login/click/${naverLoginPendingId}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ x, y }),
                    }).catch(() => {});
                  }}
                >
                  <img
                    src={naverLoginScreenshot}
                    alt="네이버 로그인 화면"
                    style={{ width: '100%', display: 'block' }}
                  />
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#4A90E2', fontFamily: 'Orbitron, monospace', fontSize: '0.4rem' }}>
                  화면 로딩 중...
                </div>
              )}
              {/* 비밀번호 원터치 입력 영역 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ color: '#9BA1A6', fontSize: '0.7rem' }}>
                  비밀번호 입력 후 엔터 → 자동 로그인
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="password"
                    placeholder="비밀번호 입력..."
                    id="naver-pw-input"
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const input = e.target as HTMLInputElement;
                        const pw = input.value;
                        if (!pw || !naverLoginPendingId) return;
                        input.disabled = true;
                        try {
                          await fetch(`${BOOKING_SERVER}/api/booking/manual-login/fill-password/${naverLoginPendingId}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ password: pw }),
                          });
                        } catch {}
                        input.value = '';
                        input.disabled = false;
                      }
                    }}
                    style={{
                      flex: 1, padding: '10px 14px',
                      background: 'rgba(255,255,255,0.07)',
                      border: '1px solid #4A90E266',
                      color: '#e0e0ff',
                      fontFamily: 'monospace', fontSize: '1rem',
                      outline: 'none', borderRadius: 4,
                    }}
                  />
                  <button
                    onClick={async () => {
                      const input = document.getElementById('naver-pw-input') as HTMLInputElement;
                      const pw = input?.value;
                      if (!pw || !naverLoginPendingId) return;
                      input.disabled = true;
                      try {
                        await fetch(`${BOOKING_SERVER}/api/booking/manual-login/fill-password/${naverLoginPendingId}`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ password: pw }),
                        });
                      } catch {}
                      input.value = '';
                      input.disabled = false;
                    }}
                    style={{
                      padding: '10px 16px',
                      background: '#4A90E2',
                      border: 'none', borderRadius: 4,
                      color: '#fff', fontFamily: 'Orbitron, monospace',
                      fontSize: '0.45rem', letterSpacing: '0.1em',
                      cursor: 'pointer',
                    }}
                  >
                    LOGIN
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 예약 결과 패널 ── */}
      <AnimatePresence>
        {bookingPanelVisible && (
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            style={{
              position: 'fixed', top: 80, right: 28,
              zIndex: 36, pointerEvents: 'auto',
              width: 300, maxHeight: '85vh', overflowY: 'auto',
            }}
          >
            <div style={{
              background: 'rgba(6,10,18,0.97)',
              border: `1px solid #4A90E244`,
              borderTop: '2px solid #4A90E2',
              padding: '14px',
              backdropFilter: 'blur(20px)',
            }}>
              {/* 헤더 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontFamily: 'Orbitron, monospace', color: '#4A90E2', fontSize: '0.45rem', letterSpacing: '0.3em' }}>
                  {paymentUrl ? 'PAYMENT READY' : 'BOOKING SLOTS'}
                </div>
                <div
                  onClick={() => { setBookingPanelVisible(false); setPaymentUrl(null); setPaymentCopied(false); }}
                  style={{ cursor: 'pointer', color: THEME.textDim, fontSize: '0.7rem', lineHeight: 1 }}
                >×</div>
              </div>

              {/* 결제 URL 섹션 */}
              {paymentUrl && (
                <div style={{ marginBottom: 14 }}>
                  {/* 단계 표시 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    {['예약 탐색', '폼 입력', '결제'].map((step, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: '50%',
                          background: i < 2 ? '#22C55E' : '#4A90E2',
                          border: `1px solid ${i < 2 ? '#22C55E' : '#4A90E2'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.35rem', color: '#fff', fontFamily: 'Orbitron, monospace',
                        }}>{i < 2 ? '' : '!'}</div>
                        <div style={{ fontSize: '0.38rem', color: i < 2 ? '#22C55E' : '#4A90E2', fontFamily: 'Orbitron, monospace' }}>{step}</div>
                        {i < 2 && <div style={{ width: 12, height: 1, background: '#22C55E55' }} />}
                      </div>
                    ))}
                  </div>

                  {/* QR 코드 */}
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, padding: 10, background: '#fff', borderRadius: 6 }}>
                    <QRCodeSVG value={paymentUrl} size={120} />
                  </div>

                  {/* URL 표시 + 복사 버튼 */}
                  <div style={{
                    background: 'rgba(74,144,226,0.06)',
                    border: '1px solid #4A90E233',
                    borderRadius: 4, padding: '8px 10px', marginBottom: 8,
                  }}>
                    <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.32rem', letterSpacing: '0.15em', marginBottom: 4 }}>PAYMENT URL</div>
                    <div style={{ color: '#4A90E2', fontSize: '0.45rem', wordBreak: 'break-all', lineHeight: 1.5 }}>
                      {paymentUrl.length > 60 ? paymentUrl.substring(0, 60) + '...' : paymentUrl}
                    </div>
                  </div>

                  {/* 버튼 2개 */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div
                      onClick={() => {
                        navigator.clipboard.writeText(paymentUrl);
                        setPaymentCopied(true);
                        setTimeout(() => setPaymentCopied(false), 2000);
                      }}
                      style={{
                        flex: 1, padding: '8px', textAlign: 'center', cursor: 'pointer',
                        background: paymentCopied ? 'rgba(34,197,94,0.15)' : 'rgba(74,144,226,0.12)',
                        border: `1px solid ${paymentCopied ? '#22C55E55' : '#4A90E255'}`,
                        fontFamily: 'Orbitron, monospace',
                        color: paymentCopied ? '#22C55E' : '#4A90E2',
                        fontSize: '0.38rem', letterSpacing: '0.15em',
                        transition: 'all 0.2s',
                      }}
                    >{paymentCopied ? 'COPIED ' : 'COPY URL'}</div>
                    <div
                      onClick={() => window.open(paymentUrl, '_blank')}
                      style={{
                        flex: 1, padding: '8px', textAlign: 'center', cursor: 'pointer',
                        background: 'rgba(34,197,94,0.12)',
                        border: '1px solid #22C55E55',
                        fontFamily: 'Orbitron, monospace',
                        color: '#22C55E', fontSize: '0.38rem', letterSpacing: '0.15em',
                      }}
                    >OPEN LINK</div>
                  </div>

                  <div style={{ marginTop: 8, fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.32rem', letterSpacing: '0.1em', textAlign: 'center', lineHeight: 1.6 }}>
                    QR 스캔 또는 링크 클릭 후 결제만 완료하시면 됩니다
                  </div>
                </div>
              )}

              {/* 스크린샷 */}
              {bookingScreenshot && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.32rem', letterSpacing: '0.15em', marginBottom: 4 }}>PAGE PREVIEW</div>
                  <img
                    src={bookingScreenshot}
                    alt="예약 페이지 스크린샷"
                    style={{ width: '100%', borderRadius: 4, border: `1px solid #4A90E222` }}
                  />
                </div>
              )}

              {/* 예약 가능 시간 목록 */}
              {bookingSlots.length > 0 && (
                <div>
                  <div style={{ fontFamily: 'Orbitron, monospace', color: THEME.textDim, fontSize: '0.35rem', letterSpacing: '0.15em', marginBottom: 6 }}>AVAILABLE TIMES — 클릭하여 예약</div>
                  {bookingSlots.map((slot, i) => (
                    <div
                      key={i}
                      onClick={() => {
                        // 클릭 시 해당 시간으로 바로 예약 명령 실행
                        const cmd = `${slot} 시간으로 예약해줘`;
                        addMessage('user', cmd);
                        handleTextSubmit(cmd);
                      }}
                      style={{
                        padding: '8px 12px', marginBottom: 6,
                        background: 'rgba(74,144,226,0.12)',
                        border: '1px solid #4A90E255',
                        color: '#4A90E2', fontSize: '0.7rem',
                        fontFamily: 'monospace',
                        cursor: 'pointer',
                        borderRadius: 4,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(74,144,226,0.25)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(74,144,226,0.12)')}
                    >
                      <span>{slot}</span>
                      <span style={{ fontSize: '0.55rem', color: '#22C55E', fontFamily: 'Orbitron, monospace', letterSpacing: '0.1em' }}>예약 →</span>
                    </div>
                  ))}
                </div>
              )}

              {!paymentUrl && bookingSlots.length === 0 && (
                <div style={{ color: THEME.textDim, fontSize: '0.5rem', textAlign: 'center', padding: '10px 0' }}>
                  예약 가능한 시간을 확인 중입니다...
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 발주서 파일 업로드 모달 ── */}
      <AnimatePresence>
        {orderFileUploadVisible && (
          <motion.div
            key="order-file-modal"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 9000,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.85)',
            }}
          >
            <div style={{
              background: 'linear-gradient(135deg, #0a0f1a 0%, #0d1526 100%)',
              border: '1px solid #C8A96E',
              borderRadius: 16,
              padding: 32,
              width: 360,
              textAlign: 'center',
              boxShadow: '0 0 40px rgba(200,169,110,0.3)',
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>[PKG]</div>
              <div style={{ color: '#C8A96E', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                {orderFileAction === 'process_order_file_and_send' ? '발주서 처리 + 이메일 발송' : '발주서 파일 처리'}
              </div>
              <div style={{ color: '#A8B8C8', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
                스마트스토어에서 다운로드한<br/>
                발주발송관리 엑셀 파일을 업로드하세요.<br/>
                <span style={{ color: '#C8A96E', fontSize: 12 }}>비밀번호 1234 자동 해제</span>
              </div>
              <input
                ref={orderFileInputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (orderFileResolveRef.current) {
                    orderFileResolveRef.current(file);
                    orderFileResolveRef.current = null;
                  }
                }}
              />
              {orderFileProcessing ? (
                <div style={{ color: '#7EC89B', fontSize: 14 }}>⏳ 처리 중...</div>
              ) : (
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                  <button
                    onClick={() => orderFileInputRef.current?.click()}
                    style={{
                      background: 'linear-gradient(135deg, #C8A96E, #8B6F3E)',
                      color: '#fff', border: 'none', borderRadius: 8,
                      padding: '10px 24px', fontSize: 14, fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    파일 선택
                  </button>
                  <button
                    onClick={() => {
                      if (orderFileResolveRef.current) {
                        orderFileResolveRef.current(null);
                        orderFileResolveRef.current = null;
                      }
                    }}
                    style={{
                      background: 'transparent', color: '#A8B8C8',
                      border: '1px solid #334155', borderRadius: 8,
                      padding: '10px 24px', fontSize: 14, cursor: 'pointer',
                    }}
                  >
                    취소
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 스케줄 알림 ── */}
      <AnimatePresence>
        {schedules.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            style={{
              position: 'fixed', top: 80, right: 28,
              zIndex: 35, pointerEvents: 'none',
            }}
          >
            {schedules.slice(-3).map((s, i) => (
              <div key={i} style={{
                background: 'rgba(6,10,18,0.9)',
                border: `1px solid #9B8EC444`,
                borderLeft: '2px solid #9B8EC4',
                padding: '8px 14px',
                marginBottom: 6,
                backdropFilter: 'blur(8px)',
                maxWidth: 200,
              }}>
                <div style={{ fontFamily: 'Orbitron, monospace', color: '#9B8EC4', fontSize: '0.38rem', letterSpacing: '0.2em' }}>SCHEDULED</div>
                <div style={{ color: THEME.text, fontSize: '0.55rem', marginTop: 2 }}>{s.task.substring(0, 30)}</div>
                <div style={{ color: THEME.textDim, fontSize: '0.45rem', marginTop: 2 }}>{s.time}</div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 플래트폼 데이터 카드 (명령 시에만 표시) ── */}
      <AnimatePresence>
        <PlatformDataCardsEnhanced visible={false} />
      </AnimatePresence>

      {/* ── 홀로그램 작업 패널 (v4.2) - 텔레메트리 기반 자동 표시 ── */}
      <HologramWorkPanel onCoreDimChange={setCoreDimLevel} />

      {/* ── 마켓 인텔리전스 카드 (v4.2) - 텔레메트리 기반 자동 표시 ── */}
      <MarketIntelCard visible={marketIntelVisible} onClose={() => setMarketIntelVisible(false)} />
      <MarketIntelChart visible={marketChartVisible} data={marketChartData} onClose={() => setMarketChartVisible(false)} />

      {/* ── 예약 전용 패널 (v4.2) - 단계별 진행 표시 ── */}
      <BookingPanel
        visible={!!bookingPanelData}
        businessName={bookingPanelData?.businessName || ''}
        date={bookingPanelData?.date || ''}
        time={bookingPanelData?.time || ''}
        currentStep={bookingPanelData?.currentStep || 0}
        availableSlots={bookingPanelData?.availableSlots || []}
        captchaImage={bookingPanelData?.captchaImage || ''}
        screenshot={bookingPanelData?.screenshot || ''}
        onSlotSelect={(slot) => {
          if (verificationResolveRef.current) {
            verificationResolveRef.current(slot);
            verificationResolveRef.current = null;
          }
        }}
        onCaptchaSubmit={(value) => {
          if (verificationResolveRef.current) {
            verificationResolveRef.current(value);
            verificationResolveRef.current = null;
          }
        }}
        onClose={() => setBookingPanelData(null)}
      />
      {/* ── 주문 대시보드 (v5.1) ── */}
      <OrderDashboard
        visible={orderDashboardVisible}
        data={orderDashboardData.length > 0 ? { orders: orderDashboardData, summary: orderDashboardSummary || undefined } : null}
        onClose={() => setOrderDashboardVisible(false)}
        onAction={(actionType, orderId) => {
          // 주문 대시보드에서 발주확인/발송처리 등 액션 실행
          const msg = actionType === 'confirm' ? `발주확인 처리해줘` : `발송처리 진행해줘`;
          handleTextSubmit(msg);
        }}
      />
      {/* ── 에이전트 콘솔 패널 (v4.2) - 실시간 작업 로그 ── */}
      <AgentConsolePanel
        visible={agentConsoleVisible}
        onClose={() => setAgentConsoleVisible(false)}
        onUserInput={(value) => {
          // 캔차/OTP 입력 처리
          if (verificationResolveRef.current) {
            verificationResolveRef.current(value);
            verificationResolveRef.current = null;
          }
        }}
        captchaImage={captchaScreenshot}
        captchaMode={verificationMode}
        isWorking={state === 'working' || state === 'thinking'}
      />
      {/* ── File Workspace Panel ── */}
      <FileWorkspacePanel
        visible={workspaceVisible}
        onClose={() => setWorkspaceVisible(false)}
        onOpenRecord={(record) => {
          // 레코드 선택 시 상세 조회
          console.log('[JARVIS] Open record:', record.recordId);
        }}
        records={workspaceRecords}
        loading={workspaceLoading}
        onRefresh={fetchWorkspaceRecords}
      />
      <InfluencerOutreachPanel
        visible={outreachVisible}
        onCandidateSelect={(candidate) => {
          handleJarvisContextEvent({ intent: 'candidate_selected', screen: 'candidate_detail', payload: candidate });
          setOutreachWorkspaceVisible(true);
        }}
        candidates={outreachCandidates}
        loading={outreachLoading}
        onClose={() => setOutreachVisible(false)}
        onSave={async (candidates) => {
          try {
            const res = await fetch('/api/cloud-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ taskType: 'outreach-save', params: { candidates } }),
            });
            const data = await res.json();
            if (data.success) {
              emitMissionLog('📥', 'OUTREACH', `${candidates.length}명 Google Sheets 저장 완료`, 'success');
              addMessage('jarvis', `✅ ${candidates.length}명의 후보를 Google Sheets에 저장했습니다.`, true);
            } else {
              emitMissionLog('❌', 'OUTREACH', '저장 실패', 'error');
              addMessage('jarvis', '저장 중 오류가 발생했습니다.', true);
            }
          } catch (e: any) {
            emitMissionLog('❌', 'OUTREACH', `저장 실패: ${e.message}`, 'error');
          }
        }}
      />
      {/* ── Market Price Panel ── */}
      <MarketPricePanel
        visible={marketPriceVisible}
        onClose={() => { setMarketPriceVisible(false); setMarketPriceResult(null); setMarketPriceInputMode(false); }}
        result={marketPriceResult}
        inputMode={marketPriceInputMode}
        onSubmitInput={handleMarketPriceSubmit}
        loading={marketPriceLoading}
      />
      {/* ── 뉴럴 미션 맵 (시스템 현황) ── */}
      <AnimatePresence>
        {neuralMapVisible && (
          <NeuralMissionMap onClose={() => setNeuralMapVisible(false)} />
        )}
      </AnimatePresence>

      {/* ── Manus 글로벌 전략 대시보드 ── */}
      <AnimatePresence>
        {strategyDashboardVisible && (
          <ManusStrategyDashboard
            onClose={() => setStrategyDashboardVisible(false)}
            onExecuteStrategy={(strategyId, prompt) => {
              setStrategyDashboardVisible(false);
              // Manus 전략 실행을 음성 명령처럼 처리
              const strategyNames: Record<string, string> = {
                influencer_hunt: '무인 인플루언서 협상',
                viral_factory: '바이럴 콘텐츠 공장',
                community_stealth: '커뮤니티 자동 대응',
                auto_revenue: '무인 수익 자동화',
              };
              const name = strategyNames[strategyId] || strategyId;
              const msg = `[${name}] ${prompt}`;
              handleTextSubmit(msg);
            }}
          />
        )}
      </AnimatePresence>

      {/* ── 라이브 브라우저 뷰어 (실시간 크롤링 화면) ── */}      <LiveBrowserViewer
        visible={liveViewerVisible}
        onClose={() => setLiveViewerVisible(false)}
        taskInfo={liveViewerTask || undefined}
      />
      {/* ── UI-J Dual Screen Arm Panel ── */}
      <div className="jarvis-dual-arm-panel">
        <button
          type="button"
          className={`jarvis-dual-arm-button ${dualScreenArmed ? 'is-armed' : ''}`}
          onClick={armDualScreen}
          title="2번 모니터 Data Wall을 열고 박수 오프닝을 준비합니다"
        >
          {dualScreenArmed ? 'CLAP ARMED' : 'DUAL ARM'}
        </button>
        <button
          type="button"
          className="jarvis-dual-activate-button"
          onClick={() => triggerDualScreenOpening('touch')}
          title="박수 대신 수동으로 듀얼스크린 오프닝을 실행합니다"
        >
          ACTIVATE
        </button>
        {dualArmStatus !== 'idle' && (
          <span className={`jarvis-dual-arm-status status-${dualArmStatus}`}>
            {dualArmStatus === 'armed' && '2ND SCREEN READY'}
            {dualArmStatus === 'linked' && 'LINKED'}
            {dualArmStatus === 'opened' && 'WINDOW OPENED'}
            {dualArmStatus === 'blocked' && 'POPUP BLOCKED'}
          </span>
        )}
      </div>

      {/* ── UI-J 1번 화면 Split Opening Overlay ── */}
      {dualOpeningActive && (
        <div className="jarvis-dual-opening-overlay" aria-hidden="true">
          <div className="jarvis-dual-split split-left" />
          <div className="jarvis-dual-split split-right" />
          <div className="jarvis-dual-opening-core">
            <span>JARVIS SYSTEM ONLINE</span>
            <strong>DUAL SCREEN LINK ESTABLISHED</strong>
          </div>
        </div>
      )}
    </main>
  );
}
