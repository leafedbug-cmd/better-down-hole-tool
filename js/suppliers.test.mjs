import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { compute, compat } from './compatibility.mjs';
import { normalizeSuppliers, augmentRoadmap, safeUrl } from './suppliers.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const brandsJson = JSON.parse(read('../data/suppliers/brands.json'));
const partsJson = JSON.parse(read('../data/suppliers/parts.json'));
const connJson = JSON.parse(read('../data/suppliers/connections.json'));
const S = normalizeSuppliers(brandsJson, partsJson);
const roadmaps = () => readdirSync(new URL('../data/roadmaps/', import.meta.url)).map((f) => JSON.parse(read(`../data/roadmaps/${f}`)));

test('supplier data: ids and brand/name pairs are unique, nothing was dropped by the sanitizer', () => {
  const ids = partsJson.parts.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(Object.keys(S.parts).length, partsJson.parts.length);
  const keys = partsJson.parts.map((p) => `${p.brand}|${p.pn ?? ''}|${p.name}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(ids.every((id) => id >= 900001), 'supplier ids stay out of the catalog id range');
});

test('every part stores an https manufacturer product page URL with no affiliate or tracking parameters', () => {
  for (const p of partsJson.parts) {
    assert.equal(safeUrl(p.url), new URL(p.url).href, `${p.id} url`);
    assert.doesNotMatch(p.url, /[?&](tag|aff|affiliate|ref|utm_[a-z]+|gclid|fbclid|clickid|subid)=/i, p.url);
  }
});

test('hard rules: no Ditch Witch / Toro-family references and no listed brand from the excluded list', () => {
  const ban = /ditch\s*-?\s*witch|\btoro\b|subsite|radius\s*hdd|hammerhead|american\s+augers|\bJT\d/i;
  const blob = JSON.stringify([brandsJson, partsJson, connJson]);
  assert.doesNotMatch(blob, ban);
  const listed = brandsJson.brands.map((b) => b.id);
  for (const s of brandsJson.skipped) assert.ok(!listed.includes(s.id), `${s.id} is both listed and skipped`);
  for (const id of ['digital-control', 'underground-magnetics', 'tracto', 'prime-drilling', 'barbco', 'byrne-group']) {
    assert.ok(!listed.includes(id) && brandsJson.skipped.some((s) => s.id === id), `${id} should be skipped with a reason`);
  }
});

test('a part reaches the solver only when its thread ends are stated, and unknown specs stay null', () => {
  for (const p of partsJson.parts) {
    const n = S.parts[p.id];
    if (p.configurator.slot) {
      assert.equal(p.conn.wired, true);
      assert.ok(/^[\d.]+ [MF] (API (R|IF)|FH)$/.test(p.conn.cl), `${p.id} cl ${p.conn.cl}`);
      assert.ok(S.bySlot[p.configurator.slot].includes(p.id));
      // bits are pins, hole openers and reamers here are box x box
      if (p.category === 'bit') assert.match(p.conn.cl, / M /);
      else assert.match(p.conn.cl, / F /);
    } else {
      assert.equal(n.cl, null); assert.equal(n.cr, null);
      assert.ok(p.configurator.reason);
    }
    assert.equal(p.rigClass, null, 'no manufacturer page states mini/midi/maxi');
  }
});

test('connection types: new codes are flagged and mate with the opposite gender of the same thread', () => {
  const codes = new Map(connJson.connections.filter((c) => c.matesWith).map((c) => [c.code, c]));
  for (const c of codes.values()) assert.ok(c.matesWith.split(' ').length === 4 || /FH$/.test(c.matesWith));
  assert.ok(connJson.connections.some((c) => c.status === 'new'));
  assert.ok(connJson.connections.some((c) => c.status === 'existing'));
});

test('augmentRoadmap adds options without changing the input or the existing options', () => {
  const rm = roadmaps().find((r) => r.sections.some((s) => s.name === 'Bit' && s.mode === 'Bit'));
  const before = JSON.stringify(rm);
  const out = augmentRoadmap(rm, S);
  assert.equal(JSON.stringify(rm), before);
  for (const s of rm.sections) {
    const o = out.sections.find((x) => x.id === s.id);
    assert.deepEqual(o.opts.slice(0, s.opts.length), s.opts);
  }
  assert.equal(augmentRoadmap(rm, null), rm);
});

test('solver: a supplier part is only ever offered when the part before it threads onto it', () => {
  let offered = 0;
  for (const rm0 of roadmaps()) {
    const rm = augmentRoadmap(rm0, S);
    for (const mode of ['Bit', 'Backreamer']) {
      const cfg = { mode, sel: {}, acc: {}, q: {} };
      let rows;
      for (let i = 0; i < 12; i++) {
        rows = compute(rm, cfg);
        const pend = rows.find((r) => r.status === 'pending');
        if (!pend) break;
        cfg.sel[pend.sec.id] = [pend.cands[0].id];
      }
      rows.forEach((r, i) => {
        for (const o of r.cands) {
          const part = S.parts[o.id];
          if (!part) continue;
          offered++;
          assert.ok(part.cl, 'wired supplier parts have a rig-side thread');
          const up = rows.slice(0, i).flatMap((x) => x.sel).map((id) => rm.parts[id]).filter((p) => p.type !== 'Collar').pop();
          if (up) assert.ok(compat(up, part) || rows[i - 1]?.acc[up.id], `${part.name} does not thread onto ${up.name}`);
        }
      });
    }
  }
  assert.ok(offered > 0, 'at least some rigs get supplier options');
});

test('solver: existing options and their order are unchanged by the supplier merge', () => {
  for (const rm0 of roadmaps().slice(0, 25)) {
    const rm = augmentRoadmap(rm0, S);
    const a = compute(rm0, { mode: 'Bit', sel: {}, acc: {}, q: {} }), b = compute(rm, { mode: 'Bit', sel: {}, acc: {}, q: {} });
    assert.equal(a.length, b.length);
    a.forEach((r, i) => assert.deepEqual(b[i].cands.filter((o) => !S.parts[o.id]).map((o) => o.id).slice(0, r.cands.length),
      r.cands.map((o) => o.id).slice(0, b[i].cands.filter((o) => !S.parts[o.id]).length)));
  }
});

test('normalizeSuppliers drops bad rows and non-https links', () => {
  const brands = { brands: [{ id: 'ok', name: 'Ok Tools', url: 'javascript:alert(1)' }] };
  const parts = { parts: [
    { id: 900001, brand: 'ok', name: 'Good', category: 'bit', url: 'https://example.com/a', conn: { wired: true, cl: '2.88 M API R', raw: 'x' }, configurator: { slot: 'Bit' }, specs: {} },
    { id: 900002, brand: 'ok', name: 'Bad link', category: 'bit', url: 'javascript:alert(1)', conn: {}, specs: {} },
    { id: 900003, brand: 'nope', name: 'Unknown brand', category: 'bit', url: 'https://example.com/b', conn: {}, specs: {} },
    { id: 900004, brand: 'ok', name: 'Bad code', category: 'bit', url: 'https://example.com/c', conn: { wired: true, cl: '<img onerror=x>' }, configurator: { slot: 'Bit' }, specs: {} },
  ] };
  const n = normalizeSuppliers(brands, parts);
  assert.equal(n.brands.ok.url, null);
  assert.deepEqual(n.bySlot.Bit, [900001]);
  assert.equal(n.parts[900002].url, null);
  assert.equal(n.parts[900002].docs.length, 0);
  assert.equal(n.parts[900003], undefined);
  assert.equal(n.parts[900004].cl, null);
  assert.deepEqual(n.bySlot.Bit.includes(900004), false);
});
