/**
 * COPY-S.1: Human Desire Copy Engine Types
 * 인간 욕구 기반 카피 생성 시스템의 핵심 타입 정의
 */

// ═══ Human Desire (인간 욕구) ═══
export type HumanDesire =
  | 'save_money'
  | 'choose_good_quality'
  | 'feed_family'
  | 'avoid_regret'
  | 'buy_before_others'
  | 'not_miss_season'
  | 'gift_praise'
  | 'buy_from_trusted_person';

// ═══ Customer Anxiety (고객 불안) ═══
export type CustomerAnxiety =
  | 'bad_taste'
  | 'damaged_delivery'
  | 'ugly_or_small'
  | 'overpriced'
  | 'different_from_photo'
  | 'family_rejects'
  | 'bad_gift_feedback';

// ═══ Purchase Trigger (구매 트리거) ═══
export type PurchaseTrigger =
  | 'seasonal_peak'
  | 'limited_quantity'
  | 'direct_from_farm'
  | 'harvested_today'
  | 'repurchase'
  | 'sold_out_risk'
  | 'holiday'
  | 'kimjang'
  | 'camping'
  | 'kids_snack'
  | 'group_buy_deadline';

// ═══ Platform Copy Channel ═══
export type PlatformCopyChannel =
  | 'threads'
  | 'youtube_shorts'
  | 'youtube_thumbnail'
  | 'instagram_reels'
  | 'tiktok'
  | 'naver_blog'
  | 'outreach_email'
  | 'smartstore_detail';

// ═══ Agri Sensory Profile (농산물 감각 데이터) ═══
export interface AgriSensoryProfile {
  product: string;
  texture: string[];
  aroma: string[];
  scene: string[];
  timing: string[];
  emotionalImages: string[];
}

// ═══ Human Desire Copy Context (카피 생성 컨텍스트) ═══
export interface HumanDesireCopyContext {
  product: string;
  platform: PlatformCopyChannel;
  outputType: string;
  sourceKeyword?: string;
  desires: HumanDesire[];
  anxieties: CustomerAnxiety[];
  triggers: PurchaseTrigger[];
  sensoryProfile: AgriSensoryProfile;
  mawinVoiceRules: string[];
  performanceMemory?: CopyPerformanceMemory[];
  platformRules?: PlatformCopyRules;
  commentPrediction?: boolean;
  timingOptimization?: boolean;
}

// ═══ Human Desire Copy Result (카피 생성 결과) ═══
export interface HumanDesireCopyResult {
  text: string;
  platform: PlatformCopyChannel;
  outputType: string;
  desires: HumanDesire[];
  anxieties: CustomerAnxiety[];
  triggers: PurchaseTrigger[];
  sensory: string[];
  hookType: string;
  platformFitScore: number;
  desireFitScore: number;
  anxietyResolutionScore: number;
  mawinVoiceScore: number;
  originalityScore: number;
  boringScore: number;
  riskScore: number;
  finalScore: number;
  recommended: boolean;
  whyRecommended: string;
  rewriteHint?: string;
  // 추가 엔진 결과
  predictedComments?: string[];
  commentEngagementScore?: number;
  bestPostingTime?: string;
  bestPostingReason?: string;
  abTestGroup?: string;
}

// ═══ Copy Performance Memory (성과 데이터) ═══
export interface CopyPerformanceMemory {
  contentId: string;
  product: string;
  platform: PlatformCopyChannel;
  copyText: string;
  formatType: string;
  views?: number;
  comments?: number;
  saves?: number;
  shares?: number;
  openchatJoins?: number;
  orders?: number;
  resultLabel: 'won' | 'lost' | 'unknown';
  whyWorked?: string;
  whyFailed?: string;
  createdAt?: string;
}

// ═══ Platform Copy Rules (플랫폼별 규칙) ═══
export interface PlatformCopyRules {
  platform: PlatformCopyChannel;
  maxLength: number;
  structure: string[];
  tone: string;
  doRules: string[];
  dontRules: string[];
  hookStyle: string;
  endingStyle: string;
}

// ═══ Verified Signals (검증된 시그널) ═══
export interface VerifiedSignals {
  seasonalPeak?: boolean;
  limitedQuantity?: boolean;
  harvestedToday?: boolean;
  repurchase?: boolean;
  soldOutRisk?: boolean;
  deadline?: boolean;
}
