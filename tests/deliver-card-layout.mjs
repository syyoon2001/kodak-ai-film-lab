import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const measureOnly = process.argv.includes('--measure');
const outputDirectory = resolve('artifacts', 'ui-checks');
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });

try {
  await page.goto(process.env.UI_BASE_URL || 'http://localhost:8080/', { waitUntil: 'networkidle' });
  await page.evaluate(() => showScreen('screen-deliver'));
  const cards = page.locator('#screen-deliver .deliver-card');
  const before = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()]);
  const navBefore = await page.locator('#screen-deliver .nav-bar').boundingBox();
  await page.screenshot({ path: resolve(outputDirectory, 'deliver-cards-before.png'), fullPage: true });

  await cards.nth(1).click();
  await page.waitForTimeout(1000);
  const after = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()]);
  const navAfter = await page.locator('#screen-deliver .nav-bar').boundingBox();
  await page.screenshot({ path: resolve(outputDirectory, 'deliver-cards-after.png'), fullPage: true });

  const result = { before, after, navBefore, navAfter, windowScrollY: await page.evaluate(() => window.scrollY), consoleErrors };
  console.log(JSON.stringify(result, null, 2));

  if (!measureOnly) {
    const size = box => ({ width: box.width, height: box.height });
    assert.deepEqual(size(before[0]), size(before[1]));
    assert.deepEqual(size(after[0]), size(after[1]));
    assert.deepEqual(after.map(size), before.map(size));
    assert.ok(before.every(box => box.y + box.height <= navBefore.y));
    assert.deepEqual(navAfter, navBefore);
    assert.equal(result.windowScrollY, 0);
    assert.deepEqual(consoleErrors, []);
  }
} finally {
  await browser.close();
}
