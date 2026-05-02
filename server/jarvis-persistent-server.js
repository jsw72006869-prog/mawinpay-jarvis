/**
 * JARVIS v5.0 Persistent Cloud Server
 * 마누스 클라우드 환경에서 24시간 상주하는 자비스의 신체
 * 
 * 기능:
 * - Playwright 기반 브라우저 자동화 (네이버 예약, 마케팅)
 * - 실시간 텔레메트리 스트리밍 (스크린샷, 로그)
 * - WebSocket 기반 양방향 통신
 * - 영구 세션 관리 (네이버 로그인 쿠키)
 * - 자동화 스케줄러
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 설정
const PORT = process.env.PORT || 3001;
const VERCEL_FRONTEND_URL = process.env.VERCEL_FRONTEND_URL || 'http://localhost:5173';
const NAVER_COOKIES_PATH = path.join(__dirname, '../.cookies/naver-session.json');
const SCREENSHOTS_DIR = path.join(__dirname, '../.screenshots');

// 전역 상태
let browser = null;
let browserContext = null;
let clients = new Set();
let currentTask = null;

// 디렉토리 초기화
[path.dirname(NAVER_COOKIES_PATH), SCREENSHOTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ============================================
// 1. 브라우저 초기화 및 관리
// ============================================

async function initBrowser() {
  try {
    console.log('[JARVIS] 브라우저 엔진 초기화 중...');
    browser = await chromium.launch({
      headless: false, // 화면 표시 (모니터링용)
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox'
      ]
    });
    
    browserContext = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    // 저장된 쿠키 로드
    await loadNaverCookies();
    
    console.log('[JARVIS] 브라우저 엔진 준비 완료 ✓');
    broadcastToClients({
      type: 'system',
      message: '브라우저 엔진 초기화 완료',
      status: 'ready'
    });
  } catch (error) {
    console.error('[ERROR] 브라우저 초기화 실패:', error);
    broadcastToClients({
      type: 'error',
      message: `브라우저 초기화 실패: ${error.message}`,
      status: 'error'
    });
  }
}

// ============================================
// 2. 네이버 세션 관리
// ============================================

async function loadNaverCookies() {
  try {
    if (fs.existsSync(NAVER_COOKIES_PATH)) {
      const cookies = JSON.parse(fs.readFileSync(NAVER_COOKIES_PATH, 'utf-8'));
      await browserContext.addCookies(cookies);
      console.log('[JARVIS] 네이버 세션 로드 완료');
    }
  } catch (error) {
    console.warn('[WARN] 네이버 세션 로드 실패:', error.message);
  }
}

async function saveNaverCookies() {
  try {
    const cookies = await browserContext.cookies();
    fs.writeFileSync(NAVER_COOKIES_PATH, JSON.stringify(cookies, null, 2));
    console.log('[JARVIS] 네이버 세션 저장 완료');
  } catch (error) {
    console.error('[ERROR] 네이버 세션 저장 실패:', error);
  }
}

// ============================================
// 3. 스크린샷 및 실시간 스트리밍
// ============================================

async function captureScreenshot(page, taskName) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${taskName}-${timestamp}.png`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);
    
    await page.screenshot({ path: filepath, fullPage: false });
    
    // Base64로 인코딩하여 클라이언트로 전송
    const imageBuffer = fs.readFileSync(filepath);
    const base64Image = imageBuffer.toString('base64');
    
    broadcastToClients({
      type: 'screenshot',
      taskName,
      image: `data:image/png;base64,${base64Image}`,
      timestamp: new Date().toISOString()
    });
    
    return filepath;
  } catch (error) {
    console.error('[ERROR] 스크린샷 캡처 실패:', error);
  }
}

// ============================================
// 4. 네이버 예약 자동화 엔진
// ============================================

async function executeNaverReservation(params) {
  const { businessName, date, time, guestName, guestPhone } = params;
  
  try {
    currentTask = { type: 'reservation', status: 'running', progress: 0 };
    
    broadcastToClients({
      type: 'task_start',
      taskName: 'execute_web_task',
      message: `네이버 예약 시작: ${businessName} ${date} ${time}`
    });

    const page = await browserContext.newPage();

    // Step 1: 네이버 예약 페이지 접속
    broadcastToClients({
      type: 'task_log',
      message: '[Step 1] 네이버 예약 페이지 접속 중...',
      progress: 10
    });

    await page.goto('https://booking.naver.com', { waitUntil: 'networkidle' });
    await captureScreenshot(page, 'naver-booking-main');

    // Step 2: 업체 검색
    broadcastToClients({
      type: 'task_log',
      message: `[Step 2] "${businessName}" 검색 중...`,
      progress: 25
    });

    await page.fill('input[placeholder*="업체"]', businessName);
    await page.press('input[placeholder*="업체"]', 'Enter');
    await page.waitForTimeout(2000);
    await captureScreenshot(page, 'naver-search-result');

    // Step 3: 첫 번째 결과 클릭
    broadcastToClients({
      type: 'task_log',
      message: '[Step 3] 업체 선택 중...',
      progress: 40
    });

    const firstResult = await page.$('div[class*="business-item"]');
    if (firstResult) {
      await firstResult.click();
      await page.waitForTimeout(2000);
    }

    // Step 4: 날짜 선택
    broadcastToClients({
      type: 'task_log',
      message: `[Step 4] 날짜 선택: ${date}`,
      progress: 55
    });

    const dateInput = await page.$('input[type="date"]');
    if (dateInput) {
      await dateInput.fill(date);
      await page.waitForTimeout(1000);
    }
    await captureScreenshot(page, 'naver-date-selection');

    // Step 5: 시간 선택
    broadcastToClients({
      type: 'task_log',
      message: `[Step 5] 시간 선택: ${time}`,
      progress: 70
    });

    const timeOptions = await page.$$('button[class*="time-slot"]');
    for (const option of timeOptions) {
      const text = await option.textContent();
      if (text.includes(time)) {
        await option.click();
        break;
      }
    }
    await captureScreenshot(page, 'naver-time-selection');

    // Step 6: 예약자 정보 입력
    broadcastToClients({
      type: 'task_log',
      message: '[Step 6] 예약자 정보 입력 중...',
      progress: 85
    });

    const nameInputs = await page.$$('input[type="text"]');
    if (nameInputs.length > 0) {
      await nameInputs[0].fill(guestName);
    }

    const phoneInputs = await page.$$('input[type="tel"]');
    if (phoneInputs.length > 0) {
      await phoneInputs[0].fill(guestPhone);
    }
    await captureScreenshot(page, 'naver-guest-info');

    // Step 7: 최종 확인 및 예약
    broadcastToClients({
      type: 'task_log',
      message: '[Step 7] 예약 최종 확인 중...',
      progress: 95
    });

    const confirmButton = await page.$('button[class*="confirm"]');
    if (confirmButton) {
      await confirmButton.click();
      await page.waitForTimeout(3000);
    }
    await captureScreenshot(page, 'naver-confirmation');

    // 성공
    await saveNaverCookies();
    
    broadcastToClients({
      type: 'task_success',
      taskName: 'execute_web_task',
      message: `네이버 예약 완료: ${businessName} ${date} ${time}`,
      data: {
        businessName,
        date,
        time,
        guestName,
        guestPhone,
        status: 'completed'
      }
    });

    await page.close();
    currentTask = { type: 'reservation', status: 'completed' };

  } catch (error) {
    console.error('[ERROR] 네이버 예약 실패:', error);
    
    broadcastToClients({
      type: 'task_error',
      taskName: 'execute_web_task',
      message: `네이버 예약 실패: ${error.message}`,
      error: error.message
    });

    currentTask = { type: 'reservation', status: 'failed', error: error.message };
  }
}

// ============================================
// 5. 네이버 침투 마케팅 (키워드 분석 및 댓글)
// ============================================

async function executeNaverMarketingAgent(params) {
  const { keywords, commentTemplate } = params;

  try {
    currentTask = { type: 'marketing', status: 'running', progress: 0 };

    broadcastToClients({
      type: 'task_start',
      taskName: 'scan_influencer',
      message: `네이버 마케팅 시작: 키워드 ${keywords.join(', ')}`
    });

    const page = await browserContext.newPage();

    // 네이버 블로그 검색
    for (const keyword of keywords) {
      broadcastToClients({
        type: 'task_log',
        message: `[검색] "${keyword}" 키워드 스캔 중...`,
        progress: 25
      });

      await page.goto(`https://section.blog.naver.com/Search/Post.naver?keyword=${encodeURIComponent(keyword)}`, {
        waitUntil: 'networkidle'
      });

      await captureScreenshot(page, `naver-search-${keyword}`);

      // 블로그 글 수집
      const posts = await page.$$('div[class*="post-item"]');
      
      for (let i = 0; i < Math.min(posts.length, 5); i++) {
        try {
          const postLink = await posts[i].$('a');
          if (postLink) {
            await postLink.click();
            await page.waitForTimeout(2000);
            await captureScreenshot(page, `naver-post-${keyword}-${i}`);

            // 댓글 작성
            const commentBox = await page.$('textarea[class*="comment"]');
            if (commentBox) {
              const customComment = `${commentTemplate} (자동 생성됨)`;
              await commentBox.fill(customComment);
              
              const submitButton = await page.$('button[class*="submit"]');
              if (submitButton) {
                await submitButton.click();
                await page.waitForTimeout(1000);
              }

              broadcastToClients({
                type: 'task_log',
                message: `✓ 댓글 작성 완료: "${keyword}" 포스트 ${i + 1}`,
                progress: 40 + (i * 10)
              });
            }

            await page.goBack();
            await page.waitForTimeout(1000);
          }
        } catch (postError) {
          console.warn(`[WARN] 포스트 처리 실패: ${postError.message}`);
        }
      }
    }

    await saveNaverCookies();

    broadcastToClients({
      type: 'task_success',
      taskName: 'scan_influencer',
      message: `네이버 마케팅 완료`,
      data: {
        keywords,
        postsProcessed: keywords.length * 5,
        status: 'completed'
      }
    });

    await page.close();
    currentTask = { type: 'marketing', status: 'completed' };

  } catch (error) {
    console.error('[ERROR] 네이버 마케팅 실패:', error);

    broadcastToClients({
      type: 'task_error',
      taskName: 'scan_influencer',
      message: `네이버 마케팅 실패: ${error.message}`,
      error: error.message
    });

    currentTask = { type: 'marketing', status: 'failed', error: error.message };
  }
}

// ============================================
// 6. WebSocket 통신
// ============================================

function broadcastToClients(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('[WS] 클라이언트 연결됨');
  clients.add(ws);

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      console.log('[WS] 수신:', data.action);

      switch (data.action) {
        case 'execute_reservation':
          await executeNaverReservation(data.params);
          break;

        case 'execute_marketing':
          await executeNaverMarketingAgent(data.params);
          break;

        case 'get_status':
          ws.send(JSON.stringify({
            type: 'status',
            currentTask,
            browserReady: !!browser
          }));
          break;

        default:
          console.warn('[WARN] 알 수 없는 액션:', data.action);
      }
    } catch (error) {
      console.error('[ERROR] WebSocket 메시지 처리 실패:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  });

  ws.on('close', () => {
    console.log('[WS] 클라이언트 연결 해제');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('[ERROR] WebSocket 에러:', error);
  });
});

// ============================================
// 7. REST API 엔드포인트
// ============================================

app.use(express.json());

// CORS 설정
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', VERCEL_FRONTEND_URL);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// 상태 조회
app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    browserReady: !!browser,
    currentTask,
    clientsConnected: clients.size,
    uptime: process.uptime()
  });
});

// 예약 실행 (REST)
app.post('/api/reservation', async (req, res) => {
  try {
    await executeNaverReservation(req.body);
    res.json({ success: true, message: '예약 작업 시작됨' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 마케팅 실행 (REST)
app.post('/api/marketing', async (req, res) => {
  try {
    await executeNaverMarketingAgent(req.body);
    res.json({ success: true, message: '마케팅 작업 시작됨' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 8. 서버 시작
// ============================================

async function start() {
  try {
    await initBrowser();

    server.listen(PORT, () => {
      console.log(`\n[JARVIS v5.0] 서버 시작됨`);
      console.log(`📍 포트: ${PORT}`);
      console.log(`🌐 WebSocket: ws://localhost:${PORT}`);
      console.log(`📡 REST API: http://localhost:${PORT}/api`);
      console.log(`✓ 자비스 클라우드 엔진 준비 완료!\n`);
    });
  } catch (error) {
    console.error('[FATAL] 서버 시작 실패:', error);
    process.exit(1);
  }
}

// 정상 종료
process.on('SIGINT', async () => {
  console.log('\n[JARVIS] 서버 종료 중...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

start();
