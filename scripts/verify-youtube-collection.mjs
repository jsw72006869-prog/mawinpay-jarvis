import { readFile } from 'fs/promises';

const endpoint = process.env.JARVIS_API_URL || '';
const ownerToken = process.env.JARVIS_OWNER_TOKEN || '';

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS ${message}`);
  }
}

function containsRawEmail(value) {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(JSON.stringify(value || {}));
}

function containsBase64Attachment(value) {
  return /contentBase64|attachmentBase64|data:application\/vnd/i.test(JSON.stringify(value || {}));
}

const source = await readFile('api/cloud-proxy.ts', 'utf8');
assert(source.includes('buildHotVideoInsights'), 'hot video insight builder exists');
assert(source.includes('hotVideoScore'), 'candidate hotVideoScore is returned');
assert(source.includes('rookieBadge'), 'rising creator badge field is returned');
assert(source.includes('emailDiscovery'), 'safe email discovery status is returned');
assert(source.includes("reason: 'dryRun'"), 'YouTube preview keeps dryRun save skip');
assert(!/console\.log\([^)]*contentBase64/i.test(source), 'no obvious attachment base64 console log');

if (!endpoint) {
  console.log('SKIP endpoint dryRun check: set JARVIS_API_URL to verify an API deployment.');
  process.exit();
}

const headers = { 'content-type': 'application/json' };
if (ownerToken) headers.authorization = `Bearer ${ownerToken}`;

const response = await fetch(endpoint, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    task: 'outreach-collect',
    source: 'youtube_collection_os',
    keyword: 'camping creator',
    categoryLabel: 'camping',
    collectionMode: 'category_channel_collect',
    targetType: 'channel',
    requestedCount: 3,
    targetContactableCount: 3,
    maxPages: 1,
    dryRun: true,
    countOnly: true,
  }),
});

assert(response.ok, `endpoint responded ${response.status}`);
const data = await response.json();
assert(data.success === true, 'YouTube collection preview returns success true for safe dryRun path');
assert(data.dryRun === true, 'dryRun flag remains true');
assert(data.autoSave?.skipped === true, 'autoSave is skipped');
assert(data.autoSave?.reason === 'dryRun', 'autoSave reason is dryRun');
assert(data.diagnostics?.youtubeApiStatus, 'youtubeApiStatus is explicit');
assert(Array.isArray(data.hotVideos || data.summary?.hotVideos), 'hotVideos array is present');
assert(data.viralInsight && typeof data.viralInsight === 'object', 'viralInsight object is present');
assert(!containsRawEmail(data), 'response does not expose raw email');
assert(!containsBase64Attachment(data), 'response does not expose attachment base64');

const candidates = Array.isArray(data.candidates) ? data.candidates : [];
if (candidates.length > 0) {
  const first = candidates[0];
  assert(Object.prototype.hasOwnProperty.call(first, 'hotVideoScore'), 'candidate includes hotVideoScore');
  assert(Object.prototype.hasOwnProperty.call(first, 'emailDiscovery'), 'candidate includes safe emailDiscovery');
}
