-- Billing state for The Better Down Hole Tool.
-- Free companies can store 3 operators (bdht_machines). A company is unlimited
-- only when bdht_billing.entitled is true. Edge Functions set that flag for
-- Stripe statuses active and trialing on the configured price. Clients can
-- read their own row and cannot write billing columns.

create table if not exists public.bdht_billing (
  company_id uuid primary key references public.bdht_companies (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  subscription_status text not null default 'none',
  price_id text,
  entitled boolean not null default false,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  latest_invoice_id text,
  latest_invoice_status text,
  payment_failed_at timestamptz,
  open_dispute_id text,
  dispute_opened_at timestamptz,
  last_refunded_charge_id text,
  last_refunded_at timestamptz,
  last_refund_amount integer,
  fraud_warning_id text,
  fraud_warning_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint bdht_billing_status_chk check (
    subscription_status = any (array[
      'none', 'incomplete', 'incomplete_expired', 'trialing', 'active',
      'past_due', 'canceled', 'unpaid', 'paused'
    ])
  ),
  constraint bdht_billing_refund_amount_chk check (
    last_refund_amount is null or last_refund_amount >= 0
  )
);

comment on table public.bdht_billing is
  'Stripe billing for one company. entitled unlocks unlimited operators and is written only by the Stripe webhook.';

comment on column public.bdht_billing.entitled is
  'True only when the subscription is active or trialing on the configured price.';

create table if not exists public.bdht_stripe_events (
  id text primary key,
  event_type text not null,
  company_id uuid references public.bdht_companies (id) on delete set null,
  received_at timestamptz not null default now()
);

comment on table public.bdht_stripe_events is
  'Processed Stripe event ids. Service role only. Used so webhook retries are idempotent.';

alter table public.bdht_billing enable row level security;
alter table public.bdht_stripe_events enable row level security;

drop policy if exists bdht_billing_select on public.bdht_billing;
create policy bdht_billing_select
  on public.bdht_billing
  for select
  to authenticated
  using (company_id = (select bdht_private.my_company()));

revoke all on table public.bdht_billing from anon, authenticated;
grant select on table public.bdht_billing to authenticated;
grant all on table public.bdht_billing to service_role;

revoke all on table public.bdht_stripe_events from anon, authenticated;
grant all on table public.bdht_stripe_events to service_role;

create or replace function bdht_private.enforce_machine_limit()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  paid boolean;
  n integer;
begin
  select b.entitled into paid
  from public.bdht_billing b
  where b.company_id = new.company_id;

  if paid is true then
    return new;
  end if;

  select count(*)::integer into n
  from public.bdht_machines m
  where m.company_id = new.company_id;

  if n >= 3 then
    raise exception 'Free plan includes 3 operators. Upgrade for unlimited.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

comment on function bdht_private.enforce_machine_limit() is
  'Rejects a fourth operator unless the company billing row is entitled.';

revoke all on function bdht_private.enforce_machine_limit() from public, anon, authenticated;
grant execute on function bdht_private.enforce_machine_limit() to authenticated, service_role;

drop trigger if exists bdht_machines_free_limit on public.bdht_machines;
create trigger bdht_machines_free_limit
  before insert on public.bdht_machines
  for each row
  execute function bdht_private.enforce_machine_limit();
