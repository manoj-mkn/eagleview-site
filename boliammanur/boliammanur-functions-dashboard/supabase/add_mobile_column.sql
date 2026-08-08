-- Adds a Mobile Number field to the people list, shown next to S.No. on the
-- entry site's Ledger Sheet.
-- Run this once in the Supabase SQL editor.

alter table people add column if not exists mobile text;
