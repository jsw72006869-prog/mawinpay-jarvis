const rules = [
  { groupCode: 'chestnut', displayName: '밤', keywords: ['밤', '알밤', '생율'], carrier: 'logen' },
  { groupCode: 'corn', displayName: '옥수수', keywords: ['옥수수', '대학찰옥수수', '초당옥수수'], carrier: 'lotte' },
  { groupCode: 'maesil', displayName: '매실', keywords: ['매실', '청매실', '황매실'], carrier: 'lotte' },
  { groupCode: 'peach', displayName: '복숭아', keywords: ['복숭아', '딱복', '물복', '백도', '황도'], carrier: 'unknown' },
];

function classify(row) {
  const text = `${row.productName || ''} ${row.optionName || ''} ${row.sellerProductCode || ''}`.toLowerCase();
  const rule = rules.find(candidate => candidate.keywords.some(keyword => text.includes(keyword.toLowerCase())));
  return rule || { groupCode: 'unknown', displayName: '미분류', carrier: 'unknown' };
}

function fileName(productGroupName, date = new Date('2026-05-28T09:00:00+09:00')) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCMonth() + 1}-${kst.getUTCDate()} ${productGroupName} 발주서.xlsx`;
}

function makeRows(productName, count) {
  return Array.from({ length: count }, (_, index) => ({
    productOrderId: `${productName}_${index + 1}`,
    productName,
    optionName: '',
    quantity: 1,
  }));
}

const rows = [
  ...makeRows('매실', 60),
  ...makeRows('옥수수', 100),
  ...makeRows('복숭아', 140),
];

const groups = new Map();
for (const row of rows) {
  const classified = classify(row);
  const key = `${classified.groupCode}_${classified.carrier}`;
  if (!groups.has(key)) {
    groups.set(key, {
      productGroupCode: classified.groupCode,
      productGroupName: classified.displayName,
      carrier: classified.carrier,
      totalQuantity: 0,
      rowCount: 0,
      fileName: fileName(classified.displayName),
      canExport: classified.carrier !== 'unknown' && classified.groupCode !== 'unknown',
    });
  }
  const group = groups.get(key);
  group.totalQuantity += row.quantity;
  group.rowCount += 1;
}

const result = Array.from(groups.values());
const byCode = Object.fromEntries(result.map(group => [group.productGroupCode, group]));

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exitCode = 1;
  }
}

assert(result.length === 3, 'groupCount should be 3');
assert(byCode.maesil?.totalQuantity === 60, 'maesil totalQuantity should be 60');
assert(byCode.corn?.totalQuantity === 100, 'corn totalQuantity should be 100');
assert(byCode.peach?.totalQuantity === 140, 'peach totalQuantity should be 140');
assert(byCode.maesil?.carrier === 'lotte', 'maesil should route to lotte');
assert(byCode.corn?.carrier === 'lotte', 'corn should route to lotte');
assert(byCode.peach?.carrier === 'unknown', 'peach should remain carrier unknown');
assert(byCode.peach?.canExport === false, 'peach export should be disabled until carrier mapping exists');
assert(byCode.maesil?.fileName === '5-28 매실 발주서.xlsx', 'maesil file name should follow M-D product format');

console.log(JSON.stringify({
  success: process.exitCode !== 1,
  totalRows: rows.length,
  groupCount: result.length,
  groups: result,
}, null, 2));
