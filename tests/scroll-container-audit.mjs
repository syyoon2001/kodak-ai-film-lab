import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.UI_BASE_URL || 'http://localhost:8080/';
const outputDirectory = resolve('artifacts', 'scrollbar-audit');
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(baseUrl, { waitUntil: 'networkidle' });

for (const screenId of ['screen-deliver', 'screen-done']) {
  await page.evaluate(id => showScreen(id), screenId);
  await page.waitForTimeout(100);
  const audit = await page.evaluate(id => {
    const screen = document.getElementById(id);
    const candidates = [document.scrollingElement, screen, ...screen.querySelectorAll('*')];
    return candidates.map((element, index) => {
      const style = getComputedStyle(element);
      const webkit = getComputedStyle(element, '::-webkit-scrollbar');
      return {
        target: index === 0 ? 'document.scrollingElement' :
          element.id ? `#${element.id}` :
          `${element.tagName.toLowerCase()}${[...element.classList].map(name => `.${name}`).join('')}`,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        overflowY: style.overflowY,
        scrollbarWidth: style.scrollbarWidth,
        webkitWidth: webkit.width,
        webkitDisplay: webkit.display,
        scrollable: element.scrollHeight > element.clientHeight && ['auto', 'scroll'].includes(style.overflowY)
      };
    }).filter(item => item.target === 'document.scrollingElement' || item.target === `#${id}` ||
      item.target.includes('.content') || item.target.includes('wrapper') || item.scrollable);
  }, screenId);

  console.log(JSON.stringify({ screenId, audit }, null, 2));
  await page.screenshot({ path: resolve(outputDirectory, `${screenId}-before.png`), fullPage: true });
}

await browser.close();
