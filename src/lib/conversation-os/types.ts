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

export type JarvisUserIntent =
  | 'briefing_question'
  | 'priority_question'
  | 'purchase_order_question'
  | 'privacy_export_question'
  | 'masked_file_question'
  | 'supplier_email_question'
  | 'gmail_send_question'
  | 'telegram_approval_question'
  | 'outreach_goal_question'
  | 'followup_question'
  | 'command_help_question'
  | 'purchase_order_summary_command'
  | 'purchase_order_preview_command'
  | 'masked_export_command'
  | 'private_export_command'
  | 'supplier_profile_save_command'
  | 'purchase_order_email_draft_command'
  | 'purchase_order_email_send_command'
  | 'outreach_goal_collect_command'
  | 'outreach_goal_continue_command'
  | 'review_candidates_command'
  | 'generate_email_preview_command'
  | 'show_mission_display_command'
  | 'approval_yes'
  | 'approval_no'
  | 'unknown_ops_question'
  | 'unknown';

export type JarvisResponseMode =
  | 'answer'
  | 'preview'
  | 'approval_required'
  | 'execute'
  | 'blocked'
  | 'help';

export type JarvisConversationTone =
  | 'calm'
  | 'urgent'
  | 'confident'
  | 'diagnostic'
  | 'brief'
  | 'encouraging'
  | 'operator'
  | 'blocked';

export type JarvisDialogueAct =
  | 'command'
  | 'question'
  | 'complaint'
  | 'confirmation'
  | 'correction'
  | 'continuation'
  | 'approval'
  | 'cancellation'
  | 'status_check'
  | 'unknown';

export type JarvisEmotionalSignal =
  | 'neutral'
  | 'frustrated'
  | 'urgent'
  | 'confused'
  | 'satisfied'
  | 'testing'
  | 'demanding';

export type JarvisConversationReaction = {
  dialogueAct: JarvisDialogueAct;
  emotionalSignal: JarvisEmotionalSignal;
  tone: JarvisConversationTone;
  shouldAcknowledgeEmotion: boolean;
  shouldExplainReason: boolean;
  shouldOfferNextAction: boolean;
  shouldBeConcise: boolean;
};

export type JarvisConversationContext = {
  pendingActionType?: string;
  lastOutreachVertical?: string;
  lastOutreachTargetContactableCount?: number;
  lastOutreachQualifiedContactableCount?: number;
  lastOutreachRemainingContactableCount?: number;
  lastOutreachCompletionStatus?: string;
};

export type JarvisIntentResult = {
  intent: JarvisUserIntent;
  responseMode: JarvisResponseMode;
  confidence: number;
  reason: string;
};

export type JarvisRouteResult = {
  handled: boolean;
  intent: JarvisUserIntent;
  responseMode: JarvisResponseMode;
  command?: string;
  screenText?: string;
  voiceSummary?: string;
  nextActions?: JarvisNextAction[];
  blockedReason?: string;
};

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
