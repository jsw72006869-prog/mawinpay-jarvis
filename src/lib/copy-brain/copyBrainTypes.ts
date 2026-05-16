/**
 * COPY-BRAIN-A.1: Mawin Agricultural Copy Brain Core Types
 * 모든 Copy Brain 엔진에서 공유하는 타입 정의
 */

// ═══ Product Truth Engine ═══
export interface ProductTruth {
  product: string;
  core_truth: string[];
  sensory_points: string[];
  seasonal_timing: string;
  buyer_contexts: string[];
  trust_signals: string[];
  avoid_claims: string[];
  content_angles: string[];
}

// ═══ Buyer Desire Engine ═══
export type BuyerDesireType =
  | 'nostalgia'
  | 'seasonal_craving'
  | 'family_care'
  | 'gift'
  | 'scarcity_timing'
  | 'sensory_imagination'
  | 'trust'
  | 'convenience'
  | 'identity'
  | 'community_participation';

export interface BuyerDesire {
  type: BuyerDesireType;
  label: string;
  description: string;
  trigger_keywords: string[];
}

// ═══ Copy DNA Extractor ═══
export type HookType =
  | 'conflict_hook'
  | 'confession_hook'
  | 'seasonal_hook'
  | 'sensory_hook'
  | 'contrarian_hook'
  | 'local_trust_hook'
  | 'memory_hook'
  | 'limited_timing_hook'
  | 'identity_hook';

export interface CopyDNA {
  hook_type: HookType;
  first_line_pattern: string;
  tension: string;
  emotional_trigger: string;
  buyer_desire: BuyerDesireType;
  sensory_anchor: string;
  proof_signal: string;
  comment_trigger: string;
  ending_style: string;
  platform_pattern: string;
  usable_for: string[];
  risk_flags: string[];
}

// ═══ Platform Formula Engine ═══
export type PlatformType = 'threads' | 'instagram' | 'youtube_shorts' | 'tiktok' | 'naver_blog' | 'outreach_email';

export interface PlatformFormula {
  platform: PlatformType;
  structure: string[];
  tone: string;
  length_guide: string;
  do_rules: string[];
  dont_rules: string[];
}

// ═══ Copy Output Types ═══
export type CopyOutputType =
  | 'headline_copy'
  | 'thumbnail_copy'
  | 'threads_post'
  | 'shorts_script_15s'
  | 'instagram_caption'
  | 'tiktok_script'
  | 'naver_blog_intro'
  | 'outreach_email_draft';

// ═══ Copy Judge / Ranker ═══
export interface CopyScore {
  hook_score: number;
  sensory_score: number;
  buyer_desire_score: number;
  product_truth_score: number;
  platform_fit_score: number;
  mawi_voice_score: number;
  originality_score: number;
  action_score: number;
  risk_score: number;
  boring_score: number;
  final_score: number;
  recommended: boolean;
  rewrite_required: boolean;
  risk_flags: string[];
  rewrite_reason: string;
}

// ═══ Generated Copy Item ═══
export interface GeneratedCopy {
  copy_id: string;
  product: string;
  platform: PlatformType;
  output_type: CopyOutputType;
  source_keyword: string;
  generated_text: string;
  angle: string;
  hook_type: HookType;
  buyer_desire: BuyerDesireType;
  product_truth_used: string;
  copy_dna_ref: string;
  score: CopyScore;
}

// ═══ Copy Brain Compiler Input ═══
export interface CopyBrainInput {
  product: string;
  platform: PlatformType;
  outputTypes: CopyOutputType[];
  sourceKeyword: string;
  count: number;
  viralContents: ViralContentRef[];
  productTruth: ProductTruth;
  buyerDesires: BuyerDesire[];
  copyDNA: CopyDNA[];
  mawiVoiceRules: MawiVoiceRules;
  platformFormula: PlatformFormula;
}

export interface ViralContentRef {
  platform: string;
  hook_text: string;
  engagement_visible: string;
  hot_reason: string;
  copy_pattern?: string;
  emotion_trigger?: string;
}

export interface MawiVoiceRules {
  do_rules: string[];
  dont_rules: string[];
  banned_phrases: string[];
  style_examples: string[];
}

// ═══ Copy Brain Generate Result ═══
export interface CopyBrainResult {
  success: boolean;
  dryRun: boolean;
  product: string;
  platform: string;
  copies: GeneratedCopy[];
  summary: {
    total: number;
    recommended: number;
    rewrite_required: number;
    risk_warnings: number;
    boring_filtered: number;
    top_hook_types: string[];
    top_buyer_desires: string[];
  };
  error?: string;
}
