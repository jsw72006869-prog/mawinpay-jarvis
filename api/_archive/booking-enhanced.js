/**
 * booking-enhanced.js v4.2
 * 네이버 예약 모듈 고도화 API
 * 
 * 기능:
 * - 네이버 로그인 세션 관리 (쿠키 저장/복원)
 * - 예약 가능 시간대 조회
 * - 폼 자동 작성
 * - 캡차/OTP 대응 (GPT Vision 1차 시도 → 사용자 입력 폴백)
 * - 단계별 텔레메트리 보고
 * 
 * 환경변수:
 * - BOOKING_SERVER: 브라우저 자동화 서버 URL
 * - NAVER_SESSION_COOKIE: 네이버 로그인 쿠키 (Base64)
 * - OPENAI_API_KEY: GPT Vision 캡차 풀이용
 */

// ─── 상수 ───
const BOOKING_SERVER = process.env.BOOKING_SERVER || 'http://localhost:4100';
const NAVER_BOOKING_BASE = 'https://booking.naver.com';

// ─── 유틸리티 ───
function createResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function getTimestamp() {
  return new Date().toISOString();
}

// ─── 세션 관리 ───
let sessionStore = {
  cookies: null,
  lastLogin: null,
  isValid: false,
};

async function checkSession() {
  try {
    const res = await fetch(`${BOOKING_SERVER}/api/booking/session-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookies: sessionStore.cookies }),
    });
    const data = await res.json();
    sessionStore.isValid = data.valid;
    return data.valid;
  } catch {
    // BOOKING_SERVER 미연결 시 쿠키 기반 판단
    if (sessionStore.cookies && sessionStore.lastLogin) {
      const elapsed = Date.now() - new Date(sessionStore.lastLogin).getTime();
      // 4시간 이내면 유효로 간주
      return elapsed < 4 * 60 * 60 * 1000;
    }
    return false;
  }
}

async function saveCookies(cookies) {
  sessionStore.cookies = cookies;
  sessionStore.lastLogin = getTimestamp();
  sessionStore.isValid = true;
  return true;
}

// ─── 캡차 자동 풀이 (GPT Vision) ───
async function solveCaptchaWithVision(captchaImageBase64) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { success: false, error: 'OPENAI_API_KEY not set' };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: '이 이미지에 표시된 보안 문자(캡차)를 정확히 읽어주세요. 문자만 답해주세요.' },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${captchaImageBase64}` } },
            ],
          },
        ],
        max_tokens: 50,
      }),
    });
    const data = await response.json();
    const captchaText = data.choices?.[0]?.message?.content?.trim();
    if (captchaText && captchaText.length >= 4 && captchaText.length <= 8) {
      return { success: true, code: captchaText };
    }
    return { success: false, error: 'GPT Vision 인식 실패' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── 예약 가능 시간 조회 ───
async function fetchAvailability(businessName, date) {
  const logs = [];
  logs.push({ step: 'SEARCH', status: 'start', detail: `"${businessName}" 검색 시작`, timestamp: getTimestamp() });

  try {
    // BOOKING_SERVER가 있으면 브라우저 자동화 사용
    const res = await fetch(`${BOOKING_SERVER}/api/booking/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName,
        date,
        cookies: sessionStore.cookies,
      }),
    });
    const data = await res.json();

    if (data.requiresLogin) {
      logs.push({ step: 'LOGIN', status: 'waiting', detail: '네이버 로그인 필요', timestamp: getTimestamp() });
      return { success: false, requiresLogin: true, logs };
    }

    if (data.captcha) {
      logs.push({ step: 'CAPTCHA', status: 'waiting', detail: '캡차 감지', timestamp: getTimestamp() });
      // GPT Vision 1차 시도
      const visionResult = await solveCaptchaWithVision(data.captchaImage);
      if (visionResult.success) {
        logs.push({ step: 'CAPTCHA_AUTO', status: 'success', detail: `자동 인식: ${visionResult.code}`, timestamp: getTimestamp() });
        // 자동 풀이 코드 제출
        const retryRes = await fetch(`${BOOKING_SERVER}/api/booking/submit-captcha`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: visionResult.code, sessionId: data.sessionId }),
        });
        const retryData = await retryRes.json();
        if (retryData.success) {
          logs.push({ step: 'AVAILABILITY', status: 'success', detail: `${retryData.slots?.length || 0}개 시간대 확인`, timestamp: getTimestamp() });
          return { success: true, slots: retryData.slots, logs };
        }
      }
      // GPT Vision 실패 → 사용자 입력 필요
      logs.push({ step: 'CAPTCHA_MANUAL', status: 'waiting', detail: '자동 인식 실패, 사용자 입력 필요', timestamp: getTimestamp() });
      return { success: false, requiresCaptcha: true, captchaImage: data.captchaImage, sessionId: data.sessionId, logs };
    }

    if (data.slots) {
      logs.push({ step: 'AVAILABILITY', status: 'success', detail: `${data.slots.length}개 시간대 확인`, timestamp: getTimestamp() });
      return { success: true, slots: data.slots, logs };
    }

    logs.push({ step: 'AVAILABILITY', status: 'fail', detail: '예약 가능 시간대 없음', timestamp: getTimestamp() });
    return { success: false, noSlots: true, logs };

  } catch (err) {
    logs.push({ step: 'ERROR', status: 'fail', detail: `서버 연결 실패: ${err.message}`, timestamp: getTimestamp() });
    return { success: false, error: err.message, logs };
  }
}

// ─── 예약 실행 ───
async function executeBooking(businessName, date, time, userInfo) {
  const logs = [];
  logs.push({ step: 'BOOKING_START', status: 'start', detail: `${businessName} ${date} ${time} 예약 시작`, timestamp: getTimestamp() });

  try {
    const res = await fetch(`${BOOKING_SERVER}/api/booking/fill-form`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName,
        date,
        time,
        userInfo,
        cookies: sessionStore.cookies,
      }),
    });
    const data = await res.json();

    if (data.success) {
      logs.push({ step: 'BOOKING_CONFIRM', status: 'success', detail: `예약 완료: ${businessName} ${date} ${time}`, timestamp: getTimestamp() });
      return { success: true, confirmationId: data.confirmationId, logs };
    }

    if (data.requiresConfirm) {
      logs.push({ step: 'BOOKING_CONFIRM', status: 'waiting', detail: '사용자 최종 확인 대기', timestamp: getTimestamp() });
      return { success: false, requiresConfirm: true, summary: data.summary, logs };
    }

    logs.push({ step: 'BOOKING_FAIL', status: 'fail', detail: data.error || '예약 실패', timestamp: getTimestamp() });
    return { success: false, error: data.error, logs };

  } catch (err) {
    logs.push({ step: 'BOOKING_ERROR', status: 'fail', detail: `예약 실행 오류: ${err.message}`, timestamp: getTimestamp() });
    return { success: false, error: err.message, logs };
  }
}

// ─── API 핸들러 ───
export default async function handler(req) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type' },
    });
  }

  const url = new URL(req.url, 'http://localhost');
  const action = url.searchParams.get('action');

  try {
    switch (action) {
      case 'check-session': {
        const isValid = await checkSession();
        return createResponse({ valid: isValid, lastLogin: sessionStore.lastLogin });
      }

      case 'save-cookies': {
        const body = await req.json();
        await saveCookies(body.cookies);
        return createResponse({ success: true, message: '세션 저장 완료' });
      }

      case 'availability': {
        const body = await req.json();
        const { businessName, date } = body;
        if (!businessName) return createResponse({ error: 'businessName 필수' }, 400);
        const result = await fetchAvailability(businessName, date);
        return createResponse(result);
      }

      case 'book': {
        const body = await req.json();
        const { businessName, date, time, userInfo } = body;
        if (!businessName || !date || !time) return createResponse({ error: 'businessName, date, time 필수' }, 400);
        const result = await executeBooking(businessName, date, time, userInfo);
        return createResponse(result);
      }

      case 'submit-captcha': {
        const body = await req.json();
        const { code, sessionId } = body;
        try {
          const res = await fetch(`${BOOKING_SERVER}/api/booking/submit-captcha`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, sessionId }),
          });
          const data = await res.json();
          return createResponse(data);
        } catch (err) {
          return createResponse({ success: false, error: err.message }, 500);
        }
      }

      case 'screenshot': {
        try {
          const res = await fetch(`${BOOKING_SERVER}/api/booking/screenshot`);
          const data = await res.json();
          return createResponse(data);
        } catch (err) {
          return createResponse({ success: false, error: '스크린샷 서버 연결 실패' }, 500);
        }
      }

      default:
        return createResponse({
          error: 'action 파라미터 필요 (check-session, save-cookies, availability, book, submit-captcha, screenshot)',
          version: '4.2',
          endpoints: [
            'GET ?action=check-session',
            'POST ?action=save-cookies { cookies }',
            'POST ?action=availability { businessName, date }',
            'POST ?action=book { businessName, date, time, userInfo }',
            'POST ?action=submit-captcha { code, sessionId }',
            'GET ?action=screenshot',
          ],
        }, 400);
    }
  } catch (err) {
    return createResponse({ error: `서버 오류: ${err.message}` }, 500);
  }
}
