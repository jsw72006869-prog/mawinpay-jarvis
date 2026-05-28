import type { PurchaseOrderCarrier } from './productCarrierRouter';

export type CarrierTemplateColumn = {
  key: string;
  header: string;
  width?: number;
};

export type CarrierTemplateProfile = {
  carrier: PurchaseOrderCarrier;
  displayName: string;
  sheetName: string;
  columns: CarrierTemplateColumn[];
};

const COMMON_COLUMNS: CarrierTemplateColumn[] = [
  { key: 'productName', header: '제  품 ', width: 32 },
  { key: 'quantity', header: '수량', width: 8 },
  { key: 'senderName', header: '보내시는분이름', width: 18 },
  { key: 'senderPhone', header: '보내시는분 전화번호', width: 20 },
  { key: 'receiverName', header: '받는분이름', width: 18 },
  { key: 'receiverPhone', header: '받는분전화번호', width: 20 },
  { key: 'receiverMobile', header: '받는분핸드폰번호', width: 20 },
  { key: 'address', header: '주소', width: 48 },
  { key: 'memo', header: '비고', width: 20 },
  { key: 'zipCode', header: '우편번호 ', width: 12 },
];

export const CARRIER_TEMPLATE_PROFILES: Record<'lotte' | 'logen', CarrierTemplateProfile> = {
  lotte: {
    carrier: 'lotte',
    displayName: '롯데택배',
    sheetName: 'Sheet2',
    columns: [...COMMON_COLUMNS, { key: 'deliveryMessage', header: '배송메세지', width: 28 }],
  },
  logen: {
    carrier: 'logen',
    displayName: '로젠택배',
    sheetName: 'Sheet1',
    columns: COMMON_COLUMNS,
  },
};

export function getCarrierTemplateProfile(carrier: PurchaseOrderCarrier): CarrierTemplateProfile | null {
  if (carrier === 'lotte' || carrier === 'logen') return CARRIER_TEMPLATE_PROFILES[carrier];
  return null;
}
