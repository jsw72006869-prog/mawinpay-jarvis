const endpoint = process.env.JARVIS_API_URL || 'http://localhost:3002/api/cloud-proxy';

function maskSensitive(value) {
  if (typeof value === 'string') {
    return value
      .replace(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, '[email]')
      .replace(/010-\d{3,4}-\d{4}/g, '010-****-****')
      .replace(/key=[^&\s]+/gi, 'key=[redacted]');
  }
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskSensitive(v)]));
  }
  return value;
}

async function post(label, payload) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  console.log(`\n[${label}] status=${res.status} success=${data.success}`);
  return data;
}

async function main() {
  console.log(`[verify-data-integrity] endpoint=${endpoint.replace(/https?:\/\/[^/]+/, '[host]')}`);

  const smartstore = await post('smartstore-orders', {
    task: 'smartstore-orders',
    params: { action: 'query_order_status', forceRefresh: true },
  });
  console.log(maskSensitive({
    source: smartstore.source,
    dataReliable: smartstore.dataReliable,
    productOrderIdUniqueCount: smartstore.diagnostics?.productOrderIdUniqueCount,
    detailFetchedCount: smartstore.diagnostics?.detailFetchedCount,
    statusBuckets: smartstore.diagnostics?.statusBuckets,
    apiWarnings: smartstore.diagnostics?.apiWarnings,
  }));

  const dailyBrief = await post('daily-brief-24h', {
    task: 'daily-brief-24h',
    params: { dryRun: true, sendTelegram: false },
  });
  console.log(maskSensitive({
    smartstoreSource: dailyBrief.smartstore?.source,
    smartstoreReliable: dailyBrief.smartstore?.dataReliable,
    smartstoreDiagnostics: dailyBrief.smartstore?.diagnostics,
  }));

  const outreach = await post('outreach-collect', {
    task: 'outreach-collect',
    params: {
      keyword: '복숭아 리뷰',
      product: '복숭아',
      platform: 'youtube',
      maxCandidates: 3,
      requireEmail: true,
      dryRun: true,
      countOnly: true,
    },
  });
  console.log(maskSensitive({
    youtubeApiStatus: outreach.diagnostics?.youtubeApiStatus,
    rawSearchResultCount: outreach.summary?.rawSearchResultCount,
    dedupedChannelCount: outreach.summary?.dedupedChannelCount,
    displayedCandidateCount: outreach.summary?.displayedCandidateCount,
    publicEmailCount: outreach.summary?.publicEmailCount,
    contactableCount: outreach.summary?.contactableCount,
    skippedReasons: outreach.diagnostics?.skippedReasons,
    apiWarnings: outreach.diagnostics?.apiWarnings,
    save: outreach.autoSave,
  }));
}

main().catch((error) => {
  console.error('[verify-data-integrity] failed', maskSensitive(error?.message || error));
  process.exit(1);
});
