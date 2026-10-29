# Backup/restore local verification — 2026-10-28

Branch `feat/validated-backup-restore`, based on fresh main `07a75cf`.
No new dependency, database migration, paid service, account grant or network
integration was added. The owner's application database was never opened by these
checks. All mutation/restore tests use disposable databases.

## Delivered behavior

Settings downloads a complete version-one JSON backup and previews a selected
file before explicit replacement. Rust validates structure, versions, record
limits, IDs/references, money, timestamps and sale consistency. It recalculates
balances/analysis instead of accepting saved totals. Duplicate JSON keys and
unknown fields are rejected. Limits are 1 MB UTF-8 and 5,000 records per collection.

Backup export uses one read transaction. Restore revalidates the file and checks
the preview's audit revision under an IMMEDIATE transaction. It first creates a
flushed, exclusive recovery file beside the database; Unix directory/file modes
are 0700/0600 and directory symlinks are refused. All record replacement commits
atomically. The old workspace survives errors and remains available as a recovery
backup after successful replacement. Imported history is retained with a new,
monotonically increasing restore provenance entry.

The 8 MB development request limit accounts for escaping a 1 MB file inside JSON.
The backup itself remains limited to 1 MB. Streaming UTF-8 decoding in the browser
bridge preserves characters split across request chunks. No imported path, SQL or
URL is executed/fetched. Validation does not authenticate file contents.

## Checks

- `cargo test --offline --locked -p auction-core`: **14 passed**, zero failed.
  Seven new scenario tests cover populated round trip/reopen and usable recovery;
  malformed/unknown/duplicate/orphan/oversized data; explicit confirmation and
  concurrent stale preview; recovery creation failure; injected SQL failure after
  deletion begins with complete rollback; negative proceeds/capital and an empty
  workspace; and symlink refusal without touching its destination. The original
  valuation, persistence and concurrent-capital tests remain passing.
- `cargo clippy --offline --locked --all-targets -p auction-core -- -D warnings`:
  passed. `cargo fmt --all -- --check`: passed.
- `npm run build`: TypeScript and production Vite build passed. No dependencies
  were installed; existing packages were reused with local writable build caches.
  `npm run format:check` and `git diff --check`: passed.
- `cargo check --offline --locked -p auction-helper`: native Tauri compile passed.
- Final Playwright run: **3 journeys passed in 6.8 s** against the actual Rust CLI
  and SQLite bridge. Covers the existing auction→sale and settings journeys, plus
  backup download, adding later work, preview/cancel, an intervening write/stale
  rejection, confirmed replacement, current form synchronization, reload
  persistence, malformed and oversized files. The 390 px review checks visible
  confirmation controls and no horizontal document overflow.
- Inspected desktop (1440 px) and narrow (390 px) review captures. The file name,
  counts, capital, replacement/recovery explanation and cancel/confirm controls
  are readable. [Desktop review](evidence/backup-restore/desktop.png) ·
  [Narrow review](evidence/backup-restore/phone.png).

## Limits and review state

The subsequent [packaged native acceptance](native-backup-acceptance.md) passed
the real Linux WebKit download and GTK file-picker flow with isolated data.
Other operating systems and file permissions outside Unix remain unverified.
Chromium phone emulation is not physical-device acceptance. The
backup is unencrypted; keep it private. Older readable analysis exports cannot
restore complete records. Large workspaces retain the documented closed-app
SQLite-copy route; no history is automatically pruned.

No personal data was replaced and no app was deployed. The original checkout
remains clean. Publication for PR review is authorized; this does not authorize
approval, merge or deployment. The tested implementation is `71e039a`; subsequent
publication handoff edits change documentation only. Hosted CI must be verified
on the published source head. Local evidence/logs remain in `.local/backup-qa/`
and `test-results/`. See the [implementation plan](backup-restore-plan.md) and
[recovery guide](backup-restore.md).
