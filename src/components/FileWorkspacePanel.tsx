import { useState, useEffect } from 'react';

export interface WorkspaceRecord {
  recordId: string;
  createdAt: string;
  type: string;
  title: string;
  summary: string;
  sourceCommand: string;
  status: string;
  tags: string;
  linkedSheetTab: string;
  createdBy: string;
  safePreview: string;
}

interface FileWorkspacePanelProps {
  visible: boolean;
  onClose: () => void;
  onOpenRecord: (record: WorkspaceRecord) => void;
  records: WorkspaceRecord[];
  loading: boolean;
  onRefresh: () => void;
}

const TYPE_ICONS: Record<string, string> = {
  briefing: '📊',
  creative_script: '✨',
  growth_campaign: '🔗',
  purchase_order_draft: '📝',
  test: '🧪',
};

const TYPE_LABELS: Record<string, string> = {
  briefing: '브리핑',
  creative_script: '마케팅 스크립트',
  growth_campaign: 'Growth Link',
  purchase_order_draft: '발주서 초안',
  test: '테스트',
};

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${hours}:${mins}`;
}

export default function FileWorkspacePanel({
  visible, onClose, onOpenRecord, records, loading, onRefresh
}: FileWorkspacePanelProps) {
  const [filter, setFilter] = useState<string>('all');

  if (!visible) return null;

  const filtered = filter === 'all' ? records : records.filter(r => r.type === filter);

  return (
    <div style={{
      position: 'fixed',
      top: 60,
      left: 20,
      width: 380,
      maxHeight: 'calc(100vh - 120px)',
      background: 'rgba(10, 15, 25, 0.95)',
      border: '1px solid rgba(0, 200, 255, 0.3)',
      borderRadius: 8,
      zIndex: 9000,
      display: 'flex',
      flexDirection: 'column',
      backdropFilter: 'blur(12px)',
      boxShadow: '0 0 30px rgba(0, 200, 255, 0.1)',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid rgba(0, 200, 255, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#00c8ff', fontSize: 14, fontWeight: 600 }}>◈ FILE WORKSPACE</span>
          <span style={{ color: '#666', fontSize: 11 }}>{records.length}건</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onRefresh} style={{
            background: 'transparent', border: 'none', color: '#00c8ff',
            cursor: 'pointer', fontSize: 12, opacity: loading ? 0.5 : 1
          }}>
            {loading ? '...' : '↻'}
          </button>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: '#666',
            cursor: 'pointer', fontSize: 14
          }}>✕</button>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{
        padding: '8px 12px',
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
        borderBottom: '1px solid rgba(0, 200, 255, 0.1)',
      }}>
        {['all', 'briefing', 'creative_script', 'growth_campaign', 'purchase_order_draft'].map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            padding: '3px 8px',
            fontSize: 10,
            borderRadius: 4,
            border: filter === t ? '1px solid #00c8ff' : '1px solid rgba(255,255,255,0.1)',
            background: filter === t ? 'rgba(0, 200, 255, 0.15)' : 'transparent',
            color: filter === t ? '#00c8ff' : '#888',
            cursor: 'pointer',
          }}>
            {t === 'all' ? '전체' : TYPE_LABELS[t] || t}
          </button>
        ))}
      </div>

      {/* Records list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px 12px',
      }}>
        {loading && <div style={{ color: '#666', fontSize: 12, textAlign: 'center', padding: 20 }}>불러오는 중...</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ color: '#666', fontSize: 12, textAlign: 'center', padding: 20 }}>
            저장된 작업이 없습니다.
          </div>
        )}
        {filtered.map((record, idx) => (
          <div key={record.recordId || idx} style={{
            padding: '10px 12px',
            marginBottom: 6,
            background: 'rgba(0, 200, 255, 0.03)',
            border: '1px solid rgba(0, 200, 255, 0.1)',
            borderRadius: 6,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onClick={() => onOpenRecord(record)}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0, 200, 255, 0.4)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0, 200, 255, 0.1)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 14 }}>{TYPE_ICONS[record.type] || '📄'}</span>
              <span style={{ color: '#e0e0e0', fontSize: 12, fontWeight: 500, flex: 1 }}>
                {record.title || record.type}
              </span>
              <span style={{ color: '#555', fontSize: 10 }}>{formatDate(record.createdAt)}</span>
            </div>
            {record.safePreview && (
              <div style={{ color: '#888', fontSize: 11, marginLeft: 22, lineHeight: 1.4 }}>
                {record.safePreview.slice(0, 80)}{record.safePreview.length > 80 ? '...' : ''}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 6, marginLeft: 22 }}>
              <span style={{
                fontSize: 9, padding: '2px 6px', borderRadius: 3,
                background: 'rgba(0, 200, 255, 0.1)', color: '#00c8ff',
              }}>
                {TYPE_LABELS[record.type] || record.type}
              </span>
              <span style={{
                fontSize: 9, padding: '2px 6px', borderRadius: 3,
                background: record.status === 'saved' ? 'rgba(0, 255, 100, 0.1)' : 'rgba(255, 200, 0, 0.1)',
                color: record.status === 'saved' ? '#00ff64' : '#ffcc00',
              }}>
                {record.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 16px',
        borderTop: '1px solid rgba(0, 200, 255, 0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ color: '#555', fontSize: 10 }}>Google Sheets 연동</span>
        <a
          href="https://docs.google.com/spreadsheets/d/1RHJikwOZHS-7cDTZeNO9MzX_gD4dY717UiOTFu2t040/edit"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#00c8ff', fontSize: 10, textDecoration: 'none' }}
        >
          Sheets 열기 ↗
        </a>
      </div>
    </div>
  );
}
