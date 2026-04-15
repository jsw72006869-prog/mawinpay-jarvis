"use strict";
// Vercel Serverless Function (CommonJS)
// 이메일 전송 API - Gmail SMTP (nodemailer)
// 앱에서 사용하던 방식 그대로 이식

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const gmailAddress = process.env.GMAIL_ADDRESS;
  const appPassword = process.env.GMAIL_APP_PASSWORD;
  const senderName = process.env.GMAIL_SENDER_NAME || 'Mawinpay';

  if (!gmailAddress || !appPassword) {
    return res.status(500).json({
      error: 'SMTP 설정 없음',
      message: 'GMAIL_ADDRESS와 GMAIL_APP_PASSWORD 환경변수를 Vercel에 설정해주세요.',
    });
  }

  const { to, subject, body, recipients } = req.body || {};

  // 단일 발송 또는 다중 발송
  const targets = recipients && Array.isArray(recipients)
    ? recipients
    : to ? [{ email: to, name: '', subject: subject || '', body: body || '' }]
    : [];

  if (targets.length === 0) {
    return res.status(400).json({ error: 'to 또는 recipients 필드가 필요합니다.' });
  }

  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (e) {
    return res.status(500).json({ error: 'nodemailer 패키지가 없습니다.', message: String(e) });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailAddress,
      pass: appPassword,
    },
  });

  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (const target of targets) {
    const toEmail = target.email || target.to;
    const mailSubject = target.subject || subject || '협업 제안 드립니다';
    const mailBody = target.body || body || '';

    if (!toEmail || !toEmail.includes('@')) {
      results.push({ email: toEmail, status: 'skipped', reason: '유효하지 않은 이메일' });
      continue;
    }

    try {
      await transporter.sendMail({
        from: `"${senderName}" <${gmailAddress}>`,
        to: toEmail,
        subject: mailSubject,
        html: mailBody,
      });
      results.push({ email: toEmail, status: 'sent' });
      successCount++;
    } catch (err) {
      console.error(`[Email] 발송 실패 ${toEmail}:`, err);
      results.push({ email: toEmail, status: 'failed', reason: String(err.message || err) });
      failCount++;
    }

    // 연속 발송 시 0.5초 딜레이 (Gmail 속도 제한 방지)
    if (targets.length > 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return res.status(200).json({
    success: true,
    total: targets.length,
    sent: successCount,
    failed: failCount,
    results,
  });
};
