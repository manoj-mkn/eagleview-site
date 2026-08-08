-- Each function can restrict which people-Type shows up on its Ledger Sheet:
-- 'All' (everyone), '24Manai', or 'Others'.
-- Run this once in the Supabase SQL editor, then the two update statements
-- below set your existing functions correctly (both years each).

alter table functions add column if not exists allowed_type text not null default 'All';

update functions set allowed_type = '24Manai' where name = 'தேவாதி அம்மன் சாமி கும்பிடு';
update functions set allowed_type = 'All' where name = 'திருமுருகன் தீர்த்தக்காவடி';
