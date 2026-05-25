import { chromium } from 'playwright';

const BASE_URL = process.env.JARVIS_PROD_URL || 'https://mawinpay-jarvis.vercel.app/';
const COMMAND = process.env.JARVIS_COPY_COMMAND || '복숭아 헤드카피 20개 만들어줘';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(3_000);

    const openButton = page.getByTestId('jarvis-command-open');
    await openButton.waitFor({ state: 'visible', timeout: 20_000 });
    await openButton.click();

    const input = page.getByTestId('jarvis-command-input');
    await input.waitFor({ state: 'visible', timeout: 10_000 });
    await input.fill(COMMAND);
    await page.getByTestId('jarvis-command-submit').click();

    const card = page.getByTestId('copy-card').first();
    await card.waitFor({ state: 'visible', timeout: 90_000 });

    const cardCount = await page.getByTestId('copy-card').count();
    const hasFields = await page.getByTestId('copy-card-human-desire-fields').first().isVisible().catch(() => false);
    const scoreVisible = await page.getByTestId('copy-card-score').first().isVisible().catch(() => false);
    const executeLocked = (await page.locator('body').textContent({ timeout: 5_000 }) || '').includes('EXECUTE LOCKED');

    await card.click();
    await page.waitForTimeout(5_000);

    const dialogueText = (await page.getByTestId('jarvis-dialogue-message').last().textContent({ timeout: 20_000 }) || '').trim();
    const contextual = /욕구|불안|플랫폼|추천|카피|desire|anxiety|platform|copy/i.test(dialogueText);

    await page.screenshot({ path: 'artifacts/production-copy-ui.png', fullPage: true }).catch(() => undefined);

    const result = {
      success: cardCount > 0 && hasFields && scoreVisible && executeLocked && contextual,
      url: BASE_URL,
      command: COMMAND,
      cardCount,
      hasHumanDesireFields: hasFields,
      scoreVisible,
      executeLocked,
      contextualDialogue: contextual,
      dialoguePreview: dialogueText.slice(0, 180),
    };

    console.log(JSON.stringify(result, null, 2));
    if (!result.success) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
