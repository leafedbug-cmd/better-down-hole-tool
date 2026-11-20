import { PGlite } from 'npm:@electric-sql/pglite@0.3.14';
import { readFileSync } from 'node:fs';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const hex = (n: number) => n.toString(16).padStart(64, '0');

Deno.test('signup migration provisions companies, enforces the machine cap, and stays service-role only', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      alter role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key, email text);
      create table public.bdht_companies (
        id uuid primary key default gen_random_uuid(),
        name text not null,
        invite_code text unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
        created_by uuid not null references auth.users(id)
      );
      create table public.bdht_members (
        user_id uuid primary key references auth.users(id),
        company_id uuid not null references public.bdht_companies(id),
        role text not null,
        employee_name text not null,
        email text
      );
      create table public.bdht_machines (
        id uuid primary key default gen_random_uuid(),
        company_id uuid not null references public.bdht_companies(id),
        machine_type_id integer not null,
        brand text,
        model text not null,
        nickname text,
        created_by uuid references auth.users(id)
      );
      create table public.bdht_billing (
        company_id uuid primary key references public.bdht_companies(id),
        entitled boolean not null default false
      );
    `);
    await db.exec(readFileSync(new URL('../migrations/20261120151659_bdht_signup.sql', import.meta.url), 'utf8'));

    const owner = '00000000-0000-0000-0000-000000000001';
    const member = '00000000-0000-0000-0000-000000000002';
    const paidMember = '00000000-0000-0000-0000-000000000003';
    await db.query('insert into auth.users values ($1), ($2), ($3)', [owner, member, paidMember]);

    const machines = (nick: string) => JSON.stringify([
      { machine_type_id: 17, brand: 'Ditch Witch', model: 'JT10', nickname: nick },
      { machine_type_id: 17, brand: 'Ditch Witch', model: 'JT10', nickname: 'second' },
    ]);
    const created = await db.query<{ result: { capped: boolean } }>(
      `select bdht_provision_signup($1, 'new', 'Ozark Boring', '', 'Ada Owner', 'ada@example.com', $2::jsonb) as result`,
      [owner, machines('  lil guy  ')],
    );
    assert(created.rows[0].result.capped === false, 'two machines on a new company must fit the free plan');
    const company = (await db.query<{ id: string; invite_code: string; role: string; nickname: string }>(`
      select c.id, c.invite_code, m.role, mc.nickname
      from bdht_companies c
      join bdht_members m on m.company_id = c.id
      join bdht_machines mc on mc.company_id = c.id
      where m.user_id = $1 and mc.nickname = 'lil guy'
    `, [owner])).rows[0];
    assert(company.role === 'owner', 'the first person is the owner');
    assert(company.nickname === 'lil guy', 'unit names are trimmed');

    const joined = await db.query<{ result: { capped: boolean } }>(
      `select bdht_provision_signup($1, 'join', '', $2, 'Bea Member', 'bea@example.com', $3::jsonb) as result`,
      [member, company.invite_code, JSON.stringify([{ machine_type_id: 18, brand: 'Vermeer', model: 'D24', nickname: 'extra' }])],
    );
    assert(joined.rows[0].result.capped === false, 'the third machine still fits');
    const capped = await db.query<{ result: { capped: boolean } }>(
      `select bdht_provision_signup($1, 'join', '', $2, 'Cy Member', 'cy@example.com', $3::jsonb) as result`,
      [paidMember, company.invite_code, JSON.stringify([{ machine_type_id: 20, brand: 'Vermeer', model: 'D40', nickname: 'fourth' }])],
    );
    assert(capped.rows[0].result.capped === true, 'a free company skips the fourth machine and still adds the member');
    const counts = (await db.query<{ machines: number; members: number }>(`
      select (select count(*) from bdht_machines where company_id = $1) as machines,
             (select count(*) from bdht_members where company_id = $1) as members
    `, [company.id])).rows[0];
    assert(Number(counts.machines) === 3, 'free companies keep 3 machines');
    assert(Number(counts.members) === 3, 'the capped signup still joins the company');
    const role = (await db.query<{ role: string }>('select role from bdht_members where user_id = $1', [paidMember])).rows[0].role;
    assert(role === 'member', 'a joined person is a member');

    await db.query('insert into bdht_billing (company_id, entitled) values ($1, true)', [company.id]);
    const fourthUser = '00000000-0000-0000-0000-000000000004';
    await db.query('insert into auth.users values ($1)', [fourthUser]);
    const paid = await db.query<{ result: { capped: boolean } }>(
      `select bdht_provision_signup($1, 'join', '', $2, 'Dee Paid', 'dee@example.com', $3::jsonb) as result`,
      [fourthUser, company.invite_code, JSON.stringify([{ machine_type_id: 21, brand: 'Ditch Witch', model: 'JT25', nickname: 'paid' }])],
    );
    assert(paid.rows[0].result.capped === false, 'an unlimited company can add another machine');
    const paidCount = Number((await db.query<{ n: number }>('select count(*) as n from bdht_machines where company_id = $1', [company.id])).rows[0].n);
    assert(paidCount === 4, 'the paid machine was stored');

    async function rejects(sql: string, params: unknown[], message: string) {
      let rejected = false;
      try { await db.query(sql, params); } catch (error) { rejected = String(error).includes(message); }
      assert(rejected, `Expected rejection: ${message}`);
    }
    const stranger = '00000000-0000-0000-0000-000000000005';
    await db.query('insert into auth.users values ($1)', [stranger]);
    const four = JSON.stringify([1, 2, 3, 4].map((id) => ({ machine_type_id: id, brand: 'Vermeer', model: 'D24', nickname: '' })));
    await rejects(
      `select bdht_provision_signup($1, 'new', 'Too Many', '', 'Eve', 'eve@example.com', $2::jsonb)`,
      [stranger, four],
      '3 machines',
    );
    const companies = Number((await db.query<{ n: number }>("select count(*) as n from bdht_companies where name = 'Too Many'")).rows[0].n);
    assert(companies === 0, 'a rejected signup does not leave a company');
    await db.query('update bdht_billing set entitled = false where company_id = $1', [company.id]);
    await rejects(
      `insert into bdht_machines (company_id, machine_type_id, brand, model) values ($1, 1, 'Ditch Witch', 'JT5')`,
      [company.id],
      'Free plan includes 3 machines',
    );
    await db.query('update bdht_billing set entitled = true where company_id = $1', [company.id]);

    const ip = hex(1);
    for (let i = 0; i < 20; i++) {
      const taken = (await db.query<{ state: string }>('select bdht_take_signup_attempt($1, $2) as state', [ip, hex(100 + i)])).rows[0].state;
      assert(taken === 'ok', `attempt ${i + 1} must be allowed`);
    }
    assert((await db.query<{ state: string }>('select bdht_take_signup_attempt($1, $2) as state', [ip, hex(200)])).rows[0].state === 'ip', 'the 21st IP attempt is blocked');
    const email = hex(2);
    for (let i = 0; i < 8; i++) {
      assert((await db.query<{ state: string }>('select bdht_take_signup_attempt($1, $2) as state', [hex(300 + i), email])).rows[0].state === 'ok', 'email attempts under the cap must pass');
    }
    assert((await db.query<{ state: string }>('select bdht_take_signup_attempt($1, $2) as state', [hex(400), email])).rows[0].state === 'email', 'the 9th email attempt is blocked');
    assert((await db.query<{ state: string }>('select bdht_take_signup_attempt($1, $2) as state', ['not-a-hash', email])).rows[0].state === 'ip', 'raw addresses are rejected');

    await db.exec('set role authenticated');
    await rejects('select * from bdht_signup_attempts', [], 'permission denied');
    await rejects('select bdht_take_signup_attempt($1, $2)', [ip, email], 'permission denied');
    await rejects(
      `select bdht_provision_signup($1, 'new', 'Nope', '', 'Nope', 'nope@example.com', '[]'::jsonb)`,
      [stranger],
      'permission denied',
    );
    await db.exec('reset role');

    await db.exec('grant select, insert on public.bdht_companies, public.bdht_members, public.bdht_machines to service_role');
    const serviceUser = '00000000-0000-0000-0000-000000000006';
    await db.query('insert into auth.users values ($1)', [serviceUser]);
    await db.exec('set role service_role');
    const asService = await db.query<{ result: { capped: boolean } }>(
      `select bdht_provision_signup($1, 'new', 'Service Co', '', 'Service Owner', 'svc@example.com', $2::jsonb) as result`,
      [serviceUser, JSON.stringify([{ machine_type_id: 6, brand: 'Ditch Witch', model: 'JT5', nickname: '' }])],
    );
    assert(asService.rows[0].result.capped === false, 'service_role can provision a company');
    const serviceAttempt = (await db.query<{ state: string }>(
      'select bdht_take_signup_attempt($1, $2) as state', [hex(9), hex(9)],
    )).rows[0].state;
    assert(serviceAttempt === 'ok', 'service_role can record a signup attempt');
    await db.exec('reset role');
  } finally {
    await db.close();
  }
});
