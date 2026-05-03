import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';

export interface InfluencerData {
  name: string;
  platform: string;
  followers?: string;
  category: string;
  email: string;
  profileUrl: string;
  channelUrl?: string;
  thumbnailUrl?: string;
  channelId?: string;
  status?: string;
  subscriberCount?: number;
  subscribers?: number;
  viewCount?: number;
  viewCountFormatted?: string;
  videoCount?: number;
  description?: string;
  address?: string;
  phone?: string;
  mapx?: string;
  mapy?: string;
  collectedAt?: string;
  topVideoTitle?: string;
  topVideoUrl?: string;
  instagramUsername?: string;
  tiktokUsername?: string;
  website?: string;
  instagram?: string;
  tiktok?: string;
  avgViews?: number;
  fitScore?: number;
  engagementRate?: number;
}

interface InfluencerCardsProps {
  influencers: InfluencerData[];
  visible: boolean;
  onClose: () => void;
  onSendEmail?: (influencers: InfluencerData[]) => void;
  onAiProposal?: (influencers: InfluencerData[]) => void;
}

function ensureHttps(url: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://${url}`;
}

function getChannelUrl(influencer: InfluencerData): string {
  if (influencer.channelUrl) return ensureHttps(influencer.channelUrl);
  if (influencer.profileUrl && influencer.profileUrl.startsWith('http')) return ensureHttps(influencer.profileUrl);
  if (influencer.channelId) return `https://www.youtube.com/channel/${influencer.channelId}`;
  if (influencer.profileUrl) return ensureHttps(influencer.profileUrl);
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(influencer.name)}`;
}

function formatFollowers(inf: InfluencerData): string {
  const count = inf.subscriberCount || inf.subscribers || 0;
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  if (count > 0) return count.toLocaleString();
  if (inf.followers && inf.followers !== '-') return inf.followers;
  return '-';
}

function getEngageRate(inf: InfluencerData): string {
  if (inf.engagementRate) return `${inf.engagementRate.toFixed(1)}%`;
  // 추정: avgViews / subscribers
  const subs = inf.subscriberCount || inf.subscribers || 0;
  const views = inf.avgViews || 0;
  if (subs > 0 && views > 0) return `${((views / subs) * 100).toFixed(1)}%`;
  return '-';
}

function getScore(inf: InfluencerData): string {
  if (inf.fitScore) {
    if (inf.fitScore >= 90) return 'A+';
    if (inf.fitScore >= 80) return 'A';
    if (inf.fitScore >= 70) return 'B+';
    if (inf.fitScore >= 60) return 'B';
    return 'C';
  }
  return '-';
}

function getCategoryTags(inf: InfluencerData): string[] {
  const tags: string[] = [];
  if (inf.category) {
    inf.category.split(/[,/·]/).forEach(t => {
      const trimmed = t.trim();
      if (trimmed && tags.length < 3) tags.push(trimmed);
    });
  }
  if (tags.length === 0) {
    const platform = inf.platform?.toLowerCase() || '';
    if (platform.includes('youtube')) tags.push('유튜브');
    if (platform.includes('naver')) tags.push('네이버');
    if (platform.includes('instagram')) tags.push('인스타');
  }
  return tags;
}

// ── 개별 인플루언서 카드 (시안 디자인) ──
function InfluencerCard({ influencer, index, visible, selected, onSelect, onSendEmail }: {
  influencer: InfluencerData; index: number; visible: boolean;
  selected: boolean; onSelect: (i: number) => void;
  onSendEmail?: (inf: InfluencerData[]) => void;
}) {
  const channelUrl = getChannelUrl(influencer);
  const [imgError, setImgError] = useState(false);
  const followers = formatFollowers(influencer);
  const engage = getEngageRate(influencer);
  const score = getScore(influencer);
  const tags = getCategoryTags(influencer);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={visible ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 40, scale: 0.95 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      transition={{ delay: index * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => onSelect(index)}
      style={{
        width: '280px',
        background: '#111827',
        borderRadius: '12px',
        border: selected ? '1px solid #00f5ff' : '1px solid rgba(0,245,255,0.12)',
        overflow: 'hidden',
        cursor: 'pointer',
        position: 'relative',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxShadow: selected ? '0 0 20px rgba(0,245,255,0.15)' : 'none',
      }}
    >
      {/* 선택 체크 */}
      {selected && (
        <div style={{
          position: 'absolute', top: '10px', right: '10px', zIndex: 5,
          width: '20px', height: '20px', borderRadius: '50%',
          background: '#00f5ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', color: '#000', fontWeight: 700,
        }}>✓</div>
      )}

      {/* 프로필 영역 */}
      <div style={{ padding: '20px 20px 12px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        {/* 프로필 이미지 */}
        <div style={{ marginBottom: '12px' }}>
          {influencer.thumbnailUrl && !imgError ? (
            <img
              src={influencer.thumbnailUrl}
              alt={influencer.name}
              onError={() => setImgError(true)}
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
              style={{
                width: '48px', height: '48px', borderRadius: '50%',
                objectFit: 'cover', border: '2px solid rgba(0,245,255,0.3)',
              }}
            />
          ) : (
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #1e3a5f, #0d2137)',
              border: '2px solid rgba(0,245,255,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '20px',
            }}>
              😊
            </div>
          )}
        </div>

        {/* 이름 */}
        <div style={{
          fontSize: '15px', fontWeight: 700, color: '#ffffff',
          marginBottom: '2px', letterSpacing: '0.3px',
        }}>
          {influencer.name}
        </div>

        {/* 핸들 */}
        <div style={{
          fontSize: '12px', color: '#00f5ff',
          marginBottom: '16px',
        }}>
          @{influencer.email?.split('@')[0] || influencer.name.toLowerCase().replace(/\s/g, '_')}
        </div>

        {/* 통계 3개 가로 배치 */}
        <div style={{
          display: 'flex', gap: '20px', marginBottom: '16px', width: '100%',
        }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', letterSpacing: '0.5px' }}>
              {followers}
            </div>
            <div style={{ fontSize: '10px', color: '#6b7280', letterSpacing: '1px', marginTop: '2px' }}>
              FOLLOWERS
            </div>
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>
              {engage}
            </div>
            <div style={{ fontSize: '10px', color: '#6b7280', letterSpacing: '1px', marginTop: '2px' }}>
              ENGAGE
            </div>
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>
              {score}
            </div>
            <div style={{ fontSize: '10px', color: '#6b7280', letterSpacing: '1px', marginTop: '2px' }}>
              SCORE
            </div>
          </div>
        </div>

        {/* 태그 */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {tags.map((tag, i) => (
            <span key={i} style={{
              fontSize: '11px', color: '#00f5ff',
              border: '1px solid rgba(0,245,255,0.3)',
              borderRadius: '12px', padding: '3px 10px',
              background: 'rgba(0,245,255,0.06)',
            }}>
              {tag}
            </span>
          ))}
        </div>

        {/* 버튼 2개 */}
        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onSendEmail && influencer.email) onSendEmail([influencer]);
              else if (influencer.email) window.open(`mailto:${influencer.email}`, '_blank');
            }}
            style={{
              flex: 1, padding: '8px 0',
              background: '#00f5ff', color: '#000000',
              border: 'none', borderRadius: '6px',
              fontSize: '12px', fontWeight: 700,
              cursor: 'pointer', transition: 'opacity 0.2s',
            }}
            onMouseEnter={e => { (e.target as HTMLButtonElement).style.opacity = '0.85'; }}
            onMouseLeave={e => { (e.target as HTMLButtonElement).style.opacity = '1'; }}
          >
            이메일 발송
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); window.open(channelUrl, '_blank'); }}
            style={{
              flex: 1, padding: '8px 0',
              background: 'transparent', color: '#00f5ff',
              border: '1px solid rgba(0,245,255,0.4)', borderRadius: '6px',
              fontSize: '12px', fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.2s',
            }}
            onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = 'rgba(0,245,255,0.08)'; }}
            onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = 'transparent'; }}
          >
            프로필 보기
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── 메인 컴포넌트: 풀스크린 패널 ──
export default function InfluencerCards({ influencers, visible, onClose, onSendEmail, onAiProposal }: InfluencerCardsProps) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [filterEmail, setFilterEmail] = useState(false);
  const [sortBy, setSortBy] = useState<'default' | 'subscribers' | 'views'>('default');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) {
      setSelectedIndices(new Set());
      setFilterPlatform('all');
      setFilterEmail(false);
      setSortBy('default');
    }
  }, [visible, influencers]);

  const toggleSelect = (i: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIndices.size === filteredList.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(filteredList.map((_, i) => i)));
    }
  };

  // 필터링
  let filteredList = [...influencers];
  if (filterPlatform !== 'all') {
    filteredList = filteredList.filter(i => i.platform?.toLowerCase().includes(filterPlatform));
  }
  if (filterEmail) {
    filteredList = filteredList.filter(i => i.email && i.email.includes('@'));
  }

  // 정렬
  if (sortBy === 'subscribers') {
    filteredList.sort((a, b) => ((b.subscriberCount || b.subscribers || 0) - (a.subscriberCount || a.subscribers || 0)));
  } else if (sortBy === 'views') {
    filteredList.sort((a, b) => ((b.viewCount || 0) - (a.viewCount || 0)));
  }

  const stats = {
    total: influencers.length,
    filtered: filteredList.length,
    emailCount: influencers.filter(i => i.email && i.email.includes('@')).length,
    selected: selectedIndices.size,
  };

  const selectedInfluencers = Array.from(selectedIndices).map(i => filteredList[i]).filter(Boolean);

  return (
    <AnimatePresence>
      {visible && influencers.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(6,10,20,0.97)',
            backdropFilter: 'blur(20px)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* ═══ 상단 헤더 ═══ */}
          <motion.div
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            style={{
              padding: '16px 24px',
              borderBottom: '1px solid rgba(0,245,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px',
                background: 'rgba(0,245,255,0.1)', border: '1px solid rgba(0,245,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '16px',
              }}>👤</div>
              <span style={{
                fontSize: '14px', color: '#ffffff', fontWeight: 700,
                letterSpacing: '2px',
              }}>
                CARD UI
              </span>
              <span style={{
                fontSize: '12px', color: '#6b7280', marginLeft: '8px',
              }}>
                {stats.total}명 수집 · {stats.emailCount}명 이메일
              </span>
            </div>

            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,50,50,0.08)', border: '1px solid rgba(255,80,80,0.3)',
                color: '#FF6666', cursor: 'pointer', fontSize: '12px',
                padding: '6px 16px', borderRadius: '6px',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = 'rgba(255,50,50,0.2)'; }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = 'rgba(255,50,50,0.08)'; }}
            >
              ✕ 닫기
            </button>
          </motion.div>

          {/* ═══ 필터/액션 바 ═══ */}
          <motion.div
            initial={{ y: -15, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.3 }}
            style={{
              padding: '10px 24px',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0, flexWrap: 'wrap', gap: '8px',
            }}
          >
            {/* 필터 */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              {[
                { key: 'all', label: 'ALL', color: '#00F5FF' },
                { key: 'youtube', label: 'YOUTUBE', color: '#FF3333' },
                { key: 'naver', label: 'NAVER', color: '#03C75A' },
                { key: 'instagram', label: 'INSTA', color: '#E1306C' },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilterPlatform(f.key)}
                  style={{
                    background: filterPlatform === f.key ? `${f.color}15` : 'transparent',
                    border: `1px solid ${filterPlatform === f.key ? f.color : 'rgba(255,255,255,0.1)'}`,
                    color: filterPlatform === f.key ? f.color : '#555',
                    fontSize: '11px', fontWeight: 600,
                    padding: '5px 12px', borderRadius: '16px', cursor: 'pointer',
                    letterSpacing: '0.5px', transition: 'all 0.2s',
                  }}
                >
                  {f.label}
                </button>
              ))}

              <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

              <button
                onClick={() => setFilterEmail(!filterEmail)}
                style={{
                  background: filterEmail ? 'rgba(34,197,94,0.12)' : 'transparent',
                  border: `1px solid ${filterEmail ? '#22C55E' : 'rgba(255,255,255,0.1)'}`,
                  color: filterEmail ? '#22C55E' : '#555',
                  fontSize: '11px', fontWeight: 600,
                  padding: '5px 12px', borderRadius: '16px', cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                ✉ 이메일만
              </button>

              <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

              {[
                { key: 'default', label: '기본' },
                { key: 'subscribers', label: '구독자↓' },
                { key: 'views', label: '조회수↓' },
              ].map(s => (
                <button
                  key={s.key}
                  onClick={() => setSortBy(s.key as any)}
                  style={{
                    background: sortBy === s.key ? 'rgba(0,245,255,0.08)' : 'transparent',
                    border: `1px solid ${sortBy === s.key ? '#00F5FF44' : 'rgba(255,255,255,0.06)'}`,
                    color: sortBy === s.key ? '#00F5FF' : '#444',
                    fontSize: '11px',
                    padding: '5px 10px', borderRadius: '16px', cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* 액션 버튼 */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={selectAll}
                style={{
                  background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.25)',
                  color: '#00F5FF', fontSize: '11px', fontWeight: 600,
                  padding: '5px 14px', borderRadius: '16px', cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {selectedIndices.size === filteredList.length ? '✓ 선택해제' : '☐ 전체선택'}
              </button>

              {stats.selected > 0 && (
                <>
                  <motion.button
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    onClick={() => onSendEmail?.(selectedInfluencers)}
                    style={{
                      background: '#00f5ff', border: 'none',
                      color: '#000', fontSize: '11px', fontWeight: 700,
                      padding: '6px 16px', borderRadius: '16px', cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    ✉ 이메일 발송 ({stats.selected})
                  </motion.button>

                  <motion.button
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    onClick={() => onAiProposal?.(selectedInfluencers)}
                    style={{
                      background: 'transparent', border: '1px solid rgba(0,245,255,0.4)',
                      color: '#00f5ff', fontSize: '11px', fontWeight: 700,
                      padding: '6px 16px', borderRadius: '16px', cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    ⚡ AI 제안서 ({stats.selected})
                  </motion.button>
                </>
              )}
            </div>
          </motion.div>

          {/* ═══ 카드 그리드 ═══ */}
          <div
            ref={scrollRef}
            style={{
              flex: 1, overflowY: 'auto', overflowX: 'hidden',
              padding: '24px',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(0,245,255,0.15) transparent',
            }}
          >
            {filteredList.length === 0 ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '200px', color: '#444', fontSize: '14px',
              }}>
                필터 조건에 맞는 결과가 없습니다
              </div>
            ) : (
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '16px',
                justifyContent: 'flex-start',
              }}>
                {filteredList.map((inf, i) => (
                  <InfluencerCard
                    key={`${inf.name}-${inf.platform}-${i}`}
                    influencer={inf}
                    index={i}
                    visible={visible}
                    selected={selectedIndices.has(i)}
                    onSelect={toggleSelect}
                    onSendEmail={onSendEmail}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ═══ 하단 상태바 ═══ */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            style={{
              padding: '10px 24px',
              borderTop: '1px solid rgba(0,245,255,0.08)',
              background: 'rgba(0,245,255,0.02)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '12px', color: '#6b7280' }}>
              {filteredList.length} / {stats.total} 표시 중
              {stats.selected > 0 && (
                <span style={{ color: '#00f5ff', marginLeft: '12px' }}>
                  · {stats.selected}명 선택됨
                </span>
              )}
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
