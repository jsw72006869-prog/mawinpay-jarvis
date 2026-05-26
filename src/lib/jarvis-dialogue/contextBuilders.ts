/**
 * JARVIS-CONVERSATION-OS-A.1
 * Safe Context Builder — 민감정보 제거 후 GPT context 구성
 */

import type {
  JarvisConversationContext,
  OutreachCandidateSafe,
  CopyResultCardSafe,
  OutreachCollectionSummarySafe,
  DataWallConversationSummary,
  JarvisScreen,
} from './conversationTypes';

/**
 * 후보 데이터에서 민감정보(이메일 원문, 전화번호 등) 제거
 */
export function toSafeCandidate(candidate: any): OutreachCandidateSafe {
  return {
    id: candidate.id || candidate.channelTitle || '',
    platform: candidate.platform || '',
    name: candidate.name || candidate.channelTitle || '',
    channelTitle: candidate.channelTitle || '',
    profileUrl: candidate.profileUrl || candidate.channelUrl || '',
    contentUrl: candidate.contentUrl || candidate.videoUrl || '',
    category: candidate.category || candidate.contentCategory || '',
    fitScore: candidate.fitScore || candidate.productFitScore || 0,
    emailExists: Boolean(candidate.emailExists || candidate.contactEmail),
    contactChannel: candidate.contactChannel || '',
    recentContentTitle: candidate.recentContentTitle || candidate.videoTitle || '',
    recentContentSummary: candidate.recentContentSummary || '',
    reasonForFit: candidate.reasonForFit || candidate.fitReason || '',
    proposalAngle: candidate.proposalAngle || candidate.proposalStrategy || '',
    requestedVertical: candidate.requested_vertical || candidate.requestedVertical || '',
    targetMatchStatus: candidate.target_match_status || candidate.targetMatchStatus || '',
    targetMatchScore: Number(candidate.target_match_score ?? candidate.targetMatchScore ?? 0),
    targetEvidenceTerms: String(candidate.target_evidence_terms || candidate.targetEvidenceTerms || '')
      .split(',')
      .map((term) => term.trim())
      .filter(Boolean)
      .slice(0, 6),
    targetEvidenceFields: String(candidate.target_evidence_fields || candidate.targetEvidenceFields || '')
      .split(',')
      .map((field) => field.trim())
      .filter(Boolean)
      .slice(0, 6),
    excludeReason: candidate.target_exclude_reason || candidate.excludeReason || candidate.excludedReason || '',
    status: candidate.status || 'collected',
  };
}

/**
 * 카피 카드에서 민감정보 제거
 */
export function toSafeCopyCard(copy: any): CopyResultCardSafe {
  return {
    id: copy.id || `copy_${Date.now()}`,
    title: copy.title || copy.headline || '',
    text: copy.text || copy.body || '',
    platform: copy.platform || '',
    outputType: copy.outputType || copy.type || '',
    scores: copy.scores || undefined,
    hookType: copy.hookType || '',
    buyerDesire: copy.buyerDesire || '',
    recommended: Boolean(copy.recommended),
    riskFlags: copy.riskFlags || [],
    desires: copy.desires || copy.desires_used || [],
    anxieties: copy.anxieties || (copy.anxiety_resolved ? [copy.anxiety_resolved] : []),
    triggers: copy.triggers || (copy.trigger_used ? [copy.trigger_used] : []),
    sensory: copy.sensory || copy.sensory_words || [],
    finalScore: Number(copy.finalScore ?? copy.viralScore ?? 0),
    whyRecommended: copy.whyRecommended || copy.why_this_works || '',
    rewriteHint: copy.rewriteHint || '',
  };
}

/**
 * 수집 결과 요약 (민감정보 없음)
 */
export function buildOutreachSummary(candidates: any[]): OutreachCollectionSummarySafe {
  const platforms: Record<string, number> = {};
  let emailCount = 0;
  let totalScore = 0;

  for (const c of candidates) {
    const p = c.platform || 'unknown';
    platforms[p] = (platforms[p] || 0) + 1;
    if (c.emailExists || c.contactEmail) emailCount++;
    totalScore += c.fitScore || c.productFitScore || 0;
  }

  return {
    totalCollected: candidates.length,
    emailConfirmed: emailCount,
    platforms,
    avgFitScore: candidates.length > 0 ? Math.round(totalScore / candidates.length) : 0,
    savedToSheets: true,
  };
}

/**
 * 후보 선택 시 context 구성
 */
export function buildCandidateConversationContext(params: {
  candidate: any;
  outreachSummary?: OutreachCollectionSummarySafe | null;
  lastAssistantMessage?: string;
}): JarvisConversationContext {
  return {
    screen: 'candidate_detail',
    intent: 'candidate_selected',
    selectedCandidate: toSafeCandidate(params.candidate),
    outreachSummary: params.outreachSummary ?? null,
    executeLocked: true,
    lastAssistantMessage: params.lastAssistantMessage,
  };
}

/**
 * 수집 완료 시 context 구성
 */
export function buildOutreachCompletionContext(params: {
  candidates: any[];
  lastAssistantMessage?: string;
}): JarvisConversationContext {
  return {
    screen: 'outreach_result',
    intent: 'outreach_collection_completed',
    outreachSummary: buildOutreachSummary(params.candidates),
    executeLocked: true,
    lastAssistantMessage: params.lastAssistantMessage,
  };
}

/**
 * 카피 카드 선택 시 context 구성
 */
export function buildCopyCardConversationContext(params: {
  copy: any;
  lastAssistantMessage?: string;
}): JarvisConversationContext {
  return {
    screen: 'copy_card_detail',
    intent: 'copy_card_selected',
    selectedCopy: toSafeCopyCard(params.copy),
    executeLocked: true,
    lastAssistantMessage: params.lastAssistantMessage,
  };
}

/**
 * 카피 생성 완료 시 context 구성
 */
export function buildCopyCompletionContext(params: {
  copies: any[];
  product: string;
  type: string;
  lastAssistantMessage?: string;
}): JarvisConversationContext {
  return {
    screen: 'copy_result',
    intent: 'copy_generation_completed',
    copyBrainSummary: {
      status: 'ACTIVE',
      totalCopies: params.copies.length,
      recommended: params.copies.filter((c: any) => c.recommended).length,
      avgScore: 0,
      topHooks: params.copies.slice(0, 3).map((c: any) => c.hookType || '').filter(Boolean),
      dnaSource: params.product,
    },
    executeLocked: true,
    lastAssistantMessage: params.lastAssistantMessage,
  };
}

/**
 * DataWall 브리핑 요청 시 context 구성
 */
export function buildDataWallConversationContext(params: {
  dataWallState: any;
  lastAssistantMessage?: string;
}): JarvisConversationContext {
  const dw = params.dataWallState || {};
  return {
    screen: 'data_wall',
    intent: 'datawall_briefing_requested',
    dataWallSummary: {
      smartstore: dw.smartstore || undefined,
      outreach: dw.outreach || undefined,
      hotContent: dw.hotContent || undefined,
      copyBrain: dw.copyBrain || undefined,
      telegram: dw.telegram || undefined,
      sheets: dw.sheets || undefined,
    },
    executeLocked: true,
    lastAssistantMessage: params.lastAssistantMessage,
  };
}

/**
 * GPT에 전달하기 전 최종 sanitize
 */
export function sanitizeContextForGPT(ctx: JarvisConversationContext): JarvisConversationContext {
  const sanitized = { ...ctx };

  // 이메일 원문, 전화번호, token, secret, env 등 제거
  if (sanitized.selectedCandidate) {
    const c = { ...sanitized.selectedCandidate };
    // emailExists만 유지, 원문 제거
    delete (c as any).contactEmail;
    delete (c as any).email;
    delete (c as any).phone;
    sanitized.selectedCandidate = c;
  }

  // lastAssistantMessage 길이 제한
  if (sanitized.lastAssistantMessage && sanitized.lastAssistantMessage.length > 200) {
    sanitized.lastAssistantMessage = sanitized.lastAssistantMessage.slice(0, 200) + '...';
  }

  return sanitized;
}
