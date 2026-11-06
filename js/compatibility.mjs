import { quantity } from './config.mjs';

function swapGender(c) {
  if (c.includes('M') && !c.includes('MM')) return c.replace('M', 'F');
  if (c.includes('F')) return c.replace('F', 'M');
  return c;
}
export function compat(L, R) {
  if (!L || !R) return false;
  if (L.type === 'Collar' && R.type === 'Drill_Pipe') return (R.collars || []).includes(L.id);
  if (L.rc != null && R.type === 'Collar') return L.rc === R.id;
  if (R.lc != null && L.type === 'Collar') return R.lc === L.id;
  if (!R.cl) return false; // empty connections never "match" (stricter than the original, avoids false positives)
  return [L.cr, L.cr2].filter(Boolean).map(swapGender).includes(R.cl);
}
function linkOK(L, R, P) {
  if (compat(L.part, R)) return true;
  if (L.accChoice > 0) return compat(P[L.accChoice], R);
  if (L.accChoice === 0) return false;
  return L.accs.some((a) => compat(P[a], R));
}
/* Walk the string from the rig outwards. Returns one row per section with status:
   done (user picked) | auto (only one fits) | pending (needs a pick) | skip (optional slot) | blocked (no end tool fits) | locked (waiting on an earlier pick) */
export function compute(rm, cfg) {
  const P = rm.parts, rows = [], secs = rm.sections.filter((x) => x.mode === cfg.mode), n = secs.length;
  const item = (o) => ({ part: P[o.id], accs: o.acc || [], accChoice: undefined });
  const fitsAfter = (F, o) => !F || F.some((L) => linkOK(L, P[o.id], P));
  // collars are sleeves, not threaded joints: the part before a collar still mates with the part after it
  const after = (items, F) => (items.every((x) => x.part.type === 'Collar') ? (F ? [...items, ...F] : null) : items);
  // lookahead: from frontier F at section i, can the string still reach the bit / backreamer?
  const memo = new Map();
  const canFinish = (i, F) => {
    if (i >= n) return true;
    const k = `${i}|${F ? F.map((L) => L.part.id + ':' + L.accChoice).join(',') : '-'}`;
    if (memo.has(k)) return memo.get(k);
    memo.set(k, false);
    const c = secs[i].opts.filter((o) => fitsAfter(F, o));
    const ok = c.length ? c.some((o) => canFinish(i + 1, after([item(o)], F))) : i < n - 1 && canFinish(i + 1, F);
    memo.set(k, ok); return ok;
  };
  let F = null, locked = false;
  secs.forEach((s, i) => {
    const row = { sec: s, status: '', cands: [], sel: [], acc: {}, hidden: 0 };
    rows.push(row);
    if (locked) { row.status = 'locked'; return; }
    const fits = s.opts.filter((o) => fitsAfter(F, o));
    if (!fits.length) { row.status = i === n - 1 ? 'blocked' : 'skip'; return; }
    const viable = fits.filter((o) => canFinish(i + 1, after([item(o)], F)));
    row.cands = viable.length ? viable : fits;
    row.hidden = fits.length - row.cands.length;
    const want = (cfg.sel[s.id] || []).filter((id) => row.cands.some((o) => o.id === id));
    if (want.length) { row.sel = want; row.status = 'done'; }
    else if (row.cands.length === 1) { row.sel = [row.cands[0].id]; row.status = 'auto'; }
    else { row.status = 'pending'; locked = true; }
    // auto-add an adapter/accessory on the upstream part when the chosen part only fits through it
    if (F) for (const L of F) {
      if (L.accChoice !== undefined || !L.accs.length) continue;
      const needs = row.sel.map((id) => P[id]).filter((R) => !compat(L.part, R));
      if (!needs.length) continue;
      const a = L.accs.find((a) => needs.some((R) => compat(P[a], R)));
      if (a) { L.accChoice = a; L.row.acc[L.part.id] = { id: a, auto: true }; }
    }
    if (row.sel.length) {
      const items = row.sel.map((id) => {
        const opt = s.opts.find((o) => o.id === id), accs = opt.acc || [];
        let ch = cfg.acc[`${s.id}.${id}`];
        if (ch !== undefined && ch !== 0 && !accs.includes(ch)) ch = undefined;
        if (ch > 0) row.acc[id] = { id: ch, auto: false };
        return { part: P[id], accs, accChoice: ch, row };
      });
      F = after(items, F);
    }
  });
  return rows;
}
export function lineItems(rm, cfg, rows) {
  const P = rm.parts, out = [];
  for (const r of rows) for (const id of r.sel) {
    out.push({ key: `${r.sec.id}.${id}`, sec: r.sec.name, part: P[id], auto: r.status === 'auto' });
    const a = r.acc[id];
    if (a) out.push({ key: `${r.sec.id}.${id}.a${a.id}`, sec: `${r.sec.name} add-on`, part: P[a.id], acc: true, auto: a.auto });
  }
  for (const l of out) l.qty = quantity(cfg.q?.[l.key]);
  return out;
}

export function isLoadoutReady(rows) {
  return rows.length > 0 && rows.every((r) => ['done', 'auto', 'skip'].includes(r.status))
    && rows[rows.length - 1].sel.length > 0;
}
