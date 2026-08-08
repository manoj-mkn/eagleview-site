-- Adds a Type field to classify each member as '24Manai' or 'Others', used to
-- filter the போளியம்மனூர் உறுப்பினர்கள் members page.
-- Run this once in the Supabase SQL editor.

alter table people add column if not exists type text;
