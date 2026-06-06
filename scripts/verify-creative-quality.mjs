import { build } from 'esbuild';
import { pathToFileURL } from 'url';
import { mkdir, rm } from 'fs/promises';
import path from 'path';

const outDir = path.resolve('.tmp-creative-quality');
const outFile = path.join(outDir, 'creativeContext.mjs');

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS ${message}`);
  }
}

await mkdir(outDir, { recursive: true });
await build({
  entryPoints: ['src/lib/conversation-os/creativeContext.ts'],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  outfile: outFile,
  logLevel: 'silent',
});

const {
  buildDeterministicCreativeCards,
  cardsToCreativeStudioCopies,
  resolveCreativeContextGuard,
} = await import(pathToFileURL(outFile).href);

const context = {
  productKeyword: 'peach',
  category: 'agri_food',
  source: 'explicit_user_keyword',
  confidence: 0.98,
  forbiddenStaleKeywords: ['coffee', 'cafe', 'espresso'],
  basis: 'verification explicit product context',
};
const cards = buildDeterministicCreativeCards(context, 5);
const copies = cardsToCreativeStudioCopies(cards);
const allText = JSON.stringify({ cards, copies }).toLowerCase();
const angles = new Set(cards.map(card => card.angle));

assert(cards.length === 5, 'five deterministic creative cards are generated');
assert(copies.length === 5, 'five CreativeStudio copy cards are generated');
assert(angles.size >= 4, 'creative cards use multiple angles');
assert(cards.every(card => card.productKeyword === 'peach'), 'cards preserve explicit product context');
assert(!/(coffee|cafe|espresso)/i.test(allText), 'stale coffee context is not injected');
assert(cards.every(card => Number(card.score) >= 70), 'cards have usable quality scores');
assert(copies.every(copy => copy.headline && copy.body && copy.finalScore), 'CreativeStudio copy fields are complete');

const fallback = resolveCreativeContextGuard({ userText: 'make five reels scripts for peach' });
assert(fallback.productKeyword, 'context guard returns a product keyword or fallback');
assert(Array.isArray(fallback.forbiddenStaleKeywords), 'context guard carries stale keyword guard');

await rm(outDir, { recursive: true, force: true });
