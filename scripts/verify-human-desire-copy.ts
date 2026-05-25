import handlerModule from '../api/cloud-proxy';

const handler = (handlerModule as any).default || handlerModule;

type TestCase = {
  name: string;
  params: Record<string, unknown>;
};

const tests: TestCase[] = [
  {
    name: 'peach Threads',
    params: {
      strategy: 'human_desire',
      product: 'peach',
      platform: 'threads',
      outputTypes: ['headline_copy', 'threads_post'],
      sourceKeyword: '제철 복숭아 공동구매',
      count: 5,
      dryRun: true,
    },
  },
  {
    name: 'peach Thumbnail',
    params: {
      strategy: 'human_desire',
      product: 'peach',
      platform: 'youtube_thumbnail',
      outputType: 'thumbnail_copy',
      count: 4,
      dryRun: true,
    },
  },
  {
    name: 'corn Shorts',
    params: {
      strategy: 'human_desire',
      product: 'corn',
      platform: 'youtube_shorts',
      outputType: 'shorts_script_15s',
      count: 3,
      dryRun: true,
    },
  },
  {
    name: 'kimchi Blog',
    params: {
      strategy: 'human_desire',
      product: 'kimchi_cabbage',
      platform: 'naver_blog',
      outputType: 'blog_title',
      count: 3,
      dryRun: true,
    },
  },
  {
    name: 'generic ad filter',
    params: {
      strategy: 'human_desire',
      product: 'peach',
      platform: 'threads',
      outputType: 'headline_copy',
      dryRun: true,
      seedCopies: [
        '제철 복숭아의 달콤함을 지금 만나보세요.',
        '신선하고 맛있는 복숭아를 합리적인 가격에 준비했습니다.',
      ],
    },
  },
];

async function callCloudProxy(params: Record<string, unknown>) {
  let statusCode = 0;
  let payload: any;
  const req = { method: 'POST', body: { task: 'copy_brain_generate', params } };
  const res = {
    setHeader() {},
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: unknown) {
      payload = data;
      return data;
    },
    end() {},
  };

  await handler(req as any, res as any);
  return { statusCode, payload };
}

async function main() {
  for (const test of tests) {
    const { statusCode, payload } = await callCloudProxy(test.params);
    const top = payload?.copies?.[0];
    console.log(JSON.stringify({
      name: test.name,
      statusCode,
      success: payload?.success,
      total: payload?.summary?.total,
      recommended: payload?.summary?.recommended,
      genericFiltered: payload?.summary?.generic_filtered,
      topCopy: top?.text,
      tags: top ? {
        desires: top.desires,
        anxieties: top.anxieties,
        triggers: top.triggers,
        sensory: top.sensory,
      } : undefined,
      finalScore: top?.finalScore,
      boringScore: top?.boringScore,
      topRecommended: top?.recommended,
      rewriteHint: top?.rewriteHint,
    }, null, 2));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
