import type { JarvisNextAction, JarvisSituationSnapshot } from './types';

function makeId(prefix: string, index: number): string {
  return `${prefix}_${index}`;
}

export function planJarvisNextActions(snapshot: JarvisSituationSnapshot): JarvisNextAction[] {
  const actions: JarvisNextAction[] = [];
  const groups = snapshot.purchaseOrders.groups || [];

  if ((snapshot.smartstore.confirmNeededCount || 0) > 0) {
    actions.push({
      id: makeId('smartstore_confirm', actions.length),
      label: '발주확인 승인 준비',
      command: '발주확인 해줘',
      priority: 'high',
      reason: `발주확인 필요 ${snapshot.smartstore.confirmNeededCount}건이 있습니다.`,
      actionType: 'SMARTSTORE_CONFIRM',
      approvalRequired: true,
      blockedReason: '실제 네이버 상태 변경은 검증된 승인 경로에서만 가능합니다.',
    });
  }

  if ((snapshot.purchaseOrders.groupCount || 0) > 0) {
    actions.push({
      id: makeId('purchase_order_preview', actions.length),
      label: '발주서 정리 보기',
      command: '발주서 정리해줘',
      priority: 'high',
      reason: `${snapshot.purchaseOrders.groupCount}개 상품군 발주서 그룹이 준비되어 있습니다.`,
      actionType: 'NONE',
      approvalRequired: false,
    });
  }

  groups.filter(group => group.canSend).slice(0, 3).forEach(group => {
    actions.push({
      id: makeId('email_draft', actions.length),
      label: `${group.productGroupName} 이메일 초안 보기`,
      command: `${group.productGroupName} 발주서 이메일 초안 보여줘`,
      priority: 'high',
      reason: `${group.productGroupName} 발주처 이메일이 저장되어 초안 확인이 가능합니다.`,
      actionType: 'VIEW_DRAFT',
      approvalRequired: false,
    });
  });

  groups.filter(group => !group.emailConfigured).slice(0, 2).forEach(group => {
    actions.push({
      id: makeId('supplier_email', actions.length),
      label: `${group.productGroupName} 이메일 저장`,
      command: `${group.productGroupName} 발주처 이메일 저장할게`,
      priority: 'medium',
      reason: '발주처 이메일이 있어야 Gmail 초안과 승인 발송 흐름을 열 수 있습니다.',
      actionType: 'SAVE_SUPPLIER_EMAIL',
      approvalRequired: true,
    });
  });

  groups.filter(group => group.carrier === 'unknown').slice(0, 2).forEach(group => {
    actions.push({
      id: makeId('carrier_rule', actions.length),
      label: `${group.productGroupName} 택배사 규칙 저장`,
      command: `${group.productGroupName}는 로젠택배로 저장해`,
      priority: 'medium',
      reason: '택배사 규칙이 없으면 발주서 export/email 대상에서 제외됩니다.',
      actionType: 'SAVE_SUPPLIER_EMAIL',
      approvalRequired: true,
    });
  });

  if ((snapshot.outreach.remainingContactableCount || 0) > 0) {
    actions.push({
      id: makeId('outreach_continue', actions.length),
      label: '인플루언서 이어서 수집',
      command: `${snapshot.outreach.activeCampaign || '캠핑'} 인플루언서 ${snapshot.outreach.remainingContactableCount}명 이어서 수집`,
      priority: 'medium',
      reason: `목표까지 ${snapshot.outreach.remainingContactableCount}명이 더 필요합니다.`,
      actionType: 'OUTREACH_COLLECT',
      approvalRequired: false,
    });
  }

  if (snapshot.telegram.dailyBriefActive) {
    actions.push({
      id: makeId('telegram_dryrun', actions.length),
      label: 'Telegram 승인 dryRun 확인',
      command: 'Telegram 승인 요청 dryRun 테스트',
      priority: 'low',
      reason: '실제 Telegram 전송 전 actionId 승인 흐름만 안전하게 점검합니다.',
      actionType: 'TELEGRAM_APPROVAL',
      approvalRequired: true,
      blockedReason: '실제 Telegram 메시지는 대표님 최종 승인 전에는 보내지 않습니다.',
    });
  }

  return actions.slice(0, 6);
}
