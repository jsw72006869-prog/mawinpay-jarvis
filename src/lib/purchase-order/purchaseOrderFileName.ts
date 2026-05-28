export function buildPurchaseOrderFileName(input: {
  dateKst?: Date | string;
  productGroupName?: string;
  supplierName?: string;
  carrier?: 'lotte' | 'logen' | 'unknown';
  ext: 'xlsx' | 'csv';
}): string {
  const date = input.dateKst ? new Date(input.dateKst) : new Date();
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const month = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  const name = input.productGroupName || input.supplierName || '';
  const safeName = name.replace(/[\/\\:*?"<>|]/g, '').trim();
  return `${month}-${day} ${safeName ? `${safeName} ` : ''}발주서.${input.ext}`;
}
