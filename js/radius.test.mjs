import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeConfig } from './config.mjs';
import {
  normalizeRadius, alternatesFor, slotOthers, fallbackImg, radiusImgUrl, altLineItems, altKey, toggleAlt, fitsMachine,
} from './radius.mjs';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

const PARTS = {
  parts: {
    'R-CN': { pn: 'R-CN', name: 'Connector A', type: 'Connector', conn: { l: '#900 F', r: '2.88 M API R' }, machines: ['Vermeer D60X90'], url: 'https://www.radiushdd.com/p/cn', img: 'https://cdn11.bigcommerce.com/s-uwymjpsd0i/i/cn.jpg' },
    'R-CN2': { pn: 'R-CN2', name: 'Connector B', type: 'Connector', conn: {}, machines: ['vermeer  d60x90'], url: 'javascript:alert(1)', img: 'https://evil.example/x.jpg' },
    'R-HS': { pn: 'R-HS', name: 'Housing', type: 'Electronic_Housing', machines: ['Vermeer D60X90'], url: null, img: null },
    'R-HS2': { pn: 'R-HS2', name: 'Housing 2', type: 'Electronic_Housing', machines: ['Vermeer D60X90'], img: 'http://cdn11.bigcommerce.com/s-uwymjpsd0i/i/hs2.jpg' },
    'R-OTHER': { pn: 'R-OTHER', name: 'Other drill', type: 'Connector', machines: ['Ditch Witch JT20'] },
    'bad pn!': { pn: 'bad pn!', name: 'Dropped', type: 'Bit' },
    'R-NONAME': { pn: 'R-NONAME', type: 'Bit' },
    'R-TYPE': { pn: 'R-TYPE', name: 'Odd type', type: 'Sprocket', machines: [] },
  },
};
const XREF = {
  byDwPn: {
    '908-5184': [{ pn: 'R-CN', match: 'direct' }, { pn: 'R-CN', match: 'thread' }, { pn: 'MISSING', match: 'direct' }],
    '906-5354': [{ pn: 'R-HS', match: 'thread', note: 'Different bolt pattern' }, { pn: 'R-HS2', match: 'bogus' }],
    '000-0000': [{ pn: 'MISSING' }],
  },
};
const R = normalizeRadius(PARTS, XREF, { images: true });

test('normalizeRadius drops invalid parts, unsafe URLs and off-host images', () => {
  assert.deepEqual(Object.keys(R.parts).sort(), ['R-CN', 'R-CN2', 'R-HS', 'R-HS2', 'R-OTHER', 'R-TYPE']);
  assert.equal(R.parts['R-CN2'].url, null);
  assert.equal(R.parts['R-CN2'].imgUrl, null);
  assert.equal(R.parts['R-CN'].imgUrl, 'https://cdn11.bigcommerce.com/s-uwymjpsd0i/i/cn.jpg');
  assert.equal(R.parts['R-HS2'].imgUrl, null, 'http is not the allowed https origin');
  assert.equal(R.parts['R-TYPE'].type, 'Other');
  assert.equal(R.parts['R-CN'].brand, 'Radius');
  assert.equal(radiusImgUrl('https://cdn11.bigcommerce.com.evil.example/s-uwymjpsd0i/x.png'), null);
  assert.equal(radiusImgUrl('https://cdn11.bigcommerce.com/s-otherstore/x.png'), null, 'other BigCommerce stores are not allowed');
  assert.equal(normalizeRadius(PARTS, XREF).parts['R-CN'].imgUrl, null, 'photos are off until Radius grants permission');
  assert.equal(radiusImgUrl('data:image/png;base64,AAAA'), null);
  assert.deepEqual(normalizeRadius(null, undefined).parts, Object.create(null));
});

test('crossref lookup dedupes, skips unknown parts and normalizes match kinds', () => {
  assert.deepEqual(alternatesFor(R, '908-5184').map((a) => [a.part.pn, a.match]), [['R-CN', 'direct']]);
  assert.deepEqual(alternatesFor(R, '906-5354').map((a) => [a.part.pn, a.match, a.note]),
    [['R-HS', 'thread', 'Different bolt pattern'], ['R-HS2', 'machine', null]]);
  assert.deepEqual(alternatesFor(R, '000-0000'), []);
  assert.deepEqual(alternatesFor(R, 'nope'), []);
  assert.deepEqual(alternatesFor(null, '908-5184'), []);
});

test('per-slot other brands: same type, fits the drill, excludes parts already shown as alternates', () => {
  const others = slotOthers(R, { types: ['Connector'], machine: 'Vermeer D60X90', dwPns: ['908-5184'] });
  assert.deepEqual(others.map((p) => p.pn), ['R-CN2']);
  const all = slotOthers(R, { types: ['Connector'], machine: 'Vermeer D60X90', dwPns: [] });
  assert.deepEqual(all.map((p) => p.pn), ['R-CN', 'R-CN2']);
  assert.deepEqual(slotOthers(R, { types: ['Connector'], machine: 'Ditch Witch JT20' }).map((p) => p.pn), ['R-OTHER']);
  assert.deepEqual(slotOthers(R, { types: ['Bit'], machine: 'Vermeer D60X90' }), []);
  assert.deepEqual(slotOthers(R, { types: ['Connector'], machine: '' }), []);
  assert.equal(fitsMachine(R.parts['R-CN2'], 'Vermeer D60X90'), true, 'case/space-insensitive');
});

test('image fallback picks the first cross-referenced Radius image that exists', () => {
  assert.equal(fallbackImg(R, '908-5184'), 'https://cdn11.bigcommerce.com/s-uwymjpsd0i/i/cn.jpg');
  assert.equal(fallbackImg(R, '906-5354'), null, 'neither housing has an allowed image');
  assert.equal(fallbackImg(R, 'nope'), null);
  assert.equal(fallbackImg(null, '908-5184'), null);
});

test('Radius alternates as list lines round-trip through normalizeConfig', () => {
  const cfg = { m: 1, p: 2, r: 3, mode: 'Bit', sel: {}, acc: {}, q: {} };
  toggleAlt(cfg, '22632', 'R-CN');
  toggleAlt(cfg, '22632', '"><img src=x>');
  assert.deepEqual(cfg.alt, { 22632: ['R-CN'] });
  cfg.q[altKey(22632, 'R-CN')] = 3;
  const norm = normalizeConfig(JSON.parse(JSON.stringify({ ...cfg, alt: { ...cfg.alt, x: ['R-CN'], 7: ['<bad>'] } })));
  assert.deepEqual(norm.alt, { 22632: ['R-CN'] });
  assert.equal(norm.q['22632.RR-CN'], 3);
  const rows = [{ sec: { id: 22632, name: 'Connector' } }, { sec: { id: 22633, name: 'Housing' } }];
  const items = altLineItems(R, norm, rows);
  assert.equal(items.length, 1);
  assert.equal(items[0].brand, 'Radius');
  assert.equal(items[0].qty, 3);
  assert.equal(items[0].sec, 'Connector · alternate');
  assert.deepEqual(altLineItems(R, { ...norm, alt: { 22632: ['MISSING'] } }, rows), []);
  toggleAlt(cfg, '22632', 'R-CN');
  assert.equal('alt' in cfg, false, 'removing the last alternate restores the old config shape');
  assert.equal('alt' in normalizeConfig({ m: 1, p: 2, r: 3 }), false);
});

test('Radius data files (fixture or real) normalize without errors', () => {
  const d = normalizeRadius(read('../data/radius/parts.json'), read('../data/radius/crossref.json'));
  assert.ok(Object.keys(d.parts).length > 0);
  for (const list of Object.values(d.byDw)) for (const x of list) assert.ok(d.parts[x.pn]);
});
