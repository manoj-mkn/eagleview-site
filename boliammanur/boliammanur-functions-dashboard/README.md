# Boliammanur Functions + Dashboard — Setup

Two static websites sharing one Supabase database:
- `function-expenses/` — data entry: add functions/years, fill in an editable ledger sheet (Asal/Santha/Vatti/Thogai/Total/Paid per person, autosaves per cell), record materials
- `functions-dashboard/` — analytics + shared password management

## 1. Create the Supabase project
1. Go to supabase.com, sign up free, create a new project.
2. Once it's ready, open **SQL Editor → New query**, paste the contents of `supabase/schema.sql`, and run it.
   - This creates the tables, security rules, and the password-check functions.
   - Before running, edit the line `insert into settings (id, password) values (1, 'changeme123')` to set your real starting password.
3. Go to **Project Settings → API**. Copy the **Project URL** and the **anon public key**.

## 1b. Ledger migration (run once, after step 1)
The entry form was rebuilt to match the paper register (No., Name, Asal, Santha, Vatti, Thogai, Total, Paid) instead of generic credit/expense. In the SQL Editor, run, in order:
1. `supabase/migration_ledger.sql` — drops the old `transactions` table (only your test rows) and adds `ledger_entries` plus a `member_no` column on `people`.
2. `supabase/migration_low_confidence.sql` — adds a `low_confidence` flag so the entry site can show uncertain transcribed values in red.
3. (optional) `supabase/seed_2025_ledger.sql` — pre-fills the "தேவாதி அம்மன் உறுப்பினர்கள் 2025" sheet with a best-effort transcription of the photographed paper register. Read the notes at the top of that file before running — some rows are flagged low-confidence (shown red in the sheet) and a handful of illegible rows were left out entirely for you to add by hand.

## 2. Wire up both sites
Edit these two files and replace the placeholders with the values from step 1 (same values in both files — both sites use the same project):
- `function-expenses/supabase-config.js`
- `functions-dashboard/supabase-config.js`

```js
const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

## 3. Test locally
Open `function-expenses/index.html` and `functions-dashboard/index.html` directly in a browser. Enter the password, add a function/year, then edit a row in the Ledger Sheet (values save automatically as you type), then refresh the dashboard and confirm it shows up.

## 4. Publish on GitHub Pages
For each site:
1. Create a new GitHub repo (e.g. `boliammanur-function-expenses`).
2. Push that folder's contents to the repo root.
3. Repo → **Settings → Pages** → Source: deploy from the `main` branch, root folder.
4. GitHub gives you a URL like `https://yourusername.github.io/boliammanur-function-expenses/`.

Repeat for `functions-dashboard/` in its own repo.

## Notes
- No individual logins — one shared password gates both the entry forms and the "change password" panel on the dashboard.
- The password protects the UI, not the raw API (see the plan doc for the tradeoff) — fine for a community/family use case.
- To change the password later, use the "Change Shared Password" panel on the dashboard site (needs the current password).
