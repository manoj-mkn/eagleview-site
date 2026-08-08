-- Boliammanur Functions / Dashboard schema
-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query).

create extension if not exists pgcrypto;

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists functions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year int not null,
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  function_id uuid not null references functions(id) on delete cascade,
  type text not null check (type in ('credit', 'expense')),
  amount numeric not null check (amount >= 0),
  description text,
  txn_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  function_id uuid not null references functions(id) on delete cascade,
  item_name text not null,
  quantity numeric,
  unit text,
  cost numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  id int primary key default 1,
  password text not null,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);

-- Set the initial shared password here before running (change 'changeme123'):
insert into settings (id, password) values (1, 'changeme123')
  on conflict (id) do nothing;

-- Row Level Security
alter table people enable row level security;
alter table functions enable row level security;
alter table transactions enable row level security;
alter table materials enable row level security;
alter table settings enable row level security;

-- Public read/write for data tables (both sites use the anon key; the
-- password prompt is a UI gate, not a hard security boundary — see plan notes).
create policy "public select people" on people for select using (true);
create policy "public insert people" on people for insert with check (true);

create policy "public select functions" on functions for select using (true);
create policy "public insert functions" on functions for insert with check (true);

create policy "public select transactions" on transactions for select using (true);
create policy "public insert transactions" on transactions for insert with check (true);

create policy "public select materials" on materials for select using (true);
create policy "public insert materials" on materials for insert with check (true);

-- No public policies on settings: only reachable through the RPC functions below.

-- Password check: returns true/false, never exposes the stored password.
create or replace function check_password(input text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from settings where id = 1 and password = input);
$$;

-- Password change: requires the current password to succeed.
create or replace function set_password(old_password text, new_password text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from settings where id = 1 and password = old_password) then
    return false;
  end if;
  update settings set password = new_password, updated_at = now() where id = 1;
  return true;
end;
$$;

-- Allow the anon role to call the RPC functions (but not read/write settings directly).
grant execute on function check_password(text) to anon;
grant execute on function set_password(text, text) to anon;
