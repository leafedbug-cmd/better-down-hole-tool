import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

function setup() {
  const state = {
    users: [], deleted: [], rpcs: [], limit: 'ok', limitError: null,
    createError: null, provisionError: null, provisionData: { capped: false },
  };
  const admin = {
    auth: { admin: {
      async createUser(input) {
        state.users.push(input);
        if (state.createError) return { data: { user: null }, error: state.createError };
        return { data: { user: { id: 'user-created' } }, error: null };
      },
      async deleteUser(id) {
        state.deleted.push(id);
        return { data: {}, error: state.deleteError || null };
      },
    } },
    async rpc(name, args) {
      state.rpcs.push({ name, args });
      if (name === 'bdht_take_signup_attempt') {
        if (state.limitError) return { data: null, error: state.limitError };
        return { data: state.limit, error: null };
      }
      if (state.provisionError) return { data: null, error: state.provisionError };
      return { data: state.provisionData, error: null };
    },
  };
  const handlers = [];
  const ctx = vm.createContext({
    console: { error() {} }, crypto: webcrypto, TextEncoder, URL, Response, Error,
    Deno: { serve: (handler) => handlers.push(handler) },
    adminClient: () => admin,
  });
  for (const path of ['../functions/_shared/signup.ts', '../functions/_shared/http.ts', '../functions/bdht-signup/index.ts']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
      .replace(/^import[\s\S]*?from ['"][^;]+;\r?\n/gm, '')
      .replace(/^export /gm, '');
    vm.runInContext(stripTypeScriptTypes(source), ctx);
  }
  const call = (body, headers = {}) => handlers[0](new Request('https://edge.invalid/bdht-signup', {
    method: 'POST',
    headers: { Origin: 'https://leafedbug-cmd.github.io', 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.8', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));
  return { state, call, handlers };
}

const body = {
  mode: 'new',
  company: 'Ditch Witch of Arkansas',
  employee: 'Austin Truett',
  email: 'Crew@Example.com',
  password: 'correct horse',
  user_id: 'attacker',
  app_metadata: { role: 'admin' },
  machines: [{ machine_type_id: 17, brand: 'Ditch Witch', model: 'JT10', nickname: 'lil guy' }],
};

test('signup preflight is empty and only POST is accepted', async () => {
  const { handlers } = setup();
  const preflight = await handlers[0](new Request('https://edge.invalid', {
    method: 'OPTIONS', headers: { Origin: 'https://leafedbug-cmd.github.io' },
  }));
  assert.equal(preflight.status, 204);
  assert.equal(await preflight.text(), '');
  const get = await handlers[0](new Request('https://edge.invalid', { method: 'GET' }));
  assert.equal(get.status, 405);
});

test('a new company is created server-side without a public signup or portal role', async () => {
  const { call, state } = setup();
  const response = await call(body);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, capped: false });
  assert.equal(state.users.length, 1);
  assert.equal(state.users[0].email, 'crew@example.com');
  assert.equal(state.users[0].email_confirm, true);
  assert.equal(state.users[0].password, 'correct horse');
  assert.equal(state.users[0].app_metadata, undefined);
  assert.equal(JSON.stringify(state.users[0].user_metadata), JSON.stringify({ employee_name: 'Austin Truett', source: 'bdht' }));
  assert.equal(state.deleted.length, 0);
  const provision = state.rpcs.find((call) => call.name === 'bdht_provision_signup');
  assert.equal(provision.args.p_user, 'user-created');
  assert.equal(provision.args.p_mode, 'new');
  assert.equal(provision.args.p_email, 'crew@example.com');
  assert.equal(provision.args.password, undefined);
  assert.equal(JSON.stringify(provision.args.p_machines), JSON.stringify(body.machines));
  const limit = state.rpcs[0];
  assert.equal(limit.name, 'bdht_take_signup_attempt');
  assert.match(limit.args.p_ip_hash, /^[0-9a-f]{64}$/);
  assert.match(limit.args.p_email_hash, /^[0-9a-f]{64}$/);
  assert.notEqual(limit.args.p_ip_hash, limit.args.p_email_hash);
});

test('validation, rate limits, duplicate emails, and failed setup do not leave a half-created user', async () => {
  const invalid = setup();
  const missing = await invalid.call({ ...body, machines: [] });
  assert.equal(missing.status, 400);
  assert.match((await missing.json()).error, /at least one drill/i);
  assert.equal(invalid.state.users.length, 0);

  const limited = setup();
  limited.state.limit = 'ip';
  const blocked = await limited.call(body);
  assert.equal(blocked.status, 429);
  assert.match((await blocked.json()).error, /Too many signup attempts/);
  assert.equal(limited.state.users.length, 0);

  const duplicate = setup();
  duplicate.state.createError = { message: 'A user with this email address has already been registered', code: 'email_exists' };
  const exists = await duplicate.call(body);
  assert.equal(exists.status, 409);
  assert.match((await exists.json()).error, /Sign in instead/);
  assert.equal(duplicate.state.deleted.length, 0);

  const failed = setup();
  failed.state.provisionError = new Error('Invite code not found');
  const join = await failed.call({ ...body, mode: 'join', code: 'ABCD1234', machines: [] });
  assert.equal(join.status, 400);
  const joinBody = await join.json();
  assert.match(joinBody.error, /invite code/i);
  assert.equal(JSON.stringify(joinBody).includes('correct horse'), false);
  assert.deepEqual(failed.state.deleted, ['user-created']);

  const disabled = setup();
  disabled.state.createError = { message: 'Signups not allowed for this instance', code: 'signup_disabled' };
  const raw = await disabled.call(body);
  assert.equal(raw.status, 400);
  assert.doesNotMatch((await raw.json()).error, /not allowed for this instance/i);
});

test('four machines on a new company never reach user creation', async () => {
  const { call, state } = setup();
  const machines = [1, 2, 3, 4].map((id) => ({ machine_type_id: id, brand: 'Vermeer', model: 'D24', nickname: '' }));
  const response = await call({ ...body, machines });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /3 machines/);
  assert.equal(state.users.length, 0);
  assert.equal(state.rpcs.length, 0);
});
