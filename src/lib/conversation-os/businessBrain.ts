import { readJarvisBusinessMemory } from './businessMemory';
import type { JarvisBusinessBrainContext } from './types';

function inferDomain(text: string): JarvisBusinessBrainContext['businessContext']['activeDomain'] {
  const raw = String(text || '').toLowerCase();
  if (/gmail|메일|이메일|초안|발송/.test(raw)) return 'purchase_orders';
  if (/발주서|택배|엑셀|xlsx|다운로드/.test(raw)) return 'purchase_orders';
  if (/주문|스마트스토어|발주확인/.test(raw)) return 'orders';
  if (/인플루언서|유튜브|youtube|채널|영상|후보/.test(raw)) return 'outreach';
  if (/카피|광고|소재|마케팅|바이럴/.test(raw)) return 'marketing';
  return 'general';
}

export function buildJarvisBusinessBrainContext(input: {
  userText: string;
  intent?: string;
  approvalRequired?: boolean;
  previewOnly?: boolean;
  currentGoal?: string;
  nextDecision?: string;
}): JarvisBusinessBrainContext {
  const approvalRequired = input.approvalRequired === true;
  return {
    userText: input.userText,
    intent: input.intent,
    businessContext: {
      activeDomain: inferDomain(input.userText),
      currentGoal: input.currentGoal,
      nextDecision: input.nextDecision,
    },
    recentMemory: readJarvisBusinessMemory().slice(0, 8),
    executionMode: approvalRequired ? 'approval_required' : input.previewOnly === false ? 'read_only' : 'preview',
    safetyState: {
      approvalRequired,
      noExternalExecution: input.previewOnly !== false,
      piiMasked: true,
    },
    responseStyle: {
      screen: 'detailed',
      voice: 'short_summary',
    },
  };
}
