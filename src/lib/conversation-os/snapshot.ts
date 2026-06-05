import type { JarvisSituationSnapshot } from './types';

function toNumber(value: unknown, fallback = 0): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function safeString(value: unknown): string | undefined {
  const text = String(value || '').trim();
  return text || undefined;
}

export function buildJarvisSituationSnapshot(input: {
  smartstoreResult?: any;
  purchaseOrderPreview?: any;
  outreachSummary?: any;
  pendingAction?: { actionType?: string } | null;
  telegramResult?: any;
}): JarvisSituationSnapshot {
  const smartFull = input.smartstoreResult?.fullOrderSummary || input.smartstoreResult?.smartstore?.fullOrderSummary || {};
  const actionBuckets = smartFull.actionBuckets || {};
  const purchaseSummary = input.purchaseOrderPreview?.summary || {};
  const purchaseGroups = Array.isArray(input.purchaseOrderPreview?.groups) ? input.purchaseOrderPreview.groups : [];
  const outreach = input.outreachSummary || {};
  const risks: string[] = [];
  const opportunities: string[] = [];

  const groups = purchaseGroups.map((group: any) => ({
    groupId: safeString(group.groupId),
    productGroupName: safeString(group.productGroupName) || '미분류',
    supplierName: safeString(group.supplierName),
    carrier: safeString(group.carrierName || group.carrier),
    rowCount: toNumber(group.rowCount),
    totalQuantity: toNumber(group.totalQuantity),
    emailConfigured: Boolean(group.emailConfigured),
    recipientMasked: safeString(group.emailMasked || group.recipientMasked),
    canSend: Boolean(group.canEmail || group.canSend),
    warnings: Array.isArray(group.warnings) ? group.warnings.map(String).slice(0, 5) : [],
  }));

  const emailMissingGroupCount = toNumber(purchaseSummary.emailMissingGroupCount, groups.filter(group => !group.emailConfigured).length);
  const carrierMissingGroupCount = toNumber(purchaseSummary.carrierMissingGroupCount, groups.filter(group => group.carrier === 'unknown').length);
  const readyEmailGroupCount = toNumber(purchaseSummary.readyGroupCount, groups.filter(group => group.canSend).length);

  if (emailMissingGroupCount > 0) risks.push(`발주처 이메일 미설정 ${emailMissingGroupCount}곳`);
  if (carrierMissingGroupCount > 0) risks.push(`택배사 규칙 미지정 ${carrierMissingGroupCount}건`);
  if (readyEmailGroupCount > 0) opportunities.push(`발주서 이메일 초안 가능 ${readyEmailGroupCount}곳`);
  if (toNumber(actionBuckets.confirmNeededCount) > 0) opportunities.push(`발주확인 필요 ${toNumber(actionBuckets.confirmNeededCount)}건`);
  if (toNumber(outreach.remainingContactableCount) > 0) risks.push(`인플루언서 목표 미달 ${toNumber(outreach.remainingContactableCount)}명`);

  return {
    smartstore: {
      productOrderCount: toNumber(smartFull.productOrderCount ?? input.smartstoreResult?.counts?.productOrderCount),
      totalOrderQuantity: toNumber(smartFull.totalOrderQuantity ?? input.smartstoreResult?.counts?.totalOrderQuantity),
      confirmNeededCount: toNumber(actionBuckets.confirmNeededCount ?? input.smartstoreResult?.counts?.confirmNeeded),
      pendingShippingCount: toNumber(actionBuckets.pendingShippingCount ?? input.smartstoreResult?.counts?.pendingShipping),
      dataReliable: input.smartstoreResult?.dataReliable !== false && smartFull.dataReliable !== false,
      source: safeString(input.smartstoreResult?.source || smartFull.source),
    },
    purchaseOrders: {
      groupCount: toNumber(purchaseSummary.groupCount, groups.length),
      readyEmailGroupCount,
      emailMissingGroupCount,
      carrierMissingGroupCount,
      privateExportReady: groups.length > 0,
      draftsReady: readyEmailGroupCount > 0,
      groups,
    },
    outreach: {
      activeCampaign: safeString(outreach.requestedVertical || outreach.activeCampaign),
      targetContactableCount: toNumber(outreach.targetContactableCount),
      qualifiedContactableCount: toNumber(outreach.qualifiedContactableCount),
      remainingContactableCount: toNumber(outreach.remainingContactableCount),
      completionStatus: safeString(outreach.completionStatus),
      topCandidatesReady: toNumber(outreach.qualityTierCounts?.A),
      qualityQualifiedCount: toNumber(outreach.qualityQualifiedCount),
      draftReady: Boolean(outreach.draftReady),
      followupNeededCount: toNumber(outreach.followupNeededCount),
    },
    approvals: {
      pendingCount: input.pendingAction ? 1 : 0,
      pendingTypes: input.pendingAction?.actionType ? [input.pendingAction.actionType] : [],
    },
    telegram: {
      dailyBriefActive: true,
      approvalRequestsReady: Boolean(input.telegramResult?.actionRequests || input.telegramResult?.actionRequestCount),
      lastSendStatus: safeString(input.telegramResult?.telegram?.status || input.telegramResult?.telegramStatus),
    },
    risks,
    opportunities,
  };
}
