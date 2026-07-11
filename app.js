/* ===================== 동기화 코드 & 클라우드 (Firebase) =====================
   기기마다 따로였던 localStorage 데이터를, 사용자가 만든 "동기화 코드"를 문서 ID로
   써서 Firestore에 저장한다. 로그인 계정 없이 코드 하나로 여러 기기를 연결한다.
   텍스트 데이터(여행지 정보/일정/예산 등)만 동기화하고, 사진·BGM 같은 파일은
   지금은 기기별 IndexedDB에만 남는다.
   save()가 스크립트 시작부에서 곧바로 한 번 호출되므로, save()가 참조하는
   scheduleCloudPush/syncCode는 반드시 그보다 앞서 선언되어야 한다. */
const firebaseConfig = {
  apiKey: "AIzaSyBvkNOKT19yF3tAYsTJAHv1q2MdNOsXG7c",
  authDomain: "traveler-db6e4.firebaseapp.com",
  projectId: "traveler-db6e4",
  storageBucket: "traveler-db6e4.firebasestorage.app",
  messagingSenderId: "753694849941",
  appId: "1:753694849941:web:c0a86326cf27ebee53549c"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const SYNC_CODE_KEY = 'travelDiarySyncCode';
let syncCode = localStorage.getItem(SYNC_CODE_KEY);
let cloudPushTimer = null;

function userDocRef() {
  return db.collection('travelDiaries').doc(syncCode);
}

function generateSyncCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (i % 4 === 3 && i !== 11) code += '-';
  }
  return code;
}

function mergeCloudState(local, cloud) {
  if (!cloud || !Array.isArray(cloud.destinations)) return local;
  if (!local || !Array.isArray(local.destinations)) return cloud;
  const cloudIds = new Set(cloud.destinations.map(d => d.id));
  const localOnly = local.destinations.filter(d => !cloudIds.has(d.id));
  return { ...cloud, destinations: [...cloud.destinations, ...localOnly] };
}

function scheduleCloudPush() {
  if (!syncCode) return;
  clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(() => {
    userDocRef().set(state).catch(err => console.error('클라우드 저장 실패', err));
  }, 900);
}

async function pullAndMergeCloud() {
  const snap = await userDocRef().get();
  if (snap.exists) {
    state = mergeCloudState(state, snap.data());
  }
  normalizeState();
  migrateColors();
  save(true);
  await userDocRef().set(state);
}

function showApp(ready) {
  document.querySelectorAll('.site-nav, #app, .site-footer').forEach(el => el.classList.toggle('hidden', !ready));
  document.getElementById('authScreen').classList.toggle('hidden', ready);
}

async function connectWithCode(code) {
  syncCode = code;
  localStorage.setItem(SYNC_CODE_KEY, syncCode);
  showApp(true);
  const attempts = 3;
  for (let i = 0; i < attempts; i++) {
    try {
      await pullAndMergeCloud();
      break;
    } catch (e) {
      console.error('클라우드 동기화 실패' + (i < attempts - 1 ? ' (재시도 중...)' : ''), e);
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  render();
}

if (syncCode) {
  // 페이지 로드 직후에는 Firestore SDK의 최초 연결이 완료되기 전이라
  // 요청이 간헐적으로 실패할 수 있어 살짝 지연 후 시작한다.
  setTimeout(() => connectWithCode(syncCode), 400);
} else {
  showApp(false);
}

const codeCreatedView = document.getElementById('codeCreatedView');
const codeChooseView = document.getElementById('codeChooseView');
const authErrorEl = document.getElementById('authError');

document.getElementById('createCodeBtn').addEventListener('click', () => {
  const code = generateSyncCode();
  document.getElementById('newCodeValue').textContent = code;
  codeCreatedView.dataset.pendingCode = code;
  codeChooseView.classList.add('hidden');
  codeCreatedView.classList.remove('hidden');
});

document.getElementById('newCodeCopyBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('newCodeValue').textContent).then(() => showToast('📋 복사했어요')).catch(() => {});
});

document.getElementById('newCodeContinueBtn').addEventListener('click', () => {
  connectWithCode(codeCreatedView.dataset.pendingCode);
});

document.getElementById('joinCodeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  authErrorEl.textContent = '';
  if (code.length < 8) {
    authErrorEl.textContent = '코드를 정확히 입력해주세요.';
    return;
  }
  await connectWithCode(code);
});

const codeInfoBox = document.getElementById('codeInfoBox');
document.getElementById('codeInfoBtn').addEventListener('click', () => {
  document.getElementById('codeInfoValue').textContent = syncCode || '-';
  codeInfoBox.classList.toggle('hidden');
});
document.getElementById('codeCopyBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(syncCode || '').then(() => showToast('📋 복사했어요')).catch(() => {});
});
document.getElementById('codeResetBtn').addEventListener('click', () => {
  if (!confirm('다른 코드로 새로 시작할까요? 이 기기는 지금 코드와의 연결이 끊겨요 (클라우드에 저장된 데이터는 그대로 남아있어요).')) return;
  localStorage.removeItem(SYNC_CODE_KEY);
  location.reload();
});

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
  scheduleCloudPush();
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
    if (!d.lodging) d.lodging = [];
    if (d.mapLink === undefined) d.mapLink = '';
    if (d.weatherLocation === undefined) d.weatherLocation = '';
    if (!d.links) d.links = [];
  });
}

/* ===================== 구글 지도 (API 키 불필요) ===================== */
function mapSearchUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function isSafeHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

function dayRouteUrl(list) {
  const locs = (list || []).map(s => (s.location || '').trim()).filter(Boolean);
  if (!locs.length) return null;
  if (locs.length === 1) return mapSearchUrl(locs[0]);
  const origin = locs[0];
  const destination = locs[locs.length - 1];
  const waypoints = locs.slice(1, -1);
  let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
  if (waypoints.length) url += `&waypoints=${waypoints.map(encodeURIComponent).join('|')}`;
  return url;
}

function nightsBetween(start, end) {
  if (!start || !end) return null;
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  if (isNaN(s) || isNaN(e) || e < s) return null;
  return Math.round((e - s) / 86400000);
}

/* ===================== 날씨 (Open-Meteo, API 키 불필요) =====================
   여행지 이름 -> 위경도(geocoding) -> 그 위경도의 날짜별 예보를 가져온다.
   여행지마다 위경도가 다르므로 캐시도 여행지별로 분리되어, 한 여행지의 날씨가
   다른 여행지에 섞이지 않는다. */
const geocodeCache = {};
const weatherCache = {};

const WEATHER_CODE_MAP = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌦️',
  61: '🌧️', 63: '🌧️', 65: '🌧️', 66: '🌧️', 67: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '❄️', 77: '❄️',
  80: '🌦️', 81: '🌦️', 82: '⛈️',
  85: '🌨️', 86: '🌨️',
  95: '⛈️', 96: '⛈️', 99: '⛈️'
};

async function geocodeLocation(query) {
  if (query in geocodeCache) return geocodeCache[query];
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
    const data = await res.json();
    const first = data && data[0];
    geocodeCache[query] = first ? { lat: parseFloat(first.lat), lon: parseFloat(first.lon) } : null;
  } catch (e) {
    geocodeCache[query] = null;
  }
  return geocodeCache[query];
}

async function fetchDailyWeather(lat, lon, startDate, endDate) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}|${startDate}|${endDate}`;
  if (key in weatherCache) return weatherCache[key];
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${startDate}&end_date=${endDate}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('forecast fetch failed');
    const data = await res.json();
    weatherCache[key] = data.daily || null;
  } catch (e) {
    weatherCache[key] = null;
  }
  return weatherCache[key];
}

async function hydrateWeather() {
  const app = document.getElementById('app');
  const els = Array.from(app.querySelectorAll('[data-weather-day]'));
  if (!els.length) return;

  const byDest = {};
  els.forEach(el => {
    const [destId, date] = el.dataset.weatherDay.split('|');
    (byDest[destId] = byDest[destId] || []).push({ el, date });
  });

  for (const destId in byDest) {
    const dest = findDest(destId);
    const group = byDest[destId];
    const query = dest ? (dest.weatherLocation || `${dest.name} ${dest.country}`.trim()) : '';
    if (!query) { group.forEach(({ el }) => { el.textContent = ''; }); continue; }

    const geo = await geocodeLocation(query);
    if (!geo) {
      group.forEach(({ el }) => { el.innerHTML = `<span class="weather-na">위치를 찾을 수 없어요</span>`; });
      continue;
    }

    const dates = group.map(g => g.date).sort();
    const daily = await fetchDailyWeather(geo.lat, geo.lon, dates[0], dates[dates.length - 1]);
    group.forEach(({ el, date }) => {
      const idx = daily && daily.time ? daily.time.indexOf(date) : -1;
      if (idx === -1) {
        el.innerHTML = `<span class="weather-na">예보 범위 밖 (출발 16일 전부터 표시)</span>`;
        return;
      }
      const icon = WEATHER_CODE_MAP[daily.weathercode[idx]] || '🌡️';
      const tmax = Math.round(daily.temperature_2m_max[idx]);
      const tmin = Math.round(daily.temperature_2m_min[idx]);
      el.innerHTML = `${icon} ${tmax}° / ${tmin}°`;
    });
  }
}

function migrateColors() {
  if (state.colorPaletteVersion === COLOR_PALETTE_VERSION) return;
  state.destinations.forEach((d, i) => {
    d.color = DEST_COLORS[i % DEST_COLORS.length];
  });
  state.colorPaletteVersion = COLOR_PALETTE_VERSION;
}

function currencySymbol(d) {
  return '₩';
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
  dest.lodging.push({
    id: uid(), name: '호텔 르 파리지앵', checkIn: '2026-08-10', checkOut: '2026-08-13',
    address: '12 Rue de Rivoli, Paris', memo: '예약번호 RSV-2284, 조식 포함'
  });
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
    lodging: [],
    links: [],
    bgm: null,
    mapLink: '',
    weatherLocation: ''
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

function dDayInfo(d) {
  if (!d.dateStart) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(d.dateStart + 'T00:00:00');
  const end = new Date((d.dateEnd || d.dateStart) + 'T00:00:00');
  const diffStart = Math.round((start - today) / 86400000);
  const diffEnd = Math.round((end - today) / 86400000);
  if (diffStart > 0) return { label: `D-${diffStart}`, kind: 'upcoming' };
  if (diffEnd >= 0) return { label: diffStart === 0 ? 'D-DAY' : '여행 중', kind: diffStart === 0 ? 'today' : 'ongoing' };
  return { label: '다녀왔어요', kind: 'past' };
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

/* ===================== 백업 내보내기 / 불러오기 ===================== */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function collectFileIds() {
  const ids = new Set();
  state.destinations.forEach(d => {
    Object.values(d.journal || {}).forEach(j => (j.photos || []).forEach(p => ids.add(p.id)));
    if (d.bgm && d.bgm.fileId) ids.add(d.bgm.fileId);
  });
  return Array.from(ids);
}

async function exportBackup() {
  showToast('💾 백업 파일 만드는 중...');
  const fileIds = collectFileIds();
  const files = {};
  for (const id of fileIds) {
    try {
      const blob = await fileGet(id);
      if (blob) files[id] = { type: blob.type, data: await blobToBase64(blob) };
    } catch (e) { /* 해당 파일은 건너뜀 */ }
  }
  const payload = { app: 'travel-diary', version: 1, exportedAt: new Date().toISOString(), state, files };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `여행다이어리_백업_${toLocalISODate(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('✅ 백업 파일이 다운로드됐어요');
}

async function importBackup(file) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch (e) {
    alert('백업 파일을 읽을 수 없어요. 올바른 JSON 파일인지 확인해주세요.');
    return;
  }
  if (!payload || !payload.state || !Array.isArray(payload.state.destinations)) {
    alert('올바른 여행 다이어리 백업 파일이 아니에요.');
    return;
  }
  const count = payload.state.destinations.length;
  if (!confirm(`백업 파일에서 여행지 ${count}곳을 불러와 현재 목록에 추가할까요?\n(기존 데이터는 지워지지 않아요)`)) return;

  const files = payload.files || {};
  for (const id in files) {
    try {
      const res = await fetch(files[id].data);
      const blob = await res.blob();
      await filePut(id, blob);
    } catch (e) { /* 해당 파일은 건너뜀 */ }
  }

  payload.state.destinations.forEach(d => {
    if (state.destinations.some(existing => existing.id === d.id)) d.id = uid();
    state.destinations.push(d);
  });
  normalizeState();
  save();
  render();
  showToast(`✅ 여행지 ${count}곳을 불러왔어요`);
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
  hydrateWeather();
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
    const dday = dDayInfo(d);
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
        ${dday ? `<span class="dday-badge dday-${dday.kind}">${dday.label}</span>` : ''}
        <div class="dest-dates">${d.dateStart ? fmtDate(d.dateStart) + ' - ' + fmtDate(d.dateEnd) : '날짜 미정'}</div>
        <div class="dest-progress"><div class="dest-progress-fill" style="width:${pct}%"></div></div>
      </div>
    </div>`;
  }).join('');

  const subtotal = list.reduce((s, d) => s + destSubtotal(d), 0);
  const sym = '₩';

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
    <div class="backup-row">
      <button class="backup-btn" data-export-backup="1">⬇️ 전체 백업 다운로드</button>
      <label class="backup-btn">⬆️ 백업 불러오기
        <input type="file" accept="application/json" data-import-backup="1">
      </label>
    </div>
  </div>
  ${renderDestSection(intl, '해외 여행', '✈️', '아직 등록된 해외 여행지가 없어요.', 'intl')}
  ${renderDestSection(domestic, '국내 여행', '🚗', '아직 등록된 국내 여행지가 없어요.', 'domestic')}
  `;
}

function renderDestPage(d, tab) {
  if (tab === 'print') return renderPrintPage(d);
  const tabs = [
    ['overview', '개요'],
    ['itinerary', '일정'],
    ['outfit', '코디'],
    ['lodging', '숙소'],
    ['budget', '예산'],
    ['packing', '준비물'],
    ['links', '링크'],
    ['journal', '일기']
  ];
  const tabBar = tabs.map(([key, label]) =>
    `<button class="tab-btn ${tab === key ? 'active' : ''}" data-goto="dest/${d.id}/${key}">${label}</button>`
  ).join('');

  let content = '';
  if (tab === 'packing') content = renderPacking(d);
  else if (tab === 'lodging') content = renderLodging(d);
  else if (tab === 'links') content = renderLinks(d);
  else if (tab === 'outfit') content = renderOutfit(d);
  else if (tab === 'itinerary') content = renderItinerary(d);
  else if (tab === 'journal') content = renderJournal(d);
  else if (tab === 'budget') content = renderBudget(d);
  else content = renderOverview(d);

  const typeLabel = d.type === 'domestic' ? '🚗 국내' : '✈️ 해외';
  const dday = dDayInfo(d);

  return `
  <div class="page-header">
    <button class="back-btn" data-goto="">← 홈</button>
    <div class="page-title-block">
      <h2>${d.flag} ${escapeHtml(d.name || '이름없음')} ${dday ? `<span class="dday-badge dday-${dday.kind}">${dday.label}</span>` : ''}</h2>
      <div class="page-dates">${typeLabel} · ${escapeHtml(d.country || '')} ${d.dateStart ? '· ' + fmtDate(d.dateStart) + ' - ' + fmtDate(d.dateEnd) : ''}</div>
    </div>
    <div class="page-actions">
      <button data-goto="dest/${d.id}/print" title="인쇄 / PDF로 저장">🖨️</button>
      <button data-edit-dest="${d.id}" title="여행지 수정">✎</button>
    </div>
  </div>
  <div class="tab-bar">${tabBar}</div>
  <div class="diary-page">${content}</div>
  `;
}

function renderPrintPage(d) {
  const sym = currencySymbol(d);

  const packingHtml = d.packing.map(cat => `
    <h3>${escapeHtml(cat.name)}</h3>
    <ul class="print-list">
      ${cat.items.map(it => `<li>${it.checked ? '☑' : '☐'} ${escapeHtml(it.name)}</li>`).join('') || '<li class="print-empty">-</li>'}
    </ul>
  `).join('');

  const sortedLodging = [...d.lodging].sort((a, b) => (a.checkIn || '9999').localeCompare(b.checkIn || '9999'));
  const lodgingHtml = sortedLodging.length ? `
    <table class="print-table">
      <thead><tr><th>숙소</th><th>체크인</th><th>체크아웃</th><th>주소</th></tr></thead>
      <tbody>
        ${sortedLodging.map(l => `<tr><td>${escapeHtml(l.name)}</td><td>${fmtDate(l.checkIn)}</td><td>${fmtDate(l.checkOut)}</td><td>${escapeHtml(l.address || '')}</td></tr>`).join('')}
      </tbody>
    </table>` : '<p class="print-empty">등록된 숙소가 없어요</p>';

  const itineraryHtml = d.days.map((day, idx) => {
    const list = d.itinerary[day.id] || [];
    return `
    <h3>Day ${idx + 1} · ${fmtDate(day.date)} <span class="day-weather" data-weather-day="${d.id}|${day.date}"></span></h3>
    ${list.length ? `<ul class="print-list">
      ${list.map(s => `<li><b>${escapeHtml(s.time || '--:--')}</b> ${escapeHtml(s.title || '(제목 없음)')}${s.location ? ' · 📍' + escapeHtml(s.location) : ''}${s.memo ? ` <span class="print-memo">(${escapeHtml(s.memo)})</span>` : ''}</li>`).join('')}
    </ul>` : '<p class="print-empty">등록된 일정이 없어요</p>'}
    `;
  }).join('') || '<p class="print-empty">여행 날짜를 설정하면 일정이 표시돼요</p>';

  let plannedTotal = 0, actualTotal = 0;
  const budgetHtml = d.budget.map(cat => {
    const rows = cat.items.map(it => {
      plannedTotal += Number(it.planned) || 0;
      actualTotal += Number(it.actual) || 0;
      return `<tr><td>${escapeHtml(it.name)}</td><td>${sym}${fmtMoney(it.planned)}</td><td>${sym}${fmtMoney(it.actual)}</td></tr>`;
    }).join('');
    return rows ? `<tr><td colspan="3" class="print-cat">${escapeHtml(cat.name)}</td></tr>${rows}` : '';
  }).join('');

  return `
  <div class="print-toolbar no-print">
    <button data-goto="dest/${d.id}/overview">← 돌아가기</button>
    <button data-print-trigger="1">🖨️ 인쇄 / PDF로 저장</button>
  </div>
  <div class="print-page">
    <h1>${d.flag} ${escapeHtml(d.name || '이름없음')} 여행 계획</h1>
    <p class="print-sub">${escapeHtml(d.country || '')} ${d.dateStart ? '· ' + fmtDate(d.dateStart) + ' - ' + fmtDate(d.dateEnd) : ''}</p>
    ${d.memo ? `<p class="print-memo-block">${escapeHtml(d.memo)}</p>` : ''}

    <h2>✅ 준비물</h2>
    ${packingHtml || '<p class="print-empty">등록된 준비물이 없어요</p>'}

    <h2>🏨 숙소</h2>
    ${lodgingHtml}

    <h2>🗓️ 일정</h2>
    ${itineraryHtml}

    <h2>💰 예산</h2>
    <table class="print-table">
      <thead><tr><th>항목</th><th>예상</th><th>실제</th></tr></thead>
      <tbody>${budgetHtml || ''}</tbody>
      <tfoot><tr><td>합계</td><td>${sym}${fmtMoney(plannedTotal)}</td><td>${sym}${fmtMoney(actualTotal)}</td></tr></tfoot>
    </table>
  </div>
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

  const mapQuery = `${d.name} ${d.country}`.trim();

  return `
    <label style="font-size:0.85rem;color:var(--ink-soft)">여행 메모</label>
    <textarea class="memo-box" data-memo="${d.id}" placeholder="이 여행지에서 하고 싶은 것, 꼭 가봐야 할 곳을 적어보세요...">${escapeHtml(d.memo || '')}</textarea>
    <div class="overview-stats">
      <div class="stat-box"><div class="stat-num">${d.days.length}</div><div class="stat-label">여행 일수</div></div>
      <div class="stat-box"><div class="stat-num">${packedDone}/${packedTotal}</div><div class="stat-label">준비물 체크</div></div>
      <div class="stat-box"><div class="stat-num">${scheduleCount}</div><div class="stat-label">일정 개수</div></div>
      <div class="stat-box"><div class="stat-num">${sym}${fmtMoney(totalBudget)}</div><div class="stat-label">예상 예산</div></div>
    </div>
    ${mapQuery ? `
    <div class="map-section">
      <h4>🗺️ 지도</h4>
      <a class="map-card" href="${mapSearchUrl(mapQuery)}" target="_blank" rel="noopener">
        <span class="map-card-icon">📍</span>
        <span class="map-card-text">
          <span class="map-card-title">${escapeHtml(mapQuery)}</span>
          <span class="map-card-sub">Google 지도에서 열기 · 동선 짜기 ↗</span>
        </span>
      </a>
      <div class="map-link-row">
        <label>공유 지도 링크</label>
        <div class="map-link-input-row">
          <input type="url" placeholder="https://maps.app.goo.gl/..." value="${escapeHtml(d.mapLink || '')}" data-maplink="${d.id}">
          ${d.mapLink && isSafeHttpUrl(d.mapLink) ? `<a href="${escapeHtml(d.mapLink)}" target="_blank" rel="noopener" title="열기">↗</a>` : ''}
        </div>
      </div>
    </div>` : ''}
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

function renderLodging(d) {
  const sorted = [...d.lodging].sort((a, b) => (a.checkIn || '9999').localeCompare(b.checkIn || '9999'));
  const cards = sorted.map(l => {
    const nights = nightsBetween(l.checkIn, l.checkOut);
    return `
    <div class="lodging-card">
      <button class="row-del" data-del-lodging="${d.id}|${l.id}">✕</button>
      <div class="lodging-head">
        <span class="lodging-icon">🏨</span>
        <input type="text" class="lodging-name" value="${escapeHtml(l.name)}" placeholder="숙소 이름" data-lodging="${d.id}|${l.id}|name">
        ${nights !== null ? `<span class="lodging-nights">${nights}박</span>` : ''}
      </div>
      <div class="form-row">
        <div class="field-row"><label>체크인</label><input type="date" value="${l.checkIn || ''}" data-lodging="${d.id}|${l.id}|checkIn"></div>
        <div class="field-row"><label>체크아웃</label><input type="date" value="${l.checkOut || ''}" data-lodging="${d.id}|${l.id}|checkOut"></div>
      </div>
      <div class="field-row">
        <label>주소</label>
        <div class="lodging-address-row">
          <input type="text" value="${escapeHtml(l.address || '')}" placeholder="숙소 주소" data-lodging="${d.id}|${l.id}|address">
          ${l.address ? `<a href="${mapSearchUrl(l.address)}" target="_blank" rel="noopener" title="지도에서 보기">🗺️</a>` : ''}
        </div>
      </div>
      <div class="field-row"><label>메모</label><textarea placeholder="예약번호, 특이사항 등" data-lodging="${d.id}|${l.id}|memo">${escapeHtml(l.memo || '')}</textarea></div>
    </div>`;
  }).join('') || '<p class="empty-hint">아직 등록된 숙소가 없어요</p>';

  return `
    <div class="lodging-list">${cards}</div>
    <form class="add-category-row" data-add-lodging="${d.id}" style="margin-top:16px">
      <input type="text" placeholder="새 숙소 이름 (예: 호텔 르 파리지앵)" required>
      <button type="submit">＋ 숙소 추가</button>
    </form>
  `;
}

function renderLinks(d) {
  const cards = d.links.map(l => `
    <div class="link-card">
      <button class="row-del" data-del-link="${d.id}|${l.id}">✕</button>
      <div class="link-head">
        <span class="link-icon">🔗</span>
        <input type="text" class="link-title" value="${escapeHtml(l.title)}" placeholder="사이트 이름" data-link="${d.id}|${l.id}|title">
      </div>
      <div class="link-url-row">
        <input type="url" value="${escapeHtml(l.url || '')}" placeholder="https://..." data-link="${d.id}|${l.id}|url">
        ${l.url && isSafeHttpUrl(l.url) ? `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener" title="열기">↗</a>` : ''}
      </div>
    </div>
  `).join('') || '<p class="empty-hint">아직 등록된 링크가 없어요</p>';

  return `
    <div class="lodging-list">${cards}</div>
    <form class="add-link-form" data-add-link="${d.id}">
      <input type="text" placeholder="사이트 이름 (예: 기차 예매 사이트)" required>
      <input type="url" placeholder="https:// (선택, 나중에 채워도 돼요)">
      <button type="submit">＋ 링크 추가</button>
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
  const autoQuery = `${d.name} ${d.country}`.trim();
  const weatherLocRow = `
    <div class="weather-loc-row">
      <label>🌡️ 날씨 조회 위치</label>
      <input type="text" value="${escapeHtml(d.weatherLocation || '')}" placeholder="자동: ${escapeHtml(autoQuery)} (지명이 안 맞으면 직접 입력하세요)" data-weatherloc="${d.id}">
    </div>`;
  const cards = d.days.map((day, idx) => {
    const list = d.itinerary[day.id] || [];
    const items = list.map((s, i) => `
      <div class="schedule-item">
        <button class="row-del" data-del-sched="${d.id}|${day.id}|${s.id}">✕</button>
        <div class="schedule-row">
          <div class="schedule-order">
            <button class="order-btn" data-move-sched="${d.id}|${day.id}|${s.id}|up" ${i === 0 ? 'disabled' : ''} title="위로">▲</button>
            <button class="order-btn" data-move-sched="${d.id}|${day.id}|${s.id}|down" ${i === list.length - 1 ? 'disabled' : ''} title="아래로">▼</button>
          </div>
          <div class="schedule-fields">
            <div class="schedule-time-title">
              <input type="text" value="${escapeHtml(s.time || '')}" placeholder="09:00" data-sched="${d.id}|${day.id}|${s.id}|time">
              <input type="text" value="${escapeHtml(s.title || '')}" placeholder="활동" data-sched="${d.id}|${day.id}|${s.id}|title">
            </div>
            <div class="field-row"><input type="text" value="${escapeHtml(s.location || '')}" placeholder="📍 장소" data-sched="${d.id}|${day.id}|${s.id}|location"></div>
            <div class="field-row"><input type="text" value="${escapeHtml(s.memo || '')}" placeholder="📝 메모" data-sched="${d.id}|${day.id}|${s.id}|memo"></div>
          </div>
        </div>
      </div>
    `).join('');
    const routeUrl = dayRouteUrl(list);
    return `
    <div class="day-card">
      <div class="day-title"><span>Day ${idx + 1}</span><span class="day-date">${fmtDate(day.date)}</span></div>
      <div class="day-weather" data-weather-day="${d.id}|${day.date}">날씨 불러오는 중...</div>
      ${routeUrl ? `<a class="route-link" href="${routeUrl}" target="_blank" rel="noopener">🗺️ 이 날 동선 보기 ↗</a>` : ''}
      ${items}
      <button class="add-schedule-btn" data-add-sched="${d.id}|${day.id}">＋ 일정 추가</button>
    </div>`;
  }).join('');
  return `${weatherLocRow}<div class="day-grid">${cards}</div>`;
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

  app.querySelectorAll('[data-export-backup]').forEach(el => {
    el.addEventListener('click', () => { exportBackup(); });
  });
  app.querySelectorAll('[data-print-trigger]').forEach(el => {
    el.addEventListener('click', () => { window.print(); });
  });
  app.querySelectorAll('[data-import-backup]').forEach(el => {
    el.addEventListener('change', () => {
      const file = el.files[0];
      if (file) importBackup(file);
      el.value = '';
    });
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
  app.querySelectorAll('[data-maplink]').forEach(el => {
    el.addEventListener('change', () => {
      findDest(el.dataset.maplink).mapLink = el.value.trim();
      save(); render();
    });
  });
  app.querySelectorAll('[data-weatherloc]').forEach(el => {
    el.addEventListener('change', () => {
      findDest(el.dataset.weatherloc).weatherLocation = el.value.trim();
      save(); render();
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

  // 숙소
  app.querySelectorAll('[data-add-lodging]').forEach(el => {
    el.addEventListener('submit', (e) => {
      e.preventDefault();
      const dId = el.dataset.addLodging;
      const input = el.querySelector('input');
      const name = input.value.trim();
      if (!name) return;
      findDest(dId).lodging.push({ id: uid(), name, checkIn: '', checkOut: '', address: '', memo: '' });
      save(); render();
    });
  });
  app.querySelectorAll('[data-del-lodging]').forEach(el => {
    el.addEventListener('click', () => {
      const [dId, lId] = el.dataset.delLodging.split('|');
      const dest = findDest(dId);
      dest.lodging = dest.lodging.filter(l => l.id !== lId);
      save(); render();
    });
  });
  app.querySelectorAll('[data-lodging]').forEach(el => {
    el.addEventListener('input', () => {
      const [dId, lId, field] = el.dataset.lodging.split('|');
      const lodging = findDest(dId).lodging.find(l => l.id === lId);
      lodging[field] = el.value;
      save();
      if (field === 'checkIn' || field === 'checkOut') render();
    });
  });

  // 링크
  app.querySelectorAll('[data-add-link]').forEach(el => {
    el.addEventListener('submit', (e) => {
      e.preventDefault();
      const dId = el.dataset.addLink;
      const inputs = el.querySelectorAll('input');
      const title = inputs[0].value.trim();
      const url = inputs[1].value.trim();
      if (!title) return;
      findDest(dId).links.push({ id: uid(), title, url });
      save(); render();
    });
  });
  app.querySelectorAll('[data-del-link]').forEach(el => {
    el.addEventListener('click', () => {
      const [dId, lId] = el.dataset.delLink.split('|');
      const dest = findDest(dId);
      dest.links = dest.links.filter(l => l.id !== lId);
      save(); render();
    });
  });
  app.querySelectorAll('[data-link]').forEach(el => {
    el.addEventListener('change', () => {
      const [dId, lId, field] = el.dataset.link.split('|');
      const link = findDest(dId).links.find(l => l.id === lId);
      link[field] = el.value.trim();
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
