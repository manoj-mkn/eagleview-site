-- Adds a second, English-language Name field shown next to Mobile Number
-- (separate from the existing `name` column, now labeled பெயர் on the
-- entry site's Ledger Sheet).
-- Run this once in the Supabase SQL editor.

alter table people add column if not exists name_en text;
