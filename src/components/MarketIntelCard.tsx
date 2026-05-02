/**
 * MarketIntelCard.tsx v1.0
 * 농산물 시장 분석 HUD 카드
 * 
 * 기능:
 * - KAMIS API 데이터 시각화
 * - 최고가/최저가/평균가 표시
 * - 전일 대비 등락폭
 * - 매입/매도 추천 신호
 * - 텔레메트리 이벤트 구독으로 자동 업데이트
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { onTelemetryEvent, type TelemetryEvent } from '../lib/jarvis-telemetry';

interface MarketData {
  item: string;
  maxPrice: number;
  minPrice: number;
  avgPrice: number;
  trend: 'up' | 'down' | 'stable';
  changePercent?: number;
  recommendation?: 'buy' | 'sell' | 'hold';
  lastUpdated?: string;
  totalRecords?: number;
  movingAvg5?: number;
  movingAvg20?: number;
}

interface MarketIntelCardProps {
  visible: boolean;
  onClose?: () => void;
}

export default function MarketIntelCard({ visible, onClose }: MarketIntelCardProps) {
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // ─── 텔레메트리 구독 ───
  useEffect(() => {
    const cleanup = onTelemetryEvent((event: TelemetryEvent) => {
      if (event.type === 'node_data' && event.payload.nodeId === 'market_intel') {
        const data = event.payload.summary;
        setMarketData({
          item: data.item || '옥수수',
          maxPrice: data.maxPrice || 0,
          minPrice: data.minPrice || 0,
          avgPrice: data.avgPrice || 0,
          trend: data.trend || 'stable',
          changePercent: data.changePercent,
          recommendation: data.recommendation,
          lastUpdated: data.lastUpdated,
          totalRecords: data.totalRecords,
          movingAvg5: data.movingAvg5,
          movingAvg20: data.movingAvg20,
        });
        setIsLoading(false);
      }

      if (event.type === 'node_state' && event.payload.nodeId === 'market_intel') {
        if (event.payload.state === 'active') setIsLoading(true);
        if (event.payload.state === 'success' || event.payload.state === 'error') setIsLoading(false);
      }
    });
    return cleanup;
  }, []);

  if (!visible || !marketData) return null;

  const trendColor = marketData.trend === 'up' ? '#FF3D00' : marketData.trend === 'down' ? '#2196F3' : '#8A9AAA';
  const trendIcon = marketData.trend === 'up' ? '▲' : marketData.trend === 'down' ? '▼' : '─';
  const recColor = marketData.recommendation === 'buy' ? '#00FF88' : marketData.recommendation === 'sell' ? '#FF3D00' : '#FFD700';
  const recLabel = marketData.recommendation === 'buy' ? 'BUY' : marketData.recommendation === 'sell' ? 'SELL' : 'HOLD';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: -30, scale: 0.9 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: -30, scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        style={{
          position: 'fixed',
          top: '100px',
          left: '20px',
          width: '300px',
          background: 'rgba(6, 10, 18, 0.92)',
          border: '1px solid rgba(255, 152, 0, 0.3)',
          borderRadius: '14px',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 0 30px rgba(255, 152, 0, 0.1)',
          zIndex: 9997,
          overflow: 'hidden',
        }}
      >
        {/* ─── 헤더 ─── */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255, 152, 0, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px' }}>📊</span>
            <span style={{ color: '#FF9800', fontSize: '12px', fontWeight: 700, letterSpacing: '1px', fontFamily: 'Orbitron, monospace' }}>
              MARKET INTEL
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#5A6A7A', cursor: 'pointer', fontSize: '14px' }}>×</button>
        </div>

        {/* ─── 메인 데이터 ─── */}
        <div style={{ padding: '14px 16px' }}>
          {/* 품목명 + 추천 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ color: '#D4E0EC', fontSize: '16px', fontWeight: 700 }}>
              {marketData.item}
            </span>
            <motion.span
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{
                color: recColor,
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: '12px',
                border: `1px solid ${recColor}`,
                background: `${recColor}11`,
                letterSpacing: '1px',
                fontFamily: 'Orbitron, monospace',
              }}
            >
              {recLabel}
            </motion.span>
          </div>

          {/* 가격 정보 그리드 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
            <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
              <div style={{ color: '#5A6A7A', fontSize: '9px', letterSpacing: '0.5px', marginBottom: '4px' }}>MAX</div>
              <div style={{ color: '#FF3D00', fontSize: '14px', fontWeight: 700 }}>
                {marketData.maxPrice.toLocaleString()}
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
              <div style={{ color: '#5A6A7A', fontSize: '9px', letterSpacing: '0.5px', marginBottom: '4px' }}>AVG</div>
              <div style={{ color: '#D4E0EC', fontSize: '14px', fontWeight: 700 }}>
                {marketData.avgPrice.toLocaleString()}
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
              <div style={{ color: '#5A6A7A', fontSize: '9px', letterSpacing: '0.5px', marginBottom: '4px' }}>MIN</div>
              <div style={{ color: '#2196F3', fontSize: '14px', fontWeight: 700 }}>
                {marketData.minPrice.toLocaleString()}
              </div>
            </div>
          </div>

          {/* 등락폭 */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '6px', marginBottom: '10px',
            padding: '6px', background: 'rgba(0,0,0,0.15)', borderRadius: '6px',
          }}>
            <span style={{ color: trendColor, fontSize: '13px', fontWeight: 700 }}>
              {trendIcon}
            </span>
            <span style={{ color: trendColor, fontSize: '12px', fontWeight: 600 }}>
              {marketData.changePercent !== undefined ? `${marketData.changePercent > 0 ? '+' : ''}${marketData.changePercent.toFixed(1)}%` : 'N/A'}
            </span>
            <span style={{ color: '#5A6A7A', fontSize: '10px' }}>전일 대비</span>
          </div>

          {/* 이동평균 */}
          {(marketData.movingAvg5 || marketData.movingAvg20) && (
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '8px' }}>
              {marketData.movingAvg5 && (
                <span style={{ color: '#8A9AAA', fontSize: '10px' }}>
                  MA5: <span style={{ color: '#D4E0EC' }}>{marketData.movingAvg5.toLocaleString()}</span>
                </span>
              )}
              {marketData.movingAvg20 && (
                <span style={{ color: '#8A9AAA', fontSize: '10px' }}>
                  MA20: <span style={{ color: '#D4E0EC' }}>{marketData.movingAvg20.toLocaleString()}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* ─── 하단 메타 ─── */}
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid rgba(255, 152, 0, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          <span style={{ color: '#5A6A7A', fontSize: '9px' }}>
            {marketData.totalRecords && `${marketData.totalRecords} records`}
          </span>
          <span style={{ color: '#5A6A7A', fontSize: '9px' }}>
            {marketData.lastUpdated || new Date().toLocaleTimeString('ko-KR')}
          </span>
        </div>

        {/* ─── 로딩 오버레이 ─── */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              position: 'absolute', inset: 0,
              background: 'rgba(6, 10, 18, 0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '14px',
            }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              style={{ width: '24px', height: '24px', border: '2px solid #FF9800', borderTop: '2px solid transparent', borderRadius: '50%' }}
            />
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
