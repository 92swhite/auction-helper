# Backup and recovery

Open **Settings → Backup & restore → Download backup**. Save the JSON file
somewhere separate from the app's database. It includes your lot notes, evidence,
watch state, inventory, buying criteria and history. Keep it private; it is not
encrypted. The 1 MB limit applies to the complete UTF-8 file. Each collection
(lots, inventory and audit history) also supports up to 5,000 records.

To restore, choose **Choose backup file**, review its lot/inventory counts and
available capital, then **Replace workspace**. Cancel changes nothing. The file
replaces the current workspace; it does not merge records. Invalid files leave
current data intact. If another window changes the workspace after the preview,
choose and review the file again.

Before replacement, the app saves a complete copy of the current workspace in
`backups/before-restore-<unique-id>.json` beside its database. The confirmation
shows its exact path after success. These recovery files use the same import
format; choose one to recover the previous workspace. They are retained until you
manage them yourself. If the recovery copy cannot be saved, restore stops before
changing records. A failed database replacement rolls back every changed record.

The desktop database normally lives under
`~/.local/share/com.92swhite.auction-helper/auction-helper.db`; browser development
uses `.local/browser.db` or its explicitly configured test path. Recovery files
use owner-only permissions on Unix. Copy them to separate storage as needed.

Only version-one **backup** files are supported. **Export data** files are readable
analysis reports and lack complete timestamps/history; they cannot be imported.
Backups validate structure, money, dates, IDs and relationships, and recompute
financial totals. Validation does not authenticate a file or prove its contents
are accurate. No URL or SQL from a backup is executed or fetched.

For a workspace larger than the JSON limit, close the app and any browser bridge
before copying its SQLite database. Keep the original copy; a live database may
still have uncheckpointed WAL data. Broader migrations and ledger corrections
remain separate work.
