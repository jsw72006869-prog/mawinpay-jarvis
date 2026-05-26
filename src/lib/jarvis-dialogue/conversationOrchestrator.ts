/**
 * JARVIS-CONVERSATION-OS-A.1
 * Conversation Orchestrator — GPT context reply 호출 및 fallback 처리
 */

import type {
  JarvisConversationContext,
  JarvisReply,
  JarvisSuggestedAction,
  JarvisDialogueIntent,
} from './conversationTypes';
import { sanitizeContextForGPT } from './contextBuilders';

const CONTEXT_REPLY_SYSTEM_PROMPT = `You are JARVIS, a Korean business operations assistant for mawinpay.
You answer as a calm, capable operating officer — never robotic, never overly formal.
Use ONLY the provided context. Never invent counts, names, emails, or statuses.
Never expose email addresses, tokens, secrets, env values, proxy URLs, or personal data.
If execution is locked, clearly say "실행은 현재 잠금 상태입니다" and suggest safe alternatives.
Suggest 2-4 safe next actions as JSON array in your response.
Keep responses concise (2-4 sentences max for speech).
ALWAYS respond in Korean ONLY. NEVER use English sentences.
호칭: "선생님" (never "토니", "sir", "Mr. Stark")
절대 "시행해 주셔서 감사합니다"를 반복하지 마라.
매 응답마다 다른 자연스러운 표현을 사용하라.

응답 형식 (JSON):
{
  "text": "자비스 응답 텍스트 (한국어)",
  "suggestedActions": [
    { "id": "action_id", "label": "버튼 텍스트", "mode": "observe|draft|locked" }
  ]
}`;

/**
 * Intent별 GPT user prompt 생성
 */
function buildUserPrompt(ctx: JarvisConversationContext): string {
  const parts: string[] = [];

  parts.push(`[현재 화면: ${ctx.screen}]`);
  parts.push(`[의도: ${ctx.intent}]`);

  if (ctx.selectedCandidate) {
    const c = ctx.selectedCandidate;
    parts.push(`[선택된 후보]
- 이름: ${c.name || c.channelTitle}
- 플랫폼: ${c.platform}
- 적합도: ${c.fitScore}점
- 이메일 확인: ${c.emailExists ? '확인됨' : '미확인'}
- 최근 콘텐츠: ${c.recentContentTitle || '없음'}
- 요청 분야: ${c.requestedVertical || '미지정'}
- 분야 판정: ${c.targetMatchStatus || '미분류'} (${c.targetMatchScore ?? 0}점)
- 분야 근거: ${c.targetEvidenceTerms?.join(', ') || '없음'}
- 적합 이유: ${c.reasonForFit || '없음'}
- 제안 각도: ${c.proposalAngle || '없음'}`);
  }

  if (ctx.selectedCopy) {
    const c = ctx.selectedCopy;
    parts.push(`[선택된 카피]
- 제목: ${c.title}
- 본문: ${c.text?.slice(0, 150)}
- 플랫폼: ${c.platform || '미지정'}
- 후킹 유형: ${c.hookType || '미분류'}
- 욕구: ${c.desires?.join(', ') || '없음'}
- 불안 해소: ${c.anxieties?.join(', ') || '없음'}
- 트리거: ${c.triggers?.join(', ') || '없음'}
- 감각: ${c.sensory?.join(', ') || '없음'}
- 점수: ${c.finalScore ?? '미계산'}
- 추천 이유: ${c.whyRecommended || '없음'}
- 다시쓰기 힌트: ${c.rewriteHint || '없음'}
- 추천: ${c.recommended ? '예' : '아니오'}
- 위험 플래그: ${c.riskFlags?.join(', ') || '없음'}`);
  }

  if (ctx.outreachSummary) {
    const s = ctx.outreachSummary;
    parts.push(`[수집 요약]
- 총 수집: ${s.totalCollected}명
- 이메일 확인: ${s.emailConfirmed}명
- 플랫폼: ${Object.entries(s.platforms).map(([k, v]) => `${k} ${v}명`).join(', ')}
- 평균 적합도: ${s.avgFitScore}점
- Sheets 저장: ${s.savedToSheets ? '완료' : '미완료'}`);
  }

  if (ctx.dataWallSummary) {
    const d = ctx.dataWallSummary;
    parts.push(`[Agent Workstation 현황]`);
    if (d.smartstore) parts.push(`- 스마트스토어: 신규주문 ${d.smartstore.newOrders}건, 배송준비 ${d.smartstore.preparing}건`);
    if (d.outreach) parts.push(`- 아웃리치: 총 ${d.outreach.totalCandidates}명, 이메일확인 ${d.outreach.emailConfirmed}명`);
    if (d.hotContent) parts.push(`- Hot Content: YouTube ${d.hotContent.youtube}, Threads ${d.hotContent.threads}, Naver ${d.hotContent.naver}, Instagram ${d.hotContent.instagram}`);
    if (d.copyBrain) parts.push(`- Copy Brain: ${d.copyBrain.status}, 총 ${d.copyBrain.totalCopies}개, 추천 ${d.copyBrain.recommended}개`);
    if (d.telegram) parts.push(`- Telegram: ${d.telegram.status}`);
    if (d.sheets) parts.push(`- Sheets: ${d.sheets.status}`);
  }

  if (ctx.copyBrainSummary) {
    const cb = ctx.copyBrainSummary;
    parts.push(`[Copy Brain 요약]
- 상태: ${cb.status}
- 총 카피: ${cb.totalCopies}개
- 추천: ${cb.recommended}개
- 주요 후킹: ${cb.topHooks.join(', ') || '없음'}
- DNA 소스: ${cb.dnaSource}`);
  }

  if (ctx.smartstoreSummary) {
    const ss = ctx.smartstoreSummary;
    parts.push(`[스마트스토어 요약]
- 신규주문: ${ss.newOrders}건
- 배송준비: ${ss.preparing}건
- 발송완료: ${ss.shipped}건`);
  }

  parts.push(`\n실행 잠금: ${ctx.executeLocked ? 'LOCKED (실제 발송/승인 불가)' : 'UNLOCKED'}`);

  if (ctx.userText) {
    parts.push(`\n사용자 발화: "${ctx.userText}"`);
  }

  parts.push(`\n위 context를 기반으로 자연스럽게 응답하세요. JSON 형식으로 응답하세요.`);

  return parts.join('\n');
}

/**
 * Intent별 template fallback (GPT 실패 시)
 */
function buildContextualFallback(ctx: JarvisConversationContext): JarvisReply {
  const actions: JarvisSuggestedAction[] = [];

  switch (ctx.intent) {
    case 'candidate_selected': {
      const c = ctx.selectedCandidate;
      actions.push(
        { id: 'view_profile', label: '프로필 보기', mode: 'observe' },
        { id: 'draft_proposal', label: '제안서 초안', mode: 'draft' },
        { id: 'check_sheets', label: 'Sheets 확인', mode: 'observe' },
      );
      return {
        text: c
          ? `선생님, ${c.name || c.channelTitle}님은 ${c.platform} 채널이고 분야 판정은 ${c.targetMatchStatus || '미분류'}(${c.targetMatchScore ?? c.fitScore}점)입니다. 근거는 ${c.targetEvidenceTerms?.join(', ') || c.reasonForFit || '추가 확인 필요'}이고, ${c.emailExists ? '공개 이메일이 확인되었습니다.' : '이메일은 아직 미확인입니다.'} 실제 발송은 잠금 상태입니다.`
          : '선생님, 후보 정보를 확인하고 있습니다.',
        shouldSpeak: true,
        shouldShowInChat: true,
        suggestedActions: actions,
      };
    }

    case 'outreach_collection_completed': {
      const s = ctx.outreachSummary;
      actions.push(
        { id: 'view_candidates', label: '후보 크게 보기', mode: 'observe' },
        { id: 'draft_proposal', label: '제안서 초안 만들기', mode: 'draft' },
        { id: 'check_sheets', label: 'Google Sheets 확인', mode: 'observe' },
        { id: 'send_email', label: '이메일 발송', mode: 'locked', disabled: true },
      );
      return {
        text: s
          ? `선생님, 공동구매 후보 ${s.totalCollected}명 수집 완료했습니다. 이 중 공개 이메일 확인 후보는 ${s.emailConfirmed}명이고, Google Sheets에 저장했습니다. 실제 발송은 아직 잠금 상태입니다.`
          : '선생님, 후보 수집이 완료되었습니다.',
        shouldSpeak: true,
        shouldShowInChat: true,
        suggestedActions: actions,
      };
    }

    case 'copy_card_selected': {
      const c = ctx.selectedCopy;
      actions.push(
        { id: 'more_aggressive', label: '더 자극적으로', mode: 'draft' },
        { id: 'more_conversational', label: '더 말하듯이', mode: 'draft' },
        { id: 'more_field_scene', label: '더 현장감 있게', mode: 'draft' },
        { id: 'shorten_thumbnail', label: '썸네일용으로 줄이기', mode: 'draft' },
        { id: 'reels_first_3s', label: '릴스 첫 3초로 변환', mode: 'draft' },
        { id: 'expand_threads', label: '스레드 글로 확장', mode: 'draft' },
        { id: 'email_subject', label: '이메일 제목으로 변환', mode: 'draft' },
      );
      return {
        text: c
          ? `선생님, 이 카피는 ${(c.desires || []).slice(0, 2).join(', ') || '구매 욕구'}를 건드리고 ${(c.anxieties || []).slice(0, 2).join(', ') || '구매 불안'}을 줄이는 구조입니다. ${c.platform ? `${c.platform} 문법에 맞춰 평가했고, ` : ''}${c.recommended ? '추천 후보로 분류되었습니다.' : '조금 더 다듬으면 좋겠습니다.'} ${c.whyRecommended || ''}`
          : '선생님, 카피 정보를 확인하고 있습니다.',
        shouldSpeak: true,
        shouldShowInChat: true,
        suggestedActions: actions,
      };
    }

    case 'copy_generation_completed': {
      const cb = ctx.copyBrainSummary;
      actions.push(
        { id: 'view_copies', label: '카피 크게 보기', mode: 'observe' },
        { id: 'regenerate', label: '다시 생성', mode: 'draft' },
        { id: 'save_all', label: '전체 저장', mode: 'observe' },
      );
      return {
        text: cb
          ? `선생님, ${cb.dnaSource} 카피 ${cb.totalCopies}개 생성 완료했습니다. ${cb.recommended}개가 추천 후보입니다.`
          : '선생님, 카피 생성이 완료되었습니다.',
        shouldSpeak: true,
        shouldShowInChat: true,
        suggestedActions: actions,
      };
    }

    case 'datawall_briefing_requested': {
      const d = ctx.dataWallSummary;
      actions.push(
        { id: 'view_smartstore', label: '스마트스토어 상세', mode: 'observe' },
        { id: 'view_outreach', label: '아웃리치 상세', mode: 'observe' },
        { id: 'view_copy_brain', label: 'Copy Brain 상세', mode: 'observe' },
      );
      if (!d) {
        return {
          text: '선생님, Agent Workstation 데이터를 불러오는 중입니다.',
          shouldSpeak: true,
          shouldShowInChat: true,
          suggestedActions: actions,
        };
      }
      const parts: string[] = ['선생님, 현재 Agent Workstation 현황입니다.'];
      if (d.smartstore) parts.push(`스마트스토어: 신규주문 ${d.smartstore.newOrders}건, 배송준비 ${d.smartstore.preparing}건.`);
      if (d.outreach) parts.push(`아웃리치: 총 ${d.outreach.totalCandidates}명, 이메일확인 ${d.outreach.emailConfirmed}명.`);
      if (d.hotContent) parts.push(`Hot Content: YouTube ${d.hotContent.youtube}, Threads ${d.hotContent.threads}.`);
      if (d.copyBrain) parts.push(`Copy Brain: ${d.copyBrain.totalCopies}개 중 ${d.copyBrain.recommended}개 추천.`);
      if (d.telegram) parts.push(`Telegram: ${d.telegram.status}.`);
      return {
        text: parts.join(' '),
        shouldSpeak: true,
        shouldShowInChat: true,
        suggestedActions: actions,
      };
    }

    case 'busy_notice':
      return {
        text: '선생님, 방금 작업을 마무리하는 중입니다. 완료되면 바로 이어서 설명드리겠습니다.',
        shouldSpeak: true,
        shouldShowInChat: true,
      };

    default:
      actions.push(
        { id: 'briefing', label: '업무 브리핑', mode: 'observe' },
        { id: 'outreach', label: '후보 수집', mode: 'draft' },
        { id: 'copy', label: '카피 생성', mode: 'draft' },
      );
      return {
        text: '선생님, 무엇을 도와드릴까요?',
        shouldSpeak: false,
        shouldShowInChat: true,
        suggestedActions: actions,
      };
  }
}

/**
 * 반복 응답 감지
 */
function isRepeatedReply(nextText: string, lastAssistantMessage?: string): boolean {
  if (!nextText || !lastAssistantMessage) return false;
  const normalize = (v: string) => v.replace(/\s+/g, '').trim();
  const a = normalize(nextText);
  const b = normalize(lastAssistantMessage);
  return a === b || (a.length > 24 && b.length > 24 && (a.includes(b.slice(0, 24)) || b.includes(a.slice(0, 24))));
}

/**
 * GPT context reply 호출
 */
export async function getContextReply(ctx: JarvisConversationContext): Promise<JarvisReply> {
  const sanitized = sanitizeContextForGPT(ctx);
  const userPrompt = buildUserPrompt(sanitized);

  try {
    const res = await fetch('/api/chat-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: CONTEXT_REPLY_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      console.warn('[JARVIS-DIALOGUE] GPT API failed:', res.status);
      return buildContextualFallback(ctx);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';

    // JSON 파싱 시도
    let parsed: any = null;
    try {
      // JSON 블록 추출
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // JSON 파싱 실패 시 텍스트 그대로 사용
    }

    let reply: JarvisReply;
    if (parsed && parsed.text) {
      reply = {
        text: parsed.text,
        shouldSpeak: true,
        shouldShowInChat: true,
        suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions : undefined,
      };
    } else {
      // 텍스트 응답 사용
      reply = {
        text: content.replace(/```json[\s\S]*?```/g, '').trim() || buildContextualFallback(ctx).text,
        shouldSpeak: true,
        shouldShowInChat: true,
      };
    }

    // 반복 응답 방지
    if (isRepeatedReply(reply.text, ctx.lastAssistantMessage)) {
      return buildContextualFallback(ctx);
    }

    return reply;
  } catch (error: any) {
    console.error('[JARVIS-DIALOGUE] Error:', error.message);
    return buildContextualFallback(ctx);
  }
}

/**
 * 반복 방지 래퍼
 */
export function preventRepeatedSignature(reply: JarvisReply, ctx: JarvisConversationContext): JarvisReply {
  if (!isRepeatedReply(reply.text, ctx.lastAssistantMessage)) return reply;
  return buildContextualFallback(ctx);
}

export { buildContextualFallback };
