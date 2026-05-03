import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * JARVIS Memory Sync API
 * - 대화 히스토리 및 학습 데이터를 서버에 영구 저장
 * - localStorage와 서버 이중 저장으로 데이터 안전성 확보
 * - GET: 저장된 데이터 조회
 * - POST: 새 데이터 저장/동기화
 */

// Vercel Edge Config 또는 KV가 없으므로 클라우드 서버에 저장
const CLOUD_SERVER = process.env.CLOUD_SERVER_URL || 'http://35.243.215.119:3001';

// 인메모리 캐시 (Vercel 서버리스 함수의 warm instance에서 유지)
// 실제 영구 저장은 클라우드 서버의 파일시스템에 위임
let memoryCache: {
  conversations: any[];
  knowledge: any[];
  lastSync: string;
  totalTurns: number;
} = {
  conversations: [],
  knowledge: [],
  lastSync: '',
  totalTurns: 0,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const action = req.query.action as string;

      if (action === 'load') {
        // 서버에서 저장된 대화/학습 데이터 불러오기
        try {
          const serverRes = await fetch(`${CLOUD_SERVER}/api/memory?action=load`, {
            signal: AbortSignal.timeout(8000),
          });
          if (serverRes.ok) {
            const data = await serverRes.json();
            return res.status(200).json({ success: true, data });
          }
        } catch {
          // 서버 불가 시 캐시 반환
        }
        return res.status(200).json({ success: true, data: memoryCache });
      }

      if (action === 'stats') {
        try {
          const serverRes = await fetch(`${CLOUD_SERVER}/api/memory?action=stats`, {
            signal: AbortSignal.timeout(5000),
          });
          if (serverRes.ok) {
            const data = await serverRes.json();
            return res.status(200).json({ success: true, ...data });
          }
        } catch {
          // fallback
        }
        return res.status(200).json({
          success: true,
          totalTurns: memoryCache.totalTurns,
          conversationCount: memoryCache.conversations.length,
          knowledgeCount: memoryCache.knowledge.length,
          lastSync: memoryCache.lastSync,
        });
      }

      return res.status(400).json({ error: 'Invalid action. Use: load, stats' });
    }

    if (req.method === 'POST') {
      const { action, conversations, knowledge, entry, knowledgeItem } = req.body;

      if (action === 'sync') {
        // 전체 동기화 - localStorage 데이터를 서버에 백업
        memoryCache = {
          conversations: conversations || memoryCache.conversations,
          knowledge: knowledge || memoryCache.knowledge,
          lastSync: new Date().toISOString(),
          totalTurns: (conversations || []).length,
        };

        // 클라우드 서버에도 저장 시도
        try {
          await fetch(`${CLOUD_SERVER}/api/memory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'sync',
              conversations: memoryCache.conversations,
              knowledge: memoryCache.knowledge,
            }),
            signal: AbortSignal.timeout(10000),
          });
        } catch {
          // 서버 저장 실패해도 캐시에는 저장됨
        }

        return res.status(200).json({
          success: true,
          message: 'Memory synced',
          totalTurns: memoryCache.totalTurns,
          lastSync: memoryCache.lastSync,
        });
      }

      if (action === 'append') {
        // 단일 대화 항목 추가
        if (entry) {
          memoryCache.conversations.push(entry);
          if (memoryCache.conversations.length > 2000) {
            memoryCache.conversations.splice(0, memoryCache.conversations.length - 2000);
          }
          memoryCache.totalTurns++;
          memoryCache.lastSync = new Date().toISOString();

          // 비동기로 서버에도 저장
          fetch(`${CLOUD_SERVER}/api/memory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'append', entry }),
            signal: AbortSignal.timeout(5000),
          }).catch(() => {});
        }

        return res.status(200).json({ success: true, totalTurns: memoryCache.totalTurns });
      }

      if (action === 'learn') {
        // 학습 지식 추가
        if (knowledgeItem) {
          const existingIdx = memoryCache.knowledge.findIndex(
            (k: any) => k.title?.toLowerCase() === knowledgeItem.title?.toLowerCase()
          );
          if (existingIdx >= 0) {
            memoryCache.knowledge[existingIdx] = knowledgeItem;
          } else {
            memoryCache.knowledge.push(knowledgeItem);
          }
          if (memoryCache.knowledge.length > 100) {
            memoryCache.knowledge.splice(0, memoryCache.knowledge.length - 100);
          }
          memoryCache.lastSync = new Date().toISOString();

          // 비동기로 서버에도 저장
          fetch(`${CLOUD_SERVER}/api/memory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'learn', knowledgeItem }),
            signal: AbortSignal.timeout(5000),
          }).catch(() => {});
        }

        return res.status(200).json({ success: true, knowledgeCount: memoryCache.knowledge.length });
      }

      return res.status(400).json({ error: 'Invalid action. Use: sync, append, learn' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[memory-sync] Error:', error.message);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
