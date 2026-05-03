create extension if not exists pgcrypto;

create table if not exists public.shared_fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  household_key text not null,
  date date not null default current_date,
  name text not null,
  amount numeric(12, 0) not null check (amount >= 0),
  note text not null default '',
  auto_apply boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.shared_fixed_expenses
add column if not exists date date;

update public.shared_fixed_expenses
set date = created_at::date
where date is null;

alter table public.shared_fixed_expenses
alter column date set default current_date,
alter column date set not null;

alter table public.shared_fixed_expenses
add column if not exists note text not null default '';

alter table public.shared_fixed_expenses
add column if not exists auto_apply boolean not null default true;

update public.shared_fixed_expenses
set auto_apply = true
where auto_apply is null;

create table if not exists public.shared_transactions (
  id uuid primary key default gen_random_uuid(),
  household_key text not null,
  date date not null,
  type text not null check (type in ('income', 'expense')),
  category text not null,
  name text not null default '',
  amount numeric(12, 0) not null check (amount >= 0),
  created_by text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table public.shared_transactions
add column if not exists name text not null default '';

update public.shared_transactions
set name = category
where coalesce(trim(name), '') = '';

alter table public.shared_transactions
add column if not exists created_by text not null default '';

create index if not exists shared_fixed_expenses_household_key_idx
on public.shared_fixed_expenses (household_key);

create index if not exists shared_transactions_household_key_date_idx
on public.shared_transactions (household_key, date desc, created_at desc);

alter table public.shared_fixed_expenses enable row level security;
alter table public.shared_transactions enable row level security;

revoke all on public.shared_fixed_expenses from anon, authenticated;
revoke all on public.shared_transactions from anon, authenticated;

create or replace function public.assert_shared_household_key(p_household_key text)
returns text
language plpgsql
immutable
as $$
begin
  if p_household_key is null or p_household_key !~ '^[0-9a-f]{64}$' then
    raise exception '가계부 코드와 PIN을 다시 확인해 주세요.';
  end if;

  return p_household_key;
end;
$$;

create or replace function public.get_shared_budget(p_household_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_key text := public.assert_shared_household_key(p_household_key);
  fixed_items jsonb;
  transaction_items jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.date desc, row_data.created_at desc), '[]'::jsonb)
  into fixed_items
  from (
    select id, date, name, amount, note, auto_apply, created_at
    from public.shared_fixed_expenses
    where household_key = safe_key
  ) as row_data;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.date desc, row_data.created_at desc), '[]'::jsonb)
  into transaction_items
  from (
    select id, date, type, category, name, amount, created_by, note, created_at
    from public.shared_transactions
    where household_key = safe_key
  ) as row_data;

  return jsonb_build_object(
    'fixed_expenses', fixed_items,
    'transactions', transaction_items
  );
end;
$$;

drop function if exists public.add_shared_fixed_expense(text, text, numeric);
drop function if exists public.add_shared_fixed_expense(text, date, text, numeric, text);
drop function if exists public.add_shared_fixed_expense(text, date, text, numeric, text, boolean);

create function public.add_shared_fixed_expense(
  p_household_key text,
  p_date date,
  p_name text,
  p_amount numeric,
  p_note text default '',
  p_auto_apply boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_key text := public.assert_shared_household_key(p_household_key);
  new_id uuid;
begin
  if trim(coalesce(p_name, '')) = '' or coalesce(p_amount, 0) <= 0 then
    raise exception '고정비 항목명과 금액을 입력해 주세요.';
  end if;

  insert into public.shared_fixed_expenses (household_key, date, name, amount, note, auto_apply)
  values (safe_key, p_date, trim(p_name), p_amount, coalesce(p_note, ''), coalesce(p_auto_apply, true))
  returning id into new_id;

  return new_id;
end;
$$;

drop function if exists public.add_shared_transaction(text, date, text, text, numeric, text);
drop function if exists public.add_shared_transaction(text, date, text, text, text, numeric, text, text);

create or replace function public.add_shared_transaction(
  p_household_key text,
  p_date date,
  p_type text,
  p_category text,
  p_name text,
  p_amount numeric,
  p_created_by text default '',
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_key text := public.assert_shared_household_key(p_household_key);
  new_id uuid;
begin
  if p_type not in ('income', 'expense') then
    raise exception '수입 또는 지출만 저장할 수 있습니다.';
  end if;

  if trim(coalesce(p_category, '')) = '' or trim(coalesce(p_name, '')) = '' or coalesce(p_amount, 0) <= 0 then
    raise exception '카테고리, 항목명, 금액을 입력해 주세요.';
  end if;

  insert into public.shared_transactions (household_key, date, type, category, name, amount, created_by, note)
  values (
    safe_key,
    p_date,
    p_type,
    trim(p_category),
    trim(p_name),
    p_amount,
    coalesce(trim(p_created_by), ''),
    coalesce(p_note, '')
  )
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.delete_shared_fixed_expense(
  p_household_key text,
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_key text := public.assert_shared_household_key(p_household_key);
begin
  delete from public.shared_fixed_expenses
  where household_key = safe_key
    and id = p_id;
end;
$$;

create or replace function public.delete_shared_transaction(
  p_household_key text,
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_key text := public.assert_shared_household_key(p_household_key);
begin
  delete from public.shared_transactions
  where household_key = safe_key
    and id = p_id;
end;
$$;

grant usage on schema public to anon, authenticated;
grant execute on function public.get_shared_budget(text) to anon, authenticated;
grant execute on function public.add_shared_fixed_expense(text, date, text, numeric, text, boolean) to anon, authenticated;
grant execute on function public.add_shared_transaction(text, date, text, text, text, numeric, text, text) to anon, authenticated;
grant execute on function public.delete_shared_fixed_expense(text, uuid) to anon, authenticated;
grant execute on function public.delete_shared_transaction(text, uuid) to anon, authenticated;
