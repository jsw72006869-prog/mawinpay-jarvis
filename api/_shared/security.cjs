"use strict";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://mawinpay-jarvis.vercel.app",
  "http://localhost:3002",
  "http://localhost:3000",
];

function getAllowedOrigins() {
  const configured = String(process.env.JARVIS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS;
}

function applyCors(req, res, options = {}) {
  const allowedOrigins = options.allowedOrigins || getAllowedOrigins();
  const origin = String((req && req.headers && req.headers.origin) || "");
  const allowedOrigin = origin && allowedOrigins.includes(origin)
    ? origin
    : allowedOrigins[0];
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", options.methods || "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    options.headers || "Content-Type, Authorization, x-jarvis-owner-token, x-jarvis-idempotency-key"
  );
  if (req && req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }
  return false;
}

function constantTimeEquals(left, right) {
  const crypto = require("crypto");
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function requireOwnerToken(req) {
  const expected = String(process.env.JARVIS_OWNER_TOKEN || "");
  if (!expected) {
    return { ok: false, errorCode: "OWNER_TOKEN_NOT_CONFIGURED" };
  }
  const actual = String((req && req.headers && req.headers["x-jarvis-owner-token"]) || "");
  if (!actual || !constantTimeEquals(actual, expected)) {
    return { ok: false, errorCode: "OWNER_TOKEN_REQUIRED" };
  }
  return { ok: true };
}

function requireActionExecutionParams(params = {}) {
  const actionId = String(params.actionId || "").trim();
  const idempotencyKey = String(params.idempotencyKey || "").trim();
  if (!actionId) return { ok: false, errorCode: "ACTION_ID_REQUIRED_FOR_EXECUTION" };
  if (!idempotencyKey) return { ok: false, errorCode: "IDEMPOTENCY_KEY_REQUIRED_FOR_EXECUTION" };
  return { ok: true };
}

function isDryRun(params = {}) {
  return params.dryRun === true || params.dryRun === "true" || params.countOnly === true || params.countOnly === "true";
}

function block(res, statusCode, errorCode, message) {
  return res.status(statusCode).json({
    success: false,
    blocked: true,
    executeLocked: true,
    errorCode,
    message: message || errorCode,
  });
}

module.exports = {
  applyCors,
  requireOwnerToken,
  requireActionExecutionParams,
  isDryRun,
  block,
};
