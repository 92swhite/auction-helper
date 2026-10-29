# Explicit schema initialization — local next task

Branch feat/safe-schema-initialization is based on backup PR1 head 594275a.
It is a dependent, local-only branch. Publication is outside the existing PR1
scope and will be reported before any push. No installed app or owner database
is used during implementation or verification.

Current Store::open runs 001_initial.sql on every connection. That script sets
user_version=1 unconditionally and can create application tables inside an
unrecognized database. Initialization and default settings are separate writes.

Deliver an explicit version-checked runner: refuse unsupported versions and
nonempty unversioned databases before mutating them; initialize a genuinely new
version-zero database and settings together in one IMMEDIATE transaction;
validate an existing version-one schema/settings rather than silently repairing
or resetting it; enable existing connection pragmas only for supported databases.
Recheck version under the write lock to serialize concurrent first opens. Preserve
001_initial.sql byte-for-byte; no version-two schema or destructive upgrade.

Acceptance uses disposable SQLite files: demonstrate old behavior failing refusal
checks, byte-preserving rejection of newer/unrecognized databases, successful
fresh initialization and populated reopen, concurrent initializers, and atomic
rollback on real SQLite capacity failure. Run all existing core/backup regressions,
strict Clippy and formatting offline. Do not add dependencies, install software,
deploy, change credentials, publish a new PR, merge or touch user data.

## Outcome

Implemented and verified locally. Native refusal/retry and the complete packaged
backup flow passed with isolated data. Startup failures now reach a readable UI
instead of aborting setup. See schema-initialization-verification.md for exact
checks, package/source hashes and remaining platform/publication gates.
