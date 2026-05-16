var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var keyword_radar_exports = {};
__export(keyword_radar_exports, {
  default: () => handler
});
module.exports = __toCommonJS(keyword_radar_exports);
function extractProductId(url) {
  try {
    const m1 = url.match(/\/products\/(\d{8,})/);
    if (m1) return m1[1];
    const m2 = url.match(/\/window-products\/(\d{8,})/);
    if (m2) return m2[1];
    const urlObj = new URL(url);
    const qpId = urlObj.searchParams.get("productId");
    if (qpId && /^\d{8,}$/.test(qpId)) return qpId;
    return null;
  } catch {
    const m = url.match(/\/products\/(\d{8,})/);
    return m ? m[1] : null;
  }
}
function extractNlQuery(url) {
  try {
    const urlObj = new URL(url);
    const nlQuery = urlObj.searchParams.get("nl-query");
    if (nlQuery && nlQuery.trim().length > 0) {
      return decodeURIComponent(nlQuery.trim());
    }
    return null;
  } catch {
    const m = url.match(/[?&]nl-query=([^&]+)/);
    if (m) {
      try {
        return decodeURIComponent(m[1]);
      } catch {
        return m[1];
      }
    }
    return null;
  }
}
function cleanProductName(raw) {
  let name = raw.replace(/\s*[:：]\s*네이버.*$/i, "").replace(/\s*[-–—]\s*네이버.*$/i, "").replace(/\s*\|\s*.*$/, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();
  return name.length > 0 ? name : raw.trim();
}
function extractNameFromHtml(html) {
  const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (ogMatch) {
    const name = cleanProductName(ogMatch[1]);
    if (name && name.length > 1) return { productName: name, source: "og:title" };
  }
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    const name = cleanProductName(titleMatch[1]);
    if (name && name.length > 1) return { productName: name, source: "title" };
  }
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ldMatch;
  while ((ldMatch = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(ldMatch[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item["@type"] === "Product" && typeof item.name === "string") {
          const name = cleanProductName(item.name);
          if (name && name.length > 1) return { productName: name, source: "json_ld" };
        }
      }
    } catch {
    }
  }
  return null;
}
async function resolveProductName(productUrl, productId, keywordHint, clientId, clientSecret) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6e3);
    const res = await fetch(productUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "ko-KR,ko;q=0.9"
      },
      signal: controller.signal,
      redirect: "follow"
    });
    clearTimeout(timeout);
    if (res.ok) {
      const html = await res.text();
      const htmlResult = extractNameFromHtml(html);
      if (htmlResult) {
        return { productName: htmlResult.productName, source: htmlResult.source };
      }
    }
  } catch {
  }
  if (productId && keywordHint) {
    try {
      const searchUrl = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keywordHint)}&display=100&sort=sim`;
      const searchRes = await fetch(searchUrl, {
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret
        }
      });
      if (searchRes.ok) {
        const data = await searchRes.json();
        const items = data.items || [];
        for (const item of items) {
          const link = item.link || "";
          const mallProductId = item.mallProductId || item.productId || "";
          if (link.includes(productId) || String(mallProductId) === productId) {
            const rawTitle = item.title || "";
            const cleanedTitle = rawTitle.replace(/<[^>]+>/g, "").trim();
            if (cleanedTitle && cleanedTitle.length > 1) {
              return { productName: cleanedTitle, source: "search_result" };
            }
          }
        }
      }
    } catch {
    }
  }
  if (keywordHint && keywordHint.length > 0) {
    return { productName: keywordHint, source: "keyword_hint" };
  }
  return { productName: null, source: "failed" };
}
function generateKeywords(productName, productNameSource, manualKeywords, nlQueryHint) {
  const keywords = [];
  if (nlQueryHint && nlQueryHint.trim().length > 0) {
    const hint = nlQueryHint.trim();
    if (!keywords.includes(hint)) keywords.push(hint);
  }
  if (manualKeywords && manualKeywords.length > 0) {
    for (const kw of manualKeywords) {
      if (kw.trim().length > 0 && !keywords.includes(kw.trim()) && keywords.length < 5) {
        keywords.push(kw.trim());
      }
    }
  }
  if (keywords.length >= 5) return keywords.slice(0, 5);
  if (productName && productName.length > 0 && productNameSource !== "keyword_hint" && productNameSource !== "failed" && productNameSource !== "manual") {
    const cleaned = productName.replace(/[[\](){}<>【】「」『』""'']/g, " ").replace(/[!@#$%^&*+=~`|\\]/g, " ").replace(/\s+/g, " ").trim();
    const words = cleaned.split(" ").filter((w) => w.length > 0);
    const stopWords = [
      "\uD2B9\uAC00",
      "\uD560\uC778",
      "\uBB34\uB8CC\uBC30\uC1A1",
      "\uB2F9\uC77C\uBC1C\uC1A1",
      "\uAD6D\uB0B4\uC0B0",
      "\uD504\uB9AC\uBBF8\uC5C4",
      "\uACE0\uAE09",
      "\uCD5C\uC0C1\uAE09",
      "\uD2B9\uD488",
      "\uC0C1\uD488",
      "\uC120\uBB3C\uC138\uD2B8",
      "\uC120\uBB3C\uC6A9",
      "\uAC00\uC815\uC6A9",
      "\uC5C5\uC18C\uC6A9",
      "\uB300\uC6A9\uB7C9",
      "\uC18C\uD3EC\uC7A5",
      "\uAC1C\uC785",
      "\uC785",
      "\uAC1C",
      "\uD329",
      "kg",
      "g",
      "ml",
      "L",
      "\uBC15\uC2A4",
      "\uC138\uD2B8"
    ];
    const coreWords = words.filter((w) => {
      if (/^\d+[개입팩kgmlL박스세트]*$/.test(w)) return false;
      if (stopWords.some((sw) => w.toLowerCase().includes(sw.toLowerCase()))) return false;
      return w.length >= 2;
    });
    if (cleaned.length <= 30 && !keywords.includes(cleaned) && keywords.length < 5) {
      keywords.push(cleaned);
    }
    if (coreWords.length >= 3) {
      const combo = coreWords.slice(0, 3).join(" ");
      if (!keywords.includes(combo) && keywords.length < 5) keywords.push(combo);
    }
    if (coreWords.length >= 2) {
      const combo2 = coreWords.slice(0, 2).join(" ");
      if (!keywords.includes(combo2) && keywords.length < 5) keywords.push(combo2);
    }
    if (coreWords.length >= 1 && !keywords.includes(coreWords[0]) && keywords.length < 5) {
      keywords.push(coreWords[0]);
    }
    const quantityWord = words.find((w) => /^\d+[개입팩]+$/.test(w));
    if (quantityWord && coreWords.length >= 1 && keywords.length < 5) {
      const withQty = `${coreWords[0]} ${quantityWord}`;
      if (!keywords.includes(withQty)) keywords.push(withQty);
    }
  }
  return keywords.filter((k) => k.trim().length > 0).slice(0, 5);
}
function normalizeUrlForMatch(url) {
  try {
    return decodeURIComponent(url).toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}
function matchProductId(item, productId) {
  const link = item.link || "";
  const mallProductId = item.mallProductId || item.productId || "";
  const normalizedLink = normalizeUrlForMatch(link);
  const normalizedId = productId.toLowerCase();
  if (link.includes(productId)) return { matched: true, strategy: "productId_in_href" };
  if (normalizedLink.includes(normalizedId)) return { matched: true, strategy: "productId_in_decoded_href" };
  if (String(mallProductId) === productId) return { matched: true, strategy: "mallProductId_field_match" };
  if (normalizedLink.includes(`/products/${normalizedId}`)) return { matched: true, strategy: "products_path_match" };
  if (normalizedLink.includes(`/${normalizedId}`) && normalizedLink.includes("naver.com")) {
    return { matched: true, strategy: "naver_path_match" };
  }
  return { matched: false, strategy: "no_match" };
}
async function measureRank(keyword, productId, _productUrl, maxRank, clientId, clientSecret) {
  const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
  try {
    const searchUrl = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keyword)}&display=${Math.min(maxRank, 100)}&sort=sim`;
    const res = await fetch(searchUrl, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret
      }
    });
    if (!res.ok) {
      return {
        result: { keyword, rank: null, status: "error", rankType: "unknown", checkedAt, source: "naver_shopping_search" },
        matchStrategy: "api_error"
      };
    }
    const data = await res.json();
    const items = data.items || [];
    if (productId) {
      for (let i = 0; i < items.length; i++) {
        const { matched, strategy } = matchProductId(items[i], productId);
        if (matched) {
          return {
            result: { keyword, rank: i + 1, status: "found", rankType: "organic_or_mixed", checkedAt, source: "naver_shopping_search" },
            matchStrategy: strategy
          };
        }
      }
      return {
        result: { keyword, rank: null, status: "not_found", rankType: "organic_or_mixed", checkedAt, source: "naver_shopping_search" },
        matchStrategy: "scanned_all_not_found"
      };
    }
    return {
      result: { keyword, rank: null, status: "not_found", rankType: "unknown", checkedAt, source: "naver_shopping_search" },
      matchStrategy: "no_productId"
    };
  } catch {
    return {
      result: { keyword, rank: null, status: "error", rankType: "unknown", checkedAt, source: "naver_shopping_search" },
      matchStrategy: "network_error"
    };
  }
}
async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({ success: false, message: "Naver API credentials not configured" });
  }
  const { productUrl, manualKeywords, maxRank = 100 } = req.body || {};
  if (!productUrl || typeof productUrl !== "string") {
    return res.status(400).json({ success: false, productUrl: productUrl || "", keywords: [], message: "\uC0C1\uD488 URL\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694." });
  }
  if (!productUrl.includes("naver.com") && !productUrl.includes("shopping.naver")) {
    return res.status(400).json({ success: false, productUrl, keywords: [], message: "\uB124\uC774\uBC84 \uC2A4\uB9C8\uD2B8\uC2A4\uD1A0\uC5B4 \uB610\uB294 \uB124\uC774\uBC84 \uC1FC\uD551 URL\uB9CC \uC9C0\uC6D0\uD569\uB2C8\uB2E4." });
  }
  const productId = extractProductId(productUrl);
  const keywordHint = extractNlQuery(productUrl);
  const { productName, source: productNameSource } = await resolveProductName(
    productUrl,
    productId,
    keywordHint,
    clientId,
    clientSecret
  );
  const productNameResolved = productName !== null && productName.length > 0 && productNameSource !== "failed";
  if (!productNameResolved && (!manualKeywords || manualKeywords.length === 0) && !keywordHint) {
    return res.status(200).json({
      success: false,
      productUrl,
      productNameSource: "failed",
      keywords: [],
      diagnostics: {
        productId,
        productIdExtracted: productId !== null,
        productNameResolved: false,
        productNameSource: "failed",
        keywordHint,
        checkedKeywords: 0,
        maxRank: Math.min(Number(maxRank) || 100, 100),
        matchStrategy: "no_keywords_available"
      },
      message: "\uC0C1\uD488\uBA85 \uCD94\uCD9C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uD0A4\uC6CC\uB4DC\uB97C \uC9C1\uC811 \uC785\uB825\uD574\uC8FC\uC138\uC694."
    });
  }
  const keywords = generateKeywords(
    productName || "",
    productNameSource,
    manualKeywords,
    keywordHint
  );
  if (keywords.length === 0) {
    return res.status(200).json({
      success: false,
      productUrl,
      productName: productName || void 0,
      productNameSource,
      keywords: [],
      diagnostics: {
        productId,
        productIdExtracted: productId !== null,
        productNameResolved,
        productNameSource,
        keywordHint,
        checkedKeywords: 0,
        maxRank: Math.min(Number(maxRank) || 100, 100),
        matchStrategy: "no_keywords_generated"
      },
      message: "\uD0A4\uC6CC\uB4DC\uB97C \uC0DD\uC131\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uD0A4\uC6CC\uB4DC\uB97C \uC9C1\uC811 \uC785\uB825\uD574\uC8FC\uC138\uC694."
    });
  }
  const effectiveMaxRank = Math.min(Number(maxRank) || 100, 100);
  const results = [];
  let lastMatchStrategy = "not_measured";
  for (const kw of keywords) {
    const { result, matchStrategy } = await measureRank(kw, productId, productUrl, effectiveMaxRank, clientId, clientSecret);
    results.push(result);
    if (result.status === "found") lastMatchStrategy = matchStrategy;
    else if (lastMatchStrategy === "not_measured") lastMatchStrategy = matchStrategy;
  }
  const diagnostics = {
    productId,
    productIdExtracted: productId !== null,
    productNameResolved,
    productNameSource,
    keywordHint,
    checkedKeywords: results.length,
    maxRank: effectiveMaxRank,
    matchStrategy: lastMatchStrategy
  };
  const foundCount = results.filter((r) => r.status === "found").length;
  const notFoundCount = results.filter((r) => r.status === "not_found").length;
  let resolveNote = "";
  if (productNameSource === "og:title") resolveNote = "(og:title \uCD94\uCD9C)";
  else if (productNameSource === "title") resolveNote = "(title \uCD94\uCD9C)";
  else if (productNameSource === "json_ld") resolveNote = "(JSON-LD \uCD94\uCD9C)";
  else if (productNameSource === "search_result") resolveNote = "(\uAC80\uC0C9\uACB0\uACFC \uC5ED\uCD94\uCD9C)";
  else if (productNameSource === "keyword_hint") resolveNote = "(\uD0A4\uC6CC\uB4DC \uD78C\uD2B8 \u2014 \uC0C1\uD488\uBA85 \uC544\uB2D8)";
  else if (productNameSource === "manual") resolveNote = "(\uC218\uB3D9 \uC785\uB825)";
  else resolveNote = "(\uC0C1\uD488\uBA85 \uCD94\uCD9C \uC2E4\uD328)";
  return res.status(200).json({
    success: true,
    productUrl,
    productName: productName || void 0,
    productNameSource,
    keywords: results,
    diagnostics,
    message: productNameResolved && productNameSource !== "keyword_hint" ? `${productName} ${resolveNote} \u2014 ${results.length}\uAC1C \uD0A4\uC6CC\uB4DC \uCE21\uC815 \uC644\uB8CC (\uBC1C\uACAC: ${foundCount}, 100\uC704 \uBC16: ${notFoundCount})` : `${results.length}\uAC1C \uD0A4\uC6CC\uB4DC \uCE21\uC815 \uC644\uB8CC ${resolveNote} (\uBC1C\uACAC: ${foundCount}, 100\uC704 \uBC16: ${notFoundCount})`
  });
}
