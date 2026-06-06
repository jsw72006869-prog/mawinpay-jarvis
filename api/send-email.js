"use strict";
// Vercel Serverless Function
// 이메일 전송 API - Gmail SMTP (nodemailer)
// attachments 지원 + 테스트 수신자 보호 조건

const nodemailer = require('nodemailer');
const crypto = require('crypto');
const jarvisSecurity = require('./_shared/security.cjs');

// 테스트 수신자 보호 조건 - 이 목록에 없는 주소로는 발송 차단
const ALLOWED_TEST_RECIPIENTS = ['jungsng805@naver.com'];

module.exports = async function handler(req, res) {
  if (jarvisSecurity.applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, subject, body, html, recipients, attachments, testMode, dryRun, actionId, idempotencyKey } = req.body || {};
  const isTestMode = testMode === true || testMode === 'true';
  const isDryRun = dryRun === true || dryRun === 'true' || isTestMode;

  const gmailUser = process.env.GMAIL_ADDRESS;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const senderName = process.env.GMAIL_SENDER_NAME || 'MAWINPAY JARVIS';

  if (!isDryRun && (!gmailUser || !gmailPass)) {
    return res.status(500).json({
      error: 'Gmail 설정 없음',
      message: 'GMAIL_ADDRESS, GMAIL_APP_PASSWORD 환경변수를 Vercel에 설정해주세요.',
    });
  }

  // Gmail SMTP 트랜스포터 생성
  const transporter = !isDryRun ? nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  }) : null;
  if (!isDryRun) {
    const owner = jarvisSecurity.requireOwnerToken(req);
    if (!owner.ok) return jarvisSecurity.block(res, 401, owner.errorCode, 'Gmail execution requires owner authorization.');
    const execution = jarvisSecurity.requireActionExecutionParams({
      actionId,
      idempotencyKey: idempotencyKey || req.headers['x-jarvis-idempotency-key'],
    });
    if (!execution.ok) return jarvisSecurity.block(res, 400, execution.errorCode, 'Gmail execution requires actionId and idempotencyKey.');
  }

  // 단일 발송 또는 다중 발송
  const targets = recipients && Array.isArray(recipients)
    ? recipients
    : to ? [{ email: to, name: '', subject: subject || '', body: html || body || '' }]
    : [];

  if (targets.length === 0) {
    return res.status(400).json({ error: 'to 또는 recipients 필드가 필요합니다.' });
  }

  const maskEmail = (value) => String(value || '').replace(/(.{2}).+(@.+)/, '$1***$2');

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
      results.push({ recipientMasked: maskEmail(toEmail), status: 'skipped', reason: '유효하지 않은 이메일' });
      continue;
    }

    if (isDryRun) {
      results.push({ recipientMasked: maskEmail(toEmail), status: 'dry_run_skipped' });
      continue;
    }

    // 보호 조건: 허용된 테스트 수신자만 발송
    if (!ALLOWED_TEST_RECIPIENTS.includes(toEmail)) {
      results.push({
        recipientMasked: maskEmail(toEmail),
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
      results.push({
        recipientMasked: maskEmail(toEmail),
        status: 'sent',
        messageIdHash: crypto.createHash('sha256').update(String(info.messageId || '')).digest('hex').slice(0, 16),
      });
      successCount++;
    } catch (err) {
      console.error('[Gmail] send failed for masked recipient:', String(err.message || err).slice(0, 120));
      results.push({ recipientMasked: maskEmail(toEmail), status: 'failed', reason: String(err.message || err).slice(0, 120) });
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
    dryRun: isDryRun,
  });
};
