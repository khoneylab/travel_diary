/* ===================== 상태 & 저장 ===================== */
const STORAGE_KEY = 'travelDiaryData_v1';
const PACKING_TEMPLATE = ['의류', '전자기기', '세면도구/화장품', '서류/기타'];
const BUDGET_TEMPLATE = ['교통', '숙소', '식비', '관광/액티비티', '쇼핑/기타'];
const DEST_COLORS = ['#cdb8ea', '#f0c2dd', '#dcc6ef', '#f5d0e3', '#c9aee0', '#f2bcd6'];
const COLOR_PALETTE_VERSION = 2;

let state = load() || seedData();
normalizeState();
migrateColors();
save(true);

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

let toastTimer = null;
function save(silent) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (!silent) showToast('💾 저장됨');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1300);
}

function normalizeState() {
  state.destinations.forEach(d => {
    if (d.type !== 'domestic' && d.type !== 'intl') d.type = 'intl';
    if (!d.journal) d.journal = {};
    if (d.bgm === undefined) d.bgm = null;
  });
}

function migrateColors() {
  if (state.colorPaletteVersion === COLOR_PALETTE_VERSION) return;
  state.destinations.forEach((d, i) => {
    d.color = DEST_COLORS[i % DEST_COLORS.length];
  });
  state.colorPaletteVersion = COLOR_PALETTE_VERSION;
}

function currencySymbol(d) {
  return d.type === 'domestic' ? '₩' : '€';
}

function seedData() {
  const dest = makeDestination({
    name: '파리',
    country: '프랑스',
    flag: '🇫🇷',
    type: 'intl',
    color: '#cdb8ea',
    dateStart: '2026-08-10',
    dateEnd: '2026-08-13',
    memo: '에펠탑 야경, 루브르 박물관, 몽마르뜨 언덕 카페 들르기.'
  });
  dest.packing[0].items.push(
    { id: uid(), name: '원피스 2벌', checked: false },
    { id: uid(), name: '가벼운 가디건', checked: false }
  );
  dest.packing[1].items.push(
    { id: uid(), name: '보조배터리', checked: true },
    { id: uid(), name: 'EU 어댑터', checked: false }
  );
  if (dest.days[0]) {
    dest.itinerary[dest.days[0].id] = [
      { id: uid(), time: '09:00', title: '에펠탑 전망대', location: '샹 드 마르스', memo: '예약 티켓 지참' },
      { id: uid(), time: '14:00', title: '루브르 박물관', location: '리볼리 거리', memo: '' }
    ];
    dest.outfits[dest.days[0].id] = {
      weather: '맑음 · 최고 26도', top: '린넨 셔츠', bottom: '와이드 팬츠', outer: '', shoes: '스니커즈', memo: '많이 걷는 날'
    };
    dest.journal[dest.days[0].id] = {
      text: '드디어 파리 도착! 에펠탑을 실제로 보니 생각보다 훨씬 웅장했다. 다리는 아팠지만 야경은 평생 못 잊을 것 같다.',
      photos: []
    };
  }
  dest.budget[1].items.push({ id: uid(), name: '호텔 3박', planned: 450, actual: '' });
  dest.budget[2].items.push({ id: uid(), name: '식비 (일 평균)', planned: 40, actual: '' });

  return { destinations: [dest] };
}

function makeDestination(fields) {
  const id = uid();
  const days = buildDays(fields.dateStart, fields.dateEnd);
  return {
    id,
    name: fields.name || '',
    country: fields.country || '',
    flag: fields.flag || (fields.type === 'domestic' ? '🚗' : '✈️'),
    type: fields.type === 'domestic' ? 'domestic' : 'intl',
    color: fields.color || '#cdb8ea',
    dateStart: fields.dateStart || '',
    dateEnd: fields.dateEnd || '',
    memo: fields.memo || '',
    days,
    packing: PACKING_TEMPLATE.map(name => ({ id: uid(), name, items: [] })),
    budget: BUDGET_TEMPLATE.map(name => ({ id: uid(), name, items: [] })),
    outfits: {},
    itinerary: {},
    journal: {},
    bgm: null
  };
}

function toLocalISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildDays(start, end) {
  if (!start || !end) return [];
  const days = [];
  let cur = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  if (isNaN(cur) || isNaN(last) || cur > last) return [];
  while (cur <= last) {
    days.push({ id: uid(), date: toLocalISODate(cur) });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function findDest(id) {
  return state.destinations.find(d => d.id === id);
}

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  return `${d.getMonth() + 1}.${d.getDate()}(${'일월화수목금토'[d.getDay()]})`;
}

function fmtMoney(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('ko-KR');
}

/* ===================== 파일 저장(IndexedDB) - 사진 & BGM ===================== */
const FILE_DB_NAME = 'travelDiaryFiles';
const FILE_STORE = 'files';
let dbPromise = null;

function openFileDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(FILE_DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(FILE_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function filePut(id, blob) {
  const db = await openFileDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, 'readwrite');
    tx.objectStore(FILE_STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function fileGet(id) {
  const db = await openFileDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, 'readonly');
    const req = tx.objectStore(FILE_STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function fileDelete(id) {
  const db = await openFileDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, 'readwrite');
    tx.objectStore(FILE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function resizeImageFile(file, maxDim = 1100, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
        else { width = Math.round(width * maxDim / height); height = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        URL.revokeObjectURL(url);
        resolve(blob);
      }, 'image/jpeg', quality);
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function hydrateFileElements() {
  const app = document.getElementById('app');
  const els = app.querySelectorAll('[data-photo-thumb]');
  for (const el of els) {
    const fileId = el.dataset.photoThumb;
    try {
      const blob = await fileGet(fileId);
      if (blob) el.src = URL.createObjectURL(blob);
    } catch (e) { /* 무시 */ }
  }
}

/* ===================== BGM 플레이어 ===================== */
const bgmAudio = document.getElementById('bgmAudio');
const bgmPlayerEl = document.getElementById('bgmPlayer');
const bgmToggleBtn = document.getElementById('bgmToggle');
const bgmNameEl = document.getElementById('bgmName');
const bgmVolumeEl = document.getElementById('bgmVolume');
let loadedBgmFileId = null;

bgmAudio.volume = 0.6;
bgmToggleBtn.addEventListener('click', () => {
  if (bgmAudio.paused) { bgmAudio.play().catch(() => {}); bgmToggleBtn.textContent = '❚❚'; }
  else { bgmAudio.pause(); bgmToggleBtn.textContent = '▶'; }
});
bgmVolumeEl.addEventListener('input', () => { bgmAudio.volume = Number(bgmVolumeEl.value); });
bgmAudio.addEventListener('pause', () => { bgmToggleBtn.textContent = '▶'; });
bgmAudio.addEventListener('play', () => { bgmToggleBtn.textContent = '❚❚'; });

async function updateBgmPlayer(dest) {
  if (dest && dest.bgm) {
    bgmPlayerEl.classList.remove('hidden');
    bgmNameEl.textContent = dest.bgm.name || 'BGM';
    if (loadedBgmFileId !== dest.bgm.fileId) {
      loadedBgmFileId = dest.bgm.fileId;
      const blob = await fileGet(dest.bgm.fileId);
      if (blob) bgmAudio.src = URL.createObjectURL(blob);
    }
  } else {
    bgmPlayerEl.classList.add('hidden');
    if (!bgmAudio.paused) bgmAudio.pause();
    loadedBgmFileId = null;
  }
}

/* ===================== 라우팅 ===================== */
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  if (!h) return { view: 'home' };
  const parts = h.split('/');
  if (parts[0] === 'dest' && parts[1]) {
    return { view: 'dest', id: parts[1], tab: parts[2] || 'overview' };
  }
  return { view: 'home' };
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);

/* ===================== 렌더 ===================== */
function render() {
  const route = parseHash();
  const app = document.getElementById('app');
  const navContext = document.getElementById('navContext');
  const dest = route.view === 'dest' ? findDest(route.id) : null;

  if (dest) {
    app.innerHTML = renderDestPage(dest, route.tab);
    navContext.innerHTML = `<a href="#/">홈</a><span class="crumb-sep">/</span><span class="crumb-current">${escapeHtml(dest.name || '이름없음')}</span>`;
  } else {
    app.innerHTML = renderHome();
    navContext.innerHTML = '';
  }
  bindEvents();
  hydrateFileElements();
  updateBgmPlayer(dest);
}

function destSubtotal(d) {
  return d.budget.reduce((s, c) => s + c.items.reduce((s2, it) => s2 + (Number(it.planned) || 0), 0), 0);
}

function renderDestSection(list, title, icon, emptyMsg, addType) {
  const cards = list.map(d => {
    const packedTotal = d.packing.reduce((s, c) => s + c.items.length, 0);
    const packedDone = d.packing.reduce((s, c) => s + c.items.filter(i => i.checked).length, 0);
    const pct = packedTotal ? Math.round(packedDone / packedTotal * 100) : 0;
    return `
    <div class="dest-card" style="background:${d.color}" data-open-dest="${d.id}">
      <div class="card-menu">
        <button data-edit-dest="${d.id}" title="수정">✎</button>
        <button data-del-dest="${d.id}" title="삭제">✕</button>
      </div>
      <div>
        <div class="flag">${d.flag}</div>
        <div class="dest-name">${escapeHtml(d.name || '이름없음')}</div>
        <div class="dest-country">${escapeHtml(d.country || '')}</div>
      </div>
      <div>
        <div class="dest-dates">${d.dateStart ? fmtDate(d.dateStart) + ' - ' + fmtDate(d.dateEnd) : '날짜 미정'}</div>
        <div class="dest-progress"><div class="dest-progress-fill" style="width:${pct}%"></div></div>
      </div>
    </div>`;
  }).join('');

  const subtotal = list.reduce((s, d) => s + destSubtotal(d), 0);
  const sym = addType === 'domestic' ? '₩' : '€';

  return `
  <div class="section-header">
    <h3>${icon} ${title}</h3>
    <span class="section-sub">${list.length}곳${list.length ? ` · 예상 ${sym}${fmtMoney(subtotal)}` : ''}</span>
  </div>
  ${list.length ? `<div class="dest-grid">${cards}<div class="dest-card add-card" data-add-dest="${addType}">＋ ${title} 추가</div></div>`
    : `<div class="dest-grid"><div class="section-empty">${emptyMsg}</div><div class="dest-card add-card" data-add-dest="${addType}">＋ ${title} 추가</div></div>`}
  `;
}

function renderHome() {
  const destCount = state.destinations.length;
  const totalDays = state.destinations.reduce((s, d) => s + (d.days.length || 0), 0);
  const intl = state.destinations.filter(d => d.type === 'intl');
  const domestic = state.destinations.filter(d => d.type === 'domestic');

  return `
  <div class="hero">
    <h1 class="hero-title">인생은 짧고 세상은 넓다</h1>
    <p class="hero-sub">- 사이먼 레이븐(Simon Raven) -</p>
    <div class="summary-bar">
      <div class="summary-chip">여행지 <b>${destCount}</b>곳</div>
      <div class="summary-chip">총 <b>${totalDays}</b>일</div>
    </div>
  </div>
  ${renderDestSection(intl, '해외 여행', '✈️', '아직 등록된 해외 여행지가 없어요.', 'intl')}
  ${renderDestSection(domestic, '국내 여행', '🚗', '아직 등록된 국내 여행지가 없어요.', 'domestic')}
  `;
}

function renderDestPage(d, tab) {
  const tabs = [
    ['overview', '개요'],
    ['packing', '준비물'],
    ['outfit', '코디'],
    ['itinerary', '일정'],
    ['journal', '일기'],
    ['budget', '예산']
  ];
  const tabBar = tabs.map(([key, label]) =>
    `<button class="tab-btn ${tab === key ? 'active' : ''}" data-goto="dest/${d.id}/${key}">${label}</button>`
  ).join('');

  let content = '';
  if (tab === 'packing') content = renderPacking(d);
  else if (tab === 'outfit') content = renderOutfit(d);
  else if (tab === 'itinerary') content = renderItinerary(d);
  else if (tab === 'journal') content = renderJournal(d);
  else if (tab === 'budget') content = renderBudget(d);
  else content = renderOverview(d);

  const typeLabel = d.type === 'domestic' ? '🚗 국내' : '✈️ 해외';

  return `
  <div class="page-header">
    <button class="back-btn" data-goto="">← 홈</button>
    <div class="page-title-block">
      <h2>${d.flag} ${escapeHtml(d.name || '이름없음')}</h2>
      <div class="page-dates">${typeLabel} · ${escapeHtml(d.country || '')} ${d.dateStart ? '· ' + fmtDate(d.dateStart) + ' - ' + fmtDate(d.dateEnd) : ''}</div>
    </div>
    <div class="page-actions">
      <button data-edit-dest="${d.id}" title="여행지 수정">✎</button>
    </div>
  </div>
  <div class="tab-bar">${tabBar}</div>
  <div class="diary-page">${content}</div>
  `;
}

function renderOverview(d) {
  const packedTotal = d.packing.reduce((s, c) => s + c.items.length, 0);
  const packedDone = d.packing.reduce((s, c) => s + c.items.filter(i => i.checked).length, 0);
  const scheduleCount = Object.values(d.itinerary).reduce((s, arr) => s + arr.length, 0);
  const totalBudget = d.budget.reduce((s, c) => s + c.items.reduce((s2, i) => s2 + (Number(i.planned) || 0), 0), 0);
  const sym = currencySymbol(d);

  const bgmBlock = d.bgm
    ? `<div class="bgm-current">
         <span>🎵</span>
         <span class="bgm-file-name">${escapeHtml(d.bgm.name)}</span>
         <button data-remove-bgm="${d.id}" title="BGM 삭제">✕</button>
       </div>`
    : `<label class="bgm-upload-label">🎵 배경음악(BGM) 추가
         <input type="file" accept="audio/*" data-bgm-upload="${d.id}">
       </label>`;

  return `
    <label style="font-size:0.85rem;color:var(--ink-soft)">여행 메모</label>
    <textarea class="memo-box" data-memo="${d.id}" placeholder="이 여행지에서 하고 싶은 것, 꼭 가봐야 할 곳을 적어보세요...">${escapeHtml(d.memo || '')}</textarea>
    <div class="overview-stats">
      <div class="stat-box"><div class="stat-num">${d.days.length}</div><div class="stat-label">여행 일수</div></div>
      <div class="stat-box"><div class="stat-num">${packedDone}/${packedTotal}</div><div class="stat-label">준비물 체크</div></div>
      <div class="stat-box"><div class="stat-num">${scheduleCount}</div><div class="stat-label">일정 개수</div></div>
      <div class="stat-box"><div class="stat-num">${sym}${fmtMoney(totalBudget)}</div><div class="stat-label">예상 예산</div></div>
    </div>
    <div class="bgm-section">
      <h4>이 여행의 BGM</h4>
      ${bgmBlock}
      <p style="font-size:0.78rem;color:var(--ink-soft);margin-top:8px">등록하면 화면 오른쪽 아래 재생 버튼으로 들을 수 있어요.</p>
    </div>
  `;
}

function renderPacking(d) {
  const blocks = d.packing.map(cat => {
    const done = cat.items.filter(i => i.checked).length;
    const rows = cat.items.map(it => `
      <div class="item-row">
        <input type="checkbox" ${it.checked ? 'checked' : ''} data-toggle-item="${d.id}|${cat.id}|${it.id}">
        <span class="item-name ${it.checked ? 'checked' : ''}">${escapeHtml(it.name)}</span>
        <button class="row-del" data-del-item="${d.id}|${cat.id}|${it.id}">✕</button>
      </div>
    `).join('') || '<p class="empty-hint" style="padding:10px 0">아직 항목이 없어요</p>';

    return `
    <div class="category-block">
      <div class="category-head">
        <h4>${escapeHtml(cat.name)}</h4>
        <span class="category-progress"><b>${done}</b>/${cat.items.length}</span>
      </div>
      ${rows}
      <form class="inline-add" data-add-item="${d.id}|${cat.id}">
        <input type="text" placeholder="항목 추가 (예: 여권)" required>
        <button type="submit">추가</button>
      </form>
    </div>`;
  }).join('');

  return `
    ${blocks}
    <form class="add-category-row" data-add-category="${d.id}">
      <input type="text" placeholder="새 카테고리 (예: 의약품)" required>
      <button type="submit">＋ 카테고리 추가</button>
    </form>
  `;
}

function renderOutfit(d) {
  if (!d.days.length) return renderNoDaysHint();
  const cards = d.days.map((day, idx) => {
    const o = d.outfits[day.id] || {};
    return `
    <div class="day-card">
      <div class="day-title"><span>Day ${idx + 1}</span><span class="day-date">${fmtDate(day.date)}</span></div>
      <div class="field-row"><label>날씨</label><input type="text" value="${escapeHtml(o.weather || '')}" data-outfit="${d.id}|${day.id}|weather" placeholder="맑음 · 25도"></div>
      <div class="field-row"><label>상의</label><input type="text" value="${escapeHtml(o.top || '')}" data-outfit="${d.id}|${day.id}|top"></div>
      <div class="field-row"><label>하의</label><input type="text" value="${escapeHtml(o.bottom || '')}" data-outfit="${d.id}|${day.id}|bottom"></div>
      <div class="field-row"><label>아우터</label><input type="text" value="${escapeHtml(o.outer || '')}" data-outfit="${d.id}|${day.id}|outer"></div>
      <div class="field-row"><label>신발/기타</label><input type="text" value="${escapeHtml(o.shoes || '')}" data-outfit="${d.id}|${day.id}|shoes"></div>
      <div class="field-row"><label>메모</label><textarea data-outfit="${d.id}|${day.id}|memo" placeholder="많이 걷는 날, 실내 위주 등">${escapeHtml(o.memo || '')}</textarea></div>
    </div>`;
  }).join('');
  return `<div class="day-grid">${cards}</div>`;
}

function renderItinerary(d) {
  if (!d.days.length) return renderNoDaysHint();
  const cards = d.days.map((day, idx) => {
    const list = d.itinerary[day.id] || [];
    const items = list.map((s, i) => `
      <div class="schedule-item">
        <div class="schedule-order">
          <button class="order-btn" data-move-sched="${d.id}|${day.id}|${s.id}|up" ${i === 0 ? 'disabled' : ''} title="위로">▲</button>
          <button class="order-btn" data-move-sched="${d.id}|${day.id}|${s.id}|down" ${i === list.length - 1 ? 'disabled' : ''} title="아래로">▼</button>
        </div>
        <button class="row-del" data-del-sched="${d.id}|${day.id}|${s.id}">✕</button>
        <div class="schedule-time-title">
          <input type="text" value="${escapeHtml(s.time || '')}" placeholder="09:00" data-sched="${d.id}|${day.id}|${s.id}|time">
          <input type="text" value="${escapeHtml(s.title || '')}" placeholder="활동" data-sched="${d.id}|${day.id}|${s.id}|title">
        </div>
        <div class="field-row" style="margin-top:6px"><input type="text" value="${escapeHtml(s.location || '')}" placeholder="장소" data-sched="${d.id}|${day.id}|${s.id}|location"></div>
        <div class="field-row"><input type="text" value="${escapeHtml(s.memo || '')}" placeholder="메모" data-sched="${d.id}|${day.id}|${s.id}|memo"></div>
      </div>
    `).join('');
    return `
    <div class="day-card">
      <div class="day-title"><span>Day ${idx + 1}</span><span class="day-date">${fmtDate(day.date)}</span></div>
      ${items}
      <button class="add-schedule-btn" data-add-sched="${d.id}|${day.id}">＋ 일정 추가</button>
    </div>`;
  }).join('');
  return `<div class="day-grid">${cards}</div>`;
}

function renderJournal(d) {
  if (!d.days.length) return renderNoDaysHint();
  const cards = d.days.map((day, idx) => {
    const j = d.journal[day.id] || { text: '', photos: [] };
    const photos = (j.photos || []).map(p => `
      <div class="photo-thumb">
        <img data-photo-thumb="${p.id}" alt="사진">
        <button class="photo-del" data-del-photo="${d.id}|${day.id}|${p.id}">✕</button>
      </div>
    `).join('');
    return `
    <div class="day-card journal-day">
      <div class="day-title"><span>Day ${idx + 1}</span><span class="day-date">${fmtDate(day.date)}</span></div>
      <textarea class="memo-box journal-textarea" data-journal="${d.id}|${day.id}" placeholder="오늘 있었던 일, 느낀 점을 자유롭게 적어보세요...">${escapeHtml(j.text || '')}</textarea>
      <div class="photo-grid">
        ${photos}
        <label class="photo-add-tile" title="사진 추가">📷
          <input type="file" accept="image/*" multiple data-add-photo="${d.id}|${day.id}">
        </label>
      </div>
    </div>`;
  }).join('');
  return `<div class="day-grid">${cards}</div>`;
}

function renderNoDaysHint() {
  return `<p class="empty-hint">여행지의 시작일 · 종료일을 설정하면 Day별로 자동으로 나뉘어요.<br>상단 ✎ 버튼으로 날짜를 입력해보세요.</p>`;
}

function renderBudget(d) {
  let plannedTotal = 0, actualTotal = 0;
  const sym = currencySymbol(d);
  const rows = d.budget.map(cat => {
    const itemRows = cat.items.map(it => {
      plannedTotal += Number(it.planned) || 0;
      actualTotal += Number(it.actual) || 0;
      return `
      <tr>
        <td></td>
        <td><input type="text" value="${escapeHtml(it.name)}" data-budget="${d.id}|${cat.id}|${it.id}|name"></td>
        <td><input class="num-input" type="number" value="${it.planned}" data-budget="${d.id}|${cat.id}|${it.id}|planned" placeholder="0"></td>
        <td><input class="num-input" type="number" value="${it.actual}" data-budget="${d.id}|${cat.id}|${it.id}|actual" placeholder="0"></td>
        <td><button class="row-del" data-del-budget="${d.id}|${cat.id}|${it.id}">✕</button></td>
      </tr>`;
    }).join('');
    return `
      <tr><td colspan="5" class="cat-label">${escapeHtml(cat.name)}</td></tr>
      ${itemRows}
      <tr>
        <td></td>
        <td colspan="4">
          <form class="inline-add" data-add-budget="${d.id}|${cat.id}">
            <input type="text" placeholder="항목 추가 (예: 야간버스)" required>
            <button type="submit">추가</button>
          </form>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="budget-summary">
      <div class="stat-box total"><div class="stat-num">${sym}${fmtMoney(plannedTotal)}</div><div class="stat-label">예상 총액</div></div>
      <div class="stat-box"><div class="stat-num">${sym}${fmtMoney(actualTotal)}</div><div class="stat-label">실제 지출</div></div>
      <div class="stat-box"><div class="stat-num">${sym}${fmtMoney(plannedTotal - actualTotal)}</div><div class="stat-label">차액</div></div>
    </div>
    <table class="budget-table">
      <thead><tr><th></th><th>항목</th><th>예상 (${sym})</th><th>실제 (${sym})</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ===================== 이벤트 바인딩 ===================== */
function bindEvents() {
  const app = document.getElementById('app');

  app.querySelectorAll('[data-goto]').forEach(el => {
    el.addEventListener('click', () => { location.hash = '#/' + el.dataset.goto; });
  });

  app.querySelectorAll('[data-open-dest]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.card-menu')) return;
      location.hash = '#/dest/' + el.dataset.openDest + '/overview';
    });
  });

  app.querySelectorAll('[data-add-dest]').forEach(el => {
    el.addEventListener('click', () => openDestModal(null, el.dataset.addDest));
  });
  app.querySelectorAll('[data-edit-dest]').forEach(el => {
    el.addEventListener('click', (e) => { e.stopPropagation(); openDestModal(el.dataset.editDest); });
  });
  app.querySelectorAll('[data-del-dest]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const d = findDest(el.dataset.delDest);
      if (d && confirm(`'${d.name}' 여행지를 삭제할까요? 저장된 모든 내용이 사라져요.`)) {
        state.destinations = state.destinations.filter(x => x.id !== d.id);
        save(); render();
      }
    });
  });

  // 개요 메모
  app.querySelectorAll('[data-memo]').forEach(el => {
    el.addEventListener('input', () => {
      findDest(el.dataset.memo).memo = el.value;
      save();
    });
  });

  // BGM
  app.querySelectorAll('[data-bgm-upload]').forEach(el => {
    el.addEventListener('change', async () => {
      const dId = el.dataset.bgmUpload;
      const file = el.files[0];
      if (!file) return;
      const fileId = uid();
      await filePut(fileId, file);
      findDest(dId).bgm = { fileId, name: file.name };
      save(); render();
    });
  });
  app.querySelectorAll('[data-remove-bgm]').forEach(el => {
    el.addEventListener('click', async () => {
      const dId = el.dataset.removeBgm;
      const dest = findDest(dId);
      if (dest.bgm) { await fileDelete(dest.bgm.fileId); dest.bgm = null; }
      save(); render();
    });
  });

  // 준비물
  app.querySelectorAll('[data-toggle-item]').forEach(el => {
    el.addEventListener('change', () => {
      const [dId, cId, iId] = el.dataset.toggleItem.split('|');
      const it = findDest(dId).packing.find(c => c.id === cId).items.find(i => i.id === iId);
      it.checked = el.checked;
      save(); render();
    });
  });
  app.querySelectorAll('[data-del-item]').forEach(el => {
    el.addEventListener('click', () => {
      const [dId, cId, iId] = el.dataset.delItem.split('|');
      const cat = findDest(dId).packing.find(c => c.id === cId);
      cat.items = cat.items.filter(i => i.id !== iId);
      save(); render();
    });
  });
  app.querySelectorAll('[data-add-item]').forEach(el => {
    el.addEventListener('submit', (e) => {
      e.preventDefault();
      const [dId, cId] = el.dataset.addItem.split('|');
      const input = el.querySelector('input');
      const name = input.value.trim();
      if (!name) return;
      findDest(dId).packing.find(c => c.id === cId).items.push({ id: uid(), name, checked: false });
      save(); render();
    });
  });
  app.querySelectorAll('[data-add-category]').forEach(el => {
    el.addEventListener('submit', (e) => {
      e.preventDefault();
      const dId = el.dataset.addCategory;
      const input = el.querySelector('input');
      const name = input.value.trim();
      if (!name) return;
      findDest(dId).packing.push({ id: uid(), name, items: [] });
      save(); render();
    });
  });

  // 코디
  app.querySelectorAll('[data-outfit]').forEach(el => {
    el.addEventListener('input', () => {
      const [dId, dayId, field] = el.dataset.outfit.split('|');
      const dest = findDest(dId);
      if (!dest.outfits[dayId]) dest.outfits[dayId] = {};
      dest.outfits[dayId][field] = el.value;
      save();
    });
  });

  // 일정
  app.querySelectorAll('[data-add-sched]').forEach(el => {
    el.addEventListener('click', () => {
      const [dId, dayId] = el.dataset.addSched.split('|');
      const dest = findDest(dId);
      if (!dest.itinerary[dayId]) dest.itinerary[dayId] = [];
      dest.itinerary[dayId].push({ id: uid(), time: '', title: '', location: '', memo: '' });
      save(); render();
    });
  });
  app.querySelectorAll('[data-del-sched]').forEach(el => {
    el.addEventListener('click', () => {
      const [dId, dayId, sId] = el.dataset.delSched.split('|');
      const dest = findDest(dId);
      dest.itinerary[dayId] = (dest.itinerary[dayId] || []).filter(s => s.id !== sId);
      save(); render();
    });
  });
  app.querySelectorAll('[data-move-sched]').forEach(el => {
    el.addEventListener('click', () => {
      const [dId, dayId, sId, dir] = el.dataset.moveSched.split('|');
      const list = findDest(dId).itinerary[dayId] || [];
      const i = list.findIndex(s => s.id === sId);
      const j = dir === 'up' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      save(); render();
    });
  });
  app.querySelectorAll('[data-sched]').forEach(el => {
    el.addEventListener('input', () => {
      const [dId, dayId, sId, field] = el.dataset.sched.split('|');
      const dest = findDest(dId);
      const sched = dest.itinerary[dayId].find(s => s.id === sId);
      sched[field] = el.value;
      save();
    });
  });

  // 일기
  app.querySelectorAll('[data-journal]').forEach(el => {
    el.addEventListener('input', () => {
      const [dId, dayId] = el.dataset.journal.split('|');
      const dest = findDest(dId);
      if (!dest.journal[dayId]) dest.journal[dayId] = { text: '', photos: [] };
      dest.journal[dayId].text = el.value;
      save();
    });
  });
  app.querySelectorAll('[data-add-photo]').forEach(el => {
    el.addEventListener('change', async () => {
      const [dId, dayId] = el.dataset.addPhoto.split('|');
      const files = Array.from(el.files || []);
      if (!files.length) return;
      const dest = findDest(dId);
      if (!dest.journal[dayId]) dest.journal[dayId] = { text: '', photos: [] };
      for (const file of files) {
        const blob = await resizeImageFile(file);
        const fileId = uid();
        await filePut(fileId, blob);
        dest.journal[dayId].photos.push({ id: fileId, name: file.name });
      }
      save(); render();
    });
  });
  app.querySelectorAll('[data-del-photo]').forEach(el => {
    el.addEventListener('click', async () => {
      const [dId, dayId, pId] = el.dataset.delPhoto.split('|');
      const dest = findDest(dId);
      const j = dest.journal[dayId];
      if (j) {
        await fileDelete(pId);
        j.photos = j.photos.filter(p => p.id !== pId);
      }
      save(); render();
    });
  });

  // 예산
  app.querySelectorAll('[data-add-budget]').forEach(el => {
    el.addEventListener('submit', (e) => {
      e.preventDefault();
      const [dId, cId] = el.dataset.addBudget.split('|');
      const input = el.querySelector('input');
      const name = input.value.trim();
      if (!name) return;
      findDest(dId).budget.find(c => c.id === cId).items.push({ id: uid(), name, planned: '', actual: '' });
      save(); render();
    });
  });
  app.querySelectorAll('[data-del-budget]').forEach(el => {
    el.addEventListener('click', () => {
      const [dId, cId, iId] = el.dataset.delBudget.split('|');
      const cat = findDest(dId).budget.find(c => c.id === cId);
      cat.items = cat.items.filter(i => i.id !== iId);
      save(); render();
    });
  });
  app.querySelectorAll('[data-budget]').forEach(el => {
    el.addEventListener('input', () => {
      const [dId, cId, iId, field] = el.dataset.budget.split('|');
      const it = findDest(dId).budget.find(c => c.id === cId).items.find(i => i.id === iId);
      it[field] = el.value;
      save();
      if (field === 'planned' || field === 'actual') render();
    });
  });
}

/* ===================== 여행지 추가/수정 모달 ===================== */
const destModal = document.getElementById('destModal');
const destForm = document.getElementById('destForm');
let editingId = null;
let nextNewColor = DEST_COLORS[0];

function openDestModal(id, presetType) {
  editingId = id;
  const d = id ? findDest(id) : null;
  document.getElementById('destModalTitle').textContent = d ? '여행지 수정' : '새 여행지 추가';
  document.getElementById('f-name').value = d ? d.name : '';
  document.getElementById('f-country').value = d ? d.country : '';
  const type = d ? d.type : (presetType === 'domestic' ? 'domestic' : 'intl');
  document.querySelector(`input[name="f-type"][value="${type}"]`).checked = true;
  document.getElementById('f-flag').value = d ? d.flag : (type === 'domestic' ? '🚗' : '✈️');
  document.getElementById('f-start').value = d ? d.dateStart : '';
  document.getElementById('f-end').value = d ? d.dateEnd : '';
  nextNewColor = DEST_COLORS[state.destinations.length % DEST_COLORS.length];
  document.getElementById('f-color').value = d ? d.color : nextNewColor;
  document.getElementById('f-memo').value = d ? d.memo : '';
  destModal.classList.remove('hidden');
}

function closeDestModal() {
  destModal.classList.add('hidden');
  editingId = null;
}

document.getElementById('destCancelBtn').addEventListener('click', closeDestModal);
destModal.addEventListener('click', (e) => { if (e.target === destModal) closeDestModal(); });

destForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const fields = {
    name: document.getElementById('f-name').value.trim(),
    country: document.getElementById('f-country').value.trim(),
    type: document.querySelector('input[name="f-type"]:checked').value,
    flag: document.getElementById('f-flag').value.trim(),
    dateStart: document.getElementById('f-start').value,
    dateEnd: document.getElementById('f-end').value,
    color: document.getElementById('f-color').value,
    memo: document.getElementById('f-memo').value.trim()
  };
  if (!fields.flag) fields.flag = fields.type === 'domestic' ? '🚗' : '✈️';

  if (editingId) {
    const d = findDest(editingId);
    const oldStart = d.dateStart, oldEnd = d.dateEnd;
    Object.assign(d, fields);
    if (oldStart !== fields.dateStart || oldEnd !== fields.dateEnd) {
      d.days = buildDays(fields.dateStart, fields.dateEnd);
      d.outfits = {};
      d.itinerary = {};
      d.journal = {};
    }
  } else {
    state.destinations.push(makeDestination(fields));
  }
  save();
  closeDestModal();
  render();
});
