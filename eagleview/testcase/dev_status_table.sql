-- One row per (tc_id, note_key). note_key = '' for the row-level checkbox
-- (used when a TC has a fail but zero notes); note_key = tester__platform__submitted_at
-- for a specific note's own checkbox.
create table public.eagleview_qa_dev_status (
  id          bigint generated always as identity primary key,
  tc_id       text not null,
  note_key    text not null default '',
  corrected   boolean not null default false,
  tested_ok   boolean not null default false,
  updated_at  timestamptz not null default now(),
  unique (tc_id, note_key)
);

alter table public.eagleview_qa_dev_status enable row level security;

-- Same trust model already in place for eagleview_qa (anon key can insert there
-- with no auth) — this table isn't introducing a new category of risk.
create policy "public can read dev status"
  on public.eagleview_qa_dev_status for select
  using (true);

create policy "public can insert dev status"
  on public.eagleview_qa_dev_status for insert
  with check (true);

create policy "public can update dev status"
  on public.eagleview_qa_dev_status for update
  using (true)
  with check (true);
