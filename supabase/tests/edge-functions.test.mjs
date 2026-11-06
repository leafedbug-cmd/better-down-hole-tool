import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

// Execute the real handlers with isolated Stripe/database boundaries; no live payments.
function setup() {
  const rows = new Map();
  const locks = new Set();
  const state = { event: null, subscription: null, invoice: null, sessions: [], creates: [], retrieveCount: 0, failSave: false, failBilling: false, beforeCreate: null };
  const table = (name) => { if (!rows.has(name)) rows.set(name, []); return rows.get(name); };
  const admin = {
    async rpc(name, args) {
      if (name === 'bdht_claim_billing_lock') {
        if (locks.has(args.p_key)) return { data: false };
        locks.add(args.p_key);
        table('bdht_billing_locks').push({ lock_key: args.p_key, token: args.p_token });
        return { data: true };
      }
      const events = table('bdht_stripe_events');
      const event = events.find((r) => r.id === args.p_id);
      if (event?.processed_at) return { data: 'processed' };
      if (event && !event.expired) return { data: 'busy' };
      if (event) events.splice(events.indexOf(event), 1);
      events.push({ id: args.p_id, claim_token: args.p_token });
      return { data: 'claimed' };
    },
    from(name) {
      let action = 'select', payload, filters = [];
      const execute = () => {
        const target = table(name);
        const matches = (r) => filters.every(([k, v]) => (r[k] ?? null) === v);
        if (action === 'upsert') {
          if (name === 'bdht_billing' && state.failBilling) return { error: new Error('billing write failed') };
          let row = target.find((r) => r.company_id === payload.company_id);
          if (row) Object.assign(row, payload); else { row = { ...payload }; target.push(row); }
          return { data: { ...row } };
        }
        if (action === 'update') {
          if (name === 'bdht_checkout_attempts' && state.failSave) return { error: new Error('session save failed') };
          for (const row of target.filter(matches)) Object.assign(row, payload);
        }
        if (action === 'delete') {
          for (const row of target.filter(matches)) {
            if (name === 'bdht_billing_locks') locks.delete(row.lock_key);
            target.splice(target.indexOf(row), 1);
          }
        }
        const row = target.find(matches);
        return { data: row ? { ...row } : null };
      };
      const query = {
        select() { return this; },
        eq(k, v) { filters.push([k, v]); return this; },
        is(k, v) { filters.push([k, v]); return this; },
        upsert(p) { action = 'upsert'; payload = p; return this; },
        update(p) { action = 'update'; payload = p; return this; },
        delete() { action = 'delete'; return this; },
        async maybeSingle() { return execute(); },
        async single() { return execute(); },
        then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); },
      };
      return query;
    },
  };
  table('bdht_billing').push({ company_id: 'company', stripe_customer_id: 'cus_1', entitled: false });
  table('bdht_companies').push({ id: 'company' });
  const stripe = {
    invoices: { async retrieve() { return structuredClone(state.invoice); } },
    customers: { async retrieve() { return { id: 'cus_1' }; } },
    subscriptions: {
      async *list() { if (state.subscription) yield structuredClone(state.subscription); },
      async retrieve() { state.retrieveCount++; return structuredClone(state.subscription); },
    },
    checkout: { sessions: {
      async *list() { yield* state.sessions.filter((s) => s.status === 'open'); },
      async retrieve(id) { return state.sessions.find((s) => s.id === id); },
      async create(params, options) {
        if (state.beforeCreate) await state.beforeCreate;
        state.creates.push(options.idempotencyKey);
        const id = `cs_${state.creates.length}`;
        const session = { ...params, id, status: 'open', url: `https://checkout.invalid/${id}` };
        state.sessions.push(session);
        return session;
      },
    } },
    webhooks: { async constructEventAsync() { return state.event; } },
  };
  const handlers = [];
  const ctx = vm.createContext({
    console: { error() {} }, crypto: webcrypto, Date, Error, Response,
    Deno: { serve: (handler) => handlers.push(handler), env: { get: (name) => name === 'STRIPE_PRICE_ID' ? 'price_expected' : 'test-secret' } },
    adminClient: () => admin, stripeClient: () => stripe, stripeCryptoProvider: {},
    requireOwner: async () => ({ companyId: 'company', companyName: 'Company', email: null }),
    idOf: (v) => typeof v === 'string' ? v : v?.id ?? null,
  });
  for (const path of ['_shared/http.ts', '_shared/entitlement.ts', '_shared/billing_lock.ts', 'bdht-create-checkout/index.ts', 'bdht-create-portal/index.ts', 'bdht-stripe-webhook/index.ts']) {
    const source = readFileSync(new URL(`../functions/${path}`, import.meta.url), 'utf8')
      .replace(/^import[\s\S]*?from ['"][^;]+;\r?\n/gm, '').replace(/^export /gm, '');
    vm.runInContext(stripTypeScriptTypes(source), ctx);
  }
  const req = (method = 'POST') => new Request('https://edge.invalid', { method, headers: { Origin: 'https://leafedbug-cmd.github.io', 'Stripe-Signature': 'test' } });
  return { state, table, locks, checkout: () => handlers[0](req()), webhook: () => handlers[2](req()), handlers, req };
}

function subscription(status = 'active') {
  return { id: 'sub_1', customer: 'cus_1', status, metadata: { company_id: 'company' }, items: { data: [{ price: 'price_expected' }] } };
}

test('both billing endpoints answer CORS preflights without constructing a body', async () => {
  const { handlers, req } = setup();
  for (const handler of handlers.slice(0, 2)) {
    const response = await handler(req('OPTIONS'));
    assert.equal(response.status, 204);
    assert.equal(await response.text(), '');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://leafedbug-cmd.github.io');
  }
});

test('repeated checkout requests reuse one session and a durable idempotency key', async () => {
  const { checkout, state } = setup();
  const first = await checkout(), second = await checkout();
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(await first.json(), await second.json());
  assert.equal(state.creates.length, 1);
  assert.match(state.creates[0], /^bdht_checkout_/);
});

test('checkout recovers a Stripe session after saving its ID fails', async () => {
  const { checkout, state } = setup();
  state.failSave = true;
  assert.equal((await checkout()).status, 500);
  state.failSave = false;
  assert.equal((await checkout()).status, 200);
  assert.equal(state.creates.length, 1);
});

test('concurrent checkout requests cannot create two sessions', async () => {
  const { checkout, state } = setup();
  let release;
  state.beforeCreate = new Promise((resolve) => { release = resolve; });
  const first = checkout();
  await new Promise(setImmediate);
  assert.equal((await checkout()).status, 503);
  release();
  assert.equal((await first).status, 200);
  assert.equal(state.creates.length, 1);
});

test('existing Stripe subscriptions block checkout before the webhook arrives', async () => {
  for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete']) {
    const { checkout, state } = setup();
    state.subscription = subscription(status);
    assert.equal((await checkout()).status, 409, status);
    assert.equal(state.creates.length, 0);
  }
});

test('expired checkout sessions can be replaced with a new attempt', async () => {
  const { checkout, state } = setup();
  assert.equal((await checkout()).status, 200);
  state.sessions[0].status = 'expired';
  assert.equal((await checkout()).status, 200);
  assert.equal(state.creates.length, 2);
  assert.notEqual(state.creates[0], state.creates[1]);
});

test('a late active event cannot restore a subscription that is currently canceled', async () => {
  const { webhook, state, table } = setup();
  state.subscription = subscription('canceled');
  state.event = { id: 'evt_cancel', type: 'customer.subscription.deleted', data: { object: subscription('canceled') } };
  assert.equal((await webhook()).status, 200);
  state.event = { id: 'evt_old_active', type: 'customer.subscription.updated', data: { object: subscription('active') } };
  assert.equal((await webhook()).status, 200);
  assert.equal(table('bdht_billing')[0].subscription_status, 'canceled');
  assert.equal(table('bdht_billing')[0].entitled, false);
  assert.equal(state.retrieveCount, 2);
  assert.equal((await webhook()).status, 200);
  assert.equal(state.retrieveCount, 2, 'completed duplicate must not execute again');
});

test('busy and crashed webhook claims remain retryable', async () => {
  const { webhook, state, table } = setup();
  state.subscription = subscription();
  state.event = { id: 'evt_busy', type: 'customer.subscription.updated', data: { object: subscription() } };
  table('bdht_stripe_events').push({ id: 'evt_busy', claim_token: 'crashed-worker' });
  assert.equal((await webhook()).status, 503);
  table('bdht_stripe_events')[0].expired = true;
  assert.equal((await webhook()).status, 200);
  assert.ok(table('bdht_stripe_events')[0].processed_at);
  assert.equal(table('bdht_billing')[0].entitled, true);
});

test('failed billing writes and company lock contention do not acknowledge events', async () => {
  const { webhook, state, table, locks } = setup();
  state.subscription = subscription();
  state.event = { id: 'evt_retry', type: 'customer.subscription.updated', data: { object: subscription() } };
  locks.add('company:company');
  assert.equal((await webhook()).status, 500);
  assert.equal(table('bdht_stripe_events').length, 0);
  locks.clear();
  state.failBilling = true;
  assert.equal((await webhook()).status, 500);
  assert.equal(table('bdht_stripe_events').length, 0);
  state.failBilling = false;
  assert.equal((await webhook()).status, 200);
  assert.ok(table('bdht_stripe_events')[0].processed_at);
});

test('a delayed invoice failure cannot replace a newer invoice or a paid status', async () => {
  const { webhook, state, table } = setup();
  state.subscription = { ...subscription(), latest_invoice: 'in_new' };
  Object.assign(table('bdht_billing')[0], { latest_invoice_id: 'in_new', latest_invoice_status: 'paid' });
  const invoice = (id, status) => ({
    id, status, customer: 'cus_1',
    parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_1' } },
  });
  state.event = { id: 'evt_old_invoice', type: 'invoice.payment_failed', data: { object: invoice('in_old', 'open') } };
  assert.equal((await webhook()).status, 200);
  assert.equal(table('bdht_billing')[0].latest_invoice_id, 'in_new');
  assert.equal(table('bdht_billing')[0].latest_invoice_status, 'paid');
  state.invoice = invoice('in_new', 'paid');
  state.event = { id: 'evt_late_failure', type: 'invoice.payment_failed', data: { object: invoice('in_new', 'open') } };
  assert.equal((await webhook()).status, 200);
  assert.equal(table('bdht_billing')[0].latest_invoice_status, 'paid');
  assert.equal(table('bdht_billing')[0].payment_failed_at, null);
});
