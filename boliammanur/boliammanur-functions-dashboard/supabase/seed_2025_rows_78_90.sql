-- Extends the 2025 தேவாதி அம்மன் உறுப்பினர்கள் ledger with rows 78-90.
-- WARNING: unlike the earlier seed, the NAMES here are low-confidence guesses
-- from hard-to-read cursive handwriting, not just the amounts. Every row is
-- flagged low_confidence = true (shown red in the Ledger Sheet) - please check
-- each name against the paper register, not only the numbers.
-- Row 91 was cut off in the photo and is not included - add it by hand.

create table if not exists seed_rows_78_90 (
  member_no int,
  name text,
  santha numeric,
  low_confidence boolean
);

delete from seed_rows_78_90;

insert into seed_rows_78_90 (member_no, name, santha, low_confidence) values
(78, 'SAM. ஹரிகேசன்',      1000, true),
(79, 'S. கதிர்வேல்',        1000, true),
(80, 'V. குப்புசாமி',       1000, true),
(81, 'RMS. உறவினர்',        1000, true),
(82, 'மகேஷ்',              1000, true),
(83, 'N. பரமேஸ்வரன்',      1000, true),
(84, 'M. நந்திகுமார்',      1000, true),
(85, 'M. மனோஜ்குமார்',      1000, true),
(86, 'ஸ்ரீகாந்த்',          1000, true),
(87, 'கவிச்செல்வன்',        1000, true),
(88, 'K. ராஜா',            1000, true),
(89, 'V. காசிதம்பி',        1000, true),
(90, 'ஐயாத்துரை',          1000, true);

insert into people (member_no, name)
select s.member_no, s.name from seed_rows_78_90 s
where not exists (select 1 from people p where p.name = s.name);

insert into ledger_entries (function_id, person_id, asal, santha, vatti, thogai, total, paid, low_confidence)
select f.id, p.id, 0, s.santha, 0, 0, s.santha, false, s.low_confidence
from seed_rows_78_90 s
join people p on p.name = s.name
join functions f on f.name = 'தேவாதி அம்மன் உறுப்பினர்கள்' and f.year = 2025
on conflict (function_id, person_id) do update set
  santha = excluded.santha,
  total = excluded.total,
  low_confidence = excluded.low_confidence;

drop table if exists seed_rows_78_90;
