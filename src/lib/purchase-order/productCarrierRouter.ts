import type { ProductGroupCode } from './productGroupClassifier';

export type PurchaseOrderCarrier = 'lotte' | 'logen' | 'unknown';

export type CarrierRoutingResult = {
  productGroupCode: string;
  productGroupName: string;
  carrier: PurchaseOrderCarrier;
  supplierId?: string;
  supplierName?: string;
  emailConfigured: boolean;
  emailMasked?: string;
  routingStatus:
    | 'ready'
    | 'email_missing'
    | 'carrier_missing'
    | 'supplier_missing'
    | 'mapping_required';
  warnings: string[];
};

export function routeProductCarrier(input: {
  productGroupCode: ProductGroupCode;
  productGroupName: string;
  supplierEmailMasked?: string;
}): CarrierRoutingResult {
  const base = {
    productGroupCode: input.productGroupCode,
    productGroupName: input.productGroupName,
    emailConfigured: !!input.supplierEmailMasked,
    emailMasked: input.supplierEmailMasked,
    warnings: [] as string[],
  };

  if (input.productGroupCode === 'chestnut') {
    return {
      ...base,
      carrier: 'logen',
      supplierId: 'supplier_chestnut',
      supplierName: '밤 발주처',
      routingStatus: input.supplierEmailMasked ? 'ready' : 'email_missing',
      warnings: input.supplierEmailMasked ? [] : ['supplier_email_missing'],
    };
  }
  if (input.productGroupCode === 'corn') {
    return {
      ...base,
      carrier: 'lotte',
      supplierId: 'supplier_corn',
      supplierName: '옥수수 발주처',
      routingStatus: input.supplierEmailMasked ? 'ready' : 'email_missing',
      warnings: input.supplierEmailMasked ? [] : ['supplier_email_missing'],
    };
  }
  if (input.productGroupCode === 'maesil') {
    return {
      ...base,
      carrier: 'lotte',
      supplierId: 'supplier_maesil',
      supplierName: '매실 발주처',
      routingStatus: input.supplierEmailMasked ? 'ready' : 'email_missing',
      warnings: input.supplierEmailMasked ? [] : ['supplier_email_missing'],
    };
  }
  if (input.productGroupCode === 'peach') {
    return {
      ...base,
      carrier: 'unknown',
      supplierId: 'supplier_peach',
      supplierName: '복숭아 발주처',
      routingStatus: 'carrier_missing',
      warnings: ['carrier_mapping_required'],
    };
  }

  return {
    ...base,
    carrier: 'unknown',
    supplierName: '미분류 발주처',
    routingStatus: 'mapping_required',
    warnings: ['product_group_mapping_required', 'carrier_mapping_required'],
  };
}
