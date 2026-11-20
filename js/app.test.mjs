import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { normalizeConfig, quantity } from './config.mjs';
import { compute, lineItems, isLoadoutReady } from './compatibility.mjs';
import * as radius from './radius.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const catalog = JSON.parse(read('../data/catalog.json'));
const roadmap = JSON.parse(read('../data/roadmaps/5427.json'));
const base = { m: roadmap.machine, p: roadmap.pipe, r: roadmap.id, mode: 'Backreamer', sel: {}, acc: {}, q: {} };

function appContext() {
  const nodes = new Map();
  const element = (key) => {
    if (!nodes.has(key)) nodes.set(key, {
      hidden: true, innerHTML: '', dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, setAttribute() {},
      querySelector: element, querySelectorAll: () => [],
    });
    return nodes.get(key);
  };
  const storage = { getItem: () => null, setItem() {}, removeItem() {} };
  const location = { origin: 'https://test.invalid', pathname: '/', hash: '#/' };
  const ctx = vm.createContext({
    console, URLSearchParams, btoa, atob, escape, unescape, encodeURIComponent, decodeURIComponent,
    setTimeout, clearTimeout, requestAnimationFrame: (fn) => fn(), normalizeConfig, quantity, compute, lineItems, isLoadoutReady,
    ...radius,
    FREE_MACHINE_LIMIT: 3, canAddMachine: (count, paid) => paid || count < 3,
    localStorage: storage, sessionStorage: storage, navigator: {}, location,
    document: { querySelector: element, querySelectorAll: () => [], addEventListener() {}, body: { style: {}, dataset: {} } },
    window: { addEventListener() {}, scrollTo() {} },
    history: { replaceState(_state, _title, url) { location.hash = url.slice(url.indexOf('#')); } },
  });
  const source = read('./app.js').replace(/^import .*;\r?\n/gm, '');
  vm.runInContext(source.slice(0, source.lastIndexOf('\nupdateSavedBadge();')), ctx);
  ctx.catalog = catalog;
  ctx.roadmap = roadmap;
  vm.runInContext('CATALOG = catalog; RM_CACHE.set(roadmap.id, roadmap);', ctx);
  return { ctx, element, location };
}

test('shared configuration rejects invalid shapes and normalizes quantities and selections', () => {
  const attack = '\"><img src=x onerror="globalThis.attacked=1">';
  const cfg = normalizeConfig({ ...base, sel: { 1: ['42', 42, null], 2: 'invalid' }, q: { '22631.1519': attack } });
  assert.deepEqual(cfg.sel, { 1: [42] });
  assert.equal(cfg.q['22631.1519'], 1);
  for (const invalid of [null, [], { ...base, r: '../index' }, { ...base, mode: 'invalid' }]) {
    assert.equal(normalizeConfig(invalid), null);
  }
  assert.equal(quantity('9999999999'), 9999);
  assert.equal(quantity(Infinity), 1);
  assert.equal(quantity(0), 0);
  assert.equal(quantity({}), 1);
});

test('summary cannot render HTML from URL quantities and includes printable quantities', async () => {
  const { ctx, element } = appContext();
  ctx.cfg = { ...base, q: { '22631.1519': '\"><img src=x onerror="globalThis.attacked=1">' } };
  await vm.runInContext('viewSummary(new URLSearchParams({ c: b64e(cfg) }))', ctx);
  assert.doesNotMatch(element('#app').innerHTML, /onerror="globalThis\.attacked/);
  assert.match(element('#app').innerHTML, /class="print-qty">Qty: 1/);
  assert.doesNotMatch(element('#actionbar').innerHTML, /class ready/);
});

test('every roadmap references existing parts; incomplete end tools never count as ready', () => {
  let runs = 0, blocked = 0;
  for (const file of readdirSync(new URL('../data/roadmaps/', import.meta.url))) {
    const rm = JSON.parse(read(`../data/roadmaps/${file}`));
    for (const section of rm.sections) for (const option of section.opts) {
      for (const id of [option.id, ...(option.acc || [])]) assert.ok(rm.parts[id], `${file}: missing ${id}`);
    }
    for (const mode of ['Bit', 'Backreamer']) {
      const cfg = { ...base, mode, sel: {}, acc: {}, q: {} };
      let rows;
      for (let i = 0; i <= rm.sections.length; i++) {
        rows = compute(rm, cfg);
        const pending = rows.find((r) => r.status === 'pending');
        if (!pending) break;
        cfg.sel[pending.sec.id] = [pending.cands[0].id];
      }
      if (!rows.at(-1).sel.length) {
        blocked++;
        assert.equal(isLoadoutReady(rows), false, `${file}/${mode}`);
        assert.equal(rows.at(-1).status, 'blocked', `${file}/${mode}`);
      } else assert.equal(isLoadoutReady(rows), true, `${file}/${mode}`);
      runs++;
    }
  }
  assert.equal(runs, 272);
  assert.equal(blocked, 12); // 6088/Bit unblocked by tools/fix_catalog.mjs (tricone + 3.25SS pipe box)
  assert.equal(isLoadoutReady([]), false);
});

test('a slow builder response cannot overwrite a newer builder or another page', async () => {
  const { ctx, location, element } = appContext();
  ctx.cfg = base;
  vm.runInContext(`
    const waits = [], rendered = [];
    loadRoadmap = () => new Promise((resolve) => waits.push(resolve));
    renderBuild = (rm) => rendered.push({ roadmap: rm.id, config: buildCfg.r });
  `, ctx);
  location.hash = `#/build?c=${Buffer.from(JSON.stringify(base)).toString('base64url')}`;
  const first = vm.runInContext('route()', ctx);
  await new Promise(setImmediate);
  const second = vm.runInContext('route()', ctx);
  await new Promise(setImmediate);
  vm.runInContext('waits[1](roadmap)', ctx);
  await second;
  vm.runInContext('waits[0](roadmap)', ctx);
  await first;
  assert.equal(vm.runInContext('rendered.length', ctx), 1);
  const third = vm.runInContext('route()', ctx);
  await new Promise(setImmediate);
  location.hash = '#/saved';
  await vm.runInContext('route()', ctx);
  vm.runInContext('waits[2](roadmap)', ctx);
  await third;
  assert.equal(vm.runInContext('rendered.length', ctx), 1);
  assert.match(element('#app').innerHTML, /Saved loadouts/);
});

test('stripHtml and imgTag block stored XSS from untrusted loadout image IDs and emit no inline onerror', () => {
  const { ctx } = appContext();
  ctx.maliciousLoadout = {
    items: [
      { img: '1" onerror="globalThis.xss=1" data-x="', name: 'Evil Part' },
      { img: '<script>alert(1)</script>', name: 'Script Part' },
      { img: 8113, name: 'Valid Pipe' },
    ],
  };
  const html = vm.runInContext('stripHtml(maliciousLoadout)', ctx);
  assert.doesNotMatch(html, /onerror=/i);
  assert.doesNotMatch(html, /globalThis\.xss/);
  assert.doesNotMatch(html, /<script>/i);
  assert.match(html, /src="img\/parts\/8113\.png"/);
});

test('part documentation URLs reject javascript/data schemes and Stripe redirects require https *.stripe.com', () => {
  const { ctx, element } = appContext();
  ctx.rmWithDocs = {
    ...roadmap,
    parts: {
      ...roadmap.parts,
      1519: {
        ...roadmap.parts[1519],
        docs: [
          { name: 'XSS JS', url: 'javascript:alert(1)' },
          { name: 'XSS Data', url: 'data:text/html,<script>alert(1)</script>' },
          { name: 'Spec Sheet', url: 'https://www.ditchwitch.com/spec.pdf' },
        ],
      },
    },
  };
  vm.runInContext('showPart(rmWithDocs, 1519, false)', ctx);
  const sheetHtml = element('#sheet').innerHTML;
  assert.doesNotMatch(sheetHtml, /javascript:/i);
  assert.doesNotMatch(sheetHtml, /data:text\/html/i);
  assert.match(sheetHtml, /href="https:\/\/www\.ditchwitch\.com\/spec\.pdf"/);
  assert.match(sheetHtml, /rel="noopener noreferrer"/);

  assert.equal(vm.runInContext('safeStripeUrl("javascript:alert(1)")', ctx), null);
  assert.equal(vm.runInContext('safeStripeUrl("https://evil.example/checkout.stripe.com")', ctx), null);
  assert.equal(vm.runInContext('safeStripeUrl("http://checkout.stripe.com/c/pay/cs_123")', ctx), null);
  assert.equal(
    vm.runInContext('safeStripeUrl("https://checkout.stripe.com/c/pay/cs_test_123")', ctx),
    'https://checkout.stripe.com/c/pay/cs_test_123',
  );
  assert.equal(
    vm.runInContext('safeStripeUrl("https://billing.stripe.com/p/session/test_123")', ctx),
    'https://billing.stripe.com/p/session/test_123',
  );
});

test('b64d rejects oversized payloads to prevent client DoS', () => {
  const { ctx } = appContext();
  ctx.huge = 'A'.repeat(20000);
  assert.equal(vm.runInContext('b64d(huge)', ctx), null);
});

test('Radius alternates render escaped beside Ditch Witch options, respect the toggle and reach the parts list', async () => {
  const { ctx, element } = appContext();
  ctx.rParts = { parts: {
    'RAD-CN': { pn: 'RAD-CN', name: 'Radius Connector', type: 'Connector', machines: ['Vermeer D60X90'], url: 'https://www.radiushdd.com/p/cn', img: 'https://www.radiushdd.com/i/cn.jpg' },
    'RAD-EVIL': { pn: 'RAD-EVIL', name: '<img src=x onerror="globalThis.xss=1">', type: 'Connector', machines: ['Vermeer D60X90'], url: 'javascript:alert(1)', img: 'https://evil.example/x.png' },
  } };
  ctx.rXref = { byDwPn: { '908-5184': [{ pn: 'RAD-CN', match: 'direct' }] } };
  ctx.cfg = { ...base, mode: 'Bit' };
  vm.runInContext('RADIUS = normalizeRadius(rParts, rXref); RADIUS_P = Promise.resolve(RADIUS); buildCfg = normalizeConfig(cfg); renderBuild(roadmap);', ctx);
  let html = element('#app').innerHTML;
  assert.match(html, /id="other-brands" checked/);
  assert.match(html, /class="alts"[^>]*>[\s\S]*RAD-CN/);
  assert.match(html, /href="https:\/\/www\.radiushdd\.com\/p\/cn" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /<details class="others">[\s\S]*RAD-EVIL/, 'unlinked same-type part shows under Other brands');
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /javascript:|evil\.example/);

  vm.runInContext('toggleAlt(buildCfg, "22632", "RAD-CN"); renderBuild(roadmap);', ctx);
  html = element('#app').innerHTML;
  assert.match(html, /aria-pressed="true">On list/);
  assert.match(html, /mini-list[\s\S]*brand-chip">Radius<\/span> Radius Connector/);

  ctx.cfg = vm.runInContext('buildCfg', ctx);
  await vm.runInContext('viewSummary(new URLSearchParams({ c: b64e(cfg) }))', ctx);
  assert.match(element('#app').innerHTML, /alt-line[\s\S]*Radius Connector[\s\S]*data-qk="22632\.RRAD-CN"/);
  assert.match(vm.runInContext('listText(buildCfg, [...lineItems(roadmap, buildCfg, compute(roadmap, buildCfg)), ...altLineItems(RADIUS, buildCfg, compute(roadmap, buildCfg))], false)', ctx),
    /Radius Radius Connector: PN RAD-CN, qty 1 \(alternate\)/);

  vm.runInContext('localStorage.getItem = (k) => (k === OTHER_BRANDS_KEY ? "false" : null); renderBuild(roadmap);', ctx);
  html = element('#app').innerHTML;
  assert.match(html, /id="other-brands" >/);
  assert.doesNotMatch(html, /alt-part|class="others"/);
});

test('image fallback chain tries local, remote, then the Radius photo, then the placeholder', () => {
  const { ctx } = appContext();
  vm.runInContext('RADIUS = normalizeRadius({ parts: { R1: { pn: "R1", name: "R", type: "Bit", img: "https://cdn11.bigcommerce.com/s-uwymjpsd0i/i/r1.jpg" } } }, { byDwPn: { "906-5026": [{ pn: "R1" }] } }, { images: true });', ctx);
  const tag = vm.runInContext('imgTag(460, 240, 120, "Bit", "", dwFallback({ pn: "906-5026" }))', ctx);
  assert.match(tag, /src="img\/parts\/460\.png"/);
  assert.match(tag, /data-altimg="https:\/\/cdn11\.bigcommerce\.com\/s-uwymjpsd0i\/i\/r1\.jpg"/);
  assert.match(vm.runInContext('imgTag(null, 240, 120, "Bit", "", dwFallback({ pn: "906-5026" }))', ctx), /^<img src="https:\/\/cdn11\.bigcommerce\.com\/s-uwymjpsd0i\/i\/r1\.jpg"/);
  assert.match(vm.runInContext('imgTag(null, 240, 120, "Bit", "", dwFallback({ pn: "nope" }))', ctx), /placeholder\.svg/);
  ctx.el = { src: 'img/parts/460.png', dataset: { remote: 'https://www.hddadvisor.com/x', altimg: 'https://cdn11.bigcommerce.com/s-uwymjpsd0i/i/r1.jpg' } };
  const seen = [];
  for (let i = 0; i < 3; i++) { vm.runInContext('window.imgFallback(el)', ctx); seen.push(ctx.el.src); }
  assert.deepEqual(seen, ['https://www.hddadvisor.com/x', 'https://cdn11.bigcommerce.com/s-uwymjpsd0i/i/r1.jpg', 'img/placeholder.svg']);
});
