#!/usr/bin/env node
// Idempotent corrections to the hddadvisor.com roadmap data in data/roadmaps/.
// Re-run after any re-fetch:  node tools/fix_catalog.mjs   (add --check to report without writing)
// Each fix is evidence-based (see `why`); ambiguous connections are listed in FIX_HANDOFF.md, not guessed here.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'roadmaps');

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

export function fixRoadmap(rm) {
  const log = [];
  for (const p of Object.values(rm.parts)) {
    for (const f of CODE_FIXES) {
      if (f.pn && f.pn !== p.pn) continue;
      for (const k of ['cl', 'cr', 'cr2']) if (p[k] === f.from) { p[k] = f.to; log.push(`${p.pn} ${k}: ${f.from} -> ${f.to}`); }
    }
    for (const f of PART_FIXES) {
      if (f.pn !== p.pn) continue;
      for (const [k, v] of Object.entries(f.set)) if (p[k] !== v) { log.push(`${p.pn} ${k}: ${p[k]} -> ${v}`); p[k] = v; }
    }
  }
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
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
