# Local operations quality review

This is the combined operations review candidate for the completed Auction Helper
work beyond backup PR1. It combines the schema/notes/snapshot line at `347a064`
with the source/evidence line at `3ea8d77`, both descended from published PR1
head `594275a`. The original branches and every prior checkout remain intact.
No GitHub PR was merged, approved or changed by this local integration.

The combined behavior is:

- Open only recognized schema version 1, initialize an empty workspace atomically,
  and show recoverable startup errors for unsupported or mismatched files.
- Edit inspection notes from purchased or sold inventory, refuse stale saves,
  retain drafts on failure and preserve concurrent unrelated edits and ledger data.
- Keep criteria, inventory and lots on one committed read view even when another
  process purchases and edits a lot during snapshot assembly.
- Review source capabilities, dated official references and unverified access;
  keep all integrations manual and preserve custom source labels.
- Require deliberate Sold confirmation for new comparables, and expose saved
  prices/shipping, dates, conditions and inclusion beside the analysis.

Financial formulas, database and backup formats remain version 1. Existing
observations are preserved. No account, credential, CSP, capability, provider
integration, telemetry, monitoring, bid or publishing behavior was added.

## Provenance and checks

Earlier component documents and evidence describe their original branches and
packages. Their test counts are not additive. The combined-branch result and
package/source manifest in `evidence/operations-quality/` identify the current
review candidate; use those for integration acceptance.

The two local integration conflicts were documentation and appended browser
scenarios. Both complete test scenarios and all implemented roadmap entries were
retained. The native harness also preserves the correction that waits for the
notes dialog to close, rather than for Save to change its label to Saving.

Combined validation on October 28, 2026 passed **26 Rust tests**, strict core
Clippy with all targets, **six real Rust/SQLite Chromium journeys (17.7s)**,
formatting and the production TypeScript/Vite build. The offline Debian QA
package was extracted, not installed. Its **16 native Linux checks passed**:
schema refusal/retry (2), inspection notes (4), evidence review (2), source
review (2), and the complete GTK/WebKit backup flow (6).

The integrated native notes run initially reached its data assertion before the
harness had explicitly checked complete typed input. The harness now waits for
both the full textarea value and actual dialog closure; the same unchanged
package passed. Runtime source hashes were verified unchanged after packaging.
Only this affected native journey is repeated for timing stability. Fixture and
reference launch probes use no provider account, external listing fetch or owner
database. All XDG data, SQLite files, D-Bus and Xvfb sessions are isolated.

Full logs remain ignored in `.local/operations-qa/`. The committed evidence folder
contains current native reports and the package/runtime manifest. Test-only
SQLite trace code is identified separately. The component-level evidence is
retained as historical evidence, not substituted for these combined checks.

## Remaining scope

Publication is approved as a separate review PR based on
`feat/validated-backup-restore`: PR1 is still the unmerged backup foundation, so
this base keeps the operations diff separate. Both PRs stay unmerged pending
explicit approval. After PR1 is integrated, retarget the operations PR to main
and recheck its diff and exact-head CI. The PR description carries current
publication/check status rather than changing the historical capture manifests.
Windows/macOS and physical
device/human acceptance remain outstanding. Provider/account-specific grants,
network adapter fixtures, automatic matching/recency decisions and notifications
are not supplied by the source catalog. Inventory stages/listing drafts and
audited ledger corrections/returns/extra expenses remain later roadmap slices.

## Follow-up review and compatibility

A separate risk review and published v1 cross-version check are recorded in
[operations-risk-review.md](operations-risk-review.md) and
[version-one-compatibility.md](version-one-compatibility.md). All 28 Rust tests
and strict all-target core Clippy pass. Runtime source hashes still match the
combined package above; these additions are tests, fixtures and documentation.

The [bounded inventory-lifecycle plan](inventory-lifecycle-plan.md) remains
unimplemented pending label/transition decisions and an explicit version-two
backup/migration contract. No new business rules or conflicting branch were added.
