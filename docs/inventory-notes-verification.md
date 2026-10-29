# Inventory inspection notes — local verification, 2026-10-28

Local branch feat/inventory-notes depends on schema-safety commit 7522c80.
It is unpublished; existing PR1 remains unchanged. No owner database, installed
app, hosted service or account was used. All tests use isolated fictional records.

## Delivered flow

Purchased lots leave Opportunities, making their existing notes inaccessible in
the original UI. Inventory now offers Inspection notes for purchased and sold
items. The modal reviews, edits and explicitly saves that lot's existing notes.
Cancel discards only the unsaved form draft. A save edits notes against the latest
linked lot under the existing IMMEDIATE transaction, preserving unrelated edits,
actual purchase/sale values and capital. A reviewed note value is required; a
conflict leaves the newer stored text and the user's unsaved draft intact. The
inventory refreshes after refusal so closing/reopening shows the latest text.

The request rejects unknown fields and uses the existing 10,000-byte text limit.
The schema, stored types and backup format remain version one. Note updates use
the existing save_lot audit category because the updated record is the source lot;
no new backup audit vocabulary or compatibility exception was introduced.

## Verification

- **24 Rust checks passed**: prior 21 checks plus three inventory-note scenarios.
  These cover unrelated concurrent-field preservation, unchanged ledger/capital,
  reopen, version-one backup restore, sold-item notes, stale/oversized/Unicode-
  oversized/missing/unknown-field requests, and rollback after an injected audit
  write failure. Failed requests leave complete backup values unchanged.
- Strict core Clippy across all targets, rustfmt, TypeScript/production build and
  frontend formatting passed. No dependency, migration, Tauri capability or CSP
  changed.
- **Four Chromium journeys passed in 10.4 seconds** with actual Rust/SQLite. The
  new journey covers cancel, notes save/reload, a concurrent source-title edit,
  stale-note refusal with retained draft/focus, refreshed reopen and 390px layout
  without document overflow. The original auction/sale, settings and backup
  journeys remain passing.
- **Twelve packaged Linux checks passed** on the actual extracted executable:
  four new native notes checks, two schema refusal/retry checks and six complete
  backup checks. Native pointer/keyboard events exercise cancel, save, unrelated
  concurrent edits, stale refusal, retained draft, refreshed reopen and process
  restart. No backend or file list was mocked.

The first native test could not locate the field using its EditableText-interface
filter. The textarea was visible and working; locating the single visible editable
text control corrected the harness. The packaged runtime was unchanged, and the
complete native sequence then exited 0. Native checks read the original Unicode
fixture; keyboard-entered notes are ASCII. Browser/core checks include Unicode.

Package SHA-256: a4325854d7cd89a467a248ea9bb3a4df5b25773fe3b258119f1d88c39c02cb39

Extracted executable SHA-256: d3b6828eaaea23f3ece66edde61b7e2e96d2368ab273dccb2f4251d432e4c328

[evidence/inventory-notes](evidence/inventory-notes/) contains reports, runtime
source hashes and native/desktop/narrow captures. Captures were inspected. Full
logs remain in .local/inventory-qa/. The package was never installed, published
or deployed, and no user data was changed.

## Limits and next work

Notes are free text, with the existing field limits. Structured pickup/testing/
ready/listed stages and listing drafts remain planned. Existing full-lot edit
semantics are unchanged; this endpoint guards the note value and merges against
the latest linked lot. Linux acceptance does not establish Windows/macOS or
physical-device/human accessibility acceptance. This dependent local branch needs
publication scope reviewed before a new PR is pushed. No merge is authorized.
