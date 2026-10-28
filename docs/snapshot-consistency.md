# Consistent workspace reads — local reliability fix

`Store::snapshot` previously read criteria, inventory and lot payloads in
separate autocommit queries. Another process could commit between them. A reader
could then return pre-purchase capital/inventory alongside post-purchase lot
details: a combination that never existed as one committed workspace.

The public snapshot now holds one deferred read transaction across all queries.
When called inside an existing transaction (notably an IMMEDIATE purchase check),
it uses the caller's transaction and neither commits nor rolls it back. Read
errors drop and roll back only the snapshot's own transaction. WAL writers can
still commit while a reader finishes its older coherent view; a later snapshot
sees the newer state. No schema, backup field, financial formula or mutation
permission changes.

## Deterministic reproduction

A unit test uses SQLite's native statement trace, compiled only for tests, to
interleave a real second Store connection just before the lot SELECT, after
inventory has been read. The second connection executes normal purchase and lot
save commands. The old production code fails: it returns empty inventory/$1,000
capital but the later “Committed after purchase” notes. With the read transaction,
the first snapshot consistently returns the pre-purchase state; the next returns
the acquired lot, inventory, $950 capital and new notes.

The trace is removed before its context goes out of scope, including when the
read returns an error. Its FFI code is test-only; production code adds no unsafe
operation, hook or dependency. A second test checks caller transaction ownership,
error rollback and a subsequent independent write lock.

This branch depends on local inventory-notes `766dda2` and schema-safety
`7522c80`; it remains unpublished. It does not include the independent source
catalog/evidence panel branch.

## Verification — 2026-10-28

- Old behavior fails the deterministic interleaving check as described above.
  All **26 Rust tests** now pass, including both new snapshot checks and existing
  concurrent purchase, atomic backup, schema refusal and note-conflict coverage.
- Strict core Clippy with all test targets, Rust/Prettier formatting and diff
  checks pass. Two redundant casts in the test-only trace were removed after
  Clippy; runtime source did not change after packaging.
- **Four actual Rust/SQLite browser journeys pass (12.9s)**, including inventory
  note concurrency and backup replacement.
- The offline Debian QA package was extracted, not installed or published. All
  **12 packaged Linux checks pass**: schema refusal/retry (2), inventory notes
  (4), and real GTK/WebKit backup flow (6). Inventory acceptance initially checked
  the data too early because Save changed to “Saving…”; the harness now waits
  for the actual dialog to close. The same unchanged executable then passes.

`evidence/snapshot-consistency/` contains the baseline/final result, package and
runtime hashes, and the three native reports. The test-only trace file hash is
recorded separately from runtime sources. Full logs remain ignored in
`.local/snapshot-qa/`. Windows/macOS, physical devices and human usability are
not verified by these checks. This local branch has no PR or remote CI run.
