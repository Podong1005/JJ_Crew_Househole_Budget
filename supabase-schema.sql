create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  amount numeric(12, 0) not null check (amount >= 0),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  date date not null,
  type text not null check (type in ('income', 'expense')),
  category text not null,
  amount numeric(12, 0) not null check (amount >= 0),
  note text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.fixed_expenses enable row level security;
alter table public.transactions enable row level security;

create or replace function public.generate_invite_code()
returns text
language plpgsql
as $$
declare
  new_code text;
begin
  loop
    new_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
    exit when not exists (
      select 1
      from public.households
      where invite_code = new_code
    );
  end loop;
  return new_code;
end;
$$;

create or replace function public.is_household_member(target_household uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household
      and user_id = auth.uid()
  );
$$;

create or replace function public.create_household_with_owner(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  insert into public.households (name, invite_code, created_by)
  values (trim(p_name), public.generate_invite_code(), auth.uid())
  returning id into new_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (new_household_id, auth.uid(), 'owner')
  on conflict do nothing;

  return new_household_id;
end;
$$;

create or replace function public.join_household_by_invite_code(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_household_id uuid;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select id
  into target_household_id
  from public.households
  where invite_code = upper(trim(p_invite_code));

  if target_household_id is null then
    raise exception '초대 코드를 찾을 수 없습니다.';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (target_household_id, auth.uid(), 'member')
  on conflict do nothing;

  return target_household_id;
end;
$$;

drop policy if exists "households_select_for_members" on public.households;
create policy "households_select_for_members"
on public.households
for select
using (public.is_household_member(id));

drop policy if exists "household_members_select_own_households" on public.household_members;
create policy "household_members_select_own_households"
on public.household_members
for select
using (user_id = auth.uid());

drop policy if exists "fixed_expenses_select_for_members" on public.fixed_expenses;
create policy "fixed_expenses_select_for_members"
on public.fixed_expenses
for select
using (public.is_household_member(household_id));

drop policy if exists "fixed_expenses_insert_for_members" on public.fixed_expenses;
create policy "fixed_expenses_insert_for_members"
on public.fixed_expenses
for insert
with check (public.is_household_member(household_id) and created_by = auth.uid());

drop policy if exists "fixed_expenses_delete_for_members" on public.fixed_expenses;
create policy "fixed_expenses_delete_for_members"
on public.fixed_expenses
for delete
using (public.is_household_member(household_id));

drop policy if exists "transactions_select_for_members" on public.transactions;
create policy "transactions_select_for_members"
on public.transactions
for select
using (public.is_household_member(household_id));

drop policy if exists "transactions_insert_for_members" on public.transactions;
create policy "transactions_insert_for_members"
on public.transactions
for insert
with check (public.is_household_member(household_id) and created_by = auth.uid());

grant usage on schema public to anon, authenticated;
grant select on public.households, public.household_members, public.fixed_expenses, public.transactions to authenticated;
grant insert, delete on public.fixed_expenses to authenticated;
grant insert on public.transactions to authenticated;
grant execute on function public.create_household_with_owner(text) to authenticated;
grant execute on function public.join_household_by_invite_code(text) to authenticated;
