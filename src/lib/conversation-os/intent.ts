import type { JarvisConversationContext, JarvisIntentResult, JarvisUserIntent } from './types';

export function normalizeKoreanText(text: string): string {
  return String(text || '').trim().replace(/\s+/g, ' ');
}

function result(
  intent: JarvisUserIntent,
  confidence: number,
  reason: string,
  responseMode?: JarvisIntentResult['responseMode'],
): JarvisIntentResult {
  return {
    intent,
    confidence,
    reason,
    responseMode: responseMode || (intent.endsWith('_command') ? 'execute' : 'answer'),
  };
}

function hasQuestionSignal(text: string): boolean {
  return /(\?|뭐야|무엇|어떻게|가능해|맞아|아니야|필요하지|알려줘|설명해줘|언제 완료|차이가|어디서|어떤|왜|실패)/i.test(text);
}

function isInfluencerText(text: string): boolean {
  return /(인플루언서|유튜버|블로거|크리에이터|채널|후보)/i.test(text);
}

function isCollectText(text: string): boolean {
  return /(수집|찾아|찾아줘|모아|모아줘|추천|미리보기|테스트|dry\s*run|드라이런|이어|계속|채워|가능한지|몇\s*명|카운트|count)/i.test(text);
}

function isCountOnlyText(text: string): boolean {
  return /(가능한지|몇\s*명|후보\s*수|숫자만|수량만|카운트|count|규모만|확인만)/i.test(text);
}

export function inferIntentFromUserText(text: string, context: JarvisConversationContext = {}): JarvisIntentResult {
  const raw = normalizeKoreanText(text);
  if (!raw) return result('unknown', 0.1, 'empty input');

  if (/^(응|그래|진행해|승인|해줘|보내|전송해|좋아|확인|ok|yes)$/i.test(raw)) {
    return result(
      'approval_yes',
      0.98,
      context.pendingActionType ? 'pending action approval' : 'approval word without pending action',
      'approval_required',
    );
  }

  if (/^(취소|아니|보류|하지마|멈춰|나중에|no|cancel)$/i.test(raw)) {
    return result('approval_no', 0.98, 'approval cancellation phrase', 'approval_required');
  }

  if (/^(계속\s*수집(?:해|해줘)?|이어\s*수집(?:해|해줘)?|이어서\s*수집(?:해|해줘)?|추가\s*수집(?:해|해줘)?|더\s*찾아줘|부족한\s*만큼|continue\s*(collect|outreach)?)$/i.test(raw)) {
    return result('outreach_goal_continue_command', 0.98, 'short outreach continuation command', 'execute');
  }

  if (/(2번\s*모니터|두\s*번째\s*모니터|미션\s*디스플레이|화면|후보\s*화면|메일\s*미리보기\s*크게|승인\s*카드\s*보여|보안\s*상태\s*보여)/i.test(raw)) {
    return result('show_mission_display_command', 0.9, 'mission display command', 'execute');
  }

  if (isInfluencerText(raw) && isCollectText(raw)) {
    return result(
      /(이어|계속|추가|채워)/i.test(raw) ? 'outreach_goal_continue_command' : 'outreach_goal_collect_command',
      0.94,
      isCountOnlyText(raw) ? 'outreach count-only command' : 'outreach preview collection command',
      'execute',
    );
  }

  if (/(후보\s*보여줘|후보\s*리스트|수집된\s*후보|상위\s*후보|최근\s*후보)/i.test(raw)) {
    return result('review_candidates_command', 0.9, 'review latest outreach candidates', 'preview');
  }

  if (/(상위\s*\d*\s*명?\s*메일\s*미리보기|후보.*메일\s*초안|개인화\s*메일|제안\s*메일\s*미리보기)/i.test(raw)) {
    return result('generate_email_preview_command', 0.9, 'candidate email preview command', 'preview');
  }

  if (/(오늘\s*(업무\s*)?브리핑|지금\s*뭐부터|자비스\s*오늘\s*상황|우선순위|다음\s*행동)/i.test(raw)) {
    return result(/뭐부터|우선순위|다음\s*행동/i.test(raw) ? 'priority_question' : 'briefing_question', 0.92, 'conversation OS briefing request', 'preview');
  }

  if (/(전체\s*주문\s*현황|전체주문현황|주문\s*현황.*전체|오늘\s*주문\s*현황)/i.test(raw)) {
    return result('purchase_order_summary_command', 0.95, 'smartstore full order summary command', 'execute');
  }

  if (/발주서/i.test(raw) && /(정리|작성|만들|생성|초안)/i.test(raw) && !/(이메일|메일|gmail)/i.test(raw)) {
    return result('purchase_order_preview_command', 0.9, 'purchase order preview command', 'preview');
  }

  if (/(개인정보\s*포함|원본|실제\s*배송용|이름.*주소.*연락처|마스킹\s*말고)/i.test(raw) && /(발주서|파일)/i.test(raw) && /(다운로드|만들|생성)/i.test(raw)) {
    return result('private_export_command', 0.95, 'private purchase order export command', 'approval_required');
  }

  if (/마스킹/i.test(raw) && /(발주서|파일)/i.test(raw) && /다운로드/i.test(raw)) {
    return result('masked_export_command', 0.88, 'masked purchase order export command', 'execute');
  }

  if (/발주서/i.test(raw) && /(이메일|메일|gmail)/i.test(raw) && /(초안|미리보기|양식|보여줘|preview)/i.test(raw)) {
    return result('purchase_order_email_draft_command', 0.93, 'purchase order email draft preview command', 'preview');
  }

  if (/(발주서\s*이메일|발주서\s*메일|gmail)/i.test(raw) && /(보내|전송|발송)/i.test(raw)) {
    return result('purchase_order_email_send_command', 0.9, 'purchase order email send command', 'approval_required');
  }

  if (hasQuestionSignal(raw)) {
    if (/발주서|배송|발주처/i.test(raw) && /(이름|주소|연락처|개인정보|마스킹)/i.test(raw)) {
      return result('privacy_export_question', 0.9, 'privacy/export question');
    }
    if (/마스킹/i.test(raw)) return result('masked_file_question', 0.85, 'masked file question');
    if (/발주처\s*이메일|이메일\s*저장/i.test(raw)) return result('supplier_email_question', 0.85, 'supplier email question');
    if (/(gmail|이메일|메일)/i.test(raw) && /(어디서|가능|보내면|발송)/i.test(raw)) return result('gmail_send_question', 0.85, 'gmail send question');
    if (/(텔레그램|telegram)/i.test(raw)) return result('telegram_approval_question', 0.85, 'telegram approval question');
    if (isInfluencerText(raw) || /(캠핑|뷰티|요리|식품|육아|여행)/i.test(raw)) return result('outreach_goal_question', 0.85, 'outreach goal question');
    if (/(테스트\s*명령|명령어\s*알려|뭘\s*해볼|어떤\s*명령)/i.test(raw)) return result('command_help_question', 0.85, 'command help question', 'help');
    return result('unknown_ops_question', 0.55, 'generic operational question');
  }

  return result('unknown', 0.2, 'no deterministic intent match');
}
