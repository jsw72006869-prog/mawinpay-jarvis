/**
 * 지능형 콘텐츠 생성 API
 * 인플루언서 데이터 기반으로 맞춤형 이메일, 영상 스크립트, 제안서를 자동 생성합니다.
 * 
 * 지원 타입:
 * - email: 협업, 공구, 판매 제안 이메일
 * - script: 유튜브 쇼츠, 릴스, 롱폼 영상 스크립트
 * - proposal: 비즈니스 협력 제안서
 */

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return res.status(500).json({
      error: 'OpenAI API 키 없음',
      message: 'OPENAI_API_KEY 환경변수를 Vercel에 설정해주세요.',
    });
  }

  const {
    type = 'email', // email, script, proposal
    category = 'collab', // collab, group_buy, shorts, review, partner
    context = {}, // 사용자 비즈니스 정보
    targetData = {}, // 대상 인플루언서 정보
    mode = 'quick', // quick (GPT-4o), smart (마누스 AI)
    actionLog = [],
  } = req.body || {};

  const logs = [...actionLog];
  const addLog = (step, status, message) => {
    logs.push({ step, status, message, timestamp: new Date().toISOString() });
  };

  try {
    addLog('init', 'running', `콘텐츠 생성 시작: type=${type}, category=${category}, mode=${mode}`);

    // ─────────────────────────────────────────────────
    // 1단계: 콘텐츠 타입별 프롬프트 구성
    // ─────────────────────────────────────────────────
    let prompt = '';
    const businessName = context.businessName || '농산물 판매 사업';
    const businessDesc = context.businessDesc || '프리미엄 농산물 온라인 판매';
    const productName = context.productName || '공주밤';
    const productDesc = context.productDesc || '최고 품질의 공주 지역 밤';

    const influencerName = targetData.channelName || '인플루언서';
    const influencerCategory = targetData.category || '라이프스타일';
    const subscriberCount = targetData.subscriberCount || 0;
    const avgViews = targetData.avgViews || 0;
    const recentVideos = targetData.recentVideos || [];

    if (type === 'email') {
      if (category === 'collab') {
        prompt = `
당신은 전문적인 마케팅 담당자입니다. 다음 정보를 기반으로 인플루언서 협업 제안 이메일을 작성하세요.

【발신자 정보】
- 비즈니스명: ${businessName}
- 설명: ${businessDesc}
- 제품명: ${productName}
- 제품 설명: ${productDesc}

【대상 인플루언서】
- 채널명: ${influencerName}
- 카테고리: ${influencerCategory}
- 구독자: ${subscriberCount.toLocaleString()}명
- 평균 조회수: ${avgViews.toLocaleString()}회
- 최근 영상 주제: ${recentVideos.slice(0, 3).join(', ')}

【요청사항】
1. 제목: 명확하고 눈에 띄는 협업 제안 제목 (15자 이내)
2. 본문: 
   - 인사 및 채널 칭찬 (구체적인 영상 언급)
   - 제품 소개 및 협업 아이디어
   - 상호 이익 설명
   - 유연한 협업 방식 제시
3. 톤: 전문적이면서도 친근함
4. 길이: 200~300자 (한국어)

이메일 형식으로 작성하되, 마크다운 형식을 사용하지 마세요.
`;
      } else if (category === 'group_buy') {
        prompt = `
당신은 공동구매 전문가입니다. 다음 정보를 기반으로 공동구매 제안 이메일을 작성하세요.

【발신자 정보】
- 비즈니스명: ${businessName}
- 제품명: ${productName}
- 제품 설명: ${productDesc}

【대상 인플루언서】
- 채널명: ${influencerName}
- 구독자: ${subscriberCount.toLocaleString()}명

【제안 내용】
1. 공동구매 기간: 1주일 (예: 4월 29일~5월 5일)
2. 수익 배분: 인플루언서 15% 수수료
3. 최소 주문량: 100개
4. 배송 방식: 무료 배송

【요청사항】
1. 제목: 공동구매 협력 제안 제목 (15자 이내)
2. 본문:
   - 채널 구독자 규모에 맞는 수익 예상치 제시
   - 공동구매의 장점 (팔로워 참여도 증가, 수익 창출)
   - 구체적인 수익 배분 구조
   - 준비 일정
3. 톤: 비즈니스적이면서도 긍정적
4. 길이: 250~350자 (한국어)

이메일 형식으로 작성하세요.
`;
      }
    } else if (type === 'script') {
      if (category === 'shorts') {
        prompt = `
당신은 유튜브 쇼츠 전문 작가입니다. 다음 정보를 기반으로 30초 쇼츠 영상 스크립트를 작성하세요.

【제품 정보】
- 제품명: ${productName}
- 설명: ${productDesc}
- 타겟 채널: ${influencerName}

【스크립트 요구사항】
1. 길이: 30초 분량 (약 80~100단어)
2. 구조:
   - 0~5초: 후킹 (시청자 주목 끌기)
   - 5~20초: 제품 소개 및 장점
   - 20~28초: 행동 유도 (구매, 링크 클릭)
   - 28~30초: 마무리 및 채널 구독 권유
3. 톤: 활기차고 친근함
4. 시각 효과 제안: 텍스트 오버레이, 자막 등

【예상 시각 요소】
- 제품 클로즈업
- 사용 장면
- 고객 반응
- 구매 링크 화면

스크립트를 다음 형식으로 작성하세요:
[시간] | [음성 대사] | [시각 효과]
`;
      } else if (category === 'review') {
        prompt = `
당신은 제품 리뷰 영상 전문 작가입니다. 다음 정보를 기반으로 5분 리뷰 영상 스크립트를 작성하세요.

【제품 정보】
- 제품명: ${productName}
- 설명: ${productDesc}

【스크립트 요구사항】
1. 길이: 5분 분량 (약 800~1000단어)
2. 구조:
   - 0~30초: 인트로 (채널 소개, 오늘의 주제)
   - 30초~2분: 제품 언박싱 및 첫인상
   - 2분~3분30초: 제품 상세 설명 (맛, 품질, 특징)
   - 3분30초~4분30초: 사용 후기 및 추천 이유
   - 4분30초~5분: 아웃로 (구독 권유, 다음 영상 예고)
3. 톤: 자연스럽고 신뢰감 있음
4. 언어: 한국어

스크립트를 다음 형식으로 작성하세요:
[시간대] | [음성 대사] | [화면 구성]
`;
      }
    } else if (type === 'proposal') {
      if (category === 'partner') {
        prompt = `
당신은 비즈니스 제안서 전문가입니다. 다음 정보를 기반으로 파트너십 제안서를 작성하세요.

【제안 기업】
- 비즈니스명: ${businessName}
- 설명: ${businessDesc}
- 제품: ${productName}

【대상 인플루언서】
- 채널명: ${influencerName}
- 카테고리: ${influencerCategory}
- 구독자: ${subscriberCount.toLocaleString()}명
- 평균 조회수: ${avgViews.toLocaleString()}회

【제안서 요구사항】
1. 제목: 명확한 파트너십 제안 제목
2. 구성:
   - 1. 제안 개요 (2~3문장)
   - 2. 우리 비즈니스 소개 (3~4문장)
   - 3. 협력 방식 (구체적인 협업 계획)
   - 4. 예상 효과 (인플루언서 입장에서의 이점)
   - 5. 제안 조건 (기간, 수수료, 배송 방식 등)
   - 6. 다음 단계 (미팅 제안, 연락처)
3. 톤: 전문적이고 신뢰감 있음
4. 길이: 400~500자 (한국어)

제안서를 마크다운 형식으로 작성하세요.
`;
      }
    }

    if (!prompt) {
      throw new Error(`지원하지 않는 타입/카테고리: ${type}/${category}`);
    }

    addLog('prompt_build', 'done', `프롬프트 구성 완료 (${prompt.length}자)`);

    // ─────────────────────────────────────────────────
    // 2단계: GPT-4o로 콘텐츠 생성
    // ─────────────────────────────────────────────────
    addLog('gpt_call', 'running', 'GPT-4o 호출 중...');

    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: '당신은 전문적인 마케팅 및 콘텐츠 작성 전문가입니다. 사용자의 요청에 따라 고품질의 이메일, 스크립트, 제안서를 작성합니다.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!gptResponse.ok) {
      const errorData = await gptResponse.json();
      throw new Error(`GPT API 에러: ${errorData.error?.message || 'Unknown error'}`);
    }

    const gptData = await gptResponse.json();
    const generatedContent = gptData.choices?.[0]?.message?.content || '';

    if (!generatedContent) {
      throw new Error('GPT 응답이 비어있습니다');
    }

    addLog('gpt_call', 'done', `콘텐츠 생성 완료 (${generatedContent.length}자)`);

    // ─────────────────────────────────────────────────
    // 3단계: 마누스 AI 심층 분석 (smart 모드)
    // ─────────────────────────────────────────────────
    let manusAnalysis = '';
    if (mode === 'smart') {
      addLog('manus_analysis', 'running', '마누스 AI 심층 분석 중...');
      
      const manusPrompt = `
당신은 인플루언서 분석 전문가입니다. 다음 인플루언서의 최근 영상 스타일과 콘텐츠를 분석하여, 제안 전략을 개선해주세요.

【인플루언서 정보】
- 채널명: ${influencerName}
- 최근 영상: ${recentVideos.join(', ')}

【현재 생성된 콘텐츠】
${generatedContent}

【분석 요청】
1. 이 인플루언서의 콘텐츠 스타일 분석
2. 위 콘텐츠가 이 인플루언서에게 얼마나 적합한지 평가
3. 개선 제안 (더 개인화된 접근 방식)
4. 성공 가능성 예측 (낮음/중간/높음)

분석 결과를 JSON 형식으로 반환하세요:
{
  "styleAnalysis": "...",
  "compatibility": "...",
  "improvements": ["...", "..."],
  "successProbability": "높음"
}
`;

      try {
        const manusResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: '당신은 인플루언서 마케팅 전략 전문가입니다. 깊이 있는 분석을 제공합니다.',
              },
              {
                role: 'user',
                content: manusPrompt,
              },
            ],
            temperature: 0.8,
            max_tokens: 1500,
          }),
        });

        if (manusResponse.ok) {
          const manusData = await manusResponse.json();
          manusAnalysis = manusData.choices?.[0]?.message?.content || '';
          addLog('manus_analysis', 'done', '마누스 AI 분석 완료');
        } else {
          addLog('manus_analysis', 'warning', '마누스 AI 분석 스킵 (API 에러)');
        }
      } catch (err) {
        addLog('manus_analysis', 'warning', `마누스 AI 분석 실패: ${err.message}`);
      }
    }

    // ─────────────────────────────────────────────────
    // 4단계: 최종 결과 반환
    // ─────────────────────────────────────────────────
    addLog('complete', 'done', '콘텐츠 생성 완료');

    return res.status(200).json({
      success: true,
      type,
      category,
      mode,
      generatedContent,
      manusAnalysis: manusAnalysis || null,
      actionLog: logs,
      metadata: {
        targetInfluencer: influencerName,
        contentLength: generatedContent.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    addLog('error', 'failed', error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
      actionLog: logs,
    });
  }
};
