import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Types ──
export interface MarketPriceResult {
  productName: string;
  calculation: {
    currentPrice: number;
    rawMaterialCost: number;
    shippingCost: number;
    packagingCost: number;
    platformFeeRate: number;
    platformFee: number;
    otherCosts: number;
    totalCost: number;
    netSalesAmount: number;
    estimatedMargin: number;
    estimatedMarginRate: number;
    competitorMinPrice: number;
    competitorAvgPrice: number;
  };
  jarvisDecision: string;
  recommendedAction: string;
  jarvisMessage: string;
  savedToSheets: boolean;
}

export interface MarketPriceInputData {
  productName: string;
  rawMaterialCost: number;
  currentPrice: number;
  shippingCost: number;
  packagingCost: number;
  platformFeeRate: number;
  otherCosts: number;
  competitorPrices: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  result: MarketPriceResult | null;
  inputMode: boolean;
  onSubmitInput: (data: MarketPriceInputData) => void;
  loading: boolean;
}

// ── Helper ──
function fmt(n: number): string {
  return n.toLocaleString();
}

function getDecisionColor(decision: string): string {
  if (decision.includes('고마진') || decision.includes('방어 가능')) return '#00ff88';
  if (decision.includes('유지')) return '#00d4ff';
  if (decision.includes('검토')) return '#ffaa00';
  if (decision.includes('인상 필요')) return '#ff6600';
  if (decision.includes('적자')) return '#ff2244';
  return '#00d4ff';
}

function getMarginBarWidth(rate: number): number {
  if (rate <= 0) return 3;
  if (rate >= 50) return 100;
  return Math.max(3, rate * 2);
}

// ── Component ──
export default function MarketPricePanel({ visible, onClose, result, inputMode, onSubmitInput, loading }: Props) {
  const [form, setForm] = useState<MarketPriceInputData>({
    productName: '',
    rawMaterialCost: 0,
    currentPrice: 0,
    shippingCost: 3000,
    packagingCost: 500,
    platformFeeRate: 5.5,
    otherCosts: 0,
    competitorPrices: '',
  });

  const handleChange = (field: keyof MarketPriceInputData, value: string) => {
    if (field === 'productName' || field === 'competitorPrices') {
      setForm(prev => ({ ...prev, [field]: value }));
    } else {
      setForm(prev => ({ ...prev, [field]: Number(value) || 0 }));
    }
  };

  const handleSubmit = () => {
    if (!form.productName || !form.currentPrice) return;
    onSubmitInput(form);
  };

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 9000,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          style={{
            width: '100%',
            maxWidth: '640px',
            maxHeight: '90vh',
            overflow: 'auto',
            background: 'linear-gradient(135deg, rgba(10,15,30,0.98), rgba(5,10,20,0.98))',
            border: '1px solid rgba(0,200,255,0.3)',
            borderRadius: '16px',
            padding: '28px',
            boxShadow: '0 0 40px rgba(0,150,255,0.15), inset 0 0 60px rgba(0,100,200,0.05)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: '#00ff88', boxShadow: '0 0 8px #00ff88',
                animation: 'pulse 2s infinite',
              }} />
              <span style={{ color: '#00d4ff', fontSize: '14px', fontWeight: 700, letterSpacing: '2px' }}>
                MARKET PRICE ANALYSIS
              </span>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '8px', padding: '6px 12px', color: '#aaa', cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              CLOSE
            </button>
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                style={{
                  width: '40px', height: '40px', margin: '0 auto 16px',
                  border: '3px solid rgba(0,200,255,0.2)',
                  borderTop: '3px solid #00d4ff',
                  borderRadius: '50%',
                }}
              />
              <p style={{ color: '#00d4ff', fontSize: '13px' }}>마진 계산 중...</p>
            </div>
          )}

          {/* Input Mode */}
          {inputMode && !loading && !result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ color: '#8899aa', fontSize: '12px', marginBottom: '4px' }}>
                품목 정보를 입력하면 자비스가 마진 계산 + 가격 판단을 해드립니다.
              </p>

              <InputField label="품목명" value={form.productName} onChange={v => handleChange('productName', v)} placeholder="예: 옥수수, 복숭아, 절임배추" />
              <InputField label="원물가 (원)" value={String(form.rawMaterialCost || '')} onChange={v => handleChange('rawMaterialCost', v)} placeholder="원물 매입가" type="number" />
              <InputField label="현재 판매가 (원)" value={String(form.currentPrice || '')} onChange={v => handleChange('currentPrice', v)} placeholder="스마트스토어 판매가" type="number" />
              <InputField label="택배비 (원)" value={String(form.shippingCost || '')} onChange={v => handleChange('shippingCost', v)} placeholder="3000" type="number" />
              <InputField label="포장비 (원)" value={String(form.packagingCost || '')} onChange={v => handleChange('packagingCost', v)} placeholder="500" type="number" />
              <InputField label="플랫폼 수수료율 (%)" value={String(form.platformFeeRate || '')} onChange={v => handleChange('platformFeeRate', v)} placeholder="5.5" type="number" />
              <InputField label="기타 비용 (원)" value={String(form.otherCosts || '')} onChange={v => handleChange('otherCosts', v)} placeholder="0" type="number" />
              <InputField label="온라인 경쟁가 (쉼표 구분)" value={form.competitorPrices} onChange={v => handleChange('competitorPrices', v)} placeholder="예: 15900,16500,17000" />

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSubmit}
                disabled={!form.productName || !form.currentPrice}
                style={{
                  marginTop: '8px',
                  padding: '14px',
                  background: form.productName && form.currentPrice
                    ? 'linear-gradient(135deg, #00d4ff, #0088ff)'
                    : 'rgba(100,100,100,0.3)',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: form.productName && form.currentPrice ? 'pointer' : 'not-allowed',
                  letterSpacing: '1px',
                }}
              >
                가격 판단 요청
              </motion.button>
            </div>
          )}

          {/* Result Mode */}
          {result && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Product Name */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                style={{
                  padding: '12px 16px',
                  background: 'rgba(0,200,255,0.08)',
                  borderRadius: '10px',
                  border: '1px solid rgba(0,200,255,0.2)',
                }}
              >
                <span style={{ color: '#6688aa', fontSize: '11px' }}>품목</span>
                <p style={{ color: '#fff', fontSize: '18px', fontWeight: 700, margin: '4px 0 0' }}>
                  {result.productName}
                </p>
              </motion.div>

              {/* Decision Badge */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                style={{
                  padding: '14px 16px',
                  background: `linear-gradient(135deg, ${getDecisionColor(result.jarvisDecision)}15, ${getDecisionColor(result.jarvisDecision)}08)`,
                  borderRadius: '10px',
                  border: `1px solid ${getDecisionColor(result.jarvisDecision)}40`,
                }}
              >
                <span style={{ color: '#6688aa', fontSize: '11px' }}>자비스 판단</span>
                <p style={{ color: getDecisionColor(result.jarvisDecision), fontSize: '16px', fontWeight: 700, margin: '4px 0 0' }}>
                  {result.jarvisDecision}
                </p>
                <p style={{ color: '#8899aa', fontSize: '12px', margin: '6px 0 0' }}>
                  추천: {result.recommendedAction}
                </p>
              </motion.div>

              {/* Margin Bar */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#6688aa', fontSize: '11px' }}>예상 마진율</span>
                  <span style={{ color: getDecisionColor(result.jarvisDecision), fontSize: '14px', fontWeight: 700 }}>
                    {result.calculation.estimatedMarginRate}%
                  </span>
                </div>
                <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${getMarginBarWidth(result.calculation.estimatedMarginRate)}%` }}
                    transition={{ delay: 0.4, duration: 0.8, ease: 'easeOut' }}
                    style={{
                      height: '100%',
                      background: `linear-gradient(90deg, ${getDecisionColor(result.jarvisDecision)}, ${getDecisionColor(result.jarvisDecision)}88)`,
                      borderRadius: '4px',
                    }}
                  />
                </div>
              </motion.div>

              {/* Cost Breakdown */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}
              >
                <span style={{ color: '#6688aa', fontSize: '11px', marginBottom: '10px', display: 'block' }}>비용 구조</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <CostRow label="판매가" value={`${fmt(result.calculation.currentPrice)}원`} color="#fff" />
                  <CostRow label="원물가" value={`${fmt(result.calculation.rawMaterialCost)}원`} color="#ff8866" />
                  <CostRow label="택배비" value={`${fmt(result.calculation.shippingCost)}원`} color="#ffaa66" />
                  <CostRow label="포장비" value={`${fmt(result.calculation.packagingCost)}원`} color="#ffcc66" />
                  <CostRow label="수수료" value={`${fmt(result.calculation.platformFee)}원 (${result.calculation.platformFeeRate}%)`} color="#ff66aa" />
                  <CostRow label="기타" value={`${fmt(result.calculation.otherCosts)}원`} color="#aaaaaa" />
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '10px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#aaa', fontSize: '12px' }}>예상 순마진</span>
                  <span style={{ color: result.calculation.estimatedMargin >= 0 ? '#00ff88' : '#ff2244', fontSize: '14px', fontWeight: 700 }}>
                    {fmt(result.calculation.estimatedMargin)}원
                  </span>
                </div>
              </motion.div>

              {/* Competitor Comparison */}
              {result.calculation.competitorMinPrice > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}
                >
                  <span style={{ color: '#6688aa', fontSize: '11px', marginBottom: '8px', display: 'block' }}>경쟁가 비교</span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    <div>
                      <span style={{ color: '#6688aa', fontSize: '10px' }}>내 판매가</span>
                      <p style={{ color: '#fff', fontSize: '14px', fontWeight: 600, margin: '2px 0 0' }}>{fmt(result.calculation.currentPrice)}원</p>
                    </div>
                    <div>
                      <span style={{ color: '#6688aa', fontSize: '10px' }}>경쟁 최저가</span>
                      <p style={{ color: '#ffaa00', fontSize: '14px', fontWeight: 600, margin: '2px 0 0' }}>{fmt(result.calculation.competitorMinPrice)}원</p>
                    </div>
                    <div>
                      <span style={{ color: '#6688aa', fontSize: '10px' }}>경쟁 평균가</span>
                      <p style={{ color: '#00d4ff', fontSize: '14px', fontWeight: 600, margin: '2px 0 0' }}>{fmt(result.calculation.competitorAvgPrice)}원</p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Jarvis Message */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                style={{
                  padding: '16px',
                  background: 'rgba(0,200,255,0.05)',
                  borderRadius: '10px',
                  border: '1px solid rgba(0,200,255,0.15)',
                }}
              >
                <span style={{ color: '#00d4ff', fontSize: '11px', fontWeight: 600, marginBottom: '8px', display: 'block' }}>
                  JARVIS ANALYSIS
                </span>
                <p style={{ color: '#ccdde8', fontSize: '13px', lineHeight: '1.7', whiteSpace: 'pre-line', margin: 0 }}>
                  {result.jarvisMessage}
                </p>
              </motion.div>

              {/* Saved indicator */}
              {result.savedToSheets && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 }}
                  style={{ textAlign: 'center', padding: '8px', color: '#00ff88', fontSize: '11px' }}
                >
                  ✓ Google Sheets에 자동 저장됨
                </motion.div>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Sub Components ──
function InputField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label style={{ color: '#6688aa', fontSize: '11px', marginBottom: '4px', display: 'block' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(0,200,255,0.2)',
          borderRadius: '8px',
          color: '#fff',
          fontSize: '13px',
          outline: 'none',
        }}
      />
    </div>
  );
}

function CostRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: '#8899aa', fontSize: '11px' }}>{label}</span>
      <span style={{ color, fontSize: '12px', fontWeight: 600 }}>{value}</span>
    </div>
  );
}
