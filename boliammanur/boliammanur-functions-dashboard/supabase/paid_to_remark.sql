-- Converts ledger_entries.paid from a true/false checkbox into a free-text
-- "குறிப்பு" (Remark) field. Existing "Paid" checkmarks become the text
-- "Paid"; existing unchecked rows become empty text.
-- Run this once in the Supabase SQL editor.

alter table ledger_entries alter column paid drop default;
alter table ledger_entries alter column paid type text using (case when paid then 'Paid' else '' end);
alter table ledger_entries alter column paid set default '';
