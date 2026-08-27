import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.UI_BASE_URL || 'http://localhost:8080/';
const outputDirectory = resolve('artifacts', 'mockup-transition');
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
for (const mode of ['regular', 'demo']) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: outputDirectory, size: { width: 1280, height: 800 } }
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}${mode === 'demo' ? '?demo=1' : ''}`, { waitUntil: 'networkidle' });
  if (mode === 'demo') await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown')));
  await page.evaluate(() => {
    state.output = 'tshirt';
    state.style = 'film-frame';
    state.tshirtColor = 'cream';
    state.artworkVariants = createArtworkVariants([]);
    state.selectedArtwork = state.artworkVariants[0];
    showScreen('screen-print');
    updatePrintPreview();
  });
  await page.locator('#product-mockup .product-mockup-image').waitFor({ state: 'visible' });
  await page.screenshot({ path: resolve(outputDirectory, `${mode}-before.png`) });

  await page.locator('.color-swatch[data-color="black"]').click();
  const samples = [];
  for (let frame = 0; frame < 30; frame += 1) {
    samples.push(await page.evaluate(() => {
      const shells = [...document.querySelectorAll('#product-mockup .asset-product-mockup')];
      return shells.some(shell => {
        const image = shell.querySelector('.product-mockup-image');
        const style = getComputedStyle(shell);
        return image?.complete && image.naturalWidth > 0 && style.visibility !== 'hidden' && Number(style.opacity) > 0;
      });
    }));
    if (frame === 8) await page.screenshot({ path: resolve(outputDirectory, `${mode}-during.png`) });
    await page.waitForTimeout(16);
  }
  assert.ok(samples.every(Boolean), `${mode} transition contained a blank frame`);
  await page.screenshot({ path: resolve(outputDirectory, `${mode}-after.png`) });
  await page.close();
  await context.close();
}
await browser.close();
console.log('No blank mockup frames detected in regular or demo transitions.');
