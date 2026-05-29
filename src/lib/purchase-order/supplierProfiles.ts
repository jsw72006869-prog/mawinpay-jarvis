export type CarrierCode = 'lotte' | 'logen' | 'unknown';

export type SupplierProfile = {
  supplierId: string;
  supplierName: string;
  productGroupCode: string;
  productGroupName: string;
  productKeywords: string[];
  optionKeywords?: string[];
  sellerProductCodeKeywords?: string[];
  carrier: CarrierCode;
  emailConfigured: boolean;
  emailMasked?: string;
  active: boolean;
  notes?: string;
  updatedAt?: string;
};

export type SupplierProfileUpsertInput = {
  supplierId?: string;
  supplierName: string;
  productGroupCode: string;
  productGroupName: string;
  productKeywords: string[];
  optionKeywords?: string[];
  sellerProductCodeKeywords?: string[];
  carrier: CarrierCode;
  email?: string;
  active?: boolean;
  approvalConfirmed: boolean;
};
