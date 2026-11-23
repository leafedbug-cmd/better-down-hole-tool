#!/usr/bin/env node
/*
 * Supplier catalog build -> data/suppliers/{brands,connections,parts}.json
 *
 *   node tools/suppliers_build.mjs          (writes the three files)
 *   node tools/suppliers_build.mjs --check  (validates only; exits 1 on a problem)
 *
 * Inputs:
 *   tools/suppliers/rows/*.json  table rows pulled from manufacturer product pages (see `source` per item)
 *   the curated tables below     products read one page at a time
 *
 * Rules this file enforces:
 *   - A value is only stored if the manufacturer page states it. Anything else stays null and is
 *     listed by `unverified` in each part. Nothing is guessed, and conversions are limited to
 *     fractions to decimals, kg to lb and ft to in (noted in the part's specs).
 *   - Thread gender and orientation are only set (conn.wired = true) when the page says box/pin
 *     for that end. Everything else keeps its raw wording and stays out of the fit solver.
 *   - Each part carries the manufacturer product page URL in `url`. No affiliate or tracking
 *     parameters are added; the checker rejects any query string that looks like one.
 *   - No Ditch Witch / Toro-family references anywhere in the output (checked).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'suppliers');
const ROWS = join(ROOT, 'tools', 'suppliers', 'rows');
const FETCHED = '2026-11-23';
const FIRST_ID = 900001;
const CHECK = process.argv.includes('--check');
const rows = (f) => JSON.parse(readFileSync(join(ROWS, f), 'utf8'));

/* ------------------------------------------------------------------ connection codes */
const existing = new Set(JSON.parse(readFileSync(join(ROOT, 'data', 'radius', 'dw-connections.json'), 'utf8')).connections.map((c) => c.code));
const sizeTxt = (n) => (Number.isInteger(n) ? `${n}.0` : String(Math.round(n * 100) / 100).replace(/(\.\d)0$/, '$1'));
const parseSize = (s) => {
  let tot = 0;
  for (const p of String(s).replace(/["”″]/g, '').replace(/-/g, ' ').trim().split(/\s+/)) {
    if (p.includes('/')) { const [a, b] = p.split('/'); tot += +a / +b; } else tot += parseFloat(p);
  }
  return Math.round(tot * 10000) / 10000;
};
/** "2 3/8" API REG PIN" -> { size, thread: 'R'|'IF'|'FH', gender: 'M'|'F'|null } using only words on the page. */
function parseApi(raw) {
  const m = /^\s*([\d\- /]+)["”″]?\s*(?:API\s+)?(REG|IF|FH)\b(.*)$/i.exec(raw);
  if (!m) return null;
  const rest = m[3].toUpperCase();
  const gender = /BOX\s+BOX/.test(rest) ? 'F:F' : /\bPIN\b/.test(rest) ? 'M' : null;
  return { size: parseSize(m[1]), thread: { REG: 'R', IF: 'IF', FH: 'FH' }[m[2].toUpperCase()], gender };
}
const code = (size, g, thread) => (thread === 'FH' ? `${sizeTxt(size)} ${g} FH` : `${sizeTxt(size)} ${g} API ${thread}`);

const CONN = new Map(); // code -> record
function noteConn(c, extra = {}) {
  if (!c) return;
  if (!CONN.has(c)) CONN.set(c, { code: c, status: existing.has(c) ? 'existing' : 'new', ...extra });
}
function mkConn(raw, { cl = null, cr = null, wired = false, note = null } = {}) {
  [cl, cr].forEach((c) => noteConn(c));
  return { raw, cl, cr, wired: !!(wired && (cl || cr)), ...(note ? { note } : {}) };
}
const apiConn = (raw, ends) => { // ends: 'pin' | 'box-box' ; sets cl/cr only when the wording says so
  const a = parseApi(raw);
  if (!a || !a.gender) return mkConn(raw);
  if (a.gender === 'M' && ends === 'pin') return mkConn(raw, { cl: code(a.size, 'M', a.thread), wired: true });
  if (a.gender === 'F:F' && ends === 'box-box') return mkConn(raw, { cl: code(a.size, 'F', a.thread), cr: code(a.size, 'F', a.thread), wired: true });
  return mkConn(raw);
};

/* ------------------------------------------------------------------ brands */
const BRANDS = [
  ['melfred-borzall', 'Melfred Borzall', 'https://www.melfredborzall.com'],
  ['railhead', 'Railhead Underground Products', 'https://railhead.com'],
  ['sharewell-hdd', 'Sharewell HDD (Smith Gemini)', 'https://sharewellhdd.com'],
  ['vermeer-borestore', 'Vermeer BORESTORE', 'https://borestore.com'],
  ['hole-products', 'Hole Products', 'https://www.holeproducts.com'],
  ['straightline-hdd', 'StraightLine HDD', 'https://straightlinehdd.com'],
  ['infinity-tool', 'Infinity Tool MFG', 'https://infinitytoolmfg.com'],
  ['inrock', 'INROCK', 'https://www.inrock.com'],
  ['hunting-trenchless', 'Hunting Trenchless', 'https://huntingplc.com/products-services/trenchless-mwd/trenchless/'],
  ['underground-tools', 'Underground Tools (UTI)', 'https://undergroundtools.com'],
  ['tuffrod', 'TuffRod Pipe', 'https://tuffrod.com'],
  ['horizontal-technology', 'Horizontal Technology (HTI)', 'https://horizontaltech.com'],
  ['american-manufacturing-hdd', 'American Manufacturing HDD', 'https://americanmfghdd.com'],
  ['premium-rock-bit', 'Premium Rock Bit', 'https://www.premiumrockbit.com'],
  ['bit-brokers', 'Bit Brokers International', 'https://bitbrokers.com'],
  ['kondex', 'Kondex (Drill Defender)', 'https://kondexparts.com/hdd/'],
  ['universal-hdd', 'Universal HDD', 'https://unihdd.com'],
  ['drillhead', 'DrillHead', 'http://www.drillhead.net'],
  ['adtech-motors', 'ADTECH Motors', 'https://adtechmotors.com'],
  ['slimdril', 'SlimDril', 'https://www.slimdril.com'],
  ['hdd-drilling-tools', 'HDD Drilling Tools B.V.', 'https://hdddrillingtools.com'],
  ['ids-uk', 'IDS UK', 'https://idsuk.com'],
  ['drillnova', 'Drillnova (FIRMTECH)', 'https://drillnova.com'],
  ['herrenknecht', 'Herrenknecht', 'https://www.herrenknecht.com'],
  ['numa', 'Numa', 'https://www.numahammers.com'],
  ['century-products', 'Century Products', 'https://centuryproducts.net'],
  ['drill-pipe-inc', 'Drill Pipe Inc. (DPI)', 'https://drillpipeinc.com'],
  ['prime-horizontal', 'Prime Horizontal', 'https://primehorizontal.com'],
].map(([id, name, url]) => ({ id, name, url }));

/** Suppliers that get no entries, with the reason. Not shown in the app. */
const SKIPPED = [
  ['digital-control', 'Digital Control Inc (DigiTrak)', 'https://www.digital-control.com', 'Locator-only maker. Its site had no sonde housing or thread-connected product the configurator can slot. The page read was a placeholder.'],
  ['underground-magnetics', 'Underground Magnetics', 'https://undergroundmagnetics.com', 'Locator-only maker. Its transmitters and sondes are electronics, not threaded string parts. The configurator has no slot for them.'],
  ['tracto', 'TRACTO', 'https://tracto.com', 'Rigs, hammers and bursting systems only. No downhole tooling or drill pipe listed.'],
  ['prime-drilling', 'Prime Drilling', 'https://www.prime-drilling.de', 'Rigs, compact units, pipe pushers and pump units only.'],
  ['barbco', 'Barbco', 'https://www.barbco.com', 'Auger-boring and guided-boring heads. Its pages do not describe them as HDD tooling and give no thread or size data.'],
  ['byrne-group', 'Byrne Group', 'https://byrnegroup.com', 'Distributor. Its HDD page names product lines (drill pipe, sonde housings, pilot bits, back reamers, transition subs) but has no product pages or specs, so nothing could be added without guessing.'],
  ['tt-technologies', 'TT Technologies', 'https://www.tttechnologies.com', 'Only HDD products are complete rigs (Grundodrill 5X, Grundopit). No downhole tooling or stand-alone drill pipe.'],
  ['egw-utility-solutions', 'EGW Utility Solutions', 'https://www.egwutilitysolutions.com', 'Its only HDD listing is a complete machine. No tooling.'],
  ['downhole-direct-supply', 'Downhole Direct Supply', 'https://downholedirectsupply.com', 'Mud pump liners, cups and rebuild kits. Not downhole tooling.'],
  ['brownline-drillguide', 'Brownline (Drillguide)', 'https://drillguide.com', 'Gyro and wireless guidance electronics. No threaded string parts or specs.'],
].map(([id, name, url, reason]) => ({ id, name, url, reason }));

/** Listed brands with no parts yet, and why. */
const NO_ITEMS = {
  'underground-tools': 'Site returned HTTP 403 to automated requests, so no products could be read.',
  'american-manufacturing-hdd': 'Site lists categories only (bits, reamers, hole openers, subs, swivels). No product pages, names or specs.',
  'premium-rock-bit': 'TLS certificate error on the site, so no products could be read.',
  'universal-hdd': 'Rate limited (HTTP 429) on product collections. Only the homepage could be read.',
  drillhead: 'TLS certificate error on the site, so no products could be read.',
  'ids-uk': 'Homepage renders no content without JavaScript. No product links could be read.',
  'drill-pipe-inc': 'TLS certificate on the site has expired, so no products could be read.',
};

/* ------------------------------------------------------------------ parts */
const PARTS = [];
const LINE = (brand, category, name, url, o = {}) => {
  const p = {
    brand, category, name, pn: o.pn ?? null, url,
    diameterIn: o.diameterIn ?? null, lengthIn: o.lengthIn ?? null, weightLb: o.weightLb ?? null, rigClass: null,
    conn: o.conn ?? mkConn(null), specs: o.specs ?? {}, source: { url: o.sourceUrl ?? url, fetched: FETCHED },
  };
  PARTS.push(p);
  return p;
};
const kgToLb = (kg) => Math.round(kg * 2.20462 * 10) / 10;
const dia = (n) => {
  const w = Math.floor(n), f = Math.round((n - w) * 16), g = (a, b) => (b ? (a % b ? g(b, a % b) : b) : a);
  if (!f) return `${w}"`;
  const d = g(f, 16);
  return `${w ? `${w}-` : ''}${f / d}/${16 / d}"`;
};

/* --- Melfred Borzall: product pages read. The pages give no dimensions, weights or thread sizes. */
const MB = 'melfred-borzall', MBU = 'https://www.melfredborzall.com/';
[
  ['bit', 'Eagle Claw SD Bits', 'bits-blades/eagle-claw-sd-bits', 'ECC'],
  ['bit', 'Steep Taper Ultrabits', 'bits-blades/steep-taper-ultrabit', 'BSUC'],
  ['blade', 'HDD Chunky Valu-Blades', 'bits-blades/chunky-valu-blades', 'BVCC'],
  ['bit', 'Threaded Bit Bodies', 'bits-blades/bolt-on-bit-bodies', 'BITBODYC'],
  ['reamer', 'Tornado Reamers', 'reamers/tornado-reamer', '90C'],
  ['reamer', 'Turbo Reamers', 'reamers/turbo-reamer', '83C'],
  ['reamer', 'Ogre Reamers', 'reamers/ogre-reamer', '95C'],
  ['reamer', 'HDD Barrel Stabilizer', 'reamers/barrel-stabilizer', '80C'],
  ['swivel', 'Valu-DUB Clevis Swivels', 'swivels/valu-dub-swivels', '00503C'],
  ['swivel', 'Deluxe DUB Clevis Swivels', 'swivels/deluxe-dub-clevis-swivels', '00508C'],
  ['puller', 'Super Deluxe Pullers', 'pullers/super-deluxe-pullers', '00657C', { 'Duct I.D. range': '1.217 in to 6.732 in' }],
  ['sub', 'Standard Adapters', 'adapters/standard-adapters', 'ADAPTC'],
  ['housing', 'SD Housings, Bolt-on', 'transmitter-housings/sd-housings-bolt-on', 'SDBOLTONC'],
  ['housing', 'Universal Housings, Thread-on', 'transmitter-housings/sdunic', 'SDUNIC', { 'Housing type': 'Thread-on, Side-load', Transmitters: '15 in and 19 in' }],
  ['saver-sub', 'Sub-Saver for TT 4X, chuck only', 'drive-chucks-sub-savers/saver-sub-chuck-only-tt-4x-compatible', 'TF-31M-S'],
].forEach(([cat, name, path, pn, specs]) => LINE(MB, cat, name, MBU + path, { pn, specs }));

/* --- Railhead: names carry the thread text. Only the box-by-box reamer states box/pin in words. */
const RH = 'railhead', RHU = 'https://railhead.com/manufacturers/';
LINE(RH, 'bit', '3.5" Button Bit with pull hole, 2.375" or 3" Endurance housing', RHU + '3-5-button-bit-3-rotolock-b-w-hole/', { pn: '2215H', diameterIn: 3.5 });
LINE(RH, 'reamer', '10" cut reamer, 2.375" REG box x box, 3.25" shaft, conical teeth', RHU + '10-cut-2-375-reg-b-x-b-3-25-shaft-w-conical-teeth/', {
  pn: '6103', diameterIn: 10,
  conn: mkConn('2.375" REG ((B) x (B)); description: "API box x box shaft"', { cl: code(2.375, 'F', 'R'), cr: code(2.375, 'F', 'R'), wired: true }),
  specs: { 'Shaft OD': '3.25 in' } });
LINE(RH, 'housing', 'Direct bore housing, 3.125" O.D., 3" Rotolock (B) x 2" IF (B)', RHU + '3-125-o-d-x-3-rotolock-b-x-2-if-b-direct-bore-housing/', { pn: '8430', diameterIn: 3.125, conn: mkConn('3" Rotolock (B) x 2" IF (B)') });
LINE(RH, 'saver-sub', 'Housing Saver #600, (2.375" FSI) (B) x 3.5" Rotolock (B)', RHU + 'housing-saver-600-b-x-3-5-rotolock-b/', { pn: '4352', conn: mkConn('(2.375" FSI) (B) x 3.5" Rotolock (B)') });
LINE(RH, 'sub', 'Tool adapter, 2.375" API(P) x 2.875" API Reg. (B)', RHU + '2-375-apip-x-2-875-api-reg-b/', { pn: '14045', conn: mkConn('2.375" API(P) x 2.875" API Reg. (B)') });
LINE(RH, 'sub', '3.5" x 2.375" API (P) rock bit adapter', RHU + '3-5-x-2-375-api-p-rock-bit-adapter/', { conn: mkConn('3.5" x 2.375" API (P)') });
LINE(RH, 'bit', '4.75" Aggressive Direct Bore I, 2.375" API(P) direct bore bit', RHU + '4-75-direct-bore-i-2-375-apip-directbore-bit/', { diameterIn: 4.75, conn: mkConn('2.375" API(P)') });
LINE(RH, 'reamer', '10" EXTReam Reamer, 2.875" API (B)', RHU + '10-extream-reamer-2-875-api-b/', { diameterIn: 10, conn: mkConn('2.875" API (B)') });
LINE(RH, 'reamer', '10" cut reamer, 2.375" API (B) x (B), Shark fluted', RHU + '10-cut-2-375-api-b-x-b-shark-fluted/', { diameterIn: 10, conn: mkConn('2.375" API (B) x (B)') });
LINE(RH, 'housing', 'Endurance dirt housing, 3.5" O.D. x 3.5" Rotolock (B)', RHU + 'endurance-dirt-housing-3-5-o-d-x-3-5-rotolock-b/', { diameterIn: 3.5, conn: mkConn('3.5" Rotolock (B)') });
LINE(RH, 'saver-sub', 'Housing Saver #800, (3.5" FSI) (B) x 5" Rotolock (B)', RHU + 'housing-saver-800-b-x-5-rotolock-b/', { conn: mkConn('(3.5" FSI) (B) x 5" Rotolock (B)') });

/* --- Sharewell: spec tables on the product pages. B x P is written without an end order, so it is not wired. */
const SW = 'sharewell-hdd';
for (const r of rows('sharewell_lo_torque.json')) {
  const ltx = r.family === 'LTX', url = `https://sharewellhdd.com/${ltx ? 'lo-torque-x-hole-openers' : 'lo-torque-hole-openers'}/`;
  const a = parseApi(r.conn.replace(/ B x [BP]$/i, '').replace(/ reg$/i, ' REG'));
  const bxb = / B x B$/i.test(r.conn);
  LINE(SW, 'hole-opener', `Lo Torque${ltx ? ' X' : ''} ${r.model} hole opener`, url, {
    pn: r.model, lengthIn: r.len, weightLb: r.wt,
    conn: bxb && a ? mkConn(`${r.conn}`, { cl: code(a.size, 'F', a.thread), cr: code(a.size, 'F', a.thread), wired: true }) : mkConn(r.conn),
    specs: { 'Min pilot hole': r.minPilot, Cutters: String(r.cutters), 'Opening range': r.range.join(', '), 'Weight basis': 'body weight' } });
}
for (const r of rows('sharewell_mud_motors.json')) {
  const od = parseSize(r.motor.split('”')[0]);
  LINE(SW, 'mud-motor', `Mud motor ${r.motor.replace(/”/g, ' in')}`, 'https://sharewellhdd.com/mud-motors/', {
    diameterIn: od, lengthIn: Math.round(r.oalFt * 12 * 10) / 10, weightLb: r.wt, conn: mkConn(r.conn),
    specs: { 'Length source': `${r.oalFt} ft OAL as listed`, 'Flow range': r.gpm, 'Stall torque': r.stall } });
}
for (const t of rows('sharewell_dimondback.json')) {
  const isBit = /Pilot Bit/.test(t), m = /^(\d[\d\-/]*)”/.exec(t);
  LINE(SW, isBit ? 'bit' : 'reamer', `DimondBack ${t.replace(/”/g, ' in').replace(/\s+/g, ' ')}`, 'https://sharewellhdd.com/dimondback-pdc-pilot-bits-reamers/', {
    diameterIn: m ? parseSize(m[1]) : null, conn: mkConn(t.replace(/^.*?(\d[\d\-/]*”\s*(?:API\s+)?(?:Reg|IF|FH).*)$/i, '$1')) });
}

/* --- Vermeer BORESTORE: four pages read in full, the rest are names, SKUs and URLs from those pages. */
const BS = 'vermeer-borestore';
LINE(BS, 'bit', 'Ultra X3 375 2Thirty bit, 5.5 in cut', 'https://borestore.com/tooling-systems/ultra-x3-375-2thirty-bit-5-5-in-cut/', { pn: '296602301', diameterIn: 5.5, lengthIn: 12.29, weightLb: 35, conn: mkConn('Bolt pattern: Ultra X3 375, non-torqued spline connection system') });
LINE(BS, 'bit', 'Ultra X3 325 Lance Pro bit, 4.25 in cut, with pullback hook', 'https://borestore.com/drill-bits/ultra-x3-325-lance-pro-bit-4-25-in-cut-with-pullback-hook/', { pn: '296600592', diameterIn: 4.25, lengthIn: 13, weightLb: 18, conn: mkConn('Bolt pattern: Ultra X3 325') });
LINE(BS, 'reamer', 'Ultra X3 325 8 in fluted reamer x pull eye', 'https://borestore.com/reamers/ultra-x3-325-8-in-fluted-reamer-x-pull-eye/', { pn: '296566940', diameterIn: 8, weightLb: 63.5, conn: mkConn('Front: Ultra X3 325 Pin; rear: pull eye'), specs: { 'Pull eye capacity': '12,000 lb' } });
LINE(BS, 'collar', 'QuickFire HD 400 collar, hardfaced with teeth', 'https://borestore.com/quick-connects/collars/quickfire-hd/quickfire-hd-400-collar-hardfaced-with-teeth/', { pn: '296555283', weightLb: 6.5, conn: mkConn('Connection type: QuickFire HD 400') });
[
  ['bit', 'Ultra X3 375 2Thirty bit, 6.5 in cut', 'tooling-systems/ultra-x3-375-2thirty-bit-6-5-in-cut/', '296602297', 6.5],
  ['bit', 'Ultra X3 375 Triple Threat bit, 5.5 in cut, with pullback feature', 'tooling-systems/ultra-x3-375-triple-threat-bit-5-5-in-13-97-cm-cut-with-pullback-feature/', '296633689', 5.5],
  ['bit', 'Ultra X3 375 Gauntlet bit, 5.5 in cut, with pullback hook', 'tooling-systems/ultra-x3-375-gauntlet-bit-5-5-in-14-cm-cut-with-pullback-hook/', '296600590', 5.5],
  ['bit', 'Ultra X3 325 single roller cone bit, 4.25 in cut', 'drill-bits/ultra-x3-325-single-roller-cone-bit-4-25-in-cut/', '296566930', 4.25],
  ['bit', 'Ultra X3 325 Gauntlet bit, 4.25 in cut, with pullback hook', 'drill-bits/ultra-x3-325-gauntlet-bit-4-25-in-cut-with-pullback-hook/', '296600593', 4.25],
  ['reamer', 'Ultra X3 325 6 in fluted reamer x pull eye', 'reamers/ultra-x3-325-6-in-fluted-reamer-x-pull-eye/', '296566929', 6],
  ['reamer', 'Ultra X3 325 10 in fluted reamer x pull eye', 'reamers/ultra-x3-325-10-in-fluted-reamer-x-pull-eye/', '296566938', 10],
  ['collar', 'QuickFire HD 300 collar, hardfaced with teeth', 'quick-connects/collars/quickfire-hd/quickfire-hd-300-collar-hardfaced-with-teeth/', '296555458', null],
  ['collar', 'QuickFire HD 460 collar, hardfaced with teeth', 'quick-connects/collars/quickfire-hd/quickfire-hd-460-collar-hardfaced-with-teeth/', '296555475', null],
  ['hole-opener', '8 in replaceable wing PDC hole opener', 'rock-tooling/hole-openers/8-in-vermeer-pdc-hole-opener/', '296501339', 8],
].forEach(([cat, name, path, pn, d]) => LINE(BS, cat, name, 'https://borestore.com/' + path, { pn, diameterIn: d }));

/* --- Hole Products: swivel lines named on one page. */
['400 D.Drill Directional Drilling Swivel', '819 D.Drill Directional Drilling Swivel', 'Clevis by Clevis Swivels', 'Bolt-On Pullback Swivels']
  .forEach((n) => LINE('hole-products', 'swivel', n, 'https://www.holeproducts.com/our-products/hdd-tooling/hdd-swivels-and-pulling-equipment/directional-drilling-swivels'.replace('swivels', 'swivels')));

/* --- StraightLine: XL-I rows (box x box, stated), then products named on category pages. */
const SL = 'straightline-hdd', SLU = 'https://straightlinehdd.com/product/';
for (const r of rows('straightline_xli.json')) {
  const sz = parseSize(r.ifSize);
  LINE(SL, 'hole-opener', `XL-I Series hole opener ${dia(r.diaIn)}, ${r.cutter}, ${r.cones}-cone`, SLU + 'xl-i-series-hole-opener', {
    pn: r.sku, diameterIn: r.diaIn,
    conn: mkConn(`${r.ifSize}" IF Box x Box`, { cl: code(sz === 2.87 ? 2.875 : sz, 'F', 'IF'), cr: code(sz === 2.87 ? 2.875 : sz, 'F', 'IF'), wired: true,
      note: sz === 2.87 ? 'Listed as 2.87 IF; mapped to the 2-7/8 API IF size' : null }),
    specs: { 'Shaft OD': `${r.shaftOd} in`, 'Shaft length': `${r.shaftLen} in (overall length not stated)` } });
}
[
  ['bit', 'Barracuda steep taper bits (Vermeer compatible)', 'vermeer-compatible-steep-taper-barracuda-bits', { 'Sizes offered': '4-1/2 in, 5-1/2 in' }],
  ['bit', 'Tuff Bits', 'straightline-tuff-bits', { 'Sizes offered': '3-1/2 in, 4 in, 4-1/2 in' }],
  ['bit', 'Armadrillco Pin Bull Bit', 'armadrillco-pin-bull-bit'],
  ['bit', 'Armadrillco 5-Inch TCI Bit', 'armadrillco-5-inch-tci-bit'],
  ['reamer', 'Cast Fluted Button Reamers', 'cast-fluted-button-reamers', { 'Sizes offered': '6 in to 32 in' }],
  ['reamer', 'Winged Reamers', 'winged-reamers'],
  ['reamer', 'Hurricane Reamers', 'hurricane-reamers-3'],
  ['reamer', 'Cyclone Reamer', 'cyclone-reamer'],
  ['hole-opener', 'Hole Openers', 'hole-openers'],
  ['saver-sub', 'Vermeer compatible sub-savers', 'vermeer-compatible-sub-savers'],
  ['sub', 'Vermeer compatible drive chucks', 'vermeer-compatible-drive-chucks-copy'],
  ['housing', '4th Generation On Grade transmitter housings', 'straightline-4th-generation-on-grade-transmitter-housings'],
].forEach(([cat, name, slug, specs]) => LINE(SL, cat, name, SLU + slug, { specs }));

/* --- Infinity Tool: every table row on the four product pages (SKU, diameter, thread wording). */
const IT = 'infinity-tool', ITU = 'https://infinitytoolmfg.com/product/';
const infRows = (file, cat, family, slug, ends, label) => {
  for (const r of rows(file)) {
    const conn = apiConn(r.conn.replace(/ Connection$/i, ''), ends);
    LINE(IT, cat, `${family} ${dia(r.diaIn)}${label ? `, ${r.conn.replace(/ Connection$/i, '')}` : ''}`, ITU + slug, {
      pn: r.sku, diameterIn: r.diaIn, conn, specs: { Face: r.face, 'Diameter (mm)': String(r.diaMm) } });
  }
};
infRows('infinity_bigflush.json', 'bit', 'Big Flush PDC bit', 'big-flush-pdc-bits/', 'pin', true);
infRows('infinity_cobble.json', 'bit', 'Cobble Buster HDD PDC bit', 'cobble-buster-hdd-pdc-bits/', 'pin', true);
infRows('infinity_tricone_ho.json', 'hole-opener', 'Tricone hole opener', 'tricone-hole-opener/', 'box-box', true);
infRows('infinity_pdc_reamer.json', 'reamer', 'PDC pull reamer', 'pdc-pull-reamer/', 'box-box', true);

/* --- INROCK: product-line pages. Specs stay empty except ranges the pages state. */
const IR = 'inrock', IRU = 'https://www.inrock.com/products/';
[
  ['swivel', 'Swivels', 'swivels/', { 'Capacity range': '10 to 700 tons' }],
  ['sub', 'CrossOver Subs', 'crossover-subs/', { Example: '4 1/2" IF to 6 5/8" connections' }],
  ['reamer', 'XTR reamer', 'xtr/', { 'Size range': '28 in to 72 in' }],
  ['reamer', 'MXR reamer', 'mxr/', { 'Size range': '36 in to 72 in' }],
  ['mud-motor', 'Mud Motors', 'mud-motors/', { 'Size range': '3-3/4 in to 9-5/8 in' }],
  ['bit', 'HDL Pilot Hole Bit', 'hdl-pilot-hole-bit/'], ['bit', 'HDX Premium Tricone Bit', 'hdx-premium-tricone-bit/'], ['bit', 'Tricone Bits', 'tricone-bits/'],
  ['hammer', 'Air Hammers', 'air-hammers/'], ['reamer', 'XTR-W reamer', 'xtr-w/'], ['reamer', 'Standard Rock Reamers', 'standard-rock-reamers/'],
  ['reamer', 'Barrel Reamers / Fly Cutters', 'barrel-reamers-fly-cutters/'],
].forEach(([cat, name, slug, specs]) => LINE(IR, cat, name, IRU + slug, { specs }));

/* --- Hunting Trenchless: two drill pipe pages. Dimensions are only in the datasheet PDFs. */
['HIWS1 Drill Pipe:hiws1-drill-pipe', 'HXT Drill Pipe:hxt-drill-pipe'].forEach((s) => {
  const [n, slug] = s.split(':');
  LINE('hunting-trenchless', 'drill-pipe', n, 'https://huntingplc.com/products-services/trenchless-mwd/trenchless/' + slug);
});

/* --- TuffRod: Vermeer-pattern pipe pages. Weight, mid-body and connection read from each page. */
const TR = 'tuffrod';
[
  ['D6x6, D8x12', 'd6x6-d8x12', 'TR222394', 18, 72, 1.315, '#200'],
  ['D16X20, D18X22, D20x22', 'd16x20-d18x22-d20x22', 'TR230993', 53, 120, 1.9, '#250'],
  ['D24X40, D23x30', 'd24x40-d23x30', 'TR222276', 77, 120, 2.375, '#600'],
  ['D36X50, D40x55 (#650 x 10 ft)', 'd36x50-d40x55-650-x-10', 'TR296309599', 83, 120, 2.375, '#650'],
  ['D100X120, D100x140', 'd100x120-d100x140', 'TR296309520', 342, 240, 3.5, '#1000'],
].forEach(([n, slug, pn, w, len, mid, th]) => LINE(TR, 'drill-pipe', `Drill pipe for ${n}`, `https://tuffrod.com/shop/vermeer/${slug}/`, {
  pn, weightLb: w, lengthIn: len, diameterIn: mid, conn: mkConn(`Firestick 1 ${th}`),
  specs: { 'Diameter basis': 'mid-body', 'Length basis': 'first value of the Dimensions field', 'Mfg. method': '1-pc. Forged' } }));

/* --- Horizontal Technology: names on category pages; the spec sheets are PDFs not read. */
const HT = 'horizontal-technology', HTU = 'https://horizontaltech.com/';
[
  ['mud-motor', '3-3/4 in mud motor 9/10 lobe 4 stage (375-910-4.0)', 'drilling-motors/', 3.75],
  ['mud-motor', '4-3/4 in mud motor 9/10 lobe 2 stage (475-910-2.0)', 'drilling-motors/', 4.75],
  ['mud-motor', '6-3/4 in mud motor 9/10 lobe 2 stage (675-910-2.0-SB)', 'drilling-motors/', 6.75],
  ['mud-motor', '8 in mud motor 9/10 lobe 4 stage (800-910-4.0)', 'drilling-motors/', 8],
  ['mud-motor', 'Sonde mud motor, 3-3/4 in and 4-3/4 in', 'drilling-motors/', null],
  ['reamer', 'Viper rock reamer (V4, V6, V6-18, V8, V10, V12, V8-24)', 'viper-rock-reamers/', null],
  ['reamer', 'Jumbo Viper rock reamer', 'viper-rock-reamers/', null, { 'Hole size': '8-3/4 in to 72 in' }],
  ['reamer', 'Winged Warrior field adjustable fly cutters and barrel reamers', 'products/', null, { 'Sizes offered': '12 in to 60 in' }],
  ['bit', 'Varel High Energy (HE) series bit', 'drill-bits/', null],
  ['sub', 'Crossover subs', 'rig-supplies/', null],
  ['sub', 'Float subs (float valves)', 'rig-supplies/', null],
  ['sub', 'Non-magnetic bent subs (bit shims)', 'rig-supplies/', null],
].forEach(([cat, name, path, d, specs]) => LINE(HT, cat, name, HTU + path, { diameterIn: d, specs }));

/* --- Bit Brokers: category/product pages with size ranges only. */
const BB = 'bit-brokers', BBU = 'https://bitbrokers.com/product/';
[
  ['hole-opener', 'VersaReam', 'versaream/', { 'Size range': '8 in to 48 in' }],
  ['reamer', 'PDC Reamers', 'pdc-reamers/', { 'Size range': '6 in to 36 in' }],
  ['reamer', 'Roller cone reamers / hole openers', 'roller-cone-reamers-hole-openers/'],
  ['bit', 'Steel body PDC bits', 'steel-body-pdc-bits/', { 'Size range': '2.5 in to 36 in (category page)' }],
  ['bit', 'Matrix body PDC bits', 'matrix-body-pdc-bits/', { 'Size range': '2.5 in to 36 in (category page)' }],
  ['bit', 'Step type drag bit', 'step-type-drag-bit/'], ['bit', 'Chevron type drag bit', 'chevron-type-drag-bit/'],
  ['sub', 'Sub adapters (custom made)', 'sub-adapters/'], ['bit', 'Paddle / blade bits', 'paddle-blade-bits/'],
].forEach(([cat, name, slug, specs]) => LINE(BB, cat, name, BBU + slug, { specs }));

/* --- Kondex sonde housings: OD and the stated thread. Thread gender is not stated. */
[['F00-093', 3], ['F00-094', 3.25], ['F00-095', 3.5], ['F00-096', 3], ['F00-097', 3.25]].forEach(([pn, od], i) =>
  LINE('kondex', 'sonde-housing', `Drill Defender flat bit sonde housing, ${od}" OD (${pn})`, 'https://kondexparts.com/hdd/drill-defender-flat-bit-sonde-housing/', {
    pn, diameterIn: od, conn: mkConn('2.38 API R'), specs: { 'Bolt pattern': i < 3 ? '6-hole' : i === 3 ? '5-hole' : '6-hole', Electronics: '15T or 17T' } }));

/* --- ADTECH Motors: three product pages. Thread, OD and weight are not stated on them. */
[['3 in 6-7 lobe 4 stage', '3-6-7-lobe', '3-6-7-4-Stage.pdf', { 'Bit size': '3 7/8 in to 4 1/2 in', Flow: '65-70 GPM' }],
  ['5 in 4-5 lobe 3.7 stage', '5-4-5-lobe', '5-4-5-3.7-Stage.pdf', { Flow: '180-220 GPM' }],
  ['8 in 6-7 lobe 4 stage', '8-6-7-lobe', '8-6-7-4-Stage.pdf', { 'Bit size': '8 3/4 in to 9 7/8 in', Flow: '230-600 GPM', Length: 'about 24 ft (page text)' }]]
  .forEach(([n, slug, pdf, specs]) => LINE('adtech-motors', 'mud-motor', `Horizontal boring motor ${n}`, `https://adtechmotors.com/${slug}/`, { specs: { ...specs, 'Spec sheet': `https://adtechmotors.com/wp-content/uploads/2024/01/${pdf}` } }));

/* --- SlimDril */
LINE('slimdril', 'mud-motor', 'Mud motors for HDD, sale or rental', 'https://www.slimdril.com/mud-motors', { specs: { 'Size range': '1-1/2 in to 11-1/4 in' } });

/* --- HDD Drilling Tools B.V.: ten items from adapter, pipe and reamer listings. */
const HD = 'hdd-drilling-tools', HDU = 'https://hdddrillingtools.com/product/';
LINE(HD, 'sub', 'TitanAdapter 21 crossover, 2 7/8" IF DS pin to HDD82 box', HDU + 'hdd-adapters-subs/titanadapter-21-2-7-8-if-ds-pin-td82-box/', { pn: 'A-021', lengthIn: Math.round(250 / 25.4 * 100) / 100, weightLb: kgToLb(18), conn: mkConn('Pin: 2 7/8" IF DS; box: HDD82'), specs: { 'Length (listed)': '250 mm', 'Weight (listed)': '18 kg' } });
LINE(HD, 'puller', 'TitanAdapter 1 pull tab thread-in pulling eye, 2 7/8" IF pin', HDU + 'hdd-adapters-subs/titanadapter-1-pulling-eye-2-7-8-if-pin/', { conn: mkConn('2 7/8" IF pin') });
LINE(HD, 'puller', 'TitanAdapter 4 pull tab thread-in pulling eye, 3 1/2" IF box', HDU + 'hdd-adapters-subs/titanadapter-4-pulling-eye-3-1-2-if-box/', { conn: mkConn('3 1/2" IF box') });
LINE(HD, 'drill-pipe', 'Torque Line 4 drill pipe, 4 1/2" IF box', HDU + 'pilot-bore/torque-line-4-1-2-inch-if-drill-rods/', { conn: mkConn('4 1/2" IF box (NC50 per description)'), specs: { 'Length': 'listed as 6.096mm; description says 6-metre, so left unset' } });
LINE(HD, 'drill-pipe', 'Torque Line 1 drill rods, 2 7/8" IF', HDU + 'pilot-bore/torque-line-hdd-drilling-rods-2-7-8-if/', { conn: mkConn('2 7/8" IF') });
LINE(HD, 'reamer', 'FlyHard 10 flycutter reamer, 285 mm borehole', HDU + 'hdd-reamers/10-inch-hdd-flycutter-reamer-285mm/', { specs: { 'Borehole diameter': '10 in (285 mm)' } });
LINE(HD, 'reamer', 'MaxReam 12 barrel reamer, 335 mm borehole', HDU + 'hdd-reamers/12-inch-hdd-barrel-reamer-335mm/', { specs: { 'Borehole diameter': '12 in (335 mm)' } });
LINE(HD, 'reamer', 'SharkBite 12 PDC shark pull reamer, 305 mm borehole', HDU + 'hdd-reamers/pdc-reamer/12-inch-pdc-shark-pull-reamer-305mm/', { specs: { 'Borehole diameter': '12 in (305 mm)' } });
LINE(HD, 'hole-opener', 'RockRipper 10 tricone hole opener, 2 3/8"', HDU + 'hdd-reamers/tricone-hole-openers-for-hdd/10-inch-tricone-hole-opener-255mm/', { specs: { 'Borehole diameter': '10 in (254 mm)', 'Connection (title)': '2 3/8"' } });
LINE(HD, 'hole-opener', 'RockRipper 12 tricone hole opener, 3 1/2"', HDU + 'hdd-reamers/tricone-hole-openers-for-hdd/rockripper-12-tricone-hole-opener-3-1-2/', { specs: { 'Borehole diameter': '12 in (305 mm)', 'Connection (title)': '3 1/2"' } });

/* --- Drillnova: rows from the PDC and tricone tables ("Pin Connection" / "API REG PIN"). */
const DN = 'drillnova', DNU = 'https://drillnova.com/product/hdd-tools/';
for (const r of rows('drillnova_pdc.json')) {
  const a = parseSize(r.pin.replace(/ API Reg/i, ''));
  LINE(DN, 'bit', `PDC bit ${dia(r.diaIn)}, ${r.pin} pin`, DNU + 'pdc-bit/', { diameterIn: r.diaIn,
    conn: mkConn(`${r.pin} (column "Pin Connection")`, { cl: code(a, 'M', 'R'), wired: true }), specs: { 'Cutter size': r.cutter, Blades: r.blades } });
}
for (const r of rows('drillnova_tricone.json')) {
  const a = parseSize(r.pin);
  LINE(DN, 'bit', `Tricone bit ${dia(r.diaIn)}, ${r.pin} API Reg pin`, DNU + 'tricone-bit/', { diameterIn: r.diaIn, weightLb: kgToLb(r.kg),
    conn: mkConn(`${r.pin} (column "CONNECTION PIN (API REG PIN)")`, { cl: code(a, 'M', 'R'), wired: true }), specs: { 'Weight (listed)': `${r.kg} kg`, 'Diameter (mm)': String(r.diaMm) } });
}
[['reamer', 'PDC reamer (Novacut B bolt-on, Novacut F fixed blade)', 'pdc-reamer/'], ['hole-opener', 'Hole opener (NovaForce R bolt-on, NovaForce W welded)', 'hole-opener/', { 'Size range': '8 in to 42 in' }],
  ['sub', 'Adaptor and pulling eye', 'adaptor-amp-pulling-eye/']].forEach(([c, n, s, sp]) => LINE(DN, c, n, DNU + s, { specs: sp }));

/* --- Herrenknecht: three downhole tools on the key-topic page. */
const HK = 'https://www.herrenknecht.com/de/newsroom/keytopicdetail/downhole-tools/';
LINE('herrenknecht', 'sub', 'Weeper sub', HK, { specs: { 'Pilot hole': '8-1/2 in to 12-1/4 in', Flow: '20 to 105 gpm' } });
LINE('herrenknecht', 'hole-opener', 'Full face hole opener', HK, { specs: { 'Hole diameter': '30 in to 72 in', 'Min pilot hole': '12-1/4 in' } });
LINE('herrenknecht', 'other', 'Downhole jet pump', HK, { specs: { 'Hole diameter': '20 in to 72 in', Drive: '475 gpm at 65 bar' } });

/* --- Numa DTH hammers: per-model rows from the HDD listing (no per-product pages). */
[['HDD 80', '4 1/2" API Reg Pin', '4 1/2', 9.75, 10, 7.75], ['HDD 60', '3 1/2" API Reg Pin', '3 1/2', 7, 7.5, 5.75], ['HDD 50', '3.5 API REG PIN', '3 1/2', 5.75, 6.125, 5],
  ['HDD 40', '2.375 API REG PIN', '2.375', 4.75, 5, 3.875], ['HDD 35', '2.375 API REG PIN', '2.375', 3.875, 4, 3.25]].forEach(([m, raw, sz, lo, hi, od]) =>
  LINE('numa', 'hammer', `${m} directional hammer`, 'https://www.numahammers.com/products/?_hammer_categories=hdd', {
    diameterIn: od, conn: mkConn(raw, { cl: code(parseSize(sz), 'M', 'R'), wired: false, note: 'Pin stated, but hammers have no slot in the string builder' }), specs: { 'Hole size': `${lo} in to ${hi} in`, 'Bit shank': m } }));

/* --- Century Products */
LINE('century-products', 'sub', 'Cross over subs', 'https://centuryproducts.net/products/hdd-tooling/cross-over-subs/', { conn: mkConn('Vermeer x API (D24x40 / D40x40), Vermeer x Vermeer, API x API, Vermeer x JetTrac'), specs: { Sizes: 'call for available sizes' } });

/* --- Prime Horizontal */
const PH = 'prime-horizontal';
for (const r of rows('primehorizontal_motors.json')) {
  LINE(PH, 'mud-motor', `Mud motor ${r.od.replace(/"/g, ' in')}, ${r.lobe} lobe, ${r.stages} stage`, 'https://primehorizontal.com/drilling-tools/mud-motors/', {
    pn: r.sheet, diameterIn: parseSize(r.od), specs: { 'Bit size': `${r.minBit.replace(/"/g, ' in')} to ${r.maxBit.replace(/"/g, ' in')}` } });
}
LINE(PH, 'swivel', 'Big Rig HDD swivel, 44 ton', 'https://primehorizontal.com/drilling-tools/big_rig_hdd_swivels/', { conn: mkConn('Box to clevis, clevis to clevis or custom'), specs: { Capacity: '44 US ton' } });
LINE(PH, 'reamer', 'The Original V-Series rock reamer', 'https://primehorizontal.com/drilling-tools/original-v-series-rock-reamer/', { specs: { 'Hole size': '4.5 in to 72 in' } });

/* ------------------------------------------------------------------ output + validation */
function assignIds() {
  const prev = existsSync(join(OUT, 'parts.json')) ? JSON.parse(readFileSync(join(OUT, 'parts.json'), 'utf8')).parts : [];
  const key = (p) => `${p.brand}|${p.pn ?? ''}|${p.name}`;
  const ids = new Map(prev.map((p) => [key(p), p.id]));
  let next = Math.max(FIRST_ID - 1, ...prev.map((p) => p.id)) + 1;
  for (const p of PARTS) {
    const k = key(p);
    if (!ids.has(k)) ids.set(k, next++);
    p.id = ids.get(k);
  }
}
const SLOT = { bit: 'Bit', reamer: 'Backreamer', 'hole-opener': 'Backreamer' };
function finish() {
  assignIds();
  const seen = new Set();
  for (const p of PARTS) {
    p.configurator = p.conn.wired && SLOT[p.category] ? { slot: SLOT[p.category] } : { slot: null,
      reason: p.conn.wired ? 'No string slot for this tool type' : (p.conn.raw ? 'Thread end or gender not stated on the manufacturer page' : 'No thread stated on the manufacturer page') };
    p.unverified = ['diameterIn', 'lengthIn', 'weightLb', 'rigClass', 'conn'].filter((f) => (f === 'conn' ? !p.conn.raw : p[f] == null));
    const dup = `${p.brand}|${p.pn ?? ''}|${p.name}`;
    if (seen.has(dup)) throw new Error(`duplicate part ${dup}`);
    seen.add(dup);
    for (const c of [p.conn.cl, p.conn.cr]) if (c) noteConn(c);
  }
  const counts = Object.fromEntries(BRANDS.map((b) => [b.id, PARTS.filter((p) => p.brand === b.id).length]));
  const brands = BRANDS.map((b) => ({ ...b, itemCount: counts[b.id], ...(counts[b.id] ? {} : { note: NO_ITEMS[b.id] || 'No products could be added.' }) }));
  const conns = [...CONN.values()].map((c) => {
    const m = /^([\d.]+) ([MF]) (API (?:R|IF)|FH)$/.exec(c.code);
    return m ? { ...c, sizeIn: +m[1], gender: m[2], family: m[3] === 'FH' ? 'fh' : m[3] === 'R' ? 'api-reg' : 'api-if', base: `${m[1]} ${m[3]}`, matesWith: `${m[1]} ${m[2] === 'M' ? 'F' : 'M'} ${m[3]}` } : c;
  }).sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
  // Thread types named by suppliers that cannot be mated yet (no gender/orientation stated): recorded, not wired.
  const raw = [...new Set(PARTS.filter((p) => !p.conn.wired && p.conn.raw).map((p) => p.conn.raw))].sort();
  return { brands, conns, raw };
}
const BAN = /ditch\s*-?\s*witch|\btoro\b|subsite|radius\s*hdd|hammerhead|american\s+augers|\bJT\d/i;
function validate(brands, parts, conns) {
  const errs = [];
  const blob = JSON.stringify({ brands, parts, conns });
  if (BAN.test(blob)) errs.push(`banned brand/rig reference in output: ${BAN.exec(blob)[0]}`);
  const ids = new Set();
  for (const p of parts) {
    if (ids.has(p.id)) errs.push(`duplicate id ${p.id}`); ids.add(p.id);
    if (!/^https?:\/\//.test(p.url)) errs.push(`bad url ${p.id}`);
    if (/[?&](tag|aff|affiliate|ref|utm_[a-z]+|gclid|fbclid|clickid|subid)=/i.test(p.url)) errs.push(`tracking param in ${p.url}`);
    if (!BRANDS.some((b) => b.id === p.brand)) errs.push(`unknown brand ${p.brand}`);
    if (p.conn.wired && !(p.conn.cl || p.conn.cr)) errs.push(`wired without codes ${p.id}`);
  }
  for (const s of SKIPPED) if (BRANDS.some((b) => b.id === s.id)) errs.push(`brand both listed and skipped: ${s.id}`);
  return errs;
}
const { brands, conns, raw } = finish();
const errs = validate(brands, PARTS, conns);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
if (CHECK) { console.log(`ok: ${PARTS.length} parts, ${brands.length} brands, ${conns.length} wired connection codes`); process.exit(0); }
mkdirSync(OUT, { recursive: true });
const w = (f, o) => writeFileSync(join(OUT, f), `${JSON.stringify(o, null, 1)}\n`);
w('brands.json', { source: 'Manufacturer websites listed per brand', fetched: FETCHED, brands, skipped: SKIPPED });
w('connections.json', { fetched: FETCHED,
  conventions: { code: 'size gender thread, same format as data/radius/dw-connections.json (M = pin, F = box)', status: 'existing = already used by a roadmap part; new = added for supplier parts', wired: 'only ends whose page wording states box or pin become codes the fit solver uses' },
  connections: conns, unwiredRaw: raw });
w('parts.json', { fetched: FETCHED, note: 'Prices are never stored. url is the manufacturer product page, with no affiliate or tracking parameters.', parts: PARTS });
console.log(`wrote ${PARTS.length} parts, ${brands.length} brands, ${conns.length} connection codes`);
