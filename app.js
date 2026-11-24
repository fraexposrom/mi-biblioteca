'use strict';

/* =========================================================
   Mi Biblioteca
   ========================================================= */

/* ---------- Constantes ---------- */
const TYPES = {
  libro:    { label: 'Libro',    creator: 'Autor',    icon: 'i-book' },
  cd:       { label: 'Música',   creator: 'Artista',  icon: 'i-disc' },
  pelicula: { label: 'Cine y series', creator: 'Director', icon: 'i-film' },
  juego:    { label: 'Juego',    creator: 'Editorial', icon: 'i-dice' },
};
const FORMATS = {
  libro: [],
  cd: ['CD', 'Vinilo', 'Casete'],
  pelicula: ['DVD', 'Blu-ray', '4K UHD', 'Grabada'],
  juego: [],
};
// Proporción (ancho/alto) por defecto de cada formato, para que el hueco se parezca al objeto real
const DEFAULT_AR = { libro: 2 / 3, juego: 1, CD: 1, Vinilo: 1, Casete: 0.64, DVD: 0.7, 'Blu-ray': 0.8, '4K UHD': 0.8, Grabada: 0.7 };
// Leído / visto (solo libros y películas)
const SEEN = {
  libro:    { done: 'Leído', mark: 'Marcar como leído', pend: 'Por leer', many: 'Leídos', ask: 'Ya lo he leído', verb: 'leído' },
  pelicula: { done: 'Vista', mark: 'Marcar como vista', pend: 'Por ver',  many: 'Vistas', ask: 'Ya la he visto', verb: 'vista' },  // película o serie
};
const canSee = i => !!SEEN[i.type];
const FORMAT_ICON = { CD: 'i-disc', Vinilo: 'i-vinyl', Casete: 'i-cassette' };
const PH_COLORS = {
  libro: ['#3F3566', '#5B4B8A', '#2E4A62', '#6B3E5E', '#2F5D50'],
  cd: ['#2F6F8F', '#1F4E5F', '#3B7A57', '#4A4E8F', '#7A3E65'],
  pelicula: ['#B5543C', '#8C3B2E', '#5E3A2F', '#A0522D', '#3D3D4E'],
  juego: ['#4F7A3A', '#7A5C2E', '#2F6B6B', '#8A4B2F', '#5A4B7A'],
};

/* ---------- Almacenamiento local (IndexedDB) ---------- */
const DB_NAME = 'mi-biblioteca';
const STORE = 'items';
let dbPromise;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    t.onerror = () => reject(t.error);
  });
}
const store = {
  all: () => tx('readonly', s => s.getAll()),
  put: item => tx('readwrite', s => s.put(item)),
  del: id => tx('readwrite', s => s.delete(id)),
  putMany: items => tx('readwrite', s => { items.forEach(i => s.put(i)); }),
};

/* ---------- Estado ---------- */
const state = {
  items: [],
  type: localStorage.getItem('mb-type') || 'all',
  format: 'all',
  loaned: false,
  seen: 'all',        // all | pending | done
  players: 'all',     // juegos: all | 1..6 (6 = 6 o más)
  kind: 'all',        // cine y series: all | pelicula | serie
  query: '',
  sort: localStorage.getItem('mb-sort') || 'recent',
  view: localStorage.getItem('mb-view') || 'grid',
  editing: null,
  detail: null,
};
if (!TYPES[state.type]) state.type = 'all';

/* ---------- Utilidades ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const esc = s => (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = iso => iso ? new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
function hash(str) { let h = 0; for (const ch of str || '') h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); }
const fmtPrice = n => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
/** Convierte «18,90», «18.90» o «1.234,50» en número; '' → null; texto no válido → NaN. */
function parsePrice(raw) {
  let t = (raw || '').toString().replace(/[€\s]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');   // formato español
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Math.round(parseFloat(t) * 100) / 100;
}
const priceInput = n => n == null ? '' : String(n.toFixed(2)).replace('.', ',');
const SECTION_NAME = { libro: 'libros', cd: 'música', pelicula: 'cine y series', juego: 'juegos' };
const SECTION_LABEL = { libro: 'Libros', cd: 'Música', pelicula: 'Cine y series', juego: 'Juegos' };
const kindOf = i => i.kind === 'serie' ? 'serie' : 'pelicula';
const kindLabel = i => kindOf(i) === 'serie' ? 'Serie' : 'Película';
const TYPE_ORDER = ['libro', 'cd', 'pelicula', 'juego'];
/** Gasto y regalos de un apartado (nunca se suman apartados distintos). */
function sectionMoney(type) {
  const items = state.items.filter(i => i.type === type);
  const priced = items.filter(i => !i.gift && i.price != null);
  return {
    total: priced.reduce((a, i) => a + i.price, 0),
    priced: priced.length,
    gifts: items.filter(i => i.gift).length,
  };
}

/** Nombres ya usados en préstamos y regalos (para sugerirlos). */
function knownPeople() {
  return [...new Set(state.items.flatMap(i => [i.loan?.to, i.giftFrom, ...(i.loanHistory || []).map(h => h.to)]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));
}
/** «2–4», «2», «2+» o '' según los jugadores guardados. */
function playersText(i) {
  const a = i.playersMin, b = i.playersMax;
  if (a == null && b == null) return '';
  if (a != null && b != null) return a === b ? `${a}` : `${a}–${b}`;
  return a != null ? `${a}+` : `hasta ${b}`;
}
/** ¿Se puede jugar con n personas? (n = 6 significa «6 o más») */
function fitsPlayers(i, n) {
  const lo = i.playersMin ?? i.playersMax, hi = i.playersMax ?? i.playersMin;
  if (lo == null) return false;
  if (i.playersMax == null && i.playersMin != null && n >= lo) return true;   // «2+»: sin máximo
  return n >= 6 ? hi >= 6 : lo <= n && n <= hi;
}
/** Clave de orden: sin artículo inicial («El laberinto…» se ordena por «laberinto…»). */
const ARTICLES = /^(el|la|los|las|lo|un|una|unos|unas|the|an|les|le|il|gli)\s+/i;
const titleKey = t => {
  const s = (t || '').trim().replace(/^[¿¡"«'(\[]+/, '');
  const k = s.replace(/^l'/i, '').replace(ARTICLES, '');
  return k || s;      // un título que es solo un artículo («Él») se queda igual
};
function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }
function daysSince(iso) { return Math.max(0, Math.round((Date.now() - new Date(iso + 'T12:00:00')) / 864e5)); }
function agoText(iso) {
  const d = daysSince(iso);
  if (d === 0) return 'hoy';
  if (d === 1) return 'ayer';
  if (d < 60) return `hace ${d} días`;
  const m = Math.round(d / 30.4);
  return m < 24 ? `hace ${m} meses` : `hace ${Math.round(d / 365)} años`;
}
/** Formato efectivo (los registros antiguos de música/películas sin formato cuentan como CD/DVD). */
function fmtOf(item) {
  if (item.type === 'cd') return FORMATS.cd.includes(item.format) ? item.format : 'CD';
  if (item.type === 'pelicula') return FORMATS.pelicula.includes(item.format) ? item.format : 'DVD';
  return '';
}
function typeLabel(item) { return FORMATS[item.type].length ? fmtOf(item) : TYPES[item.type].label; }

/* ---------- Aviso breve (con acción opcional) ---------- */
function toast(msg, { action, onAction, duration = 2600 } = {}) {
  const t = $('#toast');
  const btn = t.querySelector('button');
  t.querySelector('span').textContent = msg;
  btn.hidden = !action;
  btn.textContent = action || '';
  btn.onclick = action ? () => { t.classList.remove('show'); onAction(); } : null;
  t.classList.add('show');
  clearTimeout(toast._t);
  if (duration) toast._t = setTimeout(() => t.classList.remove('show'), duration);
}

/* ---------- Diálogo propio (sustituye a prompt/confirm) ---------- */
function ask({ title, text = '', fields = [], ok = 'Aceptar', cancel = 'Cancelar', danger = false, validate }) {
  return new Promise(resolve => {
    const dlg = $('#dlg-ask');
    $('#ask-title').textContent = title;
    $('#ask-text').textContent = text;
    $('#ask-fields').innerHTML = fields.map(f => `
      <label class="field"><span>${esc(f.label)}</span>
        <input name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}"
          ${f.list ? `list="${f.list}"` : ''} ${f.inputmode ? `inputmode="${f.inputmode}"` : ''} autocomplete="off" autocapitalize="${f.type === 'url' ? 'off' : 'sentences'}">
      </label>`).join('');
    const err = $('#ask-error');
    err.hidden = true;
    const okBtn = $('#ask-ok');
    okBtn.textContent = ok;
    okBtn.className = 'btn ' + (danger ? 'danger-fill' : 'primary');
    $('#ask-cancel').textContent = cancel;
    let done = false;
    const finish = val => {
      if (done) return;
      done = true;
      $('#ask-form').onsubmit = null;
      $('#ask-cancel').onclick = null;
      dlg.onclose = null;
      if (dlg.open) dlg.close();
      resolve(val);
    };
    $('#ask-form').onsubmit = e => {
      e.preventDefault();
      const vals = Object.fromEntries(fields.map(f => [f.name, dlg.querySelector(`[name="${f.name}"]`).value.trim()]));
      const msg = validate && validate(vals);
      if (msg) { err.textContent = msg; err.hidden = false; return; }
      finish(fields.length ? vals : true);
    };
    $('#ask-cancel').onclick = () => finish(null);
    dlg.onclose = () => finish(null);
    $('#ask-fields').oninput = () => { err.hidden = true; };
    dlg.showModal();
    const first = dlg.querySelector('#ask-fields input');
    if (first) setTimeout(() => first.focus(), 50);
  });
}

/* ---------- Portadas ---------- */
const arCache = (() => { try { return JSON.parse(localStorage.getItem('mb-ar') || '{}'); } catch { return {}; } })();
let arSaveTimer;
function rememberRatio(url, ar) {
  arCache[url] = Math.round(ar * 1000) / 1000;
  clearTimeout(arSaveTimer);
  arSaveTimer = setTimeout(() => { try { localStorage.setItem('mb-ar', JSON.stringify(arCache)); } catch {} }, 800);
}
/** Tamaño de la portada dentro de su hueco (2:3 normalmente; cuadrado en juegos). */
function coverStyle(ar, slot = 2 / 3) {
  const w = ar >= slot ? 100 : Math.round((ar / slot) * 1000) / 10;   // nunca más alta que el hueco
  return `width:${w}%;aspect-ratio:${ar}`;
}
/** Huecos cuadrados cuando solo se ven juegos (sus cajas son cuadradas). */
const slotFor = type => type === 'juego' ? 1 : 2 / 3;
function phColor(item) {
  const list = PH_COLORS[item.type];
  return list[hash(item.title) % list.length];
}
function placeholderHTML(item, hidden = false) {
  const icon = FORMAT_ICON[fmtOf(item)] || TYPES[item.type].icon;
  return `<div class="placeholder ph-${item.type}" style="--ph:${phColor(item)}"${hidden ? ' hidden' : ''}>
      <svg><use href="#${icon}"/></svg>
      <div><b>${esc(item.title)}</b>${item.creator ? `<br><small>${esc(item.creator)}</small>` : ''}</div>
    </div>`;
}
function coverHTML(item, { lazy = true, slot = 2 / 3 } = {}) {
  const f = fmtOf(item);
  const def = DEFAULT_AR[f] || DEFAULT_AR[item.type] || DEFAULT_AR.libro;
  const ar = (item.cover && arCache[item.cover]) || def;
  const showBadge = item.type === 'pelicula' || (item.type === 'cd' && f !== 'CD');
  const badge = showBadge ? `<span class="badge f-${f.split(' ')[0]}">${esc(f.toUpperCase())}</span>` : '';
  const loan = item.loan ? `<span class="loan-tag">Prestado · ${esc(item.loan.to)}</span>` : '';
  const seen = canSee(item) && item.seen ? `<span class="seen-mark" title="${SEEN[item.type].done}" aria-label="${SEEN[item.type].done}"><svg><use href="#i-check"/></svg></span>` : '';
  const img = item.cover
    ? `<img src="${esc(item.cover)}" alt="" ${lazy ? 'loading="lazy"' : ''} onload="coverLoaded(this)" onerror="coverFailed(this)">`
    : '';
  return `<div class="cover-box${slot === 1 ? ' sq' : ''}"><div class="cover" data-def="${def}" data-slot="${slot}" style="${coverStyle(ar, slot)}">${img}${placeholderHTML(item, !!item.cover)}${badge}${seen}${loan}</div></div>`;
}
/** Ajusta el hueco a la proporción real de la imagen descargada. */
window.coverLoaded = img => {
  const ar = img.naturalWidth / img.naturalHeight;
  if (!ar || !isFinite(ar)) return;
  const clamped = Math.min(Math.max(ar, 0.45), 1.6);
  rememberRatio(img.getAttribute('src'), clamped);
  img.parentNode.setAttribute('style', coverStyle(clamped, +img.parentNode.dataset.slot || 2 / 3));
};
/** Si una portada no carga (sin conexión, enlace roto), muestra la portada generada. */
window.coverFailed = img => {
  const c = img.parentNode;
  c.setAttribute('style', coverStyle(+c.dataset.def, +c.dataset.slot || 2 / 3));
  c.querySelector('.placeholder')?.removeAttribute('hidden');
  img.remove();
};

/* ---------- Filtro, orden y pintado ---------- */
function filtered() {
  const q = norm(state.query);
  const list = state.items.filter(i =>
    (state.type === 'all' || i.type === state.type) &&
    (state.format === 'all' || fmtOf(i) === state.format) &&
    (!state.loaned || i.loan) &&
    (state.kind === 'all' || (i.type === 'pelicula' && kindOf(i) === state.kind)) &&
    (state.players === 'all' || (i.type === 'juego' && fitsPlayers(i, +state.players))) &&
    (state.seen === 'all' || (canSee(i) && (state.seen === 'done' ? !!i.seen : !i.seen))) &&
    (!q || norm(`${i.title} ${i.creator} ${i.genre} ${i.year} ${i.notes} ${i.location} ${i.loan?.to || ''} ${fmtOf(i)} ${i.code || ''} ${i.gift ? 'regalo ' + (i.giftFrom || '') : ''} ${i.type === 'pelicula' ? kindLabel(i) : ''} ${i.seasons || ''}`).includes(q))
  );
  const cmp = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });
  const byTitle = (a, b) => cmp(titleKey(a.title), titleKey(b.title)) || cmp(a.title, b.title);
  const by = {
    recent: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    title: byTitle,
    creator: (a, b) => cmp(a.creator || '￿', b.creator || '￿') || byTitle(a, b),
    year: (a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0) || byTitle(a, b),
  }[state.sort];
  return list.sort(by);
}

function cardHTML(i) {
  return `<button class="card" data-id="${i.id}">
      ${coverHTML(i, { slot: slotFor(state.type) })}
      <p class="t">${esc(i.title)}</p>
      ${i.creator || i.seasons ? `<p class="c">${esc([i.creator, seasonsText(i)].filter(Boolean).join(' · '))}</p>` : ''}
    </button>`;
}
/** «Temp. 1–3» para series con temporadas indicadas. */
function seasonsText(i) {
  return i.type === 'pelicula' && kindOf(i) === 'serie' && i.seasons ? `Temp. ${i.seasons}` : '';
}
function rowHTML(i) {
  const sub = [i.creator, i.year].filter(Boolean).join(' · ');
  const tags = [`<span class="tag">${esc(typeLabel(i))}</span>`];
  if (i.type === 'pelicula' && kindOf(i) === 'serie') tags.push(`<span class="tag">Serie${i.seasons ? ` · T. ${esc(i.seasons)}` : ''}</span>`);
  if (i.type === 'juego') {
    if (playersText(i)) tags.push(`<span class="tag">${esc(playersText(i))} jug.</span>`);
    if (i.duration) tags.push(`<span class="tag">${i.duration} min</span>`);
    if (i.age) tags.push(`<span class="tag">+${i.age}</span>`);
  }
  if (canSee(i) && i.seen) tags.push(`<span class="tag seen"><svg><use href="#i-check"/></svg>${SEEN[i.type].done}</span>`);
  if (i.loan) tags.push(`<span class="tag loan">Prestado · ${esc(i.loan.to)}</span>`);
  if (i.gift) tags.push(`<span class="tag gift"><svg><use href="#i-gift"/></svg>${i.giftFrom ? `Regalo de ${esc(i.giftFrom)}` : 'Regalo'}</span>`);
  if (i.location) tags.push(`<span class="tag"><svg><use href="#i-pin"/></svg>${esc(i.location)}</span>`);
  return `<button class="row" data-id="${i.id}">
      ${coverHTML(i)}
      <div class="info">
        <p class="t">${esc(i.title)}</p>
        ${sub ? `<p class="c">${esc(sub)}</p>` : ''}
        <div class="tags">${tags.join('')}</div>
      </div>
    </button>`;
}

function selectHTML(name, label, value, options) {
  return `<label class="chip-select${value !== 'all' ? ' on' : ''}"><span>${label}</span><select data-filter="${name}" aria-label="${label}">${
    options.map(([v, l]) => `<option value="${v}"${v === value ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
}
/** Fila de filtros del apartado actual: desplegables, formato, leído/visto y prestados. */
function renderFormatChips() {
  const box = $('#format-chips');
  // En la pantalla principal («Todo») no hay filtros
  if (state.type === 'all') {
    state.seen = 'all'; state.loaned = false; state.format = 'all'; state.kind = 'all'; state.players = 'all';
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  const inScope = i => state.type === 'all' || i.type === state.type;
  const formats = FORMATS[state.type] || [];
  const parts = [];
  // Cine y series: película o serie
  if (state.type === 'pelicula' && state.items.some(i => i.type === 'pelicula')) {
    parts.push(selectHTML('kind', 'Ver', state.kind, [['all', 'Todo'], ['pelicula', 'Películas'], ['serie', 'Series']]));
  } else state.kind = 'all';
  // Juegos: número de jugadores
  if (state.type === 'juego' && state.items.some(i => i.type === 'juego' && (i.playersMin != null || i.playersMax != null))) {
    parts.push(selectHTML('players', 'Jugadores', state.players,
      [['all', 'Todos'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6 o más']]));
  } else state.players = 'all';
  // Formatos
  if (formats.length) {
    const counts = {};
    state.items.forEach(i => { if (i.type === state.type) counts[fmtOf(i)] = (counts[fmtOf(i)] || 0) + 1; });
    parts.push([['all', 'Todos'], ...formats.map(f => [f, f])].map(([v, l]) =>
      `<button class="chip small${state.format === v ? ' active' : ''}" data-format="${v}">${l}${v !== 'all' && counts[v] ? ` <span>${counts[v]}</span>` : ''}</button>`).join(''));
  }
  // Leído / visto (Todo, Libros y Cine y series)
  const seeable = state.items.filter(i => canSee(i) && inScope(i));
  if (state.type !== 'cd' && state.type !== 'juego' && seeable.length) {
    const lbl = SEEN[state.type] || { pend: 'Pendientes', many: 'Leídos y vistos' };
    const nDone = seeable.filter(i => i.seen).length;
    parts.push([['pending', lbl.pend, seeable.length - nDone], ['done', lbl.many, nDone]].map(([v, l, n]) =>
      `<button class="chip small seen-chip${state.seen === v ? ' active' : ''}" data-seen="${v}">${v === 'done' ? '<svg><use href="#i-check"/></svg>' : ''}${l}${n ? ` <span>${n}</span>` : ''}</button>`).join(''));
  } else state.seen = 'all';
  // Prestados
  const loaned = state.items.filter(i => i.loan && inScope(i)).length;
  if (loaned) {
    parts.push(`<button class="chip small loaned${state.loaned ? ' active' : ''}" data-loaned="1"><svg><use href="#i-hand"/></svg>Prestados <span>${loaned}</span></button>`);
  } else state.loaned = false;
  box.hidden = !parts.length;
  box.innerHTML = parts.join('<span class="chip-sep" aria-hidden="true"></span>');
}

function render() {
  renderFormatChips();            // ajusta filtros que ya no aplican antes de filtrar
  const list = filtered();
  const grid = $('#grid');
  grid.className = state.view === 'list' ? 'list' : 'grid';
  grid.innerHTML = list.map(state.view === 'list' ? rowHTML : cardHTML).join('');

  $$('#tabbar .tab').forEach(t => {
    const on = t.dataset.type === state.type;
    t.classList.toggle('active', on);
    if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });

  const vb = $('#btn-view');
  vb.querySelector('use').setAttribute('href', state.view === 'list' ? '#i-grid' : '#i-list');
  vb.setAttribute('aria-label', state.view === 'list' ? 'Ver portadas' : 'Vista compacta');

  const scopeTotal = state.type === 'all' ? state.items.length : state.items.filter(i => i.type === state.type).length;
  const where = state.type === 'all' ? 'Todo' : SECTION_LABEL[state.type];
  $('#count').textContent = `${where} · ` + (list.length === scopeTotal
    ? plural(scopeTotal, 'elemento', 'elementos')
    : `${list.length} de ${scopeTotal}`);

  // Total gastado del apartado elegido (en «Todo» no se muestra)
  const st = $('#section-total');
  const m = state.type !== 'all' ? sectionMoney(state.type) : null;
  if (m && (m.priced || m.gifts)) {
    const parts = [];
    if (m.priced) parts.push(`Total en ${SECTION_NAME[state.type]}: <strong>${fmtPrice(m.total)}</strong> <small>(${plural(m.priced, 'con precio', 'con precio')})</small>`);
    if (m.gifts) parts.push(`<svg><use href="#i-gift"/></svg>${plural(m.gifts, 'regalo', 'regalos')}`);
    st.innerHTML = parts.map(p => `<span>${p}</span>`).join('');
    st.hidden = false;
  } else {
    st.hidden = true;
  }

  const empty = list.length === 0;
  $('#empty').hidden = !empty;
  if (empty) {
    if (state.items.length === 0) {
      $('#empty-title').textContent = 'Tu biblioteca está vacía';
      $('#empty-text').innerHTML = 'Pulsa <strong>+</strong> para añadir tu primer libro, disco o película.';
    } else {
      $('#empty-title').textContent = 'Nada por aquí';
      $('#empty-text').textContent = state.query ? 'No hay resultados para esa búsqueda.' : 'No tienes elementos con este filtro.';
    }
  }
  renderTip();
}

/* ---------- Avisos de instalación y copia de seguridad ---------- */
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let installPrompt = null;
function tipDismissed(key, days) { const t = +localStorage.getItem('mb-tip-' + key) || 0; return Date.now() - t < days * 864e5; }
function dismissTip(key) { localStorage.setItem('mb-tip-' + key, Date.now()); renderTip(); }
function renderTip() {
  const tip = $('#tip');
  let html = '';
  if (!isStandalone() && isIOS() && !tipDismissed('install', 3650)) {
    html = `<p><strong>Instálala en tu iPhone:</strong> en Safari pulsa Compartir → «Añadir a pantalla de inicio». Así Safari no borrará tus datos.
      <br><small>Ojo: Safari y la app instalada guardan los datos por separado. Instálala antes de empezar o conecta GitHub para tenerlos en ambos.</small></p>
      <button class="icon-btn" data-tip="install" aria-label="Cerrar aviso"><svg><use href="#i-x"/></svg></button>`;
  } else if (!isStandalone() && installPrompt && !tipDismissed('install', 30)) {
    html = `<div style="flex:1"><p><strong>Instala Mi Biblioteca</strong> en tu móvil para abrirla como una app y usarla sin conexión.</p>
      <div class="tip-actions"><button class="btn primary" id="tip-install">Instalar</button></div></div>
      <button class="icon-btn" data-tip="install" aria-label="Cerrar aviso"><svg><use href="#i-x"/></svg></button>`;
  } else if (!sync.cfg && state.items.length >= 3 && !tipDismissed('backup', 30)
             && Date.now() - (+localStorage.getItem('mb-last-export') || 0) > 30 * 864e5) {
    html = `<div style="flex:1"><p><strong>Tus datos solo están en este dispositivo.</strong> Conecta GitHub para guardarlos en la nube o exporta una copia.</p>
      <div class="tip-actions"><button class="btn primary" id="tip-backup">Configurar</button></div></div>
      <button class="icon-btn" data-tip="backup" aria-label="Cerrar aviso"><svg><use href="#i-x"/></svg></button>`;
  }
  tip.hidden = !html;
  tip.innerHTML = html;
}

/* ---------- Detalle ---------- */
function openDetail(item) {
  state.detail = item;
  $('#d-cover').innerHTML = coverHTML(item, { lazy: false, slot: slotFor(item.type) });
  const pill = $('#d-type');
  pill.textContent = item.type === 'pelicula' ? `${kindLabel(item)} · ${fmtOf(item)}` : FORMATS[item.type].length ? `${TYPES[item.type].label} · ${fmtOf(item)}` : TYPES[item.type].label;
  pill.style.background = `var(--${item.type})`;
  $('#d-title').textContent = item.title;
  $('#d-creator').textContent = item.creator || '';
  const meta = [];
  if (seasonsText(item)) meta.push(['Temporadas', item.seasons]);
  if (item.type === 'juego') {
    if (playersText(item)) meta.push(['Jugadores', playersText(item)]);
    if (item.duration) meta.push(['Duración', `${item.duration} min`]);
    if (item.age) meta.push(['Edad', `${item.age}+`]);
  }
  if (item.year) meta.push(['Año', item.year]);
  if (item.genre) meta.push(['Género', item.genre]);
  if (item.location) meta.push(['Ubicación', item.location]);
  if (item.gift) meta.push(['Regalo', item.giftFrom ? `De ${item.giftFrom}` : 'Sí']);
  else if (item.price != null) meta.push(['Precio', fmtPrice(item.price)]);
  if (item.code) meta.push([isISBN(item.code) ? 'ISBN' : 'Código', item.code]);
  if (item.createdAt) meta.push(['Añadido', new Date(item.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })]);
  $('#d-meta').innerHTML = meta.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');

  $('#d-loan').innerHTML = item.loan
    ? `<div class="on"><p><strong>Prestado a ${esc(item.loan.to)}</strong><br><small>Desde el ${fmtDate(item.loan.since)} (${agoText(item.loan.since)})</small></p>
         <button class="btn primary" id="d-return">Devuelto</button></div>`
    : `<button class="btn ghost full" id="d-lend"><svg><use href="#i-hand"/></svg>Prestar</button>`;
  const sl = SEEN[item.type];
  $('#d-seen').innerHTML = !sl ? '' : item.seen
    ? `<div class="on seen-on"><p><strong><svg><use href="#i-check"/></svg>${sl.done}</strong></p>
         <button class="btn ghost" id="d-unsee">Desmarcar</button></div>`
    : `<button class="btn ghost full" id="d-see"><svg><use href="#i-check"/></svg>${sl.mark}</button>`;
  $('#d-notes').textContent = item.notes || '';
  const hist = item.loanHistory || [];
  $('#d-history').innerHTML = hist.length
    ? `<strong>Préstamos anteriores</strong><ul>${hist.slice().reverse().map(h =>
        `<li>${esc(h.to)}: ${fmtDate(h.since)} → ${fmtDate(h.returned)}</li>`).join('')}</ul>` : '';
  if (!$('#dlg-detail').open) $('#dlg-detail').showModal();
}

async function updateItem(item, changes) {
  const next = { ...item, ...changes, updatedAt: Date.now() };
  await store.put(next);
  const idx = state.items.findIndex(i => i.id === item.id);
  if (idx >= 0) state.items[idx] = next;
  markChanged();
  render();
  return next;
}

async function lendItem() {
  const it = state.detail;
  fillDatalist('people', knownPeople());
  const r = await ask({
    title: `Prestar «${it.title}»`,
    fields: [
      { name: 'to', label: '¿A quién?', list: 'people', placeholder: 'Nombre' },
      { name: 'since', label: 'Fecha', type: 'date', value: today() },
    ],
    ok: 'Prestar',
    validate: v => !v.to ? 'Escribe a quién se lo prestas.' : (!/^\d{4}-\d{2}-\d{2}$/.test(v.since) ? 'Elige una fecha.' : (v.since > today() ? 'La fecha no puede ser futura.' : '')),
  });
  if (!r) return;
  const next = await updateItem(it, { loan: { to: r.to, since: r.since } });
  openDetail(next);
  toast(`Prestado a ${r.to}`);
}

async function toggleSeen(on) {
  const it = state.detail;
  if (!it || !canSee(it)) return;
  const next = await updateItem(it, { seen: on });
  openDetail(next);
  toast(on ? `Marcado como ${SEEN[it.type].verb}` : 'Desmarcado');
}

async function returnItem() {
  const it = state.detail;
  if (!it.loan) return;
  const hist = [...(it.loanHistory || []), { to: it.loan.to, since: it.loan.since, returned: today() }];
  const next = await updateItem(it, { loan: null, loanHistory: hist });
  openDetail(next);
  toast('Marcado como devuelto');
}

async function deleteItem() {
  const it = state.detail;
  if (!it) return;
  await store.del(it.id);
  state.items = state.items.filter(i => i.id !== it.id);
  setDeleted({ ...getDeleted(), [it.id]: Date.now() });
  markChanged();
  $('#dlg-detail').close();
  render();
  toast(`«${it.title}» eliminado`, {
    action: 'Deshacer', duration: 6000,
    onAction: async () => {
      const back = { ...it, updatedAt: Date.now() };
      const del = getDeleted(); delete del[it.id]; setDeleted(del);
      await store.put(back);
      state.items.push(back);
      markChanged();
      render();
      toast('Recuperado');
    },
  });
}

/* ---------- Formulario ---------- */
const form = { type: 'libro', format: '', kind: 'pelicula', cover: '' };

function setSegmented(el, value) {
  el.querySelectorAll('button').forEach(b => {
    const on = b.dataset.value === value;
    b.classList.toggle('on', on);
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', on);
  });
}

function updateFormType() {
  const formats = FORMATS[form.type];
  if (formats.length && !formats.includes(form.format)) form.format = formats[0];
  if (!formats.length) form.format = '';
  setSegmented($('#f-type'), form.type);
  // Desplegables: «¿Película o serie?» (cine) y «Formato» (música y cine)
  const isCine = form.type === 'pelicula';
  $('#f-select-row').hidden = !formats.length;
  $('#f-kind-field').hidden = !isCine;
  $('#f-kind').value = form.kind;
  $('#f-seasons-field').hidden = !(isCine && form.kind === 'serie');
  $('#f-format').innerHTML = formats.map(f => `<option value="${f}">${f}</option>`).join('');
  $('#f-format').value = form.format;
  $('#f-creator-label').textContent = isCine && form.kind === 'serie' ? 'Creador' : TYPES[form.type].creator;
  const isBook = form.type === 'libro';
  const isGame = form.type === 'juego';
  $('#f-game-fields').hidden = !isGame;
  $('#f-year-genre').hidden = isGame;
  $('#f-online').hidden = isGame;                       // portadas de juegos: pegando la URL
  if (isGame) $('#online').hidden = true;
  $('#f-notes-label').textContent = isGame ? 'Descripción' : 'Notas';
  $('#f-notes').placeholder = isGame ? 'De qué va el juego, mecánicas, expansiones…' : 'Edición, estado, firmado…';
  // En juegos la descripción va justo después de los datos del juego
  const notes = $('#f-notes-wrap');
  if (isGame) $('#f-game-fields').after(notes); else $('#f-notes-anchor').before(notes);
  const sl = SEEN[form.type];
  $('#f-seen-field').hidden = !sl;
  if (sl) $('#f-seen-label').textContent = sl.ask;
  $('#f-scan').hidden = !isBook;
  $('#f-code-field').hidden = !isBook;
  $('#online-q').placeholder = form.type === 'libro' ? 'Título, autor o ISBN' : form.type === 'cd' ? 'Álbum y artista' : form.kind === 'serie' ? 'Título de la serie' : 'Título de la película';
  updateCoverPreview();
}

function updateCoverPreview() {
  const fake = { type: form.type, format: form.format, title: $('#f-title').value || 'Sin título', creator: $('#f-creator').value, cover: form.cover };
  $('#f-cover-preview').innerHTML = coverHTML(fake, { lazy: false, slot: slotFor(form.type) });
  $('#f-cover-remove').hidden = !form.cover;
}

function fillDatalist(id, values) {
  const list = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  $('#' + id).innerHTML = list.map(v => `<option value="${esc(v)}">`).join('');
}

function openForm(item = null) {
  state.editing = item;
  $('#form-title').textContent = item ? 'Editar' : 'Añadir';
  form.type = item?.type || (state.type !== 'all' ? state.type : 'libro');
  form.format = item ? fmtOf(item) : (state.format !== 'all' ? state.format : '');
  form.kind = item ? kindOf(item) : (state.kind !== 'all' ? state.kind : 'pelicula');
  $('#f-seasons').value = item?.seasons || '';
  form.cover = item?.cover || '';
  $('#f-title').value = item?.title || '';
  $('#f-creator').value = item?.creator || '';
  $('#f-year').value = item?.year || '';
  $('#f-genre').value = item?.genre || '';
  $('#f-location').value = item?.location || '';
  $('#f-seen').checked = !!item?.seen;
  $('#f-pmin').value = item?.playersMin ?? '';
  $('#f-pmax').value = item?.playersMax ?? '';
  $('#f-duration').value = item?.duration ?? '';
  $('#f-age').value = item?.age ?? '';
  $('#f-price').value = priceInput(item?.price ?? null);
  $('#f-gift').checked = !!item?.gift;
  $('#f-gift-from').value = item?.giftFrom || '';
  fillDatalist('people', knownPeople());
  updateGiftField();
  $('#f-code').value = item?.code || '';
  $('#f-notes').value = item?.notes || '';
  $('#f-error').hidden = true;
  $('#online').hidden = true;
  $('#online-results').innerHTML = '';
  $('#online-status').textContent = '';
  fillDatalist('genres', state.items.map(i => i.genre));
  fillDatalist('locations', state.items.map(i => i.location));
  updateFormType();
  $('#dlg-form').showModal();
  $('#dlg-form').scrollTop = 0;
}

function findDuplicate(item) {
  if (item.code) {
    const byCode = state.items.find(i => i.id !== item.id && sameCode(i.code, item.code));
    if (byCode) return byCode;
  }
  const t = norm(item.title), c = norm(item.creator);
  return state.items.find(i => i.id !== item.id && i.type === item.type && norm(i.title) === t &&
    (!c || !i.creator || norm(i.creator) === c) &&
    // temporadas distintas de una misma serie no son duplicados
    !(item.seasons && i.seasons && norm(item.seasons) !== norm(i.seasons)));
}

function updateGiftField() {
  const gift = $('#f-gift').checked;
  $('#f-price-wrap').hidden = gift;
  $('#f-gift-from-wrap').hidden = !gift;
}

async function saveForm(e) {
  e.preventDefault();
  const title = $('#f-title').value.trim();
  const year = $('#f-year').value.trim();
  const err = $('#f-error');
  if (!title) { err.textContent = 'Escribe al menos el título.'; err.hidden = false; $('#f-title').focus(); return; }
  if (year && !/^\d{4}$/.test(year)) { err.textContent = 'El año debe tener 4 cifras (p. ej. 1999).'; err.hidden = false; $('#f-year').focus(); return; }
  // Datos de juegos
  const isGame = form.type === 'juego';
  const num = id => { const v = $(id).value.trim(); return v === '' ? null : (/^\d{1,4}$/.test(v) ? +v : NaN); };
  const pmin = isGame ? num('#f-pmin') : null, pmax = isGame ? num('#f-pmax') : null;
  const duration = isGame ? num('#f-duration') : null, age = isGame ? num('#f-age') : null;
  const bad = (m, id) => { err.textContent = m; err.hidden = false; $(id).focus(); };
  if (isGame) {
    if (Number.isNaN(pmin) || Number.isNaN(pmax) || pmin === 0 || pmax === 0 || pmin > 99 || pmax > 99) return bad('Los jugadores deben ser números (p. ej. de 2 a 4).', '#f-pmin');
    if (pmin != null && pmax != null && pmin > pmax) return bad('El mínimo de jugadores no puede ser mayor que el máximo.', '#f-pmin');
    if (Number.isNaN(duration) || duration === 0 || duration > 2000) return bad('La duración debe ser un número de minutos (p. ej. 45).', '#f-duration');
    if (Number.isNaN(age) || age > 99) return bad('La edad debe ser un número (p. ej. 10).', '#f-age');
  }
  const gift = $('#f-gift').checked;
  const price = gift ? null : parsePrice($('#f-price').value);
  if (Number.isNaN(price)) { err.textContent = 'El precio no es válido. Escríbelo así: 18,90'; err.hidden = false; $('#f-price').focus(); return; }
  if (price != null && price > 100000) { err.textContent = 'Revisa el precio: parece demasiado alto.'; err.hidden = false; $('#f-price').focus(); return; }
  // El ISBN solo se pide en libros; en música y películas se conserva el código que ya tuviera
  const rawCode = form.type === 'libro' ? $('#f-code').value.trim() : '';
  const code = form.type === 'libro' ? (rawCode ? normalizeCode(rawCode) : '') : (state.editing?.code || '');
  if (rawCode && (!code || !isISBN(code))) { err.textContent = 'El ISBN no es válido. Revisa los números (10 o 13 cifras).'; err.hidden = false; $('#f-code').focus(); return; }
  err.hidden = true;

  const editing = state.editing;
  const item = {
    loan: null, loanHistory: [],
    ...(editing || { id: uid(), createdAt: Date.now() }),
    seenAt: undefined,
    type: form.type,
    format: form.format,
    kind: form.type === 'pelicula' ? form.kind : '',
    seasons: form.type === 'pelicula' && form.kind === 'serie' ? $('#f-seasons').value.trim() : '',
    title,
    creator: $('#f-creator').value.trim(),
    year,
    genre: $('#f-genre').value.trim(),
    location: $('#f-location').value.trim(),
    seen: !!SEEN[form.type] && $('#f-seen').checked,
    playersMin: pmin, playersMax: pmax, duration, age,
    price,
    gift,
    giftFrom: gift ? $('#f-gift-from').value.trim() : '',
    code,
    notes: $('#f-notes').value.trim(),
    cover: form.cover,
    updatedAt: Date.now(),
  };

  // Aviso de duplicado (al añadir, o si al editar cambia título/tipo)
  const changedKey = !editing || norm(editing.title) !== norm(title) || editing.type !== item.type;
  const dup = changedKey && findDuplicate(item);
  if (dup) {
    const where = [typeLabel(dup), dup.location && `en ${dup.location}`, dup.loan && `prestado a ${dup.loan.to}`].filter(Boolean).join(', ');
    const sameBarcode = item.code && sameCode(dup.code, item.code);
    const go = await ask({
      title: '¿Ya lo tienes?',
      text: `En tu biblioteca ya está «${dup.title}»${dup.creator ? ` de ${dup.creator}` : ''} (${where})${sameBarcode ? ', con el mismo código de barras' : ''}. ¿Quieres guardarlo de todos modos?`,
      ok: 'Guardar igualmente',
    });
    if (!go) return;
  }

  try {
    await store.put(item);
  } catch {
    err.textContent = 'No se pudo guardar (¿almacenamiento lleno?).';
    err.hidden = false;
    return;
  }
  const idx = state.items.findIndex(i => i.id === item.id);
  if (idx >= 0) state.items[idx] = item; else state.items.push(item);
  markChanged();
  $('#dlg-form').close();
  if (editing && $('#dlg-detail').open) openDetail(item);
  render();
  toast(editing ? 'Cambios guardados' : `«${item.title}» añadido`);
}

async function pasteCoverUrl() {
  const r = await ask({
    title: 'URL de la portada',
    text: 'En el navegador, mantén pulsada la imagen y elige «Copiar dirección de la imagen». Después pégala aquí.',
    fields: [{ name: 'url', label: 'Dirección de la imagen', type: 'url', placeholder: 'https://…', inputmode: 'url', value: /^https?:/.test(form.cover) ? form.cover : '' }],
    ok: 'Usar imagen',
    validate: v => /^https?:\/\/\S+$/i.test(v.url) ? '' : 'La dirección debe empezar por http:// o https://',
  });
  if (!r) return;
  // Comprobar que la imagen carga antes de aceptarla
  const okImg = await new Promise(res => {
    const im = new Image();
    const t = setTimeout(() => res(false), 10000);
    im.onload = () => { clearTimeout(t); res(im.naturalWidth > 0); };
    im.onerror = () => { clearTimeout(t); res(false); };
    im.src = r.url;
  });
  if (!okImg) {
    const keep = await ask({
      title: 'No se pudo cargar la imagen',
      text: 'Puede que el enlace no sea una imagen, que la web no permita mostrarla en otras páginas o que no tengas conexión. ¿Usarla de todos modos?',
      ok: 'Usar igualmente',
    });
    if (!keep) return;
  }
  form.cover = r.url;
  updateCoverPreview();
}

/* ---------- Búsqueda de portadas online ---------- */
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = 'mbcb' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, 10000);
    function cleanup() { clearTimeout(timer); delete window[cb]; s.remove(); }
    window[cb] = data => { cleanup(); resolve(data); };
    s.onerror = () => { cleanup(); reject(new Error('network')); };
    s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
    document.head.appendChild(s);
  });
}

async function itunes(term, entity, country = 'ES') {
  const base = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=${entity}&limit=15&country=${country}&lang=es_es`;
  let data;
  try {
    const r = await fetch(base);
    if (!r.ok) throw new Error(r.status);
    data = await r.json();
  } catch {
    data = await jsonp(base);
  }
  return (data.results || []).map(r => ({
    title: r.collectionName || r.trackName,
    creator: r.artistName || '',
    year: (r.releaseDate || '').slice(0, 4),
    genre: r.primaryGenreName || '',
    cover: (r.artworkUrl100 || '').replace(/\/\d+x\d+bb\./, '/600x600bb.'),
    source: 'iTunes',
  })).filter(r => r.cover);
}

/* ---------- Portadas de películas ----------
   Se busca a la vez en TMDB (si hay clave), Wikipedia e iTunes y se juntan los resultados. */
const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
const tmdbKey = () => localStorage.getItem('mb-tmdb') || '';
async function tmdbFetch(path, params = {}, key = tmdbKey()) {
  const u = new URL(TMDB_API + path);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const headers = { Accept: 'application/json' };
  // Admite el «token de acceso de lectura» (empieza por eyJ) o la «clave de API» (32 caracteres)
  if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;
  else u.searchParams.set('api_key', key);
  const r = await fetch(u, { headers });
  if (r.status === 401) throw new Error('tmdb-auth');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
let tmdbGenres = null;
async function tmdbGenreMap() {
  if (tmdbGenres) return tmdbGenres;
  try {
    const [m, t] = await Promise.all([tmdbFetch('/genre/movie/list', { language: 'es-ES' }), tmdbFetch('/genre/tv/list', { language: 'es-ES' })]);
    tmdbGenres = Object.fromEntries([...(m.genres || []), ...(t.genres || [])].map(g => [g.id, g.name]));
  } catch { tmdbGenres = {}; }
  return tmdbGenres;
}
async function tmdbSearch(q) {
  if (!tmdbKey()) return [];
  const [d, genres] = await Promise.all([
    tmdbFetch('/search/multi', { query: q, language: 'es-ES', include_adult: 'false' }),
    tmdbGenreMap(),
  ]);
  const prefer = form.kind === 'serie' ? 'tv' : 'movie';
  const hits = (d.results || []).filter(r => (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path)
    .sort((a, b) => (b.media_type === prefer) - (a.media_type === prefer)).slice(0, 8);
  const out = hits.map(r => ({
    title: r.title || r.name,
    creator: '',
    year: (r.release_date || r.first_air_date || '').slice(0, 4),
    genre: genres[(r.genre_ids || [])[0]] || '',
    cover: TMDB_IMG + r.poster_path,
    source: 'TMDB',
    tmdb: { id: r.id, type: r.media_type },
  }));
  // Más carteles del primer resultado: primero los españoles, luego los mejor valorados
  if (hits[0]) {
    try {
      const im = await tmdbFetch(`/${hits[0].media_type}/${hits[0].id}/images`, { include_image_language: 'es,en,null' });
      const seen = new Set(out.map(o => o.cover));
      const extra = (im.posters || [])
        .sort((a, b) => ((b.iso_639_1 === 'es') - (a.iso_639_1 === 'es')) || (b.vote_average - a.vote_average))
        .map(p => ({ ...out[0], cover: TMDB_IMG + p.file_path }))
        .filter(o => !seen.has(o.cover))
        .slice(0, 6);
      out.splice(1, 0, ...extra);
    } catch {}
  }
  return out;
}
/** Director (películas) o creadores (series) de un resultado de TMDB. */
async function tmdbCreator({ id, type }) {
  if (type === 'movie') {
    const c = await tmdbFetch(`/movie/${id}/credits`, { language: 'es-ES' });
    return (c.crew || []).filter(p => p.job === 'Director').map(p => p.name).slice(0, 2).join(', ');
  }
  const t = await tmdbFetch(`/tv/${id}`, { language: 'es-ES' });
  return (t.created_by || []).map(p => p.name).slice(0, 2).join(', ');
}

/** Wikipedia en español y en inglés (la inglesa suele tener el cartel aunque la española no). */
const FILM_RE = /pel[ií]cula|film|serie|series|telenovela|miniserie|documental|documentary|animated|animaci[oó]n/i;
function wikiItem(p) {
  const desc = p.description || '';
  const paren = (p.title.match(/\(([^)]*)\)\s*$/) || ['', ''])[1];
  if (!FILM_RE.test(desc) && !FILM_RE.test(paren)) return null;   // descarta actores, libros, etc.
  const src = p.thumbnail?.source;
  if (!src || /\.svg/i.test(src)) return null;
  const director = (desc.match(/(?:dirigida por|directed by|film by|película de [^,]*? de)\s+(.+)$/i) || ['', ''])[1].replace(/\.$/, '');
  return {
    title: p.title.replace(/\s*\([^)]*(pel[ií]cula|film|serie|series|TV)[^)]*\)\s*$/i, ''),
    creator: director,
    year: ((desc + ' ' + paren).match(/\b(19|20)\d{2}\b/) || [''])[0],
    genre: '',
    cover: src,
    source: 'Wikipedia',
  };
}
async function wikiQuery(lang, params) {
  const u = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  Object.entries({ action: 'query', format: 'json', origin: '*', redirects: '1', prop: 'pageimages|description|langlinks',
    piprop: 'thumbnail', pithumbsize: '600', pilicense: 'any', lllang: 'en', lllimit: '1', ...params })
    .forEach(([k, v]) => u.searchParams.set(k, v));
  const d = await getJSON(u.href);
  return Object.values(d.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
}
async function wikiSearch(q) {
  const [es, en] = await Promise.all([
    wikiQuery('es', { generator: 'search', gsrsearch: `${q} ${form.kind === 'serie' ? 'serie' : 'película'}`, gsrlimit: '8' }).catch(() => []),
    wikiQuery('en', { generator: 'search', gsrsearch: `${q} ${form.kind === 'serie' ? 'TV series' : 'film'}`, gsrlimit: '8' }).catch(() => []),
  ]);
  const out = [];
  const add = p => { const it = wikiItem(p); if (it) out.push(it); };
  es.forEach(add);
  // Artículos en español sin cartel: mirar su versión en inglés
  const enTitles = es.filter(p => !p.thumbnail && p.langlinks?.[0]?.['*'] && FILM_RE.test((p.description || '') + p.title))
    .map(p => p.langlinks[0]['*']).slice(0, 5);
  if (enTitles.length) {
    try {
      (await wikiQuery('en', { titles: enTitles.join('|') })).forEach(p => {
        const it = wikiItem(p);
        if (it) {   // conservar el título en español
          const orig = es.find(e => e.langlinks?.[0]?.['*'] === p.title);
          if (orig) it.title = orig.title.replace(/\s*\([^)]*\)\s*$/, '');
          out.push(it);
        }
      });
    } catch {}
  }
  en.forEach(add);
  return out.slice(0, 10);
}

let tmdbAuthError = false;
async function searchMovies(q) {
  tmdbAuthError = false;
  const [a, b, c] = await Promise.all([
    tmdbSearch(q).catch(e => { if (e.message === 'tmdb-auth') tmdbAuthError = true; return []; }),
    wikiSearch(q).catch(() => []),
    (ent => itunes(q, ent).then(r => r.length >= 3 ? r : itunes(q, ent, 'US').then(us => [...r, ...us])))(form.kind === 'serie' ? 'tvSeason' : 'movie').catch(() => []),
  ]);
  const seen = new Set();
  return [...a, ...b, ...c].filter(r => r.cover && !seen.has(r.cover) && seen.add(r.cover));
}

async function openLibrary(term) {
  const clean = term.replace(/[-\s]/g, '');
  const fields = 'fields=title,author_name,first_publish_year,cover_i';
  if (/^(97[89])?\d{9}[\dXx]$/.test(clean)) {
    const r = await fetch(`https://openlibrary.org/search.json?isbn=${clean}&${fields}&limit=5`);
    const docs = (await r.json()).docs || [];
    const out = docs.map(mapOL).filter(x => x.cover);
    if (!out.length) out.push({ title: docs[0]?.title || '', creator: docs[0]?.author_name?.[0] || '', year: '', genre: '', cover: `https://covers.openlibrary.org/b/isbn/${clean}-L.jpg?default=false` });
    return out;
  }
  const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(term)}&${fields}&limit=24`);
  return ((await r.json()).docs || []).map(mapOL).filter(x => x.cover).slice(0, 15);
}
function mapOL(doc) {
  return {
    title: doc.title || '',
    creator: (doc.author_name || [])[0] || '',
    year: doc.first_publish_year ? String(doc.first_publish_year) : '',
    genre: '',
    cover: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : '',
  };
}

let lastResults = [];
async function runOnlineSearch() {
  const q = $('#online-q').value.trim();
  const status = $('#online-status');
  const box = $('#online-results');
  if (!q) { status.textContent = 'Escribe qué quieres buscar.'; return; }
  status.textContent = 'Buscando…';
  box.innerHTML = '';
  try {
    const isMovie = form.type === 'pelicula';
    lastResults = form.type === 'libro' ? await openLibrary(q) : isMovie ? await searchMovies(q) : await itunes(q, 'album');
    const hint = !isMovie ? '' : tmdbAuthError
      ? ' La clave de TMDB no es válida: revísala en ⋯ → Portadas de cine y series.'
      : !tmdbKey() ? ' Para encontrar casi todas, añade una clave gratuita de TMDB en ⋯ → Portadas de cine y series.' : '';
    if (!lastResults.length) { status.textContent = 'Sin resultados. Prueba con el título original o con menos palabras.' + hint; return; }
    showResults(lastResults, 'Toca una portada para usarla.' + hint);
  } catch {
    status.textContent = 'No se pudo conectar. Revisa la conexión o pega la URL de una imagen.';
  }
}

function pickResult(i, { keepOpen = false, quiet = false } = {}) {
  const r = lastResults[i];
  if (!r) return;
  form.cover = r.cover || form.cover;
  if (!$('#f-title').value.trim()) $('#f-title').value = r.title;
  if (!$('#f-creator').value.trim() && r.creator) $('#f-creator').value = r.creator;
  if (!$('#f-year').value.trim() && r.year) $('#f-year').value = r.year;
  if (!$('#f-genre').value.trim() && r.genre) $('#f-genre').value = r.genre;
  if (r.tmdb && form.type === 'pelicula') {
    form.kind = r.tmdb.type === 'tv' ? 'serie' : 'pelicula';
    $('#f-kind').value = form.kind;
    $('#f-creator-label').textContent = form.kind === 'serie' ? 'Creador' : 'Director';
  }
  if (r.tmdb && !$('#f-creator').value.trim()) {
    tmdbCreator(r.tmdb).then(name => {
      if (name && !$('#f-creator').value.trim()) { $('#f-creator').value = name; updateCoverPreview(); }
    }).catch(() => {});
  }
  if (!keepOpen) $('#online').hidden = true;
  $$('#online-results .result').forEach(b => b.classList.toggle('picked', +b.dataset.i === i));
  updateCoverPreview();
  if (!quiet) toast('Portada añadida');
}
function showResults(results, statusText) {
  lastResults = results;
  $('#online').hidden = false;
  $('#online-status').textContent = statusText;
  $('#online-results').innerHTML = results.map((r, i) => `
      <button type="button" class="result ${form.type === 'cd' ? 'sq' : ''}" data-i="${i}">
        <img src="${esc(r.cover)}" alt="" loading="lazy" onerror="this.closest('.result').remove()">
        <span>${esc(r.title)}${r.year ? ` (${r.year})` : ''}</span>
        ${r.source ? `<small class="src">${esc(r.source)}</small>` : ''}
      </button>`).join('');
}

/* ---------- Códigos de barras: validación ---------- */
const digits = s => (s || '').toString().replace(/[\s-]/g, '').toUpperCase();
/** Dígito de control GTIN (EAN-8, UPC-A, EAN-13). */
function gtinValid(c) {
  if (!/^\d{8}$|^\d{12,13}$/.test(c)) return false;
  const arr = c.split('').map(Number);
  const check = arr.pop();
  const sum = arr.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
function isbn10to13(c) {
  if (!/^\d{9}[\dX]$/.test(c)) return '';
  const sum = c.split('').reduce((a, ch, i) => a + (ch === 'X' ? 10 : +ch) * (10 - i), 0);
  if (sum % 11 !== 0) return '';
  const base = '978' + c.slice(0, 9);
  const s13 = base.split('').reduce((a, d, i) => a + +d * (i % 2 ? 3 : 1), 0);
  return base + ((10 - (s13 % 10)) % 10);
}
/** Devuelve el código limpio y validado (ISBN-10 → ISBN-13), o '' si no es válido. */
function normalizeCode(raw) {
  const c = digits(raw);
  if (c.length === 10) return isbn10to13(c);
  if (/^\d{6,8}$/.test(c) && c.length < 8) return c;           // UPC-E corto: se acepta tal cual
  return gtinValid(c) ? c : '';
}
const isISBN = c => /^97[89]\d{10}$/.test(c || '');
const sameCode = (a, b) => !!a && !!b && a.replace(/^0+/, '') === b.replace(/^0+/, '');

/* ---------- Escáner con la cámara ----------
   Usa el lector nativo del navegador (Chrome en Android) y, si no existe (iPhone),
   la librería ZXing en WebAssembly incluida en vendor/. */
const scanner = { stream: null, detector: null, timer: null, resolve: null, busy: false };
const SCAN_FORMATS = ['ean_13'];   // los ISBN de los libros son códigos EAN-13 (978/979…)

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('No se pudo cargar ' + src));
    document.head.appendChild(s);
  });
}
async function getDetector() {
  if (scanner.detector) return scanner.detector;
  if ('BarcodeDetector' in window) {
    try {
      const sup = await window.BarcodeDetector.getSupportedFormats();
      const fmts = SCAN_FORMATS.filter(f => sup.includes(f));
      if (fmts.length) return (scanner.detector = new window.BarcodeDetector({ formats: fmts }));
    } catch {}
  }
  await loadScript('vendor/barcode-detector.js');
  const api = window.BarcodeDetectionAPI;
  api.prepareZXingModule({
    overrides: { locateFile: (path, prefix) => path.endsWith('.wasm') ? new URL('vendor/' + path, location.href).href : prefix + path },
  });
  return (scanner.detector = new api.BarcodeDetector({ formats: SCAN_FORMATS }));
}

function setScanHint(t) { $('#scan-hint').textContent = t; }
function stopCamera() {
  clearTimeout(scanner.timer);
  scanner.timer = null;
  if (scanner.stream) scanner.stream.getTracks().forEach(t => t.stop());
  scanner.stream = null;
  const v = $('#scan-video');
  v.pause(); v.srcObject = null;
}
function finishScan(code) {
  stopCamera();
  const dlg = $('#dlg-scan');
  const res = scanner.resolve;
  scanner.resolve = null;
  if (dlg.open) dlg.close();
  if (res) res(code);
}

/** Abre la cámara y devuelve el código leído (o escrito a mano), o null si se cancela. */
function scanCode() {
  return new Promise(async resolve => {
    scanner.resolve = resolve;
    const dlg = $('#dlg-scan');
    $('#scan-input').value = '';
    $('.scan-frame').classList.remove('hit');
    $('.scan-frame').hidden = false;
    setScanHint('Abriendo la cámara…');
    dlg.showModal();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error(), { name: 'NoCamera' });
      const [stream, det] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } }),
        getDetector(),
      ]);
      if (!dlg.open) { stream.getTracks().forEach(t => t.stop()); return; }
      scanner.stream = stream;
      const v = $('#scan-video');
      v.srcObject = stream;
      await v.play().catch(() => {});
      setScanHint('Apunta al código de barras del libro (ISBN). Se leerá solo.');
      scanLoop(det);
    } catch (e) {
      stopCamera();
      $('.scan-frame').hidden = true;
      setScanHint(e.name === 'NotAllowedError'
        ? 'No hay permiso para usar la cámara. Actívalo en los ajustes del navegador o escribe el código abajo.'
        : 'No se pudo abrir la cámara. Escribe el código abajo.');
    }
  });
}
function scanLoop(det) {
  const v = $('#scan-video');
  const tick = async () => {
    if (!scanner.stream) return;
    if (v.readyState >= 2 && !scanner.busy) {
      scanner.busy = true;
      try {
        const found = await det.detect(v);
        for (const b of found) {
          const code = normalizeCode(b.rawValue);
          if (code && !isISBN(code)) {
            setScanHint('Ese código no es de un libro. El escáner solo lee ISBN (empiezan por 978 o 979).');
          }
          if (code && isISBN(code)) {
            $('.scan-frame').classList.add('hit');
            navigator.vibrate?.(60);
            setTimeout(() => finishScan(code), 150);
            scanner.busy = false;
            return;
          }
        }
      } catch {}
      scanner.busy = false;
    }
    scanner.timer = setTimeout(tick, 180);
  };
  tick();
}

/* ---------- Consulta de datos por ISBN: Google Books → Open Library ---------- */
async function getJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function lookupBook(isbn) {
  const out = [];
  try {
    const d = await getJSON(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    for (const it of d.items || []) {
      const v = it.volumeInfo || {};
      const img = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || '';
      out.push({
        title: [v.title, v.subtitle].filter(Boolean).join(': '),
        creator: (v.authors || []).join(', '),
        year: (v.publishedDate || '').slice(0, 4),
        genre: (v.categories || [])[0] || '',
        cover: img ? img.replace(/^http:/, 'https:').replace('&edge=curl', '') : '',
      });
    }
  } catch {}
  try {
    const d = await getJSON(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
    const b = d[`ISBN:${isbn}`];
    if (b) out.push({
      title: [b.title, b.subtitle].filter(Boolean).join(': '),
      creator: (b.authors || []).map(a => a.name).join(', '),
      year: ((b.publish_date || '').match(/\d{4}/) || [''])[0],
      genre: '',
      cover: b.cover?.large || b.cover?.medium || '',
    });
  } catch {}
  // Portada de Open Library por ISBN como alternativa
  if (out.length) out.push({ ...out[0], cover: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false` });
  return out;
}

/** Busca los datos de un libro por su ISBN (el escáner solo se usa para libros). */
async function lookupByCode(code) {
  const c = await lookupBook(code);
  return { type: 'libro', format: '', candidates: c, source: 'Google Books / Open Library' };
}

/** Rellena el formulario a partir de un código (escaneado o escrito). */
async function fillFromCode(code, preset = null) {
  $('#f-code').value = code;
  const owned = state.items.find(i => sameCode(i.code, code) && i.id !== state.editing?.id);
  if (owned) {
    const see = await ask({
      title: '¡Ya lo tienes!',
      text: `Este código corresponde a «${owned.title}»${owned.creator ? ` de ${owned.creator}` : ''} (${typeLabel(owned)}${owned.location ? `, en ${owned.location}` : ''}${owned.loan ? `, prestado a ${owned.loan.to}` : ''}).`,
      ok: 'Ver ficha', cancel: 'Seguir añadiendo',
    });
    if (see) { $('#dlg-form').close(); openDetail(owned); return; }
  }
  $('#online').hidden = false;
  $('#online-results').innerHTML = '';
  $('#online-status').textContent = 'Buscando datos del código…';
  const r = preset || await lookupByCode(code);
  if (!$('#dlg-form').open) return;
  if (!r.candidates.length) {
    $('#online-status').textContent = 'No he encontrado datos para este código. Escribe el título y pulsa «Buscar portada».';
    $('#f-title').focus();
    return;
  }
  form.type = r.type || form.type;
  if (r.format) form.format = r.format;
  updateFormType();
  showResults(r.candidates.filter(c => c.cover), `Datos de ${r.source}. Revísalos antes de guardar; toca otra portada si prefieres.`);
  const first = r.candidates[0];
  if (!$('#f-title').value.trim()) $('#f-title').value = first.title;
  if (!$('#f-creator').value.trim() && first.creator) $('#f-creator').value = first.creator;
  if (!$('#f-year').value.trim() && first.year) $('#f-year').value = first.year;
  if (!$('#f-genre').value.trim() && first.genre) $('#f-genre').value = first.genre;
  const coverIdx = lastResults.findIndex(c => c.cover);
  if (coverIdx >= 0 && !form.cover) pickResult(coverIdx, { keepOpen: true, quiet: true });
  updateCoverPreview();
  toast('Datos encontrados');
}

async function scanIntoForm() {
  const code = await scanCode();
  if (code) fillFromCode(code);
}

/** Desde la lupa: ¿ya lo tengo? */
async function scanFromSearch() {
  const code = await scanCode();
  if (!code) return;
  const owned = state.items.filter(i => sameCode(i.code, code));
  if (owned.length) {
    openDetail(owned[0]);
    toast('¡Ya lo tienes!');
    return;
  }
  toast('No está en tu biblioteca. Buscando datos…', { duration: 0 });
  const r = await lookupByCode(code);
  $('#toast').classList.remove('show');
  const first = r.candidates[0];
  if (first) {
    const probe = { id: '', type: r.type, title: first.title, creator: first.creator };
    const similar = findDuplicate(probe);
    if (similar) {
      const same = await ask({
        title: '¿Es este?',
        text: `El código no está guardado, pero tienes «${similar.title}»${similar.creator ? ` de ${similar.creator}` : ''} (${typeLabel(similar)}). El código corresponde a «${first.title}»${first.creator ? ` de ${first.creator}` : ''}.`,
        ok: 'Sí, es este', cancel: 'No, es otro',
      });
      if (same) {
        const next = await updateItem(similar, { code: similar.code || code });
        openDetail(next);
        toast('Código guardado en la ficha');
        return;
      }
    }
  }
  const add = await ask({
    title: 'No lo tienes',
    text: first
      ? `«${first.title}»${first.creator ? ` de ${first.creator}` : ''} no está en tu biblioteca. ¿Quieres añadirlo?`
      : `El ISBN ${code} no está en tu biblioteca y no he encontrado sus datos. ¿Quieres añadirlo escribiendo el título?`,
    ok: 'Añadir', cancel: 'Cerrar',
  });
  if (!add) return;
  openForm();
  if (r.type) { form.type = r.type; updateFormType(); }
  fillFromCode(code, r);
}

/* ---------- Clave de TMDB ---------- */
function renderTmdbPanel() {
  const has = !!tmdbKey();
  $('#tmdb-key').value = '';
  $('#tmdb-key').placeholder = has ? 'Clave guardada ••••••' : 'Clave de API o token';
  $('#tmdb-remove').hidden = !has;
  $('#tmdb-status').textContent = has ? 'Activado: las películas se buscan también en TMDB.' : '';
}
async function saveTmdbKey() {
  const key = $('#tmdb-key').value.trim();
  const st = $('#tmdb-status');
  if (!key) { st.textContent = 'Pega la clave de API o el token de lectura de TMDB.'; return; }
  st.textContent = 'Comprobando…';
  try {
    await tmdbFetch('/configuration', {}, key);
    localStorage.setItem('mb-tmdb', key);
    tmdbGenres = null;
    renderTmdbPanel();
    toast('Clave de TMDB guardada');
  } catch (e) {
    st.textContent = e.message === 'tmdb-auth' ? 'TMDB no acepta esa clave. Copia la «Clave de la API» o el «Token de acceso de lectura».' : 'No se pudo comprobar (¿sin conexión?). Inténtalo de nuevo.';
  }
}

/* ---------- Inventario para Excel (CSV) ---------- */
function exportInventory() {
  if (!state.items.length) { toast('La biblioteca está vacía'); return; }
  const cols = [
    ['Apartado', i => SECTION_LABEL[i.type]],
    ['Tipo', i => i.type === 'pelicula' ? kindLabel(i) : TYPES[i.type].label],
    ['Título', i => i.title],
    ['Autor / Artista / Director / Editorial', i => i.creator],
    ['Año', i => i.year],
    ['Formato', i => fmtOf(i)],
    ['Temporadas', i => seasonsText(i) ? i.seasons : ''],
    ['Género', i => i.genre],
    ['ISBN', i => i.code ? `="${i.code}"` : ''],                    // ="…" evita que Excel lo convierta en número
    ['Jugadores', i => i.type === 'juego' ? playersText(i) : ''],
    ['Duración (min)', i => i.type === 'juego' ? i.duration ?? '' : ''],
    ['Edad mínima', i => i.type === 'juego' ? i.age ?? '' : ''],
    ['Ubicación', i => i.location],
    ['Precio (€)', i => !i.gift && i.price != null ? i.price.toFixed(2).replace('.', ',') : ''],
    ['Regalo', i => i.gift ? 'Sí' : ''],
    ['Regalo de', i => i.gift ? i.giftFrom : ''],
    ['Leído / visto', i => canSee(i) ? (i.seen ? 'Sí' : 'No') : ''],
    ['Prestado a', i => i.loan?.to || ''],
    ['Prestado desde', i => i.loan ? fmtDate(i.loan.since) : ''],
    ['Notas / descripción', i => i.notes],
    ['Portada (URL)', i => /^https?:/.test(i.cover || '') ? i.cover : ''],
    ['Añadido', i => i.createdAt ? new Date(i.createdAt).toLocaleDateString('es-ES') : ''],
  ];
  const cell = v => {
    const t = (v ?? '').toString();
    if (t.startsWith('="')) return t;
    return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const cmp = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });
  const rows = [...state.items].sort((a, b) =>
    TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || cmp(titleKey(a.title), titleKey(b.title)));
  // Separador «;» y BOM UTF-8: así Excel en español lo abre bien, con tildes y decimales con coma
  const csv = '\ufeff' + [cols.map(c => cell(c[0])).join(';'), ...rows.map(i => cols.map(c => cell(c[1](i))).join(';'))].join('\r\n');
  const name = `mi-biblioteca-inventario-${today()}.csv`;
  const file = new File([csv], name, { type: 'text/csv' });
  // En el móvil: menú de compartir (guardar en Archivos, enviar por correo…); en el ordenador: descarga
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file], title: 'Inventario Mi Biblioteca' }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Inventario descargado');
}

/* ---------- Copia de seguridad ---------- */
function exportData() {
  const data = { app: 'mi-biblioteca', version: 3, exportedAt: new Date().toISOString(), items: state.items, deleted: getDeleted() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mi-biblioteca-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  localStorage.setItem('mb-last-export', Date.now());
  renderTip();
  toast('Copia exportada');
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    const items = (Array.isArray(data) ? data : data.items || []).filter(i => i && i.id && i.title && TYPES[i.type]);
    if (!items.length) throw new Error('vacío');
    const ok = await ask({
      title: 'Importar copia',
      text: `El archivo tiene ${plural(items.length, 'elemento', 'elementos')}. Se añadirán a tu biblioteca y sustituirán a los que coincidan. No se borra nada.`,
      ok: 'Importar',
    });
    if (!ok) return;
    const now = Date.now();
    const del = getDeleted();
    items.forEach(i => {
      i.updatedAt = Math.max(i.updatedAt || i.createdAt || 0, 1);
      if (del[i.id]) { delete del[i.id]; i.updatedAt = now; }   // lo importado gana a un borrado anterior
    });
    setDeleted(del);
    await store.putMany(items);
    state.items = await store.all();
    markChanged();
    render();
    $('#dlg-menu').close();
    toast(plural(items.length, 'elemento importado', 'elementos importados'));
  } catch {
    toast('El archivo no es una copia válida');
  }
}

function updateStats() {
  const c = { libro: 0, cd: 0, pelicula: 0, juego: 0 }, f = {};
  state.items.forEach(i => { c[i.type]++; const k = fmtOf(i); if (k) f[k] = (f[k] || 0) + 1; });
  const part = fs => fs.filter(x => f[x]).map(x => `${f[x]} ${x}`).join(', ');
  const loaned = state.items.filter(i => i.loan).length;
  $('#stats').textContent = [
    plural(c.libro, 'libro', 'libros'),
    `${c.cd} de música${part(FORMATS.cd) ? ` (${part(FORMATS.cd)})` : ''}`,
    `${c.pelicula} de cine y series${part(FORMATS.pelicula) ? ` (${part(FORMATS.pelicula)})` : ''}`,
    plural(c.juego, 'juego', 'juegos'),
  ].join(' · ') + (loaned ? ` · ${loaned} prestado${loaned === 1 ? '' : 's'}` : '');
  const sb = state.items.filter(i => i.type === 'libro' && i.seen).length;
  const sp = state.items.filter(i => i.type === 'pelicula' && i.seen).length;
  const parts = [];
  if (c.libro) parts.push(`${sb} de ${plural(c.libro, 'libro leído', 'libros leídos')}`);
  if (c.pelicula) parts.push(`${sp} de ${c.pelicula} películas y series vistas`);
  $('#stats-seen').textContent = parts.join(' · ');
  const rows = TYPE_ORDER.map(t => {
    const m = sectionMoney(t);
    if (!m.priced && !m.gifts) return '';
    const label = SECTION_LABEL[t];
    const bits = [];
    if (m.priced) bits.push(`${fmtPrice(m.total)} (${m.priced} con precio)`);
    if (m.gifts) bits.push(plural(m.gifts, 'regalo', 'regalos'));
    return `<li><span>${label}</span><span>${bits.join(' · ')}</span></li>`;
  }).filter(Boolean);
  $('#stats-money').innerHTML = rows.length ? `<strong>Gastado por apartado</strong><ul class="money-list">${rows.join('')}</ul>` : '';
}

/* ---------- Sincronización con GitHub ----------
   Guarda { items, deleted } en un JSON de un repositorio (privado) mediante la API de contenidos.
   El móvil conserva siempre una copia local; al sincronizar se fusionan local y remoto:
   por cada elemento gana la versión editada más recientemente, y los borrados se recuerdan
   en "deleted" para que no reaparezcan desde otro dispositivo. */
const SYNC_KEY = 'mb-sync';
const sync = {
  cfg: (() => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)); } catch { return null; } })(),
  running: false, again: false, timer: null,
  status: 'off', error: '',
  lastAt: +localStorage.getItem('mb-last-sync') || 0,
};
const stamp = it => it.updatedAt || it.createdAt || 0;
function getDeleted() { try { return JSON.parse(localStorage.getItem('mb-deleted') || '{}'); } catch { return {}; } }
function setDeleted(d) { localStorage.setItem('mb-deleted', JSON.stringify(d)); }
function isDirty() { return localStorage.getItem('mb-dirty') === '1'; }
function setDirty(v) { if (v) localStorage.setItem('mb-dirty', '1'); else localStorage.removeItem('mb-dirty'); }

function markChanged() {
  if (!sync.cfg) return;
  setDirty(true);
  setSyncStatus('dirty');
  scheduleSync(1500);
}
function scheduleSync(ms = 0) {
  if (!sync.cfg) return;
  clearTimeout(sync.timer);
  sync.timer = setTimeout(() => runSync(), ms);
}

function setSyncStatus(status, error = '') {
  sync.status = status;
  sync.error = error;
  const b = $('#btn-sync');
  b.hidden = !sync.cfg;
  b.className = 'icon-btn sync-btn ' + status;
  const labels = { ok: 'Sincronizado', dirty: 'Cambios pendientes de subir', syncing: 'Sincronizando…', offline: 'Sin conexión: se subirá al volver la red', error: 'Error: ' + error };
  b.setAttribute('aria-label', labels[status] || 'Sincronizar');
  b.title = labels[status] || '';
  if ($('#dlg-menu').open) renderSyncPanel();
}

function renderSyncPanel() {
  const on = !!sync.cfg;
  $('#sync-off').hidden = on;
  $('#sync-on').hidden = !on;
  if (on) {
    const c = sync.cfg;
    $('#gh-where').textContent = `${c.owner}/${c.repo} › ${c.path}`;
    const when = sync.lastAt ? new Date(sync.lastAt).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'nunca';
    const st = { ok: 'Todo sincronizado.', dirty: 'Hay cambios pendientes de subir.', syncing: 'Sincronizando…', offline: 'Sin conexión. Los cambios se subirán al volver la red.', error: 'Error: ' + sync.error }[sync.status] || '';
    $('#gh-status').textContent = `${st} Última sincronización: ${when}.`;
    $('#gh-sync').disabled = sync.status === 'syncing';
  } else {
    $('#gh-branch').value = ''; $('#gh-path').value = '';
  }
}

const b64enc = str => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64dec = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));

function ghFileUrl(c) {
  return `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${c.path.split('/').map(encodeURIComponent).join('/')}`;
}
function gh(c, url, opts = {}) {
  return fetch(url, {
    ...opts,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${c.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers || {}),
    },
  });
}
async function ghError(r) {
  let msg = '';
  try { msg = (await r.json()).message || ''; } catch {}
  if (r.status === 401) return new Error('El token no es válido o ha caducado.');
  if (r.status === 403 && /rate limit/i.test(msg)) return new Error('GitHub ha limitado las peticiones. Prueba en unos minutos.');
  if (r.status === 403) return new Error('El token no tiene permiso de escritura en el repositorio (Contents: Read and write).');
  if (r.status === 404) return new Error('No encuentro el repositorio o el token no tiene acceso a él.');
  return new Error(`GitHub respondió ${r.status}${msg ? ': ' + msg : ''}`);
}

async function pull(c) {
  const url = `${ghFileUrl(c)}?ref=${encodeURIComponent(c.branch)}`;
  const r = await gh(c, url);
  if (r.status === 404) return { sha: null, data: { items: [], deleted: {} } };   // el archivo aún no existe
  if (!r.ok) throw await ghError(r);
  const j = await r.json();
  let text;
  if (j.encoding === 'base64' && j.content) text = b64dec(j.content);
  else {                                     // archivos > 1 MB: pedir el contenido en bruto
    const raw = await gh(c, url, { headers: { Accept: 'application/vnd.github.raw' } });
    if (!raw.ok) throw await ghError(raw);
    text = await raw.text();
  }
  let data;
  try { data = text.trim() ? JSON.parse(text) : {}; }
  catch { throw new Error(`El archivo ${c.path} de GitHub no es un JSON válido.`); }
  const items = (Array.isArray(data) ? data : data.items || []).filter(i => i && i.id && i.title && TYPES[i.type]);
  return { sha: j.sha, data: { items, deleted: data.deleted || {} } };
}

function serialize(d) {
  const items = [...d.items].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id));
  const deleted = Object.fromEntries(Object.entries(d.deleted).sort());
  return JSON.stringify({ app: 'mi-biblioteca', version: 3, items, deleted }, null, 2) + '\n';
}

async function push(c, data, sha) {
  const body = { message: `Mi Biblioteca: ${plural(data.items.length, 'elemento', 'elementos')}`, content: b64enc(serialize(data)), branch: c.branch };
  if (sha) body.sha = sha;
  const r = await gh(c, ghFileUrl(c), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) return false;   // cambió entre medias: reintentar
  if (!r.ok) throw await ghError(r);
  return true;
}

function merge(aItems, aDel, bItems, bDel) {
  const deleted = { ...aDel };
  for (const [id, t] of Object.entries(bDel || {})) deleted[id] = Math.max(deleted[id] || 0, t);
  const map = new Map();
  for (const it of [...aItems, ...bItems]) {
    const cur = map.get(it.id);
    if (!cur || stamp(it) > stamp(cur)) map.set(it.id, it);
  }
  const items = [...map.values()].filter(it => !(deleted[it.id] && deleted[it.id] >= stamp(it)));
  return { items, deleted };
}

/** Aplica el resultado fusionado a la copia local (respetando cambios hechos mientras tanto). */
async function applyLocal(remote) {
  const final = merge(state.items, getDeleted(), remote.items, remote.deleted);
  setDeleted(final.deleted);
  const ids = new Set(final.items.map(i => i.id));
  const removed = state.items.filter(i => !ids.has(i.id)).map(i => i.id);
  const byId = new Map(state.items.map(i => [i.id, i]));
  const changed = final.items.filter(i => !byId.has(i.id) || stamp(byId.get(i.id)) !== stamp(i));
  if (removed.length || changed.length) {
    await tx('readwrite', s => { removed.forEach(id => s.delete(id)); changed.forEach(i => s.put(i)); });
    state.items = final.items;
    render();
    if (state.detail && $('#dlg-detail').open) {
      const d = state.items.find(i => i.id === state.detail.id);
      if (d) openDetail(d); else $('#dlg-detail').close();
    }
  }
  return final;
}

async function runSync({ manual = false } = {}) {
  if (!sync.cfg) return;
  if (sync.running) { sync.again = true; return; }
  if (!navigator.onLine) { setSyncStatus('offline'); if (manual) toast('Sin conexión'); return; }
  sync.running = true;
  setSyncStatus('syncing');
  try {
    let done = false;
    for (let attempt = 0; attempt < 4 && !done; attempt++) {
      const remote = await pull(sync.cfg);
      const final = await applyLocal(remote.data);
      if (serialize(final) === serialize(remote.data)) done = true;     // nada que subir
      else done = await push(sync.cfg, final, remote.sha);
    }
    if (!done) throw new Error('No se pudo guardar por cambios simultáneos. Vuelve a intentarlo.');
    setDirty(false);
    sync.lastAt = Date.now();
    localStorage.setItem('mb-last-sync', sync.lastAt);
    setSyncStatus('ok');
    if (manual) toast('Biblioteca sincronizada');
  } catch (e) {
    const offline = !navigator.onLine || e instanceof TypeError;      // TypeError = fallo de red en fetch
    setSyncStatus(offline ? 'offline' : 'error', offline ? '' : e.message);
    if (manual) toast(offline ? 'Sin conexión con GitHub' : e.message);
  } finally {
    sync.running = false;
    if (sync.again) { sync.again = false; scheduleSync(300); }
    else if (isDirty() && sync.status === 'ok') setSyncStatus('dirty');
  }
}

async function connectGitHub() {
  const err = $('#gh-error');
  const owner = $('#gh-owner').value.trim().replace(/^@/, '');
  const repo = $('#gh-repo').value.trim().replace(/^.*\//, '');
  const token = $('#gh-token').value.trim();
  const showErr = m => { err.textContent = m; err.hidden = false; };
  if (!owner || !repo || !token) return showErr('Rellena usuario, repositorio y token.');
  const btn = $('#gh-connect');
  btn.disabled = true; btn.textContent = 'Comprobando…';
  try {
    const cfg = { owner, repo, token, path: $('#gh-path').value.trim().replace(/^\/+/, '') || 'biblioteca.json', branch: $('#gh-branch').value.trim() };
    const r = await gh(cfg, `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
    if (!r.ok) throw await ghError(r);
    const info = await r.json();
    if (!cfg.branch) cfg.branch = info.default_branch || 'main';
    sync.cfg = cfg;
    localStorage.setItem(SYNC_KEY, JSON.stringify(cfg));
    if (state.items.length) setDirty(true);
    $('#gh-token').value = '';
    setSyncStatus('dirty');
    await runSync();
    if (sync.status === 'error') {            // p. ej. token sin permiso de escritura: volver al formulario
      const msg = sync.error;
      sync.cfg = null;
      localStorage.removeItem(SYNC_KEY);
      setSyncStatus('off');
      $('#gh-token').value = token;
      showErr(msg);
      return;
    }
    renderTip();
    toast(info.private ? 'Conectado y sincronizado' : 'Conectado. Aviso: el repositorio es público y cualquiera puede ver tu biblioteca', { duration: info.private ? 2600 : 6000 });
  } catch (e) {
    showErr(e instanceof TypeError ? 'No se pudo conectar con GitHub. Revisa la conexión.' : e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Conectar';
    renderSyncPanel();
  }
}

async function disconnectGitHub() {
  const ok = await ask({
    title: '¿Desconectar de GitHub?',
    text: 'Tu biblioteca se queda en este dispositivo y el archivo de GitHub no se borra. Podrás volver a conectar cuando quieras.',
    ok: 'Desconectar', danger: true,
  });
  if (!ok) return;
  sync.cfg = null;
  localStorage.removeItem(SYNC_KEY);
  setDirty(false);
  setSyncStatus('off');
  renderSyncPanel();
  renderTip();
  toast('Desconectado de GitHub');
}

/* ---------- Actualizaciones de la app ---------- */
function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  const hadController = !!navigator.serviceWorker.controller;   // en la primera visita no hay que recargar
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
  const offerUpdate = worker => toast('Hay una nueva versión de la app', {
    action: 'Actualizar', duration: 0,
    onAction: () => worker.postMessage('skipWaiting'),
  });
  navigator.serviceWorker.register('sw.js').then(reg => {
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w);
      });
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}

/* ---------- Eventos ---------- */
function bind() {
  // Filtros
  const goTo = type => {
    state.type = type;
    state.format = 'all';
    state.players = 'all';
    state.kind = 'all';
    localStorage.setItem('mb-type', state.type);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  $('#tabbar').addEventListener('click', e => {
    const t = e.target.closest('.tab'); if (!t) return;
    goTo(state.type === t.dataset.type ? 'all' : t.dataset.type);   // tocar el apartado activo vuelve a «Todo»
  });
  $('#btn-home').addEventListener('click', () => goTo('all'));
  $('#format-chips').addEventListener('change', e => {
    const sel = e.target.closest('select[data-filter]'); if (!sel) return;
    state[sel.dataset.filter] = sel.value;
    render();
  });
  $('#format-chips').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    if (c.dataset.loaned) state.loaned = !state.loaned;
    else if (c.dataset.seen) state.seen = state.seen === c.dataset.seen ? 'all' : c.dataset.seen;   // tocar otra vez lo quita
    else state.format = c.dataset.format;
    render();
  });

  // Vista
  $('#btn-view').addEventListener('click', () => {
    state.view = state.view === 'list' ? 'grid' : 'list';
    localStorage.setItem('mb-view', state.view);
    render();
  });

  // Búsqueda (con pequeña espera para no repintar en cada tecla)
  $('#btn-search').addEventListener('click', () => {
    const bar = $('#search-bar');
    bar.hidden = !bar.hidden;
    if (!bar.hidden) $('#search').focus();
    else { $('#search').value = ''; state.query = ''; render(); }
  });
  let searchTimer;
  $('#search').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.query = e.target.value; render(); }, 120);
  });

  // Portadas / filas
  $('#grid').addEventListener('click', e => {
    const el = e.target.closest('[data-id]'); if (!el) return;
    const item = state.items.find(i => i.id === el.dataset.id);
    if (item) openDetail(item);
  });

  // Avisos
  $('#tip').addEventListener('click', async e => {
    const close = e.target.closest('[data-tip]');
    if (close) return dismissTip(close.dataset.tip);
    if (e.target.closest('#tip-backup')) { $('#btn-menu').click(); return; }
    if (e.target.closest('#tip-install') && installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice.catch(() => {});
      installPrompt = null;
      renderTip();
    }
  });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; renderTip(); });
  window.addEventListener('appinstalled', () => { installPrompt = null; renderTip(); });

  // Cerrar diálogos (fondo o botón X)
  $$('dialog').forEach(d => {
    if (d.id === 'dlg-scan') return;
    if (d.id === 'dlg-ask') {
      d.addEventListener('click', e => { if (e.target === d) d.close(); });
      return;
    }
    d.addEventListener('click', e => {
      if (e.target === d || e.target.closest('[data-close]')) d.close();
    });
  });

  // Detalle
  $('#d-edit').addEventListener('click', () => openForm(state.detail));
  $('#d-delete').addEventListener('click', deleteItem);
  $('#d-seen').addEventListener('click', e => {
    if (e.target.closest('#d-see')) toggleSeen(true);
    if (e.target.closest('#d-unsee')) toggleSeen(false);
  });
  $('#d-loan').addEventListener('click', e => {
    if (e.target.closest('#d-lend')) lendItem();
    if (e.target.closest('#d-return')) returnItem();
  });

  // Añadir
  $('#btn-add').addEventListener('click', () => openForm());

  // Formulario
  $('#f-type').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    form.type = b.dataset.value;
    $('#online-results').innerHTML = ''; $('#online-status').textContent = '';
    updateFormType();
  });
  $('#f-format').addEventListener('change', e => { form.format = e.target.value; updateCoverPreview(); });
  $('#f-kind').addEventListener('change', e => { form.kind = e.target.value; updateFormType(); });
  $('#f-gift').addEventListener('change', () => { updateGiftField(); if ($('#f-gift').checked) $('#f-gift-from').focus(); });
  $('#f-title').addEventListener('input', updateCoverPreview);
  $('#f-creator').addEventListener('input', updateCoverPreview);
  ['#f-pmin', '#f-pmax', '#f-duration', '#f-age'].forEach(id => $(id).addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); }));
  $('#f-year').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });
  $('#form').addEventListener('submit', saveForm);
  $('#f-url').addEventListener('click', pasteCoverUrl);
  $('#f-cover-remove').addEventListener('click', () => { form.cover = ''; updateCoverPreview(); });
  $('#f-online').addEventListener('click', () => {
    const box = $('#online');
    box.hidden = !box.hidden;
    if (!box.hidden) {
      const q = [$('#f-title').value.trim(), form.type !== 'pelicula' ? $('#f-creator').value.trim() : ''].filter(Boolean).join(' ');
      $('#online-q').value = q;
      if (q) runOnlineSearch(); else $('#online-q').focus();
    }
  });
  $('#online-go').addEventListener('click', runOnlineSearch);

  // Escáner
  $('#f-scan').addEventListener('click', scanIntoForm);
  $('#btn-scan-search').addEventListener('click', scanFromSearch);
  $('#scan-close').addEventListener('click', () => finishScan(null));
  $('#dlg-scan').addEventListener('close', () => finishScan(null));
  $('#scan-manual').addEventListener('submit', e => {
    e.preventDefault();
    const code = normalizeCode($('#scan-input').value);
    if (!code || !isISBN(code)) { setScanHint('Ese ISBN no es válido. Revisa los números (10 o 13 cifras).'); return; }
    finishScan(code);
  });
  $('#f-code-lookup').addEventListener('click', () => {
    const code = normalizeCode($('#f-code').value);
    if (!code || !isISBN(code)) { toast('Escribe un ISBN válido (10 o 13 cifras)'); return; }
    fillFromCode(code);
  });
  $('#online-q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runOnlineSearch(); } });
  $('#online-results').addEventListener('click', e => {
    const r = e.target.closest('.result'); if (r) pickResult(+r.dataset.i);
  });

  // Menú
  $('#btn-menu').addEventListener('click', () => { setSegmented($('#sort'), state.sort); updateStats(); renderSyncPanel(); renderTmdbPanel(); $('#dlg-menu').showModal(); });
  $('#tmdb-save').addEventListener('click', saveTmdbKey);
  $('#tmdb-remove').addEventListener('click', () => { localStorage.removeItem('mb-tmdb'); renderTmdbPanel(); toast('Clave de TMDB eliminada'); });
  $('#sort').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    state.sort = b.dataset.value;
    localStorage.setItem('mb-sort', state.sort);
    setSegmented($('#sort'), state.sort);
    render();
  });
  $('#btn-export').addEventListener('click', exportData);
  $('#btn-inventory').addEventListener('click', exportInventory);
  $('#file-import').addEventListener('change', e => { const f = e.target.files[0]; if (f) importData(f); e.target.value = ''; });

  // Sincronización con GitHub
  $('#gh-connect').addEventListener('click', connectGitHub);
  $('#gh-sync').addEventListener('click', () => runSync({ manual: true }));
  $('#gh-disconnect').addEventListener('click', disconnectGitHub);
  $('#btn-sync').addEventListener('click', () => {
    if (sync.status === 'error') toast(sync.error || 'Error al sincronizar');
    runSync({ manual: true });
  });
  ['gh-owner', 'gh-repo', 'gh-token'].forEach(id => $('#' + id).addEventListener('input', () => { $('#gh-error').hidden = true; }));
  window.addEventListener('online', () => scheduleSync(0));
  window.addEventListener('offline', () => { if (sync.cfg) setSyncStatus('offline'); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(0); });
}

/* ---------- Inicio ---------- */
(async function init() {
  bind();
  try {
    state.items = await store.all();
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  } catch {
    toast('No se pudo abrir el almacenamiento del navegador');
  }
  render();
  setSyncStatus(sync.cfg ? (isDirty() ? 'dirty' : 'ok') : 'off');
  scheduleSync(0);
  setupServiceWorker();
})();
