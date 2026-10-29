# Lifecycle publication follow-up

Lifecycle PR3 was initially published at `4594062263e29013c1f3446083947ee132fcc992`,
based on operations PR2 at `95087d0`. Its first hosted core/UI jobs passed all
45 Rust tests but failed Clippy on Rust 1.99: `needless_borrows_for_generic_args`
flagged `apply.map_err(&describe)` in the migration error handler. The local
Rust 1.93 Clippy run had accepted that expression.

The publication follow-up removes only that unnecessary closure borrow:
`apply.map_err(describe)`. The closure captures the same shared recovery-path
reference and remains usable by the commit-error handler. No migration step,
recovery operation, stage rule, database/backup format or UI behavior changes.

The 22 native checks, 16 process/fault cases, cross-version checks and packaged
runtime manifest in `evidence/lifecycle-review/` describe the reviewed runtime
before this compiler-lint cleanup. Their capture-time hashes are retained rather
than rewritten as if a new native package had been tested. Only the migration
source file differs, by removal of that borrow; the other 44 runtime file hashes
still match. Local core tests, all-target Clippy and formatting are rechecked for
the follow-up; the PR description records the final exact-head hosted CI result.

Both initial hosted runs remain linked as diagnostic evidence:
[push](https://github.com/92swhite/auction-helper/actions/runs/40808850507) and
[PR](https://github.com/92swhite/auction-helper/actions/runs/40808869778).
No test, warning policy or workflow was disabled to make the change pass.
