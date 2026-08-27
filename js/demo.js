// ===== AUTO DEMO MODE =====
// Pitch/presentation-only auto-run. Activates ONLY with ?demo=1 in the URL.
// Normal mode ("/") is never touched: this whole file early-returns below.
// To remove the demo entirely: delete this file and its <script> tag in index.html.
(function () {
  'use strict';

  // AUTO DEMO MODE — activation gate. No demo=1 => behave exactly like before.
  const params = new URLSearchParams(location.search);
  if (params.get('demo') !== '1') return;

  // AUTO DEMO MODE — self-contained runtime (no globals leak besides this IIFE).
  const DEMO = {
    samplePhoto: './assets/samples/couple.jpeg',
    cancelled: false,
    timers: [],
    started: false
  };

  function sleep(ms) {
    return new Promise((resolve) => {
      const id = setTimeout(resolve, ms);
      DEMO.timers.push(id);
    });
  }

  function clearTimers() {
    DEMO.timers.forEach(clearTimeout);
    DEMO.timers = [];
  }

  // AUTO DEMO MODE — minimal, brand-consistent press feedback (~300ms).
  // Injected as a scoped <style> so the existing style.css stays untouched.
  function injectPressStyle() {
    const style = document.createElement('style');
    style.id = 'demo-press-style';
    style.textContent =
      '.demo-press{transition:transform .12s ease,filter .12s ease;' +
      'transform:scale(.972);filter:brightness(1.06);}';
    document.head.appendChild(style);
  }

  async function pressFeedback(el, ms) {
    if (!el || DEMO.cancelled) return;
    el.classList.add('demo-press');
    await sleep(ms || 300);
    el.classList.remove('demo-press');
  }

  // Drive the REAL click handler (synthetic click => event.isTrusted === false,
  // which the abort listener ignores).
  async function tap(el, holdBefore) {
    if (DEMO.cancelled) return;
    if (holdBefore) await sleep(holdBefore);
    if (DEMO.cancelled || !el) return;
    await pressFeedback(el, 300);
    if (DEMO.cancelled || !el) return;
    el.click();
  }

  function isActive(id) {
    const el = document.getElementById(id);
    return !!(el && el.classList.contains('active'));
  }

  async function waitForScreen(id, timeoutMs) {
    const start = Date.now();
    const limit = timeoutMs || 8000;
    while (!DEMO.cancelled) {
      if (isActive(id)) return true;
      if (Date.now() - start > limit) return false;
      await sleep(120);
    }
    return false;
  }

  function setInput(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // AUTO DEMO MODE — abort on any REAL user interaction (touch/click/ESC),
  // then the kiosk returns to fully-manual normal operation.
  function cancelDemo() {
    if (DEMO.cancelled) return;
    DEMO.cancelled = true;
    clearTimers();
    document.querySelectorAll('.demo-press').forEach((el) => el.classList.remove('demo-press'));
  }

  function onUserAbort(e) {
    if (e && e.isTrusted === false) return; // ignore our own synthetic events
    cancelDemo();
  }

  function armAbort() {
    window.addEventListener('pointerdown', onUserAbort, true);
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') cancelDemo();
    }, true);
  }

  // AUTO DEMO MODE — one full order, ~37s, driven through real app handlers.
  async function runAutoDemo() {
    if (DEMO.started) return;
    DEMO.started = true;

    // Scene 01 — MAIN (brand recognition)
    await sleep(2700);
    if (DEMO.cancelled) return;

    // Scene 02 — PRODUCT: enter and choose the T-shirt
    await tap(document.getElementById('welcome-start'));
    if (!(await waitForScreen('screen-capture'))) return;
    await sleep(1700);
    await tap(document.querySelector('.output-card[data-output="tshirt"]'));
    await sleep(1700);

    // Scene 03 — CAPTURE: show the QR panel, then receive the sample photo
    await tap(document.getElementById('product-next'));
    if (!(await waitForScreen('screen-choose'))) return;
    await sleep(2000);
    if (DEMO.cancelled) return;
    // Inject the sample photo exactly like a real mobile upload would.
    try { clearInterval(mobileUploadRuntime.pollTimer); mobileUploadRuntime.pollTimer = null; } catch (_) {}
    state.photoPath = DEMO.samplePhoto;
    state.photoSourceType = 'mobile';
    state.artworkVariants = [];
    state.selectedArtwork = null;
    state.resultIndex = null;
    state.aiImagePath = null;
    state.capturedAt = new Date();
    const captureNext = document.getElementById('capture-next');
    captureNext.disabled = false;
    const qrStatus = document.getElementById('qr-status');
    if (qrStatus) qrStatus.textContent = '사진을 받았습니다. 다음을 눌러 사진을 확인하세요.';
    await sleep(1200);

    // Scene 03b — PHOTO REVIEW
    await tap(captureNext);
    if (!(await waitForScreen('screen-photo-confirm'))) return;
    await sleep(3200);
    await tap(document.getElementById('photo-confirm-next'));

    // Scene 04 — DESIGN: pick a frame
    if (!(await waitForScreen('screen-pick'))) return;
    await sleep(1700);
    await tap(document.querySelector('.style-card[data-style="film-frame"]'));
    await sleep(1700);

    // Scene 05 — DEVELOP: real film-develop animation auto-advances to PRINT
    await tap(document.getElementById('pick-next'));
    // Develop runs a fixed ~4.3s film animation; 20s is a generous safety margin.
    if (!(await waitForScreen('screen-print', 20000))) return;

    // Scene 06 — PRINT (the money shot): photo now printed on the T-shirt.
    await sleep(2400);
    // Demonstrate live customisation with one garment-colour change.
    await tap(document.querySelector('.color-swatch[data-color="black"]'));
    await sleep(2000);
    await tap(document.getElementById('print-next'));

    // Scene 07 — DELIVER: send the moment abroad via DHL
    if (!(await waitForScreen('screen-deliver'))) return;
    await sleep(1800);
    await tap(document.querySelector('.deliver-card[data-deliver="deliver"]'));
    await sleep(1200); // let the DHL form open + settle
    if (DEMO.cancelled) return;
    setInput('dhl-country', 'JAPAN');
    await sleep(350);
    setInput('dhl-name', 'YUI SATO');
    await sleep(350);
    setInput('dhl-address', 'Shibuya, Tokyo, Japan');
    await sleep(1700);
    await tap(document.getElementById('deliver-next'));

    // Scene 08 — FINAL HOLD: stop on the completion screen (no loop, no reset).
    if (!(await waitForScreen('screen-done'))) return;
    await sleep(2000);
    // End. The kiosk stays on the DONE screen for easy recording cut-off.
  }

  function start() {
    injectPressStyle();
    armAbort();
    // Small settle delay so fonts/QR/layout are ready before the first move.
    const id = setTimeout(runAutoDemo, 500);
    DEMO.timers.push(id);
  }

  if (document.readyState === 'complete') {
    start();
  } else {
    window.addEventListener('load', start, { once: true });
  }
})();
