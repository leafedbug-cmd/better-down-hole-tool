export function entitledFor(
  status: string | null | undefined,
  priceId: string | null | undefined,
  expectedPrice: string,
): boolean {
  if (!expectedPrice || !priceId || priceId !== expectedPrice) return false;
  return status === 'active' || status === 'trialing';
}

/** Ignore a late event for an older subscription when a newer one is still entitled. */
export function keepStoredSubscription(
  storedId: string | null | undefined,
  storedEntitled: boolean,
  incomingId: string,
  incomingEntitled: boolean,
): boolean {
  if (!storedId || storedId === incomingId) return false;
  return storedEntitled && !incomingEntitled;
}
