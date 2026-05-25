import type { CopyPerformanceMemory } from './humanDesireTypes';

export type CopyPerformanceSummary = {
  winningPatterns: string[];
  losingPatterns: string[];
  recommendedHookTypes: string[];
  avoidPatterns: string[];
};

export async function readCopyPerformanceMemory(): Promise<CopyPerformanceMemory[]> {
  return [];
}

export function summarizePerformancePatterns(memory: CopyPerformanceMemory[]): CopyPerformanceSummary {
  const won = memory.filter(item => item.resultLabel === 'won');
  const lost = memory.filter(item => item.resultLabel === 'lost');

  return {
    winningPatterns: won
      .map(item => item.whyWorked || item.copyText)
      .filter(Boolean)
      .slice(0, 5),
    losingPatterns: lost
      .map(item => item.whyFailed || item.copyText)
      .filter(Boolean)
      .slice(0, 5),
    recommendedHookTypes: inferHookTypes(won.map(item => item.copyText)),
    avoidPatterns: inferHookTypes(lost.map(item => item.copyText)),
  };
}

function inferHookTypes(texts: string[]): string[] {
  const joined = texts.join('\n');
  const hooks: string[] = [];
  if (/향|냄새|아삭|쫀득|과즙|달큰/.test(joined)) hooks.push('sensory_hook');
  if (/파|vs|화해|취향|갈린/.test(joined)) hooks.push('identity_conflict');
  if (/선물|부모님|명절/.test(joined)) hooks.push('gift_anxiety');
  if (/제철|끝물|시즌|김장/.test(joined)) hooks.push('seasonal_timing');
  return [...new Set(hooks)].slice(0, 5);
}
