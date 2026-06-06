import { inferIntentFromUserText } from './intent';
import { inferConversationReaction, buildReactionLead } from './reaction';
import type { JarvisConversationContext, JarvisRouteResult, JarvisSituationSnapshot } from './types';

const VERTICAL_LABELS: Record<string, string> = {
  camping: '캠핑',
  beauty: '뷰티',
  cooking: '요리',
  food: '식품',
  parenting: '육아',
  travel: '여행',
};

export function routeJarvisCommand(input: {
  text: string;
  context?: JarvisConversationContext;
  snapshot?: JarvisSituationSnapshot;
}): JarvisRouteResult {
  const intent = inferIntentFromUserText(input.text, input.context);
  const reaction = inferConversationReaction(input.text);
  const lead = buildReactionLead(reaction);

  if (intent.intent === 'approval_yes' && !input.context?.pendingActionType) {
    return {
      handled: true,
      intent: intent.intent,
      responseMode: 'blocked',
      blockedReason: 'NO_PENDING_ACTION',
      screenText: [
        lead,
        '대표님, 지금은 승인 대기 중인 작업이 없습니다.',
        '실제 실행 작업은 먼저 미리보기와 ActionCard가 만들어진 뒤, 그 작업 하나만 승인할 수 있습니다.',
        '먼저 실행할 작업을 선택해 주세요. 예: "발주서 정리해줘", "캠핑 인플루언서 20명 수집".',
      ].filter(Boolean).join('\n\n'),
      voiceSummary: '승인할 작업이 아직 없습니다. 먼저 실행할 작업을 선택해 주세요.',
    };
  }

  if (intent.intent === 'outreach_goal_continue_command') {
    const remaining = Number(input.context?.lastOutreachRemainingContactableCount || input.snapshot?.outreach.remainingContactableCount || 0);
    const verticalCode = input.context?.lastOutreachVertical || input.snapshot?.outreach.activeCampaign || '';
    const label = VERTICAL_LABELS[verticalCode] || verticalCode || '캠핑';
    const target = remaining > 0
      ? remaining
      : Number(input.context?.lastOutreachTargetContactableCount || input.snapshot?.outreach.targetContactableCount || 20) || 20;

    if (!verticalCode && !input.snapshot?.outreach.activeCampaign) {
      return {
        handled: true,
        intent: intent.intent,
        responseMode: 'blocked',
        blockedReason: 'NO_OUTREACH_CONTEXT',
        screenText: [
          '대표님, 이어서 진행할 Outreach 수집 맥락이 아직 없습니다.',
          '먼저 분야와 목표 인원을 지정해 주세요. 예: "캠핑 인플루언서 20명 수집".',
        ].join('\n\n'),
        voiceSummary: '이어서 수집할 기준이 없습니다. 먼저 분야와 목표 인원을 알려 주세요.',
      };
    }

    return {
      handled: true,
      intent: intent.intent,
      responseMode: 'execute',
      command: `${label} 인플루언서 ${target}명 이어서 수집`,
      screenText: [
        `대표님, 직전 Outreach 기준으로 ${label} 후보를 이어서 수집하겠습니다.`,
        '목표에 도달하기 전에는 완료라고 말하지 않고, 부족 인원과 중단 사유를 그대로 보고하겠습니다.',
      ].join('\n\n'),
      voiceSummary: `${label} 인플루언서 수집을 이어서 진행하겠습니다. 목표 미달이면 완료 처리하지 않겠습니다.`,
    };
  }

  return {
    handled: false,
    intent: intent.intent,
    responseMode: intent.responseMode,
  };
}
