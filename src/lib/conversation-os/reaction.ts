import type { JarvisConversationReaction, JarvisDialogueAct, JarvisEmotionalSignal, JarvisConversationTone } from './types';
import { normalizeKoreanText } from './intent';

export function inferConversationReaction(text: string): JarvisConversationReaction {
  const normalized = normalizeKoreanText(text);

  const isFrustrated = /(안\s*돼|왜\s*이래|자꾸|답답|짜증|말만|반복|이상|제대로|싹\s*다|고쳐|오류|문제)/i.test(normalized);
  const isUrgent = /(빨리|지금|당장|급해|바로|먼저|즉시)/i.test(normalized);
  const isQuestion = /(\?|왜|뭐|어떻게|가능해|맞아|아니야|필요하지|설명|알려줘)/i.test(normalized);
  const isContinuation = /(더|계속|이어|추가|부족한 만큼|목표까지|채워)/i.test(normalized);
  const isApproval = /^(응|그래|진행해|승인|해줘|보내|전송해|좋아|확인|ok|yes)$/i.test(normalized);
  const isCancel = /^(취소|아니|보류|하지마|멈춰|나중에|no|cancel)$/i.test(normalized);
  const isTesting = /(테스트|미리보기|dry\s*run|드라이런|확인만|가능한지)/i.test(normalized);

  const dialogueAct: JarvisDialogueAct =
    isApproval ? 'approval' :
    isCancel ? 'cancellation' :
    isContinuation ? 'continuation' :
    isQuestion ? 'question' :
    isFrustrated ? 'complaint' :
    normalized ? 'command' : 'unknown';

  const emotionalSignal: JarvisEmotionalSignal =
    isFrustrated ? 'frustrated' :
    isUrgent ? 'urgent' :
    isTesting ? 'testing' :
    'neutral';

  const tone: JarvisConversationTone =
    isFrustrated ? 'diagnostic' :
    isUrgent ? 'urgent' :
    isQuestion ? 'confident' :
    isApproval || isCancel ? 'brief' :
    'operator';

  return {
    dialogueAct,
    emotionalSignal,
    tone,
    shouldAcknowledgeEmotion: isFrustrated,
    shouldExplainReason: isQuestion || isFrustrated,
    shouldOfferNextAction: true,
    shouldBeConcise: normalized.length < 14,
  };
}

export function buildReactionLead(reaction: JarvisConversationReaction): string {
  if (reaction.emotionalSignal === 'frustrated') {
    return '대표님, 맞습니다. 지금은 기능 자체보다 연결 흐름과 보고 방식이 먼저 정리돼야 합니다.';
  }
  if (reaction.emotionalSignal === 'urgent') {
    return '대표님, 바로 핵심부터 보겠습니다.';
  }
  if (reaction.dialogueAct === 'question') {
    return '대표님, 제 판단으로는 이렇게 보는 게 맞습니다.';
  }
  return '';
}
