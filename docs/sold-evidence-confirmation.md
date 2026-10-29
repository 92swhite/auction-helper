# Deliberate sold-evidence confirmation

Local branch `fix/require-sold-evidence-confirmation` starts at source catalog
commit `6800baf` and remains unpublished. New comparable forms previously checked
“Sold (verified by me)” before the user verified anything. A pasted asking-price
observation could therefore enter the sold median by default.

New observations now start as Asking. The user must deliberately select Sold
after checking a completed sale. The existing Included flag still controls
whether a sold observation contributes to the median. Existing saved observations,
financial calculations, schema and backup fields are unchanged.

The regression first fails against the old behavior because Sold is checked.
It then creates and saves an asking observation with the actual Rust/SQLite
backend, confirms the manual estimate and zero included sales, reopens the same
record, explicitly confirms Sold, and observes the sold-derived estimate. The
existing purchase/sale, settings, backup and source-review journeys also run.

This fixes a default, not verification itself. The user must still check product,
condition, date and final sale evidence. Automatic matching, recency decisions and
provider integrations remain separate work. This branch depends on the local
source catalog, not on the separate schema/inventory branches.

## Result — 2026-10-28

The old-default regression failed at the expected checked checkbox. The final
production build, formatting and all **four browser journeys passed (8.6s)**.
The actual backend first retained the $180 manual estimate with zero included
sales, then returned $200 after the same saved observation was deliberately
marked Sold. Existing inventory/capital/backup flows passed unchanged. Logs
remain in ignored `.local/evidence-qa/`; the small curated result is in
`evidence/sold-confirmation/browser-result.json`.

No new native package was built for this form-default change. The source-catalog
native package at `6800baf` predates it; its acceptance is not claimed for this
new commit. No data migration or financial-model code change is required.
