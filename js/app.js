/* The Better Down Hole Tool – mobile-first HDD drill-string builder.
   Data: data/catalog.json + data/roadmaps/<id>.json, generated from public manufacturer catalog APIs
   by tools/build_data.py. Compatibility rules mirror the source configurator. */
import { FREE_MACHINE_LIMIT, canAddMachine } from './billing.mjs';
import { normalizeConfig, quantity } from './config.mjs';
import { compute, lineItems, isLoadoutReady } from './compatibility.mjs';

const IMG_HOST = 'https://www.hddadvisor.com';

/* ---------- tiny helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const img = (id, w = 400, h = 200) => (id ? `${IMG_HOST}/Image/Thumbnail/${id}?width=${w}&height=${h}` : 'img/placeholder.svg');
// small profile thumbnails are mirrored locally (tools/fetch_images.py); fall back to hddadvisor.com, then a placeholder
const imgTag = (id, w, h, alt = '', cls = '') => !id ? `<img src="img/placeholder.svg" alt="">` :
  `<img ${cls ? `class="${cls}"` : ''} src="img/parts/${id}.png" data-remote="${img(id, w, h)}" alt="${esc(alt)}" loading="lazy" decoding="async" onerror="imgFallback(this)">`;
const photoTag = (id, alt = '') =>
  `<img src="${img(id, 800, 800)}" alt="${esc(alt)}" decoding="async" onerror="this.onerror=null;this.src='img/parts/${id}.png'">`;
// List cards and the string rail use the mirrored catalog file in img/parts/, not a shared glyph.
function catalogPhoto(id, alt) {
  const inner = id ? imgTag(id, 360, 140, alt) : `<img src="img/placeholder.svg" alt="">`;
  return `<div class="c-photo">${inner}</div>`;
}
window.imgFallback = (el) => {
  if (el.dataset.remote) { const r = el.dataset.remote; delete el.dataset.remote; el.src = r; }
  else { el.onerror = null; el.src = 'img/placeholder.svg'; }
};
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
const b64d = (s) => { try { return JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))); } catch { return null; } };
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
async function loadRoadmap(id) {
  if (!RM_CACHE.has(id)) {
    const r = await fetch(`data/roadmaps/${id}.json`);
    if (!r.ok) throw new Error('Tooling data not available for this drill/pipe yet.');
    RM_CACHE.set(id, await r.json());
  }
  return RM_CACHE.get(id);
}
const machine = (id) => CATALOG.machines.find((m) => m.id === +id);
const pipeOf = (m, pid) => m?.pipes.find((p) => p.id === +pid);

/* ---------- part labels ---------- */
const connStr = (p) => [p.cl, [p.cr, p.cr2].filter(Boolean).join(' & ')].filter(Boolean).join(' → ');
const pnTxt = (p) => p.pn || 'not listed';

/* ---------- UI shell ---------- */
const app = $('#app');
function setStepper(step, cfg) {
  const el = $('#stepper');
  if (!step) { el.hidden = true; return; }
  const m = cfg?.m && machine(cfg.m), p = m && pipeOf(m, cfg.p);
  const steps = [
    ['Drill', m ? m.model : '', '#/drill'],
    ['Pipe', p ? p.name : '', m ? `#/pipe/${m.id}` : null],
    ['Equip', cfg?.r ? cfg.mode : '', cfg?.r ? `#/build?c=${b64e(cfg)}` : null],
    ['Confirm', '', cfg?.r ? `#/summary?c=${b64e(cfg)}` : null],
  ];
  el.innerHTML = `<ol>${steps.map(([t, sub, href], i) => {
    const cls = i + 1 < step ? 'done' : i + 1 === step ? 'cur' : '';
    const inner = `<i class="n">${i + 1 < step ? '✓' : i + 1}</i>${t}${sub ? `<em class="lbl-sub">${esc(sub)}</em>` : ''}`;
    return `<li class="${cls}">${href && i + 1 !== step ? `<a href="${href}">${inner}</a>` : `<span aria-current="${i + 1 === step ? 'step' : 'false'}">${inner}</span>`}</li>`;
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
    lastHtml = `<a class="choice" href="#/build?c=${b64e(last.cfg)}"><div class="pipe-ico">${ICON.pipe}</div>
      <div class="c-main"><div class="small muted">Resume loadout</div><div class="c-title">${esc(last.title)}</div></div>${ICON.chev}</a>`;
  }
  app.innerHTML = `
  <section class="hero frame">
    <img src="img/hero-wide.jpg" alt="" fetchpriority="high">
    <div class="hero-body">
      <p class="kicker">Create a class</p>
      <h1>Build the loadout. <em>Equip every slot.</em></h1>
      <p>Pick a Ditch Witch® or Vermeer® drill, lock the pipe, then fill the string from the rig out to the bit. Share the loadout when the class is ready.</p>
      <a class="btn btn-primary btn-block" href="#/drill">Start a loadout ${ICON.chev}</a>
    </div>
  </section>
  ${ME.member ? `<a class="choice rig-cta" href="#/garage"><div class="pipe-ico">${ICON_RIG}</div><div class="c-main"><div class="small muted">${esc(ME.company.name)}</div><div class="c-title">Operators and loadouts</div></div>${ICON.chev}</a>` :
    `<a class="choice rig-cta" href="#/account"><div class="pipe-ico">${ICON_RIG}</div><div class="c-main"><div class="c-title">Save a class for every rig</div><div class="c-sub">Free crew account. Guests can still build and share a loadout.</div></div>${ICON.chev}</a>`}
  ${lastHtml ? `<div class="section-head"><h2>Continue</h2></div>${lastHtml}` : ''}
  ${saved.length ? `<div class="section-head"><h2>Saved loadouts</h2><a class="linkbtn" href="#/saved">See all</a></div>
    <div class="lo-grid">${saved.map((s) => savedRow(s)).join('')}</div>` : ''}
  <div class="section-head"><h2>How a class is built</h2></div>
  <div class="howto"><ol style="display:contents">
    <li><span class="num">1</span><div><h3>Choose the drill</h3><p>Current Ditch Witch® and Vermeer® models. This is the operator.</p></div></li>
    <li><span class="num">2</span><div><h3>Lock the pipe</h3><p>Only pipe that fits that drill can be equipped.</p></div></li>
    <li><span class="num">3</span><div><h3>Equip the slots</h3><p>Fill the string from housing to bit. Threads and adapters match as you go.</p></div></li>
    <li><span class="num">4</span><div><h3>Confirm and send</h3><p>Text, email, copy, or print the loadout.</p></div></li>
  </ol></div>`;
}
function savedRow(s, { del = false } = {}) {
  const c = b64e(s.cfg);
  return `<article class="lo-card">
    <div class="lo-top"><div style="min-width:0">
      <div class="lo-name">${esc(s.name)}</div>
      <div class="small muted">${esc(s.title)} · ${new Date(s.ts).toLocaleDateString()}</div>
    </div>
    ${del
      ? `<button class="iconbtn" data-del="${s.id}" aria-label="Delete ${esc(s.name)}">${ICON.trash}</button>`
      : `<a class="iconbtn" href="#/build?c=${c}" aria-label="Edit ${esc(s.name)}">${ICON.chev}</a>`}
    </div>
    <div class="lo-actions">
      <a class="btn btn-outline" href="#/build?c=${c}">Edit</a>
      <a class="btn btn-primary" href="#/summary?c=${c}">Open brief</a>
    </div>
  </article>`;
}
/* Step 1 – drill */
let drillFilter = { brand: 'all', q: '' };
async function viewDrill(isCurrent = () => true) {
  await loadCatalog();
  if (!isCurrent()) return;
  setStepper(1, null); setActionbar('');
  app.innerHTML = `
    ${pageHead('Step 01 · Drill class', 'Choose your drill', 'This is the operator you are building for. Tap a Ditch Witch® or Vermeer® model, or search “JT25” or “D24”.')}
    <div class="stack">
      <div class="searchbox">${ICON.search}<input id="q" type="search" inputmode="search" autocomplete="off" placeholder="Search drill model" value="${esc(drillFilter.q)}" aria-label="Search drill model"><button class="clear" id="clear" aria-label="Clear" ${drillFilter.q ? '' : 'hidden'}>×</button></div>
      <div class="seg" role="group" aria-label="Brand">
        ${[['all', 'All'], ['Ditch Witch', 'Ditch Witch®'], ['Vermeer', 'Vermeer®']].map(([v, l]) => `<button data-brand="${v}" aria-pressed="${drillFilter.brand === v}">${l}</button>`).join('')}
      </div>
    </div>
    <div id="drills"></div>`;
  const draw = () => {
    const q = drillFilter.q.trim().toLowerCase().replace(/\s+/g, '');
    const list = CATALOG.machines.filter((m) => (drillFilter.brand === 'all' || m.brand === drillFilter.brand) && (!q || `${m.brand}${m.model}`.toLowerCase().replace(/\s+/g, '').includes(q)));
    const groups = ['Compact', 'Mid-size', 'Large'].map((g) => [g, list.filter((m) => m.size === g)]).filter(([, l]) => l.length);
    const sub = { Compact: 'up to ~10k lb class', 'Mid-size': '~12k–40k lb class', Large: '60k lb class and up' };
    $('#drills').innerHTML = !list.length ? `<div class="empty">No drill matches “${esc(drillFilter.q)}”.</div>` :
      groups.map(([g, l]) => `<div class="section-head"><h2>${g}</h2><span class="small muted">${sub[g]}</span></div>
        <div class="tiles">${l.map((m) => {
          const n = m.pipes.length;
          return `<a class="tile ${m.brand === 'Vermeer' ? 'vermeer' : ''}" href="#/pipe/${m.id}">
            <div><div class="t-brand">${esc(m.brand)}</div><div class="t-model">${esc(m.model)}</div></div>
            <div class="t-meta">${n ? `${n} pipe option${n === 1 ? '' : 's'}` : 'No pipe listed'}</div>
            <div class="t-act">Select</div></a>`;
        }).join('')}</div>`).join('') +
      (drillFilter.brand !== 'Ditch Witch' ? `<div class="note" style="margin-top:16px">${ICON.info}<span>Running a Vermeer®? Ditch Witch drill pipe HIWS1® and HXT® is compatible with all Vermeer® Firestick® threads.</span></div>` : '');
  };
  draw();
  const q = $('#q');
  q.addEventListener('input', () => { drillFilter.q = q.value; $('#clear').hidden = !q.value; draw(); });
  $('#clear').addEventListener('click', () => { q.value = ''; drillFilter.q = ''; $('#clear').hidden = true; draw(); q.focus(); });
  $$('[data-brand]').forEach((b) => b.addEventListener('click', () => {
    drillFilter.brand = b.dataset.brand;
    $$('[data-brand]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw();
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
  app.innerHTML = `
    ${ctx ? loBanner(ctx, 'NEW LOADOUT · LOCK PIPE') : ''}
    ${ctx ? `<a class="linkbtn" href="#/rig/${ctx.machine.id}">‹ Back to ${esc(rigName(ctx.machine))}</a>` : '<a class="linkbtn" href="#/drill">‹ Change drill</a>'}
    ${pageHead('Step 02 · Pipe', `${esc(m.brand)} ${esc(m.model)}`, `Lock the pipe for this drill. Only pipe that fits the ${esc(m.model)} can be equipped.`)}
    <div class="stack">${m.pipes.map((p) => p.roadmap ? `
      <a class="choice" href="#/build?c=${b64e(newCfg(m.id, p.id, p.roadmap))}">
        ${catalogPhoto(p.img, p.name)}
        <div class="c-main"><div class="c-title">${esc(p.name)}</div>
          <div class="c-sub">${p.pn ? `Part # <b class="pn">${esc(p.pn)}</b>` : ''}</div></div>${ICON.chev}</a>` : `
      <div class="choice" aria-disabled="true">
        ${catalogPhoto(p.img, p.name)}
        <div class="c-main"><div class="c-title">${esc(p.name)}</div><div class="c-sub">${p.pn ? `Part # ${esc(p.pn)} · ` : ''}Tooling data not loaded yet</div></div></div>`).join('') ||
      `<div class="empty">No pipe is listed for this drill.</div>`}
    </div>
    ${m.brand === 'Vermeer' ? `<div class="note" style="margin-top:16px"><span>Ditch Witch drill pipe HIWS1® and HXT® is compatible with all Vermeer® Firestick® threads.</span></div>` : ''}`;
  mountLoBanner();
}

/* Step 3 – build */
let buildCfg = null;
async function viewBuild(q, isCurrent = () => true) {
  await loadCatalog();
  const cfg = cfgFromQuery(q);
  if (!isCurrent()) return;
  if (!cfg || pipeOf(machine(cfg.m), cfg.p)?.roadmap !== cfg.r) return viewNotFound();
  let rm;
  app.innerHTML = '<div class="stack"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
  try { rm = await loadRoadmap(cfg.r); } catch (e) { if (isCurrent()) app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
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
  setStepper(3, buildCfg);
}
function partRow(p, { selected, multi, sel = true, compact } = {}) {
  const stamp = selected || !sel ? 'Equipped' : 'Equip';
  return `<div class="part ${selected ? 'sel' : ''} ${multi ? 'multi' : ''}" ${sel ? `role="button" tabindex="0" data-pick="${p.id}" aria-pressed="${!!selected}"` : ''}>
    <div class="thumb">${imgTag(p.img, 240, 120, p.name)}</div>
    <div class="p-main"><div class="p-name">${esc(p.name)}</div>
      <div class="p-pn">${p.pn ? `#${esc(p.pn)}` : '<span class="muted">Part # not listed</span>'}</div>
      ${connStr(p) ? `<div class="p-conn">${esc(connStr(p))}</div>` : ''}
      ${!compact && p.short ? `<div class="p-short">${esc(p.short)}</div>` : ''}</div>
    <div class="p-act">
      <button class="iconbtn" data-info="${p.id}" aria-label="Details for ${esc(p.name)}">${ICON.info}</button>
      <span class="equip-stamp">${stamp}</span>
      ${sel ? `<span class="check" aria-hidden="true">${selected ? ICON.check : ''}</span>` : ''}
    </div></div>`;
}
function slotCell(r, i, P) {
  const n = String(i + 1).padStart(2, '0');
  const name = esc(r.sec.name);
  let state = 'locked', tag = 'Locked', plate = `<span class="slot-plate slot-plate-empty"><span class="slot-mark" aria-hidden="true">·</span></span>`;
  if (r.sel.length) {
    const pp = P[r.sel[0]];
    state = 'filled'; tag = 'Equipped';
    const count = r.sel.length > 1 ? `<span class="slot-count">×${r.sel.length}</span>` : '';
    const addon = r.acc[r.sel[0]] ? `<span class="slot-addon">+add</span>` : '';
    plate = `<span class="slot-plate">${imgTag(pp.img, 340, 100, pp.name)}${count}${addon}<span class="visually-hidden">${esc(pp.name)}</span></span>`;
  } else if (r.status === 'pending') {
    state = 'open'; tag = 'Open';
    plate = `<span class="slot-plate slot-plate-empty"><span class="slot-mark" aria-hidden="true">+</span></span>`;
  } else if (r.status === 'blocked') {
    state = 'open'; tag = 'Needs changes';
    plate = '<span class="slot-plate slot-plate-empty"><span class="slot-mark" aria-hidden="true">!</span></span>';
  } else if (r.status === 'skip') {
    state = 'skip'; tag = 'Skipped';
    plate = `<span class="slot-plate slot-plate-empty"><span class="slot-mark" aria-hidden="true">–</span></span>`;
  }
  return `<button type="button" class="slot slot-${state}" data-jump="${r.sec.id}">
    <span class="slot-idx" aria-hidden="true">${n}</span>${plate}
    <span class="slot-name">${name}</span><span class="slot-tag">${tag}</span></button>`;
}
function renderBuild(rm, focusNext) {
  const cfg = buildCfg, P = rm.parts, m = machine(cfg.m), p = pipeOf(m, cfg.p);
  const rows = compute(rm, cfg);
  const items = lineItems(rm, cfg, rows);
  const pending = rows.find((r) => r.status === 'pending');
  const ready = isLoadoutReady(rows);
  persistBuild();
  const strip = rows.map((r, i) => slotCell(r, i, P)).join('');

  let n = 0;
  const secHtml = rows.map((r) => {
    const s = r.sec; n++;
    const multi = s.multi;
    let body = '', chip = '';
    if (r.status === 'blocked') {
      chip = '<span class="pill pill-warn">Needs changes</span>';
      body = '<p class="sec-note">No compatible end tool fits. Change an earlier slot to complete this loadout.</p>';
    } else if (r.status === 'skip') {
      chip = '<span class="pill">Skipped</span>';
      body = `<p class="sec-note">Nothing fits the slot before this one, so this slot stays empty.</p>`;
    } else if (r.status === 'locked') {
      chip = '<span class="pill">Locked</span>';
      body = `<p class="sec-note">Equip ${esc(pending?.sec.name || 'the open slot')} first.</p>`;
    } else if (r.status === 'pending') {
      chip = `<span class="pill pill-orange">${multi ? 'Equip one or more' : 'Open slot'}</span>`;
      const shown = r.cands.slice(0, 5);
      body = `<p class="sec-note">${r.cands.length} option${r.cands.length > 1 ? 's' : ''} fit the slot before this one${r.hidden ? ` (${r.hidden} more hidden because nothing downstream fits them)` : ''}.</p>
        ${shown.map((o) => partRow(P[o.id], { multi })).join('')}
        ${r.cands.length > shown.length ? `<button class="btn btn-outline btn-block more" data-browse="${s.id}">See all ${r.cands.length} options</button>` : ''}`;
    } else {
      chip = r.status === 'auto' ? '<span class="pill pill-ok">Auto-matched</span>' : `<span class="pill pill-dark">Equipped${r.sel.length > 1 ? ` · ${r.sel.length}` : ''}</span>`;
      body = r.sel.map((id) => {
        const opt = s.opts.find((o) => o.id === id), accs = (opt.acc || []), a = r.acc[id];
        const accHtml = accs.length ? `<div class="acc"><div class="acc-title"><span>Add-on / adapter</span>${a?.auto ? '<span class="pill pill-ok">Auto-added to fit</span>' : ''}</div>
          <div class="chips">
            <button class="chip" data-acc="${s.id}.${id}" data-accid="0" aria-pressed="${!a}">None</button>
            ${accs.map((aid) => `<button class="chip" data-acc="${s.id}.${id}" data-accid="${aid}" aria-pressed="${a?.id === aid}">${esc(P[aid].name)}${P[aid].pn ? `<small>#${esc(P[aid].pn)}</small>` : ''}</button>`).join('')}
          </div></div>` : '';
        return partRow(P[id], { selected: true, multi, sel: false }) + accHtml;
      }).join('') + (r.cands.length > 1 ? `<button class="linkbtn" data-browse="${s.id}">${multi ? 'Add or remove' : `Swap (${r.cands.length} fit this slot)`}</button>` : '');
    }
    const dot = r.status === 'done' || r.status === 'auto' ? '✓' : n;
    const cls = { done: 'done', auto: 'done', pending: 'pending', blocked: 'pending', skip: 'skip', locked: 'locked' }[r.status];
    return `<div class="sec ${cls}" id="sec-${s.id}"><span class="sec-dot" aria-hidden="true">${dot}</span><div class="sec-body">
      <div class="sec-head"><div><p class="sec-kicker">Slot ${String(n).padStart(2, '0')}</p><h3>${esc(s.name)}</h3></div>${chip}</div>${body}</div></div>`;
  }).join('');

  const donePct = rows.filter((r) => ['done', 'auto', 'skip'].includes(r.status)).length;
  const pct = rows.length ? Math.round((donePct / rows.length) * 100) : 0;
  const ctx = loCtx.for(cfg);
  const endLabel = cfg.mode === 'Bit' ? 'Bit end' : 'Reamer end';
  app.innerHTML = `
    ${ctx ? loBanner(ctx, ctx.loadout ? 'EDITING LOADOUT' : 'NEW LOADOUT · EQUIP SLOTS') : ''}
    <div class="build-grid"><div>
      <div class="build-title"><div><a class="linkbtn" href="#/pipe/${cfg.m}" style="padding-left:0">‹ Change pipe</a>
        ${pageHead('Step 03 · Equip', esc(m?.model || 'Drill string'), `${esc(p?.name || '')}${p?.pn ? ` · #${esc(p.pn)}` : ''}`)}</div></div>
      <div class="seg" role="group" aria-label="Configuration type" style="margin:14px 0">
        <button data-mode="Bit" aria-pressed="${cfg.mode === 'Bit'}">Pilot<small>Bit config</small></button>
        <button data-mode="Backreamer" aria-pressed="${cfg.mode === 'Backreamer'}">Pullback<small>Backreamer config</small></button>
      </div>
      <div class="preview"><div class="preview-head"><span>Slot rail</span><span>${endLabel} →</span></div>
        <div class="meter" role="img" aria-label="${donePct} of ${rows.length} slots settled"><span style="width:${pct}%"></span></div>
        <div class="strip"><span class="rig">${esc(m?.model || 'RIG')}</span>${strip || '<span class="small muted">Slots appear here</span>'}</div></div>
      <div class="timeline" style="margin-top:18px">${secHtml}</div>
      ${!pending && rows.length && rows[rows.length - 1].status === 'blocked' ? `<div class="note" style="margin-top:14px">${ICON.info}<span><b>No ${esc(rows[rows.length - 1].sec.name.toLowerCase())} fits this loadout.</b> Try a different choice in an earlier slot.</span></div>` : ''}
    </div>
    <aside class="build-aside">
      <div class="aside-card"><h3>Equipped</h3>
        <ul class="mini-list">${items.map((l) => `<li><span>${esc(l.part.name)}</span><span class="pn">${esc(pnTxt(l.part))}</span></li>`).join('') || '<li class="muted">No slots filled yet</li>'}</ul>
        <a class="btn btn-primary btn-block" style="margin-top:12px" href="#/summary?c=${b64e(cfg)}">${ready ? 'Confirm class' : 'Review loadout'}</a>
        <button class="btn btn-ghost btn-block" style="margin-top:8px" data-save>${ICON.save} Save loadout</button>
      </div>
    </aside></div>`;

  const confirmHref = `#/summary?c=${b64e(cfg)}`;
  setActionbar(`<div class="ab-info"><strong>${items.length} equipped</strong><span class="ab-line">${pending ? `Open · ${esc(pending.sec.name)}` : ready ? `Class ready · ${donePct}/${rows.length}` : 'Needs changes · no compatible end tool'}</span>${pending ? `<a class="ab-review" href="${confirmHref}">Review</a>` : ''}</div>
    ${ctx && ready
      ? `<button class="btn btn-primary" data-save>${ICON.save} Save</button><a class="btn btn-ghost" href="${confirmHref}">Confirm</a>`
      : `<button class="btn btn-ghost btn-sm" data-save aria-label="Save loadout">${ICON.save}</button>${pending ? `<button class="btn btn-primary" type="button" data-equip-next>Equip</button>` : `<a class="btn btn-primary" href="${confirmHref}">Confirm</a>`}`}`);
  mountLoBanner();

  // events
  $$('[data-mode]').forEach((b) => b.addEventListener('click', () => { cfg.mode = b.dataset.mode; renderBuild(rm); window.scrollTo({ top: 0 }); }));
  const pick = (sid, id) => {
    const s = rm.sections.find((x) => x.id === sid);
    const cur = compute(rm, cfg).find((r) => r.sec.id === sid);
    if (s.multi) {
      const set = new Set(cur.sel); set.has(id) ? set.delete(id) : set.add(id);
      cfg.sel[sid] = [...set];
    } else cfg.sel[sid] = [id];
    return s;
  };
  $$('.sec [data-pick]').forEach((el) => {
    const go = (e) => {
      if (e.target.closest('[data-info]')) return;
      const sid = +el.closest('.sec').id.slice(4);
      const s = pick(sid, +el.dataset.pick);
      renderBuild(rm, !s.multi ? sid : null);
    };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go(e)));
  });
  $$('[data-info]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); showPart(rm, +b.dataset.info); }));
  $$('[data-browse]').forEach((b) => b.addEventListener('click', () => browseSheet(rm, +b.dataset.browse)));
  $$('[data-acc]').forEach((b) => b.addEventListener('click', () => { cfg.acc[b.dataset.acc] = +b.dataset.accid; renderBuild(rm); }));
  $$('[data-jump]').forEach((b) => b.addEventListener('click', () => $(`#sec-${b.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })));
  $$('[data-save]').forEach((b) => b.addEventListener('click', () => saveSheet(cfg)));
  $$('[data-equip-next]').forEach((b) => b.addEventListener('click', () => {
    const el = pending && $(`#sec-${pending.sec.id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  if (focusNext) {
    const nxt = compute(rm, cfg).find((r) => r.status === 'pending');
    const el = nxt && $(`#sec-${nxt.sec.id}`);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    else if (isLoadoutReady(compute(rm, cfg))) toast('Loadout complete');
  }
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
      ${soils.length > 1 ? `<div class="filters"><button class="chip" data-soil="" aria-pressed="true">All ground</button>${soils.map((x) => `<button class="chip" data-soil="${esc(x)}" aria-pressed="false">${esc(x)}</button>`).join('')}</div>` : ''}
      <div id="blist"></div></div>
    ${multi ? `<div class="sheet-foot"><button class="btn btn-primary btn-block" id="bdone">Done</button></div>` : ''}`, (sh) => {
    const draw = () => {
      const t = q.toLowerCase();
      const list = row.cands.filter((o) => { const pp = P[o.id]; return (!t || `${pp.name} ${pp.pn} ${pp.short || ''}`.toLowerCase().includes(t)) && (!soil || (pp.soil || '').includes(soil)); });
      $('#blist', sh).innerHTML = list.map((o) => partRow(P[o.id], { selected: chosen.has(o.id), multi })).join('') || '<div class="empty">No matches</div>';
      $$('[data-pick]', sh).forEach((el) => el.addEventListener('click', (e) => {
        if (e.target.closest('[data-info]')) return;
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
  const specs = Object.entries({ 'Part #': p.pn || 'Not listed', Connection: connStr(p), 'Recommended ground': p.soil, ...(p.specs || {}) }).filter(([, v]) => v);
  const prev = stacked ? $('#sheet').innerHTML : null;
  openSheet(`<div class="sheet-top"><div><div class="small muted" style="font-weight:800;letter-spacing:.06em">${esc((p.type || '').replace(/_/g, ' ').toUpperCase())}</div><h2>${esc(p.name)}</h2></div>
      <button class="iconbtn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body">
      <div class="gallery ${photos.length < 2 ? 'single' : ''}">${photos.map((i) => photoTag(i, p.name)).join('') || '<img src="img/placeholder.svg" alt="">'}</div>
      ${p.short ? `<p style="font-weight:700;margin:12px 0 0">${esc(p.short)}</p>` : ''}
      <dl class="specs">${specs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      ${p.desc?.length ? `<ul class="bullets">${p.desc.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
      ${(p.docs || []).filter((d) => d.url).map((d) => `<a class="btn btn-ghost btn-block" href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.name)}</a>`).join('')}
      <p class="small muted">Photos and specs from public manufacturer references.</p>
    </div>
    <div class="sheet-foot">${p.pn ? `<button class="btn btn-ghost" id="cpn">Copy part #</button>` : ''}<button class="btn btn-primary" style="flex:1" ${stacked ? 'id="back"' : 'data-close'}>${stacked ? '‹ Back to list' : 'Close'}</button></div>`, (sh) => {
    $('#cpn', sh)?.addEventListener('click', async () => { await copyText(p.pn); toast(`Copied ${p.pn}`); });
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
  return b64e({ m: cfg.m, p: cfg.p, r: cfg.r, mode: cfg.mode, sel: cfg.sel || {}, acc: cfg.acc || {}, q: cfg.q || {} });
}
function onBuilder(hash = location.hash) {
  return /^#\/(build|summary)(\?|$)/.test(hash);
}
function needsGarageSave(cfg = buildCfg) {
  return !!(cfg?.r && sessionStorage.getItem(GARAGE_FP_KEY) !== cfgFp(cfg));
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
  store.set(PENDING_SAVE_KEY, { cfg: JSON.parse(JSON.stringify(cfg)), name: (name || titleOf(cfg)).replace(' config', '').slice(0, 60), ts: Date.now() });
}
function goHash(href) {
  skipLeaveGuard = true;
  location.hash = href;
}
function confirmLeave(href) {
  const cfg = buildCfg;
  if (!cfg?.r) { goHash(href); return; }
  openSheet(`<div class="sheet-top"><div><h2>Save this loadout?</h2><p class="small muted">My rigs does not have it yet.</p></div><button class="iconbtn" data-close aria-label="Keep editing">✕</button></div>
    <div class="sheet-body"><p>Save it onto the drill, or keep a draft on this phone.</p></div>
    <div class="sheet-foot sheet-actions">
      <button class="btn btn-primary btn-block" id="save-go">Save loadout</button>
      <button class="btn btn-ghost btn-block" id="discard-go">Keep a draft on this phone</button>
      <button class="btn btn-ghost btn-block" data-close>Keep editing</button>
    </div>`, (sh) => {
    $('#save-go', sh).addEventListener('click', () => { closeSheet(); setTimeout(() => openDoneSheet(cfg), 240); });
    $('#discard-go', sh).addEventListener('click', () => {
      keepPhoneDraft(cfg);
      closeSheet();
      toast('Draft kept on this phone. My rigs does not have it yet.');
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
      $('#gosign', sh).addEventListener('click', () => stash('#/account?m=signin'));
      $('#gosignup', sh).addEventListener('click', () => stash('#/account'));
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
      ${list.length ? `<div class="form-sub"><b>Operator</b><span class="small muted">Where it shows in My rigs</span></div>
        <div class="stack">${list.map((mc) => `<button type="button" class="choice" data-mc="${mc.id}" aria-pressed="${mc.id === pre}"><div class="c-main"><div class="c-title">${esc(rigName(mc))}</div><div class="c-sub">${esc(rigSub(mc))}</div></div></button>`).join('')}</div>`
        : `<p>This drill is not in My rigs yet. Saving adds it as an operator.</p>
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
  if (!p?.cfg?.r || !ME.member) return null;
  const c = await sb();
  const { data, error } = await c.from('bdht_machines').select('*').eq('machine_type_id', p.cfg.m).order('created_at');
  if (error) throw error;
  const list = data || [];
  if (list.length > 1) return { pending: p, machines: list };
  let mc = list[0];
  if (!mc) {
    const mm = machine(p.cfg.m);
    const ins = await c.from('bdht_machines').insert({ company_id: ME.company.id, machine_type_id: +p.cfg.m, brand: mm?.brand, model: mm?.model || String(p.cfg.m), nickname: null }).select().single();
    if (ins.error) throw ins.error;
    mc = ins.data;
  }
  const saved = await saveLoadout(p.cfg, mc.id, null, p.name || titleOf(p.cfg));
  store.set(PENDING_SAVE_KEY, null);
  markGarageSaved(p.cfg);
  toast(`Saved “${saved.name}” to My rigs`);
  return { saved };
}

/* Step 4 – summary */
function listText(cfg, items, withLink = true) {
  const lines = [`HDD loadout: ${titleOf(cfg)}`, 'Built with The Better Down Hole Tool', ''];
  items.forEach((l, i) => lines.push(`${i + 1}. ${l.part.name}: PN ${pnTxt(l.part)}, qty ${l.qty}${l.acc ? ' (add-on)' : ''}`));
  if (withLink) lines.push('', `Open it: ${shareUrl(cfg)}`);
  return lines.join('\n');
}
async function viewSummary(q, isCurrent = () => true) {
  await loadCatalog();
  const cfg = cfgFromQuery(q);
  if (!isCurrent()) return;
  if (!cfg || pipeOf(machine(cfg.m), cfg.p)?.roadmap !== cfg.r) return viewNotFound();
  let rm;
  try { rm = await loadRoadmap(cfg.r); } catch (e) { if (isCurrent()) app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  if (!isCurrent()) return;
  buildCfg = cfg;
  const draw = () => {
    const rows = compute(rm, cfg), items = lineItems(rm, cfg, rows);
    const pending = rows.filter((r) => ['pending', 'locked', 'blocked'].includes(r.status));
    const ready = isLoadoutReady(rows);
    history.replaceState(null, '', `#/summary?c=${b64e(cfg)}`);
    currentHash = location.hash;
    rememberBuilder();
    setStepper(4, cfg);
    const m = machine(cfg.m), p = pipeOf(m, cfg.p);
    app.innerHTML = `
    <div class="sum-grid"><div class="stack">
      <div class="sum-head"><small>LOADOUT BRIEF · ${cfg.mode === 'Bit' ? 'PILOT' : 'PULLBACK'}</small>
        <h1>${esc(m?.brand || '')} ${esc(m?.model || '')}</h1><p>${esc(p?.name || '')}${p?.pn ? ` · #${esc(p.pn)}` : ''} · ${cfg.mode === 'Bit' ? 'Bit' : 'Backreamer'} config</p>
        <button class="btn btn-primary" data-done style="margin-top:14px">${ICON.save} Save loadout</button>
        <p class="small" style="margin:8px 0 0;color:#d5deea">${needsGarageSave(cfg) ? 'Not in My rigs yet. Saving puts it on this drill.' : 'Saved to My rigs.'}</p></div>
      ${rows.length && rows[rows.length - 1].status === 'blocked' ? `<div class="note no-print"><span><b>No ${esc(rows[rows.length - 1].sec.name.toLowerCase())} fits this loadout.</b> Try a different choice in an earlier slot.</span></div>` : ''}
      ${pending.length ? `<div class="note no-print"><span><b>${pending.length} slot${pending.length > 1 ? 's' : ''} still open</b> (${esc(pending.map((r) => r.sec.name).join(', '))}). <a href="#/build?c=${b64e(cfg)}">Finish equipping</a></span></div>` : ''}
      <div class="card"><ul class="lines">${items.map((l) => `
        <li class="line ${l.acc ? 'acc-line' : ''}"><div class="thumb">${imgTag(l.part.img, 200, 100, l.part.name)}</div>
          <div><div class="l-sec">${esc(l.sec)}${l.auto ? ' · auto' : ''}</div><div class="l-name">${esc(l.part.name)}</div>
            <div class="l-row"><span class="l-pn">${l.part.pn ? '#' + esc(l.part.pn) : '<span class="muted">Part # not listed</span>'}</span>
              <span class="print-qty">Qty: ${l.qty}</span><span class="qty no-print"><button data-dq="${l.key}" data-d="-1" aria-label="Less">−</button><input inputmode="numeric" data-qk="${l.key}" value="${esc(l.qty)}" aria-label="Quantity"><button data-dq="${l.key}" data-d="1" aria-label="More">+</button></span>
            </div></div></li>`).join('') || '<li class="empty">No parts selected yet.</li>'}</ul></div>
      <div class="share-grid no-print">
        <button class="btn btn-ghost" id="sh-share">${ICON.share}Share</button>
        <a class="btn btn-ghost" id="sh-sms" href="#">${ICON.sms}Text list</a>
        <a class="btn btn-ghost" id="sh-mail" href="#">${ICON.mail}Email list</a>
        <button class="btn btn-ghost" id="sh-copy">${ICON.link}Copy link</button>
        <button class="btn btn-ghost" id="sh-print">${ICON.print}Print / PDF</button>
        <button class="btn btn-ghost" data-done>${ICON.save}Save loadout</button>
        <a class="btn btn-ghost" href="#/build?c=${b64e(cfg)}">✎ Edit loadout</a>
        <button class="btn btn-ghost" id="sh-mode">⇄ ${cfg.mode === 'Bit' ? 'Pullback' : 'Pilot'} brief</button>
      </div>
    </div>
    <aside class="sum-aside stack">
      <div class="cta"><h2>Save this loadout</h2>
        <p>Confirm the class and put it in My rigs. You can still copy, text, email, or print the list.</p>
        <div class="stack">
          <button class="btn btn-primary btn-block" data-done>${ICON.save} Save loadout</button>
          <button class="btn btn-dark btn-block" id="q-share">${ICON.share} Share list</button>
          <button class="btn btn-block" id="q-copy">${ICON.link} Copy list</button>
          <a class="btn btn-block" id="q-mail" href="#">${ICON.mail} Email list</a>
          <button class="btn btn-block" id="q-print">${ICON.print} Print / PDF</button>
        </div></div>
    </aside></div>`;
    setActionbar(`<div class="ab-info"><strong>${needsGarageSave(cfg) ? 'Not saved' : 'Saved'}</strong><span class="ab-line">${items.length} equipped${ready ? ' · class ready' : ` · ${pending.length} incomplete`}</span></div>
      <button class="btn btn-ghost btn-sm" id="ab-copy">Copy</button>
      <button class="btn btn-primary" data-done>${ICON.save} Save loadout</button>`);
    const text = listText(cfg, items);
    const subj = `HDD loadout: ${titleOf(cfg)}`;
    const mailHref = `mailto:?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(text)}`;
    $('#sh-sms').href = `sms:?&body=${encodeURIComponent(text)}`;
    $('#sh-mail').href = mailHref;
    $('#q-mail').href = mailHref;
    const share = async () => {
      if (navigator.share) { try { await navigator.share({ title: subj, text: listText(cfg, items, false), url: shareUrl(cfg) }); } catch {} }
      else { await copyText(text); toast('Parts list copied'); }
    };
    $('#sh-share').addEventListener('click', share);
    $('#q-share').addEventListener('click', share);
    const copyList = async () => { await copyText(text); toast('Parts list copied'); };
    $('#sh-copy').addEventListener('click', async () => { await copyText(shareUrl(cfg)); toast('Link copied'); });
    $('#q-copy').addEventListener('click', copyList);
    $('#ab-copy').addEventListener('click', copyList);
    $('#sh-print').addEventListener('click', () => window.print());
    $('#q-print').addEventListener('click', () => window.print());
    $('#sh-mode').addEventListener('click', () => { cfg.mode = cfg.mode === 'Bit' ? 'Backreamer' : 'Bit'; draw(); window.scrollTo({ top: 0 }); });
    $$('[data-done]').forEach((b) => b.addEventListener('click', () => openDoneSheet(cfg)));
    $$('[data-dq]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.dq; cfg.q[k] = quantity(quantity(cfg.q[k]) + +b.dataset.d); draw(); }));
    $$('[data-qk]').forEach((i) => i.addEventListener('change', () => { cfg.q[i.dataset.qk] = quantity(i.value); draw(); }));
  };
  draw();
}

function viewSaved() {
  setStepper(0); setActionbar('');
  const list = getSaved();
  app.innerHTML = `${pageHead('On this phone', 'Saved loadouts', 'These presets stay on this device. Crew accounts keep loadouts on each operator.')}
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
let SB = null;
const ME = { user: null, member: null, company: null, billing: null };
async function sb() {
  if (!SB) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm');
    SB = createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bdht.auth', flowType: 'pkce', detectSessionInUrl: true } });
    SB.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') setTimeout(() => { location.hash = '#/account?m=reset'; }, 0); if (ev === 'SIGNED_OUT') { ME.user = ME.member = ME.company = ME.billing = null; updateAcctNav(); } });
  }
  return SB;
}
async function refreshMe() {
  try {
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
const rigName = (mc) => mc.nickname ? mc.nickname : `${mc.brand || ''} ${mc.model}`.trim();
const rigSub = (mc) => `${mc.brand || ''} ${mc.model}`.trim();
const errMsg = (e) => (e?.message || String(e)).replace(/^.*?:\s*(?=Invite|You already|Sign in)/, '');
const ICON_RIG = '<svg viewBox="0 0 24 24"><path d="M12 3 2 8v13h4v-9h12v9h4V8zM8 14h8v2H8zm0 3h8v2H8z"/></svg>';
const ICON_MORE = '<svg viewBox="0 0 24 24"><path d="M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>';
const ICON_STAR = '<svg viewBox="0 0 24 24"><path d="M12 17.3 18.2 21l-1.6-7L22 9.2l-7.2-.6L12 2 9.2 8.6 2 9.2 7.4 14l-1.6 7z"/></svg>';
function drillOptions(sel) {
  const by = (b) => CATALOG.machines.filter((m) => m.brand === b && m.pipes.length);
  return `<option value="">Choose a drill…</option>` + ['Ditch Witch', 'Vermeer'].map((b) => `<optgroup label="${b}">${by(b).map((m) => `<option value="${m.id}" ${+sel === m.id ? 'selected' : ''}>${esc(b)} ${esc(m.model)}</option>`).join('')}</optgroup>`).join('');
}
function busy(btn, on, label) { if (!btn) return; if (on) { btn.dataset.l = btn.innerHTML; btn.innerHTML = label || 'Working…'; btn.disabled = true; } else { btn.innerHTML = btn.dataset.l || btn.innerHTML; btn.disabled = false; } }

/* sign up / sign in / finish setup */
async function viewAccount(q, isCurrent = () => true) {
  await loadCatalog(); await meReady();
  if (!isCurrent()) return;
  setStepper(0); setActionbar('');
  if (q.get('m') === 'reset' && ME.user) {
    app.innerHTML = `<div class="auth-wrap"><h1>Set a new password</h1>
      <form class="card pad stack" id="rst" novalidate style="margin-top:14px"><div id="ferr"></div>
      <label class="field"><span>New password (8+ characters)</span><input id="npw" type="password" autocomplete="new-password" minlength="8" required></label>
      <button class="btn btn-primary btn-block" id="rgo">Save password</button></form></div>`;
    $('#rst').addEventListener('submit', async (e) => {
      e.preventDefault(); const pw = $('#npw').value;
      if (pw.length < 8) { $('#ferr').innerHTML = '<div class="form-err">Use at least 8 characters.</div>'; return; }
      const c = await sb(); const { error } = await c.auth.updateUser({ password: pw });
      if (error) { $('#ferr').innerHTML = `<div class="form-err">${esc(errMsg(error))}</div>`; return; }
      toast('Password updated'); location.replace(ME.member ? '#/garage' : '#/setup');
    });
    return;
  }
  if (ME.user && ME.member) { location.replace('#/garage'); return; }
  if (ME.user) return viewSetup(isCurrent);
  const mode = q.get('m') === 'signin' ? 'signin' : 'signup';
  app.innerHTML = `<div class="auth-wrap">
    ${pageHead(mode === 'signup' ? 'New crew' : 'Returning crew', mode === 'signup' ? 'Set up your crew' : 'Welcome back', mode === 'signup' ? 'Save a named loadout for every drill your crew runs, and share those classes with the company.' : 'Sign in to open your operators and loadouts.')}
    <div class="seg" role="tablist" style="margin-bottom:14px">
      <button aria-pressed="${mode === 'signup'}" data-go="#/account">Sign up</button>
      <button aria-pressed="${mode === 'signin'}" data-go="#/account?m=signin">Sign in</button></div>
    ${mode === 'signup' ? onboardForm(true) : `<form class="card pad stack" id="fin" novalidate>
      <label class="field"><span>Email</span><input id="e" type="email" autocomplete="email" inputmode="email" required></label>
      <label class="field"><span>Password</span><input id="pw" type="password" autocomplete="current-password" required></label>
      <div class="form-err" id="err" hidden></div>
      <button class="btn btn-primary btn-block" id="go">Sign in</button>
      <button type="button" class="linkbtn" id="forgot" style="align-self:center">Forgot password?</button></form>`}
    <p class="small muted" style="margin-top:14px;text-align:center">No account needed to build and share a loadout. <a href="#/drill">Keep building as a guest</a></p></div>`;
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.go; }));
  if (mode === 'signup') return mountOnboard(true);
  const err = (m) => { const e = $('#err'); e.textContent = m; e.hidden = !m; };
  $('#fin').addEventListener('submit', async (ev) => {
    ev.preventDefault(); err('');
    const email = $('#e').value.trim(), password = $('#pw').value;
    if (!email || !password) return err('Enter your email and password.');
    busy($('#go'), true, 'Signing in…');
    const c = await sb();
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) { busy($('#go'), false); return err(error.message === 'Email not confirmed' ? 'Confirm your email first. Check your inbox for the link.' : error.message); }
    await refreshMe();
    const pend = store.get(PENDING_KEY, null);
    if (!ME.member && pend && pend.email?.toLowerCase() === email.toLowerCase()) {
      try { await runSetup(pend); } catch (e) { busy($('#go'), false); return err(errMsg(e)); }
    }
    location.hash = ME.member ? '#/garage' : '#/setup';
  });
  $('#forgot').addEventListener('click', async () => {
    const email = $('#e').value.trim(); if (!email) return err('Type your email above first.');
    const c = await sb(); const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + '#/account?m=signin' });
    error ? err(error.message) : toast('Check your email for a reset link');
  });
}
async function viewSetup(isCurrent = () => true) {
  await loadCatalog(); await meReady();
  if (!isCurrent()) return;
  setStepper(0); setActionbar('');
  if (!ME.user) { location.replace('#/account'); return; }
  if (ME.member) { location.replace('#/garage'); return; }
  app.innerHTML = `<div class="auth-wrap">${pageHead('Crew', 'Finish setting up', `Signed in as ${esc(ME.user.email)}. Add your company and the drills you run.`)}${onboardForm(false)}</div>`;
  mountOnboard(false);
}
function onboardForm(withAuth) {
  const p = store.get(PENDING_KEY, {}) || {};
  return `<form class="card pad stack" id="fon" novalidate>
    <div class="seg" id="cmode"><button type="button" data-cm="new" aria-pressed="true">New company</button><button type="button" data-cm="join" aria-pressed="false">Join my company</button></div>
    <label class="field" data-show="new"><span>Company name</span><input id="co" autocomplete="organization" maxlength="120" placeholder="e.g. Ozark Boring LLC" value="${esc(p.company || '')}"></label>
    <label class="field" data-show="join" hidden><span>Company invite code</span><input id="code" autocapitalize="characters" maxlength="12" placeholder="8-character code from your boss" style="text-transform:uppercase;font-family:ui-monospace,Menlo,monospace;letter-spacing:.12em"></label>
    <label class="field"><span>Your name</span><input id="emp" autocomplete="name" maxlength="120" placeholder="First and last name" value="${esc(p.employee || '')}"></label>
    ${withAuth ? `<label class="field"><span>Email</span><input id="e" type="email" autocomplete="email" inputmode="email"></label>
    <label class="field"><span>Password <em class="muted" style="font-style:normal;font-weight:500">(8+ characters)</em></span><input id="pw" type="password" autocomplete="new-password" minlength="8"></label>` : ''}
    <div><div class="form-sub"><b>Your operators</b><span class="small muted" id="msub">Free plan: up to ${FREE_MACHINE_LIMIT} drills. Upgrade later for unlimited at $2.99/month.</span></div>
      <div id="mlist" class="stack" style="margin-top:10px"></div>
      <button type="button" class="btn btn-ghost btn-block" id="madd" style="margin-top:10px">+ Add another operator</button></div>
    <div class="form-err" id="err" hidden></div>
    <button class="btn btn-primary btn-block" id="go">${withAuth ? 'Create account' : 'Save and continue'}</button>
  </form>`;
}
function mountOnboard(withAuth) {
  let cm = 'new';
  const rows = (store.get(PENDING_KEY, {}) || {}).machines?.length ? store.get(PENDING_KEY).machines : [{ id: '', nick: '' }];
  const draw = () => {
    $('#mlist').innerHTML = rows.map((r, i) => `<div class="mrow">
      <label class="field"><span>Drill ${i + 1}</span><select data-mi="${i}" data-k="id">${drillOptions(r.id)}</select></label>
      <label class="field"><span>Unit name / #</span><input data-mi="${i}" data-k="nick" maxlength="60" placeholder="Unit 12" value="${esc(r.nick)}"></label>
      ${rows.length > 1 ? `<button type="button" class="iconbtn" data-mrm="${i}" aria-label="Remove drill ${i + 1}">${ICON.trash}</button>` : ''}</div>`).join('');
    $$('[data-mi]').forEach((el) => el.addEventListener('input', () => { rows[+el.dataset.mi][el.dataset.k] = el.value; }));
    $$('[data-mrm]').forEach((b) => b.addEventListener('click', () => { rows.splice(+b.dataset.mrm, 1); draw(); }));
  };
  draw();
  $('#madd').addEventListener('click', () => {
    if (cm === 'new' && rows.length >= FREE_MACHINE_LIMIT) {
      err(`Free crews can add ${FREE_MACHINE_LIMIT} operators at signup. Upgrade in the garage for unlimited.`);
      return;
    }
    rows.push({ id: '', nick: '' }); draw(); $$('#mlist select').at(-1).focus();
  });
  $$('[data-cm]').forEach((b) => b.addEventListener('click', () => {
    cm = b.dataset.cm; $$('[data-cm]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    $$('[data-show]').forEach((el) => { el.hidden = el.dataset.show !== cm; });
    $('#msub').textContent = cm === 'join'
      ? 'Optional. A free company stops at 3 operators. A paid company can add more after you join.'
      : `Free plan: up to ${FREE_MACHINE_LIMIT} drills. Upgrade later for unlimited at $2.99/month.`;
  }));
  const err = (m) => { const e = $('#err'); e.textContent = m; e.hidden = !m; if (m) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  $('#fon').addEventListener('submit', async (ev) => {
    ev.preventDefault(); err('');
    const p = { mode: cm, company: $('#co').value.trim(), code: $('#code').value.trim().toUpperCase(), employee: $('#emp').value.trim(),
      machines: rows.filter((r) => r.id).map((r) => ({ id: +r.id, nick: r.nick.trim() })) };
    if (cm === 'new' && !p.company) return err('Enter your company name.');
    if (cm === 'join' && p.code.length < 6) return err('Enter the invite code from your company’s account owner.');
    if (!p.employee) return err('Enter your name.');
    if (cm === 'new' && !p.machines.length) return err('Pick at least one drill.');
    if (cm === 'new' && p.machines.length > FREE_MACHINE_LIMIT) return err(`Free crews can add ${FREE_MACHINE_LIMIT} operators. Upgrade after signup for unlimited.`);
    const go = $('#go'); busy(go, true, withAuth ? 'Creating account…' : 'Saving…');
    try {
      if (withAuth) {
        p.email = $('#e').value.trim(); const password = $('#pw').value;
        if (!/^\S+@\S+\.\S+$/.test(p.email)) throw new Error('Enter a valid email.');
        if (password.length < 8) throw new Error('Password needs at least 8 characters.');
        store.set(PENDING_KEY, p);
        const c = await sb();
        const { data, error } = await c.auth.signUp({ email: p.email, password, options: { data: { employee_name: p.employee }, emailRedirectTo: location.origin + location.pathname + '#/account?m=signin' } });
        if (error) throw error;
        if (!data.session) { busy(go, false); return viewCheckEmail(p.email); }
        await refreshMe();
      }
      await runSetup(p);
      toast(`Welcome, ${p.employee.split(' ')[0]}!`); location.hash = '#/garage';
    } catch (e) { busy(go, false); err(errMsg(e)); }
  });
}
function viewCheckEmail(email) {
  app.innerHTML = `<div class="auth-wrap"><div class="card pad stack" style="text-align:center">
    <div style="font-size:44px">✉️</div><h1>Check your email</h1>
    <p>We sent a confirmation link to <b>${esc(email)}</b>. Tap it, then sign in. Your company and drills will be set up automatically.</p>
    <a class="btn btn-primary btn-block" href="#/account?m=signin">I confirmed, sign in</a></div></div>`;
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
  if (stoppedAtLimit) toast('Free plan stops at 3 operators. Upgrade in the garage for unlimited.');
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
const loKey = (lo) => (lo.items || []).slice().reverse().find((i) => /^(Bit|Backreamer)$/i.test(i.type || '') || /^(Bit|Backreamer)\b/i.test(i.sec || ''));
function stripHtml(lo, cls = 'lo-strip') {
  const im = loImgs(lo);
  return `<div class="${cls}">${im.map((i) => imgTag(i.img, 200, 100, i.name)).join('') || '<span class="small muted">No parts yet</span>'}</div>`;
}
function guestUpsell(where) {
  return `<div class="upsell card pad stack">
    <div class="upsell-ico">${ICON_RIG}</div>
    <h2>${where === 'garage' ? 'Operators and loadouts' : 'Save it on an operator'}</h2>
    <p>Free crew account, up to ${FREE_MACHINE_LIMIT} operators. Each drill is an operator, and each saved setup is a named loadout. Unlimited operators are $2.99/month.</p>
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
    ? `Free · ${count} operators saved`
    : `Free · ${count} of ${FREE_MACHINE_LIMIT} operators`;
  let detail = 'Unlimited operators are $2.99/month.';
  if (count >= FREE_MACHINE_LIMIT) detail = 'This crew is at the free limit. Upgrade for unlimited operators, $2.99/month.';
  if (b.subscription_status === 'past_due' || b.payment_failed_at) {
    detail = 'The last invoice failed. New operators stay capped at 3 until billing is active. Existing operators stay.';
  }
  return { title, detail, paid: false };
}
function billingAlerts() {
  const b = ME.billing;
  if (!b) return '';
  const notes = [];
  if (b.open_dispute_id) notes.push('A charge on this subscription was disputed. The owner can review it in Manage billing.');
  if (b.fraud_warning_id) notes.push('The card network flagged a charge for possible fraud. Review the warning in the Stripe Dashboard.');
  if (b.last_refunded_at) notes.push(`A charge was refunded${b.last_refund_amount ? ` ($${(b.last_refund_amount / 100).toFixed(2)})` : ''}. Operator access still follows the subscription status.`);
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
async function startCheckout(btn) {
  if (ME.member?.role !== 'owner') return toast('The company owner upgrades the plan.');
  busy(btn, true, 'Opening checkout…');
  try {
    const c = await sb();
    const { data, error } = await c.functions.invoke('bdht-create-checkout', { body: {} });
    if (error) throw await functionError(error);
    if (!data?.url) throw new Error('Checkout did not return a link.');
    location.href = data.url;
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
    if (!data?.url) throw new Error('Billing portal did not return a link.');
    location.href = data.url;
  } catch (e) { busy(btn, false); toast(errMsg(e)); }
}
function wirePlanActions(root = document) {
  $('#upgrade', root)?.addEventListener('click', (ev) => startCheckout(ev.currentTarget));
  $('#portal', root)?.addEventListener('click', (ev) => startPortal(ev.currentTarget));
}
function upgradeSheet() {
  const owner = ME.member?.role === 'owner';
  openSheet(`<div class="sheet-top"><div><div class="small muted">Unlimited operators</div><h2>$2.99/month</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body stack">
      <p>Free crews save up to ${FREE_MACHINE_LIMIT} operators. Unlimited removes that cap for the whole company. Checkout is on Stripe. This page does not unlock the plan by itself.</p>
      ${owner ? '' : '<p class="small muted">Ask the company owner to upgrade. Members can keep using the operators already saved.</p>'}
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
    app.innerHTML = `${pageHead('Class select', 'My rigs', 'Each drill is an operator. Each saved setup is a named loadout. Sign in to keep the class on that drill.')}
      ${unsavedOpen ? `<div class="note" style="margin-bottom:12px"><span><b>${esc(unsaved.title || 'This loadout')} is not in My rigs yet.</b> Sign in and it is saved on the drill. <button class="linkbtn" id="stash-in" type="button">Sign in and save</button></span></div>` : ''}
      ${phone.length ? `<div class="section-head"><h2>On this phone</h2><a class="linkbtn" href="#/saved">See all</a></div><div class="lo-grid">${phone.slice(0, 4).map((s) => savedRow(s)).join('')}</div>` : ''}
      <div class="rig-grid" style="margin-top:12px"><a class="rig-card rig-locked" href="#/account">
        <div class="rig-top"><div><div class="t-brand">Operator</div><div class="rig-name">Your drills</div></div><span class="pill">Locked</span></div>
        <p class="small muted" style="margin:0">Crew loadouts show up here after you sign in.</p>
        <div class="rig-foot"><span>Sign in to open My rigs</span>${ICON.chev}</div>
      </a></div>
      ${guestUpsell('garage')}`;
    const stashAccount = () => { if (unsavedOpen && unsaved?.cfg) stashPendingSave(unsaved.cfg, unsaved.title); };
    $('#stash-in')?.addEventListener('click', () => { stashAccount(); goHash('#/account?m=signin'); });
    $$('a[href="#/account"], a[href="#/account?m=signin"]').forEach((a) => a.addEventListener('click', stashAccount));
    return;
  }
  if (!ME.member) { location.replace('#/setup'); return; }
  let finish = null;
  try { finish = await consumePendingSave(); } catch (e) { toast(errMsg(e)); }
  if (!isCurrent()) return;
  if (billingFlag === 'success' && !isEntitled()) {
    toast('Checkout finished. Unlimited operators turn on when Stripe confirms the subscription.');
    for (let i = 0; i < 3 && !isEntitled(); i++) {
      await new Promise((r) => setTimeout(r, 2000));
      await refreshMe();
      if (!isCurrent()) return;
    }
    if (isEntitled()) toast('Unlimited operators are on.');
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
    <div class="section-head"><h2>Operators · ${count}</h2><button class="linkbtn" id="addm">${atLimit ? 'Upgrade for unlimited' : '+ Add operator'}</button></div>
    <div class="rig-grid">${fleet.machines.map((mc) => {
      const los = byM(mc.id), def = los.find((l) => l.is_default) || los[0];
      return `<a class="rig-card" href="#/rig/${mc.id}">
        <div class="rig-top"><div><div class="t-brand">Operator · ${esc(mc.brand || '')} ${esc(mc.model)}</div><div class="rig-name">${esc(rigName(mc))}</div></div>
          <span class="pill ${los.length ? 'pill-orange' : ''}">${los.length} loadout${los.length === 1 ? '' : 's'}</span></div>
        ${stripHtml(def)}
        <ul class="lo-name-list">${los.map((lo) => `<li><b>${lo.is_default ? '★ ' : ''}${esc(lo.name)}</b><span>${lo.mode === 'Bit' ? 'Pilot' : 'Pullback'} · ${lo.part_count}</span></li>`).join('') || '<li class="muted">No loadouts yet</li>'}</ul>
        <div class="rig-foot">${def ? `<span><b>${los.length} loadout${los.length === 1 ? '' : 's'}</b></span>` : '<span class="muted">No loadouts yet. Tap to build a class.</span>'}${ICON.chev}</div></a>`;
    }).join('') || `<div class="card empty"><h2>No operators yet</h2><p>Add a drill to start a class.</p><button class="btn btn-primary" id="addm2">+ Add operator</button></div>`}</div>
    ${finish?.pending ? `<div class="note" style="margin-top:12px"><span><b>Finish saving “${esc(finish.pending.name)}”.</b> Pick the operator.
      <span class="chips" style="margin-top:8px">${finish.machines.map((mc) => `<button type="button" class="chip" data-finish="${mc.id}">${esc(rigName(mc))}</button>`).join('')}</span></span></div>` : ''}`;
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
  openSheet(`<div class="sheet-top"><h2>Add an operator</h2><button class="iconbtn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body stack">
      <label class="field"><span>Drill</span><select id="am">${drillOptions(prefill)}</select></label>
      <label class="field"><span>Unit name / number (optional)</span><input id="an" maxlength="60" placeholder="Unit 12, Big Red, #4471…"></label>
      <div class="form-err" id="aerr" hidden></div></div>
    <div class="sheet-foot"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" style="flex:1" id="ago">Add operator</button></div>`, (sh) => {
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
      closeSheet(); toast('Operator added'); location.hash = `#/rig/${data.id}`;
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
    $('#out', sh).addEventListener('click', async () => { await c.auth.signOut(); ME.user = ME.member = ME.company = ME.billing = null; loCtx.set(null); sessionStorage.removeItem(GARAGE_FP_KEY); updateAcctNav(); closeSheet(); toast('Signed out'); goHash('#/'); });
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
    <a class="linkbtn" href="#/garage" style="padding-left:0">‹ All operators</a>
    <div class="rig-hero">
      <div style="min-width:0"><div class="t-brand">Operator · ${esc(rigSub(mc))}</div><h1>${esc(rigName(mc))}</h1>
        <div class="small muted">${los.length} loadout${los.length === 1 ? '' : 's'} · ${esc(ME.company.name)}</div></div>
      <button class="iconbtn dark" id="mmenu" aria-label="Operator options">${ICON_MORE}</button></div>
    <button class="btn btn-primary btn-block" id="newlo" style="margin:14px 0 4px" ${cat?.pipes.length ? '' : 'disabled'}>+ New loadout</button>
    <div class="section-head"><h2>Loadouts</h2><span class="small muted">Named presets. ⋯ renames, copies, or sets primary</span></div>
    <div class="lo-grid">${los.map((lo) => {
      const pipe = pipeOf(cat, lo.pipe_id), key = loKey(lo);
      return `<article class="lo-card ${lo.is_default ? 'is-default' : ''}">
        <div class="lo-top"><div style="min-width:0"><div class="lo-name">${esc(lo.name)}${lo.is_default ? `<span class="pill pill-dark">${ICON_STAR}Primary</span>` : ''}</div>
          <div class="small muted">${esc(pipe?.name || 'Pipe')} · ${lo.mode === 'Bit' ? 'Pilot' : 'Pullback'} · ${lo.part_count} equipped</div></div>
          <button class="iconbtn" data-lomenu="${lo.id}" aria-label="Options for ${esc(lo.name)}">${ICON_MORE}</button></div>
        ${stripHtml(lo)}
        ${key ? `<div class="lo-key"><span>${lo.mode === 'Bit' ? 'Bit' : 'Reamer'}</span><b>${esc(key.name)}</b>${key.pn ? `<code>#${esc(key.pn)}</code>` : ''}</div>` : ''}
        <div class="lo-actions"><button class="btn btn-outline" data-loedit="${lo.id}">Edit</button><a class="btn btn-primary" href="#/summary?c=${b64e(lo.config)}">Open brief</a></div>
      </article>`;
    }).join('') || `<div class="card empty"><h2>No loadouts yet</h2><p>Build one: lock the pipe, then equip each slot from the rig out to the bit.</p></div>`}</div>`;
  const ctxFor = (lo) => ({ machine: { id: mc.id, machine_type_id: mc.machine_type_id, model: mc.model, brand: mc.brand, nickname: mc.nickname }, loadout: lo ? { id: lo.id, name: lo.name } : null });
  $('#newlo').addEventListener('click', () => { loCtx.set(ctxFor(null)); location.hash = `#/pipe/${mc.machine_type_id}`; });
  $$('[data-loedit]').forEach((b) => b.addEventListener('click', () => { const lo = los.find((x) => x.id === b.dataset.loedit); loCtx.set(ctxFor(lo)); location.hash = `#/build?c=${b64e(lo.config)}`; }));
  $$('[data-lomenu]').forEach((b) => b.addEventListener('click', () => loMenu(los.find((x) => x.id === b.dataset.lomenu), mc, los)));
  $('#mmenu').addEventListener('click', () => machineMenu(mc, los.length));
}
function loMenu(lo, mc, los) {
  openSheet(`<div class="sheet-top"><div><div class="small muted">${esc(rigName(mc))}</div><h2>${esc(lo.name)}</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>
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
    $('#lrn', sh).addEventListener('click', async () => { const name = $('#lr', sh).value.trim(); if (!name) return; const { error } = await c.from('bdht_loadouts').update({ name, updated_at: new Date().toISOString() }).eq('id', lo.id); error ? fail(error) : done('Renamed'); });
    $('#ldef', sh).addEventListener('click', async () => { const { error } = await c.rpc('bdht_set_default_loadout', { p_loadout: lo.id }); error ? fail(error) : done(`${lo.name} is now primary`); });
    $('#ldup', sh).addEventListener('click', async () => {
      let name = `${lo.name} copy`, n = 2; while (los.some((x) => x.name === name)) name = `${lo.name} copy ${n++}`;
      const { id, created_at, updated_at, is_default, created_by, ...rest } = lo;
      const { error } = await c.from('bdht_loadouts').insert({ ...rest, name: name.slice(0, 60), is_default: false }); error ? fail(error) : done('Duplicated');
    });
    $('#lshare', sh).addEventListener('click', async () => {
      const url = shareUrl(lo.config), title = `${lo.name} · ${rigName(mc)}`;
      if (navigator.share) { try { await navigator.share({ title, text: `${title} loadout (The Better Down Hole Tool)`, url }); } catch {} } else { await copyText(url); toast('Link copied'); }
    });
    $('#ldel', sh).addEventListener('click', async () => { if (!confirm(`Delete “${lo.name}”?`)) return; const { error } = await c.from('bdht_loadouts').delete().eq('id', lo.id); error ? fail(error) : done('Deleted'); });
  });
}
function machineMenu(mc, nLo) {
  openSheet(`<div class="sheet-top"><div><div class="small muted">${esc(rigSub(mc))}</div><h2>${esc(rigName(mc))}</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body stack">
      <label class="field"><span>Unit name / number</span><input id="mn" value="${esc(mc.nickname || '')}" maxlength="60" placeholder="Unit 12"></label>
      <button class="btn btn-ghost btn-block" id="mns">Save name</button>
      <button class="btn btn-ghost btn-block danger" id="mdel">${ICON.trash} Remove operator${nLo ? ` and its ${nLo} loadout${nLo > 1 ? 's' : ''}` : ''}</button></div>`, async (sh) => {
    const c = await sb();
    $('#mns', sh).addEventListener('click', async () => { const { error } = await c.from('bdht_machines').update({ nickname: $('#mn', sh).value.trim() || null }).eq('id', mc.id); closeSheet(); toast(error ? error.message : 'Saved'); setTimeout(route, 240); });
    $('#mdel', sh).addEventListener('click', async () => { if (!confirm(`Remove ${rigName(mc)}${nLo ? ' and its loadouts' : ''}?`)) return; const { error } = await c.from('bdht_machines').delete().eq('id', mc.id); closeSheet(); toast(error ? error.message : 'Operator removed'); if (!error) location.hash = '#/garage'; });
  });
}

/* loadout editor hooks used by the pipe + build steps */
function loBanner(ctx, label) {
  return `<div class="lo-banner"><div style="min-width:0"><small>${label}</small><b>${esc(ctx.loadout?.name || 'New loadout')}</b><span> · ${esc(rigName(ctx.machine))}</span></div>
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
  openSheet(`<div class="sheet-top"><div><div class="small muted">${esc(rigName(ctx.machine))}</div><h2>${ctx.loadout ? 'Save loadout' : 'Save new loadout'}</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>
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
async function saveLoadout(cfg, machineId, id, name) {
  const rm = await loadRoadmap(cfg.r), items = lineItems(rm, cfg, compute(rm, cfg)), c = await sb();
  const payload = { company_id: ME.company.id, machine_id: machineId, name: name.slice(0, 60), pipe_id: cfg.p, roadmap_id: cfg.r, mode: cfg.mode,
    config: JSON.parse(JSON.stringify(cfg)), part_count: items.length, updated_at: new Date().toISOString(),
    items: items.map((l) => ({ sec: l.sec, type: l.part.type || null, name: l.part.name, pn: l.part.pn || null, img: l.part.img || null, qty: l.qty, acc: !!l.acc })) };
  if (!id) { const { count } = await c.from('bdht_loadouts').select('id', { count: 'exact', head: true }).eq('machine_id', machineId); payload.is_default = !count; }
  const { data, error } = await (id ? c.from('bdht_loadouts').update(payload).eq('id', id) : c.from('bdht_loadouts').insert(payload)).select().single();
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
  const addLabel = atLimit ? 'Upgrade for another operator' : `+ Add a ${mm?.model || 'drill'}`;
  box.innerHTML = `<div class="form-sub"><b>Save on an operator</b><span class="small muted">Shared with ${esc(ME.company.name)}</span></div>
    <div class="stack" style="margin-top:8px">${(data || []).map((mc) => `<button class="choice" data-rig="${mc.id}"><div class="pipe-ico">${ICON_RIG}</div><div class="c-main"><div class="c-title">${esc(rigName(mc))}</div><div class="c-sub">${esc(rigSub(mc))}</div></div>${ICON.chev}</button>`).join('') ||
      `<p class="small muted">No ${esc(mm?.model || '')} in your operators yet.</p><button class="btn ${atLimit ? 'btn-primary' : 'btn-ghost'} btn-block" id="addthis">${esc(addLabel)}</button>`}</div>`;
  $$('[data-rig]', box).forEach((b) => b.addEventListener('click', () => {
    const mc = data.find((x) => x.id === b.dataset.rig);
    closeSheet(); setTimeout(() => loSaveSheet(cfg, { machine: mc, loadout: null }), 230);
  }));
  $('#addthis', box)?.addEventListener('click', () => { closeSheet(); setTimeout(() => requestAddOperator(counted.count || 0, cfg.m), 230); });
}

/* ---------- router ---------- */
let routeId = 0;
async function route() {
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
loadCatalog().catch(() => {});
lastPath = location.hash.split('?')[0];
route();
// account state loads in the background; guests never wait on it
meReady().then(() => { const h = location.hash.split('?')[0]; if (h === '' || h === '#/' || h === '#') viewHome(); });
