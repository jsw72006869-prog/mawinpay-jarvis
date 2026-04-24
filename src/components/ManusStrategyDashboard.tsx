import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── 테마 ──
const THEME = {
  gold: '#C8A96E', goldLight: '#E8D5A3', goldDim: '#8B6F3E',
  blue: '#4A90E2', blueLight: '#7BB3F0',
  green: '#4AE28B', orange: '#E2944A', red: '#E24A4A',
  bg: '#060A12', bgDeep: '#030608', bgCard: '#0A1020',
  text: '#D4E0EC', textDim: '#5A6A7A',
};

// ── 전략 카드 데이터 ──
interface Strategy {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  description: string;
  features: string[];
  examplePrompt: string;
  origin: string;
  color: string;
}

const STRATEGIES: Strategy[] = [
  {
    id: 'influencer_hunt',
    title: '무인 인플루언서 협상',
    subtitle: 'Autonomous Influencer Negotiation',
    icon: '🎯',
    description: '전 세계 SNS에서 사용자님의 농산물과 가장 잘 어울리는 인플루언서를 자동으로 발굴하고, 개별 맞춤형 협찬 제안 메일을 발송합니다.',
    features: [
      '유튜브·인스타·틱톡 멀티 플랫폼 동시 탐색',
      '인플루언서 톤앤매너 분석 후 맞춤형 제안서 작성',
      '자동 메일 발송 및 응답 추적',
      '협상 성공률 실시간 대시보드',
    ],
    examplePrompt: '"뷰티 인플루언서 20명 찾아서 우리 사과 협찬 제안 메일 보내줘"',
    origin: '🇺🇸 미국 D2C 브랜드 운영자 전략',
    color: THEME.blue,
  },
  {
    id: 'viral_factory',
    title: '바이럴 콘텐츠 공장',
    subtitle: 'Viral Content Factory',
    icon: '🔥',
    description: '실시간 SNS 트렌드를 감지하여, 사용자님의 제품을 녹여낸 바이럴 콘텐츠 대본과 이미지를 자동으로 생성합니다.',
    features: [
      '틱톡·인스타 릴스 실시간 트렌드 포착',
      '트렌드에 맞춘 제품 홍보 대본 자동 생성',
      'AI 이미지/영상 소재 제작',
      '멀티 플랫폼 동시 배포 지원',
    ],
    examplePrompt: '"지금 뜨는 트렌드 찾아서 우리 샤인머스캣 홍보 릴스 대본 만들어줘"',
    origin: '🇪🇺 유럽 미디어 커머스 사업자 전략',
    color: THEME.orange,
  },
  {
    id: 'community_stealth',
    title: '커뮤니티 자동 대응',
    subtitle: 'Community Auto-Response',
    icon: '💬',
    description: '네이버 카페, 맘카페 등에서 관련 키워드가 포함된 글을 실시간으로 감지하고, 자연스러운 추천 댓글 초안을 작성합니다.',
    features: [
      '네이버 카페·블로그 실시간 키워드 모니터링',
      '커뮤니티 분위기에 맞는 자연스러운 댓글 생성',
      '구매 링크 자동 삽입',
      '사용자 승인 후 자동 게시',
    ],
    examplePrompt: '"맘카페에서 과일 추천 글 올라오면 우리 사과 자연스럽게 추천해줘"',
    origin: '🇰🇷 아시아 스마트 파머 전략',
    color: THEME.green,
  },
  {
    id: 'auto_revenue',
    title: '무인 수익 자동화',
    subtitle: 'Autonomous Revenue System',
    icon: '💰',
    description: '공동구매 오픈부터 정산까지, 수익 창출의 전 과정을 자비스가 자동으로 운영합니다. 사용자님이 잠든 사이에도 돈이 벌립니다.',
    features: [
      '공동구매 자동 오픈 및 마감 관리',
      '주문 수집 → 발주 → 배송 → 정산 전 과정 자동화',
      '수익률 실시간 분석 및 최적화 제안',
      '텔레그램 실시간 수익 보고',
    ],
    examplePrompt: '"이번 주 공동구매 성과 분석하고 다음 주 전략 짜줘"',
    origin: '🌍 글로벌 자동화 수익 시스템',
    color: THEME.gold,
  },
];

interface Props {
  onClose: () => void;
  onExecuteStrategy: (strategyId: string, prompt: string) => void;
}

export default function ManusStrategyDashboard({ onClose, onExecuteStrategy }: Props) {
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');

  const handleExecute = useCallback((strategy: Strategy) => {
    const prompt = customPrompt || strategy.examplePrompt.replace(/"/g, '');
    onExecuteStrategy(strategy.id, prompt);
    setCustomPrompt('');
    setSelectedStrategy(null);
  }, [customPrompt, onExecuteStrategy]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: THEME.bgDeep,
        display: 'flex', flexDirection: 'column',
        fontFamily: 'Orbitron, monospace',
        overflow: 'hidden',
      }}
    >
      {/* 배경 그리드 */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,212,255,0.015) 2px, rgba(0,212,255,0.015) 4px)' }} />

      {/* 헤더 */}
      <div style={{
        position: 'relative', zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 28px',
        borderBottom: `1px solid ${THEME.gold}22`,
        background: `linear-gradient(180deg, ${THEME.bgDeep} 0%, transparent 100%)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <motion.div
            style={{ width: 8, height: 8, borderRadius: '50%', background: THEME.gold, boxShadow: `0 0 12px ${THEME.gold}` }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <span style={{ color: THEME.gold, fontSize: '0.7rem', letterSpacing: '0.4em' }}>GLOBAL STRATEGY HQ</span>
          <span style={{ color: THEME.textDim, fontSize: '0.45rem', letterSpacing: '0.2em' }}>MANUS AI · REVENUE AUTOMATION</span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: `1px solid ${THEME.orange}44`,
            borderRadius: 4, color: THEME.orange,
            padding: '4px 12px', cursor: 'pointer',
            fontSize: '0.45rem', letterSpacing: '0.2em',
          }}
        >
          CLOSE
        </button>
      </div>

      {/* 메인 콘텐츠 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px', position: 'relative', zIndex: 5 }}>
        {/* 전략 카드 그리드 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
          marginBottom: 24,
        }}>
          {STRATEGIES.map((strategy, idx) => (
            <motion.div
              key={strategy.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              onClick={() => setSelectedStrategy(strategy)}
              style={{
                background: selectedStrategy?.id === strategy.id
                  ? `linear-gradient(135deg, ${strategy.color}15, ${strategy.color}08)`
                  : THEME.bgCard,
                border: `1px solid ${selectedStrategy?.id === strategy.id ? strategy.color + '66' : THEME.textDim + '22'}`,
                borderRadius: 12,
                padding: 20,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
            >
              {/* 카드 헤더 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: '1.5rem' }}>{strategy.icon}</span>
                <div>
                  <div style={{ color: strategy.color, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em' }}>
                    {strategy.title}
                  </div>
                  <div style={{ color: THEME.textDim, fontSize: '0.35rem', letterSpacing: '0.15em', marginTop: 2 }}>
                    {strategy.subtitle}
                  </div>
                </div>
              </div>

              {/* 설명 */}
              <p style={{ color: THEME.text, fontSize: '0.4rem', lineHeight: 1.8, marginBottom: 12, fontFamily: 'sans-serif' }}>
                {strategy.description}
              </p>

              {/* 출처 */}
              <div style={{
                display: 'inline-block',
                background: `${strategy.color}15`,
                border: `1px solid ${strategy.color}33`,
                borderRadius: 6,
                padding: '4px 10px',
                color: strategy.color,
                fontSize: '0.32rem',
                letterSpacing: '0.1em',
                fontFamily: 'sans-serif',
              }}>
                {strategy.origin}
              </div>
            </motion.div>
          ))}
        </div>

        {/* 선택된 전략 상세 패널 */}
        <AnimatePresence>
          {selectedStrategy && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{
                background: THEME.bgCard,
                border: `1px solid ${selectedStrategy.color}44`,
                borderRadius: 12,
                padding: 24,
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: '1.2rem' }}>{selectedStrategy.icon}</span>
                <span style={{ color: selectedStrategy.color, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em' }}>
                  {selectedStrategy.title} — 상세 기능
                </span>
              </div>

              {/* 기능 리스트 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginBottom: 20 }}>
                {selectedStrategy.features.map((feature, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: `${selectedStrategy.color}08`,
                    border: `1px solid ${selectedStrategy.color}22`,
                    borderRadius: 8, padding: '10px 14px',
                  }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: selectedStrategy.color,
                      boxShadow: `0 0 8px ${selectedStrategy.color}`,
                      flexShrink: 0,
                    }} />
                    <span style={{ color: THEME.text, fontSize: '0.38rem', fontFamily: 'sans-serif' }}>{feature}</span>
                  </div>
                ))}
              </div>

              {/* 예시 프롬프트 */}
              <div style={{
                background: `${selectedStrategy.color}08`,
                border: `1px solid ${selectedStrategy.color}22`,
                borderRadius: 8, padding: 14, marginBottom: 16,
              }}>
                <div style={{ color: THEME.textDim, fontSize: '0.32rem', letterSpacing: '0.15em', marginBottom: 6 }}>
                  EXAMPLE VOICE COMMAND
                </div>
                <div style={{ color: selectedStrategy.color, fontSize: '0.42rem', fontFamily: 'sans-serif', fontStyle: 'italic' }}>
                  {selectedStrategy.examplePrompt}
                </div>
              </div>

              {/* 커스텀 프롬프트 입력 */}
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  type="text"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="직접 명령을 입력하세요 (비워두면 예시 명령 실행)"
                  style={{
                    flex: 1,
                    background: '#0A0E18',
                    border: `1px solid ${selectedStrategy.color}33`,
                    borderRadius: 8,
                    padding: '10px 14px',
                    color: THEME.text,
                    fontSize: '0.4rem',
                    fontFamily: 'sans-serif',
                    outline: 'none',
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleExecute(selectedStrategy); }}
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleExecute(selectedStrategy)}
                  style={{
                    background: `linear-gradient(135deg, ${selectedStrategy.color}, ${selectedStrategy.color}CC)`,
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 24px',
                    color: '#fff',
                    fontSize: '0.42rem',
                    fontWeight: 700,
                    letterSpacing: '0.15em',
                    cursor: 'pointer',
                    boxShadow: `0 0 20px ${selectedStrategy.color}44`,
                  }}
                >
                  EXECUTE MISSION
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 하단 안내 */}
        <div style={{
          marginTop: 24,
          textAlign: 'center',
          color: THEME.textDim,
          fontSize: '0.35rem',
          fontFamily: 'sans-serif',
          letterSpacing: '0.1em',
        }}>
          Powered by MANUS 1.6 Max · JARVIS Intelligence System v3.0
        </div>
      </div>
    </motion.div>
  );
}
