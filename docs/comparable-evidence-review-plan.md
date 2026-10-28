# Read-only comparable review — local slice

Analysis shows a median and included-sale count, but the original observations
currently require opening the editor. Add a disclosure next to the analysis to
show each saved title, date, condition, price, shipping and role in the estimate.
Show the auction condition alongside the observations. Source pages open only
after a deliberate click using the existing external-browser command.

This branch depends on local `09f549e` (the source catalog and deliberate Sold
default), not on the separate schema/inventory branches. Keep it unpublished.
No automatic matching, age threshold, financial formula, database or backup field
change is part of this slice. Existing included/excluded flags remain authoritative.

Verify a real Rust/SQLite fixture with an included sale, an excluded sale and an
asking observation: the displayed evidence and unchanged $260 estimate agree;
reviewing it performs no external fetch or write. Check keyboard access, empty
state, reference-launch errors, desktop/390px layout, and the real packaged Linux
disclosure. Keep previous backup/restore native regressions passing.
