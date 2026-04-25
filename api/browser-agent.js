/**
 * 하이브리드 브라우저 에이전트 API - 자비스의 팔다리
 * POST /api/browser-agent
 * 
 * 1차: 외부 Playwright 브라우저 에이전트 서버에 위임 (실제 브라우저 제어)
 * 2차: GraphQL/REST API 폴백 (Vercel 서버리스 내에서 직접 처리)
 * 
 * 모든 행동을 상세 로그로 기록하여 프론트엔드 HoloDataPanel에 실시간 피드백합니다.
 */

const AGENT_SERVER_URL = process.env.BROWSER_AGENT_SERVER_URL || '';
const AGENT_SECRET = process.env.BROWSER_AGENT_SECRET || 'jarvis-browser-agent-2026';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.json({
      status: 'ok',
      agent: 'jarvis-hybrid-browser-agent',
      version: '2.0.0',
      mode: AGENT_SERVER_URL ? 'hybrid' : 'api-only',
      endpoints: {
        check_reservation: '예약 가능 일정 조회 (네이버 플레이스)',
        make_reservation: '예약 실행 (네이버 로그인 필요)',
        search_place: '네이버 플레이스 검색',
        execute_task: '범용 웹 작업',
      },
    });
  }

  const { action, params } = req.body || {};
  const logs = [];
  const startTime = Date.now();
  const screenshots = [];

  function addLog(step, status, detail, data = null) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logs.push({ step, status, detail, timestamp: new Date().toISOString(), elapsed: `${elapsed}s`, data });
  }

  try {
    // ── 1차: 외부 Playwright 브라우저 에이전트 서버 시도 ──
    if (AGENT_SERVER_URL && action !== 'search_place') {
      addLog('에이전트 연결', 'start', `Playwright 브라우저 에이전트 서버에 연결합니다... (${AGENT_SERVER_URL})`);
      try {
        const agentEndpoint = action === 'check_reservation' ? '/agent/check-reservation'
          : action === 'make_reservation' ? '/agent/make-reservation'
          : null;

        if (agentEndpoint) {
          const agentRes = await fetch(`${AGENT_SERVER_URL}${agentEndpoint}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${AGENT_SECRET}`,
            },
            body: JSON.stringify(params),
            signal: AbortSignal.timeout(90000), // 90초 타임아웃
          });

          if (agentRes.ok) {
            const agentData = await agentRes.json();
            addLog('에이전트 응답', 'success', '브라우저 에이전트가 작업을 완료했습니다.');

            // 에이전트 로그를 우리 로그에 병합
            const mergedLogs = [...logs, ...(agentData.actionLogs || [])];

            return res.json({
              success: agentData.success !== false,
              action,
              mode: 'browser-agent',
              result: agentData,
              actionLogs: mergedLogs,
              screenshots: agentData.screenshots || screenshots,
            });
          } else {
            addLog('에이전트 실패', 'warning', `브라우저 에이전트 응답 오류 (${agentRes.status}). API 폴백으로 전환합니다.`);
          }
        }
      } catch (agentErr) {
        addLog('에이전트 연결 실패', 'warning', `${agentErr.message}. API 폴백으로 전환합니다.`);
      }
    }

    // ── 2차: API 폴백 (Vercel 서버리스 내 직접 처리) ──
    addLog('API 모드 전환', 'info', AGENT_SERVER_URL
      ? '브라우저 에이전트 불가. 네이버 API를 직접 호출합니다.'
      : '브라우저 에이전트 미설정. 네이버 API를 직접 호출합니다.');

    switch (action) {
      case 'check_reservation': {
        const result = await checkReservationViaAPI(params, addLog);
        return res.json({
          success: true,
          action: 'check_reservation',
          mode: 'api-fallback',
          result,
          actionLogs: logs,
          screenshots,
        });
      }
      case 'make_reservation': {
        const result = await makeReservationViaAPI(params, addLog);
        return res.json({
          success: true,
          action: 'make_reservation',
          mode: 'api-fallback',
          result,
          actionLogs: logs,
          screenshots,
        });
      }
      case 'search_place': {
        const result = await searchPlace(params, addLog);
        return res.json({
          success: true,
          action: 'search_place',
          mode: 'api',
          result,
          actionLogs: logs,
        });
      }
      default:
        return res.json({
          success: false,
          error: `지원하지 않는 액션: ${action}`,
          supportedActions: ['check_reservation', 'make_reservation', 'search_place'],
          actionLogs: logs,
        });
    }
  } catch (err) {
    addLog('시스템 오류', 'fail', err.message);
    return res.status(500).json({
      success: false,
      error: err.message,
      actionLogs: logs,
    });
  }
};

/**
 * API 폴백: 네이버 예약 가능 일정 조회 (GraphQL)
 */
async function checkReservationViaAPI(params, addLog) {
  const { placeName, bizId, itemId, doctorName, date } = params || {};
  const targetBizId = bizId || '379909';
  const targetItemId = itemId || '3506026';

  addLog('예약 조회 시작', 'start', `"${placeName || '로즈벨여성의원'}" 예약 가능 일정을 조회합니다.`);

  // 1단계: 업체 정보 조회 (GraphQL)
  addLog('업체 정보 조회', 'start', '네이버 예약 API에서 업체 정보를 가져옵니다...');
  let bizItems = [];
  let bizInfo = {};

  try {
    const bizRes = await fetch('https://m.booking.naver.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Referer': `https://m.booking.naver.com/booking/13/bizes/${targetBizId}`,
      },
      body: JSON.stringify({
        operationName: 'getBizItems',
        variables: { bizId: targetBizId, is498: false },
        query: `query getBizItems($bizId: String, $isNBP: Boolean, $is498: Boolean) {
          bizItems(input: {bizId: $bizId, isNBP: $isNBP, is498: $is498}) {
            id name bizItemCategoryName reviewScore reviewCount
            bizItemOptions { id name }
          }
        }`,
      }),
    });
    const bizData = await bizRes.json();
    bizItems = bizData?.data?.bizItems || [];
    addLog('업체 정보 확인', 'success', `${bizItems.length}개 진료 항목 발견`, 
      bizItems.map(i => ({ id: i.id, name: i.name, score: i.reviewScore })));
  } catch (e) {
    addLog('업체 정보 조회 실패', 'warning', `${e.message}. 기본 정보를 사용합니다.`);
  }

  // 2단계: 캘린더 조회
  addLog('캘린더 조회', 'start', '예약 가능 날짜를 확인합니다...');
  const availableDates = [];

  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const calendarRes = await fetch('https://m.booking.naver.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Referer': `https://m.booking.naver.com/booking/13/bizes/${targetBizId}/items/${targetItemId}`,
      },
      body: JSON.stringify({
        operationName: 'getCalendarDays',
        variables: {
          bizItemId: targetItemId,
          year,
          month: month + 1,
        },
        query: `query getCalendarDays($bizItemId: String, $year: Int, $month: Int) {
          calendarDays(input: {bizItemId: $bizItemId, year: $year, month: $month}) {
            calendarDays { dayoffs }
          }
        }`,
      }),
    });
    const calData = await calendarRes.json();
    const dayoffs = calData?.data?.calendarDays?.calendarDays?.dayoffs || [];
    const dayoffSet = new Set(dayoffs);

    const today = now.getDate();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    for (let day = today + 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const yyyymmdd = dateStr.replace(/-/g, '');
      const dayOfWeek = new Date(year, month, day).getDay();
      
      availableDates.push({
        date: dateStr,
        dayOfWeek: dayNames[dayOfWeek],
        available: !dayoffSet.has(yyyymmdd),
        reason: dayoffSet.has(yyyymmdd) ? '마감/휴무' : null,
      });
    }

    const availCount = availableDates.filter(d => d.available).length;
    const closedCount = availableDates.filter(d => !d.available).length;
    addLog('캘린더 조회 완료', 'success', `${availCount}개 예약 가능, ${closedCount}개 마감/휴무`, 
      availableDates.filter(d => d.available).slice(0, 7));
  } catch (e) {
    addLog('캘린더 조회 실패', 'warning', `${e.message}. 기본 정보를 사용합니다.`);
    
    const today = new Date();
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    for (let i = 1; i <= 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dayOfWeek = d.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        availableDates.push({
          date: d.toISOString().slice(0, 10),
          dayOfWeek: dayNames[dayOfWeek],
          available: true,
          note: '추정 (실시간 확인 필요)',
        });
      }
    }
    addLog('추정 날짜 생성', 'info', `향후 2주간 평일 ${availableDates.length}일 예약 가능 추정`);
  }

  // 3단계: 결과 정리
  const targetItem = bizItems.find(i => String(i.id) === String(targetItemId));
  addLog('조회 완료', 'success', `"${placeName || '로즈벨여성의원'}" 예약 가능 일정 조회를 완료했습니다.`);

  return {
    place: {
      name: placeName || '로즈벨여성의원',
      bizId: targetBizId,
      bookingUrl: `https://m.booking.naver.com/booking/13/bizes/${targetBizId}/items/${targetItemId}`,
      address: '대구광역시 중구 동성로2길 95, 3층',
      phone: '053-424-9900',
    },
    items: bizItems.map(i => ({
      id: i.id,
      name: i.name,
      reviewScore: i.reviewScore,
      reviewCount: i.reviewCount,
    })),
    selectedItem: {
      id: targetItemId,
      name: targetItem?.name || doctorName || '성수경원장님 진료',
    },
    availableDates,
    notice: '예약 신청 후 업체 확인이 필요합니다. 예약을 진행하시려면 make_reservation 액션을 호출해주세요.',
    requiresLogin: true,
    loginMessage: '네이버 예약을 완료하려면 네이버 로그인이 필요합니다.',
  };
}

/**
 * API 폴백: 예약 실행 (로그인 필요 안내)
 */
async function makeReservationViaAPI(params, addLog) {
  const { placeName, bizId, itemId, date, time, name, phone, memo } = params || {};
  
  addLog('예약 프로세스 시작', 'start', `"${placeName || '로즈벨여성의원'}" 예약을 시작합니다.`);
  addLog('예약 정보 확인', 'info', `날짜: ${date || '미정'}, 시간: ${time || '미정'}, 예약자: ${name || '미입력'}`, {
    date, time, name, phone: phone ? phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '미입력', memo,
  });
  addLog('네이버 로그인 필요', 'warning', '네이버 예약을 완료하려면 네이버 로그인이 필요합니다. 브라우저 에이전트 서버가 활성화되면 자동 로그인이 가능합니다.');

  return {
    status: 'pending_login',
    message: '네이버 예약을 완료하려면 네이버 로그인이 필요합니다.',
    reservationDetails: {
      place: placeName || '로즈벨여성의원',
      bizId: bizId || '379909',
      itemId: itemId || '3506026',
      date, time, name, memo,
    },
    nextSteps: [
      '1. 브라우저 에이전트 서버를 활성화하거나,',
      '2. 네이버 로그인 후 다시 예약 요청을 보내주세요.',
      '3. 자비스가 자동으로 예약을 완료합니다.',
    ],
    bookingUrl: `https://m.booking.naver.com/booking/13/bizes/${bizId || '379909'}/items/${itemId || '3506026'}`,
  };
}

/**
 * 네이버 플레이스 검색
 */
async function searchPlace(params, addLog) {
  const { query } = params || {};
  addLog('네이버 검색 시작', 'start', `"${query}" 검색 중...`);

  try {
    const searchUrl = `https://m.search.naver.com/search.naver?query=${encodeURIComponent(query)}`;
    addLog('검색 페이지 접속', 'info', searchUrl);

    const resp = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      },
    });
    const html = await resp.text();

    const bookingMatch = html.match(/booking\.naver\.com\/booking\/\d+\/bizes\/(\d+)/);
    const placeMatch = html.match(/place\.naver\.com\/\w+\/(\d+)/);

    addLog('검색 완료', 'success', `예약 가능: ${!!bookingMatch}, 플레이스 ID: ${placeMatch?.[1] || '없음'}`);

    return {
      query,
      bookingAvailable: !!bookingMatch,
      bookingBizId: bookingMatch ? bookingMatch[1] : null,
      placeId: placeMatch ? placeMatch[1] : null,
      bookingUrl: bookingMatch ? `https://m.booking.naver.com/booking/13/bizes/${bookingMatch[1]}` : null,
    };
  } catch (e) {
    addLog('검색 실패', 'fail', e.message);
    return { query, error: e.message };
  }
}
