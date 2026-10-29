# Operations candidate risk review

Review baseline: local combined candidate `57082af`, before compatibility-test
changes. This was a separate read-through/review pass by the implementing agent,
not an independent person or security certification. No implementation change was
made during the initial pass. Existing saved evidence was checked against the
actual current paths rather than treating test counts as acceptance by themselves.

## Surfaces reviewed

- Schema initialization/version checks, supported-schema/settings validation,
  read transaction ownership and IMMEDIATE mutation transactions.
- Strict backup parsing, limits, referential validation, stale-preview guard,
  recovery file creation/flush, replacement rollback and audit revision handling.
- Inventory-note conflict detection, latest-field preservation, strict payloads,
  audit vocabulary and the UI's retained draft/error path.
- Native lazy startup/retry and external-URL validation; Tauri CSP/capabilities
  and the development bridge's origin, type, size and subprocess boundaries.
- Restored settings remounting, source/evidence disclosures, escaping of entered
  text, deliberate links and the Asking/Sold default's effect on saved records.

## Findings and acceptance gaps

No new high-severity defect or demonstrated data-loss path was found in this
pass. That is bounded review evidence, not proof of absence. Existing focused
tests already exercise rollback, stale confirmation, malformed/future files,
symlink refusal, concurrent purchase/notes and the mixed-read defect fixed in
`347a064`.

The significant gap is **cross-version compatibility**. Most round trips use the
same implementation on both sides. Because this candidate claims schema/backup
version 1 is unchanged, acceptance should also use a workspace and backup actually
produced by published head `594275a`, then restore a candidate-edited backup using
that older implementation. Fixed synthetic fixtures and producer hashes should
keep that check repeatable without an owner's data or a network dependency.

Other limits remain explicit:

- The 1 MB / 5,000-record backup limits also apply to the automatic recovery
  export. A larger or invalid current workspace safely prevents replacement;
  closed-app SQLite copies remain the documented alternative.
- Recovery files are unencrypted. File creation/flush may leave an incomplete
  unreported file on failure; only successful completion reports a recovery path.
  No automatic deletion/pruning is implemented.
- Browser reference-launch tests cover thrown errors. A browser's popup policy
  may block a new window without throwing; `noopener` does not provide a reliable
  returned-window signal. Native opener errors are returned by Tauri. Do not
  weaken opener isolation to claim browser popup detection.
- The old pre-schema-safety implementation reruns the version-one initialization
  script on open. A future version-two lifecycle migration must not be presented
  as downgrade-compatible with that old opener. Version-two design needs an
  explicit backup/migration/older-reader acceptance matrix before implementation.
- Windows/macOS, physical-device interaction, hostile same-account filesystem
  replacement and independent human security/usability review remain outside this
  local validation. No new account or security permission is requested here.

Publication approval is separate from this review. Merge decisions remain with
the parent/user. This review does not merge a PR or authorize a lifecycle format
change.
