"use strict";
// Vercel Serverless Function
// 이메일 전송 API - Gmail SMTP (nodemailer)

const nodemailer = require('nodemailer');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const gmailUser = process.env.GMAIL_ADDRESS;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const senderName = process.env.GMAIL_SENDER_NAME || 'MAWINPAY JARVIS';

  if (!gmailUser || !gmailPass) {
    return res.status(500).json({
      error: 'Gmail 설정 없음',
      message: 'GMAIL_ADDRESS, GMAIL_APP_PASSWORD 환경변수를 Vercel에 설정해주세요.',
    });
  }

  // Gmail SMTP 트랜스포터 생성
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  });

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
      const info = await transporter.sendMail({
        from: `"${senderName}" <${gmailUser}>`,
        to: toName ? `"${toName}" <${toEmail}>` : toEmail,
        replyTo: gmailUser,
        subject: mailSubject,
        html: mailHtml || `<p>${mailSubject}</p>`,
      });

      results.push({ email: toEmail, status: 'sent', messageId: info.messageId });
      successCount++;
    } catch (err) {
      console.error(`[Gmail] 발송 실패 ${toEmail}:`, err);
      results.push({ email: toEmail, status: 'failed', reason: String(err.message || err) });
      failCount++;
    }

    // 연속 발송 시 500ms 딜레이 (Gmail Rate limit 방지)
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
    provider: 'gmail',
  });
};
