# Validated local backup and restore

Approved 2026-10-28; one milestone-two slice, isolated from main. No live feeds,
credentials, purchases, paid services or publishing. Existing readable analysis
exports remain available; they lack audit/creation records and are not backups.

## Contract

Add a strict version-one `auction-helper` JSON backup containing settings, original
lot records and timestamps/watch state, inventory and the complete local audit
trail. Exclude derived analysis/totals and recompute them in Rust. No SQL or paths
come from the file. Bound UTF-8 backup size to 1 MB and record counts; reject
unknown versions/fields, malformed/duplicate IDs, references, invalid financial
values, dates and inconsistent sold state. Validity is not proof of authenticity.

`backup` exports one consistent SQLite read transaction. `validate_backup` is
read-only and returns counts, derived available capital and current audit revision.
`restore_backup` requires explicit replacement confirmation and that exact current
revision, revalidates the file and obtains an IMMEDIATE transaction. A changed
workspace makes the preview stale and requires a new review.

Before replacement, save a complete recovery JSON beside the database in a private
`backups/` directory, using an exclusive UUID filename, restrictive Unix permissions
and a flushed file. If recovery creation fails, change no database rows. Replace
records atomically; any insert/commit failure rolls back. Preserve imported audit
records and append restore provenance with a revision greater than both histories.
Retain recovery files after failures/success; never silently remove them.

The browser/desktop Settings flow downloads backups, validates a chosen file,
shows its counts/capital and replacement consequences, then allows confirm or
cancel. Retain old data on invalid files, cancellation, stale previews and disk
errors. Reset the visible settings form after restore. No task test opens the
owner's app database; use disposable databases only.

## Verification

Rust: full populated round trip/reopen (comparables, watch state, sold/unsold
inventory, settings and audit), malformed/unknown/oversized/duplicate/orphan and
money/date checks, explicit-confirmation/stale rejection, failed recovery creation,
injected SQL failure rollback and usable recovery backup. Existing valuation and
concurrent-capital tests remain mandatory. Run rustfmt, strict Clippy, frontend
type/build/format and the browser journey through actual Rust/SQLite.

Browser: download, modify workspace, import preview/cancel/confirm, reload,
invalid file, stale preview and narrow-screen review. Native compile checks do
not establish packaged file-dialog/download acceptance; report that limit if a
native end-to-end check is unavailable.
