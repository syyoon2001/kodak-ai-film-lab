import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.UI_BASE_URL || 'http://localhost:8080/';
const outputDirectory = resolve('artifacts', 'ui-checks');
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  window.__deliverScrollAudit = {
    maxWindowY: 0,
    maxContentScrollTop: 0,
    topBarFirst: null,
    topBarLast: null,
    lastScreen: null,
    transitions: []
  };
  setInterval(() => {
    const audit = window.__deliverScrollAudit;
    audit.maxWindowY = Math.max(audit.maxWindowY, window.scrollY);
    const activeScreen = document.querySelector('.screen.active')?.id || null;
    if (activeScreen && activeScreen !== audit.lastScreen) {
      audit.lastScreen = activeScreen;
      audit.transitions.push({ screen: activeScreen, at: performance.now() });
    }
    const screen = document.getElementById('screen-deliver');
    if (!screen?.classList.contains('active')) return;
    const content = screen.querySelector('.content');
    const topBar = screen.querySelector('.top-bar');
    audit.maxContentScrollTop = Math.max(audit.maxContentScrollTop, content.scrollTop);
    const rect = topBar.getBoundingClientRect().toJSON();
    audit.topBarFirst ||= rect;
    audit.topBarLast = rect;
  }, 25);
});

function collectErrors(page) {
  const diagnostics = { consoleErrors: [], httpErrors: [] };
  page.on('console', message => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
  });
  page.on('pageerror', error => diagnostics.consoleErrors.push(error.stack || error.message));
  page.on('response', response => {
    if (response.status() >= 400) diagnostics.httpErrors.push(`${response.status()} ${response.url()}`);
  });
  return diagnostics;
}

function assertNoUnexpectedErrors(diagnostics) {
  const optionalAiFallback = diagnostics.httpErrors.some(error => error.endsWith('/api/ai-develop'));
  const unexpectedHttpErrors = diagnostics.httpErrors.filter(error => !error.endsWith('/api/ai-develop'));
  const unexpectedConsoleErrors = diagnostics.consoleErrors.filter(error => !(
    optionalAiFallback && error.includes('Failed to load resource') && error.includes('404')
  ));
  assert.deepEqual(unexpectedHttpErrors, []);
  assert.deepEqual(unexpectedConsoleErrors, []);
}

try {
  const page = await context.newPage();
  const normalDiagnostics = collectErrors(page);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    showScreen('screen-deliver');
    document.querySelector('#screen-deliver .content').scrollTop = 100;
    showScreen('screen-deliver');
  });

  const entryScrollTop = await page.locator('#screen-deliver .content').evaluate(element => element.scrollTop);
  const topBarBefore = await page.locator('#screen-deliver .top-bar').boundingBox();
  const navBarBefore = await page.locator('#screen-deliver .nav-bar').boundingBox();
  await page.locator('.deliver-card[data-deliver="deliver"]').click();
  await page.waitForTimeout(1000);
  const regular = {
    windowScrollY: await page.evaluate(() => window.scrollY),
    entryScrollTop,
    contentScrollTop: await page.locator('#screen-deliver .content').evaluate(element => element.scrollTop),
    topBarBefore,
    topBarAfter: await page.locator('#screen-deliver .top-bar').boundingBox(),
    navBarBefore,
    navBarAfter: await page.locator('#screen-deliver .nav-bar').boundingBox(),
    diagnostics: normalDiagnostics
  };
  await page.screenshot({ path: resolve(outputDirectory, 'deliver-content-scroll.png'), fullPage: true });

  assert.equal(regular.windowScrollY, 0);
  assert.equal(regular.entryScrollTop, 0);
  assert.ok(regular.contentScrollTop > 0);
  assert.deepEqual(regular.topBarAfter, regular.topBarBefore);
  assert.deepEqual(regular.navBarAfter, regular.navBarBefore);
  assertNoUnexpectedErrors(regular.diagnostics);
  await page.close();

  const demoPage = await context.newPage();
  const demoDiagnostics = collectErrors(demoPage);
  await demoPage.goto(`${baseUrl}?demo=1`, { waitUntil: 'networkidle' });
  await demoPage.locator('#screen-done.active').waitFor({ state: 'visible', timeout: 60000 });
  const demo = await demoPage.evaluate(() => ({
    ...window.__deliverScrollAudit,
    finalWindowScrollY: window.scrollY,
    finalScreen: document.querySelector('.screen.active')?.id
  }));
  demo.durations = Object.fromEntries(demo.transitions.slice(0, -1).map((entry, index) => [
    entry.screen,
    Number(((demo.transitions[index + 1].at - entry.at) / 1000).toFixed(2))
  ]));
  demo.diagnostics = demoDiagnostics;
  await demoPage.screenshot({ path: resolve(outputDirectory, 'demo-flow-done.png'), fullPage: true });

  assert.equal(demo.maxWindowY, 0);
  assert.equal(demo.finalWindowScrollY, 0);
  assert.ok(demo.maxContentScrollTop > 0);
  assert.deepEqual(demo.topBarLast, demo.topBarFirst);
  assert.equal(demo.finalScreen, 'screen-done');
  console.log(JSON.stringify({ regular, demo }, null, 2));
  assertNoUnexpectedErrors(demo.diagnostics);
} finally {
  await browser.close();
}
