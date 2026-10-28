# Inventory lifecycle — bounded next slice for review

Status: **planned, not implemented**. The operations candidate remains local;
publication/merge decisions belong to the parent. This proposal is grounded in
roadmap phase 2: pickup, testing, ready to list and listed. It does not add listing
publication, valuation logic, costs, returns or financial corrections.

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

## Decisions to resolve before implementation

- Confirm label meaning: does “pickup” mean **needs pickup**? The roadmap does
  not specify whether it instead records pickup completed. Avoid implementing
  the opposite meaning by assumption.
- Confirm how manual corrections/backward stage changes should be exposed, and
  whether sold items should show their last recorded stage or hide it behind
  the authoritative Sold status. Do not invent a forced progression or a way
  to reopen a completed financial sale.
- Confirm that v1 imports and existing inventory should start **unreviewed**.
  They contain no structured evidence of lifecycle completion.

These are proposed product choices, not newly imposed business rules. Existing
inspection notes remain usable while they are unresolved.

## Data and compatibility boundary

Structured stage data and an honest stage-change audit action do not fit the
current strict v1 inventory/backup contract without a versioned change. Do not
hide stages in free-text notes or reuse an unrelated financial audit action.

Before implementing the slice, specify a database v2 migration and backup v2
envelope, v1 import mapping, strict unknown-field/enum handling, original-history
retention and a complete recovery path. Existing financial values and original
notes must survive exactly. A consistent, durable pre-upgrade SQLite recovery
copy must succeed before any upgrade can commit; copying a bare live WAL database
file is not an acceptable substitute. If space, copying or validation fails,
leave the original logical data/schema/version usable and retain evidence.

The pre-schema-safety producer at `594275a` reexecutes its v1 marker on open. It
is **not a safe v2 reader**. Publishing a safe v1 opener is a prerequisite to
claiming a supported older-app refusal path; do not promise downgrade support to
pre-safety builds. There is no v2 implementation or migration in this candidate.

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
