import type { VercelRequest, VercelResponse } from '@vercel/node';
import mysql from 'mysql2/promise';

// ── TiDB 연결 설정 ──
function getConnection() {
  return mysql.createConnection({
    host: process.env.TIDB_HOST || 'gateway01.us-east-1.prod.aws.tidbcloud.com',
    port: Number(process.env.TIDB_PORT) || 4000,
    user: process.env.TIDB_USER || '2HL5NgXKAWnTBJR.root',
    password: process.env.TIDB_PASSWORD || '8szdX6Ien1aGl2Yq',
    database: process.env.TIDB_DATABASE || 'jarvis',
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action as string || (req.body as any)?.action;

  let conn;
  try {
    conn = await getConnection();

    switch (action) {

      // ═══════════════════════════════════════════════
      // 1. 인플루언서 저장 (수집 시 호출)
      // ═══════════════════════════════════════════════
      case 'save_influencers': {
        const { influencers, keyword } = req.body as any;
        if (!influencers || !Array.isArray(influencers)) {
          return res.status(400).json({ error: 'influencers array required' });
        }

        let saved = 0, duplicates = 0;

        for (const inf of influencers) {
          try {
            await conn.execute(
              `INSERT INTO influencers (channel_id, platform, name, email, subscribers, subscriber_text, views, description, profile_url, thumbnail, category, keyword, instagram)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
                 name = VALUES(name),
                 email = VALUES(email),
                 subscribers = VALUES(subscribers),
                 subscriber_text = VALUES(subscriber_text),
                 views = VALUES(views),
                 description = VALUES(description),
                 profile_url = VALUES(profile_url),
                 thumbnail = VALUES(thumbnail),
                 category = VALUES(category),
                 instagram = VALUES(instagram),
                 updated_at = CURRENT_TIMESTAMP`,
              [
                inf.channelId || inf.channel_id || '',
                inf.platform || 'YouTube',
                inf.name || '',
                inf.email || '',
                Number(inf.subscribers) || 0,
                inf.subscriberText || inf.subscriber_text || '',
                Number(inf.views) || 0,
                (inf.description || '').substring(0, 2000),
                inf.profileUrl || inf.profile_url || '',
                inf.thumbnail || '',
                inf.category || keyword || '',
                keyword || '',
                inf.instagram || '',
              ]
            );
            saved++;
          } catch (e: any) {
            if (e.code === 'ER_DUP_ENTRY') duplicates++;
            else console.error('Save error:', e.message);
          }
        }

        // 수집 이력 저장
        await conn.execute(
          `INSERT INTO collection_history (keyword, platform, total_found, with_email, new_collected, duplicates_skipped)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [keyword || '', 'YouTube', influencers.length, influencers.filter((i: any) => i.email).length, saved, duplicates]
        );

        return res.json({ success: true, saved, duplicates, total: influencers.length });
      }

      // ═══════════════════════════════════════════════
      // 2. 인플루언서 조회 (AI가 데이터 불러오기)
      // ═══════════════════════════════════════════════
      case 'query_influencers': {
        const { keyword, platform, min_subscribers, has_email, limit, category } = 
          req.method === 'POST' ? (req.body as any) : req.query;

        let sql = 'SELECT * FROM influencers WHERE 1=1';
        const params: any[] = [];

        if (keyword) {
          sql += ' AND (keyword LIKE ? OR name LIKE ? OR category LIKE ?)';
          params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
        }
        if (platform) {
          sql += ' AND platform = ?';
          params.push(platform);
        }
        if (min_subscribers) {
          sql += ' AND subscribers >= ?';
          params.push(Number(min_subscribers));
        }
        if (has_email === 'true' || has_email === true) {
          sql += " AND email != ''";
        }
        if (category) {
          sql += ' AND category LIKE ?';
          params.push(`%${category}%`);
        }

        sql += ' ORDER BY subscribers DESC LIMIT ?';
        params.push(Number(limit) || 50);

        const [rows] = await conn.execute(sql, params);
        const total = (rows as any[]).length;

        return res.json({ success: true, total, influencers: rows });
      }

      // ═══════════════════════════════════════════════
      // 3. 수집 이력 조회
      // ═══════════════════════════════════════════════
      case 'collection_history': {
        const [rows] = await conn.execute(
          'SELECT * FROM collection_history ORDER BY collected_at DESC LIMIT 50'
        );
        return res.json({ success: true, history: rows });
      }

      // ═══════════════════════════════════════════════
      // 4. 이미 수집된 채널 ID 목록 (중복 방지용)
      // ═══════════════════════════════════════════════
      case 'get_collected_ids': {
        const [rows] = await conn.execute('SELECT channel_id FROM influencers');
        const ids = (rows as any[]).map(r => r.channel_id);
        return res.json({ success: true, ids });
      }

      // ═══════════════════════════════════════════════
      // 5. 바이럴 영상 저장
      // ═══════════════════════════════════════════════
      case 'save_viral_videos': {
        const { videos, keyword: vKeyword } = req.body as any;
        if (!videos || !Array.isArray(videos)) {
          return res.status(400).json({ error: 'videos array required' });
        }

        let vSaved = 0;
        for (const v of videos) {
          try {
            await conn.execute(
              `INSERT INTO viral_videos (video_id, channel_id, title, view_count, like_count, comment_count, published_at, thumbnail, viral_reason, keyword)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
                 view_count = VALUES(view_count),
                 like_count = VALUES(like_count),
                 comment_count = VALUES(comment_count),
                 viral_reason = VALUES(viral_reason)`,
              [
                v.videoId || v.video_id || '',
                v.channelId || v.channel_id || '',
                v.title || '',
                Number(v.viewCount || v.view_count) || 0,
                Number(v.likeCount || v.like_count) || 0,
                Number(v.commentCount || v.comment_count) || 0,
                v.publishedAt || v.published_at || '',
                v.thumbnail || '',
                v.viralReason || v.viral_reason || '',
                vKeyword || '',
              ]
            );
            vSaved++;
          } catch (e: any) {
            console.error('Save viral video error:', e.message);
          }
        }

        return res.json({ success: true, saved: vSaved });
      }

      // ═══════════════════════════════════════════════
      // 6. 바이럴 영상 조회
      // ═══════════════════════════════════════════════
      case 'query_viral_videos': {
        const { keyword: qKeyword, limit: vLimit } = 
          req.method === 'POST' ? (req.body as any) : req.query;

        let sql = 'SELECT * FROM viral_videos WHERE 1=1';
        const params: any[] = [];

        if (qKeyword) {
          sql += ' AND (keyword LIKE ? OR title LIKE ?)';
          params.push(`%${qKeyword}%`, `%${qKeyword}%`);
        }

        sql += ' ORDER BY view_count DESC LIMIT ?';
        params.push(Number(vLimit) || 20);

        const [rows] = await conn.execute(sql, params);
        return res.json({ success: true, total: (rows as any[]).length, videos: rows });
      }

      // ═══════════════════════════════════════════════
      // 7. AI 메모리 저장/조회
      // ═══════════════════════════════════════════════
      case 'save_memory': {
        const { memory_type, memory_key, memory_value, metadata } = req.body as any;
        await conn.execute(
          `INSERT INTO ai_memory (memory_type, memory_key, memory_value, metadata)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE memory_value = VALUES(memory_value), metadata = VALUES(metadata)`,
          [memory_type, memory_key, memory_value, JSON.stringify(metadata || {})]
        );
        return res.json({ success: true });
      }

      case 'query_memory': {
        const { memory_type: mType, memory_key: mKey } = 
          req.method === 'POST' ? (req.body as any) : req.query;

        let sql = 'SELECT * FROM ai_memory WHERE 1=1';
        const params: any[] = [];
        if (mType) { sql += ' AND memory_type = ?'; params.push(mType); }
        if (mKey) { sql += ' AND memory_key LIKE ?'; params.push(`%${mKey}%`); }
        sql += ' ORDER BY updated_at DESC LIMIT 50';

        const [rows] = await conn.execute(sql, params);
        return res.json({ success: true, memories: rows });
      }

      // ═══════════════════════════════════════════════
      // 8. 통계 대시보드
      // ═══════════════════════════════════════════════
      case 'stats': {
        const [[totalInf]] = await conn.execute('SELECT COUNT(*) as cnt FROM influencers') as any;
        const [[withEmail]] = await conn.execute("SELECT COUNT(*) as cnt FROM influencers WHERE email != ''") as any;
        const [[totalVideos]] = await conn.execute('SELECT COUNT(*) as cnt FROM viral_videos') as any;
        const [[totalCollections]] = await conn.execute('SELECT COUNT(*) as cnt FROM collection_history') as any;
        const [topKeywords] = await conn.execute(
          'SELECT keyword, COUNT(*) as cnt FROM influencers GROUP BY keyword ORDER BY cnt DESC LIMIT 10'
        );
        const [recentCollections] = await conn.execute(
          'SELECT * FROM collection_history ORDER BY collected_at DESC LIMIT 5'
        );

        return res.json({
          success: true,
          stats: {
            total_influencers: totalInf.cnt,
            with_email: withEmail.cnt,
            total_viral_videos: totalVideos.cnt,
            total_collections: totalCollections.cnt,
            top_keywords: topKeywords,
            recent_collections: recentCollections,
          }
        });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

  } catch (error: any) {
    console.error('DB Error:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    if (conn) await conn.end();
  }
}
