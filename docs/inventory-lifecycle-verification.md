# Inventory lifecycle — local implementation and verification

A subsequent [separate safety review](inventory-lifecycle-review.md) fixed two
demonstrated defects and records current verification: 45 Rust tests, nine browser
journeys, 22 native package checks and 16 simulated process/fault cases. Evidence
below describes the initial implementation capture; the review has its own
package/source manifest and explicit remaining acceptance limits.

Implemented on `feat/inventory-lifecycle-v2`, based on the reviewed operations
commit `95087d0d1424b1c515252b35e6eb30ad4f882a10`. This is a separate local slice;
published operations PR2 is unchanged. Publication, integration and deployment
are separate decisions. Every database opened for this work was an explicit
synthetic fixture or temporary test database. No owner database was migrated.

## Behavior

Inventory begins **Unreviewed**. The stage editor offers **Needs pickup,
Testing, Ready to list, Listed**, and correction back to Unreviewed. Explicit
Save/Cancel records manual progress in either direction. A stage change updates
only its current stage, an `inventory_stage` audit event and its matching
from/to history row in one IMMEDIATE transaction. Notes, evidence, acquisition,
sale and capital calculations are preserved.

The form captures a monotonic workspace audit revision. Any intervening mutation
requires reopening; this deliberately includes unrelated edits, a stage changed
away and back, and a restored workspace. Errors retain the draft while refreshing
the latest history. A sale is checked under the same writer lock and takes
precedence: the last operational stage is retained and its history becomes
read-only. Selecting Listed does not publish anything or assert provider access.

## Version-two contract

Migration 001 and financial tables stay unchanged. Migration 002 adds current
stage rows and audit-linked transition details. Fresh empty databases initialize
atomically to version 2. Existing v1 rows map to Unreviewed, including financially
Sold items, without inserting invented historical progress or rewriting original
audit entries. A valid v2 database reopens without reseeding or another recovery.

Before a v1 upgrade, BEGIN IMMEDIATE prevents competing writers. A separate
read-only connection and SQLite's backup API capture the committed database,
including WAL and extra user tables. The new private, exclusively created file
is validated for v1 schema/settings, SQLite integrity and foreign keys, closed
and flushed; Unix directory/parent entries are flushed too. Only then may the
schema/stage/version transaction commit. Copy, capacity and migration failures
leave v1 data usable; any verified copy remains available. Its path is shown on
the first upgraded desktop session or in the migration error. See the
[recovery guide](backup-restore.md) for the distinction between SQLite upgrade
copies and JSON restore copies.

JSON downloads use backup v2, with required lifecycle states and full stage
details tied to audit IDs. Validation replays each chain from Unreviewed and
checks final state, unique/reference integrity, audit correspondence, valid enums
and no transition after an audited sale. Unknown fields, malformed/future files
and incomplete chains are refused before recovery or replacement writes. V1
JSON import retains original financial records/history and explicitly previews
the mapping to Unreviewed. Restore retains a complete v2 recovery file first and
advances the workspace audit revision beyond both prior and imported history.

The safe operations v1 executable at `95087d0` refuses v2 schema and backups.
The pre-safety producer at `594275a` remains an unsupported v2 reader; it can reset
the version marker. Recover v1 data from a separate copy of the retained v1
SQLite snapshot, not by pointing an old app at the upgraded workspace. There is
no promise of downgrade compatibility for stage changes made after upgrade.

## Verification — October 29, 2026 UTC

- **41 Rust tests pass**, with strict all-target core Clippy and Rust formatting.
  Coverage includes committed-WAL recovery with extra user data, concurrent
  first upgrades, recovery-directory failure/symlink refusal, actual SQLite
  capacity rollback, schema mismatch/future refusal, original-record retention,
  corrections, stale/ABA/restore reviews, new-purchase defaults, sale precedence,
  audit/detail-write rollback and full-history restore rollback.
- The committed generated v2 fixture and published v1 JSON/SQL fixtures provide
  repeatable acceptance. `scripts/test-lifecycle-compatibility.py` also passed
  against actual separately compiled safe-v1 and current executables. A copy of
  the verified pre-upgrade file reopened using the old executable; v2 history
  round-tripped through the current one; all three disposable databases passed
  integrity/foreign-key checks. Producer/executable/fixture hashes are recorded
  in `evidence/inventory-lifecycle/compatibility-report.json`.
- **Eight real Rust/SQLite Chromium journeys pass (17.4s)**. The two lifecycle
  journeys cover cancellation, all named stages, backward correction, restart,
  history, narrow layout, retained stale drafts, concurrent sale and read-only
  history, v2 round-trip and v1 mapping disclosure. Six existing journeys cover
  financial input, purchase/sale, backup, source/evidence and notes regressions.
- The offline Linux release build produced a Debian package; it was extracted,
  **not installed**. **22 native GTK/WebKit checks pass on that exact package**:
  six lifecycle checks, ten backup/evidence/source checks, two schema/refusal
  checks and four notes checks. These counts are not additive to older component
  reports. Native tests use actual pointer/keyboard input and GTK chooser dialogs
  with isolated SQLite/XDG/Xvfb/D-Bus paths; no backend mock or owner profile.
- Production TypeScript/Vite compilation and frontend formatting pass. Desktop,
  phone and native captures were inspected. All 45 runtime file hashes still
  match the tested package manifest in `evidence/inventory-lifecycle/`.

The first native attempts exposed harness assumptions, not application changes:
WebKit includes the collapsed select value in its accessible name, and deep
temporary runtime paths exceeded portal socket limits. The harness now reads
that value and uses a short isolated runtime. The same application binary passed.

The first cross-version byte assertion included active WAL housekeeping. Older
SQLite connections can checkpoint on close; the old-reader byte comparison now
uses a closed/checkpointed fixture. The new app performs a read-only version
probe before writable open and also tests refusal with committed future WAL.
SQLite shared-memory coordination and empty WAL creation are not record writes;
durable database/WAL content and application records/recovery files are checked.

## Reproduction and limits

With the existing dependencies, run core tests/Clippy, `npm run build`,
`npm run format:check` and `npm run test:e2e`. The normal browser configuration
owns its localhost preview and explicitly selects a temporary database. The
compatibility script requires explicit old/current binary paths and an output
directory; it does not find owner files or download software. The native script
accepts an extracted application, core binary and existing xdotool path; use
`--check-inventory-lifecycle`, `--check-schema-refusal`,
`--check-inventory-notes`, and its default regression mode.

Full logs and extracted binaries remain ignored under `.local/lifecycle-qa/` and
`.local/target/`; committed reports/captures are supporting evidence. Owned test
previews/native processes are stopped. The application does not add a scheduler,
network adapter, credential, listing workflow, financial correction or expense
rule. JSON backup limits (1 MB / 5,000 records per collection), unencrypted retained
recovery files and hostile same-account filesystem races remain explicit limits.

Windows/macOS, physical-device/human usability, forced power-loss durability and
independent human review remain outstanding. There is no hosted CI for this
unpublished branch. No spending, installation, real transaction, PR approval,
merge or deployment was performed. Publish this slice separately after approval;
do not expand operations PR2 silently.
