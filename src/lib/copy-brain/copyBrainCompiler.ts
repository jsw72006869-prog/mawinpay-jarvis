/**
 * COPY-BRAIN-A.1: Copy Brain Compiler
 * 모든 엔진 데이터를 기반으로 GPT API에 보낼 프롬프트를 컴파일한다.
 * "잘 써줘" 금지 — 반드시 엔진 데이터 기반으로 생성하게 한다.
 */
import type { CopyBrainInput, CopyOutputType, PlatformType } from './copyBrainTypes';
import { productTruthToPrompt } from './productTruthEngine';
import { buyerDesiresToPrompt } from './buyerDesireEngine';
import { copyDNAToPrompt } from './copyDnaExtractor';
import { mawiVoiceToPrompt } from './mawiVoiceEngine';
import { platformFormulaToPrompt } from './platformFormulaEngine';
import { antiBoringWarning } from './antiBoringFilter';
import { riskGuardPromptWarning } from './copyRiskGuard';

// ═══ 출력 타입별 지시사항 ═══
const OUTPUT_TYPE_INSTRUCTIONS: Record<CopyOutputType, string> = {
  headline_copy: '헤드카피: 15자 이내, 강렬한 첫인상, 멈추게 만드는 한 줄. 광고 문구가 아닌 말하듯 던지는 문장.',
  thumbnail_copy: '썸네일 문구: 10자 이내, 클릭 유도, 시각적으로 강렬한 텍스트. 영상 썸네일에 들어갈 짧은 문구.',
  threads_post: '스레드 글: 3~5문장, 줄바꿈 리듬, 공감+궁금증 유발, 댓글 유도, 여운 있는 마무리. 직접 판매 최소화.',
  shorts_script_15s: '릴스/쇼츠 스크립트 15초: [0~3초] 후킹 → [3~10초] 장면/스토리 → [10~15초] 행동 유도. 자막 기준으로 작성.',
  instagram_caption: '인스타그램 캡션: 2~3문장, 감각 장면 중심, 시각적 문장, 해시태그 3~5개.',
  tiktok_script: '틱톡 스크립트: 빠른 후킹, 리듬감, 장면 중심, 광고 냄새 최소화.',
  naver_blog_intro: '네이버 블로그 도입부: 검색형 제목 + 도입 3~5문장, 구매 전 고민 공감, 신뢰 근거.',
  outreach_email_draft: '공동구매 제안 메일: 제목 + 본문, 상대 채널 맥락 반영, 왜 이 상품과 맞는지, 부담 없는 답장 유도. 상대 채널명은 [채널명]으로 표기.',
};

// ═══ 메인 함수: 프롬프트 컴파일 ═══
export function compileCopyBrainPrompt(input: CopyBrainInput): { systemPrompt: string; userPrompt: string } {
  const { product, platform, outputTypes, sourceKeyword, count, viralContents, productTruth, buyerDesires, copyDNA, platformFormula } = input;

  // ═══ System Prompt ═══
  const systemPrompt = `당신은 "Mawin Agricultural Copy Brain"입니다.
농산물/식품 바이럴 마케팅 전문 카피 엔진으로, 아래 데이터와 규칙을 기반으로 카피를 생성합니다.

${mawiVoiceToPrompt()}

${riskGuardPromptWarning()}

${antiBoringWarning()}

중요 원칙:
1. 모든 카피는 아래 제공된 Product Truth, Buyer Desire, Copy DNA 데이터를 기반으로 생성합니다.
2. "잘 써줘" 수준의 일반 카피가 아닌, 데이터 기반의 정밀한 카피를 생성합니다.
3. 각 카피에 어떤 hook_type, buyer_desire, angle을 사용했는지 명시합니다.
4. 금지 표현이 포함된 카피는 생성하지 않습니다.
5. 원본 콘텐츠를 장문 복사하지 않습니다. 구조만 참고합니다.`;

  // ═══ User Prompt ═══
  const outputInstructions = outputTypes
    .map((type, i) => `${i + 1}. ${OUTPUT_TYPE_INSTRUCTIONS[type] || type}`)
    .join('\n');

  const viralRef = viralContents.length > 0
    ? viralContents.slice(0, 5).map(v =>
      `- [${v.platform}] 후킹: "${v.hook_text}" / 반응: ${v.engagement_visible} / 이유: ${v.hot_reason}`
    ).join('\n')
    : '(아직 수집된 Hot Content 없음 — Product Truth와 Buyer Desire 기반으로 생성)';

  const userPrompt = `상품: ${product}
플랫폼: ${platform}
검색 키워드: ${sourceKeyword}
생성 수: 각 타입별 ${count}개

${productTruthToPrompt(productTruth)}

${buyerDesiresToPrompt(buyerDesires)}

${copyDNAToPrompt(copyDNA)}

${platformFormulaToPrompt(platformFormula)}

[참고할 반응 좋은 콘텐츠 (구조만 참고, 원문 복사 금지)]
${viralRef}

[생성 요청]
아래 각 타입별로 ${count}개씩 생성해주세요:
${outputInstructions}

[응답 형식 — 반드시 JSON]
{
  "copies": [
    {
      "output_type": "headline_copy",
      "generated_text": "...",
      "angle": "어떤 앵글로 접근했는지",
      "hook_type": "conflict_hook|confession_hook|seasonal_hook|sensory_hook|contrarian_hook|local_trust_hook|memory_hook|limited_timing_hook|identity_hook",
      "buyer_desire": "nostalgia|seasonal_craving|family_care|gift|scarcity_timing|sensory_imagination|trust|convenience|identity|community_participation",
      "product_truth_used": "어떤 상품 진실을 활용했는지",
      "score_hint": {
        "hook_strength": "strong|medium|weak",
        "sensory_level": "high|medium|low",
        "risk_flags": []
      }
    }
  ]
}

각 카피는 반드시:
- Mawi Voice 스타일을 따를 것
- 금지 표현을 포함하지 않을 것
- 플랫폼 공식에 맞출 것
- Product Truth 기반일 것
- Buyer Desire를 자극할 것`;

  return { systemPrompt, userPrompt };
}

// ═══ 프롬프트 미리보기 (dryRun용) ═══
export function previewPrompt(input: CopyBrainInput): string {
  const { systemPrompt, userPrompt } = compileCopyBrainPrompt(input);
  return `[System Prompt 길이: ${systemPrompt.length}자]\n${systemPrompt.substring(0, 500)}...\n\n[User Prompt 길이: ${userPrompt.length}자]\n${userPrompt.substring(0, 500)}...`;
}
