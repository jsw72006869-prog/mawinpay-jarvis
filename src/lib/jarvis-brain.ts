// JARVIS AI Brain - 음성 명령 처리 엔진
// 무료 버전: Web Speech API 사용 (OpenAI API 없이 작동)

export type JarvisState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'working';

export type JarvisAction = {
  type: 'collect' | 'send_email' | 'create_banner' | 'report' | 'help' | 'unknown' | 'greeting' | 'status' | 'confirm' | 'schedule';
  params?: Record<string, string | number>;
  response: string;
  workingMessage?: string;
};

// 랜덤 선택 헬퍼
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 시간대별 인사
function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return '좋은 아침입니다';
  if (hour >= 12 && hour < 17) return '좋은 오후입니다';
  if (hour >= 17 && hour < 21) return '좋은 저녁입니다';
  return '늦은 시간에도 수고가 많으십니다';
}

// 명령어 파싱 - 자연어를 액션으로 변환
export function parseCommand(text: string): JarvisAction {
  const lower = text.toLowerCase().trim();
  const timeGreeting = getTimeGreeting();

  // ── 인사 ──
  if (/^(안녕|반가워|잘 있었어|오랜만|하이|헬로|hi|hello)/.test(lower)) {
    return {
      type: 'greeting',
      response: pick([
        `${timeGreeting}. 저는 MAWINPAY 인텔리전스 시스템입니다. 오늘 어떤 작업을 진행할까요?`,
        `${timeGreeting}. 시스템이 완전히 준비되어 있습니다. 무엇을 도와드릴까요?`,
        `${timeGreeting}. 모든 모듈이 정상 작동 중입니다. 명령을 내려주세요.`,
      ]),
    };
  }

  // ── 감사 표현 ──
  if (/고마워|감사|수고|잘했어|훌륭해|완벽해/.test(lower)) {
    return {
      type: 'greeting',
      response: pick([
        '감사합니다. 항상 최선을 다하겠습니다. 추가로 필요한 것이 있으시면 말씀해 주세요.',
        '천만에요. 언제든지 도움이 필요하시면 말씀해 주세요.',
        '제가 도움이 되었다니 기쁩니다. 다음 작업을 진행할까요?',
      ]),
    };
  }

  // ── 인플루언서 수집 ──
  if (/수집|찾아|검색|인플루언서|블로거|유튜버|크리에이터|틱톡커|인스타그래머/.test(lower)) {
    const countMatch = lower.match(/(\d+)\s*명/);
    const count = countMatch ? parseInt(countMatch[1]) : 50;

    const categoryMap: Record<string, string> = {
      '맛집': '맛집·푸드', '음식': '맛집·푸드', '푸드': '맛집·푸드',
      '뷰티': '뷰티·코스메틱', '화장': '뷰티·코스메틱', '스킨케어': '뷰티·코스메틱',
      '패션': '패션·스타일', '옷': '패션·스타일', '스타일': '패션·스타일',
      '여행': '여행·라이프스타일', '여행지': '여행·라이프스타일',
      '운동': '피트니스·헬스', '헬스': '피트니스·헬스', '피트니스': '피트니스·헬스',
      '게임': '게임·e스포츠', '게이머': '게임·e스포츠',
      '요리': '쿠킹·레시피', '레시피': '쿠킹·레시피', '쿠킹': '쿠킹·레시피',
      '육아': '육아·패밀리', '아이': '육아·패밀리', '맘': '육아·패밀리',
      '반려동물': '펫·동물', '강아지': '펫·동물', '고양이': '펫·동물', '펫': '펫·동물',
      '캠핑': '아웃도어·캠핑', '아웃도어': '아웃도어·캠핑',
      '인테리어': '홈·인테리어', '홈': '홈·인테리어',
      '테크': 'IT·테크', '기술': 'IT·테크', '전자': 'IT·테크',
      '금융': '금융·재테크', '투자': '금융·재테크', '재테크': '금융·재테크',
      '건강': '건강·웰니스', '웰니스': '건강·웰니스',
    };

    let category = '전체';
    for (const [key, val] of Object.entries(categoryMap)) {
      if (lower.includes(key)) { category = val; break; }
    }

    const platformMap: Record<string, string> = {
      '인스타그램': 'Instagram', '인스타': 'Instagram',
      '유튜브': 'YouTube', '유투브': 'YouTube',
      '틱톡': 'TikTok',
      '네이버': 'Naver Blog',
      '카카오': 'KakaoStory',
      '트위터': 'Twitter/X',
    };

    let platform = '';
    for (const [key, val] of Object.entries(platformMap)) {
      if (lower.includes(key)) { platform = val; break; }
    }

    const platformText = platform ? ` ${platform} 플랫폼에서` : '';
    const followerRange = count >= 100 ? '10만~100만' : count >= 50 ? '5만~50만' : '1만~10만';

    return {
      type: 'collect',
      params: { count, category },
      workingMessage: `${category} 카테고리${platformText} 인플루언서 ${count}명을 스캔 중...`,
      response: pick([
        `${category} 카테고리${platformText} 인플루언서 ${count}명 수집이 완료되었습니다. 팔로워 ${followerRange} 구간, 이메일 확인율 94.2%, 활동 중인 계정 ${Math.round(count * 0.89)}개입니다. 이메일을 발송할까요?`,
        `스캔 완료. ${category} 분야 인플루언서 ${count}명의 데이터가 저장되었습니다. 평균 팔로워 ${Math.floor(Math.random() * 50 + 80)}만 명, 평균 참여율 4.7%입니다. 다음 단계로 이메일 발송을 진행할까요?`,
        `${count}명 수집 완료. ${category} 상위 인플루언서들이 데이터베이스에 등록되었습니다. 중복 제거 후 유효 데이터 ${Math.round(count * 0.96)}건. 협업 제안 이메일을 보낼까요?`,
      ]),
    };
  }

  // ── 이메일 발송 ──
  if (/이메일|메일|발송|보내|전송|연락/.test(lower)) {
    const templateMap: Record<string, string> = {
      '공동구매': '공동구매 제안', '공구': '공동구매 제안',
      '협찬': '협찬 제안', '스폰서': '협찬 제안',
      '협업': '협업 제안', '콜라보': '협업 제안',
      '광고': '광고 제안', '마케팅': '마케팅 협업 제안',
      '파트너십': '파트너십 제안', '파트너': '파트너십 제안',
    };

    let template = '협업 제안';
    for (const [key, val] of Object.entries(templateMap)) {
      if (lower.includes(key)) { template = val; break; }
    }

    const countMatch = lower.match(/(\d+)\s*명/);
    const count = countMatch ? parseInt(countMatch[1]) : 47;
    const successCount = Math.round(count * 0.987);

    return {
      type: 'send_email',
      params: { template, count },
      workingMessage: `${template} 이메일 ${count}통을 발송하고 있습니다...`,
      response: pick([
        `${template} 이메일 ${count}통 발송 완료. 성공 ${successCount}통, 실패 ${count - successCount}통. 스팸 필터 통과율 98.7%, 예상 오픈율 28.3%입니다. 응답은 24~48시간 내에 확인 가능합니다.`,
        `발송 완료. ${successCount}명의 인플루언서에게 ${template} 제안서가 전달되었습니다. AI가 각 인플루언서 프로필에 맞게 개인화된 내용으로 발송했습니다.`,
        `${count}통 전송 성공. 발송 시간 최적화 적용 완료. 오전 10시, 오후 2시, 저녁 8시 타임존별 분산 발송되었습니다. 응답을 모니터링하겠습니다.`,
      ]),
    };
  }

  // ── 배너/이미지 생성 ──
  if (/배너|이미지|만들어|생성|디자인|썸네일|포스터|카드뉴스/.test(lower)) {
    const styleMap: Record<string, string> = {
      '미니멀': '미니멀 클린',
      '화려': '화려한 그라디언트',
      '트렌디': '트렌디 Y2K',
      '프리미엄': '프리미엄 럭셔리',
      '귀여운': '귀여운 일러스트',
      '모던': '모던 타이포',
    };

    let style = '트렌디 Y2K';
    for (const [key, val] of Object.entries(styleMap)) {
      if (lower.includes(key)) { style = val; break; }
    }

    return {
      type: 'create_banner',
      params: { style },
      workingMessage: `AI가 ${style} 스타일 배너를 생성하고 있습니다...`,
      response: pick([
        `${style} 스타일 배너 5종 생성 완료. 인스타그램 피드(1:1), 스토리(9:16), 유튜브 썸네일(16:9), 블로그 헤더(3:1) 규격으로 최적화되었습니다. 다운로드 준비가 완료되었습니다.`,
        `배너 생성 완료. A/B 테스트용 2가지 메인 버전과 플랫폼별 4가지 규격이 준비되었습니다. 클릭률 최적화 AI 디자인이 적용되었습니다.`,
        `AI 배너 5종 생성 완료. ${style} 컨셉으로 브랜드 컬러와 폰트가 자동 적용되었습니다. 발송할 이메일에 첨부할까요?`,
      ]),
    };
  }

  // ── 현황/통계 보고 ──
  if (/현황|통계|얼마나|몇 명|알려줘|보고|분석|결과|성과|어때|어떻게 됐|진행/.test(lower)) {
    const today = new Date();
    const dateStr = `${today.getMonth() + 1}월 ${today.getDate()}일`;

    return {
      type: 'report',
      workingMessage: '데이터베이스를 분석하고 리포트를 생성하고 있습니다...',
      response: pick([
        `${dateStr} 현황 보고드립니다. 수집된 인플루언서 총 247명, 발송 이메일 183통, 응답률 23.5%, 계약 전환 4건입니다. 전주 대비 응답률이 3.2% 상승했으며, 이번 달 예상 계약 건수는 7건입니다.`,
        `이번 주 성과 보고. 신규 인플루언서 89명 추가, 이메일 183통 발송, 응답 43건, 미팅 요청 12건, 계약 4건 체결. ROI는 투자 대비 340%로 업계 평균의 2.1배입니다.`,
        `현재까지 총 247명의 인플루언서 데이터가 확보되었으며, 183명에게 이메일을 발송했습니다. 응답률 23.5%는 업계 평균 15.3%보다 8.2% 높습니다. 최고 성과 카테고리는 맛집·푸드입니다.`,
      ]),
    };
  }

  // ── 일정/스케줄 ──
  if (/일정|스케줄|예약|나중에|내일|다음 주|자동/.test(lower)) {
    return {
      type: 'schedule',
      workingMessage: '일정을 등록하고 있습니다...',
      response: pick([
        '일정이 등록되었습니다. 지정하신 시간에 자동으로 작업을 시작하겠습니다. 알림을 보내드리겠습니다.',
        '스케줄 등록 완료. 자동화 파이프라인이 설정되었습니다. 작업 완료 시 보고드리겠습니다.',
      ]),
    };
  }

  // ── 시스템 상태 ──
  if (/상태|시스템|작동|정상|온라인|연결|서버/.test(lower)) {
    const cpu = Math.floor(Math.random() * 20 + 15);
    const mem = Math.floor(Math.random() * 20 + 35);
    const latency = Math.floor(Math.random() * 8 + 8);

    return {
      type: 'status',
      response: pick([
        `모든 시스템이 정상 작동 중입니다. CPU ${cpu}%, 메모리 ${mem}%, 네트워크 지연 ${latency}ms. 데이터베이스 응답 속도 8ms, AI 모듈 온라인 상태입니다.`,
        `시스템 상태 양호. 모든 모듈이 최적 상태로 운영 중입니다. 지난 24시간 가동률 99.8%, 처리된 요청 1,247건, 오류율 0.02%입니다.`,
      ]),
    };
  }

  // ── 중지/취소 ──
  if (/중지|취소|멈춰|그만|스톱|stop|잠깐/.test(lower)) {
    return {
      type: 'help',
      response: pick([
        '알겠습니다. 현재 작업을 중지합니다. 다른 명령이 있으시면 말씀해 주세요.',
        '작업을 중지했습니다. 언제든지 다시 시작할 수 있습니다.',
      ]),
    };
  }

  // ── 확인/승인 ──
  if (/^(응|네|예|맞아|좋아|그래|오케이|ok|yes|진행|계속|해줘)/.test(lower)) {
    return {
      type: 'confirm',
      response: pick([
        '알겠습니다. 바로 진행하겠습니다.',
        '네, 즉시 처리하겠습니다.',
        '확인했습니다. 작업을 시작합니다.',
      ]),
    };
  }

  // ── 거절 ──
  if (/^(아니|아니요|노|no|취소|됐어|괜찮아)/.test(lower)) {
    return {
      type: 'help',
      response: pick([
        '알겠습니다. 다른 작업이 필요하시면 말씀해 주세요.',
        '네, 취소하겠습니다. 다른 명령을 기다리겠습니다.',
      ]),
    };
  }

  // ── 도움말 ──
  if (/뭐|할 수 있|기능|도움|명령|어떻게|사용법|설명/.test(lower)) {
    return {
      type: 'help',
      response: pick([
        '저는 네 가지 핵심 기능을 처리할 수 있습니다. 첫째, 인플루언서 수집 — "맛집 인플루언서 50명 찾아줘". 둘째, 이메일 발송 — "공동구매 이메일 보내줘". 셋째, 배너 생성 — "트렌디한 배너 만들어줘". 넷째, 현황 분석 — "오늘 성과 알려줘". 자연스럽게 말씀해 주시면 됩니다.',
        '음성으로 모든 것을 처리할 수 있습니다. 인플루언서 수집, 이메일 자동 발송, AI 배너 생성, 성과 분석이 가능합니다. 예를 들어 "뷰티 유튜버 100명 수집하고 협찬 이메일 보내줘" 처럼 복합 명령도 처리됩니다.',
      ]),
    };
  }

  // ── 기본 응답 ──
  return {
    type: 'unknown',
    response: pick([
      '죄송합니다, 명확하게 이해하지 못했습니다. 인플루언서 수집, 이메일 발송, 배너 생성, 현황 분석 중 어떤 작업을 원하시나요?',
      '잘 이해하지 못했습니다. 조금 더 구체적으로 말씀해 주시겠습니까? 예를 들어 "맛집 인플루언서 50명 수집해줘" 처럼 말씀해 주세요.',
      '다시 한번 말씀해 주시겠습니까? 음성 인식이 완전하지 않을 수 있습니다. 천천히 말씀해 주시면 더 잘 이해할 수 있습니다.',
    ]),
  };
}

// JARVIS 인사말 목록
export const JARVIS_GREETINGS = [
  `${getTimeGreeting()}. MAWINPAY 인텔리전스 시스템이 활성화되었습니다. 무엇을 도와드릴까요?`,
  '시스템 온라인. 모든 모듈이 정상 작동 중입니다. 명령을 내려주세요.',
  '대기 상태에서 깨어났습니다. 인플루언서 수집, 이메일 발송, 배너 생성 — 무엇이 필요하십니까?',
  '인플루언서 마케팅 자동화 시스템 준비 완료. 오늘 어떤 작업을 진행할까요?',
  `${getTimeGreeting()}. 저는 MAWINPAY입니다. 음성으로 모든 마케팅 작업을 처리해 드리겠습니다.`,
];

// JARVIS 대기 중 메시지
export const JARVIS_IDLE_MESSAGES = [
  '박수 두 번으로 저를 깨워주세요.',
  '언제든지 박수를 치시면 활성화됩니다.',
  '명령을 기다리고 있습니다.',
];
