-- Enforce no duplicate names or S.No. (member_no) across the whole roster,
-- as a database-level backstop behind the app's own duplicate checks.
-- member_no allows multiple NULLs (people added without a number) - only
-- non-null duplicates are blocked.

-- Run this check first - if it returns any rows, resolve those duplicates
-- (rename or clear the member_no) before adding the constraints below.
select name, count(*) from people group by name having count(*) > 1;
select member_no, count(*) from people where member_no is not null group by member_no having count(*) > 1;

alter table people add constraint people_name_unique unique (name);
alter table people add constraint people_member_no_unique unique (member_no);
