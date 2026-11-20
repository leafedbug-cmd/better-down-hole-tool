import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FREE_MACHINE_LIMIT } from './billing.mjs';
import {
  canAddSignupMachine, equipmentCopy, signupMachineLimitError, signupMachinePayload,
} from './equipment.mjs';
import { friendlyAuthError } from './signup-errors.mjs';

const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const equipment = readFileSync(new URL('./equipment.mjs', import.meta.url), 'utf8');
const jt = (id) => ({ id, brand: 'Ditch Witch', model: 'JT10' });

test('signup and garage call machines equipment and do not use public sign-up', () => {
  assert.match(app, /functions\.invoke\('bdht-signup'/);
  assert.doesNotMatch(app, /auth\.signUp\(/);
  assert.match(app, /\+ Add another machine/);
  assert.match(equipment, /Your equipment/);
  assert.match(app, /Equipment · /);
  assert.match(app, /\+ Add machine/);
  assert.doesNotMatch(app, /Add another operator|Your operators|Add operator|Add an operator/);
  assert.doesNotMatch(app, /tel:|1-800|arkansas\.com|dealership/i);
});

test('the signup form can add machines up to the free cap', () => {
  assert.equal(canAddSignupMachine('new', 0), true);
  assert.equal(canAddSignupMachine('new', FREE_MACHINE_LIMIT - 1), true);
  assert.equal(canAddSignupMachine('new', FREE_MACHINE_LIMIT), false);
  assert.equal(canAddSignupMachine('join', FREE_MACHINE_LIMIT), true);
  assert.match(equipmentCopy('new').detail, /3 machines/);
  assert.match(equipmentCopy('new').detail, /\$2\.99\/month/);
  assert.match(equipmentCopy('join').title, /Equipment/);
  assert.match(signupMachineLimitError('new'), /3 machines/);
  const one = signupMachinePayload([{ id: '17', nick: ' lil guy ' }], jt, false);
  assert.deepEqual(one.machines, [{ machine_type_id: 17, brand: 'Ditch Witch', model: 'JT10', nickname: 'lil guy' }]);
  const two = signupMachinePayload([{ id: 17, nick: 'a' }, { id: '', nick: '' }, { id: 18, nick: 'b' }], jt, false);
  assert.equal(two.machines.length, 2);
  assert.match(signupMachinePayload([{ id: '', nick: 'no drill' }], jt, false).error, /drill/i);
  assert.match(signupMachinePayload([{ id: '', nick: '' }], jt, false).error, /at least one drill/i);
  assert.deepEqual(signupMachinePayload([], jt, true).machines, []);
});

test('signup failures stay friendly, including disabled public sign-ups', () => {
  assert.equal(
    friendlyAuthError('Signups not allowed for this instance'),
    'New accounts can’t be created right now. Wait a few minutes and try again.',
  );
  assert.match(friendlyAuthError({ message: 'User already registered' }), /Sign in instead/);
  assert.match(friendlyAuthError('Invite code not found'), /invite code/i);
  assert.match(friendlyAuthError('Too many signup attempts. Wait a little while and try again.'), /Wait a little while/);
  assert.match(friendlyAuthError('Edge Function returned a non-2xx status code'), /unavailable right now/);
  assert.equal(friendlyAuthError('Enter your company name.'), 'Enter your company name.');
  const again = friendlyAuthError(friendlyAuthError('Signups not allowed for this instance'));
  assert.doesNotMatch(again, /not allowed for this instance/i);
});
