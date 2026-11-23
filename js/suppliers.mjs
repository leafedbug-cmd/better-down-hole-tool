/* Supplier catalog (data/suppliers/*). Pure helpers, no DOM.
   Supplier parts join a roadmap as ordinary options in the Bit and Backreamer slots, so compute()
   in compatibility.mjs decides what is shown. A part is only added when its page states the thread
   end (box or pin), which is what `conn.wired` means in the data. Everything else stays in the
   catalog file but never reaches the solver. */

export const SUPPLIER_SLOTS = { Bit: { mode: 'Bit', name: 'Bit' }, Backreamer: { mode: 'Backreamer', name: 'Backreamer' } };
const TYPE_OF = { Bit: 'Bit', Backreamer: 'Backreamer' };
const CAT_LABEL = {
  bit: 'Bit', reamer: 'Reamer', 'hole-opener': 'Hole opener', blade: 'Blade', housing: 'Housing', 'sonde-housing': 'Sonde housing',
  sub: 'Sub / adapter', 'saver-sub': 'Sub saver', swivel: 'Swivel', puller: 'Puller', 'drill-pipe': 'Drill pipe',
  'mud-motor': 'Mud motor', hammer: 'Hammer', collar: 'Collar', other: 'Tool',
};

const str = (v, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
/** https only. Anything else (javascript:, data:, http:) is dropped. */
export function safeUrl(u) {
  if (typeof u !== 'string') return null;
  try { const p = new URL(u.trim()); return p.protocol === 'https:' ? p.href : null; } catch { return null; }
}
const CODE = /^[\d.]+ [MF] (?:API (?:R|IF)|FH)$/;

function fmt(n) { return `${Math.round(n * 1000) / 1000}`.replace(/\.0+$/, ''); }

/** Display specs for the part sheet. Only fields that have a value appear. */
function sheetSpecs(p, brandName) {
  const out = { Brand: brandName, Type: CAT_LABEL[p.category] || 'Tool' };
  if (p.diameterIn != null) out.Diameter = `${fmt(p.diameterIn)} in`;
  if (p.lengthIn != null) out.Length = `${fmt(p.lengthIn)} in`;
  if (p.weightLb != null) out.Weight = `${fmt(p.weightLb)} lb`;
  if (p.conn.raw) out['Thread as listed'] = p.conn.raw;
  for (const [k, v] of Object.entries(p.specs)) if (str(String(v), 160)) out[k] = String(v).slice(0, 160);
  return out;
}

/** Sanitize brands.json + parts.json. Bad rows are dropped, never repaired. */
export function normalizeSuppliers(brandsJson, partsJson) {
  const brands = Object.create(null), parts = Object.create(null), bySlot = { Bit: [], Backreamer: [] };
  for (const b of Array.isArray(brandsJson?.brands) ? brandsJson.brands : []) {
    const id = str(b?.id, 60), name = str(b?.name, 80);
    if (id && name && /^[a-z0-9-]+$/.test(id)) brands[id] = { id, name, url: safeUrl(b.url) };
  }
  for (const r of Array.isArray(partsJson?.parts) ? partsJson.parts : []) {
    if (!r || !Number.isSafeInteger(r.id) || r.id <= 0 || parts[r.id]) continue;
    const brand = brands[r.brand], name = str(r.name);
    if (!brand || !name) continue;
    const c = r.conn && typeof r.conn === 'object' ? r.conn : {};
    const wired = c.wired === true, cl = wired && CODE.test(c.cl || '') ? c.cl : null, cr = wired && CODE.test(c.cr || '') ? c.cr : null;
    const slot = wired && (cl || cr) ? r.configurator?.slot : null;
    const specs = r.specs && typeof r.specs === 'object' && !Array.isArray(r.specs) ? r.specs : {};
    const url = safeUrl(r.url);
    const part = {
      id: r.id, name, pn: str(r.pn, 60), brand: brand.name, brandId: brand.id, supplier: true,
      type: TYPE_OF[slot] || 'Accessory', category: str(r.category, 30) || 'other', url,
      cl, cr, short: `${brand.name} · ${CAT_LABEL[r.category] || 'Tool'}`,
      diameterIn: num(r.diameterIn), lengthIn: num(r.lengthIn), weightLb: num(r.weightLb),
      docs: url ? [{ name: `${brand.name} product page`, url }] : [],
    };
    part.specs = sheetSpecs({ ...part, conn: { raw: str(c.raw, 200) }, specs }, brand.name);
    parts[part.id] = part;
    if (slot && SUPPLIER_SLOTS[slot]) bySlot[slot].push(part.id);
  }
  return { brands, parts, bySlot };
}

/** Roadmap copy with supplier parts added to the Bit and Backreamer slots. The input is not changed. */
export function augmentRoadmap(rm, suppliers) {
  if (!rm || !suppliers || !Object.keys(suppliers.parts).length) return rm;
  const parts = { ...rm.parts };
  for (const id of [...suppliers.bySlot.Bit, ...suppliers.bySlot.Backreamer]) if (!parts[id]) parts[id] = suppliers.parts[id];
  const sections = rm.sections.map((s) => {
    const slot = Object.keys(SUPPLIER_SLOTS).find((k) => SUPPLIER_SLOTS[k].mode === s.mode && SUPPLIER_SLOTS[k].name === s.name);
    if (!slot || !suppliers.bySlot[slot].length) return s;
    const have = new Set(s.opts.map((o) => o.id));
    return { ...s, opts: [...s.opts, ...suppliers.bySlot[slot].filter((id) => !have.has(id)).map((id) => ({ id }))] };
  });
  return { ...rm, parts, sections };
}
