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
var memory_sync_exports = {};
__export(memory_sync_exports, {
  default: () => handler
});
module.exports = __toCommonJS(memory_sync_exports);
const CLOUD_SERVER = process.env.CLOUD_SERVER_URL || "http://35.243.215.119:3001";
let memoryCache = {
  conversations: [],
  knowledge: [],
  lastSync: "",
  totalTurns: 0
};
async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    if (req.method === "GET") {
      const action = req.query.action;
      if (action === "load") {
        try {
          const serverRes = await fetch(`${CLOUD_SERVER}/api/memory?action=load`, {
            signal: AbortSignal.timeout(8e3)
          });
          if (serverRes.ok) {
            const data = await serverRes.json();
            return res.status(200).json({ success: true, data });
          }
        } catch {
        }
        return res.status(200).json({ success: true, data: memoryCache });
      }
      if (action === "stats") {
        try {
          const serverRes = await fetch(`${CLOUD_SERVER}/api/memory?action=stats`, {
            signal: AbortSignal.timeout(5e3)
          });
          if (serverRes.ok) {
            const data = await serverRes.json();
            return res.status(200).json({ success: true, ...data });
          }
        } catch {
        }
        return res.status(200).json({
          success: true,
          totalTurns: memoryCache.totalTurns,
          conversationCount: memoryCache.conversations.length,
          knowledgeCount: memoryCache.knowledge.length,
          lastSync: memoryCache.lastSync
        });
      }
      return res.status(400).json({ error: "Invalid action. Use: load, stats" });
    }
    if (req.method === "POST") {
      const { action, conversations, knowledge, entry, knowledgeItem } = req.body;
      if (action === "sync") {
        memoryCache = {
          conversations: conversations || memoryCache.conversations,
          knowledge: knowledge || memoryCache.knowledge,
          lastSync: (/* @__PURE__ */ new Date()).toISOString(),
          totalTurns: (conversations || []).length
        };
        try {
          await fetch(`${CLOUD_SERVER}/api/memory`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "sync",
              conversations: memoryCache.conversations,
              knowledge: memoryCache.knowledge
            }),
            signal: AbortSignal.timeout(1e4)
          });
        } catch {
        }
        return res.status(200).json({
          success: true,
          message: "Memory synced",
          totalTurns: memoryCache.totalTurns,
          lastSync: memoryCache.lastSync
        });
      }
      if (action === "append") {
        if (entry) {
          memoryCache.conversations.push(entry);
          if (memoryCache.conversations.length > 2e3) {
            memoryCache.conversations.splice(0, memoryCache.conversations.length - 2e3);
          }
          memoryCache.totalTurns++;
          memoryCache.lastSync = (/* @__PURE__ */ new Date()).toISOString();
          fetch(`${CLOUD_SERVER}/api/memory`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "append", entry }),
            signal: AbortSignal.timeout(5e3)
          }).catch(() => {
          });
        }
        return res.status(200).json({ success: true, totalTurns: memoryCache.totalTurns });
      }
      if (action === "learn") {
        if (knowledgeItem) {
          const existingIdx = memoryCache.knowledge.findIndex(
            (k) => k.title?.toLowerCase() === knowledgeItem.title?.toLowerCase()
          );
          if (existingIdx >= 0) {
            memoryCache.knowledge[existingIdx] = knowledgeItem;
          } else {
            memoryCache.knowledge.push(knowledgeItem);
          }
          if (memoryCache.knowledge.length > 100) {
            memoryCache.knowledge.splice(0, memoryCache.knowledge.length - 100);
          }
          memoryCache.lastSync = (/* @__PURE__ */ new Date()).toISOString();
          fetch(`${CLOUD_SERVER}/api/memory`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "learn", knowledgeItem }),
            signal: AbortSignal.timeout(5e3)
          }).catch(() => {
          });
        }
        return res.status(200).json({ success: true, knowledgeCount: memoryCache.knowledge.length });
      }
      return res.status(400).json({ error: "Invalid action. Use: sync, append, learn" });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("[memory-sync] Error:", error.message);
    return res.status(500).json({ error: "Internal server error", message: error.message });
  }
}
