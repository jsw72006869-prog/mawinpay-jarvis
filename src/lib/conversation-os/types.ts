export type ConversationOsActionType =
  | 'VIEW_DRAFT'
  | 'SAVE_SUPPLIER_EMAIL'
  | 'PRIVATE_EXPORT'
  | 'GMAIL_DRYRUN'
  | 'GMAIL_SEND_APPROVAL'
  | 'BULK_GMAIL_SEND_APPROVAL'
  | 'OUTREACH_COLLECT'
  | 'OUTREACH_DRAFT'
  | 'TELEGRAM_APPROVAL'
  | 'SMARTSTORE_CONFIRM'
  | 'NONE';

export type JarvisNextAction = {
  id: string;
  label: string;
  command: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  actionType: ConversationOsActionType;
  approvalRequired: boolean;
  blockedReason?: string;
};

export type JarvisSituationSnapshot = {
  smartstore: {
    productOrderCount?: number;
    totalOrderQuantity?: number;
    confirmNeededCount?: number;
    pendingShippingCount?: number;
    dataReliable?: boolean;
    source?: string;
  };
  purchaseOrders: {
    groupCount?: number;
    readyEmailGroupCount?: number;
    emailMissingGroupCount?: number;
    carrierMissingGroupCount?: number;
    privateExportReady?: boolean;
    draftsReady?: boolean;
    groups: Array<{
      groupId?: string;
      productGroupName: string;
      supplierName?: string;
      carrier?: string;
      rowCount?: number;
      totalQuantity?: number;
      emailConfigured?: boolean;
      recipientMasked?: string;
      canSend?: boolean;
      warnings?: string[];
    }>;
  };
  outreach: {
    activeCampaign?: string;
    targetContactableCount?: number;
    qualifiedContactableCount?: number;
    remainingContactableCount?: number;
    completionStatus?: string;
    topCandidatesReady?: number;
    qualityQualifiedCount?: number;
    draftReady?: boolean;
    followupNeededCount?: number;
  };
  approvals: {
    pendingCount?: number;
    pendingTypes?: string[];
  };
  telegram: {
    dailyBriefActive?: boolean;
    approvalRequestsReady?: boolean;
    lastSendStatus?: string;
  };
  risks: string[];
  opportunities: string[];
};

export type JarvisComposedResponse = {
  screenText: string;
  voiceSummary: string;
  nextActions: JarvisNextAction[];
};
