-- BDHT sign-up without turning on project-wide public sign-ups.
-- This Supabase project is shared with another app. Auth sign-ups stay disabled.
-- bdht-signup (service role) creates the auth user, then calls these functions.
-- Do not grant them to anon or authenticated: they accept a user id and write
-- company rows with row-level security bypassed by the service role.

create schema if not exists bdht_private;

create table if not exists public.bdht_signup_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  email_hash text not null,
  created_at timestamptz not null default now(),
  constraint bdht_signup_attempts_hash_chk check (
    ip_hash ~ '^[0-9a-f]{64}$' and email_hash ~ '^[0-9a-f]{64}$'
  )
);

comment on table public.bdht_signup_attempts is
  'Hashed signup attempts for rate limits. Service role only. Raw emails and IP addresses are not stored.';

create index if not exists bdht_signup_attempts_ip_idx
  on public.bdht_signup_attempts (ip_hash, created_at);
create index if not exists bdht_signup_attempts_email_idx
  on public.bdht_signup_attempts (email_hash, created_at);
create index if not exists bdht_signup_attempts_created_idx
  on public.bdht_signup_attempts (created_at);

alter table public.bdht_signup_attempts enable row level security;
revoke all on table public.bdht_signup_attempts from public, anon, authenticated;
grant select, insert, delete on table public.bdht_signup_attempts to service_role;
grant usage, select on sequence public.bdht_signup_attempts_id_seq to service_role;

-- 20 attempts per IP per hour, 8 per email per day. Rejections are not recorded,
-- so a blocked caller stays blocked until an earlier attempt ages out.
create or replace function public.bdht_take_signup_attempt(p_ip_hash text, p_email_hash text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ip_key integer := hashtext(p_ip_hash);
  email_key integer := hashtext(p_email_hash);
  ip_n integer;
  email_n integer;
begin
  if p_ip_hash !~ '^[0-9a-f]{64}$' or p_email_hash !~ '^[0-9a-f]{64}$' then
    return 'ip';
  end if;
  if ip_key <= email_key then
    perform pg_advisory_xact_lock(841207, ip_key);
    if ip_key <> email_key then
      perform pg_advisory_xact_lock(841207, email_key);
    end if;
  else
    perform pg_advisory_xact_lock(841207, email_key);
    perform pg_advisory_xact_lock(841207, ip_key);
  end if;

  delete from public.bdht_signup_attempts
  where created_at < now() - interval '1 day';

  select count(*)::integer into ip_n
  from public.bdht_signup_attempts
  where ip_hash = p_ip_hash
    and created_at > now() - interval '1 hour';
  select count(*)::integer into email_n
  from public.bdht_signup_attempts
  where email_hash = p_email_hash
    and created_at > now() - interval '1 day';

  if ip_n >= 20 then
    return 'ip';
  end if;
  if email_n >= 8 then
    return 'email';
  end if;

  insert into public.bdht_signup_attempts (ip_hash, email_hash)
  values (p_ip_hash, p_email_hash);
  return 'ok';
end;
$$;

revoke all on function public.bdht_take_signup_attempt(text, text) from public, anon, authenticated;
grant execute on function public.bdht_take_signup_attempt(text, text) to service_role;

-- One transaction for the company, the member, and the machines.
-- A free company stops at 3 machines. Joining a company that is already at the
-- cap still creates the member and reports capped instead of failing the signup.
create or replace function public.bdht_provision_signup(
  p_user uuid,
  p_mode text,
  p_company text,
  p_code text,
  p_employee text,
  p_email text,
  p_machines jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cid uuid;
  v_company text := btrim(coalesce(p_company, ''));
  v_employee text := btrim(coalesce(p_employee, ''));
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_item jsonb;
  v_type integer;
  v_brand text;
  v_model text;
  v_nick text;
  capped boolean := false;
begin
  if p_user is null then
    raise exception 'Missing user' using errcode = 'P0001';
  end if;
  if char_length(v_employee) < 1 or char_length(v_employee) > 120 then
    raise exception 'Enter your name.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.bdht_members where user_id = p_user) then
    raise exception 'You already belong to a company' using errcode = 'P0001';
  end if;
  if p_machines is null or jsonb_typeof(p_machines) <> 'array' then
    raise exception 'Add the machines this crew runs.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_machines) > 25 then
    raise exception 'Add up to 25 machines in one signup.' using errcode = 'P0001';
  end if;

  if p_mode = 'new' then
    if char_length(v_company) < 1 or char_length(v_company) > 120 then
      raise exception 'Enter your company name.' using errcode = 'P0001';
    end if;
    if jsonb_array_length(p_machines) < 1 then
      raise exception 'Pick at least one drill.' using errcode = 'P0001';
    end if;
    if jsonb_array_length(p_machines) > 3 then
      raise exception 'A free company can add 3 machines. Upgrade after signup for unlimited.' using errcode = 'P0001';
    end if;
    insert into public.bdht_companies (name, created_by)
    values (v_company, p_user)
    returning id into cid;
    insert into public.bdht_members (user_id, company_id, role, employee_name, email)
    values (p_user, cid, 'owner', v_employee, nullif(btrim(coalesce(p_email, '')), ''));
  elsif p_mode = 'join' then
    if v_code !~ '^[A-Z0-9]{6,12}$' then
      raise exception 'Enter the invite code from your company owner.' using errcode = 'P0001';
    end if;
    -- Lock the company now so concurrent joins serialize here instead of
    -- deadlocking on a KEY SHARE -> FOR UPDATE upgrade in the machine trigger.
    select id into cid from public.bdht_companies where invite_code = v_code for update;
    if cid is null then
      raise exception 'Invite code not found' using errcode = 'P0001';
    end if;
    insert into public.bdht_members (user_id, company_id, role, employee_name, email)
    values (p_user, cid, 'member', v_employee, nullif(btrim(coalesce(p_email, '')), ''));
  else
    raise exception 'Choose new company or join a company.' using errcode = 'P0001';
  end if;

  for v_item in select value from jsonb_array_elements(p_machines)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Pick a drill from the list.' using errcode = 'P0001';
    end if;
    begin
      v_type := (v_item->>'machine_type_id')::integer;
    exception
      when invalid_text_representation then
        raise exception 'Pick a drill from the list.' using errcode = 'P0001';
    end;
    v_brand := btrim(coalesce(v_item->>'brand', ''));
    v_model := btrim(coalesce(v_item->>'model', ''));
    v_nick := nullif(btrim(coalesce(v_item->>'nickname', '')), '');
    if v_brand not in ('Ditch Witch', 'Vermeer')
      or v_type is null or v_type <= 0
      or char_length(v_model) < 1 or char_length(v_model) > 80
      or (v_nick is not null and char_length(v_nick) > 60) then
      raise exception 'Pick a drill from the list.' using errcode = 'P0001';
    end if;
    begin
      insert into public.bdht_machines (company_id, machine_type_id, brand, model, nickname, created_by)
      values (cid, v_type, v_brand, v_model, v_nick, p_user);
    exception
      when sqlstate 'P0001' then
        capped := true;
        exit;
    end;
  end loop;

  return jsonb_build_object('capped', capped);
end;
$$;

revoke all on function public.bdht_provision_signup(uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.bdht_provision_signup(uuid, text, text, text, text, text, jsonb) to service_role;

-- Same cap as the billing migrations, including the company-row lock, with the
-- crew-facing word "machines". Safe before or after the reliability migration.
create or replace function bdht_private.enforce_machine_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  paid boolean;
  n integer;
begin
  if tg_op = 'UPDATE' then
    if new.company_id = old.company_id then
      return new;
    end if;
  end if;

  perform 1 from public.bdht_companies where id = new.company_id for update;
  select entitled into paid from public.bdht_billing where company_id = new.company_id;
  if paid is true then
    return new;
  end if;
  select count(*)::integer into n from public.bdht_machines where company_id = new.company_id;
  if n >= 3 then
    raise exception 'Free plan includes 3 machines. Upgrade for unlimited.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists bdht_machines_free_limit on public.bdht_machines;
create trigger bdht_machines_free_limit
  before insert or update of company_id on public.bdht_machines
  for each row execute function bdht_private.enforce_machine_limit();
