# Milestones and acceptance criteria

## 1. Auction input and analysis — implemented

- [x] Rust core, React frontend, Tauri shell, SQLite migration and CI.
- [x] Save and edit source URL, lot details, condition and cost assumptions.
- [x] Enter sold/asking comparables with evidence URLs; exclude individual observations.
- [x] Deterministic full-cost profit/ROI and maximum bid constrained by capital.
- [x] Opportunity search, sorting, target filters and a persisted manual watchlist.
- [x] Open source URL for manual bidding; no automated bidding.
- [x] Record actual acquisition and sale, update capital and realized profit.
- [x] Editable buying criteria and readable JSON snapshot export.

Acceptance: enter an auction and comparable, obtain a reproducible analysis, watch it, reload, record a purchase and sale, and observe the persisted capital change. Browser tests exercise this workflow using the actual Rust backend.

## 2. Reliable operations and richer inventory

- Reversible ledger corrections, additional expense entries, returns and disposal.
- Inventory stages (pickup, testing, ready to list, listed), inspection notes and user-reviewed listing drafts.
- [x] Validated JSON backup/restore with preview, atomic replacement, stale-review protection and automatic recovery copies.
- Explicit migration runner remains planned; the current database schema stays at version 1.
- [x] Local manual-source review catalog with dated references, unknown-access states and preserved custom lot source labels. See [verification](source-registry-verification.md).
- Provider/account authorization evidence and fixture-based network adapter tests remain pending; the catalog does not establish access or enable an adapter.
- Model selection and evidence review: condition matching, stale comparable flags, manual range overrides.

Acceptance: take an item from purchase through inspection and a draft listing; correct a cost without losing history; restore a workspace into a clean database.

## 3. Authorized discovery and notifications

- Confirm source-specific API/feed permissions and account access before implementing network adapters.
- Evaluate approved eBay access for sold evidence. If unavailable, retain manual research; Browse data stays labeled as asking prices.
- Append-only observations, freshness indicators and a scheduler with deduplication/backoff.
- Local closing reminders and desktop notifications; optional mobile relay after credentials can be stored in the OS keychain.

Acceptance: a permitted fixture/real feed imports without duplication; a controlled auction-close event creates one notification; UI makes paused monitoring explicit.

## 4. Resale, analytics and intelligence

- Authorized listing APIs and explicit reviewed publication workflows.
- Realized P&L, turnover and prediction error over time.
- Bulk-lot allocation, pickup planning, optional OCR and image matching.
- Shadow-mode outcome study using actual sold evidence before claiming predictive performance.

Acceptance: actual sales and expenses reconcile to the ledger; automated publication requires deliberate user approval; estimates retain their evidence and measured errors.

## Deferred assumptions

There is no demonstrated profit rate, sell-through probability, representative auction sample or source permission in the supplied material. The $1,000 / $250 / $50 / 40% figures are operating preferences. The 75-mile radius and 60-day sell window remain research targets until geocoding and outcome data exist; the UI does not imply they are enforced.
