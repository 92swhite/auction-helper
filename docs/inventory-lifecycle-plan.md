# Inventory lifecycle — bounded next slice for review

Status: **approved and implemented on the separate local lifecycle branch** based
on operations commit `95087d0`. Publication of this larger version-two slice is a
separate decision; operations PR2 remains unchanged. The approved scope is manual
stages and history, not listing publication, costs, returns or corrections to
financial records. See [implementation and verification](inventory-lifecycle-verification.md).

## Smallest useful behavior

Let the user review and explicitly record one of the four roadmap stages for an
unsold item, then reopen the app and see the saved value. Show the stage beside
inspection notes and leave the existing acquisition/sale records authoritative.
Do not infer that an item was collected, tested or listed from elapsed time,
notes, source URLs or a purchase record. Unknown existing state must remain
visibly unreviewed rather than being relabeled as awaiting pickup.

Each stage change needs explicit Save/Cancel, protection against stale review,
retained drafts on failure, a durable audit entry and backup/restore coverage.
Neither choosing Listed nor Ready to list contacts a marketplace or certifies
the item. No stage selection places a bid, records a sale, reserves capital,
changes the ledger or claims that a physical action occurred automatically.

## Approved semantics

- Stages are **Unreviewed, Needs pickup, Testing, Ready to list, Listed**.
- Existing items, v1 imports and new purchases start Unreviewed. No elapsed time,
  note, source link or purchase record infers physical progress.
- Explicit Save/Cancel allows corrections in either direction, including back to
  Unreviewed. A workspace audit revision rejects stale forms, including changes
  away and back and intervening restores. Unrelated edits also require reopening.
- Financial Sold is authoritative. It freezes the last operational stage and its
  history as read-only; it cannot be reopened with a stage selection.

## Data and compatibility boundary

Structured stage data and an honest stage-change audit action do not fit the
current strict v1 inventory/backup contract without a versioned change. Do not
hide stages in free-text notes or reuse an unrelated financial audit action.

The implemented database v2 migration and backup v2 envelope include v1 import
mapping, strict unknown-field/enum handling, original-history retention and a
complete recovery path. Existing financial values and original
notes must survive exactly. A consistent, durable pre-upgrade SQLite recovery
copy must succeed before any upgrade can commit; copying a bare live WAL database
file is not an acceptable substitute. If space, copying or validation fails,
leave the original logical data/schema/version usable and retain evidence.

The pre-schema-safety producer at `594275a` reexecutes its v1 marker on open. It
is **not a safe v2 reader**. Publishing a safe v1 opener is a prerequisite to
claiming a supported older-app refusal path; do not promise downgrade support to
pre-safety builds. The operations safe-v1 build at `95087d0` refuses v2. Pre-safety builds remain
unsupported for opening an upgraded file; the verified v1 recovery file is the
route back to v1 data.

## Acceptance matrix

| Input / operation | Required result |
|---|---|
| Real supported v1 database | Preserve financial records, notes and evidence; migrate only after verified recovery; show unreviewed stage |
| Real supported v1 backup | Preview the missing-stage mapping; preserve original records/history; retain the replaced workspace in a complete newer recovery copy |
| v2 backup in safe v1 app | Refuse before data/recovery mutation; do not silently drop stage or audit data |
| Future/unknown database or backup | Refuse without reinterpretation or repair |
| Invalid stage, unknown fields or sold-record misuse | Refuse before mutation; retain the user's review/draft |
| Two sessions edit the same stage | Detect stale review using a monotonic revision; preserve the newer saved stage/history |
| Concurrent note/financial edit | Preserve unrelated fields and compare financial balances before/after |
| Migration or stage-audit write fails | Roll back schema/version/data together; keep recovery available; reopen successfully |
| Normal desktop and narrow workflow | Review/cancel/save/restart/restore work with keyboard and visible errors; native acceptance uses isolated data |

Stop this slice at manual stage tracking and its compatibility/recovery contract.
Listing drafts, expense corrections and notification policies remain separate
roadmap work. No installations, provider accounts or live auction actions are
needed to plan or test it.
