# Lifecycle v2 — separate data-safety review

Reviewed the lifecycle implementation at `f0d1af64c76b1d2c83b5c8505cc2eab56764ccf2`
before publication, then fixed the demonstrated defects and revalidated the
result. This was a separate review pass by the implementing agent, **not an
independent person or a security certification**. It focused on migration and
recovery atomicity, stage/sale races, audit integrity, malformed inputs and draft
retention. No lifecycle semantics or unrelated feature scope changed.

## Findings fixed

1. **A failed COMMIT could leave pending stage/history rows in the persistent
   desktop connection.** The mutation path handled mutation errors with rollback,
   but returned directly if COMMIT itself failed. A real rollback-journal reader
   produced SQLITE_BUSY at commit: the failed save remained in an open transaction,
   could appear in that same store's error-refresh snapshot, and blocked retry.
   The new regression failed before the fix. Ordinary mutations now use a
   rusqlite transaction guard, which rolls back on mutation or commit error before
   refreshing the snapshot. The regression passes, sees the exact prior snapshot
   and successfully retries the same reviewed draft with one durable history row.
   No permanent loss was demonstrated by this reproduction; the defect was an
   uncommitted-state exposure and unusable retry in a long-lived store.
2. **Schema comparison folded case-sensitive literals.** Lowercasing the entire
   stored SQL accepted a different `'LISTED'` CHECK value as the supported
   `'listed'` constraint. A synthetic, otherwise complete v2 database reproduced
   the false acceptance. Normalization now preserves quoted text and its
   whitespace while normalizing unquoted keyword case/spacing. The regression
   fails before and passes after the fix, refusing without rewriting the file.

Both findings stay inside the existing lifecycle safety scope. Migration 001,
financial rules, stage names and permissions remain unchanged. No other
demonstrated defect was found in this bounded pass; that is not proof of absence.

## Process and fault evidence

`scripts/test-lifecycle-process-failure.py` copies tracked Rust/manifests into a
new disposable output tree, records their hashes, and builds an offline probe.
Only that copy receives explicit pause and I/O-error hooks. The generated patch
and its hash are retained; **no hook or fault environment switch enters the
production app**. The harness waits for the exact child's boundary signal and
sends SIGKILL only to that owned child PID. It never signals unrelated processes.

All **16 final cases passed** on synthetic SQLite files:

| Boundary or injected fault | Observed result after reopening |
|---|---|
| Upgrade recovery file just created | Original v1 remains usable; an incomplete, unreported file may remain |
| Verified v1 recovery ready, before migration writes | Original v1 and complete recovery copy agree |
| Upgrade tables/stages/version written but uncommitted | SQLite rolls back to complete v1; verified recovery remains |
| Upgrade committed before response | Complete v2 with Unreviewed mapping; original v1 recovery remains; reopening does not repeat migration |
| Restore recovery created / JSON written | Original v2 records and stage history remain unchanged |
| Restore durable recovery ready | Original v2 and complete prior JSON recovery agree |
| Restore deletes performed / imported history written before commit | Entire original workspace, ledger and both histories return after rollback |
| Restore committed before response | Complete incoming v2 plus monotonic restore audit; retrying the old preview refuses replacement |
| Stage/history written before commit | Original stage, financial records and audit history remain unchanged |
| Stage committed before response | Exactly one complete transition; retry with the old revision cannot duplicate it |
| Upgrade file/directory flush error returns (2) | Original v1 state remains unchanged |
| Restore file/directory flush error returns (2) | Original v2 state remains unchanged |

The report identifies each of the 16 cases separately. The row groups above are
not additional tests. Every reopened database was checked for SQLite integrity
and foreign keys. Recovery-file content, schema markers and complete known
record/history sets were compared, not only row counts. The copy includes an
extra synthetic user table so the upgrade check cannot pass by preserving only
the app's modeled records.

These are **simulated process failures and injected error returns**. The kernel,
storage device and filesystem remained running. They do not prove survival of
power loss, filesystem/controller faults or failed hardware flush guarantees.

## Other adversarial and regression checks

- **45 Rust tests pass**, with strict all-target core Clippy and formatting. Eight
  actual two-writer stage/sale races observed four stage-first and four sale-first
  outcomes. When stage won, its complete audit preceded the sale; when sale won,
  stage was refused. Sold remained authoritative after reopen in every case.
  Launch delays vary scheduling, not a response-time acceptance threshold; this
  does not exhaust all possible interleavings.
- Additional malformed v2 cases exercise unknown transition enums/fields,
  duplicate stage details/JSON fields, wrong audit IDs, missing inventory,
  null lifecycle state and an otherwise replayable transition after a sale audit.
  Preview and restore refuse before recovery or record writes. Existing strict
  parsing, stale/ABA/restore review and migration-capacity tests also pass.
- **Nine real-backend browser journeys pass (27.7s)**. The added case deliberately
  loses the transport response *after the real Rust/SQLite save commits*. The
  draft and refreshed history remain visible; retry refuses the stale revision,
  preserves the draft and leaves exactly one transition. This is explicit
  transport-fault simulation; the backend is not replaced. Eight normal journeys
  continue to cover cancellation, corrections, financial sale precedence, notes,
  evidence and backup flows.
- The rebuilt offline Debian package was extracted, not installed. **All 22
  native GTK/WebKit checks pass** on its exact application hash: lifecycle (6),
  backup/source/evidence (10), schema/refusal (2), notes (4). Native dialogs use
  actual pointer/keyboard input and isolated XDG/SQLite/Xvfb/D-Bus fixtures.
- Actual safe-v1 and current executables again pass the compatibility matrix,
  including old-reader refusal, committed-WAL recovery, current v2 restoration
  and future-version refusal. Production TypeScript/Vite build and frontend
  formatting pass. The reviewed package's **45 runtime file hashes match** the
  final source. Capture-time executable hashes remain in each report.

See `evidence/lifecycle-review/` for the failing-before/passing-after findings,
final process report and instrumentation patch, package/source manifest, native
reports, cross-version evidence and lost-response capture. Full build/run logs,
test databases and probe copies remain ignored under `.local/lifecycle-review/`.
`instrumentation.json` preserves the exact unified patch and its original hash
without introducing trailing whitespace into the repository's text checks.
One Clippy-only change to an integration-test error match followed the final
probe capture; all production runtime-source hashes agree. The ordinary CLI
build was restored after Cargo's test build so its bytes match the recorded
compatibility/fault/native fixture-tool hash.

## Remaining gates

The branch remains local and unpublished; operations PR2 and backup PR1 are not
expanded, approved or merged. A separate publication decision and hosted checks
on the resulting exact head remain necessary. Independent human review,
Windows/macOS and physical-device/human acceptance, and real power-loss testing
remain open. Pre-safety v1 builds are still unsupported v2 readers.

No owner database, account, credential or unrelated process was used. No
installation, spending, deployment, real transaction, PR approval or merge
occurred. Owned preview/probe/native processes completed or were stopped by
their harnesses. Recovery-file limits and the same-account filesystem-race
limitations in the original verification still apply.
