/* ===================== 상태 & 저장 ===================== */
const STORAGE_KEY = 'travelDiaryData_v1';
const PACKING_TEMPLATE = ['의류', '전자기기', '세면도구/화장품', '서류/기타'];
const BUDGET_TEMPLATE = ['교통', '숙소', '식비', '관광/액티비티', '쇼핑/기타'];

let state = load() || seedData();
save();

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

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function seedData() {
  const dest = makeDestination({
    name: '파리',
    country: '프랑스',
    flag: '🇫🇷',
    color: '#c97b63',
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
    flag: fields.flag || '✈️',
    color: fields.color || '#c97b63',
    dateStart: fields.dateStart || '',
    dateEnd: fields.dateEnd || '',
    memo: fields.memo || '',
    days,
    packing: PACKING_TEMPLATE.map(name => ({ id: uid(), name, items: [] })),
    budget: BUDGET_TEMPLATE.map(name => ({ id: uid(), name, items: [] })),
    outfits: {},
    itinerary: {}
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
}

function renderHome() {
  const destCount = state.destinations.length;
  const totalDays = state.destinations.reduce((s, d) => s + (d.days.length || 0), 0);
  const totalBudget = state.destinations.reduce((sum, d) =>
    sum + d.budget.reduce((s2, c) => s2 + c.items.reduce((s3, it) => s3 + (Number(it.planned) || 0), 0), 0), 0);

  const cards = state.destinations.map(d => {
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

  return `
  <div class="hero">
    <h1 class="hero-title">🧳 여행 다이어리</h1>
    <p class="hero-sub">나만의 유럽 여행을 한 페이지씩 기록해요</p>
    <div class="summary-bar">
      <div class="summary-chip">여행지 <b>${destCount}</b>곳</div>
      <div class="summary-chip">총 <b>${totalDays}</b>일</div>
      <div class="summary-chip">예상 예산 총 <b>€${fmtMoney(totalBudget)}</b></div>
    </div>
  </div>
  <div class="dest-grid">
    ${cards}
    <div class="dest-card add-card" data-add-dest="1">＋ 새 여행지 추가</div>
  </div>
  `;
}

function renderDestPage(d, tab) {
  const tabs = [
    ['overview', '개요'],
    ['packing', '준비물'],
    ['outfit', '코디'],
    ['itinerary', '일정'],
    ['budget', '예산']
  ];
  const tabBar = tabs.map(([key, label]) =>
    `<button class="tab-btn ${tab === key ? 'active' : ''}" data-goto="dest/${d.id}/${key}">${label}</button>`
  ).join('');

  let content = '';
  if (tab === 'packing') content = renderPacking(d);
  else if (tab === 'outfit') content = renderOutfit(d);
  else if (tab === 'itinerary') content = renderItinerary(d);
  else if (tab === 'budget') content = renderBudget(d);
  else content = renderOverview(d);

  return `
  <div class="page-header">
    <button class="back-btn" data-goto="">← 홈</button>
    <div class="page-title-block">
      <h2>${d.flag} ${escapeHtml(d.name || '이름없음')}</h2>
      <div class="page-dates">${escapeHtml(d.country || '')} ${d.dateStart ? '· ' + fmtDate(d.dateStart) + ' - ' + fmtDate(d.dateEnd) : ''}</div>
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

  return `
    <label style="font-size:0.85rem;color:var(--ink-soft)">여행 메모</label>
    <textarea class="memo-box" data-memo="${d.id}" placeholder="이 여행지에서 하고 싶은 것, 꼭 가봐야 할 곳을 적어보세요...">${escapeHtml(d.memo || '')}</textarea>
    <div class="overview-stats">
      <div class="stat-box"><div class="stat-num">${d.days.length}</div><div class="stat-label">여행 일수</div></div>
      <div class="stat-box"><div class="stat-num">${packedDone}/${packedTotal}</div><div class="stat-label">준비물 체크</div></div>
      <div class="stat-box"><div class="stat-num">${scheduleCount}</div><div class="stat-label">일정 개수</div></div>
      <div class="stat-box"><div class="stat-num">€${fmtMoney(totalBudget)}</div><div class="stat-label">예상 예산</div></div>
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
  if (!d.days.length) return renderNoDaysHint(d, '코디');
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
  if (!d.days.length) return renderNoDaysHint(d, '일정');
  const cards = d.days.map((day, idx) => {
    const list = d.itinerary[day.id] || [];
    const items = list.map(s => `
      <div class="schedule-item">
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

function renderNoDaysHint(d) {
  return `<p class="empty-hint">여행지의 시작일 · 종료일을 설정하면 Day별로 자동으로 나뉘어요.<br>상단 ✎ 버튼으로 날짜를 입력해보세요.</p>`;
}

function renderBudget(d) {
  let plannedTotal = 0, actualTotal = 0;
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
      <div class="stat-box total"><div class="stat-num">€${fmtMoney(plannedTotal)}</div><div class="stat-label">예상 총액</div></div>
      <div class="stat-box"><div class="stat-num">€${fmtMoney(actualTotal)}</div><div class="stat-label">실제 지출</div></div>
      <div class="stat-box"><div class="stat-num">€${fmtMoney(plannedTotal - actualTotal)}</div><div class="stat-label">차액</div></div>
    </div>
    <table class="budget-table">
      <thead><tr><th></th><th>항목</th><th>예상 (€)</th><th>실제 (€)</th><th></th></tr></thead>
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
    el.addEventListener('click', () => openDestModal(null));
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
  app.querySelectorAll('[data-sched]').forEach(el => {
    el.addEventListener('input', () => {
      const [dId, dayId, sId, field] = el.dataset.sched.split('|');
      const dest = findDest(dId);
      const sched = dest.itinerary[dayId].find(s => s.id === sId);
      sched[field] = el.value;
      save();
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
      if (field === 'planned' || field === 'actual') render(); else save();
      if (field !== 'planned' && field !== 'actual') return;
      save();
    });
  });
}

/* ===================== 여행지 추가/수정 모달 ===================== */
const destModal = document.getElementById('destModal');
const destForm = document.getElementById('destForm');
let editingId = null;

function openDestModal(id) {
  editingId = id;
  const d = id ? findDest(id) : null;
  document.getElementById('destModalTitle').textContent = d ? '여행지 수정' : '새 여행지 추가';
  document.getElementById('f-name').value = d ? d.name : '';
  document.getElementById('f-country').value = d ? d.country : '';
  document.getElementById('f-flag').value = d ? d.flag : '✈️';
  document.getElementById('f-start').value = d ? d.dateStart : '';
  document.getElementById('f-end').value = d ? d.dateEnd : '';
  document.getElementById('f-color').value = d ? d.color : '#c97b63';
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
    flag: document.getElementById('f-flag').value.trim() || '✈️',
    dateStart: document.getElementById('f-start').value,
    dateEnd: document.getElementById('f-end').value,
    color: document.getElementById('f-color').value,
    memo: document.getElementById('f-memo').value.trim()
  };

  if (editingId) {
    const d = findDest(editingId);
    const oldStart = d.dateStart, oldEnd = d.dateEnd;
    Object.assign(d, fields);
    if (oldStart !== fields.dateStart || oldEnd !== fields.dateEnd) {
      d.days = buildDays(fields.dateStart, fields.dateEnd);
      d.outfits = {};
      d.itinerary = {};
    }
  } else {
    state.destinations.push(makeDestination(fields));
  }
  save();
  closeDestModal();
  render();
});
