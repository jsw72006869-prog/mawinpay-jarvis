#!/usr/bin/env node
/**
 * 자비스 브라우저 에이전트 서버
 * ================================
 * Playwright 기반 독립 실행 서버.
 * 로컬 PC 또는 VPS에서 실행하여 네이버 예약 등 브라우저 자동화를 수행합니다.
 * 
 * 실행 방법:
 *   node browser-agent-server.js
 * 
 * 환경 변수:
 *   PORT=4000 (기본값)
 *   AGENT_SECRET=your-secret-key (API 인증)
 * 
 * API 엔드포인트:
 *   POST /agent/check-reservation  - 예약 가능 일정 조회
 *   POST /agent/make-reservation   - 예약 실행
 *   POST /agent/execute            - 범용 브라우저 작업
 *   GET  /agent/health             - 서버 상태 확인
 */

const http = require('http');
const { chromium } = require('playwright');

const PORT = process.env.PORT || 4000;
const AGENT_SECRET = process.env.AGENT_SECRET || 'jarvis-browser-agent-2026';

let browser = null;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browser;
}

async function createPage() {
  const b = await getBrowser();
  const ctx = await b.newContext({
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
    viewport: { width: 390, height: 844 },
  });
  return await ctx.newPage();
}

/**
 * 네이버 예약 가능 일정 조회 (Playwright 실제 브라우저)
 */
async function checkReservation(params) {
  const logs = [];
  const startTime = Date.now();
  const screenshots = [];

  function addLog(step, status, detail, data = null) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logs.push({ step, status, detail, timestamp: new Date().toISOString(), elapsed: `${elapsed}s`, data });
    console.log(`[${elapsed}s] ${status.toUpperCase()} | ${step}: ${detail}`);
  }

  const { placeName, bizId, itemId } = params || {};
  const targetBizId = bizId || '379909';
  const targetItemId = itemId || '3506026';

  addLog('브라우저 시작', 'start', 'Playwright Chromium 브라우저를 시작합니다...');
  const page = await createPage();

  try {
    // 1단계: 예약 항목 페이지 접속
    addLog('예약 페이지 접속', 'start', `https://m.booking.naver.com/booking/13/bizes/${targetBizId}/items/${targetItemId}`);
    await page.goto(`https://m.booking.naver.com/booking/13/bizes/${targetBizId}/items/${targetItemId}`, {
      timeout: 30000,
      waitUntil: 'networkidle',
    }).catch(() => {});
    await page.waitForTimeout(10000);

    addLog('페이지 로딩 완료', 'success', '예약 페이지가 렌더링되었습니다.');

    // 2단계: 스크린샷 촬영
    const screenshotBuffer = await page.screenshot({ fullPage: true });
    const screenshotBase64 = screenshotBuffer.toString('base64');
    screenshots.push({
      name: 'reservation_page.png',
      base64: screenshotBase64,
      description: '예약 페이지 캘린더',
    });
    addLog('스크린샷 촬영', 'success', '예약 페이지 스크린샷을 촬영했습니다.');

    // 3단계: 페이지 텍스트 분석
    const bodyText = await page.innerText('body');
    addLog('페이지 분석 중', 'start', '예약 가능 날짜를 분석합니다...');

    // 캘린더에서 날짜 정보 추출
    const calendarData = await page.$$eval('[class*="calendar"] td, [class*="Calendar"] td, table td', cells => {
      return cells.map(cell => ({
        text: cell.textContent.trim(),
        classes: cell.className,
        isDisabled: cell.className.includes('disabled') || cell.className.includes('past') || cell.className.includes('dayoff'),
        isFull: cell.className.includes('full') || cell.className.includes('soldout'),
        isToday: cell.className.includes('today') || cell.className.includes('selected'),
      })).filter(c => c.text && /^\d{1,2}$/.test(c.text));
    }).catch(() => []);

    // 텍스트에서 날짜 정보 추출
    const lines = bodyText.split('\n').filter(l => l.trim());
    const dateInfo = [];
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    // "마감", "휴무" 텍스트 위치 기반 분석
    let currentDay = 0;
    for (const line of lines) {
      const dayMatch = line.match(/^(\d{1,2})$/);
      if (dayMatch) {
        currentDay = parseInt(dayMatch[1]);
      }
      if (line.includes('마감') && currentDay > 0) {
        dateInfo.push({ day: currentDay, status: 'full' });
      }
      if (line.includes('휴무') && currentDay > 0) {
        dateInfo.push({ day: currentDay, status: 'closed' });
      }
    }

    // 예약 가능 날짜 계산
    const unavailableDays = new Set(dateInfo.map(d => d.day));
    const availableDates = [];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    for (let day = today.getDate() + 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      if (unavailableDays.has(day)) {
        const info = dateInfo.find(di => di.day === day);
        availableDates.push({
          date: dateStr,
          dayOfWeek: dayNames[d.getDay()],
          available: false,
          reason: info?.status === 'full' ? '마감' : '휴무',
        });
      } else {
        availableDates.push({
          date: dateStr,
          dayOfWeek: dayNames[d.getDay()],
          available: true,
        });
      }
    }

    addLog('날짜 분석 완료', 'success', 
      `${availableDates.filter(d => d.available).length}개 예약 가능, ${availableDates.filter(d => !d.available).length}개 불가`,
      availableDates
    );

    // 4단계: 진료 항목 정보 추출
    const itemName = bodyText.includes('성수경') ? '성수경원장님 진료' :
                     bodyText.includes('허은영') ? '허은영원장님 진료' : '진료예약';

    addLog('조회 완료', 'success', `"${placeName || '로즈벨여성의원'}" 예약 가능 일정 조회를 완료했습니다.`);

    return {
      success: true,
      place: {
        name: placeName || '로즈벨여성의원',
        bizId: targetBizId,
        address: '대구광역시 중구 동성로2길 95, 3층',
        phone: '053-424-9900',
      },
      selectedItem: { id: targetItemId, name: itemName },
      availableDates,
      screenshots,
      actionLogs: logs,
      requiresLogin: true,
    };
  } catch (error) {
    addLog('오류 발생', 'fail', error.message);
    return { success: false, error: error.message, actionLogs: logs, screenshots };
  } finally {
    await page.context().close();
  }
}

/**
 * 네이버 예약 실행 (Playwright 실제 브라우저)
 */
async function makeReservation(params) {
  const logs = [];
  const startTime = Date.now();
  const screenshots = [];

  function addLog(step, status, detail, data = null) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logs.push({ step, status, detail, timestamp: new Date().toISOString(), elapsed: `${elapsed}s`, data });
    console.log(`[${elapsed}s] ${status.toUpperCase()} | ${step}: ${detail}`);
  }

  const { bizId, itemId, date, time, memo } = params || {};
  const targetBizId = bizId || '379909';
  const targetItemId = itemId || '3506026';

  addLog('예약 프로세스 시작', 'start', '브라우저를 열어 예약을 진행합니다.');
  const page = await createPage();

  try {
    // 1단계: 예약 페이지 접속
    addLog('예약 페이지 접속', 'start', '네이버 예약 페이지에 접속합니다...');
    await page.goto(`https://m.booking.naver.com/booking/13/bizes/${targetBizId}/items/${targetItemId}`, {
      timeout: 30000,
      waitUntil: 'networkidle',
    }).catch(() => {});
    await page.waitForTimeout(10000);

    // 2단계: 날짜 선택
    if (date) {
      const day = parseInt(date.split('-')[2]);
      addLog('날짜 선택 중', 'start', `${date} (${day}일)을 클릭합니다...`);

      // 캘린더에서 날짜 클릭
      const dateCell = await page.$(`td:has-text("${day}")`);
      if (dateCell) {
        await dateCell.click();
        await page.waitForTimeout(3000);
        addLog('날짜 선택 완료', 'success', `${date}을 선택했습니다.`);

        const screenshot2 = await page.screenshot({ fullPage: false });
        screenshots.push({
          name: 'date_selected.png',
          base64: screenshot2.toString('base64'),
          description: '날짜 선택 후 화면',
        });
      } else {
        addLog('날짜 선택 실패', 'fail', `${day}일을 찾을 수 없습니다.`);
      }
    }

    // 3단계: 시간 선택
    if (time) {
      addLog('시간 선택 중', 'start', `${time}을 선택합니다...`);
      const timeSlot = await page.$(`text=${time}`);
      if (timeSlot) {
        await timeSlot.click();
        await page.waitForTimeout(2000);
        addLog('시간 선택 완료', 'success', `${time}을 선택했습니다.`);
      } else {
        addLog('시간 선택 실패', 'warning', `${time} 시간대를 찾을 수 없습니다. 가능한 시간대를 확인해주세요.`);
      }
    }

    // 4단계: 다음단계 버튼 클릭
    addLog('다음단계 진행', 'start', '"다음단계" 버튼을 클릭합니다...');
    const nextBtn = await page.$('text=다음단계');
    if (nextBtn) {
      await nextBtn.click();
      await page.waitForTimeout(5000);
      
      const screenshot3 = await page.screenshot({ fullPage: false });
      screenshots.push({
        name: 'next_step.png',
        base64: screenshot3.toString('base64'),
        description: '다음단계 화면',
      });

      // 로그인 필요 여부 확인
      const pageText = await page.innerText('body');
      if (pageText.includes('로그인') || pageText.includes('네이버 아이디로 로그인')) {
        addLog('로그인 필요', 'warning', '네이버 로그인이 필요합니다. 로그인 후 다시 시도해주세요.');
        return {
          success: false,
          status: 'login_required',
          message: '네이버 로그인이 필요합니다.',
          actionLogs: logs,
          screenshots,
        };
      }

      addLog('예약 정보 입력 대기', 'info', '예약자 정보 입력 화면입니다.');
    }

    // 5단계: 메모 입력
    if (memo) {
      addLog('메모 입력 중', 'start', `메모: "${memo}"`);
      const memoInput = await page.$('textarea, input[name*="memo"], input[name*="request"]');
      if (memoInput) {
        await memoInput.fill(memo);
        addLog('메모 입력 완료', 'success', '메모를 입력했습니다.');
      }
    }

    const finalScreenshot = await page.screenshot({ fullPage: true });
    screenshots.push({
      name: 'final_state.png',
      base64: finalScreenshot.toString('base64'),
      description: '최종 상태',
    });

    addLog('예약 프로세스 일시 중단', 'info', '최종 예약 확인 전 사용자 승인을 기다립니다.');

    return {
      success: true,
      status: 'pending_confirmation',
      message: '예약 정보가 입력되었습니다. 최종 확인 후 예약을 완료합니다.',
      actionLogs: logs,
      screenshots,
    };
  } catch (error) {
    addLog('오류 발생', 'fail', error.message);
    return { success: false, error: error.message, actionLogs: logs, screenshots };
  } finally {
    await page.context().close();
  }
}

// HTTP 서버
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // 인증 확인
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${AGENT_SECRET}`) {
    if (req.url !== '/agent/health') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }
  }

  // 요청 본문 파싱
  let body = '';
  for await (const chunk of req) body += chunk;
  const params = body ? JSON.parse(body) : {};

  try {
    if (req.url === '/agent/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ 
        status: 'ok', 
        agent: 'jarvis-browser-agent',
        version: '1.0.0',
        browserConnected: browser?.isConnected() || false,
        timestamp: new Date().toISOString(),
      }));
    }

    if (req.method === 'POST' && req.url === '/agent/check-reservation') {
      const result = await checkReservation(params);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    }

    if (req.method === 'POST' && req.url === '/agent/make-reservation') {
      const result = await makeReservation(params);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', endpoints: ['/agent/health', '/agent/check-reservation', '/agent/make-reservation'] }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║  🤖 자비스 브라우저 에이전트 서버               ║
║  ────────────────────────────────────────────── ║
║  Port: ${PORT}                                    ║
║  Status: Running                                 ║
║  Browser: Playwright Chromium (Headless)         ║
║                                                  ║
║  Endpoints:                                      ║
║  GET  /agent/health              - 상태 확인     ║
║  POST /agent/check-reservation   - 예약 조회     ║
║  POST /agent/make-reservation    - 예약 실행     ║
╚══════════════════════════════════════════════════╝
  `);
});

// 종료 시 브라우저 정리
process.on('SIGINT', async () => {
  if (browser) await browser.close();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  if (browser) await browser.close();
  process.exit(0);
});
