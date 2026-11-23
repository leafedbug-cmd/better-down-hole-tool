import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { normalizeConfig, quantity } from './config.mjs';
import { compute, lineItems, isLoadoutReady } from './compatibility.mjs';
import { friendlyAuthError } from './signup-errors.mjs';
import * as radius from './radius.mjs';
import * as suppliers from './suppliers.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const catalog = JSON.parse(read('../data/catalog.json'));
const roadmap = JSON.parse(read('../data/roadmaps/5427.json'));
const base = { m: roadmap.machine, p: roadmap.pipe, r: roadmap.id, mode: 'Backreamer', sel: {}, acc: {}, q: {} };

function appContext() {
  const nodes = new Map();
  const element = (key) => {
    if (!nodes.has(key)) nodes.set(key, {
      hidden: true, innerHTML: '', dataset: {}, listeners: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(name, fn) { this.listeners[name] = fn; }, setAttribute() {},
      querySelector: element, querySelectorAll: () => [],
    });
    return nodes.get(key);
  };
  const storage = () => {
    const items = new Map();
    return { getItem: (key) => items.get(key) ?? null, setItem: (key, val) => items.set(key, String(val)), removeItem: (key) => items.delete(key) };
  };
  let url = new URL('https://test.invalid/#/');
  const location = {
    get origin() { return url.origin; }, get pathname() { return url.pathname; },
    get href() { return url.href; }, get hash() { return url.hash; },
    set hash(value) { url.hash = value; },
    replace(value) { url = new URL(value, url); },
  };
  const ctx = vm.createContext({
    console, URL, URLSearchParams, btoa, atob, escape, unescape, encodeURIComponent, decodeURIComponent,
    setTimeout, clearTimeout, requestAnimationFrame: (fn) => fn(), normalizeConfig, quantity, compute, lineItems, isLoadoutReady,
    friendlyAuthError, ...radius, ...suppliers,
    FREE_MACHINE_LIMIT: 3, canAddMachine: (count, paid) => paid || count < 3,
    localStorage: storage(), sessionStorage: storage(), navigator: {}, location,
    document: { querySelector: element, querySelectorAll: () => [], addEventListener() {}, body: { style: {}, dataset: {} } },
    window: { addEventListener() {}, scrollTo() {} },
    history: { replaceState(_state, _title, value) { location.replace(value); } },
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
  assert.match(element('#app').innerHTML, /INCOMPLETE DRAFT/);
  assert.doesNotMatch(element('#app').innerHTML, /id="(?:sh-share|sh-copy|q-copy|q-share|q-mail)"/);
  assert.doesNotMatch(element('#actionbar').innerHTML, /class ready/);
});

test('blocked summary offers editing and saving a draft', async () => {
  const { ctx, element } = appContext();
  ctx.cfg = base;
  ctx.blockedRoadmap = structuredClone(roadmap);
  ctx.blockedRoadmap.sections.find((s) => s.name === 'Backreamer').opts = [];
  await vm.runInContext('RM_CACHE.set(roadmap.id, blockedRoadmap); viewSummary(new URLSearchParams({ c: b64e(cfg) }))', ctx);
  const html = element('#app').innerHTML;
  assert.match(html, /INCOMPLETE DRAFT/);
  assert.match(html, /Needs changes in Backreamer/);
  assert.match(html, /Save draft/);
  assert.doesNotMatch(html, /id="(?:sh-share|sh-copy|sh-mail|sh-sms|q-share|q-mail|q-copy)"/);
  assert.doesNotMatch(element('#stepper').innerHTML, /Confirm/);
});

test('all 272 catalog roadmap modes reach a terminal tool while keeping their exact pipe', () => {
  let runs = 0;
  for (const file of readdirSync(new URL('../data/roadmaps/', import.meta.url))) {
    const rm = JSON.parse(read(`../data/roadmaps/${file}`));
    for (const section of rm.sections) for (const option of section.opts) {
      for (const id of [option.id, ...(option.acc || [])]) assert.ok(rm.parts[id], `${file}: missing ${id}`);
    }
    for (const mode of ['Bit', 'Backreamer']) {
      const cfg = { ...base, m: rm.machine, p: rm.pipe, r: rm.id, mode, sel: {}, acc: {}, q: {} };
      let rows;
      for (let i = 0; i <= rm.sections.length; i++) {
        rows = compute(rm, cfg);
        const pending = rows.find((r) => r.status === 'pending');
        if (!pending) break;
        cfg.sel[pending.sec.id] = [pending.cands[0].id];
      }
      assert.equal(isLoadoutReady(rows), true, `${file}/${mode}`);
      const slot = rows.find((r) => r.sec.name === 'Drill Pipe');
      const catalogPipe = catalog.machines.find((m) => m.id === rm.machine).pipes.find((p) => p.roadmap === rm.id);
      assert.deepEqual(slot.sel, [catalogPipe.id], `${file}/${mode}`);
      assert.equal(rm.parts[slot.sel[0]].pn, catalogPipe.pn);
      runs++;
    }
  }
  assert.equal(runs, 272);
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
      { img: 6890, name: 'Valid Connector' },
    ],
  };
  const html = vm.runInContext('stripHtml(maliciousLoadout)', ctx);
  assert.doesNotMatch(html, /onerror=/i);
  assert.doesNotMatch(html, /globalThis\.xss/);
  assert.doesNotMatch(html, /<script>/i);
  assert.match(html, /src="img\/parts\/6890\.png"/);
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
    'RAD-EVIL': { pn: 'RAD-EVIL', name: '<img src=x onerror="globalThis.xss=1">', type: 'Connector', conn: { l: '#900 F' }, machines: ['Vermeer D60X90'], url: 'javascript:alert(1)', img: 'https://evil.example/x.png' },
  } };
  ctx.rXref = { byDwPn: { '908-5184': [{ pn: 'RAD-CN', match: 'direct' }] } };
  ctx.cfg = { ...base, mode: 'Bit' };
  vm.runInContext('RADIUS = normalizeRadius(rParts, rXref); RADIUS_P = Promise.resolve(RADIUS); buildCfg = normalizeConfig(cfg); renderBuild(roadmap);', ctx);
  let html = element('#app').innerHTML;
  assert.match(html, /id="other-brands" checked/);
  assert.match(html, /class="alts"[^>]*>[\s\S]*RAD-CN/);
  assert.match(html, /href="https:\/\/www\.radiushdd\.com\/p\/cn" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /<details class="others" data-brand-theme="radius">[\s\S]*RAD-EVIL/, 'unlinked same-type part shows under Other brands');
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /javascript:|evil\.example/);

  vm.runInContext('toggleAlt(buildCfg, "22632", "RAD-CN"); renderBuild(roadmap);', ctx);
  html = element('#app').innerHTML;
  assert.match(html, /aria-pressed="true">On list/);
  assert.match(html, /Equip a Ditch Witch part in this slot to unlock the next one/);
  assert.match(html, /mini-list[\s\S]*brand-chip" data-brand-theme="radius">Radius<\/span> Radius Connector/);

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

test('brand themes follow the rig and each part independently across the builder and summary', async () => {
  const { ctx, element } = appContext();
  ctx.mixed = structuredClone(roadmap);
  const supplierPart = ctx.mixed.parts[1366];
  Object.assign(supplierPart, { brand: 'Melfred Borzall', brandId: 'melfred-borzall', supplier: true });
  ctx.cfg = { ...base, mode: 'Bit', sel: { 22632: [1366] } };
  vm.runInContext('RM_CACHE.set(mixed.id, mixed); buildCfg = cfg; renderBuild(mixed);', ctx);
  assert.equal(element('#stepper').dataset.brandTheme, 'vermeer');
  assert.match(element('#app').innerHTML, /brand-chip" data-brand-theme="ditch-witch">Ditch Witch/);
  assert.match(element('#app').innerHTML, /brand-chip" data-brand-theme="melfred-borzall">Melfred Borzall/);
  assert.match(element('#app').innerHTML, /slot-filled" data-brand-theme="melfred-borzall"/);
  vm.runInContext('showPart(mixed, 1366, false);', ctx);
  assert.match(element('#sheet').innerHTML, /sheet-top" data-brand-theme="melfred-borzall"/);
  await vm.runInContext('viewSummary(new URLSearchParams({ c: b64e(cfg) }));', ctx);
  assert.equal(element('#app').dataset.brandTheme, 'vermeer');
  assert.match(element('#app').innerHTML, /class="line [^"]*" data-brand-theme="melfred-borzall"/);
  assert.match(vm.runInContext('savedRow({ cfg, title: "Pilot draft", ts: 0 })', ctx), /lo-card" data-brand-theme="vermeer"/);
  assert.match(vm.runInContext('partChip({ brand: "Vermeer BORESTORE" })', ctx), /data-brand-theme="vermeer"/);
  assert.match(vm.runInContext('partChip({ brand: "Another supplier" })', ctx), /data-brand-theme="neutral"/);
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

test('skip-link positioning is isolated from skipped builder sections', () => {
  const css = read('../css/app.css');
  assert.match(read('../index.html'), /<a class="skip-link" href="#app">Skip to content<\/a>/);
  assert.match(css, /a\.skip-link\{[^}]*top:-40px[^}]*z-index:80/);
  assert.doesNotMatch(css, /(?:^|[},])\s*\.skip\b(?!-)/m);
  assert.match(css, /\.sec\.skip,\.sec\.locked\{opacity:/);
});

test('D36X50 pipe choices display a placeholder for empty catalog images', async () => {
  const { ctx, element } = appContext();
  await vm.runInContext('viewPipe(2031)', ctx);
  const html = element('#app').innerHTML;
  assert.equal((html.match(/src="img\/placeholder\.svg"/g) || []).length, 4);
  for (const pn of ['355-1127', '355-1128', '355-1129']) assert.ok(html.includes(pn));
});

test('recovery verifies the emailed token in a fresh context before the router can open My rigs', async () => {
  const { ctx, element, location } = appContext();
  let resolveVerification, request, update, sent;
  const jwt = `header.${Buffer.from(JSON.stringify({ session_id: 'reset-session' })).toString('base64url')}.signature`;
  const session = { user: { id: 'recovered-user' }, access_token: jwt };
  ctx.client = { auth: {
    verifyOtp: (args) => { request = args; return new Promise((resolve) => { resolveVerification = resolve; }); },
    getSession: async () => ({ data: { session } }),
    updateUser: async (args) => { update = args; return { error: null }; },
    resetPasswordForEmail: async (_email, args) => { sent = args; return { error: null }; },
  } };
  vm.runInContext('sb = async () => client; ME.user = { id: "already-signed-in" }; ME.member = {};', ctx);
  location.replace('/?auth=reset&token_hash=from-email#/garage');
  const checking = vm.runInContext('startRecovery(); route()', ctx);
  assert.equal(location.href, 'https://test.invalid/#/account?m=reset');
  assert.match(element('#app').innerHTML, /Checking your reset link/);
  await new Promise(setImmediate);
  assert.equal(request.token_hash, 'from-email');
  assert.equal(request.type, 'recovery');
  location.hash = '#/garage';
  const navigating = vm.runInContext('route()', ctx);
  resolveVerification({ data: { session }, error: null });
  await Promise.all([checking, navigating]);
  assert.equal(location.hash, '#/account?m=reset');
  assert.match(element('#app').innerHTML, /Set a new password/);
  element('#npw').value = 'new-password';
  await element('#rst').listeners.submit({ preventDefault() {} });
  assert.equal(update.password, 'new-password');
  assert.equal(location.hash, '#/garage');
  assert.equal(vm.runInContext('sessionStorage.getItem(RECOVERY_KEY)', ctx), null);
  await vm.runInContext('requestPasswordReset("test@example.com")', ctx);
  assert.equal(sent.redirectTo, 'https://test.invalid/?auth=reset');
});

test('expired and legacy recovery links show the fresh-link action even with an unrelated signed-in session', async () => {
  for (const link of [
    '/?auth=reset&token_hash=expired', '/?auth=reset&token_hash=no-session', '/?auth=reset',
    '/?code=no-local-verifier#/account?m=signin',
    '/#/account?m=signin#error=access_denied&error_code=otp_expired', '/#/account?m=reset',
  ]) {
    const { ctx, location, element } = appContext();
    ctx.client = { auth: {
      verifyOtp: async ({ token_hash }) => token_hash === 'expired' ? { error: { message: 'Expired' } } : { data: { session: null } },
      exchangeCodeForSession: async () => ({ error: { message: 'PKCE code verifier missing' } }),
    } };
    vm.runInContext('sb = async () => client; ME.user = { id: "other-user" }; ME.member = {};', ctx);
    location.replace(link);
    await vm.runInContext('startRecovery(); route()', ctx);
    assert.match(element('#app').innerHTML, /invalid, expired, or has already been used/, link);
    assert.match(element('#app').innerHTML, /href="#\/account\?m=forgot">Request a new reset link/, link);
    assert.equal(location.href, 'https://test.invalid/#/account?m=reset');
    location.hash = '#/account?m=forgot';
    await vm.runInContext('route()', ctx);
    assert.match(element('#app').innerHTML, /Send reset link/);
  }
  const { ctx } = appContext();
  assert.equal(vm.runInContext('readRecoveryCallback("https://test.invalid/?code=signup#/setup")', ctx), null);
  assert.match(read('../emails/supabase-auth/03-reset-password.html'), /\{\{ \.RedirectTo \}\}&amp;token_hash=\{\{ \.TokenHash \}\}/);
});

test('ordinary account entry has no authority to attach a guest draft', async () => {
  const { ctx } = appContext();
  ctx.cfg = base;
  assert.equal(await vm.runInContext(`
    ME.user = { id: "account" }; ME.member = {}; stashPendingSave(cfg);
    consumePendingSave();
  `, ctx), null);
  assert.equal(vm.runInContext('store.get(PENDING_SAVE_KEY).userId', ctx), undefined);
  vm.runInContext('authorizePendingSave()', ctx);
  assert.equal(vm.runInContext('store.get(PENDING_SAVE_KEY).userId', ctx), 'account');
  assert.equal(await vm.runInContext('ME.user = { id: "another-account" }; consumePendingSave()', ctx), null);
});
