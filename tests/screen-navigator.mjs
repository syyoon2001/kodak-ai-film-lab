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

for (const [screenId] of expected) {
  const button = panel.locator(`button[data-screen="${screenId}"]`);
  await button.click();
  await page.locator(`#${screenId}.active`).waitFor({ state: 'visible' });
  assert.ok(await button.evaluate(element => element.classList.contains('active')));
}

const previewScreens = [
  ['screen-choose', '#upload-qr'],
  ['screen-photo-confirm', '#photo-confirm-image'],
  ['screen-pick', '.garment-design-example'],
  ['screen-develop', '.develop-container'],
  ['screen-print', '#product-mockup img'],
  ['screen-deliver', '.deliver-grid'],
  ['screen-done', '#done-order-number']
];

for (const [screenId, requiredContent] of previewScreens) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator(`#dev-screen-navigator button[data-screen="${screenId}"]`).click();
  await page.locator(`#${screenId}.active`).waitFor({ state: 'visible' });
  const content = page.locator(`#${screenId} ${requiredContent}`);
  await content.first().waitFor({ state: 'visible' });
  const brokenImages = await page.locator(`#${screenId} img:visible`).evaluateAll(images =>
    images.filter(image => !image.complete || image.naturalWidth === 0).map(image => image.id || image.alt)
  );
  assert.deepEqual(brokenImages, [], `${screenId} contains broken images`);
}

await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.locator('#dev-screen-navigator button[data-screen="screen-done"]').click();
assert.equal(await page.evaluate(() => state.photoPath), './assets/samples/family.jpeg');
assert.ok(await page.evaluate(() => state.selectedArtwork?.imagePath === state.photoPath));
assert.notEqual(await page.locator('#done-order-number').textContent(), 'K-000000');

await page.goto(`${baseUrl}?demo=1`, { waitUntil: 'domcontentloaded' });
assert.equal(await page.locator('#dev-screen-navigator').count(), 0);

await browser.close();
console.log('Screen Navigator verified on / and hidden on /?demo=1; all screen buttons work.');
