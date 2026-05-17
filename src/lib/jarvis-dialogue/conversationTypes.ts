/**
 * JARVIS-CONVERSATION-OS-A.1
 * Conversation OS 핵심 타입 정의
 */

export type JarvisScreen =
  | 'home'
  | 'smartstore_mission'
  | 'outreach_result'
  | 'candidate_detail'
  | 'copy_result'
  | 'copy_card_detail'
  | 'data_wall'
  | 'unknown';

export type JarvisDialogueIntent =
  | 'screen_briefing'
  | 'task_started'
  | 'task_completed'
  | 'candidate_selected'
  | 'candidate_detail_requested'
  | 'outreach_collection_completed'
  | 'copy_card_selected'
  | 'copy_generation_completed'
  | 'next_action_requested'
  | 'datawall_briefing_requested'
  | 'smartstore_briefing_requested'
  | 'copy_brain_briefing_requested'
  | 'busy_notice'
  | 'fallback_chat';

export type JarvisSuggestedAction = {
  id: string;
  label: string;
  mode: 'observe' | 'draft' | 'locked';
  disabled?: boolean;
};

export type OutreachCandidateSafe = {
  id: string;
  platform: string;
  name: string;
  channelTitle: string;
  profileUrl?: string;
  contentUrl?: string;
  category?: string;
  fitScore: number;
  emailExists: boolean;
  contactChannel?: string;
  recentContentTitle?: string;
  recentContentSummary?: string;
  reasonForFit?: string;
  proposalAngle?: string;
  status?: string;
};

export type CopyResultCardSafe = {
  id: string;
  title: string;
  text: string;
  platform?: string;
  outputType?: string;
  scores?: { hook?: number; desire?: number; viral?: number; risk?: number };
  hookType?: string;
  buyerDesire?: string;
  recommended?: boolean;
  riskFlags?: string[];
};

export type OutreachCollectionSummarySafe = {
  totalCollected: number;
  emailConfirmed: number;
  platforms: Record<string, number>;
  avgFitScore: number;
  savedToSheets: boolean;
};

export type DataWallConversationSummary = {
  smartstore?: { newOrders: number; preparing: number; revenue?: number };
  outreach?: { totalCandidates: number; emailConfirmed: number; pending: number };
  hotContent?: { youtube: number; threads: number; naver: number; instagram: number };
  copyBrain?: { status: string; totalCopies: number; recommended: number; topHooks?: string[] };
  telegram?: { status: string };
  sheets?: { status: string };
};

export type SmartstoreConversationSummary = {
  newOrders: number;
  preparing: number;
  shipped: number;
  revenue?: number;
  pendingSettlement?: number;
};

export type CopyBrainConversationSummary = {
  status: string;
  totalCopies: number;
  recommended: number;
  avgScore: number;
  topHooks: string[];
  dnaSource: string;
};

export type JarvisConversationContext = {
  screen: JarvisScreen;
  intent: JarvisDialogueIntent;
  userText?: string;
  selectedCandidate?: OutreachCandidateSafe | null;
  selectedCopy?: CopyResultCardSafe | null;
  outreachSummary?: OutreachCollectionSummarySafe | null;
  dataWallSummary?: DataWallConversationSummary | null;
  smartstoreSummary?: SmartstoreConversationSummary | null;
  copyBrainSummary?: CopyBrainConversationSummary | null;
  executeLocked: boolean;
  lastAssistantMessage?: string;
};

export type JarvisReply = {
  text: string;
  shouldSpeak: boolean;
  shouldShowInChat: boolean;
  suggestedActions?: JarvisSuggestedAction[];
};

export type JarvisContextEvent = {
  intent: JarvisDialogueIntent;
  screen: JarvisScreen;
  payload?: unknown;
};
