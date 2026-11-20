import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fixRoadmap } from '../tools/fix_catalog.mjs';

const dir = new URL('../data/roadmaps/', import.meta.url);

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
