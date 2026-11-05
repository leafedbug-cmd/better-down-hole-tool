import test from 'node:test';
import assert from 'node:assert/strict';
import { FREE_MACHINE_LIMIT, canAddMachine, entitledFor, keepStoredSubscription } from './billing.mjs';

const PRICE = 'price_1UYXlp5HCaoEY4setSBdQtHh';

test('free companies stop at 3 operators', () => {
  assert.equal(canAddMachine(2, false), true);
  assert.equal(canAddMachine(FREE_MACHINE_LIMIT, false), false);
  assert.equal(canAddMachine(FREE_MACHINE_LIMIT, null), false);
});

test('entitled companies are unlimited', () => {
  assert.equal(canAddMachine(40, true), true);
});

test('only active or trialing on the configured price is entitled', () => {
  assert.equal(entitledFor('active', PRICE, PRICE), true);
  assert.equal(entitledFor('trialing', PRICE, PRICE), true);
  assert.equal(entitledFor('past_due', PRICE, PRICE), false);
  assert.equal(entitledFor('canceled', PRICE, PRICE), false);
  assert.equal(entitledFor('unpaid', PRICE, PRICE), false);
  assert.equal(entitledFor('active', 'price_other', PRICE), false);
  assert.equal(entitledFor('active', PRICE, ''), false);
});

test('a late cancel for an older subscription does not clear the current one', () => {
  assert.equal(keepStoredSubscription('sub_new', true, 'sub_old', false), true);
  assert.equal(keepStoredSubscription('sub_old', false, 'sub_new', true), false);
  assert.equal(keepStoredSubscription('sub_same', true, 'sub_same', false), false);
});
