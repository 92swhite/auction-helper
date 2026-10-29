# Backup and recovery

Open **Settings → Backup & restore → Download backup**. Save the JSON file
somewhere separate from the app's database. It includes your lot notes, evidence,
watch state, inventory, buying criteria, operational stages and complete correction history. Keep it private; it is not
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

New downloads use version-two **backup** files. Version-one backups are also
supported: the preview explicitly states that all imported operational stages
will begin Unreviewed. Existing financial Sold status and original history are
preserved. Version-two files require complete stages and consistent stage/audit
history; unknown versions, fields, enum values or inconsistent chains are refused. **Export data** files are readable
analysis reports and lack complete timestamps/history; they cannot be imported.
Backups validate structure, money, dates, IDs and relationships, and recompute
financial totals. Validation does not authenticate a file or prove its contents
are accurate. No URL or SQL from a backup is executed or fetched.

For a workspace larger than the JSON limit, close the app and any browser bridge
before copying its SQLite database. Keep the original copy; a live database may
still have uncheckpointed WAL data. Ledger corrections remain separate work.

## Database upgrade recovery

Before upgrading an existing supported v1 database, the app holds a writer lock
and uses SQLite's backup API to create a consistent copy including committed WAL
pages and extra user tables. It validates the copy's schema/settings, integrity
and foreign keys, closes and flushes the file and (on Unix) flushes the directory and
parent before changing the live transaction. The retained copy is
`backups/before-upgrade-v1-<unique-id>.sqlite`. The first upgraded desktop session
shows its path. Failure to create/validate/flush a copy prevents the upgrade;
failed migration writes roll back schema, settings, stage rows and version. A
verified copy is retained and reported even when a later migration step fails.
New empty workspaces initialize directly to v2 without a pre-upgrade copy.

The `.sqlite` copy is a complete database, not a JSON import file. Keep both the
current workspace and recovery file. With all app/bridge processes closed, copy
that recovery file to a separate workspace path before testing recovery. The
safe v1 operations build (`95087d0`) can open the v1 copy and refuses v2 databases
and backups. The earlier pre-safety backup build (`594275a`) is **not** a supported
v2 reader: it can reset a version marker. Do not open upgraded files with it.
A v1 copy contains the pre-upgrade state; it cannot include later stage changes.

Recovery files are unencrypted and retained without automatic pruning. A failed
copy can leave an incomplete file; only a verified successful copy is reported
as usable. Windows/macOS and power-loss acceptance remain unverified here. SQLite
may create empty WAL/shared-memory coordination files on a read-only probe; these
do not represent a changed schema or record. Do not manually delete active WAL
files or replace an open database.
