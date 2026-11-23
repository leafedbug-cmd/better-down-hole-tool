#!/usr/bin/env node
// Idempotent corrections to the hddadvisor.com roadmap data in data/roadmaps/.
// Re-run after any re-fetch:  node tools/fix_catalog.mjs   (add --check to report without writing)
// Each fix is evidence-based (see `why`); ambiguous connections are listed in FIX_HANDOFF.md, not guessed here.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'roadmaps');
const catalog = JSON.parse(readFileSync(join(DIR, '..', 'catalog.json'), 'utf8'));
const pipes = new Map(catalog.machines.flatMap((m) => m.pipes.map((p) => [p.roadmap, p])));

// Connection-code rewrites, applied to cl/cr/cr2 of parts matching `pn` (or every part when pn is omitted).
export const CODE_FIXES = [
  { from: '3.25M', to: '3.25 M', why: 'missing space; "3.25 F" boxes swap to "3.25 M" and never matched' },
  { from: '3.44M', to: '3.44 M', why: 'missing space; pipe pin could not mate with "3.44 F" saver sub/pipe box' },
  { from: '2.25-6F EZ3', to: '2.25 F EZ3', why: 'typo; every other EZ3 box is "2.25 F EZ3"' },
  { pn: '918-2437', from: '350 F', to: 'Hawkeye®  350 F', why: 'Hawkeye 350 starter rod; brand prefix dropped (all other Hawkeye codes carry it)' },
  { pn: '918-3046', from: '390 F', to: 'Hawkeye®  390 F', why: 'Hawkeye 390 starter rod; brand prefix dropped' },
  { pn: '918-3047', from: '390 F', to: 'Hawkeye®  390 F', why: 'Hawkeye 390 starter rod; brand prefix dropped' },
  { pn: '400-2521', from: '3.5 API M', to: '3.5 M API R', why: '6-1/2" tricone: 3-1/2 API Reg pin; housings in the same slots offer "3.5 F API R"' },
  { pn: '400-2315', from: '3.5 API M', to: '3.5 M API R', why: '5-5/8" tricone: 3-1/2 API Reg pin; housings in the same slots offer "3.5 F API R"' },
  // AT120 TCI tricones + the Rockmaster housings they thread into: DW names say "4-1/2 API-R" / "4.5APIR",
  // Radius 2022 catalog p.24 lists 7-7/8" tricones as 4-1/2" Reg pin. Recoded together so they still mate.
  ...['400-3368', '400-3369', '400-3370', '400-3371'].map((pn) => ({ pn, from: '4.5 M API IF', to: '4.5 M API R', why: 'named "4-1/2 API-R"; Radius catalog p.24: 4-1/2" Reg' })),
  ...['400-10099', '400-10101', '400-10277', '400-10278'].map((pn) => ({ pn, from: '4.5 F API IF', to: '4.5 F API R', why: 'named "4.5APIR"; mates with the 4-1/2 Reg tricones' })),
  { pn: '400-2287', from: '1.63 M EZ3', to: '1.63 M EZ2', why: '1.63 is only ever EZ2 (DW data and Radius catalog pp.10-12); EZ3 sizes are 1.88/2.25' },
  ...['190-1391', '190-1392', '190-1393', '190-1394', '190-1395'].map((pn) => ({
    pn, from: '30K Socket', to: '40K Socket', why: 'Ditch Witch Parts Book rock backreamer table specifies 40K socket',
  })),
];

// Pipe box that did not match its own pin. Pipe joints mate with each other, so the box must be 3.25SS;
// the old "3.25 F" is kept as cr2 so the 3.25 M subs that were already offered stay available.
export const PART_FIXES = [
  { pn: '355-1258', set: { cr: '3.25SS F', cr2: '3.25 F' }, why: 'All Terrain 3.25SS pipe pin is 3.25SS M; box was "3.25 F" so pipe could not reach 3.25SS-only housings' },
];

// Parts listed on roadmaps whose pipe they cannot thread onto.
export const REMOVALS = [
  { pn: '400-10264', unlessPipeCr: '#200 F', why: '#200 Switch-Connect starter rod listed on JT9 1.30 pipe roadmaps; kept on #200 pipe roadmaps' },
];

// Some exact pipe records only exist on another model's roadmap. The D/R
// entries are tooling variants of the same base pipe, and 355-1132 is pin up.
const pipeSources = { 1037: 6749, 1791: 6915, 6138: 6915, 6139: 6725, 6140: 6709 };
const pipeVariants = { 1803: 1288, 1804: 1288, 1798: 1052, 1799: 1052, 1050: 1048 };

function fixPipe(rm, log) {
  const pipe = pipes.get(rm.id);
  if (!pipe) return;
  const P = rm.parts;
  if (!P[pipe.id]) {
    const variant = P[pipeVariants[pipe.id]];
    const source = pipeSources[pipe.id];
    const part = variant || (source && JSON.parse(readFileSync(join(DIR, `${source}.json`), 'utf8')).parts[pipe.id]);
    if (part) {
      P[pipe.id] = { ...part, id: pipe.id, pn: pipe.pn, name: pipe.name, img: pipe.img ?? part.img };
      log.push(`added selected pipe ${pipe.pn}`);
    }
  }
  for (const sec of rm.sections.filter((s) => s.name === 'Drill Pipe')) {
    if (P[pipe.id]?.pn !== pipe.pn) throw new Error(`${rm.id} lacks pipe ${pipe.pn}`);
    if (sec.opts.length === 1 && sec.opts[0].id === pipe.id) continue;
    sec.opts = [sec.opts.find((o) => o.id === pipe.id) || { id: pipe.id }];
    log.push(`${sec.mode} Drill Pipe locked to ${pipe.pn}`);
  }
}

// The October 2025 Ditch Witch HDD Parts Book lists the 2.38 API Reg
// connectors and reamers. Reuse the matching parts already on these roadmaps
// (mostly in the pilot slots), preserving the existing 2.59 connector codes.
const apiRegConnectors = ['918-2407', '918-3024', '908-4102'];
const pullbackParts = {
  5609: { starter: ['908-1705', '908-4272'], connectors: ['908-1666', ...apiRegConnectors] },
  5818: { starter: ['908-1705', '908-4272'], connectors: ['908-1666', ...apiRegConnectors] },
  6803: { starter: ['908-4230', '908-4278'], connectors: ['908-1666', ...apiRegConnectors, '918-3624'] },
  6804: { starter: ['908-4230', '908-4278'], connectors: ['908-1666', ...apiRegConnectors, '918-3624'] },
  6805: { starter: ['908-4241', '908-4280'], connectors: ['908-1666', ...apiRegConnectors, '918-3624'] },
  6750: { connectors: apiRegConnectors },
  6752: { starter: ['908-1705', '908-4272'], connectors: ['908-1666', ...apiRegConnectors] },
  5427: { connectors: ['908-5184'] },
  6821: { connectors: ['908-5213'] },
};

function fixSlots(rm, log) {
  const P = rm.parts;
  const reorder = (ids) => {
    const slots = ids.map((id) => rm.sections.find((s) => s.id === id));
    const indexes = slots.map((s) => rm.sections.indexOf(s)).sort((a, b) => a - b);
    if (indexes.every((index, i) => rm.sections[index] === slots[i])) return;
    indexes.forEach((index, i) => { rm.sections[index] = slots[i]; });
    log.push('restored rig-to-tool slot order');
  };
  const omit = (...ids) => {
    const before = rm.sections.length;
    rm.sections = rm.sections.filter((s) => !ids.includes(s.id));
    if (before !== rm.sections.length) log.push('removed the inapplicable saver hardware slots');
  };
  if (rm.id === 6842) {
    reorder([41071, 41072, 41073, 41074, 41075]);
    omit(41077); // 400-2242 is for JT520/JT5 and has the wrong #200 orientation.
  }
  if (rm.id === 7014) omit(43484, 43485, 43479, 43480); // 400-2169 is for the 3.44SS box.
  if (rm.id === 7005) {
    reorder([43354, 43355]);
    reorder([43347, 43360]);
  }
  if ([7006, 7026].includes(rm.id)) {
    const saver = rm.sections.find((s) => s.mode === 'Backreamer' && s.name.startsWith('Saver Sub'));
    if (saver.opts[0]?.id !== 6038) {
      saver.opts = [{ id: 6038 }]; // 400-2598 is the #700 box, as in the pilot roadmap.
      log.push('restored #700 pin-up pullback SaverLok');
    }
  }
  if (rm.id === 7017) {
    // Ditch Witch Parts Book pp. 4, 20: #1000 pin SaverLok and #1000 box / 3.5 IF pin connector.
    const saver = { id: 40010028, name: 'SaverLok® #1000 (Pin)', pn: '400-10028', type: 'Saver_Sub', cr: '#1000 M' };
    const connector = JSON.parse(readFileSync(join(DIR, '6821.json'), 'utf8')).parts[1369];
    for (const [part, name] of [[saver, 'Saver Sub / SaverLok®'], [connector, 'Transition Sub / Quick Connect']]) {
      P[part.id] ||= part;
      for (const s of rm.sections.filter((s) => s.name === name)) {
        if (s.opts.some((o) => o.id === part.id)) continue;
        s.opts.push({ id: part.id });
        log.push(`restored ${part.pn} in ${s.mode}`);
      }
    }
  }
  if ([5621, 6803, 6804, 6805].includes(rm.id)) {
    // The Parts Book lists these 2.59 box Rockmaster reamers for 27K–40K drills.
    const end = rm.sections.find((s) => s.mode === 'Backreamer' && s.name === 'Backreamer');
    const source = JSON.parse(readFileSync(join(DIR, '6691.json'), 'utf8'));
    const rated = [1283, 1282, 1158, 1156, 1173].map((id) => ({ id }));
    for (const { id } of rated) {
      if (!P[id]) { P[id] = { ...source.parts[id], cr: '40K Socket' }; log.push(`added ${P[id].pn} Rockmaster reamer`); }
    }
    // The six supplied 2.38 API Reg reamers are listed for 16K–36K drills.
    const opts = rm.id === 5621 ? rated : [...end.opts.filter((o) => !rated.some((r) => r.id === o.id)), ...rated];
    if (JSON.stringify(end.opts) !== JSON.stringify(opts)) {
      end.opts = opts;
      log.push('listed pullback reamers for the rig class');
    }
  }
  if (rm.id === 6821 && !rm.sections.some((s) => s.id === 40813)) {
    const index = rm.sections.findIndex((s) => s.id === 40812);
    rm.sections.splice(index, 0, { id: 40813, mode: 'Backreamer', name: 'Connector', multi: false, opts: [] });
    log.push('added D80X120 pullback connector slot');
  }
  const extra = pullbackParts[rm.id];
  if (!extra) return;
  const add = (name, pns = []) => {
    const slot = rm.sections.find((s) => s.mode === 'Backreamer' && s.name === name);
    for (const pn of pns) {
      const part = Object.values(P).find((p) => p.pn === pn);
      if (!slot || !part) throw new Error(`${rm.id} lacks ${name} or ${pn}`);
      if (slot.opts.some((o) => o.id === part.id)) continue;
      slot.opts.push({ id: part.id });
      log.push(`added ${pn} to pullback ${name}`);
    }
  };
  add('Transition Sub / Quick Connect', extra.starter);
  if (extra.starter?.some((pn) => ['908-4272', '908-4274', '908-4278', '908-4280'].includes(pn))) {
    add('Quick Connect Collar', ['908-4244']);
  }
  add('Connector', extra.connectors);
}

export function fixRoadmap(rm) {
  const log = [];
  for (const p of Object.values(rm.parts)) {
    const fields = {};
    if (p.pn === '301-7018' && p.name === 'SavorLok®') fields.name = 'SaverLok® Collar';
    if (/^400-(2251|2274|2275|1507)-(?: Assembly)?$/.test(p.pn)) {
      fields.pn = p.pn.split('-', 2).join('-');
      fields.name = 'EZ Connect (Assembly)';
    }
    if (p.pn === '400-2249') {
      fields.short = 'For #600 pin-up pipe on JT25, JT28, JT30 and JT3020';
      fields.desc = ['This starter rod has a #600 pin on the pipe side and a 2.125 LPT box on the tool side.'];
    }
    if (['400-1338', '368-430'].includes(p.pn) && p.desc?.some((d) => d.includes('cnfiguration'))) {
      fields.desc = p.desc.map((d) => d.replaceAll('cnfiguration', 'configuration'));
    }
    if (rm.id === 6970 && p.pn === '400-10063') Object.assign(fields, { cr: '#600 F', rc: 6133 });
    for (const [key, value] of Object.entries(fields)) {
      if (JSON.stringify(p[key]) === JSON.stringify(value)) continue;
      log.push(`updated ${p.pn} ${key}`);
      p[key] = value;
    }
    for (const f of CODE_FIXES) {
      if (f.pn && f.pn !== p.pn) continue;
      for (const k of ['cl', 'cr', 'cr2']) if (p[k] === f.from) { p[k] = f.to; log.push(`${p.pn} ${k}: ${f.from} -> ${f.to}`); }
    }
    for (const f of PART_FIXES) {
      if (f.pn !== p.pn) continue;
      for (const [k, v] of Object.entries(f.set)) if (p[k] !== v) { log.push(`${p.pn} ${k}: ${p[k]} -> ${v}`); p[k] = v; }
    }
  }
  fixPipe(rm, log);
  fixSlots(rm, log);
  const pipeCrs = new Set(Object.values(rm.parts).filter((p) => p.type === 'Drill_Pipe').map((p) => p.cr));
  for (const r of REMOVALS) {
    if (pipeCrs.has(r.unlessPipeCr)) continue;
    for (const s of rm.sections) {
      const before = s.opts.length;
      s.opts = s.opts.filter((o) => rm.parts[o.id]?.pn !== r.pn);
      if (s.opts.length !== before) log.push(`removed ${r.pn} from ${s.mode} / ${s.name}`);
    }
  }
  return log;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const check = process.argv.includes('--check');
  let total = 0;
  for (const f of readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
    const path = join(DIR, f), raw = readFileSync(path, 'utf8'), rm = JSON.parse(raw);
    const log = fixRoadmap(rm);
    if (!log.length) continue;
    total += log.length;
    console.log(`${f}:\n  ${log.join('\n  ')}`);
    if (!check) writeFileSync(path, JSON.stringify(rm, null, raw.includes('\n ') ? 1 : 0) + (raw.endsWith('\n') ? '\n' : ''));
  }
  console.log(`${total} change(s)${check ? ' pending (--check, nothing written)' : ' written'}`);
}
