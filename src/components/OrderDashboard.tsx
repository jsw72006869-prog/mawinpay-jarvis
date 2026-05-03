import React, { useState, useEffect, useRef } from 'react';

// ── 타입 정의 ──
export interface OrderItem {
  orderId: string;
  orderDate: string;
  productName: string;
  option?: string;
  quantity: number;
  price: number;
  buyerName: string;
  status: 'new' | 'confirmed' | 'preparing' | 'shipping' | 'delivered' | 'completed' | 'cancelled' | 'return';
  trackingNumber?: string;
  carrier?: string;
  address?: string;
  phone?: string;
}

export interface OrderDashboardData {
  orders: OrderItem[];
  summary?: {
    newOrders: number;
    pendingShipping: number;
    shipping: number;
    delivered: number;
    totalRevenue: number;
    todayRevenue: number;
  };
}

interface OrderDashboardProps {
  visible: boolean;
  data: OrderDashboardData | null;
  onClose: () => void;
  onAction?: (action: string, orderId?: string) => void;
}

// ── 상태 라벨/색상 매핑 ──
const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: '신규주문', color: '#00e5ff', bg: 'rgba(0,229,255,0.15)' },
  confirmed: { label: '발주확인', color: '#7c4dff', bg: 'rgba(124,77,255,0.15)' },
  preparing: { label: '배송준비', color: '#ffd740', bg: 'rgba(255,215,64,0.15)' },
  shipping: { label: '배송중', color: '#69f0ae', bg: 'rgba(105,240,174,0.15)' },
  delivered: { label: '배송완료', color: '#b2ff59', bg: 'rgba(178,255,89,0.15)' },
  completed: { label: '구매확정', color: '#40c4ff', bg: 'rgba(64,196,255,0.15)' },
  cancelled: { label: '취소', color: '#ff5252', bg: 'rgba(255,82,82,0.15)' },
  return: { label: '반품/교환', color: '#ff6e40', bg: 'rgba(255,110,64,0.15)' },
};

// ── 금액 포맷 ──
function formatPrice(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}

// ── 날짜 포맷 ──
function formatDate(d: string): string {
  try {
    const date = new Date(d);
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  } catch {
    return d;
  }
}

const OrderDashboard: React.FC<OrderDashboardProps> = ({ visible, data, onClose, onAction }) => {
  const [filter, setFilter] = useState<string>('all');
  const [animateIn, setAnimateIn] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) {
      setTimeout(() => setAnimateIn(true), 50);
    } else {
      setAnimateIn(false);
      setSelectedOrder(null);
      setFilter('all');
    }
  }, [visible]);

  if (!visible || !data) return null;

  const orders = data.orders || [];
  const summary = data.summary || {
    newOrders: orders.filter(o => o.status === 'new').length,
    pendingShipping: orders.filter(o => ['confirmed', 'preparing'].includes(o.status)).length,
    shipping: orders.filter(o => o.status === 'shipping').length,
    delivered: orders.filter(o => ['delivered', 'completed'].includes(o.status)).length,
    totalRevenue: orders.reduce((s, o) => s + o.price * o.quantity, 0),
    todayRevenue: orders.filter(o => {
      const d = new Date(o.orderDate);
      const today = new Date();
      return d.toDateString() === today.toDateString();
    }).reduce((s, o) => s + o.price * o.quantity, 0),
  };

  const filteredOrders = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  // ── 상태 카운트 카드 ──
  const statusCards = [
    { key: 'new', icon: '🔔', label: '신규주문', count: summary.newOrders, color: '#00e5ff' },
    { key: 'preparing', icon: '📦', label: '배송준비', count: summary.pendingShipping, color: '#ffd740' },
    { key: 'shipping', icon: '🚚', label: '배송중', count: summary.shipping, color: '#69f0ae' },
    { key: 'delivered', icon: '✅', label: '배송완료', count: summary.delivered, color: '#b2ff59' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9000,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        opacity: animateIn ? 1 : 0,
        transition: 'opacity 0.4s ease',
        pointerEvents: animateIn ? 'auto' : 'none',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        style={{
          width: '95%',
          maxWidth: 1100,
          maxHeight: '90vh',
          background: 'linear-gradient(135deg, rgba(10,15,30,0.97), rgba(15,25,50,0.97))',
          border: '1px solid rgba(0,229,255,0.3)',
          borderRadius: 16,
          overflow: 'hidden',
          transform: animateIn ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)',
          transition: 'transform 0.5s cubic-bezier(0.16,1,0.3,1)',
          boxShadow: '0 0 60px rgba(0,229,255,0.15), 0 0 120px rgba(0,100,200,0.1)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── 헤더 ── */}
        <div style={{
          padding: '20px 28px',
          borderBottom: '1px solid rgba(0,229,255,0.15)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(90deg, rgba(0,229,255,0.08), transparent)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#00e5ff',
              boxShadow: '0 0 12px #00e5ff',
              animation: 'pulse 2s infinite',
            }} />
            <span style={{
              fontFamily: "'Orbitron', monospace",
              fontSize: 16,
              color: '#00e5ff',
              letterSpacing: 3,
              textTransform: 'uppercase',
            }}>
              Order Dashboard
            </span>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginLeft: 8 }}>
              SMARTSTORE
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: 'monospace' }}>
              총 매출: {formatPrice(summary.totalRevenue)}
            </span>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,82,82,0.2)',
                border: '1px solid rgba(255,82,82,0.4)',
                borderRadius: 8,
                color: '#ff5252',
                padding: '6px 14px',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: "'Orbitron', monospace",
                letterSpacing: 1,
              }}
            >
              CLOSE
            </button>
          </div>
        </div>

        {/* ── 상태 카드 그리드 ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          padding: '16px 28px',
          borderBottom: '1px solid rgba(0,229,255,0.1)',
        }}>
          {statusCards.map((card) => (
            <div
              key={card.key}
              onClick={() => setFilter(filter === card.key ? 'all' : card.key)}
              style={{
                background: filter === card.key
                  ? `linear-gradient(135deg, ${card.color}22, ${card.color}11)`
                  : 'rgba(255,255,255,0.03)',
                border: `1px solid ${filter === card.key ? card.color + '66' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 12,
                padding: '14px 16px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {filter === card.key && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: card.color,
                  boxShadow: `0 0 10px ${card.color}`,
                }} />
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 20 }}>{card.icon}</span>
                <span style={{
                  fontFamily: "'Orbitron', monospace",
                  fontSize: 28,
                  fontWeight: 700,
                  color: card.color,
                  textShadow: `0 0 20px ${card.color}44`,
                }}>
                  {card.count}
                </span>
              </div>
              <div style={{
                color: 'rgba(255,255,255,0.6)',
                fontSize: 11,
                marginTop: 6,
                letterSpacing: 0.5,
              }}>
                {card.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── 주문 플로우 시각화 ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          padding: '12px 28px',
          borderBottom: '1px solid rgba(0,229,255,0.08)',
        }}>
          {['신규주문', '발주확인', '배송준비', '배송중', '배송완료', '구매확정'].map((step, i) => (
            <React.Fragment key={step}>
              <div style={{
                padding: '4px 10px',
                borderRadius: 12,
                background: i < 2 ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${i < 2 ? 'rgba(0,229,255,0.3)' : 'rgba(255,255,255,0.1)'}`,
                color: i < 2 ? '#00e5ff' : 'rgba(255,255,255,0.4)',
                fontSize: 10,
                whiteSpace: 'nowrap',
              }}>
                {step}
              </div>
              {i < 5 && (
                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>→</span>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* ── 주문 테이블 ── */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '0 28px 20px',
        }}>
          {/* 필터 바 */}
          <div style={{
            display: 'flex',
            gap: 8,
            padding: '12px 0',
            flexWrap: 'wrap',
          }}>
            <button
              onClick={() => setFilter('all')}
              style={{
                padding: '4px 12px',
                borderRadius: 8,
                border: `1px solid ${filter === 'all' ? '#00e5ff' : 'rgba(255,255,255,0.15)'}`,
                background: filter === 'all' ? 'rgba(0,229,255,0.15)' : 'transparent',
                color: filter === 'all' ? '#00e5ff' : 'rgba(255,255,255,0.5)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              전체 ({orders.length})
            </button>
            {Object.entries(STATUS_MAP).map(([key, val]) => {
              const count = orders.filter(o => o.status === key).length;
              if (count === 0) return null;
              return (
                <button
                  key={key}
                  onClick={() => setFilter(filter === key ? 'all' : key)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 8,
                    border: `1px solid ${filter === key ? val.color : 'rgba(255,255,255,0.15)'}`,
                    background: filter === key ? val.bg : 'transparent',
                    color: filter === key ? val.color : 'rgba(255,255,255,0.5)',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {val.label} ({count})
                </button>
              );
            })}
          </div>

          {/* 테이블 */}
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 12,
          }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(0,229,255,0.2)' }}>
                {['주문일시', '상품명', '옵션', '수량', '금액', '주문자', '상태', ''].map((h, i) => (
                  <th key={i} style={{
                    padding: '10px 8px',
                    textAlign: 'left',
                    color: 'rgba(0,229,255,0.7)',
                    fontFamily: "'Orbitron', monospace",
                    fontSize: 10,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    fontWeight: 400,
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{
                    padding: 40,
                    textAlign: 'center',
                    color: 'rgba(255,255,255,0.3)',
                    fontStyle: 'italic',
                  }}>
                    해당 상태의 주문이 없습니다
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order, idx) => {
                  const st = STATUS_MAP[order.status] || STATUS_MAP.new;
                  return (
                    <tr
                      key={order.orderId + idx}
                      onClick={() => setSelectedOrder(selectedOrder?.orderId === order.orderId ? null : order)}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        cursor: 'pointer',
                        background: selectedOrder?.orderId === order.orderId
                          ? 'rgba(0,229,255,0.08)'
                          : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                        transition: 'background 0.2s',
                      }}
                    >
                      <td style={{ padding: '10px 8px', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
                        {formatDate(order.orderDate)}
                      </td>
                      <td style={{ padding: '10px 8px', color: '#fff', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {order.productName}
                      </td>
                      <td style={{ padding: '10px 8px', color: 'rgba(255,255,255,0.5)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {order.option || '-'}
                      </td>
                      <td style={{ padding: '10px 8px', color: '#fff', textAlign: 'center' }}>
                        {order.quantity}
                      </td>
                      <td style={{ padding: '10px 8px', color: '#ffd740', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                        {formatPrice(order.price * order.quantity)}
                      </td>
                      <td style={{ padding: '10px 8px', color: 'rgba(255,255,255,0.7)' }}>
                        {order.buyerName}
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: 10,
                          background: st.bg,
                          color: st.color,
                          fontSize: 10,
                          fontWeight: 600,
                          border: `1px solid ${st.color}33`,
                        }}>
                          {st.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        {order.status === 'new' && onAction && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onAction('confirm', order.orderId); }}
                            style={{
                              padding: '3px 8px',
                              borderRadius: 6,
                              border: '1px solid rgba(0,229,255,0.4)',
                              background: 'rgba(0,229,255,0.1)',
                              color: '#00e5ff',
                              fontSize: 10,
                              cursor: 'pointer',
                            }}
                          >
                            발주확인
                          </button>
                        )}
                        {order.status === 'preparing' && onAction && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onAction('ship', order.orderId); }}
                            style={{
                              padding: '3px 8px',
                              borderRadius: 6,
                              border: '1px solid rgba(105,240,174,0.4)',
                              background: 'rgba(105,240,174,0.1)',
                              color: '#69f0ae',
                              fontSize: 10,
                              cursor: 'pointer',
                            }}
                          >
                            발송처리
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* ── 선택된 주문 상세 ── */}
          {selectedOrder && (
            <div style={{
              marginTop: 16,
              padding: 20,
              background: 'rgba(0,229,255,0.05)',
              border: '1px solid rgba(0,229,255,0.2)',
              borderRadius: 12,
              animation: 'fadeIn 0.3s ease',
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}>
                <span style={{
                  fontFamily: "'Orbitron', monospace",
                  fontSize: 12,
                  color: '#00e5ff',
                  letterSpacing: 2,
                }}>
                  ORDER DETAIL
                </span>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontFamily: 'monospace' }}>
                  #{selectedOrder.orderId}
                </span>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 12,
              }}>
                {[
                  { label: '상품명', value: selectedOrder.productName },
                  { label: '옵션', value: selectedOrder.option || '-' },
                  { label: '수량', value: `${selectedOrder.quantity}개` },
                  { label: '결제금액', value: formatPrice(selectedOrder.price * selectedOrder.quantity) },
                  { label: '주문자', value: selectedOrder.buyerName },
                  { label: '연락처', value: selectedOrder.phone || '-' },
                  { label: '배송지', value: selectedOrder.address || '-' },
                  { label: '운송장', value: selectedOrder.trackingNumber ? `${selectedOrder.carrier || ''} ${selectedOrder.trackingNumber}` : '-' },
                ].map((item, i) => (
                  <div key={i}>
                    <div style={{ color: 'rgba(0,229,255,0.6)', fontSize: 10, marginBottom: 4, letterSpacing: 0.5 }}>
                      {item.label}
                    </div>
                    <div style={{ color: '#fff', fontSize: 13 }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* 배송 추적 타임라인 */}
              {selectedOrder.trackingNumber && (
                <div style={{ marginTop: 16 }}>
                  <div style={{
                    fontFamily: "'Orbitron', monospace",
                    fontSize: 10,
                    color: '#69f0ae',
                    letterSpacing: 2,
                    marginBottom: 12,
                  }}>
                    DELIVERY TRACKING
                  </div>
                  <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
                    {['접수', '집화', '이동중', '배달중', '완료'].map((step, i) => {
                      const isActive = i <= 2; // 예시: 이동중까지 활성
                      return (
                        <React.Fragment key={step}>
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 4,
                          }}>
                            <div style={{
                              width: 20,
                              height: 20,
                              borderRadius: '50%',
                              background: isActive ? '#69f0ae' : 'rgba(255,255,255,0.1)',
                              border: `2px solid ${isActive ? '#69f0ae' : 'rgba(255,255,255,0.2)'}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: isActive ? '0 0 10px rgba(105,240,174,0.4)' : 'none',
                            }}>
                              {isActive && (
                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#0a0f1e' }} />
                              )}
                            </div>
                            <span style={{
                              fontSize: 9,
                              color: isActive ? '#69f0ae' : 'rgba(255,255,255,0.3)',
                            }}>
                              {step}
                            </span>
                          </div>
                          {i < 4 && (
                            <div style={{
                              flex: 1,
                              height: 2,
                              background: i < 2 ? '#69f0ae' : 'rgba(255,255,255,0.1)',
                              marginBottom: 18,
                              minWidth: 30,
                            }} />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 하단 액션 바 ── */}
        <div style={{
          padding: '14px 28px',
          borderTop: '1px solid rgba(0,229,255,0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(0,0,0,0.3)',
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {onAction && (
              <>
                <button
                  onClick={() => onAction('confirmAll')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    border: '1px solid rgba(0,229,255,0.4)',
                    background: 'rgba(0,229,255,0.1)',
                    color: '#00e5ff',
                    fontSize: 11,
                    cursor: 'pointer',
                    fontFamily: "'Orbitron', monospace",
                    letterSpacing: 1,
                  }}
                >
                  전체 발주확인
                </button>
                <button
                  onClick={() => onAction('dispatch')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    border: '1px solid rgba(105,240,174,0.4)',
                    background: 'rgba(105,240,174,0.1)',
                    color: '#69f0ae',
                    fontSize: 11,
                    cursor: 'pointer',
                    fontFamily: "'Orbitron', monospace",
                    letterSpacing: 1,
                  }}
                >
                  발주서 생성
                </button>
              </>
            )}
          </div>
          <div style={{
            color: 'rgba(255,255,255,0.3)',
            fontSize: 10,
            fontFamily: 'monospace',
          }}>
            {filteredOrders.length}건 표시 / 총 {orders.length}건
          </div>
        </div>
      </div>

      {/* CSS 애니메이션 */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default OrderDashboard;
