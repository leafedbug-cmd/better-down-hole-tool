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
  const entries = (v, max = 256) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.entries(v).slice(0, max)
    : [];
  // optional Radius alternates the user added to the list: { secId: [radiusPn] } (see radius.mjs isRadiusPn)
  const altPn = (v) => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(v);
  const alt = Object.fromEntries(entries(value.alt, 64).filter(([k, v]) => /^\d+$/.test(k) && Array.isArray(v))
    .map(([k, v]) => [k, [...new Set(v.slice(0, 20).filter(altPn))]]).filter(([, v]) => v.length));
  return {
    m, p, r, mode: value.mode ?? 'Bit',
    sel: Object.fromEntries(entries(value.sel, 64).filter(([k, v]) => /^\d+$/.test(k) && Array.isArray(v))
      .map(([k, v]) => [k, [...new Set(v.slice(0, 100).map(id).filter(Boolean))]])),
    acc: Object.fromEntries(entries(value.acc, 256).filter(([k, v]) => /^\d+\.\d+$/.test(k) && (v === 0 || id(v)))
      .map(([k, v]) => [k, Number(v)])),
    q: Object.fromEntries(entries(value.q, 256).filter(([k]) => /^\d+\.(?:\d+(?:\.a\d+)?|R[A-Za-z0-9][A-Za-z0-9._-]{0,39})$/.test(k))
      .map(([k, v]) => [k, quantity(v)])),
    ...(Object.keys(alt).length ? { alt } : {}),
  };
}
