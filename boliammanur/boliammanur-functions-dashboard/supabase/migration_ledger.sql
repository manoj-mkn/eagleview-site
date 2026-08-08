-- Migration: replace the generic credit/expense form with a structured
-- membership ledger matching the paper register (No., Name, Asal, Santha,
-- Vatti, Thogai, Total, Paid).
-- Run this in the Supabase SQL editor AFTER the original schema.sql.
-- WARNING: this drops the `transactions` table and any rows in it
-- (only your test entries so far).

alter table people add column if not exists member_no int;

drop table if exists transactions;

create table if not exists ledger_entries (
  id uuid primary key default gen_random_uuid(),
  function_id uuid not null references functions(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  asal numeric not null default 0,
  santha numeric not null default 0,
  vatti numeric not null default 0,
  thogai numeric not null default 0,
  total numeric not null default 0,
  paid boolean not null default false,
  created_at timestamptz not null default now(),
  unique (function_id, person_id)
);

alter table ledger_entries enable row level security;

create policy "public select ledger_entries" on ledger_entries for select using (true);
create policy "public insert ledger_entries" on ledger_entries for insert with check (true);
create policy "public update ledger_entries" on ledger_entries for update using (true) with check (true);
