import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const baseUrl = process.env.UI_BASE_URL || 'http://localhost:8080/';
const expected = [
  ['screen-welcome', 'WELCOME'],
  ['screen-capture', 'PRODUCT'],
  ['screen-choose', 'CAPTURE'],
  ['screen-photo-confirm', 'PHOTO REVIEW'],
  ['screen-pick', 'DESIGN'],
  ['screen-develop', 'DEVELOP'],
  ['screen-print', 'PRINT'],
  ['screen-deliver', 'DELIVER'],
  ['screen-done', 'DONE']
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto(baseUrl, { waitUntil: 'networkidle' });
const panel = page.locator('#dev-screen-navigator');
await panel.waitFor({ state: 'visible' });
assert.deepEqual(await panel.locator('button').allTextContents(), expected.map(([, label]) => label));

const stateBefore = await page.evaluate(() => JSON.stringify(state));
for (const [screenId] of expected) {
  const button = panel.locator(`button[data-screen="${screenId}"]`);
  await button.click();
  await page.locator(`#${screenId}.active`).waitFor({ state: 'visible' });
  assert.ok(await button.evaluate(element => element.classList.contains('active')));
}
assert.equal(await page.evaluate(() => JSON.stringify(state)), stateBefore);

await page.goto(`${baseUrl}?demo=1`, { waitUntil: 'domcontentloaded' });
assert.equal(await page.locator('#dev-screen-navigator').count(), 0);

await browser.close();
console.log('Screen Navigator verified on / and hidden on /?demo=1; all screen buttons work.');
