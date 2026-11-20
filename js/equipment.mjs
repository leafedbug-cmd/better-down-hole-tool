import { FREE_MACHINE_LIMIT } from './billing.mjs';

/** Join can list more than the free cap; the server keeps a free company at 3. */
export const SIGNUP_MACHINE_CAP = 25;

const BRANDS = new Set(['Ditch Witch', 'Vermeer']);

export function equipmentCopy(mode) {
  if (mode === 'join') {
    return {
      title: 'Equipment to add',
      detail: 'Optional. A free company stops at 3 machines. A paid company can add more after you join.',
    };
  }
  return {
    title: 'Your equipment',
    detail: `Free plan: up to ${FREE_MACHINE_LIMIT} machines. Unlimited is $2.99/month.`,
  };
}

export function signupMachineCap(mode) {
  return mode === 'new' ? FREE_MACHINE_LIMIT : SIGNUP_MACHINE_CAP;
}

export function canAddSignupMachine(mode, count) {
  return count < signupMachineCap(mode);
}

export function signupMachineLimitError(mode) {
  if (mode === 'new') {
    return `A free company can add ${FREE_MACHINE_LIMIT} machines at signup. Upgrade in My rigs for unlimited.`;
  }
  return `Add up to ${SIGNUP_MACHINE_CAP} machines in one signup.`;
}

/**
 * Blank rows are skipped. A unit name without a drill is an error.
 * lookup(id) returns the catalog machine, or null.
 */
export function signupMachinePayload(rows, lookup, allowEmpty) {
  const machines = [];
  for (const row of rows || []) {
    const id = Number(row?.id);
    const nick = String(row?.nick || '').trim();
    if (!id && !nick) continue;
    if (!Number.isInteger(id) || id <= 0) return { error: 'Pick a drill for each machine, or clear the unit name.' };
    const found = lookup(id);
    if (!found?.model || !BRANDS.has(found.brand)) return { error: 'Pick a drill from the list.' };
    machines.push({
      machine_type_id: id,
      brand: found.brand,
      model: found.model,
      nickname: nick,
    });
  }
  if (!allowEmpty && !machines.length) return { error: 'Pick at least one drill.' };
  if (machines.length > signupMachineCap(allowEmpty ? 'join' : 'new')) {
    return { error: signupMachineLimitError(allowEmpty ? 'join' : 'new') };
  }
  return { machines };
}
