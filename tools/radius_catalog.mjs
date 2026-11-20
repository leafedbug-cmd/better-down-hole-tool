#!/usr/bin/env node
/*
 * Radius HDD print catalog (2022, vol. 8) -> data/radius/parts.json + data/radius/crossref.json
 *
 *   node tools/radius_catalog.mjs --pdf "<Radius catalog>.pdf"     (runs `pdftotext -layout`)
 *   node tools/radius_catalog.mjs --txt radius-layout.txt          (output of `pdftotext -layout`)
 *   ... [--report JT9] [--dry]
 *
 * Pipeline:
 *   1. split the layout text into pages, track the current table heading (SECTIONS) and collect
 *      rows that start with a Radius part number;
 *   2. interpret each row with its section's column layout + a small thread grammar (parseEnd) that
 *      turns Radius thread text ("2\" IF Pin", "1.30-5 DW Pipe Pin", "1.63-6 EZ2 Box") into the
 *      Ditch Witch connection codes used in data/roadmaps ("2.0 M API IF", "1.30 M", "1.63 F EZ2");
 *   3. CURATED rows replace tables whose layout columns are interleaved (housings, cobble and single
 *      roller cone bits, collars, 5000-series subs); they were checked against `pdftotext -raw`;
 *   4. keep Ditch Witch-compatible rows, generic rows whose threads are all DW codes, and Vermeer-table
 *      rows only when their threads exactly match a DW roadmap part (e.g. HDX Firestick connectors);
 *   5. cross-reference every DW roadmap part to Radius parts of the same slot family.
 * Prices are never read into the output.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const OUT_PARTS = join(DATA, 'radius', 'parts.json');
const OUT_XREF = join(DATA, 'radius', 'crossref.json');
const SOURCE = 'Radius HDD 2022 catalog (vol. 8) + radiushdd.com';
const FETCHED = '2026-11-20';

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const DRY = argv.includes('--dry');

/* ------------------------------------------------------------------ input */

function loadText() {
  const pdf = arg('--pdf') || process.env.RADIUS_CATALOG_PDF;
  const txt = arg('--txt') || process.env.RADIUS_CATALOG_TXT;
  if (txt && existsSync(txt)) {
    const buf = readFileSync(txt);
    const u = buf.toString('utf8');
    return u.includes('�') ? buf.toString('latin1') : u; // pdftotext default output is Latin-1/cp1252
  }
  if (pdf && existsSync(pdf)) return execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  console.error('usage: node tools/radius_catalog.mjs --pdf <catalog.pdf> | --txt <pdftotext -layout output> [--report JT9] [--dry]');
  process.exit(2);
}

/** Normalize typography: drop ®/™/replacement chars, cp1252 dashes/quotes -> ASCII. */
const norm = (s) => s
  .replace(/[–—\u0096\u0097­]/g, '-')
  .replace(/[“”″\u0093\u0094]/g, '"')
  .replace(/[‘’\u0092]/g, "'")
  .replace(/[®™�\u0080-\u009F]/g, '')
  .replace(/×/g, 'x');
const clean = (s) => norm(String(s)).replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------------ Ditch Witch side */

const catalog = JSON.parse(readFileSync(join(DATA, 'catalog.json'), 'utf8'));
const MACHINE_BY_ID = new Map(catalog.machines.map((m) => [m.id, `${m.brand} ${m.model}`]));
const DW_MODELS = new Set(catalog.machines.filter((m) => m.brand === 'Ditch Witch').map((m) => m.model));

/** "base|gender" key, same convention as tools/dw_connections.mjs (® removed, whitespace collapsed). */
export function codeKey(raw) {
  if (!raw) return null;
  const toks = clean(raw).split(' ');
  let g = '';
  const gi = toks.findIndex((t) => t === 'M' || t === 'F');
  if (gi >= 0) { g = toks[gi]; toks.splice(gi, 1); } else {
    const glued = toks.findIndex((t) => /^[\d.#-]+[MF]$/.test(t) && !/MM$/.test(t));
    if (glued >= 0) { g = toks[glued].slice(-1); toks[glued] = toks[glued].slice(0, -1); }
  }
  return `${toks.join(' ').toLowerCase()}|${g}`;
}

const VOCAB = new Map(); // codeKey -> DW raw code (first seen)
const DW = new Map(); // pn -> { pn, name, type, cl, cr, cr2, size, machines:Set, roadmaps:Set }
const ROADMAPS = [];
for (const f of readdirSync(join(DATA, 'roadmaps')).filter((x) => x.endsWith('.json')).sort()) {
  const rm = JSON.parse(readFileSync(join(DATA, 'roadmaps', f), 'utf8'));
  ROADMAPS.push(rm);
  const machine = MACHINE_BY_ID.get(rm.machine);
  for (const p of Object.values(rm.parts || {})) {
    if (!p?.pn) continue;
    for (const side of ['cl', 'cr', 'cr2']) if (p[side] && !VOCAB.has(codeKey(p[side]))) VOCAB.set(codeKey(p[side]), p[side]);
    const pn = String(p.pn).trim();
    if (!DW.has(pn)) {
      const sizeTxt = p.specs?.['Cut diameter'] || p.name;
      const m = String(sizeTxt).match(/^\s*(\d+(?:\.\d+)?)/);
      DW.set(pn, { pn, name: clean(p.name), type: p.type || 'Accessory', cl: p.cl || null, cr: p.cr || null, cr2: p.cr2 || null,
        size: m ? Number(m[1]) : null, machines: new Set(), roadmaps: new Set() });
    }
    if (machine) DW.get(pn).machines.add(machine);
    DW.get(pn).roadmaps.add(rm.id);
  }
}
const inVocab = (code) => !!code && VOCAB.has(codeKey(code));
const dwCode = (code) => (code && VOCAB.get(codeKey(code))) || code || null;

/* ------------------------------------------------------------------ machines */

const CANON = {
  JT5: 'JT5', JT520: 'JT520', JT922: 'JT922', JT9: 'JT9', JT10: 'JT10', JT1220: 'JT1220', JT1220M1: 'JT1220',
  JT2020: 'JT2020', JT2020M1: 'JT2020', JT20: 'JT20', JT24: 'JT24', JT25: 'JT25', JT30: 'JT30',
  JT2720M1: 'JT2720 Mach 1', AT2720: 'JT2720 All Terrain', JT3020M1: 'JT3020', JT4020M1: 'JT4020 Mach 1',
  AT4020: 'JT4020 All Terrain', JT8020: 'JT8020', JT8020M1: 'JT8020', JT100: 'JT100', JT100M1: 'JT100',
  AT100: 'AT100', JT40: 'JT40', AT40: 'AT40', JT60: 'JT60',
};
for (const v of Object.values(CANON)) if (!DW_MODELS.has(v)) throw new Error(`model alias target not in catalog.json: ${v}`);

/** Parse a Radius "fits model" cell into { machines: ["Ditch Witch JT922"], raw: ["JT920L", ...], other: bool }. */
export function parseModels(text) {
  const machines = new Set(), raw = new Set();
  let other = false, prefix = 'JT';
  for (let tok of clean(text || '').split(/\s*[\/,]\s*|\s+-\s+/)) {
    tok = tok.replace(/\((?:[SL]-Flange)\)|\b(Box|Pin) Down\b|\bCoarse\b|\bFine Thread\b|\bLead Rod\b|\bOuter Rod.*$/gi, '').trim();
    if (!tok) continue;
    if (/^DW$|^Ditch Witch$/i.test(tok)) continue; // "fits any Ditch Witch"
    tok = tok.replace(/^(JT|AT)\s+(?=\d)/i, '$1');
    let t = tok.toUpperCase().replace(/\s+/g, '').replace(/MACH1$/, 'M1');
    const m = t.match(/^(JT|AT)?(\d{1,4})(M1)?(AT)?(M1)?$/);
    if (!m) { if (/^D?\d+X\d+/.test(t) || /^(D|RM|DD|ZT)/.test(t)) other = true; raw.add(tok); continue; }
    let [, p, num, m1a, at, m1b] = m;
    p = p || prefix; prefix = p;
    const isAT = p === 'AT' || !!at;
    const key = isAT ? `AT${num}` : `JT${num}${m1a || m1b ? 'M1' : ''}`;
    const model = CANON[key];
    if (model) machines.add(`Ditch Witch ${model}`); else raw.add(tok);
  }
  return { machines: [...machines], raw: [...raw], other };
}

/* Radius rig-compatibility tables (series -> Ditch Witch models). */
const SERIES_HOUSING = { // p.15 "Rig compatibility - Ditch Witch compatible"
  2700: 'JT920 / JT920L / JT921 / JT922 / JT1220',
  3000: 'JT1220 Mach1 / JT1720 / JT1720 Mach1 / JT2020 Mach1',
  3500: 'JT25 / JT2720 / 2720M1 / AT2720 / JT3020M1 / AT3020 / JT4020 / JT4020M1',
  4500: 'JT7020 Mach1 / JT8020 Mach1 / JT100 / AT100',
  5000: 'JT100 / AT100',
};
const SERIES_ROCKBIT = { // p.21
  2750: 'JT920 / JT920L / JT921 / JT922', 3000: 'JT1220 Mach1 / JT1720 / JT1720 Mach1 / JT2020 Mach1',
  3500: 'JT25 / JT2720 / 2720M1 / AT2720 / JT3020M1 / AT3020 / JT4020 / JT4020M1 / AT4020',
  4500: 'JT7020 Mach1 / JT8020 Mach1 / JT100 / AT100', 5000: 'JT100 / AT100',
};
const SERIES_COBBLE = { // p.25
  3500: 'JT25 / JT2720 / JT2720 M1 / AT2720 / JT3020M1 / AT3020 / JT4020 / JT4020M1 / AT4020',
  4500: 'JT7020M1 / JT8020M1 / JT100 / AT100', 5000: 'JT100 / AT100',
};
const SERIES_SRC = { // p.26
  3000: 'JT1220 Mach1 / JT1720 / JT1720 Mach1 / JT2020 Mach1',
  3500: 'JT25 / JT2720 / 2720M1 / AT2720 / JT3020M1 / AT3020 / JT4020 / JT4020M1',
  4500: 'JT7020 Mach1 / JT8020 Mach1 / JT100 / AT100',
};

/* ------------------------------------------------------------------ thread grammar */

const PIPE = { // Radius pipe-thread size -> [DW base code, printed pitch]
  '1.1': ['1.1', 5], '1.10': ['1.1', 5], '1.21': ['1.21', 6], '1.3': ['1.30', 5], '1.30': ['1.30', 5], '1.41': ['1.41', 6],
  '1.47': ['1.47', 4], '1.69': ['1.69', 6], '1.76': ['1.76', 4], '1.94': ['1.94', 4], '2.10': ['2.10-4', 4], '2.1': ['2.10-4', 4],
  '2.11': ['2.11', 4], '2.4': ['2.40', 4], '2.40': ['2.40', 4], '2.46': ['2.46', 4], '2.59': ['2.59', 4], '2.77': ['2.77', 4],
  '2.95': ['2.95-4', 4], '3.25': ['3.25', 4], '3.27': ['3.27', 4], '3.44': ['3.44', 4],
};
const EZ = { '1.31': '1.31', '1.63': '1.63', '1.88': '1.88', '2': '2.0', '2.0': '2.0', '2.00': '2.0', '2.25': '2.25', '2.63': '2.63', '3.5': '3.5' };
const API_SIZE = { '2': '2.0', '2.375': '2.38', '2-3/8': '2.38', '2.875': '2.88', '2-7/8': '2.88', '3.5': '3.5', '3-1/2': '3.5', '4.5': '4.5', '4-1/2': '4.5', '6.625': '6.63', '6-5/8': '6.63' };
const FS_BY_DIA = { '2-3/8': 600, '2-7/8': 900, '1.66': 200, '1.9': 250, '1.90': 250, '2.06': 400, '2.375': 600, '2.625': 700, '2.875': 900 };

const genderOf = (s, dflt) => {
  if (/\bpin\b|\bPxP\b|\bM\b|MEZ/i.test(s) && !/\bM\b.*\bF\b/.test(s)) return /\bbox\b/i.test(s) ? 'F' : 'M';
  if (/\bbox\b|\bF\b/i.test(s)) return 'F';
  return dflt;
};

/**
 * One connection end -> { code, fam, raw, dw, bad? }.
 *   code: DW-style connection string (may be outside our roadmap vocabulary, e.g. "2.40 M")
 *   dw:   true when the code exists in data/roadmaps; false = recognised thread with no DW equivalent
 *   fam:  ez | hawk | lpt | fs | api | pipe | fh | bolt | swivel | prop (Radius proprietary / pulling eye) | ? (unparsed)
 */
export function parseEnd(text, dflt = null) {
  const raw = clean(text);
  const s = raw.replace(/"/g, '');
  const g = genderOf(s, dflt);
  const out = (fam, code, extra = {}) => ({ fam, code, raw, dw: inVocab(code), ...extra });
  let m;
  if (/R-?\s?Box|R-Pin|Radius Pin|Pulling Eye|Pull Tab|S to S/i.test(s)) return out('prop', null);
  if ((m = s.match(/hawkeye\s*(\d{3})/i))) return out('hawk', g && `Hawkeye ${m[1]} ${g}`);
  if ((m = s.match(/(\d+(?:\.\d+)?)\s*(?:-\s*6)?\s*(?:DW\s+)?M?\s*EZ\s*([23])?\b/i))) {
    if (m[1] === '2.85') return out('ez', g && `2.85-6 ${g}`);
    const sz = EZ[m[1]];
    if (!sz) return out('ez', null, { bad: `EZ size ${m[1]} is not a Ditch Witch EZ thread` });
    return out('ez', g && `${sz} ${g} EZ${m[2] || '2'}`, m[2] ? {} : { note: `"${m[1]} EZ" read as EZ2 (only ${sz} EZ2 exists)` });
  }
  if (/firestick|\bFS\s?(1|I|II)?\b|FS1/i.test(s)) {
    m = s.match(/\((\d{3,4})\)/) || s.match(/(?:firestick|FS1?)\s*(?:II?\s*)?(\d{3,4})/i) || s.match(/^(\d{3,4})\s*firestick/i);
    let n = m ? Number(m[1]) : null;
    if (!n) { const d = s.match(/(\d\.\d+|\d-\d\/\d)/); n = d ? FS_BY_DIA[d[1]] : null; }
    if (n === 600 && /firestick\s*II\b|FSII/i.test(s)) n = 602;
    return out('fs', n && g ? `#${n} ${g}` : null);
  }
  if ((m = s.match(/(1\.625|2\.125)\s*Low Profile/i))) return out('lpt', g && `${m[1] === '1.625' ? '1.62' : '2.125'} LPT ${g}`);
  if ((m = s.match(/(\d+(?:\.\d+)?|\d-\d\/\d)\s*Full Hole/i))) return out('fh', m[1] === '5.5' && g ? `5.5 ${g} FH` : null, m[1] === '5.5' ? {} : { nonDw: true });
  if ((m = s.match(/(\d-\d\/\d|\d+(?:\.\d+)?)\s*(?:API\s*)?(IF|Reg)\b/i))) {
    const sz = API_SIZE[m[1]];
    if (!sz) return out('api', null, { bad: `API size ${m[1]}` });
    return out('api', g && `${sz} ${g} API ${/IF/i.test(m[2]) ? 'IF' : 'R'}`);
  }
  if ((m = s.match(/(\d)\s*Bolt\s*\(\s*(\d+)\s*mm\s*\)/i))) return out('bolt', `${m[1]}-${m[2]}MM`);
  if ((m = s.match(/6\s*Bolt\s*\(\s*0?\.(5|625|75)\s*-\s*(13|11|10)\s*\)/i))) return out('bolt', { 5: '6-1/2"', 625: '6-5/8"', 75: '6-3/4"' }[m[1]]);
  if ((m = s.match(/(\d+)K\s*Swivel/i))) { // built-in reamer swivel: a DW code only where DW uses that rating (20K/30K/40K/70K)
    const c = `${m[1]}K Swivel`;
    return inVocab(c) ? out('swivel', c) : out('prop', null);
  }
  if ((m = s.match(/(\d\.\d{1,2})\s*(?:-\s*(\d))?\s*(?:Coarse Thread\s*)?(?:DW|Dw|Ditch Witch|AT)?\s*(?:Pipe\s*)?(Pin|Box|M|F)\b/i))) {
    const p = PIPE[m[1]];
    if (!p) return out('pipe', null, { bad: `pipe thread ${m[1]}` });
    if (m[2] && Number(m[2]) !== p[1]) return out('pipe', null, { bad: `printed ${m[1]}-${m[2]}, but ${m[1]} DW pipe is -${p[1]} everywhere else in the catalog` });
    return out('pipe', g && `${p[0]} ${g}`, { pipeWord: /pipe/i.test(s) });
  }
  return out('?', null);
}

/** Split a description into connection ends ("A x B", "A / B", "A, B", "A Box x Box", "A Box to Box"). */
export function splitEnds(desc) {
  let s = clean(desc).replace(/^(SUB|Radius Sub)\s*-?\s*/i, '');
  const bb = s.match(/^(.*?\b)(Box|Pin)\s+(?:x|to)\s+(Box|Pin)\b(.*)$/i);
  if (bb && !/\d/.test(bb[3] + bb[4].replace(/\(.*?\)/g, ''))) return { ends: [`${bb[1]}${bb[2]}`, `${bb[1]}${bb[3]}`], sep: 'x' };
  if (/\s\/\s/.test(s)) return { ends: s.split(/\s+\/\s+/), sep: '/' };
  const parts = s.split(/\s+x\s+|,\s+|\s+to\s+/i).filter(Boolean);
  return { ends: parts, sep: 'x' };
}

const RANK = (e) => {
  const G = e.code ? e.code.match(/\b([MF])\b/)?.[1] : null;
  switch (e.fam) {
    case 'ez': return G === 'F' ? 6 : 2;
    case 'hawk': case 'lpt': return G === 'M' ? 6 : 2;
    case 'fs': return 5;
    case 'api': return G === 'F' ? 4.5 : 1;
    case 'pipe': return 4;
    case 'fh': return 3;
    default: return 0;
  }
};
/** Order two sub ends as [rig side, bit side] (DW convention: EZ box / Hawkeye pin > Firestick > API box > pipe > API pin). */
function orient(a, b, sep) {
  const ra = RANK(a), rb = RANK(b);
  if (ra !== rb) return ra > rb ? [a, b] : [b, a];
  if (a.pipeWord !== b.pipeWord) return a.pipeWord ? [a, b] : [b, a];
  if (sep === '/') return [a, b];
  const ga = /\bF\b/.test(a.code || ''), gb = /\bF\b/.test(b.code || '');
  if (ga !== gb) return ga ? [a, b] : [b, a];
  return [a, b];
}

/* ------------------------------------------------------------------ sections */

const SKIP = { skip: true };
const CUR = { skip: true, curated: true };
// [heading regex (tested against the normalized, trimmed line), section config]
const SECTIONS = [
  [/^DITCH WITCH COMPATIBLE 1 PC\. DRIVE CHUCKS/, { brand: 'DW', kind: 'saver', cols: ['models', 'thread', 'len'] }],
  [/^DITCH WITCH COMPATIBLE CONVERSION SUB SAVERS/, { brand: 'DW', kind: 'saver', cols: ['models', 'thread', 'len'] }],
  [/^DITCH WITCH COMPATIBLE CONVERSION DRIVE CHUCKS/, { brand: 'DW', kind: 'saver', cols: ['models', 'thread', 'len'], chuck: true }],
  [/^ASTEC \/ TORO|^MISC\. SUB SAVERS|^THREAD LOCK EPOXY/, SKIP],
  [/^VERMEER COMPATIBLE (2 PC\. DRIVE CHUCK|DRIVE CHUCKS|COLLARS)/, SKIP],
  [/^DITCH WITCH COMPATIBLE OCTAGON COLLARS/, CUR],
  [/^VERMEER COMPATIBLE STARTER RODS/, { brand: 'VM', kind: 'sub', cols: ['desc'] }], // fits-model column is interleaved; desc is on the pn line
  [/^COMPATIBLE QUICK CONNECT$/, { brand: 'DW', kind: 'sub', cols: ['desc', 'models'] }],
  [/^DITCH WITCH COMPATIBLE QUICK CONNECTS/, { brand: 'DW', kind: 'sub', cols: ['desc', 'models'] }],
  [/^TRANSITION SUBS$/, { brand: 'DW', kind: 'sub', cols: ['desc', 'models'] }],
  [/^DITCH WITCH COMPATIBLE ADAPTERS TO CONNECT/, { brand: 'DW', kind: 'sub', cols: ['desc', 'models'] }],
  [/^VERMEER COMPATIBLE ADAPTERS TO CONNECT/, { brand: 'VM', kind: 'sub', cols: ['desc', 'models'] }],
  [/^(UNDERGROUND MAGNETIC HOUSINGS|ROCK HOUSINGS|BOX X BOX SONDE HOUSINGS|END LOAD SONDE HOUSINGS)/, CUR],
  [/^RIG COMPATIBILITY/, SKIP],
  [/^DITCH WITCH COMPATIBLE \d{4} SERIES (PIPE|EZ) CONNECTIONS/, { brand: 'DW', kind: 'sub', cols: ['desc', 'to', 'models'] }],
  [/^VERMEER COMPATIBLE \d{4} SERIES/, SKIP],
  [/^(3000|3500|4500|6500) SERIES (PIPE CONNECTIONS|QUICK CONNECTS)/, { brand: 'GEN', kind: 'sub', cols: ['desc', 'to', 'models'] }],
  [/^5000 SERIES PIPE CONNECTIONS/, CUR], // fits-model column misaligned in -layout output
  [/^(VERMEER|DITCH WITCH) COMPATIBLE DIRT HOUSINGS/, CUR],
  [/^ROCK BITS$/, { brand: 'GEN', kind: 'rockbit', cols: ['desc', 'thread', 'cut', 'rig'] }],
  [/^(SEALED|OPEN) BEARING TRICONES/, { brand: 'GEN', kind: 'tricone', cols: ['size', 'style', 'iadc', 'thread'] }],
  [/^PDC BITS\b/, { brand: 'GEN', kind: 'pdc', cols: ['size', 'blades', 'thread'] }],
  [/^COBBLE BITS|^SINGLE ROLLER CONE BITS/, CUR],
  [/^THREAD-ON BLADE ADAPTERS/, { brand: 'GEN', kind: 'bladeadapter', cols: ['desc', 'thread'] }],
  [/^VERMEER COMPATIBLE STEEP TAPER RUBBLE BLADE/, SKIP], // width column detached from rows in -layout output (Vermeer only)
  [/^(VERMEER|DITCH WITCH) COMPATIBLE (.*?)\s?(BLADE|POWER POINT|ULTIMATE BIT)$/, { kind: 'blade', cols: ['bolt', 'width', 'thick'] }],
  // reamer headings share their line with a floating "FOR ... CONDITIONS" label
  [/^(BARREL REAMERS|FLY CUTTER REAMERS|PADDLE REAMERS|STACK PLATE REAMER)\b/, { brand: 'GEN', kind: 'reamer', cols: ['size', 'conn', 'shaft'] }],
  [/^HOLE OPENERS\b/, { brand: 'GEN', kind: 'reamer', cols: ['size', 'cones', 'conn'] }],
  [/^COMPACT FLUTED REAMER\b/, { brand: 'GEN', kind: 'reamer', cols: ['size', 'conn'] }],
  [/^NEW RADIUS OVER-B(IT|LADE) REAMER|^RADIUS OVER-BLADE/, SKIP],
  [/^(CONDUX|DCD CLEVIS TO CLEVIS|DCD & CONDUX)/, SKIP],
  [/^DCD CLEVIS TO IF DUB SWIVELS/, { brand: 'GEN', kind: 'swivel', cols: ['desc', 'clevis', 'swl'] }],
  [/^FLANGE SWIVELS$/, { brand: 'GEN', kind: 'flangeswivel', cols: ['desc'] }],
  [/^(PULLERS|OTHER PULLERS|MESH PULLING|POLYESTER|CONDUIT|PULLING SHACKLES|ROD WIPERS|VERMEER COMPATIBLE OEM|VERMEER COMPATIBLE BLOCKS|DITCH WITCH COMPATIBLE INSERT JAWS|WIRE PULLING|DUAL SPLIT|SINGLE ROD|THREAD IDENTIFICATION|LUBRICANTS|DRILLING MUD|JOB SITE|ELECTRICAL|BATTERIES|WIRELINE|VERMEER COMPATIBLE DRILL PIPE|SLEEVED PULLER)/, SKIP],
  [/^DRILL PIPE\b/, SKIP],
  [/^DITCH WITCH COMPATIBLE DRILL PIPE/, { brand: 'DW', kind: 'pipe', cols: ['models', 'info'] }],
];
const BLADE_STYLE = (h) => h.replace(/^(VERMEER|DITCH WITCH) COMPATIBLE /, '').replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase())
  .replace(/ Blade$/, '').replace(/^180$/, '180 Degree').replace(/Steep Tip/, 'Steep Taper');

const PN_RE = /^\s*(9\d\d-\d{4}|PIP-\d{4}|SPL-\d{4})\s{1,}(.*)$/;
const isPrice = (c) => /^\$[\d,]+\.\d\d$|^Call for Pricing$/i.test(c);

function scanRows(text) {
  const rows = [];
  const pages = text.split('\f');
  pages.forEach((pageText, pi) => {
    let sec = null, heading = null;
    for (const line of pageText.split(/\r?\n/)) {
      const t = clean(line); // headings are printed in capitals; mixed-case matches are floating image labels
      const hit = SECTIONS.find(([re]) => re.test(t));
      if (hit) { sec = hit[1]; heading = t; continue; }
      const m = norm(line).match(PN_RE);
      if (!m || !sec || sec.skip) continue;
      let cells = m[2].split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
      const pi2 = cells.findIndex(isPrice);
      if (pi2 >= 0) cells = cells.slice(0, pi2);
      while (cells.length && /^(9\d\d-?\d{4}|\$[\d,.]+)$/.test(cells[cells.length - 1])) cells.pop(); // floating image labels
      if (!cells.length) continue;
      rows.push({ pn: m[1], page: pi + 1, heading, sec, cells });
    }
  });
  return rows;
}

/* ------------------------------------------------------------------ curated rows (checked against `pdftotext -raw`) */

const H = 'Electronic_Housing';
const CURATED = [
  // p.9 Ditch Witch compatible octagon collars (descriptions/models wrap across lines in -layout)
  ...[
    ['953-0070', '1.5" Octagon Collar EZ2 with Hardfacing', 'JT520 / JT5'],
    ['953-0071', '2" Octagon Collar EZ2 with Hardfacing', 'JT920 / JT920L / JT922 / JT10'],
    ['953-0072', '2.25" Octagon Collar EZ3 with Hardfacing', 'JT1220'],
    ['953-0073', '2.5" Octagon Collar EZ2 with Hardfacing', 'JT1720 / JT2020M1 / JT2720 / JT2720M1 / JT24'],
    ['953-0074', '2.75" Octagon Collar EZ3 with Hardfacing', 'JT3020 Mach1 / AT2720M1 / AT3020M1 / JT25'],
    ['953-0075', '3" Octagon Collar EZ2 with Hardfacing', 'JT4020 / JT4020M1'],
    ['953-0258', '4.125" Octagon Collar with Hardfacing', 'JT7020 / JT8020 / JT100'],
    ['953-0220', '2.75" Octagon Collar EZ2 with Hardfacing', 'JT2720M1 / JT25'],
    ['953-0400', '3" Octagon Collar EZ2 with Carbide Teeth & Hardfacing', 'JT4020 / JT4020M1'],
    ['953-0557', '4.25" Octagon Collar EZ2 with Hardfacing', 'JT40'],
    ['953-0541', '2.5" Octagon Collar EZ2 with Carbide Teeth & Hardfacing', 'JT1720 / JT2020M1 / JT2720 / JT2720M1 / JT24'],
  ].map(([pn, name, models]) => ({ pn, page: 9, brand: 'DW', type: 'Collar', name, models, raw: name.match(/EZ\d|Octagon/)[0] === 'Octagon' ? 'Octagon collar' : `Octagon collar for ${name.match(/EZ\d/)[0]} quick connect`, conn: {} })),

  // p.14 underground-magnetic / rock / box x box housings. Rig side of the rock housings is the proprietary
  // Radius pin (matched by the "R-Box" subs on pp.15-19); the API box takes the rock bit.
  { pn: '951-3502', page: 14, brand: 'GEN', type: H, name: '3500 Series Underground Magnetic Rock Housing 3.5"', raw: '2.375" Reg Box x 3500 R-Pin', conn: { l: null, r: '2.38 F API R' }, series: [SERIES_HOUSING, 3500], dia: 3.5 },
  { pn: '951-5002', page: 14, brand: 'GEN', type: H, name: '5000 Series Underground Magnetic End Load Hi-Flo Rock Housing 5"', raw: '3.5" IF Box x 3.5" Reg Box', conn: { l: '3.5 F API IF', r: '3.5 F API R' }, series: [SERIES_HOUSING, 5000], dia: 5 },
  { pn: '951-2750', page: 14, brand: 'GEN', type: H, name: '2700 Series Rock Housing 2.75" (15" DigiTrak)', raw: '2" IF Box x Box', conn: { l: '2.0 F API IF', r: '2.0 F API IF' }, series: [SERIES_HOUSING, 2700], dia: 2.75 },
  { pn: '951-2751', page: 14, brand: 'GEN', type: H, name: '2700 Series Rock Housing 2.75" (Subsite 86 Series)', raw: '2" IF Box x Box', conn: { l: '2.0 F API IF', r: '2.0 F API IF' }, series: [SERIES_HOUSING, 2700], dia: 2.75 },
  { pn: '951-3000', page: 14, brand: 'GEN', type: H, name: '3000 Series Rock Housing 3.25"', raw: '2" IF Box x 3000 Radius Pin', conn: { l: null, r: '2.0 F API IF' }, series: [SERIES_HOUSING, 3000], dia: 3.25 },
  { pn: '951-3500', page: 14, brand: 'GEN', type: H, name: '3500 Series Rock Housing 3.5"', raw: '2.375" Reg Box x 3500 Radius Pin', conn: { l: null, r: '2.38 F API R' }, series: [SERIES_HOUSING, 3500], dia: 3.5 },
  { pn: '951-3510', page: 14, brand: 'GEN', type: H, name: '3500 Series High Flow Rock Housing 3.5"', raw: '2.375" Reg Box x 3500 Radius Pin', conn: { l: null, r: '2.38 F API R' }, series: [SERIES_HOUSING, 3500], dia: 3.5 },
  { pn: '951-4500', page: 14, brand: 'GEN', type: H, name: '4500 Series High Flow Rock Housing 4.5"', raw: '2.875" Reg Box x 4500 Radius Pin', conn: { l: null, r: '2.88 F API R' }, series: [SERIES_HOUSING, 4500], dia: 4.5 },
  { pn: '951-5000', page: 14, brand: 'GEN', type: H, name: '5000 Series High Flow Rock Housing 5"', raw: '3.5" Reg Box x 5000 Radius Pin', conn: { l: null, r: '3.5 F API R' }, series: [SERIES_HOUSING, 5000], dia: 5 },
  { pn: '951-3020', page: 14, brand: 'GEN', type: H, name: '3000 Series Box x Box Sonde Housing 3" (Subsite 86 Series)', raw: '2" IF Box x Box', conn: { l: '2.0 F API IF', r: '2.0 F API IF' }, series: [SERIES_HOUSING, 3000], dia: 3 },
  { pn: '951-3030', page: 14, brand: 'GEN', type: H, name: '3000 Series Box x Box Sonde Housing 3.25" (DigiTrak 15")', raw: '2" IF Box to Box (DCI)', conn: { l: '2.0 F API IF', r: '2.0 F API IF' }, series: [SERIES_HOUSING, 3000], dia: 3.25 },
  { pn: '951-3040', page: 14, brand: 'GEN', type: H, name: '3000 Series Box x Box Sonde Housing 3" (Universal)', raw: '2" IF Box x Box', conn: { l: '2.0 F API IF', r: '2.0 F API IF' }, series: [SERIES_HOUSING, 3000], dia: 3 },
  { pn: '951-3520', page: 14, brand: 'GEN', type: H, name: '3500 Series Box x Box Sonde Housing 3.5" (Subsite 86 Series)', raw: '2.375" API Reg Box to Box (Subsite)', conn: { l: '2.38 F API R', r: '2.38 F API R' }, series: [SERIES_HOUSING, 3500], dia: 3.5 },
  { pn: '951-3530', page: 14, brand: 'GEN', type: H, name: '3500 Series Box x Box Sonde Housing 3.5" (DigiTrak 15")', raw: '2.375" API Reg Box to Box (DCI)', conn: { l: '2.38 F API R', r: '2.38 F API R' }, series: [SERIES_HOUSING, 3500], dia: 3.5 },
  { pn: '951-3540', page: 14, brand: 'GEN', type: H, name: '3500 Series Box x Box Sonde Housing 3.5" (Universal)', raw: '2.375" Reg Box x 2.375" Reg Box', conn: { l: '2.38 F API R', r: '2.38 F API R' }, series: [SERIES_HOUSING, 3500], dia: 3.5 },
  { pn: '951-4520', page: 14, brand: 'GEN', type: H, name: '4500 Series Box x Box Sonde Housing 4.25" (Subsite 86 Series)', raw: '2.875" API Reg Box to Box (Subsite)', conn: { l: '2.88 F API R', r: '2.88 F API R' }, series: [SERIES_HOUSING, 4500], dia: 4.25 },
  { pn: '951-4530', page: 14, brand: 'GEN', type: H, name: '4500 Series Box x Box Sonde Housing 4.25" (DigiTrak 15")', raw: '2.875" API Reg Box to Box (DCI)', conn: { l: '2.88 F API R', r: '2.88 F API R' }, series: [SERIES_HOUSING, 4500], dia: 4.25 },
  { pn: '951-4540', page: 14, brand: 'GEN', type: H, name: '4500 Series Box x Box Sonde Housing 4.25" (Universal)', raw: '2.875" Reg Box x 2.875" Reg Box', conn: { l: '2.88 F API R', r: '2.88 F API R' }, series: [SERIES_HOUSING, 4500], dia: 4.25 },
  // p.15 end-load housings (only the one whose threads are both DW codes; 2.875 IF / 4.5 Reg / DS55 are not used by DW)
  { pn: '951-5001', page: 15, brand: 'GEN', type: H, name: 'End Load Housing (DCI) 5"', raw: '3.5" IF Box x 3.5" Reg Box', conn: { l: '3.5 F API IF', r: '3.5 F API R' }, series: [SERIES_HOUSING, 5000], dia: 5 },
  // p.18 5000-series R-Box subs: -layout shifts the fits-model column by three rows
  { pn: '953-0333', page: 18, brand: 'DW', type: 'Connector', name: '5" R-Box x 3.5"-6 EZ Box', raw: '5" R-Box x 3.5"-6 EZ Box', conn: { l: '3.5 F EZ2', r: null }, models: 'JT7020 / JT8020 / JT100M1' },
  { pn: '953-0334', page: 18, brand: 'DW', type: 'Connector', name: '5" R-Box x 3.44"-4 DW Pipe Pin', raw: '5" R-Box x 3.44"-4 DW Pipe Pin', conn: { l: '3.44 M', r: null }, models: 'AT100' },
  { pn: '953-0561', page: 18, brand: 'DW', type: 'Connector', name: '5" R-Box x 3.27"-4 Pin', raw: '5" R-Box x 3.27"-4 Pin', conn: { l: '3.27 M', r: null }, models: 'JT7020 / JT8020 / JT100' },
  // p.19 dirt housings (models wrap; rows verified with -raw). Rig side 2" IF / API / DW box, bit side bolt pattern.
  ...[
    ['952-0008', 2.5, '5 Bolt (12mm)', '2" IF Box Thread', '2.0 F API IF', '5-12MM', 'JT920 / JT920L / JT921 / JT922'],
    ['952-0009', 2.75, '5 Bolt (12mm)', '2" IF Box Thread', '2.0 F API IF', '5-12MM', 'JT920 / JT920L / JT921 / JT922 / JT1220 Mach1 / JT1720 / JT1720 Mach1 / JT2020 Mach1'],
    ['952-0010', 3, '5 Bolt (12mm)', '1.94-4 Ditch Witch Pipe Box', '1.94 F', '5-12MM', 'JT1220 Mach1 / JT1720 / JT1720 Mach1 / JT2020 Mach1'],
    ['952-0011', 3.25, '6 Bolt (16mm)', '2.375" API Reg Box', '2.38 F API R', '6-16MM', 'JT25 / JT2720 / JT2720 Mach1 / AT2720 Mach1 / JT3020 Mach1 / AT3020 Mach1 / JT4020 / JT4020 Mach1 / AT4020'],
    ['952-0012', 4.25, '6 Bolt (20mm)', '2.875" API Reg Box', '2.88 F API R', '6-20MM', 'JT7020 Mach1 / JT8020 Mach1 / JT100 / AT100'],
    ['952-0199', 2.25, '3 Bolt (12 mm)', '2" IF Box Thread', '2.0 F API IF', '3-12MM', 'JT520 / JT5'],
  ].map(([pn, dia, bolt, thr, l, r, models]) => ({ pn, page: 19, brand: 'DW', type: H, name: `Dirt Housing ${dia}", ${bolt}, ${thr}${pn === '952-0199' ? ' (DW 88B mini beacon)' : ''}`, raw: `${thr} x ${bolt}`, conn: { l, r }, models, dia })),
  ...[
    ['952-0002', 2.5, '6 Bolt (.5"-13)', '2" IF Box Thread', '2.0 F API IF', '6-1/2"', 'D7x11 / D7x11 Series II / D9x13 Series II / D10x14 / D10x15'],
    ['952-0003', 2.75, '6 Bolt (.5"-13)', '2" IF Box Thread', '2.0 F API IF', '6-1/2"', 'D16x20 / D16x20 Series II / D18x22 / D20x22 / D20x22 Series II / D20x22 FX'],
    ['952-0124', 3, '6 Bolt (.5"-13)', '2.375" Firestick I Box', '#600 F', '6-1/2"', 'D16x20 / D16x20 Series II / D18x22 / D20x22 / D20x22 Series II'],
    ['952-0005', 3.25, '6 Bolt (.5"-13)', '2.375" API Reg Box', '2.38 F API R', '6-1/2"', 'D24x40A / D24x40 Series II / D33x44 / D36x50 / D36x50 Series II'],
    ['952-0125', 3.25, '6 Bolt (.5"-13)', '2.375" Firestick I Box', '#600 F', '6-1/2"', 'D24x40 / D24x40 Series II / D33x44 / D36x50'],
    ['952-0006', 4.25, '6 Bolt (.625"-11)', '2.875" API Reg Box', '2.88 F API R', '6-5/8"', 'D50x100A / D60x90 / D80x100 Series II / D100x120 / D100x120 Series II / D100x140'],
    ['952-0135', 4.5, '6 Bolt (.75"-10)', '3.5" Reg Box (DCI)', '3.5 F API R', '6-3/4"', 'D100x120 / D100x140'],
  ].map(([pn, dia, bolt, thr, l, r, models]) => ({ pn, page: 19, brand: 'VM', type: H, name: `Dirt Housing ${dia}", Vermeer ${bolt}, ${thr}`, raw: `${thr} x ${bolt}`, conn: { l, r }, models, dia })),
  // p.25 cobble bits / p.26 single roller cone bits (cut and rig-class columns interleave in -layout)
  { pn: '950-3005', page: 25, brand: 'GEN', type: 'Bit', name: 'Cobble Bit 4" cut (printed "3 Cobble Bit"), 2" IF Pin', raw: '2" IF Pin', conn: { l: '2.0 M API IF', r: null }, dia: 4 },
  { pn: '950-3505', page: 25, brand: 'GEN', type: 'Bit', name: '3500 Series Cobble Bit 5" cut, 2.375" Reg Pin', raw: '2.375" Reg Pin', conn: { l: '2.38 M API R', r: null }, dia: 5, series: [SERIES_COBBLE, 3500] },
  { pn: '950-4505', page: 25, brand: 'GEN', type: 'Bit', name: '4500 Series Cobble Bit 6" cut, 2.875" Reg Pin', raw: '2.875" Reg Pin', conn: { l: '2.88 M API R', r: null }, dia: 6, series: [SERIES_COBBLE, 4500] },
  { pn: '950-5005', page: 25, brand: 'GEN', type: 'Bit', name: '5000 Series Cobble Bit 7" cut, 3.5" Reg Pin', raw: '3.5" Reg Pin', conn: { l: '3.5 M API R', r: null }, dia: 7, series: [SERIES_COBBLE, 5000] },
  { pn: '950-3001', page: 26, brand: 'GEN', type: 'Bit', name: '3000 Single Roller Cone Bit 5" cut, 2" IF Pin', raw: '2" IF Pin', conn: { l: '2.0 M API IF', r: null }, dia: 5, series: [SERIES_SRC, 3000] },
  { pn: '950-3501', page: 26, brand: 'GEN', type: 'Bit', name: '3500 Single Roller Cone Bit 6" cut, 2.375" Reg Pin', raw: '2.375" Reg Pin', conn: { l: '2.38 M API R', r: null }, dia: 6, series: [SERIES_SRC, 3500] },
  { pn: '950-3503', page: 26, brand: 'GEN', type: 'Bit', name: '3500 Series Single Roller Cone Bit 6" cut, 2.375" API Reg Pin with Rect Pad', raw: '2.375" API Reg Pin with Rect Pad', conn: { l: '2.38 M API R', r: null }, dia: 6, series: [SERIES_SRC, 3500] },
  { pn: '950-4503', page: 26, brand: 'GEN', type: 'Bit', name: '4500 Series Single Roller Cone Bit 7" cut, 2.875" API Reg Pin with Rect Pad', raw: '2.875" API Reg Pin with Rect Pad', conn: { l: '2.88 M API R', r: null }, dia: 7, series: [SERIES_SRC, 4500] },
  { pn: '950-4501', page: 26, brand: 'GEN', type: 'Bit', name: '4500 Single Roller Cone Bit 7" cut, 2.875" Reg Pin', raw: '2.875" Reg Pin', conn: { l: '2.88 M API R', r: null }, dia: 7, series: [SERIES_SRC, 4500] },
  { pn: '950-5003', page: 26, brand: 'GEN', type: 'Bit', name: '5000 Single Roller Cone Bit 8" cut, 3.5" Reg Pin', raw: '3.5" Reg Pin', conn: { l: '3.5 M API R', r: null }, dia: 8 },
];

/* Row-level overrides for parsed rows (merged over the parsed record). */
const OVERRIDE = {
  // p.10 printed twice: "2.75 EZ2 Pin x 2.375 Firestick 600 Pin" and "2.375 FS1 (600) / 2.25 M EZ2". 2.75" is the
  // octagon-collar size (953-0220 "2.75 Octagon Collar EZ2", JT2720M1/JT25); the thread is 2.25 EZ2.
  '953-0401': { name: '2.375" Firestick 600 Pin x 2.25" EZ2 Pin (2.75" collar)', conn: { l: '#600 M', r: '2.25 M EZ2' }, models: 'JT25 / JT2720M1', type: 'Quick_Connect',
    note: 'Printed on p.10 both as "2.75 EZ2 Pin x 2.375 Firestick 600 Pin" and "2.375 FS1 (600) / 2.25 M EZ2"; 2.75 = collar size' },
  '953-0589': { models: 'JT20', note: 'Printed fits model "JT20 - 20/20"' },
  '953-0565': { models: 'JT20', note: 'Printed fits model "JT20 / JT20/20"' },
  '953-0582': { name: 'Firestick 600 Pin x Pin Sub, 24" shoulder to shoulder', conn: { l: '#600 M', r: '#600 M' }, models: 'JT20', type: 'Transition_Sub', note: 'Printed "600 Firestick PxP x 24" S to S", fits "JT20 - JT20/20"' },
  '953-0586': { models: 'JT2720M1 / JT3020M1', note: 'Printed fits model "JT27/20 - JT30/20" (2.11 DW pipe = Mach 1)' },
  '953-0564': { name: '2-3/8" Reg Pin x DW JT30 2.11 Pin', conn: { l: '2.11 M', r: '2.38 M API R' }, models: 'JT2720M1 / JT3020M1 / JT30', note: 'Printed fits model "JT27/20 - JT30"' },
  '953-0213': { conn: { l: '3.27 F', r: null } },
};
/* Rows or occurrences dropped on purpose (reported). */
const EXCLUDE = {
  '953-0405': 'conflicting prints: p.12 "2.375 Reg Pin x 2.375 Firestick 900 Pin" (JT24/JT25) vs p.13 "2.375 Reg Pin x 2.375 Firestick 600 Box" (D24x40); a 2.375 Firestick 900 does not exist',
  '950-8001': '8000 series rock bit fits only Vermeer D750x900+ / American Auger DD-625+',
};
const EXCLUDE_OCC = [
  { pn: '952-0127', heading: /BARREL/, why: 'barrel-reamer row reuses blade pn 952-0127 (DW steep taper rubble blade, same price) - catalog typo' },
];

/* ------------------------------------------------------------------ row interpretation */

const anomalies = [];
const skipped = [];
const num = (s) => { const m = String(s || '').match(/(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null; };

function interpret(row) {
  const { pn, sec, cells, page, heading } = row;
  const col = Object.fromEntries(sec.cols.map((c, i) => [c, cells[i]]));
  const brand = sec.brand || (heading.startsWith('VERMEER') ? 'VM' : 'DW');
  const rec = { pn, page, brand, heading };

  switch (sec.kind) {
    case 'saver': {
      const thread = clean(col.thread || '');
      const models = clean(col.models || '');
      const down = /pin down/i.test(thread + ' ' + models) ? 'M' : /box down/i.test(thread + ' ' + models) ? 'F' : null;
      const e = parseEnd(thread, down || 'F');
      if (down && e.code) e.code = e.code.replace(/\b[MF]\b/, down); // "Box x Pin (Pin Down)": the down end is what the pipe sees
      if (/firestick|FS1/i.test(thread) && !down) e.code = null;
      if (e.bad) anomalies.push(`${pn} p.${page}: ${e.bad}`);
      const what = sec.chuck ? 'Drive Chuck' : 'Sub Saver';
      const flange = (models.match(/\(([SL]-Flange)\)/) || [])[1];
      return { ...rec, type: 'Saver_Sub', name: `${what} ${models.replace(/\s*\([SL]-Flange\)/, '')}, ${thread}${flange ? ` (${flange})` : ''}${num(col.len) ? `, ${num(col.len)}" OAL` : ''}`.replace(/\s+/g, ' '),
        raw: thread, conn: { l: null, r: e.code }, models, ends: [e] };
    }
    case 'sub': {
      let desc = clean(col.desc || '');
      let models = col.models || '';
      // in the adapter tables the "fits model" column sometimes holds the second connection (pulling eyes, LP pins)
      if (models && !/ x |\s\/\s/i.test(desc) && !/\b(JT|AT)\s?\d|^DW$|\bD\d|RM1\d|\d{4}AT|\d{4}M1/i.test(models)) { desc = `${desc} x ${clean(models)}`; models = ''; }
      if (/Quickfire|QF \d|RM1\d|Railhead|Drillto|DWTXS|Astec|DD3238|UNJ|DS ?40|DS55/i.test(desc + ' ' + (col.to || ''))) return skip(row, 'non-DW connection family');
      const { ends: parts, sep } = splitEnds(desc);
      const ends = parts.map((p) => parseEnd(p, 'M'));
      for (const e of ends) if (e.bad) anomalies.push(`${pn} p.${page}: ${e.bad}`);
      if (ends.length !== 2) return skip(row, `could not split "${desc}" into two ends`);
      const pull = ends.some((e) => /pull/i.test(e.raw));
      const [l, r] = pull ? (ends[0].fam === 'prop' ? [ends[1], ends[0]] : ends) : orient(ends[0], ends[1], sep);
      return { ...rec, type: pull ? 'Other' : null, name: desc, raw: desc, conn: { l: l.code, r: r.code }, models, ends };
    }
    case 'rockbit': {
      const e = parseEnd(col.thread, 'M');
      const series = num(col.desc);
      if (series >= 6500) return skip(row, 'series 6500/8000 rock bits fit only Vermeer / American Auger maxi rigs');
      return { ...rec, type: 'Bit', name: `${clean(col.desc)} ${num(col.cut)}" cut, ${clean(col.thread)}`, raw: clean(col.thread), conn: { l: e.code, r: null },
        dia: num(col.cut), series: SERIES_ROCKBIT[series] ? [SERIES_ROCKBIT, series] : null, ends: [e] };
    }
    case 'tricone': case 'pdc': {
      let thread = clean(col.thread || '');
      if (/API$/.test(thread)) thread += ' Reg Pin'; // "2.875\" API" / "Reg Pin" wraps onto the next line (950-1074, 950-1080)
      const e = parseEnd(thread, 'M');
      const name = sec.kind === 'pdc' ? `${clean(col.size)} Bit, ${clean(col.blades)}, ${thread}` : `${clean(col.size)} Bit, ${clean(col.style)}, IADC ${clean(col.iadc)}, ${thread}`;
      return { ...rec, type: 'Bit', name, raw: thread, conn: { l: e.code, r: null }, dia: num(col.size), ends: [e] };
    }
    case 'bladeadapter': {
      const desc = clean(col.desc), thread = clean(col.thread);
      const pin = parseEnd(thread.replace(/\s*-\s*[\d.]+\s*dia$/i, ''), 'M'), bolt = parseEnd(desc);
      return { ...rec, brand: /^Vermeer/i.test(desc) ? 'VM' : 'DW', type: 'Other', name: `Thread-On Blade Adapter, ${desc}, ${thread}`, raw: `${thread} x ${desc}`,
        conn: { l: pin.code, r: bolt.code }, ends: [pin, bolt] };
    }
    case 'blade': {
      const bolt = parseEnd(col.bolt);
      const style = BLADE_STYLE(heading);
      const w = num(col.width);
      const what = /Ultimate Bit|Power Point/i.test(style) ? style : `${style} Blade`;
      if (bolt.code && /MM$/.test(bolt.code)) rec.brand = 'DW'; // DW rubble rows print under the Vermeer rubble heading (p.29)
      return { ...rec, type: 'Bit', name: `${what}${w ? ` ${w}"` : ''}${num(col.thick) ? ` x ${num(col.thick)}"` : ''}, ${clean(col.bolt)}`, raw: clean(col.bolt),
        conn: { l: bolt.code, r: null }, dia: w, ends: [bolt] };
    }
    case 'reamer': {
      const conn = clean(col.conn || '').replace(/\s*\/\s*[\d.]+$/, '');
      const { ends: parts } = splitEnds(conn);
      const ends = parts.map((p) => parseEnd(p, 'F'));
      if (ends.length !== 2) return skip(row, `reamer connection "${conn}"`);
      const style = heading.match(/^(BARREL REAMER|FLY CUTTER REAMER|PADDLE REAMER|STACK PLATE REAMER|HOLE OPENER|COMPACT FLUTED REAMER)/)[1]
        .replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase());
      return { ...rec, type: 'Backreamer', name: `${clean(col.size)}" ${style}, ${conn}`.replace(/\s+/g, ' '), raw: conn, conn: { l: ends[0].code, r: ends[1].code }, dia: num(col.size), ends };
    }
    case 'swivel': {
      const desc = clean(col.desc);
      const thr = desc.match(/([\d-\/]+ IF Box)/);
      const e = parseEnd(thr ? thr[1] : '', 'F');
      return { ...rec, type: 'Other', name: `DCD Clevis to IF Dub Swivel, ${desc}`, raw: thr ? thr[1] : desc, conn: { l: e.code, r: null }, ends: [e] };
    }
    case 'flangeswivel': {
      const desc = clean(col.desc);
      if (!/Ditch Witch/i.test(desc)) return skip(row, 'not a Ditch Witch flange swivel');
      // DW flange sizes (12K/20K/30K) do not line up with Radius' 10K/20K/30K reamer-size labels -> no code
      return { ...rec, brand: 'DW', type: 'Other', name: desc, raw: desc, conn: { l: null, r: null }, ends: [] };
    }
    case 'pipe': {
      const info = clean(col.info || '');
      const m = info.match(/^(\d\.\d+)-(\d)/);
      const p = m && PIPE[m[1]];
      const base = p && Number(m[2]) === p[1] ? p[0] : null;
      return { ...rec, type: 'Drill_Pipe', name: `Drill Pipe ${info} (${clean(col.models)})`, raw: info, conn: { l: base && `${base} M`, r: base && `${base} F` }, models: col.models, ends: [] };
    }
    default: return skip(row, `unhandled section kind ${sec.kind}`);
  }
}
function skip(row, why) { skipped.push(`${row.pn} p.${row.page}: ${why}`); return null; }

/* ------------------------------------------------------------------ build parts */

function subType(l, r) {
  const fam = (c) => (!c ? null : /EZ\d|^2\.85-6/.test(c) ? 'ez' : /Hawkeye/.test(c) ? 'hawk' : /LPT/.test(c) ? 'lpt' : /^#/.test(c) ? 'fs' : /API|FH/.test(c) ? 'api' : 'pipe');
  const fl = fam(l), fr = fam(r), gr = (r || '').match(/\b([MF])\b/)?.[1];
  if ((fr === 'ez' && gr === 'M') || (['hawk', 'lpt'].includes(fr) && gr === 'F')) return 'Quick_Connect';
  if (['pipe', 'fs'].includes(fl) && ['api', 'pipe', 'fs'].includes(fr)) return 'Transition_Sub';
  return 'Connector';
}

function build(text) {
  const rows = scanRows(text);
  const recs = [];
  for (const row of rows) {
    if (EXCLUDE[row.pn]) { skipped.push(`${row.pn} p.${row.page}: ${EXCLUDE[row.pn]}`); continue; }
    const xo = EXCLUDE_OCC.find((x) => x.pn === row.pn && x.heading.test(row.heading));
    if (xo) { skipped.push(`${row.pn} p.${row.page}: ${xo.why}`); continue; }
    const ov = OVERRIDE[row.pn];
    const nSkipped = skipped.length;
    let r = interpret(row);
    if (!r && ov?.conn) { // the override fully specifies a row the grammar cannot split
      skipped.length = nSkipped;
      const desc = clean(row.cells[0]);
      r = { pn: row.pn, page: row.page, brand: row.sec.brand, heading: row.heading, name: desc, raw: desc, models: row.cells[row.cells.length - 1] || '' };
    }
    if (r) recs.push({ ...r, ...(ov || {}) });
  }
  for (const c of CURATED) recs.push({ ...c, curated: true });

  // merge repeated part numbers (e.g. 953-0076.. printed on p.11 and p.15)
  const byPn = new Map();
  for (const r of recs) {
    const mm = r.models ? parseModels(r.models) : { machines: [], raw: [], other: false };
    if (r.series) { const [tbl, s] = r.series; const sm = parseModels(tbl[s]); mm.machines.push(...sm.machines); mm.raw.push(...sm.raw); }
    const cur = byPn.get(r.pn);
    if (!cur) { byPn.set(r.pn, { ...r, machines: new Set(mm.machines), machinesRaw: new Set(mm.raw), otherBrand: mm.other, pages: new Set([r.page]) }); continue; }
    const same = (a, b) => codeKey(a) === codeKey(b);
    const flipped = same(cur.conn.l, r.conn.r) && same(cur.conn.r, r.conn.l);
    if (!(same(cur.conn.l, r.conn.l) && same(cur.conn.r, r.conn.r)) && !flipped && !cur.curated)
      anomalies.push(`${r.pn}: printed with different threads on p.${[...cur.pages].join('/')} ("${cur.raw}") and p.${r.page} ("${r.raw}") - kept the first`);
    if (cur.brand !== 'DW' && r.brand === 'DW') cur.brand = 'DW';
    mm.machines.forEach((m) => cur.machines.add(m)); mm.raw.forEach((m) => cur.machinesRaw.add(m));
    cur.pages.add(r.page);
  }

  // inclusion
  const parts = new Map();
  for (const r of byPn.values()) {
    const ends = [r.conn.l, r.conn.r].filter(Boolean);
    const allDw = ends.every(inVocab);
    const why = (() => {
      if (r.type === 'Collar') return r.machines.size ? null : 'no DW machine';
      if (r.brand === 'VM') return 'vermeer'; // second pass (thread-match only)
      if (r.brand === 'DW') return ends.length && !ends.some(inVocab) && !r.machines.size ? 'no DW thread and no DW machine' : null;
      if (r.otherBrand && !r.machines.size) return `fits ${[...r.machinesRaw].join(', ')} only`;
      if (!ends.length) return 'no connection';
      return allDw ? null : `thread(s) not used by Ditch Witch: ${ends.filter((e) => !inVocab(e)).join(', ')}`;
    })();
    if (why === 'vermeer') { r.pending = true; parts.set(r.pn, r); continue; }
    if (why) { skipped.push(`${r.pn} p.${[...r.pages].join('/')}: ${why} ("${r.raw}")`); continue; }
    parts.set(r.pn, r);
  }
  for (const r of parts.values()) {
    r.conn = { l: dwCode(r.conn.l), r: dwCode(r.conn.r) };
    if (!r.type) r.type = subType(r.conn.l, r.conn.r);
  }
  return parts;
}

/* ------------------------------------------------------------------ cross reference */

// SaverLok (DW quick-change saver system with its own collar) is deliberately not matched to plain Radius sub savers.
const GROUP = { Saver_Sub: 'saver', Transition_Sub: 'sub', Quick_Connect: 'sub', Connector: 'sub',
  Electronic_Housing: 'housing', Bit: 'bit', Backreamer: 'reamer', Drill_Pipe: 'pipe', BitAdapters: 'other', Accessory: 'other', Other: 'other' };
/** Tool family inside the Bit / Backreamer slots; only same-family tools are cross-referenced. */
function toolKind(g, name, cl) {
  if (g === 'bit') {
    if (/tri-?cone/i.test(name)) return 'tricone';
    if (/\bPDC\b/i.test(name)) return 'pdc';
    if (/cobble/i.test(name)) return 'cobble';
    if (/roller cone/i.test(name)) return 'roller-cone';
    if (/rock bit/i.test(name)) return 'rock-bit';
    if (/MM$|^6-\d\/\d"$/.test(cl || '')) return 'blade'; // bolt-on steering blades / dirt bits
    return null;
  }
  if (/compact fluted/i.test(name)) return 'fluted';
  if (/\bPDC\b/i.test(name)) return 'pdc';
  if (/fly cutter|warthog|beavertail/i.test(name)) return 'cutter';
  return null;
}
const K = codeKey;
const eq = (a, b) => !!a && !!b && K(a) === K(b);

function matchOne(dw, rp) {
  const g = GROUP[dw.type];
  if (!g || g !== GROUP[rp.type]) return null;
  const overlap = [...rp.machines].filter((m) => dw.machines.has(m));
  const dwR = [dw.cr, dw.cr2].filter(Boolean);
  switch (g) {
    case 'saver':
      return dwR.some((c) => eq(c, rp.conn.r)) && overlap.length ? { match: 'machine', note: `Bit side ${rp.conn.r}; Radius lists ${overlap.map((m) => m.replace('Ditch Witch ', '')).join(', ')}` } : null;
    case 'sub': {
      const fwd = eq(dw.cl, rp.conn.l) && dwR.some((c) => eq(c, rp.conn.r));
      const rev = eq(dw.cl, rp.conn.r) && dwR.some((c) => eq(c, rp.conn.l));
      if (!fwd && !rev) return null;
      return overlap.length ? { match: 'direct', note: `Same threads; Radius lists ${overlap.map((m) => m.replace('Ditch Witch ', '')).join(', ')}` } : { match: 'thread', note: rev && !fwd ? 'Same threads (ends listed in reverse order)' : null };
    }
    case 'pipe':
      return eq(dw.cl, rp.conn.l) && eq(dw.cr, rp.conn.r) && overlap.length ? { match: 'direct', note: `Radius ${rp.raw}` } : null;
    case 'housing': case 'bit': case 'reamer': case 'other': {
      if (!eq(dw.cl, rp.conn.l)) return null;
      if (g === 'other' || g === 'housing' ? !dwR.some((c) => eq(c, rp.conn.r)) : (dwR.length || rp.conn.r ? !dwR.some((c) => eq(c, rp.conn.r)) : false)) return null;
      const notes = [];
      if (g === 'bit' || g === 'reamer') {
        if (dw.size == null || rp.dia == null || Math.abs(dw.size - rp.dia) > 0.06) return null;
        const k = toolKind(g, rp.name, rp.conn.l);
        if (!k || k !== toolKind(g, dw.name, dw.cl)) return null; // tricone<->tricone, PDC<->PDC, blade<->blade, cutter<->cutter
      }
      if (g === 'housing' && dw.size != null && rp.dia != null && Math.abs(dw.size - rp.dia) > 0.06) notes.push(`${rp.dia}" OD vs DW ${dw.size}"`);
      if (overlap.length) return { match: 'direct', note: ['Same threads', ...notes].join('; ') };
      return { match: 'thread', note: notes.join('; ') || null };
    }
    default: return null;
  }
}

function crossref(parts) {
  const byDwPn = {};
  const radius = [...parts.values()];
  for (const dw of [...DW.values()].sort((a, b) => a.pn.localeCompare(b.pn))) {
    const list = [];
    for (const rp of radius) {
      const m = matchOne(dw, rp);
      if (m) list.push({ pn: rp.pn, match: m.match, ...(m.note ? { note: m.note } : {}), _rp: rp, _dw: dw });
    }
    if (list.length) byDwPn[dw.pn] = list.sort((a, b) => ['direct', 'thread', 'machine'].indexOf(a.match) - ['direct', 'thread', 'machine'].indexOf(b.match) || a.pn.localeCompare(b.pn));
  }
  return byDwPn;
}

/* ------------------------------------------------------------------ main */

const text = loadText();
const parts = build(text);
let byDwPn = crossref(parts);

// Vermeer-table parts stay only when their threads match a DW roadmap part exactly.
const usedPending = new Set(Object.values(byDwPn).flat().filter((x) => x._rp.pending).map((x) => x.pn));
for (const [pn, r] of parts) if (r.pending && !usedPending.has(pn)) { parts.delete(pn); skipped.push(`${pn} p.${[...r.pages].join('/')}: Vermeer table, no exact thread match to a DW part ("${r.raw}")`); }
for (const r of parts.values()) if (r.pending) { r.machinesRaw = new Set([...r.machinesRaw, ...r.machines].map((m) => m.replace('Ditch Witch ', ''))); r.machines = new Set(); r.note = [r.note, 'Listed in a Vermeer-compatible table; threads match Ditch Witch HDX/PowerHouse parts'].filter(Boolean).join('. '); }
byDwPn = crossref(parts);

// align sub orientation with the DW parts it matches (subs can be installed either way round)
for (const list of Object.values(byDwPn)) for (const x of list) {
  const rp = x._rp, dw = x._dw;
  if (GROUP[rp.type] === 'sub' && !eq(dw.cl, rp.conn.l) && eq(dw.cl, rp.conn.r)) { rp.conn = { l: rp.conn.r, r: rp.conn.l }; rp.flipped = true; }
}
for (const rp of parts.values()) if (GROUP[rp.type] === 'sub' && !rp.curated && !OVERRIDE[rp.pn]?.type) {
  const tys = Object.values(byDwPn).flat().filter((x) => x.pn === rp.pn).map((x) => x._dw.type);
  if (tys.length) { const c = {}; tys.forEach((t) => (c[t] = (c[t] || 0) + 1)); rp.type = Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]; }
}

// merge url/img from a previous non-fixture parts.json (e.g. a radiushdd.com scrape)
let prev = {};
try { const old = JSON.parse(readFileSync(OUT_PARTS, 'utf8')); if (!old.fixture) prev = old.parts || {}; } catch {}
// radiushdd.com scrape (data/radius/web.json) wins for url/img; a catalog part missing from the site is flagged
let web = null;
try { web = JSON.parse(readFileSync(join(dirname(OUT_PARTS), 'web.json'), 'utf8')).parts || null; } catch {}
if (web) for (const [pn, w] of Object.entries(web)) prev[pn] = { url: w.url || prev[pn]?.url, img: w.img || prev[pn]?.img };

const outParts = {};
for (const r of [...parts.values()].sort((a, b) => a.pn.localeCompare(b.pn))) {
  const p = {
    pn: r.pn, name: clean(r.name), type: r.type, conn: { l: r.conn.l || null, r: r.conn.r || null }, raw: clean(r.raw || ''),
    machines: [...r.machines].sort(), url: prev[r.pn]?.url || null, img: prev[r.pn]?.img || null, page: Math.min(...r.pages),
  };
  if (r.machinesRaw.size) p.machinesRaw = [...r.machinesRaw];
  if (r.note) p.note = r.note;
  outParts[r.pn] = p;
}
const outX = {};
for (const [k, list] of Object.entries(byDwPn)) outX[k] = list.map(({ pn, match, note }) => ({ pn, match, ...(note ? { note } : {}) }));

if (!DRY) {
  writeFileSync(OUT_PARTS, JSON.stringify({ source: SOURCE, fetched: FETCHED, parts: outParts }, null, 1) + '\n');
  writeFileSync(OUT_XREF, JSON.stringify({ source: `${SOURCE}; generated by tools/radius_catalog.mjs`, byDwPn: outX }, null, 1) + '\n');
}

/* ------------------------------------------------------------------ console summary */

const byType = {};
for (const p of Object.values(outParts)) byType[p.type] = (byType[p.type] || 0) + 1;
const mcount = { direct: 0, thread: 0, machine: 0 };
for (const list of Object.values(outX)) { const best = list[0].match; mcount[best]++; }
console.log(`${DRY ? '[dry] ' : ''}parts: ${Object.keys(outParts).length}`, byType);
console.log(`DW pns with Radius equivalents: ${Object.keys(outX).length} (best match: direct ${mcount.direct}, thread ${mcount.thread}, machine ${mcount.machine})`);
const shownAnoms = [...new Set(anomalies)].filter((a) => !OVERRIDE[a.slice(0, 8)]?.conn);
console.log(`\nanomalies (${shownAnoms.length}):\n  ${shownAnoms.join('\n  ')}`);
if (argv.includes('--skipped')) console.log(`\nskipped (${skipped.length}):\n  ${skipped.join('\n  ')}`);
else console.log(`\nskipped rows: ${skipped.length} (pass --skipped to list)`);

const rep = arg('--report');
if (rep) {
  const model = rep.toUpperCase();
  const mach = catalog.machines.find((m) => m.brand === 'Ditch Witch' && m.model.toUpperCase() === model);
  if (!mach) { console.error(`unknown model ${rep}`); process.exit(1); }
  for (const pipe of mach.pipes) {
    const rm = ROADMAPS.find((x) => x.id === pipe.roadmap);
    if (!rm) continue;
    console.log(`\n### Ditch Witch ${mach.model} - ${clean(pipe.name)} (roadmap ${rm.id})`);
    for (const s of rm.sections) {
      console.log(`  [${s.mode}] ${clean(s.name)}`);
      for (const o of s.opts) {
        const p = rm.parts[o.id];
        if (!p) continue;
        const alts = (outX[p.pn] || []).map((x) => `${x.pn} (${x.match})`).join(', ') || '-';
        console.log(`    ${p.pn.padEnd(11)} ${clean(p.name).slice(0, 38).padEnd(38)} ${String(p.cl || '-').padEnd(15)} ${String([p.cr, p.cr2].filter(Boolean).join('/') || '-').padEnd(15)} -> ${alts}`);
      }
      const types = [...new Set(s.opts.map((o) => rm.parts[o.id]?.type).filter(Boolean))];
      const shown = new Set(s.opts.flatMap((o) => (outX[rm.parts[o.id]?.pn] || []).map((x) => x.pn)));
      const others = Object.values(outParts).filter((p) => types.some((t) => GROUP[t] && GROUP[t] === GROUP[p.type] || t === p.type) && p.machines.includes(`Ditch Witch ${mach.model}`) && !shown.has(p.pn));
      if (others.length) console.log(`    + Radius parts listed for ${mach.model} (no thread match): ${others.map((p) => p.pn).join(', ')}`);
    }
  }
}
