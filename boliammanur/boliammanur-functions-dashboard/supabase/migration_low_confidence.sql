-- Adds a flag so the entry site can show values in red when they came from
-- an uncertain photo transcription rather than being typed in directly.
-- Run this in the Supabase SQL editor AFTER migration_ledger.sql.

alter table ledger_entries add column if not exists low_confidence boolean not null default false;
