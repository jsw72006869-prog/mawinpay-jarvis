export type OutreachEmailCandidate = {
  candidateId?: string;
  influencer_id?: string;
  channelName?: string;
  channel_name?: string;
  channelTitle?: string;
  name?: string;
  requestedVertical?: string;
  requested_vertical?: string;
  recentVideoTitles?: string[];
  recentContentTitle?: string;
  recent_video_title?: string;
  videoTitle?: string;
  channelDescription?: string;
  description?: string;
  notes?: string;
  contentStyle?: string;
  content_style?: string;
  channelTone?: string;
  channel_tone?: string;
  audienceProfile?: string;
  audience_profile?: string;
  fitReason?: string;
  fit_reason?: string;
  productFitReason?: string;
  suggestedCollabAngle?: string;
  proposal_angle?: string;
  proposalAngle?: string;
  source_product?: string;
  suggestedProduct?: string;
  qualityTier?: string;
  priority_score?: number;
};

export type PersonalizedInfluencerEmailInput = {
  candidateId?: string;
  channelName?: string;
  channelTitle?: string;
  requestedVertical?: string;
  productName?: string;
  recentVideoTitles?: string[];
  channelDescription?: string;
  contentStyle?: string;
  channelTone?: string;
  audienceProfile?: string;
  fitReason?: string;
  suggestedCollabAngle?: string;
};

export type PersonalizedInfluencerEmailV2Input = {
  candidate: OutreachEmailCandidate;
  product?: {
    name?: string;
    benefits?: string[];
    proofPoints?: string[];
  };
  brand?: {
    name?: string;
    tone?: string;
  };
  options?: {
    requestedVertical?: string;
    campaignGoal?: string;
    maxBodyChars?: number;
  };
};

export type PersonalizedInfluencerEmail = {
  subject: string;
  body: string;
  preview: string;
  personalizationStatus: 'ready' | 'review' | 'blocked';
  personalizationScore: number;
  signals: string[];
  usedSignals: string[];
  riskFlags: string[];
  quality?: {
    score: number;
    passed: boolean;
    flags: string[];
  };
};

function compact(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map(compact).filter(Boolean)));
}

function normalizeInput(input: PersonalizedInfluencerEmailInput | PersonalizedInfluencerEmailV2Input): {
  candidateId?: string;
  channelName: string;
  requestedVertical: string;
  productName: string;
  brandName: string;
  recentVideoTitles: string[];
  channelDescription: string;
  contentStyle: string;
  fitReason: string;
  suggestedCollabAngle: string;
  benefits: string[];
  proofPoints: string[];
} {
  if ('candidate' in input) {
    const candidate = input.candidate || {};
    const recentVideoTitles = Array.isArray(candidate.recentVideoTitles)
      ? candidate.recentVideoTitles
      : [candidate.recentContentTitle, candidate.videoTitle, candidate.recent_video_title].filter(Boolean) as string[];
    return {
      candidateId: candidate.candidateId || candidate.influencer_id,
      channelName: compact(candidate.channelName || candidate.channel_name || candidate.channelTitle || candidate.name) || '크리에이터님',
      requestedVertical: compact(input.options?.requestedVertical || candidate.requestedVertical || candidate.requested_vertical) || 'unknown',
      productName: compact(input.product?.name || candidate.source_product || candidate.suggestedProduct) || 'MAWINPAY 상품',
      brandName: compact(input.brand?.name) || 'MAWINPAY',
      recentVideoTitles,
      channelDescription: compact(candidate.channelDescription || candidate.description || candidate.notes),
      contentStyle: compact(candidate.contentStyle || candidate.content_style || candidate.channelTone || candidate.channel_tone || candidate.audienceProfile || candidate.audience_profile),
      fitReason: compact(candidate.fitReason || candidate.fit_reason || candidate.productFitReason),
      suggestedCollabAngle: compact(candidate.suggestedCollabAngle || candidate.proposal_angle || candidate.proposalAngle || input.options?.campaignGoal),
      benefits: unique(input.product?.benefits || []),
      proofPoints: unique(input.product?.proofPoints || []),
    };
  }
  return {
    candidateId: input.candidateId,
    channelName: compact(input.channelName || input.channelTitle) || '크리에이터님',
    requestedVertical: compact(input.requestedVertical) || 'unknown',
    productName: compact(input.productName) || 'MAWINPAY 상품',
    brandName: 'MAWINPAY',
    recentVideoTitles: Array.isArray(input.recentVideoTitles) ? input.recentVideoTitles : [],
    channelDescription: compact(input.channelDescription),
    contentStyle: compact(input.contentStyle || input.channelTone || input.audienceProfile),
    fitReason: compact(input.fitReason),
    suggestedCollabAngle: compact(input.suggestedCollabAngle),
    benefits: [],
    proofPoints: [],
  };
}

function verticalAngle(vertical: string, product: string): string {
  if (vertical === 'camping') return `${product}을 캠핑 장면에서 바로 꺼내 먹는 간편한 현장형 콘텐츠로 제안드리고 싶습니다.`;
  if (vertical === 'beauty') return `${product}의 사용감과 비주얼을 뷰티 루틴 콘텐츠에 맞춰 자연스럽게 보여드리는 방향을 제안드립니다.`;
  if (vertical === 'food' || vertical === 'cooking') return `${product}을 레시피나 시식 리뷰 흐름에 맞춰 부담 없는 협업으로 제안드리고 싶습니다.`;
  if (vertical === 'parenting') return `${product}을 가족 간식이나 살림 콘텐츠 맥락에서 소개하는 방향이 잘 맞을 것 같습니다.`;
  return `${product}을 채널 톤에 맞춘 리뷰 또는 공동구매 협업으로 제안드리고 싶습니다.`;
}

function firstSignal(input: ReturnType<typeof normalizeInput>): string {
  const title = compact(input.recentVideoTitles[0]);
  if (title) return `최근 콘텐츠 "${title.slice(0, 56)}"`;
  if (input.fitReason) return input.fitReason.slice(0, 70);
  if (input.channelDescription) return input.channelDescription.slice(0, 70);
  if (input.contentStyle) return input.contentStyle.slice(0, 70);
  return '';
}

function buildSubject(input: ReturnType<typeof normalizeInput>, signal: string): string {
  const signalHint = signal
    .replace(/^최근 콘텐츠\s*/, '')
    .replace(/^"|"$/g, '')
    .slice(0, 26);
  const verticalLabel: Record<string, string> = {
    camping: '캠핑 콘텐츠',
    beauty: '뷰티 콘텐츠',
    food: '푸드 콘텐츠',
    cooking: '요리 콘텐츠',
    parenting: '가족 콘텐츠',
  };
  const label = verticalLabel[input.requestedVertical] || '채널 콘텐츠';
  if (signalHint) return `${input.channelName} ${label}에 맞춘 ${input.productName} 협업 제안`;
  return `${input.channelName}님께 드리는 ${input.productName} 협업 제안`;
}

export function buildPersonalizedInfluencerEmail(input: PersonalizedInfluencerEmailInput | PersonalizedInfluencerEmailV2Input): PersonalizedInfluencerEmail {
  const normalized = normalizeInput(input);
  const signal = firstSignal(normalized);
  const angle = normalized.suggestedCollabAngle || verticalAngle(normalized.requestedVertical, normalized.productName);
  const benefits = normalized.benefits.slice(0, 2);
  const proofPoints = normalized.proofPoints.slice(0, 2);
  const signals = unique([
    signal,
    normalized.contentStyle,
    normalized.fitReason,
    normalized.suggestedCollabAngle,
    ...benefits,
    ...proofPoints,
  ]).slice(0, 6);
  const riskFlags: string[] = [];
  if (!signal) riskFlags.push('missing_real_content_signal');
  if (!normalized.channelName || normalized.channelName === '크리에이터님') riskFlags.push('missing_candidate_name');
  if (!angle) riskFlags.push('missing_collaboration_angle');

  let score = 42;
  if (signal) score += 24;
  if (normalized.contentStyle) score += 10;
  if (normalized.fitReason) score += 10;
  if (normalized.suggestedCollabAngle) score += 8;
  if (benefits.length > 0) score += 4;
  if (proofPoints.length > 0) score += 4;
  score = Math.max(0, Math.min(100, score));

  const bodyLines = [
    `${normalized.channelName}님, 안녕하세요.`,
    '',
    signal
      ? `${signal}를 보고 채널의 콘텐츠 결을 확인했습니다.`
      : `${normalized.channelName}님의 채널 분위기를 기준으로 협업 가능성을 검토했습니다.`,
    normalized.contentStyle ? `특히 ${normalized.contentStyle} 흐름이 인상적이었습니다.` : '',
    normalized.fitReason ? `이번 제안은 ${normalized.fitReason}이라는 점에서 맞닿아 있습니다.` : '',
    '',
    `${angle}`,
    benefits.length ? `핵심 포인트는 ${benefits.join(', ')}입니다.` : '',
    proofPoints.length ? `확인 가능한 근거로는 ${proofPoints.join(', ')}를 먼저 공유드릴 수 있습니다.` : '',
    '',
    `처음부터 큰 캠페인으로 진행하기보다, ${normalized.productName}을 먼저 확인해 보시고 채널에 맞는 리뷰, 체험 콘텐츠, 공동구매 중 자연스러운 방향으로 논의드리고 싶습니다.`,
    '',
    '관심 있으시면 편하게 회신 부탁드립니다.',
    '감사합니다.',
  ].filter(line => line !== '');

  const body = bodyLines.join('\n');
  const subject = buildSubject(normalized, signal);
  const baseEmail: PersonalizedInfluencerEmail = {
    subject: subject.length > 90 ? `${normalized.channelName}님 ${normalized.productName} 협업 제안` : subject,
    body,
    preview: body.slice(0, 240),
    personalizationStatus: score >= 70 ? 'ready' : score >= 50 ? 'review' : 'blocked',
    personalizationScore: score,
    signals,
    usedSignals: signals,
    riskFlags,
  };
  const quality = evaluateInfluencerEmailQuality(baseEmail);
  return {
    ...baseEmail,
    personalizationScore: quality.score,
    personalizationStatus: quality.passed ? 'ready' : quality.score >= 50 ? 'review' : 'blocked',
    quality,
  };
}

export function evaluateInfluencerEmailQuality(input: PersonalizedInfluencerEmail): {
  score: number;
  passed: boolean;
  flags: string[];
} {
  const flags = [...input.riskFlags];
  const subject = compact(input.subject);
  const body = compact(input.body);
  const firstParagraph = compact(input.body.split('\n').find(Boolean));
  if (!subject || /협업 제안$/.test(subject) && !subject.includes('님')) flags.push('generic_subject');
  if (!firstParagraph || firstParagraph.length < 8) flags.push('missing_candidate_name');
  if (!body || body.length < 180) flags.push('body_too_short');
  if (!/회신|논의|제안|확인/.test(body)) flags.push('missing_clear_cta');
  if ((input.usedSignals || input.signals || []).length === 0) flags.push('no_personalization_signal');
  if (/아무 채널|일괄|대량|복붙/.test(body)) flags.push('awkward_or_bulk_phrase');
  const score = Math.max(0, Math.min(100, input.personalizationScore - flags.length * 8));
  return {
    score,
    passed: score >= 70 && !flags.includes('no_personalization_signal') && !flags.includes('missing_candidate_name'),
    flags: unique(flags),
  };
}
