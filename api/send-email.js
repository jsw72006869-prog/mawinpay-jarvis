"use strict";
// Vercel Serverless Function
// 이메일 전송 API - Gmail SMTP (nodemailer)
// attachments 지원 + 테스트 수신자 보호 조건

const nodemailer = require('nodemailer');

// 테스트 수신자 보호 조건 - 이 목록에 없는 주소로는 발송 차단
const ALLOWED_TEST_RECIPIENTS = ['jungsng805@naver.com'];

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

  const { to, subject, body, html, recipients, attachments, testMode } = req.body || {};

  // 단일 발송 또는 다중 발송
  const targets = recipients && Array.isArray(recipients)
    ? recipients
    : to ? [{ email: to, name: '', subject: subject || '', body: html || body || '' }]
    : [];

  if (targets.length === 0) {
    return res.status(400).json({ error: 'to 또는 recipients 필드가 필요합니다.' });
  }

  const isTestMode = testMode === true || testMode === 'true';

  // attachments 처리: [{filename, content(base64), contentType}] 형식
  const mailAttachments = [];
  if (attachments && Array.isArray(attachments)) {
    for (const att of attachments) {
      if (att.filename && att.content) {
        mailAttachments.push({
          filename: att.filename,
          content: Buffer.from(att.content, 'base64'),
          contentType: att.contentType || 'application/octet-stream',
        });
      }
    }
  }

  const results = [];
  let successCount = 0;
  let failCount = 0;
  let blockedCount = 0;

  for (const target of targets) {
    const toEmail = (target.email || target.to || '').toLowerCase().trim();
    const toName = target.name || '';
    const mailSubject = target.subject || subject || '협업 제안 드립니다';
    const mailHtml = target.body || target.html || html || body || '';

    if (!toEmail || !toEmail.includes('@')) {
      results.push({ email: toEmail, status: 'skipped', reason: '유효하지 않은 이메일' });
      continue;
    }

    // 보호 조건: 허용된 테스트 수신자만 발송
    if (!ALLOWED_TEST_RECIPIENTS.includes(toEmail)) {
      results.push({
        email: toEmail,
        status: 'blocked',
        reason: '테스트 수신자 목록에 없음 (execute LOCKED)',
      });
      blockedCount++;
      continue;
    }

    try {
      const mailOptions = {
        from: `"${senderName}" <${gmailUser}>`,
        to: toName ? `"${toName}" <${toEmail}>` : toEmail,
        replyTo: gmailUser,
        subject: mailSubject,
        html: mailHtml || `<p>${mailSubject}</p>`,
      };

      // 첨부파일이 있으면 추가
      if (mailAttachments.length > 0) {
        mailOptions.attachments = mailAttachments;
      }

      const info = await transporter.sendMail(mailOptions);
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
    blocked: blockedCount,
    results,
    provider: 'gmail',
    testMode: isTestMode,
  });
};
