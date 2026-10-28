# Inventory inspection notes — local slice

Branch feat/inventory-notes depends on the local schema-safety commit 7522c80.
It remains unpublished. Purchased lots leave Opportunities, so their existing
notes are no longer editable through the current UI. Add an explicit notes editor
for purchased and sold inventory, using the existing lot notes field.

Save only notes against the latest linked lot under the existing IMMEDIATE
transaction. Require the note value reviewed on open and refuse stale saves;
retain the user's draft on error. Preserve unrelated concurrent lot edits and all
purchase/sale/capital values. Validate with existing lot text limits and strict
request fields. Record the change in the existing save_lot audit category so the
version-one database and backup format remain compatible.

Acceptance: visible review/save/cancel/reopen on desktop and narrow layouts;
concurrent note conflict and unrelated-field preservation; unchanged ledger;
invalid/oversized/missing-target refusal with no audit/data writes; and backup
round trip including notes. Use isolated synthetic data. No structured stages,
listing publication, database change, installation, spending, deployment or push.

## Outcome

Implemented and verified locally. Source/backup formats stay at version one.
See inventory-notes-verification.md for exact checks and packaged evidence.
