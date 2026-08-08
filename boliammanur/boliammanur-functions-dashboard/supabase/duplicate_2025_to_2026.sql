-- One-time: duplicate the 2025 தேவாதி அம்மன் உறுப்பினர்கள் ledger into a new
-- 2026 function, copying every person's asal/santha/vatti/thogai/total/paid/
-- low_confidence exactly as they are in 2025. Safe to re-run.

insert into functions (name, year)
select 'தேவாதி அம்மன் உறுப்பினர்கள்', 2026
where not exists (
  select 1 from functions where name = 'தேவாதி அம்மன் உறுப்பினர்கள்' and year = 2026
);

insert into ledger_entries (function_id, person_id, asal, santha, vatti, thogai, total, paid, low_confidence)
select
  f2026.id,
  le.person_id,
  le.asal, le.santha, le.vatti, le.thogai, le.total, le.paid, le.low_confidence
from ledger_entries le
join functions f2025 on f2025.id = le.function_id and f2025.name = 'தேவாதி அம்மன் உறுப்பினர்கள்' and f2025.year = 2025
join functions f2026 on f2026.name = 'தேவாதி அம்மன் உறுப்பினர்கள்' and f2026.year = 2026
on conflict (function_id, person_id) do update set
  asal = excluded.asal,
  santha = excluded.santha,
  vatti = excluded.vatti,
  thogai = excluded.thogai,
  total = excluded.total,
  paid = excluded.paid,
  low_confidence = excluded.low_confidence;
