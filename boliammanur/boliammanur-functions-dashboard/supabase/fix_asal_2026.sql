update ledger_entries le
set asal = 10000,
    vatti = 1200,
    total = 10000 + le.santha + 1200 + le.thogai,
    low_confidence = true
from people p, functions f
where le.person_id = p.id
  and le.function_id = f.id
  and f.name = 'தேவாதி அம்மன் உறுப்பினர்கள்' and f.year = 2026
  and p.name in ('KKS. சிவக்குமார்', 'R. ஆறுமுகம்', 'C. சக்திவேல்', 'M. சதீஷ்');
