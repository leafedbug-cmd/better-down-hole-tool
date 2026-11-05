/** Free-plan operator cap. Paid access is bdht_billing.entitled, set by the webhook. */
export const FREE_MACHINE_LIMIT = 3;

export const UNLIMITED_STATUSES = ['active', 'trialing'];

export function isUnlimitedStatus(status) {
  return UNLIMITED_STATUSES.includes(status);
}

/** Mirrors the webhook: entitled only for the configured price while active or trialing. */
export function entitledFor(status, priceId, expectedPrice) {
  if (!expectedPrice || !priceId || priceId !== expectedPrice) return false;
  return isUnlimitedStatus(status);
}

export function canAddMachine(count, entitled) {
  return entitled === true || count < FREE_MACHINE_LIMIT;
}

/** Ignore a late event for an older subscription while a newer one is still entitled. */
export function keepStoredSubscription(storedId, storedEntitled, incomingId, incomingEntitled) {
  if (!storedId || storedId === incomingId) return false;
  return storedEntitled === true && incomingEntitled !== true;
}
