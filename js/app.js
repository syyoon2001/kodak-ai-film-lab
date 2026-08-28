// ===== KODAK AI FILM LAB — Kiosk App =====

const state = {
  step: 1,
  photoPath: null,
  style: null,
  output: null,
  resultIndex: null,
  message: null,
  tshirtColor: 'cream',
  tshirtSize: 'M',
  quantity: 1,
  aiImagePath: null,
  deliver: null,
  dhl: { country: '', name: '', address: '' },
  frameNo: Math.floor(Math.random() * 36) + 1,
  capturedAt: new Date(),
  artworkVariants: [],
  selectedArtwork: null,
  photoSourceType: null,
  orderNo: null
};

const DEVELOP_TIMEOUT_MS = 6000;
const API_BASE = location.protocol === 'file:' ? 'http://127.0.0.1:8080' : '';
const IMAGE_PLACEHOLDER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
    <rect width="800" height="600" fill="#1a1a1a"/>
    <rect y="510" width="800" height="90" fill="#FFB700"/>
    <text x="400" y="285" text-anchor="middle" fill="#FFB700" font-family="Arial, sans-serif" font-size="42" font-weight="700">KODAK MOMENT</text>
    <text x="400" y="340" text-anchor="middle" fill="#999999" font-family="Arial, sans-serif" font-size="22">IMAGE UNAVAILABLE</text>
  </svg>`)}`;
const PREVIEW_QR = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29" shape-rendering="crispEdges">
    <rect width="29" height="29" fill="#fff"/>
    <path fill="#171717" d="M2 2h7v7H2zm2 2v3h3V4zM20 2h7v7h-7zm2 2v3h3V4zM2 20h7v7H2zm2 2v3h3v-3zM11 2h2v2h-2zm4 0h3v2h-3zm-4 5h2v3h-2zm4-2h2v2h-2zm3 4h2v3h-2zm-7 3h3v2h-3zm5 1h2v4h-2zm4 1h7v2h-7zm-9 3h3v3h-3zm5 2h3v2h-3zm5-1h2v3h-2zm4 1h2v2h-2zm-15 4h2v4h-2zm4-1h3v2h-3zm4 3h3v2h-3zm4-2h5v2h-5z"/>
  </svg>`)}`;

const developRuntime = {
  sessionId: 0,
  controller: null,
  timers: new Set(),
  developing: false
};

const mobileUploadRuntime = {
  session: null,
  pollTimer: null
};

function formatKodakDate(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit', month: 'short', year: 'numeric'
  }).formatToParts(date);
  const value = type => parts.find(part => part.type === type)?.value || '';
  return `${value('day')} ${value('month').toUpperCase()} ${value('year')}`;
}

function getKodakDate() {
  return formatKodakDate(state.capturedAt);
}

function createOrderNumber() {
  const date = new Date();
  const datePart = [
    String(date.getFullYear()).slice(-2),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('');
  const sequence = String(Math.floor(Math.random() * 900) + 100);
  return `K-${datePart}-${sequence}`;
}

function setSafeImageSource(img, primary, secondary = null) {
  const sources = [...new Set([primary, secondary, IMAGE_PLACEHOLDER].filter(Boolean))];
  let index = 0;
  img.onerror = () => {
    index += 1;
    if (index >= sources.length) {
      img.onerror = null;
      img.src = IMAGE_PLACEHOLDER;
      return;
    }
    img.src = sources[index];
  };
  img.src = sources[0] || IMAGE_PLACEHOLDER;
}

function clearDevelopTimers() {
  developRuntime.timers.forEach(timer => {
    clearTimeout(timer);
    clearInterval(timer);
  });
  developRuntime.timers.clear();
}

function cancelDeveloping() {
  developRuntime.sessionId += 1;
  developRuntime.developing = false;
  if (developRuntime.controller) developRuntime.controller.abort();
  developRuntime.controller = null;
  clearDevelopTimers();
}

function isCurrentDevelopSession(sessionId) {
  return developRuntime.developing && developRuntime.sessionId === sessionId;
}

const STYLES = {
  'colorama': { name: 'OUR MOMENT', bg: '#171715', text: '#d99526' },
  'film-frame': { name: 'PORTRA 400', bg: '#f4ecdd', text: '#171717' },
  'kodak-archive': { name: 'KODAK 400', bg: '#FFB700', text: '#171717' }
};

const ARTWORK_FAMILIES = {
  portra: {
    title: 'KODAK', stock: 'PORTRA 400 · PROFESSIONAL FILM', city: 'SEOUL, KOREA',
    copy: 'DELIVER THE MOMENT'
  },
  travel: {
    title: 'SEOUL', stock: 'TRAVEL EDITION · KODAK MOMENT', city: 'KOREA',
    copy: 'A MOMENT FROM SEOUL'
  },
  colorama: {
    title: 'OUR MOMENT', stock: 'KODAK FILM · TRAVEL MOMENT', city: 'SEOUL, KOREA',
    copy: 'DELIVER THE MOMENT'
  },
  archive: {
    title: 'KODAK', stock: '36 EXP. · KODAK 400', city: 'MOMENT · 2026',
    copy: 'DELIVER THE MOMENT'
  }
};

const STYLE_VARIANT_ORDER = {
  'colorama': ['colorama', 'colorama', 'colorama'],
  'film-frame': ['portra', 'portra', 'portra'],
  'kodak-archive': ['archive', 'archive', 'archive']
};

const MOCKUP_FAMILY_BY_STYLE = {
  colorama: 'colorama',
  'film-frame': 'portra',
  'kodak-archive': 'archive'
};

function getMockupFamily() {
  return (state.selectedArtwork && state.selectedArtwork.family) ||
    MOCKUP_FAMILY_BY_STYLE[state.style] || 'portra';
}

function createArtworkVariants(aiResults = []) {
  const families = STYLE_VARIANT_ORDER[state.style] || STYLE_VARIANT_ORDER['film-frame'];
  const capturedPhotoPath = state.photoPath;
  return families.map((family, index) => {
    const aiResult = aiResults[index] || null;
    const base = ARTWORK_FAMILIES[family];
    return {
      id: `${family}-${index + 1}`,
      family,
      label: `${base.title} / ${base.stock.split(' · ')[0]}`,
      imagePath: aiResult ? aiResult.path : capturedPhotoPath,
      fallbackImagePath: capturedPhotoPath,
      source: aiResult ? 'ai' : 'fallback',
      metadata: {
        title: base.title,
        stock: base.stock,
        city: base.city,
        copy: base.copy,
        frame: String(state.frameNo).padStart(3, '0'),
        date: getKodakDate(),
        exposure: `ISO 400 · 1/125 · F8`,
        delivery: 'SEOUL / POP-UP EDITION'
      }
    };
  });
}

function renderArtwork(container, variant, context = 'pick', garmentColor = 'cream') {
  container.innerHTML = '';
  const artwork = document.createElement('div');
  artwork.className = `artwork artwork--${variant.family} artwork--${context} artwork--garment-${garmentColor}`;

  const header = document.createElement('div');
  header.className = 'artwork-header';
  const title = document.createElement('div');
  title.className = 'artwork-title';
  title.textContent = variant.metadata.title;
  const stock = document.createElement('div');
  stock.className = 'artwork-stock';
  stock.textContent = variant.metadata.stock;
  header.append(title, stock);

  const photo = document.createElement('div');
  photo.className = 'artwork-photo';
  const image = document.createElement('img');
  image.alt = `${variant.metadata.title} artwork`;
  setSafeImageSource(image, variant.imagePath, variant.fallbackImagePath);
  const frameMark = document.createElement('div');
  frameMark.className = 'artwork-frame-mark';
  frameMark.textContent = `FRAME ${variant.metadata.frame}`;
  photo.append(image, frameMark);

  const sidebar = document.createElement('div');
  sidebar.className = 'artwork-sidebar';
  const sidebarCopy = document.createElement('div');
  sidebarCopy.className = 'artwork-copy';
  sidebarCopy.textContent = state.message && state.message !== 'no-msg' ? state.message : variant.metadata.copy;
  const sidebarMeta = document.createElement('div');
  sidebarMeta.className = 'artwork-meta';
  sidebarMeta.textContent = `${variant.metadata.city} · ${variant.metadata.date}`;
  sidebar.append(sidebarCopy, sidebarMeta);

  const footer = document.createElement('div');
  footer.className = 'artwork-footer';
  const technical = document.createElement('div');
  technical.className = 'artwork-meta';
  technical.textContent = variant.metadata.exposure;
  const destination = document.createElement('div');
  destination.className = 'artwork-copy';
  destination.textContent = variant.metadata.delivery;
  footer.append(technical, destination);

  const shippingLabel = document.createElement('div');
  shippingLabel.className = 'artwork-shipping-label';
  const shippingCode = document.createElement('div');
  shippingCode.className = 'artwork-shipping-code';
  shippingCode.textContent = 'MOMENT DELIVERY';
  const shippingMeta = document.createElement('div');
  shippingMeta.className = 'artwork-shipping-meta';
  shippingMeta.textContent = `KOD-AT-DHL · ${variant.metadata.frame}`;
  const barcode = document.createElement('div');
  barcode.className = 'artwork-barcode';
  shippingLabel.append(shippingCode, shippingMeta, barcode);

  artwork.append(header, photo, sidebar, footer, shippingLabel);
  container.appendChild(artwork);
}

// ===== Screen Navigation =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(id);
  screen.classList.add('active');
  if (id === 'screen-deliver') screen.querySelector('.content').scrollTop = 0;
}

function goBack() {
  const map = {
    'screen-capture': 'screen-welcome',
    'screen-choose': 'screen-capture',
    'screen-photo-confirm': 'screen-choose',
    'screen-pick': 'screen-photo-confirm',
    'screen-develop': 'screen-pick',
    'screen-print': 'screen-pick',
    'screen-deliver': 'screen-print'
  };
  const current = document.querySelector('.screen.active').id;
  if (current === 'screen-develop') {
    cancelDeveloping();
    checkDesignNext();
  }
  if (current === 'screen-print' && state.output === 'tumbler') {
    showScreen('screen-capture');
    return;
  }
  if (current === 'screen-print') checkDesignNext();
  if (map[current]) showScreen(map[current]);
}

document.getElementById('welcome-start').onclick = () => {
  showScreen('screen-capture');
};

// ===== 01 PRODUCT =====
document.querySelectorAll('.output-card').forEach(card => {
  card.onclick = () => {
    document.querySelectorAll('.output-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    state.output = card.dataset.output;
    document.getElementById('product-next').disabled = false;
  };
});

document.getElementById('product-next').onclick = () => {
  if (state.output === 'tumbler') {
    state.tshirtColor = 'cream';
    state.selectedArtwork = null;
    state.resultIndex = null;
    updatePrintPreview();
    showScreen('screen-print');
    return;
  }
  showScreen('screen-choose');
  initializeMobileUpload();
};

// ===== 02 CAPTURE =====
function resetPhotoForReupload() {
  clearInterval(mobileUploadRuntime.pollTimer);
  mobileUploadRuntime.pollTimer = null;
  mobileUploadRuntime.session = null;
  if (state.photoPath && state.photoPath.startsWith('blob:')) URL.revokeObjectURL(state.photoPath);
  state.photoPath = null;
  state.photoSourceType = null;
  state.artworkVariants = [];
  state.selectedArtwork = null;
  state.resultIndex = null;
  state.aiImagePath = null;
  state.capturedAt = new Date();
  document.getElementById('capture-next').disabled = true;
  document.getElementById('upload-qr').removeAttribute('src');
  document.getElementById('qr-status').textContent = 'QR 연결 준비 중...';
}

document.getElementById('capture-next').onclick = () => {
  clearInterval(mobileUploadRuntime.pollTimer);
  mobileUploadRuntime.pollTimer = null;
  const confirmImage = document.getElementById('photo-confirm-image');
  setSafeImageSource(confirmImage, state.photoPath, './assets/samples/family.jpeg');
  document.getElementById('photo-confirm-date').textContent = `SEOUL · ${getKodakDate()}`;
  showScreen('screen-photo-confirm');
};

document.getElementById('photo-confirm-back').onclick = () => {
  resetPhotoForReupload();
  showScreen('screen-choose');
  initializeMobileUpload();
};

document.getElementById('photo-confirm-next').onclick = () => {
  updateDesignProductExamples();
  showScreen('screen-pick');
};

function updateDesignProductExamples() {
  const product = state.output === 'hoodie' ? 'hoodie' : 'tshirt';
  document.querySelectorAll('.garment-design-example').forEach(image => {
    const color = image.dataset.exampleColor;
    const style = image.closest('.style-card').dataset.style;
    const family = MOCKUP_FAMILY_BY_STYLE[style] || 'portra';
    setSafeImageSource(image, `./assets/mockups/lineup/${product}-${family}-${color}.png`);
  });
  const productName = product === 'hoodie' ? '후드티' : '티셔츠';
  document.querySelector('#screen-pick .screen-sub').textContent = `${productName}에 실제로 인쇄되는 프레임 디자인 3종 중 하나를 선택하세요. 색상은 프리뷰에서 선택합니다.`;
}

async function initializeMobileUpload() {
  clearInterval(mobileUploadRuntime.pollTimer);
  mobileUploadRuntime.pollTimer = null;
  const qr = document.getElementById('upload-qr');
  const status = document.getElementById('qr-status');
  try {
    const response = await fetch(`${API_BASE}/api/upload-session`, { cache: 'no-store' });
    if (!response.ok) throw new Error('QR upload server unavailable');
    const data = await response.json();
    mobileUploadRuntime.session = data.session;
    qr.src = `${API_BASE}${data.qrPath}`;
    qr.hidden = false;
    status.textContent = 'QR을 스캔하고 휴대폰에서 사진을 선택하세요.';
    mobileUploadRuntime.pollTimer = setInterval(pollMobileUpload, 1200);
  } catch (_) {
    qr.hidden = true;
    status.textContent = 'QR 전송은 서버 링크로 접속했을 때 사용할 수 있습니다.';
  }
}

async function pollMobileUpload() {
  if (!mobileUploadRuntime.session) return;
  try {
    const response = await fetch(`${API_BASE}/api/mobile-upload/status?session=${encodeURIComponent(mobileUploadRuntime.session)}`, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    if (!data.ready || !data.path) return;
    clearInterval(mobileUploadRuntime.pollTimer);
    mobileUploadRuntime.pollTimer = null;
    state.photoPath = /^https?:\/\//i.test(data.path) ? data.path : `${API_BASE}${data.path}`;
    state.photoSourceType = 'mobile';
    state.artworkVariants = [];
    state.selectedArtwork = null;
    state.resultIndex = null;
    state.aiImagePath = null;
    state.capturedAt = new Date();
    document.getElementById('capture-next').disabled = false;
    document.getElementById('qr-status').textContent = '사진을 받았습니다. 다음을 눌러 사진을 확인하세요.';
  } catch (_) {
    // Temporary polling failures never interrupt the kiosk.
  }
}

// ===== 03 DESIGN =====
document.querySelectorAll('.style-card').forEach(card => {
  card.onclick = () => {
    document.querySelectorAll('.style-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    state.style = card.dataset.style;
    checkDesignNext();
  };
});

function checkDesignNext() {
  document.getElementById('pick-next').disabled = !state.style;
}

document.getElementById('pick-next').onclick = () => {
  showScreen('screen-develop');
  startDeveloping();
};

// ===== 04 DEVELOP (Animation + Real AI API Call) =====
function startDeveloping() {
  if (developRuntime.developing) return;

  cancelDeveloping();
  state.resultIndex = null;
  state.aiImagePath = null;
  state.artworkVariants = [];
  state.selectedArtwork = null;
  document.getElementById('pick-next').disabled = true;
  document.getElementById('develop-bar').style.width = '0%';
  document.getElementById('frame-num').textContent = '00';
  document.getElementById('develop-msg').textContent = 'Your film is developing.';
  removeFallbackNotices();
  developRuntime.developing = true;
  const sessionId = developRuntime.sessionId;
  const controller = new AbortController();
  developRuntime.controller = controller;

  // Build sprocket holes
  const strip = document.getElementById('sprocket-strip');
  strip.innerHTML = '';
  for (let i = 0; i < 16; i++) {
    const hole = document.createElement('div');
    hole.className = 'sprocket-hole';
    strip.appendChild(hole);
  }

  let frame = 0;
  let progress = 0;
  const frameEl = document.getElementById('frame-num');
  const barEl = document.getElementById('develop-bar');
  const msgEl = document.getElementById('develop-msg');
  const messages = [
    'Your film is developing.',
    'Extracting colors...',
    'Applying KODAK tones...',
    'Composing layout...',
    'Almost there...'
  ];

  // Call the optional AI API simultaneously with the minimum-length animation.
  let apiDone = false;
  let apiResults = null;
  let apiError = null;
  let animationDone = false;

  const finishIfReady = () => {
    if (!apiDone || !animationDone || !isCurrentDevelopSession(sessionId)) return;
    clearDevelopTimers();
    developRuntime.controller = null;
    developRuntime.developing = false;
    proceedToPick(apiResults, apiError, sessionId);
  };

  const timeoutId = setTimeout(() => {
    if (!isCurrentDevelopSession(sessionId) || apiDone) return;
    apiError = 'AI request timed out';
    apiDone = true;
    controller.abort();
    finishIfReady();
  }, DEVELOP_TIMEOUT_MS);
  developRuntime.timers.add(timeoutId);

  // Optional backend hook.
  // If /api/ai-develop is not available, the kiosk automatically uses
  // the built-in Kodak template fallback below.
  const apiPromise = fetch('/api/ai-develop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoPath: state.photoPath, style: state.style }),
    signal: controller.signal
  })
    .then(res => {
      if (!res.ok) throw new Error(`AI API HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      if (!isCurrentDevelopSession(sessionId)) return;
      if (data.error) {
        apiError = data.error;
        console.warn('AI develop warning:', data.error);
      }
      apiResults = data.results || null;
      apiDone = true;
    })
    .catch(err => {
      if (!isCurrentDevelopSession(sessionId)) return;
      apiError = err.name === 'AbortError' ? 'AI request timed out' : err.message;
      console.warn('AI develop fallback:', apiError);
      apiDone = true;
    })
    .finally(() => {
      if (!isCurrentDevelopSession(sessionId)) return;
      clearTimeout(timeoutId);
      developRuntime.timers.delete(timeoutId);
      finishIfReady();
    });

  const interval = setInterval(() => {
    frame = Math.min(frame + 1, 36);
    progress = (frame / 36) * 100;
    frameEl.textContent = String(frame).padStart(2, '0');
    barEl.style.width = progress + '%';
    msgEl.textContent = messages[Math.min(Math.floor(frame / 8), messages.length - 1)];

    if (frame >= 36) {
      clearInterval(interval);
      developRuntime.timers.delete(interval);
      animationDone = true;
      if (!apiDone) msgEl.textContent = 'Finalizing your moments...';
      finishIfReady();
    }
  }, new URLSearchParams(location.search).get('demo') === '1' ? 80 : 120);
  developRuntime.timers.add(interval);
}

// Finish developing and carry the selected frame directly into PRINT.
function proceedToPick(apiResults, apiError, sessionId) {
  if (developRuntime.sessionId !== sessionId) return;
  const validAIResults = !apiError && Array.isArray(apiResults)
    ? apiResults.filter(result => result && typeof result.path === 'string' && result.path.trim()).slice(0, 3)
    : [];
  state.artworkVariants = createArtworkVariants(validAIResults);
  removeFallbackNotices();

  const variant = state.artworkVariants[0];
  state.resultIndex = 0;
  state.selectedArtwork = variant;
  state.aiImagePath = variant.source === 'ai' ? variant.imagePath : null;
  state.message = null;
  updatePrintPreview();
  showScreen('screen-print');
}

function removeFallbackNotices() {
  document.querySelectorAll('#screen-pick .fallback-notice').forEach(notice => notice.remove());
}

// ===== 05 PRINT =====
const OUTPUT_INFO = {
  tshirt:  { name: '커스텀 티셔츠', unitPrice: 29000, type: 'apparel', label: 'WEAR THE MOMENT' },
  hoodie:  { name: '커스텀 후드티', unitPrice: 49000, type: 'apparel', label: 'WEAR THE MOMENT — HOODIE' },
  tumbler: { name: 'COLLAB TUMBLER', unitPrice: 19000, type: 'tumbler', label: 'CARRY THE MOMENT' }
};

const TUMBLER_VARIANTS = {
  cream: { name: 'RED', asset: './assets/mockups/tumbler-red.png' },
  yellow: { name: 'KODAK YELLOW', asset: './assets/mockups/tumbler-yellow.png' },
  black: { name: 'RED / YELLOW SPLIT', asset: './assets/mockups/tumbler-split.png' }
};

// Product photography remains optional. The inline SVG is always rendered first,
// so the presentation never depends on an external mockup asset.
const PRODUCT_MOCKUP_CONFIG = {
  tshirt: {
    assets: {
      colorama: {
        cream: './assets/mockups/lineup/tshirt-colorama-cream.png',
        yellow: './assets/mockups/lineup/tshirt-colorama-yellow.png',
        black: './assets/mockups/lineup/tshirt-colorama-black.png',
        red: './assets/mockups/lineup/tshirt-colorama-red.png'
      },
      portra: {
        cream: './assets/mockups/lineup/tshirt-portra-cream.png',
        yellow: './assets/mockups/lineup/tshirt-portra-yellow.png',
        black: './assets/mockups/lineup/tshirt-portra-black.png',
        red: './assets/mockups/lineup/tshirt-portra-red.png'
      },
      archive: {
        cream: './assets/mockups/lineup/tshirt-archive-cream.png',
        yellow: './assets/mockups/lineup/tshirt-archive-yellow.png',
        black: './assets/mockups/lineup/tshirt-archive-black.png',
        red: './assets/mockups/lineup/tshirt-archive-red.png'
      }
    },
    safeArea: { x: 39, y: 28, width: 22, height: 34 },
    photoAreas: {
      colorama: { x: 32.9, y: 34.7, width: 33.1, height: 25.7 },
      portra: { x: 35.4, y: 30.7, width: 28.8, height: 21.9 },
      archive: { x: 38.5, y: 32.3, width: 26.5, height: 21.2 }
    }
  },
  hoodie: {
    assets: {
      colorama: {
        cream: './assets/mockups/lineup/hoodie-colorama-cream.png',
        yellow: './assets/mockups/lineup/hoodie-colorama-yellow.png',
        black: './assets/mockups/lineup/hoodie-colorama-black.png',
        red: './assets/mockups/lineup/hoodie-colorama-red.png'
      },
      portra: {
        cream: './assets/mockups/lineup/hoodie-portra-cream.png',
        yellow: './assets/mockups/lineup/hoodie-portra-yellow.png',
        black: './assets/mockups/lineup/hoodie-portra-black.png',
        red: './assets/mockups/lineup/hoodie-portra-red.png'
      },
      archive: {
        cream: './assets/mockups/lineup/hoodie-archive-cream.png',
        yellow: './assets/mockups/lineup/hoodie-archive-yellow.png',
        black: './assets/mockups/lineup/hoodie-archive-black.png',
        red: './assets/mockups/lineup/hoodie-archive-red.png'
      }
    },
    safeArea: { x: 40, y: 32, width: 20, height: 29 },
    photoAreas: {
      colorama: { x: 38.1, y: 46.8, width: 25.7, height: 19.4 },
      portra: { x: 37.5, y: 40.7, width: 24.6, height: 18.4 },
      archive: { x: 42.1, y: 44.9, width: 20.5, height: 16.5 }
    }
  }
};

function apparelSvg(product, color) {
  const uid = `${product}-${color}`;
  if (product === 'hoodie') {
    return `
      <svg class="apparel-product-svg hoodie-product-svg" viewBox="0 0 440 430" aria-hidden="true">
        <defs>
          <linearGradient id="fabric-${uid}" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="var(--fabric-shadow)"/><stop offset=".18" stop-color="var(--fabric-base)"/>
            <stop offset=".48" stop-color="var(--fabric-highlight)"/><stop offset=".72" stop-color="var(--fabric-base)"/>
            <stop offset="1" stop-color="var(--fabric-shadow)"/>
          </linearGradient>
          <linearGradient id="hood-${uid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--fabric-highlight)"/><stop offset="1" stop-color="var(--fabric-shadow)"/>
          </linearGradient>
          <filter id="contact-${uid}" x="-20%" y="-100%" width="140%" height="300%"><feGaussianBlur stdDeviation="9"/></filter>
        </defs>
        <ellipse class="apparel-contact-shadow" cx="220" cy="405" rx="151" ry="13" filter="url(#contact-${uid})"/>
        <path class="hood-back" fill="url(#hood-${uid})" d="M145 111 C147 72 151 42 175 25 C198 8 239 8 264 24 C289 40 296 70 296 111 C275 99 258 91 245 85 C233 78 207 78 195 85 C181 92 164 100 145 111Z"/>
        <path class="hood-fold" d="M162 96 C167 55 184 32 218 27 M278 97 C273 57 256 34 224 27"/>
        <path class="hood-opening" d="M174 76 C182 48 199 35 220 35 C242 35 259 49 267 77 C257 91 244 101 220 103 C197 101 184 91 174 76Z"/>
        <path class="hoodie-fabric" fill="url(#fabric-${uid})" d="M151 91 C125 94 99 101 78 116 C60 130 54 154 49 183 L24 327 C21 347 29 361 48 365 L72 369 C88 372 96 364 98 348 L112 222 C114 207 119 194 126 184 L117 381 C116 396 127 402 143 404 C193 410 246 410 297 404 C313 402 324 396 323 381 L314 184 C322 195 327 208 329 223 L342 348 C344 364 353 372 369 369 L393 365 C412 361 419 347 416 327 L391 183 C386 154 379 130 362 116 C341 101 315 94 289 91 C272 105 251 113 220 114 C188 113 168 105 151 91Z"/>
        <path class="apparel-side-shade" d="M123 177 C137 204 132 314 139 385 M317 177 C303 208 309 316 301 385"/>
        <path class="apparel-fold" d="M88 135 C77 176 78 244 67 333 M352 135 C363 179 362 244 373 333 M150 119 C166 141 164 169 157 195 M290 119 C273 142 276 168 283 196"/>
        <path class="hoodie-neck-seam" d="M174 86 C184 106 200 116 220 117 C241 116 257 106 267 86"/>
        <path class="hoodie-string" d="M196 95 C195 122 198 139 197 160 M244 95 C245 122 242 139 243 160"/>
        <path class="hoodie-string-tip" d="M193 159 L201 159 M239 159 L247 159"/>
        <path class="hoodie-pocket-fill" fill="var(--fabric-base)" d="M151 285 C170 271 193 266 220 266 C248 266 271 271 289 285 L279 349 C241 359 199 359 161 349Z"/>
        <path class="hoodie-pocket-seam" d="M151 285 C170 271 193 266 220 266 C248 266 271 271 289 285 M161 349 C199 359 241 359 279 349 M174 290 C166 310 164 330 161 349 M266 290 C274 310 276 330 279 349"/>
        <path class="apparel-rib" d="M120 378 C184 386 256 386 320 378 M120 386 C184 394 256 394 320 386 M29 341 C48 347 69 350 94 348 M346 348 C371 350 392 347 411 341"/>
      </svg>`;
  }

  return `
    <svg class="apparel-product-svg tshirt-product-svg" viewBox="0 0 440 430" aria-hidden="true">
      <defs>
        <linearGradient id="fabric-${uid}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="var(--fabric-shadow)"/><stop offset=".18" stop-color="var(--fabric-base)"/>
          <stop offset=".5" stop-color="var(--fabric-highlight)"/><stop offset=".82" stop-color="var(--fabric-base)"/>
          <stop offset="1" stop-color="var(--fabric-shadow)"/>
        </linearGradient>
        <filter id="contact-${uid}" x="-20%" y="-100%" width="140%" height="300%"><feGaussianBlur stdDeviation="9"/></filter>
      </defs>
      <ellipse class="apparel-contact-shadow" cx="220" cy="404" rx="145" ry="12" filter="url(#contact-${uid})"/>
      <path class="tshirt-svg-fabric" fill="url(#fabric-${uid})" d="M156 36 C133 40 104 48 82 60 C62 71 47 89 36 111 L12 154 C6 166 12 176 25 181 L91 207 C104 212 113 206 120 193 L122 383 C122 398 135 403 151 405 C196 411 244 411 289 405 C305 403 318 398 318 383 L320 193 C327 206 337 212 350 207 L415 181 C428 176 434 166 428 154 L405 111 C393 89 378 71 358 60 C336 48 307 40 284 36 C268 29 258 21 247 12 C236 20 228 24 220 24 C212 24 204 20 193 12 C182 21 172 29 156 36Z"/>
      <path class="apparel-side-shade" d="M126 184 C139 218 132 313 139 389 M314 184 C301 220 308 313 301 389"/>
      <path class="apparel-fold" d="M102 66 C110 95 114 127 113 169 M338 66 C330 96 326 129 327 170 M153 48 C166 86 164 117 158 151 M287 48 C274 87 276 117 282 151"/>
      <path class="apparel-seam" d="M30 164 C52 176 75 185 101 192 M410 164 C388 176 365 185 339 192 M127 386 C188 394 252 394 313 386"/>
      <path class="tshirt-neck-rib" fill="var(--fabric-base)" d="M177 19 C183 49 198 64 220 65 C242 64 257 49 263 19 C250 30 237 36 220 37 C203 36 190 30 177 19Z"/>
      <path class="tshirt-neck-opening" d="M187 23 C194 44 204 53 220 54 C236 53 246 44 253 23 C243 31 232 34 220 35 C208 34 197 31 187 23Z"/>
      <path class="tshirt-neck-seam" d="M177 19 C183 49 198 64 220 65 C242 64 257 49 263 19"/>
    </svg>`;
}

function getApparelMockupAsset(product, color) {
  const config = PRODUCT_MOCKUP_CONFIG[product];
  const safeColor = ['cream', 'yellow', 'black', 'red'].includes(color) ? color : 'cream';
  const family = getMockupFamily();
  return (config.assets[family] || config.assets.portra)[safeColor];
}

function preloadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = async () => {
      try { if (image.decode) await image.decode(); } catch (_) {}
      resolve(src);
    };
    image.onerror = reject;
    image.src = src;
  });
}

function buildApparelMockup(mockup, product, color, preloadedAsset) {
  const config = PRODUCT_MOCKUP_CONFIG[product];
  const safeColor = ['cream', 'yellow', 'black', 'red'].includes(color) ? color : 'cream';
  const family = getMockupFamily();
  const assetPath = (config.assets[family] || config.assets.portra)[safeColor];
  const area = config.safeArea;

  mockup.innerHTML = `
    <div class="asset-product-mockup" data-product="${product}" data-color="${safeColor}" data-family="${family}">
      ${apparelSvg(product, safeColor)}
      <img class="product-mockup-image" alt="" aria-hidden="true">
      <div class="mockup-photo-replacement"><img alt="Customer photo preview"></div>
      <div class="asset-artwork-safe-area product-artwork-target"></div>
    </div>`;

  const shell = mockup.querySelector('.asset-product-mockup');
  const image = shell.querySelector('.product-mockup-image');
  const artworkTarget = shell.querySelector('.product-artwork-target');
  const photoReplacement = shell.querySelector('.mockup-photo-replacement');
  artworkTarget.style.left = `${area.x}%`;
  artworkTarget.style.top = `${area.y}%`;
  artworkTarget.style.width = `${area.width}%`;
  artworkTarget.style.height = `${area.height}%`;
  if (photoReplacement && config.photoAreas) {
    const photoArea = config.photoAreas[family] || config.photoAreas.portra;
    photoReplacement.style.left = `${photoArea.x}%`;
    photoReplacement.style.top = `${photoArea.y}%`;
    photoReplacement.style.width = `${photoArea.width}%`;
    photoReplacement.style.height = `${photoArea.height}%`;
  }

  image.onload = () => {
    shell.classList.add('has-photo-asset');
  };
  image.onerror = () => {
    shell.classList.remove('has-photo-asset');
    image.removeAttribute('src');
  };
  if (preloadedAsset === assetPath) shell.classList.add('has-photo-asset');
  image.src = assetPath;
  return artworkTarget;
}

function buildProductMockup(product, color, preloadedAsset) {
  const mockup = document.getElementById('product-mockup');
  const safeProduct = ['tshirt', 'hoodie', 'tumbler'].includes(product) ? product : 'tshirt';
  mockup.className = `tshirt-mockup product-mockup product-${safeProduct} ${['tshirt', 'hoodie'].includes(safeProduct) ? 'product-apparel product-tshirt' : ''} color-${color}`;

  if (safeProduct === 'tshirt' || safeProduct === 'hoodie') {
    return buildApparelMockup(mockup, safeProduct, color, preloadedAsset);
  } else if (safeProduct === 'tumbler') {
    const tumbler = TUMBLER_VARIANTS[color] || TUMBLER_VARIANTS.cream;
    mockup.innerHTML = `
      <div class="stock-tumbler-mockup">
        <img src="${tumbler.asset}" alt="${tumbler.name} KODAK tumbler">
      </div>`;
  }

  return mockup.querySelector('.product-artwork-target');
}

function updatePrintPreview(preloadedAsset) {
  const output = OUTPUT_INFO[state.output] || OUTPUT_INFO.tshirt;
  const selectedVariant = state.selectedArtwork || state.artworkVariants[state.resultIndex] || createArtworkVariants([])[0];
  const artworkTarget = buildProductMockup(state.output, state.tshirtColor, preloadedAsset);
  const artworkColor = state.tshirtColor;
  if (artworkTarget) renderArtwork(artworkTarget, selectedVariant, 'print', artworkColor);
  const mockupPhoto = document.querySelector('#product-mockup .mockup-photo-replacement img');
  if (mockupPhoto) {
    setSafeImageSource(mockupPhoto, selectedVariant.imagePath, selectedVariant.fallbackImagePath);
  }
  document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.classList.toggle('selected', swatch.dataset.color === state.tshirtColor);
  });
  document.querySelectorAll('#design-color-selector .color-choice').forEach(choice => {
    choice.classList.toggle('selected', choice.dataset.color === state.tshirtColor);
  });

  // Update title based on output type
  const titleEl = document.querySelector('#screen-print .screen-title');
  const subEl = document.querySelector('#screen-print .screen-sub');
  const kickerEl = document.querySelector('#screen-print .kicker');

  if (output.type === 'tumbler') {
    kickerEl.textContent = 'KODAK COLLAB GOODS';
    titleEl.innerHTML = '콜라보 텀블러 <em>제품 선택</em>';
    subEl.textContent = '사진 커스텀 없이 콜라보 텀블러 3종 중 하나를 선택하세요.';
  } else {
    kickerEl.textContent = '오늘을 입을 수 있게 만들다';
    titleEl.innerHTML = output.type === 'apparel' && state.output === 'hoodie' ? '후드티 <em>프리뷰</em>' : '티셔츠 <em>프리뷰</em>';
    subEl.textContent = '완성된 디자인이 의류에 어떻게 인쇄되는지 확인하세요.';
  }

  // Show/hide color & size selectors based on output type
  const colorKicker = document.getElementById('color-kicker');
  const colorSelector = document.getElementById('color-selector');
  const sizeKicker = document.getElementById('size-kicker');
  const sizeSelector = document.getElementById('size-selector');

  if (output.type === 'tumbler') {
    // Ready-made tumbler: select one of three finished products.
    colorKicker.textContent = '콜라보 텀블러 선택';
    colorKicker.style.display = '';
    colorSelector.style.display = '';
    colorSelector.classList.add('tumbler-mode');
    sizeKicker.style.display = 'none';
    sizeSelector.style.display = 'none';
  } else {
    // PRINT allows a final color change and refreshes the garment mockup immediately.
    colorKicker.textContent = state.output === 'hoodie' ? '후드티 색상' : '티셔츠 색상';
    colorKicker.style.display = '';
    colorSelector.style.display = '';
    sizeKicker.style.display = '';
    sizeSelector.style.display = '';
    colorSelector.classList.remove('tumbler-mode');
  }

  // Info
  const info = document.getElementById('print-info');
  let colorValue = state.tshirtColor.toUpperCase();
  let sizeValue = state.tshirtSize;

  if (output.type === 'tumbler') {
    colorValue = (TUMBLER_VARIANTS[state.tshirtColor] || TUMBLER_VARIANTS.cream).name;
    sizeValue = '500ML';
  }

  // Show the frame name the customer actually picked on the DESIGN screen
  // (STYLES matches the style-card labels) rather than the artwork's own title.
  const frameName = (STYLES[state.style] && STYLES[state.style].name) || selectedVariant.metadata.title;
  const summary = [
    ['PRODUCT', output.name],
    ['COLOR', colorValue],
    ['SIZE', sizeValue],
    ['STYLE', output.type === 'tumbler' ? 'COLLAB EDITION' : frameName],
    ['QTY', String(state.quantity)]
  ];
  const totalPrice = output.unitPrice * state.quantity;
  info.innerHTML = summary.map(([label, value]) => `
    <div class="summary-row"><span class="summary-key">${label}</span><span class="summary-value">${value}</span></div>
  `).join('') + `
    <div class="summary-row summary-price"><span class="summary-key">PRICE</span><span class="summary-value">${totalPrice.toLocaleString('ko-KR')}원</span></div>`;

  document.getElementById('quantity-value').textContent = String(state.quantity);
  document.getElementById('quantity-minus').disabled = state.quantity <= 1;
}

// Color selector: garment color is independent from the selected fixed frame.
let colorTransitionId = 0;
document.querySelectorAll('.color-swatch').forEach(swatch => {
  swatch.onclick = async () => {
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
    swatch.classList.add('selected');
    const nextColor = swatch.dataset.color;
    const transitionId = ++colorTransitionId;
    let preloadedAsset = null;
    if (state.output === 'tshirt' || state.output === 'hoodie') {
      preloadedAsset = getApparelMockupAsset(state.output, nextColor);
      try { await preloadImage(preloadedAsset); } catch (_) { preloadedAsset = null; }
    }
    if (transitionId !== colorTransitionId) return;

    state.tshirtColor = nextColor;
    updatePrintPreview(preloadedAsset);
  };
});

// Size selector
document.querySelectorAll('.size-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.tshirtSize = btn.dataset.size;
    updatePrintPreview();
  };
});

document.getElementById('quantity-minus').onclick = () => {
  state.quantity = Math.max(1, state.quantity - 1);
  updatePrintPreview();
};

document.getElementById('quantity-plus').onclick = () => {
  state.quantity = Math.min(20, state.quantity + 1);
  updatePrintPreview();
};

document.getElementById('print-next').onclick = () => {
  showScreen('screen-deliver');
};

// ===== 06 DELIVER =====
document.querySelectorAll('.deliver-card').forEach(card => {
  card.onclick = () => {
    document.querySelectorAll('.deliver-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    state.deliver = card.dataset.deliver;

    if (state.deliver === 'deliver') {
      const formWrap = document.getElementById('dhl-form-wrap');
      const content = document.querySelector('#screen-deliver .content');
      formWrap.style.display = 'block';
      // Require form fields
      checkDeliverNext();
      // On the fixed kiosk viewport the form sits below the fold, so bring it
      // into view once its layout is applied — no visual redesign needed.
      requestAnimationFrame(() => {
        const contentRect = content.getBoundingClientRect();
        const navRect = document.querySelector('#screen-deliver .nav-bar').getBoundingClientRect();
        const addressRect = document.getElementById('dhl-address').getBoundingClientRect();
        const scale = content.offsetHeight ? contentRect.height / content.offsetHeight : 1;
        const delta = Math.max(0, addressRect.bottom - navRect.top + 24) / scale;
        const maxScrollTop = Math.max(0, content.scrollHeight - content.clientHeight);
        content.scrollTo({
          top: Math.min(maxScrollTop, content.scrollTop + delta),
          behavior: 'smooth'
        });
      });
    } else {
      document.getElementById('dhl-form-wrap').style.display = 'none';
      document.getElementById('deliver-next').disabled = false;
    }
  };
});

// DHL form inputs
['dhl-country', 'dhl-name', 'dhl-address'].forEach(id => {
  document.getElementById(id).oninput = (e) => {
    const key = id.replace('dhl-', '');
    state.dhl[key] = e.target.value;
    checkDeliverNext();
  };
});

function checkDeliverNext() {
  if (state.deliver === 'deliver') {
    const filled = state.dhl.country && state.dhl.name && state.dhl.address;
    document.getElementById('deliver-next').disabled = !filled;
  }
}

document.getElementById('deliver-next').onclick = () => {
  state.orderNo = state.orderNo || createOrderNumber();
  showScreen('screen-done');
  updateDoneScreen();
};

// ===== DONE =====
function updateDoneScreen() {
  const kicker = document.getElementById('done-kicker');
  const num = document.getElementById('pickup-number');
  const tagline = document.getElementById('done-tagline');
  const orderNumber = document.getElementById('done-order-number');
  const status = document.getElementById('done-status');
  const pickupWrap = document.getElementById('pickup-wrap');
  const destination = document.getElementById('done-destination');

  orderNumber.textContent = state.orderNo || createOrderNumber();
  num.textContent = String(state.frameNo).padStart(3, '0');

  if (state.deliver === 'take') {
    kicker.textContent = 'PRINTING IN PROGRESS...';
    status.textContent = 'PRINTING / READY';
    pickupWrap.hidden = false;
    destination.hidden = true;
    destination.textContent = '';
    tagline.innerHTML = `YOUR MOMENT IS READY.<br><em>PICK-UP NO. ${String(state.frameNo).padStart(3, '0')}</em>`;
  } else {
    kicker.textContent = 'DELIVERING YOUR MOMENT...';
    status.textContent = 'DELIVERY REQUESTED';
    pickupWrap.hidden = true;
    destination.hidden = false;
    destination.textContent = `DESTINATION · ${state.dhl.country.toUpperCase()}`;
    tagline.innerHTML = `A MOMENT FROM SEOUL,<br><em>DELIVERED TO ${state.dhl.country.toUpperCase()}.</em>`;
  }
}

function restart() {
  cancelDeveloping();
  clearInterval(mobileUploadRuntime.pollTimer);
  mobileUploadRuntime.pollTimer = null;
  mobileUploadRuntime.session = null;
  if (state.photoPath && state.photoPath.startsWith('blob:')) {
    URL.revokeObjectURL(state.photoPath);
  }

  state.step = 1;
  state.photoPath = null;
  state.style = null;
  state.output = null;
  state.resultIndex = null;
  state.message = null;
  state.deliver = null;
  state.aiImagePath = null;
  state.tshirtColor = 'cream';
  state.tshirtSize = 'M';
  state.quantity = 1;
  state.dhl = { country: '', name: '', address: '' };
  state.frameNo = Math.floor(Math.random() * 36) + 1;
  state.capturedAt = new Date();
  state.artworkVariants = [];
  state.selectedArtwork = null;
  state.photoSourceType = null;
  state.orderNo = null;

  document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
  document.getElementById('product-next').disabled = true;
  document.getElementById('capture-next').disabled = true;
  document.getElementById('pick-next').disabled = true;
  document.getElementById('deliver-next').disabled = true;
  document.getElementById('dhl-form-wrap').style.display = 'none';
  document.getElementById('dhl-country').value = '';
  document.getElementById('dhl-name').value = '';
  document.getElementById('dhl-address').value = '';
  document.querySelector('.color-swatch.cream').classList.add('selected');
  document.querySelector('#design-color-selector .color-choice.cream')?.classList.add('selected');
  document.getElementById('color-selector').classList.remove('tumbler-mode');
  document.querySelector('.size-btn[data-size="M"]').classList.add('selected');
  document.getElementById('quantity-value').textContent = '1';
  document.getElementById('quantity-minus').disabled = true;
  buildProductMockup('tshirt', 'cream');
  removeFallbackNotices();
  document.getElementById('result-grid').innerHTML = '';
  document.getElementById('develop-bar').style.width = '0%';
  document.getElementById('frame-num').textContent = '00';
  document.getElementById('develop-msg').textContent = 'Your film is developing.';
  document.getElementById('done-order-number').textContent = 'K-000000';
  document.getElementById('done-status').textContent = 'PRINTING / READY';
  document.getElementById('pickup-wrap').hidden = false;
  document.getElementById('done-destination').hidden = true;
  document.getElementById('done-destination').textContent = '';
  document.getElementById('upload-qr').removeAttribute('src');
  document.getElementById('qr-status').textContent = 'QR 연결 준비 중...';
  document.getElementById('photo-confirm-image').removeAttribute('src');

  showScreen('screen-welcome');
}

// Build film strip holes
(function buildFilmStrip() {
  const strip = document.getElementById('film-strip-left');
  if (strip) {
    for (let i = 0; i < 24; i++) {
      const hole = document.createElement('div');
      hole.className = 'hole';
      strip.appendChild(hole);
    }
  }
})();

// ===== KIOSK VIEWPORT =====
// Keep one predictable 16:10 layout on the target tablet and scale that
// complete stage on laptops instead of reflowing individual components.
(function initializeKioskViewport() {
  const DESIGN_WIDTH = 1280;
  const DESIGN_HEIGHT = 800;

  function fitKioskStage() {
    const viewportWidth = window.visualViewport?.width || window.innerWidth;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const rawScale = Math.min(
      1,
      viewportWidth / DESIGN_WIDTH,
      viewportHeight / DESIGN_HEIGHT
    );
    // Guard against transient 0 / NaN viewport reports (Windows DPI scaling,
    // tab restore, pre-layout load) that would otherwise collapse the whole
    // stage to scale(0). Keeps the existing scaling structure intact.
    const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
    document.documentElement.style.setProperty('--kiosk-scale', String(scale));
  }

  fitKioskStage();
  window.addEventListener('resize', fitKioskStage, { passive: true });
  window.visualViewport?.addEventListener('resize', fitKioskStage, { passive: true });
  window.addEventListener('orientationchange', fitKioskStage, { passive: true });
})();

// Preview navigation: available in the default build, but never in auto-demo mode.
(function initializeScreenNavigator() {
  if (new URLSearchParams(location.search).get('demo') === '1') return;

  const screenOrder = [
    'screen-welcome', 'screen-capture', 'screen-choose', 'screen-photo-confirm',
    'screen-pick', 'screen-develop', 'screen-print', 'screen-deliver', 'screen-done'
  ];
  const screens = [...document.querySelectorAll('.screen[id]')].sort((a, b) => {
    const aIndex = screenOrder.indexOf(a.id);
    const bIndex = screenOrder.indexOf(b.id);
    return (aIndex < 0 ? screenOrder.length : aIndex) - (bIndex < 0 ? screenOrder.length : bIndex);
  });
  if (!screens.length) return;

  const style = document.createElement('style');
  style.textContent = `
    #dev-screen-navigator{display:block;visibility:visible;opacity:1;position:fixed;z-index:2147483647;
      right:12px;top:12px;width:170px;padding:10px;
      color:#eee;background:rgba(18,18,17,.94);border:1px solid #ffb700;border-radius:6px;
      box-shadow:0 8px 24px rgba(0,0,0,.4);font:11px/1.25 Arial,sans-serif}
    #dev-screen-navigator *{box-sizing:border-box}
    #dev-screen-navigator strong{display:block;margin:0 0 7px;color:#ffb700;font-size:11px;letter-spacing:.08em}
    #dev-screen-navigator nav{display:grid;gap:4px}
    #dev-screen-navigator button{width:100%;padding:5px 7px;overflow:hidden;border:1px solid #555;border-radius:3px;
      color:#ccc;background:#292927;font:inherit;text-align:left;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
    #dev-screen-navigator button:hover{border-color:#ffb700;color:#fff}
    #dev-screen-navigator button.active{border-color:#ffb700;color:#171715;background:#ffb700;font-weight:700}
  `;
  document.head.appendChild(style);

  const panel = document.createElement('aside');
  panel.id = 'dev-screen-navigator';
  panel.setAttribute('aria-label', 'Screen Navigator');
  panel.innerHTML = '<strong>SCREEN NAVIGATOR</strong><nav></nav>';
  const nav = panel.querySelector('nav');

  function screenLabel(screen) {
    const labels = {
      'screen-welcome': 'WELCOME',
      'screen-capture': 'PRODUCT',
      'screen-choose': 'CAPTURE',
      'screen-photo-confirm': 'PHOTO REVIEW',
      'screen-pick': 'DESIGN',
      'screen-develop': 'DEVELOP',
      'screen-print': 'PRINT',
      'screen-deliver': 'DELIVER',
      'screen-done': 'DONE'
    };
    if (labels[screen.id]) return labels[screen.id];
    return screen.id.replace(/^screen-/, '').replace(/-/g, ' ').toUpperCase();
  }

  function updateActiveButton() {
    nav.querySelectorAll('button').forEach(button => {
      button.classList.toggle('active', document.getElementById(button.dataset.screen)?.classList.contains('active'));
    });
  }

  function preparePreviewScreen(screenId) {
    if (screenId === 'screen-choose' && !mobileUploadRuntime.session) {
      const qr = document.getElementById('upload-qr');
      if (!qr.getAttribute('src')) qr.src = PREVIEW_QR;
      qr.hidden = false;
      document.getElementById('qr-status').textContent = 'SCREEN NAVIGATOR PREVIEW QR';
    }

    const photoScreens = [
      'screen-photo-confirm', 'screen-pick', 'screen-develop', 'screen-print',
      'screen-deliver', 'screen-done'
    ];
    if (!photoScreens.includes(screenId)) return;

    if (!state.photoPath) {
      state.photoPath = './assets/samples/family.jpeg';
      state.photoSourceType = state.photoSourceType || 'navigator-preview';
    }
    state.output = state.output || 'tshirt';
    state.style = state.style || 'film-frame';

    const confirmImage = document.getElementById('photo-confirm-image');
    setSafeImageSource(confirmImage, state.photoPath, './assets/samples/family.jpeg');
    document.getElementById('photo-confirm-date').textContent = `SEOUL · ${getKodakDate()}`;
    updateDesignProductExamples();

    if (!state.artworkVariants.length) state.artworkVariants = createArtworkVariants([]);
    if (!state.selectedArtwork) {
      state.resultIndex = Number.isInteger(state.resultIndex) ? state.resultIndex : 0;
      state.selectedArtwork = state.artworkVariants[state.resultIndex] || state.artworkVariants[0];
    }

    if (['screen-print', 'screen-deliver', 'screen-done'].includes(screenId)) updatePrintPreview();
    if (screenId === 'screen-done') {
      state.deliver = state.deliver || 'take';
      state.orderNo = state.orderNo || createOrderNumber();
      updateDoneScreen();
    }
  }

  screens.forEach(screen => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.screen = screen.id;
    button.textContent = screenLabel(screen);
    button.title = screen.id;
    button.addEventListener('click', () => {
      preparePreviewScreen(screen.id);
      showScreen(screen.id);
      updateActiveButton();
    });
    nav.appendChild(button);
  });

  const observer = new MutationObserver(updateActiveButton);
  screens.forEach(screen => observer.observe(screen, { attributes: true, attributeFilter: ['class'] }));
  panel.addEventListener('pointerdown', event => event.stopPropagation());
  document.body.appendChild(panel);
  updateActiveButton();
})();
