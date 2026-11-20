#!/usr/bin/env node
/*
 * Build a normalized connection-code vocabulary for the Ditch Witch catalog so
 * third-party parts (e.g. Radius HDD, labelled by thread name + pin/box) can be
 * matched to configurator slots.
 *
 *   node tools/dw_connections.mjs                 -> writes data/radius/dw-connections.json
 *   node tools/dw_connections.mjs --table JT9     -> also prints a markdown slot table for one model
 *
 * Conventions (from js/compatibility.mjs): `cl` is the rig-side connection of a part,
 * `cr`/`cr2` the bit-side connection(s). A joint mates when swapGender(L.cr) === R.cl,
 * so "M" = pin (male) and "F" = box (female). Codes without M/F (bit bolt patterns,
 * spline drives, pull tabs) are matched by identical string.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const OUT = join(DATA, 'radius', 'dw-connections.json');
const SIDES = ['cl', 'cr', 'cr2'];

const catalog = JSON.parse(readFileSync(join(DATA, 'catalog.json'), 'utf8'));

/* ---------- parsing ---------- */

const clean = (s) => s.replace(/[®™]/g, '').replace(/\s+/g, ' ').trim();

/** Split a raw code into { base, gender }. Gender is 'M' | 'F' | null. */
export function parseCode(raw) {
  const s = clean(raw);
  const toks = s.split(' ');
  const gi = toks.findIndex((t) => t === 'M' || t === 'F');
  if (gi >= 0) return { base: toks.filter((_, i) => i !== gi).join(' '), gender: toks[gi] };
  // glued gender suffix: "3.25M", "350F", "2.25-6F" (but not "5-12MM")
  const glued = toks.findIndex((t) => /^[\d.#-]+[MF]$/.test(t) && !/MM$/.test(t));
  if (glued >= 0) {
    const t = toks[glued];
    toks[glued] = t.slice(0, -1);
    return { base: toks.join(' '), gender: t.slice(-1) };
  }
  return { base: s, gender: null };
}

const frac = { '2.38': '2-3/8"', '2.88': '2-7/8"', '3.5': '3-1/2"', '4.5': '4-1/2"', '5.5': '5-1/2"', '2.0': '2"' };

/**
 * Classify a gender-less base code into a family + human thread name.
 * `ev` = evidence: { pipeNames:Set, types:Set } gathered from parts using the code.
 */
function classify(base, ev) {
  let m;
  const pipeHint = ev.pipeNames.size ? ` (rod: ${[...ev.pipeNames].slice(0, 3).join('; ')})` : '';
  if ((m = base.match(/^(\d\.\d+) API (IF|R)$/))) {
    const [, sz, k] = m;
    const kind = k === 'IF' ? 'API IF (internal flush)' : 'API Reg';
    const nc = { '2.38 IF': 'NC26', '2.88 IF': 'NC31', '3.5 IF': 'NC38', '4.5 IF': 'NC50' }[`${sz} ${k}`];
    if (sz === '2.0')
      return { family: 'api', kind: 'thread', threadName: '"2.0 API IF" (DW label; no standard 2" IF - probably DW\'s name for its 2" small-tool rotary shoulder; verify against a spec sheet)', confidence: 'low' };
    return { family: 'api', kind: 'thread', threadName: `${frac[sz] || sz + '"'} ${kind}${nc ? ' / ' + nc : ''}`, confidence: 'high' };
  }
  if ((m = base.match(/^(\d\.\d+) FH$/))) return { family: 'api', kind: 'thread', threadName: `${frac[m[1]] || m[1]} API Full Hole`, confidence: 'high' };
  if ((m = base.match(/^(\d\.\d+) API$/)))
    return { family: 'api', kind: 'thread', threadName: `${frac[m[1]] || m[1]} API (IF vs Reg not stated)`, confidence: 'low' };
  if ((m = base.match(/^Hawkeye (\d{3})$/))) return { family: 'hawkeye', kind: 'quick-connect', threadName: `DW Hawkeye ${m[1]} quick-connect (octagon collar thread)`, confidence: 'high' };
  if ((m = base.match(/^(\d{3})$/))) return { family: 'hawkeye', kind: 'quick-connect', threadName: `DW Hawkeye ${m[1]} quick-connect (code missing "Hawkeye" prefix in source data)`, confidence: 'medium' };
  if ((m = base.match(/^SPLKII (\d{3})$/))) return { family: 'splinelok', kind: 'quick-connect', threadName: `DW SplineLok II ${m[1]} (non-rotational spline quick-connect)`, confidence: 'high' };
  if ((m = base.match(/^(\d\.\d+) S-CONN$/))) return { family: 'switch-connect', kind: 'quick-connect', threadName: `DW Switch-Connect ${m[1]}"`, confidence: 'high' };
  if ((m = base.match(/^(\d\.\d+(?:-\d)?) EZ(\d)$/)))
    return { family: 'ez-connect', kind: 'quick-connect', threadName: `DW EZ Connect gen ${m[2]}, ${m[1]} thread`, confidence: 'high' };
  if ((m = base.match(/^(\d\.\d+) LPT$/))) return { family: 'lpt', kind: 'thread', threadName: `LPT ${m[1]} (starter-rod/connector thread, DW "LPT" series)`, confidence: 'medium' };
  if ((m = base.match(/^#(\d+)$/)))
    return { family: 'vermeer-rod', kind: 'thread', threadName: `Vermeer-pattern rod thread #${m[1]} (DW Forged/HIWS1 pipe for Vermeer rigs)${pipeHint}`, confidence: 'medium' };
  if ((m = base.match(/^(\d\.\d+)(SS|DS)?(?:-(\d))?$/))) {
    const [, sz, sh, tpi] = m;
    const shoulder = sh === 'SS' ? ' single-shoulder' : sh === 'DS' ? ' double-shoulder' : '';
    const t = tpi ? `, ${tpi} TPI` : '';
    if (ev.pipeNames.size)
      return { family: 'dw-rod', kind: 'thread', threadName: `DW ${sz}${shoulder} rod thread${t}${pipeHint}`, confidence: 'high' };
    return { family: 'dw-tool', kind: 'thread', threadName: `DW ${sz}${shoulder} tool thread${t} (no drill pipe uses it; sub/connector/reamer joint)`, confidence: 'medium' };
  }
  if ((m = base.match(/^(\d)-(\d+)MM$/))) return { family: 'bit-bolt', kind: 'bolt-pattern', threadName: `${m[1]}-bolt x ${m[2]} mm bit bolt pattern (not a thread)`, confidence: 'high' };
  if ((m = base.match(/^(\d)-(\d\/\d)"$/))) return { family: 'bit-bolt', kind: 'bolt-pattern', threadName: `${m[1]}-bolt x ${m[2]}" bit bolt pattern (not a thread)`, confidence: 'high' };
  if ((m = base.match(/^(\d\.\d+)"(?: Spline)?$/))) return { family: 'trihawk-spline', kind: 'spline-drive', threadName: `TriHawk ${m[1]}" square spline drive (not a thread)`, confidence: 'high' };
  if ((m = base.match(/^(\d+K) (Tab|Flange|Swivel|Socket)$/))) return { family: 'pullback', kind: 'pullback', threadName: `${m[1]} ${m[2].toLowerCase()} (pullback hardware rating)`, confidence: 'high' };
  if (/^Pull Tab$/.test(base)) return { family: 'pullback', kind: 'pullback', threadName: 'Switch-Connect pull tab', confidence: 'medium' };
  if ((m = base.match(/^(\d+)" QL Shank$/))) return { family: 'air-hammer', kind: 'shank', threadName: `${m[1]}" QL air-hammer shank`, confidence: 'high' };
  return { family: 'unknown', kind: 'unknown', threadName: base, confidence: 'low' };
}

/* ---------- walk ---------- */

const codes = new Map(); // raw code -> stats
const stat = (raw) => {
  if (!codes.has(raw)) codes.set(raw, { raw, parts: new Map(), occurrences: 0, types: new Set(), machines: new Set(), pipes: new Set(), pipeNames: new Set(), sides: new Set() });
  return codes.get(raw);
};

const rmCache = new Map();
const loadRm = (id) => {
  if (!rmCache.has(id)) {
    try { rmCache.set(id, JSON.parse(readFileSync(join(DATA, 'roadmaps', `${id}.json`), 'utf8'))); }
    catch { rmCache.set(id, null); }
  }
  return rmCache.get(id);
};

const machinesOut = [];
const missingRoadmaps = [];
for (const mach of catalog.machines) {
  const mOut = { brand: mach.brand, model: mach.model, size: mach.size, pipes: [] };
  machinesOut.push(mOut);
  for (const pipe of mach.pipes) {
    const rm = loadRm(pipe.roadmap);
    if (!rm) { missingRoadmaps.push(`${mach.model}/${pipe.pn}/${pipe.roadmap}`); continue; }
    const P = rm.parts;
    const pipePart = P[pipe.id] || Object.values(P).find((p) => p.type === 'Drill_Pipe');
    const label = `${mach.brand} ${mach.model}`;
    const pipeLabel = `${mach.model} | ${pipe.name} [${pipe.pn}]`;
    const seenHere = new Set();
    const note = (part, role) => {
      for (const side of SIDES) {
        const raw = part[side];
        if (!raw) continue;
        const s = stat(raw);
        s.occurrences++;
        s.sides.add(side);
        s.types.add(part.type || role || 'Accessory');
        s.machines.add(label);
        s.pipes.add(pipeLabel);
        if (part.type === 'Drill_Pipe') s.pipeNames.add(part.name);
        if (!s.parts.has(part.id)) s.parts.set(part.id, { pn: part.pn, name: part.name, type: part.type || role || 'Accessory', side });
      }
    };
    const slots = [];
    for (const sec of rm.sections) {
      const cl = new Set(), cr = new Set(), acc = new Set();
      for (const o of sec.opts) {
        const p = P[o.id];
        if (!p) continue;
        if (!seenHere.has(p.id)) { note(p); seenHere.add(p.id); }
        if (p.cl) cl.add(clean(p.cl));
        for (const k of ['cr', 'cr2']) if (p[k]) cr.add(clean(p[k]));
        for (const a of o.acc || []) {
          const ap = P[a];
          if (!ap) continue;
          if (!seenHere.has(ap.id)) { note(ap, 'Accessory'); seenHere.add(ap.id); }
          acc.add(`${ap.pn} ${clean(ap.cl || '-')} > ${clean(ap.cr || '-')}`);
        }
      }
      slots.push({ mode: sec.mode, slot: sec.name, options: sec.opts.length, rigSide: [...cl].sort(), bitSide: [...cr].sort(), ...(acc.size ? { adapters: [...acc].sort() } : {}) });
    }
    mOut.pipes.push({
      name: pipe.name, pn: pipe.pn, roadmap: pipe.roadmap,
      pipeConnections: pipePart ? { rigSide: clean(pipePart.cl || ''), bitSide: clean(pipePart.cr || '') } : null,
      slots,
    });
  }
}

/* ---------- vocabulary ---------- */

const swapGender = (g) => (g === 'M' ? 'F' : g === 'F' ? 'M' : null);
// pool drill-pipe evidence across genders/spellings of the same size ("3.25SS M" pipe pin + "3.25 F" pipe box)
const poolKey = (base) => base.replace(/^(\d\.\d+)(SS|DS)\b/, '$1');
const pooled = new Map();
for (const s of codes.values()) {
  const k = poolKey(parseCode(s.raw).base);
  pooled.set(k, new Set([...(pooled.get(k) || []), ...s.pipeNames]));
}
const evidenceFor = (s) => ({ ...s, pipeNames: pooled.get(poolKey(parseCode(s.raw).base)) || s.pipeNames });
const connections = [...codes.values()].map((s) => {
  const { base, gender } = parseCode(s.raw);
  const c = classify(base, evidenceFor(s));
  const quirks = [];
  if (s.raw !== s.raw.trim()) quirks.push('trailing/leading whitespace in source code');
  if (/ {2}/.test(s.raw)) quirks.push('double space in source code');
  if (gender && !new RegExp(`(^| )${gender}( |$)`).test(clean(s.raw))) quirks.push('gender glued to size (no space)');
  return {
    code: s.raw,
    base,
    key: gender ? `${base}|${gender}` : base,
    gender,
    end: gender === 'M' ? 'pin' : gender === 'F' ? 'box' : null,
    matesWith: gender ? `${base}|${swapGender(gender)}` : base,
    family: c.family,
    kind: c.kind,
    threadName: c.threadName,
    confidence: c.confidence,
    partCount: s.parts.size,
    occurrences: s.occurrences,
    usedAs: [...s.sides].sort(),
    partTypes: [...s.types].sort(),
    sampleParts: [...s.parts.values()].slice(0, 6),
    machineCount: s.machines.size,
    machines: [...s.machines].sort(),
    pipes: [...s.pipes].sort(),
    ...(quirks.length ? { quirks } : {}),
  };
}).sort((a, b) => a.family.localeCompare(b.family) || a.base.localeCompare(b.base, 'en', { numeric: true }) || String(a.gender).localeCompare(String(b.gender)));

// codes whose normalized key collides (same base+gender, different raw spelling)
const byKey = new Map();
for (const c of connections) byKey.set(c.key, [...(byKey.get(c.key) || []), c.code]);
const aliases = [...byKey].filter(([, v]) => v.length > 1).map(([key, raw]) => ({ key, raw }));
// bases present with only one gender (nothing in-catalog to mate with)
const keys = new Set(connections.map((c) => c.key));
const unmated = connections.filter((c) => c.gender && !keys.has(c.matesWith)).map((c) => c.code);

const out = {
  generated: new Date().toISOString().slice(0, 10),
  source: `data/catalog.json (${catalog.source}, fetched ${catalog.fetched}) + data/roadmaps/*.json`,
  conventions: {
    cl: 'rig-side connection of a part (toward the drill)',
    cr: 'bit-side connection (toward the bit/reamer); cr2 = alternate bit-side connection',
    M: 'pin (male)', F: 'box (female)',
    mating: 'parts mate when bit-side of upstream part has the opposite gender of the downstream rig-side with the same base (js/compatibility.mjs swapGender)',
    key: 'normalized "base|gender" (whitespace collapsed, ®/™ removed, glued gender split off)',
  },
  stats: { distinctRawCodes: connections.length, distinctKeys: byKey.size, machines: catalog.machines.length, missingRoadmaps },
  aliases,
  unmatedCodes: unmated,
  connections,
  machines: machinesOut,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${OUT}: ${connections.length} raw codes, ${byKey.size} normalized keys, ${machinesOut.length} machines`);

/* ---------- optional slot table ---------- */

const ti = process.argv.indexOf('--table');
if (ti > 0) {
  const model = process.argv[ti + 1];
  const mach = catalog.machines.find((m) => m.model === model);
  if (!mach) { console.error(`no machine ${model}`); process.exit(1); }
  const nameOf = (raw) => { const c = codes.get(raw); if (!raw || !c) return '-'; const { base } = parseCode(raw); return classify(base, evidenceFor(c)).threadName; };
  for (const pipe of mach.pipes) {
    const rm = loadRm(pipe.roadmap);
    if (!rm) continue;
    console.log(`\n### ${mach.brand} ${mach.model} - ${pipe.name} [${pipe.pn}] (roadmap ${pipe.roadmap})\n`);
    console.log('| Mode | Slot | DW P/N | Part | Rig side (cl) | Bit side (cr/cr2) | Adapters |');
    console.log('|---|---|---|---|---|---|---|');
    for (const sec of rm.sections) for (const o of sec.opts) {
      const p = rm.parts[o.id];
      if (!p) continue;
      const bit = [p.cr, p.cr2].filter(Boolean).map(clean).join(' / ') || '-';
      const accs = (o.acc || []).map((a) => rm.parts[a]).filter(Boolean).map((a) => `${a.pn} (${clean(a.cl || '-')}>${clean(a.cr || '-')})`).join(', ');
      console.log(`| ${sec.mode} | ${sec.name} | ${p.pn} | ${clean(p.name)} | ${clean(p.cl || '-')} | ${bit} | ${accs} |`);
    }
  }
  const used = new Set();
  for (const pipe of mach.pipes) { const rm = loadRm(pipe.roadmap); if (rm) for (const p of Object.values(rm.parts)) for (const s of SIDES) if (p[s]) used.add(p[s]); }
  console.log(`\n### ${mach.model} connection legend\n`);
  for (const raw of [...used].sort()) console.log(`- \`${clean(raw)}\` -> ${nameOf(raw)}`);
}
