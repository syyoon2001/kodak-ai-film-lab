import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, firefox } from '@playwright/test';

const baseUrl = process.env.UI_BASE_URL || 'http://localhost:8080/';
const screenIds = ['screen-deliver', 'screen-done'];
const outputDirectory = resolve('artifacts', 'scrollbar-audit');
await mkdir(outputDirectory, { recursive: true });

for (const [browserName, browserType] of Object.entries({ chromium, firefox })) {
  const browser = await browserType.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 480 } });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  for (const screenId of screenIds) {
    await page.evaluate(id => showScreen(id), screenId);
    if (screenId === 'screen-deliver') {
      await page.locator('.deliver-card[data-deliver="deliver"]').click();
    }
    const result = await page.evaluate((id) => {
      const screen = document.getElementById(id);
      const content = screen.querySelector('.content');
      content.scrollTop = 200;

      const styles = getComputedStyle(content);
      const webkitScrollbar = getComputedStyle(content, '::-webkit-scrollbar');
      const audit = {
        scrollTop: content.scrollTop,
        overflowY: styles.overflowY,
        scrollbarWidth: styles.scrollbarWidth,
        webkitWidth: webkitScrollbar.width
      };
      return audit;
    }, screenId);

    assert.ok(result.scrollTop > 0, `${browserName} ${screenId} did not scroll`);
    assert.equal(result.overflowY, 'auto', `${browserName} ${screenId} lost scrolling`);
    if (browserName === 'firefox') {
      assert.equal(result.scrollbarWidth, 'none', `${browserName} ${screenId} scrollbar is visible`);
    } else {
      assert.equal(result.webkitWidth, '0px', `${browserName} ${screenId} scrollbar is visible`);
    }
    await page.screenshot({ path: resolve(outputDirectory, `${browserName}-${screenId}-after.png`) });
  }

  await browser.close();
}

console.log('Scrollbar visibility and scrolling verified in Chromium and Firefox.');
