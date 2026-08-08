-- சந்தா becomes an admin-controlled fixed price per function, with each
-- member just checked/unchecked (paid/not) on the entry site instead of
-- typing an amount. Unchecked counts as 0 toward totals.
-- Run this once in the Supabase SQL editor.

alter table functions add column if not exists santha_amount numeric not null default 1000;
alter table ledger_entries add column if not exists santha_checked boolean not null default false;

-- Best-effort backfill: existing rows with a positive santha were presumably
-- already "paid" at whatever amount they hold.
update ledger_entries set santha_checked = true where santha > 0 and not santha_checked;
