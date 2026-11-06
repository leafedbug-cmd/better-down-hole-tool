-- Apply before deploying the updated billing functions.
create table public.bdht_billing_locks (
  lock_key text primary key,
  token uuid not null,
  lease_until timestamptz not null
);
alter table public.bdht_billing_locks enable row level security;
revoke all on public.bdht_billing_locks from public, anon, authenticated;
grant all on public.bdht_billing_locks to service_role;

create function public.bdht_claim_billing_lock(p_key text, p_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bdht_billing_locks as locks (lock_key, token, lease_until)
  values (p_key, p_token, clock_timestamp() + interval '15 minutes')
  on conflict (lock_key) do update
    set token = excluded.token, lease_until = excluded.lease_until
    where locks.lease_until < clock_timestamp();
  return found;
end;
$$;

create table public.bdht_checkout_attempts (
  company_id uuid primary key references public.bdht_companies(id) on delete cascade,
  attempt_id uuid not null default gen_random_uuid(),
  stripe_session_id text,
  created_at timestamptz not null default now()
);
alter table public.bdht_checkout_attempts enable row level security;
revoke all on public.bdht_checkout_attempts from public, anon, authenticated;
grant all on public.bdht_checkout_attempts to service_role;

-- Existing event rows were treated as completed by the original handler.
alter table public.bdht_stripe_events
  add column processed_at timestamptz,
  add column claim_token uuid,
  add column lease_until timestamptz;
update public.bdht_stripe_events set processed_at = received_at;

create function public.bdht_claim_stripe_event(p_id text, p_type text, p_token uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bdht_stripe_events as events (id, event_type, claim_token, lease_until)
  values (p_id, p_type, p_token, clock_timestamp() + interval '15 minutes')
  on conflict (id) do update
    set claim_token = excluded.claim_token, lease_until = excluded.lease_until
    where events.processed_at is null and events.lease_until < clock_timestamp();
  if found then return 'claimed'; end if;
  if exists (select 1 from public.bdht_stripe_events where id = p_id and processed_at is not null)
    then return 'processed'; end if;
  return 'busy';
end;
$$;

revoke all on function public.bdht_claim_billing_lock(text, uuid) from public, anon, authenticated;
revoke all on function public.bdht_claim_stripe_event(text, text, uuid) from public, anon, authenticated;
grant execute on function public.bdht_claim_billing_lock(text, uuid) to service_role;
grant execute on function public.bdht_claim_stripe_event(text, text, uuid) to service_role;

create or replace function bdht_private.enforce_machine_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  paid boolean;
  n integer;
begin
  if tg_op = 'UPDATE' then
    if new.company_id = old.company_id then return new; end if;
  end if;

  -- Lock a row that exists even when a company has no billing row yet.
  perform 1 from public.bdht_companies where id = new.company_id for update;
  select entitled into paid from public.bdht_billing where company_id = new.company_id;
  if paid is true then return new; end if;
  select count(*)::integer into n from public.bdht_machines where company_id = new.company_id;
  if n >= 3 then
    raise exception 'Free plan includes 3 operators. Upgrade for unlimited.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists bdht_machines_free_limit on public.bdht_machines;
create trigger bdht_machines_free_limit
  before insert or update of company_id on public.bdht_machines
  for each row execute function bdht_private.enforce_machine_limit();
