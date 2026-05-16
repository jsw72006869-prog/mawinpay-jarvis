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
var whisper_proxy_exports = {};
__export(whisper_proxy_exports, {
  config: () => config,
  default: () => handler
});
module.exports = __toCommonJS(whisper_proxy_exports);
const config = {
  api: {
    bodyParser: false
    // multipart/form-data를 직접 처리
  }
};
async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[whisper-proxy] OPENAI_API_KEY \uD658\uACBD\uBCC0\uC218 \uC5C6\uC74C");
    return res.status(500).json({ error: "Server configuration error: OPENAI_API_KEY not set" });
  }
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const body = Buffer.concat(chunks);
    const contentType = req.headers["content-type"] || "";
    const openaiRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": contentType
      },
      body
    });
    const data = await openaiRes.json();
    if (!openaiRes.ok) {
      console.error("[whisper-proxy] OpenAI error:", openaiRes.status, JSON.stringify(data));
      return res.status(openaiRes.status).json(data);
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error("[whisper-proxy] Error:", error.message);
    return res.status(500).json({ error: "Internal server error", message: error.message });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  config
});
