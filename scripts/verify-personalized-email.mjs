import { build } from 'esbuild';
import { pathToFileURL } from 'url';
import { mkdir, rm } from 'fs/promises';
import path from 'path';

const outDir = path.resolve('.tmp-personalized-email');
const outFile = path.join(outDir, 'personalizedEmail.mjs');

await mkdir(outDir, { recursive: true });
await build({
  entryPoints: ['src/lib/outreach/personalizedEmail.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: outFile,
  logLevel: 'silent',
});

const { buildPersonalizedInfluencerEmail, evaluateInfluencerEmailQuality } = await import(pathToFileURL(outFile).href);

const beauty = buildPersonalizedInfluencerEmail({
  candidate: {
    candidateId: 'test-beauty-jeyu',
    channelName: '재유JEYU',
    requestedVertical: 'beauty',
    recentVideoTitles: ['올리브영 추천템으로 완성한 여름 메이크업 루틴'],
    contentStyle: '제품 사용감과 전후 비교를 차분하게 설명하는 뷰티 리뷰',
    fitReason: '스킨케어와 메이크업 루틴 콘텐츠가 명확함',
  },
  product: {
    name: '복숭아 톤업 선크림',
    benefits: ['화사한 피부 표현', '여름 루틴에 맞는 가벼운 사용감'],
    proofPoints: ['사용 전후 컷 제공 가능'],
  },
  brand: { name: 'MAWINPAY' },
  options: { requestedVertical: 'beauty' },
});

const camping = buildPersonalizedInfluencerEmail({
  candidate: {
    candidateId: 'test-camping-jessica',
    channelName: 'Jessica Camping',
    requestedVertical: 'camping',
    recentVideoTitles: ['비 오는 날 차박 캠핑에서 먹기 좋은 간편 간식'],
    contentStyle: '캠핑 장면과 실제 사용 동선을 보여주는 브이로그형 콘텐츠',
    fitReason: '캠핑 현장 식품 리뷰와 잘 맞음',
  },
  product: {
    name: '초당옥수수 간식팩',
    benefits: ['캠핑장에서 바로 먹기 쉬움', '아이와 함께 먹기 좋은 구성'],
    proofPoints: ['개별 포장 샘플 제공 가능'],
  },
  brand: { name: 'MAWINPAY' },
  options: { requestedVertical: 'camping' },
});

const weak = buildPersonalizedInfluencerEmail({
  candidate: {
    candidateId: 'test-weak',
    channelName: '',
    requestedVertical: 'beauty',
  },
  product: { name: '테스트 상품' },
  options: { requestedVertical: 'beauty' },
});

const checks = [
  ['beauty name included', beauty.body.includes('재유JEYU')],
  ['camping name included', camping.body.includes('Jessica Camping')],
  ['subjects differ', beauty.subject !== camping.subject],
  ['first paragraphs differ', beauty.body.split('\n\n')[0] !== camping.body.split('\n\n')[0]],
  ['beauty score calculated', Number.isFinite(beauty.personalizationScore)],
  ['camping score calculated', Number.isFinite(camping.personalizationScore)],
  ['beauty passed', evaluateInfluencerEmailQuality(beauty).passed],
  ['camping passed', evaluateInfluencerEmailQuality(camping).passed],
  ['weak excluded', weak.personalizationStatus !== 'ready' && !evaluateInfluencerEmailQuality(weak).passed],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}

console.log(JSON.stringify({
  beauty: { subject: beauty.subject, score: beauty.personalizationScore, status: beauty.personalizationStatus },
  camping: { subject: camping.subject, score: camping.personalizationScore, status: camping.personalizationStatus },
  weak: { score: weak.personalizationScore, status: weak.personalizationStatus, flags: weak.quality?.flags || [] },
}, null, 2));

await rm(outDir, { recursive: true, force: true });

if (failed.length > 0) {
  process.exitCode = 1;
}
