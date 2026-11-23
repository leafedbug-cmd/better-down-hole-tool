/* The Better Down Hole Tool – mobile-first HDD drill-string builder.
   Data: data/catalog.json + data/roadmaps/<id>.json, generated from public manufacturer catalog APIs
   by tools/build_data.py. Compatibility rules mirror the source configurator. */
import { FREE_MACHINE_LIMIT, canAddMachine } from './billing.mjs';
import { canAddSignupMachine, equipmentCopy, signupMachineCap, signupMachineLimitError, signupMachinePayload } from './equipment.mjs';
import { friendlyAuthError } from './signup-errors.mjs';
import { normalizeConfig, quantity } from './config.mjs';
import { compute, lineItems, isLoadoutReady } from './compatibility.mjs';
import { normalizeSuppliers, augmentRoadmap } from './suppliers.mjs';
import { normalizeRadius, alternatesFor, slotOthers, fallbackImg, altLineItems, altKey, toggleAlt, MATCH_LABEL, RADIUS_BRAND } from './radius.mjs';

const IMG_HOST = 'https://www.hddadvisor.com';
// The manufacturer returns the same blank image for these catalog IDs.
const EMPTY_IMAGE_IDS = new Set([8040, 8044, 8052, 8056, 8060, 8069, 8077, 8091, 8095, 8100, 8105, 8109, 8113, 8118, 8126]);

/* ---------- tiny helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BRAND_THEMES = new Map([
  ['vermeer', 'vermeer'], ['vermeer-borestore', 'vermeer'],
  ['ditch-witch', 'ditch-witch'], ['melfred-borzall', 'melfred-borzall'],
  ['radius', 'radius'], ['radius-hdd', 'radius'],
]);
const brandTheme = (brand) => BRAND_THEMES.get(String(brand || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) || 'neutral';
const brandAttr = (brand) => ` data-brand-theme="${brandTheme(brand)}"`;
const brandChip = (brand, id = brand) => `<span class="brand-chip"${brandAttr(id)}>${esc(brand)}</span>`;
const brandText = (brand, label = brand) => `<span class="brand-text"${brandAttr(brand)}>${esc(label)}</span>`;
// The base HDD Advisor roadmap supplies Ditch Witch tooling for both drill makes.
const partBrand = (part) => part.brand || 'Ditch Witch';
const partTheme = (part) => part.brandId || partBrand(part);
const partChip = (part) => brandChip(partBrand(part), partTheme(part));
const validImgId = (id) => (typeof id === 'number' || typeof id === 'string') && /^\d+$/.test(String(id))
  && Number.isSafeInteger(Number(id)) && Number(id) > 0 && !EMPTY_IMAGE_IDS.has(Number(id)) ? Number(id) : 0;
function safeHttpUrl(u) {
  if (typeof u !== 'string') return null;
  const trimmed = u.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    if (typeof URL === 'function') {
      const parsed = new URL(trimmed);
      return (parsed.protocol === 'https:' || parsed.protocol === 'http:') ? parsed.href : null;
    }
    return trimmed;
  } catch { return null; }
}
function safeStripeUrl(u) {
  const href = safeHttpUrl(u);
  if (!href) return null;
  try {
    if (typeof URL === 'function') {
      const parsed = new URL(href);
      if (parsed.protocol !== 'https:') return null;
      return (parsed.hostname === 'checkout.stripe.com' || parsed.hostname === 'billing.stripe.com' || parsed.hostname.endsWith('.stripe.com'))
        ? parsed.href
        : null;
    }
    return /^https:\/\/([a-z0-9-]+\.)*stripe\.com(\/|$)/i.test(href) ? href : null;
  } catch { return null; }
}
const img = (id, w = 400, h = 200) => {
  const safeId = validImgId(id);
  return safeId ? `${IMG_HOST}/Image/Thumbnail/${safeId}?width=${w}&height=${h}` : 'img/placeholder.svg';
};
// small profile thumbnails are mirrored locally (tools/fetch_images.py); fall back to hddadvisor.com,
// then (optional `fb`) a cross-referenced Radius photo, then a placeholder
const fbAttr = (fb) => (fb ? ` data-altimg="${esc(fb)}"` : '');
const imgTag = (id, w, h, alt = '', cls = '', fb = null) => {
  const safeId = validImgId(id);
  return !safeId ? (fb ? `<img src="${esc(fb)}" alt="${esc(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : `<img src="img/placeholder.svg" alt="">`) :
    `<img ${cls ? `class="${esc(cls)}"` : ''} src="img/parts/${safeId}.png" data-remote="${img(safeId, w, h)}"${fbAttr(fb)} alt="${esc(alt)}" loading="lazy" decoding="async">`;
};
const photoTag = (id, alt = '', fb = null) => {
  const safeId = validImgId(id);
  return !safeId ? (fb ? `<img src="${esc(fb)}" alt="${esc(alt)}" decoding="async" referrerpolicy="no-referrer">` : `<img src="img/placeholder.svg" alt="">`) :
    `<img src="${img(safeId, 800, 800)}" data-local="img/parts/${safeId}.png"${fbAttr(fb)} alt="${esc(alt)}" decoding="async">`;
};
// List cards and the string rail use the mirrored catalog file in img/parts/, not a shared glyph.
function catalogPhoto(id, alt) {
  const inner = validImgId(id) ? imgTag(id, 360, 140, alt) : `<img src="img/placeholder.svg" alt="">`;
  return `<div class="c-photo">${inner}</div>`;
}
window.imgFallback = (el) => {
  if (!el) return;
  if (el.dataset?.remote) { const r = el.dataset.remote; delete el.dataset.remote; el.src = r; }
  else if (el.dataset?.local) { const l = el.dataset.local; delete el.dataset.local; el.src = l; }
  else if (el.dataset?.altimg) { const a = el.dataset.altimg; delete el.dataset.altimg; el.referrerPolicy = 'no-referrer'; el.src = a; }
  else { el.onerror = null; if (el.src !== 'img/placeholder.svg' && !String(el.src).endsWith('/img/placeholder.svg')) el.src = 'img/placeholder.svg'; }
};
document.addEventListener('error', (e) => {
  if (e.target?.tagName === 'IMG') window.imgFallback(e.target);
}, true);
const ICON = {
  chev: '<svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7-1.4-1.4L13.2 12 7.6 6.4z"/></svg>',
  info: '<svg viewBox="0 0 24 24"><path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><path d="M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M18 16a3 3 0 0 0-2.4 1.2l-7-3.5a3 3 0 0 0 0-1.4l7-3.5A3 3 0 1 0 15 7l-7 3.5a3 3 0 1 0 0 3l7 3.5A3 3 0 1 0 18 16z"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12zM8 13h8v-2H8zm9-6h-4v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10z"/></svg>',
  sms: '<svg viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM9 11H7V9h2zm4 0h-2V9h2zm4 0h-2V9h2z"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5z"/></svg>',
  print: '<svg viewBox="0 0 24 24"><path d="M19 8H5a3 3 0 0 0-3 3v6h4v4h12v-4h4v-6a3 3 0 0 0-3-3zm-3 11H8v-5h8zm3-7a1 1 0 1 1 0-2 1 1 0 0 1 0 2zM18 3H6v4h12z"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"/></svg>',
  pipe: '<svg viewBox="0 0 40 40"><rect x="2" y="15" width="7" height="10" rx="1.5" fill="currentColor"/><rect x="9" y="17" width="22" height="6" fill="currentColor" opacity=".45"/><rect x="31" y="15" width="7" height="10" rx="1.5" fill="currentColor"/></svg>',
};

/* ---------- storage ---------- */
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const SAVED_KEY = 'hdda.saved.v1', LAST_KEY = 'hdda.last.v1';
const getSaved = () => store.get(SAVED_KEY, []);
function updateSavedBadge() {
  const n = getSaved().length, b = $('#saved-count');
  b.hidden = !n; b.textContent = n;
}

/* ---------- config <-> URL ---------- */
const b64e = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = (s) => {
  if (typeof s !== 'string' || s.length > 16384) return null;
  try { return JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))); } catch { return null; }
};
const newCfg = (m, p, r) => ({ m, p, r, mode: 'Bit', sel: {}, acc: {}, q: {} });
function cfgFromQuery(q) {
  const c = q.get('c') && b64d(q.get('c'));
  return normalizeConfig(c);
}
const shareUrl = (cfg, view = 'summary') => `${location.origin}${location.pathname}#/${view}?c=${b64e(cfg)}`;

/* ---------- data ---------- */
let CATALOG = null;
const RM_CACHE = new Map();
async function loadCatalog() {
  if (!CATALOG) {
    CATALOG = await (await fetch('data/catalog.json')).json();
    $('#data-date').textContent = CATALOG.fetched;
  }
  return CATALOG;
}
/* Supplier parts (data/suppliers): lazy, shared, and optional. Any failure leaves the roadmap exactly as it was. */
let SUPPLIERS_P = null;
function loadSuppliers() {
  if (!SUPPLIERS_P) {
    SUPPLIERS_P = Promise.all(['data/suppliers/brands.json', 'data/suppliers/parts.json'].map((u) => fetch(u).then((r) => (r.ok ? r.json() : null))))
      .then(([b, p]) => normalizeSuppliers(b, p)).catch(() => null);
  }
  return SUPPLIERS_P;
}
async function loadRoadmap(id) {
  const safeId = validImgId(id);
  if (!safeId) throw new Error('Tooling data not available for this drill/pipe yet.');
  if (!RM_CACHE.has(safeId)) {
    const r = await fetch(`data/roadmaps/${safeId}.json`);
    if (!r.ok) throw new Error('Tooling data not available for this drill/pipe yet.');
    const [rm, sup] = await Promise.all([r.json(), loadSuppliers()]);
    RM_CACHE.set(safeId, augmentRoadmap(rm, sup));
  }
  return RM_CACHE.get(safeId);
}
/* Radius HDD alternates: loaded lazily once; any failure just hides the feature. Never fed to compute(). */
let RADIUS = null, RADIUS_P = null;
const OTHER_BRANDS_KEY = 'bdht.otherBrands.v1';
function loadRadius() {
  if (!RADIUS_P) {
    RADIUS_P = Promise.all(['data/radius/parts.json', 'data/radius/crossref.json'].map(async (u) => {
      const r = await fetch(u);
      if (!r.ok) throw new Error(u);
      return r.json();
    })).then(([parts, xref]) => {
      const d = normalizeRadius(parts, xref);
      RADIUS = Object.keys(d.parts).length ? d : null;
      return RADIUS;
    }).catch(() => (RADIUS = null));
  }
  return RADIUS_P;
}
const showOther = () => !!RADIUS && store.get(OTHER_BRANDS_KEY, true) !== false;
const dwFallback = (p) => (showOther() && p?.pn ? fallbackImg(RADIUS, p.pn) : null);
const machine = (id) => CATALOG?.machines.find((m) => m.id === +id);
const pipeOf = (m, pid) => m?.pipes.find((p) => p.id === +pid);

/* ---------- part labels ---------- */
const connStr = (p) => [p.cl, [p.cr, p.cr2].filter(Boolean).join(' & ')].filter(Boolean).join(' → ');
const pnTxt = (p) => p.pn || 'not listed';

/* ---------- UI shell ---------- */
const app = $('#app');
function setStepper(step, cfg, ready = false) {
  const el = $('#stepper');
  const m = cfg?.m && machine(cfg.m), p = m && pipeOf(m, cfg.p);
  for (const node of [app, el, $('#actionbar')]) {
    if (step && m) node.dataset.brandTheme = brandTheme(m.brand);
    else delete node.dataset.brandTheme;
  }
  if (!step) { el.hidden = true; return; }
  const steps = [
    ['Drill', m ? m.model : 'Choose rig', '#/drill'],
    ['Pipe', p ? p.name : 'Lock pipe', m ? `#/pipe/${m.id}` : null],
    ['Build', cfg?.r ? (cfg.mode === 'Bit' ? 'Pilot (Bit)' : 'Pullback') : 'Equip slots', cfg?.r ? `#/build?c=${b64e(cfg)}` : null],
    [ready ? 'Confirm' : 'Brief', cfg?.r ? (ready ? 'Ready' : 'Draft') : 'Dispatch', cfg?.r ? `#/summary?c=${b64e(cfg)}` : null],
  ];
  el.innerHTML = `<ol>${steps.map(([t, sub, href], i) => {
    const done = i + 1 < step && (i !== 2 || ready);
    const cur = i + 1 === step;
    const cls = done ? 'done' : cur ? 'cur' : !href ? 'is-disabled' : '';
    const inner = `<i class="n">${done ? '✓' : i + 1}</i><span class="rd-step-text"><span class="rd-step-title">${esc(t)}</span>${sub ? `<em class="lbl-sub">${esc(sub)}</em>` : ''}</span>`;
    return `<li class="${cls}">${href && !cur ? `<a class="rd-step-item" href="${href}">${inner}</a>` : `<span class="rd-step-item" aria-current="${cur ? 'step' : 'false'}">${inner}</span>`}</li>`;
  }).join('')}</ol>`;
  el.hidden = false;
}
function setActionbar(html) {
  const ab = $('#actionbar');
  ab.hidden = !html; ab.innerHTML = html || '';
}
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
}
function openSheet(html, onMount) {
  const sh = $('#sheet'), bd = $('#sheet-backdrop');
  sh.innerHTML = `<div class="sheet-grab"></div>${html}`;
  sh.hidden = bd.hidden = false;
  requestAnimationFrame(() => { sh.classList.add('show'); bd.classList.add('show'); });
  document.body.style.overflow = 'hidden';
  $$('[data-close]', sh).forEach((b) => b.addEventListener('click', closeSheet));
  onMount && onMount(sh);
}
function closeSheet() {
  const sh = $('#sheet'), bd = $('#sheet-backdrop');
  sh.classList.remove('show'); bd.classList.remove('show');
  document.body.style.overflow = '';
  setTimeout(() => { sh.hidden = bd.hidden = true; sh.innerHTML = ''; }, 220);
}
$('#sheet-backdrop').addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => e.key === 'Escape' && !$('#sheet').hidden && closeSheet());
async function copyText(t) {
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = t; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch { return false; }
  };
  try {
    if (!navigator.clipboard?.writeText) return fallback();
    await Promise.race([
      navigator.clipboard.writeText(t),
      new Promise((_, reject) => setTimeout(() => reject(new Error('clipboard-timeout')), 700)),
    ]);
    return true;
  } catch { return fallback(); }
}

/* ---------- views ---------- */
function pageHead(kicker, title, sub) {
  return `<header class="page-head"><p class="kicker">${kicker}</p><h1>${title}</h1>${sub ? `<p class="lede">${sub}</p>` : ''}</header>`;
}
function viewHome() {
  setStepper(0); setActionbar('');
  const last = store.get(LAST_KEY, null), saved = getSaved().slice(0, 3);
  let lastHtml = '';
  if (last?.cfg) {
    lastHtml = `<a class="choice"${brandAttr(machine(last.cfg.m)?.brand)} href="#/build?c=${b64e(last.cfg)}"><div class="pipe-ico">${ICON.pipe}</div>
      <div class="c-main"><div class="small muted">Resume loadout</div><div class="c-title">${esc(last.title)}</div></div>${ICON.chev}</a>`;
  }
  app.innerHTML = `
  <section class="hero frame">
    <img src="img/hero-wide.jpg" alt="" fetchpriority="high">
    <div class="hero-body">
      <p class="kicker">Create a class</p>
      <h1>Build the loadout. <em>Equip every slot.</em></h1>
      <p>Pick a ${brandText('Ditch Witch', 'Ditch Witch®')} or ${brandText('Vermeer', 'Vermeer®')} drill, lock the pipe, then fill the string from the rig out to the bit. Share the loadout when the class is ready.</p>
      <a class="btn btn-primary btn-block" href="#/drill">Start a loadout ${ICON.chev}</a>
    </div>
  </section>
  ${ME.member ? `<a class="choice rig-cta" href="#/garage"><div class="pipe-ico">${ICON_RIG}</div><div class="c-main"><div class="small muted">${esc(ME.company.name)}</div><div class="c-title">Machines and loadouts</div></div>${ICON.chev}</a>` :
    `<a class="choice rig-cta" href="#/account"><div class="pipe-ico">${ICON_RIG}</div><div class="c-main"><div class="c-title">Save a class for every rig</div><div class="c-sub">Free crew account. Guests can still build and share a loadout.</div></div>${ICON.chev}</a>`}
  ${lastHtml ? `<div class="section-head"><h2>Continue</h2></div>${lastHtml}` : ''}
  ${saved.length ? `<div class="section-head"><h2>Saved loadouts</h2><a class="linkbtn" href="#/saved">See all</a></div>
    <div class="lo-grid">${saved.map((s) => savedRow(s)).join('')}</div>` : ''}
  <div class="section-head"><h2>How a class is built</h2></div>
  <div class="howto"><ol style="display:contents">
    <li><span class="num">1</span><div><h3>Choose the drill</h3><p>Current ${brandText('Ditch Witch', 'Ditch Witch®')} and ${brandText('Vermeer', 'Vermeer®')} models. This is the machine the loadout is for.</p></div></li>
    <li><span class="num">2</span><div><h3>Lock the pipe</h3><p>Only pipe that fits that drill can be equipped.</p></div></li>
    <li><span class="num">3</span><div><h3>Equip the slots</h3><p>Fill the string from housing to bit. Threads and adapters match as you go.</p></div></li>
    <li><span class="num">4</span><div><h3>Confirm and send</h3><p>Text, email, copy, or print the loadout.</p></div></li>
  </ol></div>`;
}
function savedRow(s, { del = false } = {}) {
  const c = b64e(s.cfg), m = machine(s.cfg?.m);
  return `<article class="lo-card"${brandAttr(m?.brand)}>
    <div class="lo-top"><div style="min-width:0">
      <div class="lo-name">${esc(s.name)}</div>
      <div class="small muted">${m ? `${brandText(m.brand)} · ` : ''}${esc(s.title)} · ${new Date(s.ts).toLocaleDateString()}</div>
    </div>
    ${del
      ? `<button class="iconbtn" data-del="${esc(s.id)}" aria-label="Delete ${esc(s.name)}">${ICON.trash}</button>`
      : `<a class="iconbtn" href="#/build?c=${c}" aria-label="Edit ${esc(s.name)}">${ICON.chev}</a>`}
    </div>
    <div class="lo-actions">
      <a class="btn btn-outline" href="#/build?c=${c}">Edit</a>
      <a class="btn btn-primary" href="#/summary?c=${c}">Open brief</a>
    </div>
  </article>`;
}
/* Step 1 – drill */
let drillFilter = { brand: 'all', size: 'all', q: '' };
async function viewDrill(isCurrent = () => true) {
  await loadCatalog();
  if (!isCurrent()) return;
  setStepper(1, null); setActionbar('');
  const machines = CATALOG.machines || [];
  const counts = {
    all: machines.length,
    'Ditch Witch': machines.filter((m) => m.brand === 'Ditch Witch').length,
    Vermeer: machines.filter((m) => m.brand === 'Vermeer').length,
  };
  app.innerHTML = `
    <div class="view-head">
      <div>
        <div class="view-kicker">Step 01 · Rig matrix</div>
        <h1>Select drill rig</h1>
        <p class="view-sub">Pick the ${brandText('Ditch Witch', 'Ditch Witch®')} or ${brandText('Vermeer', 'Vermeer®')} rig you are rigging up. Only pipe and tooling compatible with that drill are unlocked downstream.</p>
      </div>
    </div>
    <div class="drill-controls">
      <div class="searchbox">${ICON.search}<input id="q" type="search" inputmode="search" autocomplete="off" placeholder="Search rig model (e.g. D24, JT25, AT120)" value="${esc(drillFilter.q)}" aria-label="Search drill model"><button class="clear" id="clear" aria-label="Clear" ${drillFilter.q ? '' : 'hidden'}>×</button></div>
      <div class="drill-filter-group" role="group" aria-label="Brand">
        <span class="drill-filter-label">Make</span>
        ${[['all', 'All', counts.all], ['Ditch Witch', 'Ditch Witch®', counts['Ditch Witch']], ['Vermeer', 'Vermeer®', counts.Vermeer]].map(([v, l, cnt]) => `<button type="button" class="filter-chip" data-brand="${v}"${v === 'all' ? '' : brandAttr(v)} aria-pressed="${drillFilter.brand === v}">${l} <span class="cnt">(${cnt})</span></button>`).join('')}
      </div>
      <div class="drill-filter-group" role="group" aria-label="Size class">
        <span class="drill-filter-label">Class</span>
        ${['all', 'Compact', 'Mid-size', 'Large'].map((sz) => `<button type="button" class="filter-chip" data-size="${sz}" aria-pressed="${drillFilter.size === sz}">${sz === 'all' ? 'All sizes' : sz}</button>`).join('')}
      </div>
    </div>
    <div id="drills"></div>`;
  const draw = () => {
    const q = drillFilter.q.trim().toLowerCase().replace(/\s+/g, '');
    const list = machines.filter((m) => (drillFilter.brand === 'all' || m.brand === drillFilter.brand)
      && (drillFilter.size === 'all' || m.size === drillFilter.size)
      && (!q || `${m.brand}${m.model}${m.size}`.toLowerCase().replace(/\s+/g, '').includes(q)));
    const groups = ['Compact', 'Mid-size', 'Large'].map((g) => [g, list.filter((m) => m.size === g)]).filter(([, l]) => l.length);
    const sub = { Compact: 'up to ~10k lb class', 'Mid-size': '~12k–40k lb class', Large: '60k lb class & maxi rigs' };
    $('#drills').innerHTML = !list.length
      ? `<div class="empty-box"><p>No drill matches “${esc(drillFilter.q)}”.</p><button type="button" class="btn btn-outline btn-sm" id="drill-reset">Reset filters</button></div>`
      : groups.map(([g, l]) => `<div class="drill-group-head"><h2>${g}</h2><span>${sub[g]} · ${l.length} rig${l.length === 1 ? '' : 's'}</span></div>
          <div class="drill-matrix">${l.map((m) => {
            const n = m.pipes.length;
            return `<a class="drill-card"${brandAttr(m.brand)} href="#/pipe/${m.id}">
              <div class="drill-card-top">${brandChip(m.brand)}<span class="drill-size">${esc(m.size)}</span></div>
              <div class="drill-model">${esc(m.model)}</div>
              <div class="drill-card-foot"><span class="drill-pipes">${n ? `${n} pipe${n === 1 ? '' : 's'}` : 'No pipe listed'}</span><span class="drill-go">Select →</span></div></a>`;
          }).join('')}</div>`).join('') +
        (drillFilter.brand !== 'Ditch Witch' ? `<div class="note" style="margin-top:14px">${ICON.info}<span>Running a ${brandText('Vermeer', 'Vermeer®')}? ${brandText('Ditch Witch')} drill pipe HIWS1® and HXT® is compatible with all ${brandText('Vermeer', 'Vermeer®')} Firestick® threads.</span></div>` : '');
    $('#drill-reset')?.addEventListener('click', () => {
      drillFilter = { brand: 'all', size: 'all', q: '' };
      $('#q').value = ''; $('#clear').hidden = true;
      $$('[data-brand]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.brand === 'all'));
      $$('[data-size]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.size === 'all'));
      draw();
    });
  };
  draw();
  const q = $('#q');
  q.addEventListener('input', () => { drillFilter.q = q.value; $('#clear').hidden = !q.value; draw(); });
  $('#clear').addEventListener('click', () => { q.value = ''; drillFilter.q = ''; $('#clear').hidden = true; draw(); q.focus(); });
  $$('[data-brand]').forEach((b) => b.addEventListener('click', () => {
    drillFilter.brand = b.dataset.brand;
    $$('[data-brand]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw();
  }));
  $$('[data-size]').forEach((b) => b.addEventListener('click', () => {
    drillFilter.size = b.dataset.size;
    $$('[data-size]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw();
  }));
}

/* Step 2 – pipe */
async function viewPipe(mid, isCurrent = () => true) {
  await loadCatalog();
  if (!isCurrent()) return;
  const m = machine(mid);
  if (!m) return viewNotFound();
  setStepper(2, { m: m.id }); setActionbar('');
  const ctx = loCtx.for({ m: m.id });
  const pipes = m.pipes || [];
  app.innerHTML = `
    ${ctx ? loBanner(ctx, 'NEW LOADOUT · LOCK PIPE') : ''}
    ${ctx ? `<a class="link-back" href="#/rig/${esc(ctx.machine.id)}">‹ Back to ${esc(rigName(ctx.machine))}</a>` : '<a class="link-back" href="#/drill">‹ Back to drill matrix</a>'}
    <section class="rig-header-bar"${brandAttr(m.brand)}>
      <div>
        <div class="view-kicker">Step 02 · Lock drill pipe</div>
        <h1>${esc(m.brand)} ${esc(m.model)}</h1>
      </div>
      <div class="rig-header-meta">
        ${brandChip(m.brand)}
        <span class="status-pill">${esc(m.size)} Class</span>
        <span class="status-pill">${pipes.length} Pipe Option${pipes.length === 1 ? '' : 's'}</span>
      </div>
    </section>
    <div class="pipe-table">${pipes.map((p) => p.roadmap ? `
      <a class="pipe-row"${brandAttr(partTheme(p))} href="#/build?c=${b64e(newCfg(m.id, p.id, p.roadmap))}">
        ${catalogPhoto(p.img, p.name)}
        <div class="pipe-info"><div>${partChip(p)}</div><div class="pipe-name">${esc(p.name)}</div>
          <div class="pipe-meta"><span>${p.pn ? `#${esc(p.pn)}` : 'PN unlisted'}</span><span class="muted">Roadmap #${esc(p.roadmap)}</span></div></div>
        <div class="pipe-action"><span class="btn btn-primary btn-sm">Lock Pipe →</span></div></a>` : `
      <div class="pipe-row"${brandAttr(partTheme(p))} aria-disabled="true">
        ${catalogPhoto(p.img, p.name)}
        <div class="pipe-info"><div>${partChip(p)}</div><div class="pipe-name">${esc(p.name)}</div>
          <div class="pipe-meta"><span>${p.pn ? `#${esc(p.pn)}` : 'PN unlisted'}</span><span class="muted">Tooling data not loaded yet</span></div></div>
        <div class="pipe-action"><button type="button" class="btn btn-ghost btn-sm" disabled>Unavailable</button></div></div>`).join('') ||
      `<div class="empty-box">No pipe is listed for this drill.</div>`}
    </div>
    ${m.brand === 'Vermeer' ? `<div class="note" style="margin-top:14px">${ICON.info}<span>${brandText('Ditch Witch')} drill pipe HIWS1® and HXT® is compatible with all ${brandText('Vermeer', 'Vermeer®')} Firestick® threads.</span></div>` : ''}`;
  mountLoBanner();
}

/* Step 3 – build (Rig Dashboard 3-Column Workbench) */
let buildCfg = null;
let activeSlotId = null;
let activeSlotRmKey = '';
const slotFilters = new Map();

async function viewBuild(q, isCurrent = () => true) {
  await loadCatalog();
  const cfg = cfgFromQuery(q);
  if (!isCurrent()) return;
  if (!cfg || pipeOf(machine(cfg.m), cfg.p)?.roadmap !== cfg.r) return viewNotFound();
  let rm;
  app.innerHTML = '<div class="stack"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
  const radiusP = loadRadius();
  try { rm = await loadRoadmap(cfg.r); await radiusP; } catch (e) { if (isCurrent()) app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  if (!isCurrent()) return;
  buildCfg = cfg;
  renderBuild(rm);
}
function titleOf(cfg) {
  const m = machine(cfg.m), p = pipeOf(m, cfg.p);
  return `${m ? m.model : 'Drill'} · ${p ? p.name : 'pipe'} · ${cfg.mode === 'Bit' ? 'Bit' : 'Backreamer'} config`;
}
function persistBuild(replace = true) {
  const url = `#/build?c=${b64e(buildCfg)}`;
  if (replace) { history.replaceState(null, '', url); currentHash = location.hash; }
  store.set(LAST_KEY, { cfg: buildCfg, title: titleOf(buildCfg) });
  rememberBuilder();
}
function getSlotFilter(secId) {
  if (!slotFilters.has(secId)) slotFilters.set(secId, { q: '', brand: 'all', soil: '' });
  return slotFilters.get(secId);
}
function orderedBomItems(rm, cfg, rows) {
  const items = lineItems(rm, cfg, rows);
  const alts = altLineItems(RADIUS, cfg, rows);
  const bySec = new Map();
  for (const r of rows) bySec.set(String(r.sec.id), []);
  for (const l of items) {
    const sid = l.key.split('.')[0];
    if (!bySec.has(sid)) bySec.set(sid, []);
    bySec.get(sid).push(l);
  }
  for (const l of alts) {
    const sid = l.key.split('.')[0];
    if (!bySec.has(sid)) bySec.set(sid, []);
    bySec.get(sid).push(l);
  }
  const out = [];
  for (const list of bySec.values()) out.push(...list);
  return out;
}
function upstreamThreadForSlot(rows, idx, P) {
  for (let i = idx - 1; i >= 0; i--) {
    const prev = rows[i];
    if (!prev.sel.length) continue;
    const parts = prev.sel.map((id) => {
      const acc = prev.acc[id];
      return acc ? P[acc.id] : P[id];
    }).filter(Boolean);
    if (parts.length && parts.every((p) => p.type === 'Collar')) continue;
    const threads = [...new Set(parts.flatMap((p) => [p.cr, p.cr2].filter(Boolean)))];
    if (threads.length) return threads.join(' / ');
  }
  return '';
}
function slotStatusMeta(row) {
  switch (row.status) {
    case 'auto': return { cls: 'is-auto', text: 'AUTO' };
    case 'done': return { cls: 'is-equipped', text: row.sel.length > 1 ? `EQUIPPED ×${row.sel.length}` : 'EQUIPPED' };
    case 'pending': return { cls: 'is-open', text: 'OPEN' };
    case 'blocked': return { cls: 'is-blocked', text: 'BLOCKED' };
    case 'skip': return { cls: '', text: 'SKIP' };
    default: return { cls: '', text: 'LOCKED' };
  }
}
function partRow(p, { selected, multi, sel = true, compact, isPipe = false } = {}) {
  const extUrl = p.supplier ? safeHttpUrl(p.url) : null;
  const conn = connStr(p);
  const isDisc = /\bdiscontinued\b/i.test(p.name);
  return `<div class="part part-row ${selected ? 'sel is-equipped' : ''} ${multi ? 'multi' : ''}"${brandAttr(partTheme(p))}>
    <div class="thumb part-thumb">${imgTag(p.img, 240, 120, p.name, '', dwFallback(p))}</div>
    <div class="p-main part-main">
      <div class="part-title-line p-name">${partChip(p)} <span class="part-name">${esc(p.name)}</span>${isDisc ? ' <span class="status-pill is-draft">Discontinued</span>' : ''}</div>
      <div class="part-specs-line">
        <span class="p-pn part-pn">${p.pn ? `#${esc(p.pn)}` : '<span class="muted">Part # not listed</span>'}</span>
        ${conn ? `<span class="p-conn part-conn">${esc(conn)}</span>` : ''}
        ${p.soil ? `<span class="part-soil">${esc(p.soil)}</span>` : ''}
      </div>
      ${!compact && p.short ? `<div class="p-short part-short">${esc(p.short)}</div>` : ''}
    </div>
    <div class="p-act part-actions">
      ${extUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(extUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(p.name)} on the ${esc(p.brand)} site">Site ↗</a>` : ''}
      <button type="button" class="btn btn-ghost btn-sm" data-info="${p.id}" aria-label="Details for ${esc(p.name)}">Details</button>
      ${isPipe
        ? '<span class="status-pill is-equipped">Locked</span>'
        : sel
          ? `<button type="button" class="btn btn-sm ${selected ? 'btn-primary' : 'btn-outline'}" data-pick="${p.id}" aria-pressed="${!!selected}">${selected ? 'Equipped ✓' : 'Equip'}</button>`
          : '<span class="status-pill is-equipped">Equipped</span>'}
    </div></div>`;
}
/* Radius alternates (view + optional list line). Third-party strings always go through esc(). */
const radiusThumb = (p) => (p.imgUrl
  ? `<img src="${esc(p.imgUrl)}" alt="${esc(p.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
  : '<img src="img/placeholder.svg" alt="">');
const radiusConn = (p) => [p?.conn?.l, p?.conn?.r].filter(Boolean).join(' → ');
function altRow(a, sid, cfg) {
  const p = a.part, added = (cfg.alt?.[sid] || []).includes(p.pn);
  const extUrl = safeHttpUrl(p.url);
  const conn = radiusConn(p);
  return `<div class="alt-part"${brandAttr(RADIUS_BRAND)}>
    <div class="thumb">${radiusThumb(p)}</div>
    <div class="p-main part-main">
      <div class="alt-meta">${brandChip(RADIUS_BRAND)}${a.match ? `<span class="alt-match">${esc(MATCH_LABEL[a.match] || '')}</span>` : ''}</div>
      <div class="p-name part-name">${esc(p.name)}</div>
      <div class="part-specs-line"><span class="p-pn part-pn">#${esc(p.pn)}</span>${conn ? `<span class="part-conn">${esc(conn)}</span>` : ''}</div>
      ${a.note ? `<div class="p-short part-short">${esc(a.note)}</div>` : ''}
    </div>
    <div class="p-act part-actions">
      ${extUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(extUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(p.name)} on the Radius site">Site ↗</a>` : ''}
      <button type="button" class="chip alt-add" data-altadd="${esc(sid)}" data-altpn="${esc(p.pn)}" aria-pressed="${added}">${added ? 'On list' : 'Add to list'}</button>
    </div></div>`;
}
function altsFor(p, sid, cfg) {
  if (!showOther() || !p?.pn) return '';
  const list = alternatesFor(RADIUS, p.pn);
  return list.length ? `<div class="alts"${brandAttr(RADIUS_BRAND)} role="group" aria-label="Radius equivalents for ${esc(p.name)}">${list.map((a) => altRow(a, sid, cfg)).join('')}</div>` : '';
}
function othersGroup(rm, row, cfg, shownPns) {
  if (!showOther()) return '';
  const P = rm.parts, m = machine(cfg.m);
  const slotParts = row.cands.map((o) => P[o.id]);
  const list = slotOthers(RADIUS, { slotParts, pipe: P[cfg.p], machine: m ? `${m.brand} ${m.model}` : '', dwPns: shownPns });
  return list.length ? `<details class="others"${brandAttr(RADIUS_BRAND)}><summary><span>Other brands <span class="muted">· ${list.length} ${brandText(RADIUS_BRAND)} part${list.length > 1 ? 's' : ''}</span></span>${brandChip(RADIUS_BRAND)}</summary>
    <div class="radius-others-list">${list.map((part) => altRow({ part }, row.sec.id, cfg)).join('')}
    <p class="small muted">Radius parts are shopping-list alternates. Confirm fit with Radius before ordering.</p></div></details>` : '';
}
function renderBomItemHtml(l) {
  const isAlt = Boolean(l.alt), isAcc = Boolean(l.acc);
  const tag = isAlt ? 'RADIUS ALT' : isAcc ? 'ADD-ON' : l.auto ? 'AUTO' : 'EQUIPPED';
  const slotId = l.key.split('.')[0];
  return `<li class="bom-item ${isAlt ? 'is-alt' : ''}"${brandAttr(partTheme(l.part))}>
    <div class="bom-item-top">
      <button type="button" class="bom-slot-link" data-jump-slot="${esc(slotId)}">${esc(l.sec)} · ${tag}</button>
      <span class="bom-pn">#${esc(pnTxt(l.part))}</span>
    </div>
    <div class="bom-item-name">${partChip(l.part)} ${esc(l.part.name)}</div>
    <div class="bom-item-foot">
      <div>${isAlt
        ? `<button type="button" class="btn btn-ghost btn-sm" style="min-height:26px;padding:0 6px;font-size:10px" data-altrm="${esc(slotId)}" data-altpn="${esc(l.part.pn)}" aria-label="Remove alternate ${esc(l.part.name)}">Remove</button>`
        : l.part.id
          ? `<button type="button" class="btn btn-ghost btn-sm" style="min-height:26px;padding:0 6px;font-size:10px" data-info="${l.part.id}" aria-label="Details for ${esc(l.part.name)}">Info</button>`
          : ''}</div>
      <span class="qty-step" role="group" aria-label="Quantity for ${esc(l.part.name)}">
        <button type="button" data-dq="${esc(l.key)}" data-d="-1" aria-label="Decrease quantity"${l.qty <= 0 ? ' disabled' : ''}>−</button>
        <span>${esc(l.qty)}</span>
        <button type="button" data-dq="${esc(l.key)}" data-d="1" aria-label="Increase quantity">+</button>
      </span>
    </div></li>`;
}
function renderRailSlot(r, i, P, cfg, activeId, rows) {
  const st = slotStatusMeta(r);
  const isAct = r.sec.id === activeId;
  const firstPart = r.sel.length ? P[r.sel[0]] : null;
  const bAttr = firstPart ? brandAttr(partTheme(firstPart)) : '';
  const stateCls = r.sel.length ? 'slot-filled' : (r.status === 'pending' || r.status === 'blocked') ? 'slot-open' : r.status === 'skip' ? 'slot-skip' : 'slot-locked';
  const altCount = (cfg.alt?.[r.sec.id] || []).length;
  const handoff = i > 0 ? upstreamThreadForSlot(rows, i, P) : '';
  const handoffLine = i > 0 ? `<div class="rail-handoff"><span>↓ ${esc(handoff || (r.status === 'locked' ? 'Awaiting upstream' : 'Direct fit'))}</span></div>` : '';
  const eqHtml = r.sel.length
    ? `<div class="rail-equipped-list">${r.sel.map((id) => {
        const ep = P[id], acc = r.acc[id]?.id ? P[r.acc[id].id] : null;
        return `<div class="rail-eq-item"${brandAttr(partTheme(ep))}><span class="rail-eq-name">${esc(ep.name)}</span><span class="rail-eq-pn">#${esc(pnTxt(ep))}</span></div>`
          + (acc ? `<div class="rail-eq-item"${brandAttr(partTheme(acc))}><span class="rail-eq-name">+ ${esc(acc.name)}</span><span class="rail-eq-pn">#${esc(pnTxt(acc))}</span></div>` : '');
      }).join('')}</div>`
    : `<div class="rail-empty-msg">${r.status === 'pending' ? `${r.cands.length} candidate${r.cands.length === 1 ? '' : 's'} ready` : r.status === 'skip' ? 'Optional slot skipped' : r.status === 'blocked' ? 'No compatible tool' : 'Locked until upstream picked'}</div>`;
  return `${handoffLine}<button type="button" class="rail-node slot ${r.status === 'pending' ? 'is-open' : ''} is-${esc(r.status)} ${isAct ? 'is-active' : ''} ${stateCls}"${bAttr} data-slot="${r.sec.id}" aria-current="${isAct ? 'true' : 'false'}">
    <div class="rail-node-top"><span class="rail-slot-idx">SLOT ${String(i + 1).padStart(2, '0')}</span><span class="status-pill ${st.cls}">${st.text}</span></div>
    <div class="rail-slot-name">${esc(r.sec.name)}</div>${eqHtml}
    ${altCount ? `<div class="rail-alt-note">+${altCount} Radius alternate${altCount > 1 ? 's' : ''}</div>` : ''}</button>`;
}
function renderActiveSlotCandidates(rm, rows, activeRow, P, cfg) {
  const s = activeRow.sec;
  const filter = getSlotFilter(s.id);
  const qLower = filter.q.trim().toLowerCase();
  const isPipe = s.name === 'Drill Pipe';
  const filtered = activeRow.cands.filter((o) => {
    const p = P[o.id];
    if (!p) return false;
    if (filter.brand !== 'all' && partBrand(p) !== filter.brand) return false;
    if (filter.soil && !(p.soil || '').includes(filter.soil)) return false;
    if (qLower) {
      const hay = `${p.name} ${p.pn || ''} ${p.short || ''} ${connStr(p)} ${partBrand(p)}`.toLowerCase();
      if (!hay.includes(qLower)) return false;
    }
    return true;
  });
  const partsHtml = filtered.length
    ? filtered.map((opt) => {
        const p = P[opt.id], isEq = activeRow.sel.includes(p.id), accIds = opt.acc || [], activeAcc = activeRow.acc[p.id];
        const accHtml = isEq && accIds.length
          ? `<div class="acc"><div class="acc-title"><span>Add-on / adapter</span>${activeAcc?.auto ? '<span class="status-pill is-auto">Auto-added to fit</span>' : ''}</div>
              <div class="chip-row"><button type="button" class="chip" data-acc="${s.id}.${p.id}" data-accid="0" aria-pressed="${!activeAcc}">None</button>
              ${accIds.map((aid) => {
                const ap = P[aid];
                return ap ? `<button type="button" class="chip"${brandAttr(partTheme(ap))} data-acc="${s.id}.${p.id}" data-accid="${aid}" aria-pressed="${activeAcc?.id === aid}">${esc(ap.name)}${ap.pn ? `<small>#${esc(ap.pn)}</small>` : ''}</button>` : '';
              }).join('')}</div></div>`
          : '';
        return `<div class="part-block">${partRow(p, { selected: isEq, multi: s.multi, sel: !isPipe, isPipe })}${accHtml}${altsFor(p, s.id, cfg)}</div>`;
      }).join('')
    : `<div class="empty-box"><p>No parts match the current search or filters in ${esc(s.name)}.</p><button type="button" class="btn btn-outline btn-sm" id="slot-filter-reset">Clear slot filters</button></div>`;
  const hasOtherSels = Object.entries(cfg.sel || {}).some(([k, v]) => +k !== s.id && Array.isArray(v) && v.length > 0);
  const allPipeRow = hasOtherSels ? compute(rm, { ...cfg, sel: {} }).find((r) => r.sec.id === s.id) : null;
  const candIds = new Set(activeRow.cands.map((o) => o.id));
  const altPathOpts = allPipeRow ? allPipeRow.cands.filter((o) => !candIds.has(o.id)) : [];
  const altPathHtml = altPathOpts.length
    ? `<details class="alt-paths others" style="margin-top:8px"><summary><span>Other parts for this pipe <span class="muted">· ${altPathOpts.length} option${altPathOpts.length > 1 ? 's' : ''} (resets conflicting slots)</span></span></summary>
        <div class="radius-others-list">${altPathOpts.map((opt) => {
          const op = P[opt.id];
          if (!op) return '';
          const conn = connStr(op);
          return `<div class="part part-row"${brandAttr(partTheme(op))}>
            <div class="thumb part-thumb">${imgTag(op.img, 240, 120, op.name, '', dwFallback(op))}</div>
            <div class="p-main part-main">
              <div class="part-title-line p-name">${partChip(op)} <span class="part-name">${esc(op.name)}</span></div>
              <div class="part-specs-line"><span class="p-pn part-pn">${op.pn ? `#${esc(op.pn)}` : '<span class="muted">Part # not listed</span>'}</span>${conn ? `<span class="p-conn part-conn">${esc(conn)}</span>` : ''}</div>
            </div>
            <div class="p-act part-actions">
              <button type="button" class="btn btn-ghost btn-sm" data-info="${op.id}" aria-label="Details for ${esc(op.name)}">Details</button>
              <button type="button" class="btn btn-outline btn-sm" data-pick-override="${op.id}">Switch &amp; equip</button>
            </div></div>`;
        }).join('')}</div></details>`
    : '';
  const othersHtml = othersGroup(rm, activeRow, cfg, filtered.map((o) => P[o.id]?.pn).filter(Boolean));
  const pendingRadiusNote = activeRow.status === 'pending' && cfg.alt?.[s.id]?.length
    ? '<div class="rd-note" role="status"><span>Radius alternate added to the parts list. Equip a Ditch Witch part in this slot to unlock the next one.</span></div>'
    : '';
  return `${partsHtml}${altPathHtml}${othersHtml}${pendingRadiusNote}`;
}
function nextOpenSlotAfterPick(rows, fromIdx) {
  const prevOpen = [...rows.slice(0, fromIdx)].reverse().find((r) => r.status === 'pending' || r.status === 'blocked');
  const nextOpen = rows.slice(fromIdx + 1).find((r) => r.status === 'pending' || r.status === 'blocked');
  return prevOpen || nextOpen || rows.find((r) => r.status === 'pending' || r.status === 'blocked') || null;
}
function renderBuild(rm, focusNext) {
  const cfg = buildCfg, P = rm.parts, m = machine(cfg.m), p = pipeOf(m, cfg.p);
  const rows = compute(rm, cfg);
  const items = lineItems(rm, cfg, rows);
  const allItems = orderedBomItems(rm, cfg, rows);
  const pending = rows.find((r) => r.status === 'pending');
  const blocked = rows.find((r) => r.status === 'blocked');
  const ready = isLoadoutReady(rows);
  persistBuild();
  setStepper(3, cfg, ready);

  const rmKey = `${rm.id}:${cfg.mode}`;
  if (activeSlotRmKey !== rmKey || !rows.some((r) => r.sec.id === activeSlotId)) {
    activeSlotRmKey = rmKey;
    const firstOpen = rows.find((r) => r.status === 'pending' || r.status === 'blocked');
    activeSlotId = firstOpen ? firstOpen.sec.id : rows[rows.length - 1]?.sec.id;
  }
  const activeIdx = Math.max(0, rows.findIndex((r) => r.sec.id === activeSlotId));
  const activeRow = rows[activeIdx];
  const settledCount = rows.filter((r) => ['done', 'auto', 'skip'].includes(r.status)).length;
  const openCount = rows.filter((r) => ['pending', 'locked', 'blocked'].includes(r.status)).length;
  const totalPieces = allItems.reduce((sum, l) => sum + l.qty, 0);
  const ctx = loCtx.for(cfg);
  const confirmHref = `#/summary?c=${b64e(cfg)}`;

  const readinessPill = ready
    ? `<span class="status-pill is-ready">READY · ${settledCount}/${rows.length}</span>`
    : blocked
      ? `<span class="status-pill is-blocked">BLOCKED · ${esc(blocked.sec.name)}</span>`
      : `<span class="status-pill is-open">DRAFT · ${openCount} OPEN</span>`;

  const telemetryHtml = `
    <section class="telemetry-bar"${brandAttr(m?.brand)}>
      <div class="telemetry-specs">
        <div class="tele-cell">
          <div class="tele-label">Rig <a class="tele-swap" href="#/drill">Change</a></div>
          <div class="tele-val">${m ? brandChip(m.brand) : ''} <span>${esc(m?.model || 'Drill')}</span></div>
        </div>
        <div class="tele-cell">
          <div class="tele-label">Locked pipe <a class="tele-swap" href="#/pipe/${cfg.m}">Swap</a></div>
          <div class="tele-val">${p ? partChip(p) : ''} <span>${esc(p?.name || 'Pipe')}</span>${p?.pn ? ` <span class="mono small muted">#${esc(p.pn)}</span>` : ''}</div>
        </div>
      </div>
      <div class="tele-controls">
        <div class="mode-switch" role="group" aria-label="Configuration type">
          <button type="button" data-mode="Bit" aria-pressed="${cfg.mode === 'Bit'}">Pilot (Bit)</button>
          <button type="button" data-mode="Backreamer" aria-pressed="${cfg.mode === 'Backreamer'}">Pullback (Reamer)</button>
        </div>
        ${RADIUS ? `<label class="brand-toggle radius-switch ${showOther() ? 'is-on' : ''}"${brandAttr(RADIUS_BRAND)}><input type="checkbox" id="other-brands" ${showOther() ? 'checked' : ''}><span>${brandText(RADIUS_BRAND)} alternates</span></label>` : ''}
        ${readinessPill}
      </div>
    </section>`;

  const mobileStripHtml = `
    <section class="mobile-slot-strip" aria-label="String slots">
      <div class="mobile-slot-head"><span>Active Slot Selector</span><span>${settledCount}/${rows.length} Settled</span></div>
      <div class="slot-strip-scroll">${rows.map((r, i) => {
        const st = slotStatusMeta(r), firstPart = r.sel.length ? P[r.sel[0]] : null, isAct = r.sec.id === activeRow?.sec.id;
        return `<button type="button" class="slot-pill-btn ${r.status === 'pending' ? 'is-open' : ''} ${isAct ? 'is-active' : ''}"${firstPart ? brandAttr(partTheme(firstPart)) : ''} data-slot="${r.sec.id}" aria-pressed="${isAct}">
          <span class="slot-pill-top"><span>${String(i + 1).padStart(2, '0')}</span><span class="status-pill ${st.cls}" style="padding:1px 5px;font-size:9px">${st.text}</span></span>
          <span class="slot-pill-name">${esc(r.sec.name)}</span></button>`;
      }).join('')}</div>
    </section>`;

  const railHtml = `
    <aside class="panel-card rail-panel" aria-label="Vertical string rail">
      <div class="panel-head"><h2>String Rail</h2><span class="panel-head-meta">${settledCount}/${rows.length} · RIG → ${cfg.mode === 'Bit' ? 'BIT' : 'REAMER'}</span></div>
      <div class="rail-list">${rows.map((r, i) => renderRailSlot(r, i, P, cfg, activeRow?.sec.id, rows)).join('')}</div>
    </aside>`;

  let centerBodyHtml = '';
  if (activeRow) {
    const s = activeRow.sec, st = slotStatusMeta(activeRow);
    const upThread = upstreamThreadForSlot(rows, activeIdx, P);
    const acceptThreads = [...new Set(activeRow.cands.map((o) => P[o.id]?.cl).filter(Boolean))];
    const filter = getSlotFilter(s.id);
    const headHtml = `
      <div class="slot-bench-head">
        <div style="min-width:0">
          <div class="slot-bench-kicker">SLOT ${String(activeIdx + 1).padStart(2, '0')} · ${s.multi ? 'MULTI-EQUIP SLOT' : 'SINGLE-EQUIP SLOT'}</div>
          <h2>${esc(s.name)}</h2>
          <div class="slot-thread-info">
            ${s.name === 'Drill Pipe' ? '<span>Locked from Step 02</span>' : upThread ? `<span>Upstream: <b>${esc(upThread)}</b></span>` : ''}
            ${acceptThreads.length ? `<span>Accepts: <b>${esc(acceptThreads.slice(0, 4).join(' | '))}${acceptThreads.length > 4 ? '…' : ''}</b></span>` : ''}
            <span>${activeRow.cands.length} compatible option${activeRow.cands.length === 1 ? '' : 's'}${activeRow.hidden ? ` (${activeRow.hidden} downstream-filtered)` : ''}</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex:none">
          ${s.name === 'Drill Pipe' ? `<a class="btn btn-ghost btn-sm" href="#/pipe/${cfg.m}">Swap Pipe</a>` : ''}
          <span class="status-pill ${st.cls}">${st.text}</span>
        </div>
      </div>`;

    if (activeRow.status === 'locked') {
      const firstOpen = rows.find((r) => r.status === 'pending' || r.status === 'blocked');
      centerBodyHtml = `${headHtml}<div class="parts-body"><div class="rd-note is-warn"><div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start">
        <span><b>Slot locked:</b> Equip ${esc(firstOpen?.sec.name || 'the open slot')} first to unlock compatible parts here.</span>
        ${firstOpen ? `<button type="button" class="btn btn-primary btn-sm" data-slot="${firstOpen.sec.id}">Jump to ${esc(firstOpen.sec.name)} →</button>` : ''}</div></div></div>`;
    } else if (activeRow.status === 'skip') {
      centerBodyHtml = `${headHtml}<div class="parts-body"><div class="rd-note"><span><b>Optional slot skipped:</b> Nothing fits or is required before this slot.</span></div></div>`;
    } else if (activeRow.status === 'blocked') {
      centerBodyHtml = `${headHtml}<div class="parts-body"><div class="rd-note is-warn" style="border-left-color:var(--danger)"><div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start">
        <span><b>Needs changes:</b> ${s.name === 'Drill Pipe' ? 'The pipe selected in Step 02 cannot connect to the current rig-side parts.' : 'No compatible end tool is listed for this configuration.'}</span>
        <a class="btn btn-outline btn-sm" href="#/pipe/${cfg.m}">Change Pipe →</a></div></div></div>`;
    } else {
      const candParts = activeRow.cands.map((o) => P[o.id]).filter(Boolean);
      const brandCounts = new Map();
      for (const part of candParts) { const b = partBrand(part); brandCounts.set(b, (brandCounts.get(b) || 0) + 1); }
      const presentBrands = [...brandCounts.keys()].sort((a, b) => (a === 'Ditch Witch' ? -1 : b === 'Ditch Witch' ? 1 : a.localeCompare(b)));
      if (filter.brand !== 'all' && !brandCounts.has(filter.brand)) filter.brand = 'all';
      const soils = [...new Set(candParts.flatMap((part) => (part.soil || '').split(',').map((x) => x.trim()).filter(Boolean)))];
      if (filter.soil && !soils.includes(filter.soil)) filter.soil = '';
      const showToolbar = activeRow.cands.length > 1 || soils.length > 0;
      const toolbarHtml = showToolbar
        ? `<div class="filter-toolbar">
            <div class="rd-search">${ICON.search}<input id="slot-search" type="search" inputmode="search" autocomplete="off" placeholder="Filter ${esc(s.name)} by name, part #, or thread…" value="${esc(filter.q)}" aria-label="Search parts in ${esc(s.name)}"><button type="button" class="rd-search-clear" id="slot-search-clear" aria-label="Clear filter"${filter.q ? '' : ' hidden'}>×</button></div>
            ${presentBrands.length > 1 ? `<div class="filter-row" role="group" aria-label="Filter by brand"><span class="filter-label">Brand</span>
              <button type="button" class="filter-chip" data-filter-brand="all" aria-pressed="${filter.brand === 'all'}">All <span class="cnt">(${candParts.length})</span></button>
              ${presentBrands.map((b) => `<button type="button" class="filter-chip" data-filter-brand="${esc(b)}"${brandAttr(b)} aria-pressed="${filter.brand === b}">${esc(b)} <span class="cnt">(${brandCounts.get(b)})</span></button>`).join('')}
            </div>` : ''}
            ${soils.length ? `<div class="filter-row" role="group" aria-label="Filter by ground"><span class="filter-label">Ground</span>
              <button type="button" class="filter-chip" data-filter-soil="" aria-pressed="${filter.soil === ''}">All ground</button>
              ${soils.map((soil) => `<button type="button" class="filter-chip" data-filter-soil="${esc(soil)}" aria-pressed="${filter.soil === soil}">${esc(soil)}</button>`).join('')}</div>` : ''}
          </div>`
        : '';
      centerBodyHtml = `${headHtml}${toolbarHtml}<div class="parts-body" id="slot-candidates-wrap">${renderActiveSlotCandidates(rm, rows, activeRow, P, cfg)}</div>`;
    }
  }

  const centerHtml = `<section class="panel-card parts-panel" aria-label="Available parts for active slot">${centerBodyHtml}</section>`;
  const bomHtml = `
    <aside class="panel-card bom-panel" aria-label="Equipped list">
      <div class="panel-head"><h2>Equipped</h2><span class="panel-head-meta">${allItems.length} lines · ${totalPieces} pcs</span></div>
      <div class="bom-readiness ${ready ? 'is-ready' : 'is-draft'}">
        <b>${ready ? 'READY FOR DISPATCH' : 'INCOMPLETE DRAFT'}</b>
        <span>${ready ? `All ${rows.length} slots verified and thread-matched.` : `${openCount} slot${openCount === 1 ? '' : 's'} still open in string.`}</span>
      </div>
      <ul class="mini-list bom-items" id="desktop-bom-list">${allItems.map((l) => renderBomItemHtml(l)).join('') || '<li class="muted" style="padding:14px">No slots filled yet</li>'}</ul>
      <div class="bom-foot">
        <a class="btn ${ready ? 'btn-primary' : 'btn-outline'} btn-block" href="${confirmHref}">${ready ? 'Confirm class' : 'Review draft'}</a>
        <div class="bom-foot-row">
          <button type="button" class="btn btn-ghost btn-sm" data-save>${ICON.save} Save loadout</button>
          <button type="button" class="btn btn-ghost btn-sm" id="bom-copy">Copy BOM</button>
        </div>
      </div>
    </aside>`;

  app.innerHTML = `
    ${ctx ? loBanner(ctx, ctx.loadout ? 'EDITING LOADOUT' : 'NEW LOADOUT · EQUIP SLOTS') : ''}
    ${telemetryHtml}
    ${mobileStripHtml}
    <div class="workbench-grid">${railHtml}${centerHtml}${bomHtml}</div>`;

  setActionbar(`<div class="ab-info"><strong>${allItems.length} equipped · ${ready ? 'READY' : `DRAFT · ${openCount} OPEN`}</strong>
      <span class="ab-line">${pending ? `Open · ${esc(pending.sec.name)}` : ready ? `Class ready · ${settledCount}/${rows.length}` : `Needs changes${blocked ? ` · ${esc(blocked.sec.name)}` : ''}`}</span></div>
    <div class="dock-actions">
      <button type="button" class="btn btn-outline btn-sm" data-open-equipped>Equipped list (${allItems.length}) ▲</button>
      ${ctx && ready ? `<button type="button" class="btn btn-primary btn-sm" data-save>${ICON.save} Save</button>` : ''}
      <a class="btn ${ready ? 'btn-primary' : 'btn-ghost'} btn-sm" href="${confirmHref}">${ready ? 'Confirm' : 'Brief →'}</a>
    </div>`);
  mountLoBanner();

  const pick = (sid, id) => {
    const s = rm.sections.find((x) => x.id === sid);
    const cur = compute(rm, cfg).find((r) => r.sec.id === sid);
    if (s.multi) {
      const set = new Set(cur.sel); set.has(id) ? set.delete(id) : set.add(id);
      cfg.sel[sid] = [...set];
    } else if (cur.status === 'done' && cur.sel.includes(id)) {
      delete cfg.sel[sid];
      return { s, unequipped: true };
    } else cfg.sel[sid] = [id];
    return { s, unequipped: false };
  };
  const bindCandidates = (root) => {
    if (!root) return;
    $$('[data-pick]', root).forEach((el) => el.addEventListener('click', (e) => {
      e.stopPropagation();
      const { s, unequipped } = pick(activeRow.sec.id, +el.dataset.pick);
      if (!s.multi && !unequipped) {
        const nxt = nextOpenSlotAfterPick(compute(rm, cfg), activeIdx);
        if (nxt) activeSlotId = nxt.sec.id;
      }
      renderBuild(rm, !s.multi && !unequipped ? activeRow.sec.id : null);
    }));
    $$('[data-pick-override]', root).forEach((el) => el.addEventListener('click', (e) => {
      e.stopPropagation();
      cfg.sel = { [activeRow.sec.id]: [+el.dataset.pickOverride] };
      const nxt = nextOpenSlotAfterPick(compute(rm, cfg), activeIdx);
      if (nxt) activeSlotId = nxt.sec.id;
      renderBuild(rm, activeRow.sec.id);
    }));
    $$('[data-info]', root).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); showPart(rm, +b.dataset.info); }));
    $$('[data-acc]', root).forEach((b) => b.addEventListener('click', () => { cfg.acc[b.dataset.acc] = +b.dataset.accid; renderBuild(rm); }));
    $$('[data-altadd]', root).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); toggleAlt(cfg, b.dataset.altadd, b.dataset.altpn); renderBuild(rm); }));
    $('#slot-filter-reset', root)?.addEventListener('click', () => {
      const f = getSlotFilter(activeRow.sec.id);
      f.q = ''; f.brand = 'all'; f.soil = '';
      renderBuild(rm);
    });
  };
  const candWrap = $('#slot-candidates-wrap');
  bindCandidates(candWrap && candWrap.addEventListener ? candWrap : app);

  const redrawCandidates = () => {
    const wrap = $('#slot-candidates-wrap');
    if (!wrap) return;
    wrap.innerHTML = renderActiveSlotCandidates(rm, rows, activeRow, P, cfg);
    bindCandidates(wrap);
  };
  const slotSearch = $('#slot-search'), slotSearchClear = $('#slot-search-clear');
  slotSearch?.addEventListener('input', () => {
    getSlotFilter(activeRow.sec.id).q = slotSearch.value;
    if (slotSearchClear) slotSearchClear.hidden = !slotSearch.value;
    redrawCandidates();
  });
  slotSearchClear?.addEventListener('click', () => {
    slotSearch.value = '';
    getSlotFilter(activeRow.sec.id).q = '';
    slotSearchClear.hidden = true;
    redrawCandidates();
    slotSearch.focus?.();
  });
  $$('[data-filter-brand]').forEach((b) => b.addEventListener('click', () => {
    getSlotFilter(activeRow.sec.id).brand = b.dataset.filterBrand;
    $$('[data-filter-brand]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    redrawCandidates();
  }));
  $$('[data-filter-soil]').forEach((b) => b.addEventListener('click', () => {
    getSlotFilter(activeRow.sec.id).soil = b.dataset.filterSoil;
    $$('[data-filter-soil]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    redrawCandidates();
  }));

  $$('[data-mode]').forEach((b) => b.addEventListener('click', () => { cfg.mode = b.dataset.mode; activeSlotId = null; renderBuild(rm); window.scrollTo({ top: 0 }); }));
  $('#other-brands')?.addEventListener('change', (e) => { store.set(OTHER_BRANDS_KEY, !!e.target.checked); renderBuild(rm); });
  $$('[data-slot]').forEach((b) => b.addEventListener('click', () => { activeSlotId = +b.dataset.slot; renderBuild(rm); }));
  $$('[data-jump-slot]').forEach((b) => b.addEventListener('click', () => { activeSlotId = +b.dataset.jumpSlot; renderBuild(rm); }));
  $$('[data-dq]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.dq; cfg.q[k] = quantity(quantity(cfg.q?.[k]) + +b.dataset.d); renderBuild(rm); }));
  $$('[data-altrm]').forEach((b) => b.addEventListener('click', () => { toggleAlt(cfg, b.dataset.altrm, b.dataset.altpn); delete cfg.q[altKey(b.dataset.altrm, b.dataset.altpn)]; renderBuild(rm); }));
  $$('.bom-panel [data-info]').forEach((b) => b.addEventListener('click', () => showPart(rm, +b.dataset.info)));
  $$('[data-save]').forEach((b) => b.addEventListener('click', () => saveSheet(cfg)));
  $('#bom-copy')?.addEventListener('click', async () => { await copyText(listText(cfg, allItems)); toast(ready ? 'Ready BOM copied' : 'Draft BOM copied'); });
  $('[data-open-equipped]')?.addEventListener('click', () => openEquippedSheet(rm));
  if (focusNext && isLoadoutReady(compute(rm, cfg))) toast('Loadout complete');
}
function openEquippedSheet(rm) {
  const cfg = buildCfg;
  if (!cfg || !rm) return;
  const drawBody = (sh) => {
    const rows = compute(rm, cfg);
    const allItems = orderedBomItems(rm, cfg, rows);
    const ready = isLoadoutReady(rows);
    const openCount = rows.filter((r) => ['pending', 'locked', 'blocked'].includes(r.status)).length;
    const totalPieces = allItems.reduce((sum, l) => sum + l.qty, 0);
    $('#eq-sheet-body', sh).innerHTML = `
      <div class="rd-note ${ready ? 'is-ready' : 'is-warn'}">
        <span><b>${ready ? 'READY FOR DISPATCH' : 'INCOMPLETE DRAFT'}</b> · ${ready ? `All ${rows.length} slots verified (${totalPieces} pcs).` : `${openCount} slot${openCount === 1 ? '' : 's'} open.`}</span>
      </div>
      <ul class="mini-list bom-items" style="padding:0;overflow:visible">${allItems.map((l) => renderBomItemHtml(l)).join('') || '<li class="muted">No parts equipped yet.</li>'}</ul>`;
    $$('[data-dq]', sh).forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.dq; cfg.q[k] = quantity(quantity(cfg.q?.[k]) + +b.dataset.d);
      renderBuild(rm); drawBody(sh);
    }));
    $$('[data-altrm]', sh).forEach((b) => b.addEventListener('click', () => {
      toggleAlt(cfg, b.dataset.altrm, b.dataset.altpn); delete cfg.q[altKey(b.dataset.altrm, b.dataset.altpn)];
      renderBuild(rm); drawBody(sh);
    }));
    $$('[data-jump-slot]', sh).forEach((b) => b.addEventListener('click', () => {
      activeSlotId = +b.dataset.jumpSlot; closeSheet(); renderBuild(rm);
    }));
    $$('[data-info]', sh).forEach((b) => b.addEventListener('click', () => showPart(rm, +b.dataset.info)));
  };
  const rows = compute(rm, cfg), ready = isLoadoutReady(rows), href = `#/summary?c=${b64e(cfg)}`;
  openSheet(`<div class="sheet-top"${brandAttr(machine(cfg.m)?.brand)}><div><div class="small muted mono">EQUIPPED STRING BOM</div><h2>${esc(titleOf(cfg))}</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body" id="eq-sheet-body"></div>
    <div class="sheet-foot"><button class="btn btn-ghost btn-sm" id="eq-copy">Copy BOM</button><button class="btn btn-ghost btn-sm" id="eq-save">${ICON.save} Save</button><a class="btn btn-primary" style="flex:1" href="${href}" data-close>${ready ? 'Confirm class' : 'Review draft'}</a></div>`, (sh) => {
    drawBody(sh);
    $('#eq-copy', sh)?.addEventListener('click', async () => {
      const items = orderedBomItems(rm, cfg, compute(rm, cfg));
      await copyText(listText(cfg, items)); toast('BOM copied');
    });
    $('#eq-save', sh)?.addEventListener('click', () => { closeSheet(); setTimeout(() => saveSheet(cfg), 230); });
  });
}
function browseSheet(rm, sid) {
  const cfg = buildCfg, P = rm.parts;
  const row = compute(rm, cfg).find((r) => r.sec.id === sid);
  const s = row.sec, multi = s.multi;
  const soils = [...new Set(row.cands.flatMap((o) => (P[o.id].soil || '').split(',').map((x) => x.trim()).filter(Boolean)))];
  let q = '', soil = '', chosen = new Set(row.sel);
  openSheet(`<div class="sheet-top"><div><h2>${esc(s.name)}</h2><div class="small muted">${row.cands.length} options fit this slot${multi ? ' · equip one or more' : ''}</div></div>
      <button class="iconbtn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body">
      ${row.cands.length > 6 ? `<div class="searchbox" style="margin-bottom:8px">${ICON.search}<input id="bq" type="search" placeholder="Search name, size or part #" aria-label="Search options"></div>` : ''}
      ${soils.length > 1 ? `<div class="filter-row">${soils.length > 1 ? `<button class="chip" data-soil="" aria-pressed="true">All ground</button>${soils.map((x) => `<button class="chip" data-soil="${esc(x)}" aria-pressed="false">${esc(x)}</button>`).join('')}` : ''}</div>` : ''}
      <div id="blist" class="parts-body" style="padding:0"></div></div>
    ${multi ? `<div class="sheet-foot"><button class="btn btn-primary btn-block" id="bdone">Done</button></div>` : ''}`, (sh) => {
    const draw = () => {
      const t = q.toLowerCase();
      const list = row.cands.filter((o) => { const pp = P[o.id]; return (!t || `${pp.name} ${pp.pn || ''} ${pp.short || ''}`.toLowerCase().includes(t)) && (!soil || (pp.soil || '').includes(soil)); });
      $('#blist', sh).innerHTML = (list.map((o) => partRow(P[o.id], { selected: chosen.has(o.id), multi }) + altsFor(P[o.id], sid, cfg)).join('') || '<div class="empty">No matches</div>')
        + othersGroup(rm, row, cfg, list.map((o) => P[o.id].pn))
        + (row.status === 'pending' && cfg.alt?.[sid]?.length ? '<p class="sec-note" role="status">Radius alternate added to the parts list. Equip a Ditch Witch part to advance.</p>' : '');
      $$('[data-altadd]', sh).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); toggleAlt(cfg, b.dataset.altadd, b.dataset.altpn); renderBuild(rm); draw(); }));
      $$('[data-pick]', sh).forEach((el) => el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = +el.dataset.pick;
        if (multi) { chosen.has(id) ? chosen.delete(id) : chosen.add(id); draw(); }
        else { cfg.sel[sid] = [id]; closeSheet(); renderBuild(rm, sid); }
      }));
      $$('[data-info]', sh).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); showPart(rm, +b.dataset.info, true); }));
    };
    draw();
    $('#bq', sh)?.addEventListener('input', (e) => { q = e.target.value; draw(); });
    $$('[data-soil]', sh).forEach((b) => b.addEventListener('click', () => { soil = b.dataset.soil; $$('[data-soil]', sh).forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(); }));
    $('#bdone', sh)?.addEventListener('click', () => { cfg.sel[sid] = [...chosen]; closeSheet(); renderBuild(rm, chosen.size ? sid : null); });
  });
}
function showPart(rm, id, stacked) {
  const p = rm.parts[id];
  const photos = [...new Set([...(p.imgs || []), p.img].filter(Boolean))];
  const specs = Object.entries({ 'Part #': p.pn || 'Not listed', Connection: connStr(p), 'Recommended ground': p.soil, ...(p.specs || {}) }).filter(([k, v]) => k !== 'Brand' && v);
  let equipRow = null;
  if (buildCfg?.r === rm.id) {
    equipRow = compute(rm, buildCfg).find((r) => r.cands.some((o) => o.id === id) && r.sec.name !== 'Drill Pipe') || null;
  }
  const isEq = equipRow ? equipRow.sel.includes(id) : false;
  const equipBtn = equipRow
    ? (isEq && equipRow.sec.multi
        ? `<button type="button" class="btn btn-outline" id="sh-equip">Remove from slot</button>`
        : isEq
          ? '<button type="button" class="btn btn-primary" disabled>Equipped ✓</button>'
          : `<button type="button" class="btn btn-primary" id="sh-equip">Equip in ${esc(equipRow.sec.name)}</button>`)
    : '';
  openSheet(`<div class="sheet-top"${brandAttr(partTheme(p))}><div><div class="small muted" style="font-weight:800;letter-spacing:.06em">${partChip(p)} ${esc((p.type || '').replace(/_/g, ' ').toUpperCase())}</div><h2>${esc(p.name)}</h2></div>
      <button class="iconbtn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body">
      <div class="gallery ${photos.length < 2 ? 'single' : ''}">${photos.map((i) => photoTag(i, p.name, dwFallback(p))).join('') || photoTag(0, p.name, dwFallback(p))}</div>
      ${p.short ? `<p style="font-weight:700;margin:6px 0 0">${esc(p.short)}</p>` : ''}
      <dl class="specs">${specs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      ${p.desc?.length ? `<ul class="bullets">${p.desc.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
      ${(p.docs || []).map((d) => ({ name: d.name, url: safeHttpUrl(d.url) })).filter((d) => d.url).map((d) => `<a class="btn btn-ghost btn-block" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${esc(d.name)}</a>`).join('')}
      <p class="small muted">Photos and specs from public manufacturer references.</p>
    </div>
    <div class="sheet-foot">${p.pn ? `<button class="btn btn-ghost" id="cpn">Copy part #</button>` : ''}${equipBtn}<button class="btn btn-primary" style="flex:1" ${stacked ? 'id="back"' : 'data-close'}>${stacked ? '‹ Back to list' : 'Close'}</button></div>`, (sh) => {
    $('#cpn', sh)?.addEventListener('click', async () => { await copyText(p.pn); toast(`Copied ${p.pn}`); });
    $('#sh-equip', sh)?.addEventListener('click', () => {
      if (!equipRow) return;
      const sid = equipRow.sec.id;
      if (equipRow.sec.multi) {
        const set = new Set(equipRow.sel); set.has(id) ? set.delete(id) : set.add(id);
        buildCfg.sel[sid] = [...set];
      } else {
        const rowsBefore = compute(rm, buildCfg);
        const idx = Math.max(0, rowsBefore.findIndex((r) => r.sec.id === sid));
        buildCfg.sel[sid] = [id];
        const nxt = nextOpenSlotAfterPick(compute(rm, buildCfg), idx);
        if (nxt) activeSlotId = nxt.sec.id;
      }
      closeSheet(); renderBuild(rm);
      toast(isEq ? `Removed ${p.name}` : `Equipped ${p.name}`);
    });
    if (stacked) $('#back', sh).addEventListener('click', () => { const sid = compute(rm, buildCfg).find((r) => r.cands.some((o) => o.id === id))?.sec.id; closeSheet(); setTimeout(() => sid && browseSheet(rm, sid), 230); });
  });
}
function saveSheet(cfg) {
  const ctx = loCtx.for(cfg);
  if (ctx && ME.member) return loSaveSheet(cfg, ctx);
  const def = titleOf(cfg).replace(' config', '');
  openSheet(`<div class="sheet-top"><h2>Save loadout</h2><button class="iconbtn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body stack"><label class="field"><span>Name this preset</span><input id="sname" value="${esc(def)}" maxlength="80"></label>
    <p class="small muted">Saved on this phone only. To put it in My rigs, use Save loadout on the brief.</p>
    <div id="rigsave" class="rigsave"></div></div>
    <div class="sheet-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" style="flex:1" id="sgo">${ICON.save} Save</button></div>`, (sh) => {
    $('#sgo', sh).addEventListener('click', () => {
      keepPhoneDraft(cfg, $('#sname', sh).value.trim() || def);
      closeSheet(); toast('Saved on this phone');
    });
    saveToRigSection(cfg, sh);
  });
}

/* Unsaved loadout: never leave the builder for My rigs without a choice. */
const PENDING_SAVE_KEY = 'bdht.pendingLoadout';
const GARAGE_FP_KEY = 'bdht.garageFp';
let skipLeaveGuard = false;
let builderHref = '';
function cfgFp(cfg) {
  if (!cfg?.r) return '';
  return b64e({ m: cfg.m, p: cfg.p, r: cfg.r, mode: cfg.mode, sel: cfg.sel || {}, acc: cfg.acc || {}, q: cfg.q || {}, ...(cfg.alt && Object.keys(cfg.alt).length ? { alt: cfg.alt } : {}) });
}
function onBuilder(hash = location.hash) {
  return /^#\/(build|summary)(\?|$)/.test(hash);
}
function hasAnySelection(cfg) {
  return !!(cfg && (Object.values(cfg.sel || {}).some((a) => Array.isArray(a) && a.length > 0)
    || Object.values(cfg.alt || {}).some((a) => Array.isArray(a) && a.length > 0)));
}
function needsGarageSave(cfg = buildCfg) {
  return !!(cfg?.r && hasAnySelection(cfg) && sessionStorage.getItem(GARAGE_FP_KEY) !== cfgFp(cfg));
}
function markGarageSaved(cfg) {
  if (cfg?.r) sessionStorage.setItem(GARAGE_FP_KEY, cfgFp(cfg));
}
function rememberBuilder() {
  if (onBuilder()) builderHref = location.hash;
}
function keepPhoneDraft(cfg, name) {
  if (!cfg?.r) return;
  const fp = cfgFp(cfg);
  const list = getSaved();
  if (list.some((s) => cfgFp(s.cfg) === fp)) return;
  const title = titleOf(cfg);
  list.unshift({ id: Date.now().toString(36), name: (name || title).replace(' config', '').slice(0, 80), title, ts: Date.now(), cfg: JSON.parse(JSON.stringify(cfg)) });
  store.set(SAVED_KEY, list.slice(0, 50));
  updateSavedBadge();
}
function stashPendingSave(cfg, name) {
  store.set(PENDING_SAVE_KEY, { cfg: JSON.parse(JSON.stringify(cfg)), name: (name || titleOf(cfg)).replace(' config', '').slice(0, 60), ts: Date.now(), explicit: true });
}
function goHash(href) {
  skipLeaveGuard = true;
  location.hash = href;
}
function confirmLeave(href) {
  const cfg = buildCfg;
  if (!cfg?.r) { goHash(href); return; }
  openSheet(`<div class="sheet-top"><div><h2>Save this loadout?</h2><p class="small muted">My rigs does not have it yet.</p></div><button class="iconbtn" data-close aria-label="Keep editing">✕</button></div>
    <div class="sheet-body"><p>Save it onto the drill, keep a draft on this phone, or leave without saving.</p></div>
    <div class="sheet-foot sheet-actions">
      <button class="btn btn-primary btn-block" id="save-go">Save loadout</button>
      <button class="btn btn-ghost btn-block" id="discard-go">Keep a draft on this phone</button>
      <button class="btn btn-outline danger btn-block" id="leave-no">No, don’t save</button>
      <button class="btn btn-ghost btn-block" data-close>Keep editing</button>
    </div>`, (sh) => {
    $('#save-go', sh).addEventListener('click', () => { closeSheet(); setTimeout(() => openDoneSheet(cfg), 240); });
    $('#discard-go', sh).addEventListener('click', () => {
      keepPhoneDraft(cfg);
      closeSheet();
      toast('Draft kept on this phone. My rigs does not have it yet.');
      goHash(href);
    });
    $('#leave-no', sh).addEventListener('click', () => {
      buildCfg = null;
      loCtx.set(null);
      store.set(LAST_KEY, null);
      closeSheet();
      goHash(href);
    });
  });
}
async function openDoneSheet(cfg) {
  await meReady();
  await loadCatalog();
  const ctx = loCtx.for(cfg);
  const def = ctx?.loadout?.name || titleOf(cfg).replace(' config', '');
  if (!ME.member) {
    openSheet(`<div class="sheet-top"><div><h2>Save loadout</h2><p class="small muted">My rigs needs a crew account</p></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>
      <div class="sheet-body stack">
        <label class="field"><span>Loadout name</span><input id="lname" value="${esc(def)}" maxlength="60"></label>
        <p>Sign in and this loadout is saved on the drill. It stays here until the account is ready. Nothing is discarded.</p>
        <button class="btn btn-primary btn-block" id="gosignup">Create account and save</button>
        <button class="btn btn-ghost btn-block" id="gosign">Sign in and save</button>
        <button class="btn btn-ghost btn-block" id="gophone">Save on this phone only</button>
      </div>`, (sh) => {
      const nameOf = () => $('#lname', sh).value.trim() || def;
      $('#gophone', sh).addEventListener('click', () => { keepPhoneDraft(cfg, nameOf()); closeSheet(); toast('Saved on this phone. Sign in when you want it in My rigs.'); });
      const stash = (hash) => { stashPendingSave(cfg, nameOf()); closeSheet(); goHash(hash); };
      $('#gosign', sh).addEventListener('click', () => stash('#/account?m=signin&save=1'));
      $('#gosignup', sh).addEventListener('click', () => stash('#/account?save=1'));
    });
    return;
  }
  const c = await sb();
  const { data: machines, error } = await c.from('bdht_machines').select('*').eq('machine_type_id', cfg.m).order('created_at');
  if (error) return toast(error.message);
  const list = machines || [];
  const pre = (ctx && list.some((mc) => mc.id === ctx.machine.id) && ctx.machine.id) || list[0]?.id || '';
  openSheet(`<div class="sheet-top"><div><h2>Save loadout</h2><p class="small muted">${esc(machine(cfg.m)?.model || 'Drill')}</p></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body stack">
      <label class="field"><span>Loadout name</span><input id="lname" value="${esc(def)}" maxlength="60"></label>
      <div class="chips">${['Rock setup', 'Sand pilot', 'Clay pilot', 'Backream 12in'].map((s) => `<button type="button" class="chip" data-sug="${s}">${s}</button>`).join('')}</div>
      ${list.length ? `<div class="form-sub"><b>Machine</b><span class="small muted">Where it shows in My rigs</span></div>
        <div class="stack">${list.map((mc) => `<button type="button" class="choice"${brandAttr(rigBrand(mc))} data-mc="${esc(mc.id)}" aria-pressed="${mc.id === pre}"><div class="c-main"><div class="c-title">${esc(rigName(mc))}</div><div class="c-sub">${esc(rigSub(mc))}</div></div></button>`).join('')}</div>`
        : `<p>This drill is not in My rigs yet. Saving adds it as a machine.</p>
           <label class="field"><span>Unit name (optional)</span><input id="an" maxlength="60" placeholder="Unit 12"></label>`}
      <p class="small muted">Everyone at ${esc(ME.company.name)} will see it.</p>
      <div class="form-err" id="lerr" hidden></div>
    </div>
    <div class="sheet-foot"><button class="btn btn-primary btn-block" id="lgo">${ICON.save} Save and open My rigs</button></div>`, (sh) => {
    $$('[data-sug]', sh).forEach((b) => b.addEventListener('click', () => { $('#lname', sh).value = b.dataset.sug; }));
    $$('[data-mc]', sh).forEach((b) => b.addEventListener('click', () => { $$('[data-mc]', sh).forEach((x) => x.setAttribute('aria-pressed', x === b)); }));
    $('#lgo', sh).addEventListener('click', async () => {
      const name = $('#lname', sh).value.trim() || def;
      const picked = sh.querySelector('[data-mc][aria-pressed="true"]')?.dataset.mc || pre;
      busy($('#lgo', sh), true, 'Saving…');
      try {
        let mc = list.find((m) => m.id === picked);
        if (!mc) {
          const mm = machine(cfg.m);
          const ins = await c.from('bdht_machines').insert({ company_id: ME.company.id, machine_type_id: +cfg.m, brand: mm?.brand, model: mm?.model || String(cfg.m), nickname: $('#an', sh)?.value.trim() || null }).select().single();
          if (ins.error) throw ins.error;
          mc = ins.data;
        }
        const existing = ctx && ctx.machine.id === mc.id ? ctx.loadout?.id : null;
        const saved = await saveLoadout(cfg, mc.id, existing, name);
        markGarageSaved(cfg);
        loCtx.set(null);
        closeSheet();
        toast(`Saved “${saved.name}”`);
        goHash('#/garage');
      } catch (e) { busy($('#lgo', sh), false); const err = $('#lerr', sh); err.textContent = errMsg(e); err.hidden = false; }
    });
  });
}
async function consumePendingSave() {
  const p = store.get(PENDING_SAVE_KEY, null);
  if (!p?.userId || p.userId !== ME.user?.id || !p.cfg || !ME.member) return null;
  if (p.ts && Date.now() - Number(p.ts) > 24 * 60 * 60 * 1000) {
    store.set(PENDING_SAVE_KEY, null);
    return null;
  }
  const cfg = normalizeConfig(p.cfg);
  if (!cfg || pipeOf(machine(cfg.m), cfg.p)?.roadmap !== cfg.r) {
    store.set(PENDING_SAVE_KEY, null);
    return null;
  }
  p.cfg = cfg;
  const c = await sb();
  const { data, error } = await c.from('bdht_machines').select('*').eq('machine_type_id', cfg.m).order('created_at');
  if (error) throw error;
  const list = data || [];
  if (list.length > 1) return { pending: p, machines: list };
  let mc = list[0];
  if (!mc) {
    const mm = machine(cfg.m);
    const ins = await c.from('bdht_machines').insert({ company_id: ME.company.id, machine_type_id: +cfg.m, brand: mm?.brand, model: mm?.model || String(cfg.m), nickname: null }).select().single();
    if (ins.error) throw ins.error;
    mc = ins.data;
  }
  const saved = await saveLoadout(cfg, mc.id, null, p.name || titleOf(cfg));
  store.set(PENDING_SAVE_KEY, null);
  markGarageSaved(cfg);
  toast(`Saved “${saved.name}” to My rigs`);
  return { saved };
}

/* Step 4 – summary (Rig Dashboard BOM & Dispatch Brief) */
function listText(cfg, items, withLink = true) {
  const lines = [`HDD loadout: ${titleOf(cfg)}`, 'Built with The Better Down Hole Tool', ''];
  items.forEach((l, i) => lines.push(`${i + 1}. ${l.brand ? `${l.brand} ` : ''}${l.part.name}: PN ${pnTxt(l.part)}, qty ${l.qty}${l.acc ? ' (add-on)' : ''}${l.alt ? ' (alternate)' : ''}`));
  if (withLink) lines.push('', `Open it: ${shareUrl(cfg)}`);
  return lines.join('\n');
}
async function viewSummary(q, isCurrent = () => true) {
  await loadCatalog();
  const cfg = cfgFromQuery(q);
  if (!isCurrent()) return;
  if (!cfg || pipeOf(machine(cfg.m), cfg.p)?.roadmap !== cfg.r) return viewNotFound();
  let rm;
  const radiusP = loadRadius();
  try { rm = await loadRoadmap(cfg.r); await radiusP; } catch (e) { if (isCurrent()) app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  if (!isCurrent()) return;
  buildCfg = cfg;
  const draw = () => {
    const rows = compute(rm, cfg), items = lineItems(rm, cfg, rows);
    const allItems = orderedBomItems(rm, cfg, rows);
    const pending = rows.filter((r) => ['pending', 'locked', 'blocked'].includes(r.status));
    const blocked = rows.find((r) => r.status === 'blocked');
    const ready = isLoadoutReady(rows);
    const saveLabel = ready ? 'Save loadout' : 'Save draft';
    const totalPieces = allItems.reduce((sum, l) => sum + l.qty, 0);
    history.replaceState(null, '', `#/summary?c=${b64e(cfg)}`);
    currentHash = location.hash;
    rememberBuilder();
    setStepper(4, cfg, ready);
    const m = machine(cfg.m), p = pipeOf(m, cfg.p);
    const buildHref = `#/build?c=${b64e(cfg)}`;
    app.innerHTML = `
    <div class="sum-grid summary-shell"><div style="display:flex;flex-direction:column;gap:12px;min-width:0">
      <div class="sum-head summary-hero"${brandAttr(m?.brand)}>
        <div style="min-width:0">
          <div class="view-kicker" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
            <span>${ready ? 'LOADOUT BRIEF' : 'INCOMPLETE DRAFT'} · ${cfg.mode === 'Bit' ? 'PILOT' : 'PULLBACK'}</span>
            <span class="status-pill ${ready ? 'is-ready' : 'is-draft'}">${ready ? 'READY' : 'DRAFT'}</span>
          </div>
          <h1>${esc(m?.brand || '')} ${esc(m?.model || '')}</h1>
          <p>${p ? brandText(partTheme(p), `${p.name}${p.pn ? ` · #${p.pn}` : ''}`) : ''} · ${cfg.mode === 'Bit' ? 'Bit' : 'Backreamer'} config · ${allItems.length} lines (${totalPieces} pcs)</p>
          <p class="small no-print" style="margin:6px 0 0;color:var(--ink-2)">${needsGarageSave(cfg) ? 'Not in My rigs yet. Saving puts it on this drill.' : 'Saved to My rigs.'}</p>
        </div>
        <div class="summary-hero-actions no-print">
          <a class="btn btn-outline btn-sm" href="${buildHref}">← Edit in workspace</a>
          <button type="button" class="btn btn-ghost btn-sm" id="sh-mode">⇄ ${cfg.mode === 'Bit' ? 'Pullback' : 'Pilot'} brief</button>
          <button type="button" class="btn btn-primary btn-sm" data-done>${ICON.save} ${saveLabel}</button>
        </div>
      </div>
      ${!ready ? `<div class="note rd-note is-warn"><span>${blocked ? `<b>Needs changes in ${esc(blocked.sec.name)}.</b>` : pending.length ? `<b>${pending.length} slot${pending.length > 1 ? 's' : ''} still open.</b>` : '<b>Compatible tooling is unavailable.</b>'} <a class="no-print" href="${buildHref}">Edit loadout</a></span></div>` : ''}
      <ul class="lines bom-table">
        <li class="bom-table-head"><span>Preview</span><span>String Slot</span><span>Brand &amp; Part Description</span><span>Part #</span><span style="text-align:right">Quantity</span></li>
        ${allItems.map((l) => {
          const isAlt = Boolean(l.alt), isAcc = Boolean(l.acc), slotId = l.key.split('.')[0];
          const conn = isAlt ? radiusConn(l.part) : connStr(l.part);
          return `<li class="line ${isAcc ? 'acc-line' : ''} ${isAlt ? 'alt-line' : ''}"${brandAttr(partTheme(l.part))}>
            <div class="thumb bom-col-thumb">${isAlt ? radiusThumb(l.part) : imgTag(l.part.img, 200, 100, l.part.name, '', dwFallback(l.part))}</div>
            <div class="bom-col-slot">
              <div class="mono" style="font-size:11px;font-weight:800;color:var(--ink-2)">${esc(l.sec)}</div>
              <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:3px">
                ${isAlt ? '<span class="status-pill" style="border-color:#244769;color:#9fd0ff">ALT</span>' : ''}
                ${isAcc ? '<span class="status-pill">ADD-ON</span>' : ''}
                ${l.auto ? '<span class="status-pill is-auto">AUTO</span>' : ''}
              </div>
            </div>
            <div class="bom-col-part">
              <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">${partChip(l.part)} <strong style="font-size:14px">${esc(l.part.name)}</strong></div>
              ${conn ? `<div class="mono muted" style="font-size:11px;margin-top:3px">${esc(conn)}</div>` : ''}
            </div>
            <div class="bom-col-pn">
              <span class="bom-pn" style="font-size:13px">${l.part.pn ? '#' + esc(l.part.pn) : '<span class="muted">Part # not listed</span>'}</span>
              ${isAlt ? `<div class="no-print" style="margin-top:4px"><button type="button" class="btn btn-ghost btn-sm" style="min-height:26px;padding:0 7px;font-size:10px" data-altrm="${esc(slotId)}" data-altpn="${esc(l.part.pn)}">Remove</button></div>`
                : l.part.id ? `<div class="no-print" style="margin-top:4px"><button type="button" class="btn btn-ghost btn-sm" style="min-height:26px;padding:0 7px;font-size:10px" data-info="${l.part.id}">Specs</button></div>` : ''}
            </div>
            <div class="bom-col-qty">
              <span class="print-qty">Qty: ${l.qty}</span>
              <span class="qty-step no-print"><button type="button" data-dq="${l.key}" data-d="-1" aria-label="Less">−</button><input class="qty-input" inputmode="numeric" data-qk="${l.key}" value="${esc(l.qty)}" aria-label="Quantity"><button type="button" data-dq="${l.key}" data-d="1" aria-label="More">+</button></span>
            </div></li>`;
        }).join('') || '<li class="empty">No parts selected yet.</li>'}
      </ul>
    </div>
    <aside class="sum-aside summary-aside no-print">
      <div class="cta dispatch-card"${brandAttr(m?.brand)}>
        <h2>${ready ? 'Dispatch &amp; export' : 'Keep this draft'}</h2>
        <p class="small muted">${ready ? 'Save the class to your drill in My rigs, or share the verified BOM.' : 'Finish equipping the loadout to unlock crew sharing.'}</p>
        ${!ready ? '<div class="dispatch-gate-note">Sharing (Copy, Link, SMS, Email) unlocks once all required string slots are filled.</div>' : ''}
        <div class="dispatch-grid">
          ${ready ? `<button type="button" class="btn btn-primary btn-sm" id="q-copy">${ICON.link}Copy list</button>
          <button type="button" class="btn btn-outline btn-sm" id="sh-copy">${ICON.link}Copy link</button>
          <a class="btn btn-ghost btn-sm" id="sh-sms" href="#">${ICON.sms}Text list</a>
          <a class="btn btn-ghost btn-sm" id="sh-mail" href="#">${ICON.mail}Email list</a>
          <button type="button" class="btn btn-dark btn-sm" id="sh-share">${ICON.share}Share</button>
          <button type="button" class="btn btn-ghost btn-sm" id="q-share">${ICON.share}Quick share</button>` : ''}
          <button type="button" class="btn btn-ghost btn-sm" id="sh-print">${ICON.print}Print / PDF</button>
          <a class="btn btn-ghost btn-sm" href="${buildHref}">Edit string</a>
        </div>
        <button type="button" class="btn btn-primary btn-block" data-done>${ICON.save} ${saveLabel}</button>
      </div>
    </aside></div>`;
    setActionbar(`<div class="ab-info"><strong>${needsGarageSave(cfg) ? 'Not saved' : 'Saved'}</strong><span class="ab-line">${items.length} equipped · ${ready ? 'class ready' : 'incomplete draft'}</span></div>
      <div class="dock-actions">${ready ? '<button type="button" class="btn btn-ghost btn-sm" id="ab-copy">Copy</button>' : ''}
      <button type="button" class="btn btn-primary btn-sm" data-done>${ICON.save} ${saveLabel}</button></div>`);
    if (ready) {
      const text = listText(cfg, allItems);
      const subj = `HDD loadout: ${titleOf(cfg)}`;
      const mailHref = `mailto:?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(text)}`;
      $('#sh-sms').href = `sms:?&body=${encodeURIComponent(text)}`;
      $('#sh-mail').href = mailHref;
      const share = async () => {
        if (navigator.share) { try { await navigator.share({ title: subj, text: listText(cfg, allItems, false), url: shareUrl(cfg) }); } catch {} }
        else { await copyText(text); toast('Parts list copied'); }
      };
      const copyList = async () => { await copyText(text); toast('Parts list copied'); };
      $('#sh-share').addEventListener('click', share);
      $('#q-share').addEventListener('click', share);
      $('#sh-copy').addEventListener('click', async () => { await copyText(shareUrl(cfg)); toast('Link copied'); });
      $('#q-copy').addEventListener('click', copyList);
      $('#ab-copy').addEventListener('click', copyList);
    }
    $('#sh-print').addEventListener('click', () => window.print());
    $('#sh-mode').addEventListener('click', () => { cfg.mode = cfg.mode === 'Bit' ? 'Backreamer' : 'Bit'; draw(); window.scrollTo({ top: 0 }); });
    $$('[data-done]').forEach((b) => b.addEventListener('click', () => openDoneSheet(cfg)));
    $$('[data-dq]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.dq; cfg.q[k] = quantity(quantity(cfg.q[k]) + +b.dataset.d); draw(); }));
    $$('[data-qk]').forEach((i) => i.addEventListener('change', () => { cfg.q[i.dataset.qk] = quantity(i.value); draw(); }));
    $$('[data-altrm]').forEach((b) => b.addEventListener('click', () => { toggleAlt(cfg, b.dataset.altrm, b.dataset.altpn); delete cfg.q[altKey(b.dataset.altrm, b.dataset.altpn)]; draw(); }));
    $$('[data-info]', app).forEach((b) => b.addEventListener('click', () => showPart(rm, +b.dataset.info)));
  };
  draw();
}

function viewSaved() {
  setStepper(0); setActionbar('');
  const list = getSaved();
  app.innerHTML = `${pageHead('On this phone', 'Saved loadouts', 'These presets stay on this device. Crew accounts keep loadouts on each machine.')}
    <div class="lo-grid">${list.map((s) => savedRow(s, { del: true })).join('') ||
      `<div class="card empty"><h2>No loadouts on this phone</h2><p>Build one, then save it.</p><a class="btn btn-primary" href="#/drill">Start a loadout</a></div>`}</div>`;
  $$('[data-del]').forEach((b) => b.addEventListener('click', () => {
    if (!confirm('Delete this saved loadout?')) return;
    store.set(SAVED_KEY, getSaved().filter((s) => s.id !== b.dataset.del)); updateSavedBadge(); viewSaved();
  }));
}
function viewNotFound() {
  setStepper(0); setActionbar('');
  app.innerHTML = `<div class="card empty"><h2>That page or link didn't work</h2><p>The link may be old or cut off.</p><a class="btn btn-primary" href="#/drill">Start a new loadout</a></div>`;
}

/* ---------- accounts, company rigs & "create-a-class" loadouts (Supabase) ---------- */
// Publishable (anon) key: safe to ship in the browser. Row-level security limits every user to their own company.
const SB_URL = 'https://rdyhhszmfpomixaoehgy.supabase.co';
const SB_KEY = 'sb_publishable_3XIxMYWm9FnbzybMqpWXfg_T-TsFqT7';
const PENDING_KEY = 'bdht.pendingSetup', LO_KEY = 'bdht.loCtx';
const RESET_ROUTE = '#/account?m=reset', RECOVERY_KEY = 'bdht.recoverySession';
let SB = null;
let recoveryReady = null;
const ME = { user: null, member: null, company: null, billing: null };
function readRecoveryCallback(href) {
  const url = new URL(href);
  const [routeHash, authHash] = url.hash.slice(1).split('#');
  const hashParams = new URLSearchParams(authHash ?? routeHash);
  const query = url.searchParams;
  const legacy = routeHash === '/account?m=signin' || routeHash === '/account?m=reset';
  const hasError = [query, hashParams].some((p) => p.has('error') || p.has('error_code'));
  if (query.get('auth') !== 'reset' && query.get('type') !== 'recovery' && hashParams.get('type') !== 'recovery'
    && !(legacy && (query.has('code') || hasError))) return null;
  if (hasError) return {};
  return {
    tokenHash: query.get('token_hash'), code: query.get('code'),
    accessToken: hashParams.get('access_token'), refreshToken: hashParams.get('refresh_token'),
  };
}
function recoverySessionId(session) {
  try {
    const payload = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).session_id || null;
  } catch { return null; }
}
async function verifyRecovery(callback) {
  try {
    if (!callback.tokenHash && !callback.code && !(callback.accessToken && callback.refreshToken)) return;
    const { auth } = await sb();
    const { tokenHash, code, accessToken, refreshToken } = callback;
    let result;
    if (tokenHash) result = await auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
    else if (code) result = await auth.exchangeCodeForSession(code);
    else result = await auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    const id = !result.error && recoverySessionId(result.data?.session);
    if (id) sessionStorage.setItem(RECOVERY_KEY, id);
  } catch { /* The reset view shows a fresh-link action. */ }
}
function startRecovery() {
  const callback = readRecoveryCallback(location.href);
  if (!callback) return;
  sessionStorage.removeItem(RECOVERY_KEY);
  history.replaceState(null, '', location.pathname + RESET_ROUTE);
  recoveryReady = verifyRecovery(callback).finally(() => { recoveryReady = null; });
}
async function currentRecoverySession() {
  const expected = sessionStorage.getItem(RECOVERY_KEY);
  if (!expected) return false;
  try {
    const c = await sb();
    const { data, error } = await c.auth.getSession();
    if (!error && recoverySessionId(data?.session) === expected) return true;
  } catch { /* A recovery session may have expired or been signed out. */ }
  sessionStorage.removeItem(RECOVERY_KEY);
  return false;
}
function sb() {
  return SB ||= import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm').then(({ createClient }) => {
    const client = createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bdht.auth', flowType: 'pkce', detectSessionInUrl: true } });
    client.auth.onAuthStateChange((ev) => {
      if (ev === 'SIGNED_OUT') {
        sessionStorage.removeItem(RECOVERY_KEY);
        ME.user = ME.member = ME.company = ME.billing = null;
        store.set(PENDING_KEY, null);
        store.set(PENDING_SAVE_KEY, null);
        loCtx.set(null);
        sessionStorage.removeItem(GARAGE_FP_KEY);
        updateAcctNav();
      }
    });
    return client;
  }).catch((error) => { SB = null; throw error; });
}
async function refreshMe() {
  try {
    await recoveryReady;
    const c = await sb();
    const { data: { session } } = await c.auth.getSession();
    ME.user = session?.user || null; ME.member = ME.company = ME.billing = null;
    if (ME.user) {
      const { data } = await c.from('bdht_members').select('*, company:bdht_companies(*)').eq('user_id', ME.user.id).maybeSingle();
      if (data) {
        ME.member = data;
        ME.company = data.company;
        const { data: billing, error: billingError } = await c.from('bdht_billing').select('*').eq('company_id', data.company_id).maybeSingle();
        ME.billing = billingError ? null : billing;
      }
    }
  } catch (e) { console.warn('account service unavailable', e); }
  updateAcctNav(); return ME;
}
let ME_READY = null;
const meReady = () => (ME_READY ||= refreshMe());
function updateAcctNav() {
  const l = $('#acct-label'); if (l) l.textContent = ME.user ? 'My rigs' : 'Sign in';
}
const loCtx = {
  get() { try { return JSON.parse(sessionStorage.getItem(LO_KEY)); } catch { return null; } },
  set(v) { v ? sessionStorage.setItem(LO_KEY, JSON.stringify(v)) : sessionStorage.removeItem(LO_KEY); },
  for(cfg) { const c = this.get(); return c && cfg && +c.machine.machine_type_id === +cfg.m ? c : null; },
};
const rigBrand = (mc) => mc.brand || machine(mc.machine_type_id)?.brand;
const rigSub = (mc) => `${rigBrand(mc) || ''} ${mc.model}`.trim();
const rigName = (mc) => mc.nickname || rigSub(mc);
const errMsg = (e) => (e?.message || String(e)).replace(/^.*?:\s*(?=Invite|You already|Sign in)/, '');
const ICON_RIG = '<svg viewBox="0 0 24 24"><path d="M12 3 2 8v13h4v-9h12v9h4V8zM8 14h8v2H8zm0 3h8v2H8z"/></svg>';
const ICON_MORE = '<svg viewBox="0 0 24 24"><path d="M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>';
const ICON_STAR = '<svg viewBox="0 0 24 24"><path d="M12 17.3 18.2 21l-1.6-7L22 9.2l-7.2-.6L12 2 9.2 8.6 2 9.2 7.4 14l-1.6 7z"/></svg>';
function drillOptions(sel) {
  const by = (b) => CATALOG.machines.filter((m) => m.brand === b && m.pipes.length);
  return `<option value="">Choose a drill…</option>` + ['Ditch Witch', 'Vermeer'].map((b) => `<optgroup label="${b}"${brandAttr(b)}>${by(b).map((m) => `<option value="${m.id}" ${+sel === m.id ? 'selected' : ''}>${esc(b)} ${esc(m.model)}</option>`).join('')}</optgroup>`).join('');
}
function busy(btn, on, label) { if (!btn) return; if (on) { btn.dataset.l = btn.innerHTML; btn.innerHTML = label || 'Working…'; btn.disabled = true; } else { btn.innerHTML = btn.dataset.l || btn.innerHTML; btn.disabled = false; } }

/* sign up / sign in / finish setup */
async function viewAccount(q, isCurrent = () => true) {
  setStepper(0); setActionbar('');
  if (q.get('m') === 'reset') {
    app.innerHTML = '<div class="auth-wrap"><p role="status">Checking your reset link…</p></div>';
    await recoveryReady;
    const valid = await currentRecoverySession();
    if (!isCurrent()) return;
    if (!valid) return viewResetError();
    app.innerHTML = `<div class="auth-wrap"><h1>Set a new password</h1>
      <form class="card pad stack" id="rst" novalidate style="margin-top:14px"><div id="ferr"></div>
      <label class="field"><span>New password (8+ characters)</span><input id="npw" type="password" autocomplete="new-password" minlength="8" required></label>
      <button class="btn btn-primary btn-block" id="rgo">Save password</button></form></div>`;
    $('#rst').addEventListener('submit', async (e) => {
      e.preventDefault(); const pw = $('#npw').value;
      const err = $('#ferr'), btn = $('#rgo');
      if (pw.length < 8) { err.innerHTML = '<div class="form-err">Use at least 8 characters.</div>'; return; }
      busy(btn, true, 'Saving…');
      if (!await currentRecoverySession()) { if (isCurrent()) viewResetError(); return; }
      try {
        const c = await sb();
        const { error } = await c.auth.updateUser({ password: pw });
        if (error) throw error;
        sessionStorage.removeItem(RECOVERY_KEY);
        toast('Password updated');
        location.replace('#/garage');
      } catch (error) {
        if (!await currentRecoverySession()) { if (isCurrent()) viewResetError(); return; }
        busy(btn, false);
        err.innerHTML = `<div class="form-err" role="alert">${esc(friendlyAuthError(error))}</div>`;
      }
    });
    return;
  }
  if (q.get('m') === 'forgot') return viewResetRequest();
  await loadCatalog(); await meReady();
  if (!isCurrent()) return;
  const saveOnSignIn = q.get('save') === '1';
  if (saveOnSignIn && ME.user) authorizePendingSave();
  if (ME.user && ME.member) { location.replace('#/garage'); return; }
  if (ME.user) return viewSetup(isCurrent);
  const mode = q.get('m') === 'signin' ? 'signin' : 'signup';
  app.innerHTML = `<div class="auth-wrap">
    ${pageHead(mode === 'signup' ? 'New crew' : 'Returning crew', mode === 'signup' ? 'Set up your crew' : 'Welcome back', mode === 'signup' ? 'Save a named loadout for every machine your crew runs, and share those classes with the company.' : 'Sign in to open your machines and loadouts.')}
    <div class="seg" role="tablist" style="margin-bottom:14px">
      <button aria-pressed="${mode === 'signup'}" data-go="#/account${saveOnSignIn ? '?save=1' : ''}">Sign up</button>
      <button aria-pressed="${mode === 'signin'}" data-go="#/account?m=signin${saveOnSignIn ? '&amp;save=1' : ''}">Sign in</button></div>
    ${mode === 'signup' ? onboardForm(true) : `<form class="card pad stack" id="fin" novalidate>
      <label class="field"><span>Email</span><input id="e" type="email" autocomplete="email" inputmode="email" required></label>
      <label class="field"><span>Password</span><input id="pw" type="password" autocomplete="current-password" required></label>
      <div class="form-err" id="err" hidden></div>
      <button class="btn btn-primary btn-block" id="go">Sign in</button>
      <button type="button" class="linkbtn" id="forgot" style="align-self:center">Forgot password?</button></form>`}
    <p class="small muted" style="margin-top:14px;text-align:center">No account needed to build and share a loadout. <a href="#/drill">Keep building as a guest</a></p></div>`;
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.go; }));
  if (mode === 'signup') return mountOnboard(true, saveOnSignIn);
  const err = (m) => { const e = $('#err'); e.textContent = m; e.hidden = !m; };
  $('#fin').addEventListener('submit', async (ev) => {
    ev.preventDefault(); err('');
    const email = $('#e').value.trim(), password = $('#pw').value;
    if (!email || !password) return err('Enter your email and password.');
    busy($('#go'), true, 'Signing in…');
    const c = await sb();
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) { busy($('#go'), false); return err(friendlyAuthError(error)); }
    await refreshMe();
    if (saveOnSignIn) authorizePendingSave();
    const pend = store.get(PENDING_KEY, null);
    if (!ME.member && pend && pend.email?.toLowerCase() === email.toLowerCase()) {
      try { await runSetup(pend); } catch (e) {
        if (/already belong/i.test(errMsg(e))) await refreshMe();
        else { busy($('#go'), false); return err(friendlyAuthError(e)); }
      }
    }
    location.hash = ME.member ? '#/garage' : '#/setup';
  });
  $('#forgot').addEventListener('click', async () => {
    const email = $('#e').value.trim();
    if (!email || !$('#e').validity.valid) return viewResetRequest(email);
    const btn = $('#forgot');
    busy(btn, true, 'Sending…');
    try { await requestPasswordReset(email); toast('Check your email for a reset link'); }
    catch (error) { if (isCurrent()) err(friendlyAuthError(error)); }
    finally { busy(btn, false); }
  });
}
function authorizePendingSave() {
  const pending = store.get(PENDING_SAVE_KEY, null);
  if (pending?.explicit && !pending.userId && ME.user) store.set(PENDING_SAVE_KEY, { ...pending, userId: ME.user.id });
}
async function requestPasswordReset(email) {
  const c = await sb();
  const redirectTo = location.origin + location.pathname + '?auth=reset';
  const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}
function viewResetError() {
  app.innerHTML = `<div class="auth-wrap"><h1>Reset your password</h1>
    <div class="card pad stack" style="margin-top:14px">
      <p class="form-err" role="alert">This password reset link is invalid, expired, or has already been used.</p>
      <a class="btn btn-primary btn-block" href="#/account?m=forgot">Request a new reset link</a>
    </div></div>`;
}
function viewResetRequest(email = '') {
  app.innerHTML = `<div class="auth-wrap"><h1>Request a password reset link</h1>
    <form class="card pad stack" id="freset" style="margin-top:14px">
      <label class="field"><span>Email</span><input id="reset-email" type="email" autocomplete="email" value="${esc(email)}" required></label>
      <p id="reset-msg" role="status" hidden></p>
      <button class="btn btn-primary btn-block" id="send-reset">Send reset link</button>
      <a class="linkbtn" href="#/account?m=signin">Back to sign in</a>
    </form></div>`;
  $('#freset').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#send-reset'), msg = $('#reset-msg');
    busy(btn, true, 'Sending…');
    try {
      await requestPasswordReset($('#reset-email').value.trim());
      msg.className = '';
      msg.textContent = 'Check your email for a reset link.';
    } catch (error) {
      msg.className = 'form-err';
      msg.textContent = friendlyAuthError(error);
    } finally { msg.hidden = false; busy(btn, false); }
  });
}
async function viewSetup(isCurrent = () => true) {
  await loadCatalog(); await meReady();
  if (!isCurrent()) return;
  setStepper(0); setActionbar('');
  if (!ME.user) { location.replace('#/account'); return; }
  if (ME.member) { location.replace('#/garage'); return; }
  app.innerHTML = `<div class="auth-wrap">${pageHead('Crew', 'Finish setting up', `Signed in as ${esc(ME.user.email)}. Add your company and the machines you run.`)}${onboardForm(false)}</div>`;
  mountOnboard(false);
}
function onboardForm(withAuth) {
  const p = store.get(PENDING_KEY, {}) || {};
  const copy = equipmentCopy('new');
  return `<form class="card pad stack" id="fon" novalidate>
    <div class="seg" id="cmode"><button type="button" data-cm="new" aria-pressed="true">New company</button><button type="button" data-cm="join" aria-pressed="false">Join my company</button></div>
    <label class="field" data-show="new"><span>Company name</span><input id="co" autocomplete="organization" maxlength="120" placeholder="e.g. Ozark Boring LLC" value="${esc(p.company || '')}"></label>
    <label class="field" data-show="join" hidden><span>Company invite code</span><input id="code" autocapitalize="characters" maxlength="12" placeholder="8-character code from your boss" style="text-transform:uppercase;font-family:ui-monospace,Menlo,monospace;letter-spacing:.12em"></label>
    <label class="field"><span>Your name</span><input id="emp" autocomplete="name" maxlength="120" placeholder="First and last name" value="${esc(p.employee || '')}"></label>
    ${withAuth ? `<label class="field"><span>Email</span><input id="e" type="email" autocomplete="email" inputmode="email"></label>
    <label class="field"><span>Password <em class="muted" style="font-style:normal;font-weight:500">(8+ characters)</em></span><input id="pw" type="password" autocomplete="new-password" minlength="8"></label>` : ''}
    <div><div class="form-sub"><b id="mtitle">${copy.title}</b><span class="small muted" id="msub">${copy.detail}</span><span class="small muted" id="mcount"></span></div>
      <div id="mlist" class="stack" style="margin-top:10px"></div>
      <button type="button" class="btn btn-ghost btn-block" id="madd" style="margin-top:10px">+ Add another machine</button></div>
    <div class="form-err" id="err" hidden></div>
    <button class="btn btn-primary btn-block" id="go">${withAuth ? 'Create account' : 'Save and continue'}</button>
  </form>`;
}
function mountOnboard(withAuth, saveOnSignIn = false) {
  let cm = 'new';
  const saved = store.get(PENDING_KEY, {}) || {};
  const rows = saved.machines?.length ? saved.machines.map((r) => ({ id: r.id || '', nick: r.nick || '' })) : [{ id: '', nick: '' }];
  const draw = () => {
    const copy = equipmentCopy(cm);
    $('#mtitle').textContent = copy.title;
    $('#msub').textContent = copy.detail;
    const cap = signupMachineCap(cm);
    $('#mcount').textContent = rows.length ? `${rows.length} of ${cap} machines` : 'No machines yet';
    $('#madd').textContent = rows.length ? '+ Add another machine' : '+ Add a machine';
    $('#mlist').innerHTML = rows.map((r, i) => `<div class="mrow">
      <div class="mrow-head"><b>Machine ${i + 1}</b>
        ${(rows.length > 1 || cm === 'join') ? `<button type="button" class="iconbtn" data-mrm="${i}" aria-label="Remove machine ${i + 1}">${ICON.trash}</button>` : ''}</div>
      <label class="field"><span>Drill</span><select data-mi="${i}" data-k="id">${drillOptions(r.id)}</select></label>
      <label class="field"><span>Unit name</span><input data-mi="${i}" data-k="nick" maxlength="60" placeholder="Unit 12, Big Red, #4471" value="${esc(r.nick)}" autocomplete="off"></label>
    </div>`).join('') || '<p class="small muted">No machines on this signup. Add one if this crew should start with equipment.</p>';
    $$('[data-mi]').forEach((el) => el.addEventListener('input', () => { rows[+el.dataset.mi][el.dataset.k] = el.value; }));
    $$('[data-mrm]').forEach((b) => b.addEventListener('click', () => { rows.splice(+b.dataset.mrm, 1); draw(); }));
  };
  draw();
  $('#madd').addEventListener('click', () => {
    if (!canAddSignupMachine(cm, rows.length)) { err(signupMachineLimitError(cm)); return; }
    rows.push({ id: '', nick: '' }); draw(); $$('#mlist select').at(-1)?.focus();
  });
  $$('[data-cm]').forEach((b) => b.addEventListener('click', () => {
    cm = b.dataset.cm; $$('[data-cm]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    $$('[data-show]').forEach((el) => { el.hidden = el.dataset.show !== cm; });
    if (cm === 'new' && !rows.length) rows.push({ id: '', nick: '' });
    err('');
    draw();
  }));
  const err = (m) => { const e = $('#err'); e.textContent = m; e.hidden = !m; if (m) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  $('#fon').addEventListener('submit', async (ev) => {
    ev.preventDefault(); err('');
    const packed = signupMachinePayload(rows, machine, cm === 'join');
    if (packed.error) return err(packed.error);
    const p = { mode: cm, company: $('#co').value.trim(), code: $('#code').value.trim().toUpperCase(), employee: $('#emp').value.trim(),
      machines: packed.machines.map((m) => ({ id: m.machine_type_id, nick: m.nickname })) };
    if (cm === 'new' && !p.company) return err('Enter your company name.');
    if (cm === 'join' && p.code.length < 6) return err('Enter the invite code from your company owner.');
    if (!p.employee) return err('Enter your name.');
    const go = $('#go'); busy(go, true, withAuth ? 'Creating account…' : 'Saving…');
    try {
      if (withAuth) {
        p.email = $('#e').value.trim(); const password = $('#pw').value;
        if (!/^\S+@\S+\.\S+$/.test(p.email)) throw new Error('Enter a valid email.');
        if (password.length < 8) throw new Error('Password needs at least 8 characters.');
        if (password.length > 72) throw new Error('Password must be 72 characters or fewer.');
        store.set(PENDING_KEY, p);
        const c = await sb();
        const { data, error } = await c.functions.invoke('bdht-signup', { body: {
          mode: p.mode, company: p.company, code: p.code, employee: p.employee, email: p.email, password,
          machines: packed.machines,
        } });
        if (error) throw await readFunctionError(error);
        if (data?.error) throw new Error(data.error);
        const signed = await c.auth.signInWithPassword({ email: p.email, password });
        if (signed.error) throw new Error('Your account was created. Sign in with the same email and password to open it.');
        store.set(PENDING_KEY, null);
        await refreshMe();
        if (saveOnSignIn) authorizePendingSave();
        const first = p.employee.split(' ')[0];
        toast(data?.capped
          ? `Welcome, ${first}! Free plan saved 3 machines. Upgrade in My rigs for unlimited.`
          : `Welcome, ${first}!`);
        location.hash = '#/garage';
        return;
      }
      await runSetup(p);
      toast(`Welcome, ${p.employee.split(' ')[0]}!`); location.hash = '#/garage';
    } catch (e) { busy(go, false); err(friendlyAuthError(e)); }
  });
}
async function runSetup(p) {
  const c = await sb();
  const r = p.mode === 'join' ? await c.rpc('bdht_join_company', { p_code: p.code, p_employee: p.employee })
    : await c.rpc('bdht_create_company', { p_company: p.company, p_employee: p.employee });
  if (r.error) throw r.error;
  const cid = r.data;
  let stoppedAtLimit = false;
  for (const m of p.machines || []) {
    const mm = machine(m.id);
    const { error } = await c.from('bdht_machines').insert({ company_id: cid, machine_type_id: m.id, brand: mm?.brand, model: mm?.model || String(m.id), nickname: m.nick || null });
    if (error) {
      if (/Free plan includes 3/.test(error.message || '')) { stoppedAtLimit = true; break; }
      throw error;
    }
  }
  store.set(PENDING_KEY, null); await refreshMe();
  if (stoppedAtLimit) toast('Free plan stops at 3 machines. Upgrade in My rigs for unlimited.');
}

/* garage: the company's machines */
async function fetchFleet() {
  const c = await sb();
  const [m, l] = await Promise.all([
    c.from('bdht_machines').select('*').order('created_at'),
    c.from('bdht_loadouts').select('id,machine_id,name,is_default,mode,part_count,items,pipe_id,roadmap_id,config,updated_at').order('updated_at', { ascending: false }),
  ]);
  if (m.error) throw m.error; if (l.error) throw l.error;
  return { machines: m.data, loadouts: l.data };
}
const loImgs = (lo, n = 6) => (lo?.items || []).filter((i) => i.img).slice(0, n);
const loKey = (lo) => (lo.items || []).slice().reverse().find((i) =>
  !(i.alt && brandTheme(i.brand || RADIUS_BRAND) === 'radius')
  && (/^(Bit|Backreamer)$/i.test(i.type || '') || /^(Bit|Backreamer)\b/i.test(i.sec || '')));
function stripHtml(lo, cls = 'lo-strip') {
  const im = loImgs(lo);
  return `<div class="${cls}">${im.map((i) => `<span class="lo-thumb"${brandAttr(partTheme(i))}>${imgTag(i.img, 200, 100, i.name)}</span>`).join('') || '<span class="small muted">No parts yet</span>'}</div>`;
}
function guestUpsell(where) {
  return `<div class="upsell card pad stack">
    <div class="upsell-ico">${ICON_RIG}</div>
    <h2>${where === 'garage' ? 'Machines and loadouts' : 'Save it on a machine'}</h2>
    <p>Free crew account, up to ${FREE_MACHINE_LIMIT} machines. Each saved drill is a machine, and each saved setup is a named loadout. Unlimited machines are $2.99/month.</p>
    <a class="btn btn-primary btn-block" href="#/account">Create free account</a>
    <a class="btn btn-ghost btn-block" href="#/account?m=signin">I have an account</a></div>`;
}
const isEntitled = () => ME.billing?.entitled === true;
function billingDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function planCopy(count) {
  const b = ME.billing || {};
  if (b.entitled) {
    const when = billingDate(b.current_period_end);
    const detail = b.cancel_at_period_end
      ? `Cancels ${when || 'at period end'}. Unlimited until then.`
      : (when ? `Renews ${when}.` : '$2.99/month.');
    return { title: 'Unlimited · $2.99/mo', detail, paid: true };
  }
  const title = count > FREE_MACHINE_LIMIT
    ? `Free · ${count} machines saved`
    : `Free · ${count} of ${FREE_MACHINE_LIMIT} machines`;
  let detail = 'Unlimited machines are $2.99/month.';
  if (count >= FREE_MACHINE_LIMIT) detail = 'This crew is at the free limit. Upgrade for unlimited machines, $2.99/month.';
  if (b.subscription_status === 'past_due' || b.payment_failed_at) {
    detail = 'The last invoice failed. New machines stay capped at 3 until billing is active. Existing machines stay.';
  }
  return { title, detail, paid: false };
}
function billingAlerts() {
  const b = ME.billing;
  if (!b) return '';
  const notes = [];
  if (b.open_dispute_id) notes.push('A charge on this subscription was disputed. The owner can review it in Manage billing.');
  if (b.fraud_warning_id) notes.push('The card network flagged a charge for possible fraud. Review the warning in the Stripe Dashboard.');
  if (b.last_refunded_at) notes.push(`A charge was refunded${b.last_refund_amount ? ` ($${(b.last_refund_amount / 100).toFixed(2)})` : ''}. Machine access still follows the subscription status.`);
  return notes.map((text) => `<div class="note note-warn"><span>${esc(text)}</span></div>`).join('');
}
function planBanner(count) {
  const plan = planCopy(count);
  const owner = ME.member?.role === 'owner';
  const actions = owner
    ? `${plan.paid ? '' : '<button class="btn btn-primary" id="upgrade">Upgrade · $2.99/mo</button>'}${ME.billing?.stripe_customer_id ? '<button class="btn btn-ghost" id="portal">Manage billing</button>' : ''}`
    : (plan.paid ? '' : '<p class="small muted">The company owner upgrades the plan.</p>');
  return `<section class="plan-banner ${plan.paid ? 'is-paid' : ''}" aria-label="Plan">
    <div><small>Plan</small><b>${esc(plan.title)}</b><p>${esc(plan.detail)}</p></div>
    <div class="plan-actions">${actions}</div></section>`;
}
function consumeBillingReturn() {
  const billing = new URLSearchParams(location.search).get('billing');
  if (!billing) return null;
  history.replaceState(null, '', location.pathname + location.hash);
  return billing;
}
async function functionError(error) {
  let message = error?.message || 'Billing request failed';
  try {
    const body = await error?.context?.json?.();
    if (body?.error) message = body.error;
  } catch { /* body already consumed */ }
  return new Error(message);
}
async function readFunctionError(error) {
  let message = error?.message || '';
  try {
    const body = await error?.context?.json?.();
    if (typeof body?.error === 'string') message = body.error;
    else if (typeof body?.message === 'string') message = body.message;
    else if (typeof body?.msg === 'string') message = body.msg;
  } catch { /* body already consumed */ }
  return new Error(friendlyAuthError(message));
}
async function startCheckout(btn) {
  if (ME.member?.role !== 'owner') return toast('The company owner upgrades the plan.');
  busy(btn, true, 'Opening checkout…');
  try {
    const c = await sb();
    const { data, error } = await c.functions.invoke('bdht-create-checkout', { body: {} });
    if (error) throw await functionError(error);
    const targetUrl = safeStripeUrl(data?.url);
    if (!targetUrl) throw new Error('Checkout did not return a valid Stripe link.');
    location.href = targetUrl;
  } catch (e) {
    busy(btn, false);
    const msg = errMsg(e);
    if (/Manage billing|update the card/i.test(msg)) { toast(msg); return startPortal(); }
    toast(msg);
  }
}
async function startPortal(btn) {
  if (ME.member?.role !== 'owner') return toast('The company owner manages billing.');
  busy(btn, true, 'Opening billing…');
  try {
    const c = await sb();
    const { data, error } = await c.functions.invoke('bdht-create-portal', { body: {} });
    if (error) throw await functionError(error);
    const targetUrl = safeStripeUrl(data?.url);
    if (!targetUrl) throw new Error('Billing portal did not return a valid Stripe link.');
    location.href = targetUrl;
  } catch (e) { busy(btn, false); toast(errMsg(e)); }
}
function wirePlanActions(root = document) {
  $('#upgrade', root)?.addEventListener('click', (ev) => startCheckout(ev.currentTarget));
  $('#portal', root)?.addEventListener('click', (ev) => startPortal(ev.currentTarget));
}
function upgradeSheet() {
  const owner = ME.member?.role === 'owner';
  openSheet(`<div class="sheet-top"><div><div class="small muted">Unlimited machines</div><h2>$2.99/month</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body stack">
      <p>Free crews save up to ${FREE_MACHINE_LIMIT} machines. Unlimited removes that cap for the whole company. Checkout is on Stripe. This page does not unlock the plan by itself.</p>
      ${owner ? '' : '<p class="small muted">Ask the company owner to upgrade. Members can keep using the machines already saved.</p>'}
    </div>
    <div class="sheet-foot">${owner ? '<button class="btn btn-primary" style="flex:1" id="upgrade">Continue to checkout</button>' : '<button class="btn btn-ghost" data-close>Close</button>'}</div>`, (sh) => {
    wirePlanActions(sh);
  });
}
function requestAddOperator(count, prefill) {
  if (!canAddMachine(count, isEntitled())) return upgradeSheet();
  return addMachineSheet(prefill);
}
async function viewGarage(isCurrent = () => true) {
  await loadCatalog();
  if (!isCurrent()) return;
  setStepper(0); setActionbar('');
  app.innerHTML = '<div class="stack"><div class="skeleton"></div><div class="skeleton"></div></div>';
  await meReady();
  if (!isCurrent()) return;
  const phone = getSaved();
  const unsaved = store.get(LAST_KEY, null);
  const unsavedOpen = unsaved?.cfg?.r && needsGarageSave(unsaved.cfg);
  const billingFlag = consumeBillingReturn();
  if (!ME.user) {
    app.innerHTML = `${pageHead('Class select', 'My rigs', 'Each saved drill is a machine. Each saved setup is a named loadout. Sign in to keep the class on that machine.')}
      ${unsavedOpen ? `<div class="note" style="margin-bottom:12px"><span><b>${esc(unsaved.title || 'This loadout')} is not in My rigs yet.</b> Sign in and it is saved on the drill. <button class="linkbtn" id="stash-in" type="button">Sign in and save</button></span></div>` : ''}
      ${phone.length ? `<div class="section-head"><h2>On this phone</h2><a class="linkbtn" href="#/saved">See all</a></div><div class="lo-grid">${phone.slice(0, 4).map((s) => savedRow(s)).join('')}</div>` : ''}
      <div class="rig-grid" style="margin-top:12px"><a class="rig-card rig-locked" href="#/account">
        <div class="rig-top"><div><div class="t-brand">Machine</div><div class="rig-name">Your machines</div></div><span class="pill">Locked</span></div>
        <p class="small muted" style="margin:0">Crew loadouts show up here after you sign in.</p>
        <div class="rig-foot"><span>Sign in to open My rigs</span>${ICON.chev}</div>
      </a></div>
      ${guestUpsell('garage')}`;
    const stashAccount = () => { if (unsavedOpen && unsaved?.cfg) stashPendingSave(unsaved.cfg, unsaved.title); };
    $('#stash-in')?.addEventListener('click', () => { stashAccount(); goHash('#/account?m=signin&save=1'); });
    return;
  }
  if (!ME.member) { location.replace('#/setup'); return; }
  let finish = null;
  try { finish = await consumePendingSave(); } catch (e) { toast(errMsg(e)); }
  if (!isCurrent()) return;
  if (billingFlag === 'success' && !isEntitled()) {
    toast('Checkout finished. Unlimited machines turn on when Stripe confirms the subscription.');
    for (let i = 0; i < 3 && !isEntitled(); i++) {
      await new Promise((r) => setTimeout(r, 2000));
      await refreshMe();
      if (!isCurrent()) return;
    }
    if (isEntitled()) toast('Unlimited machines are on.');
  } else if (billingFlag === 'cancel') toast('Checkout canceled. This crew is still on the free plan.');
  else if (billingFlag === 'portal') toast('Back from billing. Pull to refresh if the plan looks stale.');
  let fleet; try { fleet = await fetchFleet(); } catch (e) { if (isCurrent()) app.innerHTML = `<div class="card empty">${esc(errMsg(e))}</div>`; return; }
  if (!isCurrent()) return;
  const count = fleet.machines.length;
  const atLimit = !canAddMachine(count, isEntitled());
  const byM = (id) => fleet.loadouts.filter((l) => l.machine_id === id);
  app.innerHTML = `
    <div class="garage-head">
      <div><small>Class select</small><h1>${esc(ME.company.name)}</h1>
        <div class="small muted">${esc(ME.member.employee_name)} · ${ME.member.role === 'owner' ? 'Owner' : 'Member'}</div></div>
      <button class="iconbtn dark" id="acct" aria-label="Account and crew">${ICON_MORE}</button></div>
    ${planBanner(count)}
    ${billingAlerts()}
    <div class="section-head"><h2>Equipment · ${count}</h2><button class="linkbtn" id="addm">${atLimit ? 'Upgrade for unlimited' : '+ Add machine'}</button></div>
    <div class="rig-grid">${fleet.machines.map((mc) => {
      const los = byM(mc.id), def = los.find((l) => l.is_default) || los[0];
      return `<a class="rig-card"${brandAttr(rigBrand(mc))} href="#/rig/${esc(mc.id)}">
        <div class="rig-top"><div><div class="t-brand">Machine · ${esc(rigSub(mc))}</div><div class="rig-name">${esc(rigName(mc))}</div></div>
          <span class="pill ${los.length ? 'pill-orange' : ''}">${los.length} loadout${los.length === 1 ? '' : 's'}</span></div>
        ${stripHtml(def)}
        <ul class="lo-name-list">${los.map((lo) => `<li><b>${lo.is_default ? '★ ' : ''}${esc(lo.name)}</b><span>${lo.mode === 'Bit' ? 'Pilot' : 'Pullback'} · ${esc(lo.part_count)}</span></li>`).join('') || '<li class="muted">No loadouts yet</li>'}</ul>
        <div class="rig-foot">${def ? `<span><b>${los.length} loadout${los.length === 1 ? '' : 's'}</b></span>` : '<span class="muted">No loadouts yet. Tap to build a class.</span>'}${ICON.chev}</div></a>`;
    }).join('') || `<div class="card empty"><h2>No machines yet</h2><p>Add a machine to start a loadout.</p><button class="btn btn-primary" id="addm2">+ Add machine</button></div>`}</div>
    ${finish?.pending ? `<div class="note" style="margin-top:12px"><span><b>Finish saving “${esc(finish.pending.name)}”.</b> Pick the machine.
      <span class="chips" style="margin-top:8px">${finish.machines.map((mc) => `<button type="button" class="chip"${brandAttr(rigBrand(mc))} data-finish="${esc(mc.id)}">${esc(rigName(mc))}</button>`).join('')}</span></span></div>` : ''}`;
  const openAdd = () => requestAddOperator(count);
  $('#addm').addEventListener('click', openAdd);
  $$('[data-finish]').forEach((b) => b.addEventListener('click', async () => {
    try {
      const saved = await saveLoadout(finish.pending.cfg, b.dataset.finish, null, finish.pending.name);
      store.set(PENDING_SAVE_KEY, null);
      markGarageSaved(finish.pending.cfg);
      toast(`Saved “${saved.name}”`);
      route();
    } catch (e) { toast(errMsg(e)); }
  }));
  $('#addm2')?.addEventListener('click', openAdd);
  $('#acct').addEventListener('click', () => accountSheet(count));
  wirePlanActions();
}
function addMachineSheet(prefill) {
  openSheet(`<div class="sheet-top"><h2>Add a machine</h2><button class="iconbtn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body stack">
      <label class="field"><span>Drill</span><select id="am">${drillOptions(prefill)}</select></label>
      <label class="field"><span>Unit name</span><input id="an" maxlength="60" placeholder="Unit 12, Big Red, #4471…" autocomplete="off"></label>
      <div class="form-err" id="aerr" hidden></div></div>
    <div class="sheet-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" style="flex:1" id="ago">Add machine</button></div>`, (sh) => {
    $('#ago', sh).addEventListener('click', async () => {
      const id = +$('#am', sh).value; if (!id) { $('#aerr', sh).textContent = 'Pick a drill.'; $('#aerr', sh).hidden = false; return; }
      const mm = machine(id), c = await sb();
      busy($('#ago', sh), true, 'Adding…');
      const { data, error } = await c.from('bdht_machines').insert({ company_id: ME.company.id, machine_type_id: id, brand: mm.brand, model: mm.model, nickname: $('#an', sh).value.trim() || null }).select().single();
      if (error) {
        busy($('#ago', sh), false);
        if (/Free plan includes 3/.test(error.message || '')) { closeSheet(); setTimeout(upgradeSheet, 220); return; }
        $('#aerr', sh).textContent = errMsg(error); $('#aerr', sh).hidden = false; return;
      }
      closeSheet(); toast('Machine added'); location.hash = `#/rig/${data.id}`;
    });
  });
}
async function accountSheet(machineCount) {
  const c = await sb();
  const { data: crew } = await c.from('bdht_members').select('employee_name,role,email').order('created_at');
  const count = Number.isFinite(machineCount) ? machineCount : null;
  openSheet(`<div class="sheet-top"><div><h2>${esc(ME.company.name)}</h2><div class="small muted">${esc(ME.user.email)}</div></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body stack">
      ${count == null ? '' : planBanner(count)}
      <div class="invite"><div><small>CREW INVITE CODE</small><code>${esc(ME.company.invite_code)}</code><div class="small muted">Coworkers pick “Join my company” when they sign up and enter this code.</div></div>
        <button class="btn btn-ghost btn-sm" id="cpy">${ICON.link} Copy</button></div>
      <div><div class="form-sub"><b>Crew · ${crew?.length || 0}</b></div>
        <ul class="mini-list">${(crew || []).map((m) => `<li><span>${esc(m.employee_name)}</span><span class="pill ${m.role === 'owner' ? 'pill-dark' : ''}">${m.role === 'owner' ? 'Owner' : 'Member'}</span></li>`).join('')}</ul></div>
      ${ME.member.role === 'owner' ? `<label class="field"><span>Company name</span><input id="cn" value="${esc(ME.company.name)}" maxlength="120"></label><button class="btn btn-ghost btn-block" id="cnsave">Rename company</button>` : ''}
    </div>
    <div class="sheet-foot"><button class="btn btn-outline btn-block" id="out">Sign out</button></div>`, (sh) => {
    wirePlanActions(sh);
    $('#cpy', sh).addEventListener('click', async () => { await copyText(ME.company.invite_code); toast('Invite code copied'); });
    $('#cnsave', sh)?.addEventListener('click', async () => {
      const name = $('#cn', sh).value.trim(); if (!name) return;
      const { error } = await c.from('bdht_companies').update({ name }).eq('id', ME.company.id);
      if (error) return toast(error.message); ME.company.name = name; closeSheet(); toast('Company renamed'); route();
    });
    $('#out', sh).addEventListener('click', async () => { await c.auth.signOut(); ME.user = ME.member = ME.company = ME.billing = null; store.set(PENDING_KEY, null); store.set(PENDING_SAVE_KEY, null); loCtx.set(null); sessionStorage.removeItem(GARAGE_FP_KEY); updateAcctNav(); closeSheet(); toast('Signed out'); goHash('#/'); });
  });
}

/* one machine: its loadout cards ("create a class") */
async function viewRig(id, isCurrent = () => true) {
  await loadCatalog();
  if (!isCurrent()) return;
  setStepper(0); setActionbar('');
  await meReady();
  if (!isCurrent()) return;
  if (!ME.member) { location.replace(ME.user ? '#/setup' : '#/account'); return; }
  app.innerHTML = '<div class="stack"><div class="skeleton"></div><div class="skeleton"></div></div>';
  const c = await sb();
  const [mr, lr] = await Promise.all([c.from('bdht_machines').select('*').eq('id', id).maybeSingle(),
    c.from('bdht_loadouts').select('*').eq('machine_id', id).order('is_default', { ascending: false }).order('updated_at', { ascending: false })]);
  if (!isCurrent()) return;
  const mc = mr.data; if (!mc) return viewNotFound();
  const los = lr.data || [], cat = machine(mc.machine_type_id);
  app.innerHTML = `
    <a class="linkbtn" href="#/garage" style="padding-left:0">‹ All machines</a>
    <div class="rig-hero"${brandAttr(rigBrand(mc))}>
      <div style="min-width:0"><div class="t-brand">Machine · ${esc(rigSub(mc))}</div><h1>${esc(rigName(mc))}</h1>
        <div class="small muted">${los.length} loadout${los.length === 1 ? '' : 's'} · ${esc(ME.company.name)}</div></div>
      <button class="iconbtn dark" id="mmenu" aria-label="Machine options">${ICON_MORE}</button></div>
    <button class="btn btn-primary btn-block"${brandAttr(rigBrand(mc))} id="newlo" style="margin:14px 0 4px" ${cat?.pipes.length ? '' : 'disabled'}>+ New loadout</button>
    <div class="section-head"><h2>Loadouts</h2><span class="small muted">Named presets. ⋯ renames, copies, or sets primary</span></div>
    <div class="lo-grid">${los.map((lo) => {
      const pipe = pipeOf(cat, lo.pipe_id), key = loKey(lo);
      return `<article class="lo-card ${lo.is_default ? 'is-default' : ''}"${brandAttr(rigBrand(mc))}>
        <div class="lo-top"><div style="min-width:0"><div class="lo-name">${esc(lo.name)}${lo.is_default ? `<span class="pill pill-dark">${ICON_STAR}Primary</span>` : ''}</div>
          <div class="small muted">${esc(pipe?.name || 'Pipe')} · ${lo.mode === 'Bit' ? 'Pilot' : 'Pullback'} · ${esc(lo.part_count)} equipped</div></div>
          <button class="iconbtn" data-lomenu="${esc(lo.id)}" aria-label="Options for ${esc(lo.name)}">${ICON_MORE}</button></div>
        ${stripHtml(lo)}
        ${key ? `<div class="lo-key"${brandAttr(partTheme(key))}><span>${lo.mode === 'Bit' ? 'Bit' : 'Reamer'}</span>${partChip(key)}<b>${esc(key.name)}</b>${key.pn ? `<code>#${esc(key.pn)}</code>` : ''}</div>` : ''}
        <div class="lo-actions"><button class="btn btn-outline" data-loedit="${esc(lo.id)}">Edit</button><a class="btn btn-primary" href="#/summary?c=${b64e(lo.config)}">Open brief</a></div>
      </article>`;
    }).join('') || `<div class="card empty"><h2>No loadouts yet</h2><p>Build one: lock the pipe, then equip each slot from the rig out to the bit.</p></div>`}</div>`;
  const ctxFor = (lo) => ({ machine: { id: mc.id, machine_type_id: mc.machine_type_id, model: mc.model, brand: mc.brand, nickname: mc.nickname }, loadout: lo ? { id: lo.id, name: lo.name } : null });
  $('#newlo').addEventListener('click', () => { loCtx.set(ctxFor(null)); location.hash = `#/pipe/${mc.machine_type_id}`; });
  $$('[data-loedit]').forEach((b) => b.addEventListener('click', () => { const lo = los.find((x) => x.id === b.dataset.loedit); loCtx.set(ctxFor(lo)); location.hash = `#/build?c=${b64e(lo.config)}`; }));
  $$('[data-lomenu]').forEach((b) => b.addEventListener('click', () => loMenu(los.find((x) => x.id === b.dataset.lomenu), mc, los)));
  $('#mmenu').addEventListener('click', () => machineMenu(mc, los.length));
}
function loMenu(lo, mc, los) {
  openSheet(`<div class="sheet-top"${brandAttr(rigBrand(mc))}><div><div class="small muted">${esc(rigName(mc))}</div><h2>${esc(lo.name)}</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body stack">
      <label class="field"><span>Name</span><input id="lr" value="${esc(lo.name)}" maxlength="60"></label>
      <button class="btn btn-ghost btn-block" id="lrn">Rename</button>
      <div class="menu-grid">
        <button class="btn btn-ghost" id="ldef" ${lo.is_default ? 'disabled' : ''}>${ICON_STAR} ${lo.is_default ? 'Primary' : 'Set primary'}</button>
        <button class="btn btn-ghost" id="ldup"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11z"/></svg> Duplicate</button>
        <button class="btn btn-ghost" id="lshare">${ICON.share} Share</button>
        <a class="btn btn-ghost" href="#/summary?c=${b64e(lo.config)}">${ICON.mail} Brief</a>
      </div>
      <button class="btn btn-ghost btn-block danger" id="ldel">${ICON.trash} Delete loadout</button></div>`, async (sh) => {
    const c = await sb(), done = (m) => { closeSheet(); toast(m); setTimeout(route, 240); };
    const fail = (e) => toast(errMsg(e));
    $('#lrn', sh).addEventListener('click', async () => { const name = $('#lr', sh).value.trim(); if (!name) return; const { error } = await c.from('bdht_loadouts').update({ name, updated_at: new Date().toISOString() }).eq('id', lo.id).eq('company_id', ME.company.id); error ? fail(error) : done('Renamed'); });
    $('#ldef', sh).addEventListener('click', async () => { const { error } = await c.rpc('bdht_set_default_loadout', { p_loadout: lo.id }); error ? fail(error) : done(`${lo.name} is now primary`); });
    $('#ldup', sh).addEventListener('click', async () => {
      let name = `${lo.name} copy`, n = 2; while (los.some((x) => x.name === name)) name = `${lo.name} copy ${n++}`;
      const { id, created_at, updated_at, is_default, created_by, ...rest } = lo;
      const { error } = await c.from('bdht_loadouts').insert({ ...rest, company_id: ME.company.id, name: name.slice(0, 60), is_default: false }); error ? fail(error) : done('Duplicated');
    });
    $('#lshare', sh).addEventListener('click', async () => {
      const url = shareUrl(lo.config), title = `${lo.name} · ${rigName(mc)}`;
      if (navigator.share) { try { await navigator.share({ title, text: `${title} loadout (The Better Down Hole Tool)`, url }); } catch {} } else { await copyText(url); toast('Link copied'); }
    });
    $('#ldel', sh).addEventListener('click', async () => { if (!confirm(`Delete “${lo.name}”?`)) return; const { error } = await c.from('bdht_loadouts').delete().eq('id', lo.id).eq('company_id', ME.company.id); error ? fail(error) : done('Deleted'); });
  });
}
function machineMenu(mc, nLo) {
  openSheet(`<div class="sheet-top"${brandAttr(rigBrand(mc))}><div><div class="small muted">${esc(rigSub(mc))}</div><h2>${esc(rigName(mc))}</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body stack">
      <label class="field"><span>Unit name / number</span><input id="mn" value="${esc(mc.nickname || '')}" maxlength="60" placeholder="Unit 12"></label>
      <button class="btn btn-ghost btn-block" id="mns">Save name</button>
      <button class="btn btn-ghost btn-block danger" id="mdel">${ICON.trash} Remove machine${nLo ? ` and its ${nLo} loadout${nLo > 1 ? 's' : ''}` : ''}</button></div>`, async (sh) => {
    const c = await sb();
    $('#mns', sh).addEventListener('click', async () => { const { error } = await c.from('bdht_machines').update({ nickname: $('#mn', sh).value.trim() || null }).eq('id', mc.id).eq('company_id', ME.company.id); closeSheet(); toast(error ? error.message : 'Saved'); setTimeout(route, 240); });
    $('#mdel', sh).addEventListener('click', async () => { if (!confirm(`Remove ${rigName(mc)}${nLo ? ' and its loadouts' : ''}?`)) return; const { error } = await c.from('bdht_machines').delete().eq('id', mc.id).eq('company_id', ME.company.id); closeSheet(); toast(error ? error.message : 'Machine removed'); if (!error) location.hash = '#/garage'; });
  });
}

/* loadout editor hooks used by the pipe + build steps */
function loBanner(ctx, label) {
  return `<div class="lo-banner"${brandAttr(rigBrand(ctx.machine))}><div style="min-width:0"><small>${label}</small><b>${esc(ctx.loadout?.name || 'New loadout')}</b><span> · ${esc(rigName(ctx.machine))}</span></div>
    <button class="iconbtn dark" id="loexit" aria-label="Stop editing loadout">✕</button></div>`;
}
function mountLoBanner() {
  $('#loexit')?.addEventListener('click', () => {
    const c = loCtx.get();
    const dest = c ? `#/rig/${c.machine.id}` : '#/garage';
    if (needsGarageSave(buildCfg)) confirmLeave(dest);
    else { loCtx.set(null); goHash(dest); }
  });
}
function loSaveSheet(cfg, ctx) {
  const def = ctx.loadout?.name || (cfg.mode === 'Bit' ? 'Pilot setup' : 'Backream setup');
  openSheet(`<div class="sheet-top"${brandAttr(rigBrand(ctx.machine))}><div><div class="small muted">${esc(rigName(ctx.machine))}</div><h2>${ctx.loadout ? 'Save loadout' : 'Save new loadout'}</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body stack"><label class="field"><span>Loadout name</span><input id="lname" value="${esc(def)}" maxlength="60" placeholder="Rock setup, Sand pilot, Backream 12in…"></label>
      <div class="chips">${['Rock setup', 'Sand pilot', 'Clay pilot', 'Backream 12in'].map((s) => `<button class="chip" data-sug="${s}">${s}</button>`).join('')}</div>
      ${ctx.loadout ? `<label class="check"><input type="checkbox" id="lcopy"> Save as a new copy instead</label>` : ''}
      <p class="small muted">Everyone at ${esc(ME.company?.name || 'your company')} will see it on this rig.</p></div>
    <div class="sheet-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" style="flex:1" id="lgo">${ICON.save} Save loadout</button></div>`, (sh) => {
    $$('[data-sug]', sh).forEach((b) => b.addEventListener('click', () => { $('#lname', sh).value = b.dataset.sug; }));
    $('#lgo', sh).addEventListener('click', async () => {
      const name = $('#lname', sh).value.trim() || def, asCopy = $('#lcopy', sh)?.checked;
      busy($('#lgo', sh), true, 'Saving…');
      try {
        const saved = await saveLoadout(cfg, ctx.machine.id, asCopy ? null : ctx.loadout?.id, name);
        markGarageSaved(cfg);
        loCtx.set(null); closeSheet(); toast(`Saved “${saved.name}”`); goHash('#/garage');
      } catch (e) { busy($('#lgo', sh), false); toast(errMsg(e)); }
    });
  });
}
async function saveLoadout(rawCfg, machineId, id, name) {
  const cfg = normalizeConfig(rawCfg);
  if (!cfg || pipeOf(machine(cfg.m), cfg.p)?.roadmap !== cfg.r) throw new Error('Invalid loadout configuration.');
  const rm = await loadRoadmap(cfg.r), rows = compute(rm, cfg);
  await loadRadius();
  const items = [...lineItems(rm, cfg, rows), ...altLineItems(RADIUS, cfg, rows)], c = await sb();
  const payload = { company_id: ME.company.id, machine_id: machineId, name: String(name || '').slice(0, 60), pipe_id: cfg.p, roadmap_id: cfg.r, mode: cfg.mode,
    config: JSON.parse(JSON.stringify(cfg)), part_count: items.length, updated_at: new Date().toISOString(),
    items: items.map((l) => ({ sec: l.sec, type: l.part.type || null, name: l.part.name, pn: l.part.pn || null, img: validImgId(l.part.img) || null, qty: l.qty, acc: !!l.acc, ...(l.brand ? { brand: l.brand } : {}), ...(l.alt ? { alt: true } : {}) })) };
  if (!id) { const { count } = await c.from('bdht_loadouts').select('id', { count: 'exact', head: true }).eq('machine_id', machineId); payload.is_default = !count; }
  const { data, error } = await (id ? c.from('bdht_loadouts').update(payload).eq('id', id).eq('company_id', ME.company.id) : c.from('bdht_loadouts').insert(payload)).select().single();
  if (error) throw error; return data;
}
async function saveToRigSection(cfg, sh) {
  const box = $('#rigsave', sh); if (!box) return;
  await meReady();
  if (!ME.user || !ME.member) { box.innerHTML = guestUpsell('save'); return; }
  const c = await sb();
  const [{ data }, counted] = await Promise.all([
    c.from('bdht_machines').select('*').eq('machine_type_id', cfg.m).order('created_at'),
    c.from('bdht_machines').select('id', { count: 'exact', head: true }),
  ]);
  const mm = machine(cfg.m);
  const atLimit = !canAddMachine(counted.count || 0, isEntitled());
  const addLabel = atLimit ? 'Upgrade for another machine' : `+ Add a ${mm?.model || 'drill'}`;
  box.innerHTML = `<div class="form-sub"><b>Save on a machine</b><span class="small muted">Shared with ${esc(ME.company.name)}</span></div>
    <div class="stack" style="margin-top:8px">${(data || []).map((mc) => `<button class="choice"${brandAttr(rigBrand(mc))} data-rig="${esc(mc.id)}"><div class="pipe-ico">${ICON_RIG}</div><div class="c-main"><div class="c-title">${esc(rigName(mc))}</div><div class="c-sub">${esc(rigSub(mc))}</div></div>${ICON.chev}</button>`).join('') ||
      `<p class="small muted">No ${esc(mm?.model || '')} in your machines yet.</p><button class="btn ${atLimit ? 'btn-primary' : 'btn-ghost'} btn-block" id="addthis">${esc(addLabel)}</button>`}</div>`;
  $$('[data-rig]', box).forEach((b) => b.addEventListener('click', () => {
    const mc = data.find((x) => x.id === b.dataset.rig);
    closeSheet(); setTimeout(() => loSaveSheet(cfg, { machine: mc, loadout: null }), 230);
  }));
  $('#addthis', box)?.addEventListener('click', () => { closeSheet(); setTimeout(() => requestAddOperator(counted.count || 0, cfg.m), 230); });
}

/* ---------- router ---------- */
let routeId = 0;
async function route() {
  if ((recoveryReady || sessionStorage.getItem(RECOVERY_KEY)) && location.hash !== RESET_ROUTE) {
    history.replaceState(null, '', RESET_ROUTE);
    currentHash = RESET_ROUTE;
  }
  const id = ++routeId, requestedHash = location.hash;
  const isCurrent = () => id === routeId && location.hash === requestedHash;
  const h = location.hash.slice(1) || '/';
  const [path, qs] = h.split('?');
  const q = new URLSearchParams(qs || '');
  const parts = path.split('/').filter(Boolean);
  const navKey = ['rig', 'account', 'setup'].includes(parts[0]) ? 'garage' : parts[0];
  document.body.dataset.view = parts[0] || 'home';
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === navKey));
  if (!$('#sheet').hidden) closeSheet();
  try {
    switch (parts[0]) {
      case undefined: viewHome(); break;
      case 'drill': await viewDrill(isCurrent); break;
      case 'pipe': await viewPipe(parts[1], isCurrent); break;
      case 'build': await viewBuild(q, isCurrent); break;
      case 'summary': await viewSummary(q, isCurrent); break;
      case 'saved': viewSaved(); break;
      case 'account': await viewAccount(q, isCurrent); break;
      case 'setup': await viewSetup(isCurrent); break;
      case 'garage': await viewGarage(isCurrent); break;
      case 'rig': await viewRig(parts[1], isCurrent); break;
      default: viewNotFound();
    }
  } catch (e) {
    if (!isCurrent()) return;
    console.error(e);
    app.innerHTML = `<div class="card empty"><h2>Something went wrong</h2><p>${esc(e.message)}</p><a class="btn btn-primary" href="#/">Home</a></div>`;
  }
}
let lastPath = '';
let currentHash = location.hash;
function leaveGuard(destHash, fromHash) {
  if (skipLeaveGuard) return false;
  if (!onBuilder(fromHash)) return false;
  if (!needsGarageSave(buildCfg)) return false;
  if (onBuilder(destHash)) return false;
  return true;
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === '_blank') return;
  if (a.matches('a.skip-link')) {
    e.preventDefault();
    app.focus();
    return;
  }
  const href = a.getAttribute('href');
  if (!leaveGuard(href, location.hash)) return;
  e.preventDefault();
  confirmLeave(href);
});
window.addEventListener('beforeunload', (e) => {
  if (onBuilder() && needsGarageSave(buildCfg)) { e.preventDefault(); e.returnValue = ''; }
});
window.addEventListener('hashchange', () => {
  const now = location.hash;
  const from = currentHash;
  if (skipLeaveGuard) skipLeaveGuard = false;
  else if (leaveGuard(now, from)) {
    const dest = now;
    skipLeaveGuard = true;
    currentHash = from;
    location.hash = from;
    confirmLeave(dest);
    return;
  }
  currentHash = now;
  if (onBuilder(now)) builderHref = now;
  const p = now.split('?')[0];
  if (p !== lastPath) window.scrollTo({ top: 0 });
  lastPath = p; route();
});
updateSavedBadge();
startRecovery();
currentHash = location.hash;
loadCatalog().then(() => {
  if (document.body.dataset.view === 'home') viewHome();
  if (document.body.dataset.view === 'saved') viewSaved();
}).catch(() => {});
lastPath = location.hash.split('?')[0];
route();
// account state loads in the background; guests never wait on it
meReady().then(() => { const h = location.hash.split('?')[0]; if (h === '' || h === '#/' || h === '#') viewHome(); });
