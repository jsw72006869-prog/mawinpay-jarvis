export type ProductGroupCode = 'chestnut' | 'corn' | 'maesil' | 'peach' | 'unknown';

export type ProductGroupRule = {
  groupCode: ProductGroupCode;
  displayName: string;
  productKeywords: string[];
  optionKeywords?: string[];
  sellerProductCodeIncludes?: string[];
  priority: number;
  active: boolean;
};

export type ProductGroupResult = {
  groupCode: ProductGroupCode;
  displayName: string;
  matchedKeywords: string[];
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  warning?: string;
};

export const DEFAULT_PRODUCT_GROUP_RULES: ProductGroupRule[] = [
  { groupCode: 'chestnut', displayName: '밤', productKeywords: ['밤', '알밤', '생율'], priority: 90, active: true },
  { groupCode: 'corn', displayName: '옥수수', productKeywords: ['옥수수', '대학찰옥수수', '초당옥수수'], priority: 80, active: true },
  { groupCode: 'maesil', displayName: '매실', productKeywords: ['매실', '청매실', '황매실'], priority: 70, active: true },
  { groupCode: 'peach', displayName: '복숭아', productKeywords: ['복숭아', '딱복', '물복', '백도', '황도'], priority: 60, active: true },
];

export function classifyProductGroup(input: {
  productName?: string;
  optionName?: string;
  sellerProductCode?: string;
  rules?: ProductGroupRule[];
}): ProductGroupResult {
  const text = `${input.productName || ''} ${input.optionName || ''} ${input.sellerProductCode || ''}`.toLowerCase();
  const rules = (input.rules || DEFAULT_PRODUCT_GROUP_RULES)
    .filter(rule => rule.active)
    .sort((a, b) => b.priority - a.priority);

  for (const rule of rules) {
    const terms = [
      ...rule.productKeywords,
      ...(rule.optionKeywords || []),
      ...(rule.sellerProductCodeIncludes || []),
    ];
    const matchedKeywords = terms.filter(term => term && text.includes(term.toLowerCase()));
    if (matchedKeywords.length > 0) {
      return {
        groupCode: rule.groupCode,
        displayName: rule.displayName,
        matchedKeywords,
        confidence: matchedKeywords.length >= 2 ? 'high' : 'medium',
      };
    }
  }

  return {
    groupCode: 'unknown',
    displayName: '미분류',
    matchedKeywords: [],
    confidence: 'unknown',
    warning: 'product_group_mapping_required',
  };
}
