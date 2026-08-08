-- Best-effort transcription of the "2025 தேவாதி அம்மன் உறுப்பினர்கள்" paper
-- register (rows 1-77) into people + ledger_entries.
-- Run this AFTER schema.sql, migration_ledger.sql, and migration_low_confidence.sql.
--
-- NOTES / LIMITS (read before running):
--  * Santha was clearly "1000" for every row - high confidence, never flagged.
--  * Rows that also have Asal/Vatti/Thogai are the ones I was least sure about
--    reading precisely (torn page corner, faint ink) - these are inserted with
--    low_confidence = true, which the entry site's Ledger Sheet shows in RED
--    until you edit and re-save that row.
--  * The paid (✓) checkmarks were NOT transcribed - every row starts unpaid.
--    Please check those off yourself in the sheet.
--  * Rows ~78-91 (bottom of photo 2, looser cursive names) were too unclear
--    to transcribe responsibly and are NOT included - add them yourself using
--    the "+ Add" row at the bottom of the Ledger Sheet.
--  * Row 41 (REK. கார்த்திகேயன்) and row 45 (SR. சுப்பையா) had corrections/
--    ambiguous columns on the paper itself - double check these two closely.

insert into functions (name, year)
select 'தேவாதி அம்மன் உறுப்பினர்கள்', 2025
where not exists (
  select 1 from functions where name = 'தேவாதி அம்மன் உறுப்பினர்கள்' and year = 2025
);

drop table if exists seed_rows;

create table seed_rows (
  member_no int,
  name text,
  asal numeric,
  santha numeric,
  vatti numeric,
  thogai numeric,
  paid boolean,
  low_confidence boolean
);

insert into seed_rows (member_no, name, asal, santha, vatti, thogai, paid, low_confidence) values
(1,  'S. தங்கராஜ்',          10000, 1000, 1200,    0, false, true),
(2,  'ST. பாலசுப்ரமணி',          0, 1000,    0,    0, false, false),
(3,  'ST. செந்தில்குமார்',        0, 1000,    0,    0, false, false),
(4,  'S. முருகேஷ்',          10000, 1000, 1200,  350, false, true),
(5,  'STM. சிவக்குமார்',          0, 1000,    0,    0, false, false),
(6,  'STM. விநாயகமூர்த்தி',       0, 1000,    0,    0, false, false),
(7,  'SRA. செல்வராஜ்',            0, 1000,    0,    0, false, false),
(8,  'SRA. கண்ணன்',               0, 1000,    0,12000, false, true),
(9,  'A.K. ஹரிஹரசுதன்',           0, 1000,    0,    0, false, false),
(10, 'TA. மகேஸ்வரன்',        10000, 1000, 1200,    0, false, true),
(11, 'TA. செந்தில் முருகன்', 10000, 1000, 1200,   50, false, true),
(12, 'R. தண்டபாணி',          10000, 1000, 1200,  510, false, true),
(13, 'R. சுப்பிரமணி',         10000, 1000, 1200,  200, false, true),
(14, 'LP. கணேசன்',                0, 1000,    0,    0, false, false),
(15, 'L. கிருஷ்ணன்',              0, 1000,    0,    0, false, false),
(16, 'LK. பாலமுருகன்',            0, 1000,    0,    0, false, false),
(17, 'L. பாலசுப்பிரமணி',          0, 1000,    0,    0, false, false),
(18, 'LP. ஜெகநாதன்',          10000, 1000, 1200,    0, false, true),
(19, 'RKG. கார்த்திகேயன்',         0, 1000,    0,    0, false, false),
(20, 'ஆ. அ. முருகன்',              0, 1000,    0,    0, false, false),
(21, 'ஆ. அசிவக்குமார்',            0, 1000,    0,    0, false, false),
(22, 'PS. நடராஜ்',                 0, 1000,    0,    0, false, true),
(23, 'PS. பரமாத்மா',          10000, 1000, 1200,  100, false, true),
(24, 'PSP. சரவணன்',                0, 1000,    0,    0, false, false),
(25, 'PS. ஆறுமுகம்',               0, 1000,    0,    0, false, false),
(26, 'LS. சின்ராஜ்',                0, 1000,    0,    0, false, false),
(27, 'L. நடராஜ்',                  0, 1000,    0,    0, false, false),
(28, 'R. முருகேசன்',          10000, 1000, 1200,  150, false, true),
(29, 'SN. ஆறுமுகம்',               0, 1000,    0,    0, false, false),
(30, 'SN. சக்திவேல்',               0, 1000,    0,  900, false, true),
(31, 'SA. முருகன்',                0, 1000,    0,    0, false, false),
(32, 'SA. சங்கர்',                 0, 1000,    0,    0, false, false),
(33, 'SMS. பாண்டி',           10000, 1000, 1200, 1270, false, true),
(34, 'RMS. முருகேசன்',             0, 1000,    0,    0, false, false),
(35, 'SK. சுப்பிரமணி',        10000, 1000, 1200,  200, false, true),
(36, 'SK. சுந்தரம்',          10000, 1000, 1200,  660, false, true),
(37, 'RER. கணேசன்',           10000, 1000, 1200,    0, false, true),
(38, 'REK. ஜெயபால்',                0, 1000,    0,    0, false, false),
(39, 'REK. முருகேசன்',        10000, 1000, 1200,    0, false, true),
(40, 'REK. சிவக்குமார்',            0, 1000,    0,    0, false, false),
(41, 'REK. கார்த்திகேயன்',    10000, 1000, 1200,  750, false, true),
(42, 'MV. பாரதி',                  0, 1000,    0,    0, false, true),
(43, 'MVB. சரத்குமார்',             0, 1000,    0,    0, false, false),
(44, 'DK. மணிகண்டன்',               0, 1000,    0,  100, false, true),
(45, 'SR. சுப்பையா',                0, 1000,    0, 1100, false, true),
(46, 'SRS. கோபி',                  0, 1000,    0,    0, false, false),
(47, 'SRS. பாலு',                  0, 1000,    0,    0, false, false),
(48, 'SRS. ரகு',                   0, 1000,    0,    0, false, false),
(49, 'V. கண்ணுச்சாமி',        10000, 1000, 1200,  200, false, true),
(50, 'V. தண்டபாணி',           10000, 1000, 1200,    0, false, true),
(51, 'SR. முருகன்',                0, 1000,    0,    0, false, false),
(52, 'SRM. ஸ்ரீனிவாசன்',            0, 1000,    0,    0, false, false),
(53, 'SRM. வெங்கடேஷ்',              0, 1000,    0,    0, false, false),
(54, 'SRM. வெற்றிவேல்',             0, 1000,    0,    0, false, false),
(55, 'மலை முருகன்',                 0, 1000,    0,    0, false, false),
(56, 'TR. ரமேஷ் (மலை)',             0, 1000,    0,  450, false, true),
(57, 'மலை வித்யாசாகர்',             0, 1000,    0,    0, false, false),
(58, 'RM. பாபு',                   0, 1000,    0,    0, false, true),
(59, 'R. ராஜகோபால்',                0, 1000,    0,    0, false, false),
(60, 'RA. ராஜ்',                   0, 1000,    0,    0, false, false),
(61, 'RA. சுரேஷ்',                 0, 1000,    0,    0, false, false),
(62, 'KKS. சிவக்குமார்',            0, 1000,    0,    0, false, false),
(63, 'R. ஆறுமுகம்',                 0, 1000,    0,    0, false, false),
(64, 'VT. பாண்டியராஜ்',       10000, 1000, 1200,   50, false, true),
(65, 'VT. தங்கப்பாண்டி',      10000, 1000, 1200,  650, false, true),
(66, 'VT. கார்த்திகேயன்',     10000, 1000, 1200,    0, false, true),
(67, 'V. காளிமுத்து',         10000, 1000, 1200,    0, false, true),
(68, 'C. சக்திவேல்',                0, 1000,    0,    0, false, false),
(69, 'R. சரவணன்',             10000, 1000, 1200,    0, false, true),
(70, 'M. சதீஷ்',                    0, 1000,    0,    0, false, true),
(71, 'RP. ராஜா',              10000, 1000, 1200,    0, false, true),
(72, 'RP. விக்கி',                  0, 1000,    0,    0, false, false),
(73, 'R. முத்துக்குமார்',     10000, 1000, 1200,    0, false, true),
(74, 'DLD. செல்வராஜ்',              0, 1000,    0,    0, false, false),
(75, 'DLD. திருப்பிரசாத்',          0, 1000,    0,    0, false, false),
(76, 'RKV. பாண்டியராஜ்',            0, 1000,    0,    0, false, false),
(77, 'R.P. வசந்த்',                 0, 1000,    0,    0, false, false);

insert into people (member_no, name)
select s.member_no, s.name from seed_rows s
where not exists (select 1 from people p where p.name = s.name);

insert into ledger_entries (function_id, person_id, asal, santha, vatti, thogai, total, paid, low_confidence)
select
  f.id,
  p.id,
  s.asal, s.santha, s.vatti, s.thogai,
  s.asal + s.santha + s.vatti + s.thogai,
  s.paid,
  s.low_confidence
from seed_rows s
join people p on p.name = s.name
join functions f on f.name = 'தேவாதி அம்மன் உறுப்பினர்கள்' and f.year = 2025
on conflict (function_id, person_id) do update set
  asal = excluded.asal,
  santha = excluded.santha,
  vatti = excluded.vatti,
  thogai = excluded.thogai,
  total = excluded.total,
  paid = excluded.paid,
  low_confidence = excluded.low_confidence;

drop table if exists seed_rows;
