import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fixRoadmap } from '../tools/fix_catalog.mjs';
import { compute, isLoadoutReady } from './compatibility.mjs';

const dir = new URL('../data/roadmaps/', import.meta.url);
const roadmap = (id) => JSON.parse(readFileSync(new URL(`${id}.json`, dir), 'utf8'));
const config = (rm, mode) => ({ m: rm.machine, p: rm.pipe, r: rm.id, mode, sel: {}, acc: {}, q: {} });

function equipFirst(rm, cfg) {
  for (let i = 0; i <= rm.sections.length; i++) {
    const rows = compute(rm, cfg);
    const pending = rows.find((row) => row.status === 'pending');
    if (!pending) return rows;
    cfg.sel[pending.sec.id] = [pending.cands[0].id];
  }
  assert.fail(`Could not settle roadmap ${rm.id}`);
}

test('roadmap data already has every tools/fix_catalog.mjs correction applied', () => {
  for (const f of readdirSync(dir)) {
    const rm = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    assert.deepEqual(fixRoadmap(rm), [], `${f}: run node tools/fix_catalog.mjs`);
  }
});

test('fixRoadmap normalizes codes and drops parts that cannot thread onto the pipe', () => {
  const rm = {
    sections: [{ mode: 'Bit', name: 'Transition Sub', opts: [{ id: 1 }, { id: 2 }] }],
    parts: {
      1: { pn: '400-10264', cl: '#200 M' },
      2: { pn: 'x', cl: '3.25M' },
      3: { pn: '355-1149', type: 'Drill_Pipe', cr: '1.30 F' },
    },
  };
  assert.equal(fixRoadmap(rm).length, 2);
  assert.deepEqual(rm.sections[0].opts, [{ id: 2 }]);
  assert.equal(rm.parts[2].cl, '3.25 M');
  assert.deepEqual(fixRoadmap(rm), []);
});

test('smoke-test pipe SKUs override stale saved selections in both modes', () => {
  for (const [id, pn] of [
    [6691, '355-1225'], [6982, '355-1350'], [6966, '355-1350-PU'], [6989, '355-1350-PU'],
    [7014, '355-1254'], [6842, '355-1121 PD'],
  ]) {
    const rm = roadmap(id);
    for (const mode of ['Bit', 'Backreamer']) {
      const cfg = config(rm, mode);
      const pipe = rm.sections.find((s) => s.mode === mode && s.name === 'Drill Pipe');
      const stale = Object.values(rm.parts).find((p) => p.type === 'Drill_Pipe' && p.id !== cfg.p);
      assert.ok(stale, id);
      cfg.sel[pipe.id] = [stale.id];
      const rows = equipFirst(rm, cfg);
      const actual = rows.find((row) => row.sec.id === pipe.id);
      assert.deepEqual(actual.sel, [cfg.p]);
      assert.equal(rm.parts[actual.sel[0]].pn, pn);
      assert.ok(isLoadoutReady(rows), `${id}/${mode}`);
    }
  }
});

test('missing selected pipe and missing terminal tool each block their slot', () => {
  const rm = roadmap(5427);
  const cfg = config(rm, 'Backreamer');
  const initial = compute(rm, { ...cfg, p: -1 });
  assert.equal(initial[0].status, 'blocked');
  assert.equal(initial[0].sec.name, 'Drill Pipe');
  assert.deepEqual(initial[0].sel, []);
  assert.equal(isLoadoutReady(initial), false);
  rm.sections.find((s) => s.name === 'Backreamer').opts = [];
  const terminal = equipFirst(rm, cfg);
  assert.equal(terminal.at(-1).status, 'blocked');
  assert.equal(isLoadoutReady(terminal), false);
});

test('each Vermeer smoke-test starter rod can reach a listed reamer in rig-to-tool order', () => {
  const d7 = roadmap(6842);
  assert.deepEqual(d7.sections.filter((s) => s.mode === 'Backreamer').map((s) => s.name),
    ['Drill Pipe', 'Transition Sub / Quick Connect', 'Quick Connect Collar', 'Connector', 'Backreamer']);
  assert.ok(isLoadoutReady(equipFirst(d7, config(d7, 'Bit'))));
  for (const id of [6842, 5609, 5818, 6803, 6804, 6805, 5621, 5427, 6821]) {
    const rm = roadmap(id), cfg = config(rm, 'Backreamer');
    const starter = compute(rm, cfg).find((row) => row.sec.name === 'Transition Sub / Quick Connect');
    const selections = starter ? starter.sec.opts.map((o) => ({ [starter.sec.id]: [o.id] })) : [{}];
    for (const sel of selections) {
      const rows = equipFirst(rm, { ...cfg, sel });
      if (starter) assert.deepEqual(rows.find((r) => r.sec.id === starter.sec.id).sel, sel[starter.sec.id]);
      assert.ok(isLoadoutReady(rows), id);
      assert.doesNotMatch(rm.parts[rows.at(-1).sel[0]].name, /discontinued/i, id);
    }
  }
});

test('pullback choices prioritize active tools and honor an explicitly selected legacy tool', () => {
  const rm = roadmap(6750), cfg = config(rm, 'Backreamer');
  const rows = equipFirst(rm, cfg);
  assert.doesNotMatch(rm.parts[rows.at(-1).sel[0]].name, /discontinued/i);
  const connector = rows.find((r) => r.sec.name === 'Connector');
  const legacy = connector.cands.find((o) => rm.parts[o.id].pn === '918-3052');
  cfg.sel[connector.sec.id] = [legacy.id];
  assert.match(rm.parts[equipFirst(rm, cfg).at(-1).sel[0]].name, /discontinued/i);
  const terminal = { id: 1, mode: 'Backreamer', name: 'Backreamer', opts: [{ id: 1 }, { id: 2 }] };
  const simple = { sections: [terminal], parts: { 1: { id: 1, name: 'Old (Discontinued)' }, 2: { id: 2, name: 'Active' } } };
  assert.deepEqual(compute(simple, { ...cfg, sel: {} })[0].cands.map((o) => o.id), [2, 1]);
  assert.deepEqual(compute(simple, { ...cfg, sel: { 1: [1] } })[0].sel, [1]);
});

test('JT40 Forged HD shows the SaverLok ahead of its collar in both modes', () => {
  const rm = roadmap(7005);
  for (const mode of ['Bit', 'Backreamer']) {
    const [first, second] = rm.sections.filter((s) => s.mode === mode);
    assert.match(first.name, /^Saver Sub/);
    assert.equal(second.name, 'SaverLok® Collar');
    assert.equal(rm.parts[second.opts[0].id].name, 'SaverLok® Collar');
  }
});
