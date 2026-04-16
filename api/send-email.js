"use strict";
// Vercel Serverless Function
// 이메일 전송 API - Resend (고발송률 전문 이메일 서비스)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const senderEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  const senderName = process.env.RESEND_SENDER_NAME || 'MAWINPAY JARVIS';

  if (!resendApiKey) {
    return res.status(500).json({
      error: 'Resend API 키 없음',
      message: 'RESEND_API_KEY 환경변수를 Vercel에 설정해주세요.',
    });
  }

  const { to, subject, body, html, recipients } = req.body || {};

  // 단일 발송 또는 다중 발송
  const targets = recipients && Array.isArray(recipients)
    ? recipients
    : to ? [{ email: to, name: '', subject: subject || '', body: html || body || '' }]
    : [];

  if (targets.length === 0) {
    return res.status(400).json({ error: 'to 또는 recipients 필드가 필요합니다.' });
  }

  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (const target of targets) {
    const toEmail = target.email || target.to;
    const toName = target.name || '';
    const mailSubject = target.subject || subject || '협업 제안 드립니다';
    const mailHtml = target.body || target.html || html || body || '';

    if (!toEmail || !toEmail.includes('@')) {
      results.push({ email: toEmail, status: 'skipped', reason: '유효하지 않은 이메일' });
      continue;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${senderName} <${senderEmail}>`,
          to: toName ? [`${toName} <${toEmail}>`] : [toEmail],
          subject: mailSubject,
          html: mailHtml || `<p>${mailSubject}</p>`,
        }),
      });

      const data = await response.json();

      if (response.ok && data.id) {
        results.push({ email: toEmail, status: 'sent', messageId: data.id });
        successCount++;
      } else {
        const errMsg = data.message || data.error || `HTTP ${response.status}`;
        console.error(`[Resend] 발송 실패 ${toEmail}:`, errMsg);
        results.push({ email: toEmail, status: 'failed', reason: errMsg });
        failCount++;
      }
    } catch (err) {
      console.error(`[Resend] 네트워크 오류 ${toEmail}:`, err);
      results.push({ email: toEmail, status: 'failed', reason: String(err.message || err) });
      failCount++;
    }

    // 연속 발송 시 300ms 딜레이 (Rate limit 방지)
    if (targets.length > 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return res.status(200).json({
    success: true,
    total: targets.length,
    sent: successCount,
    failed: failCount,
    results,
    provider: 'resend',
  });
};
