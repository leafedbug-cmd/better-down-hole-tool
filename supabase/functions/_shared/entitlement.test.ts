import { entitledFor, keepStoredSubscription } from './entitlement.ts';

const PRICE = 'price_1UYXlp5HCaoEY4setSBdQtHh';

function assert(cond: boolean, message: string) {
  if (!cond) throw new Error(message);
}

assert(entitledFor('active', PRICE, PRICE), 'active matches');
assert(entitledFor('trialing', PRICE, PRICE), 'trialing matches');
assert(!entitledFor('past_due', PRICE, PRICE), 'past_due is not entitled');
assert(!entitledFor('canceled', PRICE, PRICE), 'canceled is not entitled');
assert(!entitledFor('active', 'price_other', PRICE), 'other price is not entitled');
assert(
  keepStoredSubscription('sub_new', true, 'sub_old', false),
  'a late cancel for an older subscription must not clear the current one',
);
assert(
  !keepStoredSubscription('sub_old', false, 'sub_new', true),
  'a new entitled subscription replaces a canceled one',
);
assert(!keepStoredSubscription('sub_same', true, 'sub_same', false), 'the same subscription always updates');

console.log('entitlement tests passed');
