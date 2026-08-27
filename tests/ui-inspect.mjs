import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.UI_BASE_URL || 'http://localhost:8080/';
const labelIndex = process.argv.indexOf('--label');
const label = labelIndex >= 0 && process.argv[labelIndex + 1]
  ? process.argv[labelIndex + 1].replace(/[^a-z0-9_-]/gi, '-')
  : new Date().toISOString().replace(/[:.]/g, '-');
const outputDirectory = resolve('artifacts', 'ui-checks');
const products = ['tshirt', 'hoodie', 'tumbler'];
const selectors = [
  '.screen.active',
  '#product-mockup',
  '.asset-product-mockup',
  '.product-mockup-image',
  '.mockup-photo-replacement'
];

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const consoleErrors = [];

page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', error => consoleErrors.push(error.stack || error.message));

try {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof showScreen === 'function' && typeof updatePrintPreview === 'function');

  const hostname = await page.evaluate(() => location.hostname);
  const results = [];

  for (const product of products) {
    await page.evaluate(selectedProduct => {
      state.output = selectedProduct;
      state.style = 'film-frame';
      state.photoPath = './assets/samples/family.jpeg';
      state.tshirtColor = 'cream';
      state.artworkVariants = createArtworkVariants([]);
      state.resultIndex = 0;
      state.selectedArtwork = state.artworkVariants[0];
      updatePrintPreview();
      showScreen('screen-print');
    }, product);

    await page.waitForFunction(() => {
      const images = [...document.querySelectorAll('#product-mockup img')];
      return images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0);
    });

    const boundingBoxes = {};
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      boundingBoxes[selector] = await locator.count() ? await locator.boundingBox() : null;
    }

    const screenshot = resolve(outputDirectory, `${label}-${product}-print.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    results.push({ product, boundingBoxes, screenshot });
  }

  console.log(JSON.stringify({
    url: page.url(),
    hostname,
    viewport: page.viewportSize(),
    consoleErrors,
    results
  }, null, 2));

  if (consoleErrors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
