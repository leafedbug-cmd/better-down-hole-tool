/** Quantities are untrusted in shared links and saved configurations. */
export function quantity(value) {
  if (value === undefined || value === null) return 1;
  if (typeof value !== 'number' && typeof value !== 'string') return 1;
  if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return 1;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(9999, Math.max(0, Math.trunc(n))) : 1;
}

export function normalizeConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = (v) => (typeof v === 'number' || typeof v === 'string') && /^\d+$/.test(String(v))
    && Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null;
  const m = id(value.m), p = id(value.p), r = id(value.r);
  if (!m || !p || !r || !['Bit', 'Backreamer'].includes(value.mode ?? 'Bit')) return null;
  const entries = (v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(v) : [];
  return {
    m, p, r, mode: value.mode ?? 'Bit',
    sel: Object.fromEntries(entries(value.sel).filter(([k, v]) => /^\d+$/.test(k) && Array.isArray(v))
      .map(([k, v]) => [k, [...new Set(v.map(id).filter(Boolean))]])),
    acc: Object.fromEntries(entries(value.acc).filter(([k, v]) => /^\d+\.\d+$/.test(k) && (v === 0 || id(v)))
      .map(([k, v]) => [k, Number(v)])),
    q: Object.fromEntries(entries(value.q).filter(([k]) => /^\d+\.\d+(?:\.a\d+)?$/.test(k))
      .map(([k, v]) => [k, quantity(v)])),
  };
}
