/* Radius HDD alternates. Pure helpers only (no DOM) so they are unit-testable.
   Radius parts are shown as ALTERNATES next to Ditch Witch options. They never feed compute(). */
import { quantity } from './config.mjs';

/** radiushdd.com is a BigCommerce store; product photos live under this store's CDN path (CSP img-src allows the host). */
export const RADIUS_IMG_HOST = 'https://cdn11.bigcommerce.com/s-uwymjpsd0i/';
/** Radius photos stay off until Radius HDD grants permission to show them. Flip to true once they do. */
export const RADIUS_IMAGES_ENABLED = false;
export const RADIUS_BRAND = 'Radius';
export const RADIUS_TYPES = ['Saver_Sub', 'Drill_Pipe', 'Transition_Sub', 'Quick_Connect', 'Connector',
  'Electronic_Housing', 'Bit', 'Backreamer', 'Collar', 'Other'];
const MATCHES = ['direct', 'thread', 'machine'];
export const MATCH_LABEL = { direct: 'Direct replacement', thread: 'Same threads', machine: 'Fits this drill' };

/** Radius part numbers are untrusted (shared links, scraped data): keep a conservative charset. */
export const isRadiusPn = (pn) => typeof pn === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(pn);

const str = (v, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

function httpUrl(u) {
  if (typeof u !== 'string' || !/^https?:\/\//i.test(u.trim())) return null;
  try { const p = new URL(u.trim()); return p.protocol === 'https:' || p.protocol === 'http:' ? p.href : null; } catch { return null; }
}
/** Image URL only if https under the allowed Radius store prefix, else null. */
export function radiusImgUrl(u, host = RADIUS_IMG_HOST) {
  const href = httpUrl(u);
  if (!href) return null;
  try {
    const a = new URL(href), b = new URL(host);
    return a.origin === b.origin && a.pathname.startsWith(b.pathname) ? href : null;
  } catch { return null; }
}

/** Sanitize the two raw JSON files into { parts: Map-like object, byDw }. Bad rows are dropped. */
export function normalizeRadius(partsJson, crossJson, { images = RADIUS_IMAGES_ENABLED } = {}) {
  const parts = Object.create(null), byDw = Object.create(null);
  const raw = partsJson && typeof partsJson.parts === 'object' && partsJson.parts ? partsJson.parts : {};
  for (const [key, p] of Object.entries(raw)) {
    if (!p || typeof p !== 'object') continue;
    const pn = isRadiusPn(p.pn) ? p.pn : isRadiusPn(key) ? key : null;
    const name = str(p.name);
    if (!pn || !name) continue;
    parts[pn] = {
      pn, name, brand: RADIUS_BRAND,
      type: RADIUS_TYPES.includes(p.type) ? p.type : 'Other',
      conn: { l: str(p.conn?.l, 60), r: str(p.conn?.r, 60) },
      machines: Array.isArray(p.machines) ? p.machines.map((m) => str(m, 80)).filter(Boolean) : [],
      url: httpUrl(p.url),
      imgUrl: images ? radiusImgUrl(p.img) : null,
    };
  }
  const xr = crossJson && typeof crossJson.byDwPn === 'object' && crossJson.byDwPn ? crossJson.byDwPn : {};
  for (const [dwPn, list] of Object.entries(xr)) {
    if (!Array.isArray(list)) continue;
    const seen = new Set(), out = [];
    for (const x of list) {
      if (!x || !parts[x.pn] || seen.has(x.pn)) continue; // dedupe + drop refs to unknown parts
      seen.add(x.pn);
      out.push({ pn: x.pn, match: MATCHES.includes(x.match) ? x.match : 'machine', note: str(x.note) });
    }
    if (out.length) byDw[String(dwPn).trim()] = out;
  }
  return { parts, byDw, fixture: !!(partsJson?.fixture || crossJson?.fixture) };
}

/** Radius equivalents of one Ditch Witch part number: [{ part, match, note }]. */
export function alternatesFor(radius, dwPn) {
  if (!radius || !dwPn) return [];
  return (radius.byDw[String(dwPn).trim()] || []).map((x) => ({ part: radius.parts[x.pn], match: x.match, note: x.note }));
}

const machineKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const fitsMachine = (part, machineName) => !!machineName
  && part.machines.some((m) => machineKey(m) === machineKey(machineName));

const connectionCode = (s) => String(s || '').replace(/[®™]/g, '').trim().replace(/\s+/g, ' ').toUpperCase()
  .replace(/([\d.])([MF])(?= |$)/g, '$1 $2');

/** Pipe-facing parts use the selected pipe. Downstream parts use the fitting DW slot options. */
export function slotOthers(radius, { slotParts, machine, pipe, dwPns = [] }) {
  if (!radius || !machine || !pipe || !slotParts?.length) return [];
  const shown = new Set(dwPns.flatMap((pn) => alternatesFor(radius, pn).map((a) => a.part.pn)));
  const types = new Set(slotParts.map((p) => p.type));
  const left = connectionCode(pipe.cl), right = [pipe.cr, pipe.cr2].map(connectionCode).filter(Boolean);
  const mating = (code) => code.replace(/\b[MF]\b/, (end) => end === 'M' ? 'F' : 'M');
  const matchesSlot = (p) => {
    const rigSide = connectionCode(p.conn.l), toolSide = connectionCode(p.conn.r);
    if (p.type === 'Drill_Pipe') return rigSide === left && right.includes(toolSide);
    if (p.type === 'Saver_Sub') return !!left && [rigSide, toolSide].includes(mating(left));
    if (['Transition_Sub', 'Quick_Connect'].includes(p.type)) {
      return !!rigSide && right.some((c) => mating(c) === rigSide);
    }
    return !!rigSide && slotParts.some((dw) => dw.type === p.type && connectionCode(dw.cl) === rigSide);
  };
  return Object.values(radius.parts)
    .filter((p) => types.has(p.type) && !shown.has(p.pn) && fitsMachine(p, machine) && matchesSlot(p))
    .sort((a, b) => a.name.localeCompare(b.name) || a.pn.localeCompare(b.pn));
}

/** Image to use when a Ditch Witch part has no usable photo: first cross-referenced Radius image, else null. */
export function fallbackImg(radius, dwPn) {
  return alternatesFor(radius, dwPn).find((a) => a.part.imgUrl)?.part.imgUrl || null;
}

/** Quantity key for a Radius line in cfg.q, e.g. "22633.RRAD-123". */
export const altKey = (secId, pn) => `${secId}.R${pn}`;

/** Line items for Radius alternates the user added (cfg.alt = { secId: [radiusPn] }), in rail order. */
export function altLineItems(radius, cfg, rows) {
  if (!radius || !cfg?.alt) return [];
  const out = [];
  for (const r of rows) for (const pn of cfg.alt[r.sec.id] || []) {
    const part = radius.parts[pn];
    if (!part) continue;
    const key = altKey(r.sec.id, pn);
    out.push({ key, sec: `${r.sec.name} · alternate`, part, brand: RADIUS_BRAND, alt: true, qty: quantity(cfg.q?.[key]) });
  }
  return out;
}

/** Toggle a Radius pn in cfg.alt[secId]; removes empty keys so untouched configs keep their old shape. */
export function toggleAlt(cfg, secId, pn) {
  if (!isRadiusPn(pn)) return cfg;
  const alt = { ...(cfg.alt || {}) }, set = new Set(alt[secId] || []);
  set.has(pn) ? set.delete(pn) : set.add(pn);
  if (set.size) alt[secId] = [...set]; else delete alt[secId];
  if (Object.keys(alt).length) cfg.alt = alt; else delete cfg.alt;
  return cfg;
}
