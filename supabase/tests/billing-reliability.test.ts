import { PGlite } from 'npm:@electric-sql/pglite@0.3.14';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test('billing migrations enforce limits, permissions, locks, and recoverable event claims', async () => {
  const db = new PGlite();
  try {
    // Minimal pre-existing account schema. Production RLS/RPCs are not in this repo.
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema bdht_private;
      create table public.bdht_companies (id uuid primary key);
      create table public.bdht_machines (id integer generated always as identity primary key, company_id uuid references public.bdht_companies(id));
      create function bdht_private.my_company() returns uuid language sql as 'select null::uuid';
    `);
    for (const file of ['20261105211145_bdht_billing.sql', '20261106000000_bdht_billing_reliability.sql']) {
      await db.exec(await Deno.readTextFile(new URL(`../migrations/${file}`, import.meta.url)));
    }
    const company = '00000000-0000-0000-0000-000000000001';
    const other = '00000000-0000-0000-0000-000000000002';
    const first = '00000000-0000-0000-0000-000000000003';
    const second = '00000000-0000-0000-0000-000000000004';
    await db.query('insert into bdht_companies values ($1), ($2)', [company, other]);
    for (let i = 0; i < 3; i++) await db.query('insert into bdht_machines(company_id) values ($1)', [company]);
    async function rejects(sql: string, params: unknown[], message: string) {
      let rejected = false;
      try { await db.query(sql, params); } catch (e) { rejected = String(e).includes(message); }
      assert(rejected, `Expected rejection: ${message}`);
    }
    await rejects('insert into bdht_machines(company_id) values ($1)', [company], 'Free plan includes 3');
    await db.query('insert into bdht_machines(company_id) values ($1)', [other]);
    await rejects('update bdht_machines set company_id = $1 where company_id = $2', [company, other], 'Free plan includes 3');
    await db.query('update bdht_machines set company_id = company_id where company_id = $1', [company]);
    await db.query('insert into bdht_billing(company_id, entitled) values ($1, true)', [company]);
    await db.query('insert into bdht_machines(company_id) values ($1)', [company]);

    const claimLock = async (token: string) => (await db.query<{ claimed: boolean }>(
      'select bdht_claim_billing_lock($1, $2) as claimed', [`company:${company}`, token],
    )).rows[0].claimed;
    assert(await claimLock(first), 'first company lock must succeed');
    assert(!await claimLock(second), 'second worker must not acquire an active company lock');
    await db.query("update bdht_billing_locks set lease_until = now() - interval '1 minute'");
    assert(await claimLock(second), 'expired company lock must be reclaimable');
    await db.query('delete from bdht_billing_locks where token = $1', [first]);
    assert(!await claimLock(first), 'old owner must not release the replacement lock');

    const claimEvent = async (token: string) => (await db.query<{ state: string }>(
      "select bdht_claim_stripe_event('evt_test', 'customer.subscription.updated', $1) as state", [token],
    )).rows[0].state;
    assert(await claimEvent(first) === 'claimed', 'first event claim must succeed');
    assert(await claimEvent(second) === 'busy', 'in-progress events must not be acknowledged as complete');
    await db.query("update bdht_stripe_events set lease_until = now() - interval '1 minute'");
    assert(await claimEvent(second) === 'claimed', 'a crashed worker must not prevent retries');
    await db.query('delete from bdht_stripe_events where claim_token = $1', [first]);
    await db.query('update bdht_stripe_events set processed_at = now(), lease_until = null where claim_token = $1', [second]);
    assert(await claimEvent(first) === 'processed', 'completed events must remain idempotent');

    await db.exec('set role authenticated');
    await rejects('select bdht_claim_billing_lock($1, $2)', ['company:any', first], 'permission denied');
    await rejects('select * from bdht_checkout_attempts', [], 'permission denied');
    await rejects('select * from bdht_stripe_events', [], 'permission denied');
    await db.exec('reset role');
  } finally {
    await db.close();
  }
});
