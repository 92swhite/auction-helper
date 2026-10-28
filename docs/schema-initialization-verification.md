# Explicit schema initialization — local verification, 2026-10-28

Local branch feat/safe-schema-initialization is based on PR1 head 594275a.
It has not been pushed or published as a PR. The existing backup PR is unchanged.
All databases and desktop sessions used here contain disposable synthetic data.
No installed app, owner database, credentials, permissions or schema migration
file was changed. No dependency or software installation was added.

## Behavior

Store::open previously executed 001_initial.sql on every connection, resetting
user_version to 1 and creating tables in unrecognized files. Three refusal tests
failed against that implementation. The explicit runner now refuses unsupported
versions, nonempty unversioned files and mismatched v1 schemas/settings without
repairing or replacing them. Rejection tests compare complete database bytes.

A new, empty version-zero file receives schema, version and default settings in
one IMMEDIATE transaction. Version is checked again under the write lock for
concurrent first opens. Valid v1 databases reopen without reseeding settings or
resetting their version; extra application-independent data is retained. Expected
v1 definitions come from the unchanged migration script, with whitespace/case
normalization. Equivalent manually authored SQL can be refused conservatively.
There is no v2 upgrade, destructive migration or automatic repair path.

Desktop startup opens the store lazily through the normal request boundary.
Errors reach the existing workspace error view instead of terminating setup.
Native rejection strings are normalized to Error values so their explanation
remains readable. Fatal startup errors stay visible; ordinary workspace errors
can still be dismissed. Retry can attempt opening again after an external issue
has been resolved, without restarting the native process.

## Evidence

- Before: all three new refusal tests failed; old startup accepted newer,
  unrelated unversioned and mismatched version-one fixtures.
- After: **21 Rust checks passed**, including the original 14 core/backup checks,
  six migration scenarios and a real SQLite capacity-failure rollback test.
  Coverage includes byte-preserving refusal, reserved-prefix lookalikes, missing
  settings, populated legacy reopen, three concurrent first opens, and rollback
  of schema/settings/version together on SQLITE_FULL.
- Strict core Clippy across all targets and release desktop Clippy passed;
  rustfmt and frontend formatting checks passed. Production type/build and
  Debian bundling completed with cached dependencies and offline Cargo.
- Three existing Chromium journeys passed against real Rust/SQLite; a final
  replay after keeping fatal errors visible is recorded in the local check log.
- **Eight native acceptance checks passed** on the actual extracted package:
  the two startup/refusal/retry checks plus all six prior backup checks (actual
  download/GTK chooser, cancel, stale review, recoverable restore, malformed file,
  restart/integrity). No backend, file list or download was mocked.

Native refusal starts with a known v1 test fixture marked as version 9. It checks
that the visible error is readable, mutations are disabled, no fatal-error
Dismiss button exists, and database bytes/future sentinel data remain unchanged.
Only the test harness then corrects its own known fixture version externally;
Retry loads the retained inventory and exact original backup. This models Retry,
not a safe way to downgrade a real newer schema. Real newer databases require a
compatible app or a separately reviewed migration.

Package SHA-256: a87eabac6ac5288b4ad6ee3db508438689917f19ba2ffd24d686289f2dd048b5

Extracted executable SHA-256: f9a44ae1453dc3310778152306650385eef5f01973f2852e9ead4507e916ad30

The package was extracted locally, never installed or deployed. Proof includes
hashes for every changed runtime source and both native reports in
[evidence/schema-initialization](evidence/schema-initialization/).
Captures were inspected. Full logs are in .local/schema-qa/; original regression
output is retained there as before.txt. The original migration, lock files and
Tauri permissions/CSP remain byte-identical to the branch base.

## Reproduction and limits

Run cargo test --offline --locked -p auction-core, strict core/desktop Clippy,
formatting and the existing Playwright suite. Build with offline Cargo using
npm run desktop -- build --bundles deb, then extract with dpkg-deb -x. Run the
native harness with --check-schema-refusal for startup checks and without it for
backup acceptance. See scripts/test-native-backup.py for isolated XDG/D-Bus/Xvfb
setup and required existing system tools.

Linux native acceptance does not establish Windows/macOS behavior or owner-data
acceptance. No unsupported database is automatically repaired. This local task
needs publication scope reviewed before a new branch/PR is pushed. Neither this
work nor PR1 authorizes deployment or merge.
