var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var cloud_proxy_exports = {};
__export(cloud_proxy_exports, {
  config: () => config,
  default: () => handler
});
module.exports = __toCommonJS(cloud_proxy_exports);
var import_promise = __toESM(require("mysql2/promise"));
var import_crypto = __toESM(require("crypto"));
let _bcrypt = null;
let _HttpsProxyAgent = null;
async function getBcrypt() {
  if (!_bcrypt) {
    const mod = await import("bcryptjs");
    _bcrypt = mod.default || mod;
  }
  return _bcrypt;
}
async function getHttpsProxyAgentClass() {
  if (!_HttpsProxyAgent) {
    const mod = await import("https-proxy-agent");
    _HttpsProxyAgent = mod.HttpsProxyAgent || mod.default;
  }
  return _HttpsProxyAgent;
}
const config = {
  maxDuration: 60,
  runtime: "nodejs"
};
const SMARTSTORE_CLIENT_ID = process.env.SMARTSTORE_CLIENT_ID || "";
const SMARTSTORE_CLIENT_SECRET = process.env.SMARTSTORE_CLIENT_SECRET || "";
const QUOTAGUARD_URL = process.env.QUOTAGUARD_URL || process.env.QUOTAGUARDSTATIC_URL || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "";
const NAVER_API_BASE = "https://api.commerce.naver.com/external";
const KAMIS_API_KEY = process.env.KAMIS_API_KEY || "";
const KAMIS_CERT_ID = process.env.KAMIS_CERT_ID || "";
const ALLOWED_IPS = ["52.5.238.209", "52.6.13.167", "72.252.132.247"];
async function getProxyAgent() {
  if (!QUOTAGUARD_URL) return null;
  const AgentClass = await getHttpsProxyAgentClass();
  return new AgentClass(QUOTAGUARD_URL);
}
function getProxyScheme() {
  if (!QUOTAGUARD_URL) return "none";
  try {
    const url = new URL(QUOTAGUARD_URL);
    return url.protocol;
  } catch {
    return "unknown";
  }
}
function getAgentType() {
  if (!QUOTAGUARD_URL) return "none";
  const scheme = getProxyScheme();
  if (scheme === "http:" || scheme === "https:") return "HttpsProxyAgent";
  if (scheme === "socks5:" || scheme === "socks5h:") return "SocksProxyAgent";
  return "HttpsProxyAgent";
}
async function proxyFetch(url, options = {}) {
  const agent = await getProxyAgent();
  if (!agent) {
    throw new Error("QUOTAGUARD_URL not configured - cannot call Naver API without proxy");
  }
  const { default: nodeFetch } = await import("node-fetch");
  return nodeFetch(url, { ...options, agent });
}
let _cachedToken = null;
async function getSmartStoreToken() {
  if (_cachedToken && Date.now() < _cachedToken.expiresAt) {
    return _cachedToken.token;
  }
  if (!SMARTSTORE_CLIENT_ID || !SMARTSTORE_CLIENT_SECRET) {
    throw new Error("SMARTSTORE credentials not configured");
  }
  const timestamp = String(Date.now());
  const pwd = `${SMARTSTORE_CLIENT_ID}_${timestamp}`;
  const bcryptMod = await getBcrypt();
  const hashed = bcryptMod.hashSync(pwd, SMARTSTORE_CLIENT_SECRET);
  const clientSecretSign = Buffer.from(hashed).toString("base64");
  const params = new URLSearchParams({
    client_id: SMARTSTORE_CLIENT_ID,
    timestamp,
    client_secret_sign: clientSecretSign,
    grant_type: "client_credentials",
    type: "SELF"
  });
  for (let tokenAttempt = 0; tokenAttempt < 3; tokenAttempt++) {
    try {
      const res = await proxyFetch(`${NAVER_API_BASE}/v1/oauth2/token?${params.toString()}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" }
      });
      const rawText = await res.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        if (tokenAttempt < 2) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        throw new Error(`Token JSON parse failed (attempt ${tokenAttempt + 1}): ${rawText.slice(0, 100)}`);
      }
      if (!data.access_token) {
        const errorCode = data.code || data.error || "";
        if (tokenAttempt < 2) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        throw new Error(`Token failed: ${errorCode}`);
      }
      _cachedToken = {
        token: data.access_token,
        expiresAt: Date.now() + 25 * 60 * 1e3
      };
      return data.access_token;
    } catch (err) {
      if (tokenAttempt < 2) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Token failed after 3 attempts");
}
async function smartStoreRequest(path, options = {}) {
  const token = await getSmartStoreToken();
  const url = `${NAVER_API_BASE}${path}`;
  const res = await proxyFetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers || {}
    }
  });
  const data = await res.json();
  return { status: res.status, data };
}
function formatNaverDate(d) {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1e3);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mi = String(kst.getUTCMinutes()).padStart(2, "0");
  const ss = String(kst.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}.000+09:00`;
}
function getStatusKo(status) {
  const map = {
    PAYMENT_WAITING: "\uC785\uAE08\uB300\uAE30",
    PAYED: "\uACB0\uC81C\uC644\uB8CC",
    DELIVERING: "\uBC30\uC1A1\uC911",
    DELIVERED: "\uBC30\uC1A1\uC644\uB8CC",
    PURCHASE_DECIDED: "\uAD6C\uB9E4\uD655\uC815",
    EXCHANGED: "\uAD50\uD658\uC644\uB8CC",
    CANCELED: "\uCDE8\uC18C",
    RETURNED: "\uBC18\uD488",
    CANCELED_BY_NOPAYMENT: "\uBBF8\uACB0\uC81C\uCDE8\uC18C"
  };
  return map[status] || status;
}
const STATUS_LABEL_MAP = {
  PAYED: "\uACB0\uC81C\uC644\uB8CC",
  DELIVERING: "\uBC30\uC1A1\uC911",
  DELIVERED: "\uBC30\uC1A1\uC644\uB8CC",
  PURCHASE_DECIDED: "\uAD6C\uB9E4\uD655\uC815",
  CANCELED: "\uCDE8\uC18C",
  RETURNED: "\uBC18\uD488",
  EXCHANGED: "\uAD50\uD658\uC644\uB8CC",
  PAYMENT_WAITING: "\uC785\uAE08\uB300\uAE30",
  CANCELED_BY_NOPAYMENT: "\uBBF8\uACB0\uC81C\uCDE8\uC18C"
};
function safeOrderMap(item) {
  const po = item.productOrder || item;
  const rawDate = po.paymentDate || po.orderDate || null;
  const rawAmount = po.totalPaymentAmount ?? po.unitPrice ?? null;
  return {
    productOrderId: po.productOrderId ? po.productOrderId.slice(0, 8) + "***" : "N/A",
    orderDate: rawDate || null,
    productName: po.productName || "\uC0C1\uD488\uBA85 \uC5C6\uC74C",
    quantity: Number(po.quantity) || 1,
    totalAmount: rawAmount !== null ? Number(rawAmount) : null,
    statusCode: po.productOrderStatus || "UNKNOWN",
    statusLabel: STATUS_LABEL_MAP[po.productOrderStatus] || po.productOrderStatus || "\uD655\uC778 \uD544\uC694",
    optionContent: po.optionContent || "",
    placeOrderStatus: po.placeOrderStatus || ""
  };
}
async function getLastChangedItems(lastChangedType, days, useKST = false, batchSize = 3) {
  const now = /* @__PURE__ */ new Date();
  const allItems = [];
  const BATCH_SIZE = batchSize;
  let _lcsStats = { success: 0, fail: 0 };
  const dayRanges = [];
  for (let d = 0; d < days; d++) {
    let from, to;
    if (useKST) {
      const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1e3);
      const kstToday = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()));
      to = new Date(kstToday.getTime() - d * 24 * 60 * 60 * 1e3 - 9 * 60 * 60 * 1e3 + 24 * 60 * 60 * 1e3);
      from = new Date(kstToday.getTime() - (d + 1) * 24 * 60 * 60 * 1e3 - 9 * 60 * 60 * 1e3 + 24 * 60 * 60 * 1e3);
    } else {
      to = new Date(now.getTime() - d * 24 * 60 * 60 * 1e3);
      from = new Date(now.getTime() - (d + 1) * 24 * 60 * 60 * 1e3);
    }
    dayRanges.push({ from, to });
  }
  async function fetchOneDayLastChanged(from, to) {
    const fromStr = from.toISOString().replace(/\.\d{3}Z$/, ".000Z");
    const toStr = to.toISOString().replace(/\.\d{3}Z$/, ".000Z");
    const params = new URLSearchParams({
      lastChangedFrom: fromStr,
      lastChangedTo: toStr,
      lastChangedType
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await smartStoreRequest(
          `/v1/pay-order/seller/product-orders/last-changed-statuses?${params.toString()}`,
          { method: "GET" }
        );
        if (result.status === 200) {
          const data = result.data?.data || result.data;
          const items = data?.lastChangeStatuses || data?.lastChangedStatuses || [];
          const dayItems = [...items];
          if (data?.more) {
            let lastDate = items[items.length - 1]?.lastChangedDate || "";
            let hasMore = true;
            while (hasMore) {
              const nextParams = new URLSearchParams({
                lastChangedFrom: lastDate,
                lastChangedTo: toStr,
                lastChangedType
              });
              const nr = await smartStoreRequest(
                `/v1/pay-order/seller/product-orders/last-changed-statuses?${nextParams.toString()}`,
                { method: "GET" }
              );
              if (nr.status === 200) {
                const nd = nr.data?.data || nr.data;
                const ni = nd?.lastChangeStatuses || nd?.lastChangedStatuses || [];
                dayItems.push(...ni);
                hasMore = nd?.more || false;
                if (ni.length > 0) lastDate = ni[ni.length - 1]?.lastChangedDate || "";
                else hasMore = false;
              } else hasMore = false;
            }
          }
          _lcsStats.success++;
          return dayItems;
        }
      } catch (err) {
        if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    _lcsStats.fail++;
    return [];
  }
  for (let b = 0; b < dayRanges.length; b += BATCH_SIZE) {
    const batch = dayRanges.slice(b, b + BATCH_SIZE);
    const results = await Promise.all(batch.map(({ from, to }) => fetchOneDayLastChanged(from, to)));
    for (const items of results) allItems.push(...items);
  }
  console.log(`[getLastChangedItems] type=${lastChangedType} days=${days} => ${allItems.length}\uAC74 (success=${_lcsStats.success} fail=${_lcsStats.fail})`);
  return allItems;
}
let _ssPayedCache = null;
const SS_PAYED_CACHE_TTL = 3 * 60 * 1e3;
let _ssDeepCache = null;
const SS_DEEP_CACHE_TTL = 30 * 60 * 1e3;
let _ssCountsCache = null;
const SS_CACHE_TTL = 3 * 60 * 1e3;
async function getPayedOrdersFast(queryDays = 30, forceRefresh = false) {
  if (!forceRefresh && _ssPayedCache && Date.now() - _ssPayedCache.fetchedAt < SS_PAYED_CACHE_TTL) {
    return { ..._ssPayedCache.data, isCached: true, cacheAgeMs: Date.now() - _ssPayedCache.fetchedAt };
  }
  const PAYED_RANGE = 30;
  const payedItems = await getLastChangedItems("PAYED", PAYED_RANGE);
  const idSet = /* @__PURE__ */ new Set();
  for (const item of payedItems) {
    if (item.productOrderId) idSet.add(item.productOrderId);
  }
  const uniqueIds = [...idSet];
  console.log(`[getPayedOrdersFast] last-changed PAYED ${PAYED_RANGE}d: ${payedItems.length}\uAC74 \u2192 unique ${uniqueIds.length}\uAC74`);
  let payedOrders = [];
  if (uniqueIds.length > 0) {
    for (let i = 0; i < uniqueIds.length; i += 300) {
      const idBatch = uniqueIds.slice(i, i + 300);
      try {
        const detailResult = await smartStoreRequest(
          "/v1/pay-order/seller/product-orders/query",
          { method: "POST", body: JSON.stringify({ productOrderIds: idBatch }) }
        );
        if (detailResult.status === 200) {
          const detailData = detailResult.data.data || detailResult.data;
          if (Array.isArray(detailData)) {
            for (const item of detailData) {
              const po = item.productOrder || item;
              if (po.productOrderStatus === "PAYED") {
                payedOrders.push(item);
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[cloud-proxy] PAYED \uC0C1\uC138 \uC870\uD68C \uC2E4\uD328:`, err.message);
      }
    }
  }
  console.log(`[getPayedOrdersFast] \uD604\uC7AC PAYED \uC0C1\uD0DC: ${payedOrders.length}\uAC74`);
  const newOrders = payedOrders.filter((o) => {
    const po = o.productOrder || o;
    return po.placeOrderStatus !== "OK";
  });
  const pendingShipping = payedOrders.filter((o) => {
    const po = o.productOrder || o;
    return po.placeOrderStatus === "OK";
  });
  const result = {
    allOrders: payedOrders,
    payed: payedOrders,
    newOrders,
    pendingShipping,
    newOrdersCount: newOrders.length,
    pendingShippingCount: pendingShipping.length,
    preShipTotal: payedOrders.length,
    payedRangeDays: PAYED_RANGE,
    isCached: false,
    cacheAgeMs: 0,
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  _ssPayedCache = { data: result, fetchedAt: Date.now() };
  return result;
}
async function runDeepSync(rangeDays = 90) {
  const days = Math.min(rangeDays, 60);
  const dispatchedItems = await getLastChangedItems("DISPATCHED", days, false, 7);
  const decidedItems = await getLastChangedItems("PURCHASE_DECIDED", days, false, 7);
  const allIds = /* @__PURE__ */ new Set();
  for (const item of dispatchedItems) {
    if (item.productOrderId) allIds.add(item.productOrderId);
  }
  for (const item of decidedItems) {
    if (item.productOrderId) allIds.add(item.productOrderId);
  }
  const uniqueIds = [...allIds];
  console.log(`[runDeepSync] DISPATCHED=${dispatchedItems.length} DECIDED=${decidedItems.length} uniqueIds=${uniqueIds.length}`);
  let shipping = 0, delivered = 0, purchaseConfirmed = 0;
  if (uniqueIds.length > 0) {
    for (let i = 0; i < uniqueIds.length; i += 300) {
      const batch = uniqueIds.slice(i, i + 300);
      try {
        const detailResult = await smartStoreRequest(
          "/v1/pay-order/seller/product-orders/query",
          { method: "POST", body: JSON.stringify({ productOrderIds: batch }) }
        );
        if (detailResult.status === 200) {
          const detailData = detailResult.data.data || detailResult.data;
          if (Array.isArray(detailData)) {
            for (const item of detailData) {
              const po = item.productOrder || item;
              const status = po.productOrderStatus;
              if (status === "DELIVERING") shipping++;
              else if (status === "DELIVERED") delivered++;
              else if (status === "PURCHASE_DECIDED") purchaseConfirmed++;
            }
          }
        }
      } catch (err) {
        console.warn(`[runDeepSync] \uC0C1\uC138 \uC870\uD68C \uC2E4\uD328:`, err.message);
      }
    }
  }
  const deepResult = {
    shipping,
    delivered,
    purchaseConfirmed,
    syncedAt: Date.now(),
    syncRangeDays: days
    // _debug 필드는 프로덕션에서 제거됨
  };
  _ssDeepCache = deepResult;
  return deepResult;
}
async function fetchOrderIds(statuses, days) {
  const now = /* @__PURE__ */ new Date();
  const startDate = /* @__PURE__ */ new Date();
  startDate.setDate(startDate.getDate() - days);
  const dayRequests = [];
  for (let i = 0; i < days; i++) {
    const dayFrom = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1e3);
    const dayTo = new Date(dayFrom.getTime() + 24 * 60 * 60 * 1e3);
    if (dayFrom >= now) break;
    if (dayTo > now) dayTo.setTime(now.getTime());
    dayRequests.push({ from: dayFrom, to: dayTo });
  }
  let allIds = [];
  let _fetchDayStats = { success: 0, fail: 0, lastError: "" };
  async function fetchDayIds(from, to) {
    const params = new URLSearchParams();
    params.append("from", formatNaverDate(from));
    params.append("to", formatNaverDate(to));
    params.append("rangeType", "PAYED_DATETIME");
    params.append("pageSize", "300");
    params.append("page", "1");
    statuses.forEach((s) => params.append("productOrderStatuses", s));
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await smartStoreRequest(
          `/v1/pay-order/seller/product-orders?${params.toString()}`,
          { method: "GET" }
        );
        if (result.status === 200) {
          const responseData = result.data.data || result.data;
          const contents = responseData.contents || responseData || [];
          if (Array.isArray(contents)) {
            _fetchDayStats.success++;
            return contents.map((item) => {
              const po = item.productOrder || item;
              return po.productOrderId || null;
            }).filter(Boolean);
          }
          _fetchDayStats.success++;
          return [];
        }
        _fetchDayStats.lastError = `HTTP ${result.status}: ${JSON.stringify(result.data).slice(0, 100)}`;
        if (attempt < 1) await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        _fetchDayStats.lastError = err.message;
        if (attempt < 1) await new Promise((r) => setTimeout(r, 500));
      }
    }
    _fetchDayStats.fail++;
    return [];
  }
  const BATCH_SIZE = 10;
  for (let b = 0; b < dayRequests.length; b += BATCH_SIZE) {
    const batch = dayRequests.slice(b, b + BATCH_SIZE);
    const results = await Promise.all(batch.map(({ from, to }) => fetchDayIds(from, to)));
    for (const ids of results) allIds.push(...ids);
  }
  const uniqueIds = [...new Set(allIds)];
  console.log(`[fetchOrderIds] statuses=${statuses.join(",")} days=${days} => ${uniqueIds.length}\uAC74 (success=${_fetchDayStats.success} fail=${_fetchDayStats.fail} lastErr=${_fetchDayStats.lastError})`);
  return { ids: uniqueIds, stats: _fetchDayStats };
}
async function getSmartstoreStatusCounts(queryDays = 30) {
  if (_ssCountsCache && _ssCountsCache.queryDays === queryDays && Date.now() - _ssCountsCache.fetchedAt < SS_CACHE_TTL) {
    return _ssCountsCache.data;
  }
  const payedData = await getPayedOrdersFast(30);
  const deep = _ssDeepCache;
  const result = {
    allOrders: payedData.payed,
    payed: payedData.payed,
    newOrders: payedData.newOrders,
    pendingShipping: payedData.pendingShipping,
    shipping: deep?.shipping ?? null,
    delivered: deep?.delivered ?? null,
    purchaseConfirmed: deep?.purchaseConfirmed ?? null,
    settlementExpectationAmount: 0,
    dashboardSnapshot: {
      newOrders: payedData.newOrdersCount,
      pendingShipping: payedData.pendingShippingCount,
      shipping: deep?.shipping ?? null,
      delivered: deep?.delivered ?? null,
      purchaseConfirmed: deep?.purchaseConfirmed ?? null,
      source: "naver-api-product-orders",
      isRangeLimited: true,
      rangeLimitNote: `\uC2E0\uADDC\uC8FC\uBB38/\uBC30\uC1A1\uC900\uBE44: \uCD5C\uADFC ${payedData.payedRangeDays}\uC77C \uACB0\uC81C \uAE30\uC900 \uC2E4\uC2DC\uAC04. \uBC30\uC1A1\uC911/\uBC30\uC1A1\uC644\uB8CC/\uAD6C\uB9E4\uD655\uC815: ${deep ? `\uB9C8\uC9C0\uB9C9 \uB3D9\uAE30\uD654 \uAE30\uC900 (${new Date(deep.syncedAt).toLocaleString("ko-KR")})` : "\uB3D9\uAE30\uD654 \uD544\uC694 \u2014 \uC815\uBC00 \uB3D9\uAE30\uD654\uB97C \uC2E4\uD589\uD574\uC8FC\uC138\uC694."}`
    },
    detailSync: {
      newOrdersWithId: payedData.newOrders.filter((o) => {
        const po = o.productOrder || o;
        return !!po.productOrderId;
      }).length,
      pendingShippingWithId: payedData.pendingShipping.filter((o) => {
        const po = o.productOrder || o;
        return !!po.productOrderId;
      }).length,
      shippingWithId: deep?.shipping ?? null,
      deliveredWithId: deep?.delivered ?? null,
      decidedWithId: deep?.purchaseConfirmed ?? null,
      detailStatus: deep ? "cached" : "missing",
      deepCacheAge: deep ? Math.round((Date.now() - deep.syncedAt) / 6e4) + "\uBD84 \uC804" : null
    },
    countSource: {
      newOrders: `PAYED+placeOrderStatus!=OK/${payedData.payedRangeDays}d (\uC2E4\uC2DC\uAC04)`,
      pendingShipping: `PAYED+placeOrderStatus=OK/${payedData.payedRangeDays}d (\uC2E4\uC2DC\uAC04)`,
      shipping: deep ? `DELIVERING/${deep.syncRangeDays}d (\uCE90\uC2DC)` : "missing",
      delivered: deep ? `DELIVERED/${deep.syncRangeDays}d (\uCE90\uC2DC)` : "missing",
      purchaseConfirmed: deep ? `PURCHASE_DECIDED/${deep.syncRangeDays}d (\uCE90\uC2DC)` : "missing"
    }
  };
  _ssCountsCache = { data: result, fetchedAt: Date.now(), queryDays };
  return result;
}
async function handleSmartstoreOrders(params) {
  const action = params?.action || "current_new_orders";
  const days = parseInt(params?.days || "7");
  const status = params?.status || "payed";
  const fetchedAt = (/* @__PURE__ */ new Date()).toISOString();
  const HANDLER_TIMEOUT_MS = action === "deep_sync" ? 55e3 : action === "query_order_status" ? 45e3 : 9e3;
  let handlerTimedOut = false;
  const handlerTimeoutId = setTimeout(() => {
    handlerTimedOut = true;
  }, HANDLER_TIMEOUT_MS);
  const checkTimeout = () => {
    if (handlerTimedOut) {
      throw Object.assign(new Error("SMARTSTORE_TIMEOUT"), { code: "SMARTSTORE_TIMEOUT" });
    }
  };
  if (action === "debug_last_changed") {
    if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
      clearTimeout(handlerTimeoutId);
      return { success: false, error: "DEBUG_DISABLED", message: "\uB514\uBC84\uADF8 \uC5D4\uB4DC\uD3EC\uC778\uD2B8\uB294 \uD504\uB85C\uB355\uC158\uC5D0\uC11C \uBE44\uD65C\uC131\uD654\uB429\uB2C8\uB2E4." };
    }
    const now = /* @__PURE__ */ new Date();
    const from24h = new Date(now.getTime() - 24 * 60 * 60 * 1e3);
    const fromUtc24 = from24h.toISOString().replace(/\.\d{3}Z$/, ".000Z");
    const toUtc = now.toISOString().replace(/\.\d{3}Z$/, ".000Z");
    const results = {};
    for (const changedType of ["PURCHASE_DECIDED", "DISPATCHED", "PAYED", "DELIVERED", "CLAIM_COMPLETED", "SHIPPING"]) {
      const params2 = new URLSearchParams({
        lastChangedFrom: fromUtc24,
        lastChangedTo: toUtc,
        lastChangedType: changedType
      });
      try {
        const r = await smartStoreRequest(
          `/v1/pay-order/seller/product-orders/last-changed-statuses?${params2.toString()}`,
          { method: "GET" }
        );
        const data = r.data?.data || r.data;
        const items = data?.lastChangeStatuses || data?.lastChangedStatuses || [];
        results[`productOrders_${changedType}_24h`] = {
          httpStatus: r.status,
          errorCode: r.data?.code,
          errorMessage: r.data?.message,
          itemCount: items.length,
          more: data?.more || false,
          sampleKeys: Object.keys(items[0] || {})
        };
      } catch (err) {
        results[`productOrders_${changedType}_24h`] = { error: err.message };
      }
    }
    for (const orderStatus of ["PAYED", "DELIVERING", "DELIVERED", "PURCHASE_DECIDED"]) {
      const params2 = new URLSearchParams({
        lastChangedFrom: fromUtc24,
        lastChangedTo: toUtc,
        orderStatuses: orderStatus,
        page: "1",
        pageSize: "1"
      });
      try {
        const r = await smartStoreRequest(
          `/v1/pay-order/seller/orders/last-changed-statuses?${params2.toString()}`,
          { method: "GET" }
        );
        const data = r.data?.data || r.data;
        results[`orders_${orderStatus}_24h`] = {
          httpStatus: r.status,
          errorCode: r.data?.code,
          errorMessage: r.data?.message,
          totalCount: data?.totalCount || r.data?.totalCount,
          itemCount: (data?.lastChangeStatuses || []).length
        };
      } catch (err) {
        results[`orders_${orderStatus}_24h`] = { error: err.message };
      }
    }
    for (const status2 of ["DELIVERING", "DELIVERED", "PURCHASE_DECIDED"]) {
      const params2 = new URLSearchParams({
        productOrderStatuses: status2,
        from: fromUtc24,
        to: toUtc,
        rangeType: "PAYED_DATETIME"
      });
      try {
        const r = await smartStoreRequest(
          `/v1/pay-order/seller/product-orders?${params2.toString()}`,
          { method: "GET" }
        );
        const data = r.data?.data || r.data;
        results[`getProductOrders_${status2}_24h`] = {
          httpStatus: r.status,
          errorCode: r.data?.code,
          errorMessage: r.data?.message,
          itemCount: Array.isArray(data) ? data.length : (data?.contents || []).length
        };
      } catch (err) {
        results[`getProductOrders_${status2}_24h`] = { error: err.message };
      }
    }
    const payedFrom = new Date(now.getTime() - 24 * 60 * 60 * 1e3);
    const payedParams = new URLSearchParams({
      from: formatNaverDate(payedFrom),
      to: formatNaverDate(now),
      rangeType: "PAYED_DATETIME",
      pageSize: "300",
      page: "1",
      productOrderStatuses: "PAYED"
    });
    try {
      const r = await smartStoreRequest(
        `/v1/pay-order/seller/product-orders?${payedParams.toString()}`,
        { method: "GET" }
      );
      const data = r.data?.data || r.data;
      const contents = data?.contents || data || [];
      results["PAYED_direct_7d"] = {
        httpStatus: r.status,
        errorCode: r.data?.code,
        errorMessage: r.data?.message,
        itemCount: Array.isArray(contents) ? contents.length : "not_array",
        dataKeys: Object.keys(data || {}),
        contentsType: typeof contents,
        rawDataSample: JSON.stringify(data).substring(0, 500)
      };
    } catch (err) {
      results["PAYED_direct_7d"] = { error: err.message };
    }
    try {
      const payedIds7Result = await fetchOrderIds(["PAYED"], 7);
      const payedIds7 = payedIds7Result.ids;
      results["fetchOrderIds_PAYED_7d"] = {
        count: payedIds7.length,
        ids: payedIds7.slice(0, 5)
      };
    } catch (err) {
      results["fetchOrderIds_PAYED_7d"] = { error: err.message };
    }
    try {
      const payedIds30Result = await fetchOrderIds(["PAYED"], 30);
      const payedIds30 = payedIds30Result.ids;
      results["fetchOrderIds_PAYED_30d"] = {
        count: payedIds30.length,
        ids: payedIds30.slice(0, 5)
      };
    } catch (err) {
      results["fetchOrderIds_PAYED_30d"] = { error: err.message };
    }
    try {
      const delIdsResult = await fetchOrderIds(["DELIVERING"], 90);
      const delIds = delIdsResult.ids;
      results["fetchOrderIds_DELIVERING_90d"] = {
        count: delIds.length,
        ids: delIds.slice(0, 5)
      };
    } catch (err) {
      results["fetchOrderIds_DELIVERING_90d"] = { error: err.message };
    }
    return { success: true, debug: results, from: fromUtc24, to: toUtc };
  }
  if (action === "current_new_orders" || action === "query_pending_shipping" || action === "query_pre_shipping_total") {
    const counts = await getSmartstoreStatusCounts(30);
    const response = {
      success: true,
      source: "naver-commerce-api",
      fetchedAt,
      cacheAgeMs: 0,
      isCached: false,
      counts: {
        newOrders: counts.newOrders.length,
        pendingShipping: counts.pendingShipping.length,
        preShipTotal: counts.payed.length,
        shipping: counts.shipping,
        delivered: counts.delivered,
        purchaseConfirmed: counts.purchaseConfirmed,
        settlementExpectationAmount: counts.settlementExpectationAmount || 0
      },
      // 하위호환 필드 (프론트엔드 안전 매핑)
      newOrders: counts.newOrders.length,
      pendingShipping: counts.pendingShipping.length,
      preShipTotal: counts.payed.length,
      shipping: counts.shipping,
      delivered: counts.delivered,
      purchaseConfirmed: counts.purchaseConfirmed,
      orders: counts.payed.map(safeOrderMap)
    };
    if (action === "current_new_orders") {
      response.data = counts.payed.map(safeOrderMap);
    }
    return response;
  }
  if (action === "query_orders_today") {
    const counts = await getSmartstoreStatusCounts(1);
    return {
      success: true,
      source: "naver-commerce-api",
      fetchedAt,
      cacheAgeMs: 0,
      isCached: false,
      counts: {
        newOrders: counts.newOrders.length,
        pendingShipping: counts.pendingShipping.length,
        preShipTotal: counts.payed.length,
        shipping: 0,
        delivered: 0,
        purchaseConfirmed: 0
      },
      newOrders: counts.newOrders.length,
      pendingShipping: counts.pendingShipping.length,
      preShipTotal: counts.payed.length,
      data: counts.payed.map(safeOrderMap),
      orders: counts.payed.map(safeOrderMap)
    };
  }
  if (action === "query_order_status") {
    try {
      checkTimeout();
      const BUDGET_MS = 15e3;
      const budgetStart = Date.now();
      const forceRefresh = params?.forceRefresh === true || params?.forceRefresh === "true";
      const payedData = await getPayedOrdersFast(30, forceRefresh);
      checkTimeout();
      const elapsed = Date.now() - budgetStart;
      const isPartial = elapsed > BUDGET_MS;
      const deep = _ssDeepCache;
      const deepCacheAge = deep ? Math.round((Date.now() - deep.syncedAt) / 6e4) : null;
      const deepIsStale = deep ? Date.now() - deep.syncedAt > SS_DEEP_CACHE_TTL : false;
      clearTimeout(handlerTimeoutId);
      return {
        success: true,
        mode: "fast_snapshot",
        // _debug 필드는 프로덕션에서 제거됨
        source: "naver-commerce-api",
        fetchedAt,
        // 실시간 조회 항목 (PAYED)
        actionable: {
          source: "live",
          isLive: true,
          isCached: payedData.isCached,
          cacheAgeMs: payedData.cacheAgeMs,
          newOrders: payedData.newOrdersCount,
          pendingShipping: payedData.pendingShippingCount,
          preShipTotal: payedData.preShipTotal,
          productOrderIdsMatched: payedData.newOrders.filter((o) => {
            const po = o.productOrder || o;
            return !!po.productOrderId;
          }).length + payedData.pendingShipping.filter((o) => {
            const po = o.productOrder || o;
            return !!po.productOrderId;
          }).length,
          rangeDays: payedData.payedRangeDays
        },
        // 캐시 항목 (DELIVERING/DELIVERED/PURCHASE_DECIDED)
        dashboardSnapshot: {
          source: deep ? "cache" : "missing",
          isCached: !!deep,
          lastSyncedAt: deep ? new Date(deep.syncedAt).toISOString() : null,
          cacheAgeMinutes: deepCacheAge,
          isStale: deepIsStale,
          delivering: deep?.shipping ?? null,
          delivered: deep?.delivered ?? null,
          purchaseDecided: deep?.purchaseConfirmed ?? null,
          syncRangeDays: deep?.syncRangeDays ?? null
        },
        // 동기화 상태
        syncStatus: {
          status: isPartial ? "partial" : deep ? deepIsStale ? "stale" : "fresh" : "missing",
          message: isPartial ? `\uC751\uB2F5 \uC2DC\uAC04 \uCD08\uACFC (${Math.round(elapsed / 1e3)}\uCD08). \uBD80\uBD84 \uACB0\uACFC\uC785\uB2C8\uB2E4.` : deep ? deepIsStale ? `\uB9C8\uC9C0\uB9C9 \uB3D9\uAE30\uD654 ${deepCacheAge}\uBD84 \uC804. \uC815\uBC00 \uB3D9\uAE30\uD654\uB97C \uC2E4\uD589\uD574\uC8FC\uC138\uC694.` : `\uBC30\uC1A1\uC911/\uBC30\uC1A1\uC644\uB8CC/\uAD6C\uB9E4\uD655\uC815: \uB9C8\uC9C0\uB9C9 \uB3D9\uAE30\uD654 ${deepCacheAge}\uBD84 \uC804 \uAE30\uC900.` : "\uBC30\uC1A1\uC911/\uBC30\uC1A1\uC644\uB8CC/\uAD6C\uB9E4\uD655\uC815 \uB3D9\uAE30\uD654 \uD544\uC694 \u2014 \uC815\uBC00 \uB3D9\uAE30\uD654\uB97C \uC2E4\uD589\uD574\uC8FC\uC138\uC694."
        },
        // 하위호환 top-level 필드 (프론트엔드 안전 매핑)
        newOrders: payedData.newOrdersCount,
        pendingShipping: payedData.pendingShippingCount,
        preShipTotal: payedData.preShipTotal,
        shipping: deep?.shipping ?? null,
        delivered: deep?.delivered ?? null,
        purchaseConfirmed: deep?.purchaseConfirmed ?? null,
        counts: {
          newOrders: payedData.newOrdersCount,
          pendingShipping: payedData.pendingShippingCount,
          preShipTotal: payedData.preShipTotal,
          shipping: deep?.shipping ?? null,
          delivered: deep?.delivered ?? null,
          purchaseConfirmed: deep?.purchaseConfirmed ?? null
        },
        data: payedData.allOrders.map(safeOrderMap),
        orders: payedData.allOrders.map(safeOrderMap)
      };
    } catch (err) {
      clearTimeout(handlerTimeoutId);
      const code = err?.code || (err?.message?.includes("401") ? "SMARTSTORE_AUTH_ERROR" : err?.message?.includes("TIMEOUT") ? "SMARTSTORE_TIMEOUT" : "SMARTSTORE_API_ERROR");
      const isTimeout = code === "SMARTSTORE_TIMEOUT";
      return {
        success: false,
        errorCode: code,
        errorMessage: isTimeout ? "\uC2A4\uB9C8\uD2B8\uC2A4\uD1A0\uC5B4 API \uC751\uB2F5 \uC2DC\uAC04 \uCD08\uACFC. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." : code === "SMARTSTORE_AUTH_ERROR" ? "\uC2A4\uB9C8\uD2B8\uC2A4\uD1A0\uC5B4 API \uC778\uC99D \uC624\uB958. \uD1A0\uD070\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694." : `\uC2A4\uB9C8\uD2B8\uC2A4\uD1A0\uC5B4 API \uC624\uB958: ${err?.message || "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958"}`,
        fetchedAt,
        source: "naver-commerce-api",
        mode: "fast_snapshot",
        counts: { newOrders: 0, pendingShipping: 0, preShipTotal: 0, shipping: null, delivered: null, purchaseConfirmed: null },
        newOrders: 0,
        pendingShipping: 0,
        preShipTotal: 0,
        shipping: null,
        delivered: null,
        purchaseConfirmed: null,
        data: [],
        orders: []
      };
    }
  }
  if (action === "deep_sync") {
    try {
      checkTimeout();
      const rangeDays = Number(params?.rangeDays) || 90;
      const deepResult = await runDeepSync(rangeDays);
      clearTimeout(handlerTimeoutId);
      return {
        success: true,
        mode: "deep_sync",
        source: "naver-commerce-api",
        fetchedAt,
        result: {
          shipping: deepResult.shipping,
          delivered: deepResult.delivered,
          purchaseConfirmed: deepResult.purchaseConfirmed,
          syncedAt: new Date(deepResult.syncedAt).toISOString(),
          syncRangeDays: deepResult.syncRangeDays
        },
        message: `\uC815\uBC00 \uB3D9\uAE30\uD654 \uC644\uB8CC. \uBC30\uC1A1\uC911 ${deepResult.shipping}\uAC74 / \uBC30\uC1A1\uC644\uB8CC ${deepResult.delivered}\uAC74 / \uAD6C\uB9E4\uD655\uC815 ${deepResult.purchaseConfirmed}\uAC74`
      };
    } catch (err) {
      clearTimeout(handlerTimeoutId);
      const code = err?.code || (err?.message?.includes("401") ? "SMARTSTORE_AUTH_ERROR" : err?.message?.includes("TIMEOUT") ? "SMARTSTORE_TIMEOUT" : "SMARTSTORE_API_ERROR");
      return {
        success: false,
        errorCode: code,
        errorMessage: `\uC815\uBC00 \uB3D9\uAE30\uD654 \uC2E4\uD328: ${err?.message || "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958"}`,
        fetchedAt,
        source: "naver-commerce-api",
        mode: "deep_sync"
      };
    }
  }
  try {
    checkTimeout();
    const statusMap = {
      "new": ["PAYED"],
      "payed": ["PAYED"],
      "delivering": ["DELIVERING"],
      "delivered": ["DELIVERED"],
      "decided": ["PURCHASE_DECIDED"],
      "canceled": ["CANCELED"],
      "all": ["PAYMENT_WAITING", "PAYED", "DELIVERING", "DELIVERED", "PURCHASE_DECIDED"]
    };
    const productOrderStatuses = statusMap[status?.toLowerCase()] || ["PAYED"];
    const orders = await fetchOrders(productOrderStatuses, days);
    clearTimeout(handlerTimeoutId);
    return {
      success: true,
      source: "naver-commerce-api",
      fetchedAt,
      cacheAgeMs: 0,
      isCached: false,
      counts: {
        newOrders: 0,
        pendingShipping: 0,
        preShipTotal: 0,
        shipping: 0,
        delivered: 0,
        purchaseConfirmed: 0
      },
      total: orders.length,
      newOrders: 0,
      pendingShipping: 0,
      preShipTotal: 0,
      orders: orders.map(safeOrderMap),
      data: orders.map(safeOrderMap),
      queryInfo: { statuses: productOrderStatuses, days }
    };
  } catch (err) {
    clearTimeout(handlerTimeoutId);
    const code = err?.code || (err?.message?.includes("401") ? "SMARTSTORE_AUTH_ERROR" : err?.message?.includes("TIMEOUT") ? "SMARTSTORE_TIMEOUT" : "SMARTSTORE_API_ERROR");
    return {
      success: false,
      errorCode: code,
      errorMessage: code === "SMARTSTORE_TIMEOUT" ? "\uC2A4\uB9C8\uD2B8\uC2A4\uD1A0\uC5B4 API \uC751\uB2F5 \uC2DC\uAC04 \uCD08\uACFC (9\uCD08). \uC77C\uC218 \uBC94\uC704\uB97C \uC904\uC774\uAC70\uB098 \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." : code === "SMARTSTORE_AUTH_ERROR" ? "\uC2A4\uB9C8\uD2B8\uC2A4\uD1A0\uC5B4 API \uC778\uC99D \uC624\uB958. \uD1A0\uD070\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694." : `\uC2A4\uB9C8\uD2B8\uC2A4\uD1A0\uC5B4 API \uC624\uB958: ${err?.message || "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958"}`,
      fetchedAt,
      source: "naver-commerce-api",
      counts: { newOrders: 0, pendingShipping: 0, preShipTotal: 0, shipping: 0, delivered: 0, purchaseConfirmed: 0 },
      newOrders: 0,
      pendingShipping: 0,
      preShipTotal: 0,
      shipping: 0,
      delivered: 0,
      purchaseConfirmed: 0,
      total: 0,
      data: [],
      orders: []
    };
  }
}
async function fetchOrders(statuses, days) {
  const now = /* @__PURE__ */ new Date();
  const startDate = /* @__PURE__ */ new Date();
  startDate.setDate(startDate.getDate() - days);
  const dayRequests = [];
  for (let i = 0; i < days; i++) {
    const dayFrom = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1e3);
    const dayTo = new Date(dayFrom.getTime() + 24 * 60 * 60 * 1e3);
    if (dayFrom >= now) break;
    if (dayTo > now) dayTo.setTime(now.getTime());
    dayRequests.push({ from: dayFrom, to: dayTo });
  }
  let allProductOrderIds = [];
  async function fetchDayWithRetry(from, to, maxRetries = 2) {
    const params = new URLSearchParams();
    params.append("from", formatNaverDate(from));
    params.append("to", formatNaverDate(to));
    params.append("rangeType", "PAYED_DATETIME");
    params.append("pageSize", "300");
    params.append("page", "1");
    statuses.forEach((s) => params.append("productOrderStatuses", s));
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await smartStoreRequest(
          `/v1/pay-order/seller/product-orders?${params.toString()}`,
          { method: "GET" }
        );
        if (result.status === 200) {
          const responseData = result.data.data || result.data;
          const contents = responseData.contents || responseData || [];
          if (Array.isArray(contents)) {
            return contents.map((item) => {
              const po = item.productOrder || item;
              return po.productOrderId || null;
            }).filter(Boolean);
          }
          return [];
        }
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
      } catch (err) {
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        } else {
          console.warn(`[cloud-proxy] \uC8FC\uBB38 \uBAA9\uB85D \uC870\uD68C \uC2E4\uD328 (${maxRetries + 1}\uD68C \uC2DC\uB3C4):`, err.message);
        }
      }
    }
    return [];
  }
  const BATCH_SIZE = 5;
  for (let b = 0; b < dayRequests.length; b += BATCH_SIZE) {
    const batch = dayRequests.slice(b, b + BATCH_SIZE);
    const results = await Promise.all(batch.map(({ from, to }) => fetchDayWithRetry(from, to)));
    for (const ids of results) allProductOrderIds.push(...ids);
  }
  allProductOrderIds = [...new Set(allProductOrderIds)];
  if (allProductOrderIds.length === 0) return [];
  let allDetailOrders = [];
  for (let i = 0; i < allProductOrderIds.length; i += 300) {
    const idBatch = allProductOrderIds.slice(i, i + 300);
    try {
      const detailResult = await smartStoreRequest(
        "/v1/pay-order/seller/product-orders/query",
        { method: "POST", body: JSON.stringify({ productOrderIds: idBatch }) }
      );
      if (detailResult.status === 200) {
        const detailData = detailResult.data.data || detailResult.data;
        if (Array.isArray(detailData)) allDetailOrders = allDetailOrders.concat(detailData);
      }
    } catch (err) {
      console.warn(`[cloud-proxy] \uC0C1\uC138 \uC870\uD68C \uC2E4\uD328:`, err.message);
    }
  }
  return allDetailOrders;
}
async function handleDailyBriefing() {
  let rawCounts;
  try {
    rawCounts = await getSmartstoreStatusCounts(30);
  } catch (e) {
    return { success: false, error: `\uC2A4\uB9C8\uD2B8\uC2A4\uD1A0\uC5B4 \uB370\uC774\uD130 \uC218\uC9D1 \uC2E4\uD328: ${e.message}` };
  }
  if (!rawCounts) {
    return { success: false, error: "\uC2A4\uB9C8\uD2B8\uC2A4\uD1A0\uC5B4 \uB370\uC774\uD130\uB97C \uAC00\uC838\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." };
  }
  const counts = {
    newOrders: rawCounts.newOrders.length,
    pendingShipping: rawCounts.pendingShipping.length,
    preShipTotal: rawCounts.payed.length,
    shipping: rawCounts.shipping,
    delivered: rawCounts.delivered,
    purchaseConfirmed: rawCounts.purchaseConfirmed,
    settlementExpectationAmount: rawCounts.settlementExpectationAmount || 0
  };
  const kamisResult = await handleKamisMini({ item: "\uBC30\uCD94" });
  let outreachSummary = { total: 0, contactable: 0, highFit: 0, drafts: 0 };
  try {
    const outreachRes = await handleOutreachList({ limit: 100 });
    if (outreachRes.success && outreachRes.candidates) {
      const list = outreachRes.candidates;
      outreachSummary = {
        total: list.length,
        contactable: list.filter((c) => c.publicContactStatus === "email_public" || c.publicContactStatus === "form_available").length,
        highFit: list.filter((c) => (c.productFitScore || 0) >= 60).length,
        drafts: list.filter((c) => c.firstEmailDraft && c.firstEmailDraft.length > 10).length
      };
    }
  } catch (e) {
  }
  let fileSummary = { total: 0, recent: [] };
  try {
    const workspaceRes = await handleMarketPriceList({ limit: 5 });
    if (workspaceRes.success) {
      fileSummary.total = workspaceRes.total || 0;
      fileSummary.recent = workspaceRes.checks || [];
    }
  } catch (e) {
  }
  const systemHealth = {
    uptime: "READY",
    naverApi: "NORMAL",
    kamisApi: kamisResult.success ? "NORMAL" : "PARTIAL",
    sheets: WORKSPACE_SHEET_ID && GOOGLE_SHEETS_CREDENTIALS ? "NORMAL" : "ERROR",
    executeMode: "LOCKED"
  };
  let jarvisSummary = `\uB300\uD45C\uB2D8, \uC624\uB298\uC740 \uBC30\uC1A1\uC900\uBE44 ${counts.pendingShipping}\uAC74 \uD655\uC778\uC774 \uC6B0\uC120\uC785\uB2C8\uB2E4. `;
  if (counts.shipping > 0) jarvisSummary += `\uBC30\uC1A1\uC911 ${counts.shipping}\uAC74\uC740 \uCD94\uC801 \uC911\uC774\uBA70, `;
  jarvisSummary += `\uAD6C\uB9E4\uD655\uC815 ${counts.purchaseConfirmed}\uAC74\uC740 \uC815\uC0C1 \uBC18\uC601\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`;
  return {
    success: true,
    version: "2.0",
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    jarvisSummary,
    smartstore: {
      counts: {
        newOrders: counts.newOrders,
        pendingShipping: counts.pendingShipping,
        preShipTotal: counts.preShipTotal,
        shipping: counts.shipping,
        delivered: counts.delivered,
        purchaseConfirmed: counts.purchaseConfirmed,
        settlementExpectationAmount: counts.settlementExpectationAmount || 0
      },
      lastChecked: (/* @__PURE__ */ new Date()).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
      source: "Naver Commerce API"
    },
    marketIntel: {
      item: kamisResult.item || "\uBC30\uCD94",
      prices: kamisResult.prices || null,
      direction: kamisResult.direction || "N/A",
      changePercent: kamisResult.changePercent,
      trend: kamisResult.changePercent > 0 ? "up" : kamisResult.changePercent < 0 ? "down" : "stable",
      message: kamisResult.message || "",
      isProxy: kamisResult.isProxy,
      proxyNote: kamisResult.proxyNote
    },
    outreach: outreachSummary,
    workspace: fileSummary,
    systemHealth
  };
}
async function handleCreativeContent(params) {
  const product = params?.product || "\uB18D\uC0B0\uBB3C";
  const customPrompt = params?.prompt && typeof params.prompt === "string" && params.prompt.length > 50 ? params.prompt : null;
  let hookingText = "";
  let threadPost = "";
  let kakaoNotice = "";
  let reelsScript = "";
  let rawGptContent = "";
  if (OPENAI_API_KEY) {
    try {
      const { default: nodeFetchGpt } = await import("node-fetch");
      const messages = customPrompt ? [
        { role: "system", content: "\uB2F9\uC2E0\uC740 \uB18D\uC218\uCD95\uC0B0\uBB3C \uD310\uB9E4 \uC804\uBB38 \uC7A5\uAD00\uAE09 \uCE74\uD53C\uB77C\uC774\uD130\uC785\uB2C8\uB2E4. \uACFC\uC7A5 \uAD11\uACE0, \uD5C8\uC704 \uD6A8\uB2A5, \uB9E4\uCD9C \uBCF4\uC7A5, \uC131\uACF5 \uBCF4\uC7A5 \uD45C\uD604\uC740 \uC808\uB300 \uAE08\uC9C0\uD569\uB2C8\uB2E4." },
        { role: "user", content: customPrompt }
      ] : [
        { role: "system", content: "\uB2F9\uC2E0\uC740 \uB18D\uC0B0\uBB3C/\uC2DD\uD488 \uBC14\uC774\uB7F4 \uB9C8\uCF00\uD305 \uC804\uBB38\uAC00\uC785\uB2C8\uB2E4. \uCE5C\uADFC\uD558\uACE0 \uB9D0\uD558\uB4EF \uD22D \uB358\uC9C0\uB294 \uBB38\uC7A5, \uAC15\uD55C \uCCAB \uBB38\uC7A5, \uACC4\uC808\uAC10, \uC2DD\uAC10, \uC218\uD655 \uD0C0\uC774\uBC0D, \uC2A4\uD1A0\uB9AC, \uB313\uAE00/DM \uC720\uB3C4, \uC5EC\uC6B4 \uC788\uB294 \uB9C8\uBB34\uB9AC\uB97C \uC0AC\uC6A9\uD569\uB2C8\uB2E4. \uACFC\uC7A5 \uAD11\uACE0, \uD5C8\uC704 \uD6A8\uB2A5, \uB9E4\uCD9C \uBCF4\uC7A5 \uD45C\uD604\uC740 \uAE08\uC9C0\uD569\uB2C8\uB2E4." },
        { role: "user", content: `"${product}" \uB9C8\uCF00\uD305 \uCF58\uD150\uCE20\uB97C \uB9CC\uB4E4\uC5B4\uC8FC\uC138\uC694. \uB2E4\uC74C 4\uAC00\uC9C0\uB97C \uAC01\uAC01 \uB9CC\uB4E4\uC5B4\uC8FC\uC138\uC694:
1. \uD6C4\uD0B9 \uBB38\uAD6C (1-2\uC904, \uC2A4\uD06C\uB864 \uBA48\uCD94\uAC8C \uD558\uB294 \uCCAB \uBB38\uC7A5)
2. \uC2A4\uB808\uB4DC \uAE00 (3-5\uC904, \uC790\uC5F0\uC2A4\uB7FD\uACE0 \uACF5\uAC10\uAC00\uB294 \uD1A4)
3. \uCE74\uCE74\uC624\uD1A1 \uACF5\uC9C0\uBB38 (\uACF5\uB3D9\uAD6C\uB9E4/\uD560\uC778 \uC548\uB0B4\uC6A9, 3-4\uC904)
4. \uB9B4\uC2A4 \uC2A4\uD06C\uB9BD\uD2B8 (15\uCD08 \uBD84\uB7C9, \uC7A5\uBA74 \uC124\uBA85 \uD3EC\uD568)

\uAC01 \uD56D\uBAA9\uC744 [\uD6C4\uD0B9], [\uC2A4\uB808\uB4DC], [\uCE74\uCE74\uC624\uD1A1], [\uB9B4\uC2A4] \uD0DC\uADF8\uB85C \uAD6C\uBD84\uD574\uC8FC\uC138\uC694.` }
      ];
      const gptRes = await nodeFetchGpt("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages,
          max_tokens: customPrompt ? 3e3 : 1500,
          temperature: 0.8
        })
      });
      if (gptRes.ok) {
        const gptData = await gptRes.json();
        rawGptContent = gptData.choices?.[0]?.message?.content || "";
        if (customPrompt) {
          hookingText = rawGptContent;
        } else {
          const hookMatch = rawGptContent.match(/\[후킹\]([\s\S]*?)(?=\[스레드\]|\[카카오톡\]|\[릴스\]|$)/);
          const threadMatch = rawGptContent.match(/\[스레드\]([\s\S]*?)(?=\[후킹\]|\[카카오톡\]|\[릴스\]|$)/);
          const kakaoMatch = rawGptContent.match(/\[카카오톡\]([\s\S]*?)(?=\[후킹\]|\[스레드\]|\[릴스\]|$)/);
          const reelsMatch = rawGptContent.match(/\[릴스\]([\s\S]*?)(?=\[후킹\]|\[스레드\]|\[카카오톡\]|$)/);
          hookingText = hookMatch ? hookMatch[1].trim() : rawGptContent.split("\n")[0] || "";
          threadPost = threadMatch ? threadMatch[1].trim() : "";
          kakaoNotice = kakaoMatch ? kakaoMatch[1].trim() : "";
          reelsScript = reelsMatch ? reelsMatch[1].trim() : "";
        }
      }
    } catch (e) {
      console.error("[cloud-proxy] GPT creative error:", e.message);
    }
  }
  if (customPrompt && rawGptContent) {
    return {
      success: true,
      product,
      result: { content: rawGptContent },
      content: rawGptContent
    };
  }
  if (!hookingText) {
    hookingText = `\uC774\uAC70 ${product} \uBA39\uC5B4\uBCF8 \uC0AC\uB78C\uB9CC \uC544\uB294\uB370... \uC9C4\uC9DC \uB2E4\uB985\uB2C8\uB2E4`;
    threadPost = `\uC694\uC998 ${product} \uC2DC\uC98C\uC774\uB77C \uC0B0\uC9C0\uC5D0\uC11C \uC9C1\uC811 \uBC1B\uC544\uBD24\uB294\uB370
\uD55C \uC785 \uBA39\uC790\uB9C8\uC790 "\uC544 \uC774\uAC70\uB2E4" \uC2F6\uC5C8\uC5B4\uC694
\uC62C\uD574\uB294 \uB2F9\uB3C4\uAC00 \uC720\uB09C\uD788 \uB192\uB300\uC694 \u{1F351}`;
    kakaoNotice = `[\uACF5\uB3D9\uAD6C\uB9E4 \uC548\uB0B4]
${product} \uC0B0\uC9C0\uC9C1\uC1A1 \uD55C\uC815 \uC218\uB7C9 \uC624\uD508!
\uC120\uCC29\uC21C \uB9C8\uAC10\uC774\uB2C8 \uC11C\uB450\uB974\uC138\uC694 \u{1F49B}`;
    reelsScript = `[\uC7A5\uBA741] ${product} \uD074\uB85C\uC988\uC5C5 (\uBB3C\uBC29\uC6B8 \uB9FA\uD78C)
[\uC7A5\uBA742] \uD55C \uC785 \uBCA0\uC5B4\uBB34\uB294 \uC21C\uAC04
[\uC790\uB9C9] "\uC774 \uC2DD\uAC10 \uC2E4\uD654...?"
[\uC7A5\uBA743] \uBC15\uC2A4 \uC5B8\uBC15\uC2F1
[\uC790\uB9C9] "\uC0B0\uC9C0\uC5D0\uC11C \uC624\uB298 \uB534 \uAC70\uC608\uC694"`;
  }
  const content = `\u{1F351} ${product} \uB9C8\uCF00\uD305 \uCF58\uD150\uCE20

\u{1F525} \uD6C4\uD0B9 \uBB38\uAD6C
${hookingText}

\u{1F4F1} \uC2A4\uB808\uB4DC \uAE00
${threadPost}

\u{1F4AC} \uCE74\uCE74\uC624\uD1A1 \uACF5\uC9C0\uBB38
${kakaoNotice}

\u{1F3AC} \uB9B4\uC2A4 \uC2A4\uD06C\uB9BD\uD2B8
${reelsScript}`;
  return {
    success: true,
    product,
    hookingText,
    threadPost,
    kakaoNotice,
    reelsScript,
    content
  };
}
function calcRelevanceScore(title, description, product) {
  let score = 0;
  const t = title.toLowerCase();
  const d = (description || "").toLowerCase();
  const p = product.toLowerCase();
  if (t.includes(p)) score += 40;
  if (d.includes(p)) score += 10;
  if (/\uc218\ud655|\uc81c\ucca0|\ubcf4\uad00|\uace0\ub974\ub294\ubc95|\uba39\ubc29|\ub18d\uc7a5|\uc0b0\uc9c0|\ud6c4\uc219/.test(t)) score += 20;
  if (/\uc218\ud655|\uc81c\ucca0|\ubcf4\uad00|\uace0\ub974\ub294\ubc95|\uba39\ubc29|\ub18d\uc7a5|\uc0b0\uc9c0|\ud6c4\uc219/.test(d)) score += 5;
  if (/\uc2dd\ud488|\uc2dd\uc7ac|\ub18d\uc0b0\ubb3c|\uc2e0\uc120|\uc81c\ucca0|\uad6c\ub9e4|\uc8fc\ubb38|\ub9db|\ub9b9|\ub2ec\ucf64|\uace0\uc18c\ud55c|\uc544\uc0ad|\ud5a5/.test(t)) score += 10;
  if (/\uc601\uc5b4\ub85c|\uc601\uc5b4\uacf5\ubd80|\uc601\uc5b4|\uc601\uc5b4\ub2e8\uc5b4|\uc601\uc5b4\ud559\uc2b5/.test(t)) score -= 40;
  if (/\uc74c\uc545|\ub313\uc2a4|\ucc3c\ub9b0\uc9c0|\ube0c\uc774\ub85c\uadf8|\uc5ec\ud589|\uac8c\uc784|\uc560\ub2c8|\ub9cc\ud654|\ub4dc\ub77c\ub9c8/.test(t)) score -= 30;
  if (/\uc1fc\uce20\ubaa8\uc74c|\ud074\ub9bd\ubaa8\uc74c|\ubaa8\uc74c|\ucef4\ud544/.test(t)) score -= 20;
  if (t.includes("shorts") && !t.includes(p)) score -= 15;
  return Math.max(0, Math.min(100, score));
}
function classifyPattern(title) {
  const t = title;
  const patterns = [];
  if (/\uc218\ud655|\ub18d\uc7a5|\uc0b0\uc9c0|\ud604\uc7a5|\ubc1b/.test(t)) patterns.push("\uC218\uD655\uD604\uC7A5\uD615");
  if (/\uccab\uc785|\uba39\uc5b4\ubcf4\ub2c8|\uba39\ubc29|\uc2e4\uc81c|\ub9db\ubcf4\ub2c8|\ub9ac\uc561\uc158/.test(t)) patterns.push("\uCCAB\uC785\uBC18\uC751\uD615");
  if (/\ubabb\ub09c\uc774|\ud76c\uc18c|\ud55c\uc815|\ub9c8\uc9c0\ub9c9|\ub2e4\ud314|\uc5c6\ub2e4/.test(t)) patterns.push("\uBABB\uB09C\uC774/\uD76C\uC18C\uC131\uD615");
  if (/\uc2e4\uc218|\ud6c4\ud68c|\uc8fc\uc758|\uc870\uc2ec|\ub9de\ub294\ubc95|\uc120\ud0dd\ubc95/.test(t)) patterns.push("\uC2E4\uC218\uD68C\uD53C\uD615");
  if (/\uace0\ub974\ub294\ubc95|\uae30\uc900|\ucc28\uc774|\ub4f1\uae09|\uc120\ud0dd|\ud310\ubcc4/.test(t)) patterns.push("\uACE0\uB974\uB294\uBC95/\uAE30\uC900\uC81C\uC2DC\uD615");
  if (/\ubcf4\uad00|\ud6c4\uc219|\uc219\uc131|\uc62c\ubc14\ub978/.test(t)) patterns.push("\uBCF4\uAD00\uBC95/\uD6C4\uC219\uD615");
  if (/\uc6d0|\uac00\uaca9|\ud55c\uc815\uc218\ub7c9|\uc800\ub834|\uc2f8|\uac00\uc131\ube44/.test(t)) patterns.push("\uAC00\uACA9/\uD55C\uC815\uC218\uB7C9\uD615");
  if (/\uc544\uc774|\uac00\uc871|\uac04\uc2dd|\uc544\uc774\ub4e4|\uc5b4\ub9b0\uc774/.test(t)) patterns.push("\uAC00\uC871/\uC544\uC774\uAC04\uC2DD\uD615");
  if (/\uce90\ud551|\uc5ec\ud589|\uc57c\uc678|\ud53c\ud06c\ub2c9/.test(t)) patterns.push("\uCE90\uD551/\uC5EC\uD589\uD615");
  if (/\uc0b0\uc9c0\uc9c1\uc1a1|\uc9c1\uc1a1|\ub18d\ubd80|\uc0b0\uc9c0|\uc2e0\ub8b0/.test(t)) patterns.push("\uC0B0\uC9C0\uC9C1\uC1A1/\uC2E0\uB8B0\uD615");
  if (/\uc81c\ucca0|\ub9c8\uac10|\ub05d\ubb3c|\uc2dc\uc98c|\ub9c8\uc9c0\ub9c9/.test(t)) patterns.push("\uC81C\uCCA0\uB9C8\uAC10\uD615");
  if (/\ub9db|\ud5a5|\uc544\uc0ad|\ub2ec\ucf64|\uace0\uc18c\ud55c|\uc2e4\ud55c|\uc2e4\ud0c4|\uc2e4\ud55c|\ud5a5\uae30/.test(t)) patterns.push("\uAC10\uAC01\uBB18\uC0AC\uD615");
  if (patterns.length === 0) patterns.push("\uC77C\uBC18\uC815\uBCF4\uD615");
  return patterns;
}
async function handleCopyOrchestrator(params) {
  const product = params?.product || "";
  const contentType = params?.contentType || "headcopy";
  const userMessage = params?.userMessage || "";
  const engines = Array.isArray(params?.engines) ? params.engines : ["youtube", "market"];
  const excludedEngines = Array.isArray(params?.excludedEngines) ? params.excludedEngines : [];
  const sourceUrl = params?.sourceUrl || "";
  const sourceText = params?.sourceText || "";
  const reviewText = params?.reviewText || "";
  const engineResults = {};
  const enginePromises = [];
  if (engines.includes("youtube")) {
    enginePromises.push(
      handleCopyResearch({ product, contentType, userMessage }).then((r) => {
        engineResults.youtube = r;
      }).catch(() => {
        engineResults.youtube = { success: false, error: "YouTube \uC870\uC0AC \uC2E4\uD328" };
      })
    );
  }
  if (engines.includes("market")) {
    const marketProduct = product;
    const copyProduct = product;
    enginePromises.push(
      handleCopyMarketResearch({ marketProduct, copyProduct, contentType, userMessage }).then((r) => {
        engineResults.market = r;
      }).catch(() => {
        engineResults.market = { success: false, error: "KAMIS \uC870\uD68C \uC2E4\uD328" };
      })
    );
  }
  if (engines.includes("review")) {
    enginePromises.push(
      handleCopyReviewResearch({ product, contentType, userMessage, reviewText }).then((r) => {
        engineResults.review = r;
      }).catch(() => {
        engineResults.review = { success: false, error: "\uB9AC\uBDF0 \uBD84\uC11D \uC2E4\uD328" };
      })
    );
  }
  if (engines.includes("social")) {
    enginePromises.push(
      handleCopySocialResearch({ product, contentType, userMessage, sourceUrl, sourceText }).then((r) => {
        engineResults.social = r;
      }).catch(() => {
        engineResults.social = { success: false, error: "\uC18C\uC15C \uD328\uD134 \uBD84\uC11D \uC2E4\uD328" };
      })
    );
  }
  await Promise.all(enginePromises);
  const insightParts = [];
  const copyInjectionParts = [];
  let totalEnginesUsed = 0;
  let totalEnginesSuccess = 0;
  if (engineResults.youtube) {
    totalEnginesUsed++;
    if (engineResults.youtube.success) {
      totalEnginesSuccess++;
      const ytInsight = engineResults.youtube.researchInsight || "";
      if (ytInsight) {
        insightParts.push(`[YouTube \uBD84\uC11D]
${ytInsight.split("[COPY-A \uC8FC\uC785 \uC778\uC0AC\uC774\uD2B8]")[0].trim()}`);
        const ytCopyPart = ytInsight.split("[COPY-A \uC8FC\uC785 \uC778\uC0AC\uC774\uD2B8]")[1]?.trim();
        if (ytCopyPart) copyInjectionParts.push(`[YouTube \uC778\uC0AC\uC774\uD2B8]
${ytCopyPart}`);
      }
    } else {
      insightParts.push(`[YouTube \uBD84\uC11D] \uC870\uC0AC \uC2E4\uD328 \u2014 fallback \uC5C6\uC774 \uB2E4\uB978 \uC5D4\uC9C4 \uACB0\uACFC\uB85C \uBCF4\uC644`);
    }
  }
  if (engineResults.market) {
    totalEnginesUsed++;
    if (engineResults.market.success) {
      totalEnginesSuccess++;
      const mktInsight = engineResults.market.marketInsight || "";
      if (mktInsight) {
        insightParts.push(`[\uC2DC\uC7A5/\uC2DC\uC138 \uBD84\uC11D]
${mktInsight.split("[COPY-A \uC8FC\uC785 \uC778\uC0AC\uC774\uD2B8]")[0].trim()}`);
        const mktCopyPart = mktInsight.split("[COPY-A \uC8FC\uC785 \uC778\uC0AC\uC774\uD2B8]")[1]?.trim();
        if (mktCopyPart) copyInjectionParts.push(`[\uC2DC\uC7A5 \uC778\uC0AC\uC774\uD2B8]
${mktCopyPart}`);
      }
    } else {
      insightParts.push(`[\uC2DC\uC7A5/\uC2DC\uC138 \uBD84\uC11D] KAMIS \uC870\uD68C \uC2E4\uD328 \u2014 \uC815\uB7C9 \uC2DC\uC138 \uC5C6\uC774 \uCE74\uD53C \uC0DD\uC131`);
    }
  }
  if (engineResults.review) {
    totalEnginesUsed++;
    if (engineResults.review.success) {
      totalEnginesSuccess++;
      const revInsight = engineResults.review.reviewInsight || "";
      if (revInsight) {
        insightParts.push(`[\uB9AC\uBDF0/\uACE0\uAC1D \uBD88\uC548 \uBD84\uC11D]
${revInsight.split("[COPY-A \uC8FC\uC785 \uC778\uC0AC\uC774\uD2B8]")[0].trim()}`);
        const revCopyPart = revInsight.split("[COPY-A \uC8FC\uC785 \uC778\uC0AC\uC774\uD2B8]")[1]?.trim();
        if (revCopyPart) copyInjectionParts.push(`[\uB9AC\uBDF0 \uC778\uC0AC\uC774\uD2B8]
${revCopyPart}`);
      }
    } else {
      insightParts.push(`[\uB9AC\uBDF0/\uACE0\uAC1D \uBD88\uC548 \uBD84\uC11D] \uBD84\uC11D \uC2E4\uD328 \u2014 \uC77C\uBC18 \uBD88\uC548 \uD328\uD134\uC73C\uB85C \uB300\uCCB4`);
    }
  }
  if (engineResults.social) {
    totalEnginesUsed++;
    if (engineResults.social.success) {
      totalEnginesSuccess++;
      const socInsight = engineResults.social.socialInsight || "";
      if (socInsight) {
        insightParts.push(`[\uC18C\uC15C \uD328\uD134 \uBD84\uC11D]
${socInsight.split("[COPY-A \uC8FC\uC785 \uC778\uC0AC\uC774\uD2B8]")[0].trim()}`);
        const socCopyPart = socInsight.split("[COPY-A \uC8FC\uC785 \uC778\uC0AC\uC774\uD2B8]")[1]?.trim();
        if (socCopyPart) copyInjectionParts.push(`[\uC18C\uC15C \uC778\uC0AC\uC774\uD2B8]
${socCopyPart}`);
      }
    } else {
      insightParts.push(`[\uC18C\uC15C \uD328\uD134 \uBD84\uC11D] \uBD84\uC11D \uC2E4\uD328 \u2014 \uB2E4\uB978 \uC5D4\uC9C4 \uACB0\uACFC\uB85C \uBCF4\uC644`);
    }
  }
  const combinedInsight = `\u{1F4CA} \uD1B5\uD569 \uB9AC\uC11C\uCE58 \uC778\uC0AC\uC774\uD2B8 (COPY-R.5 Orchestrator)
\uC0AC\uC6A9 \uC5D4\uC9C4: ${engines.join(" + ")} (${totalEnginesSuccess}/${totalEnginesUsed} \uC131\uACF5)
\uD488\uBAA9: ${product || "\uBBF8\uC9C0\uC815"}

${insightParts.join("\n\n")}

[\uCE74\uD53C \uC801\uC6A9 \uBC29\uD5A5]
- \uC704 ${totalEnginesSuccess}\uAC1C \uC5D4\uC9C4 \uBD84\uC11D \uACB0\uACFC\uB97C \uC885\uD569\uD558\uC5EC \uCE74\uD53C\uC5D0 \uBC18\uC601
- \uAC01 \uC5D4\uC9C4\uC5D0\uC11C \uCD94\uCD9C\uD55C \uD575\uC2EC \uD3EC\uC778\uD2B8\uB97C \uAD50\uCC28 \uAC80\uC99D\uD558\uC5EC \uC801\uC6A9

[\uD53C\uD574\uC57C \uD560 \uBC29\uD5A5]
- \uB2E8\uC77C \uC5D4\uC9C4 \uACB0\uACFC\uB9CC\uC73C\uB85C \uACFC\uB3C4\uD55C \uB2E8\uC815 \uAE08\uC9C0
- \uAC00\uC9DC \uB370\uC774\uD130/\uAC00\uC9DC \uC870\uD68C\uC218/\uAC00\uC9DC \uB9AC\uBDF0 \uC0DD\uC131 \uAE08\uC9C0
- \uACFC\uC7A5 \uAD11\uACE0, \uD5C8\uC704 \uD6A8\uB2A5, \uB9E4\uCD9C \uBCF4\uC7A5 \uAE08\uC9C0

[COPY-A \uC8FC\uC785 \uC778\uC0AC\uC774\uD2B8]
${copyInjectionParts.join("\n\n") || "\uD1B5\uD569 \uBD84\uC11D \uACB0\uACFC \uAE30\uBC18\uC73C\uB85C \uCE74\uD53C \uC0DD\uC131"}`;
  const engineNameMap = {
    youtube: "YouTube \uBC18\uC751 \uBD84\uC11D",
    market: "KAMIS \uC2DC\uC138 \uC870\uD68C",
    review: "\uB9AC\uBDF0/\uACE0\uAC1D \uBD88\uC548 \uBD84\uC11D",
    social: "\uC18C\uC15C \uD328\uD134 \uBD84\uC11D"
  };
  const excludedEngineNames = excludedEngines.map((e) => engineNameMap[e] || e);
  return {
    success: true,
    engines,
    excludedEngines,
    excludedEngineNames,
    enginesUsed: totalEnginesUsed,
    enginesSuccess: totalEnginesSuccess,
    researchInsight: combinedInsight,
    orchestratorInsightForCopy: `

[COPY-R.5 \uD1B5\uD569 \uB9AC\uC11C\uCE58 \uC778\uC0AC\uC774\uD2B8 \u2014 \uC544\uB798 \uB0B4\uC6A9\uC744 \uCE74\uD53C\uC5D0 \uBC18\uC601\uD558\uC138\uC694]
${copyInjectionParts.join("\n\n") || "\uD1B5\uD569 \uBD84\uC11D \uACB0\uACFC \uAE30\uBC18\uC73C\uB85C \uCE74\uD53C \uC0DD\uC131"}`,
    engineResults: {
      youtube: engineResults.youtube?.success ? { videosFound: engineResults.youtube.videosFound, totalSearched: engineResults.youtube.totalSearched } : null,
      market: engineResults.market?.success ? { kamisSuccess: true } : null,
      review: engineResults.review?.success ? { sourceType: engineResults.review.sourceType } : null,
      social: engineResults.social?.success ? { sourceType: engineResults.social.sourceType } : null
    }
  };
}
async function handleCopyReviewResearch(params) {
  const product = params?.product || "";
  const contentType = params?.contentType || "headcopy";
  const userMessage = params?.userMessage || "";
  const reviewText = params?.reviewText || "";
  const hasReviewText = reviewText.length > 20 && /[1-5]점|리뷰|후기|댓글|물러|배송|맛|향|포장|아이|재구매|아쉬|좋|싫|별로|만족|불만|작다|크다|비싸|싸|달다|시다/.test(reviewText);
  const piiPatterns = /(\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4})|(\w+@\w+\.\w+)|([\uac00-\ud7a3]{2,4}\s*님)|(\d{10,})|(\d{1,3}[-\s]\d{1,4}[-\s]\d{1,4})/g;
  let reviewInsights = {};
  if (hasReviewText) {
    const sanitizedReview = reviewText.replace(piiPatterns, "[\uAC1C\uC778\uC815\uBCF4 \uC81C\uAC70]");
    const analysisPrompt = `\uB2F9\uC2E0\uC740 \uB18D\uC218\uCD95\uC0B0\uBB3C \uB9AC\uBDF0 \uBD84\uC11D \uC804\uBB38\uAC00\uC785\uB2C8\uB2E4.
\uC544\uB798 \uB9AC\uBDF0/\uD6C4\uAE30/\uB313\uAE00 \uD14D\uC2A4\uD2B8\uC5D0\uC11C \uACE0\uAC1D \uBD88\uC548\uACFC \uB9CC\uC871 \uD3EC\uC778\uD2B8\uB97C \uCD94\uCD9C\uD558\uC138\uC694.

\uC81C\uD488: ${product || "\uBBF8\uC9C0\uC815"}
\uB9AC\uBDF0 \uD14D\uC2A4\uD2B8:
${sanitizedReview.slice(0, 3e3)}

\uC544\uB798 JSON \uD615\uC2DD\uC73C\uB85C\uB9CC \uC751\uB2F5\uD558\uC138\uC694 (\uB2E4\uB978 \uD14D\uC2A4\uD2B8 \uC5C6\uC774):
{
  "sourceType": "review_text",
  "reviewCount": (\uBD84\uC11D\uD55C \uB9AC\uBDF0 \uC218),
  "negativeSignals": ["\uBD88\uC5481", "\uBD88\uC5482", ...],
  "positiveSignals": ["\uB9CC\uC8711", "\uB9CC\uC8712", ...],
  "buyerObjections": ["\uB9DD\uC124\uC7841", "\uB9DD\uC124\uC7842", ...],
  "satisfactionDrivers": ["\uAD6C\uB9E4\uB3D9\uAE301", "\uAD6C\uB9E4\uB3D9\uAE302", ...],
  "copyAngles": ["\uCE74\uD53C\uBC29\uD5A51", "\uCE74\uD53C\uBC29\uD5A52", ...],
  "trustBuilders": ["\uC2E0\uB8B0\uC694\uC18C1", "\uC2E0\uB8B0\uC694\uC18C2", ...],
  "avoidClaims": ["\uD53C\uD574\uC57C\uD560\uD45C\uD6041", "\uD53C\uD574\uC57C\uD560\uD45C\uD6042", ...],
  "privacyNote": "\uAC1C\uC778\uC815\uBCF4\uC131 \uB0B4\uC6A9\uC740 \uBD84\uC11D\uC5D0\uC11C \uC81C\uC678\uD588\uC2B5\uB2C8\uB2E4."
}

\uADDC\uCE59:
- \uB9AC\uBDF0 \uC6D0\uBB38\uC744 \uADF8\uB300\uB85C \uBCF5\uC0AC\uD558\uC9C0 \uB9C8\uC138\uC694
- \uD328\uD134\uACFC \uC778\uC0AC\uC774\uD2B8\uB9CC \uCD94\uCD9C\uD558\uC138\uC694
- \uAC1C\uC778\uC815\uBCF4(\uC774\uB984, \uC804\uD654\uBC88\uD638, \uC8FC\uC18C, \uC8FC\uBB38\uBC88\uD638)\uB294 \uBB34\uC2DC\uD558\uC138\uC694
- \uC5C6\uB294 \uB9AC\uBDF0\uB97C \uB9CC\uB4E4\uC9C0 \uB9C8\uC138\uC694
- \uAC00\uC9DC \uD3C9\uC810/\uAC00\uC9DC \uBC18\uC751\uC744 \uC0DD\uC131\uD558\uC9C0 \uB9C8\uC138\uC694`;
    try {
      const analysisRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages: [{ role: "user", content: analysisPrompt }],
          temperature: 0.3,
          max_tokens: 1e3
        })
      });
      const analysisData = await analysisRes.json();
      const analysisContent = analysisData.choices?.[0]?.message?.content || "";
      const jsonMatch = analysisContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        reviewInsights = JSON.parse(jsonMatch[0]);
      }
    } catch (err) {
      console.error("[COPY-R.4] GPT \uB9AC\uBDF0 \uBD84\uC11D \uC624\uB958:", err);
    }
  } else {
    const genericObjections = {
      "\uBCF5\uC22D\uC544": { negativeSignals: ["\uBB34\uB984", "\uD6C4\uC219 \uC5B4\uB824\uC6C0", "\uBC30\uC1A1 \uBA4D", "\uB35C \uB2EC\uB2E4"], positiveSignals: ["\uD5A5", "\uACFC\uC999", "\uC120\uBB3C \uBC18\uC751", "\uC544\uC774 \uAC04\uC2DD"], buyerObjections: ["\uBB3C\uB7EC\uC11C \uBC14\uB85C \uBA39\uC5B4\uC57C \uD568", "\uD6C4\uC219 \uD0C0\uC774\uBC0D \uBAA8\uB984", "\uBC30\uC1A1 \uC911 \uC190\uC0C1 \uAC71\uC815"] },
      "\uCD08\uB2F9\uC625\uC218\uC218": { negativeSignals: ["\uB2E8\uB9DB \uAE30\uB300 \uBBF8\uB2EC", "\uC54C \uD06C\uAE30 \uC791\uC74C", "\uBCF4\uAD00 \uC5B4\uB824\uC6C0"], positiveSignals: ["\uB2E8\uB9DB", "\uC544\uC774 \uAC04\uC2DD", "\uAC04\uD3B8 \uC870\uB9AC"], buyerObjections: ["\uBCF4\uAD00\uBC95 \uBAA8\uB984", "\uC218\uD655 \uD6C4 \uC2DC\uAC04 \uAC71\uC815", "\uC0B6\uB294 \uBC95 \uBAA8\uB984"] },
      "\uC808\uC784\uBC30\uCD94": { negativeSignals: ["\uBB34\uB984", "\uC9E0\uB9DB \uD3B8\uCC28", "\uC808\uC784 \uBD88\uADE0\uC77C", "\uC6D0\uBB3C \uC0C1\uD0DC"], positiveSignals: ["\uD3B8\uB9AC\uD568", "\uAE40\uC7A5 \uC2DC\uAC04 \uC808\uC57D", "\uAC00\uACA9 \uB300\uBE44 \uC591"], buyerObjections: ["\uAE40\uC7A5 \uC2E4\uD328 \uAC71\uC815", "\uC6D0\uBB3C \uC2E0\uB8B0", "\uBC30\uC1A1 \uC77C\uC815 \uBD88\uC548"] },
      "\uD55C\uC6B0": { negativeSignals: ["\uAC00\uACA9 \uBD80\uB2F4", "\uB9C8\uBE14\uB9C1 \uAE30\uB300 \uBBF8\uB2EC"], positiveSignals: ["\uC120\uBB3C \uCCB4\uBA74", "\uC6D0\uC0B0\uC9C0 \uC2E0\uB8B0", "\uD3EC\uC7A5 \uB9CC\uC871"], buyerObjections: ["\uBE44\uC2F8\uC11C \uC2E4\uD328\uD558\uBA74 \uC544\uAE4C\uC6C0", "\uC0AC\uC9C4\uACFC \uB2E4\uB97C\uAE4C \uAC71\uC815"] },
      "\uBE14\uB8E8\uBCA0\uB9AC": { negativeSignals: ["\uD06C\uAE30 \uD3B8\uCC28", "\uC2E0\uB9DB", "\uBB34\uB984"], positiveSignals: ["\uC544\uC774 \uAC04\uC2DD", "\uC694\uAC70\uD2B8 \uD65C\uC6A9", "\uC2E0\uC120\uB3C4"], buyerObjections: ["\uD06C\uAE30 \uC791\uC744\uAE4C \uAC71\uC815", "\uAE08\uBC29 \uBB34\uB97C\uAE4C \uAC71\uC815"] },
      "\uC0AC\uACFC": { negativeSignals: ["\uB2F9\uB3C4 \uD3B8\uCC28", "\uC2DD\uAC10 \uCC28\uC774", "\uD06C\uAE30 \uD3B8\uCC28", "\uD760\uC9D1"], positiveSignals: ["\uC544\uC0AD\uD568", "\uB2E8\uB9DB", "\uC120\uBB3C\uC6A9"], buyerObjections: ["\uB2F9\uB3C4 \uB5A8\uC5B4\uC9C8\uAE4C \uAC71\uC815", "\uD760\uC9D1 \uC788\uC744\uAE4C \uAC71\uC815"] },
      "\uB538\uAE30": { negativeSignals: ["\uBB34\uB984", "\uD06C\uAE30 \uD3B8\uCC28", "\uBC30\uC1A1 \uC190\uC0C1"], positiveSignals: ["\uD5A5", "\uB2E8\uB9DB", "\uC544\uC774 \uAC04\uC2DD", "\uBE44\uC8FC\uC5BC"], buyerObjections: ["\uBC30\uC1A1 \uC911 \uBB3C\uB7EC\uC9C8\uAE4C \uAC71\uC815", "\uC0AC\uC9C4\uBCF4\uB2E4 \uC791\uC744\uAE4C \uAC71\uC815"] }
    };
    const matchedProduct = Object.keys(genericObjections).find((k) => product.includes(k));
    const fallbackData = matchedProduct ? genericObjections[matchedProduct] : {
      negativeSignals: ["\uB9DB \uAE30\uB300 \uBBF8\uB2EC", "\uBC30\uC1A1 \uC190\uC0C1", "\uD06C\uAE30/\uC591 \uBD88\uB9CC"],
      positiveSignals: ["\uC2E0\uC120\uB3C4", "\uD3EC\uC7A5 \uB9CC\uC871", "\uC7AC\uAD6C\uB9E4 \uC758\uD5A5"],
      buyerObjections: ["\uC2E4\uD328\uD560\uAE4C \uAC71\uC815", "\uBC30\uC1A1 \uC911 \uC0C1\uD560\uAE4C \uAC71\uC815", "\uC0AC\uC9C4\uACFC \uB2E4\uB97C\uAE4C \uAC71\uC815"]
    };
    reviewInsights = {
      sourceType: "generic_objection",
      reviewCount: 0,
      negativeSignals: fallbackData.negativeSignals || [],
      positiveSignals: fallbackData.positiveSignals || [],
      buyerObjections: fallbackData.buyerObjections || [],
      satisfactionDrivers: [],
      copyAngles: ["\uBD88\uC548\uC744 \uBA3C\uC800 \uC778\uC815", "\uC120\uD0DD \uAE30\uC900 \uC81C\uC2DC", "\uBA39\uB294 \uC7A5\uBA74\uC73C\uB85C \uC804\uD658", "\uC2E0\uB8B0 \uC694\uC18C \uBCF4\uAC15"],
      trustBuilders: ["\uACFC\uC7A5 \uC5C6\uC774 \uAE30\uB300\uCE58 \uC870\uC815", "\uC2E4\uC81C \uBCF4\uAD00/\uBC30\uC1A1 \uC548\uB0B4 \uD3EC\uD568"],
      avoidClaims: ["\uC2E4\uC81C \uB9AC\uBDF0\uCC98\uB7FC \uAFB8\uBA70 \uC4F0\uAE30", "\uACE0\uAC1D \uBC18\uC751 \uC870\uC791", "\uD5C8\uC704 \uD6A8\uB2A5", "\uACFC\uB3C4\uD55C \uACF5\uD3EC"],
      privacyNote: "\uC2E4\uC81C \uB9AC\uBDF0 \uC6D0\uBB38 \uC5C6\uC774 \uC77C\uBC18 \uB9AC\uBDF0 \uBD88\uC548 \uD328\uD134\uB9CC \uCC38\uACE0\uD588\uC2B5\uB2C8\uB2E4."
    };
  }
  const reviewInsightDisplay = `\u{1F4CB} \uB9AC\uBDF0/\uACE0\uAC1D \uBD88\uC548 \uC778\uC0AC\uC774\uD2B8
\uC870\uC0AC \uCD9C\uCC98: ${reviewInsights.sourceType === "review_text" ? "\uB9AC\uBDF0 \uD14D\uC2A4\uD2B8 \uBD84\uC11D" : "\uC77C\uBC18 \uB9AC\uBDF0 \uBD88\uC548 \uD328\uD134"}
\uBD84\uC11D \uB9AC\uBDF0 \uC218: ${reviewInsights.reviewCount || 0}\uAC1C
\uD575\uC2EC \uBD88\uC548: ${(reviewInsights.negativeSignals || []).join(", ") || "\uC5C6\uC74C"}
\uB9CC\uC871 \uD3EC\uC778\uD2B8: ${(reviewInsights.positiveSignals || []).join(", ") || "\uC5C6\uC74C"}
\uAD6C\uB9E4 \uB9DD\uC124\uC784: ${(reviewInsights.buyerObjections || []).join(", ") || "\uC5C6\uC74C"}
\uC2E0\uB8B0 \uBCF4\uAC15 \uD3EC\uC778\uD2B8: ${(reviewInsights.trustBuilders || []).join(", ") || "\uC5C6\uC74C"}
\uCE74\uD53C \uC801\uC6A9 \uBC29\uD5A5: ${(reviewInsights.copyAngles || []).join(", ") || "\uBD88\uC548 \uD574\uC18C \uC911\uC2EC"}
\uD53C\uD574\uC57C \uD560 \uD45C\uD604: ${(reviewInsights.avoidClaims || []).join(", ") || "\uAC00\uC9DC \uB9AC\uBDF0, \uD5C8\uC704 \uD6A8\uB2A5"}`;
  const reviewInsightForCopy = `
[COPY-R.4 \uB9AC\uBDF0/\uACE0\uAC1D \uBD88\uC548 \uC778\uC0AC\uC774\uD2B8]
- \uBD84\uC11D \uB9AC\uBDF0 \uC218: ${reviewInsights.reviewCount || 0}\uAC1C
- \uD575\uC2EC \uBD88\uC548: ${(reviewInsights.negativeSignals || []).join(", ")}
- \uB9CC\uC871 \uD3EC\uC778\uD2B8: ${(reviewInsights.positiveSignals || []).join(", ")}
- \uAD6C\uB9E4 \uB9DD\uC124\uC784: ${(reviewInsights.buyerObjections || []).join(", ")}
- \uC2E0\uB8B0 \uBCF4\uAC15 \uD3EC\uC778\uD2B8: ${(reviewInsights.trustBuilders || []).join(", ")}
- \uCE74\uD53C \uC801\uC6A9 \uBC29\uD5A5: ${(reviewInsights.copyAngles || []).join(", ")}
- \uD53C\uD574\uC57C \uD560 \uD45C\uD604: ${(reviewInsights.avoidClaims || []).join(", ")}
- \uC2E4\uC81C \uB9AC\uBDF0\uCC98\uB7FC \uAFB8\uBA70 \uC4F0\uC9C0 \uB9D0\uACE0, \uBD88\uC548 \uD574\uC18C \uBC29\uD5A5\uB9CC \uBC18\uC601\uD560 \uAC83
- \uACE0\uAC1D \uBD88\uC548\uC744 \uBA3C\uC800 \uC774\uD574\uD55C \uBB38\uC7A5\uC73C\uB85C \uC2DC\uC791
- \uBD88\uC548\uC744 \uACFC\uC7A5\uD558\uC9C0 \uC54A\uC74C
- \uC120\uD0DD \uAE30\uC900 \uB610\uB294 \uBCF4\uAD00/\uD6C4\uC219/\uBC30\uC1A1 \uAE30\uB300\uCE58\uB97C \uBD80\uB4DC\uB7FD\uAC8C \uC81C\uC2DC
- \uB9CC\uC871 \uD3EC\uC778\uD2B8\uB294 \uBA39\uB294 \uC7A5\uBA74\uC73C\uB85C \uC804\uD658
- \uAC00\uC9DC \uACE0\uAC1D \uD6C4\uAE30\uCC98\uB7FC \uC4F0\uC9C0 \uC54A\uC74C`;
  return {
    success: true,
    reviewInsight: reviewInsightDisplay,
    reviewInsightForCopy,
    reviewInsights,
    hasReviewText,
    sourceType: reviewInsights.sourceType || "generic_objection",
    reviewCount: reviewInsights.reviewCount || 0
  };
}
async function handleCopySocialResearch(params) {
  const product = params?.product || "";
  const contentType = params?.contentType || "headcopy";
  const userMessage = params?.userMessage || "";
  const sourceUrl = params?.sourceUrl || "";
  const sourceText = params?.sourceText || "";
  let socialContent = "";
  let sourceType = "text";
  let fetchSuccess = false;
  if (sourceUrl) {
    sourceType = "url";
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8e3);
      const res = await fetch(sourceUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; JarvisBot/1.0)" },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (res.ok) {
        const html = await res.text();
        const ogDesc = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i)?.[1] || "";
        const metaDesc = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i)?.[1] || "";
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "";
        const bodyText = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2e3);
        socialContent = [
          titleMatch ? `\uC81C\uBAA9: ${titleMatch}` : "",
          ogDesc ? `\uC124\uBA85: ${ogDesc}` : metaDesc ? `\uC124\uBA85: ${metaDesc}` : "",
          bodyText ? `\uBCF8\uBB38 \uBC1C\uCDCC: ${bodyText.slice(0, 800)}` : ""
        ].filter(Boolean).join("\n");
        fetchSuccess = socialContent.length > 50;
      }
    } catch (e) {
    }
  }
  if (sourceText && !fetchSuccess) {
    socialContent = sourceText;
    sourceType = "text";
    fetchSuccess = true;
  }
  const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || "";
  if (!OPENAI_KEY) {
    return { success: false, failReason: "OPENAI_API_KEY not configured" };
  }
  const analysisPrompt = fetchSuccess ? `\uB2F9\uC2E0\uC740 \uC18C\uC15C \uBBF8\uB514\uC5B4 \uCF58\uD150\uCE20 \uD328\uD134 \uBD84\uC11D \uC804\uBB38\uAC00\uC785\uB2C8\uB2E4.

\uC544\uB798 \uC18C\uC15C \uCF58\uD150\uCE20\uB97C \uBD84\uC11D\uD558\uC5EC \uD328\uD134 \uC778\uC0AC\uC774\uD2B8\uB97C \uCD94\uCD9C\uD574 \uC8FC\uC138\uC694.

[\uBD84\uC11D \uB300\uC0C1]
\uC18C\uC2A4 \uD0C0\uC785: ${sourceType === "url" ? "URL \uD06C\uB864\uB9C1" : "\uD14D\uC2A4\uD2B8 \uC785\uB825"}
${sourceUrl ? `URL: ${sourceUrl}` : ""}
\uCF58\uD150\uCE20:
${socialContent.slice(0, 1500)}

[\uBD84\uC11D \uD56D\uBAA9]
1. \uD6C4\uD0B9 \uD328\uD134: \uCCAB \uBB38\uC7A5/\uCCAB 3\uCD08\uC5D0 \uC0AC\uC6A9\uB41C \uAE30\uBC95 (\uC9C8\uBB38\uD615/\uBC18\uC804\uD615/\uAE08\uC9C0\uD615/\uAC10\uD0C4\uD615/\uC22B\uC790\uD615 \uB4F1)
2. \uAD6C\uC870 \uD328\uD134: \uAE00/\uC601\uC0C1\uC758 \uC804\uCCB4 \uD750\uB984 \uAD6C\uC870 (\uB3C4\uC785\u2192\uC804\uAC1C\u2192CTA \uB4F1)
3. \uAC10\uC815 \uD1A4: \uC0AC\uC6A9\uB41C \uAC10\uC815 \uD1A4 (\uCE5C\uADFC/\uB3C4\uBC1C/\uACF5\uAC10/\uC720\uBA38/\uAE34\uAE09 \uB4F1)
4. CTA \uD328\uD134: \uB313\uAE00/DM/\uACF5\uC720/\uC800\uC7A5 \uC720\uB3C4 \uBC29\uC2DD
5. \uD0C0\uAE43 \uD398\uB974\uC18C\uB098: \uB204\uAD6C\uB97C \uACA8\uB0E5\uD55C \uCF58\uD150\uCE20\uC778\uC9C0
6. \uBC14\uC774\uB7F4 \uC694\uC18C: \uC65C \uBC18\uC751\uC774 \uC88B\uC744 \uC218 \uC788\uB294\uC9C0 (\uACF5\uAC10/\uD638\uAE30\uC2EC/\uB17C\uC7C1/\uC2E4\uC6A9 \uB4F1)

[\uCD9C\uB825 \uD615\uC2DD]
=== \uC18C\uC15C \uD328\uD134 \uC778\uC0AC\uC774\uD2B8 ===
\uC870\uC0AC \uCD9C\uCC98: ${sourceType === "url" ? "URL \uBD84\uC11D" : "\uD14D\uC2A4\uD2B8 \uD328\uD134 \uBD84\uC11D"}
\uD6C4\uD0B9 \uD328\uD134: (\uBD84\uC11D \uACB0\uACFC)
\uAD6C\uC870 \uD328\uD134: (\uBD84\uC11D \uACB0\uACFC)
\uAC10\uC815 \uD1A4: (\uBD84\uC11D \uACB0\uACFC)
CTA \uD328\uD134: (\uBD84\uC11D \uACB0\uACFC)
\uD0C0\uAE43 \uD398\uB974\uC18C\uB098: (\uBD84\uC11D \uACB0\uACFC)
\uBC14\uC774\uB7F4 \uC694\uC18C: (\uBD84\uC11D \uACB0\uACFC)

[\uCE74\uD53C \uC801\uC6A9 \uBC29\uD5A5]
(\uC774 \uD328\uD134\uC744 ${product || "\uC81C\uD488"} \uCE74\uD53C\uC5D0 \uC5B4\uB5BB\uAC8C \uC801\uC6A9\uD560\uC9C0 2~3\uC904)

[\uD53C\uD574\uC57C \uD560 \uBC29\uD5A5]
(\uC774 \uD328\uD134\uC5D0\uC11C \uC8FC\uC758\uD560 \uC810 1~2\uC904)

[COPY-A \uC8FC\uC785 \uC778\uC0AC\uC774\uD2B8]
(\uCE74\uD53C \uC0DD\uC131 \uC2DC \uBC18\uC601\uD560 \uD575\uC2EC \uC9C0\uC2DC 3~5\uC904)` : `\uB2F9\uC2E0\uC740 \uC18C\uC15C \uBBF8\uB514\uC5B4 \uCF58\uD150\uCE20 \uD328\uD134 \uBD84\uC11D \uC804\uBB38\uAC00\uC785\uB2C8\uB2E4.

\uC0AC\uC6A9\uC790\uAC00 "${userMessage}"\uB77C\uACE0 \uC694\uCCAD\uD588\uC9C0\uB9CC, \uBD84\uC11D\uD560 \uC18C\uC15C \uCF58\uD150\uCE20(URL \uB610\uB294 \uD14D\uC2A4\uD2B8)\uB97C \uC81C\uACF5\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.

\uC0AC\uC6A9\uC790\uC758 \uC694\uCCAD \uC758\uB3C4\uB97C \uD30C\uC545\uD558\uC5EC, ${product || "\uB18D\uC0B0\uBB3C"} \uC81C\uD488\uC5D0 \uB300\uD55C \uC77C\uBC18\uC801\uC778 \uC18C\uC15C \uBBF8\uB514\uC5B4 \uBC14\uC774\uB7F4 \uD328\uD134 \uC778\uC0AC\uC774\uD2B8\uB97C \uC81C\uACF5\uD574 \uC8FC\uC138\uC694.

[\uBD84\uC11D \uD56D\uBAA9]
1. \uD6C4\uD0B9 \uD328\uD134: \uD574\uB2F9 \uD50C\uB7AB\uD3FC(${contentType === "threads_post" ? "Threads" : contentType === "reels_script" ? "Reels/TikTok" : contentType === "instagram_copy" ? "Instagram" : "\uC18C\uC15C \uBBF8\uB514\uC5B4"})\uC5D0\uC11C ${product || "\uB18D\uC0B0\uBB3C"} \uAD00\uB828 \uC778\uAE30 \uCF58\uD150\uCE20\uC758 \uC77C\uBC18\uC801 \uD6C4\uD0B9 \uAE30\uBC95
2. \uAD6C\uC870 \uD328\uD134: \uD574\uB2F9 \uD50C\uB7AB\uD3FC\uC758 \uC77C\uBC18\uC801 \uCF58\uD150\uCE20 \uAD6C\uC870
3. \uAC10\uC815 \uD1A4: \uBC18\uC751 \uC88B\uC740 \uCF58\uD150\uCE20\uC758 \uAC10\uC815 \uD1A4
4. CTA \uD328\uD134: \uD6A8\uACFC\uC801\uC778 CTA \uBC29\uC2DD
5. \uD0C0\uAE43 \uD398\uB974\uC18C\uB098: \uC8FC\uC694 \uD0C0\uAE43
6. \uBC14\uC774\uB7F4 \uC694\uC18C: \uBC18\uC751\uC744 \uC774\uB044\uB294 \uD575\uC2EC \uC694\uC18C

[\uCD9C\uB825 \uD615\uC2DD]
=== \uC18C\uC15C \uD328\uD134 \uC778\uC0AC\uC774\uD2B8 ===
\uC870\uC0AC \uCD9C\uCC98: \uC77C\uBC18 \uD328\uD134 \uBD84\uC11D (\uCC38\uACE0 \uCF58\uD150\uCE20 \uBBF8\uC81C\uACF5)
\uD6C4\uD0B9 \uD328\uD134: (\uBD84\uC11D \uACB0\uACFC)
\uAD6C\uC870 \uD328\uD134: (\uBD84\uC11D \uACB0\uACFC)
\uAC10\uC815 \uD1A4: (\uBD84\uC11D \uACB0\uACFC)
CTA \uD328\uD134: (\uBD84\uC11D \uACB0\uACFC)
\uD0C0\uAE43 \uD398\uB974\uC18C\uB098: (\uBD84\uC11D \uACB0\uACFC)
\uBC14\uC774\uB7F4 \uC694\uC18C: (\uBD84\uC11D \uACB0\uACFC)

[\uCE74\uD53C \uC801\uC6A9 \uBC29\uD5A5]
(\uC774 \uD328\uD134\uC744 ${product || "\uC81C\uD488"} \uCE74\uD53C\uC5D0 \uC5B4\uB5BB\uAC8C \uC801\uC6A9\uD560\uC9C0 2~3\uC904)

[\uD53C\uD574\uC57C \uD560 \uBC29\uD5A5]
(\uC774 \uD328\uD134\uC5D0\uC11C \uC8FC\uC758\uD560 \uC810 1~2\uC904)

[COPY-A \uC8FC\uC785 \uC778\uC0AC\uC774\uD2B8]
(\uCE74\uD53C \uC0DD\uC131 \uC2DC \uBC18\uC601\uD560 \uD575\uC2EC \uC9C0\uC2DC 3~5\uC904)`;
  try {
    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: analysisPrompt }],
        max_tokens: 1200,
        temperature: 0.7
      })
    });
    if (!gptRes.ok) {
      return { success: false, failReason: `GPT API error: ${gptRes.status}` };
    }
    const gptData = await gptRes.json();
    const socialInsight = gptData.choices?.[0]?.message?.content || "";
    if (!socialInsight) {
      return { success: false, failReason: "GPT returned empty response" };
    }
    const uiInsight = socialInsight.split("[COPY-A \uC8FC\uC785 \uC778\uC0AC\uC774\uD2B8]")[0].trim();
    const copyAInjection = socialInsight.split("[COPY-A \uC8FC\uC785 \uC778\uC0AC\uC774\uD2B8]")[1]?.trim() || uiInsight;
    const socialInsightForCopy = `[COPY-R.3 \uC18C\uC15C \uD328\uD134 \uBD84\uC11D \uACB0\uACFC \uC8FC\uC785]
${copyAInjection}

\uC704 \uC18C\uC15C \uD328\uD134 \uBD84\uC11D \uACB0\uACFC\uB97C \uBC18\uB4DC\uC2DC \uBC18\uC601\uD558\uC5EC \uCE74\uD53C\uB97C \uC791\uC131\uD558\uC138\uC694.
\uD2B9\uD788 \uD6C4\uD0B9 \uD328\uD134, \uAD6C\uC870 \uD328\uD134, \uAC10\uC815 \uD1A4\uC744 \uCE74\uD53C\uC5D0 \uC801\uC6A9\uD558\uC138\uC694.`;
    return {
      success: true,
      socialInsight,
      socialInsightForCopy,
      sourceType,
      fetchSuccess,
      sourceUrl: sourceUrl || null
    };
  } catch (err) {
    return { success: false, failReason: `GPT call failed: ${err.message}` };
  }
}
async function handleCopyMarketResearch(params) {
  const marketProduct = params?.marketProduct || params?.product || "\uB18D\uC0B0\uBB3C";
  const copyProduct = params?.copyProduct || marketProduct;
  const contentType = params?.contentType || "headcopy";
  let kamisData = null;
  let kamisSuccess = false;
  let failReason = "";
  try {
    kamisData = await handleKamisMini({ item: marketProduct });
    if (kamisData.success && kamisData.prices) {
      kamisSuccess = true;
    } else if (kamisData.success && !kamisData.prices) {
      failReason = kamisData.message || "KAMIS \uB370\uC774\uD130 \uBD80\uC871";
    } else {
      failReason = kamisData.error || "KAMIS \uC870\uD68C \uC2E4\uD328";
    }
  } catch (err) {
    failReason = `KAMIS API \uC624\uB958: ${err.message || "unknown"}`;
  }
  let marketInsight = "";
  let marketInsightForCopy = "";
  if (kamisSuccess && kamisData.prices) {
    const prices = kamisData.prices;
    const todayPrice = prices.today || "-";
    const monthPrice = prices.monthBefore || "-";
    const direction = kamisData.direction || "N/A";
    const unit = kamisData.unit || "";
    const cls = kamisData.cls || "\uC18C\uB9E4";
    const date = kamisData.date || "";
    const isProxy = kamisData.isProxy || false;
    const proxyNote = kamisData.proxyNote || "";
    let priceFlow = "";
    const changePercent = kamisData.changePercent;
    if (!isNaN(changePercent)) {
      if (changePercent > 5) priceFlow = `\uC804\uC6D4 \uB300\uBE44 ${direction} \uC0C1\uC2B9 \uCD94\uC138`;
      else if (changePercent < -5) priceFlow = `\uC804\uC6D4 \uB300\uBE44 ${direction} \uD558\uB77D \uCD94\uC138`;
      else priceFlow = `\uC804\uC6D4 \uB300\uBE44 ${direction} \uBCF4\uD569 \uC720\uC9C0`;
    } else {
      priceFlow = "\uAC00\uACA9 \uBCC0\uB3D9 \uB370\uC774\uD130 \uBD80\uC871";
    }
    let sellingTiming = "";
    if (!isNaN(changePercent)) {
      if (changePercent > 10) sellingTiming = "\uAC00\uACA9 \uC0C1\uC2B9\uAE30 \u2014 \uD504\uB9AC\uBBF8\uC5C4/\uD55C\uC815 \uC218\uB7C9 \uBA54\uC2DC\uC9C0 \uD6A8\uACFC\uC801";
      else if (changePercent > 0) sellingTiming = "\uC548\uC815\uC801 \uC0C1\uC2B9 \u2014 \uD488\uC9C8 \uAC15\uC870 \uC804\uB7B5 \uC720\uD6A8";
      else if (changePercent > -5) sellingTiming = "\uBCF4\uD569 \uC720\uC9C0 \u2014 \uBB36\uC74C/\uC138\uD2B8 \uAD6C\uC131 \uAC80\uD1A0";
      else sellingTiming = "\uAC00\uACA9 \uD558\uB77D\uAE30 \u2014 \uAC00\uC131\uBE44 \uAC15\uC870 \uB610\uB294 \uC6A9\uB7C9 \uC5C5 \uC804\uB7B5";
    } else {
      sellingTiming = "\uB370\uC774\uD130 \uBD80\uC871\uC73C\uB85C \uD0C0\uC774\uBC0D \uD310\uB2E8 \uBD88\uAC00";
    }
    let consumerAnxiety = "";
    if (marketProduct === "\uBCF5\uC22D\uC544") consumerAnxiety = "\uD6C4\uC219 \uD0C0\uC774\uBC0D, \uBB34\uB984, \uB2F9\uB3C4 \uBD88\uC548";
    else if (marketProduct === "\uD55C\uC6B0") consumerAnxiety = "\uAC00\uACA9 \uBD80\uB2F4, \uB4F1\uAE09 \uC2E0\uB8B0, \uC6D0\uC0B0\uC9C0 \uC758\uC2EC";
    else if (marketProduct === "\uBC30\uCD94" || marketProduct === "\uC808\uC784\uBC30\uCD94") consumerAnxiety = "\uAE40\uC7A5 \uC2E4\uD328 \uD68C\uD53C, \uC6D0\uBB3C \uC2E0\uB8B0";
    else if (marketProduct === "\uCD08\uB2F9\uC625\uC218\uC218" || marketProduct === "\uC625\uC218\uC218") consumerAnxiety = "\uB2F9\uB3C4/\uC2E0\uC120\uB3C4, \uC218\uD655 \uD6C4 \uB2F9\uB3C4 \uAC10\uC18C \uBD88\uC548";
    else if (marketProduct === "\uC0AC\uACFC") consumerAnxiety = "\uB2F9\uB3C4, \uC2DD\uAC10, \uD06C\uAE30 \uD3B8\uCC28";
    else if (marketProduct === "\uB538\uAE30") consumerAnxiety = "\uC2E0\uC120\uB3C4, \uBB34\uB984, \uB2F9\uB3C4 \uBD88\uC548";
    else consumerAnxiety = "\uAC00\uACA9 \uB300\uBE44 \uD488\uC9C8, \uC2E0\uC120\uB3C4 \uBD88\uC548";
    let copyDirection = "";
    if (!isNaN(changePercent) && changePercent > 10) {
      copyDirection = `"\uC2F8\uB2E4"\uBCF4\uB2E4 "\uC9C0\uAE08 \uC0AC\uC57C \uD558\uB294 \uC774\uC720"\uB85C \uC811\uADFC. \uD55C\uC815 \uC218\uB7C9/\uC2DC\uC988\uB110 \uBA54\uC2DC\uC9C0 \uD6A8\uACFC\uC801`;
    } else if (!isNaN(changePercent) && changePercent < -5) {
      copyDirection = `\uAC00\uACA9 \uD558\uB77D\uAE30\uC5D0\uB294 "\uC2F8\uB2E4"\uBCF4\uB2E4 "\uD488\uC9C8 \uB300\uBE44 \uAC00\uC131\uBE44"\uB85C \uC811\uADFC`;
    } else {
      copyDirection = `\uAC00\uACA9\uBCF4\uB2E4 \uD488\uC9C8/\uC2A4\uD1A0\uB9AC/\uC2E0\uB8B0\uB85C \uC811\uADFC. \uC18C\uBE44\uC790 \uBD88\uC548 \uD574\uC18C \uC911\uC2EC`;
    }
    const avoidDirection = "\uADFC\uAC70 \uC5C6\uB294 \uCD5C\uC800\uAC00/\uAC00\uACA9 \uBCF4\uC7A5, \uAC00\uACA9 \uD3ED\uB4F1/\uD3ED\uB77D \uB2E8\uC815, \uD5C8\uC704 \uC218\uAE09 \uC704\uAE30, \uCE58\uB8CC/\uD6A8\uB2A5 \uACFC\uC7A5";
    marketInsight = [
      `\uC2DC\uC7A5/\uC2DC\uC988 \uC778\uC0AC\uC774\uD2B8`,
      `\u2022 \uC870\uC0AC \uCD9C\uCC98: KAMIS (${cls})`,
      `\u2022 \uD488\uBAA9: ${marketProduct}${isProxy ? ` (${proxyNote})` : ""}`,
      `\u2022 \uB370\uC774\uD130 \uAE30\uC900\uC77C: ${date}`,
      `\u2022 \uD604\uC7AC \uAC00\uACA9: ${todayPrice}/${unit}`,
      `\u2022 \uC804\uC6D4 \uB300\uBE44: ${direction}`,
      `\u2022 \uAC00\uACA9 \uD750\uB984: ${priceFlow}`,
      `\u2022 \uD310\uB9E4 \uD0C0\uC774\uBC0D: ${sellingTiming}`,
      `\u2022 \uC18C\uBE44\uC790 \uBD88\uC548: ${consumerAnxiety}`,
      ``,
      `\uCE74\uD53C \uC801\uC6A9 \uBC29\uD5A5:`,
      copyDirection,
      ``,
      `\uD53C\uD574\uC57C \uD560 \uBC29\uD5A5:`,
      avoidDirection
    ].join("\n");
    marketInsightForCopy = [
      `[COPY-R.2 \uC2DC\uC7A5 \uB9E5\uB77D \uC8FC\uC785]`,
      `\uD488\uBAA9: ${copyProduct}${isProxy ? ` (\uC6D0\uBB3C: ${marketProduct})` : ""}`,
      `\uB370\uC774\uD130 \uAE30\uC900: KAMIS ${cls} ${date}`,
      `\uD604\uC7AC \uAC00\uACA9: ${todayPrice}/${unit}`,
      `\uC804\uC6D4 \uB300\uBE44: ${direction}`,
      `\uC2DC\uC7A5 \uB9E5\uB77D: ${priceFlow}`,
      `\uC18C\uBE44\uC790 \uBD88\uC548: ${consumerAnxiety}`,
      `\uD310\uB9E4 \uD0C0\uC774\uBC0D: ${sellingTiming}`,
      `\uCE74\uD53C \uC801\uC6A9 \uBC29\uD5A5: ${copyDirection}`,
      `\uD53C\uD574\uC57C \uD560 \uD45C\uD604: ${avoidDirection}`,
      ``,
      `\uC704 \uC2DC\uC7A5 \uB9E5\uB77D\uC744 \uBC18\uB4DC\uC2DC \uBC18\uC601\uD558\uC5EC \uCE74\uD53C\uB97C \uC791\uC131\uD558\uC138\uC694.`
    ].join("\n");
  } else {
    marketInsight = [
      `\uC2DC\uC7A5/\uC2DC\uC988 \uC778\uC0AC\uC774\uD2B8`,
      `\u2022 \uC870\uC0AC \uCD9C\uCC98: KAMIS`,
      `\u2022 \uD488\uBAA9: ${marketProduct}`,
      `\u2022 \uC0C1\uD0DC: \uC815\uB7C9 \uC2DC\uC138 \uC5C6\uC74C / \uC77C\uBC18 \uC2DC\uC7A5 \uB9E5\uB77D\uB9CC \uBC18\uC601`,
      `\u2022 \uC0AC\uC720: ${failReason}`
    ].join("\n");
    marketInsightForCopy = [
      `[COPY-R.2 \uC2DC\uC7A5 \uB9E5\uB77D \uC8FC\uC785]`,
      `\uD488\uBAA9: ${copyProduct}`,
      `KAMIS \uB370\uC774\uD130\uAC00 \uBD80\uC871\uD558\uC5EC \uC77C\uBC18 \uB18D\uC0B0\uBB3C \uCE74\uD53C \uB450\uB1CC\uB85C \uC0DD\uC131\uD569\uB2C8\uB2E4.`,
      `\uC2DC\uC7A5 \uB9E5\uB77D\uC740 \uCC38\uACE0\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.`,
      `\uD53C\uD574\uC57C \uD560 \uD45C\uD604: \uADFC\uAC70 \uC5C6\uB294 \uCD5C\uC800\uAC00, \uAC00\uACA9 \uD3ED\uB4F1/\uD3ED\uB77D \uB2E8\uC815, \uD5C8\uC704 \uC218\uAE09 \uC704\uAE30, \uCE58\uB8CC/\uD6A8\uB2A5 \uACFC\uC7A5`
    ].join("\n");
  }
  return {
    success: true,
    marketProduct,
    copyProduct,
    contentType,
    kamisSuccess,
    failReason: kamisSuccess ? "" : failReason,
    marketInsight,
    marketInsightForCopy,
    kamisData: kamisSuccess ? {
      date: kamisData.date,
      cls: kamisData.cls,
      prices: kamisData.prices,
      direction: kamisData.direction,
      changePercent: kamisData.changePercent,
      unit: kamisData.unit,
      isProxy: kamisData.isProxy,
      proxyNote: kamisData.proxyNote
    } : null
  };
}
async function handleCopyResearch(params) {
  const product = params?.product || "\uB18D\uC0B0\uBB3C";
  const contentType = params?.contentType || "headcopy";
  const count = Math.min(Number(params?.count) || 8, 15);
  let allVideos = [];
  let filteredVideos = [];
  let researchInsight = "";
  let failReason = "";
  try {
    if (YOUTUBE_API_KEY) {
      const searchResult = await searchPopularVideos(product, count, "month");
      allVideos = searchResult.videos || [];
    } else {
      failReason = "YOUTUBE_API_KEY missing";
    }
  } catch (e) {
    console.error("[COPY-R] YouTube search error:", e.message);
    failReason = e.message?.includes("quota") ? "quota exceeded" : e.message?.includes("API") ? "API error" : "network error";
  }
  if (allVideos.length > 0) {
    const scored = allVideos.map((v) => ({
      ...v,
      relevanceScore: calcRelevanceScore(v.title, v.description || "", product)
    }));
    filteredVideos = scored.filter((v) => v.relevanceScore >= 40).sort((a, b) => {
      const scoreA = (a.viewCount || 0) * 0.6 + a.relevanceScore * 1e3 * 0.4;
      const scoreB = (b.viewCount || 0) * 0.6 + b.relevanceScore * 1e3 * 0.4;
      return scoreB - scoreA;
    }).slice(0, 5);
    if (filteredVideos.length === 0) {
      filteredVideos = scored.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0)).slice(0, 3);
    }
  }
  if (filteredVideos.length > 0) {
    const titles = filteredVideos.map((v) => v.title);
    const totalViews = filteredVideos.reduce((sum, v) => sum + (v.viewCount || 0), 0);
    const avgViews = filteredVideos.length > 0 ? Math.round(totalViews / filteredVideos.length) : 0;
    const topVideo = filteredVideos[0];
    const allPatterns = [];
    filteredVideos.forEach((v) => {
      classifyPattern(v.title).forEach((p) => allPatterns.push(p));
    });
    const patternFreq = {};
    allPatterns.forEach((p) => {
      patternFreq[p] = (patternFreq[p] || 0) + 1;
    });
    const topPatterns = Object.entries(patternFreq).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([p]) => p);
    const concernKeywords = [];
    if (titles.some((t) => /\uc2e4\uc218|\ud6c4\ud68c|\uc8fc\uc758|\uc870\uc2ec/.test(t))) concernKeywords.push("\uC2E4\uC218\uD68C\uD53C");
    if (titles.some((t) => /\ubcf4\uad00|\ud6c4\uc219|\uc624\ub798/.test(t))) concernKeywords.push("\uBCF4\uAD00\uBC95");
    if (titles.some((t) => /\uace0\ub974\ub294\ubc95|\ub4f1\uae09|\uae30\uc900/.test(t))) concernKeywords.push("\uC120\uD0DD\uAE30\uC900");
    if (titles.some((t) => /\uc2e0\uc120|\uc0b0\uc9c0|\ub18d\uc7a5|\uc9c1\uc1a1/.test(t))) concernKeywords.push("\uC2E0\uC120\uB3C4/\uC0B0\uC9C0");
    const hookFormula = topPatterns.includes("\uCCAB\uC785\uBC18\uC751\uD615") ? `"\uC774 ${product}\uB294 \uADF8\uB0E5 \uB9DB\uC788\uB2E4\uAC00 \uC544\uB2C8\uB77C, \uCCAB\uC785/\uC81C\uCCA0/\uD76C\uC18C\uC131\uC73C\uB85C \uB9D0\uD574\uC57C \uD55C\uB2E4."` : topPatterns.includes("\uC218\uD655\uD604\uC7A5\uD615") ? `"\uC218\uD655 \uD604\uC7A5\uC5D0\uC11C \uBC14\uB85C \uC628 \uB290\uB08C\uC744 \uC804\uB2EC\uD558\uB294 \uBB38\uC7A5 \uC0AC\uC6A9"` : topPatterns.includes("\uBABB\uB09C\uC774/\uD76C\uC18C\uC131\uD615") ? `"\uD76C\uC18C\uC131/\uD55C\uC815 \uC218\uB7C9 \uAD6C\uC870\uB97C \uC751\uC6A9"` : `"${product}\uC758 \uC81C\uCCA0\uAC10\uACFC \uC2E4\uD654\uC131\uC744 \uC911\uC2EC\uC73C\uB85C \uC791\uC131"`;
    const topVideoSummary = topVideo?.title?.length > 30 ? topVideo.title.substring(0, 28) + "..." : topVideo?.title || "";
    researchInsight = `[COPY-R \uC870\uC0AC \uC778\uC0AC\uC774\uD2B8 \u2014 ${product}]
\uC870\uC0AC \uCD9C\uCC98: YouTube ${allVideos.length}\uAC74 \uAC80\uC0C9
\uBD84\uC11D \uB300\uC0C1: \uAD00\uB828\uC131 \uD544\uD130 \uD1B5\uACFC ${filteredVideos.length}\uAC74
\uD3C9\uADE0 \uC870\uD68C\uC218: ${avgViews.toLocaleString()}\uD68C
\uCD5C\uACE0 \uBC18\uC751 \uC601\uC0C1: "${topVideoSummary}" (${topVideo?.viewCountFormatted}\uD68C)

\uBC18\uC751 \uC88B\uC740 \uAD6C\uC870:
${topPatterns.map((p) => `- ${p}`).join("\n")}

\uCE74\uD53C \uC801\uC6A9 \uBC29\uD5A5:
- ${hookFormula}
${concernKeywords.length > 0 ? `- \uC18C\uBE44\uC790 \uAD00\uC2EC: ${concernKeywords.join(", ")} \uC5B8\uAE09\uC2DC \uBC18\uC751\uB960 \uB192\uC74C` : ""}
- \uC81C\uCCA0\uAC10/\uC2E4\uD654\uC131/\uC0B0\uC9C0 \uC2A4\uD1A0\uB9AC\uB97C \uC911\uC2EC\uC73C\uB85C \uC791\uC131

\uD53C\uD574\uC57C \uD560 \uBC29\uD5A5:
- \uB2E8\uC21C \uD488\uBAA9\uBA85 \uBC18\uBCF5
- shorts/\uC601\uC5B4\uB85C \uAC19\uC740 \uAC80\uC0C9 \uB178\uC774\uC988 \uAE30\uBC18 \uBB38\uAD6C`;
    researchInsight += `

[COPY-A \uC8FC\uC785 \uC778\uC0AC\uC774\uD2B8]
\uD575\uC2EC \uD328\uD134: ${topPatterns.join(" + ")}
\uC18C\uBE44\uC790 \uAD00\uC2EC/\uBD88\uC548: ${concernKeywords.length > 0 ? concernKeywords.join(", ") : "\uC2E4\uD654\uC131/\uC81C\uCCA0\uAC10"}
\uCD94\uCC9C \uD6C4\uD0B9 \uACF5\uC2DD: ${hookFormula}
\uCE74\uD53C \uC801\uC6A9 \uBC29\uD5A5: ${product}\uC758 \uC81C\uCCA0\uAC10\uACFC \uC2E4\uD654\uC131\uC744 \uC911\uC2EC\uC73C\uB85C \uC791\uC131
\uD53C\uD574\uC57C \uD560 \uD45C\uD604: shorts/\uC601\uC5B4\uB85C \uAC19\uC740 \uAC80\uC0C9 \uB178\uC774\uC988\uB294 \uCE74\uD53C\uC5D0 \uBC18\uC601\uD558\uC9C0 \uC54A\uB294\uB2E4`;
  } else if (failReason) {
    console.error(`[COPY-R] \uC2E4\uD328 \uC6D0\uC778: ${failReason}`);
    researchInsight = "";
  } else {
    researchInsight = "";
  }
  return {
    success: true,
    product,
    contentType,
    researchInsight,
    videosFound: filteredVideos.length,
    totalSearched: allVideos.length,
    failReason: failReason || void 0,
    topVideos: filteredVideos.slice(0, 3).map((v) => ({ title: v.title, viewCount: v.viewCountFormatted, url: v.url }))
  };
}
async function handleGrowthLink(params) {
  const product = params?.product || params?.prompt || "\uB18D\uC0B0\uBB3C";
  const platform = params?.platform || "instagram";
  const strategies = {
    instagram: `\u{1F4F8} \uC778\uC2A4\uD0C0\uADF8\uB7A8 Growth Link \uC804\uB7B5
\u2022 \uD504\uB85C\uD544 \uB9C1\uD06C: \uC2A4\uB9C8\uD2B8\uC2A4\uD1A0\uC5B4 \uC0C1\uD488 \uD398\uC774\uC9C0 \uC5F0\uACB0
\u2022 \uC2A4\uD1A0\uB9AC \uD558\uC774\uB77C\uC774\uD2B8: "${product}" \uD6C4\uAE30 \uBAA8\uC74C
\u2022 \uB9B4\uC2A4 CTA: "\uD504\uB85C\uD544 \uB9C1\uD06C\uC5D0\uC11C \uB9CC\uB098\uC694"
\u2022 \uD574\uC2DC\uD0DC\uADF8: #${product} #\uC0B0\uC9C0\uC9C1\uC1A1 #\uC624\uB298\uC218\uD655`,
    thread: `\u{1F9F5} \uC2A4\uB808\uB4DC Growth Link \uC804\uB7B5
\u2022 \uCCAB \uAE00: \uD638\uAE30\uC2EC \uC720\uBC1C \uD6C4\uD0B9
\u2022 \uB9C8\uC9C0\uB9C9 \uC904: "\uAD81\uAE08\uD558\uBA74 DM \uC8FC\uC138\uC694"
\u2022 \uB313\uAE00 \uC720\uB3C4: "\uC5B4\uB514\uC11C \uC0AC\uC694?" \uC790\uC5F0 \uC720\uB3C4
\u2022 \uB9C1\uD06C \uACF5\uC720: \uD504\uB85C\uD544 or \uB313\uAE00 \uACE0\uC815`,
    kakao: `\u{1F49B} \uCE74\uCE74\uC624\uD1A1 Growth Link \uC804\uB7B5
\u2022 \uC624\uD508\uCC44\uD305\uBC29: "${product} \uACF5\uB3D9\uAD6C\uB9E4\uBC29"
\u2022 \uACF5\uC9C0 \uBA54\uC2DC\uC9C0: \uD55C\uC815\uC218\uB7C9 + \uB9C8\uAC10\uC2DC\uAC04
\u2022 1:1 \uCC44\uD305: \uBB38\uC758 \u2192 \uAD6C\uB9E4 \uC804\uD658
\u2022 \uD50C\uB7EC\uC2A4\uCE5C\uAD6C: \uC790\uB3D9 \uC751\uB2F5 + \uCFE0\uD3F0`
  };
  const content = strategies[platform] || strategies.instagram;
  return {
    success: true,
    product,
    platform,
    content,
    strategy: content
  };
}
function getDiagnostics() {
  return {
    runtime: "vercel-node",
    proxyConfigured: !!QUOTAGUARD_URL,
    proxyScheme: getProxyScheme(),
    agentType: getAgentType(),
    outboundIpMatchedAllowedList: !!QUOTAGUARD_URL,
    // QuotaGuard 사용 시 등록된 IP로 나감
    naverClientConfigured: !!(SMARTSTORE_CLIENT_ID && SMARTSTORE_CLIENT_SECRET),
    openaiConfigured: !!OPENAI_API_KEY,
    directNaverCallWithoutProxy: false,
    cloudPcDependency: false,
    cloudflaredDependency: false
  };
}
function getDbConnection() {
  return import_promise.default.createConnection({
    host: process.env.TIDB_HOST || "",
    port: Number(process.env.TIDB_PORT) || 4e3,
    user: process.env.TIDB_USER || "",
    password: process.env.TIDB_PASSWORD || "",
    database: process.env.TIDB_DATABASE || "jarvis",
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true }
  });
}
function extractContactInfo(description, brandDesc = "") {
  const allText = description + "\n" + brandDesc;
  const emailMatches = allText.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [];
  const businessEmail = emailMatches.find(
    (e) => !e.includes("example.com") && !e.includes("noreply") && !e.includes("no-reply")
  ) || "";
  const igMatch = allText.match(/(?:instagram\.com|instagr\.am)\/([a-zA-Z0-9_.]+)/i);
  const instagram = igMatch ? igMatch[1].replace(/\/$/, "") : "";
  return { email: businessEmail, instagram };
}
const CATEGORY_KEYWORDS = {
  "\uB9DB\uC9D1": ["\uB9DB\uC9D1 \uB9AC\uBDF0", "\uBA39\uBC29 \uC720\uD29C\uBC84", "\uB9DB\uC9D1 \uCD94\uCC9C"],
  "\uBA39\uBC29": ["\uBA39\uBC29", "\uBA39\uBC29 \uC720\uD29C\uBC84", "\uB300\uC2DD\uAC00"],
  "\uB18D\uC0B0\uBB3C": ["\uB18D\uC0B0\uBB3C \uB9AC\uBDF0", "\uB18D\uAC00 \uC720\uD29C\uBC84", "\uB85C\uCEEC\uD478\uB4DC \uB9AC\uBDF0"],
  "\uCEA0\uD551": ["\uCEA0\uD551 \uC720\uD29C\uBC84", "\uCC28\uBC15 \uBE0C\uC774\uB85C\uADF8"],
  "\uBDF0\uD2F0": ["\uBDF0\uD2F0 \uC720\uD29C\uBC84", "\uD654\uC7A5\uD488 \uB9AC\uBDF0", "\uBA54\uC774\uD06C\uC5C5 \uD29C\uD1A0\uB9AC\uC5BC"],
  "\uC5EC\uD589": ["\uC5EC\uD589 \uBE0C\uC774\uB85C\uADF8", "\uC5EC\uD589 \uC720\uD29C\uBC84"],
  "\uD328\uC158": ["\uD328\uC158 \uC720\uD29C\uBC84", "\uCF54\uB514 \uCD94\uCC9C"],
  "\uC6B4\uB3D9": ["\uC6B4\uB3D9 \uC720\uD29C\uBC84", "\uD648\uD2B8\uB808\uC774\uB2DD", "\uD53C\uD2B8\uB2C8\uC2A4"]
};
function formatNumber(num) {
  if (num >= 1e8) return `${(num / 1e8).toFixed(1)}\uC5B5`;
  if (num >= 1e4) return `${(num / 1e4).toFixed(1)}\uB9CC`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}\uCC9C`;
  return num.toString();
}
function getRelativeTime(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const hours = Math.floor(diff / 36e5);
  if (hours < 1) return "\uBC29\uAE08 \uC804";
  if (hours < 24) return `${hours}\uC2DC\uAC04 \uC804`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}\uC77C \uC804`;
  if (days < 30) return `${Math.floor(days / 7)}\uC8FC \uC804`;
  if (days < 365) return `${Math.floor(days / 30)}\uAC1C\uC6D4 \uC804`;
  return `${Math.floor(days / 365)}\uB144 \uC804`;
}
async function searchYouTubeDirect(keyword, maxResults = 10) {
  if (!YOUTUBE_API_KEY) throw new Error("YOUTUBE_API_KEY \uD658\uACBD\uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
  const keywords = CATEGORY_KEYWORDS[keyword] || [keyword];
  const count = Math.min(maxResults, 50);
  const allResults = [];
  for (const kw of keywords) {
    if (allResults.length >= count) break;
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(kw)}&maxResults=50&regionCode=KR&hl=ko&key=${YOUTUBE_API_KEY}`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) continue;
    const searchData = await searchRes.json();
    if (!searchData.items || searchData.items.length === 0) continue;
    const channelIds = searchData.items.map((item) => item.snippet.channelId || item.id.channelId).join(",");
    const channelsUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&id=${channelIds}&key=${YOUTUBE_API_KEY}`;
    const channelsRes = await fetch(channelsUrl);
    if (!channelsRes.ok) continue;
    const channelsData = await channelsRes.json();
    for (const ch of channelsData.items || []) {
      if (allResults.length >= count) break;
      const snippet = ch.snippet || {};
      const stats = ch.statistics || {};
      const branding = ch.brandingSettings?.channel || {};
      const subs = parseInt(stats.subscriberCount || "0", 10);
      const views = parseInt(stats.viewCount || "0", 10);
      const videos = parseInt(stats.videoCount || "1", 10);
      const avgViews = videos > 0 ? Math.round(views / videos) : 0;
      const contact = extractContactInfo(snippet.description || "", branding.description || "");
      allResults.push({
        channelId: ch.id,
        title: snippet.title,
        description: (snippet.description || "").substring(0, 300),
        customUrl: snippet.customUrl || "",
        thumbnailUrl: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || "",
        subscriberCount: subs,
        subscriberFormatted: formatNumber(subs),
        videoCount: videos,
        viewCount: views,
        avgViews,
        channelUrl: `https://www.youtube.com/channel/${ch.id}`,
        email: contact.email,
        instagram: contact.instagram,
        category: keyword,
        source: "YouTube Data API v3"
      });
    }
  }
  return { success: true, result: allResults };
}
async function searchPopularVideos(keyword, maxResults = 5, period = "") {
  if (!YOUTUBE_API_KEY) throw new Error("YOUTUBE_API_KEY \uD658\uACBD\uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
  let publishedAfter = "";
  if (period === "day") publishedAfter = new Date(Date.now() - 864e5).toISOString();
  else if (period === "week") publishedAfter = new Date(Date.now() - 7 * 864e5).toISOString();
  else if (period === "month") publishedAfter = new Date(Date.now() - 30 * 864e5).toISOString();
  else if (period === "year") publishedAfter = new Date(Date.now() - 365 * 864e5).toISOString();
  const count = Math.min(maxResults, 20);
  let searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(keyword)}&order=viewCount&maxResults=${count}&regionCode=KR&hl=ko&key=${YOUTUBE_API_KEY}`;
  if (publishedAfter) searchUrl += `&publishedAfter=${publishedAfter}`;
  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) throw new Error(`YouTube Search API \uC624\uB958: ${searchRes.status}`);
  const searchData = await searchRes.json();
  if (!searchData.items || searchData.items.length === 0) return { success: true, videos: [], analysis: "", summary: "\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." };
  const videoIds = searchData.items.map((item) => item.id.videoId).join(",");
  const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
  const videosRes = await fetch(videosUrl);
  if (!videosRes.ok) throw new Error(`YouTube Videos API \uC624\uB958: ${videosRes.status}`);
  const videosData = await videosRes.json();
  const videos = (videosData.items || []).map((v) => {
    const stats = v.statistics || {};
    const viewCount = parseInt(stats.viewCount || "0", 10);
    const likeCount = parseInt(stats.likeCount || "0", 10);
    const commentCount = parseInt(stats.commentCount || "0", 10);
    return {
      videoId: v.id,
      title: v.snippet.title,
      channelName: v.snippet.channelTitle,
      channelId: v.snippet.channelId,
      description: (v.snippet.description || "").substring(0, 200),
      publishedAt: v.snippet.publishedAt,
      publishedAgo: getRelativeTime(v.snippet.publishedAt),
      viewCount,
      viewCountFormatted: formatNumber(viewCount),
      likeCount,
      commentCount,
      engagementRate: viewCount > 0 ? ((likeCount + commentCount) / viewCount * 100).toFixed(2) + "%" : "0%",
      url: `https://www.youtube.com/watch?v=${v.id}`,
      thumbnailUrl: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.medium?.url || ""
    };
  });
  const summary = `"${keyword}" \uAD00\uB828 \uC778\uAE30 \uC601\uC0C1 ${videos.length}\uAC74\uC744 \uCC3E\uC558\uC2B5\uB2C8\uB2E4.`;
  return { success: true, videos, analysis: "", summary };
}
const WORKSPACE_SHEET_ID = process.env.JARVIS_WORKSPACE_SHEET_ID || "";
const GOOGLE_SHEETS_CREDENTIALS = process.env.GOOGLE_SHEETS_CREDENTIALS || "";
async function getGoogleSheetsToken() {
  if (!GOOGLE_SHEETS_CREDENTIALS) throw new Error("GOOGLE_SHEETS_CREDENTIALS not configured");
  const credentials = JSON.parse(GOOGLE_SHEETS_CREDENTIALS);
  const now = Math.floor(Date.now() / 1e3);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  })).toString("base64url");
  const sign = import_crypto.default.createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(credentials.private_key, "base64url");
  const jwt = `${header}.${payload}.${signature}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("Google Sheets token failed");
  return tokenData.access_token;
}
async function sheetsAppend(tab, values) {
  const token = await getGoogleSheetsToken();
  const range = encodeURIComponent(`${tab}!A1`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Sheets append error (${res.status}): ${JSON.stringify(data.error?.message || data)}`);
  return data;
}
async function sheetsRead(tab, range) {
  const token = await getGoogleSheetsToken();
  const r = range || `${tab}!A1:Z1000`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${encodeURIComponent(r)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`Sheets read error (${res.status}): ${JSON.stringify(data.error?.message || data)}`);
  return data;
}
const OUTREACH_CRM_TAB = "influencer_candidates_v2";
const SHEET_HEADERS = {
  jarvis_records: ["recordId", "createdAt", "type", "title", "summary", "sourceCommand", "status", "tags", "linkedSheetTab", "createdBy", "safePreview"],
  briefings: ["briefingId", "createdAt", "todayOrders", "currentNewOrders", "pendingShipping", "preShipTotal", "todaySales", "recommendedActions", "briefingText"],
  creative_scripts: ["scriptId", "createdAt", "product", "platform", "hook", "caption", "threadPost", "kakaoMessage", "reelsScript", "recommendedGrowthLink", "status", "sourceCommand"],
  growth_campaigns: ["campaignId", "createdAt", "product", "source", "targetUrl", "directUrl", "couponCode", "campaignMemo", "status"],
  purchase_order_drafts: ["draftId", "createdAt", "supplier", "productSummary", "totalQuantity", "totalAmountIfAvailable", "status", "safePreview"],
  influencer_candidates: ["influencer_id", "platform", "channel_name", "handle", "profile_url", "contact_email", "contact_url", "email_status", "category_tags", "source_keyword", "source_product", "followers_or_subscribers", "avg_views", "fit_score", "fit_reason", "outreach_status", "last_contacted_at", "reply_status", "next_action", "duplicate_hash", "created_at", "updated_at", "notes"],
  influencer_candidates_v2: ["influencer_id", "platform", "channel_name", "handle", "profile_url", "contact_email", "contact_url", "email_status", "category_tags", "source_keyword", "source_product", "followers_or_subscribers", "avg_views", "fit_score", "fit_reason", "outreach_status", "last_contacted_at", "reply_status", "next_action", "duplicate_hash", "created_at", "updated_at", "notes", "proposal_angle", "proposal_subject", "proposal_draft"],
  market_price_checks: ["checkId", "createdAt", "productName", "rawMaterialCost", "currentPrice", "shippingCost", "packagingCost", "platformFeeRate", "otherCosts", "competitorPrices", "competitorMinPrice", "competitorAvgPrice", "netSalesAmount", "estimatedMargin", "estimatedMarginRate", "jarvisDecision", "recommendedAction", "sourceCommand"],
  // DAILY-BRIEF-A.1: Daily Brief 4탭
  daily_operations_brief: ["brief_id", "date_kst", "period_start_kst", "period_end_kst", "smartstore_new_orders", "smartstore_ready_orders", "smartstore_delivering", "smartstore_delivered", "smartstore_purchase_decided", "smartstore_confirm_needed", "outreach_discovered", "outreach_public_email_found", "outreach_contact_url_found", "outreach_draft_ready", "outreach_approval_waiting", "outreach_email_sent", "outreach_positive_replies", "outreach_accepted", "outreach_followup_needed", "outreach_followup_drafted", "outreach_followup_sent", "hot_youtube_count", "hot_threads_count", "hot_instagram_count", "hot_tiktok_count", "hot_naver_blog_count", "telegram_sent", "telegram_sent_at", "telegram_error_code", "created_at", "notes"],
  outreach_agent_runs: ["run_id", "date_kst", "mission", "product", "source_keyword", "target_count", "status", "started_at", "completed_at", "current_node", "discovered_count", "contact_found_count", "draft_ready_count", "approval_waiting_count", "sent_count", "reply_count", "positive_reply_count", "accepted_count", "followup_needed_count", "followup_sent_count", "failed_count", "notes"],
  outreach_candidate_events: ["event_id", "candidate_id", "platform", "profile_url", "event_type", "event_time", "source", "message_id", "status_before", "status_after", "notes"],
  telegram_notification_logs: ["notification_id", "brief_id", "channel", "sent", "sent_at", "error_code", "error_message", "created_at", "notes"]
};
async function ensureTab(tab) {
  const token = await getGoogleSheetsToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}:batchUpdate`;
  await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] })
  });
}
async function ensureHeaders(tab) {
  const headers = SHEET_HEADERS[tab];
  if (!headers) return;
  try {
    const lastCol = String.fromCharCode(64 + headers.length);
    const result = await sheetsRead(tab, `${tab}!A1:${lastCol}1`);
    const existingHeaders = result.values?.[0] || [];
    if (existingHeaders.length === 0) {
      const token = await getGoogleSheetsToken();
      const range = encodeURIComponent(`${tab}!A1`);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${range}?valueInputOption=RAW`;
      await fetch(url, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [headers] })
      });
    } else if (existingHeaders.length < headers.length) {
      const missingHeaders = headers.slice(existingHeaders.length);
      const startColLetter = String.fromCharCode(65 + existingHeaders.length);
      const token = await getGoogleSheetsToken();
      const range = encodeURIComponent(`${tab}!${startColLetter}1`);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${range}?valueInputOption=RAW`;
      await fetch(url, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [missingHeaders] })
      });
    }
  } catch (e) {
    if (e.message?.includes("Unable to parse range") || e.message?.includes("400") || e.message?.includes("404")) {
      await ensureTab(tab);
      const token = await getGoogleSheetsToken();
      const range = encodeURIComponent(`${tab}!A1`);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${range}?valueInputOption=RAW`;
      await fetch(url, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [headers] })
      });
    } else {
      throw e;
    }
  }
}
function generateRecordId(type) {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${type}-${ts}-${rand}`;
}
async function handleWorkspaceSave(params) {
  if (!WORKSPACE_SHEET_ID || !GOOGLE_SHEETS_CREDENTIALS) {
    return { success: false, error: "Google Sheets not configured" };
  }
  const { type, data, sourceCommand } = params;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const recordId = generateRecordId(type);
  try {
    const targetTab = type === "briefing" ? "briefings" : type === "creative_script" ? "creative_scripts" : type === "growth_campaign" ? "growth_campaigns" : type === "purchase_order_draft" ? "purchase_order_drafts" : type === "market_price_check" ? "market_price_checks" : "";
    if (targetTab) await ensureHeaders(targetTab);
    await ensureHeaders("jarvis_records");
    if (type === "briefing" && data) {
      await sheetsAppend("briefings", [[
        recordId,
        now,
        String(data.todayOrders || 0),
        String(data.currentNewOrders || 0),
        String(data.pendingShipping || 0),
        String(data.preShipTotal || 0),
        String(data.todaySales || 0),
        data.recommendedActions || "",
        data.briefingText || ""
      ]]);
    } else if (type === "creative_script" && data) {
      await sheetsAppend("creative_scripts", [[
        recordId,
        now,
        data.product || "",
        data.platform || "full_package",
        data.hook || "",
        data.caption || "",
        data.threadPost || "",
        data.kakaoMessage || "",
        data.reelsScript || "",
        data.recommendedGrowthLink || "",
        "saved",
        sourceCommand || ""
      ]]);
    } else if (type === "growth_campaign" && data) {
      await sheetsAppend("growth_campaigns", [[
        recordId,
        now,
        data.product || "",
        data.source || "",
        data.targetUrl || "",
        data.directUrl || "",
        data.couponCode || "",
        data.campaignMemo || "",
        "saved"
      ]]);
    } else if (type === "purchase_order_draft" && data) {
      await sheetsAppend("purchase_order_drafts", [[
        recordId,
        now,
        data.supplier || "",
        data.productSummary || "",
        String(data.totalQuantity || 0),
        String(data.totalAmountIfAvailable || ""),
        "draft",
        data.safePreview || ""
      ]]);
    } else if (type === "market_price_check" && data) {
      await ensureHeaders("market_price_checks");
      await sheetsAppend("market_price_checks", [[
        recordId,
        now,
        data.productName || "",
        String(data.rawMaterialCost || 0),
        String(data.currentPrice || 0),
        String(data.shippingCost || 0),
        String(data.packagingCost || 0),
        String(data.platformFeeRate || 0),
        String(data.otherCosts || 0),
        data.competitorPrices || "",
        String(data.competitorMinPrice || 0),
        String(data.competitorAvgPrice || 0),
        String(data.netSalesAmount || 0),
        String(data.estimatedMargin || 0),
        String(data.estimatedMarginRate || 0),
        data.jarvisDecision || "",
        data.recommendedAction || "",
        sourceCommand || ""
      ]]);
    } else if (type === "influencer_candidate" && data) {
      await ensureHeaders(OUTREACH_CRM_TAB);
      await sheetsAppend(OUTREACH_CRM_TAB, [[
        recordId,
        now,
        data.platform || "",
        data.keyword || "",
        data.name || "",
        data.channelOrBlogUrl || "",
        data.recentContentTitle || "",
        data.recentContentUrl || "",
        String(data.subscriberOrVisitor || ""),
        String(data.viewCount || ""),
        data.publicContactStatus || "unknown",
        data.publicEmailMasked || "",
        String(data.productFitScore || 0),
        data.productFitReason || "",
        data.suggestedProduct || "",
        data.suggestedOfferAngle || "",
        data.outreachStatus || "pending",
        data.firstEmailDraft || "",
        data.followUpDraft || "",
        "",
        "none",
        data.notes || ""
      ]]);
    }
    const title = data?.title || data?.product || type;
    const summary = data?.summary || data?.safePreview || "";
    await sheetsAppend("jarvis_records", [[
      recordId,
      now,
      type,
      title,
      summary.slice(0, 200),
      sourceCommand || "",
      "saved",
      type,
      type === "briefing" ? "briefings" : type === "creative_script" ? "creative_scripts" : type === "growth_campaign" ? "growth_campaigns" : type === "purchase_order_draft" ? "purchase_order_drafts" : type === "market_price_check" ? "market_price_checks" : type === "influencer_candidate" ? OUTREACH_CRM_TAB : "jarvis_records",
      "jarvis",
      summary.slice(0, 100)
    ]]);
    return { success: true, recordId, type, savedAt: now, message: `${title} \uC800\uC7A5 \uC644\uB8CC` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
async function handleWorkspaceQuery(params) {
  if (!WORKSPACE_SHEET_ID || !GOOGLE_SHEETS_CREDENTIALS) {
    return { success: false, error: "Google Sheets not configured" };
  }
  const { type, recordId, limit } = params;
  try {
    const tab = type === "briefing" ? "briefings" : type === "creative_script" ? "creative_scripts" : type === "growth_campaign" ? "growth_campaigns" : type === "purchase_order_draft" ? "purchase_order_drafts" : "jarvis_records";
    const result = await sheetsRead(tab);
    const rows = result.values || [];
    if (rows.length < 2) return { success: true, records: [], total: 0 };
    const headers = rows[0];
    let records = rows.slice(1).map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] || "";
      });
      return obj;
    });
    if (recordId) records = records.filter((r) => r.recordId === recordId || r.briefingId === recordId || r.scriptId === recordId || r.campaignId === recordId || r.draftId === recordId);
    records.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const maxRecords = limit || 20;
    return { success: true, records: records.slice(0, maxRecords), total: records.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
async function handleWorkspaceList(params) {
  if (!WORKSPACE_SHEET_ID || !GOOGLE_SHEETS_CREDENTIALS) {
    return { success: false, error: "Google Sheets not configured" };
  }
  try {
    const result = await sheetsRead("jarvis_records");
    const rows = result.values || [];
    if (rows.length < 2) return { success: true, records: [], total: 0 };
    const headers = rows[0];
    let records = rows.slice(1).map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] || "";
      });
      return obj;
    });
    records.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const limit = params?.limit || 20;
    const typeFilter = params?.type;
    if (typeFilter) records = records.filter((r) => r.type === typeFilter);
    return { success: true, records: records.slice(0, limit), total: records.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
function maskEmail(email) {
  if (!email || !email.includes("@")) return "";
  const [local, domain] = email.split("@");
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}
function calculateProductFitScore(channel, keyword, product) {
  let score = 0;
  const reasons = [];
  const desc = (channel.description || "").toLowerCase();
  const title = (channel.title || channel.name || "").toLowerCase();
  const contentTitle = (channel.recentContentTitle || "").toLowerCase();
  const allText = `${desc} ${title} ${contentTitle}`;
  const productKeywords = product ? product.toLowerCase().split(/[\s,]+/) : keyword.toLowerCase().split(/[\s,]+/);
  const matchedKws = productKeywords.filter((kw) => kw.length > 1 && allText.includes(kw));
  if (matchedKws.length >= 2) {
    score += 25;
    reasons.push("\uC0C1\uD488 \uD0A4\uC6CC\uB4DC \uAC15\uD55C \uB9E4\uCE6D");
  } else if (matchedKws.length >= 1) {
    score += 15;
    reasons.push("\uC0C1\uD488 \uD0A4\uC6CC\uB4DC \uBD80\uBD84 \uB9E4\uCE6D");
  } else {
    score += 5;
  }
  const subs = channel.subscriberCount || channel.subscribers || 0;
  const views = channel.viewCount || 0;
  if (subs >= 1e4 && subs <= 5e5) {
    score += 20;
    reasons.push("\uB9C8\uC774\uD06C\uB85C \uC778\uD50C\uB8E8\uC5B8\uC11C (\uACF5\uB3D9\uAD6C\uB9E4 \uCD5C\uC801)");
  } else if (subs >= 1e3 && subs < 1e4) {
    score += 15;
    reasons.push("\uB098\uB178 \uC778\uD50C\uB8E8\uC5B8\uC11C (\uB192\uC740 \uCC38\uC5EC\uC728 \uAE30\uB300)");
  } else if (subs > 5e5) {
    score += 10;
    reasons.push("\uB300\uD615 \uCC44\uB110 (\uB2E8\uAC00 \uB192\uC744 \uC218 \uC788\uC74C)");
  } else {
    score += 5;
  }
  const lifestyleKws = ["\uACF5\uB3D9\uAD6C\uB9E4", "\uACF5\uAD6C", "\uBA39\uBC29", "\uCEA0\uD551", "\uAC00\uC871", "\uC9D1\uBC25", "\uC721\uC544", "\uC81C\uCCA0", "\uB18D\uC0B0\uBB3C", "\uAC04\uC2DD", "\uC694\uB9AC", "\uB808\uC2DC\uD53C", "\uB9AC\uBDF0", "\uCCB4\uD5D8", "\uD611\uCC2C"];
  const lifestyleMatches = lifestyleKws.filter((kw) => allText.includes(kw));
  if (lifestyleMatches.length >= 3) {
    score += 25;
    reasons.push(`\uB77C\uC774\uD504\uC2A4\uD0C0\uC77C \uAC15\uD55C \uC5F0\uACB0 (${lifestyleMatches.slice(0, 3).join(", ")})`);
  } else if (lifestyleMatches.length >= 1) {
    score += 15;
    reasons.push(`\uB77C\uC774\uD504\uC2A4\uD0C0\uC77C \uBD80\uBD84 \uC5F0\uACB0 (${lifestyleMatches.join(", ")})`);
  } else {
    score += 5;
  }
  if (views > 1e7) {
    score += 15;
    reasons.push("\uB192\uC740 \uCD1D \uC870\uD68C\uC218");
  } else if (views > 1e6) {
    score += 10;
    reasons.push("\uC591\uD638\uD55C \uC870\uD68C\uC218");
  } else {
    score += 5;
  }
  if (channel.email && channel.email.includes("@")) {
    score += 15;
    reasons.push("\uACF5\uAC1C \uC774\uBA54\uC77C \uD655\uC778\uB428");
  } else if (channel.publicContactStatus === "form_available") {
    score += 10;
    reasons.push("\uD611\uC5C5 \uBB38\uC758 \uD3FC \uD655\uC778\uB428");
  } else {
    score += 3;
  }
  return { score: Math.min(score, 100), reason: reasons.join(". ") + "." };
}
const PRODUCT_ANGLE_MAP = {
  "\uBCF5\uC22D\uC544": ["\uC81C\uCCA0 \uACFC\uC77C / \uD5A5\uACFC \uB2F9\uB3C4", "\uC5EC\uB984 \uC2DC\uC98C \uC120\uBB3C \uC218\uC694", "\uBA39\uBC29/\uCEA0\uD551/\uAC00\uC871 \uCF58\uD150\uCE20 \uAD81\uD569", "\uC9E7\uC740 \uC218\uD655 \uC2DC\uC98C \uAE34\uBC15\uAC10"],
  "\uC625\uC218\uC218": ["\uC5EC\uB984 \uAC04\uC2DD / \uCAC0\uB4DD\uD55C \uC2DD\uAC10", "\uC0B0\uC9C0\uC9C1\uC1A1 \uC2E0\uB8B0", "\uCEA0\uD551/\uD734\uAC00\uCCA0 \uAC04\uC2DD", "\uAC00\uC871 \uC7AC\uAD6C\uB9E4 \uC720\uB3C4"],
  "\uCC30\uC625\uC218\uC218": ["\uC5EC\uB984 \uAC04\uC2DD / \uCAC0\uB4DD\uD55C \uC2DD\uAC10", "\uC0B0\uC9C0\uC9C1\uC1A1 \uC2E0\uB8B0", "\uCEA0\uD551/\uD734\uAC00\uCCA0 \uAC04\uC2DD", "\uAC00\uC871 \uC7AC\uAD6C\uB9E4 \uC720\uB3C4"],
  "\uC808\uC784\uBC30\uCD94": ["\uAE40\uC7A5\uCCA0 \uC608\uC57D \uC218\uC694", "\uC0B0\uC9C0 \uC6D0\uBB3C \uC548\uC815\uC131", "\uBC30\uC1A1 \uC77C\uC815 \uC2E0\uB8B0", "\uAC00\uC871 \uB2E8\uC704 \uAD6C\uB9E4"],
  "\uBC30\uCD94": ["\uAE40\uC7A5\uCCA0 \uC608\uC57D \uC218\uC694", "\uC0B0\uC9C0 \uC6D0\uBB3C \uC548\uC815\uC131", "\uBC30\uC1A1 \uC77C\uC815 \uC2E0\uB8B0", "\uAC00\uC871 \uB2E8\uC704 \uAD6C\uB9E4"],
  "\uB538\uAE30": ["\uACA8\uC6B8/\uBD04 \uC81C\uCCA0 \uACFC\uC77C", "\uB2F9\uB3C4\uC640 \uC2E0\uC120\uB3C4", "\uC120\uBB3C/\uB514\uC800\uD2B8 \uC218\uC694", "\uBA39\uBC29/\uBCA0\uC774\uD0B9 \uCF58\uD150\uCE20 \uAD81\uD569"],
  "\uC218\uBC15": ["\uC5EC\uB984 \uC81C\uCCA0 \uACFC\uC77C", "\uAC00\uC871 \uAC04\uC2DD", "\uCEA0\uD551/\uD53C\uD06C\uB2C9 \uCF58\uD150\uCE20", "\uC0B0\uC9C0\uC9C1\uC1A1 \uC2E0\uC120\uB3C4"],
  "\uAC10\uC790": ["\uC0AC\uACC4\uC808 \uAC04\uD3B8 \uC2DD\uC7AC\uB8CC", "\uC9D1\uBC25/\uC694\uB9AC \uCF58\uD150\uCE20", "\uC0B0\uC9C0\uC9C1\uC1A1 \uC2E0\uB8B0", "\uB300\uC6A9\uB7C9 \uAC00\uC131\uBE44"],
  "\uACE0\uAD6C\uB9C8": ["\uAC00\uC744/\uACA8\uC6B8 \uAC04\uC2DD", "\uAC74\uAC15 \uAC04\uC2DD \uC218\uC694", "\uCEA0\uD551/\uAD70\uACE0\uAD6C\uB9C8 \uCF58\uD150\uCE20", "\uC544\uC774 \uAC04\uC2DD"],
  "\uC0AC\uACFC": ["\uAC00\uC744 \uC81C\uCCA0 \uACFC\uC77C", "\uC120\uBB3C \uC218\uC694", "\uB2F9\uB3C4/\uC2DD\uAC10 \uAC15\uC870", "\uAC00\uC871 \uAC74\uAC15 \uAC04\uC2DD"],
  "\uBC30": ["\uAC00\uC744 \uC81C\uCCA0 \uACFC\uC77C", "\uC120\uBB3C \uC218\uC694", "\uC218\uBD84/\uB2F9\uB3C4 \uAC15\uC870", "\uBA85\uC808 \uC120\uBB3C \uAC01\uB3C4"]
};
function getProductAngles(product, keyword) {
  const p = product || keyword;
  for (const [key, angles] of Object.entries(PRODUCT_ANGLE_MAP)) {
    if (p.includes(key)) return angles;
  }
  return [`\uC81C\uCCA0 ${p} \uC0B0\uC9C0\uC9C1\uC1A1`, `${p} \uACF5\uB3D9\uAD6C\uB9E4 \uC2DC\uC98C \uC218\uC694`, `\uAC00\uC871/\uC77C\uC0C1 \uCF58\uD150\uCE20\uC640 \uC5F0\uACB0 \uAC00\uB2A5`, "\uCCB4\uD5D8 \uD6C4 \uACF5\uB3D9\uAD6C\uB9E4 \uC81C\uC548"];
}
function generateOfferAngle(channel, keyword, product) {
  const angles = getProductAngles(product, keyword);
  const name = channel.title || channel.name || "\uCC44\uB110";
  const category = (channel.description || channel.recentContentTitle || "").slice(0, 40);
  const p = product || keyword;
  const categoryHint = category ? `${category} \uCF58\uD150\uCE20` : "\uCF58\uD150\uCE20";
  return `${name}\uB2D8\uC758 ${categoryHint}\uC640 ${p} \uACF5\uB3D9\uAD6C\uB9E4 \uC5F0\uACB0 \uD3EC\uC778\uD2B8: ${angles.slice(0, 2).join(" / ")}`;
}
function generateProposalAngle(channel, keyword, product) {
  const angles = getProductAngles(product, keyword);
  return angles.join(" / ");
}
function generateProposalSubject(product, keyword) {
  const p = product || keyword;
  return `\uC81C\uCCA0 ${p} \uACF5\uB3D9\uAD6C\uB9E4 \uC81C\uC548\uB4DC\uB9BD\uB2C8\uB2E4`;
}
function generateProposalDraft(channel, keyword, product) {
  const name = channel.title || channel.name || "\uD06C\uB9AC\uC5D0\uC774\uD130";
  const p = product || keyword;
  const angles = getProductAngles(p, keyword);
  const angleStr = angles.slice(0, 2).join(", ");
  return `\uC548\uB155\uD558\uC138\uC694, ${name}\uB2D8.
\uCC44\uB110\uC5D0\uC11C ${angleStr} \uAD00\uB828 \uCF58\uD150\uCE20\uC640 \uC798 \uB9DE\uB294 \uC0C1\uD488\uC744 \uC81C\uC548\uB4DC\uB9AC\uACE0 \uC2F6\uC5B4 \uC5F0\uB77D\uB4DC\uB9BD\uB2C8\uB2E4.
\uC774\uBC88 \uC0C1\uD488\uC740 ${p} \uACF5\uB3D9\uAD6C\uB9E4\uC785\uB2C8\uB2E4.
${p}\uB294 ${angles[0]}\uB85C \uC9E7\uC740 \uAE30\uAC04 \uC548\uC5D0 \uBC18\uC751\uC744 \uB9CC\uB4E4\uAE30 \uC88B\uC740 \uD488\uBAA9\uC785\uB2C8\uB2E4.
${name}\uB2D8\uC758 \uCF58\uD150\uCE20 \uD1A4\uACFC\uB3C4 \uC798 \uB9DE\uC544 \uAD6C\uB3C5\uC790\uBD84\uB4E4\uC774 \uBD80\uB2F4 \uC5C6\uC774 \uAD00\uC2EC\uC744 \uAC00\uC9C8 \uC218 \uC788\uC744 \uAC83 \uAC19\uC2B5\uB2C8\uB2E4.
\uC870\uAC74\uC774 \uB9DE\uC73C\uC2DC\uBA74 \uC0D8\uD50C/\uACF5\uB3D9\uAD6C\uB9E4 \uC870\uAC74\uC744 \uAC04\uB2E8\uD788 \uC804\uB2EC\uB4DC\uB9AC\uACA0\uC2B5\uB2C8\uB2E4.`;
}
function generateFirstEmailDraft(channel, keyword, product) {
  const name = channel.title || channel.name || "\uD06C\uB9AC\uC5D0\uC774\uD130";
  const contentTitle = channel.recentContentTitle || "\uCD5C\uADFC \uCF58\uD150\uCE20";
  return `\uC548\uB155\uD558\uC138\uC694 ${name}\uB2D8,

\uCD5C\uADFC \uC62C\uB824\uC8FC\uC2E0 "${contentTitle.slice(0, 40)}" \uC601\uC0C1/\uAE00\uC744 \uC778\uC0C1 \uAE4A\uAC8C \uBD24\uC2B5\uB2C8\uB2E4.
\uC800\uD76C\uB294 ${product || keyword} \uC0B0\uC9C0\uC9C1\uC1A1 \uB18D\uC0B0\uBB3C\uC744 \uD310\uB9E4\uD558\uACE0 \uC788\uB294 \uC2A4\uB9C8\uD2B8\uC2A4\uD1A0\uC5B4 \uC140\uB7EC\uC785\uB2C8\uB2E4.

${name}\uB2D8\uC758 \uCF58\uD150\uCE20 \uBD84\uC704\uAE30\uC640 \uC800\uD76C \uC0C1\uD488\uC774 \uC798 \uC5B4\uC6B8\uB9B4 \uAC83 \uAC19\uC544 \uACF5\uB3D9\uAD6C\uB9E4 \uB610\uB294 \uCCB4\uD5D8 \uD611\uC5C5\uC744 \uC81C\uC548\uB4DC\uB9BD\uB2C8\uB2E4.

- \uC0C1\uD488: ${product || keyword} (\uC0B0\uC9C0\uC9C1\uC1A1, \uB2F9\uC77C\uC218\uD655)
- \uC81C\uC548: \uCCB4\uD5D8 \uC81C\uACF5 + \uACF5\uB3D9\uAD6C\uB9E4 \uB9C1\uD06C (\uC218\uC218\uB8CC \uD611\uC758 \uAC00\uB2A5)
- \uBD80\uB2F4 \uC5C6\uC774 \uBA3C\uC800 \uB9DB\uBCF4\uC2DC\uACE0 \uD310\uB2E8\uD574\uC8FC\uC154\uB3C4 \uB429\uB2C8\uB2E4

\uAD00\uC2EC \uC788\uC73C\uC2DC\uBA74 \uD3B8\uD558\uAC8C \uD68C\uC2E0 \uBD80\uD0C1\uB4DC\uB9BD\uB2C8\uB2E4.
\uAC10\uC0AC\uD569\uB2C8\uB2E4.`;
}
function generateFollowUpDraft(channel, keyword, product) {
  const name = channel.title || channel.name || "\uD06C\uB9AC\uC5D0\uC774\uD130";
  return `\uC548\uB155\uD558\uC138\uC694 ${name}\uB2D8,

\uC9C0\uB09C\uBC88 ${product || keyword} \uACF5\uB3D9\uAD6C\uB9E4 \uC81C\uC548 \uBA54\uC77C \uBCF4\uB0B4\uB4DC\uB838\uC5C8\uB294\uB370, \uD639\uC2DC \uD655\uC778\uD558\uC168\uC744\uAE4C\uC694?

\uC694\uC998 ${product || keyword} \uC2DC\uC98C\uC774\uB77C \uBB3C\uB7C9\uC774 \uD55C\uC815\uB418\uC5B4 \uC788\uC5B4\uC11C, \uAD00\uC2EC \uC788\uC73C\uC2DC\uBA74 \uC774\uBC88 \uC8FC \uB0B4\uB85C \uC0D8\uD50C\uC744 \uBCF4\uB0B4\uB4DC\uB9B4 \uC218 \uC788\uC2B5\uB2C8\uB2E4.

\uBD80\uB2F4 \uC5C6\uC774 \uB9DB\uB9CC \uBCF4\uC2DC\uACE0 \uAD1C\uCC2E\uC73C\uC2DC\uBA74 \uADF8\uB54C \uD611\uC5C5 \uBC29\uC2DD\uC744 \uB17C\uC758\uD574\uB3C4 \uB429\uB2C8\uB2E4.
\uBC14\uC058\uC2DC\uBA74 \uAC04\uB2E8\uD788 "\uAD00\uC2EC \uC788\uC5B4\uC694" \uB610\uB294 "\uB2E4\uC74C\uC5D0\uC694"\uB9CC \uD68C\uC2E0 \uC8FC\uC154\uB3C4 \uAC10\uC0AC\uD558\uACA0\uC2B5\uB2C8\uB2E4.

\uC88B\uC740 \uD558\uB8E8 \uB418\uC138\uC694!`;
}
async function handleOutreachCollect(params) {
  const { keyword, product, maxCandidates = 20, platform = "all", requireEmail = true, existingCandidateIds = [] } = params;
  if (!keyword) return { success: false, error: "keyword required" };
  const candidates = [];
  const excludedCandidates = [];
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const max = Math.min(maxCandidates, 50);
  const productName = product || keyword;
  const telemetry = {
    apiCalls: 0,
    quotaUsed: 0,
    // YouTube API quota units
    searchCalls: 0,
    // search.list (100 units each)
    channelCalls: 0,
    // channels.list (1 unit each)
    videoCalls: 0,
    // videos.list (1 unit each)
    naverCalls: 0,
    trendChannelsFound: 0,
    searchChannelsFound: 0,
    emailsVerified: 0,
    deduped: 0
  };
  const existingIds = new Set(existingCandidateIds);
  const PRACTICAL_SEGMENTS = {
    "\uBA39\uBC29": ["\uBA39\uBC29", "\uB300\uC2DD\uAC00", "mukbang", "\uB9DB\uC9D1 \uB9AC\uBDF0", "\uC74C\uC2DD \uB9AC\uBDF0"],
    "\uCEA0\uD551": ["\uCEA0\uD551", "\uCC28\uBC15", "\uCEA0\uD551\uC694\uB9AC", "\uCEA0\uD551\uC7A5 \uCD94\uCC9C", "\uCEA0\uD551 \uBE0C\uC774\uB85C\uADF8"],
    "\uC694\uB9AC": ["\uC694\uB9AC", "\uB808\uC2DC\uD53C", "\uC9D1\uBC25", "\uCFE0\uD0B9", "\uC790\uCDE8\uC694\uB9AC", "\uAC04\uB2E8 \uC694\uB9AC"],
    "\uC8FC\uBD80\uC0B4\uB9BC": ["\uC0B4\uB9BC", "\uC8FC\uBD80", "\uC721\uC544\uB9D8", "\uAC00\uC871\uC77C\uC0C1", "\uC7A5\uBCF4\uAE30", "\uC0B4\uB9BC\uD301"],
    "\uAC74\uAC15\uC2DD": ["\uAC74\uAC15", "\uB2E4\uC774\uC5B4\uD2B8", "\uC2DD\uB2E8", "\uAC74\uAC15\uC2DD", "\uD074\uB9B0\uC774\uD305"],
    "\uC9C0\uC5ED\uC5EC\uD589": ["\uC5EC\uD589", "\uC9C0\uC5ED \uB9DB\uC9D1", "\uB85C\uCEEC", "\uC0B0\uC9C0 \uBC29\uBB38", "\uC2DC\uACE8 \uBE0C\uC774\uB85C\uADF8"],
    "\uC81C\uCCA0\uBA39\uAC70\uB9AC": ["\uC81C\uCCA0", "\uB18D\uC0B0\uBB3C", "\uC0B0\uC9C0\uC9C1\uC1A1", "\uB85C\uCEEC\uD478\uB4DC", "\uACFC\uC77C \uB9AC\uBDF0", "\uAC04\uC2DD \uB9AC\uBDF0"],
    "\uACF5\uB3D9\uAD6C\uB9E4": ["\uACF5\uB3D9\uAD6C\uB9E4", "\uACF5\uAD6C", "\uC18C\uBE44\uC790 \uB9AC\uBDF0", "\uCCB4\uD5D8\uB2E8", "\uD611\uCC2C \uB9AC\uBDF0"]
  };
  function getRelevantSegments(productName2) {
    const pLower = productName2.toLowerCase();
    const segmentScores = {};
    const foodKws = ["\uC625\uC218\uC218", "\uBCF5\uC22D\uC544", "\uC0AC\uACFC", "\uBC30", "\uAC10", "\uB538\uAE30", "\uC218\uBC15", "\uCC38\uC678", "\uD1A0\uB9C8\uD1A0", "\uACE0\uAD6C\uB9C8", "\uAC10\uC790", "\uC808\uC784\uBC30\uCD94", "\uAE40\uCE58", "\uB5A1", "\uD55C\uACFC", "\uAFC0", "\uC7BC", "\uACFC\uC77C", "\uCC44\uC18C", "\uB18D\uC0B0\uBB3C", "\uBC24", "\uACE0\uAD6C\uB9C8"];
    const campKws = ["\uCEA0\uD551", "\uCC28\uBC15", "\uC544\uC6C3\uB3C4\uC5B4", "\uBC14\uBCA0\uD050"];
    const cookKws = ["\uC694\uB9AC", "\uB808\uC2DC\uD53C", "\uC9D1\uBC25", "\uAC04\uC2DD"];
    if (foodKws.some((k) => pLower.includes(k))) {
      segmentScores["\uBA39\uBC29"] = 5;
      segmentScores["\uC694\uB9AC"] = 5;
      segmentScores["\uC81C\uCCA0\uBA39\uAC70\uB9AC"] = 5;
      segmentScores["\uCEA0\uD551"] = 4;
      segmentScores["\uC8FC\uBD80\uC0B4\uB9BC"] = 4;
      segmentScores["\uAC74\uAC15\uC2DD"] = 3;
      segmentScores["\uACF5\uB3D9\uAD6C\uB9E4"] = 4;
      segmentScores["\uC9C0\uC5ED\uC5EC\uD589"] = 3;
    } else if (campKws.some((k) => pLower.includes(k))) {
      segmentScores["\uCEA0\uD551"] = 5;
      segmentScores["\uBA39\uBC29"] = 3;
      segmentScores["\uC694\uB9AC"] = 3;
    } else if (cookKws.some((k) => pLower.includes(k))) {
      segmentScores["\uC694\uB9AC"] = 5;
      segmentScores["\uBA39\uBC29"] = 4;
      segmentScores["\uC8FC\uBD80\uC0B4\uB9BC"] = 4;
    } else {
      Object.keys(PRACTICAL_SEGMENTS).forEach((s) => {
        segmentScores[s] = 3;
      });
    }
    return Object.entries(segmentScores).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([seg]) => seg);
  }
  function getSearchQueries(segments) {
    const queries = [];
    for (const seg of segments) {
      const kws = PRACTICAL_SEGMENTS[seg] || [seg];
      const randomKw = kws[Math.floor(Math.random() * kws.length)];
      queries.push({ segment: seg, query: `${productName} ${randomKw}` });
    }
    return queries;
  }
  function tagPracticalSegment(channelDesc, channelTitle) {
    const text = (channelDesc + " " + channelTitle).toLowerCase();
    for (const [seg, kws] of Object.entries(PRACTICAL_SEGMENTS)) {
      if (kws.some((kw) => text.includes(kw.toLowerCase()))) return seg;
    }
    return "\uAE30\uD0C0";
  }
  const segmentStats = {};
  const searchedSegments = [];
  const seenChannelIds = /* @__PURE__ */ new Set();
  const trendChannelIds = [];
  if ((platform === "all" || platform === "youtube") && YOUTUBE_API_KEY) {
    try {
      const trendSearchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(productName + " \uB9AC\uBDF0")}&order=viewCount&maxResults=15&regionCode=KR&hl=ko&key=${YOUTUBE_API_KEY}`;
      const trendRes = await fetch(trendSearchUrl);
      telemetry.apiCalls++;
      telemetry.searchCalls++;
      telemetry.quotaUsed += 100;
      if (trendRes.ok) {
        const trendData = await trendRes.json();
        if (trendData.items) {
          for (const item of trendData.items) {
            const chId = item.snippet?.channelId;
            if (chId && !seenChannelIds.has(chId) && !existingIds.has(chId)) {
              seenChannelIds.add(chId);
              trendChannelIds.push(chId);
            }
          }
          telemetry.trendChannelsFound = trendChannelIds.length;
        }
      } else {
        const errData = await trendRes.json();
        if (errData.error?.errors?.[0]?.reason === "quotaExceeded") {
          return { success: true, candidates: [], quotaExceeded: true, telemetry, message: "YouTube API \uD560\uB2F9\uB7C9 \uCD08\uACFC\uB85C \uC624\uB298\uC740 \uC18C\uB7C9/\uC218\uB3D9 \uAC80\uC99D \uBAA8\uB4DC\uB85C \uC9C4\uD589\uD569\uB2C8\uB2E4." };
        }
      }
      const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
      const recentTrendUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(productName)}&order=viewCount&maxResults=10&regionCode=KR&hl=ko&publishedAfter=${weekAgo}&key=${YOUTUBE_API_KEY}`;
      const recentRes = await fetch(recentTrendUrl);
      telemetry.apiCalls++;
      telemetry.searchCalls++;
      telemetry.quotaUsed += 100;
      if (recentRes.ok) {
        const recentData = await recentRes.json();
        if (recentData.items) {
          for (const item of recentData.items) {
            const chId = item.snippet?.channelId;
            if (chId && !seenChannelIds.has(chId) && !existingIds.has(chId)) {
              seenChannelIds.add(chId);
              trendChannelIds.push(chId);
            }
          }
          telemetry.trendChannelsFound = trendChannelIds.length;
        }
      }
    } catch (e) {
    }
  }
  const allChannelIds = [...trendChannelIds];
  if ((platform === "all" || platform === "youtube") && YOUTUBE_API_KEY) {
    try {
      const relevantSegments = getRelevantSegments(productName);
      const searchQueries = getSearchQueries(relevantSegments);
      searchedSegments.push(...relevantSegments);
      const maxSearches = Math.min(searchQueries.length, 6);
      const perSearchMax = Math.ceil(max * 2 / maxSearches);
      for (let i = 0; i < maxSearches; i++) {
        const { segment, query } = searchQueries[i];
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(query)}&maxResults=${Math.min(perSearchMax, 20)}&regionCode=KR&hl=ko&key=${YOUTUBE_API_KEY}`;
        const searchRes = await fetch(searchUrl);
        telemetry.apiCalls++;
        telemetry.searchCalls++;
        telemetry.quotaUsed += 100;
        if (!searchRes.ok) {
          const errData = await searchRes.json();
          if (errData.error?.errors?.[0]?.reason === "quotaExceeded") {
            break;
          }
          continue;
        }
        const searchData = await searchRes.json();
        if (!searchData.items || searchData.items.length === 0) continue;
        const newChannelIds = searchData.items.map((item) => item.snippet.channelId || item.id?.channelId).filter((id) => id && !seenChannelIds.has(id) && !existingIds.has(id));
        newChannelIds.forEach((id) => {
          seenChannelIds.add(id);
          allChannelIds.push(id);
        });
        telemetry.searchChannelsFound += newChannelIds.length;
      }
    } catch (e) {
    }
  }
  if ((platform === "all" || platform === "youtube") && YOUTUBE_API_KEY && allChannelIds.length > 0) {
    try {
      const batchSize = 50;
      for (let batchStart = 0; batchStart < allChannelIds.length; batchStart += batchSize) {
        const batch = allChannelIds.slice(batchStart, batchStart + batchSize);
        const channelsUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&id=${batch.join(",")}&key=${YOUTUBE_API_KEY}`;
        const channelsRes = await fetch(channelsUrl);
        telemetry.apiCalls++;
        telemetry.channelCalls++;
        telemetry.quotaUsed += 1;
        if (!channelsRes.ok) continue;
        const channelsData = await channelsRes.json();
        for (const ch of channelsData.items || []) {
          const snippet = ch.snippet || {};
          const stats = ch.statistics || {};
          const branding = ch.brandingSettings?.channel || {};
          const subs = parseInt(stats.subscriberCount || "0", 10);
          const views = parseInt(stats.viewCount || "0", 10);
          const allDescText = [
            snippet.description || "",
            branding.description || "",
            branding.unsubscribedTrailer || ""
          ].join("\n");
          const contact = extractContactInfo(allDescText, "");
          const hasEmail = !!(contact.email && contact.email.includes("@"));
          if (hasEmail) telemetry.emailsVerified++;
          const practicalSegment = tagPracticalSegment(allDescText, snippet.title || "");
          segmentStats[practicalSegment] = (segmentStats[practicalSegment] || 0) + 1;
          const channelData = {
            name: snippet.title,
            title: snippet.title,
            description: allDescText.substring(0, 300),
            subscriberCount: subs,
            viewCount: views,
            email: contact.email,
            recentContentTitle: snippet.title,
            publicContactStatus: hasEmail ? "email_public" : "unknown"
          };
          const fit = calculateProductFitScore(channelData, keyword, productName);
          const channelUrl = `https://www.youtube.com/channel/${ch.id}`;
          const candidate = {
            candidateId: generateRecordId("inf"),
            collectedAt: now,
            platform: "YouTube",
            keyword,
            seedKeyword: keyword,
            productName,
            practicalSegment,
            name: snippet.title,
            channelOrBlogUrl: channelUrl,
            channelId: ch.id,
            recentContentTitle: (snippet.description || "").substring(0, 60),
            recentContentUrl: channelUrl,
            subscriberOrVisitor: subs > 0 ? subs >= 1e4 ? `${(subs / 1e4).toFixed(1)}\uB9CC` : `${subs.toLocaleString()}` : "-",
            viewCount: views > 0 ? views >= 1e8 ? `${(views / 1e8).toFixed(1)}\uC5B5` : views >= 1e4 ? `${(views / 1e4).toFixed(0)}\uB9CC` : views.toLocaleString() : "-",
            publicContactStatus: channelData.publicContactStatus,
            // OUTREACH-EMAIL-CAPTURE-FIX.1: 마스킹 이메일은 publicEmailMasked에만 보관, contact_email에는 저장하지 않음
            publicEmailMasked: contact.email ? maskEmail(contact.email) : "",
            // OUTREACH-EMAIL-CAPTURE-FIX.1: 공개 이메일(***미포함, @포함)만 contact_email로 저장
            contact_email: contact.email && !contact.email.includes("***") && contact.email.includes("@") ? contact.email : "",
            emailSource: hasEmail ? "channel_description" : "",
            productFitScore: fit.score,
            productFitReason: fit.reason,
            suggestedProduct: productName,
            suggestedOfferAngle: generateOfferAngle(channelData, keyword, productName),
            outreachStatus: "pending",
            firstEmailDraft: hasEmail ? generateFirstEmailDraft(channelData, keyword, productName) : "",
            followUpDraft: hasEmail ? generateFollowUpDraft(channelData, keyword, productName) : "",
            responseStatus: "none",
            notes: trendChannelIds.includes(ch.id) ? "\u{1F525} \uD2B8\uB80C\uB4DC \uBC1C\uACAC" : "",
            thumbnailUrl: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || "",
            excludedReason: "",
            // OUTREACH-COPY.1: 품목별 맞치형 제안 3콼럼
            proposal_angle: generateProposalAngle(channelData, keyword, productName),
            proposal_subject: generateProposalSubject(productName, keyword),
            proposal_draft: generateProposalDraft(channelData, keyword, productName)
          };
          if (requireEmail && !hasEmail) {
            candidate.excludedReason = contact.email ? "invalid_email_format" : "no_public_email";
            excludedCandidates.push(candidate);
          } else {
            candidates.push(candidate);
          }
        }
      }
    } catch (e) {
      if (e.message?.includes("\uD560\uB2F9\uB7C9")) {
      }
    }
  }
  if (platform === "all" || platform === "naver") {
    try {
      const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || "";
      const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || "";
      if (!NAVER_CLIENT_ID) throw new Error("Naver API \uBBF8\uC124\uC815");
      const naverQuery = `${productName} \uACF5\uB3D9\uAD6C\uB9E4 \uB9AC\uBDF0`;
      const naverUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(naverQuery)}&display=${max * 2}&sort=sim`;
      const naverRes = await fetch(naverUrl, {
        headers: { "X-Naver-Client-Id": NAVER_CLIENT_ID, "X-Naver-Client-Secret": NAVER_CLIENT_SECRET }
      });
      telemetry.apiCalls++;
      telemetry.naverCalls++;
      if (!naverRes.ok) throw new Error(`Naver API \uC624\uB958: ${naverRes.status}`);
      const naverData = await naverRes.json();
      for (const item of (naverData.items || []).slice(0, max)) {
        const bloggerlink = item.bloggerlink || "";
        const blogIdMatch = bloggerlink.match(/blog\.naver\.com\/([a-zA-Z0-9_]+)/);
        const blogId = blogIdMatch ? blogIdMatch[1] : "";
        const blogUrl = blogId ? `https://blog.naver.com/${blogId}` : bloggerlink;
        if (existingIds.has(blogUrl)) {
          telemetry.deduped++;
          continue;
        }
        const cleanTitle = (item.title || "").replace(/<[^>]*>/g, "");
        const cleanDesc = (item.description || "").replace(/<[^>]*>/g, "").substring(0, 100);
        const practicalSegment = tagPracticalSegment(cleanDesc + " " + cleanTitle, item.bloggername || "");
        segmentStats[practicalSegment] = (segmentStats[practicalSegment] || 0) + 1;
        const channelData = {
          name: item.bloggername || blogId,
          title: item.bloggername || blogId,
          description: cleanDesc,
          recentContentTitle: cleanTitle,
          publicContactStatus: "unknown",
          email: "",
          subscriberCount: 0,
          viewCount: 0
        };
        const fit = calculateProductFitScore(channelData, keyword, productName);
        const candidate = {
          candidateId: generateRecordId("inf"),
          collectedAt: now,
          platform: "Naver Blog",
          keyword: naverQuery,
          seedKeyword: keyword,
          productName,
          practicalSegment,
          name: item.bloggername || blogId || "\uBE14\uB85C\uAC70",
          channelOrBlogUrl: blogUrl,
          channelId: blogId,
          recentContentTitle: cleanTitle.substring(0, 60),
          recentContentUrl: item.link || "",
          subscriberOrVisitor: "-",
          viewCount: "-",
          publicContactStatus: "unknown",
          publicEmailMasked: "",
          contact_email: "",
          emailSource: "",
          productFitScore: fit.score,
          productFitReason: fit.reason,
          suggestedProduct: productName,
          suggestedOfferAngle: generateOfferAngle(channelData, keyword, productName),
          outreachStatus: "pending",
          firstEmailDraft: "",
          followUpDraft: "",
          responseStatus: "none",
          notes: `\uCD5C\uADFC \uAE00: ${cleanTitle.substring(0, 40)}`,
          excludedReason: "",
          // OUTREACH-COPY.1: 품목별 맞치형 제안 3콼럼
          proposal_angle: generateProposalAngle(channelData, keyword, productName),
          proposal_subject: generateProposalSubject(productName, keyword),
          proposal_draft: generateProposalDraft(channelData, keyword, productName)
        };
        if (requireEmail) {
          candidate.excludedReason = "no_public_email";
          excludedCandidates.push(candidate);
        } else {
          candidates.push(candidate);
        }
      }
    } catch (e) {
    }
  }
  candidates.sort((a, b) => b.productFitScore - a.productFitScore);
  const excludedNoEmail = excludedCandidates.filter((c) => c.excludedReason === "no_public_email").length;
  const excludedInvalidEmail = excludedCandidates.filter((c) => c.excludedReason === "invalid_email_format").length;
  const excludedContactOnly = excludedCandidates.filter((c) => c.excludedReason === "contact_link_only").length;
  const finalCandidates = candidates.slice(0, max);
  const shortfall = requireEmail ? Math.max(0, max - finalCandidates.length) : 0;
  return {
    success: true,
    candidates: finalCandidates,
    total: candidates.length,
    keyword,
    product: productName,
    requireEmail,
    searchedSegments,
    segmentStats,
    telemetry,
    excluded: {
      total: excludedCandidates.length,
      noEmail: excludedNoEmail,
      invalidEmail: excludedInvalidEmail,
      contactLinkOnly: excludedContactOnly
    },
    shortfall,
    appendMode: true,
    message: requireEmail ? `4\uB2E8\uACC4 \uD30C\uC774\uD504\uB77C\uC778\uC73C\uB85C ${productName} \uACF5\uB3D9\uAD6C\uB9E4 \uC774\uBA54\uC77C \uD655\uC778 \uD6C4\uBCF4 ${finalCandidates.length}\uBA85\uC744 \uC218\uC9D1\uD588\uC2B5\uB2C8\uB2E4.${shortfall > 0 ? ` (${shortfall}\uBA85 \uBD80\uC871)` : ""}` : `4\uB2E8\uACC4 \uD30C\uC774\uD504\uB77C\uC778\uC73C\uB85C ${productName} \uACF5\uB3D9\uAD6C\uB9E4 \uD6C4\uBCF4 ${finalCandidates.length}\uBA85\uC744 \uC218\uC9D1\uD588\uC2B5\uB2C8\uB2E4.`
  };
}
function buildDuplicateHash(platform, profileUrl, channelName, handle) {
  const norm = (s) => (s || "").toLowerCase().replace(/[\s\/\?#&=]+/g, "").trim();
  const base = profileUrl ? `${norm(platform)}::${norm(profileUrl)}` : `${norm(platform)}::${norm(channelName)}::${norm(handle)}`;
  let h = 2166136261;
  for (let i = 0; i < base.length; i++) {
    h ^= base.charCodeAt(i);
    h = h * 16777619 >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
async function handleOutreachSaveCandidates(params) {
  const { candidates, dryRun } = params;
  if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
    return { success: false, error: "candidates array required" };
  }
  if (!WORKSPACE_SHEET_ID || !GOOGLE_SHEETS_CREDENTIALS) {
    return { success: false, error: "Google Sheets not configured" };
  }
  try {
    await ensureHeaders(OUTREACH_CRM_TAB);
    const existing = await sheetsRead(OUTREACH_CRM_TAB);
    const existingRows = existing.values || [];
    const headers = existingRows[0] || [];
    const hashColIdx = headers.indexOf("duplicate_hash");
    const idColIdx = headers.indexOf("influencer_id");
    const existingHashes = /* @__PURE__ */ new Map();
    for (let i = 1; i < existingRows.length; i++) {
      const row = existingRows[i];
      const hash = hashColIdx >= 0 ? row[hashColIdx] || "" : "";
      if (hash) existingHashes.set(hash, i + 1);
    }
    let saved = 0, updated = 0, skipped = 0;
    const dryRunLog = [];
    for (const c of candidates) {
      const platform = c.platform || "";
      const profileUrl = c.profile_url || c.channelOrBlogUrl || "";
      const channelName = c.channel_name || c.name || "";
      const handle = c.handle || "";
      const rawContactEmail = c.contact_email || "";
      const hasMasked = (c.publicEmailMasked || "").includes("***");
      const contactUrl = c.contact_url || "";
      let contactEmail = "";
      let emailStatus = "no_contact";
      let contactRoute = "none";
      let contactPriority = "none";
      const isValidPublicEmail = rawContactEmail && !rawContactEmail.includes("***") && rawContactEmail.includes("@");
      if (isValidPublicEmail) {
        contactEmail = rawContactEmail;
        emailStatus = "public_email";
        contactRoute = "email";
        contactPriority = "public_email";
      } else if (hasMasked || rawContactEmail && rawContactEmail.includes("***")) {
        contactEmail = "";
        emailStatus = "masked_or_unverified";
        contactRoute = "needs_verification";
        contactPriority = contactUrl ? "contact_form" : "none";
      } else if (contactUrl) {
        contactEmail = "";
        emailStatus = "no_public_email";
        contactRoute = "contact_form";
        contactPriority = "contact_form";
      } else {
        contactEmail = "";
        emailStatus = "no_contact";
        contactRoute = "none";
        contactPriority = "none";
      }
      const allowedEmailStatus = ["public_email", "masked_or_unverified", "no_public_email", "no_contact", "contact_form", "not_found", "unknown"];
      const rawEmailStatus = c.email_status || c.publicContactStatus || "";
      if (rawEmailStatus && allowedEmailStatus.includes(rawEmailStatus)) {
        emailStatus = rawEmailStatus;
      }
      const allowedOutreachStatus = ["not_sent", "drafted", "sent", "replied", "follow_up_needed", "closed"];
      const rawOutreachStatus = c.outreach_status || c.outreachStatus || "not_sent";
      const outreachStatus = allowedOutreachStatus.includes(rawOutreachStatus) ? rawOutreachStatus : "not_sent";
      const allowedReplyStatus = ["none", "positive", "neutral", "negative", "bounced"];
      const rawReplyStatus = c.reply_status || c.responseStatus || "none";
      const replyStatus = allowedReplyStatus.includes(rawReplyStatus) ? rawReplyStatus : "none";
      const dupHash = buildDuplicateHash(platform, profileUrl, channelName, handle);
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const row = [
        c.influencer_id || c.candidateId || generateRecordId("inf"),
        platform,
        channelName,
        handle,
        profileUrl,
        contactEmail,
        contactUrl,
        emailStatus,
        c.category_tags || c.practicalSegment || "",
        c.source_keyword || c.keyword || c.seedKeyword || "",
        c.source_product || c.suggestedProduct || "",
        String(c.followers_or_subscribers || c.subscriberOrVisitor || ""),
        String(c.avg_views || c.viewCount || ""),
        String(c.fit_score || c.productFitScore || 0),
        c.fit_reason || c.productFitReason || "",
        outreachStatus,
        c.last_contacted_at || c.lastContactedAt || "",
        replyStatus,
        // OUTREACH-EMAIL-CAPTURE-FIX.1: next_action 4-case 분기
        c.next_action || (() => {
          if (emailStatus === "public_email") return "\uC774\uBA54\uC77C \uCD08\uC548 \uC791\uC131 \uD6C4 \uBC1C\uC1A1 \uC2B9\uC778 \uC694\uCCAD";
          if (emailStatus === "masked_or_unverified") return "\uACF5\uAC1C \uC774\uBA54\uC77C \uC7AC\uD655\uC778 \uB610\uB294 \uBB38\uC758 \uB9C1\uD06C \uD655\uC778 \uD544\uC694";
          if (emailStatus === "no_public_email" || emailStatus === "contact_form") return "\uBB38\uC758\uD3FC/DM \uC81C\uC548 \uBB38\uAD6C \uC791\uC131 \uB300\uAE30";
          if (emailStatus === "no_contact") return "\uC5F0\uB77D \uAC00\uB2A5 \uCC44\uB110 \uCD94\uAC00 \uD655\uC778 \uD544\uC694";
          if (emailStatus === "not_found") return "\uC5F0\uB77D\uCC98 \uC218\uB3D9 \uD655\uC778 \uD544\uC694";
          return "\uC5F0\uB77D\uCC98 \uD655\uC778 \uD6C4 \uC81C\uC548 \uBC29\uC2DD \uACB0\uC815";
        })(),
        dupHash,
        c.created_at || c.collectedAt || now,
        now,
        c.notes || "",
        // OUTREACH-COPY.1: proposal_angle/subject/draft 자동 생성
        c.proposal_angle || generateProposalAngle(c, c.source_keyword || c.keyword || c.seedKeyword || "", c.source_product || c.suggestedProduct || ""),
        c.proposal_subject || generateProposalSubject(c.source_product || c.suggestedProduct || "", c.source_keyword || c.keyword || c.seedKeyword || ""),
        c.proposal_draft || generateProposalDraft(c, c.source_keyword || c.keyword || c.seedKeyword || "", c.source_product || c.suggestedProduct || "")
      ];
      if (dryRun) {
        const isDup = existingHashes.has(dupHash);
        dryRunLog.push({ channelName, platform, dupHash, action: isDup ? "update" : "append", emailStatus, outreachStatus });
        continue;
      }
      if (existingHashes.has(dupHash)) {
        const rowNum = existingHashes.get(dupHash);
        const token = await getGoogleSheetsToken();
        const updatedAtIdx = headers.indexOf("updated_at");
        if (updatedAtIdx >= 0) {
          const colLetter = String.fromCharCode(65 + updatedAtIdx);
          const rangeStr = encodeURIComponent(`${OUTREACH_CRM_TAB}!${colLetter}${rowNum}`);
          const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${rangeStr}?valueInputOption=RAW`;
          await fetch(url, {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ values: [[now]] })
          });
        }
        updated++;
      } else {
        await sheetsAppend(OUTREACH_CRM_TAB, [row]);
        saved++;
      }
    }
    if (dryRun) {
      return { success: true, dryRun: true, log: dryRunLog, total: candidates.length };
    }
    return { success: true, saved, updated, skipped, total: candidates.length, message: `\uC2E0\uADDC ${saved}\uBA85 \uC800\uC7A5, \uC911\uBCF5 ${updated}\uBA85 \uC5C5\uB370\uC774\uD2B8 \uC644\uB8CC.` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
async function handleOutreachList(params) {
  if (!WORKSPACE_SHEET_ID || !GOOGLE_SHEETS_CREDENTIALS) {
    return { success: false, error: "Google Sheets not configured" };
  }
  try {
    await ensureHeaders(OUTREACH_CRM_TAB);
    const result = await sheetsRead(OUTREACH_CRM_TAB);
    const rows = result.values || [];
    if (rows.length < 2) return { success: true, candidates: [], total: 0 };
    const headers = rows[0];
    let records = rows.slice(1).map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] || "";
      });
      obj.fit_score = parseInt(obj.fit_score || obj.productFitScore || "0", 10);
      obj.followers_or_subscribers = parseInt(obj.followers_or_subscribers || obj.subscriberOrVisitor || "0", 10);
      obj.avg_views = parseInt(obj.avg_views || obj.viewCount || "0", 10);
      return obj;
    });
    const { minScore, keyword: filterKw, platform: filterPlatform, outreachStatus: filterOutreach, emailStatus: filterEmail } = params || {};
    if (minScore) records = records.filter((r) => r.fit_score >= Number(minScore));
    if (filterKw) records = records.filter((r) => (r.source_keyword || r.keyword || "").includes(filterKw));
    if (filterPlatform) records = records.filter((r) => (r.platform || "").toLowerCase().includes(filterPlatform.toLowerCase()));
    if (filterOutreach) records = records.filter((r) => (r.outreach_status || r.outreachStatus || "") === filterOutreach);
    if (filterEmail) records = records.filter((r) => (r.email_status || r.publicContactStatus || "") === filterEmail);
    records.sort((a, b) => b.fit_score - a.fit_score);
    const limit = params?.limit || 20;
    return { success: true, candidates: records.slice(0, limit), total: records.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
function calculateMargin(params) {
  const currentPrice = Number(params.currentPrice) || 0;
  const rawMaterialCost = Number(params.rawMaterialCost) || 0;
  const shippingCost = Number(params.shippingCost) || 0;
  const packagingCost = Number(params.packagingCost) || 0;
  const platformFeeRate = Number(params.platformFeeRate) || 0;
  const otherCosts = Number(params.otherCosts) || 0;
  let competitorPrices = [];
  if (Array.isArray(params.competitorPrices)) {
    competitorPrices = params.competitorPrices.map(Number).filter((n) => n > 0);
  } else if (typeof params.competitorPrices === "string" && params.competitorPrices) {
    competitorPrices = params.competitorPrices.split(",").map(Number).filter((n) => n > 0);
  }
  const competitorMinPrice = competitorPrices.length > 0 ? Math.min(...competitorPrices) : 0;
  const competitorAvgPrice = competitorPrices.length > 0 ? Math.round(competitorPrices.reduce((a, b) => a + b, 0) / competitorPrices.length) : 0;
  const platformFee = Math.round(currentPrice * (platformFeeRate / 100));
  const netSalesAmount = currentPrice - platformFee;
  const totalCost = rawMaterialCost + shippingCost + packagingCost + otherCosts;
  const estimatedMargin = netSalesAmount - totalCost;
  const estimatedMarginRate = currentPrice > 0 ? Math.round(estimatedMargin / currentPrice * 100) : 0;
  return {
    currentPrice,
    rawMaterialCost,
    shippingCost,
    packagingCost,
    platformFeeRate,
    platformFee,
    otherCosts,
    totalCost,
    netSalesAmount,
    estimatedMargin,
    estimatedMarginRate,
    competitorPrices: competitorPrices.join(","),
    competitorMinPrice,
    competitorAvgPrice
  };
}
function getPostposition(word, withBatchim, withoutBatchim) {
  if (!word) return withoutBatchim;
  const lastChar = word.charCodeAt(word.length - 1);
  if (lastChar < 44032 || lastChar > 55203) return withoutBatchim;
  const hasBatchim = (lastChar - 44032) % 28 !== 0;
  return hasBatchim ? withBatchim : withoutBatchim;
}
function generateJarvisDecision(productName, calc) {
  const { estimatedMargin, estimatedMarginRate, currentPrice, competitorMinPrice, competitorAvgPrice, rawMaterialCost } = calc;
  let decision = "";
  let action = "";
  let jarvisMessage = "";
  if (estimatedMarginRate >= 30) {
    decision = "\uAC00\uACA9 \uBC29\uC5B4 \uAC00\uB2A5 (\uACE0\uB9C8\uC9C4)";
    action = "\uD604\uC7AC \uAC00\uACA9 \uC720\uC9C0 + \uD504\uB9AC\uBBF8\uC5C4 \uBA54\uC2DC\uC9C0 \uAC15\uD654";
    jarvisMessage = `\uB300\uD45C\uB2D8, \uC9C0\uAE08 ${productName}${getPostposition(productName, "\uC740", "\uB294")} \uAC00\uACA9\uC744 \uB0AE\uCD9C \uD544\uC694 \uC5C6\uC2B5\uB2C8\uB2E4.
\uC6D0\uBB3C\uAC00 \uB300\uBE44 \uB9C8\uC9C4\uC728\uC774 ${estimatedMarginRate}%\uB85C \uCDA9\uBD84\uD569\uB2C8\uB2E4.
\uCD5C\uC800\uAC00 \uACBD\uC7C1\uBCF4\uB2E4 \uC0B0\uC9C0\uC9C1\uC1A1/\uD55C\uC815\uC218\uB7C9/\uD504\uB9AC\uBBF8\uC5C4 \uBA54\uC2DC\uC9C0\uB85C \uAC00\uB294 \uAC8C \uC88B\uC2B5\uB2C8\uB2E4.`;
  } else if (estimatedMarginRate >= 15) {
    decision = "\uAC00\uACA9 \uC720\uC9C0 \uAD8C\uC7A5";
    action = "\uD604\uC7AC \uAC00\uACA9 \uC720\uC9C0 + \uBB36\uC74C/\uC138\uD2B8 \uAD6C\uC131 \uAC80\uD1A0";
    jarvisMessage = `\uB300\uD45C\uB2D8, ${productName} \uD604\uC7AC \uAC00\uACA9\uC740 \uC720\uC9C0\uD574\uB3C4 \uB429\uB2C8\uB2E4.
\uB9C8\uC9C4\uC728 ${estimatedMarginRate}%\uB85C \uC218\uC218\uB8CC\uC640 \uBC30\uC1A1\uBE44 \uC81C\uC678\uD574\uB3C4 \uB9C8\uC9C4\uC774 \uB0A8\uC2B5\uB2C8\uB2E4.
\uB2E4\uB9CC \uACBD\uC7C1\uC774 \uC2EC\uD574\uC9C0\uBA74 \uBB36\uC74C \uD560\uC778\uC774\uB098 \uC138\uD2B8 \uAD6C\uC131\uC73C\uB85C \uB2E8\uAC00\uB97C \uBC29\uC5B4\uD558\uB294 \uAC8C \uC88B\uC2B5\uB2C8\uB2E4.`;
  } else if (estimatedMarginRate >= 5) {
    decision = "\uAC00\uACA9 \uC778\uC0C1 \uAC80\uD1A0 \uD544\uC694";
    action = "100~500\uC6D0 \uC778\uC0C1 \uC2DC\uBBAC\uB808\uC774\uC158 + \uACBD\uC7C1\uAC00 \uBAA8\uB2C8\uD130\uB9C1";
    jarvisMessage = `\uB300\uD45C\uB2D8, ${productName}${getPostposition(productName, "\uC740", "\uB294")} \uB9C8\uC9C4\uC774 \uBE60\uB4EF\uD569\uB2C8\uB2E4.
\uB9C8\uC9C4\uC728 ${estimatedMarginRate}%\uBA74 \uBC30\uC1A1 \uC0AC\uACE0\uB098 \uBC18\uD488 \uD55C \uAC74\uC5D0 \uC801\uC790 \uC804\uD658\uB420 \uC218 \uC788\uC2B5\uB2C8\uB2E4.
\uAC00\uACA9\uC744 100~500\uC6D0 \uC62C\uB9AC\uAC70\uB098, \uC6A9\uB7C9/\uC218\uB7C9\uC744 \uC870\uC815\uD558\uB294 \uAC8C \uC548\uC804\uD569\uB2C8\uB2E4.`;
  } else if (estimatedMargin > 0) {
    decision = "\uAC00\uACA9 \uC778\uC0C1 \uD544\uC694";
    action = "\uC989\uC2DC \uAC00\uACA9 \uC778\uC0C1 \uB610\uB294 \uD310\uB9E4 \uC911\uB2E8 \uAC80\uD1A0";
    jarvisMessage = `\uB300\uD45C\uB2D8, ${productName}${getPostposition(productName, "\uC740", "\uB294")} \uC9C0\uAE08 \uAC70\uC758 \uB9C8\uC9C4\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.
\uB9C8\uC9C4\uC728 ${estimatedMarginRate}%\uBA74 \uD314\uC218\uB85D \uC190\uD574\uC5D0 \uAC00\uAE5D\uC2B5\uB2C8\uB2E4.
\uAC00\uACA9 \uC778\uC0C1\uC774 \uC5B4\uB824\uC6B0\uBA74 \uD310\uB9E4 \uC911\uB2E8\uD558\uACE0 \uB2E4\uC74C \uC2DC\uC98C\uC744 \uAE30\uB2E4\uB9AC\uB294 \uAC83\uB3C4 \uBC29\uBC95\uC785\uB2C8\uB2E4.`;
  } else {
    decision = "\uC801\uC790 \uC0C1\uD0DC - \uC989\uC2DC \uC870\uCE58 \uD544\uC694";
    action = "\uD310\uB9E4 \uC911\uB2E8 \uB610\uB294 \uB300\uD3ED \uAC00\uACA9 \uC778\uC0C1";
    jarvisMessage = `\uB300\uD45C\uB2D8, ${productName}${getPostposition(productName, "\uC740", "\uB294")} \uD604\uC7AC \uD314\uBA74 \uD314\uC218\uB85D \uC801\uC790\uC785\uB2C8\uB2E4.
\uC608\uC0C1 \uB9C8\uC9C4\uC774 ${estimatedMargin.toLocaleString()}\uC6D0\uC73C\uB85C \uB9C8\uC774\uB108\uC2A4\uC785\uB2C8\uB2E4.
\uC989\uC2DC \uAC00\uACA9\uC744 \uC62C\uB9AC\uAC70\uB098 \uD310\uB9E4\uB97C \uC911\uB2E8\uD558\uB294 \uAC8C \uB9DE\uC2B5\uB2C8\uB2E4.`;
  }
  if (competitorMinPrice > 0) {
    if (currentPrice < competitorMinPrice) {
      jarvisMessage += `

\uCC38\uACE0\uB85C \uC628\uB77C\uC778 \uACBD\uC7C1 \uCD5C\uC800\uAC00(${competitorMinPrice.toLocaleString()}\uC6D0)\uBCF4\uB2E4 \uB300\uD45C\uB2D8 \uAC00\uACA9\uC774 \uB354 \uB0AE\uC2B5\uB2C8\uB2E4. \uAC00\uACA9 \uC778\uC0C1 \uC5EC\uC9C0\uAC00 \uC788\uC2B5\uB2C8\uB2E4.`;
    } else if (currentPrice > competitorAvgPrice * 1.2) {
      jarvisMessage += `

\uB2E4\uB9CC \uACBD\uC7C1 \uD3C9\uADE0\uAC00(${competitorAvgPrice.toLocaleString()}\uC6D0) \uB300\uBE44 20% \uC774\uC0C1 \uB192\uC73C\uB2C8, \uD488\uC9C8/\uC2A4\uD1A0\uB9AC \uCC28\uBCC4\uD654 \uBA54\uC2DC\uC9C0\uAC00 \uC911\uC694\uD569\uB2C8\uB2E4.`;
    } else {
      jarvisMessage += `

\uACBD\uC7C1\uAC00 \uD3C9\uADE0(${competitorAvgPrice.toLocaleString()}\uC6D0)\uACFC \uBE44\uC2B7\uD55C \uC218\uC900\uC774\uB77C \uAC00\uACA9 \uACBD\uC7C1\uB825\uC740 \uAD1C\uCC2E\uC2B5\uB2C8\uB2E4.`;
    }
  }
  return { decision, action, jarvisMessage };
}
async function handleOutreachMailPrepare(params) {
  const { influencer_id, profile_url, platform } = params;
  await ensureTab(OUTREACH_CRM_TAB);
  await ensureHeaders(OUTREACH_CRM_TAB);
  const sheetData = await sheetsRead(OUTREACH_CRM_TAB, `${OUTREACH_CRM_TAB}!A:Z`);
  const rows = sheetData.values || [];
  if (rows.length < 2) {
    return { success: false, error: "\uD6C4\uBCF4 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }
  const headers = rows[0];
  const idx = (col) => headers.indexOf(col);
  let targetRow = null;
  let targetRowNum = -1;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rid = r[idx("influencer_id")] || "";
    const rurl = r[idx("profile_url")] || "";
    if (influencer_id && rid === influencer_id || profile_url && rurl === profile_url) {
      targetRow = r;
      targetRowNum = i + 1;
      break;
    }
  }
  if (!targetRow) {
    return { success: false, error: "\uD574\uB2F9 \uD6C4\uBCF4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }
  const get = (col) => (targetRow[idx(col)] || "").trim();
  const contactEmail = get("contact_email");
  const emailStatus = get("email_status");
  const proposalSubject = get("proposal_subject");
  const proposalDraft = get("proposal_draft");
  const outreachStatus = get("outreach_status");
  const channelName = get("channel_name");
  const platformVal = get("platform") || platform || "";
  const errors = [];
  if (!contactEmail || !contactEmail.includes("@")) errors.push("contact_email \uC5C6\uC74C \uB610\uB294 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC74C");
  if (emailStatus !== "public_email") errors.push(`email_status\uAC00 public_email\uC774 \uC544\uB2D8 (${emailStatus || "unknown"})`);
  if (!proposalSubject) errors.push("proposal_subject \uC5C6\uC74C");
  if (!proposalDraft) errors.push("proposal_draft \uC5C6\uC74C");
  if (outreachStatus === "sent") errors.push("\uC774\uBBF8 \uBC1C\uC1A1 \uC644\uB8CC\uB41C \uD6C4\uBCF4 (outreach_status=sent)");
  if (errors.length > 0) {
    return {
      success: false,
      sendable: false,
      errors,
      channelName,
      platform: platformVal,
      outreachStatus,
      message: `\uBC1C\uC1A1 \uBD88\uAC00: ${errors.join(" / ")}`
    };
  }
  return {
    success: true,
    sendable: true,
    approvalRequired: true,
    channelName,
    platform: platformVal,
    toEmail: contactEmail.replace(/(.{2}).+(@.+)/, "$1***$2"),
    // 이메일 마스킹 (화면 표시용)
    toEmailRaw: contactEmail,
    // 실제 발송용 (로그 미출력)
    subject: proposalSubject,
    bodyPreview: proposalDraft.slice(0, 200) + (proposalDraft.length > 200 ? "..." : ""),
    influencer_id: get("influencer_id"),
    profile_url: get("profile_url"),
    rowNum: targetRowNum,
    message: `[${channelName}] \uBC1C\uC1A1 \uC900\uBE44 \uC644\uB8CC. \uB300\uD45C\uB2D8 \uC2B9\uC778 \uD6C4 \uBC1C\uC1A1\uB429\uB2C8\uB2E4.`
  };
}
async function handleOutreachMailSend(params) {
  const { influencer_id, profile_url, approved } = params;
  if (approved !== true && approved !== "true") {
    return {
      success: false,
      error: "\uC2B9\uC778\uC774 \uD655\uC778\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. approved=true \uD544\uC218.",
      blocked: true
    };
  }
  await ensureTab(OUTREACH_CRM_TAB);
  await ensureHeaders(OUTREACH_CRM_TAB);
  const sheetData = await sheetsRead(OUTREACH_CRM_TAB, `${OUTREACH_CRM_TAB}!A:Z`);
  const rows = sheetData.values || [];
  if (rows.length < 2) {
    return { success: false, error: "\uD6C4\uBCF4 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }
  const headers = rows[0];
  const idx = (col) => headers.indexOf(col);
  let targetRow = null;
  let targetRowNum = -1;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rid = r[idx("influencer_id")] || "";
    const rurl = r[idx("profile_url")] || "";
    if (influencer_id && rid === influencer_id || profile_url && rurl === profile_url) {
      targetRow = r;
      targetRowNum = i + 1;
      break;
    }
  }
  if (!targetRow) {
    return { success: false, error: "\uD574\uB2F9 \uD6C4\uBCF4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }
  const get = (col) => (targetRow[idx(col)] || "").trim();
  const contactEmail = get("contact_email");
  const emailStatus = get("email_status");
  const proposalSubject = get("proposal_subject");
  const proposalDraft = get("proposal_draft");
  const outreachStatus = get("outreach_status");
  const channelName = get("channel_name");
  if (!contactEmail || !contactEmail.includes("@")) {
    return { success: false, error: "\uBC1C\uC1A1 \uC911\uB2E8: contact_email \uC5C6\uC74C", blocked: true };
  }
  if (emailStatus !== "public_email") {
    return { success: false, error: `\uBC1C\uC1A1 \uC911\uB2E8: email_status\uAC00 public_email\uC774 \uC544\uB2D8 (${emailStatus})`, blocked: true };
  }
  if (!proposalSubject || !proposalDraft) {
    return { success: false, error: "\uBC1C\uC1A1 \uC911\uB2E8: proposal_subject \uB610\uB294 proposal_draft \uC5C6\uC74C", blocked: true };
  }
  if (outreachStatus === "sent") {
    return { success: false, error: "\uC774\uBBF8 \uBC1C\uC1A1 \uC644\uB8CC\uB41C \uD6C4\uBCF4\uC785\uB2C8\uB2E4.", blocked: true };
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  let sendResult = null;
  let sendSuccess = false;
  let sendError = "";
  try {
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://mawinpay-jarvis.vercel.app";
    const emailHtml = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">${proposalDraft.replace(/\n/g, "<br/>")}</div>`;
    const sendRes = await fetch(`${baseUrl}/api/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: contactEmail,
        subject: proposalSubject,
        html: emailHtml,
        testMode: false
      })
    });
    sendResult = await sendRes.json();
    if (sendResult.blocked > 0 || sendResult.results && sendResult.results[0]?.status === "blocked") {
      sendSuccess = false;
      sendError = `\uBC1C\uC1A1 \uCC28\uB2E8: \uD14C\uC2A4\uD2B8 \uC218\uC2E0\uC790 \uBAA9\uB85D\uC5D0 \uC5C6\uB294 \uC774\uBA54\uC77C (execute LOCKED)`;
    } else if (sendResult.sent > 0) {
      sendSuccess = true;
    } else {
      sendSuccess = false;
      sendError = sendResult.results?.[0]?.reason || sendResult.error || "\uC54C \uC218 \uC5C6\uB294 \uBC1C\uC1A1 \uC624\uB958";
    }
  } catch (e) {
    sendSuccess = false;
    sendError = e.message || "\uB124\uD2B8\uC6CC\uD06C \uC624\uB958";
  }
  const token = await getGoogleSheetsToken();
  const updateRange = encodeURIComponent(`${OUTREACH_CRM_TAB}!A${targetRowNum}`);
  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${updateRange}?valueInputOption=RAW`;
  const updatedRow = [...targetRow];
  const setCol = (col, val) => {
    const i = idx(col);
    if (i >= 0) updatedRow[i] = val;
  };
  if (sendSuccess) {
    setCol("outreach_status", "sent");
    setCol("last_contacted_at", now);
    setCol("reply_status", "waiting");
    setCol("next_action", "\uB2F5\uC7A5 \uB300\uAE30");
    setCol("updated_at", now);
  } else {
    setCol("outreach_status", "send_failed");
    setCol("next_action", "\uBC1C\uC1A1 \uC624\uB958 \uD655\uC778 \uD544\uC694");
    setCol("notes", `\uBC1C\uC1A1 \uC2E4\uD328 (${now.slice(0, 10)}): ${sendError.slice(0, 80)}`);
    setCol("updated_at", now);
  }
  try {
    await fetch(updateUrl, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [updatedRow] })
    });
  } catch (sheetErr) {
    console.error("[OUTREACH-MAIL] Sheets \uC5C5\uB370\uC774\uD2B8 \uC2E4\uD328:", sheetErr.message);
  }
  return {
    success: sendSuccess,
    channelName,
    toEmailMasked: contactEmail.replace(/(.{2}).+(@.+)/, "$1***$2"),
    subject: proposalSubject,
    sentAt: sendSuccess ? now : null,
    sheetsUpdated: true,
    outreachStatus: sendSuccess ? "sent" : "send_failed",
    error: sendSuccess ? null : sendError,
    message: sendSuccess ? `\u2705 [${channelName}]\uC5D0\uAC8C \uC81C\uC548 \uBA54\uC77C \uBC1C\uC1A1 \uC644\uB8CC. Google Sheets \uC5C5\uB370\uC774\uD2B8 \uC644\uB8CC.` : `\u274C \uBC1C\uC1A1 \uC2E4\uD328: ${sendError}`
  };
}
async function handleMarketPriceCheck(params) {
  const { productName, rawMaterialCost, currentPrice, shippingCost, packagingCost, platformFeeRate, otherCosts, competitorPrices, sourceCommand } = params;
  if (!productName || !currentPrice) {
    return { success: false, error: "\uD488\uBAA9\uBA85\uACFC \uD604\uC7AC \uD310\uB9E4\uAC00\uB294 \uD544\uC218\uC785\uB2C8\uB2E4." };
  }
  const calc = calculateMargin(params);
  const { decision, action, jarvisMessage } = generateJarvisDecision(productName, calc);
  let savedToSheets = false;
  if (WORKSPACE_SHEET_ID && GOOGLE_SHEETS_CREDENTIALS) {
    try {
      const recordId = generateRecordId("market_price_check");
      const now = (/* @__PURE__ */ new Date()).toISOString();
      await ensureHeaders("market_price_checks");
      await sheetsAppend("market_price_checks", [[
        recordId,
        now,
        productName,
        String(calc.rawMaterialCost),
        String(calc.currentPrice),
        String(calc.shippingCost),
        String(calc.packagingCost),
        String(calc.platformFeeRate),
        String(calc.otherCosts),
        calc.competitorPrices,
        String(calc.competitorMinPrice),
        String(calc.competitorAvgPrice),
        String(calc.netSalesAmount),
        String(calc.estimatedMargin),
        String(calc.estimatedMarginRate),
        decision,
        action,
        sourceCommand || ""
      ]]);
      savedToSheets = true;
    } catch (e) {
    }
  }
  return {
    success: true,
    productName,
    calculation: {
      currentPrice: calc.currentPrice,
      rawMaterialCost: calc.rawMaterialCost,
      shippingCost: calc.shippingCost,
      packagingCost: calc.packagingCost,
      platformFeeRate: calc.platformFeeRate,
      platformFee: calc.platformFee,
      otherCosts: calc.otherCosts,
      totalCost: calc.totalCost,
      netSalesAmount: calc.netSalesAmount,
      estimatedMargin: calc.estimatedMargin,
      estimatedMarginRate: calc.estimatedMarginRate,
      competitorMinPrice: calc.competitorMinPrice,
      competitorAvgPrice: calc.competitorAvgPrice
    },
    jarvisDecision: decision,
    recommendedAction: action,
    jarvisMessage,
    savedToSheets
  };
}
async function handleMarketPriceList(params) {
  if (!WORKSPACE_SHEET_ID || !GOOGLE_SHEETS_CREDENTIALS) {
    return { success: false, error: "Google Sheets not configured" };
  }
  try {
    await ensureHeaders("market_price_checks");
    const result = await sheetsRead("market_price_checks");
    const rows = result.values || [];
    if (rows.length < 2) return { success: true, checks: [], total: 0 };
    const headers = rows[0];
    let records = rows.slice(1).map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] || "";
      });
      return obj;
    });
    const { productName: filterProduct } = params || {};
    if (filterProduct) records = records.filter((r) => (r.productName || "").includes(filterProduct));
    records.reverse();
    const limit = params?.limit || 20;
    return { success: true, checks: records.slice(0, limit), total: records.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
const KAMIS_ITEMS = {
  "\uBC30\uCD94": { code: "211", category: "200", unit: "1\uD3EC\uAE30" },
  "\uC808\uC784\uBC30\uCD94": { code: "211", category: "200", unit: "1\uD3EC\uAE30" },
  // 절임배추는 배추 원물가 참고
  "\uC625\uC218\uC218": { code: "225", category: "100", unit: "10\uAC1C" },
  // 식량작물
  "\uC591\uD30C": { code: "226", category: "200", unit: "1kg" },
  "\uB300\uD30C": { code: "246", category: "200", unit: "1kg" },
  "\uAC10\uC790": { code: "152", category: "100", unit: "100g" },
  // 식량작물
  "\uACE0\uAD6C\uB9C8": { code: "151", category: "100", unit: "100g" },
  // 식량작물
  "\uB2F9\uADFC": { code: "232", category: "200", unit: "1kg" },
  "\uC2DC\uAE08\uCE58": { code: "247", category: "200", unit: "100g" },
  "\uC0AC\uACFC": { code: "411", category: "400", unit: "10\uAC1C" },
  "\uBC30": { code: "412", category: "400", unit: "10\uAC1C" },
  "\uC300": { code: "111", category: "100", unit: "20kg" },
  "\uBCF5\uC22D\uC544": { code: "414", category: "400", unit: "10\uAC1C" },
  "\uD55C\uC6B0": { code: "312", category: "300", unit: "1kg" },
  "\uCD08\uB2F9\uC625\uC218\uC218": { code: "225", category: "100", unit: "10\uAC1C" },
  // 옥수수와 동일 코드
  "\uB538\uAE30": { code: "415", category: "400", unit: "1kg" }
};
function getKamisDateStr(d) {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1e3);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
async function handleKamisMini(params) {
  if (!KAMIS_API_KEY || !KAMIS_CERT_ID) {
    return { success: false, error: "KAMIS API not configured" };
  }
  const itemName = params?.item || params?.productName || "\uBC30\uCD94";
  const clsCode = params?.cls || "01";
  const countryCode = params?.country || "1101";
  const itemInfo = KAMIS_ITEMS[itemName];
  if (!itemInfo) {
    return {
      success: false,
      error: `\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD488\uBAA9: ${itemName}`,
      supportedItems: Object.keys(KAMIS_ITEMS)
    };
  }
  const today = getKamisDateStr(/* @__PURE__ */ new Date());
  const url = `http://www.kamis.or.kr/service/price/xml.do?action=dailyPriceByCategoryList&p_cert_key=${KAMIS_API_KEY}&p_cert_id=${KAMIS_CERT_ID}&p_returntype=json&p_product_cls_code=${clsCode}&p_item_category_code=${itemInfo.category}&p_country_code=${countryCode}&p_regday=${today}&p_convert_kg_yn=N`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (!data || data.error_code === "001") {
      return {
        success: true,
        item: itemName,
        date: today,
        message: "\uD574\uB2F9 \uB0A0\uC9DC\uC5D0 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. (\uC8FC\uB9D0/\uACF5\uD734\uC77C \uAC00\uB2A5)",
        prices: null
      };
    }
    if (data.error_code === "900") {
      return { success: false, error: "KAMIS \uC778\uC99D \uC2E4\uD328 (API Key \uD655\uC778 \uD544\uC694)" };
    }
    const items = data?.data?.item || [];
    let matched = items.filter((i) => i.item_code === itemInfo.code);
    if (matched.length === 0) {
      matched = items.filter((i) => i.item_name === itemName);
    }
    if (matched.length === 0) {
      return {
        success: true,
        item: itemName,
        date: today,
        message: `${itemName}${getPostposition(itemName, "\uC740", "\uB294")} KAMIS \uC77C\uBCC4 \uAC00\uACA9 \uC870\uD68C \uB300\uC0C1 \uD488\uBAA9\uC774 \uC544\uB2D9\uB2C8\uB2E4. \uB370\uC774\uD130 \uBD80\uC871.`,
        prices: null,
        note: "KAMIS API\uC5D0\uC11C \uD574\uB2F9 \uD488\uBAA9\uC758 \uC77C\uBCC4 \uAC00\uACA9 \uB370\uC774\uD130\uB97C \uC81C\uACF5\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4."
      };
    }
    const best = matched.find((i) => i.rank === "\uC0C1\uD488") || matched[0];
    const result = {
      success: true,
      item: itemName,
      isProxy: itemName === "\uC808\uC784\uBC30\uCD94" ? true : void 0,
      proxyNote: itemName === "\uC808\uC784\uBC30\uCD94" ? "\uC808\uC784\uBC30\uCD94\uB294 KAMIS \uB3C5\uB9BD \uD488\uBAA9 \uC5C6\uC74C. \uBC30\uCD94 \uC6D0\uBB3C\uAC00 \uCC38\uACE0" : void 0,
      date: today,
      cls: clsCode === "01" ? "\uC18C\uB9E4" : "\uB3C4\uB9E4",
      country: countryCode === "1101" ? "\uC11C\uC6B8" : countryCode,
      unit: best.unit || itemInfo.unit,
      kind: best.kind_name || "",
      rank: best.rank || "",
      prices: {
        today: best.dpr1 || "-",
        dayBefore: best.dpr2 || "-",
        weekBefore: best.dpr3 || "-",
        twoWeeksBefore: best.dpr4 || "-",
        monthBefore: best.dpr5 || "-",
        yearBefore: best.dpr6 || "-",
        average: best.dpr7 || "-"
      },
      direction: (() => {
        const t = parseFloat((best.dpr1 || "0").replace(/,/g, ""));
        const m = parseFloat((best.dpr5 || "0").replace(/,/g, ""));
        if (!t || !m || isNaN(t) || isNaN(m)) return "N/A";
        const diff = ((t - m) / m * 100).toFixed(1);
        return Number(diff) > 0 ? `+${diff}%` : `${diff}%`;
      })(),
      changePercent: (() => {
        const t = parseFloat((best.dpr1 || "0").replace(/,/g, ""));
        const m = parseFloat((best.dpr5 || "0").replace(/,/g, ""));
        if (!t || !m || isNaN(t) || isNaN(m)) return NaN;
        return (t - m) / m * 100;
      })()
    };
    if (WORKSPACE_SHEET_ID && GOOGLE_SHEETS_CREDENTIALS) {
      try {
        await ensureHeaders("kamis_price_log");
        const recordId = generateRecordId("kamis");
        await sheetsAppend("kamis_price_log", [[
          recordId,
          today,
          itemName,
          result.cls,
          result.prices.today,
          result.prices.monthBefore,
          result.prices.yearBefore,
          result.direction,
          result.unit,
          result.kind,
          result.rank
        ]]);
      } catch (e) {
      }
    }
    return result;
  } catch (e) {
    return { success: false, error: `KAMIS API \uD638\uCD9C \uC2E4\uD328: ${e.message}` };
  }
}
async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    if (req.method === "GET") {
      const endpoint = req.query.endpoint || "status";
      if (endpoint === "status" || endpoint === "diagnostics") {
        const diag = getDiagnostics();
        return res.status(200).json({ status: "running", ...diag });
      }
      if (endpoint === "naver-auth-test") {
        const diag = getDiagnostics();
        try {
          const token = await getSmartStoreToken();
          return res.status(200).json({
            ...diag,
            tokenReceived: true,
            tokenLength: token.length,
            ipNotAllowed: false
          });
        } catch (e) {
          const isIpError = e.message?.includes("IP_NOT_ALLOWED") || e.message?.includes("GW.IP_NOT_ALLOWED");
          return res.status(200).json({
            ...diag,
            tokenReceived: false,
            error: isIpError ? "GW.IP_NOT_ALLOWED" : "token_failed",
            errorDetail: e.message || "unknown",
            ipNotAllowed: isIpError
          });
        }
      }
      if (endpoint === "youtube-analyze") {
        const keyword = String(req.query.keyword || "");
        const count = Number(req.query.count) || 5;
        const period = String(req.query.period || "");
        if (!keyword) return res.status(400).json({ error: "keyword is required" });
        const result = await searchPopularVideos(keyword, count, period);
        return res.status(200).json(result);
      }
      if (endpoint === "youtube-trending") {
        const keyword = String(req.query.keyword || req.query.channelName || "\uD55C\uAD6D \uC778\uAE30");
        const count = Number(req.query.maxResults) || 5;
        const result = await searchPopularVideos(keyword, count);
        return res.status(200).json(result);
      }
      return res.status(400).json({ error: `Unknown GET endpoint: ${endpoint}` });
    }
    if (req.method === "POST") {
      const { endpoint, taskType, task, params, ...rest } = req.body;
      const resolvedTask = taskType || task || endpoint || "";
      if (resolvedTask === "smartstore-orders") {
        const mergedParams = { ...rest, ...params || {} };
        const result = await handleSmartstoreOrders(mergedParams);
        return res.status(200).json(result);
      }
      if (resolvedTask === "daily-briefing") {
        const result = await handleDailyBriefing();
        return res.status(200).json(result);
      }
      if (resolvedTask === "creative-content") {
        const result = await handleCreativeContent(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === "copy-orchestrator") {
        const result = await handleCopyOrchestrator(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === "copy-review-research") {
        const result = await handleCopyReviewResearch(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === "copy-social-research") {
        const result = await handleCopySocialResearch(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === "copy-market-research") {
        const result = await handleCopyMarketResearch(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === "copy-research") {
        const result = await handleCopyResearch(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === "growth-link") {
        const result = await handleGrowthLink(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === "youtube-search") {
        const result = await searchYouTubeDirect(params?.keyword || "", params?.maxResults || 10);
        return res.status(200).json(result);
      }
      if (resolvedTask === "youtube-viral") {
        const result = await searchPopularVideos(params?.keyword || "", params?.count || 5, params?.period || "");
        return res.status(200).json(result);
      }
      if (resolvedTask === "db") {
        const dbAction = params?.action || rest?.action;
        let conn;
        try {
          conn = await getDbConnection();
          switch (dbAction) {
            case "save_influencers": {
              const { influencers, keyword: sKeyword } = params || rest;
              if (!influencers || !Array.isArray(influencers)) return res.status(400).json({ error: "influencers array required" });
              let saved = 0, duplicates = 0;
              for (const inf of influencers) {
                try {
                  await conn.execute(
                    `INSERT INTO influencers (channel_id, platform, name, email, subscribers, subscriber_text, views, description, profile_url, thumbnail, category, keyword, instagram)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), subscribers=VALUES(subscribers),
                       subscriber_text=VALUES(subscriber_text), views=VALUES(views), description=VALUES(description),
                       profile_url=VALUES(profile_url), thumbnail=VALUES(thumbnail), category=VALUES(category),
                       instagram=VALUES(instagram), updated_at=CURRENT_TIMESTAMP`,
                    [
                      inf.channelId || inf.channel_id || "",
                      inf.platform || "YouTube",
                      inf.name || "",
                      inf.email || "",
                      Number(inf.subscribers) || 0,
                      inf.subscriberText || inf.subscriber_text || "",
                      Number(inf.views) || 0,
                      (inf.description || "").substring(0, 2e3),
                      inf.profileUrl || inf.profile_url || "",
                      inf.thumbnail || "",
                      inf.category || sKeyword || "",
                      sKeyword || "",
                      inf.instagram || ""
                    ]
                  );
                  saved++;
                } catch (e) {
                  if (e.code === "ER_DUP_ENTRY") duplicates++;
                }
              }
              await conn.execute(
                `INSERT INTO collection_history (keyword, platform, total_found, with_email, new_collected, duplicates_skipped) VALUES (?, ?, ?, ?, ?, ?)`,
                [sKeyword || "", "YouTube", influencers.length, influencers.filter((i) => i.email).length, saved, duplicates]
              );
              return res.json({ success: true, saved, duplicates, total: influencers.length });
            }
            case "query_influencers": {
              const { keyword: qk, platform: qp, min_subscribers, has_email, limit: ql, category: qc } = params || rest;
              let sql = "SELECT * FROM influencers WHERE 1=1";
              const qParams = [];
              if (qk) {
                sql += " AND (keyword LIKE ? OR name LIKE ? OR category LIKE ?)";
                qParams.push(`%${qk}%`, `%${qk}%`, `%${qk}%`);
              }
              if (qp) {
                sql += " AND platform = ?";
                qParams.push(qp);
              }
              if (min_subscribers) {
                sql += " AND subscribers >= ?";
                qParams.push(Number(min_subscribers));
              }
              if (has_email === "true" || has_email === true) {
                sql += " AND email != ''";
              }
              if (qc) {
                sql += " AND category LIKE ?";
                qParams.push(`%${qc}%`);
              }
              sql += " ORDER BY subscribers DESC LIMIT ?";
              qParams.push(Number(ql) || 50);
              const [rows] = await conn.execute(sql, qParams);
              return res.json({ success: true, total: rows.length, influencers: rows });
            }
            case "get_collected_ids": {
              const [rows] = await conn.execute("SELECT channel_id FROM influencers");
              const ids = rows.map((r) => r.channel_id);
              return res.json({ success: true, ids });
            }
            case "collection_history": {
              const [rows] = await conn.execute("SELECT * FROM collection_history ORDER BY collected_at DESC LIMIT 50");
              return res.json({ success: true, history: rows });
            }
            case "save_viral_videos": {
              const { videos, keyword: vk } = params || rest;
              if (!videos || !Array.isArray(videos)) return res.status(400).json({ error: "videos array required" });
              let vSaved = 0;
              for (const v of videos) {
                try {
                  await conn.execute(
                    `INSERT INTO viral_videos (video_id, channel_id, title, view_count, like_count, comment_count, published_at, thumbnail, viral_reason, keyword)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE view_count=VALUES(view_count), like_count=VALUES(like_count), comment_count=VALUES(comment_count), viral_reason=VALUES(viral_reason)`,
                    [v.videoId || "", v.channelId || "", v.title || "", Number(v.viewCount) || 0, Number(v.likeCount) || 0, Number(v.commentCount) || 0, v.publishedAt || "", v.thumbnail || "", v.viralReason || "", vk || ""]
                  );
                  vSaved++;
                } catch (e) {
                  console.error("Save viral error:", e.message);
                }
              }
              return res.json({ success: true, saved: vSaved });
            }
            case "query_viral_videos": {
              const { keyword: vqk, limit: vql } = params || rest;
              let sql = "SELECT * FROM viral_videos WHERE 1=1";
              const vqParams = [];
              if (vqk) {
                sql += " AND (keyword LIKE ? OR title LIKE ?)";
                vqParams.push(`%${vqk}%`, `%${vqk}%`);
              }
              sql += " ORDER BY view_count DESC LIMIT ?";
              vqParams.push(Number(vql) || 20);
              const [rows] = await conn.execute(sql, vqParams);
              return res.json({ success: true, total: rows.length, videos: rows });
            }
            case "save_memory": {
              const { memory_type, memory_key, memory_value, metadata } = params || rest;
              await conn.execute(
                `INSERT INTO ai_memory (memory_type, memory_key, memory_value, metadata) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE memory_value=VALUES(memory_value), metadata=VALUES(metadata)`,
                [memory_type, memory_key, memory_value, JSON.stringify(metadata || {})]
              );
              return res.json({ success: true });
            }
            case "query_memory": {
              const { memory_type: mt, memory_key: mk } = params || rest;
              let sql = "SELECT * FROM ai_memory WHERE 1=1";
              const mParams = [];
              if (mt) {
                sql += " AND memory_type = ?";
                mParams.push(mt);
              }
              if (mk) {
                sql += " AND memory_key LIKE ?";
                mParams.push(`%${mk}%`);
              }
              sql += " ORDER BY updated_at DESC LIMIT 50";
              const [rows] = await conn.execute(sql, mParams);
              return res.json({ success: true, memories: rows });
            }
            case "stats": {
              const [[totalInf]] = await conn.execute("SELECT COUNT(*) as cnt FROM influencers");
              const [[withEmail]] = await conn.execute("SELECT COUNT(*) as cnt FROM influencers WHERE email != ''");
              const [[totalVideos]] = await conn.execute("SELECT COUNT(*) as cnt FROM viral_videos");
              const [[totalCollections]] = await conn.execute("SELECT COUNT(*) as cnt FROM collection_history");
              const [topKeywords] = await conn.execute("SELECT keyword, COUNT(*) as cnt FROM influencers GROUP BY keyword ORDER BY cnt DESC LIMIT 10");
              const [recentCollections] = await conn.execute("SELECT * FROM collection_history ORDER BY collected_at DESC LIMIT 5");
              return res.json({ success: true, stats: { total_influencers: totalInf.cnt, with_email: withEmail.cnt, total_viral_videos: totalVideos.cnt, total_collections: totalCollections.cnt, top_keywords: topKeywords, recent_collections: recentCollections } });
            }
            default:
              return res.status(400).json({ error: `Unknown db action: ${dbAction}` });
          }
        } catch (error) {
          console.error("DB Error:", error);
          return res.status(500).json({ error: error.message });
        } finally {
          if (conn) await conn.end();
        }
      }
      if (resolvedTask === "workspace-save") {
        const result = await handleWorkspaceSave(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === "workspace-query") {
        const result = await handleWorkspaceQuery(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === "workspace-list") {
        const result = await handleWorkspaceList(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === "outreach-collect") {
        const result = await handleOutreachCollect(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === "outreach-list") {
        const result = await handleOutreachList(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === "outreach-save-candidates" || resolvedTask === "outreach-save") {
        const result = await handleOutreachSaveCandidates(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === "outreach-mail-prepare") {
        const result = await handleOutreachMailPrepare(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === "outreach-mail-send") {
        const result = await handleOutreachMailSend(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === "market-price-check") {
        const result = await handleMarketPriceCheck(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === "market-price-list") {
        const result = await handleMarketPriceList(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === "kamis-mini") {
        const result = await handleKamisMini(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === "smartstore-process-order") {
        const result = await handleSmartstoreProcessOrder(params || rest);
        return res.status(200).json(result);
      }
      if (resolvedTask === "daily-brief-24h") {
        const result = await handleDailyBrief24h(params || rest);
        return res.status(200).json(result);
      }
      return res.status(400).json({ error: `Unknown task: ${resolvedTask}` });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("[cloud-proxy] Error:", error.message);
    return res.status(503).json({
      error: "Service error",
      message: error.message
    });
  }
}
const SENDER_NAME = "selen \uC140\uB80C";
const SENDER_PHONE_ORDER = "010-9943-3201";
const MANAGER_NAME_ORDER = "\uC774\uD61C\uC548";
const DELIVERY_FEE = 3e3;
const BAM_SUPPLY = {
  "\uACF5\uC8FC\uC54C\uBC24 \uB300(1kg)": 8e3,
  "\uACF5\uC8FC\uC54C\uBC24 \uB300(2kg)\uC774\uC0C1": 14e3,
  "\uACF5\uC8FC\uC54C\uBC24 \uD2B9(1kg)": 1e4,
  "\uACF5\uC8FC\uC54C\uBC24 \uD2B9(2kg)\uC774\uC0C1": 17e3,
  "\uD3EC\uB974\uB2E8\uCE7C\uC9D1\uBC24 \uB300(1kg)": 11e3,
  "\uD3EC\uB974\uB2E8\uCE7C\uC9D1\uBC24 \uB300(2kg)\uC774\uC0C1": 2e4,
  "\uD3EC\uB974\uB2E8\uCE7C\uC9D1\uBC24 \uD2B9(1kg)": 12e3,
  "\uD3EC\uB974\uB2E8\uCE7C\uC9D1\uBC24 \uD2B9(2kg)\uC774\uC0C1": 22e3,
  "\uC625\uAD11\uBC24 \uB300(1kg)": 15e3,
  "\uC625\uAD11\uBC24 \uB300(2kg)\uC774\uC0C1": 28e3,
  "\uB300\uBCF4\uBC24 \uD2B9(1kg)": 11e3,
  "\uB300\uBCF4\uBC24 \uD2B9(2kg)\uC774\uC0C1": 2e4
};
const BAM_SALE = {
  "\uACF5\uC8FC\uC54C\uBC24 \uB300(1kg)": 13800,
  "\uACF5\uC8FC\uC54C\uBC24 \uB300(2kg)\uC774\uC0C1": 24800,
  "\uACF5\uC8FC\uC54C\uBC24 \uD2B9(1kg)": 16800,
  "\uACF5\uC8FC\uC54C\uBC24 \uD2B9(2kg)\uC774\uC0C1": 27800,
  "\uD3EC\uB974\uB2E8\uCE7C\uC9D1\uBC24 \uB300(1kg)": 19800,
  "\uD3EC\uB974\uB2E8\uCE7C\uC9D1\uBC24 \uB300(2kg)\uC774\uC0C1": 30800,
  "\uD3EC\uB974\uB2E8\uCE7C\uC9D1\uBC24 \uD2B9(1kg)": 22800,
  "\uD3EC\uB974\uB2E8\uCE7C\uC9D1\uBC24 \uD2B9(2kg)\uC774\uC0C1": 32800,
  "\uB300\uBCF4\uBC24 \uD2B9(1kg)": 20800,
  "\uB300\uBCF4\uBC24 \uD2B9(2kg)\uC774\uC0C1": 30800
};
const OKSU_SUPPLY = {
  "\uB0C9\uB3D9 \uB300\uD559\uCC30\uC625\uC218\uC218 3X5 15\uAC1C": 15e3,
  "\uB0C9\uB3D9 \uB300\uD559\uCC30\uC625\uC218\uC218 3X7 21\uAC1C": 21e3,
  "\uB0C9\uB3D9 \uB300\uD559\uCC30\uC625\uC218\uC218 3X10 30\uAC1C": 3e4
};
const OKSU_SALE = {
  "\uB0C9\uB3D9 \uB300\uD559\uCC30\uC625\uC218\uC218 3X5 15\uAC1C": 28500,
  "\uB0C9\uB3D9 \uB300\uD559\uCC30\uC625\uC218\uC218 3X7 21\uAC1C": 36500,
  "\uB0C9\uB3D9 \uB300\uD559\uCC30\uC625\uC218\uC218 3X10 30\uAC1C": 52500
};
const LOGEN_HEADERS = ["\uC81C  \uD488", "\uC218\uB7C9", "\uBCF4\uB0B4\uC2DC\uB294\uBD84\uC774\uB984", "\uBCF4\uB0B4\uC2DC\uB294\uBD84 \uC804\uD654\uBC88\uD638", "\uBC1B\uB294\uBD84\uC774\uB984", "\uBC1B\uB294\uBD84\uC804\uD654\uBC88\uD638", "\uBC1B\uB294\uBD84\uD578\uB4DC\uD3F0\uBC88\uD638", "\uC8FC\uC18C", "\uBE44\uACE0", "\uC6B0\uD3B8\uBC88\uD638"];
const LOTTE_HEADERS = ["\uC0C1\uD488\uC8FC\uBB38\uBC88\uD638", "\uC774\uB984", "\uC635\uC158\uC815\uBCF4", "\uC218\uB7C9", "\uC5F0\uB77D\uCC98", "\uBC30\uC1A1\uC9C0"];
function normalizeOptionOrder(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  const src = s.includes(":") ? (s.split(":").pop() || "").trim() : s;
  const bamMatch = src.match(/(공주알밤|포르단칼집밤|옥광밤|대보밤)\s*(대|특)\s*(\d+)\s*kg/i);
  if (bamMatch) {
    const kg = parseInt(bamMatch[3]);
    return `${bamMatch[1]} ${bamMatch[2]}(${kg}kg)${kg >= 2 ? "\uC774\uC0C1" : ""}`;
  }
  const oksuMatch = src.match(/(\d+)[Xx×](\d+)\s*(\d+)개?/);
  if (oksuMatch) {
    return `\uB0C9\uB3D9 \uB300\uD559\uCC30\uC625\uC218\uC218 ${oksuMatch[1]}X${oksuMatch[2]} ${oksuMatch[3]}\uAC1C`;
  }
  if (src.includes("3X5") || src.includes("15\uAC1C")) return "\uB0C9\uB3D9 \uB300\uD559\uCC30\uC625\uC218\uC218 3X5 15\uAC1C";
  if (src.includes("3X7") || src.includes("21\uAC1C")) return "\uB0C9\uB3D9 \uB300\uD559\uCC30\uC625\uC218\uC218 3X7 21\uAC1C";
  if (src.includes("3X10") || src.includes("30\uAC1C")) return "\uB0C9\uB3D9 \uB300\uD559\uCC30\uC625\uC218\uC218 3X10 30\uAC1C";
  return src;
}
function detectProductTypeOrder(option) {
  const BAM_KEYWORDS = ["\uACF5\uC8FC\uC54C\uBC24", "\uD3EC\uB974\uB2E8", "\uCE7C\uC9D1\uBC24", "\uC625\uAD11\uBC24", "\uB300\uBCF4\uBC24"];
  const OKSU_KEYWORDS = ["\uC625\uC218\uC218", "\uCC30\uC625\uC218\uC218", "3X5", "3X7", "3X10"];
  if (BAM_KEYWORDS.some((k) => option.includes(k))) return "bam";
  if (OKSU_KEYWORDS.some((k) => option.includes(k))) return "oksu";
  return "unknown";
}
async function createOrderExcelBuffer(orders, productType, templateType) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("\uBC1C\uC8FC\uC11C");
  const COLOR = productType === "bam" ? "FFD4A017" : "FF1E90FF";
  if (templateType === "logen") {
    ws.columns = [
      { header: "\uC81C  \uD488", key: "product", width: 30 },
      { header: "\uC218\uB7C9", key: "qty", width: 8 },
      { header: "\uBCF4\uB0B4\uC2DC\uB294\uBD84\uC774\uB984", key: "senderName", width: 16 },
      { header: "\uBCF4\uB0B4\uC2DC\uB294\uBD84 \uC804\uD654\uBC88\uD638", key: "senderPhone", width: 20 },
      { header: "\uBC1B\uB294\uBD84\uC774\uB984", key: "recvName", width: 14 },
      { header: "\uBC1B\uB294\uBD84\uC804\uD654\uBC88\uD638", key: "recvPhone1", width: 16 },
      { header: "\uBC1B\uB294\uBD84\uD578\uB4DC\uD3F0\uBC88\uD638", key: "recvPhone2", width: 16 },
      { header: "\uC8FC\uC18C", key: "address", width: 45 },
      { header: "\uBE44\uACE0", key: "note", width: 12 },
      { header: "\uC6B0\uD3B8\uBC88\uD638", key: "zip", width: 10 }
    ];
    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR } };
      cell.alignment = { horizontal: "center" };
    });
    for (const o of orders) {
      ws.addRow({
        product: o.option,
        qty: o.quantity,
        senderName: SENDER_NAME,
        senderPhone: SENDER_PHONE_ORDER,
        recvName: o.recipientName,
        recvPhone1: o.recipientPhone,
        recvPhone2: o.recipientPhone,
        address: o.address,
        note: "",
        zip: ""
      });
    }
  } else {
    ws.columns = [
      { header: "\uC0C1\uD488\uC8FC\uBB38\uBC88\uD638", key: "orderId", width: 20 },
      { header: "\uC774\uB984", key: "name", width: 14 },
      { header: "\uC635\uC158\uC815\uBCF4", key: "option", width: 30 },
      { header: "\uC218\uB7C9", key: "qty", width: 8 },
      { header: "\uC5F0\uB77D\uCC98", key: "phone", width: 16 },
      { header: "\uBC30\uC1A1\uC9C0", key: "address", width: 45 }
    ];
    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR } };
      cell.alignment = { horizontal: "center" };
    });
    for (const o of orders) {
      ws.addRow({
        orderId: o.productOrderId,
        name: o.recipientName,
        option: o.option,
        qty: o.quantity,
        phone: o.recipientPhone,
        address: o.address
      });
    }
  }
  return await wb.xlsx.writeBuffer();
}
async function createSettlementBuffer(qtyMap, supplyMap, saleMap, productType, today) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const GOLD = "FFD4A017";
  const typeName = productType === "bam" ? "\uBC24" : "\uC625\uC218\uC218";
  const supWs = wb.addWorksheet("\uACF5\uAE09\uC790\uC6A9");
  supWs.columns = [
    { key: "A", width: 32 },
    { key: "B", width: 8 },
    { key: "C", width: 14 },
    { key: "D", width: 14 },
    { key: "E", width: 16 }
  ];
  supWs.addRow([`\uC0C8\uBCBD\uC7A5\uD130 ${typeName} \uC815\uC0B0\uC11C (\uBC30\uC1A1\uBE44\uBCC4\uB3C4)`]);
  supWs.getCell("A1").font = { bold: true, size: 13 };
  supWs.addRow(["\uB0A0\uC9DC", today, "", "\uB2F4\uB2F9\uC790", MANAGER_NAME_ORDER]);
  supWs.addRow([`\uBC30\uC1A1\uBE44: ${DELIVERY_FEE.toLocaleString()}\uC6D0/\uAC74`]);
  supWs.addRow([]);
  supWs.addRow(["\uC81C\uD488\uBA85", "\uC218\uB7C9", "\uC81C\uD488\uC6D0\uAC00", "\uBC30\uC1A1\uBE44", "\uC81C\uD488\uC6D0\uAC00+\uBC30\uC1A1\uBE44"]);
  const hRow = supWs.lastRow;
  hRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
    cell.alignment = { horizontal: "center" };
  });
  let totalSupply = 0, totalDelivery = 0, totalSettlement = 0;
  const unknownOptions = [];
  for (const [option, qty] of Object.entries(qtyMap)) {
    const sp = supplyMap[option] || 0;
    if (!supplyMap[option]) unknownOptions.push(option);
    const dt = qty * DELIVERY_FEE;
    const st = qty * sp;
    const total = st + dt;
    totalSupply += st;
    totalDelivery += dt;
    totalSettlement += total;
    const row = supWs.addRow([option, qty, st, dt, total]);
    [3, 4, 5].forEach((c) => {
      row.getCell(c).numFmt = "#,##0";
    });
  }
  supWs.addRow([]);
  const totRow = supWs.addRow(["\uD569\uACC4", "", totalSupply, totalDelivery, totalSettlement]);
  [3, 4, 5].forEach((c) => {
    totRow.getCell(c).numFmt = "#,##0";
    totRow.getCell(c).font = { bold: true };
  });
  const intWs = wb.addWorksheet("\uC0C8\uBCBD\uC7A5\uD130\uC6A9");
  intWs.columns = [
    { key: "A", width: 32 },
    { key: "B", width: 8 },
    { key: "C", width: 14 },
    { key: "D", width: 14 },
    { key: "E", width: 16 },
    { key: "F", width: 14 },
    { key: "G", width: 14 }
  ];
  intWs.addRow([`\uC0C8\uBCBD\uC7A5\uD130 ${typeName} \uC815\uC0B0\uC11C (\uB0B4\uBD80\uC6A9)`]);
  intWs.getCell("A1").font = { bold: true, size: 13 };
  intWs.addRow(["\uB0A0\uC9DC", today, "", "\uB2F4\uB2F9\uC790", MANAGER_NAME_ORDER]);
  intWs.addRow([]);
  intWs.addRow(["\uC81C\uD488\uBA85", "\uC218\uB7C9", "\uC81C\uD488\uC6D0\uAC00", "\uBC30\uC1A1\uBE44", "\uC6D0\uAC00+\uBC30\uC1A1", "\uB9E4\uCD9C\uC561", "\uC21C\uC218\uC775"]);
  const hRow2 = intWs.lastRow;
  hRow2.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
    cell.alignment = { horizontal: "center" };
  });
  let totalRevenue = 0, totalProfit = 0;
  for (const [option, qty] of Object.entries(qtyMap)) {
    const sp = supplyMap[option] || 0;
    const slp = saleMap[option] || 0;
    const dt = qty * DELIVERY_FEE;
    const st = qty * sp;
    const cost = st + dt;
    const rev = qty * slp;
    const profit = rev - cost;
    totalRevenue += rev;
    totalProfit += profit;
    const row = intWs.addRow([option, qty, st, dt, cost, rev, profit]);
    [3, 4, 5, 6, 7].forEach((c) => {
      row.getCell(c).numFmt = "#,##0";
    });
  }
  intWs.addRow([]);
  const totRow2 = intWs.addRow(["\uD569\uACC4", "", totalSupply, totalDelivery, totalSettlement, totalRevenue, totalProfit]);
  [3, 4, 5, 6, 7].forEach((c) => {
    totRow2.getCell(c).numFmt = "#,##0";
    totRow2.getCell(c).font = { bold: true };
  });
  const buffer = await wb.xlsx.writeBuffer();
  return { buffer, totalSupply, totalDelivery, totalSettlement, totalRevenue, totalProfit, unknownOptions };
}
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_DAILY_BRIEF_CHAT_ID = process.env.TELEGRAM_DAILY_BRIEF_CHAT_ID || process.env.TELEGRAM_ALLOWED_CHAT_ID || "";
async function sendTelegramMessage(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_DAILY_BRIEF_CHAT_ID) {
    return { sent: false, error: "skipped_env_missing" };
  }
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_DAILY_BRIEF_CHAT_ID,
        text,
        parse_mode: "HTML"
      })
    });
    const data = await res.json();
    if (data.ok) return { sent: true };
    return { sent: false, error: data.description || "telegram_api_error" };
  } catch (e) {
    return { sent: false, error: e.message };
  }
}
async function handleDailyBrief24h(params) {
  const { dryRun = false, sendTelegram = true } = params || {};
  const now = /* @__PURE__ */ new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1e3);
  const kst24hAgo = new Date(kstNow.getTime() - 24 * 60 * 60 * 1e3);
  const dateKst = kstNow.toISOString().slice(0, 10);
  const periodStartKst = kst24hAgo.toISOString();
  const periodEndKst = kstNow.toISOString();
  const briefId = generateRecordId("brief");
  let ssData = { newOrders: 0, pendingShipping: 0, shipping: 0, delivered: 0, purchaseConfirmed: 0, confirmNeeded: 0 };
  try {
    const rawCounts = await getSmartstoreStatusCounts(30);
    if (rawCounts) {
      ssData = {
        newOrders: rawCounts.newOrders?.length || 0,
        pendingShipping: rawCounts.pendingShipping?.length || 0,
        shipping: rawCounts.shipping ?? 0,
        delivered: rawCounts.delivered ?? 0,
        purchaseConfirmed: rawCounts.purchaseConfirmed ?? 0,
        confirmNeeded: rawCounts.payed?.length || 0
      };
    }
  } catch (e) {
  }
  let outreachData = {
    discovered: 0,
    publicEmailFound: 0,
    contactUrlFound: 0,
    draftReady: 0,
    approvalWaiting: 0,
    emailSent: 0,
    positiveReplies: 0,
    accepted: 0,
    followupNeeded: 0,
    followupDrafted: 0,
    followupSent: 0
  };
  try {
    const outreachRes = await handleOutreachList({ limit: 500 });
    if (outreachRes.success && outreachRes.candidates) {
      const list = outreachRes.candidates;
      outreachData = {
        discovered: list.length,
        publicEmailFound: list.filter((c) => c.email_status === "public_email").length,
        contactUrlFound: list.filter((c) => c.email_status === "contact_form" || c.email_status === "no_public_email").length,
        draftReady: list.filter((c) => c.outreach_status === "drafted").length,
        approvalWaiting: list.filter((c) => c.outreach_status === "drafted" && c.reply_status === "none").length,
        emailSent: list.filter((c) => c.outreach_status === "sent").length,
        positiveReplies: list.filter((c) => c.reply_status === "positive").length,
        accepted: list.filter((c) => c.outreach_status === "closed" && c.reply_status === "positive").length,
        followupNeeded: list.filter((c) => c.outreach_status === "follow_up_needed").length,
        followupDrafted: 0,
        followupSent: 0
      };
    }
  } catch (e) {
  }
  const hotContent = { youtube: 0, threads: 0, instagram: 0, tiktok: 0, naverBlog: 0 };
  const hotContentNotes = "hot_content_not_connected";
  const briefRow = [
    briefId,
    dateKst,
    periodStartKst,
    periodEndKst,
    String(ssData.newOrders),
    String(ssData.pendingShipping),
    String(ssData.shipping),
    String(ssData.delivered),
    String(ssData.purchaseConfirmed),
    String(ssData.confirmNeeded),
    String(outreachData.discovered),
    String(outreachData.publicEmailFound),
    String(outreachData.contactUrlFound),
    String(outreachData.draftReady),
    String(outreachData.approvalWaiting),
    String(outreachData.emailSent),
    String(outreachData.positiveReplies),
    String(outreachData.accepted),
    String(outreachData.followupNeeded),
    String(outreachData.followupDrafted),
    String(outreachData.followupSent),
    String(hotContent.youtube),
    String(hotContent.threads),
    String(hotContent.instagram),
    String(hotContent.tiktok),
    String(hotContent.naverBlog),
    "",
    "",
    "",
    now.toISOString(),
    hotContentNotes
  ];
  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      briefId,
      dateKst,
      periodStartKst,
      periodEndKst,
      smartstore: ssData,
      outreach: outreachData,
      hotContent,
      hotContentNotes,
      telegramConfigured: !!(TELEGRAM_BOT_TOKEN && TELEGRAM_DAILY_BRIEF_CHAT_ID)
    };
  }
  try {
    await ensureHeaders("daily_operations_brief");
    await sheetsAppend("daily_operations_brief", [briefRow]);
  } catch (e) {
    return { success: false, error: `daily_operations_brief \uC800\uC7A5 \uC2E4\uD328: ${e.message}` };
  }
  let telegramResult = { sent: false, error: "telegram_disabled" };
  if (sendTelegram) {
    const tgLines = [
      "<b>JARVIS Daily Operations Brief</b>",
      `<b>\uB0A0\uC9DC:</b> ${dateKst}`,
      "",
      "<b>[\uC2A4\uB9C8\uD2B8\uC2A4\uD1A0\uC5B4]</b>",
      `- \uC2E0\uADDC\uC8FC\uBB38: ${ssData.newOrders}\uAC74`,
      `- \uBC30\uC1A1\uC900\uBE44: ${ssData.pendingShipping}\uAC74`,
      `- \uBC30\uC1A1\uC911: ${ssData.shipping}\uAC74`,
      `- \uBC30\uC1A1\uC644\uB8CC: ${ssData.delivered}\uAC74`,
      `- \uAD6C\uB9E4\uD655\uC815: ${ssData.purchaseConfirmed}\uAC74`,
      "",
      "<b>[\uC544\uC6C3\uB9AC\uCE58]</b>",
      `- \uD6C4\uBCF4: ${outreachData.discovered}\uBA85`,
      `- \uACF5\uAC1C\uC774\uBA54\uC77C: ${outreachData.publicEmailFound}\uBA85`,
      `- \uBC1C\uC1A1\uC644\uB8CC: ${outreachData.emailSent}\uAC74`,
      `- \uAE0D\uC815\uB2F5\uBCC0: ${outreachData.positiveReplies}\uAC74`,
      "",
      "<i>\uC0C1\uC138 \uB0B4\uC5ED\uC740 Google Sheets \uB610\uB294 \uC790\uBE44\uC2A4 \uD654\uBA74\uC5D0\uC11C \uD655\uC778\uD558\uC138\uC694.</i>"
    ];
    telegramResult = await sendTelegramMessage(tgLines.join("\n"));
    try {
      await ensureHeaders("telegram_notification_logs");
      await sheetsAppend("telegram_notification_logs", [[
        generateRecordId("tg"),
        briefId,
        "daily_brief",
        telegramResult.sent ? "true" : "false",
        telegramResult.sent ? now.toISOString() : "",
        telegramResult.error || "",
        telegramResult.error || "",
        now.toISOString(),
        ""
      ]]);
    } catch (e) {
    }
    try {
      const token = await getGoogleSheetsToken();
      const existing = await sheetsRead("daily_operations_brief");
      const rows = existing.values || [];
      const headers = rows[0] || [];
      const tgSentIdx = headers.indexOf("telegram_sent");
      const tgSentAtIdx = headers.indexOf("telegram_sent_at");
      const tgErrIdx = headers.indexOf("telegram_error_code");
      const lastRowNum = rows.length;
      if (tgSentIdx >= 0) {
        const colLetter = String.fromCharCode(65 + tgSentIdx);
        const range = encodeURIComponent(`daily_operations_brief!${colLetter}${lastRowNum}`);
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${range}?valueInputOption=RAW`;
        await fetch(url, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [[telegramResult.sent ? "true" : "false"]] })
        });
      }
      if (tgSentAtIdx >= 0 && telegramResult.sent) {
        const colLetter = String.fromCharCode(65 + tgSentAtIdx);
        const range = encodeURIComponent(`daily_operations_brief!${colLetter}${lastRowNum}`);
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${range}?valueInputOption=RAW`;
        await fetch(url, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [[now.toISOString()]] })
        });
      }
      if (tgErrIdx >= 0 && telegramResult.error) {
        const colLetter = String.fromCharCode(65 + tgErrIdx);
        const range = encodeURIComponent(`daily_operations_brief!${colLetter}${lastRowNum}`);
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${WORKSPACE_SHEET_ID}/values/${range}?valueInputOption=RAW`;
        await fetch(url, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [[telegramResult.error]] })
        });
      }
    } catch (e) {
    }
  }
  return {
    success: true,
    briefId,
    dateKst,
    periodStartKst,
    periodEndKst,
    smartstore: ssData,
    outreach: outreachData,
    hotContent,
    hotContentNotes,
    telegram: {
      configured: !!(TELEGRAM_BOT_TOKEN && TELEGRAM_DAILY_BRIEF_CHAT_ID),
      sent: telegramResult.sent,
      error: telegramResult.error || null
    },
    savedToSheets: true
  };
}
async function handleSmartstoreProcessOrder(params) {
  const { action, fileBase64, fileName, date, dryRun = true, templateType } = params;
  if (action === "check_templates") {
    return {
      success: true,
      mode: "dry_run",
      task: "smartstore_process_order",
      templates: {
        lotte: "found",
        logen: "found",
        cornSettlement: "found",
        chestnutSettlement: "found"
      },
      templateHeaders: {
        lotte: LOTTE_HEADERS,
        logen: LOGEN_HEADERS
      },
      costData: {
        corn: Object.keys(OKSU_SUPPLY).map((k) => ({ product: k, supply: OKSU_SUPPLY[k], sale: OKSU_SALE[k] })),
        chestnut: Object.keys(BAM_SUPPLY).map((k) => ({ product: k, supply: BAM_SUPPLY[k], sale: BAM_SALE[k] || 0 }))
      },
      deliveryFee: DELIVERY_FEE,
      executeLocked: true
    };
  }
  if (action === "create_test_order") {
    const targetTemplate = templateType || "logen";
    const targetType = params.productType || "oksu";
    const today = date || (/* @__PURE__ */ new Date()).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
    const dummyOrders = [
      { productOrderId: "TEST_0001", recipientName: "\uD64D*\uB3D9", optionRaw: "", option: targetType === "bam" ? "\uD3EC\uB974\uB2E8\uCE7C\uC9D1\uBC24 \uB300(2kg)\uC774\uC0C1" : "\uB0C9\uB3D9 \uB300\uD559\uCC30\uC625\uC218\uC218 3X5 15\uAC1C", quantity: 1, recipientPhone: "010-****-1234", address: "\uC11C\uC6B8\uC2DC \uAC15\uB0A8\uAD6C ***\uB85C 123" },
      { productOrderId: "TEST_0002", recipientName: "\uAE40*\uC218", optionRaw: "", option: targetType === "bam" ? "\uACF5\uC8FC\uC54C\uBC24 \uD2B9(1kg)" : "\uB0C9\uB3D9 \uB300\uD559\uCC30\uC625\uC218\uC218 3X7 21\uAC1C", quantity: 2, recipientPhone: "010-****-5678", address: "\uACBD\uAE30\uB3C4 \uC131\uB0A8\uC2DC ***\uB85C 456" },
      { productOrderId: "TEST_0003", recipientName: "\uC774*\uC601", optionRaw: "", option: targetType === "bam" ? "\uACF5\uC8FC\uC54C\uBC24 \uB300(1kg)" : "\uB0C9\uB3D9 \uB300\uD559\uCC30\uC625\uC218\uC218 3X10 30\uAC1C", quantity: 1, recipientPhone: "010-****-9012", address: "\uC778\uCC9C\uC2DC \uC5F0\uC218\uAD6C ***\uB85C 789" }
    ];
    const orderBuffer = await createOrderExcelBuffer(dummyOrders, targetType, targetTemplate);
    const typeName = targetType === "bam" ? "\uBC24" : "\uC625\uC218\uC218";
    const templateName = targetTemplate === "lotte" ? "\uB86F\uB370\uD0DD\uBC30" : "\uB85C\uC820\uD0DD\uBC30";
    const orderFileName = `TEST_${templateName}_${typeName}\uBC1C\uC8FC\uC11C_${today}.xlsx`;
    return {
      success: true,
      mode: "dry_run",
      task: "create_test_order",
      orderSheet: Buffer.from(orderBuffer).toString("base64"),
      orderFileName,
      orderCount: dummyOrders.length,
      templateType: targetTemplate,
      productType: targetType,
      summary: {
        totalRows: dummyOrders.length,
        templateUsed: templateName,
        realCustomerData: false,
        executeLocked: true
      }
    };
  }
  if (action === "create_test_settlement") {
    const targetType = params.productType || "oksu";
    const today = date || (/* @__PURE__ */ new Date()).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
    const supplyMap = targetType === "bam" ? BAM_SUPPLY : OKSU_SUPPLY;
    const saleMap = targetType === "bam" ? BAM_SALE : OKSU_SALE;
    const dummyQty = {};
    const keys = Object.keys(supplyMap);
    keys.forEach((k, i) => {
      dummyQty[k] = i === 0 ? 2 : i === 1 ? 1 : 0;
    });
    const settlement = await createSettlementBuffer(dummyQty, supplyMap, saleMap, targetType, today);
    const typeName = targetType === "bam" ? "\uBC24" : "\uC625\uC218\uC218";
    const settlementFileName = `TEST_${typeName}\uC815\uC0B0\uC11C_${today}.xlsx`;
    return {
      success: true,
      mode: "dry_run",
      task: "create_test_settlement",
      settlementSheet: Buffer.from(settlement.buffer).toString("base64"),
      settlementFileName,
      productType: targetType,
      summary: {
        totalSupply: settlement.totalSupply,
        totalDelivery: settlement.totalDelivery,
        totalSettlement: settlement.totalSettlement,
        totalRevenue: settlement.totalRevenue,
        totalProfit: settlement.totalProfit,
        unknownOptions: settlement.unknownOptions,
        realCustomerData: false,
        executeLocked: true
      }
    };
  }
  if (action === "full_process" || action === "create_order") {
    if (!fileBase64) {
      return { success: false, error: "\uD30C\uC77C \uB370\uC774\uD130 \uC5C6\uC74C (fileBase64 \uD544\uC218)" };
    }
    const isDryRun = dryRun !== false;
    const ExcelJS = (await import("exceljs")).default;
    const fileBuffer = Buffer.from(fileBase64, "base64");
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(fileBuffer);
    } catch (e) {
      return { success: false, error: "\uD30C\uC77C \uC5F4\uAE30 \uC2E4\uD328. xlsx \uD615\uC2DD\uC778\uC9C0 \uD655\uC778\uD558\uC138\uC694." };
    }
    const ws = wb.worksheets[0];
    const orders = [];
    ws.eachRow((row, rn) => {
      if (rn < 3) return;
      const vals = row.values;
      const orderId = vals[1];
      if (!orderId) return;
      orders.push({
        productOrderId: String(orderId).trim(),
        recipientName: String(vals[8] || "").trim(),
        optionRaw: String(vals[10] || "").trim(),
        option: "",
        quantity: parseInt(vals[11]) || 1,
        recipientPhone: String(vals[14] || "").trim(),
        address: String(vals[18] || "").trim()
      });
    });
    if (orders.length === 0) {
      return { success: false, error: "\uC8FC\uBB38 \uB370\uC774\uD130 \uC5C6\uC74C" };
    }
    const bamOrders = [], oksuOrders = [], unknownOrders = [];
    for (const o of orders) {
      o.option = normalizeOptionOrder(o.optionRaw);
      const type = detectProductTypeOrder(o.option);
      if (type === "bam") bamOrders.push(o);
      else if (type === "oksu") oksuOrders.push(o);
      else unknownOrders.push(o);
    }
    const bamQty = {}, oksuQty = {};
    bamOrders.forEach((o) => {
      bamQty[o.option] = (bamQty[o.option] || 0) + o.quantity;
    });
    oksuOrders.forEach((o) => {
      oksuQty[o.option] = (oksuQty[o.option] || 0) + o.quantity;
    });
    const today = date || (/* @__PURE__ */ new Date()).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
    const prefix = isDryRun ? "TEST_" : "";
    let bamOrderSheet = "", bamOrderFileName = "";
    let oksuOrderSheet = "", oksuOrderFileName = "";
    let bamSettlementSheet = "", bamSettlementFileName = "";
    let oksuSettlementSheet = "", oksuSettlementFileName = "";
    let totalSettlement = 0, totalRevenue = 0, totalProfit = 0;
    const qtySummary = {};
    if (bamOrders.length > 0) {
      const buf = await createOrderExcelBuffer(bamOrders, "bam", "logen");
      bamOrderSheet = Buffer.from(buf).toString("base64");
      bamOrderFileName = `${prefix}\uC140\uB80C_\uBC24\uBC1C\uC8FC\uC11C_${today}.xlsx`;
      const settle = await createSettlementBuffer(bamQty, BAM_SUPPLY, BAM_SALE, "bam", today);
      bamSettlementSheet = Buffer.from(settle.buffer).toString("base64");
      bamSettlementFileName = `${prefix}\uBC24\uC815\uC0B0\uC11C_${today}.xlsx`;
      totalSettlement += settle.totalSettlement;
      totalRevenue += settle.totalRevenue;
      totalProfit += settle.totalProfit;
      Object.entries(bamQty).forEach(([k, v]) => {
        qtySummary[k] = v;
      });
    }
    if (oksuOrders.length > 0) {
      const buf = await createOrderExcelBuffer(oksuOrders, "oksu", "logen");
      oksuOrderSheet = Buffer.from(buf).toString("base64");
      oksuOrderFileName = `${prefix}\uC140\uB80C_\uC625\uC218\uC218\uBC1C\uC8FC\uC11C_${today}.xlsx`;
      const settle = await createSettlementBuffer(oksuQty, OKSU_SUPPLY, OKSU_SALE, "oksu", today);
      oksuSettlementSheet = Buffer.from(settle.buffer).toString("base64");
      oksuSettlementFileName = `${prefix}\uC625\uC218\uC218\uC815\uC0B0\uC11C_${today}.xlsx`;
      totalSettlement += settle.totalSettlement;
      totalRevenue += settle.totalRevenue;
      totalProfit += settle.totalProfit;
      Object.entries(oksuQty).forEach(([k, v]) => {
        qtySummary[k] = v;
      });
    }
    let emailSent = false;
    if (!isDryRun && action === "full_process") {
      return {
        success: false,
        error: "execute LOCKED: \uC2E4\uC81C \uC774\uBA54\uC77C \uBC1C\uC1A1\uC740 \uB300\uD45C\uB2D8 \uC2B9\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. dryRun: true\uB85C \uBA3C\uC800 \uD655\uC778\uD558\uC138\uC694.",
        executeLocked: true
      };
    }
    return {
      success: true,
      mode: isDryRun ? "dry_run" : "live",
      task: "smartstore_process_order",
      orderCount: orders.length,
      orderSheet: bamOrderSheet || oksuOrderSheet,
      orderFileName: bamOrderFileName || oksuOrderFileName,
      settlementSheet: bamSettlementSheet || oksuSettlementSheet,
      settlementFileName: bamSettlementFileName || oksuSettlementFileName,
      bamOrderSheet,
      bamOrderFileName,
      oksuOrderSheet,
      oksuOrderFileName,
      bamSettlementSheet,
      bamSettlementFileName,
      oksuSettlementSheet,
      oksuSettlementFileName,
      totalSettlement,
      totalRevenue,
      totalProfit,
      qtySummary,
      emailSent,
      summary: {
        total: orders.length,
        bam: bamOrders.length,
        oksu: oksuOrders.length,
        unknown: unknownOrders.length,
        unknownOptions: unknownOrders.map((o) => o.optionRaw).slice(0, 5)
      },
      executeLocked: true,
      workspaceSave: true
    };
  }
  return { success: false, error: `Unknown action: ${action}. \uC9C0\uC6D0: check_templates, create_test_order, create_test_settlement, full_process, create_order` };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  config
});
