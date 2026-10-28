# Comparable review verification — 2026-10-28

The analysis panel now expands to show saved evidence titles, conditions, dates,
prices, buyer-paid shipping and whether each observation contributes. The auction
condition is shown alongside them; no condition match or recency cutoff is
inferred. A source opens only after a deliberate button click, through the
existing external-browser command. Errors are visible and clear when selecting
another auction. There is no write, network fetch, formula, schema or backup
change in this panel.

## Evidence

- Production TypeScript/Vite build, formatting and diff checks passed offline
  using existing dependencies. No dependency or software was installed.
- **Five Chromium journeys passed in 11.3s** against the actual Rust/SQLite
  bridge. A dedicated fixture has a $250 sale plus $10 shipping, a $4,000
  excluded sale and a $90,000 asking price. The result remains $260 while all
  observations are visible. Exact backup equality and zero external requests
  hold through review and launch-error handling. Keyboard opening, empty state,
  reset on another lot and 390px overflow checks pass. Existing purchase/sale,
  deliberate Sold selection, criteria, backup and source-review journeys pass.
- **Ten native Linux checks passed** in the actual executable extracted from an
  offline Debian QA bundle, which was not installed or published. The new native
  fixture shows its $230 sale plus $10 shipping, date and condition; independent
  Rust verification returns $240 and exact backup equality holds. Disclosure
  open/close, source review and all six existing actual GTK/WebKit backup checks
  pass. No provider page is opened. All app data, D-Bus and XDG paths are isolated.
- Desktop, 390px browser and native captures were visually inspected. The
  disclosure starts closed and preserves the compact analysis view until opened.

The core/financial sources are unchanged from the tested source catalog; its 14
Rust tests were not repeated for this UI-only addition. Current runtime hashes,
the extracted application/package hashes, native report and captures are in
`evidence/comparable-review/`. Full build/browser/native logs remain ignored in
`.local/evidence-panel-qa/`. The native package includes the prior deliberate-Sold
default fix, but native acceptance does not exercise creating a new comparable;
that behavior is covered through the real backend in the browser journey.

This local branch depends on `09f549e`, which includes the source catalog. It
does not include the separate schema/inventory branches. Windows/macOS, physical
touch hardware and human usability remain unverified. Automatic matching,
stale-evidence decisions, range overrides and network adapters remain future work.
No new PR/CI run exists; the published backup PR is unchanged.
