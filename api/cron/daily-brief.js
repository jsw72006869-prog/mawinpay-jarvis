"use strict";
const jarvisSecurity = require('../_shared/security.cjs');
/**
 * Vercel Cron Job: DAILY-BRIEF-A.1
 * 매일 KST 오전 9시 (UTC 00:00) 최근 24시간 운영 브리핑 생성
 * 
 * Cron Schedule: 0 0 * * * (UTC 00:00 = KST 09:00)
 * 
 * 수행 작업:
 * 1. 스마트스토어 주문 현황 수집
 * 2. 아웃리치 후보 현황 집계
 * 3. daily_operations_brief 탭에 저장
 * 4. Telegram 요약 전송 (env 설정 시)
 * 5. telegram_notification_logs 저장
 */

function verifyCronAuth(req) {
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return false;
  }
  return true;
}

module.exports = async function handler(req, res) {
  if (jarvisSecurity.applyCors(req, res)) return;

  // Cron 인증 확인
  if (!verifyCronAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // dryRun / sendTelegram 쿼리 파라미터 지원
  const dryRun = req.query?.dryRun === 'true';
  const sendTelegram = req.query?.sendTelegram !== 'false'; // 기본 true

  try {
    // cloud-proxy의 daily-brief-24h 엔드포인트를 내부 호출
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['host'] || 'mawinpay-jarvis.vercel.app';
    const baseUrl = `${protocol}://${host}`;

    const response = await fetch(`${baseUrl}/api/cloud-proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskType: 'daily-brief-24h',
        params: { dryRun, sendTelegram },
      }),
    });

    const result = await response.json();

    return res.status(200).json({
      success: true,
      cron: 'daily-brief',
      executedAt: new Date().toISOString(),
      dryRun,
      sendTelegram,
      result,
    });
  } catch (error) {
    console.error('[daily-brief cron] Error:', error.message || error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unknown error',
      executedAt: new Date().toISOString(),
    });
  }
};
