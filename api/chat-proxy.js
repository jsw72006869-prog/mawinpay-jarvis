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
var chat_proxy_exports = {};
__export(chat_proxy_exports, {
  default: () => handler
});
module.exports = __toCommonJS(chat_proxy_exports);
async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY not configured" });
  }
  try {
    const { model, messages, tools, tool_choice, max_tokens, temperature } = req.body;
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || "gpt-4.1-mini",
        messages,
        tools,
        tool_choice,
        max_tokens: max_tokens || 800,
        temperature: temperature ?? 0.72
      })
    });
    const data = await openaiRes.json();
    if (!openaiRes.ok) {
      console.error("[chat-proxy] OpenAI error:", openaiRes.status, JSON.stringify(data).substring(0, 200));
      return res.status(openaiRes.status).json(data);
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error("[chat-proxy] Error:", error.message);
    return res.status(500).json({ error: "Internal server error", message: error.message });
  }
}
