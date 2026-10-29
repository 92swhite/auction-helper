# Published v1 compatibility — 2026-10-28

The candidate's schema and backup formats remain at version 1. To verify that
claim across actual implementations, published commit
`594275a366758ac1055984002cbf5a8a17d62e6e` was exported with `git archive` into an
ignored fixture source tree and built with Cargo offline/locked. No installed
app, owner data or provider account was used. Current runtime sources remain
unchanged from operations candidate `57082af`.

The old executable creates custom criteria, Unicode/custom source labels,
included/excluded/asking evidence, watched state, held inventory and a realized
loss. The candidate then:

1. Reopens the actual old database without reseeding or logical record changes.
2. Previews/restores the old backup into a fresh database, preserving records and
   original history, with the expected $1,840 available capital.
3. Saves new inspection notes using the unchanged v1 lot-update audit vocabulary.
4. Exports a candidate backup that the actual old executable successfully restores,
   including the edited notes and original evidence/ledger fields.
5. Reopens the older executable's restored file and verifies all three databases'
   SQLite integrity and foreign keys.

All checks passed, along with all **28 Rust tests** and strict core Clippy with all targets. No runtime source changed, so the existing combined native/browser package evidence remains applicable. The producer executable hash is
`236863a81ae49f2dcd475fd8f1498b0b161bcbb4fc3e0d954477d2b3292417c7`, matching the
earlier published native-acceptance fixture tool. Producer source/fixture hashes
and the cross-binary report are retained in `evidence/version-one-compatibility/`.

`scripts/test-version-one-compatibility.py` reruns the cross-binary check with
explicit `--previous-core`, `--current-core`, `--producer-commit` and `--output`
arguments. `--write-fixtures` is used deliberately when regenerating the fixed
synthetic fixtures. It never searches for an owner's database or downloads a
binary. The archived producer build and full logs remain ignored under
`.local/compatibility-qa/`.

Two normal Rust regression tests load the committed producer fixtures, so future
CI needs neither historical Git objects nor an older executable. They cover old
SQLite definitions/settings/records and old backup restoration plus new notes,
reopen and preservation of all comparable flags. SQLite dump loading temporarily
disables foreign keys because its alphabetical table order can put inventory
before lots; the complete fixture enables them again. The cross-binary runs
independently verify foreign-key consistency. This is fixture bootstrap only,
not a production permission or database initialization change.

This evidence covers **v1 ↔ v1**, not downgrade from a future format. The old
opener does not safely refuse a future database version; see the explicit
version-two gate in `inventory-lifecycle-plan.md`. The review is recorded in
`operations-risk-review.md`; no new high-severity defect was established.
