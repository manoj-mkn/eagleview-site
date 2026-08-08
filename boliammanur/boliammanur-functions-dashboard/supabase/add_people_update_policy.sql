-- The `people` table has only ever had SELECT and INSERT policies — there was
-- never an UPDATE policy. Row Level Security defaults to deny for any
-- operation without a matching policy, so every update to `people` (Mobile
-- Number, Name (English), and the Type field on the members page) has been
-- silently doing nothing: no error, but the change reverts on refresh.
-- Run this once in the Supabase SQL editor.

create policy "public update people" on people for update using (true) with check (true);
