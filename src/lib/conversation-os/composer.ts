import type { JarvisComposedResponse, JarvisNextAction, JarvisSituationSnapshot } from './types';

const BANNED_USER_VISIBLE_PHRASES = [
  '목표 인원에 도달하기 전에는 완료로 처리하지 않습니다',
  '부족한 인원과 중단 사유를 보고합니다',
  'Gmail은 발송 승인 후에만 진행합니다',
  '지금은 초안과 dryRun으로 먼저 확인합니다',
  'EXECUTE LOCKED',
  '승인 후에만 가능합니다',
  '정책상 차단합니다',
];

export function sanitizeJarvisReply(text: string): string {
  let output = String(text || '');
  for (const phrase of BANNED_USER_VISIBLE_PHRASES) {
    output = output.split(phrase).join('');
  }
  return output
    .replace(/\s+—\s+/g, ' - ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function priorityLabel(action: JarvisNextAction): string {
  return action.approvalRequired ? `${action.label} (승인 필요)` : action.label;
}

export function composeJarvisBriefing(snapshot: JarvisSituationSnapshot, nextActions: JarvisNextAction[]): JarvisComposedResponse {
  const readyGroups = snapshot.purchaseOrders.groups.filter(group => group.canSend);
  const emailMissing = snapshot.purchaseOrders.emailMissingGroupCount || 0;
  const carrierMissing = snapshot.purchaseOrders.carrierMissingGroupCount || 0;
  const topPriority = nextActions.slice(0, 5);
  const firstDraft = readyGroups[0]?.productGroupName;
  const mainFocus = readyGroups.length > 0
    ? '발주서 이메일 초안 확인과 dryRun 테스트'
    : carrierMissing > 0 || emailMissing > 0
      ? '발주처 이메일과 택배사 규칙 보강'
      : (snapshot.smartstore.confirmNeededCount || 0) > 0
        ? '주문 현황 확인과 발주확인 준비'
        : '주문, 발주서, 수집 현황 점검';

  const outreachLine = (snapshot.outreach.remainingContactableCount || 0) > 0
    ? `Outreach는 목표까지 ${snapshot.outreach.remainingContactableCount}명이 더 필요합니다. 이어서 수집하면 최근 후보를 기준으로 더 좁혀볼 수 있습니다.`
    : 'Outreach는 현재 저장된 요약 기준으로 급한 미달 신호가 없습니다.';

  const screenText = sanitizeJarvisReply([
    `대표님, 지금 우선순위는 **${mainFocus}**입니다.`,
    '',
    `현재 전체 상품주문은 ${snapshot.smartstore.productOrderCount || 0}건, 전체 주문수량은 ${snapshot.smartstore.totalOrderQuantity || 0}개입니다.`,
    `발주서 그룹은 ${snapshot.purchaseOrders.groupCount || 0}개이고, 이메일 초안까지 가능한 그룹은 ${snapshot.purchaseOrders.readyEmailGroupCount || 0}곳입니다.`,
    emailMissing > 0 ? `발주처 이메일 저장이 필요한 그룹은 ${emailMissing}곳입니다.` : '발주처 이메일 미설정 그룹은 현재 요약 기준으로 없습니다.',
    carrierMissing > 0 ? `택배사 규칙을 정해야 하는 그룹은 ${carrierMissing}건입니다.` : '택배사 규칙 미지정 그룹은 현재 요약 기준으로 없습니다.',
    outreachLine,
    snapshot.risks.length ? `\n주의할 점: ${snapshot.risks.join(', ')}` : '',
    '',
    '추천 순서:',
    ...(topPriority.length
      ? topPriority.map((action, index) => `${index + 1}. ${priorityLabel(action)} - ${action.reason}`)
      : ['1. 발주서 정리해줘 - 현재 발주 그룹을 먼저 확인합니다.']),
    '',
    firstDraft
      ? `바로 ${firstDraft} 이메일 초안부터 열어드릴까요?`
      : '먼저 발주서 정리 화면부터 열어볼까요?',
  ].filter(Boolean).join('\n'));

  const voiceSummary = readyGroups.length > 0
    ? `대표님, 오늘은 발주서 이메일 정리가 우선입니다. ${readyGroups[0].productGroupName} 이메일 초안부터 확인할 수 있습니다.`
    : '대표님, 오늘은 발주서 설정 보강이 우선입니다. 이메일과 택배사 규칙이 필요한 그룹부터 정리하겠습니다.';

  return { screenText, voiceSummary, nextActions };
}

export function composeJarvisCommandResult(input: {
  title: string;
  detail: string;
  voiceSummary: string;
  nextActions: JarvisNextAction[];
}): JarvisComposedResponse {
  const actionLines = input.nextActions.slice(0, 4).map((action, index) => `${index + 1}. ${priorityLabel(action)} - ${action.command}`);
  return {
    screenText: sanitizeJarvisReply([`**${input.title}**`, '', input.detail, actionLines.length ? `\n다음 행동:\n${actionLines.join('\n')}` : ''].join('\n')),
    voiceSummary: sanitizeJarvisReply(input.voiceSummary),
    nextActions: input.nextActions,
  };
}
