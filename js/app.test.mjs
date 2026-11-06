import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { normalizeConfig, quantity } from './config.mjs';
import { compute, lineItems, isLoadoutReady } from './compatibility.mjs';

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
    setTimeout, clearTimeout, normalizeConfig, quantity, compute, lineItems, isLoadoutReady,
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
  assert.equal(blocked, 13);
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
